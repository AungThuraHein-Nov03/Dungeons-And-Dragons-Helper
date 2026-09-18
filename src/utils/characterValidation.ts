import {
  ABILITY_KEYS,
  CURRENCY_UNITS,
  INVENTORY_CATEGORIES,
  isSkillId,
  type AbilityKey,
  type AbilityScores,
  type CharacterInput,
} from '../models/character';
import type { SpellcastingProviderDefinition } from '../models/content';
import { deriveBackgroundAbilityScores, validateBackgroundAbilityChoice } from '../rules/background';
import { spellcastingProviderDefinitionsAtLevel } from '../rules/spellcasting';
import { deriveCharacterFeats } from '../rules/feats';
import { validateHpProgression } from '../rules/health';
import { inventoryCategoryForContent } from '../rules/inventory';
import { validateSpeciesCharacterChoices } from '../rules/species';
import { getWeaponAttackAbilityOptions } from '../rules/weapons';
import { contentRegistry, type ContentRegistry } from '../services/contentRegistry';

export const MIN_CHARACTER_LEVEL = 1;
export const MAX_CHARACTER_LEVEL = 20;
export const MIN_ABILITY_SCORE = 1;
export const MAX_ABILITY_SCORE = 30;
export const MAX_CHARACTER_NAME_LENGTH = 80;
export const MAX_INVENTORY_NOTES_LENGTH = 5000;
export const MAX_INVENTORY_NAME_LENGTH = 120;

export type CharacterField = 'name' | 'classId' | 'subclassId' | 'speciesId' | 'backgroundId' | 'speciesSize' | 'speciesChoices' | 'speciesSkillProficiencies' | 'backgroundAbilityChoice' | 'backgroundToolChoice' | 'backgroundEquipmentChoice' | 'manualFeats' | 'spellcastingSelections' | 'level' | 'skillProficiencies' | 'inventory' | 'currency' | 'hpProgression' | AbilityKey;
export type CharacterValidationErrors = Partial<Record<CharacterField, string>>;

export interface CharacterValidationOptions { readonly allowLegacyEmptySkills?: boolean; readonly allowIncompleteOrigin?: boolean; readonly allowIncompleteSubclass?: boolean; }

