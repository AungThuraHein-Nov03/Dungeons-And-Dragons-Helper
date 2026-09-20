import { beforeEach, describe, expect, it } from 'vitest';
import { SRD_CONTENT } from '../content/srd';
import { DRUID_SPELLCASTING_PROVIDER_ID, DRUID_WILD_SHAPE_RESOURCE_ID } from '../content/srd/druid';
import { srdId } from '../content/srd/source';
import {
  DRUID_NATURAL_RECOVERY_RESOURCE_ID,
  DRUID_NATURAL_RECOVERY_TRANSACTION_ID,
  SRD_CIRCLE_OF_THE_LAND,
} from '../content/srd/subclasses';
import {
  SRD_WIZARD,
  WIZARD_ARCANE_RECOVERY_RESOURCE_ID,
  WIZARD_ARCANE_RECOVERY_TRANSACTION_ID,
  WIZARD_SPELLCASTING_PROVIDER_ID,
} from '../content/srd/wizard';
import type { Character, CharacterInput } from '../models/character';
import type { ClassContent, ClassFeatureContent, SpellcastingProviderDefinition } from '../models/content';
import { deriveCharacterState } from '../rules/deriveCharacter';
import {
  applyCharacterDamage,
  executeCharacterResourceTransaction,
  expendCharacterResource,
  finishCharacterLongRest,
  setCharacterTemporaryHp,
} from './characterPlayState';
import { ContentRegistry, contentRegistry } from './contentRegistry';
import { createCharacter, getCharacterById } from './characterStorage';
import { playSessionStorageKey, savePlaySessionState } from './playSessionState';
import { fighterInput } from '../test/fixtures';

const WIZARD_ID = srdId('class', 'wizard');
const EVOKER_ID = srdId('subclass', 'wizard:evoker');
const DRUID_ID = srdId('class', 'druid');
const LAND_ID = srdId('subclass', 'druid:circle-of-the-land');

function countAtLevel(values: readonly { readonly level: number; readonly count: number }[], level: number): number {
  return [...values].filter((row) => row.level <= level).sort((a, b) => b.level - a.level)[0]?.count ?? 0;
}

function wizardProviderDefinition(): SpellcastingProviderDefinition {
  const provider = SRD_WIZARD.progression.flatMap((row) => row.features).flatMap((feature) => feature.spellcasting ?? []).find((candidate) => candidate.id === WIZARD_SPELLCASTING_PROVIDER_ID);
  if (!provider) throw new Error('Wizard provider fixture unavailable.');
  return provider;
}

function wizardInput(level: number, extras: Partial<CharacterInput> = {}): CharacterInput {
  const provider = wizardProviderDefinition();
  if (provider.spellManagement.kind !== 'prepared-from-owned') throw new Error('Wizard fixture expected prepared-from-owned management.');
  const management = provider.spellManagement;
  const catalog = contentRegistry.getAll('spell').filter((spell) => spell.spellLists.some((list) => list.id === management.spellListId));
  const cantrips = catalog.filter((spell) => spell.level === 0).slice(0, countAtLevel(management.cantripCount, level));
  const levelOne = catalog.filter((spell) => spell.level === 1).slice(0, management.initialOwnedSpellCount);
  const prepared = levelOne.slice(0, Math.min(levelOne.length, countAtLevel(management.preparedSpellCount, level)));
  if (cantrips.length !== countAtLevel(management.cantripCount, level) || levelOne.length !== management.initialOwnedSpellCount) throw new Error('Wizard spell fixtures unavailable.');
  return fighterInput({
    name: 'M13C Wizard ' + level,
    classId: WIZARD_ID,
    subclassId: level >= 3 ? EVOKER_ID : undefined,
    level,
    skillProficiencies: ['history', 'insight'],
    abilityScores: { intelligence: 18, wisdom: 14 },
    spellcastingSelections: [{
      providerId: WIZARD_SPELLCASTING_PROVIDER_ID,
      cantripIds: cantrips.map((spell) => spell.id),
      ownedSpellIds: levelOne.map((spell) => spell.id),
      preparedSpellIds: prepared.map((spell) => spell.id),
    }],
    inventory: [{ id: 'm13c:wizard-keepsake', kind: 'custom', name: 'Keepsake', category: 'other', quantity: 1, notes: 'Must survive recovery.' }],
    currency: { cp: 3, sp: 2, ep: 0, gp: 41, pp: 1 },
    ...extras,
  });
}

