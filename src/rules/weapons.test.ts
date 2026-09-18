import { describe, expect, it } from 'vitest';
import { SRD_CONTENT, SRD_FIGHTER, srdId } from '../content/srd';
import type { WeaponContent } from '../models/content';
import { ContentRegistry, contentRegistry } from '../services/contentRegistry';
import { fighterCharacter, LIGHT_CROSSBOW_ID, SCIMITAR_ID } from '../test/fixtures';
import { deriveAbilityModifiers } from './abilities';
import { deriveWeaponAttack, getWeaponAttackAbilityOptions } from './weapons';

function attack(weaponId: string, options: Parameters<typeof deriveWeaponAttack>[5] = {}, character = fighterCharacter()) {
  return deriveWeaponAttack(character, SRD_FIGHTER, contentRegistry, deriveAbilityModifiers(character.abilityScores), weaponId, options);
}

describe('weapon attack foundation', () => {
  it('derives simple ranged weapon proficiency, Dexterity attack, damage, and mastery metadata', () => {
    const result = attack(LIGHT_CROSSBOW_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ proficient: true, attackAbility: 'dexterity', attackModifier: 6, mastery: { name: 'Slow', canPotentiallyUse: true } });
    expect(result.value.damage).toEqual({ base: { kind: 'dice', count: 1, die: 8 }, abilityModifier: 4, damageType: 'piercing' });
  });

  it('keeps Finesse ability choice explicit and derives the selected Dexterity attack', () => {
    const character = fighterCharacter({ equipment: { equippedWeaponIds: [SCIMITAR_ID] }, weaponAttackAbilityChoices: { [SCIMITAR_ID]: 'dexterity' } });
    const result = attack(SCIMITAR_ID, {}, character);
    expect(getWeaponAttackAbilityOptions(contentRegistry.findWeapon(SCIMITAR_ID)!)).toEqual(['strength', 'dexterity']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.attackAbility).toBe('dexterity');
    expect(result.value.attackModifier).toBe(6);
    expect(result.value.damage).toEqual({ base: { kind: 'dice', count: 1, die: 6 }, abilityModifier: 4, damageType: 'slashing' });
    expect(result.value.mastery.name).toBe('Nick');
  });

  it('uses Strength for ordinary melee and thrown melee weapons', () => {
    const greatsword = attack(srdId('weapon', 'greatsword'));
    const handaxeThrown = attack(srdId('weapon', 'handaxe'), { useMode: 'thrown' });
    expect(greatsword).toMatchObject({ ok: true, value: { attackAbility: 'strength', attackModifier: 4, proficient: true } });
    expect(handaxeThrown).toMatchObject({ ok: true, value: { useMode: 'thrown', attackAbility: 'strength', attackModifier: 4 } });
  });

  it('allows Dexterity on a thrown Finesse weapon', () => {
    expect(attack(srdId('weapon', 'dagger'), { useMode: 'thrown', attackAbility: 'dexterity' })).toMatchObject({ ok: true, value: { attackAbility: 'dexterity', attackModifier: 6 } });
  });

  it('exposes both Versatile melee configurations but not a two-handed thrown configuration', () => {
    const quarterstaff = attack(srdId('weapon', 'quarterstaff'));
    expect(quarterstaff.ok).toBe(true);
    if (quarterstaff.ok) expect(quarterstaff.value.damageConfigurations.map((entry) => [entry.mode, entry.base])).toEqual([
      ['one-handed', { kind: 'dice', count: 1, die: 6 }],
      ['two-handed', { kind: 'dice', count: 1, die: 8 }],
    ]);
    const spearThrown = attack(srdId('weapon', 'spear'), { useMode: 'thrown' });
    expect(spearThrown.ok).toBe(true);
    if (spearThrown.ok) expect(spearThrown.value.damageConfigurations).toHaveLength(1);
  });

  it('rejects invalid attack abilities and unknown weapon ids predictably', () => {
    const invalidAbility = attack(srdId('weapon', 'greatsword'), { attackAbility: 'wisdom' });
    expect(invalidAbility.ok).toBe(false);
    if (!invalidAbility.ok) expect(invalidAbility.error.code).toBe('invalid-attack-ability');
    const missing = attack('srd-5.2.1:weapon:not-real');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe('missing-weapon');
  });

  it('uses the same rules for structurally valid Homebrew weapons', () => {
    const source = structuredClone(contentRegistry.findWeapon(SCIMITAR_ID)!) as WeaponContent;
    const homebrew: WeaponContent = {
      ...source,
      id: 'homebrew:test:weapon:moonblade',
      name: 'Moonblade',
      source: { type: 'homebrew', namespace: 'test' },
    };
    const registry = new ContentRegistry(SRD_CONTENT, [homebrew]);
    const character = fighterCharacter({ equipment: { equippedWeaponIds: [homebrew.id] }, weaponAttackAbilityChoices: { [homebrew.id]: 'dexterity' } });
    const result = deriveWeaponAttack(character, SRD_FIGHTER, registry, deriveAbilityModifiers(character.abilityScores), homebrew.id);
    expect(result).toMatchObject({ ok: true, value: { name: 'Moonblade', attackModifier: 6, attackAbility: 'dexterity', mastery: { name: 'Nick' } } });
  });
});
