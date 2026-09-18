import { describe, expect, it } from 'vitest';
import { contentRegistry } from './contentRegistry';
import { srdId } from '../content/srd';

describe('M13E authoritative catalog boundaries', () => {
  it('keeps the exact bundled content counts unchanged', () => {
    expect(contentRegistry.getAll('species')).toHaveLength(9);
    expect(contentRegistry.getAll('class')).toHaveLength(12);
    expect(contentRegistry.getAll('subclass')).toHaveLength(12);
    expect(contentRegistry.getAll('spell')).toHaveLength(339);
    expect(contentRegistry.getAll('feat')).toHaveLength(17);
  });

  it('keeps Tough absent from the bundled SRD feat catalog', () => {
    const feats = contentRegistry.getAll('feat');
    expect(feats.some((feat) => feat.name === 'Tough')).toBe(false);
    expect(contentRegistry.findFeat(srdId('feat', 'tough'))).toBeUndefined();
  });

  it('keeps the exact nine bundled Species identities', () => {
    expect(contentRegistry.getAll('species').map((species) => species.name)).toEqual([
      'Dragonborn',
      'Dwarf',
      'Elf',
      'Gnome',
      'Goliath',
      'Halfling',
      'Human',
      'Orc',
      'Tiefling',
    ]);
  });

  it('keeps the exact seventeen bundled Feat identities', () => {
    expect(contentRegistry.getAll('feat').map((feat) => feat.name)).toEqual([
      'Alert',
      'Magic Initiate',
      'Savage Attacker',
      'Skilled',
      'Ability Score Improvement',
      'Grappler',
      'Archery',
      'Defense',
      'Great Weapon Fighting',
      'Two-Weapon Fighting',
      'Boon of Combat Prowess',
      'Boon of Dimensional Travel',
      'Boon of Fate',
      'Boon of Irresistible Offense',
      'Boon of Spell Recall',
      'Boon of the Night Spirit',
      'Boon of Truesight',
    ]);
  });
});