function druidInput(level: number): CharacterInput {
  return fighterInput({
    name: 'M13C Druid ' + level,
    classId: DRUID_ID,
    subclassId: LAND_ID,
    level,
    skillProficiencies: ['arcana', 'perception'],
    abilityScores: { wisdom: 18, intelligence: 12 },
    spellcastingSelections: [],
    inventory: [{ id: 'm13c:druid-token', kind: 'custom', name: 'Land Token', category: 'other', quantity: 1, notes: 'Unrelated.' }],
    currency: { cp: 1, sp: 7, ep: 0, gp: 12, pp: 0 },
  });
}

function buildSnapshot(character: Character) {
  return Object.fromEntries(Object.entries(character).filter(([key]) => key !== 'playState' && key !== 'updatedAt'));
}

function derived(character: Character, registry: ContentRegistry = contentRegistry) {
  const result = deriveCharacterState(character, registry);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('M13C real Wizard Arcane Recovery acceptance', () => {
  beforeEach(() => window.localStorage.clear());

  it('derives ceil(Wizard level / 2) for representative odd/even levels through the real feature', () => {
    for (const [level, budget] of [[1, 1], [2, 1], [3, 2], [4, 2], [11, 6]] as const) {
      const character = createCharacter(wizardInput(level));
      const state = derived(character);
      const transaction = state.resourceTransactions.find((candidate) => candidate.id === WIZARD_ARCANE_RECOVERY_TRANSACTION_ID);
      expect(transaction).toMatchObject({
        name: 'Arcane Recovery',
        kind: 'restore-spell-slots-with-budget',
        providerId: WIZARD_SPELLCASTING_PROVIDER_ID,
        budget,
        maximumSpellLevel: 5,
        timing: 'short-rest',
      });
      const usage = state.resources.find((resource) => resource.id === WIZARD_ARCANE_RECOVERY_RESOURCE_ID);
      expect(usage).toMatchObject({ name: 'Arcane Recovery', maximumUses: 1, recovery: [{ trigger: 'long-rest', mode: 'all' }] });
      expect(character.playState.resourceUses[WIZARD_ARCANE_RECOVERY_RESOURCE_ID]).toBe(1);
    }
  });

  it('restores legal existing slots, rejects no-op/over-budget/level-6 selections atomically, gates second use, and resets on Long Rest', () => {
    const character = createCharacter(wizardInput(11));
    const stableBefore = buildSnapshot(character);
    const level1 = srdId('spell-slot', 'wizard:1');
    const level2 = srdId('spell-slot', 'wizard:2');
    const level5 = srdId('spell-slot', 'wizard:5');
    const level6 = srdId('spell-slot', 'wizard:6');

    const initial = derived(character);
    const transaction = initial.resourceTransactions.find((candidate) => candidate.id === WIZARD_ARCANE_RECOVERY_TRANSACTION_ID);
    expect(transaction?.kind).toBe('restore-spell-slots-with-budget');
    if (!transaction || transaction.kind !== 'restore-spell-slots-with-budget') throw new Error('Missing Arcane Recovery.');
    expect(transaction.slots.map((slot) => slot.spellLevel)).toEqual([1, 2, 3, 4, 5]);
    expect(transaction.slots.find((slot) => slot.resourceId === level5)?.spellLevel).toBe(5);
    expect(transaction.slots.some((slot) => slot.resourceId === level6)).toBe(false);

    const noOp = executeCharacterResourceTransaction(character.id, WIZARD_ARCANE_RECOVERY_TRANSACTION_ID, {
      kind: 'restore-spell-slots-with-budget',
      selections: [{ resourceId: level1, amount: 1 }],
    });
    expect(noOp).toMatchObject({ ok: false, error: { code: 'resource-full' } });
    expect(getCharacterById(character.id)?.playState.resourceUses[WIZARD_ARCANE_RECOVERY_RESOURCE_ID]).toBe(1);

    expect(expendCharacterResource(character.id, level5).ok).toBe(true);
    expect(expendCharacterResource(character.id, level6).ok).toBe(true);
    expect(expendCharacterResource(character.id, level2).ok).toBe(true);
    const beforeRejected = getCharacterById(character.id)!;

    const level6Rejected = executeCharacterResourceTransaction(character.id, WIZARD_ARCANE_RECOVERY_TRANSACTION_ID, {
      kind: 'restore-spell-slots-with-budget',
      selections: [{ resourceId: level6, amount: 1 }],
    });
    expect(level6Rejected).toMatchObject({ ok: false, error: { code: 'invalid-resource-transaction' } });
    expect(getCharacterById(character.id)?.playState).toEqual(beforeRejected.playState);

    const overBudget = executeCharacterResourceTransaction(character.id, WIZARD_ARCANE_RECOVERY_TRANSACTION_ID, {
      kind: 'restore-spell-slots-with-budget',
      selections: [{ resourceId: level5, amount: 1 }, { resourceId: level2, amount: 1 }],
    });
    expect(overBudget).toMatchObject({ ok: false, error: { code: 'invalid-resource-transaction' } });
    expect(getCharacterById(character.id)?.playState).toEqual(beforeRejected.playState);

    const recovered = executeCharacterResourceTransaction(character.id, WIZARD_ARCANE_RECOVERY_TRANSACTION_ID, {
      kind: 'restore-spell-slots-with-budget',
      selections: [{ resourceId: level5, amount: 1 }],
    });
    expect(recovered).toMatchObject({ ok: true, value: { playState: { resourceUses: { [WIZARD_ARCANE_RECOVERY_RESOURCE_ID]: 0 } } } });
    if (!recovered.ok) throw new Error(recovered.error.message);
    expect(recovered.value.playState.resourceUses[level5]).toBe(transaction.slots.find((slot) => slot.resourceId === level5)?.maximumUses);
    expect(recovered.value.playState.resourceUses[level6]).toBe(beforeRejected.playState.resourceUses[level6]);
    expect(recovered.value.playState.resourceUses[level2]).toBe(beforeRejected.playState.resourceUses[level2]);
    expect(buildSnapshot(recovered.value)).toEqual(stableBefore);

    expect(expendCharacterResource(character.id, level1).ok).toBe(true);
    const beforeSecondUse = getCharacterById(character.id)!;
    const secondUse = executeCharacterResourceTransaction(character.id, WIZARD_ARCANE_RECOVERY_TRANSACTION_ID, {
      kind: 'restore-spell-slots-with-budget',
      selections: [{ resourceId: level1, amount: 1 }],
    });
    expect(secondUse).toMatchObject({ ok: false, error: { code: 'resource-transaction-unavailable' } });
    expect(getCharacterById(character.id)?.playState).toEqual(beforeSecondUse.playState);

    const rested = finishCharacterLongRest(character.id);
    expect(rested).toMatchObject({ ok: true, value: { playState: { resourceUses: { [WIZARD_ARCANE_RECOVERY_RESOURCE_ID]: 1 } } } });
    if (!rested.ok) throw new Error(rested.error.message);
    expect(rested.value.playState.resourceUses[level6]).toBe(1);
    expect(rested.value.playState.resourceUses[level1]).toBe(4);
    expect(buildSnapshot(rested.value)).toEqual(stableBefore);
  });
  it('preserves Character v9 build/play fields and does not mutate M13B session state during execution', () => {
    const character = createCharacter(wizardInput(11));
    const level1 = srdId('spell-slot', 'wizard:1');
    expect(applyCharacterDamage(character.id, 7).ok).toBe(true);
    expect(setCharacterTemporaryHp(character.id, 5).ok).toBe(true);
    expect(expendCharacterResource(character.id, level1).ok).toBe(true);

    savePlaySessionState(character.id, {
      conditions: ['blinded'],
      concentration: { spellId: 'sentinel-spell', providerId: 'sentinel-provider' },
    });
    const sessionBefore = window.sessionStorage.getItem(playSessionStorageKey(character.id));
    const before = getCharacterById(character.id)!;
    const stableBefore = buildSnapshot(before);
    const playBefore = before.playState;

    const executed = executeCharacterResourceTransaction(character.id, WIZARD_ARCANE_RECOVERY_TRANSACTION_ID, {
      kind: 'restore-spell-slots-with-budget',
      selections: [{ resourceId: level1, amount: 1 }],
    });
    expect(executed.ok).toBe(true);
    if (!executed.ok) throw new Error(executed.error.message);

    expect(executed.value.playState.currentHp).toBe(playBefore.currentHp);
    expect(executed.value.playState.temporaryHp).toBe(playBefore.temporaryHp);
    expect(executed.value.playState.hitDiceRemaining).toEqual(playBefore.hitDiceRemaining);
    expect(executed.value.playState.resourceUses[level1]).toBe(playBefore.resourceUses[level1] + 1);
    expect(executed.value.playState.resourceUses[WIZARD_ARCANE_RECOVERY_RESOURCE_ID]).toBe(0);
    expect(buildSnapshot(executed.value)).toEqual(stableBefore);
    expect(window.sessionStorage.getItem(playSessionStorageKey(character.id))).toBe(sessionBefore);
    expect(Object.keys(executed.value.playState).sort()).toEqual(['currentHp', 'hitDiceRemaining', 'resourceUses', 'temporaryHp']);
  });
});

describe('M13C real Circle of the Land Natural Recovery acceptance', () => {
  beforeEach(() => window.localStorage.clear());

  it('derives the real subclass transaction, preserves the separate free Circle-spell cast as reference-only, and uses ceil(Druid level / 2)', () => {
    const character = createCharacter(druidInput(6));
    const state = derived(character);
    const transaction = state.resourceTransactions.find((candidate) => candidate.id === DRUID_NATURAL_RECOVERY_TRANSACTION_ID);
    expect(transaction).toMatchObject({
      name: 'Natural Recovery',
      kind: 'restore-spell-slots-with-budget',
      providerId: DRUID_SPELLCASTING_PROVIDER_ID,
      budget: 3,
      maximumSpellLevel: 5,
      timing: 'short-rest',
    });
    expect(state.resources.find((resource) => resource.id === DRUID_NATURAL_RECOVERY_RESOURCE_ID)).toMatchObject({ maximumUses: 1, recovery: [{ trigger: 'long-rest', mode: 'all' }] });
    const naturalRecoveryFeature = SRD_CIRCLE_OF_THE_LAND.progression.flatMap((row) => row.features).find((feature) => feature.name === 'Natural Recovery');
    expect(naturalRecoveryFeature?.referenceEffects.some((effect) => effect.name === 'Free Circle Spell Cast')).toBe(true);
    expect(naturalRecoveryFeature?.resourceTransactions).toHaveLength(1);
  });

  it('executes through the same generic service, rejects over-budget atomically, and processes the Short Rest exactly once', () => {
    const character = createCharacter(druidInput(6));
    const stableBefore = buildSnapshot(character);
    const level1 = srdId('spell-slot', 'druid:1');
    const level3 = srdId('spell-slot', 'druid:3');

    expect(expendCharacterResource(character.id, DRUID_WILD_SHAPE_RESOURCE_ID).ok).toBe(true);
    expect(expendCharacterResource(character.id, DRUID_WILD_SHAPE_RESOURCE_ID).ok).toBe(true);
    expect(expendCharacterResource(character.id, level1).ok).toBe(true);
    expect(expendCharacterResource(character.id, level3).ok).toBe(true);
    const beforeRejected = getCharacterById(character.id)!;
    expect(beforeRejected.playState.resourceUses[DRUID_WILD_SHAPE_RESOURCE_ID]).toBe(1);

    const overBudget = executeCharacterResourceTransaction(character.id, DRUID_NATURAL_RECOVERY_TRANSACTION_ID, {
      kind: 'restore-spell-slots-with-budget',
      selections: [{ resourceId: level1, amount: 1 }, { resourceId: level3, amount: 1 }],
    });
    expect(overBudget).toMatchObject({ ok: false, error: { code: 'invalid-resource-transaction' } });
    expect(getCharacterById(character.id)?.playState).toEqual(beforeRejected.playState);

    const recovered = executeCharacterResourceTransaction(character.id, DRUID_NATURAL_RECOVERY_TRANSACTION_ID, {
      kind: 'restore-spell-slots-with-budget',
      selections: [{ resourceId: level3, amount: 1 }],
    });
    expect(recovered).toMatchObject({ ok: true, value: { playState: { resourceUses: { [DRUID_NATURAL_RECOVERY_RESOURCE_ID]: 0, [DRUID_WILD_SHAPE_RESOURCE_ID]: 2 } } } });
    if (!recovered.ok) throw new Error(recovered.error.message);
    expect(recovered.value.playState.resourceUses[level3]).toBe(3);
    expect(recovered.value.playState.resourceUses[level1]).toBe(beforeRejected.playState.resourceUses[level1]);
    expect(buildSnapshot(recovered.value)).toEqual(stableBefore);

    const rested = finishCharacterLongRest(character.id);
    expect(rested).toMatchObject({ ok: true, value: { playState: { resourceUses: { [DRUID_NATURAL_RECOVERY_RESOURCE_ID]: 1, [DRUID_WILD_SHAPE_RESOURCE_ID]: 3 } } } });
  });

  it('excludes level-6 slots even when a level-11 Druid has enough recovery budget', () => {
    const character = createCharacter(druidInput(11));
    const level6 = srdId('spell-slot', 'druid:6');
    expect(expendCharacterResource(character.id, level6).ok).toBe(true);
    const before = getCharacterById(character.id)!;
    const state = derived(before);
    const transaction = state.resourceTransactions.find((candidate) => candidate.id === DRUID_NATURAL_RECOVERY_TRANSACTION_ID);
    expect(transaction).toMatchObject({ kind: 'restore-spell-slots-with-budget', budget: 6, maximumSpellLevel: 5 });
    const rejected = executeCharacterResourceTransaction(character.id, DRUID_NATURAL_RECOVERY_TRANSACTION_ID, {
      kind: 'restore-spell-slots-with-budget',
      selections: [{ resourceId: level6, amount: 1 }],
    });
    expect(rejected).toMatchObject({ ok: false, error: { code: 'invalid-resource-transaction' } });
    expect(getCharacterById(character.id)?.playState).toEqual(before.playState);
  });
});

const HOME_SOURCE = { type: 'homebrew', namespace: 'm13c-acceptance' } as const;
const HOME_CLASS_ID = 'homebrew:m13c-acceptance:class:starseeker';
const HOME_PROVIDER_ID = 'homebrew:m13c-acceptance:spellcasting-provider:resonance';
const HOME_USE_ID = 'homebrew:m13c-acceptance:resource:renewal';
const HOME_SIDE_ID = 'homebrew:m13c-acceptance:resource:tempo';
const HOME_SLOT1 = 'homebrew:m13c-acceptance:spell-slot:one';
const HOME_SLOT2 = 'homebrew:m13c-acceptance:spell-slot:two';
const HOME_TRANSACTION_ID = 'homebrew:m13c-acceptance:resource-transaction:recollect';

const homeFeature: ClassFeatureContent = {
  id: 'homebrew:m13c-acceptance:class-feature:recollection',
  name: 'Recollection',
  description: 'A bounded rest recovery technique.',
  effects: [],
  spellcasting: [{
    id: HOME_PROVIDER_ID,
    name: 'Resonance Casting',
    spellcastingAbility: { kind: 'fixed', ability: 'intelligence' },
    multiclassSlotContribution: { kind: 'independent' },
    spellManagement: { kind: 'granted-only', spellIds: [srdId('spell', 'magic-missile')] },
    slotPool: {
      id: 'homebrew:m13c-acceptance:spell-slot-pool:resonance',
      name: 'Resonance Slots',
      slotLevels: [
        { spellLevel: 1, resourceId: HOME_SLOT1, name: 'First Resonance Slots' },
        { spellLevel: 2, resourceId: HOME_SLOT2, name: 'Second Resonance Slots' },
      ],
      progression: [{ level: 1, slots: [{ spellLevel: 1, maximum: 2 }, { spellLevel: 2, maximum: 1 }] }],
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
    ritualCasting: 'none',
  }],
  resources: [{
    id: HOME_USE_ID,
    name: 'Recollection Use',
    source: HOME_SOURCE,
    maximum: { kind: 'level-table', values: [{ level: 1, uses: 1 }] },
    recovery: [{ trigger: 'long-rest', mode: 'all' }],
  }],
  resourceTransactions: [{
    id: HOME_TRANSACTION_ID,
    name: 'Recollect Resonance',
    kind: 'restore-spell-slots-with-budget',
    providerId: HOME_PROVIDER_ID,
    usageResourceId: HOME_USE_ID,
    budget: { kind: 'half-level-round-up' },
    maximumSpellLevel: 2,
    timing: 'short-rest',
  }],
  referenceEffects: [],
};

const HOME_CLASS: ClassContent = {
  id: HOME_CLASS_ID,
  kind: 'class',
  name: 'Starseeker',
  source: HOME_SOURCE,
  hitDie: 8,
  fixedHitPointsPerLevel: 5,
  primaryAbility: { mode: 'one-of', abilities: ['intelligence'] },
  multiclassProficiencies: { weaponProficiencies: [], armorTraining: [], toolProficiencies: [] },
  savingThrowProficiencies: ['intelligence', 'wisdom'],
  weaponProficiencies: [],
  armorTraining: [],
  toolProficiencies: [],
  skillChoices: { choose: 2, from: ['arcana', 'history', 'insight'] },
  startingEquipment: [{ id: 'A', items: [], currency: { amount: 0, unit: 'gp' } }],
  progression: Array.from({ length: 20 }, (_, index) => ({
    level: index + 1,
    proficiencyBonus: index + 1 >= 17 ? 6 : index + 1 >= 13 ? 5 : index + 1 >= 9 ? 4 : index + 1 >= 5 ? 3 : 2,
    features: index === 0 ? [homeFeature] : [],
  })),
  resources: [{
    id: HOME_SIDE_ID,
    name: 'Tempo',
    source: HOME_SOURCE,
    maximum: { kind: 'level-table', values: [{ level: 1, uses: 2 }] },
    recovery: [{ trigger: 'short-rest', mode: 'amount', amount: 1 }, { trigger: 'long-rest', mode: 'all' }],
  }],
};

function homeInput(): CharacterInput {
  return fighterInput({
    name: 'M13C Starseeker',
    classId: HOME_CLASS_ID,
    subclassId: undefined,
    level: 4,
    skillProficiencies: ['arcana', 'history'],
    abilityScores: { intelligence: 18, wisdom: 14 },
    spellcastingSelections: [],
    inventory: [{ id: 'm13c:homebrew-keepsake', kind: 'custom', name: 'Meteor Glass', category: 'other', quantity: 2, notes: 'Persistent fixture.' }],
    currency: { cp: 5, sp: 4, ep: 3, gp: 2, pp: 1 },
  });
}

describe('M13C synthetic Homebrew content-to-runtime acceptance', () => {
  beforeEach(() => window.localStorage.clear());

  it('validates, discovers, derives, executes, persists, and resets unrelated Homebrew content through the same generic path', () => {
    const registry = new ContentRegistry(SRD_CONTENT, [HOME_CLASS]);
    const character = createCharacter(homeInput(), window.localStorage, registry);
    const state = derived(character, registry);

    expect(state.className).toBe('Starseeker');
    expect(state.resources.find((resource) => resource.id === HOME_USE_ID)).toMatchObject({ maximumUses: 1, recovery: [{ trigger: 'long-rest', mode: 'all' }] });
    expect(state.resources.find((resource) => resource.id === HOME_SLOT2)).toMatchObject({ maximumUses: 1 });
    expect(state.resourceTransactions.find((transaction) => transaction.id === HOME_TRANSACTION_ID)).toMatchObject({
      name: 'Recollect Resonance',
      kind: 'restore-spell-slots-with-budget',
      providerId: HOME_PROVIDER_ID,
      budget: 2,
      maximumSpellLevel: 2,
    });

    expect(expendCharacterResource(character.id, HOME_SLOT2, window.localStorage, registry).ok).toBe(true);
    expect(expendCharacterResource(character.id, HOME_SIDE_ID, window.localStorage, registry).ok).toBe(true);
    const before = getCharacterById(character.id, window.localStorage, registry)!;
    const stableBefore = buildSnapshot(before);
    expect(before.playState.resourceUses[HOME_SLOT2]).toBe(0);
    expect(before.playState.resourceUses[HOME_SIDE_ID]).toBe(1);

    const executed = executeCharacterResourceTransaction(character.id, HOME_TRANSACTION_ID, {
      kind: 'restore-spell-slots-with-budget',
      selections: [{ resourceId: HOME_SLOT2, amount: 1 }],
    }, window.localStorage, registry);
    expect(executed).toMatchObject({ ok: true, value: { playState: { resourceUses: { [HOME_SLOT2]: 1, [HOME_USE_ID]: 0, [HOME_SIDE_ID]: 2 } } } });
    if (!executed.ok) throw new Error(executed.error.message);

    const persisted = getCharacterById(character.id, window.localStorage, registry)!;
    expect(persisted.playState).toEqual(executed.value.playState);
    expect(buildSnapshot(persisted)).toEqual(stableBefore);
    expect(Object.keys(persisted.playState).sort()).toEqual(['currentHp', 'hitDiceRemaining', 'resourceUses', 'temporaryHp']);

    const rested = finishCharacterLongRest(character.id, window.localStorage, registry);
    expect(rested).toMatchObject({ ok: true, value: { playState: { resourceUses: { [HOME_USE_ID]: 1, [HOME_SLOT2]: 1, [HOME_SIDE_ID]: 2 } } } });
  });
});
