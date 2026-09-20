import { SKILL_IDS, isSkillId, type CharacterClassProgression, type CharacterInput, type SkillId } from '../models/character';
import type {
  ArmorCategory,
  ClassContent,
  ClassToolProficiency,
  MulticlassSkillProficiencyChoice,
  WeaponProficiencyRule,
} from '../models/content';
import type { ContentRegistry } from '../services/contentRegistry';
import { getStartingClassProgression } from './characterProgression';
import { ruleError, ruleOk, type RuleResult } from './result';

export interface DerivedClassProficiencyContext {
  readonly startingProgression: CharacterClassProgression;
  readonly startingClass: ClassContent;
  readonly savingThrowProficiencies: ClassContent['savingThrowProficiencies'];
  readonly skillProficiencies: readonly SkillId[];
  readonly weaponProficiencies: readonly WeaponProficiencyRule[];
  readonly armorTraining: readonly ArmorCategory[];
  readonly toolProficiencies: readonly ClassToolProficiency[];
}

function allowedMulticlassSkills(choice: MulticlassSkillProficiencyChoice, classContent: ClassContent): readonly SkillId[] {
  if (choice.kind === 'any-skill') return SKILL_IDS;
  if (choice.kind === 'class-skill-list') return classContent.skillChoices.from;
  return choice.from;
}

export interface ClassProgressionSkillChoiceContext {
  readonly choose: number;
  readonly from: readonly SkillId[];
  readonly kind: 'starting' | 'multiclass';
}

export function classProgressionSkillChoiceContext(
  classContent: ClassContent,
  starting: boolean,
): ClassProgressionSkillChoiceContext {
  if (starting) {
    return { choose: classContent.skillChoices.choose, from: classContent.skillChoices.from, kind: 'starting' };
  }
  const choice = classContent.multiclassProficiencies.skillChoices;
  return {
    choose: choice?.choose ?? 0,
    from: choice ? allowedMulticlassSkills(choice, classContent) : [],
    kind: 'multiclass',
  };
}

export function validateClassProgressionSkillProficiencies(
  progression: CharacterClassProgression,
  classContent: ClassContent,
  startingClassId: CharacterInput['startingClassId'],
  allowLegacyEmptyStartingSkills = false,
): string | undefined {
  const unique = new Set(progression.skillProficiencies);
  if (progression.skillProficiencies.some((skill) => !isSkillId(skill)) || unique.size !== progression.skillProficiencies.length) {
    return 'Skill selections must be valid and unique.';
  }

  const context = classProgressionSkillChoiceContext(classContent, progression.classId === startingClassId);
  const allowed = new Set(context.from);
  if (progression.skillProficiencies.some((skill) => !allowed.has(skill))) {
    return context.kind === 'starting'
      ? `Choose skills offered by ${classContent.name}.`
      : `Choose skills permitted by the ${classContent.name} multiclass proficiency package.`;
  }
  if (context.kind === 'starting' && allowLegacyEmptyStartingSkills && progression.skillProficiencies.length === 0) return undefined;
  if (progression.skillProficiencies.length !== context.choose) {
    if (context.kind === 'starting') return `Choose exactly ${context.choose} ${classContent.name} skills.`;
    return context.choose === 0
      ? `${classContent.name} grants no skill selection when added by multiclassing.`
      : `Choose exactly ${context.choose} ${classContent.name} multiclass skill${context.choose === 1 ? '' : 's'}.`;
  }
  return undefined;
}

function weaponRuleKey(rule: WeaponProficiencyRule): string {
  return rule.kind === 'category'
    ? `category:${rule.category}`
    : `category-with-property:${rule.category}:${[...rule.anyOfProperties].sort().join(',')}`;
}

function dedupeBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    const id = key(value);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(value);
  }
  return result;
}

export function deriveClassProficiencyContext(
  character: Pick<CharacterInput, 'startingClassId' | 'classProgressions'>,
  registry: ContentRegistry,
): RuleResult<DerivedClassProficiencyContext> {
  const starting = getStartingClassProgression(character);
  if (!starting.ok) return starting;

  const startingClass = registry.findClass(starting.value.classId);
  if (!startingClass) return ruleError('missing-class', `Character class could not be resolved: ${starting.value.classId}`, starting.value.classId);

  const ordered = [
    starting.value,
    ...character.classProgressions
      .filter((progression) => progression.classId !== character.startingClassId)
      .sort((left, right) => left.classId.localeCompare(right.classId)),
  ];

  const skills: SkillId[] = [];
  const weapons: WeaponProficiencyRule[] = [...startingClass.weaponProficiencies];
  const armor: ArmorCategory[] = [...startingClass.armorTraining];
  const tools: ClassToolProficiency[] = [...startingClass.toolProficiencies];

  for (const progression of ordered) {
    const classContent = registry.findClass(progression.classId);
    if (!classContent) return ruleError('missing-class', `Character class could not be resolved: ${progression.classId}`, progression.classId);

    const skillError = validateClassProgressionSkillProficiencies(
      progression,
      classContent,
      character.startingClassId,
      character.classProgressions.length === 1,
    );
    if (skillError) return ruleError('multiclass-derivation-not-supported', skillError, classContent.id);
    skills.push(...progression.skillProficiencies);

    if (progression.classId === character.startingClassId) continue;
    weapons.push(...classContent.multiclassProficiencies.weaponProficiencies);
    armor.push(...classContent.multiclassProficiencies.armorTraining);
    tools.push(...classContent.multiclassProficiencies.toolProficiencies);
  }

  return ruleOk({
    startingProgression: starting.value,
    startingClass,
    savingThrowProficiencies: startingClass.savingThrowProficiencies,
    skillProficiencies: dedupeBy(skills, (skill) => skill),
    weaponProficiencies: dedupeBy(weapons, weaponRuleKey),
    armorTraining: dedupeBy(armor, (category) => category),
    toolProficiencies: dedupeBy(tools, (tool) => tool.id),
  });
}
