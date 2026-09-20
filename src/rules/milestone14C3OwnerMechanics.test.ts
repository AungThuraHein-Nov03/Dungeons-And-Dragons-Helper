import { beforeEach, describe, expect, it } from 'vitest';
import {
  BARBARIAN_RAGE_ACTIVE_EFFECT_ID,
  BARBARIAN_RAGE_RESOURCE_ID,
} from '../content/srd/barbarian';
import {
  FIGHTER_ACTION_SURGE_RESOURCE_ID,
  FIGHTER_SECOND_WIND_RESOURCE_ID,
} from '../content/srd/fighter';
import { SRD_CONTENT, srdId } from '../content/srd';
import type {
  AbilityScores,
  Character,
  CharacterClassProgression,
  CharacterInput,
  SkillId,
} from '../models/character';
import type { SubclassContent } from '../models/content';
import type { ContentId } from '../models/contentId';
import {
  activateCharacterActiveSelfEffect,
} from '../services/activeSelfEffects';
import {
  applyCharacterDamage,
  consumeCharacterResource,
  executeCharacterResourceTransaction,
  expendCharacterResource,
} from '../services/characterPlayState';
import {
  ContentRegistry,
  contentRegistry,
} from '../services/contentRegistry';
import {
  createCharacter,
  getCharacterById,
} from '../services/characterStorage';
import { loadPlaySessionState } from '../services/playSessionState';
import { fighterInput } from '../test/fixtures';
import { deriveActiveSelfEffectWeaponDamageBonus } from './activeSelfEffects';
import { deriveCharacterState } from './deriveCharacter';
import { createFixedHpProgression } from './health';
import { deriveWeaponCriticalThreshold } from './m13eRules';

const BARBARIAN_ID = srdId('class', 'barbarian');
const FIGHTER_ID = srdId('class', 'fighter');
const MONK_ID = srdId('class', 'monk');
const ROGUE_ID = srdId('class', 'rogue');
const WIZARD_ID = srdId('class', 'wizard');

const BERSERKER_ID = srdId('subclass', 'barbarian:path-of-the-berserker');
const CHAMPION_ID = srdId('subclass', 'fighter:champion');
const OPEN_HAND_ID = srdId('subclass', 'monk:warrior-of-the-open-hand');
const THIEF_ID = srdId('subclass', 'rogue:thief');

const DWARF_ID = srdId('species', 'dwarf');
const DRAGONBORN_ID = srdId('species', 'dragonborn');

const MONK_MOVEMENT_ID = srdId('class-feature', 'monk:unarmored-movement');
const CHAMPION_IMPROVED_CRITICAL_ID = srdId('subclass-feature', 'fighter:champion:improved-critical');
const CHAMPION_SUPERIOR_CRITICAL_ID = srdId('subclass-feature', 'fighter:champion:superior-critical');

const QUALIFYING_SCORES: Partial<AbilityScores> = {
  strength: 14,
  dexterity: 18,
  constitution: 14,
  intelligence: 13,
  wisdom: 14,
  charisma: 13,
};

function progression(
  classId: ContentId,
  level: number,
  skillProficiencies: SkillId[],
  starting: boolean,
  subclassId?: ContentId,
): CharacterClassProgression {
  return {
    classId,
    level,
    ...(subclassId ? { subclassId } : {}),
    skillProficiencies,
    hpProgression: createFixedHpProgression(level, starting),
  };
}

function input(
  startingClassId: ContentId,
  classProgressions: CharacterClassProgression[],
  patch: Partial<CharacterInput> = {},
): CharacterInput {
  return fighterInput({
    startingClassId,
    classProgressions,
    abilityScores: QUALIFYING_SCORES,
    inventory: [],
    ...patch,
  });
}

function character(value: CharacterInput, id = 'm14-c3-character'): Character {
  return {
    ...value,
    id,
    playState: { currentHp: 1, temporaryHp: 0, hitDiceRemaining: {}, resourceUses: {} },
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
  };
}

