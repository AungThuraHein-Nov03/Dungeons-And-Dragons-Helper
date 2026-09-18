import { describe, expect, it } from 'vitest';
import { contentRegistry } from '../../services/contentRegistry';
import { srdId } from './source';

const armor = (slug: string) => contentRegistry.findArmor(srdId('armor', slug))!;

describe('SRD armor', () => {
  it('imports 12 armor suits plus Shield', () => {
    expect(contentRegistry.getAll('armor')).toHaveLength(13);
  });

  it('models representative light, medium, heavy, and shield AC structures', () => {
    expect(armor('leather-armor').armorClass).toEqual({ kind: 'armor', base: 11, dexterity: 'full' });
    expect(armor('half-plate-armor').armorClass).toEqual({ kind: 'armor', base: 15, dexterity: 'capped', dexterityCap: 2 });
    expect(armor('chain-mail')).toMatchObject({ armorClass: { kind: 'armor', base: 16, dexterity: 'none' }, strengthRequirement: 13, stealthDisadvantage: true });
    expect(armor('shield').armorClass).toEqual({ kind: 'shield', bonus: 2 });
  });
});
