import { describe, expect, it } from 'vitest';
import { coverSavingThrowContext, deriveCoverContext } from './cover';

describe('M13A temporary Cover context', () => {
  it('derives None, Half, Three-Quarters, and Total Cover without inventing Total Cover AC', () => {
    expect(deriveCoverContext('none')).toMatchObject({ armorClassBonus: 0, dexteritySaveBonus: 0, blocksDirectTargeting: false });
    expect(deriveCoverContext('half')).toMatchObject({ armorClassBonus: 2, dexteritySaveBonus: 2, blocksDirectTargeting: false });
    expect(deriveCoverContext('three-quarters')).toMatchObject({ armorClassBonus: 5, dexteritySaveBonus: 5, blocksDirectTargeting: false });
    expect(deriveCoverContext('total')).toMatchObject({ armorClassBonus: null, dexteritySaveBonus: 0, blocksDirectTargeting: true });
  });

  it('contributes only to Dexterity saving throws', () => {
    expect(coverSavingThrowContext('half', 'dexterity')).toEqual({ modifiers: [{ label: 'Half Cover', amount: 2 }] });
    expect(coverSavingThrowContext('three-quarters', 'dexterity')).toEqual({ modifiers: [{ label: 'Three-Quarters Cover', amount: 5 }] });
    expect(coverSavingThrowContext('half', 'strength')).toBeUndefined();
    expect(coverSavingThrowContext('three-quarters', 'wisdom')).toBeUndefined();
    expect(coverSavingThrowContext('total', 'dexterity')).toBeUndefined();
    expect(coverSavingThrowContext('none', 'dexterity')).toBeUndefined();
  });
});
