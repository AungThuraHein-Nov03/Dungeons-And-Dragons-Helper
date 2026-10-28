import { srdId } from '../content/srd';
import type { DerivedCharacterState, DerivedWeaponAttack } from './types';

const SNEAK_ATTACK_FEATURE_ID = srdId('class-feature', 'rogue:sneak-attack');

export function deriveSneakAttackDice(state: DerivedCharacterState): number {
  const owner = state.classProgressions.find((progression) =>
    progression.acquiredFeatures.some((feature) => feature.id === SNEAK_ATTACK_FEATURE_ID),
  );
  return owner ? Math.ceil(owner.classLevel / 2) : 0;
}

export function isSneakAttackWeaponEligible(attack: DerivedWeaponAttack): boolean {
  return attack.useMode === 'ranged' || attack.properties.some((property) => property.type === 'finesse');
}
