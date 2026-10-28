import { describe, expect, it } from 'vitest';
import { SRD_CONTENT, SRD_FIGHTER, srdId } from '../content/srd';
import type { ArmorContent, ClassContent } from '../models/content';
import { ContentRegistry, contentRegistry } from '../services/contentRegistry';
import { fighterCharacter, SHIELD_ID } from '../test/fixtures';
import { deriveAbilityModifiers } from './abilities';
import { deriveDefense } from './armor';

function defense(armorId?: string, shieldId?: string, classContent: ClassContent = SRD_FIGHTER) {
  const character = fighterCharacter({ equipment: { equippedWeaponIds: [], ...(armorId ? { equippedArmorId: armorId } : {}), ...(shieldId ? { equippedShieldId: shieldId } : {}) } });
  return deriveDefense(character, classContent, contentRegistry, deriveAbilityModifiers(character.abilityScores));
}

describe('armor class', () => {
  it.each([
    ['studded-leather-armor', 18], ['half-plate-armor', 19], ['chain-mail', 18],
  ])('adds an equipped %s bonus after its existing Dexterity rule', (slug, expectedAc) => {
    const armor: ArmorContent = { ...contentRegistry.findArmor(srdId('armor', slug))!, id: `homebrew:test:armor:${slug}`, source: { type: 'homebrew', namespace: 'test' }, armorClassBonus: 2 };
    const registry = new ContentRegistry(SRD_CONTENT, [armor]);
    const character = fighterCharacter({ equipment: { equippedArmorId: armor.id } });
    expect(deriveDefense(character, SRD_FIGHTER, registry, deriveAbilityModifiers(character.abilityScores))).toMatchObject({ ok: true, value: { armorClass: expectedAc } });
  });

  it('adds only equipped armor and trained shield bonuses, preserving other armor effects', () => {
    const armor: ArmorContent = { ...contentRegistry.findArmor(srdId('armor', 'chain-mail'))!, id: 'homebrew:test:armor:bright-mail', source: { type: 'homebrew', namespace: 'test' }, armorClassBonus: 2 };
    const shield: ArmorContent = { ...contentRegistry.findArmor(SHIELD_ID)!, id: 'homebrew:test:armor:bright-shield', source: { type: 'homebrew', namespace: 'test' }, armorClassBonus: 3 };
    const registry = new ContentRegistry(SRD_CONTENT, [armor, shield]);
    const character = fighterCharacter({ equipment: { equippedArmorId: armor.id, equippedShieldId: shield.id } });
    const modifiers = deriveAbilityModifiers(character.abilityScores);
    expect(deriveDefense(character, SRD_FIGHTER, registry, modifiers, [{ type: 'armor-class-bonus', armorCategories: ['heavy'], amount: 1 }])).toMatchObject({ ok: true, value: { armorClass: 24, shield: { bonusApplied: 5 } } });
    expect(deriveDefense(character, { ...SRD_FIGHTER, armorTraining: [] }, registry, modifiers)).toMatchObject({ ok: true, value: { armorClass: 18, armor: { trained: false }, shield: { trained: false, bonusApplied: 0 } } });
    character.inventory = character.inventory.map((entry) => ({ ...entry, equipped: false }));
    expect(deriveDefense(character, SRD_FIGHTER, registry, modifiers)).toMatchObject({ ok: true, value: { armorClass: 14, armor: null, shield: null } });
  });

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
