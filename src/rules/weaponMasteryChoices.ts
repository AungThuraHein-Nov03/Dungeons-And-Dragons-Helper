import type { CharacterInput } from '../models/character';
import type { WeaponContent, WeaponProficiencyRule } from '../models/content';
import type { ContentId } from '../models/contentId';
import type { ContentRegistry } from '../services/contentRegistry';
import { deriveClassProficiencyContext } from './classProficiencies';
import { ruleError, ruleOk, type RuleResult } from './result';
import { isWeaponProficientWithRules } from './weapons';

export interface WeaponMasteryChoiceState {
  readonly classId: ContentId;
  readonly entitled: number;
  readonly selected: readonly ContentId[];
  readonly eligible: readonly WeaponContent[];
  readonly missing: number;
}

function masteryCapacity(character: CharacterInput, classId: ContentId, registry: ContentRegistry): RuleResult<number> {
  const progression = character.classProgressions.find((entry) => entry.classId === classId);
  const classContent = registry.findClass(classId);
  if (!progression || !classContent) return ruleError('missing-class', `Character class could not be resolved: ${classId}`, classId);
  const row = classContent.progression.find((candidate) => candidate.level === progression.level);
  return row
    ? ruleOk(row.weaponMasteryChoices ?? 0)
    : ruleError('invalid-level', `${classContent.name} has no progression row for class level ${progression.level}.`, classId);
}

function characterWeaponRules(character: CharacterInput, registry: ContentRegistry): RuleResult<readonly WeaponProficiencyRule[]> {
  const context = deriveClassProficiencyContext(character, registry);
  return context.ok ? ruleOk(context.value.weaponProficiencies) : context;
}

export function deriveWeaponMasteryChoices(character: CharacterInput, registry: ContentRegistry): RuleResult<readonly WeaponMasteryChoiceState[]> {
  const rules = characterWeaponRules(character, registry);
  if (!rules.ok) return rules;
  const eligible = registry.getAll('weapon').filter((weapon) => isWeaponProficientWithRules(rules.value, weapon));
  const states: WeaponMasteryChoiceState[] = [];
  for (const progression of character.classProgressions) {
    const capacity = masteryCapacity(character, progression.classId, registry);
    if (!capacity.ok) return capacity;
    if (capacity.value === 0 && progression.weaponMasterySelections.length === 0) continue;
    states.push({
      classId: progression.classId,
      entitled: capacity.value,
      selected: [...progression.weaponMasterySelections],
      eligible,
      missing: Math.max(0, capacity.value - progression.weaponMasterySelections.length),
    });
  }
  return ruleOk(states);
}

export function validateWeaponMasterySelections(
  character: CharacterInput,
  options: { readonly allowUnderfilled: boolean },
  registry: ContentRegistry,
): string | undefined {
  const rules = characterWeaponRules(character, registry);
  if (!rules.ok) return rules.error.message;
  const global = new Set<ContentId>();
  for (const progression of character.classProgressions) {
    const selected = progression.weaponMasterySelections;
    if (new Set(selected).size !== selected.length) return 'Weapon Mastery selections must be unique within their owning class progression.';
    const capacity = masteryCapacity(character, progression.classId, registry);
    if (!capacity.ok) return capacity.error.message;
    const className = registry.findClass(progression.classId)?.name ?? progression.classId;
    if (selected.length > capacity.value) return `${className} can select at most ${capacity.value} Weapon Masteries.`;
    for (const weaponId of selected) {
      if (global.has(weaponId)) return 'The same weapon cannot consume Weapon Mastery slots from multiple class progressions.';
      global.add(weaponId);
      const weapon = registry.findWeapon(weaponId);
      if (!weapon) return `Weapon Mastery selection does not resolve to a Weapon: ${weaponId}.`;
      if (!isWeaponProficientWithRules(rules.value, weapon)) return `${weapon.name} is not a weapon with which this Character is proficient.`;
    }
    if (!options.allowUnderfilled && selected.length !== capacity.value) {
      return `Choose exactly ${capacity.value} ${className} Weapon Master${capacity.value === 1 ? 'y' : 'ies'}.`;
    }
  }
  return undefined;
}
