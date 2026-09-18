import { describe, expect, it } from 'vitest';
import { SRD_CONTENT } from '../content/srd';
import type { CharacterSpellcastingSelection } from '../models/character';
import type { ClassContent, SpellContent, SpellcastingProviderDefinition } from '../models/content';
import { ContentRegistry } from '../services/contentRegistry';
import { serializeCharacters } from '../services/characterStorage';
import { fighterCharacter, fighterInput } from '../test/fixtures';
import { validateCharacterInput } from '../utils/characterValidation';
import { deriveCharacterState } from './deriveCharacter';
import { deriveSpellcastingProviders } from './spellcasting';

const SOURCE = { type: 'homebrew', namespace: 'm12e-generic' } as const;
const CLASS_ID = 'homebrew:m12e-generic:class:archive-keeper';
const PROVIDER_ID = 'homebrew:m12e-generic:spellcasting-provider:lattice-casting';
const LIST_ID = 'lattice';
const ids = {
  mote: 'homebrew:m12e-generic:spell:drift-mote',
  pulse: 'homebrew:m12e-generic:spell:soft-pulse',
  quiet: 'homebrew:m12e-generic:spell:quiet-glyph',
  stone: 'homebrew:m12e-generic:spell:stone-thread',
  unowned: 'homebrew:m12e-generic:spell:unheld-sigil',
  far: 'homebrew:m12e-generic:spell:far-lantern',
  fixed: 'homebrew:m12e-generic:spell:fixed-ward',
} as const;

function spell(id: string, name: string, level: 0 | 1 | 2, ritual = false): SpellContent {
  return {
    id,
    kind: 'spell',
    name,
    source: SOURCE,
    level,
    school: 'abjuration',
    castingTime: 'Action',
    range: '30 feet',
    components: { verbal: true, somatic: false, material: false },
    duration: '1 minute',
    concentration: false,
    ritual,
    description: 'Synthetic unrelated Homebrew spell for M12E generic conformance.',
    spellLists: [{ id: LIST_ID, name: 'Lattice' }],
    mechanics: [],
    referenceEffects: [],
  };
}

const spells = [
  spell(ids.mote, 'Drift Mote', 0),
  spell(ids.pulse, 'Soft Pulse', 0),
  spell(ids.quiet, 'Quiet Glyph', 1, true),
  spell(ids.stone, 'Stone Thread', 1),
  spell(ids.unowned, 'Unheld Sigil', 1, true),
  spell(ids.far, 'Far Lantern', 2, true),
  spell(ids.fixed, 'Fixed Ward', 1),
] as const;

const provider: SpellcastingProviderDefinition = {
  id: PROVIDER_ID,
  name: 'Lattice Casting',
  spellcastingAbility: { kind: 'fixed', ability: 'wisdom' },
  spellManagement: {
    kind: 'prepared-from-owned',
    spellListId: LIST_ID,
    cantripCount: [{ level: 1, count: 1 }, { level: 3, count: 2 }],
    preparedSpellCount: [{ level: 1, count: 1 }, { level: 3, count: 2 }],
    replacement: 'long-rest-any',
    initialOwnedSpellCount: 2,
    initialOwnedSpellLevel: 1,
  },
  slotPool: {
    id: 'homebrew:m12e-generic:spell-slot-pool:lattice',
    name: 'Lattice Slots',
    slotLevels: [
      { spellLevel: 1, resourceId: 'homebrew:m12e-generic:spell-slot:lattice:1', name: 'Level 1 Lattice Slots' },
      { spellLevel: 2, resourceId: 'homebrew:m12e-generic:spell-slot:lattice:2', name: 'Level 2 Lattice Slots' },
    ],
    progression: [
      { level: 1, slots: [{ spellLevel: 1, maximum: 2 }] },
      { level: 3, slots: [{ spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 2 }] },
    ],
    recovery: [{ trigger: 'long-rest', mode: 'all' }],
  },
  ritualCasting: 'owned',
};

