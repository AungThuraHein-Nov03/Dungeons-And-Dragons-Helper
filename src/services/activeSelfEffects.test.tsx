import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BARBARIAN_RAGE_ACTIVE_EFFECT_ID, BARBARIAN_RAGE_RESOURCE_ID } from '../content/srd/barbarian';
import { MONK_FOCUS_RESOURCE_ID, MONK_SUPERIOR_DEFENSE_ACTIVE_EFFECT_ID } from '../content/srd/monk';
import { SORCERER_INNATE_SORCERY_ACTIVE_EFFECT_ID, SORCERER_INNATE_SORCERY_RESOURCE_ID } from '../content/srd/sorcerer';
import { SRD_CONTENT } from '../content/srd';
import { SRD_FIGHTER } from '../content/srd/fighter';
import { srdId } from '../content/srd/source';
import type { ClassContent } from '../models/content';
import {
  deriveActiveSelfEffectD20Context,
  deriveActiveSelfEffectSpellSaveDc,
  deriveActiveSelfEffectWeaponDamageBonus,
} from '../rules/activeSelfEffects';
import { deriveConditionD20Context } from '../rules/conditions';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { completeCharacterV10Choices, fighterInput } from '../test/fixtures';
import { ActiveEffectsPanel } from '../components/ActiveEffectsPanel';
import { activateCharacterActiveSelfEffect, deactivateCharacterActiveSelfEffect } from './activeSelfEffects';
import { rollAbilityCheck, rollWeaponDamage } from './characterRolls';
import { createContentRegistry, contentRegistry } from './contentRegistry';
import { createCharacter, getCharacterById, updateCharacterPlayState } from './characterStorage';
import { addPlaySessionCondition, loadPlaySessionState, savePlaySessionState } from './playSessionState';
import { validateContentDataset } from './contentValidation';

const QUARTERSTAFF_ID = srdId('weapon', 'quarterstaff');

function dieValue(value: number, die: number) {
  return () => (value - 1) / die;
}

function classCharacter(classSlug: 'barbarian' | 'sorcerer' | 'monk', level: number) {
  const skillProficiencies = classSlug === 'sorcerer' ? ['arcana', 'persuasion'] as const
    : classSlug === 'monk' ? ['athletics', 'insight'] as const
      : ['athletics', 'perception'] as const;
  const subclassId = level < 3 ? undefined
    : classSlug === 'barbarian' ? srdId('subclass', 'barbarian:path-of-the-berserker')
      : classSlug === 'monk' ? srdId('subclass', 'monk:warrior-of-the-open-hand')
        : srdId('subclass', 'sorcerer:draconic-sorcery');
  return createCharacter(fighterInput({
    name: classSlug,
    classId: srdId('class', classSlug),
    subclassId,
    level,
    skillProficiencies: [...skillProficiencies],
    equipment: classSlug === 'barbarian' ? { equippedWeaponIds: [QUARTERSTAFF_ID] } : undefined,
  }));
}

