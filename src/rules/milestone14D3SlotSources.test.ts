import { beforeEach, describe, expect, it } from 'vitest';
import { SRD_CONTENT, srdId } from '../content/srd';
import {
  SKILL_IDS,
  type AbilityScores,
  type Character,
  type CharacterClassProgression,
  type CharacterInput,
  type CharacterSpellcastingSelection,
  type SkillId,
} from '../models/character';
import type { ClassContent, SpellcastingProviderDefinition } from '../models/content';
import type { ContentId } from '../models/contentId';
import { createFixedHpProgression } from './health';
import {
  MULTICLASS_ORDINARY_SLOT_POOL_ID,
  resolveLegalSpellSlotSources,
  resolveSpellSlotResource,
  resolveSpellcastingProviderSpell,
  spellBelongsToProviderList,
  spellcastingCountAtLevel,
  spellcastingProviderDefinitionsAtLevel,
  maximumSelectableSpellLevel,
} from './spellcasting';
import type { DerivedCharacterState, DerivedSpellSlotSource } from './types';
import { deriveCharacterState } from './deriveCharacter';
import { ContentRegistry, contentRegistry } from '../services/contentRegistry';
import {
  finishCharacterLongRest,
  finishCharacterShortRest,
  spendCharacterSpellSlot,
} from '../services/characterPlayState';
import { createCharacter, getCharacterById } from '../services/characterStorage';
import { rollSpellAttack } from '../services/spellRolls';
import { fighterInput } from '../test/fixtures';

const FIGHTER_ID = srdId('class', 'fighter');
const CLERIC_ID = srdId('class', 'cleric');
const WIZARD_ID = srdId('class', 'wizard');
const SORCERER_ID = srdId('class', 'sorcerer');
const WARLOCK_ID = srdId('class', 'warlock');

const CHAMPION_ID = srdId('subclass', 'fighter:champion');
const LIFE_DOMAIN_ID = srdId('subclass', 'cleric:life-domain');
const EVOKER_ID = srdId('subclass', 'wizard:evoker');
const FIEND_PATRON_ID = srdId('subclass', 'warlock:fiend-patron');

const CLERIC_PROVIDER_ID = srdId('spellcasting-provider', 'cleric:spellcasting');
const WIZARD_PROVIDER_ID = srdId('spellcasting-provider', 'wizard:spellcasting');
const SORCERER_PROVIDER_ID = srdId('spellcasting-provider', 'sorcerer:spellcasting');
const WARLOCK_PROVIDER_ID = srdId('spellcasting-provider', 'warlock:pact-magic');

const FIRE_BOLT_ID = srdId('spell', 'fire-bolt');
const SOURCE = { type: 'homebrew', namespace: 'm14-d3' } as const;

const QUALIFYING_SCORES: Partial<AbilityScores> = {
  strength: 14,
  dexterity: 14,
  constitution: 14,
  intelligence: 16,
  wisdom: 14,
  charisma: 14,
};

interface ProgressionInput {
  readonly classId: ContentId;
  readonly level: number;
  readonly subclassId?: ContentId;
}

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

function buildInput(
  startingClassId: ContentId,
  entries: readonly ProgressionInput[],
  spellcastingSelections: CharacterSpellcastingSelection[],
  registry: ContentRegistry = contentRegistry,
  order: 'normal' | 'reversed' = 'normal',
  abilityScores: Partial<AbilityScores> = QUALIFYING_SCORES,
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
    abilityScores,
    inventory: [],
    spellcastingSelections,
  });
}

