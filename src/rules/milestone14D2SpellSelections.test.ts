import { describe, expect, it } from 'vitest';
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
import type { ClassContent, SpellcastingProviderDefinition, SubclassContent } from '../models/content';
import type { ContentId } from '../models/contentId';
import { ContentRegistry, contentRegistry } from '../services/contentRegistry';
import { rollSpellAttack } from '../services/spellRolls';
import { fighterInput } from '../test/fixtures';
import { validateCharacterInput } from '../utils/characterValidation';
import { deriveCharacterState } from './deriveCharacter';
import { createFixedHpProgression } from './health';
import {
  MULTICLASS_ORDINARY_SLOT_POOL_ID,
  maximumSelectableSpellLevel,
  spellBelongsToProviderList,
  spellcastingCountAtLevel,
  spellcastingProviderDefinitionsAtLevel,
} from './spellcasting';

const FIGHTER_ID = srdId('class', 'fighter');
const CLERIC_ID = srdId('class', 'cleric');
const WIZARD_ID = srdId('class', 'wizard');
const SORCERER_ID = srdId('class', 'sorcerer');
const WARLOCK_ID = srdId('class', 'warlock');

const LIFE_DOMAIN_ID = srdId('subclass', 'cleric:life-domain');
const FIEND_PATRON_ID = srdId('subclass', 'warlock:fiend-patron');

const CLERIC_PROVIDER_ID = srdId('spellcasting-provider', 'cleric:spellcasting');
const WIZARD_PROVIDER_ID = srdId('spellcasting-provider', 'wizard:spellcasting');
const SORCERER_PROVIDER_ID = srdId('spellcasting-provider', 'sorcerer:spellcasting');
const WARLOCK_PROVIDER_ID = srdId('spellcasting-provider', 'warlock:pact-magic');

const FIRE_BOLT_ID = srdId('spell', 'fire-bolt');
const SACRED_FLAME_ID = srdId('spell', 'sacred-flame');
const FIREBALL_ID = srdId('spell', 'fireball');

const QUALIFYING_SCORES: Partial<AbilityScores> = {
  strength: 14,
  dexterity: 14,
  constitution: 14,
  intelligence: 14,
  wisdom: 14,
  charisma: 14,
};

const SOURCE = { type: 'homebrew', namespace: 'm14-d2' } as const;

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
    skillExpertise: [],
    weaponMasterySelections: [],
    hpProgression: createFixedHpProgression(level, starting),
  };
}

