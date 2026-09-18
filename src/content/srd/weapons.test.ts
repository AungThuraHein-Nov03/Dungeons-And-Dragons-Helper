import { describe, expect, it } from 'vitest';
import { contentRegistry } from '../../services/contentRegistry';
import { srdId } from './source';

const weapon = (slug: string) => contentRegistry.findWeapon(srdId('weapon', slug))!;

describe('SRD weapons', () => {
  it('imports all 38 SRD weapon table entries', () => {
    expect(contentRegistry.getAll('weapon')).toHaveLength(38);
  });

  it('models Scimitar and its Nick mastery reference', () => {
    const scimitar = weapon('scimitar');
    expect(scimitar).toMatchObject({ category: 'martial', mode: 'melee', damage: { kind: 'dice', count: 1, die: 6 }, damageType: 'slashing', weightPounds: 3 });
    expect(scimitar.properties.map((property) => property.type)).toEqual(['finesse', 'light']);
    expect(contentRegistry.findMastery(scimitar.masteryId)?.name).toBe('Nick');
  });

  it('models Light Crossbow range, ammunition, loading, and mastery', () => {
    const crossbow = weapon('light-crossbow');
    expect(crossbow.damage).toEqual({ kind: 'dice', count: 1, die: 8 });
    expect(crossbow.properties).toContainEqual({ type: 'ammunition', range: { normal: 80, long: 320 }, ammunition: 'bolt' });
    expect(crossbow.properties.map((property) => property.type)).toEqual(['ammunition', 'loading', 'two-handed']);
    expect(contentRegistry.findMastery(crossbow.masteryId)?.name).toBe('Slow');
  });

  it('models versatile and thrown weapons structurally', () => {
    expect(weapon('longsword').properties).toContainEqual({ type: 'versatile', alternateDamage: { kind: 'dice', count: 1, die: 10 } });
    expect(weapon('javelin').properties).toContainEqual({ type: 'thrown', range: { normal: 30, long: 120 } });
  });

  it('supports the fixed-damage Blowgun entry', () => {
    expect(weapon('blowgun').damage).toEqual({ kind: 'fixed', amount: 1 });
  });
});