function derive(character: Character, registry: ContentRegistry = contentRegistry): DerivedCharacterState {
  const result = deriveCharacterState(character, registry);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function providerDefinition(
  classId: ContentId,
  ownerLevel: number,
  providerId: ContentId,
  registry: ContentRegistry = contentRegistry,
  subclassId?: ContentId,
): SpellcastingProviderDefinition {
  const classContent = registry.findClass(classId);
  if (!classContent) throw new Error(`Missing class fixture: ${classId}`);
  const subclass = subclassId ? registry.findSubclass(subclassId) : undefined;
  const provider = spellcastingProviderDefinitionsAtLevel(classContent, subclass, ownerLevel)
    .find((candidate) => candidate.id === providerId);
  if (!provider) throw new Error(`Missing provider ${providerId} at owner level ${ownerLevel}`);
  return provider;
}

function spellsOnList(
  spellListId: string,
  predicate: (level: number) => boolean,
  registry: ContentRegistry = contentRegistry,
) {
  return registry.getAll('spell').filter(
    (spell) => spellBelongsToProviderList(spell, spellListId) && predicate(spell.level),
  );
}

function ensureCount<T>(values: readonly T[], count: number, label: string): T[] {
  if (values.length < count) throw new Error(`Insufficient ${label}: need ${count}, found ${values.length}`);
  return [...values.slice(0, count)];
}

function selectionFor(
  definition: SpellcastingProviderDefinition,
  ownerLevel: number,
  registry: ContentRegistry = contentRegistry,
): CharacterSpellcastingSelection {
  const management = definition.spellManagement;
  if (management.kind === 'granted-only') {
    return { providerId: definition.id, cantripIds: [], ownedSpellIds: [], preparedSpellIds: [] };
  }

  const cantripCount = spellcastingCountAtLevel(management.cantripCount, ownerLevel);
  const cantripIds = ensureCount(
    spellsOnList(management.spellListId, (level) => level === 0, registry).map((spell) => spell.id),
    cantripCount,
    `${definition.name} cantrips`,
  );
  const maximumSpellLevel = maximumSelectableSpellLevel(definition, ownerLevel);
  const preparedLimit = spellcastingCountAtLevel(management.preparedSpellCount, ownerLevel);

  if (management.kind === 'prepared-from-list') {
    const eligible = spellsOnList(
      management.spellListId,
      (level) => level > 0 && level <= maximumSpellLevel,
      registry,
    ).map((spell) => spell.id);
    return {
      providerId: definition.id,
      cantripIds,
      ownedSpellIds: [],
      preparedSpellIds: eligible.slice(0, Math.min(2, preparedLimit)),
    };
  }

  const ownedSpellIds = ensureCount(
    spellsOnList(
      management.spellListId,
      (level) => level === management.initialOwnedSpellLevel && level <= maximumSpellLevel,
      registry,
    ).map((spell) => spell.id),
    management.initialOwnedSpellCount,
    `${definition.name} initial owned spells`,
  );
  return {
    providerId: definition.id,
    cantripIds,
    ownedSpellIds,
    preparedSpellIds: ownedSpellIds.slice(0, Math.min(2, preparedLimit)),
  };
}

function includeCantripAtFixedCount(selection: CharacterSpellcastingSelection, spellId: ContentId): CharacterSpellcastingSelection {
  if (selection.cantripIds.includes(spellId)) return selection;
  return { ...selection, cantripIds: [spellId, ...selection.cantripIds.slice(0, -1)] };
}

function includePreparedSpell(
  selection: CharacterSpellcastingSelection,
  spellId: ContentId,
  owned: boolean,
): CharacterSpellcastingSelection {
  return {
    ...selection,
    ownedSpellIds: owned && !selection.ownedSpellIds.includes(spellId)
      ? [...selection.ownedSpellIds, spellId]
      : [...selection.ownedSpellIds],
    preparedSpellIds: selection.preparedSpellIds.includes(spellId)
      ? [...selection.preparedSpellIds]
      : [spellId, ...selection.preparedSpellIds],
  };
}

function spellIdOnList(spellListId: string, level: number, registry: ContentRegistry = contentRegistry): ContentId {
  const spell = spellsOnList(spellListId, (candidateLevel) => candidateLevel === level, registry)[0];
  if (!spell) throw new Error(`Missing level ${level} spell on ${spellListId} list.`);
  return spell.id;
}

function legalSources(
  state: DerivedCharacterState,
  providerId: ContentId,
  spellId: ContentId,
  slotLevel?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
): readonly DerivedSpellSlotSource[] {
  const result = resolveLegalSpellSlotSources(state, providerId, spellId, slotLevel);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function source(
  state: DerivedCharacterState,
  providerId: ContentId,
  spellId: ContentId,
  kind: DerivedSpellSlotSource['kind'],
  slotLevel: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
): DerivedSpellSlotSource {
  const candidate = legalSources(state, providerId, spellId, slotLevel).find((entry) => entry.kind === kind);
  if (!candidate) throw new Error(`Missing ${kind} level-${slotLevel} source for ${spellId}.`);
  return candidate;
}

function currentCharacter(id: string, registry: ContentRegistry = contentRegistry): Character {
  const found = getCharacterById(id, window.localStorage, registry);
  if (!found) throw new Error(`Missing persisted Character: ${id}`);
  return found;
}

function expectOnlyResourceChanged(
  before: Readonly<Record<string, number>>,
  after: Readonly<Record<string, number>>,
  resourceId: ContentId,
  delta: number,
) {
  expect(after[resourceId]).toBe((before[resourceId] ?? 0) + delta);
  for (const [id, value] of Object.entries(before)) {
    if (id !== resourceId) expect(after[id]).toBe(value);
  }
}

function clericWizardFixture(
  startingClassId: typeof CLERIC_ID | typeof WIZARD_ID = CLERIC_ID,
  order: 'normal' | 'reversed' = 'normal',
) {
  const cleric = providerDefinition(CLERIC_ID, 3, CLERIC_PROVIDER_ID, contentRegistry, LIFE_DOMAIN_ID);
  const wizard = providerDefinition(WIZARD_ID, 2, WIZARD_PROVIDER_ID);
  const clericSpellId = spellIdOnList('cleric', 1);
  const wizardSpellId = spellIdOnList('wizard', 1);
  const clericSelection = includePreparedSpell(selectionFor(cleric, 3), clericSpellId, false);
  const wizardSelection = includePreparedSpell(selectionFor(wizard, 2), wizardSpellId, true);
  const input = buildInput(
    startingClassId,
    [
      { classId: CLERIC_ID, level: 3, subclassId: LIFE_DOMAIN_ID },
      { classId: WIZARD_ID, level: 2 },
    ],
    [clericSelection, wizardSelection],
    contentRegistry,
    order,
  );
  return { input, clericSpellId, wizardSpellId };
}

function wizardWarlockFixture(
  startingClassId: typeof WIZARD_ID | typeof WARLOCK_ID = WIZARD_ID,
  order: 'normal' | 'reversed' = 'normal',
  wizardLevel = 4,
) {
  const wizard = providerDefinition(WIZARD_ID, wizardLevel, WIZARD_PROVIDER_ID, contentRegistry, EVOKER_ID);
  const warlock = providerDefinition(WARLOCK_ID, 3, WARLOCK_PROVIDER_ID, contentRegistry, FIEND_PATRON_ID);
  const wizardSpellId = spellIdOnList('wizard', 1);
  const warlockSpellId = spellIdOnList('warlock', 1);
  const wizardSelection = includePreparedSpell(selectionFor(wizard, wizardLevel), wizardSpellId, true);
  const warlockSelection = includePreparedSpell(selectionFor(warlock, 3), warlockSpellId, false);
  const input = buildInput(
    startingClassId,
    [
      { classId: WIZARD_ID, level: wizardLevel, subclassId: EVOKER_ID },
      { classId: WARLOCK_ID, level: 3, subclassId: FIEND_PATRON_ID },
    ],
    [wizardSelection, warlockSelection],
    contentRegistry,
    order,
  );
  return { input, wizardSpellId, warlockSpellId, wizardSelection, warlockSelection };
}

function dieValue(value: number, die: number) {
  return () => (value - 1) / die;
}

function proficiencyBonus(level: number): number {
  return level >= 17 ? 6 : level >= 13 ? 5 : level >= 9 ? 4 : level >= 5 ? 3 : 2;
}

function independentClass(spellId: ContentId): { readonly classContent: ClassContent; readonly provider: SpellcastingProviderDefinition } {
  const provider: SpellcastingProviderDefinition = {
    id: 'homebrew:m14-d3:spellcasting-provider:independent',
    name: 'Independent Casting',
    spellcastingAbility: { kind: 'fixed', ability: 'intelligence' },
    multiclassSlotContribution: { kind: 'independent' },
    spellManagement: { kind: 'granted-only', spellIds: [spellId] },
    slotPool: {
      id: 'homebrew:m14-d3:spell-slot-pool:independent',
      name: 'Independent Slots',
      slotLevels: [
        { spellLevel: 1, resourceId: 'homebrew:m14-d3:spell-slot:independent:1', name: 'Level 1 Independent Slots' },
        { spellLevel: 2, resourceId: 'homebrew:m14-d3:spell-slot:independent:2', name: 'Level 2 Independent Slots' },
      ],
      progression: [
        { level: 1, slots: [{ spellLevel: 1, maximum: 2 }] },
        { level: 3, slots: [{ spellLevel: 1, maximum: 2 }, { spellLevel: 2, maximum: 1 }] },
      ],
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
    ritualCasting: 'none',
  };
  const classId = 'homebrew:m14-d3:class:independent-adept';
  const classContent: ClassContent = {
    id: classId,
    kind: 'class',
    name: 'Independent Adept',
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
        proficiencyBonus: proficiencyBonus(level),
        features: level === 1 ? [{
          id: 'homebrew:m14-d3:class-feature:independent-spellcasting',
          name: 'Independent Spellcasting',
          description: 'Synthetic D3 independent provider.',
          effects: [],
          spellcasting: [provider],
          referenceEffects: [],
        }] : [],
      };
    }),
    resources: [],
  };
  return { classContent, provider };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('Milestone 14-D3 explicit spell slot-source interoperability and multiclass casting runtime', () => {
  it('A Cleric3/Wizard2 keeps a Wizard spell on the Wizard provider while shared ordinary slots pay', () => {
    const fixture = clericWizardFixture();
    const character = createCharacter(fixture.input);
    const state = derive(character);
    const wizard = resolveSpellcastingProviderSpell(state, WIZARD_PROVIDER_ID, fixture.wizardSpellId);
    expect(wizard.ok && wizard.value.provider.ability).toBe('intelligence');
    expect(state.ordinaryMulticlassSlotPool?.id).toBe(MULTICLASS_ORDINARY_SLOT_POOL_ID);

    const ordinary = source(state, WIZARD_PROVIDER_ID, fixture.wizardSpellId, 'ordinary', 1);
    const before = { ...character.playState.resourceUses };
    const spent = spendCharacterSpellSlot(character.id, WIZARD_PROVIDER_ID, fixture.wizardSpellId, 1, ordinary);
    expect(spent.ok).toBe(true);
    if (!spent.ok) throw new Error(spent.error.message);
    expectOnlyResourceChanged(before, spent.value.playState.resourceUses, ordinary.resourceId, -1);

    expect(resolveLegalSpellSlotSources(state, WIZARD_PROVIDER_ID, srdId('spell', 'fireball'), 3))
      .toMatchObject({ ok: false, error: { code: 'missing-spell' } });
  });

  it('B Cleric3/Wizard2 keeps a Cleric spell on the Cleric provider while the same shared pool pays', () => {
    const fixture = clericWizardFixture();
    const character = createCharacter(fixture.input);
    const state = derive(character);
    const cleric = resolveSpellcastingProviderSpell(state, CLERIC_PROVIDER_ID, fixture.clericSpellId);
    expect(cleric.ok && cleric.value.provider.ability).toBe('wisdom');

    const ordinary = source(state, CLERIC_PROVIDER_ID, fixture.clericSpellId, 'ordinary', 1);
    expect(ordinary.slotPoolId).toBe(MULTICLASS_ORDINARY_SLOT_POOL_ID);
    const spent = spendCharacterSpellSlot(character.id, CLERIC_PROVIDER_ID, fixture.clericSpellId, 1, ordinary);
    expect(spent).toMatchObject({ ok: true });
  });

  it('C Wizard4/Warlock3 casts a Wizard spell through an explicitly selected ordinary source only', () => {
    const fixture = wizardWarlockFixture();
    const character = createCharacter(fixture.input);
    const state = derive(character);
    const ordinary = source(state, WIZARD_PROVIDER_ID, fixture.wizardSpellId, 'ordinary', 2);
    const pact = source(state, WIZARD_PROVIDER_ID, fixture.wizardSpellId, 'pact', 2);
    const before = { ...character.playState.resourceUses };

    const spent = spendCharacterSpellSlot(character.id, WIZARD_PROVIDER_ID, fixture.wizardSpellId, 2, ordinary);
    expect(spent.ok).toBe(true);
    if (!spent.ok) throw new Error(spent.error.message);
    expect(spent.value.playState.resourceUses[ordinary.resourceId]).toBe(before[ordinary.resourceId] - 1);
    expect(spent.value.playState.resourceUses[pact.resourceId]).toBe(before[pact.resourceId]);
    expect(resolveSpellcastingProviderSpell(derive(spent.value), WIZARD_PROVIDER_ID, fixture.wizardSpellId))
      .toMatchObject({ ok: true, value: { provider: { ability: 'intelligence' } } });
  });

  it('D Wizard4/Warlock3 casts a Wizard spell through an explicitly selected Pact source without changing provider', () => {
    const fixture = wizardWarlockFixture();
    const character = createCharacter(fixture.input);
    const state = derive(character);
    const ordinary = source(state, WIZARD_PROVIDER_ID, fixture.wizardSpellId, 'ordinary', 2);
    const pact = source(state, WIZARD_PROVIDER_ID, fixture.wizardSpellId, 'pact', 2);
    const before = { ...character.playState.resourceUses };

    const spent = spendCharacterSpellSlot(character.id, WIZARD_PROVIDER_ID, fixture.wizardSpellId, 2, pact);
    expect(spent.ok).toBe(true);
    if (!spent.ok) throw new Error(spent.error.message);
    expect(spent.value.playState.resourceUses[pact.resourceId]).toBe(before[pact.resourceId] - 1);
    expect(spent.value.playState.resourceUses[ordinary.resourceId]).toBe(before[ordinary.resourceId]);
    expect(resolveSpellcastingProviderSpell(derive(spent.value), WIZARD_PROVIDER_ID, fixture.wizardSpellId))
      .toMatchObject({ ok: true, value: { provider: { id: WIZARD_PROVIDER_ID, ability: 'intelligence' } } });
  });

  it('E Wizard4/Warlock3 casts a Warlock spell through Pact while provider remains Warlock/Charisma', () => {
    const fixture = wizardWarlockFixture();
    const character = createCharacter(fixture.input);
    const state = derive(character);
    const pact = source(state, WARLOCK_PROVIDER_ID, fixture.warlockSpellId, 'pact', 2);
    const spent = spendCharacterSpellSlot(character.id, WARLOCK_PROVIDER_ID, fixture.warlockSpellId, 2, pact);
    expect(spent.ok).toBe(true);
    if (!spent.ok) throw new Error(spent.error.message);
    expect(resolveSpellcastingProviderSpell(derive(spent.value), WARLOCK_PROVIDER_ID, fixture.warlockSpellId))
      .toMatchObject({ ok: true, value: { provider: { id: WARLOCK_PROVIDER_ID, ability: 'charisma' } } });
  });

  it('F Wizard4/Warlock3 casts a Warlock spell through ordinary slots while provider remains Warlock/Charisma', () => {
    const fixture = wizardWarlockFixture();
    const character = createCharacter(fixture.input);
    const state = derive(character);
    const ordinary = source(state, WARLOCK_PROVIDER_ID, fixture.warlockSpellId, 'ordinary', 2);
    const pact = source(state, WARLOCK_PROVIDER_ID, fixture.warlockSpellId, 'pact', 2);
    const before = { ...character.playState.resourceUses };

    const spent = spendCharacterSpellSlot(character.id, WARLOCK_PROVIDER_ID, fixture.warlockSpellId, 2, ordinary);
    expect(spent.ok).toBe(true);
    if (!spent.ok) throw new Error(spent.error.message);
    expect(spent.value.playState.resourceUses[ordinary.resourceId]).toBe(before[ordinary.resourceId] - 1);
    expect(spent.value.playState.resourceUses[pact.resourceId]).toBe(before[pact.resourceId]);
    expect(resolveSpellcastingProviderSpell(derive(spent.value), WARLOCK_PROVIDER_ID, fixture.warlockSpellId))
      .toMatchObject({ ok: true, value: { provider: { ability: 'charisma' } } });
  });

  it('G fails explicitly when ordinary and Pact sources are both legal and no source is supplied', () => {
    const fixture = wizardWarlockFixture();
    const character = createCharacter(fixture.input);
    const before = { ...character.playState.resourceUses };
    const failed = spendCharacterSpellSlot(character.id, WIZARD_PROVIDER_ID, fixture.wizardSpellId, 2);
    expect(failed).toMatchObject({ ok: false, error: { code: 'ambiguous-spell-slot-source' } });
    expect(currentCharacter(character.id).playState.resourceUses).toEqual(before);
  });

  it('H respects Pact slot level: Warlock3 level-2 Pact pays level-1 spells but not level-3 spells', () => {
    const level4 = wizardWarlockFixture(WIZARD_ID, 'normal', 4);
    const character4 = createCharacter(level4.input);
    const state4 = derive(character4);
    const pact2 = source(state4, WIZARD_PROVIDER_ID, level4.wizardSpellId, 'pact', 2);
    expect(resolveSpellSlotResource(state4, WIZARD_PROVIDER_ID, level4.wizardSpellId, 2, pact2))
      .toMatchObject({ ok: true, value: { kind: 'pact', spellLevel: 2, resourceId: pact2.resourceId } });

    window.localStorage.clear();
    const level5Base = wizardWarlockFixture(WIZARD_ID, 'normal', 5);
    const wizard3SpellId = spellIdOnList('wizard', 3);
    const wizardSelection = includePreparedSpell(level5Base.wizardSelection, wizard3SpellId, true);
    const input = buildInput(
      WIZARD_ID,
      [
        { classId: WIZARD_ID, level: 5, subclassId: EVOKER_ID },
        { classId: WARLOCK_ID, level: 3, subclassId: FIEND_PATRON_ID },
      ],
      [wizardSelection, level5Base.warlockSelection],
    );
    const character5 = createCharacter(input);
    const state5 = derive(character5);
    const pactProvider = state5.spellcasting.find((entry) => entry.id === WARLOCK_PROVIDER_ID);
    const pactSlot = pactProvider?.slotPool?.slots[0];
    if (!pactProvider?.slotPool || !pactSlot) throw new Error('Missing Warlock3 Pact slot.');
    const illegalPact = { slotPoolId: pactProvider.slotPool.id, resourceId: pactSlot.resourceId, spellLevel: pactSlot.spellLevel };
    expect(resolveSpellSlotResource(state5, WIZARD_PROVIDER_ID, wizard3SpellId, 2, illegalPact))
      .toMatchObject({ ok: false, error: { code: 'invalid-spell-slot' } });
  });

  it('I spends an explicitly selected higher-level ordinary slot for a lower-level spell', () => {
    const fixture = clericWizardFixture();
    const character = createCharacter(fixture.input);
    const state = derive(character);
    const ordinary3 = source(state, WIZARD_PROVIDER_ID, fixture.wizardSpellId, 'ordinary', 3);
    const before = character.playState.resourceUses[ordinary3.resourceId];

    const spent = spendCharacterSpellSlot(character.id, WIZARD_PROVIDER_ID, fixture.wizardSpellId, 3, ordinary3);
    expect(spent).toMatchObject({ ok: true });
    if (!spent.ok) throw new Error(spent.error.message);
    expect(spent.value.playState.resourceUses[ordinary3.resourceId]).toBe(before - 1);
  });

  it('J rejects a below-level slot and spends nothing', () => {
    const base = wizardWarlockFixture();
    const wizard2SpellId = spellIdOnList('wizard', 2);
    const wizardSelection = includePreparedSpell(base.wizardSelection, wizard2SpellId, true);
    const input = buildInput(
      WIZARD_ID,
      [
        { classId: WIZARD_ID, level: 4, subclassId: EVOKER_ID },
        { classId: WARLOCK_ID, level: 3, subclassId: FIEND_PATRON_ID },
      ],
      [wizardSelection, base.warlockSelection],
    );
    const character = createCharacter(input);
    const state = derive(character);
    const ordinaryProvider = state.spellcasting.find((entry) => entry.id === WIZARD_PROVIDER_ID);
    const level1 = ordinaryProvider?.slotPool?.slots.find((slot) => slot.spellLevel === 1);
    if (!ordinaryProvider?.slotPool || !level1) throw new Error('Missing ordinary level-1 slot.');
    const invalidSource = { slotPoolId: ordinaryProvider.slotPool.id, resourceId: level1.resourceId, spellLevel: level1.spellLevel };
    const before = { ...character.playState.resourceUses };

    const failed = spendCharacterSpellSlot(character.id, WIZARD_PROVIDER_ID, wizard2SpellId, 1, invalidSource);
    expect(failed).toMatchObject({ ok: false, error: { code: 'invalid-spell-slot' } });
    expect(currentCharacter(character.id).playState.resourceUses).toEqual(before);
  });

  it('K lets existing resource depletion semantics reject a zero-remaining selected source without touching another pool', () => {
    const fixture = wizardWarlockFixture();
    const character = createCharacter(fixture.input);
    const state = derive(character);
    const ordinary = source(state, WIZARD_PROVIDER_ID, fixture.wizardSpellId, 'ordinary', 2);
    const pact = source(state, WIZARD_PROVIDER_ID, fixture.wizardSpellId, 'pact', 2);
    const ordinaryBefore = character.playState.resourceUses[ordinary.resourceId];

    expect(spendCharacterSpellSlot(character.id, WIZARD_PROVIDER_ID, fixture.wizardSpellId, 2, pact).ok).toBe(true);
    expect(spendCharacterSpellSlot(character.id, WIZARD_PROVIDER_ID, fixture.wizardSpellId, 2, pact).ok).toBe(true);
    const depleted = spendCharacterSpellSlot(character.id, WIZARD_PROVIDER_ID, fixture.wizardSpellId, 2, pact);
    expect(depleted).toMatchObject({ ok: false, error: { code: 'resource-depleted', contentId: pact.resourceId } });
    expect(currentCharacter(character.id).playState.resourceUses[ordinary.resourceId]).toBe(ordinaryBefore);
  });

  it('L cantrips retain provider context, require no slot source, and spend no resource', () => {
    const wizard = providerDefinition(WIZARD_ID, 4, WIZARD_PROVIDER_ID, contentRegistry, EVOKER_ID);
    const wizardSelection = includeCantripAtFixedCount(selectionFor(wizard, 4), FIRE_BOLT_ID);
    const input = buildInput(
      WIZARD_ID,
      [{ classId: WIZARD_ID, level: 4, subclassId: EVOKER_ID }],
      [wizardSelection],
    );
    const character = createCharacter(input);
    const state = derive(character);
    const before = { ...character.playState.resourceUses };

    expect(resolveLegalSpellSlotSources(state, WIZARD_PROVIDER_ID, FIRE_BOLT_ID)).toEqual({ ok: true, value: [] });
    const cast = spendCharacterSpellSlot(character.id, WIZARD_PROVIDER_ID, FIRE_BOLT_ID);
    expect(cast.ok).toBe(true);
    if (!cast.ok) throw new Error(cast.error.message);
    expect(cast.value.playState.resourceUses).toEqual(before);
    expect(resolveSpellcastingProviderSpell(derive(cast.value), WIZARD_PROVIDER_ID, FIRE_BOLT_ID))
      .toMatchObject({ ok: true, value: { provider: { ability: 'intelligence' } } });
  });

  it('M same Fire Bolt under Sorcerer and Wizard stays provider-explicit and slot-free', () => {
    const sorcerer = providerDefinition(SORCERER_ID, 1, SORCERER_PROVIDER_ID);
    const wizard = providerDefinition(WIZARD_ID, 1, WIZARD_PROVIDER_ID);
    const sorcererSelection = includeCantripAtFixedCount(selectionFor(sorcerer, 1), FIRE_BOLT_ID);
    const wizardSelection = includeCantripAtFixedCount(selectionFor(wizard, 1), FIRE_BOLT_ID);
    const input = buildInput(
      SORCERER_ID,
      [
        { classId: SORCERER_ID, level: 1 },
        { classId: WIZARD_ID, level: 1 },
      ],
      [sorcererSelection, wizardSelection],
      contentRegistry,
      'normal',
      { ...QUALIFYING_SCORES, intelligence: 16, charisma: 14 },
    );
    const character = createCharacter(input);
    const state = derive(character);

    const sorcererRoll = rollSpellAttack(character, state, SORCERER_PROVIDER_ID, FIRE_BOLT_ID, 'normal', { rng: dieValue(10, 20) });
    const wizardRoll = rollSpellAttack(character, state, WIZARD_PROVIDER_ID, FIRE_BOLT_ID, 'normal', { rng: dieValue(10, 20) });
    expect(sorcererRoll).toMatchObject({ ok: true, value: { roll: { request: { source: { spellcastingProviderId: SORCERER_PROVIDER_ID } } } } });
    expect(wizardRoll).toMatchObject({ ok: true, value: { roll: { request: { source: { spellcastingProviderId: WIZARD_PROVIDER_ID } } } } });
    expect(resolveLegalSpellSlotSources(state, SORCERER_PROVIDER_ID, FIRE_BOLT_ID)).toEqual({ ok: true, value: [] });
    expect(resolveLegalSpellSlotSources(state, WIZARD_PROVIDER_ID, FIRE_BOLT_ID)).toEqual({ ok: true, value: [] });
  });

  it('N independent provider slots pay only that provider and are not offered universally', () => {
    const independentSpellId = spellIdOnList('wizard', 1);
    const fixture = independentClass(independentSpellId);
    const registry = new ContentRegistry(SRD_CONTENT, [fixture.classContent]);
    const wizard = providerDefinition(WIZARD_ID, 2, WIZARD_PROVIDER_ID, registry);
    const wizardSelection = includePreparedSpell(selectionFor(wizard, 2, registry), independentSpellId, true);
    const input = buildInput(
      WIZARD_ID,
      [
        { classId: WIZARD_ID, level: 2 },
        { classId: fixture.classContent.id, level: 2 },
      ],
      [wizardSelection],
      registry,
    );
    const character = createCharacter(input, window.localStorage, registry);
    const state = derive(character, registry);

    const independentSources = legalSources(state, fixture.provider.id, independentSpellId, 1);
    expect(independentSources).toEqual([expect.objectContaining({ kind: 'independent', slotPoolId: fixture.provider.slotPool?.id })]);
    expect(legalSources(state, WIZARD_PROVIDER_ID, independentSpellId, 1).some((entry) => entry.kind === 'independent')).toBe(false);

    const selected = independentSources[0];
    const spent = spendCharacterSpellSlot(
      character.id,
      fixture.provider.id,
      independentSpellId,
      1,
      selected,
      window.localStorage,
      registry,
    );
    expect(spent).toMatchObject({ ok: true });
  });

  it('O Fighter4/Warlock3 fabricates no ordinary source and preserves bounded single-source Pact convenience', () => {
    const warlock = providerDefinition(WARLOCK_ID, 3, WARLOCK_PROVIDER_ID, contentRegistry, FIEND_PATRON_ID);
    const warlockSpellId = spellIdOnList('warlock', 1);
    const warlockSelection = includePreparedSpell(selectionFor(warlock, 3), warlockSpellId, false);
    const input = buildInput(
      FIGHTER_ID,
      [
        { classId: FIGHTER_ID, level: 4, subclassId: CHAMPION_ID },
        { classId: WARLOCK_ID, level: 3, subclassId: FIEND_PATRON_ID },
      ],
      [warlockSelection],
    );
    const character = createCharacter(input);
    const state = derive(character);
    const sources = legalSources(state, WARLOCK_PROVIDER_ID, warlockSpellId, 2);
    expect(state.ordinaryMulticlassSlotPool).toBeUndefined();
    expect(sources).toHaveLength(1);
    expect(sources[0].kind).toBe('pact');

    const spent = spendCharacterSpellSlot(character.id, WARLOCK_PROVIDER_ID, warlockSpellId, 2);
    expect(spent).toMatchObject({ ok: true });
  });

  it('P single-class Wizard preserves ordinary pool behavior without requiring a source when one level is requested', () => {
    const wizard = providerDefinition(WIZARD_ID, 4, WIZARD_PROVIDER_ID, contentRegistry, EVOKER_ID);
    const wizardSpellId = spellIdOnList('wizard', 1);
    const selection = includePreparedSpell(selectionFor(wizard, 4), wizardSpellId, true);
    const character = createCharacter(buildInput(
      WIZARD_ID,
      [{ classId: WIZARD_ID, level: 4, subclassId: EVOKER_ID }],
      [selection],
    ));
    const state = derive(character);
    const sources = legalSources(state, WIZARD_PROVIDER_ID, wizardSpellId, 1);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ kind: 'ordinary', slotPoolId: srdId('spell-slot-pool', 'wizard') });
    expect(spendCharacterSpellSlot(character.id, WIZARD_PROVIDER_ID, wizardSpellId, 1)).toMatchObject({ ok: true });
  });

  it('Q single-class Warlock preserves Pact pool behavior without unnecessary source plumbing', () => {
    const warlock = providerDefinition(WARLOCK_ID, 3, WARLOCK_PROVIDER_ID, contentRegistry, FIEND_PATRON_ID);
    const warlockSpellId = spellIdOnList('warlock', 1);
    const selection = includePreparedSpell(selectionFor(warlock, 3), warlockSpellId, false);
    const character = createCharacter(buildInput(
      WARLOCK_ID,
      [{ classId: WARLOCK_ID, level: 3, subclassId: FIEND_PATRON_ID }],
      [selection],
    ));
    const state = derive(character);
    const sources = legalSources(state, WARLOCK_PROVIDER_ID, warlockSpellId, 2);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ kind: 'pact', slotPoolId: srdId('spell-slot-pool', 'warlock:pact-magic') });
    expect(spendCharacterSpellSlot(character.id, WARLOCK_PROVIDER_ID, warlockSpellId, 2)).toMatchObject({ ok: true });
  });

  it('R preserves Pact Short/Long Rest recovery while ordinary slots remain Long-Rest resources', () => {
    const fixture = wizardWarlockFixture();
    const character = createCharacter(fixture.input);
    const state = derive(character);
    const ordinary = source(state, WIZARD_PROVIDER_ID, fixture.wizardSpellId, 'ordinary', 2);
    const pact = source(state, WIZARD_PROVIDER_ID, fixture.wizardSpellId, 'pact', 2);
    const ordinaryMax = state.resources.find((entry) => entry.id === ordinary.resourceId)?.maximumUses;
    const pactMax = state.resources.find((entry) => entry.id === pact.resourceId)?.maximumUses;
    if (ordinaryMax === undefined || pactMax === undefined) throw new Error('Missing slot resources.');

    expect(spendCharacterSpellSlot(character.id, WIZARD_PROVIDER_ID, fixture.wizardSpellId, 2, ordinary).ok).toBe(true);
    expect(spendCharacterSpellSlot(character.id, WIZARD_PROVIDER_ID, fixture.wizardSpellId, 2, pact).ok).toBe(true);

    const shortRest = finishCharacterShortRest(character.id);
    expect(shortRest.ok).toBe(true);
    if (!shortRest.ok) throw new Error(shortRest.error.message);
    expect(shortRest.value.playState.resourceUses[pact.resourceId]).toBe(pactMax);
    expect(shortRest.value.playState.resourceUses[ordinary.resourceId]).toBe(ordinaryMax - 1);

    const longRest = finishCharacterLongRest(character.id);
    expect(longRest.ok).toBe(true);
    if (!longRest.ok) throw new Error(longRest.error.message);
    expect(longRest.value.playState.resourceUses[pact.resourceId]).toBe(pactMax);
    expect(longRest.value.playState.resourceUses[ordinary.resourceId]).toBe(ordinaryMax);
  });

  it('S progression reorder leaves legal slot-source identities and provider ownership invariant', () => {
    const normalFixture = wizardWarlockFixture(WIZARD_ID, 'normal');
    const normal = createCharacter(normalFixture.input);
    const normalState = derive(normal);
    const normalSources = legalSources(normalState, WIZARD_PROVIDER_ID, normalFixture.wizardSpellId, 2);

    window.localStorage.clear();
    const reversedFixture = wizardWarlockFixture(WIZARD_ID, 'reversed');
    const reversed = createCharacter(reversedFixture.input);
    const reversedState = derive(reversed);
    const reversedSources = legalSources(reversedState, WIZARD_PROVIDER_ID, reversedFixture.wizardSpellId, 2);

    expect(reversedSources).toEqual(normalSources);
    expect(reversedState.spellcasting.find((entry) => entry.id === WIZARD_PROVIDER_ID)?.owner)
      .toEqual(normalState.spellcasting.find((entry) => entry.id === WIZARD_PROVIDER_ID)?.owner);
  });

  it('T starting-class reversal does not alter provider identity or legal slot sources', () => {
    const wizardStartFixture = wizardWarlockFixture(WIZARD_ID);
    const wizardStart = createCharacter(wizardStartFixture.input);
    const wizardState = derive(wizardStart);
    const wizardSources = legalSources(wizardState, WIZARD_PROVIDER_ID, wizardStartFixture.wizardSpellId, 2);

    window.localStorage.clear();
    const warlockStartFixture = wizardWarlockFixture(WARLOCK_ID);
    const warlockStart = createCharacter(warlockStartFixture.input);
    const warlockState = derive(warlockStart);
    const warlockSources = legalSources(warlockState, WIZARD_PROVIDER_ID, warlockStartFixture.wizardSpellId, 2);

    expect(warlockSources).toEqual(wizardSources);
    expect(warlockState.spellcasting.find((entry) => entry.id === WIZARD_PROVIDER_ID)?.ability)
      .toBe(wizardState.spellcasting.find((entry) => entry.id === WIZARD_PROVIDER_ID)?.ability);
    expect(warlockState.spellcasting.find((entry) => entry.id === WARLOCK_PROVIDER_ID)?.ability)
      .toBe(wizardState.spellcasting.find((entry) => entry.id === WARLOCK_PROVIDER_ID)?.ability);
  });
});
