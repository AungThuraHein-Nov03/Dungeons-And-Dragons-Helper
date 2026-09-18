import { describe, expect, it } from 'vitest';
import { contentRegistry } from '../../services/contentRegistry';

const expected = ['Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex'];

describe('SRD Weapon Mastery', () => {
  it('contains the complete verified SRD mastery list', () => {
    expect(contentRegistry.getAll('weaponMastery').map((entry) => entry.name)).toEqual(expected);
  });

  it('resolves every weapon mastery reference', () => {
    for (const weapon of contentRegistry.getAll('weapon')) {
      expect(contentRegistry.findMastery(weapon.masteryId), weapon.name).toBeDefined();
    }
  });
});
