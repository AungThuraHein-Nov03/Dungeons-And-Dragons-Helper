import { beforeEach, describe, expect, it } from 'vitest';
import { SRD_CONTENT } from '../content/srd';
import { BARBARIAN_RAGE_ACTIVE_EFFECT_ID, BARBARIAN_RAGE_RESOURCE_ID } from '../content/srd/barbarian';
import { SRD_FIGHTER } from '../content/srd/fighter';
import { MONK_FOCUS_RESOURCE_ID, MONK_SUPERIOR_DEFENSE_ACTIVE_EFFECT_ID } from '../content/srd/monk';
import { SORCERER_INNATE_SORCERY_ACTIVE_EFFECT_ID } from '../content/srd/sorcerer';
import { srdId } from '../content/srd/source';
import type { SkillId } from '../models/character';
import type { ClassContent } from '../models/content';
import {
  activeSelfEffectsBlockSpellcasting,
  deriveActiveSelfEffectD20Context,
  deriveActiveSelfEffectSpellSaveDc,
  deriveActiveSelfEffectWeaponDamageBonus,
} from '../rules/activeSelfEffects';
import { listConcentrationCandidates } from '../rules/concentration';
import { deriveConditionD20Context } from '../rules/conditions';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { fighterInput, SCIMITAR_ID } from '../test/fixtures';
import { activateCharacterActiveSelfEffect, deactivateCharacterActiveSelfEffect } from './activeSelfEffects';
import { rollAbilityCheck, rollSavingThrow, rollWeaponDamage } from './characterRolls';
import { createContentRegistry, contentRegistry } from './contentRegistry';
import {
  createCharacter,
  getCharacterById,
  updateCharacterInventoryState,
  updateCharacterPlayState,
} from './characterStorage';
import {
  addPlaySessionCondition,
  loadPlaySessionState,
  reconcilePlaySessionState,
  savePlaySessionState,
  startPlaySessionConcentration,
} from './playSessionState';
import { loadRollHistory } from './rollHistory';
import { validateContentDataset } from './contentValidation';

const QUARTERSTAFF_ID = srdId('weapon', 'quarterstaff');
const CHAIN_MAIL_ID = srdId('armor', 'chain-mail');

function dieValue(value: number, die: number) {
  return () => (value - 1) / die;
}

function subclassFor(classSlug: 'barbarian' | 'monk' | 'sorcerer', level: number) {
  if (level < 3) return undefined;
  if (classSlug === 'barbarian') return srdId('subclass', 'barbarian:path-of-the-berserker');
  if (classSlug === 'monk') return srdId('subclass', 'monk:warrior-of-the-open-hand');
  return srdId('subclass', 'sorcerer:draconic-sorcery');
}

function classCharacter(classSlug: 'barbarian' | 'monk' | 'sorcerer', level: number) {
  const skills: SkillId[] = classSlug === 'barbarian' ? ['athletics', 'perception']
    : classSlug === 'monk' ? ['athletics', 'insight']
      : ['arcana', 'persuasion'];
  return createCharacter(fighterInput({
    name: `Closure ${classSlug}`,
    classId: srdId('class', classSlug),
    subclassId: subclassFor(classSlug, level),
    level,
    skillProficiencies: skills,
    equipment: classSlug === 'barbarian' ? { equippedWeaponIds: [QUARTERSTAFF_ID] } : undefined,
  }));
}

function clericCharacter() {
  return createCharacter(fighterInput({
    name: 'Closure Cleric',
    classId: srdId('class', 'cleric'),
    subclassId: undefined,
    level: 1,
    skillProficiencies: ['insight', 'medicine'],
    abilityScores: { wisdom: 16 },
  }));
}

