import { describe, expect, it } from 'vitest';
import { SRD_CLASSES, SRD_CONTENT, srdId } from './index';
import type { AbilityScores } from '../../models/character';
import { validateContentDataset } from '../../services/contentValidation';
import {
  MULTICLASS_PRIMARY_ABILITY_MINIMUM,
  MULTICLASS_SPELLCASTER_SLOT_PROGRESSION,
  meetsMulticlassPrimaryAbilityRequirement,
} from '../../rules/multiclass';

describe('Milestone 14-A multiclass content contract', () => {
  it('freezes the exact added-class proficiency contract for all 12 bundled classes', () => {
    expect(SRD_CLASSES).toHaveLength(12);

    const expected = {
      [srdId('class', 'barbarian')]: {
        weaponProficiencies: [{ kind: 'category', category: 'martial' }],
        armorTraining: ['shield'],
        toolProficiencies: [],
      },
      [srdId('class', 'bard')]: {
        weaponProficiencies: [],
        armorTraining: ['light'],
        skillChoices: { kind: 'any-skill', choose: 1 },
        toolProficiencies: [],
        toolChoices: [{ kind: 'category', id: 'musical-instrument', name: 'Musical Instrument', choose: 1, category: 'musical-instrument' }],
      },
      [srdId('class', 'cleric')]: {
        weaponProficiencies: [],
        armorTraining: ['light', 'medium', 'shield'],
        toolProficiencies: [],
      },
      [srdId('class', 'druid')]: {
        weaponProficiencies: [],
        armorTraining: ['light', 'shield'],
        toolProficiencies: [],
      },
      [srdId('class', 'fighter')]: {
        weaponProficiencies: [{ kind: 'category', category: 'martial' }],
        armorTraining: ['light', 'medium', 'shield'],
        toolProficiencies: [],
      },
      [srdId('class', 'monk')]: {
        weaponProficiencies: [],
        armorTraining: [],
        toolProficiencies: [],
      },
      [srdId('class', 'paladin')]: {
        weaponProficiencies: [{ kind: 'category', category: 'martial' }],
        armorTraining: ['light', 'medium', 'shield'],
        toolProficiencies: [],
      },
      [srdId('class', 'ranger')]: {
        weaponProficiencies: [{ kind: 'category', category: 'martial' }],
        armorTraining: ['light', 'medium', 'shield'],
        skillChoices: { kind: 'class-skill-list', choose: 1 },
        toolProficiencies: [],
      },
      [srdId('class', 'rogue')]: {
        weaponProficiencies: [],
        armorTraining: ['light'],
        skillChoices: { kind: 'class-skill-list', choose: 1 },
        toolProficiencies: [{ id: 'thieves-tools', name: 'Thieves’ Tools' }],
      },
      [srdId('class', 'sorcerer')]: {
        weaponProficiencies: [],
        armorTraining: [],
        toolProficiencies: [],
      },
      [srdId('class', 'warlock')]: {
        weaponProficiencies: [],
        armorTraining: ['light'],
        toolProficiencies: [],
      },
      [srdId('class', 'wizard')]: {
        weaponProficiencies: [],
        armorTraining: [],
        toolProficiencies: [],
      },
    };

    expect(Object.fromEntries(SRD_CLASSES.map((entry) => [entry.id, entry.multiclassProficiencies]))).toEqual(expected);
  });

  it('keeps added-class saving-throw grants out of the multiclass proficiency contract', () => {
    for (const entry of SRD_CLASSES) {
      expect(Object.keys(entry.multiclassProficiencies)).not.toContain('savingThrowProficiencies');
    }
  });

  it('interprets ClassPrimaryAbility generically at the exact score-13 threshold', () => {
    expect(MULTICLASS_PRIMARY_ABILITY_MINIMUM).toBe(13);
    const scores = (overrides: Partial<AbilityScores> = {}): AbilityScores => ({
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
      ...overrides,
    });

    expect(meetsMulticlassPrimaryAbilityRequirement(
      { mode: 'one-of', abilities: ['strength', 'dexterity'] },
      scores({ strength: 12, dexterity: 13 }),
    )).toBe(true);
    expect(meetsMulticlassPrimaryAbilityRequirement(
      { mode: 'one-of', abilities: ['strength', 'dexterity'] },
      scores({ strength: 12, dexterity: 12 }),
    )).toBe(false);
    expect(meetsMulticlassPrimaryAbilityRequirement(
      { mode: 'all-of', abilities: ['dexterity', 'wisdom'] },
      scores({ dexterity: 13, wisdom: 13 }),
    )).toBe(true);
    expect(meetsMulticlassPrimaryAbilityRequirement(
      { mode: 'all-of', abilities: ['strength', 'charisma'] },
      scores({ strength: 13, charisma: 12 }),
    )).toBe(false);
    expect(meetsMulticlassPrimaryAbilityRequirement(
      { mode: 'one-of', abilities: ['intelligence'] },
      scores({ intelligence: 13 }),
    )).toBe(true);
  });

  it('freezes the exact bundled provider multiclass slot-contribution classifications', () => {
    const providers = SRD_CLASSES.flatMap((entry) =>
      entry.progression.flatMap((row) => row.features.flatMap((feature) => feature.spellcasting ?? [])));

    expect(providers).toHaveLength(8);
    expect(Object.fromEntries(providers.map((provider) => [provider.id, provider.multiclassSlotContribution]))).toEqual({
      [srdId('spellcasting-provider', 'bard:spellcasting')]: { kind: 'spellcasting', contribution: 'full' },
      [srdId('spellcasting-provider', 'cleric:spellcasting')]: { kind: 'spellcasting', contribution: 'full' },
      [srdId('spellcasting-provider', 'druid:spellcasting')]: { kind: 'spellcasting', contribution: 'full' },
      [srdId('spellcasting-provider', 'paladin:spellcasting')]: { kind: 'spellcasting', contribution: 'half', rounding: 'up' },
      [srdId('spellcasting-provider', 'ranger:spellcasting')]: { kind: 'spellcasting', contribution: 'half', rounding: 'up' },
      [srdId('spellcasting-provider', 'sorcerer:spellcasting')]: { kind: 'spellcasting', contribution: 'full' },
      [srdId('spellcasting-provider', 'warlock:pact-magic')]: { kind: 'pact-magic' },
      [srdId('spellcasting-provider', 'wizard:spellcasting')]: { kind: 'spellcasting', contribution: 'full' },
    });
  });

  it('freezes the complete canonical 2024 Multiclass Spellcaster slot table for levels 1 through 20', () => {
    const expectedCounts = [
      [2],
      [3],
      [4, 2],
      [4, 3],
      [4, 3, 2],
      [4, 3, 3],
      [4, 3, 3, 1],
      [4, 3, 3, 2],
      [4, 3, 3, 3, 1],
      [4, 3, 3, 3, 2],
      [4, 3, 3, 3, 2, 1],
      [4, 3, 3, 3, 2, 1],
      [4, 3, 3, 3, 2, 1, 1],
      [4, 3, 3, 3, 2, 1, 1],
      [4, 3, 3, 3, 2, 1, 1, 1],
      [4, 3, 3, 3, 2, 1, 1, 1],
      [4, 3, 3, 3, 2, 1, 1, 1, 1],
      [4, 3, 3, 3, 3, 1, 1, 1, 1],
      [4, 3, 3, 3, 3, 2, 1, 1, 1],
      [4, 3, 3, 3, 3, 2, 2, 1, 1],
    ];

    expect(MULTICLASS_SPELLCASTER_SLOT_PROGRESSION).toEqual(expectedCounts.map((counts, index) => ({
      level: index + 1,
      slots: counts.map((maximum, slotIndex) => ({ spellLevel: slotIndex + 1, maximum })),
    })));
  });

  it('keeps the complete bundled SRD dataset valid under the hardened M14-A content contract', () => {
    expect(validateContentDataset(SRD_CONTENT)).toEqual([]);
  });
});
