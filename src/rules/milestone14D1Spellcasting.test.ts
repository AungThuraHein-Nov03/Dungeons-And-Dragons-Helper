import { describe, expect, it } from 'vitest';
import { SRD_CONTENT, srdId } from '../content/srd';
import {
  SKILL_IDS,
  type AbilityScores,
  type Character,
  type CharacterClassProgression,
  type CharacterInput,
  type SkillId,
} from '../models/character';
import type { ClassContent, LeveledSpellLevel, SpellcastingProviderDefinition, SubclassContent } from '../models/content';
import type { ContentId } from '../models/contentId';
import { ContentRegistry, contentRegistry } from '../services/contentRegistry';
import { fighterInput } from '../test/fixtures';
import { createFixedHpProgression } from './health';
import { MULTICLASS_SPELLCASTER_SLOT_PROGRESSION } from './multiclass';
import { expendResource, initializePlayState, reconcilePlayState } from './playState';
import {
  MULTICLASS_ORDINARY_SLOT_POOL_ID,
  multiclassOrdinaryCasterContribution,
  multiclassOrdinarySpellSlotResourceId,
} from './spellcasting';
import { deriveCharacterState } from './deriveCharacter';

const FIGHTER_ID = srdId('class', 'fighter');
const CLERIC_ID = srdId('class', 'cleric');
const WIZARD_ID = srdId('class', 'wizard');
const PALADIN_ID = srdId('class', 'paladin');
const SORCERER_ID = srdId('class', 'sorcerer');
const RANGER_ID = srdId('class', 'ranger');
const WARLOCK_ID = srdId('class', 'warlock');

const CLERIC_PROVIDER_ID = srdId('spellcasting-provider', 'cleric:spellcasting');
const WIZARD_PROVIDER_ID = srdId('spellcasting-provider', 'wizard:spellcasting');
const PALADIN_PROVIDER_ID = srdId('spellcasting-provider', 'paladin:spellcasting');
const SORCERER_PROVIDER_ID = srdId('spellcasting-provider', 'sorcerer:spellcasting');
const RANGER_PROVIDER_ID = srdId('spellcasting-provider', 'ranger:spellcasting');
const WARLOCK_PROVIDER_ID = srdId('spellcasting-provider', 'warlock:pact-magic');

const SCORES: Partial<AbilityScores> = {
  strength: 14,
  dexterity: 14,
  constitution: 14,
  intelligence: 14,
  wisdom: 16,
  charisma: 14,
};

function skillsFor(classId: ContentId, starting: boolean, registry: ContentRegistry): SkillId[] {
  const classContent = registry.findClass(classId);
  if (!classContent) throw new Error(`Missing class fixture: ${classId}`);
  if (starting) return [...classContent.skillChoices.from.slice(0, classContent.skillChoices.choose)];
  const choice = classContent.multiclassProficiencies.skillChoices;
  if (!choice) return [];
  const allowed = choice.kind === 'any-skill'
    ? SKILL_IDS
    : choice.kind === 'class-skill-list'
      ? classContent.skillChoices.from
      : choice.from;
  return [...allowed.slice(0, choice.choose)];
}

function progression(
  classId: ContentId,
  level: number,
  starting: boolean,
  registry: ContentRegistry,
  subclassId?: ContentId,
): CharacterClassProgression {
  return {
    classId,
    level,
    ...(subclassId ? { subclassId } : {}),
    skillProficiencies: skillsFor(classId, starting, registry),
    hpProgression: createFixedHpProgression(level, starting),
  };
}

function input(
  startingClassId: ContentId,
  entries: readonly { classId: ContentId; level: number; subclassId?: ContentId }[],
  registry: ContentRegistry = contentRegistry,
  order: 'normal' | 'reversed' = 'normal',
): CharacterInput {
  const progressions = entries.map((entry) => progression(
    entry.classId,
    entry.level,
    entry.classId === startingClassId,
    registry,
    entry.subclassId,
  ));
  return fighterInput({
    startingClassId,
    classProgressions: order === 'normal' ? progressions : [...progressions].reverse(),
    abilityScores: SCORES,
    inventory: [],
    spellcastingSelections: [],
  });
}

function character(value: CharacterInput, id = 'm14-d1-character'): Character {
  return {
    ...value,
    id,
    playState: { currentHp: 1, temporaryHp: 0, hitDiceRemaining: {}, resourceUses: {} },
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
  };
}