const homebrewClass: ClassContent = {
  id: CLASS_ID,
  kind: 'class',
  name: 'Archive Keeper',
  source: SOURCE,
  hitDie: 8,
  fixedHitPointsPerLevel: 5,
  primaryAbility: { mode: 'one-of', abilities: ['wisdom'] },
  savingThrowProficiencies: ['wisdom', 'charisma'],
  weaponProficiencies: [{ kind: 'category', category: 'simple' }],
  armorTraining: [],
  toolProficiencies: [],
  skillChoices: { choose: 2, from: ['athletics', 'perception', 'insight'] },
  startingEquipment: [{ id: 'A', items: [], currency: { amount: 12, unit: 'gp' } }],
  progression: Array.from({ length: 20 }, (_, index) => ({
    level: index + 1,
    proficiencyBonus: index + 1 >= 17 ? 6 : index + 1 >= 13 ? 5 : index + 1 >= 9 ? 4 : index + 1 >= 5 ? 3 : 2,
    features: index === 0 ? [{
      id: 'homebrew:m12e-generic:class-feature:lattice-casting',
      name: 'Lattice Casting',
      description: 'Synthetic unrelated owned-spell provider.',
      effects: [],
      spellcasting: [provider],
      spellGrants: [{ providerId: PROVIDER_ID, spellIds: [ids.fixed], status: 'always-prepared' as const }],
      referenceEffects: [],
    }] : [],
  })),
  resources: [],
};

const selection: CharacterSpellcastingSelection = {
  providerId: PROVIDER_ID,
  cantripIds: [ids.mote],
  ownedSpellIds: [ids.quiet, ids.stone],
  preparedSpellIds: [ids.stone],
};

function registry() {
  return new ContentRegistry(SRD_CONTENT, [...spells, homebrewClass]);
}

function input(overrides: Partial<CharacterSpellcastingSelection> = {}, level = 1) {
  const merged = { ...selection, ...overrides };
  return fighterInput({
    name: 'Generic Archive Keeper',
    classId: CLASS_ID,
    subclassId: undefined,
    level,
    skillProficiencies: ['athletics', 'perception'],
    spellcastingSelections: [merged],
    abilityScores: { wisdom: 16 },
  });
}

