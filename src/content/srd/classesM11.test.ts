import { describe, expect, it } from 'vitest';
import { SRD_BARBARIAN } from './barbarian';
import { SRD_CLERIC } from './cleric';
import { SRD_CLASSES } from './index';
import { SRD_ROGUE } from './rogue';
import { srdId } from './source';

describe('Milestone 11 SRD class conformance', () => {
  it('preserves the four M11 Classes with stable IDs inside the expanded bundled set', () => {
    expect(SRD_CLASSES.slice(0, 4).map((entry) => [entry.id, entry.name])).toEqual([
      [srdId('class', 'fighter'), 'Fighter'],
      [srdId('class', 'barbarian'), 'Barbarian'],
      [srdId('class', 'cleric'), 'Cleric'],
      [srdId('class', 'rogue'), 'Rogue'],
    ]);
    expect(SRD_CLASSES.every((entry) => entry.progression.length === 20)).toBe(true);
  });

  it('models Barbarian training, d12 health, Rage recovery, and Unarmored Defense generically', () => {
    expect(SRD_BARBARIAN.hitDie).toBe(12);
    expect(SRD_BARBARIAN.fixedHitPointsPerLevel).toBe(7);
    expect(SRD_BARBARIAN.savingThrowProficiencies).toEqual(['strength', 'constitution']);
    expect(SRD_BARBARIAN.armorTraining).toEqual(['light', 'medium', 'shield']);
    expect(SRD_BARBARIAN.skillChoices).toEqual({ choose: 2, from: ['animal-handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'] });
    expect(SRD_BARBARIAN.resources[0]).toMatchObject({
      name: 'Rage',
      maximum: { kind: 'level-table', values: [{ level: 1, uses: 2 }, { level: 3, uses: 3 }, { level: 6, uses: 4 }, { level: 12, uses: 5 }, { level: 17, uses: 6 }] },
      recovery: [{ trigger: 'short-rest', mode: 'amount', amount: 1 }, { trigger: 'long-rest', mode: 'all' }],
    });
    const unarmored = SRD_BARBARIAN.progression[0].features.find((feature) => feature.name === 'Unarmored Defense');
    expect(unarmored?.effects).toEqual([{ type: 'unarmored-armor-class', base: 10, abilities: ['dexterity', 'constitution'], allowShield: true }]);
  });

  it('models Cleric as a Wisdom prepared-from-list full caster without prepared ownership', () => {
    expect(SRD_CLERIC.hitDie).toBe(8);
    expect(SRD_CLERIC.primaryAbility).toEqual({ mode: 'one-of', abilities: ['wisdom'] });
    expect(SRD_CLERIC.savingThrowProficiencies).toEqual(['wisdom', 'charisma']);
    const spellcasting = SRD_CLERIC.progression[0].features.find((feature) => feature.name === 'Spellcasting')?.spellcasting?.[0];
    expect(spellcasting).toBeDefined();
    expect(spellcasting?.spellcastingAbility).toEqual({ kind: 'fixed', ability: 'wisdom' });
    expect(spellcasting?.spellManagement).toMatchObject({ kind: 'prepared-from-list', spellListId: 'cleric', replacement: 'long-rest-any' });
    if (!spellcasting || spellcasting.spellManagement.kind !== 'prepared-from-list') throw new Error('Cleric prepared provider missing.');
    expect(spellcasting.spellManagement.cantripCount[0]).toEqual({ level: 1, count: 3 });
    expect(spellcasting.spellManagement.preparedSpellCount[0]).toEqual({ level: 1, count: 4 });
    expect(spellcasting.slotPool?.progression[0].slots).toEqual([{ spellLevel: 1, maximum: 2 }]);
    expect(spellcasting.slotPool?.progression[19].slots).toEqual([
      { spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 3 }, { spellLevel: 3, maximum: 3 }, { spellLevel: 4, maximum: 3 },
      { spellLevel: 5, maximum: 3 }, { spellLevel: 6, maximum: 2 }, { spellLevel: 7, maximum: 2 }, { spellLevel: 8, maximum: 1 }, { spellLevel: 9, maximum: 1 },
    ]);
  });

  it('models Rogue choose-four skills, Thieves’ Tools, and property-qualified martial proficiency', () => {
    expect(SRD_ROGUE.skillChoices.choose).toBe(4);
    expect(SRD_ROGUE.toolProficiencies).toEqual([{ id: 'thieves-tools', name: 'Thieves’ Tools' }]);
    expect(SRD_ROGUE.weaponProficiencies).toEqual([
      { kind: 'category', category: 'simple' },
      { kind: 'category-with-property', category: 'martial', anyOfProperties: ['finesse', 'light'] },
    ]);
  });
});