function derived(value: Character, registry: ContentRegistry = contentRegistry) {
  const result = deriveCharacterState(value, registry);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function barbarianFighterInput(
  barbarianLevel: number,
  fighterLevel: number,
  startingClassId: typeof BARBARIAN_ID | typeof FIGHTER_ID = BARBARIAN_ID,
  order: 'normal' | 'reversed' = 'normal',
): CharacterInput {
  const barbarian = progression(
    BARBARIAN_ID,
    barbarianLevel,
    startingClassId === BARBARIAN_ID ? ['athletics', 'perception'] : [],
    startingClassId === BARBARIAN_ID,
    barbarianLevel >= 3 ? BERSERKER_ID : undefined,
  );
  const fighter = progression(
    FIGHTER_ID,
    fighterLevel,
    startingClassId === FIGHTER_ID ? ['athletics', 'perception'] : [],
    startingClassId === FIGHTER_ID,
    fighterLevel >= 3 ? CHAMPION_ID : undefined,
  );
  return input(startingClassId, order === 'normal' ? [barbarian, fighter] : [fighter, barbarian]);
}

function resourceShape(state: ReturnType<typeof derived>) {
  return state.resources.map((resource) => ({
    id: resource.id,
    maximumUses: resource.maximumUses,
    owner: resource.owner,
    consumers: resource.consumers.map((consumer) => consumer.id),
  }));
}

const SUBCLASS_RESERVE_ID = 'homebrew:c3:class-resource:vanguard-reserve';
const SUBCLASS_CHARGE_ID = 'homebrew:c3:class-resource:vanguard-charge';
const SUBCLASS_TRANSACTION_ID = 'homebrew:c3:resource-transaction:vanguard-renew';
const VANGUARD_ID = 'homebrew:c3:subclass:vanguard-owner';

const vanguardSubclass: SubclassContent = {
  id: VANGUARD_ID,
  kind: 'subclass',
  name: 'Vanguard Owner',
  source: { type: 'homebrew', namespace: 'c3' },
  parentClassId: FIGHTER_ID,
  acquisitionLevel: 3,
  description: 'C3 owner-aware subclass fixture using the existing bounded effect/resource vocabulary.',
  progression: [{
    level: 3,
    features: [{
      id: 'homebrew:c3:subclass-feature:vanguard-engine',
      name: 'Vanguard Engine',
      description: 'A parent-level-scaled synthetic acceptance feature.',
      effects: [{
        type: 'speed-bonus',
        amount: { kind: 'level-table', values: [{ level: 3, amount: 5 }, { level: 7, amount: 10 }] },
      }],
      resources: [
        {
          id: SUBCLASS_RESERVE_ID,
          name: 'Vanguard Reserve',
          source: { type: 'homebrew', namespace: 'c3' },
          maximum: { kind: 'level-table', values: [{ level: 3, uses: 2 }, { level: 7, uses: 4 }] },
          recovery: [{ trigger: 'long-rest', mode: 'all' }],
        },
        {
          id: SUBCLASS_CHARGE_ID,
          name: 'Vanguard Renewal',
          source: { type: 'homebrew', namespace: 'c3' },
          maximum: { kind: 'level-table', values: [{ level: 3, uses: 1 }] },
          recovery: [{ trigger: 'long-rest', mode: 'all' }],
        },
      ],
      resourceTransactions: [{
        id: SUBCLASS_TRANSACTION_ID,
        name: 'Renew Vanguard Reserve',
        kind: 'restore-resource',
        targetResourceId: SUBCLASS_RESERVE_ID,
        usageResourceId: SUBCLASS_CHARGE_ID,
        restore: { kind: 'fixed', amount: 1 },
      }],
      referenceEffects: [],
    }],
  }],
};

describe('Milestone 14-C3 owner-aware resources, effects, and mechanical aggregation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('A derives Barbarian 4 / Fighter 5 mechanics with Rage scaled by Barbarian 4, not Character 9', () => {
    const state = derived(character(barbarianFighterInput(4, 5)));

    expect(state.level).toBe(9);
    expect(state.proficiencyBonus).toBe(4);
    expect(state.resources.find((resource) => resource.id === BARBARIAN_RAGE_RESOURCE_ID)).toMatchObject({
      maximumUses: 3,
      owner: { kind: 'class', classId: BARBARIAN_ID, level: 4 },
    });
    expect(state.resources.find((resource) => resource.id === FIGHTER_SECOND_WIND_RESOURCE_ID)).toMatchObject({
      maximumUses: 3,
      owner: { kind: 'class', classId: FIGHTER_ID, level: 5 },
    });
    expect(state.resources.find((resource) => resource.id === FIGHTER_ACTION_SURGE_RESOURCE_ID)).toMatchObject({
      maximumUses: 1,
      owner: { kind: 'class', classId: FIGHTER_ID, level: 5 },
    });

    const rage = state.activeSelfEffects.find((effect) => effect.id === BARBARIAN_RAGE_ACTIVE_EFFECT_ID);
    expect(rage?.owner).toMatchObject({ kind: 'class', classId: BARBARIAN_ID, level: 4 });
    expect(deriveActiveSelfEffectWeaponDamageBonus(state, [BARBARIAN_RAGE_ACTIVE_EFFECT_ID], 'strength')).toBe(2);
    expect(deriveActiveSelfEffectWeaponDamageBonus(state, [BARBARIAN_RAGE_ACTIVE_EFFECT_ID], 'strength')).not.toBe(3);
  });

  it('B derives Barbarian 9 / Fighter 1 Rage at the owner-level 9 value', () => {
    const state = derived(character(barbarianFighterInput(9, 1)));
    expect(state.level).toBe(10);
    expect(state.resources.find((resource) => resource.id === BARBARIAN_RAGE_RESOURCE_ID)).toMatchObject({
      maximumUses: 4,
      owner: { kind: 'class', classId: BARBARIAN_ID, level: 9 },
    });
    expect(state.resources.find((resource) => resource.id === FIGHTER_SECOND_WIND_RESOURCE_ID)?.maximumUses).toBe(2);
    expect(deriveActiveSelfEffectWeaponDamageBonus(state, [BARBARIAN_RAGE_ACTIVE_EFFECT_ID], 'strength')).toBe(3);
  });

  it('C keeps Fighter and Barbarian resource pools independent and uses Fighter level for Second Wind healing', () => {
    const created = createCharacter(barbarianFighterInput(4, 5));
    expect(created.playState.resourceUses[BARBARIAN_RAGE_RESOURCE_ID]).toBe(3);
    expect(created.playState.resourceUses[FIGHTER_SECOND_WIND_RESOURCE_ID]).toBe(3);

    const spentRage = expendCharacterResource(created.id, BARBARIAN_RAGE_RESOURCE_ID);
    expect(spentRage).toMatchObject({
      ok: true,
      value: { playState: { resourceUses: {
        [BARBARIAN_RAGE_RESOURCE_ID]: 2,
        [FIGHTER_SECOND_WIND_RESOURCE_ID]: 3,
      } } },
    });

    expect(applyCharacterDamage(created.id, 999).ok).toBe(true);
    const current = getCharacterById(created.id);
    if (!current) throw new Error('Expected stored multiclass Character.');
    const currentState = derived(current);
    const secondWind = currentState.resources.find((resource) => resource.id === FIGHTER_SECOND_WIND_RESOURCE_ID);
    const consumerId = secondWind?.consumers.find((consumer) => consumer.name === 'Second Wind')?.id;
    if (!consumerId) throw new Error('Expected Second Wind consumer.');

    const healed = consumeCharacterResource(created.id, FIGHTER_SECOND_WIND_RESOURCE_ID, consumerId, { manualRoll: 1 });
    expect(healed).toMatchObject({
      ok: true,
      value: { playState: { currentHp: 6, resourceUses: {
        [BARBARIAN_RAGE_RESOURCE_ID]: 2,
        [FIGHTER_SECOND_WIND_RESOURCE_ID]: 2,
      } } },
    });
  });

  it('D keeps mechanical ownership independent of which equivalent progression is the starting class', () => {
    const barbarianStart = derived(character(barbarianFighterInput(4, 5, BARBARIAN_ID), 'barbarian-start'));
    const fighterStart = derived(character(barbarianFighterInput(4, 5, FIGHTER_ID), 'fighter-start'));

    expect(resourceShape(barbarianStart)).toEqual(resourceShape(fighterStart));
    expect(barbarianStart.activeSelfEffects.map((effect) => ({ id: effect.id, owner: effect.owner })))
      .toEqual(fighterStart.activeSelfEffects.map((effect) => ({ id: effect.id, owner: effect.owner })));
    expect(barbarianStart.savingThrows.strength.proficient).toBe(true);
    expect(fighterStart.savingThrows.strength.proficient).toBe(true);
    expect(barbarianStart.startingClassId).toBe(BARBARIAN_ID);
    expect(fighterStart.startingClassId).toBe(FIGHTER_ID);
  });

  it('E keeps bundled Champion automation on Fighter parent level rather than total Character level', () => {
    const value = input(FIGHTER_ID, [
      progression(FIGHTER_ID, 5, ['athletics', 'perception'], true, CHAMPION_ID),
      progression(ROGUE_ID, 10, ['stealth'], false, THIEF_ID),
    ]);
    const state = derived(character(value));

    expect(state.level).toBe(15);
    expect(deriveWeaponCriticalThreshold(state)).toBe(19);
    expect(state.ruleEffectSources.find((source) => source.contentId === CHAMPION_IMPROVED_CRITICAL_ID)?.owner)
      .toMatchObject({ kind: 'subclass', classId: FIGHTER_ID, subclassId: CHAMPION_ID, level: 5 });
    expect(state.ruleEffectSources.some((source) => source.contentId === CHAMPION_SUPERIOR_CRITICAL_ID)).toBe(false);
  });

  it('F preserves Character-level source scaling: Dwarven Toughness sees total level 9', () => {
    const baseInput = barbarianFighterInput(4, 5);
    const dragonborn = derived(character({
      ...baseInput,
      speciesId: DRAGONBORN_ID,
      speciesChoices: { 'draconic-ancestry': 'black' },
      speciesSkillProficiencies: [],
    }, 'dragonborn'));
    const dwarf = derived(character({
      ...baseInput,
      speciesId: DWARF_ID,
      speciesChoices: {},
      speciesSkillProficiencies: [],
    }, 'dwarf'));

    expect(dwarf.level).toBe(9);
    expect(dwarf.health.maximumHp - dragonborn.health.maximumHp).toBe(9);
    expect(dwarf.ruleEffectSources.find((source) => source.contentId === DWARF_ID)?.owner)
      .toEqual({ kind: 'character', level: 9 });
  });

  it('G exposes and activates Rage from the Barbarian owner while leaving Fighter resources untouched', () => {
    const created = createCharacter(barbarianFighterInput(4, 5));
    const beforeSecondWind = created.playState.resourceUses[FIGHTER_SECOND_WIND_RESOURCE_ID];

    const activated = activateCharacterActiveSelfEffect(created.id, BARBARIAN_RAGE_ACTIVE_EFFECT_ID);
    expect(activated).toMatchObject({
      ok: true,
      value: {
        character: { playState: { resourceUses: {
          [BARBARIAN_RAGE_RESOURCE_ID]: 2,
          [FIGHTER_SECOND_WIND_RESOURCE_ID]: beforeSecondWind,
        } } },
        sessionState: { activeEffectIds: [BARBARIAN_RAGE_ACTIVE_EFFECT_ID] },
      },
    });
    expect(loadPlaySessionState(created.id).activeEffectIds).toEqual([BARBARIAN_RAGE_ACTIVE_EFFECT_ID]);
  });

  it('H scales Monk static movement by Monk 6 rather than total level 11 and collects the source exactly once', () => {
    const value = input(MONK_ID, [
      progression(MONK_ID, 6, ['athletics', 'insight'], true, OPEN_HAND_ID),
      progression(FIGHTER_ID, 5, [], false, CHAMPION_ID),
    ]);
    const state = derived(character(value));

    expect(state.level).toBe(11);
    expect(state.species?.speedFeet).toBe(45);
    const movementSources = state.ruleEffectSources.filter((source) => source.contentId === MONK_MOVEMENT_ID);
    expect(movementSources).toHaveLength(1);
    expect(movementSources[0].owner).toMatchObject({ kind: 'class', classId: MONK_ID, level: 6 });
  });

  it('I aggregates subclass resources and resource transactions at parent class level using stable IDs', () => {
    const registry = new ContentRegistry(SRD_CONTENT, [vanguardSubclass]);
    const value = input(FIGHTER_ID, [
      progression(FIGHTER_ID, 5, ['athletics', 'perception'], true, VANGUARD_ID),
      progression(BARBARIAN_ID, 4, [], false, BERSERKER_ID),
    ]);
    const state = derived(character(value), registry);

    expect(state.level).toBe(9);
    expect(state.species?.speedFeet).toBe(35);
    expect(state.resources.find((resource) => resource.id === SUBCLASS_RESERVE_ID)).toMatchObject({
      maximumUses: 2,
      owner: { kind: 'subclass', classId: FIGHTER_ID, subclassId: VANGUARD_ID, level: 5 },
    });
    expect(state.resources.find((resource) => resource.id === SUBCLASS_CHARGE_ID)?.maximumUses).toBe(1);
    expect(state.resourceTransactions.find((transaction) => transaction.id === SUBCLASS_TRANSACTION_ID)?.owner)
      .toMatchObject({ kind: 'subclass', classId: FIGHTER_ID, subclassId: VANGUARD_ID, level: 5 });

    const created = createCharacter(value, window.localStorage, registry);
    expect(expendCharacterResource(created.id, SUBCLASS_RESERVE_ID, window.localStorage, registry).ok).toBe(true);
    const restored = executeCharacterResourceTransaction(
      created.id,
      SUBCLASS_TRANSACTION_ID,
      { kind: 'restore-resource' },
      window.localStorage,
      registry,
    );
    expect(restored).toMatchObject({
      ok: true,
      value: { playState: { resourceUses: {
        [SUBCLASS_RESERVE_ID]: 2,
        [SUBCLASS_CHARGE_ID]: 0,
      } } },
    });
  });

  it('J preserves representative single-class Rage, Fighter resources, and Champion automation', () => {
    const barbarianInput = fighterInput({
      classId: BARBARIAN_ID,
      subclassId: BERSERKER_ID,
      level: 9,
      skillProficiencies: ['athletics', 'perception'],
      abilityScores: QUALIFYING_SCORES,
      inventory: [],
    });
    const barbarian = derived(character(barbarianInput, 'single-barbarian'));
    expect(deriveActiveSelfEffectWeaponDamageBonus(barbarian, [BARBARIAN_RAGE_ACTIVE_EFFECT_ID], 'strength')).toBe(3);
    expect(barbarian.resources.find((resource) => resource.id === BARBARIAN_RAGE_RESOURCE_ID)?.maximumUses).toBe(4);

    const fighter = derived(character(fighterInput({
      level: 5,
      subclassId: CHAMPION_ID,
      abilityScores: QUALIFYING_SCORES,
      inventory: [],
    }), 'single-fighter'));
    expect(fighter.resources.find((resource) => resource.id === FIGHTER_SECOND_WIND_RESOURCE_ID)?.maximumUses).toBe(3);
    expect(fighter.resources.find((resource) => resource.id === FIGHTER_ACTION_SURGE_RESOURCE_ID)?.maximumUses).toBe(1);
    expect(deriveWeaponCriticalThreshold(fighter)).toBe(19);
  });

  it('K is mechanically order-independent for equivalent classProgressions', () => {
    const normal = derived(character(barbarianFighterInput(4, 5, BARBARIAN_ID, 'normal'), 'same-character'));
    const reversed = derived(character(barbarianFighterInput(4, 5, BARBARIAN_ID, 'reversed'), 'same-character'));
    expect(reversed).toEqual(normal);
  });

  it('L never fabricates singular multiclass ownership when D1 spellcasting is active', () => {
    const multiclass = derived(character(barbarianFighterInput(4, 5)));
    expect(multiclass.classState).toBeUndefined();
    expect(multiclass.subclass).toBeUndefined();
    expect(multiclass.classId).toBeUndefined();
    expect(multiclass.className).toBeUndefined();
    expect(multiclass.resources.every((resource) => resource.owner?.kind === 'class' || resource.owner?.kind === 'subclass')).toBe(true);

    const spellcasting = character(input(WIZARD_ID, [
      progression(WIZARD_ID, 1, ['arcana', 'history'], true),
      progression(FIGHTER_ID, 1, [], false),
    ]));
    const result = deriveCharacterState(spellcasting, contentRegistry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.classState).toBeUndefined();
    expect(result.value.subclass).toBeUndefined();
    expect(result.value.spellcasting).toMatchObject([{
      id: srdId('spellcasting-provider', 'wizard:spellcasting'),
      owner: { kind: 'class', classId: WIZARD_ID, level: 1 },
    }]);
  });
});
