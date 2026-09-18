import { resolveD20RollContext } from '../dice/diceEngine';
import type { D20RollContext } from '../dice/types';
import { SKILL_IDS, type AbilityKey, type SkillId } from '../models/character';
import type { DerivedAbilityModifiers, DerivedSkill } from './types';

export interface SkillDefinition {
  readonly id: SkillId;
  readonly name: string;
  readonly ability: AbilityKey;
}

export const SKILL_DEFINITIONS: Record<SkillId, SkillDefinition> = {
  acrobatics: { id: 'acrobatics', name: 'Acrobatics', ability: 'dexterity' },
  'animal-handling': { id: 'animal-handling', name: 'Animal Handling', ability: 'wisdom' },
  arcana: { id: 'arcana', name: 'Arcana', ability: 'intelligence' },
  athletics: { id: 'athletics', name: 'Athletics', ability: 'strength' },
  deception: { id: 'deception', name: 'Deception', ability: 'charisma' },
  history: { id: 'history', name: 'History', ability: 'intelligence' },
  insight: { id: 'insight', name: 'Insight', ability: 'wisdom' },
  intimidation: { id: 'intimidation', name: 'Intimidation', ability: 'charisma' },
  investigation: { id: 'investigation', name: 'Investigation', ability: 'intelligence' },
  medicine: { id: 'medicine', name: 'Medicine', ability: 'wisdom' },
  nature: { id: 'nature', name: 'Nature', ability: 'intelligence' },
  perception: { id: 'perception', name: 'Perception', ability: 'wisdom' },
  performance: { id: 'performance', name: 'Performance', ability: 'charisma' },
  persuasion: { id: 'persuasion', name: 'Persuasion', ability: 'charisma' },
  religion: { id: 'religion', name: 'Religion', ability: 'intelligence' },
  'sleight-of-hand': { id: 'sleight-of-hand', name: 'Sleight of Hand', ability: 'dexterity' },
  stealth: { id: 'stealth', name: 'Stealth', ability: 'dexterity' },
  survival: { id: 'survival', name: 'Survival', ability: 'wisdom' },
};

export function deriveSkills(
  abilityModifiers: DerivedAbilityModifiers,
  proficiencyBonus: number,
  proficiencies: readonly SkillId[],
): Record<SkillId, DerivedSkill> {
  const proficient = new Set(proficiencies);
  return SKILL_IDS.reduce((skills, skillId) => {
    const definition = SKILL_DEFINITIONS[skillId];
    const isProficient = proficient.has(skillId);
    skills[skillId] = {
      id: skillId,
      ability: definition.ability,
      modifier: abilityModifiers[definition.ability] + (isProficient ? proficiencyBonus : 0),
      proficient: isProficient,
    };
    return skills;
  }, {} as Record<SkillId, DerivedSkill>);
}

export function derivePassivePerception(skills: Record<SkillId, DerivedSkill>, context?: D20RollContext): number {
  const mode = resolveD20RollContext('normal', context).mode;
  const rollModeAdjustment = mode === 'advantage' ? 5 : mode === 'disadvantage' ? -5 : 0;
  return 10 + skills.perception.modifier + rollModeAdjustment;
}