describe('M13D closure acceptance', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('rejects an unowned active effect without touching Character or session state', () => {
    const fighter = createCharacter(fighterInput({ level: 2, subclassId: undefined }));
    const before = JSON.stringify(getCharacterById(fighter.id));
    const result = activateCharacterActiveSelfEffect(fighter.id, BARBARIAN_RAGE_ACTIVE_EFFECT_ID);
    expect(result).toMatchObject({ ok: false, error: { code: 'unknown-active-self-effect' } });
    expect(JSON.stringify(getCharacterById(fighter.id))).toBe(before);
    expect(loadPlaySessionState(fighter.id)).toEqual({ conditions: [], activeEffectIds: [] });
  });

  it('composes Rage Advantage through the existing D20 resolver, deduplicates sources, and preserves provenance in Roll History', () => {
    const barbarian = classCharacter('barbarian', 9);
    const activeEffectIds = [BARBARIAN_RAGE_ACTIVE_EFFECT_ID];

    const automatic = rollAbilityCheck(barbarian.id, 'strength', 'normal', { rng: dieValue(10, 20), activeEffectIds });
    expect(automatic).toMatchObject({ ok: true, value: { roll: { resolvedMode: 'advantage', request: { d20Context: { advantageSources: ['Rage'] } } } } });

    const manualAdvantage = rollAbilityCheck(barbarian.id, 'strength', 'advantage', { rng: dieValue(10, 20), activeEffectIds });
    expect(manualAdvantage).toMatchObject({ ok: true, value: { roll: { resolvedMode: 'advantage' } } });

    const manualDisadvantage = rollAbilityCheck(barbarian.id, 'strength', 'disadvantage', { rng: dieValue(10, 20), activeEffectIds });
    expect(manualDisadvantage).toMatchObject({ ok: true, value: { roll: { resolvedMode: 'normal' } } });

    const poisoned = deriveConditionD20Context(['poisoned'], { kind: 'ability-check' });
    const cancelled = rollAbilityCheck(barbarian.id, 'strength', 'normal', { rng: dieValue(10, 20), activeEffectIds, d20Context: poisoned });
    expect(cancelled).toMatchObject({
      ok: true,
      value: { roll: { resolvedMode: 'normal', request: { d20Context: { advantageSources: ['Rage'], disadvantageSources: ['Poisoned'] } } } },
    });

    const deduped = rollAbilityCheck(barbarian.id, 'strength', 'normal', {
      rng: dieValue(10, 20),
      activeEffectIds,
      d20Context: { advantageSources: ['Rage'] },
    });
    expect(deduped).toMatchObject({ ok: true, value: { roll: { request: { d20Context: { advantageSources: ['Rage'] } } } } });

    const strengthSave = rollSavingThrow(barbarian.id, 'strength', 'normal', { rng: dieValue(10, 20), activeEffectIds });
    expect(strengthSave).toMatchObject({ ok: true, value: { roll: { resolvedMode: 'advantage', request: { d20Context: { advantageSources: ['Rage'] } } } } });

    const history = loadRollHistory();
    expect(history[0].result.request.label).toBe('Saving Throw — Strength');
    expect(history[0].result.request.d20Context?.advantageSources).toEqual(['Rage']);
  });

  it('applies exact Rage Damage scaling only to Strength weapon damage', () => {
    for (const [level, expected] of [[1, 2], [9, 3], [16, 4]] as const) {
      window.localStorage.clear();
      const barbarian = classCharacter('barbarian', level);
      const derived = deriveCharacterState(barbarian, contentRegistry);
      if (!derived.ok) throw new Error(derived.error.message);
      expect(deriveActiveSelfEffectWeaponDamageBonus(derived.value, [BARBARIAN_RAGE_ACTIVE_EFFECT_ID], 'strength')).toBe(expected);
      expect(deriveActiveSelfEffectWeaponDamageBonus(derived.value, [BARBARIAN_RAGE_ACTIVE_EFFECT_ID], 'dexterity')).toBe(0);
    }

    window.localStorage.clear();
    const dexBarbarian = createCharacter(fighterInput({
      name: 'Dex Rage control',
      classId: srdId('class', 'barbarian'),
      subclassId: srdId('subclass', 'barbarian:path-of-the-berserker'),
      level: 9,
      skillProficiencies: ['athletics', 'perception'],
      equipment: { equippedWeaponIds: [SCIMITAR_ID] },
      weaponAttackAbilityChoices: { [SCIMITAR_ID]: 'dexterity' },
    }));
    const damage = rollWeaponDamage(dexBarbarian.id, SCIMITAR_ID, undefined, false, {
      rng: dieValue(4, 6),
      activeEffectIds: [BARBARIAN_RAGE_ACTIVE_EFFECT_ID],
    });
    expect(damage).toMatchObject({ ok: true, value: { roll: { modifier: 4, total: 8 } } });
  });

  it('enforces deterministic Rage eligibility/termination and blocks valid Concentration while active', () => {
    const armored = createCharacter(fighterInput({
      name: 'Armored Barbarian',
      classId: srdId('class', 'barbarian'),
      subclassId: undefined,
      level: 1,
      skillProficiencies: ['athletics', 'perception'],
      equipment: { equippedArmorId: CHAIN_MAIL_ID, equippedWeaponIds: [QUARTERSTAFF_ID] },
    }));
    const beforeRage = armored.playState.resourceUses[BARBARIAN_RAGE_RESOURCE_ID];
    expect(activateCharacterActiveSelfEffect(armored.id, BARBARIAN_RAGE_ACTIVE_EFFECT_ID))
      .toMatchObject({ ok: false, error: { code: 'active-self-effect-ineligible' } });
    expect(getCharacterById(armored.id)?.playState.resourceUses[BARBARIAN_RAGE_RESOURCE_ID]).toBe(beforeRage);

    const barbarian = classCharacter('barbarian', 9);
    const activated = activateCharacterActiveSelfEffect(barbarian.id, BARBARIAN_RAGE_ACTIVE_EFFECT_ID);
    if (!activated.ok) throw new Error(activated.error.message);
    const heavyInventory = [...activated.value.character.inventory, {
      id: 'closure-heavy',
      kind: 'registry' as const,
      contentId: CHAIN_MAIL_ID,
      category: 'armor' as const,
      quantity: 1,
      equipped: true,
      notes: '',
    }];
    const armoredAfter = updateCharacterInventoryState(barbarian.id, heavyInventory, activated.value.character.currency);
    if (!armoredAfter) throw new Error('Failed to equip heavy armor.');
    const armoredDerived = deriveCharacterState(armoredAfter, contentRegistry);
    if (!armoredDerived.ok) throw new Error(armoredDerived.error.message);
    expect(reconcilePlaySessionState(barbarian.id, armoredDerived.value).activeEffectIds).toEqual([]);

    const incapacitated = classCharacter('barbarian', 9);
    const active = activateCharacterActiveSelfEffect(incapacitated.id, BARBARIAN_RAGE_ACTIVE_EFFECT_ID);
    if (!active.ok) throw new Error(active.error.message);
    const current = deriveCharacterState(active.value.character, contentRegistry);
    if (!current.ok) throw new Error(current.error.message);
    expect(addPlaySessionCondition(incapacitated.id, 'incapacitated', window.sessionStorage, current.value).activeEffectIds).toEqual([]);

    const concentrationBarbarian = classCharacter('barbarian', 9);
    const barbarianState = deriveCharacterState(concentrationBarbarian, contentRegistry);
    if (!barbarianState.ok) throw new Error(barbarianState.error.message);
    const cleric = clericCharacter();
    const clericState = deriveCharacterState(cleric, contentRegistry);
    if (!clericState.ok) throw new Error(clericState.error.message);
    const candidate = listConcentrationCandidates(clericState.value)[0];
    if (!candidate) throw new Error('Expected a Cleric concentration candidate.');
    const compositeState = { ...barbarianState.value, spellcasting: clericState.value.spellcasting };
    savePlaySessionState(concentrationBarbarian.id, { conditions: [], activeEffectIds: [BARBARIAN_RAGE_ACTIVE_EFFECT_ID] });
    expect(startPlaySessionConcentration(concentrationBarbarian.id, candidate.providerId, candidate.spellId, compositeState))
      .toMatchObject({ ok: false, error: { code: 'invalid-concentration' } });
    expect(activeSelfEffectsBlockSpellcasting(barbarianState.value, [BARBARIAN_RAGE_ACTIVE_EFFECT_ID])).toBe(true);
  });

  it('keeps Innate Sorcery temporary/provider-scoped and restores ordinary derivation after explicit deactivation', () => {
    const sorcerer = classCharacter('sorcerer', 1);
    const beforeRecord = JSON.parse(JSON.stringify(getCharacterById(sorcerer.id)));
    const derived = deriveCharacterState(sorcerer, contentRegistry);
    if (!derived.ok) throw new Error(derived.error.message);
    const provider = derived.value.spellcasting[0];
    if (!provider) throw new Error('Sorcerer provider missing.');

    expect(deriveActiveSelfEffectSpellSaveDc(provider, derived.value, [])).toBe(provider.saveDc);
    expect(deriveActiveSelfEffectSpellSaveDc(provider, derived.value, [SORCERER_INNATE_SORCERY_ACTIVE_EFFECT_ID])).toBe(provider.saveDc + 1);
    expect(deriveActiveSelfEffectD20Context(derived.value, [SORCERER_INNATE_SORCERY_ACTIVE_EFFECT_ID], { kind: 'spell-attack', providerId: provider.id }))
      .toEqual({ advantageSources: ['Innate Sorcery'] });
    expect(deriveActiveSelfEffectD20Context(derived.value, [SORCERER_INNATE_SORCERY_ACTIVE_EFFECT_ID], { kind: 'spell-attack', providerId: 'homebrew:other:provider' }))
      .toBeUndefined();

    const activated = activateCharacterActiveSelfEffect(sorcerer.id, SORCERER_INNATE_SORCERY_ACTIVE_EFFECT_ID);
    if (!activated.ok) throw new Error(activated.error.message);
    const rawSession = window.sessionStorage.getItem(`dnd3.play-session.v1:${encodeURIComponent(sorcerer.id)}`) ?? '';
    expect(rawSession).toContain(SORCERER_INNATE_SORCERY_ACTIVE_EFFECT_ID);
    expect(rawSession).not.toContain('saveDc');
    expect(rawSession).not.toContain('attackModifier');

    const stored = getCharacterById(sorcerer.id)!;
    expect(stored).not.toHaveProperty('activeEffectIds');
    expect(stored).not.toHaveProperty('spellSaveDc');
    expect(Object.keys(stored.playState).sort()).toEqual(['currentHp', 'hitDiceRemaining', 'resourceUses', 'temporaryHp']);
    expect(stored.inventory).toEqual(beforeRecord.inventory);
    expect(stored.currency).toEqual(beforeRecord.currency);

    const ended = deactivateCharacterActiveSelfEffect(sorcerer.id, SORCERER_INNATE_SORCERY_ACTIVE_EFFECT_ID);
    expect(ended).toMatchObject({ ok: true, value: { sessionState: { activeEffectIds: [] } } });
    expect(deriveActiveSelfEffectSpellSaveDc(provider, derived.value, [])).toBe(provider.saveDc);
  });

  it('keeps Superior Defense Monk-only, spends exactly 3 Focus, rejects depletion atomically, and explicitly deactivates without refund', () => {
    const monk = classCharacter('monk', 18);
    const depleted = {
      ...monk.playState,
      resourceUses: { ...monk.playState.resourceUses, [MONK_FOCUS_RESOURCE_ID]: 2 },
    };
    updateCharacterPlayState(monk.id, depleted);
    savePlaySessionState(monk.id, { conditions: ['prone'], activeEffectIds: [] });
    const before = JSON.stringify(getCharacterById(monk.id));
    expect(activateCharacterActiveSelfEffect(monk.id, MONK_SUPERIOR_DEFENSE_ACTIVE_EFFECT_ID))
      .toMatchObject({ ok: false, error: { code: 'resource-depleted' } });
    expect(JSON.stringify(getCharacterById(monk.id))).toBe(before);
    expect(loadPlaySessionState(monk.id)).toEqual({ conditions: ['prone'], activeEffectIds: [] });

    const restored = {
      ...getCharacterById(monk.id)!.playState,
      resourceUses: { ...getCharacterById(monk.id)!.playState.resourceUses, [MONK_FOCUS_RESOURCE_ID]: 18 },
    };
    updateCharacterPlayState(monk.id, restored);
    const activated = activateCharacterActiveSelfEffect(monk.id, MONK_SUPERIOR_DEFENSE_ACTIVE_EFFECT_ID);
    expect(activated).toMatchObject({ ok: true, value: { character: { playState: { resourceUses: { [MONK_FOCUS_RESOURCE_ID]: 15 } } } } });
    const ended = deactivateCharacterActiveSelfEffect(monk.id, MONK_SUPERIOR_DEFENSE_ACTIVE_EFFECT_ID);
    expect(ended).toMatchObject({ ok: true, value: { sessionState: { conditions: ['prone'], activeEffectIds: [] } } });
    expect(getCharacterById(monk.id)?.playState.resourceUses[MONK_FOCUS_RESOURCE_ID]).toBe(15);

    const champion = createCharacter(fighterInput({ level: 18 }));
    const championState = deriveCharacterState(champion, contentRegistry);
    if (!championState.ok) throw new Error(championState.error.message);
    expect(championState.value.activeSelfEffects.some((effect) => effect.name === 'Superior Defense')).toBe(false);
    expect(championState.value.subclass?.acquiredFeatures.some((feature) => feature.name === 'Survivor')).toBe(true);
  });

  it('preserves compatible valid Concentration and Conditions when stale active IDs reconcile away', () => {
    const cleric = clericCharacter();
    const derived = deriveCharacterState(cleric, contentRegistry);
    if (!derived.ok) throw new Error(derived.error.message);
    const candidate = listConcentrationCandidates(derived.value)[0];
    if (!candidate) throw new Error('Expected a Cleric concentration candidate.');
    savePlaySessionState(cleric.id, {
      conditions: ['poisoned'],
      concentration: { providerId: candidate.providerId, spellId: candidate.spellId },
      activeEffectIds: ['homebrew:stale:active-self-effect:gone'],
    });
    const reconciled = reconcilePlaySessionState(cleric.id, derived.value);
    expect(reconciled.conditions).toEqual(['poisoned']);
    expect(reconciled.activeEffectIds).toEqual([]);
    expect(reconciled.concentration).toEqual({ providerId: candidate.providerId, spellId: candidate.spellId });
  });

  it('deactivates only the requested unrelated Homebrew mode and preserves other mode/session/resource state', () => {
    const resourceId = 'homebrew:closure:class-resource:mode-charge';
    const firstId = 'homebrew:closure:active-self-effect:first-mode';
    const secondId = 'homebrew:closure:active-self-effect:second-mode';
    const feature = {
      id: 'homebrew:closure:class-feature:modes',
      name: 'Closure Modes',
      description: 'Synthetic closure modes.',
      effects: [],
      activeSelfEffects: [
        {
          id: firstId,
          name: 'First Mode',
          description: 'First synthetic mode.',
          activationTiming: 'manual',
          activationCost: { resourceId, amount: 1 },
          modifiers: [{ type: 'd20-roll-mode', mode: 'advantage', target: { kind: 'ability-check', abilities: ['wisdom'] } }],
        },
        {
          id: secondId,
          name: 'Second Mode',
          description: 'Second synthetic mode.',
          activationTiming: 'manual',
          modifiers: [{ type: 'spell-save-dc-bonus', providerIds: ['homebrew:closure:provider:none'], amount: 1 }],
        },
      ],
      referenceEffects: [],
    } as const;
    const homebrewClass: ClassContent = {
      ...SRD_FIGHTER,
      id: 'homebrew:closure:class:modes',
      name: 'Closure Modes Class',
      source: { type: 'homebrew', namespace: 'closure' },
      progression: SRD_FIGHTER.progression.map((row) => row.level === 1
        ? { ...row, features: [...row.features, feature] }
        : { ...row, features: [...row.features] }),
      resources: [...SRD_FIGHTER.resources, {
        id: resourceId,
        name: 'Mode Charge',
        source: { type: 'homebrew', namespace: 'closure' },
        maximum: { kind: 'level-table', values: [{ level: 1, uses: 2 }] },
        recovery: [{ trigger: 'long-rest', mode: 'all' }],
      }],
    };

    // Add a provider-shaped target only to the validator input by removing the unused static modifier:
    const validationClass: ClassContent = {
      ...homebrewClass,
      progression: homebrewClass.progression.map((row) => ({
        ...row,
        features: row.features.map((entry) => entry.id === feature.id ? {
          ...entry,
          activeSelfEffects: entry.activeSelfEffects?.map((effect) => effect.id === secondId ? { ...effect, modifiers: [] } : effect),
        } : entry),
      })),
    };
    expect(validateContentDataset([...SRD_CONTENT, validationClass])).toEqual([]);
    const registry = createContentRegistry([validationClass]);
    const character = createCharacter(fighterInput({
      name: 'Homebrew closure',
      classId: validationClass.id,
      subclassId: undefined,
      level: 1,
    }), window.localStorage, registry);
    savePlaySessionState(character.id, { conditions: ['prone'], activeEffectIds: [] });

    const first = activateCharacterActiveSelfEffect(character.id, firstId, window.localStorage, window.sessionStorage, registry);
    if (!first.ok) throw new Error(first.error.message);
    const second = activateCharacterActiveSelfEffect(character.id, secondId, window.localStorage, window.sessionStorage, registry);
    if (!second.ok) throw new Error(second.error.message);
    expect(second.value.sessionState.activeEffectIds).toEqual([firstId, secondId]);
    expect(second.value.character.playState.resourceUses[resourceId]).toBe(1);

    const ended = deactivateCharacterActiveSelfEffect(character.id, firstId, window.localStorage, window.sessionStorage, registry);
    expect(ended).toMatchObject({ ok: true, value: { sessionState: { conditions: ['prone'], activeEffectIds: [secondId] } } });
    expect(ended.ok && ended.value.character.playState.resourceUses[resourceId]).toBe(1);

    savePlaySessionState(character.id, { conditions: ['prone'], activeEffectIds: [secondId, 'homebrew:closure:active-self-effect:stale'] });
    const derived = deriveCharacterState(getCharacterById(character.id, window.localStorage, registry)!, registry);
    if (!derived.ok) throw new Error(derived.error.message);
    expect(reconcilePlaySessionState(character.id, derived.value).activeEffectIds).toEqual([secondId]);
  });
});
