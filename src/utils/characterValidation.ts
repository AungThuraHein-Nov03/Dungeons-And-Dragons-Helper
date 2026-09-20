import {
  ABILITY_KEYS,
  CURRENCY_UNITS,
  INVENTORY_CATEGORIES,
  type AbilityKey,
  type AbilityScores,
  type CharacterClassProgression,
  type CharacterInput,
} from '../models/character';
import type { ClassContent, SpellcastingProviderDefinition } from '../models/content';
import { deriveBackgroundAbilityScores, validateBackgroundAbilityChoice } from '../rules/background';
import { validateClassProgressionSkillProficiencies } from '../rules/classProficiencies';
import { getTotalCharacterLevel } from '../rules/characterProgression';
import { meetsMulticlassPrimaryAbilityRequirement } from '../rules/multiclass';
import { maximumSelectableSpellLevel, spellBelongsToProviderList, spellcastingCountAtLevel, spellcastingProviderDefinitionsAtLevel } from '../rules/spellcasting';
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

export type CharacterField =
  | 'name'
  | 'startingClassId'
  | 'classProgressions'
  | 'classId'
  | 'subclassId'
  | 'speciesId'
  | 'backgroundId'
  | 'speciesSize'
  | 'speciesChoices'
  | 'speciesSkillProficiencies'
  | 'backgroundAbilityChoice'
  | 'backgroundToolChoice'
  | 'backgroundEquipmentChoice'
  | 'manualFeats'
  | 'spellcastingSelections'
  | 'level'
  | 'skillProficiencies'
  | 'inventory'
  | 'currency'
  | 'hpProgression'
  | AbilityKey;
export type CharacterValidationErrors = Partial<Record<CharacterField, string>>;

export interface CharacterValidationOptions {
  readonly allowLegacyEmptySkills?: boolean;
  readonly allowIncompleteOrigin?: boolean;
  readonly allowIncompleteSubclass?: boolean;
}

