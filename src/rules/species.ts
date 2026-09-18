import type { CharacterInput, SkillId } from '../models/character';
import type { CharacterRuleEffect, SpeciesContent, SpeciesSense, SpeciesTraitReference } from '../models/content';
import { ruleError, ruleOk, type RuleResult } from './result';

export interface DerivedSpecies {
  readonly id: string;
  readonly name: string;
  readonly creatureType: 'humanoid';
  readonly size: 'small' | 'medium';
  readonly speedFeet: number;
  readonly senses: readonly SpeciesSense[];
  readonly traits: readonly SpeciesTraitReference[];
  readonly selectedChoices: readonly { id: string; name: string; optionId: string; optionName: string }[];
  readonly skillProficiencies: readonly SkillId[];
  readonly automatedEffects: readonly CharacterRuleEffect[];
}

export function validateSpeciesCharacterChoices(species: SpeciesContent, character: Pick<CharacterInput, 'speciesSize' | 'speciesChoices' | 'speciesSkillProficiencies'>): string | undefined {
  if (species.size.kind === 'choice') {
    if (!character.speciesSize || !species.size.options.includes(character.speciesSize)) return 'Choose a valid size for the selected Species.';
  } else if (character.speciesSize !== undefined && character.speciesSize !== species.size.value) {
    return 'Stored Species size does not match the selected Species.';
  }

  const definitions = new Map(species.choices.map((choice) => [choice.id, choice]));
  if (Object.keys(character.speciesChoices).some((choiceId) => !definitions.has(choiceId))) return 'Stored Species choice is not supported by the selected Species.';
  for (const choice of species.choices) {
    const selected = character.speciesChoices[choice.id];
    if (!selected || !choice.options.some((option) => option.id === selected)) return `Choose a valid ${choice.name}.`;
  }

  const skillChoice = species.skillProficiencyChoice;
  if (!skillChoice) {
    if (character.speciesSkillProficiencies.length > 0) return 'This Species does not grant a skill proficiency choice.';
  } else {
    const unique = new Set(character.speciesSkillProficiencies);
    if (unique.size !== character.speciesSkillProficiencies.length || character.speciesSkillProficiencies.length !== skillChoice.choose || character.speciesSkillProficiencies.some((skill) => !skillChoice.from.includes(skill))) return 'Choose the required valid Species skill proficiency.';
  }
  return undefined;
}

export function deriveSpecies(species: SpeciesContent, character: Pick<CharacterInput, 'speciesSize' | 'speciesChoices' | 'speciesSkillProficiencies'>): RuleResult<DerivedSpecies> {
  const invalid = validateSpeciesCharacterChoices(species, character);
  if (invalid) return ruleError('invalid-species-choice', invalid, species.id);
  const selectedChoices = species.choices.map((choice) => {
    const option = choice.options.find((candidate) => candidate.id === character.speciesChoices[choice.id])!;
    return { id: choice.id, name: choice.name, optionId: option.id, optionName: option.name };
  });
  let speedFeet = species.speedFeet;
  let senses = species.senses.map((sense) => ({ ...sense }));
  for (const choice of species.choices) {
    const option = choice.options.find((candidate) => candidate.id === character.speciesChoices[choice.id]);
    if (option?.speedFeet !== undefined) speedFeet = option.speedFeet;
    if (option?.darkvisionFeet !== undefined) {
      const withoutDarkvision = senses.filter((sense) => sense.type !== 'darkvision');
      senses = [...withoutDarkvision, { type: 'darkvision', rangeFeet: option.darkvisionFeet }];
    }
  }
  return ruleOk({
    id: species.id,
    name: species.name,
    creatureType: species.creatureType,
    size: species.size.kind === 'fixed' ? species.size.value : character.speciesSize!,
    speedFeet,
    senses,
    traits: species.traits,
    selectedChoices,
    skillProficiencies: [...character.speciesSkillProficiencies],
    automatedEffects: [...(species.effects ?? [])],
  });
}
