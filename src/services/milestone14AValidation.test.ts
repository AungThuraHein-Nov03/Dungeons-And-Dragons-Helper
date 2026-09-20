import { describe, expect, it } from 'vitest';
import type {
  ClassContent,
  MulticlassProficiencyGrants,
  MulticlassSlotContribution,
  SpellcastingProviderDefinition,
} from '../models/content';
import { validateContentDataset } from './contentValidation';

const SOURCE = { type: 'homebrew', namespace: 'm14a-validation' } as const;

function provider(id: string, contribution: MulticlassSlotContribution): SpellcastingProviderDefinition {
  return {
    id: `homebrew:m14a-validation:spellcasting-provider:${id}`,
    name: `${id} Casting`,
    spellcastingAbility: { kind: 'fixed', ability: 'intelligence' },
    multiclassSlotContribution: contribution,
    spellManagement: {
      kind: 'prepared-from-list',
      spellListId: `m14a-${id}`,
      cantripCount: [{ level: 1, count: 1 }],
      preparedSpellCount: [{ level: 1, count: 1 }],
      replacement: 'long-rest-any',
    },
    slotPool: {
      id: `homebrew:m14a-validation:spell-slot-pool:${id}`,
      name: `${id} Slots`,
      slotLevels: [{
        spellLevel: 1,
        resourceId: `homebrew:m14a-validation:spell-slot:${id}:1`,
        name: 'Level 1 Slots',
      }],
      progression: [{ level: 1, slots: [{ spellLevel: 1, maximum: 2 }] }],
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
    ritualCasting: 'prepared',
  };
}

function homebrewClass(
  id: string,
  multiclassProficiencies: MulticlassProficiencyGrants,
  providers: readonly SpellcastingProviderDefinition[] = [],
): ClassContent {
  return {
    id: `homebrew:m14a-validation:class:${id}`,
    kind: 'class',
    name: `${id} Class`,
    source: SOURCE,
    hitDie: 8,
    fixedHitPointsPerLevel: 5,
    primaryAbility: { mode: 'one-of', abilities: ['intelligence'] },
    multiclassProficiencies,
    savingThrowProficiencies: ['intelligence', 'wisdom'],
    weaponProficiencies: [{ kind: 'category', category: 'simple' }],
    armorTraining: ['light'],
    toolProficiencies: [],
    skillChoices: { choose: 1, from: ['arcana', 'history'] },
    startingEquipment: [{ id: 'A', items: [], currency: { amount: 0, unit: 'gp' } }],
    progression: Array.from({ length: 20 }, (_, index) => ({
      level: index + 1,
      proficiencyBonus: index + 1 >= 17 ? 6 : index + 1 >= 13 ? 5 : index + 1 >= 9 ? 4 : index + 1 >= 5 ? 3 : 2,
      features: index === 0 && providers.length > 0 ? [{
        id: `homebrew:m14a-validation:class-feature:${id}:casting`,
        name: 'Synthetic Casting',
        description: 'Synthetic provider host for M14-A content validation.',
        effects: [],
        spellcasting: providers,
        referenceEffects: [],
      }] : [],
    })),
    resources: [],
  };
}

const EMPTY_PROFICIENCIES: MulticlassProficiencyGrants = {
  weaponProficiencies: [],
  armorTraining: [],
  toolProficiencies: [],
};

function issueCodes(entry: ClassContent): string[] {
  return validateContentDataset([entry]).map((issue) => issue.code);
}

describe('Milestone 14-A generic Homebrew multiclass metadata validation', () => {
  it('accepts Homebrew added weapon/armor, any-skill, and Musical Instrument metadata', () => {
    const entry = homebrewClass('battlesinger', {
      weaponProficiencies: [{ kind: 'category', category: 'martial' }],
      armorTraining: ['medium', 'shield'],
      skillChoices: { kind: 'any-skill', choose: 1 },
      toolProficiencies: [],
      toolChoices: [{
        kind: 'category',
        id: 'instrument-choice',
        name: 'Musical Instrument',
        choose: 1,
        category: 'musical-instrument',
      }],
    });

    expect(validateContentDataset([entry])).toEqual([]);
  });

  it('accepts explicit Homebrew skill and tool option choices', () => {
    const entry = homebrewClass('artificer-adjacent', {
      weaponProficiencies: [],
      armorTraining: ['light'],
      skillChoices: { kind: 'options', choose: 1, from: ['arcana', 'investigation'] },
      toolProficiencies: [{ id: 'thieves-tools', name: 'Thieves’ Tools' }],
      toolChoices: [{
        kind: 'options',
        id: 'artisan-tool-choice',
        name: 'Artisan Tool',
        choose: 1,
        options: [
          { id: 'smith-tools', name: 'Smith’s Tools' },
          { id: 'tinker-tools', name: 'Tinker’s Tools' },
        ],
      }],
    });

    expect(validateContentDataset([entry])).toEqual([]);
  });

  it('accepts full, half-up, third-down, Pact Magic, and independent Homebrew providers generically', () => {
    const contributions: readonly MulticlassSlotContribution[] = [
      { kind: 'spellcasting', contribution: 'full' },
      { kind: 'spellcasting', contribution: 'half', rounding: 'up' },
      { kind: 'spellcasting', contribution: 'third', rounding: 'down' },
      { kind: 'pact-magic' },
      { kind: 'independent' },
    ];
    const providers = contributions.map((contribution, index) => provider(`generic-${index + 1}`, contribution));

    expect(validateContentDataset([homebrewClass('five-provider-contract', EMPTY_PROFICIENCIES, providers)])).toEqual([]);
  });

  it('rejects malformed or executable multiclass proficiency metadata fail-closed', () => {
    const valid = {
      weaponProficiencies: [],
      armorTraining: [],
      toolProficiencies: [],
    };
    const malformed: readonly unknown[] = [
      { ...valid, unexpected: true },
      { ...valid, weaponProficiencies: [{ kind: 'unknown', category: 'martial' }] },
      { ...valid, armorTraining: ['mythic'] },
      { ...valid, skillChoices: { kind: 'unknown', choose: 1 } },
      { ...valid, skillChoices: { kind: 'any-skill', choose: 0 } },
      { ...valid, skillChoices: { kind: 'class-skill-list', choose: 3 } },
      { ...valid, skillChoices: { kind: 'options', choose: 1, from: ['arcana', 'arcana'] } },
      { ...valid, skillChoices: { kind: 'options', choose: 1, from: ['not-a-skill'] } },
      { ...valid, toolProficiencies: [{ id: '', name: 'Broken Tool' }] },
      { ...valid, toolChoices: [] },
      { ...valid, toolChoices: [{ kind: 'unknown', id: 'x', name: 'X', choose: 1 }] },
      { ...valid, toolChoices: [{ kind: 'category', id: 'x', name: 'X', choose: 1, category: 'gaming-set' }] },
      { ...valid, toolChoices: [{ kind: 'options', id: 'x', name: 'X', choose: 2, options: [{ id: 'one', name: 'One' }] }] },
      { ...valid, skillChoices: { kind: 'any-skill', choose: 1, calculate: () => 1 } },
    ];

    for (const [index, value] of malformed.entries()) {
      const entry = {
        ...homebrewClass(`invalid-proficiency-${index}`, EMPTY_PROFICIENCIES),
        multiclassProficiencies: value,
      } as unknown as ClassContent;
      const codes = issueCodes(entry);
      expect(codes.some((code) => code === 'multiclass-proficiency' || code === 'multiclass-proficiency-executable')).toBe(true);
    }

    const executable = {
      ...homebrewClass('executable-proficiency', EMPTY_PROFICIENCIES),
      multiclassProficiencies: { ...valid, evaluate: () => true },
    } as unknown as ClassContent;
    expect(issueCodes(executable)).toContain('multiclass-proficiency-executable');
  });

  it('rejects malformed slot-contribution variants and unexpected fields fail-closed', () => {
    const malformed: readonly unknown[] = [
      undefined,
      { kind: 'unknown' },
      { kind: 'spellcasting', contribution: 'unknown' },
      { kind: 'spellcasting', contribution: 'full', rounding: 'up' },
      { kind: 'spellcasting', contribution: 'half' },
      { kind: 'spellcasting', contribution: 'half', rounding: 'down' },
      { kind: 'spellcasting', contribution: 'third' },
      { kind: 'spellcasting', contribution: 'third', rounding: 'up' },
      { kind: 'pact-magic', rounding: 'up' },
      { kind: 'independent', contribution: 'full' },
      { kind: 'independent', evaluate: () => true },
    ];

    for (const [index, value] of malformed.entries()) {
      const validProvider = provider(`invalid-contribution-${index}`, { kind: 'independent' });
      const invalidProvider = {
        ...validProvider,
        multiclassSlotContribution: value,
      } as unknown as SpellcastingProviderDefinition;
      const entry = homebrewClass(`invalid-provider-${index}`, EMPTY_PROFICIENCIES, [invalidProvider]);
      const codes = issueCodes(entry);
      expect(codes.some((code) => code === 'multiclass-slot-contribution' || code === 'multiclass-slot-contribution-executable')).toBe(true);
    }
  });
});