describe('Milestone 12E unrelated Homebrew spell-ownership conformance', () => {
  it('persists provider-scoped cantrip, owned, and prepared selections as generic Character build state', () => {
    const character = fighterCharacter({
      name: 'Serialized Archive Keeper',
      classId: CLASS_ID,
      subclassId: undefined,
      level: 1,
      skillProficiencies: ['athletics', 'perception'],
      spellcastingSelections: [selection],
    });
    const parsed = JSON.parse(serializeCharacters([character])) as Array<{ spellcastingSelections: CharacterSpellcastingSelection[] }>;
    expect(parsed[0].spellcastingSelections).toEqual([selection]);
    expect(character.playState).not.toHaveProperty('cantripIds');
    expect(character.playState).not.toHaveProperty('ownedSpellIds');
    expect(character.playState).not.toHaveProperty('preparedSpellIds');
  });

  it('derives prepared-from-owned state, keeps fixed grants derived, and exposes owned unprepared Rituals', () => {
    const customRegistry = registry();
    expect(validateCharacterInput(input(), {}, customRegistry).spellcastingSelections).toBeUndefined();

    const character = fighterCharacter({
      name: 'Derived Archive Keeper',
      classId: CLASS_ID,
      subclassId: undefined,
      level: 1,
      skillProficiencies: ['athletics', 'perception'],
      spellcastingSelections: [selection],
      abilityScores: { wisdom: 16 },
    });
    const derived = deriveCharacterState(character, customRegistry);
    if (!derived.ok) throw new Error(derived.error.message);
    const casting = derived.value.spellcasting[0];

    expect(casting.management.kind).toBe('prepared-from-owned');
    if (casting.management.kind !== 'prepared-from-owned') throw new Error('Synthetic owned provider missing.');
    expect(casting.management.selectedCantrips.map((entry) => entry.id)).toEqual([ids.mote]);
    expect(casting.management.ownedSpells.map((entry) => entry.id)).toEqual([ids.quiet, ids.stone]);
    expect(casting.management.preparedSpells.map((entry) => entry.id)).toEqual([ids.stone]);
    expect(casting.spellGrants.map((grant) => grant.spell.id)).toEqual([ids.fixed]);
    expect(casting.spells.map((entry) => entry.id)).toEqual([ids.mote, ids.stone, ids.fixed]);
    expect(casting.ritualSpells.map((entry) => entry.id)).toEqual([ids.quiet]);
    expect(selection.preparedSpellIds).toEqual([ids.stone]);
    expect(casting.management.preparedSpells).toHaveLength(1);
  });

  it('rejects unowned preparation, preparation overflow, and spells above the provider level ceiling', () => {
    const customRegistry = registry();
    expect(validateCharacterInput(input({ preparedSpellIds: [ids.unowned] }), {}, customRegistry).spellcastingSelections).toMatch(/must already be owned/i);
    expect(validateCharacterInput(input({ preparedSpellIds: [ids.quiet, ids.stone] }), {}, customRegistry).spellcastingSelections).toMatch(/at most 1/i);
    expect(validateCharacterInput(input({ ownedSpellIds: [ids.quiet, ids.stone, ids.far] }), {}, customRegistry).spellcastingSelections).toMatch(/available at this level/i);
  });

  it('does not make a globally registered but unowned Ritual eligible and retains prepared-only Ritual semantics', () => {
    const customRegistry = registry();
    const ownedResult = deriveSpellcastingProviders(
      [{ definition: provider, source: SOURCE, grantedBy: { contentId: homebrewClass.id, contentName: homebrewClass.name } }],
      1,
      { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 3, charisma: 0 },
      2,
      customRegistry,
      [],
      [selection],
    );
    if (!ownedResult.ok) throw new Error(ownedResult.error.message);
    expect(ownedResult.value.providers[0].ritualSpells.map((entry) => entry.id)).toEqual([ids.quiet]);
    expect(ownedResult.value.providers[0].ritualSpells.some((entry) => entry.id === ids.unowned)).toBe(false);

    const preparedPolicy = { ...provider, id: 'homebrew:m12e-generic:spellcasting-provider:prepared-lattice', ritualCasting: 'prepared' as const };
    const preparedSelection = { ...selection, providerId: preparedPolicy.id, preparedSpellIds: [ids.quiet] };
    const preparedResult = deriveSpellcastingProviders(
      [{ definition: preparedPolicy, source: SOURCE, grantedBy: { contentId: homebrewClass.id, contentName: homebrewClass.name } }],
      1,
      { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 3, charisma: 0 },
      2,
      customRegistry,
      [],
      [preparedSelection],
    );
    if (!preparedResult.ok) throw new Error(preparedResult.error.message);
    expect(preparedResult.value.providers[0].ritualSpells.map((entry) => entry.id)).toEqual([ids.quiet]);

    const unpreparedResult = deriveSpellcastingProviders(
      [{ definition: preparedPolicy, source: SOURCE, grantedBy: { contentId: homebrewClass.id, contentName: homebrewClass.name } }],
      1,
      { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 3, charisma: 0 },
      2,
      customRegistry,
      [],
      [{ ...preparedSelection, preparedSpellIds: [ids.stone] }],
    );
    if (!unpreparedResult.ok) throw new Error(unpreparedResult.error.message);
    expect(unpreparedResult.value.providers[0].ritualSpells).toEqual([]);
  });

  it('keeps unresolved persisted spell IDs mechanically inert without deleting the stored selection', () => {
    const customRegistry = registry();
    const unresolved = 'homebrew:m12e-generic:spell:missing-record';
    const unresolvedSelection = { ...selection, ownedSpellIds: [...selection.ownedSpellIds, unresolved] };
    expect(validateCharacterInput(input({ ownedSpellIds: unresolvedSelection.ownedSpellIds }), {}, customRegistry).spellcastingSelections).toBeUndefined();

    const result = deriveSpellcastingProviders(
      [{ definition: provider, source: SOURCE, grantedBy: { contentId: homebrewClass.id, contentName: homebrewClass.name } }],
      1,
      { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 3, charisma: 0 },
      2,
      customRegistry,
      [],
      [unresolvedSelection],
    );
    if (!result.ok) throw new Error(result.error.message);
    const management = result.value.providers[0].management;
    if (management.kind !== 'prepared-from-owned') throw new Error('Synthetic owned provider missing.');
    expect(unresolvedSelection.ownedSpellIds).toContain(unresolved);
    expect(management.ownedSpells.map((entry) => entry.id)).toEqual([ids.quiet, ids.stone]);
  });

  it('requires active owned-provider selections and rejects malformed provider/selection metadata generically', () => {
    const customRegistry = registry();
    const missing = fighterInput({
      name: 'Missing Lattice Choices',
      classId: CLASS_ID,
      subclassId: undefined,
      level: 1,
      skillProficiencies: ['athletics', 'perception'],
      spellcastingSelections: [],
    });
    expect(validateCharacterInput(missing, {}, customRegistry).spellcastingSelections).toMatch(/Choose spellcasting selections for Lattice Casting/i);

    expect(validateCharacterInput(input({ cantripIds: [ids.mote, ids.mote] }), {}, customRegistry).spellcastingSelections).toMatch(/duplicate spell IDs/i);

    const badClass = structuredClone(homebrewClass);
    const badProvider = badClass.progression[0].features[0].spellcasting?.[0];
    if (!badProvider || badProvider.spellManagement.kind !== 'prepared-from-owned') throw new Error('Synthetic provider fixture missing.');
    (badProvider.spellManagement as { initialOwnedSpellCount: number }).initialOwnedSpellCount = 0;
    expect(() => new ContentRegistry(SRD_CONTENT, [...spells, badClass])).toThrow(/Prepared-from-owned Spellcasting provider/i);
  });
});