function derive(value: Character, registry: ContentRegistry = contentRegistry) {
  const result = deriveCharacterState(value, registry);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function provider(state: ReturnType<typeof derive>, providerId: ContentId) {
  const result = state.spellcasting.find((candidate) => candidate.id === providerId);
  if (!result) throw new Error(`Missing provider: ${providerId}`);
  return result;
}

function ordinarySlots(state: ReturnType<typeof derive>) {
  return state.ordinaryMulticlassSlotPool?.slots.map(({ spellLevel, resourceId, maximumUses }) => ({
    spellLevel,
    resourceId,
    maximumUses,
  }));
}

const SOURCE = { type: 'homebrew', namespace: 'm14-d1' } as const;
const FIRE_BOLT_ID = srdId('spell', 'fire-bolt');

function pb(level: number): number {
  return level >= 17 ? 6 : level >= 13 ? 5 : level >= 9 ? 4 : level >= 5 ? 3 : 2;
}

function syntheticProvider(
  id: string,
  contribution: SpellcastingProviderDefinition['multiclassSlotContribution'],
  options: { featureLevel?: number; independentPool?: boolean } = {},
): SpellcastingProviderDefinition {
  const featureLevel = options.featureLevel ?? 1;
  const pool = options.independentPool ? {
    id: `homebrew:m14-d1:spell-slot-pool:${id}`,
    name: `${id} Slots`,
    slotLevels: ([1, 2] as const).map((spellLevel) => ({
      spellLevel,
      resourceId: `homebrew:m14-d1:spell-slot:${id}:${spellLevel}`,
      name: `Level ${spellLevel} ${id} Slots`,
    })),
    progression: [
      { level: featureLevel, slots: [{ spellLevel: 1 as LeveledSpellLevel, maximum: 1 }] },
      { level: Math.max(featureLevel + 1, 2), slots: [{ spellLevel: 1 as LeveledSpellLevel, maximum: 2 }, { spellLevel: 2 as LeveledSpellLevel, maximum: 1 }] },
      { level: 5, slots: [{ spellLevel: 1 as LeveledSpellLevel, maximum: 3 }, { spellLevel: 2 as LeveledSpellLevel, maximum: 2 }] },
    ].filter((row, index, rows) => index === 0 || row.level > rows[index - 1].level),
    recovery: [{ trigger: 'long-rest' as const, mode: 'all' as const }],
  } : undefined;
  return {
    id: `homebrew:m14-d1:spellcasting-provider:${id}`,
    name: `${id} Casting`,
    spellcastingAbility: { kind: 'fixed', ability: 'intelligence' },
    multiclassSlotContribution: contribution,
    spellManagement: { kind: 'granted-only', spellIds: [FIRE_BOLT_ID] },
    ...(pool ? { slotPool: pool } : {}),
    ritualCasting: 'none',
  };
}

function syntheticClass(
  id: string,
  providerDefinition: SpellcastingProviderDefinition,
  featureLevel = 1,
): ClassContent {
  const classId = `homebrew:m14-d1:class:${id}`;
  return {
    id: classId,
    kind: 'class',
    name: `${id} Adept`,
    source: SOURCE,
    hitDie: 8,
    fixedHitPointsPerLevel: 5,
    primaryAbility: { mode: 'one-of', abilities: ['intelligence'] },
    multiclassProficiencies: { weaponProficiencies: [], armorTraining: [], toolProficiencies: [] },
    savingThrowProficiencies: ['intelligence', 'wisdom'],
    weaponProficiencies: [{ kind: 'category', category: 'simple' }],
    armorTraining: [],
    toolProficiencies: [],
    skillChoices: { choose: 2, from: ['arcana', 'history', 'investigation'] },
    startingEquipment: [{ id: 'A', items: [], currency: { amount: 10, unit: 'gp' } }],
    progression: Array.from({ length: 20 }, (_, index) => {
      const level = index + 1;
      return {
        level,
        proficiencyBonus: pb(level),
        features: level === featureLevel ? [{
          id: `homebrew:m14-d1:class-feature:${id}:spellcasting`,
          name: `${id} Spellcasting`,
          description: 'Synthetic M14-D1 spellcasting fixture.',
          effects: [],
          spellcasting: [providerDefinition],
          referenceEffects: [],
        }] : [],
      };
    }),
    resources: [],
  };
}

describe('Milestone 14-D1 multiclass spellcasting foundation', () => {
  it('A derives Cleric 3 / Wizard 2 as two owner-aware providers sharing combined caster level 5 slots', () => {
    const state = derive(character(input(CLERIC_ID, [
      { classId: CLERIC_ID, level: 3 },
      { classId: WIZARD_ID, level: 2 },
    ])));
    const cleric = provider(state, CLERIC_PROVIDER_ID);
    const wizard = provider(state, WIZARD_PROVIDER_ID);

    expect(state.level).toBe(5);
    expect(state.proficiencyBonus).toBe(3);
    expect(state.ordinaryMulticlassCasterLevel).toBe(5);
    expect(ordinarySlots(state)).toEqual([
      { spellLevel: 1, resourceId: multiclassOrdinarySpellSlotResourceId(1), maximumUses: 4 },
      { spellLevel: 2, resourceId: multiclassOrdinarySpellSlotResourceId(2), maximumUses: 3 },
      { spellLevel: 3, resourceId: multiclassOrdinarySpellSlotResourceId(3), maximumUses: 2 },
    ]);
    expect(cleric).toMatchObject({
      owner: { kind: 'class', classId: CLERIC_ID, level: 3 },
      ability: 'wisdom',
      slotPool: { id: MULTICLASS_ORDINARY_SLOT_POOL_ID },
      management: { spellListId: 'cleric' },
    });
    expect(wizard).toMatchObject({
      owner: { kind: 'class', classId: WIZARD_ID, level: 2 },
      ability: 'intelligence',
      slotPool: { id: MULTICLASS_ORDINARY_SLOT_POOL_ID },
      management: { spellListId: 'wizard' },
    });
  });

  it('B derives Paladin 3 / Sorcerer 2 as half-up 2 + full 2 = combined caster level 4', () => {
    const state = derive(character(input(PALADIN_ID, [
      { classId: PALADIN_ID, level: 3 },
      { classId: SORCERER_ID, level: 2 },
    ])));
    expect(state.ordinaryMulticlassCasterLevel).toBe(4);
    expect(provider(state, PALADIN_PROVIDER_ID).owner).toMatchObject({ classId: PALADIN_ID, level: 3 });
    expect(provider(state, SORCERER_PROVIDER_ID).owner).toMatchObject({ classId: SORCERER_ID, level: 2 });
    expect(ordinarySlots(state)?.map((slot) => [slot.spellLevel, slot.maximumUses])).toEqual([[1, 4], [2, 3]]);
  });

  it('C derives Ranger 3 / Wizard 1 as half-up 2 + full 1 = combined caster level 3', () => {
    const state = derive(character(input(RANGER_ID, [
      { classId: RANGER_ID, level: 3 },
      { classId: WIZARD_ID, level: 1 },
    ])));
    expect(state.ordinaryMulticlassCasterLevel).toBe(3);
    expect(provider(state, RANGER_PROVIDER_ID).multiclassSlotContribution).toEqual({ kind: 'spellcasting', contribution: 'half', rounding: 'up' });
    expect(ordinarySlots(state)?.map((slot) => [slot.spellLevel, slot.maximumUses])).toEqual([[1, 4], [2, 2]]);
  });

  it('D derives third-down Homebrew 5 / Wizard 2 as 1 + 2 = combined caster level 3 without a class-name branch', () => {
    const thirdProvider = syntheticProvider('third-down', { kind: 'spellcasting', contribution: 'third', rounding: 'down' });
    const thirdClass = syntheticClass('third-down', thirdProvider);
    const registry = new ContentRegistry(SRD_CONTENT, [thirdClass]);
    const state = derive(character(input(WIZARD_ID, [
      { classId: thirdClass.id, level: 5 },
      { classId: WIZARD_ID, level: 2 },
    ], registry)), registry);

    expect(multiclassOrdinaryCasterContribution(thirdProvider, 5)).toBe(1);
    expect(state.ordinaryMulticlassCasterLevel).toBe(3);
    expect(provider(state, thirdProvider.id)).toMatchObject({ owner: { classId: thirdClass.id, level: 5 } });
    expect(ordinarySlots(state)?.map((slot) => [slot.spellLevel, slot.maximumUses])).toEqual([[1, 4], [2, 2]]);
  });

  it('E keeps Wizard 4 / Warlock 3 Pact Magic separate while ordinary caster level remains 4', () => {
    const state = derive(character(input(WIZARD_ID, [
      { classId: WIZARD_ID, level: 4 },
      { classId: WARLOCK_ID, level: 3 },
    ])));
    const wizard = provider(state, WIZARD_PROVIDER_ID);
    const warlock = provider(state, WARLOCK_PROVIDER_ID);

    expect(state.ordinaryMulticlassCasterLevel).toBe(4);
    expect(wizard.slotPool?.id).toBe(MULTICLASS_ORDINARY_SLOT_POOL_ID);
    expect(warlock).toMatchObject({
      owner: { kind: 'class', classId: WARLOCK_ID, level: 3 },
      multiclassSlotContribution: { kind: 'pact-magic' },
      slotPool: { id: srdId('spell-slot-pool', 'warlock:pact-magic') },
    });
    expect(warlock.slotPool?.slots).toEqual([
      {
        spellLevel: 2,
        resourceId: srdId('spell-slot', 'warlock:pact-magic:2'),
        name: 'Level 2 Pact Magic Slots',
        maximumUses: 2,
      },
    ]);
    expect(state.resources.some((resource) => resource.id === srdId('spell-slot', 'warlock:pact-magic:2'))).toBe(true);
    expect(state.resources.some((resource) => resource.id === multiclassOrdinarySpellSlotResourceId(2))).toBe(true);
  });

  it('F derives Fighter 4 / Warlock 3 with Pact provider only and fabricates no ordinary slot pool', () => {
    const state = derive(character(input(FIGHTER_ID, [
      { classId: FIGHTER_ID, level: 4 },
      { classId: WARLOCK_ID, level: 3 },
    ])));
    expect(state.ordinaryMulticlassCasterLevel).toBe(0);
    expect(state.ordinaryMulticlassSlotPool).toBeUndefined();
    expect(state.spellcasting.map((entry) => entry.id)).toEqual([WARLOCK_PROVIDER_ID]);
    expect(state.resources.some((resource) => resource.id.startsWith('dnd3:spell-slot:multiclass-ordinary:'))).toBe(false);
    expect(provider(state, WARLOCK_PROVIDER_ID).slotPool?.id).toBe(srdId('spell-slot-pool', 'warlock:pact-magic'));
  });

  it('G keeps an independent Homebrew provider separate and gives only Wizard levels to the ordinary pool', () => {
    const independentProvider = syntheticProvider('independent', { kind: 'independent' }, { independentPool: true });
    const independentClass = syntheticClass('independent', independentProvider);
    const registry = new ContentRegistry(SRD_CONTENT, [independentClass]);
    const state = derive(character(input(WIZARD_ID, [
      { classId: independentClass.id, level: 2 },
      { classId: WIZARD_ID, level: 2 },
    ], registry)), registry);
    const independent = provider(state, independentProvider.id);

    expect(state.ordinaryMulticlassCasterLevel).toBe(2);
    expect(independent.multiclassSlotContribution).toEqual({ kind: 'independent' });
    expect(independent.slotPool?.id).toBe('homebrew:m14-d1:spell-slot-pool:independent');
    expect(independent.slotPool?.id).not.toBe(MULTICLASS_ORDINARY_SLOT_POOL_ID);
    expect(state.resources.some((resource) => resource.id === 'homebrew:m14-d1:spell-slot:independent:1')).toBe(true);
  });

  it('H activates providers from owner level only, never total Character-level inflation', () => {
    const delayedProvider = syntheticProvider('delayed', { kind: 'spellcasting', contribution: 'full' }, { featureLevel: 3 });
    const delayedClass = syntheticClass('delayed', delayedProvider, 3);
    const registry = new ContentRegistry(SRD_CONTENT, [delayedClass]);
    const state = derive(character(input(FIGHTER_ID, [
      { classId: FIGHTER_ID, level: 5 },
      { classId: delayedClass.id, level: 2 },
    ], registry)), registry);

    expect(state.level).toBe(7);
    expect(state.spellcasting.some((entry) => entry.id === delayedProvider.id)).toBe(false);
    expect(state.ordinaryMulticlassCasterLevel).toBeUndefined();
    expect(state.ordinaryMulticlassSlotPool).toBeUndefined();
  });

  it('I keeps provider-specific casting abilities and uses total-level PB for each attack/save calculation', () => {
    const state = derive(character(input(CLERIC_ID, [
      { classId: CLERIC_ID, level: 3 },
      { classId: WIZARD_ID, level: 2 },
    ])));
    const cleric = provider(state, CLERIC_PROVIDER_ID);
    const wizard = provider(state, WIZARD_PROVIDER_ID);

    expect(cleric.ability).toBe('wisdom');
    expect(wizard.ability).toBe('intelligence');
    expect(cleric.attackModifier).toBe(state.proficiencyBonus + state.abilityModifiers.wisdom);
    expect(cleric.saveDc).toBe(8 + state.proficiencyBonus + state.abilityModifiers.wisdom);
    expect(wizard.attackModifier).toBe(state.proficiencyBonus + state.abilityModifiers.intelligence);
    expect(wizard.saveDc).toBe(8 + state.proficiencyBonus + state.abilityModifiers.intelligence);
    expect(cleric.attackModifier).not.toBe(wizard.attackModifier);
  });

  it('J is invariant to classProgressions reorder for providers, ownership, contribution, and shared slots', () => {
    const normal = derive(character(input(CLERIC_ID, [
      { classId: CLERIC_ID, level: 3 },
      { classId: WIZARD_ID, level: 2 },
    ], contentRegistry, 'normal'), 'd1-order'));
    const reversed = derive(character(input(CLERIC_ID, [
      { classId: CLERIC_ID, level: 3 },
      { classId: WIZARD_ID, level: 2 },
    ], contentRegistry, 'reversed'), 'd1-order'));

    const summary = (state: ReturnType<typeof derive>) => ({
      casterLevel: state.ordinaryMulticlassCasterLevel,
      slots: state.ordinaryMulticlassSlotPool,
      providers: state.spellcasting.map((entry) => ({
        id: entry.id,
        owner: entry.owner,
        ability: entry.ability,
        contribution: entry.multiclassSlotContribution,
        slotPool: entry.slotPool,
      })),
    });
    expect(summary(reversed)).toEqual(summary(normal));
  });

  it('K startingClassId reversal changes no spellcasting owner/contribution semantics', () => {
    const clericStart = derive(character(input(CLERIC_ID, [
      { classId: CLERIC_ID, level: 3 },
      { classId: WIZARD_ID, level: 2 },
    ]), 'd1-cleric-start'));
    const wizardStart = derive(character(input(WIZARD_ID, [
      { classId: CLERIC_ID, level: 3 },
      { classId: WIZARD_ID, level: 2 },
    ]), 'd1-wizard-start'));

    const spellSummary = (state: ReturnType<typeof derive>) => ({
      casterLevel: state.ordinaryMulticlassCasterLevel,
      slots: state.ordinaryMulticlassSlotPool,
      providers: state.spellcasting.map((entry) => ({
        id: entry.id,
        owner: entry.owner,
        ability: entry.ability,
        contribution: entry.multiclassSlotContribution,
      })),
    });
    expect(spellSummary(wizardStart)).toEqual(spellSummary(clericStart));
    expect(wizardStart.startingClassId).toBe(WIZARD_ID);
    expect(clericStart.startingClassId).toBe(CLERIC_ID);
  });

  it('L preserves single-class Wizard provider, slots, ability, and provider-local identity', () => {
    const state = derive(character(input(WIZARD_ID, [{ classId: WIZARD_ID, level: 5 }])));
    const wizard = provider(state, WIZARD_PROVIDER_ID);
    expect(state.ordinaryMulticlassCasterLevel).toBeUndefined();
    expect(state.ordinaryMulticlassSlotPool).toBeUndefined();
    expect(wizard).toMatchObject({
      owner: { kind: 'class', classId: WIZARD_ID, level: 5 },
      ability: 'intelligence',
      slotPool: { id: srdId('spell-slot-pool', 'wizard') },
    });
    expect(wizard.slotPool?.slots.map((slot) => [slot.spellLevel, slot.maximumUses])).toEqual([[1, 4], [2, 3], [3, 2]]);
  });

  it('M preserves single-class Paladin half-caster slots instead of applying multiclass half-up rounding', () => {
    const state = derive(character(input(PALADIN_ID, [{ classId: PALADIN_ID, level: 3 }])));
    const paladin = provider(state, PALADIN_PROVIDER_ID);
    expect(state.ordinaryMulticlassCasterLevel).toBeUndefined();
    expect(state.ordinaryMulticlassSlotPool).toBeUndefined();
    expect(paladin.slotPool?.id).toBe(srdId('spell-slot-pool', 'paladin'));
    expect(paladin.slotPool?.slots.map((slot) => [slot.spellLevel, slot.maximumUses])).toEqual([[1, 3]]);
    expect(paladin.multiclassSlotContribution).toEqual({ kind: 'spellcasting', contribution: 'half', rounding: 'up' });
  });

  it('N preserves single-class Warlock Pact slots and recovery without ordinary multiclass state', () => {
    const state = derive(character(input(WARLOCK_ID, [{ classId: WARLOCK_ID, level: 3 }])));
    const warlock = provider(state, WARLOCK_PROVIDER_ID);
    expect(state.ordinaryMulticlassCasterLevel).toBeUndefined();
    expect(state.ordinaryMulticlassSlotPool).toBeUndefined();
    expect(warlock.slotPool).toMatchObject({
      id: srdId('spell-slot-pool', 'warlock:pact-magic'),
      recovery: [{ trigger: 'short-rest', mode: 'all' }, { trigger: 'long-rest', mode: 'all' }],
      slots: [{ spellLevel: 2, resourceId: srdId('spell-slot', 'warlock:pact-magic:2'), maximumUses: 2 }],
    });
  });

  it('O resolves shared ordinary slots directly from the authoritative M14-A table', () => {
    const state = derive(character(input(CLERIC_ID, [
      { classId: CLERIC_ID, level: 3 },
      { classId: WIZARD_ID, level: 2 },
    ])));
    const authoritative = MULTICLASS_SPELLCASTER_SLOT_PROGRESSION.find((row) => row.level === state.ordinaryMulticlassCasterLevel);
    expect(authoritative).toBeDefined();
    expect(state.ordinaryMulticlassSlotPool?.slots.map(({ spellLevel, maximumUses }) => ({ spellLevel, maximum: maximumUses })))
      .toEqual(authoritative?.slots);
  });

  it('P keeps a subclass-owned provider tied to its parent progression level and subclass identity', () => {
    const subclassProvider = syntheticProvider('subclass-independent', { kind: 'independent' }, { independentPool: true });
    const subclassId = 'homebrew:m14-d1:subclass:fighter-caster';
    const subclass: SubclassContent = {
      id: subclassId,
      kind: 'subclass',
      name: 'Fighter Caster',
      source: SOURCE,
      parentClassId: FIGHTER_ID,
      acquisitionLevel: 3,
      description: 'Synthetic subclass provider provenance fixture.',
      progression: [{
        level: 3,
        features: [{
          id: 'homebrew:m14-d1:subclass-feature:fighter-caster:spellcasting',
          name: 'Subclass Casting',
          description: 'Synthetic subclass provider.',
          effects: [],
          spellcasting: [subclassProvider],
          referenceEffects: [],
        }],
      }],
    };
    const registry = new ContentRegistry(SRD_CONTENT, [subclass]);
    const state = derive(character(input(FIGHTER_ID, [
      { classId: FIGHTER_ID, level: 3, subclassId },
      { classId: WARLOCK_ID, level: 1 },
    ], registry)), registry);
    expect(provider(state, subclassProvider.id).owner).toEqual({
      kind: 'subclass',
      level: 3,
      classId: FIGHTER_ID,
      className: 'Fighter',
      subclassId,
      subclassName: 'Fighter Caster',
    });
  });

  it('Q initializes canonical shared resources and preserves spent state through generic reconciliation', () => {
    const level5 = derive(character(input(CLERIC_ID, [
      { classId: CLERIC_ID, level: 3 },
      { classId: WIZARD_ID, level: 2 },
    ]), 'd1-play-state-5'));
    const level6 = derive(character(input(CLERIC_ID, [
      { classId: CLERIC_ID, level: 4 },
      { classId: WIZARD_ID, level: 2 },
    ]), 'd1-play-state-6'));
    const level1Id = multiclassOrdinarySpellSlotResourceId(1);
    const level3Id = multiclassOrdinarySpellSlotResourceId(3);
    const firstContext = { health: level5.health, resources: level5.resources };
    const nextContext = { health: level6.health, resources: level6.resources };
    const initialized = initializePlayState(firstContext);
    expect(initialized.resourceUses[level1Id]).toBe(4);
    expect(initialized.resourceUses[level3Id]).toBe(2);

    const spent = expendResource(initialized, level1Id, level5.resources);
    if (!spent.ok) throw new Error(spent.error.message);
    const reconciled = reconcilePlayState(spent.value, firstContext, nextContext);
    expect(reconciled.resourceUses[level1Id]).toBe(3);
    expect(reconciled.resourceUses[level3Id]).toBe(2);
  });
});
