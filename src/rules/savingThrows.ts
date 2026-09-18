import { ABILITY_KEYS, type AbilityKey } from '../models/character';
import type { CharacterRuleEffect, ClassContent } from '../models/content';
import type { DerivedAbilityModifiers, DerivedSavingThrow } from './types';

export function deriveSavingThrows(
  abilityModifiers: DerivedAbilityModifiers,
  proficiencyBonus: number,
  classContent: ClassContent,
  effects: readonly CharacterRuleEffect[] = [],
): Record<AbilityKey, DerivedSavingThrow> {
  const proficient = new Set(classContent.savingThrowProficiencies);
  for (const effect of effects) {
    if (effect.type === 'saving-throw-proficiency') for (const ability of effect.abilities) proficient.add(ability);
  }
  return ABILITY_KEYS.reduce((saves, ability) => {
    const isProficient = proficient.has(ability);
    saves[ability] = {
      ability,
      modifier: abilityModifiers[ability] + (isProficient ? proficiencyBonus : 0),
      proficient: isProficient,
    };
    return saves;
  }, {} as Record<AbilityKey, DerivedSavingThrow>);
}
