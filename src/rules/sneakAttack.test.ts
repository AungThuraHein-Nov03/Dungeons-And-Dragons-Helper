import { describe, expect, it } from 'vitest';
import { SRD_CONTENT, SRD_FIGHTER, srdId } from '../content/srd';
import type { WeaponContent } from '../models/content';
import { ContentRegistry, contentRegistry } from '../services/contentRegistry';
import { fighterCharacter } from '../test/fixtures';
import { deriveAbilityModifiers } from './abilities';
import { deriveWeaponAttack } from './weapons';
import type { DerivedCharacterState, DerivedWeaponAttack } from './types';
import { deriveSneakAttackDice, isSneakAttackWeaponEligible } from './sneakAttack';

const ROGUE_ID = srdId('class', 'rogue');
const FIGHTER_ID = srdId('class', 'fighter');
const SNEAK_ATTACK_ID = srdId('class-feature', 'rogue:sneak-attack');

function state(progressions: Array<{ id: string; level: number; sneakAttack?: boolean }>): DerivedCharacterState {
  return {
    classProgressions: progressions.map((entry) => ({
      id: entry.id,
      classLevel: entry.level,
      acquiredFeatures: entry.sneakAttack ? [{ id: SNEAK_ATTACK_ID }] : [],
    })),
  } as unknown as DerivedCharacterState;
}

function attack(useMode: 'melee' | 'ranged', finesse = false): DerivedWeaponAttack {
  return {
    useMode,
    properties: finesse ? [{ type: 'finesse' }] : [],
  } as unknown as DerivedWeaponAttack;
}

describe('bounded Sneak Attack rules', () => {
  it.each([['scimitar', true], ['light-crossbow', true], ['quarterstaff', false]] as const)('preserves %s Sneak Attack eligibility with item bonuses', (slug, eligible) => {
    const weapon: WeaponContent = { ...contentRegistry.findWeapon(srdId('weapon', slug))!, id: `homebrew:test:weapon:${slug}`, source: { type: 'homebrew', namespace: 'test' }, attackBonus: 2, damageBonus: 3 };
    const registry = new ContentRegistry(SRD_CONTENT, [weapon]);
    const character = fighterCharacter();
    const result = deriveWeaponAttack(character, SRD_FIGHTER, registry, deriveAbilityModifiers(character.abilityScores), weapon.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isSneakAttackWeaponEligible(result.value)).toBe(eligible);
    expect(result.value.damageConfigurations.every((configuration) => configuration.damageBonus === 3)).toBe(true);
  });

  it.each([
    [1, 1],
    [2, 1],
    [3, 2],
    [5, 3],
  ])('scales Rogue %i as %id6 from the owning class level', (rogueLevel, expectedDice) => {
    expect(deriveSneakAttackDice(state([{ id: ROGUE_ID, level: rogueLevel, sneakAttack: true }]))).toBe(expectedDice);
  });

  it('uses Rogue class level rather than total Character level for Fighter 4 / Rogue 1', () => {
    expect(deriveSneakAttackDice(state([
      { id: FIGHTER_ID, level: 4 },
      { id: ROGUE_ID, level: 1, sneakAttack: true },
    ]))).toBe(1);
  });

  it('requires ownership of the canonical Sneak Attack feature rather than merely a Rogue class id', () => {
    expect(deriveSneakAttackDice(state([{ id: ROGUE_ID, level: 5 }]))).toBe(0);
  });

  it('accepts finesse melee and ranged weapons but rejects non-finesse melee weapons', () => {
    expect(isSneakAttackWeaponEligible(attack('melee', true))).toBe(true);
    expect(isSneakAttackWeaponEligible(attack('ranged'))).toBe(true);
    expect(isSneakAttackWeaponEligible(attack('melee'))).toBe(false);
  });
});
