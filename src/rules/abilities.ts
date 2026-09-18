import { ABILITY_KEYS, type AbilityScores } from '../models/character';
import type { DerivedAbilityModifiers } from './types';

export function calculateAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function deriveAbilityModifiers(scores: AbilityScores): DerivedAbilityModifiers {
  return ABILITY_KEYS.reduce((modifiers, ability) => {
    modifiers[ability] = calculateAbilityModifier(scores[ability]);
    return modifiers;
  }, {} as DerivedAbilityModifiers);
}
