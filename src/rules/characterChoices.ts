import { SKILL_IDS, isSkillId, type CharacterInput, type SkillId } from '../models/character';
import type { CharacterRuleEffect, ClassContent } from '../models/content';
import type { ContentId } from '../models/contentId';
import type { ContentRegistry } from '../services/contentRegistry';
import { ruleError, ruleOk, type RuleResult } from './result';

export interface SkillExpertiseChoiceState {
  readonly classId: ContentId;
  readonly entitled: number;
  readonly selected: readonly SkillId[];
  readonly eligible: readonly SkillId[];
  readonly missing: number;
}

type ExpertiseGrant = Extract<CharacterRuleEffect, { readonly type: 'skill-expertise-choice' }>;

function acquiredExpertiseGrants(
  progression: CharacterInput['classProgressions'][number],
  classContent: ClassContent,
  registry: ContentRegistry,
): RuleResult<readonly ExpertiseGrant[]> {
  const subclass = progression.subclassId ? registry.findSubclass(progression.subclassId) : undefined;
  if (progression.subclassId && (!subclass || subclass.parentClassId !== classContent.id)) {
    return ruleError('invalid-subclass-parent', `Character subclass could not be resolved for ${classContent.name}.`, progression.subclassId);
  }
  const features = [
    ...classContent.progression.filter((row) => row.level <= progression.level).flatMap((row) => row.features),
    ...(subclass ? subclass.progression.filter((row) => row.level <= progression.level).flatMap((row) => row.features) : []),
  ];
  return ruleOk(features.flatMap((feature) => feature.effects.filter(
    (effect): effect is ExpertiseGrant => effect.type === 'skill-expertise-choice',
  )));
}

function proficientSkills(character: CharacterInput, registry: ContentRegistry): Set<SkillId> {
  const skills = new Set<SkillId>(character.speciesSkillProficiencies);
  character.classProgressions.forEach((progression) => progression.skillProficiencies.forEach((skill) => skills.add(skill)));
  const background = character.backgroundId ? registry.findBackground(character.backgroundId) : undefined;
  background?.skillProficiencies.forEach((skill) => skills.add(skill));
  return skills;
}

function canAssignSelectionsToGrantSlots(
  selected: readonly SkillId[],
  slots: readonly ReadonlySet<SkillId>[],
): boolean {
  const ordered = [...selected].sort((left, right) => (
    slots.filter((slot) => slot.has(left)).length - slots.filter((slot) => slot.has(right)).length
  ));
  const used = new Set<number>();
  const assign = (index: number): boolean => {
    if (index >= ordered.length) return true;
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      if (used.has(slotIndex) || !slots[slotIndex].has(ordered[index])) continue;
      used.add(slotIndex);
      if (assign(index + 1)) return true;
      used.delete(slotIndex);
    }
    return false;
  };
  return assign(0);
}

export function deriveSkillExpertiseChoices(
  character: CharacterInput,
  registry: ContentRegistry,
): RuleResult<readonly SkillExpertiseChoiceState[]> {
  const proficient = proficientSkills(character, registry);
  const states: SkillExpertiseChoiceState[] = [];
  for (const progression of character.classProgressions) {
    const classContent = registry.findClass(progression.classId);
    if (!classContent) return ruleError('missing-class', `Character class could not be resolved: ${progression.classId}`, progression.classId);
    const grants = acquiredExpertiseGrants(progression, classContent, registry);
    if (!grants.ok) return grants;
    const entitled = grants.value.reduce((total, grant) => total + grant.choose, 0);
    if (entitled === 0 && progression.skillExpertise.length === 0) continue;
    const eligible = SKILL_IDS.filter((skill) => proficient.has(skill) && grants.value.some((grant) => (
      grant.eligibility === 'proficient-skills' || classContent.skillChoices.from.includes(skill)
    )));
    states.push({
      classId: progression.classId,
      entitled,
      selected: [...progression.skillExpertise],
      eligible,
      missing: Math.max(0, entitled - progression.skillExpertise.length),
    });
  }
  return ruleOk(states);
}

export function validateSkillExpertiseSelections(
  character: CharacterInput,
  options: { readonly allowUnderfilled: boolean },
  registry: ContentRegistry,
): string | undefined {
  const proficient = proficientSkills(character, registry);
  for (const progression of character.classProgressions) {
    if (progression.skillExpertise.some((skill) => !isSkillId(skill))) return 'Expertise selections must use valid skills.';
    if (new Set(progression.skillExpertise).size !== progression.skillExpertise.length) return 'Expertise selections must be unique within their owning class progression.';
    const classContent = registry.findClass(progression.classId);
    if (!classContent) continue;
    const grants = acquiredExpertiseGrants(progression, classContent, registry);
    if (!grants.ok) return grants.error.message;
    const entitled = grants.value.reduce((total, grant) => total + grant.choose, 0);
    if (progression.skillExpertise.length > entitled) return `${classContent.name} can select at most ${entitled} Expertise skill${entitled === 1 ? '' : 's'}.`;
    if (progression.skillExpertise.some((skill) => !proficient.has(skill))) return `${classContent.name} Expertise selections must be proficient skills.`;
    const slots = grants.value.flatMap((grant) => {
      const eligible = new Set(SKILL_IDS.filter((skill) => proficient.has(skill) && (
        grant.eligibility === 'proficient-skills' || classContent.skillChoices.from.includes(skill)
      )));
      return Array.from({ length: grant.choose }, () => eligible);
    });
    if (!canAssignSelectionsToGrantSlots(progression.skillExpertise, slots)) {
      return `${classContent.name} Expertise selections do not satisfy the acquired grant eligibility.`;
    }
    if (!options.allowUnderfilled && progression.skillExpertise.length !== entitled) {
      return `Choose exactly ${entitled} ${classContent.name} Expertise skill${entitled === 1 ? '' : 's'}.`;
    }
  }
  return undefined;
}
