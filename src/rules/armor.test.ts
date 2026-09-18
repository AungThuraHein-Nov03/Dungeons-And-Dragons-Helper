import { describe, expect, it } from 'vitest';
import { SRD_FIGHTER, srdId } from '../content/srd';
import type { ClassContent } from '../models/content';
import { contentRegistry } from '../services/contentRegistry';
import { fighterCharacter, SHIELD_ID } from '../test/fixtures';
import { deriveAbilityModifiers } from './abilities';
import { deriveDefense } from './armor';

function defense(armorId?: string, shieldId?: string, classContent: ClassContent = SRD_FIGHTER) {
  const character = fighterCharacter({ equipment: { equippedWeaponIds: [], ...(armorId ? { equippedArmorId: armorId } : {}), ...(shieldId ? { equippedShieldId: shieldId } : {}) } });
  return deriveDefense(character, classContent, contentRegistry, deriveAbilityModifiers(character.abilityScores));
}

describe('armor class', () => {
  it('supports unarmored, light, medium-capped, and heavy armor', () => {
    expect(defense()).toMatchObject({ ok: true, value: { armorClass: 14, armor: null } });
    expect(defense(srdId('armor', 'studded-leather-armor'))).toMatchObject({ ok: true, value: { armorClass: 16, armor: { trained: true, category: 'light' } } });
    expect(defense(srdId('armor', 'half-plate-armor'))).toMatchObject({ ok: true, value: { armorClass: 17, armor: { trained: true, category: 'medium' } } });
    expect(defense(srdId('armor', 'chain-mail'))).toMatchObject({ ok: true, value: { armorClass: 16, armor: { trained: true, category: 'heavy' } } });
  });

  it('applies a trained shield bonus and exposes training status', () => {
    expect(defense(undefined, SHIELD_ID)).toMatchObject({ ok: true, value: { armorClass: 16, shield: { trained: true, bonusApplied: 2 } } });
  });

  it('does not apply a shield AC bonus when the class lacks shield training', () => {
    const untrainedClass: ClassContent = { ...SRD_FIGHTER, armorTraining: [] };
    expect(defense(undefined, SHIELD_ID, untrainedClass)).toMatchObject({ ok: true, value: { armorClass: 14, shield: { trained: false, bonusApplied: 0 } } });
  });

  it('ignores an unresolved equipped armor reference safely', () => {
    const result = defense('srd-5.2.1:armor:not-real');
    expect(result).toMatchObject({ ok: true, value: { armorClass: 14, armor: null } });
  });
});