interface ProgressionInput {
  readonly classId: ContentId;
  readonly level: number;
  readonly subclassId?: ContentId;
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

function character(value: CharacterInput, id = 'm14-d2-character'): Character {
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

function providerDefinition(
  classId: ContentId,
  ownerLevel: number,
  providerId: ContentId,
  registry: ContentRegistry = contentRegistry,
  subclassId?: ContentId,
): SpellcastingProviderDefinition {
  const classContent = registry.findClass(classId);
  if (!classContent) throw new Error(`Missing class: ${classId}`);
  const subclass = subclassId ? registry.findSubclass(subclassId) : undefined;
  const definition = spellcastingProviderDefinitionsAtLevel(classContent, subclass, ownerLevel)
    .find((candidate) => candidate.id === providerId);
  if (!definition) throw new Error(`Missing provider ${providerId} at owner level ${ownerLevel}`);
  return definition;
}

function listSpells(
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

function includeAtFixedCount(ids: readonly ContentId[], requiredId: ContentId): ContentId[] {
  if (ids.includes(requiredId)) return [...ids];
  if (ids.length === 0) return [requiredId];
  return [requiredId, ...ids.slice(0, ids.length - 1)];
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
    listSpells(management.spellListId, (level) => level === 0, registry).map((spell) => spell.id),
    cantripCount,
    `${definition.name} cantrips`,
  );
  const maximumSpellLevel = maximumSelectableSpellLevel(definition, ownerLevel);
  const preparedLimit = spellcastingCountAtLevel(management.preparedSpellCount, ownerLevel);

  if (management.kind === 'prepared-from-list') {
    const eligible = listSpells(
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
    listSpells(
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

function clericWizardSelections() {
  const cleric = providerDefinition(CLERIC_ID, 3, CLERIC_PROVIDER_ID, contentRegistry, LIFE_DOMAIN_ID);
  const wizard = providerDefinition(WIZARD_ID, 2, WIZARD_PROVIDER_ID);
  return {
    cleric,
    wizard,
    clericSelection: selectionFor(cleric, 3),
    wizardSelection: selectionFor(wizard, 2),
  };
}

function clericWizardInput(
  selections?: CharacterSpellcastingSelection[],
  startingClassId: typeof CLERIC_ID | typeof WIZARD_ID = CLERIC_ID,
  order: 'normal' | 'reversed' = 'normal',
) {
  const defaults = clericWizardSelections();
  return buildInput(
    startingClassId,
    [
      { classId: CLERIC_ID, level: 3, subclassId: LIFE_DOMAIN_ID },
      { classId: WIZARD_ID, level: 2 },
    ],
    selections ?? [defaults.clericSelection, defaults.wizardSelection],
    contentRegistry,
    order,
  );
}

function pb(level: number): number {
  return level >= 17 ? 6 : level >= 13 ? 5 : level >= 9 ? 4 : level >= 5 ? 3 : 2;
}

function independentOwnedProvider(id: string): SpellcastingProviderDefinition {
  return {
    id: `homebrew:m14-d2:spellcasting-provider:${id}`,
    name: `${id} Casting`,
    spellcastingAbility: { kind: 'fixed', ability: 'intelligence' },
    multiclassSlotContribution: { kind: 'independent' },
    spellManagement: {
      kind: 'prepared-from-owned',
      spellListId: 'wizard',
      cantripCount: [{ level: 1, count: 1 }],
      preparedSpellCount: [{ level: 1, count: 1 }],
      replacement: 'long-rest-any',
      initialOwnedSpellCount: 2,
      initialOwnedSpellLevel: 1,
    },
    slotPool: {
      id: `homebrew:m14-d2:spell-slot-pool:${id}`,
      name: `${id} Slots`,
      slotLevels: [
        { spellLevel: 1, resourceId: `homebrew:m14-d2:spell-slot:${id}:1`, name: `Level 1 ${id} Slots` },
        { spellLevel: 2, resourceId: `homebrew:m14-d2:spell-slot:${id}:2`, name: `Level 2 ${id} Slots` },
      ],
      progression: [
        { level: 1, slots: [{ spellLevel: 1, maximum: 2 }] },
        { level: 3, slots: [{ spellLevel: 1, maximum: 2 }, { spellLevel: 2, maximum: 1 }] },
      ],
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
    ritualCasting: 'owned',
  };
}

function preparedListProvider(id: string): SpellcastingProviderDefinition {
  return {
    id: `homebrew:m14-d2:spellcasting-provider:${id}`,
    name: `${id} Casting`,
    spellcastingAbility: { kind: 'fixed', ability: 'intelligence' },
    multiclassSlotContribution: { kind: 'independent' },
    spellManagement: {
      kind: 'prepared-from-list',
      spellListId: 'wizard',
      cantripCount: [{ level: 1, count: 1 }],
      preparedSpellCount: [{ level: 1, count: 1 }],
      replacement: 'long-rest-any',
    },
    slotPool: {
      id: `homebrew:m14-d2:spell-slot-pool:${id}`,
      name: `${id} Slots`,
      slotLevels: [
        { spellLevel: 1, resourceId: `homebrew:m14-d2:spell-slot:${id}:1`, name: `Level 1 ${id} Slots` },
        { spellLevel: 2, resourceId: `homebrew:m14-d2:spell-slot:${id}:2`, name: `Level 2 ${id} Slots` },
      ],
      progression: [
        { level: 1, slots: [{ spellLevel: 1, maximum: 2 }] },
        { level: 3, slots: [{ spellLevel: 1, maximum: 2 }, { spellLevel: 2, maximum: 1 }] },
      ],
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
    ritualCasting: 'prepared',
  };
}

function syntheticClass(id: string, provider: SpellcastingProviderDefinition, featureLevel = 1): ClassContent {
  const classId = `homebrew:m14-d2:class:${id}`;
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
          id: `homebrew:m14-d2:class-feature:${id}:spellcasting`,
          name: `${id} Spellcasting`,
          description: 'Synthetic M14-D2 provider fixture.',
          effects: [],
          spellcasting: [provider],
          referenceEffects: [],
        }] : [],
      };
    }),
    resources: [],
  };
}

function derivedProvider(state: ReturnType<typeof derive>, providerId: ContentId) {
  const result = state.spellcasting.find((candidate) => candidate.id === providerId);
  if (!result) throw new Error(`Missing derived provider: ${providerId}`);
  return result;
}

function dieValue(value: number, die: number) {
  return () => (value - 1) / die;
}

describe('Milestone 14-D2 provider-specific multiclass spell ownership, preparation, and validation', () => {
  it('A validates Cleric 3 / Wizard 2 selections simultaneously and preserves D1 combined slots', () => {
    const { clericSelection, wizardSelection } = clericWizardSelections();
    const value = clericWizardInput([clericSelection, wizardSelection]);
    expect(validateCharacterInput(value, {}, contentRegistry).spellcastingSelections).toBeUndefined();

    const state = derive(character(value));
    expect(state.ordinaryMulticlassCasterLevel).toBe(5);
    expect(state.ordinaryMulticlassSlotPool).toMatchObject({
      id: MULTICLASS_ORDINARY_SLOT_POOL_ID,
      slots: [
        { spellLevel: 1, maximumUses: 4 },
        { spellLevel: 2, maximumUses: 3 },
        { spellLevel: 3, maximumUses: 2 },
      ],
    });

    const cleric = derivedProvider(state, CLERIC_PROVIDER_ID);
    const wizard = derivedProvider(state, WIZARD_PROVIDER_ID);
    expect(cleric.owner).toMatchObject({ kind: 'class', classId: CLERIC_ID, level: 3 });
    expect(wizard.owner).toMatchObject({ kind: 'class', classId: WIZARD_ID, level: 2 });
    expect(cleric.management).toMatchObject({ kind: 'prepared-from-list' });
    expect(wizard.management).toMatchObject({ kind: 'prepared-from-owned' });
    if (cleric.management.kind !== 'prepared-from-list' || wizard.management.kind !== 'prepared-from-owned') throw new Error('Expected provider management policies.');
    expect(cleric.management.selectedCantrips.map((spell) => spell.id)).toEqual(clericSelection.cantripIds);
    expect(cleric.management.preparedSpells.map((spell) => spell.id)).toEqual(clericSelection.preparedSpellIds);
    expect(wizard.management.selectedCantrips.map((spell) => spell.id)).toEqual(wizardSelection.cantripIds);
    expect(wizard.management.ownedSpells.map((spell) => spell.id)).toEqual(wizardSelection.ownedSpellIds);
    expect(wizard.management.preparedSpells.map((spell) => spell.id)).toEqual(wizardSelection.preparedSpellIds);
  });

  it('B rejects a level-3 Wizard spell for Wizard 2 even though Cleric 3 / Wizard 2 has level-3 shared slots', () => {
    const { clericSelection, wizardSelection } = clericWizardSelections();
    const fireball = contentRegistry.findSpell(FIREBALL_ID);
    expect(fireball).toMatchObject({ level: 3 });
    expect(fireball && spellBelongsToProviderList(fireball, 'wizard')).toBe(true);

    const invalidWizard: CharacterSpellcastingSelection = {
      ...wizardSelection,
      ownedSpellIds: [...wizardSelection.ownedSpellIds, FIREBALL_ID],
      preparedSpellIds: [...wizardSelection.preparedSpellIds, FIREBALL_ID],
    };
    const value = clericWizardInput([clericSelection, invalidWizard]);
    const error = validateCharacterInput(value, {}, contentRegistry).spellcastingSelections;
    expect(error).toMatch(/Wizard Spellcasting.*available at this level for this provider/i);

    const baseline = derive(character(clericWizardInput([clericSelection, wizardSelection])));
    expect(baseline.ordinaryMulticlassSlotPool?.slots.some((slot) => slot.spellLevel === 3)).toBe(true);
  });

  it('C enforces provider spell-list isolation instead of validating against the Character-wide union', () => {
    const { clericSelection, wizardSelection } = clericWizardSelections();
    const sacredFlame = contentRegistry.findSpell(SACRED_FLAME_ID);
    expect(sacredFlame && spellBelongsToProviderList(sacredFlame, 'cleric')).toBe(true);
    expect(sacredFlame && spellBelongsToProviderList(sacredFlame, 'wizard')).toBe(false);

    const invalidWizard = {
      ...wizardSelection,
      cantripIds: includeAtFixedCount(wizardSelection.cantripIds, SACRED_FLAME_ID),
    };
    expect(validateCharacterInput(
      clericWizardInput([clericSelection, invalidWizard]),
      {},
      contentRegistry,
    ).spellcastingSelections).toMatch(/Wizard Spellcasting cantrips.*its spell list/i);
  });

  it('D enforces cantrip counts independently with no cross-provider borrowing', () => {
    const { clericSelection, wizardSelection } = clericWizardSelections();
    const clericUnder = { ...clericSelection, cantripIds: clericSelection.cantripIds.slice(0, -1) };
    const wizardExtra = listSpells('wizard', (level) => level === 0)
      .map((spell) => spell.id)
      .find((id) => !wizardSelection.cantripIds.includes(id));
    if (!wizardExtra) throw new Error('Need an extra Wizard cantrip fixture.');
    const wizardOver = { ...wizardSelection, cantripIds: [...wizardSelection.cantripIds, wizardExtra] };

    expect(validateCharacterInput(
      clericWizardInput([clericUnder, wizardOver]),
      {},
      contentRegistry,
    ).spellcastingSelections).toMatch(/exactly 3 cantrips for Cleric Spellcasting/i);

    expect(validateCharacterInput(
      clericWizardInput([clericSelection, wizardOver]),
      {},
      contentRegistry,
    ).spellcastingSelections).toMatch(/exactly 3 cantrips for Wizard Spellcasting/i);
  });

  it('E enforces provider-local owned-spell floors independently for two prepared-from-owned providers', () => {
    const independentProvider = independentOwnedProvider('archive');
    const independentClass = syntheticClass('archive', independentProvider);
    const registry = new ContentRegistry(SRD_CONTENT, [independentClass]);
    const wizard = providerDefinition(WIZARD_ID, 2, WIZARD_PROVIDER_ID, registry);
    const wizardSelection = selectionFor(wizard, 2, registry);
    const archiveSelection = selectionFor(independentProvider, 2, registry);

    const entries = [
      { classId: WIZARD_ID, level: 2 },
      { classId: independentClass.id, level: 2 },
    ];

    const wizardShort = { ...wizardSelection, ownedSpellIds: wizardSelection.ownedSpellIds.slice(0, 5), preparedSpellIds: [] };
    expect(validateCharacterInput(
      buildInput(WIZARD_ID, entries, [wizardShort, archiveSelection], registry),
      {},
      registry,
    ).spellcastingSelections).toMatch(/Wizard Spellcasting requires at least 6 owned spells/i);

    const archiveShort = { ...archiveSelection, ownedSpellIds: archiveSelection.ownedSpellIds.slice(0, 1), preparedSpellIds: [] };
    expect(validateCharacterInput(
      buildInput(WIZARD_ID, entries, [wizardSelection, archiveShort], registry),
      {},
      registry,
    ).spellcastingSelections).toMatch(/archive Casting requires at least 2 owned spells/i);
  });

  it('F enforces prepared-spell limits independently per provider', () => {
    const { clericSelection, wizardSelection } = clericWizardSelections();
    const clericDefinition = providerDefinition(CLERIC_ID, 3, CLERIC_PROVIDER_ID, contentRegistry, LIFE_DOMAIN_ID);
    const clericLimit = spellcastingCountAtLevel(
      clericDefinition.spellManagement.kind === 'prepared-from-list' ? clericDefinition.spellManagement.preparedSpellCount : [],
      3,
    );
    const clericEligible = listSpells('cleric', (level) => level > 0 && level <= maximumSelectableSpellLevel(clericDefinition, 3))
      .map((spell) => spell.id);
    const clericOver = {
      ...clericSelection,
      preparedSpellIds: ensureCount(clericEligible, clericLimit + 1, 'Cleric prepared overflow'),
    };
    expect(validateCharacterInput(
      clericWizardInput([clericOver, wizardSelection]),
      {},
      contentRegistry,
    ).spellcastingSelections).toMatch(/Cleric Spellcasting can prepare at most 6 spells/i);

    const wizardOver = { ...wizardSelection, preparedSpellIds: [...wizardSelection.ownedSpellIds] };
    expect(validateCharacterInput(
      clericWizardInput([clericSelection, wizardOver]),
      {},
      contentRegistry,
    ).spellcastingSelections).toMatch(/Wizard Spellcasting can prepare at most 5 spells/i);
  });

  it('G rejects prepared-from-owned spells that are not owned by that provider', () => {
    const { clericSelection, wizardSelection } = clericWizardSelections();
    const extraOwnedCandidate = listSpells('wizard', (level) => level === 1)
      .map((spell) => spell.id)
      .find((id) => !wizardSelection.ownedSpellIds.includes(id));
    if (!extraOwnedCandidate) throw new Error('Need an unowned Wizard spell fixture.');
    const invalidWizard = { ...wizardSelection, preparedSpellIds: [extraOwnedCandidate] };

    expect(validateCharacterInput(
      clericWizardInput([clericSelection, invalidWizard]),
      {},
      contentRegistry,
    ).spellcastingSelections).toMatch(/prepared spells must already be owned by that provider/i);
  });

  it('H preserves always-prepared grants without consuming manual prepared capacity', () => {
    const warlockDefinition = providerDefinition(WARLOCK_ID, 3, WARLOCK_PROVIDER_ID, contentRegistry, FIEND_PATRON_ID);
    if (warlockDefinition.spellManagement.kind !== 'prepared-from-list') throw new Error('Warlock list provider missing.');
    const preparedLimit = spellcastingCountAtLevel(warlockDefinition.spellManagement.preparedSpellCount, 3);
    const grantIds = new Set([
      srdId('spell', 'burning-hands'),
      srdId('spell', 'command'),
      srdId('spell', 'scorching-ray'),
      srdId('spell', 'suggestion'),
    ]);
    const manualPrepared = ensureCount(
      listSpells('warlock', (level) => level > 0 && level <= maximumSelectableSpellLevel(warlockDefinition, 3))
        .map((spell) => spell.id)
        .filter((id) => !grantIds.has(id)),
      preparedLimit,
      'Warlock manual prepared spells',
    );
    const selection = {
      ...selectionFor(warlockDefinition, 3),
      preparedSpellIds: manualPrepared,
    };
    const value = buildInput(
      WARLOCK_ID,
      [{ classId: WARLOCK_ID, level: 3, subclassId: FIEND_PATRON_ID }],
      [selection],
    );
    expect(validateCharacterInput(value).spellcastingSelections).toBeUndefined();

    const state = derive(character(value));
    const warlock = derivedProvider(state, WARLOCK_PROVIDER_ID);
    expect(warlock.spellGrants.map((grant) => grant.spell.id)).toEqual(expect.arrayContaining([...grantIds]));
    expect(warlock.management.kind).toBe('prepared-from-list');
    if (warlock.management.kind !== 'prepared-from-list') throw new Error('Warlock management missing.');
    expect(warlock.management.preparedSpells).toHaveLength(preparedLimit);
    expect(warlock.spellGrants).toHaveLength(4);
  });

  it('I keeps the same spell distinct under two legitimate providers', () => {
    const sorcerer = providerDefinition(SORCERER_ID, 1, SORCERER_PROVIDER_ID);
    const wizard = providerDefinition(WIZARD_ID, 1, WIZARD_PROVIDER_ID);
    const sorcererSelection = selectionFor(sorcerer, 1);
    const wizardSelection = selectionFor(wizard, 1);
    sorcererSelection.cantripIds = includeAtFixedCount(sorcererSelection.cantripIds, FIRE_BOLT_ID);
    wizardSelection.cantripIds = includeAtFixedCount(wizardSelection.cantripIds, FIRE_BOLT_ID);

    const value = buildInput(
      SORCERER_ID,
      [
        { classId: SORCERER_ID, level: 1 },
        { classId: WIZARD_ID, level: 1 },
      ],
      [sorcererSelection, wizardSelection],
      contentRegistry,
      'normal',
      { ...QUALIFYING_SCORES, intelligence: 16, charisma: 12 },
    );
    expect(validateCharacterInput(value).spellcastingSelections).toBeUndefined();
    const state = derive(character(value));
    expect(derivedProvider(state, SORCERER_PROVIDER_ID).spells.some((spell) => spell.id === FIRE_BOLT_ID)).toBe(true);
    expect(derivedProvider(state, WIZARD_PROVIDER_ID).spells.some((spell) => spell.id === FIRE_BOLT_ID)).toBe(true);
    expect(derivedProvider(state, SORCERER_PROVIDER_ID).ability).toBe('charisma');
    expect(derivedProvider(state, WIZARD_PROVIDER_ID).ability).toBe('intelligence');
  });

  it('J uses the explicitly selected provider ID for the same spell roll context', () => {
    const sorcerer = providerDefinition(SORCERER_ID, 1, SORCERER_PROVIDER_ID);
    const wizard = providerDefinition(WIZARD_ID, 1, WIZARD_PROVIDER_ID);
    const sorcererSelection = selectionFor(sorcerer, 1);
    const wizardSelection = selectionFor(wizard, 1);
    sorcererSelection.cantripIds = includeAtFixedCount(sorcererSelection.cantripIds, FIRE_BOLT_ID);
    wizardSelection.cantripIds = includeAtFixedCount(wizardSelection.cantripIds, FIRE_BOLT_ID);

    const value = buildInput(
      SORCERER_ID,
      [
        { classId: SORCERER_ID, level: 1 },
        { classId: WIZARD_ID, level: 1 },
      ],
      [sorcererSelection, wizardSelection],
      contentRegistry,
      'normal',
      { ...QUALIFYING_SCORES, intelligence: 16, charisma: 12 },
    );
    const pc = character(value, 'm14-d2-roll-context');
    const state = derive(pc);
    const sorcererProvider = derivedProvider(state, SORCERER_PROVIDER_ID);
    const wizardProvider = derivedProvider(state, WIZARD_PROVIDER_ID);
    expect(sorcererProvider.attackModifier).not.toBe(wizardProvider.attackModifier);

    const sorcererRoll = rollSpellAttack(pc, state, SORCERER_PROVIDER_ID, FIRE_BOLT_ID, 'normal', { rng: dieValue(10, 20) });
    const wizardRoll = rollSpellAttack(pc, state, WIZARD_PROVIDER_ID, FIRE_BOLT_ID, 'normal', { rng: dieValue(10, 20) });
    expect(sorcererRoll).toMatchObject({
      ok: true,
      value: { roll: { modifier: sorcererProvider.attackModifier, request: { source: { spellcastingProviderId: SORCERER_PROVIDER_ID } } } },
    });
    expect(wizardRoll).toMatchObject({
      ok: true,
      value: { roll: { modifier: wizardProvider.attackModifier, request: { source: { spellcastingProviderId: WIZARD_PROVIDER_ID } } } },
    });
  });

  it('K rejects an unknown provider ID explicitly', () => {
    const value = buildInput(
      FIGHTER_ID,
      [{ classId: FIGHTER_ID, level: 1 }],
      [{ providerId: 'homebrew:m14-d2:spellcasting-provider:unknown', cantripIds: [], ownedSpellIds: [], preparedSpellIds: [] }],
    );
    expect(validateCharacterInput(value).spellcastingSelections).toMatch(/Unknown spellcasting provider selection/i);
  });

  it('L rejects a known provider that has not yet been acquired at its owner level', () => {
    const delayedProvider = independentOwnedProvider('delayed');
    const delayedClass = syntheticClass('delayed', delayedProvider, 3);
    const registry = new ContentRegistry(SRD_CONTENT, [delayedClass]);
    const selection = selectionFor(delayedProvider, 2, registry);
    const value = buildInput(
      delayedClass.id,
      [{ classId: delayedClass.id, level: 2 }],
      [selection],
      registry,
    );
    expect(validateCharacterInput(value, {}, registry).spellcastingSelections).toMatch(/has not been acquired at its owner level/i);
  });

  it('M does not let high total Character level acquire a provider early', () => {
    const delayedProvider = independentOwnedProvider('late-total');
    const delayedClass = syntheticClass('late-total', delayedProvider, 3);
    const registry = new ContentRegistry(SRD_CONTENT, [delayedClass]);
    const selection = selectionFor(delayedProvider, 2, registry);
    const value = buildInput(
      FIGHTER_ID,
      [
        { classId: FIGHTER_ID, level: 5 },
        { classId: delayedClass.id, level: 2 },
      ],
      [selection],
      registry,
    );
    expect(value.classProgressions.reduce((sum, entry) => sum + entry.level, 0)).toBe(7);
    expect(validateCharacterInput(value, {}, registry).spellcastingSelections).toMatch(/has not been acquired at its owner level/i);
  });

  it('N validates Warlock selections provider-locally while keeping Pact/ordinary slot interoperability deferred', () => {
    const wizard = providerDefinition(WIZARD_ID, 1, WIZARD_PROVIDER_ID);
    const warlock = providerDefinition(WARLOCK_ID, 3, WARLOCK_PROVIDER_ID, contentRegistry, FIEND_PATRON_ID);
    const value = buildInput(
      WIZARD_ID,
      [
        { classId: WIZARD_ID, level: 1 },
        { classId: WARLOCK_ID, level: 3, subclassId: FIEND_PATRON_ID },
      ],
      [selectionFor(wizard, 1), selectionFor(warlock, 3)],
    );
    expect(validateCharacterInput(value).spellcastingSelections).toBeUndefined();

    const state = derive(character(value));
    expect(state.ordinaryMulticlassCasterLevel).toBe(1);
    expect(derivedProvider(state, WIZARD_PROVIDER_ID).slotPool?.id).toBe(MULTICLASS_ORDINARY_SLOT_POOL_ID);
    expect(derivedProvider(state, WARLOCK_PROVIDER_ID).slotPool?.id).toBe(srdId('spell-slot-pool', 'warlock:pact-magic'));
  });

  it('O keeps independent provider selections isolated from Wizard ownership and ordinary slots', () => {
    const independentProvider = independentOwnedProvider('isolated');
    const independentClass = syntheticClass('isolated', independentProvider);
    const registry = new ContentRegistry(SRD_CONTENT, [independentClass]);
    const wizard = providerDefinition(WIZARD_ID, 2, WIZARD_PROVIDER_ID, registry);
    const independentSelection = selectionFor(independentProvider, 2, registry);
    const value = buildInput(
      WIZARD_ID,
      [
        { classId: WIZARD_ID, level: 2 },
        { classId: independentClass.id, level: 2 },
      ],
      [selectionFor(wizard, 2, registry), independentSelection],
      registry,
    );
    expect(validateCharacterInput(value, {}, registry).spellcastingSelections).toBeUndefined();

    const state = derive(character(value), registry);
    const independent = derivedProvider(state, independentProvider.id);
    expect(state.ordinaryMulticlassCasterLevel).toBe(2);
    expect(independent.multiclassSlotContribution).toEqual({ kind: 'independent' });
    expect(independent.slotPool?.id).toBe('homebrew:m14-d2:spell-slot-pool:isolated');
    expect(independent.management.kind).toBe('prepared-from-owned');
    if (independent.management.kind !== 'prepared-from-owned') throw new Error('Independent owned provider missing.');
    expect(independent.management.ownedSpells.map((spell) => spell.id)).toEqual(independentSelection.ownedSpellIds);
  });

  it('P validates a subclass-owned provider at parent class level with stable subclass provenance', () => {
    const subclassProvider = preparedListProvider('fighter-subclass');
    const subclassId = 'homebrew:m14-d2:subclass:fighter-caster';
    const subclass: SubclassContent = {
      id: subclassId,
      kind: 'subclass',
      name: 'Fighter Caster',
      source: SOURCE,
      parentClassId: FIGHTER_ID,
      acquisitionLevel: 3,
      description: 'Synthetic D2 subclass provider.',
      progression: [{
        level: 3,
        features: [{
          id: 'homebrew:m14-d2:subclass-feature:fighter-caster:spellcasting',
          name: 'Subclass Casting',
          description: 'Synthetic subclass provider.',
          effects: [],
          spellcasting: [subclassProvider],
          referenceEffects: [],
        }],
      }],
    };
    const registry = new ContentRegistry(SRD_CONTENT, [subclass]);
    const wizard = providerDefinition(WIZARD_ID, 1, WIZARD_PROVIDER_ID, registry);
    const subclassSelection = selectionFor(subclassProvider, 3, registry);
    const value = buildInput(
      FIGHTER_ID,
      [
        { classId: FIGHTER_ID, level: 3, subclassId },
        { classId: WIZARD_ID, level: 1 },
      ],
      [subclassSelection, selectionFor(wizard, 1, registry)],
      registry,
    );
    expect(validateCharacterInput(value, {}, registry).spellcastingSelections).toBeUndefined();

    const state = derive(character(value), registry);
    expect(derivedProvider(state, subclassProvider.id).owner).toEqual({
      kind: 'subclass',
      level: 3,
      classId: FIGHTER_ID,
      className: 'Fighter',
      subclassId,
      subclassName: 'Fighter Caster',
    });
  });

  it('Q keeps validation and provider ownership invariant under classProgressions reorder', () => {
    const { clericSelection, wizardSelection } = clericWizardSelections();
    const normal = clericWizardInput([clericSelection, wizardSelection], CLERIC_ID, 'normal');
    const reversed = clericWizardInput([clericSelection, wizardSelection], CLERIC_ID, 'reversed');
    expect(validateCharacterInput(normal).spellcastingSelections).toBeUndefined();
    expect(validateCharacterInput(reversed).spellcastingSelections).toBeUndefined();

    const summary = (state: ReturnType<typeof derive>) => state.spellcasting.map((entry) => ({
      id: entry.id,
      owner: entry.owner,
      management: entry.management.kind,
      spellIds: entry.spells.map((spell) => spell.id),
    }));
    expect(summary(derive(character(reversed, 'd2-reversed')))).toEqual(summary(derive(character(normal, 'd2-normal'))));
  });

  it('R keeps provider spell ownership and eligibility unchanged when startingClassId reverses', () => {
    const { clericSelection, wizardSelection } = clericWizardSelections();
    const clericStart = clericWizardInput([clericSelection, wizardSelection], CLERIC_ID);
    const wizardStart = clericWizardInput([clericSelection, wizardSelection], WIZARD_ID);
    expect(validateCharacterInput(clericStart).spellcastingSelections).toBeUndefined();
    expect(validateCharacterInput(wizardStart).spellcastingSelections).toBeUndefined();

    const summary = (state: ReturnType<typeof derive>) => state.spellcasting.map((entry) => ({
      id: entry.id,
      owner: entry.owner,
      ability: entry.ability,
      spellIds: entry.spells.map((spell) => spell.id),
    }));
    expect(summary(derive(character(wizardStart, 'd2-wizard-start'))))
      .toEqual(summary(derive(character(clericStart, 'd2-cleric-start'))));
  });

  it('S preserves representative single-class Wizard, Cleric, Sorcerer, and Warlock validation parity', () => {
    const wizard = providerDefinition(WIZARD_ID, 2, WIZARD_PROVIDER_ID);
    const wizardInput = buildInput(
      WIZARD_ID,
      [{ classId: WIZARD_ID, level: 2 }],
      [selectionFor(wizard, 2)],
    );
    expect(validateCharacterInput(wizardInput).spellcastingSelections).toBeUndefined();

    const clericInput = buildInput(
      CLERIC_ID,
      [{ classId: CLERIC_ID, level: 3, subclassId: LIFE_DOMAIN_ID }],
      [],
    );
    expect(validateCharacterInput(clericInput).spellcastingSelections).toBeUndefined();

    const sorcererInput = buildInput(
      SORCERER_ID,
      [{ classId: SORCERER_ID, level: 1 }],
      [],
    );
    expect(validateCharacterInput(sorcererInput).spellcastingSelections).toBeUndefined();

    const warlockInput = buildInput(
      WARLOCK_ID,
      [{ classId: WARLOCK_ID, level: 3, subclassId: FIEND_PATRON_ID }],
      [],
    );
    expect(validateCharacterInput(warlockInput).spellcastingSelections).toBeUndefined();

    const wizardState = derive(character(wizardInput, 'd2-wizard-single'));
    const wizardProvider = derivedProvider(wizardState, WIZARD_PROVIDER_ID);
    expect(wizardProvider.slotPool?.id).toBe(srdId('spell-slot-pool', 'wizard'));
    expect(wizardState.ordinaryMulticlassSlotPool).toBeUndefined();

    const warlockState = derive(character(warlockInput, 'd2-warlock-single'));
    expect(derivedProvider(warlockState, WARLOCK_PROVIDER_ID).slotPool?.id).toBe(srdId('spell-slot-pool', 'warlock:pact-magic'));
    expect(warlockState.ordinaryMulticlassSlotPool).toBeUndefined();
  });
});
