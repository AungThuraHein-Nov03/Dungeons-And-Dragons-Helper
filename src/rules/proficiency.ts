import type { ClassContent } from '../models/content';
import { ruleError, ruleOk, type RuleResult } from './result';

export function deriveProficiencyBonus(level: number, classContent: ClassContent): RuleResult<number> {
  const progression = classContent.progression.find((row) => row.level === level);
  if (!progression) {
    return ruleError('invalid-level', `Class ${classContent.name} has no progression data for level ${level}.`, classContent.id);
  }
  return ruleOk(progression.proficiencyBonus);
}