function validQuantity(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function setProgressionError(errors: CharacterValidationErrors, message: string, sole = false): void {
  if (!errors.classProgressions) errors.classProgressions = message;
  if (sole && !errors.classId) errors.classId = message;
}

function validateProgression(
  progression: CharacterClassProgression,
  input: CharacterInput,
  errors: CharacterValidationErrors,
  registry: ContentRegistry,
  options: CharacterValidationOptions,
  sole: boolean,
): ClassContent | undefined {
  if (!progression.classId?.trim()) {
    setProgressionError(errors, 'Each class progression requires a class ID.', sole);
    return undefined;
  }

  const classContent = registry.findClass(progression.classId);
  if (!classContent) {
    setProgressionError(errors, 'Choose a supported class.', sole);
    return undefined;
  }

  if (!Number.isInteger(progression.level) || progression.level < 1 || progression.level > MAX_CHARACTER_LEVEL) {
    errors.level ??= `Level must be a whole number from ${MIN_CHARACTER_LEVEL} to ${MAX_CHARACTER_LEVEL}.`;
    setProgressionError(errors, 'Class progression levels must be positive whole numbers no greater than 20.', sole);
  }

  const availableSubclasses = registry.findSubclassesForClass(classContent.id);
  const subclass = progression.subclassId ? registry.findSubclass(progression.subclassId) : undefined;
  if (progression.subclassId) {
    if (!subclass) errors.subclassId ??= 'Choose a supported subclass.';
    else if (subclass.parentClassId !== classContent.id) errors.subclassId ??= 'Choose a subclass for the selected class.';
    else if (progression.level < subclass.acquisitionLevel) errors.subclassId ??= `${subclass.name} requires level ${subclass.acquisitionLevel}.`;
  } else if (!options.allowIncompleteSubclass && availableSubclasses.some((candidate) => progression.level >= candidate.acquisitionLevel)) {
    errors.subclassId ??= 'Choose a subclass.';
  }

  const skillError = validateClassProgressionSkillProficiencies(
    progression,
    classContent,
    input.startingClassId,
    Boolean(options.allowLegacyEmptySkills && input.classProgressions.length === 1),
  );
  if (skillError) errors.skillProficiencies ??= skillError;

  if (Number.isInteger(progression.level) && progression.level >= 1) {
    const hpError = validateHpProgression(
      progression.hpProgression,
      progression.level,
      classContent.hitDie,
      progression.classId === input.startingClassId,
    );
    if (hpError) errors.hpProgression ??= hpError;
  }

  return classContent;
}

interface SpellcastingProviderValidationContext {
  readonly definition: SpellcastingProviderDefinition;
  readonly ownerLevel: number;
  readonly grantedSpellIds: ReadonlySet<string>;
}

function collectSpellcastingProviderValidationContexts(
  input: CharacterInput,
  registry: ContentRegistry,
): {
  readonly acquired: ReadonlyMap<string, SpellcastingProviderValidationContext>;
  readonly knownProviderIds: ReadonlySet<string>;
} {
  const acquired = new Map<string, { definition: SpellcastingProviderDefinition; ownerLevel: number; grantedSpellIds: Set<string> }>();
  const knownProviderIds = new Set<string>();
  const activeGrantIds = new Map<string, Set<string>>();

  for (const progression of input.classProgressions) {
    const classContent = registry.findClass(progression.classId);
    if (!classContent) continue;
    const subclass = progression.subclassId ? registry.findSubclass(progression.subclassId) : undefined;
    const validSubclass = subclass?.parentClassId === classContent.id ? subclass : undefined;

    for (const provider of spellcastingProviderDefinitionsAtLevel(classContent, validSubclass, MAX_CHARACTER_LEVEL)) {
      knownProviderIds.add(provider.id);
    }
    for (const provider of spellcastingProviderDefinitionsAtLevel(classContent, validSubclass, progression.level)) {
      acquired.set(provider.id, {
        definition: provider,
        ownerLevel: progression.level,
        grantedSpellIds: activeGrantIds.get(provider.id) ?? new Set<string>(),
      });
    }

    for (const rows of [classContent.progression, ...(validSubclass ? [validSubclass.progression] : [])]) {
      for (const row of rows) {
        if (row.level > progression.level) break;
        for (const feature of row.features) {
          for (const grant of feature.spellGrants ?? []) {
            if ((grant.minimumLevel ?? row.level) > progression.level) continue;
            const ids = activeGrantIds.get(grant.providerId) ?? new Set<string>();
            grant.spellIds.forEach((spellId) => ids.add(spellId));
            activeGrantIds.set(grant.providerId, ids);
          }
        }
      }
    }
  }

  for (const [providerId, context] of acquired) {
    context.grantedSpellIds = activeGrantIds.get(providerId) ?? context.grantedSpellIds;
  }

  return { acquired, knownProviderIds };
}

function validateProviderSpellcastingSelection(
  selection: CharacterInput['spellcastingSelections'][number],
  context: SpellcastingProviderValidationContext,
  registry: ContentRegistry,
): string | undefined {
  const provider = context.definition;
  const management = provider.spellManagement;
  const grantedSpellIds = context.grantedSpellIds;
  const manualCantripIds = selection.cantripIds.filter((spellId) => !grantedSpellIds.has(spellId));
  const manualOwnedIds = selection.ownedSpellIds.filter((spellId) => !grantedSpellIds.has(spellId));
  const manualPreparedIds = selection.preparedSpellIds.filter((spellId) => !grantedSpellIds.has(spellId));

  if (management.kind === 'granted-only') {
    if (manualCantripIds.length > 0 || manualOwnedIds.length > 0 || manualPreparedIds.length > 0) {
      return `${provider.name} does not accept manual spell selections.`;
    }
    return undefined;
  }

  const cantripLimit = spellcastingCountAtLevel(management.cantripCount, context.ownerLevel);
  const preparedLimit = spellcastingCountAtLevel(management.preparedSpellCount, context.ownerLevel);
  const maximumSpellLevel = maximumSelectableSpellLevel(provider, context.ownerLevel);

  if (manualCantripIds.length !== cantripLimit) {
    return `Choose exactly ${cantripLimit} cantrips for ${provider.name}.`;
  }

  for (const spellId of manualCantripIds) {
    const spell = registry.findSpell(spellId);
    if (spell && (spell.level !== 0 || !spellBelongsToProviderList(spell, management.spellListId))) {
      return `${provider.name} cantrips must be level 0 spells from its spell list.`;
    }
  }

  if (manualPreparedIds.length > preparedLimit) {
    return `${provider.name} can prepare at most ${preparedLimit} spells at this level.`;
  }

  if (management.kind === 'prepared-from-list') {
    if (manualOwnedIds.length > 0) {
      return `${provider.name} prepares from its spell list and does not use owned-spell selections.`;
    }
    for (const spellId of manualPreparedIds) {
      const spell = registry.findSpell(spellId);
      if (spell && (
        spell.level === 0
        || spell.level > maximumSpellLevel
        || !spellBelongsToProviderList(spell, management.spellListId)
      )) {
        return `${provider.name} prepared spells must be leveled spells from its spell list that are available at this level for this provider.`;
      }
    }
    return undefined;
  }

  if (manualOwnedIds.length < management.initialOwnedSpellCount) {
    return `${provider.name} requires at least ${management.initialOwnedSpellCount} owned spells.`;
  }

  const resolvedOwned = manualOwnedIds.map((spellId) => registry.findSpell(spellId));
  for (const spell of resolvedOwned) {
    if (spell && (
      spell.level === 0
      || spell.level > maximumSpellLevel
      || !spellBelongsToProviderList(spell, management.spellListId)
    )) {
      return `${provider.name} owned spells must be leveled spells from its spell list that are available at this level for this provider.`;
    }
  }
  if (
    resolvedOwned.every(Boolean)
    && resolvedOwned.filter((spell) => spell?.level === management.initialOwnedSpellLevel).length < management.initialOwnedSpellCount
  ) {
    return `${provider.name} requires at least ${management.initialOwnedSpellCount} level ${management.initialOwnedSpellLevel} starting spells.`;
  }

  const ownedIds = new Set(manualOwnedIds);
  for (const spellId of manualPreparedIds) {
    if (!ownedIds.has(spellId)) {
      return `${provider.name} prepared spells must already be owned by that provider.`;
    }
    const spell = registry.findSpell(spellId);
    if (spell && (
      spell.level === 0
      || spell.level > maximumSpellLevel
      || !spellBelongsToProviderList(spell, management.spellListId)
    )) {
      return `${provider.name} prepared spells must be eligible owned spells at this level for this provider.`;
    }
  }

  return undefined;
}

function validateSpellcastingSelections(
  input: CharacterInput,
  registry: ContentRegistry,
  errors: CharacterValidationErrors,
): void {
  const seenProviderIds = new Set<string>();
  for (const selection of input.spellcastingSelections) {
    if (!selection.providerId.trim() || seenProviderIds.has(selection.providerId)) {
      errors.spellcastingSelections = 'Spellcasting provider selections require unique provider IDs.';
      return;
    }
    seenProviderIds.add(selection.providerId);
    if (
      new Set(selection.cantripIds).size !== selection.cantripIds.length
      || new Set(selection.ownedSpellIds).size !== selection.ownedSpellIds.length
      || new Set(selection.preparedSpellIds).size !== selection.preparedSpellIds.length
    ) {
      errors.spellcastingSelections = 'Spellcasting selections cannot contain duplicate spell IDs.';
      return;
    }
  }

  const contexts = collectSpellcastingProviderValidationContexts(input, registry);

  for (const selection of input.spellcastingSelections) {
    const context = contexts.acquired.get(selection.providerId);
    if (!context) {
      errors.spellcastingSelections = contexts.knownProviderIds.has(selection.providerId)
        ? `Spellcasting provider has not been acquired at its owner level: ${selection.providerId}.`
        : `Unknown spellcasting provider selection: ${selection.providerId}.`;
      return;
    }
    const error = validateProviderSpellcastingSelection(selection, context, registry);
    if (error) {
      errors.spellcastingSelections = error;
      return;
    }
  }

  for (const context of contexts.acquired.values()) {
    if (
      context.definition.spellManagement.kind === 'prepared-from-owned'
      && !input.spellcastingSelections.some((selection) => selection.providerId === context.definition.id)
    ) {
      errors.spellcastingSelections = `Choose spellcasting selections for ${context.definition.name}.`;
      return;
    }
  }
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

  if (!input.startingClassId?.trim() || !registry.findClass(input.startingClassId)) {
    errors.startingClassId = 'Choose a supported starting class.';
    errors.classId = 'Choose a supported class.';
  }

  if (!Array.isArray(input.classProgressions) || input.classProgressions.length === 0) {
    errors.classProgressions = 'At least one class progression is required.';
  }

  const classIds = new Set<string>();
  let duplicateClassId = false;
  for (const progression of input.classProgressions) {
    if (classIds.has(progression.classId)) duplicateClassId = true;
    classIds.add(progression.classId);
  }
  if (duplicateClassId) errors.classProgressions = 'Class progression class IDs must be unique.';

  const totalLevel = getTotalCharacterLevel(input);
  if (!Number.isInteger(totalLevel) || totalLevel < MIN_CHARACTER_LEVEL || totalLevel > MAX_CHARACTER_LEVEL) {
    errors.level = `Total level must be a whole number from ${MIN_CHARACTER_LEVEL} to ${MAX_CHARACTER_LEVEL}.`;
    errors.classProgressions ??= 'The sum of class progression levels must be from 1 through 20.';
  }

  const startingMatches = input.classProgressions.filter((progression) => progression.classId === input.startingClassId);
  if (startingMatches.length !== 1) {
    errors.startingClassId = 'Starting class must match exactly one stored class progression.';
    errors.classProgressions ??= 'Starting class must resolve exactly one class progression.';
  }

  for (const progression of input.classProgressions) {
    validateProgression(progression, input, errors, registry, options, input.classProgressions.length === 1);
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

  for (const ability of ABILITY_KEYS) {
    const score = input.abilityScores[ability];
    if (!Number.isInteger(score) || score < MIN_ABILITY_SCORE || score > MAX_ABILITY_SCORE) errors[ability] = `Score must be a whole number from ${MIN_ABILITY_SCORE} to ${MAX_ABILITY_SCORE}.`;
  }

  let featBaseScores: AbilityScores | undefined;
  let effectiveScores: AbilityScores | undefined;
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
    else effectiveScores = feats.value.abilityScores;
  }

  if (input.classProgressions.length > 1 && effectiveScores && !errors.classProgressions) {
    for (const progression of input.classProgressions) {
      const classContent = registry.findClass(progression.classId);
      if (!classContent) continue;
      if (!meetsMulticlassPrimaryAbilityRequirement(classContent.primaryAbility, effectiveScores)) {
        errors.classProgressions = `${classContent.name} multiclassing requires its primary ability requirement to be met.`;
        break;
      }
    }
  }

  validateSpellcastingSelections(input, registry, errors);

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
    if (!content) continue;
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

export function hasValidationErrors(errors: CharacterValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}