function validQuantity(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function countAtLevel(values: readonly { readonly level: number; readonly count: number }[], level: number): number {
  return [...values].filter((row) => row.level <= level).sort((a, b) => b.level - a.level)[0]?.count ?? 0;
}

function maximumSpellLevelAtLevel(provider: SpellcastingProviderDefinition, level: number): number {
  const row = [...(provider.slotPool?.progression ?? [])].filter((candidate) => candidate.level <= level).sort((a, b) => b.level - a.level)[0];
  return Math.max(0, ...(row?.slots.filter((slot) => slot.maximum > 0).map((slot) => slot.spellLevel) ?? []));
}

export function validateCharacterInput(
  input: CharacterInput,
  options: CharacterValidationOptions = {},
  registry: ContentRegistry = contentRegistry,
): CharacterValidationErrors {
  const errors: CharacterValidationErrors = {};
  const trimmedName = input.name.trim();

  if (!trimmedName) errors.name = 'Character name is required.';
  else if (trimmedName.length > MAX_CHARACTER_NAME_LENGTH) errors.name = `Character name must be ${MAX_CHARACTER_NAME_LENGTH} characters or fewer.`;

  const classContent = registry.findClass(input.classId);
  if (!classContent) errors.classId = 'Choose a supported class.';

  const availableSubclasses = classContent ? registry.findSubclassesForClass(classContent.id) : [];
  const subclass = input.subclassId ? registry.findSubclass(input.subclassId) : undefined;
  if (input.subclassId) {
    if (!subclass) errors.subclassId = 'Choose a supported subclass.';
    else if (!classContent || subclass.parentClassId !== classContent.id) errors.subclassId = 'Choose a subclass for the selected class.';
    else if (input.level < subclass.acquisitionLevel) errors.subclassId = `${subclass.name} requires level ${subclass.acquisitionLevel}.`;
  } else if (!options.allowIncompleteSubclass && availableSubclasses.some((candidate) => input.level >= candidate.acquisitionLevel)) {
    errors.subclassId = 'Choose a subclass.';
  }

  const species = input.speciesId ? registry.findSpecies(input.speciesId) : undefined;
  const background = input.backgroundId ? registry.findBackground(input.backgroundId) : undefined;
  if (!input.speciesId) {
    if (!options.allowIncompleteOrigin || Boolean(input.backgroundId)) errors.speciesId = 'Choose a Species.';
  } else if (!species) errors.speciesId = 'Choose a supported Species.';
  if (!input.backgroundId) {
    if (!options.allowIncompleteOrigin || Boolean(input.speciesId)) errors.backgroundId = 'Choose a Background.';
  } else if (!background) errors.backgroundId = 'Choose a supported Background.';

  if (species) {
    const speciesError = validateSpeciesCharacterChoices(species, input);
    if (speciesError) errors.speciesChoices = speciesError;
  } else if (Object.keys(input.speciesChoices).length > 0 || input.speciesSkillProficiencies.length > 0 || input.speciesSize !== undefined) {
    errors.speciesChoices = 'Species choices require a valid selected Species.';
  }

  if (background) {
    const abilityError = validateBackgroundAbilityChoice(background, input.backgroundAbilityChoice);
    if (abilityError) errors.backgroundAbilityChoice = abilityError;
    if (background.toolProficiency.kind === 'choice') {
      if (!input.backgroundToolChoice || !background.toolProficiency.options.some((option) => option.id === input.backgroundToolChoice)) errors.backgroundToolChoice = 'Choose a valid Background tool proficiency.';
    } else if (input.backgroundToolChoice !== undefined) errors.backgroundToolChoice = 'This Background has a fixed tool proficiency.';
    if (!input.backgroundEquipmentChoice || !background.startingEquipment.some((option) => option.id === input.backgroundEquipmentChoice)) errors.backgroundEquipmentChoice = 'Choose a valid Background starting-equipment option.';
  } else if (input.backgroundAbilityChoice || input.backgroundToolChoice || input.backgroundEquipmentChoice) {
    errors.backgroundId = 'Background choices require a valid selected Background.';
  }

  if (!Number.isInteger(input.level) || input.level < MIN_CHARACTER_LEVEL || input.level > MAX_CHARACTER_LEVEL) errors.level = `Level must be a whole number from ${MIN_CHARACTER_LEVEL} to ${MAX_CHARACTER_LEVEL}.`;

  for (const ability of ABILITY_KEYS) {
    const score = input.abilityScores[ability];
    if (!Number.isInteger(score) || score < MIN_ABILITY_SCORE || score > MAX_ABILITY_SCORE) errors[ability] = `Score must be a whole number from ${MIN_ABILITY_SCORE} to ${MAX_ABILITY_SCORE}.`;
  }

  let featBaseScores: AbilityScores | undefined;
  if (!ABILITY_KEYS.some((ability) => errors[ability])) {
    if (background && !errors.backgroundAbilityChoice) {
      const finalScores = deriveBackgroundAbilityScores(input.abilityScores, background, input.backgroundAbilityChoice);
      if (!finalScores.ok) errors.backgroundAbilityChoice = finalScores.error.message;
      else featBaseScores = finalScores.value;
    } else if (!input.backgroundId) {
      featBaseScores = { ...input.abilityScores };
    }
  }
  if (featBaseScores && !errors.level && !errors.backgroundId) {
    const feats = deriveCharacterFeats(input, registry, featBaseScores);
    if (!feats.ok) errors.manualFeats = feats.error.message;
  }

  const activeProviders = spellcastingProviderDefinitionsAtLevel(classContent, input.subclassId ? registry.findSubclass(input.subclassId) : undefined, input.level);
  const seenProviderIds = new Set<string>();
  for (const selection of input.spellcastingSelections) {
    if (!selection.providerId.trim() || seenProviderIds.has(selection.providerId)) {
      errors.spellcastingSelections = 'Spellcasting provider selections require unique provider IDs.';
      break;
    }
    seenProviderIds.add(selection.providerId);
    if (
      new Set(selection.cantripIds).size !== selection.cantripIds.length ||
      new Set(selection.ownedSpellIds).size !== selection.ownedSpellIds.length ||
      new Set(selection.preparedSpellIds).size !== selection.preparedSpellIds.length
    ) {
      errors.spellcastingSelections = 'Spellcasting selections cannot contain duplicate spell IDs.';
      break;
    }
    const provider = activeProviders.find((candidate) => candidate.id === selection.providerId);
    if (!provider || provider.spellManagement.kind !== 'prepared-from-owned') continue; // Stale provider records remain inert and removable.
    const management = provider.spellManagement;
    const cantripLimit = countAtLevel(management.cantripCount, input.level);
    const preparedLimit = countAtLevel(management.preparedSpellCount, input.level);
    const maximumSpellLevel = maximumSpellLevelAtLevel(provider, input.level);
    if (selection.cantripIds.length !== cantripLimit) {
      errors.spellcastingSelections = `Choose exactly ${cantripLimit} cantrips for ${provider.name}.`;
      break;
    }
    if (selection.ownedSpellIds.length < management.initialOwnedSpellCount) {
      errors.spellcastingSelections = `${provider.name} requires at least ${management.initialOwnedSpellCount} owned spells.`;
      break;
    }
    if (selection.preparedSpellIds.length > preparedLimit) {
      errors.spellcastingSelections = `${provider.name} can prepare at most ${preparedLimit} spells at this level.`;
      break;
    }
    const onProviderList = (spellId: string) => {
      const spell = registry.findSpell(spellId);
      return spell ? spell.spellLists.some((list) => list.id === management.spellListId) : undefined;
    };
    for (const spellId of selection.cantripIds) {
      const spell = registry.findSpell(spellId);
      if (spell && (spell.level !== 0 || !onProviderList(spellId))) {
        errors.spellcastingSelections = `${provider.name} cantrips must be level 0 spells from its spell list.`;
        break;
      }
    }
    if (errors.spellcastingSelections) break;
    const resolvedOwned = selection.ownedSpellIds.map((spellId) => registry.findSpell(spellId));
    for (const spell of resolvedOwned) {
      if (spell && (spell.level === 0 || spell.level > maximumSpellLevel || !spell.spellLists.some((list) => list.id === management.spellListId))) {
        errors.spellcastingSelections = `${provider.name} owned spells must be leveled spells from its spell list that are available at this level.`;
        break;
      }
    }
    if (errors.spellcastingSelections) break;
    if (resolvedOwned.every(Boolean) && resolvedOwned.filter((spell) => spell?.level === management.initialOwnedSpellLevel).length < management.initialOwnedSpellCount) {
      errors.spellcastingSelections = `${provider.name} requires at least ${management.initialOwnedSpellCount} level ${management.initialOwnedSpellLevel} starting spells.`;
      break;
    }
    const ownedIds = new Set(selection.ownedSpellIds);
    for (const spellId of selection.preparedSpellIds) {
      if (!ownedIds.has(spellId)) {
        errors.spellcastingSelections = `${provider.name} prepared spells must already be owned by that provider.`;
        break;
      }
      const spell = registry.findSpell(spellId);
      if (spell && (spell.level === 0 || spell.level > maximumSpellLevel || !onProviderList(spellId))) {
        errors.spellcastingSelections = `${provider.name} prepared spells must be eligible owned spells at this level.`;
        break;
      }
    }
    if (errors.spellcastingSelections) break;
  }
  if (!errors.spellcastingSelections) {
    for (const provider of activeProviders) {
      if (provider.spellManagement.kind === 'prepared-from-owned' && !input.spellcastingSelections.some((selection) => selection.providerId === provider.id)) {
        errors.spellcastingSelections = `Choose spellcasting selections for ${provider.name}.`;
        break;
      }
    }
  }

  if (classContent) {
    const hpError = validateHpProgression(input.hpProgression, input.level, classContent.hitDie);
    if (hpError) errors.hpProgression = hpError;
  }

  const uniqueSkills = new Set(input.skillProficiencies);
  const hasInvalidSkill = input.skillProficiencies.some((skill) => !isSkillId(skill));
  if (hasInvalidSkill || uniqueSkills.size !== input.skillProficiencies.length) errors.skillProficiencies = 'Skill selections must be valid and unique.';
  else if (classContent) {
    const allowed = new Set(classContent.skillChoices.from);
    const outsideClassList = input.skillProficiencies.some((skill) => !allowed.has(skill));
    const legacyEmptyAllowed = options.allowLegacyEmptySkills && input.skillProficiencies.length === 0;
    if (outsideClassList) errors.skillProficiencies = `Choose skills offered by ${classContent.name}.`;
    else if (!legacyEmptyAllowed && input.skillProficiencies.length !== classContent.skillChoices.choose) errors.skillProficiencies = `Choose exactly ${classContent.skillChoices.choose} ${classContent.name} skills.`;
  }

  const ids = new Set<string>();
  let equippedArmor = 0;
  let equippedShields = 0;
  for (const entry of input.inventory) {
    if (!entry.id.trim() || ids.has(entry.id)) { errors.inventory = 'Inventory entry IDs must be present and unique.'; break; }
    ids.add(entry.id);
    if (!INVENTORY_CATEGORIES.includes(entry.category) || !validQuantity(entry.quantity) || typeof entry.notes !== 'string' || entry.notes.length > MAX_INVENTORY_NOTES_LENGTH) {
      errors.inventory = 'Inventory entries must use valid categories, positive whole-number quantities, and valid notes.';
      break;
    }

    if (entry.kind === 'custom') {
      if (!entry.name.trim() || entry.name.trim().length > MAX_INVENTORY_NAME_LENGTH || (entry.weightPounds !== undefined && (!Number.isFinite(entry.weightPounds) || entry.weightPounds < 0))) {
        errors.inventory = 'Custom inventory items need a valid name and optional non-negative weight.';
        break;
      }
      continue;
    }

    if (!entry.contentId.trim() || typeof entry.equipped !== 'boolean' || (entry.displayName !== undefined && entry.displayName.length > MAX_INVENTORY_NAME_LENGTH)) {
      errors.inventory = 'Registry-backed inventory entries contain invalid stored values.';
      break;
    }
    if (entry.equipped && entry.category === 'armor') equippedArmor += 1;
    if (entry.equipped && entry.category === 'shield') equippedShields += 1;

    const content = registry.getById(entry.contentId);
    if (!content) continue; // Future Homebrew deletion/versioning: unresolved records remain removable and non-mechanical.
    const expectedCategory = inventoryCategoryForContent(content);
    if (!expectedCategory || expectedCategory !== entry.category) { errors.inventory = `Inventory category does not match ${content.name}.`; break; }
    if (content.kind === 'weapon') {
      const abilities = getWeaponAttackAbilityOptions(content);
      if (entry.attackAbilityChoice && !abilities.includes(entry.attackAbilityChoice)) { errors.inventory = `Invalid attack ability choice for ${content.name}.`; break; }
      if (entry.equipped && abilities.length > 1 && !entry.attackAbilityChoice) { errors.inventory = `Choose an attack ability for equipped ${content.name}.`; break; }
    } else if (entry.attackAbilityChoice !== undefined) {
      errors.inventory = 'Only weapon entries may store an attack ability choice.';
      break;
    }
  }
  if (equippedArmor > 1) errors.inventory = 'Only one body armor can be equipped at a time.';
  if (equippedShields > 1) errors.inventory = 'Only one shield can be equipped at a time.';

  for (const unit of CURRENCY_UNITS) {
    if (!Number.isInteger(input.currency[unit]) || input.currency[unit] < 0) { errors.currency = 'Currency values must be non-negative whole numbers.'; break; }
  }

  return errors;
}

export function hasValidationErrors(errors: CharacterValidationErrors): boolean { return Object.keys(errors).length > 0; }