describe('M13D active self effects', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('discovers real Rage, spends its existing resource exactly once, ends Concentration, and never refunds on deactivation', () => {
    const character = classCharacter('barbarian', 9);
    const before = character.playState.resourceUses[BARBARIAN_RAGE_RESOURCE_ID];
    savePlaySessionState(character.id, { conditions: ['poisoned'], concentration: { spellId: 'synthetic-spell', providerId: 'synthetic-provider' }, activeEffectIds: [] });

    const activated = activateCharacterActiveSelfEffect(character.id, BARBARIAN_RAGE_ACTIVE_EFFECT_ID);
    expect(activated).toMatchObject({ ok: true, value: { sessionState: { conditions: ['poisoned'], activeEffectIds: [BARBARIAN_RAGE_ACTIVE_EFFECT_ID] } } });
    if (!activated.ok) return;
    expect(activated.value.sessionState.concentration).toBeUndefined();
    expect(activated.value.character.playState.resourceUses[BARBARIAN_RAGE_RESOURCE_ID]).toBe(before - 1);

    const duplicate = activateCharacterActiveSelfEffect(character.id, BARBARIAN_RAGE_ACTIVE_EFFECT_ID);
    expect(duplicate).toMatchObject({ ok: false, error: { code: 'active-self-effect-already-active' } });
    expect(getCharacterById(character.id)?.playState.resourceUses[BARBARIAN_RAGE_RESOURCE_ID]).toBe(before - 1);

    const ended = deactivateCharacterActiveSelfEffect(character.id, BARBARIAN_RAGE_ACTIVE_EFFECT_ID);
    expect(ended).toMatchObject({ ok: true, value: { sessionState: { activeEffectIds: [] } } });
    expect(getCharacterById(character.id)?.playState.resourceUses[BARBARIAN_RAGE_RESOURCE_ID]).toBe(before - 1);
  });

  it('rejects Rage activation when depleted without mutating any unrelated resource or session state', () => {
    const character = classCharacter('barbarian', 1);
    const unrelatedId = Object.keys(character.playState.resourceUses).find((id) => id !== BARBARIAN_RAGE_RESOURCE_ID);
    updateCharacterPlayState(character.id, {
      ...character.playState,
      resourceUses: { ...character.playState.resourceUses, [BARBARIAN_RAGE_RESOURCE_ID]: 0 },
    });
    savePlaySessionState(character.id, { conditions: ['prone'], activeEffectIds: [] });
    const before = getCharacterById(character.id);
    const result = activateCharacterActiveSelfEffect(character.id, BARBARIAN_RAGE_ACTIVE_EFFECT_ID);
    expect(result).toMatchObject({ ok: false, error: { code: 'resource-depleted' } });
    expect(getCharacterById(character.id)).toEqual(before);
    expect(loadPlaySessionState(character.id)).toEqual({ conditions: ['prone'], activeEffectIds: [] });
    if (unrelatedId) expect(getCharacterById(character.id)?.playState.resourceUses[unrelatedId]).toBe(before?.playState.resourceUses[unrelatedId]);
  });

  it('routes Rage Strength Advantage through the existing D20 resolver and cancels Poisoned Disadvantage', () => {
    const character = classCharacter('barbarian', 9);
    const activeEffectIds = [BARBARIAN_RAGE_ACTIVE_EFFECT_ID];
    const condition = deriveConditionD20Context(['poisoned'], { kind: 'ability-check' });
    const result = rollAbilityCheck(character.id, 'strength', 'normal', { rng: dieValue(11, 20), d20Context: condition, activeEffectIds });
    expect(result).toMatchObject({
      ok: true,
      value: { roll: { request: { d20Context: { advantageSources: ['Rage'], disadvantageSources: ['Poisoned'] } }, resolvedMode: 'normal', keptD20: 11 } },
    });
  });

  it('applies Rage damage only to Strength weapon damage without mutating CharacterInput or persisting the temporary bonus', () => {
    const character = classCharacter('barbarian', 9);
    const before = JSON.stringify(getCharacterById(character.id));
    const derived = deriveCharacterState(character, contentRegistry);
    if (!derived.ok) throw new Error(derived.error.message);
    expect(deriveActiveSelfEffectWeaponDamageBonus(derived.value, [BARBARIAN_RAGE_ACTIVE_EFFECT_ID], 'strength')).toBe(3);
    expect(deriveActiveSelfEffectWeaponDamageBonus(derived.value, [BARBARIAN_RAGE_ACTIVE_EFFECT_ID], 'dexterity')).toBe(0);
    const damage = rollWeaponDamage(character.id, QUARTERSTAFF_ID, 'one-handed', false, { rng: dieValue(4, 6), activeEffectIds: [BARBARIAN_RAGE_ACTIVE_EFFECT_ID] });
    expect(damage).toMatchObject({ ok: true, value: { roll: { modifier: 5, total: 9 } } });
    expect(JSON.stringify(getCharacterById(character.id))).toBe(before);
  });

  it('discovers and activates real Innate Sorcery, applying only Sorcerer spell attack/DC modifiers', () => {
    const character = classCharacter('sorcerer', 1);
    const derived = deriveCharacterState(character, contentRegistry);
    if (!derived.ok) throw new Error(derived.error.message);
    const effect = derived.value.activeSelfEffects.find((candidate) => candidate.id === SORCERER_INNATE_SORCERY_ACTIVE_EFFECT_ID);
    expect(effect?.name).toBe('Innate Sorcery');
    const before = character.playState.resourceUses[SORCERER_INNATE_SORCERY_RESOURCE_ID];
    const activated = activateCharacterActiveSelfEffect(character.id, SORCERER_INNATE_SORCERY_ACTIVE_EFFECT_ID);
    expect(activated).toMatchObject({ ok: true });
    if (!activated.ok) return;
    expect(activated.value.character.playState.resourceUses[SORCERER_INNATE_SORCERY_RESOURCE_ID]).toBe(before - 1);
    const provider = derived.value.spellcasting[0];
    expect(deriveActiveSelfEffectSpellSaveDc(provider, derived.value, [SORCERER_INNATE_SORCERY_ACTIVE_EFFECT_ID])).toBe(provider.saveDc + 1);
    expect(deriveActiveSelfEffectD20Context(derived.value, [SORCERER_INNATE_SORCERY_ACTIVE_EFFECT_ID], { kind: 'spell-attack', providerId: provider.id }))
      .toEqual({ advantageSources: ['Innate Sorcery'] });
    expect(effect?.referenceText).toContain('one-minute duration');
  });

  it('models Superior Defense as the real Monk active feature, not a fabricated Champion mode', () => {
    const monk = classCharacter('monk', 18);
    const derived = deriveCharacterState(monk, contentRegistry);
    if (!derived.ok) throw new Error(derived.error.message);
    expect(derived.value.activeSelfEffects.find((effect) => effect.id === MONK_SUPERIOR_DEFENSE_ACTIVE_EFFECT_ID)).toMatchObject({
      name: 'Superior Defense',
      activationTiming: 'start-of-turn',
      activationCost: { resourceId: MONK_FOCUS_RESOURCE_ID, amount: 3 },
    });
    const before = monk.playState.resourceUses[MONK_FOCUS_RESOURCE_ID];
    const activated = activateCharacterActiveSelfEffect(monk.id, MONK_SUPERIOR_DEFENSE_ACTIVE_EFFECT_ID);
    expect(activated).toMatchObject({ ok: true });
    expect(getCharacterById(monk.id)?.playState.resourceUses[MONK_FOCUS_RESOURCE_ID]).toBe(before - 3);
    const current = deriveCharacterState(getCharacterById(monk.id)!, contentRegistry);
    if (!current.ok) throw new Error(current.error.message);
    const afterCondition = addPlaySessionCondition(monk.id, 'incapacitated', window.sessionStorage, current.value);
    expect(afterCondition.activeEffectIds).toEqual([]);
    expect(derived.value.activeSelfEffects[0]?.referenceText).toContain('Resistance');
    
    const champion = createCharacter(fighterInput({ level: 18 }));
    const championDerived = deriveCharacterState(champion, contentRegistry);
    if (!championDerived.ok) throw new Error(championDerived.error.message);
    expect(championDerived.value.activeSelfEffects.some((effect) => effect.name === 'Superior Defense')).toBe(false);
  });

  it('accepts unrelated Homebrew content through the same discovery, validation, activation, persistence, D20, and PLAY UI paths', () => {
    const resourceId = 'homebrew:test:class-resource:echo-charge';
    const effectId = 'homebrew:test:active-self-effect:echo-stance';
    const feature = {
      id: 'homebrew:test:class-feature:echo-stance',
      name: 'Echo Stance',
      description: 'Synthetic acceptance feature.',
      effects: [],
      activeSelfEffects: [{
        id: effectId,
        name: 'Echo Stance',
        description: 'Synthetic stance.',
        activationTiming: 'manual',
        activationCost: { resourceId, amount: 1 },
        modifiers: [{ type: 'd20-roll-mode', mode: 'disadvantage', target: { kind: 'ability-check', abilities: ['wisdom'] } }],
        referenceText: 'Synthetic Homebrew acceptance only.',
      }],
      referenceEffects: [],
    } as const;
    const homebrewClass: ClassContent = {
      ...SRD_FIGHTER,
      id: 'homebrew:test:class:echo-knight-test',
      name: 'Echo Test Class',
      source: { type: 'homebrew', namespace: 'test' },
      progression: SRD_FIGHTER.progression.map((row) => row.level === 1 ? { ...row, features: [...row.features, feature] } : { ...row, features: [...row.features] }),
      resources: [...SRD_FIGHTER.resources, {
        id: resourceId,
        name: 'Echo Charge',
        source: { type: 'homebrew', namespace: 'test' },
        maximum: { kind: 'level-table', values: [{ level: 1, uses: 2 }] },
        recovery: [{ trigger: 'long-rest', mode: 'all' }],
      }],
    };
    expect(validateContentDataset([...SRD_CONTENT, homebrewClass])).toEqual([]);
    const registry = createContentRegistry([homebrewClass]);
    const character = createCharacter(completeCharacterV10Choices(fighterInput({ classId: homebrewClass.id, subclassId: undefined, level: 1, preserveV10Choices: true }), registry), window.localStorage, registry);
    const derived = deriveCharacterState(character, registry);
    if (!derived.ok) throw new Error(derived.error.message);
    expect(derived.value.activeSelfEffects.map((effect) => effect.id)).toContain(effectId);
    const activated = activateCharacterActiveSelfEffect(character.id, effectId, window.localStorage, window.sessionStorage, registry);
    expect(activated).toMatchObject({ ok: true, value: { sessionState: { activeEffectIds: [effectId] }, character: { playState: { resourceUses: { [resourceId]: 1 } } } } });
    expect(loadPlaySessionState(character.id).activeEffectIds).toEqual([effectId]);
    expect(deriveActiveSelfEffectD20Context(derived.value, [effectId], { kind: 'ability-check', ability: 'wisdom' })).toEqual({ disadvantageSources: ['Echo Stance'] });

    render(<ActiveEffectsPanel state={derived.value} sessionState={loadPlaySessionState(character.id)} onDeactivate={() => undefined} />);
    expect(screen.getByText('Echo Stance')).toBeTruthy();
    expect(screen.getByText('ACTIVE')).toBeTruthy();
  });

  it('rejects malformed active-effect resource references through strict content validation', () => {
    const malformed: ClassContent = {
      ...SRD_FIGHTER,
      id: 'homebrew:test:class:malformed-active',
      name: 'Malformed Active',
      source: { type: 'homebrew', namespace: 'test' },
      progression: SRD_FIGHTER.progression.map((row) => row.level === 1 ? {
        ...row,
        features: [...row.features, {
          id: 'homebrew:test:class-feature:bad-active',
          name: 'Bad Active',
          description: 'Bad fixture.',
          effects: [],
          activeSelfEffects: [{
            id: 'homebrew:test:active-self-effect:bad',
            name: 'Bad',
            description: 'Bad.',
            activationTiming: 'manual',
            activationCost: { resourceId: 'homebrew:test:class-resource:missing', amount: 1 },
          }],
          referenceEffects: [],
        }],
      } : { ...row, features: [...row.features] }),
    };
    expect(validateContentDataset([malformed]).some((issue) => issue.code === 'active-self-effect-reference')).toBe(true);
  });
});
