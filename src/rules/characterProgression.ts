import type { CharacterClassProgression, CharacterInput } from '../models/character';
import type { ContentId } from '../models/contentId';
import { ruleError, ruleOk, type RuleResult } from './result';

export function getTotalCharacterLevel(character: Pick<CharacterInput, 'classProgressions'>): number {
  return character.classProgressions.reduce((total, progression) => total + progression.level, 0);
}

export function getClassProgression(
  character: Pick<CharacterInput, 'classProgressions'>,
  classId: ContentId,
): RuleResult<CharacterClassProgression> {
  const matches = character.classProgressions.filter((progression) => progression.classId === classId);
  if (matches.length !== 1) {
    return ruleError(
      'multiclass-derivation-not-supported',
      `Expected exactly one progression for class ${classId}; received ${matches.length}.`,
      classId,
    );
  }
  return ruleOk(matches[0]);
}

export function getStartingClassProgression(
  character: Pick<CharacterInput, 'startingClassId' | 'classProgressions'>,
): RuleResult<CharacterClassProgression> {
  const progression = getClassProgression(character, character.startingClassId);
  if (!progression.ok) {
    return ruleError(
      'multiclass-derivation-not-supported',
      `Starting class ${character.startingClassId} must resolve exactly one stored class progression.`,
      character.startingClassId,
    );
  }
  return progression;
}

export function getSingleClassProgression(
  character: Pick<CharacterInput, 'classProgressions'>,
): RuleResult<CharacterClassProgression> {
  if (character.classProgressions.length !== 1) {
    return ruleError(
      'multiclass-derivation-not-supported',
      `This runtime path requires exactly one class progression; received ${character.classProgressions.length}.`,
    );
  }
  const iterator = character.classProgressions.values();
  const onlyProgression = iterator.next();
  if (onlyProgression.done) {
    return ruleError(
      'multiclass-derivation-not-supported',
      'This runtime path requires exactly one class progression; received 0.',
    );
  }
  return ruleOk(onlyProgression.value);
}
