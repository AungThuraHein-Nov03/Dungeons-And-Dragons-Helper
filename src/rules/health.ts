import type { CharacterInput, HpProgressionEntry } from '../models/character';
import type { CharacterRuleEffect, ClassContent } from '../models/content';
import { calculateAbilityModifier } from './abilities';
import { ruleError, ruleOk, type RuleResult } from './result';
import type { DerivedHealth } from './types';

export function createFixedHpProgression(level: number): HpProgressionEntry[] {
  return Array.from({ length: Math.max(0, level - 1) }, (_, index) => ({
    level: index + 2,
    method: 'fixed' as const,
  }));
}

export function validateHpProgression(
  progression: readonly HpProgressionEntry[],
  level: number,
  hitDie: number,
): string | undefined {
  if (!Number.isInteger(level) || level < 1) return 'Character level must be a positive whole number.';
  if (progression.length !== Math.max(0, level - 1)) {
    return `HP progression must contain one entry for every level from 2 through ${level}.`;
  }
  const expectedLevels = new Set(Array.from({ length: Math.max(0, level - 1) }, (_, index) => index + 2));
  for (const entry of progression) {
    if (!expectedLevels.delete(entry.level)) return `HP progression contains an invalid or duplicate level ${entry.level}.`;
    if (entry.method === 'rolled' && (!Number.isInteger(entry.roll) || entry.roll < 1 || entry.roll > hitDie)) {
      return `Rolled HP for level ${entry.level} must be a whole number from 1 to ${hitDie}.`;
    }
  }
  return expectedLevels.size ? 'HP progression is missing one or more character levels.' : undefined;
}

export function deriveHealth(
  character: CharacterInput,
  classContent: ClassContent,
  effects: readonly CharacterRuleEffect[] = [],
): RuleResult<DerivedHealth> {
  const progressionError = validateHpProgression(character.hpProgression, character.level, classContent.hitDie);
  if (progressionError) return ruleError('invalid-hp-progression', progressionError, classContent.id);

  const constitutionModifier = calculateAbilityModifier(character.abilityScores.constitution);
  let maximumHp = Math.max(1, classContent.hitDie + constitutionModifier);

  for (const entry of character.hpProgression) {
    const base = entry.method === 'fixed' ? classContent.fixedHitPointsPerLevel : entry.roll;
    maximumHp += Math.max(1, base + constitutionModifier);
  }

  maximumHp += effects
    .filter((effect): effect is Extract<CharacterRuleEffect, { type: 'hit-point-bonus-per-class-level' }> => effect.type === 'hit-point-bonus-per-class-level')
    .reduce((total, effect) => total + effect.amount * character.level, 0);

  return ruleOk({
    maximumHp,
    hitDie: classContent.hitDie,
    maximumHitDice: character.level,
  });
}
