import type { CharacterInput, ClassHpProgressionEntry } from '../models/character';
import type { CharacterRuleEffect, ClassContent, DieSize } from '../models/content';
import type { ContentRegistry } from '../services/contentRegistry';
import { calculateAbilityModifier } from './abilities';
import { getSingleClassProgression, getTotalCharacterLevel } from './characterProgression';
import { ruleError, ruleOk, type RuleResult } from './result';
import type { DerivedHealth, DerivedRuleEffectSource } from './types';

export function createFixedHpProgression(classLevel: number, startingClass = true): ClassHpProgressionEntry[] {
  const firstRecordedLevel = startingClass ? 2 : 1;
  return Array.from({ length: Math.max(0, classLevel - firstRecordedLevel + 1) }, (_, index) => ({
    classLevel: firstRecordedLevel + index,
    method: 'fixed' as const,
  }));
}

export function validateHpProgression(
  progression: readonly ClassHpProgressionEntry[],
  classLevel: number,
  hitDie: number,
  startingClass = true,
): string | undefined {
  if (!Number.isInteger(classLevel) || classLevel < 1) return 'Class level must be a positive whole number.';
  const firstRecordedLevel = startingClass ? 2 : 1;
  const expectedCount = Math.max(0, classLevel - firstRecordedLevel + 1);
  if (progression.length !== expectedCount) {
    return startingClass
      ? `HP progression must contain one entry for every class level from 2 through ${classLevel}.`
      : `HP progression must contain one entry for every class level from 1 through ${classLevel}.`;
  }
  const expectedLevels = new Set(Array.from({ length: expectedCount }, (_, index) => firstRecordedLevel + index));
  for (const entry of progression) {
    if (!expectedLevels.delete(entry.classLevel)) return `HP progression contains an invalid or duplicate class level ${entry.classLevel}.`;
    if (entry.method === 'rolled' && (!Number.isInteger(entry.roll) || entry.roll < 1 || entry.roll > hitDie)) {
      return `Rolled HP for class level ${entry.classLevel} must be a whole number from 1 to ${hitDie}.`;
    }
    if (entry.method === 'fixed' && 'roll' in entry) return `Fixed HP for class level ${entry.classLevel} cannot include a roll.`;
  }
  return expectedLevels.size ? 'HP progression is missing one or more class levels.' : undefined;
}

export function deriveHealth(
  character: CharacterInput,
  classContent: ClassContent,
  effects: readonly CharacterRuleEffect[] = [],
): RuleResult<DerivedHealth> {
  const single = getSingleClassProgression(character);
  if (!single.ok) return single;
  const progression = single.value;
  if (progression.classId !== classContent.id) return ruleError('missing-class', 'Single-class progression does not match the resolved class.', progression.classId);
  const progressionError = validateHpProgression(progression.hpProgression, progression.level, classContent.hitDie, true);
  if (progressionError) return ruleError('invalid-hp-progression', progressionError, classContent.id);

  const constitutionModifier = calculateAbilityModifier(character.abilityScores.constitution);
  let maximumHp = Math.max(1, classContent.hitDie + constitutionModifier);

  for (const entry of progression.hpProgression) {
    const base = entry.method === 'fixed' ? classContent.fixedHitPointsPerLevel : entry.roll;
    maximumHp += Math.max(1, base + constitutionModifier);
  }

  maximumHp += effects
    .filter((effect): effect is Extract<CharacterRuleEffect, { type: 'hit-point-bonus-per-class-level' }> => effect.type === 'hit-point-bonus-per-class-level')
    .reduce((total, effect) => total + effect.amount * progression.level, 0);

  return ruleOk({ maximumHp, hitDice: [{ die: classContent.hitDie, maximum: progression.level }] });
}

export function deriveMulticlassHealth(
  character: CharacterInput,
  registry: ContentRegistry,
  sources: readonly DerivedRuleEffectSource[],
): RuleResult<DerivedHealth> {
  const constitutionModifier = calculateAbilityModifier(character.abilityScores.constitution);
  let maximumHp = 0;
  const hitDiceBySize = new Map<DieSize, number>();

  for (const progression of character.classProgressions) {
    const classContent = registry.findClass(progression.classId);
    if (!classContent) return ruleError('missing-class', `Character class could not be resolved: ${progression.classId}`, progression.classId);
    const starting = progression.classId === character.startingClassId;
    const progressionError = validateHpProgression(progression.hpProgression, progression.level, classContent.hitDie, starting);
    if (progressionError) return ruleError('invalid-hp-progression', progressionError, classContent.id);

    if (starting) maximumHp += Math.max(1, classContent.hitDie + constitutionModifier);
    for (const entry of progression.hpProgression) {
      const base = entry.method === 'fixed' ? classContent.fixedHitPointsPerLevel : entry.roll;
      maximumHp += Math.max(1, base + constitutionModifier);
    }
    hitDiceBySize.set(classContent.hitDie, (hitDiceBySize.get(classContent.hitDie) ?? 0) + progression.level);
  }

  const characterLevel = getTotalCharacterLevel(character);
  for (const source of sources) {
    const sourceLevel = source.owner?.level ?? characterLevel;
    for (const effect of source.effects) {
      if (effect.type === 'hit-point-bonus-per-class-level') maximumHp += effect.amount * sourceLevel;
    }
  }

  return ruleOk({
    maximumHp,
    hitDice: [...hitDiceBySize.entries()]
      .sort(([left], [right]) => left - right)
      .map(([die, maximum]) => ({ die, maximum })),
  });
}
