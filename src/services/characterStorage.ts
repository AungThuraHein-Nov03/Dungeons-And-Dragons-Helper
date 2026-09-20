import { srdId } from '../content/srd/source';
import {
  ABILITY_KEYS,
  CURRENCY_UNITS,
  EMPTY_CURRENCY,
  INVENTORY_CATEGORIES,
  SKILL_IDS,
  type AbilityKey,
  type AbilityScores,
  type BackgroundAbilityChoice,
  type Character,
  type CharacterClassProgression,
  type CharacterCurrency,
  type CharacterFeatSelection,
  type CharacterInput,
  type CharacterPlayState,
  type CharacterSpellcastingSelection,
  type ClassHpProgressionEntry,
  type HitDiceRemaining,
  type InventoryEntry,
  type LegacyCharacterClass,
  type SkillId,
} from '../models/character';
import type { DieSize } from '../models/content';
import { deriveAbilityModifiers } from '../rules/abilities';
import { deriveEffectiveAbilityScores } from '../rules/background';
import { deriveCharacterClass } from '../rules/classes';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { getSingleClassProgression, getTotalCharacterLevel } from '../rules/characterProgression';
import { deriveCharacterFeats } from '../rules/feats';
import { deriveHealth } from '../rules/health';
import { initializePlayState, normalizePlayState, reconcilePlayState, validatePlayState, type PlayStateContext } from '../rules/playState';
import { deriveProficiencyBonus } from '../rules/proficiency';
import { deriveResourceDefinitions } from '../rules/resources';
import { deriveSpellcastingProviders } from '../rules/spellcasting';
import { deriveCharacterSubclass } from '../rules/subclasses';
import { getWeaponAttackAbilityOptions } from '../rules/weapons';
import { hasValidationErrors, validateCharacterInput } from '../utils/characterValidation';
import { contentRegistry, type ContentRegistry } from './contentRegistry';

export const LEGACY_CHARACTER_STORAGE_KEY = 'dnd3.characters.v1';
export const LEGACY_CHARACTER_STORAGE_V2_KEY = 'dnd3.characters.v2';
export const LEGACY_CHARACTER_STORAGE_V3_KEY = 'dnd3.characters.v3';
export const LEGACY_CHARACTER_STORAGE_V4_KEY = 'dnd3.characters.v4';
export const LEGACY_CHARACTER_STORAGE_V5_KEY = 'dnd3.characters.v5';
export const LEGACY_CHARACTER_STORAGE_V6_KEY = 'dnd3.characters.v6';
export const LEGACY_CHARACTER_STORAGE_V7_KEY = 'dnd3.characters.v7';
export const LEGACY_CHARACTER_STORAGE_V8_KEY = 'dnd3.characters.v8';
export const CHARACTER_STORAGE_KEY = 'dnd3.characters.v9';

const LEGACY_CLASS_ID_MAP: Record<LegacyCharacterClass, string> = { Fighter: srdId('class', 'fighter') };
const DIE_SIZES = [4, 6, 8, 10, 12] as const;

interface LegacyEquipmentSelection {
  equippedArmorId?: string;
  equippedShieldId?: string;
  equippedWeaponIds: string[];
}

type LegacyAttackChoices = Partial<Record<string, AbilityKey>>;

type LegacyHpProgressionEntry =
  | { readonly level: number; readonly method: 'fixed' }
  | { readonly level: number; readonly method: 'rolled'; readonly roll: number };

interface LegacyCharacterPlayStateV8 {
  currentHp: number;
  temporaryHp: number;
  hitDiceRemaining: number;
  resourceUses: Record<string, number>;
}

interface LegacyCharacterInputV8 {
  name: string;
  classId: string;
  subclassId?: string;
  speciesId?: string;
  backgroundId?: string;
  speciesSize?: 'small' | 'medium';
  speciesChoices: Record<string, string>;
  speciesSkillProficiencies: SkillId[];
  backgroundAbilityChoice?: BackgroundAbilityChoice;
  backgroundToolChoice?: string;
  backgroundEquipmentChoice?: string;
  manualFeats: CharacterFeatSelection[];
  spellcastingSelections: CharacterSpellcastingSelection[];
  level: number;
  abilityScores: AbilityScores;
  skillProficiencies: SkillId[];
  inventory: InventoryEntry[];
  currency: CharacterCurrency;
  hpProgression: LegacyHpProgressionEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function containsExecutable(value: unknown): boolean {
  if (typeof value === 'function') return true;
  if (Array.isArray(value)) return value.some(containsExecutable);
  if (!isRecord(value)) return false;
  return Object.values(value).some(containsExecutable);
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isAbilityScores(value: unknown): value is AbilityScores {
  return isRecord(value) && hasOnlyKeys(value, ABILITY_KEYS) && ABILITY_KEYS.every((ability) => typeof value[ability] === 'number');
}

function isSkillList(value: unknown): value is SkillId[] {
  return Array.isArray(value) && value.every((skill) => typeof skill === 'string' && SKILL_IDS.includes(skill as SkillId));
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

function isFeatSelectionList(value: unknown): value is CharacterFeatSelection[] {
  return Array.isArray(value) && value.every((selection) =>
    isRecord(selection)
    && hasOnlyKeys(selection, ['featId', 'choices'])
    && typeof selection.featId === 'string'
    && isRecord(selection.choices)
    && Object.values(selection.choices).every((choice) => Array.isArray(choice) && choice.every((item) => typeof item === 'string'))
  );
}

function isContentIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isSpellcastingSelectionList(value: unknown): value is CharacterSpellcastingSelection[] {
  return Array.isArray(value) && value.every((selection) =>
    isRecord(selection)
    && hasOnlyKeys(selection, ['providerId', 'cantripIds', 'ownedSpellIds', 'preparedSpellIds'])
    && typeof selection.providerId === 'string'
    && isContentIdList(selection.cantripIds)
    && isContentIdList(selection.ownedSpellIds)
    && isContentIdList(selection.preparedSpellIds)
  );
}

function isBackgroundAbilityChoice(value: unknown): value is BackgroundAbilityChoice {
  if (!isRecord(value)) return false;
  if (value.mode === 'three-ones') return hasOnlyKeys(value, ['mode']);
  return value.mode === 'two-one'
    && hasOnlyKeys(value, ['mode', 'plusTwo', 'plusOne'])
    && typeof value.plusTwo === 'string'
    && ABILITY_KEYS.includes(value.plusTwo as AbilityKey)
    && typeof value.plusOne === 'string'
    && ABILITY_KEYS.includes(value.plusOne as AbilityKey);
}

function isLegacyHpProgression(value: unknown): value is LegacyHpProgressionEntry[] {
  return Array.isArray(value) && value.every((entry) => {
    if (!isRecord(entry) || !Number.isInteger(entry.level)) return false;
    if (entry.method === 'fixed') return hasOnlyKeys(entry, ['level', 'method']);
    return entry.method === 'rolled' && hasOnlyKeys(entry, ['level', 'method', 'roll']) && Number.isInteger(entry.roll);
  });
}

function isClassHpProgression(value: unknown): value is ClassHpProgressionEntry[] {
  return Array.isArray(value) && value.every((entry) => {
    if (!isRecord(entry) || !Number.isInteger(entry.classLevel)) return false;
    if (entry.method === 'fixed') return hasOnlyKeys(entry, ['classLevel', 'method']);
    return entry.method === 'rolled' && hasOnlyKeys(entry, ['classLevel', 'method', 'roll']) && Number.isInteger(entry.roll);
  });
}

function isClassProgressionList(value: unknown): value is CharacterClassProgression[] {
  return Array.isArray(value) && value.every((entry) =>
    isRecord(entry)
    && hasOnlyKeys(entry, ['classId', 'level', 'subclassId', 'skillProficiencies', 'hpProgression'])
    && typeof entry.classId === 'string'
    && typeof entry.level === 'number'
    && (entry.subclassId === undefined || typeof entry.subclassId === 'string')
    && isSkillList(entry.skillProficiencies)
    && isClassHpProgression(entry.hpProgression)
  );
}

function isHitDicePool(value: unknown): value is HitDiceRemaining {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([rawDie, remaining]) => {
    const die = Number(rawDie);
    return DIE_SIZES.includes(die as DieSize) && isNonNegativeInteger(remaining);
  });
}

function isPlayStateShape(value: unknown): value is CharacterPlayState {
  return isRecord(value)
    && hasOnlyKeys(value, ['currentHp', 'temporaryHp', 'hitDiceRemaining', 'resourceUses'])
    && isRecord(value.resourceUses)
    && isNonNegativeInteger(value.currentHp)
    && isNonNegativeInteger(value.temporaryHp)
    && isHitDicePool(value.hitDiceRemaining)
    && Object.values(value.resourceUses).every(isNonNegativeInteger);
}

function isLegacyPlayStateShape(value: unknown): value is LegacyCharacterPlayStateV8 {
  return isRecord(value)
    && hasOnlyKeys(value, ['currentHp', 'temporaryHp', 'hitDiceRemaining', 'resourceUses'])
    && isRecord(value.resourceUses)
    && isNonNegativeInteger(value.currentHp)
    && isNonNegativeInteger(value.temporaryHp)
    && isNonNegativeInteger(value.hitDiceRemaining)
    && Object.values(value.resourceUses).every(isNonNegativeInteger);
}

function isCurrencyShape(value: unknown): value is CharacterCurrency {
  return isRecord(value) && hasOnlyKeys(value, CURRENCY_UNITS) && CURRENCY_UNITS.every((unit) => isNonNegativeInteger(value[unit]));
}

function isInventoryShape(value: unknown): value is InventoryEntry[] {
  if (!Array.isArray(value)) return false;
  return value.every((entry) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !isPositiveInteger(entry.quantity) || typeof entry.notes !== 'string' || typeof entry.category !== 'string' || !INVENTORY_CATEGORIES.includes(entry.category as InventoryEntry['category'])) return false;
    if (entry.kind === 'custom') {
      return hasOnlyKeys(entry, ['id', 'kind', 'name', 'category', 'quantity', 'notes', 'weightPounds'])
        && typeof entry.name === 'string'
        && (entry.weightPounds === undefined || typeof entry.weightPounds === 'number');
    }
    if (entry.kind !== 'registry' || typeof entry.contentId !== 'string' || typeof entry.equipped !== 'boolean') return false;
    return hasOnlyKeys(entry, ['id', 'kind', 'contentId', 'category', 'quantity', 'equipped', 'notes', 'displayName', 'attackAbilityChoice'])
      && (entry.displayName === undefined || typeof entry.displayName === 'string')
      && (entry.attackAbilityChoice === undefined || (typeof entry.attackAbilityChoice === 'string' && ABILITY_KEYS.includes(entry.attackAbilityChoice as AbilityKey)));
  });
}

function isLegacyAttackChoices(value: unknown): value is LegacyAttackChoices {
  return isRecord(value) && Object.values(value).every((ability) => typeof ability === 'string' && ABILITY_KEYS.includes(ability as AbilityKey));
}

function parseLegacyEquipment(value: unknown): LegacyEquipmentSelection | undefined {
  if (!isRecord(value) || !Array.isArray(value.equippedWeaponIds) || !value.equippedWeaponIds.every((id) => typeof id === 'string')) return undefined;
  if (value.equippedArmorId !== undefined && typeof value.equippedArmorId !== 'string') return undefined;
  if (value.equippedShieldId !== undefined && typeof value.equippedShieldId !== 'string') return undefined;
  const weapons = value.equippedWeaponIds as string[];
  if (new Set(weapons).size !== weapons.length) return undefined;
  return {
    ...(typeof value.equippedArmorId === 'string' ? { equippedArmorId: value.equippedArmorId } : {}),
    ...(typeof value.equippedShieldId === 'string' ? { equippedShieldId: value.equippedShieldId } : {}),
    equippedWeaponIds: [...weapons],
  };
}

function validLegacyEquipment(equipment: LegacyEquipmentSelection, choices: LegacyAttackChoices): boolean {
  if (equipment.equippedArmorId) {
    const armor = contentRegistry.findArmor(equipment.equippedArmorId);
    if (!armor || armor.category === 'shield') return false;
  }
  if (equipment.equippedShieldId) {
    const shield = contentRegistry.findArmor(equipment.equippedShieldId);
    if (!shield || shield.category !== 'shield') return false;
  }
  for (const weaponId of equipment.equippedWeaponIds) {
    const weapon = contentRegistry.findWeapon(weaponId);
    if (!weapon) return false;
    const selected = choices[weaponId];
    const options = getWeaponAttackAbilityOptions(weapon);
    if (options.length > 1 && !selected) return false;
    if (selected && !options.includes(selected)) return false;
  }
  return Object.keys(choices).every((weaponId) => equipment.equippedWeaponIds.includes(weaponId));
}

function cloneInventoryEntry(entry: InventoryEntry): InventoryEntry {
  return entry.kind === 'registry'
    ? { ...entry, ...(entry.displayName ? { displayName: entry.displayName } : {}), ...(entry.attackAbilityChoice ? { attackAbilityChoice: entry.attackAbilityChoice } : {}) }
    : { ...entry, ...(entry.weightPounds !== undefined ? { weightPounds: entry.weightPounds } : {}) };
}

function cloneProgression(progression: CharacterClassProgression): CharacterClassProgression {
  return {
    ...progression,
    skillProficiencies: [...progression.skillProficiencies],
    hpProgression: progression.hpProgression.map((entry) => ({ ...entry })),
  };
}

function cloneInput(input: CharacterInput): CharacterInput {
  return {
    ...input,
    name: input.name.trim(),
    classProgressions: input.classProgressions.map(cloneProgression),
    speciesChoices: { ...input.speciesChoices },
    speciesSkillProficiencies: [...input.speciesSkillProficiencies],
    ...(input.backgroundAbilityChoice ? { backgroundAbilityChoice: { ...input.backgroundAbilityChoice } } : {}),
    manualFeats: input.manualFeats.map((selection) => ({
      featId: selection.featId,
      choices: Object.fromEntries(Object.entries(selection.choices).map(([key, values]) => [key, [...values]])),
    })),
    spellcastingSelections: input.spellcastingSelections.map((selection) => ({
      providerId: selection.providerId,
      cantripIds: [...selection.cantripIds],
      ownedSpellIds: [...selection.ownedSpellIds],
      preparedSpellIds: [...selection.preparedSpellIds],
    })),
    abilityScores: { ...input.abilityScores },
    inventory: input.inventory.map(cloneInventoryEntry),
    currency: { ...input.currency },
  };
}

function clonePlayState(playState: CharacterPlayState): CharacterPlayState {
  return {
    currentHp: playState.currentHp,
    temporaryHp: playState.temporaryHp,
    hitDiceRemaining: { ...playState.hitDiceRemaining },
    resourceUses: { ...playState.resourceUses },
  };
}

function buildCurrentInput(value: Record<string, unknown>): CharacterInput | undefined {
  if (
    typeof value.name !== 'string'
    || typeof value.startingClassId !== 'string'
    || !isClassProgressionList(value.classProgressions)
    || !isAbilityScores(value.abilityScores)
    || !isStringRecord(value.speciesChoices)
    || !isSkillList(value.speciesSkillProficiencies)
    || !isFeatSelectionList(value.manualFeats)
    || !isSpellcastingSelectionList(value.spellcastingSelections)
    || !isInventoryShape(value.inventory)
    || !isCurrencyShape(value.currency)
  ) return undefined;
  if (value.speciesId !== undefined && typeof value.speciesId !== 'string') return undefined;
  if (value.backgroundId !== undefined && typeof value.backgroundId !== 'string') return undefined;
  if (value.speciesSize !== undefined && value.speciesSize !== 'small' && value.speciesSize !== 'medium') return undefined;
  if (value.backgroundAbilityChoice !== undefined && !isBackgroundAbilityChoice(value.backgroundAbilityChoice)) return undefined;
  if (value.backgroundToolChoice !== undefined && typeof value.backgroundToolChoice !== 'string') return undefined;
  if (value.backgroundEquipmentChoice !== undefined && typeof value.backgroundEquipmentChoice !== 'string') return undefined;
  return {
    name: value.name,
    startingClassId: value.startingClassId,
    classProgressions: value.classProgressions.map(cloneProgression),
    ...(typeof value.speciesId === 'string' ? { speciesId: value.speciesId } : {}),
    ...(typeof value.backgroundId === 'string' ? { backgroundId: value.backgroundId } : {}),
    ...(value.speciesSize === 'small' || value.speciesSize === 'medium' ? { speciesSize: value.speciesSize } : {}),
    speciesChoices: { ...value.speciesChoices },
    speciesSkillProficiencies: [...value.speciesSkillProficiencies],
    ...(value.backgroundAbilityChoice ? { backgroundAbilityChoice: { ...value.backgroundAbilityChoice } as BackgroundAbilityChoice } : {}),
    ...(typeof value.backgroundToolChoice === 'string' ? { backgroundToolChoice: value.backgroundToolChoice } : {}),
    ...(typeof value.backgroundEquipmentChoice === 'string' ? { backgroundEquipmentChoice: value.backgroundEquipmentChoice } : {}),
    manualFeats: value.manualFeats.map((selection) => ({
      featId: selection.featId,
      choices: Object.fromEntries(Object.entries(selection.choices).map(([key, values]) => [key, [...values]])),
    })),
    spellcastingSelections: value.spellcastingSelections.map((selection) => ({
      providerId: selection.providerId,
      cantripIds: [...selection.cantripIds],
      ownedSpellIds: [...selection.ownedSpellIds],
      preparedSpellIds: [...selection.preparedSpellIds],
    })),
    abilityScores: { ...value.abilityScores },
    inventory: value.inventory.map(cloneInventoryEntry),
    currency: { ...value.currency },
  };
}

function buildLegacyV8Input(value: Record<string, unknown>): LegacyCharacterInputV8 | undefined {
  if (
    typeof value.name !== 'string'
    || typeof value.classId !== 'string'
    || typeof value.level !== 'number'
    || !isAbilityScores(value.abilityScores)
    || !isSkillList(value.skillProficiencies)
    || !isStringRecord(value.speciesChoices)
    || !isSkillList(value.speciesSkillProficiencies)
    || !isFeatSelectionList(value.manualFeats)
    || !isSpellcastingSelectionList(value.spellcastingSelections)
    || !isInventoryShape(value.inventory)
    || !isCurrencyShape(value.currency)
    || !isLegacyHpProgression(value.hpProgression)
  ) return undefined;
  if (value.subclassId !== undefined && typeof value.subclassId !== 'string') return undefined;
  if (value.speciesId !== undefined && typeof value.speciesId !== 'string') return undefined;
  if (value.backgroundId !== undefined && typeof value.backgroundId !== 'string') return undefined;
  if (value.speciesSize !== undefined && value.speciesSize !== 'small' && value.speciesSize !== 'medium') return undefined;
  if (value.backgroundAbilityChoice !== undefined && !isBackgroundAbilityChoice(value.backgroundAbilityChoice)) return undefined;
  if (value.backgroundToolChoice !== undefined && typeof value.backgroundToolChoice !== 'string') return undefined;
  if (value.backgroundEquipmentChoice !== undefined && typeof value.backgroundEquipmentChoice !== 'string') return undefined;
  return {
    name: value.name,
    classId: value.classId,
    ...(typeof value.subclassId === 'string' ? { subclassId: value.subclassId } : {}),
    ...(typeof value.speciesId === 'string' ? { speciesId: value.speciesId } : {}),
    ...(typeof value.backgroundId === 'string' ? { backgroundId: value.backgroundId } : {}),
    ...(value.speciesSize === 'small' || value.speciesSize === 'medium' ? { speciesSize: value.speciesSize } : {}),
    speciesChoices: { ...value.speciesChoices },
    speciesSkillProficiencies: [...value.speciesSkillProficiencies],
    ...(value.backgroundAbilityChoice ? { backgroundAbilityChoice: { ...value.backgroundAbilityChoice } as BackgroundAbilityChoice } : {}),
    ...(typeof value.backgroundToolChoice === 'string' ? { backgroundToolChoice: value.backgroundToolChoice } : {}),
    ...(typeof value.backgroundEquipmentChoice === 'string' ? { backgroundEquipmentChoice: value.backgroundEquipmentChoice } : {}),
    manualFeats: value.manualFeats.map((selection) => ({
      featId: selection.featId,
      choices: Object.fromEntries(Object.entries(selection.choices).map(([key, values]) => [key, [...values]])),
    })),
    spellcastingSelections: value.spellcastingSelections.map((selection) => ({
      providerId: selection.providerId,
      cantripIds: [...selection.cantripIds],
      ownedSpellIds: [...selection.ownedSpellIds],
      preparedSpellIds: [...selection.preparedSpellIds],
    })),
    level: value.level,
    abilityScores: { ...value.abilityScores },
    skillProficiencies: [...value.skillProficiencies],
    inventory: value.inventory.map(cloneInventoryEntry),
    currency: { ...value.currency },
    hpProgression: value.hpProgression.map((entry) => ({ ...entry })),
  };
}

function migrateV8InputToV9(input: LegacyCharacterInputV8): CharacterInput {
  const hpProgression: ClassHpProgressionEntry[] = input.hpProgression.map((entry) =>
    entry.method === 'fixed'
      ? { classLevel: entry.level, method: 'fixed' }
      : { classLevel: entry.level, method: 'rolled', roll: entry.roll }
  );
  const progression: CharacterClassProgression = {
    classId: input.classId,
    level: input.level,
    ...(input.subclassId ? { subclassId: input.subclassId } : {}),
    skillProficiencies: [...input.skillProficiencies],
    hpProgression,
  };
  return {
    name: input.name,
    startingClassId: input.classId,
    classProgressions: [progression],
    ...(input.speciesId ? { speciesId: input.speciesId } : {}),
    ...(input.backgroundId ? { backgroundId: input.backgroundId } : {}),
    ...(input.speciesSize ? { speciesSize: input.speciesSize } : {}),
    speciesChoices: { ...input.speciesChoices },
    speciesSkillProficiencies: [...input.speciesSkillProficiencies],
    ...(input.backgroundAbilityChoice ? { backgroundAbilityChoice: { ...input.backgroundAbilityChoice } } : {}),
    ...(input.backgroundToolChoice ? { backgroundToolChoice: input.backgroundToolChoice } : {}),
    ...(input.backgroundEquipmentChoice ? { backgroundEquipmentChoice: input.backgroundEquipmentChoice } : {}),
    manualFeats: input.manualFeats.map((selection) => ({
      featId: selection.featId,
      choices: Object.fromEntries(Object.entries(selection.choices).map(([key, values]) => [key, [...values]])),
    })),
    spellcastingSelections: input.spellcastingSelections.map((selection) => ({
      providerId: selection.providerId,
      cantripIds: [...selection.cantripIds],
      ownedSpellIds: [...selection.ownedSpellIds],
      preparedSpellIds: [...selection.preparedSpellIds],
    })),
    abilityScores: { ...input.abilityScores },
    inventory: input.inventory.map(cloneInventoryEntry),
    currency: { ...input.currency },
  };
}

function derivePlayStateContext(input: CharacterInput, registry = contentRegistry): PlayStateContext | undefined {
  const single = getSingleClassProgression(input);
  if (!single.ok) {
    if (input.classProgressions.length < 2) return undefined;
    const derived = deriveCharacterState({
      ...cloneInput(input),
      id: 'derived-play-state-context',
      playState: { currentHp: 0, temporaryHp: 0, hitDiceRemaining: {}, resourceUses: {} },
      createdAt: '1970-01-01T00:00:00.000Z',
      updatedAt: '1970-01-01T00:00:00.000Z',
    }, registry);
    return derived.ok ? { health: derived.value.health, resources: derived.value.resources } : undefined;
  }
  const progression = single.value;
  const classContent = registry.findClass(progression.classId);
  if (!classContent) return undefined;
  const backgroundScores = deriveEffectiveAbilityScores(input, registry);
  if (!backgroundScores.ok) return undefined;
  const featState = deriveCharacterFeats(input, registry, backgroundScores.value);
  if (!featState.ok) return undefined;
  const classState = deriveCharacterClass(input, registry);
  if (!classState.ok) return undefined;
  const subclassState = deriveCharacterSubclass(input, registry);
  if (!subclassState.ok) return undefined;
  const proficiency = deriveProficiencyBonus(getTotalCharacterLevel(input), classContent);
  if (!proficiency.ok) return undefined;
  const featRuleEffects = featState.value.effects.filter((effect) => effect.type !== 'ability-score-increase');
  const ruleEffects = [...featRuleEffects, ...classState.value.effects, ...subclassState.value.effects];
  const health = deriveHealth({ ...input, abilityScores: featState.value.abilityScores }, classContent, ruleEffects);
  const abilityModifiers = deriveAbilityModifiers(featState.value.abilityScores);
  const classResources = deriveResourceDefinitions(
    progression.level,
    [...classContent.resources, ...classState.value.resources, ...subclassState.value.resources],
    [...classState.value.resourceConsumers, ...subclassState.value.resourceConsumers],
    abilityModifiers,
  );
  const spellcasting = deriveSpellcastingProviders(
    [...classState.value.spellcastingProviders, ...subclassState.value.spellcastingProviders],
    progression.level,
    abilityModifiers,
    proficiency.value,
    registry,
    [...classState.value.spellGrants, ...subclassState.value.spellGrants],
    input.spellcastingSelections,
  );
  if (!health.ok || !classResources.ok || !spellcasting.ok) return undefined;
  const resources = [...classResources.value, ...spellcasting.value.resources];
  if (new Set(resources.map((resource) => resource.id)).size !== resources.length) return undefined;
  return { health: health.value, resources };
}

function validIdentityAndTimestamps(value: Record<string, unknown>): value is Record<string, unknown> & { id: string; createdAt: string; updatedAt: string } {
  return typeof value.id === 'string' && Boolean(value.id.trim()) && isValidTimestamp(value.createdAt) && isValidTimestamp(value.updatedAt);
}

function validateHitDiceAgainstProgressions(state: CharacterPlayState, input: CharacterInput, registry: ContentRegistry): boolean {
  const maxima = new Map<DieSize, number>();
  for (const progression of input.classProgressions) {
    const classContent = registry.findClass(progression.classId);
    if (!classContent) return false;
    maxima.set(classContent.hitDie, (maxima.get(classContent.hitDie) ?? 0) + progression.level);
  }
  for (const [rawDie, remaining] of Object.entries(state.hitDiceRemaining)) {
    const die = Number(rawDie) as DieSize;
    const maximum = maxima.get(die);
    if (maximum === undefined || remaining === undefined || remaining > maximum) return false;
  }
  return true;
}

const CURRENT_CHARACTER_KEYS = [
  'id', 'name', 'startingClassId', 'classProgressions',
  'speciesId', 'backgroundId', 'speciesSize', 'speciesChoices', 'speciesSkillProficiencies',
  'backgroundAbilityChoice', 'backgroundToolChoice', 'backgroundEquipmentChoice',
  'manualFeats', 'spellcastingSelections', 'abilityScores', 'inventory', 'currency',
  'playState', 'createdAt', 'updatedAt',
] as const;

function parseCurrentCharacter(value: unknown, registry: ContentRegistry = contentRegistry): Character | undefined {
  if (
    !isRecord(value)
    || containsExecutable(value)
    || !hasOnlyKeys(value, CURRENT_CHARACTER_KEYS)
    || !validIdentityAndTimestamps(value)
    || !isPlayStateShape(value.playState)
  ) return undefined;

  const input = buildCurrentInput(value);
  if (!input || hasValidationErrors(validateCharacterInput(input, { allowLegacyEmptySkills: true, allowIncompleteOrigin: true, allowIncompleteSubclass: true }, registry))) return undefined;

  const playState = clonePlayState(value.playState);
  if (!validateHitDiceAgainstProgressions(playState, input, registry)) return undefined;

  const single = getSingleClassProgression(input);
  if (single.ok) {
    const context = derivePlayStateContext(input, registry);
    if (!context || !validatePlayState(playState, context).ok) return undefined;
  }

  return { ...cloneInput(input), id: value.id, playState, createdAt: value.createdAt, updatedAt: value.updatedAt };
}

export function isCharacter(value: unknown, registry: ContentRegistry = contentRegistry): value is Character {
  return Boolean(parseCurrentCharacter(value, registry));
}

export function serializeCharacters(characters: Character[]): string {
  return JSON.stringify(characters);
}

export function deserializeCharacters(raw: string | null, registry: ContentRegistry = contentRegistry): Character[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((value) => parseCurrentCharacter(value, registry)).filter((item): item is Character => Boolean(item))
      : [];
  } catch {
    return [];
  }
}

function migratedEntryId(contentId: string): string {
  return `migrated:${contentId}`;
}

function legacyEquipmentToInventory(equipment: LegacyEquipmentSelection, choices: LegacyAttackChoices): InventoryEntry[] {
  const inventory: InventoryEntry[] = [];
  const seen = new Set<string>();
  const add = (contentId: string, category: 'weapon' | 'armor' | 'shield') => {
    if (seen.has(contentId)) return;
    seen.add(contentId);
    inventory.push({
      id: migratedEntryId(contentId),
      kind: 'registry',
      contentId,
      category,
      quantity: 1,
      equipped: true,
      notes: '',
      ...(category === 'weapon' && choices[contentId] ? { attackAbilityChoice: choices[contentId] } : {}),
    });
  };
  if (equipment.equippedArmorId) add(equipment.equippedArmorId, 'armor');
  if (equipment.equippedShieldId) add(equipment.equippedShieldId, 'shield');
  equipment.equippedWeaponIds.forEach((id) => add(id, 'weapon'));
  return inventory;
}

function createLegacyFixedHpProgression(level: number): LegacyHpProgressionEntry[] {
  return Array.from({ length: Math.max(0, level - 1) }, (_, index) => ({ level: index + 2, method: 'fixed' as const }));
}

function migrateLegacyPlayStateV8(
  playState: LegacyCharacterPlayStateV8,
  classId: string,
  registry: ContentRegistry,
): CharacterPlayState | undefined {
  const classContent = registry.findClass(classId);
  if (!classContent) return undefined;
  const hitDiceRemaining: HitDiceRemaining = {};
  if (playState.hitDiceRemaining > 0) hitDiceRemaining[classContent.hitDie] = playState.hitDiceRemaining;
  return {
    currentHp: playState.currentHp,
    temporaryHp: playState.temporaryHp,
    hitDiceRemaining,
    resourceUses: { ...playState.resourceUses },
  };
}

function buildMigratedCharacterFromV8(
  inputV8: LegacyCharacterInputV8,
  identity: { id: string; createdAt: string; updatedAt: string },
  playStateV8?: LegacyCharacterPlayStateV8,
  registry: ContentRegistry = contentRegistry,
): Character | undefined {
  const input = migrateV8InputToV9(inputV8);
  if (hasValidationErrors(validateCharacterInput(input, { allowLegacyEmptySkills: true, allowIncompleteOrigin: true, allowIncompleteSubclass: true }, registry))) return undefined;
  const context = derivePlayStateContext(input, registry);
  if (!context) return undefined;

  let playState = initializePlayState(context);
  if (playStateV8) {
    const migrated = migrateLegacyPlayStateV8(playStateV8, inputV8.classId, registry);
    if (!migrated) return undefined;
    playState = normalizePlayState(migrated, context);
  }
  if (!validatePlayState(playState, context).ok) return undefined;

  return {
    ...cloneInput(input),
    id: identity.id,
    playState,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt,
  };
}

interface LegacyCharacterV1 {
  id: string;
  name: string;
  class: LegacyCharacterClass;
  level: number;
  abilityScores: AbilityScores;
  createdAt: string;
  updatedAt: string;
}

function parseLegacyCharacterV1(value: unknown): LegacyCharacterV1 | undefined {
  if (!isRecord(value) || !isAbilityScores(value.abilityScores) || !validIdentityAndTimestamps(value) || typeof value.name !== 'string' || value.class !== 'Fighter' || typeof value.level !== 'number' || !Number.isInteger(value.level) || value.level < 1 || value.level > 20) return undefined;
  const abilityScores = value.abilityScores;
  if (ABILITY_KEYS.some((ability) => !Number.isInteger(abilityScores[ability]) || abilityScores[ability] < 1 || abilityScores[ability] > 30)) return undefined;
  return value as unknown as LegacyCharacterV1;
}

interface LegacyBuildBase {
  name: string;
  classId: string;
  level: number;
  abilityScores: AbilityScores;
  skillProficiencies: SkillId[];
  equipment: LegacyEquipmentSelection;
  weaponAttackAbilityChoices: LegacyAttackChoices;
}

function parseLegacyBuildBase(value: Record<string, unknown>): LegacyBuildBase | undefined {
  const equipment = parseLegacyEquipment(value.equipment);
  if (typeof value.name !== 'string' || typeof value.classId !== 'string' || typeof value.level !== 'number' || !isAbilityScores(value.abilityScores) || !isSkillList(value.skillProficiencies) || !equipment || !isLegacyAttackChoices(value.weaponAttackAbilityChoices) || !validLegacyEquipment(equipment, value.weaponAttackAbilityChoices)) return undefined;
  return {
    name: value.name,
    classId: value.classId,
    level: value.level,
    abilityScores: { ...value.abilityScores },
    skillProficiencies: [...value.skillProficiencies],
    equipment,
    weaponAttackAbilityChoices: { ...value.weaponAttackAbilityChoices },
  };
}

function legacyBaseToV8Input(base: LegacyBuildBase, hpProgression: LegacyHpProgressionEntry[]): LegacyCharacterInputV8 {
  return {
    name: base.name,
    classId: base.classId,
    speciesChoices: {},
    speciesSkillProficiencies: [],
    manualFeats: [],
    spellcastingSelections: [],
    level: base.level,
    abilityScores: { ...base.abilityScores },
    skillProficiencies: [...base.skillProficiencies],
    inventory: legacyEquipmentToInventory(base.equipment, base.weaponAttackAbilityChoices),
    currency: { ...EMPTY_CURRENCY },
    hpProgression: hpProgression.map((entry) => ({ ...entry })),
  };
}

export function migrateLegacyCharacter(value: unknown): Character | undefined {
  const legacy = parseLegacyCharacterV1(value);
  if (!legacy) return undefined;
  const classId = LEGACY_CLASS_ID_MAP[legacy.class];
  if (!classId) return undefined;
  const inputV8: LegacyCharacterInputV8 = {
    name: legacy.name,
    classId,
    speciesChoices: {},
    speciesSkillProficiencies: [],
    manualFeats: [],
    spellcastingSelections: [],
    level: legacy.level,
    abilityScores: { ...legacy.abilityScores },
    skillProficiencies: [],
    inventory: [],
    currency: { ...EMPTY_CURRENCY },
    hpProgression: createLegacyFixedHpProgression(legacy.level),
  };
  return buildMigratedCharacterFromV8(inputV8, legacy);
}

export function migrateLegacyV2Character(value: unknown): Character | undefined {
  if (!isRecord(value) || !validIdentityAndTimestamps(value)) return undefined;
  const base = parseLegacyBuildBase(value);
  if (!base) return undefined;
  return buildMigratedCharacterFromV8(legacyBaseToV8Input(base, createLegacyFixedHpProgression(base.level)), value);
}

export function migrateLegacyV3Character(value: unknown): Character | undefined {
  if (!isRecord(value) || !validIdentityAndTimestamps(value) || !isLegacyHpProgression(value.hpProgression) || !isLegacyPlayStateShape(value.playState)) return undefined;
  const base = parseLegacyBuildBase(value);
  if (!base) return undefined;
  return buildMigratedCharacterFromV8(legacyBaseToV8Input(base, value.hpProgression), value, value.playState);
}

export function migrateLegacyV4Character(value: unknown): Character | undefined {
  if (!isRecord(value) || !validIdentityAndTimestamps(value) || !isLegacyPlayStateShape(value.playState)) return undefined;
  if (typeof value.name !== 'string' || typeof value.classId !== 'string' || typeof value.level !== 'number' || !isAbilityScores(value.abilityScores) || !isSkillList(value.skillProficiencies) || !isInventoryShape(value.inventory) || !isCurrencyShape(value.currency) || !isLegacyHpProgression(value.hpProgression)) return undefined;
  const inputV8: LegacyCharacterInputV8 = {
    name: value.name,
    classId: value.classId,
    speciesChoices: {},
    speciesSkillProficiencies: [],
    manualFeats: [],
    spellcastingSelections: [],
    level: value.level,
    abilityScores: { ...value.abilityScores },
    skillProficiencies: [...value.skillProficiencies],
    inventory: value.inventory.map(cloneInventoryEntry),
    currency: { ...value.currency },
    hpProgression: value.hpProgression.map((entry) => ({ ...entry })),
  };
  return buildMigratedCharacterFromV8(inputV8, value, value.playState);
}

export function migrateLegacyV5Character(value: unknown): Character | undefined {
  if (!isRecord(value) || !validIdentityAndTimestamps(value) || !isLegacyPlayStateShape(value.playState)) return undefined;
  const input = buildLegacyV8Input({ ...value, manualFeats: [], spellcastingSelections: [] });
  return input ? buildMigratedCharacterFromV8(input, value, value.playState) : undefined;
}

export function migrateLegacyV6Character(value: unknown): Character | undefined {
  if (!isRecord(value) || !validIdentityAndTimestamps(value) || !isLegacyPlayStateShape(value.playState)) return undefined;
  const input = buildLegacyV8Input({ ...value, subclassId: undefined, spellcastingSelections: [] });
  return input ? buildMigratedCharacterFromV8(input, value, value.playState) : undefined;
}

export function migrateLegacyV7Character(value: unknown): Character | undefined {
  if (!isRecord(value) || !validIdentityAndTimestamps(value) || !isLegacyPlayStateShape(value.playState)) return undefined;
  const input = buildLegacyV8Input({ ...value, spellcastingSelections: [] });
  return input ? buildMigratedCharacterFromV8(input, value, value.playState) : undefined;
}

export function migrateLegacyV8Character(value: unknown, registry: ContentRegistry = contentRegistry): Character | undefined {
  if (!isRecord(value) || containsExecutable(value) || !validIdentityAndTimestamps(value) || !isLegacyPlayStateShape(value.playState)) return undefined;
  const input = buildLegacyV8Input(value);
  return input ? buildMigratedCharacterFromV8(input, value, value.playState, registry) : undefined;
}

function migrateArray(raw: string | null, migrate: (value: unknown) => Character | undefined): Character[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(migrate).filter((item): item is Character => Boolean(item))
      : [];
  } catch {
    return [];
  }
}

export const migrateLegacyCharacters = (raw: string | null) => migrateArray(raw, migrateLegacyCharacter);
export const migrateLegacyV2Characters = (raw: string | null) => migrateArray(raw, migrateLegacyV2Character);
export const migrateLegacyV3Characters = (raw: string | null) => migrateArray(raw, migrateLegacyV3Character);
export const migrateLegacyV4Characters = (raw: string | null) => migrateArray(raw, migrateLegacyV4Character);
export const migrateLegacyV5Characters = (raw: string | null) => migrateArray(raw, migrateLegacyV5Character);
export const migrateLegacyV6Characters = (raw: string | null) => migrateArray(raw, migrateLegacyV6Character);
export const migrateLegacyV7Characters = (raw: string | null) => migrateArray(raw, migrateLegacyV7Character);
export const migrateLegacyV8Characters = (raw: string | null) => migrateArray(raw, migrateLegacyV8Character);

function browserStorage(): Storage {
  return window.localStorage;
}

export function loadCharacters(storage: Storage = browserStorage(), registry: ContentRegistry = contentRegistry): Character[] {
  const currentRaw = storage.getItem(CHARACTER_STORAGE_KEY);
  if (currentRaw !== null) return deserializeCharacters(currentRaw, registry);

  const candidates: Array<[string, (raw: string | null) => Character[]]> = [
    [LEGACY_CHARACTER_STORAGE_V8_KEY, (raw) => migrateArray(raw, (value) => migrateLegacyV8Character(value, registry))],
    [LEGACY_CHARACTER_STORAGE_V7_KEY, migrateLegacyV7Characters],
    [LEGACY_CHARACTER_STORAGE_V6_KEY, migrateLegacyV6Characters],
    [LEGACY_CHARACTER_STORAGE_V5_KEY, migrateLegacyV5Characters],
    [LEGACY_CHARACTER_STORAGE_V4_KEY, migrateLegacyV4Characters],
    [LEGACY_CHARACTER_STORAGE_V3_KEY, migrateLegacyV3Characters],
    [LEGACY_CHARACTER_STORAGE_V2_KEY, migrateLegacyV2Characters],
    [LEGACY_CHARACTER_STORAGE_KEY, migrateLegacyCharacters],
  ];
  for (const [key, migrate] of candidates) {
    const raw = storage.getItem(key);
    if (raw === null) continue;
    const migrated = migrate(raw);
    saveCharacters(migrated, storage);
    return migrated;
  }
  return [];
}

export function saveCharacters(characters: Character[], storage: Storage = browserStorage()): void {
  storage.setItem(CHARACTER_STORAGE_KEY, serializeCharacters(characters));
}

function assertValidInput(
  input: CharacterInput,
  allowLegacyEmptySkills = false,
  allowIncompleteOrigin = false,
  allowIncompleteSubclass = false,
  registry: ContentRegistry = contentRegistry,
): void {
  if (hasValidationErrors(validateCharacterInput(input, { allowLegacyEmptySkills, allowIncompleteOrigin, allowIncompleteSubclass }, registry))) {
    throw new Error('Cannot persist an invalid character.');
  }
}

function hasReachedSubclassThreshold(input: CharacterInput, registry: ContentRegistry = contentRegistry): boolean {
  const single = getSingleClassProgression(input);
  if (!single.ok) return false;
  return registry.findSubclassesForClass(single.value.classId).some((subclass) => single.value.level >= subclass.acquisitionLevel);
}

function createCharacterId(): string {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `character-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nextUpdatedAt(previousUpdatedAt: string): string {
  const previousTime = Date.parse(previousUpdatedAt);
  return new Date(Math.max(Date.now(), Number.isNaN(previousTime) ? 0 : previousTime + 1)).toISOString();
}

export function createCharacter(input: CharacterInput, storage: Storage = browserStorage(), registry: ContentRegistry = contentRegistry): Character {
  assertValidInput(input, false, false, false, registry);
  const context = derivePlayStateContext(input, registry);
  if (!context) throw new Error('Cannot derive initial play state for character.');
  const now = new Date().toISOString();
  const character: Character = {
    ...cloneInput(input),
    id: createCharacterId(),
    playState: initializePlayState(context),
    createdAt: now,
    updatedAt: now,
  };
  saveCharacters([...loadCharacters(storage, registry), character], storage);
  return character;
}

export function getCharacterById(id: string, storage: Storage = browserStorage(), registry: ContentRegistry = contentRegistry): Character | undefined {
  return loadCharacters(storage, registry).find((character) => character.id === id);
}

export function updateCharacter(
  id: string,
  input: CharacterInput,
  storage: Storage = browserStorage(),
  registry: ContentRegistry = contentRegistry,
): Character | undefined {
  const characters = loadCharacters(storage, registry);
  const index = characters.findIndex((character) => character.id === id);
  if (index < 0) return undefined;

  const existing = characters[index];
  const existingSingle = getSingleClassProgression(existing);
  const inputSingle = getSingleClassProgression(input);

  const allowLegacyEmptySkills = existingSingle.ok
    && inputSingle.ok
    && existingSingle.value.skillProficiencies.length === 0
    && inputSingle.value.skillProficiencies.length === 0;
  const allowIncompleteOrigin = !existing.speciesId && !existing.backgroundId && !input.speciesId && !input.backgroundId;
  const allowIncompleteSubclass = existingSingle.ok
    && inputSingle.ok
    && !existingSingle.value.subclassId
    && !inputSingle.value.subclassId
    && existingSingle.value.classId === inputSingle.value.classId
    && hasReachedSubclassThreshold(existing, registry);

  assertValidInput(input, allowLegacyEmptySkills, allowIncompleteOrigin, allowIncompleteSubclass, registry);
  const previousContext = derivePlayStateContext(existing, registry);
  const nextContext = derivePlayStateContext(input, registry);
  if (!previousContext || !nextContext) throw new Error('Cannot reconcile character play state.');

  const updated: Character = {
    ...cloneInput(input),
    id: existing.id,
    playState: reconcilePlayState(existing.playState, previousContext, nextContext),
    createdAt: existing.createdAt,
    updatedAt: nextUpdatedAt(existing.updatedAt),
  };
  characters[index] = updated;
  saveCharacters(characters, storage);
  return updated;
}

export function updateCharacterInventoryState(
  id: string,
  inventory: InventoryEntry[],
  currency: CharacterCurrency,
  storage: Storage = browserStorage(),
  registry: ContentRegistry = contentRegistry,
): Character | undefined {
  const characters = loadCharacters(storage, registry);
  const index = characters.findIndex((character) => character.id === id);
  if (index < 0) return undefined;

  const existing = characters[index];
  const single = getSingleClassProgression(existing);
  if (!single.ok) throw new Error('Cannot edit a multiclass character during M14-B.');

  const input: CharacterInput = {
    ...cloneInput(existing),
    inventory: inventory.map(cloneInventoryEntry),
    currency: { ...currency },
  };
  const allowLegacyEmptySkills = single.value.skillProficiencies.length === 0;
  const allowIncompleteOrigin = !existing.speciesId && !existing.backgroundId;
  const allowIncompleteSubclass = !single.value.subclassId && hasReachedSubclassThreshold(existing, registry);
  assertValidInput(input, allowLegacyEmptySkills, allowIncompleteOrigin, allowIncompleteSubclass, registry);

  const updated: Character = {
    ...existing,
    inventory: input.inventory,
    currency: input.currency,
    updatedAt: nextUpdatedAt(existing.updatedAt),
  };
  characters[index] = updated;
  saveCharacters(characters, storage);
  return updated;
}

export function updateCharacterPlayState(
  id: string,
  playState: CharacterPlayState,
  storage: Storage = browserStorage(),
  registry: ContentRegistry = contentRegistry,
): Character | undefined {
  const characters = loadCharacters(storage, registry);
  const index = characters.findIndex((character) => character.id === id);
  if (index < 0) return undefined;

  const existing = characters[index];
  const context = derivePlayStateContext(existing, registry);
  if (!context || !validatePlayState(playState, context).ok) throw new Error('Cannot persist invalid character play state.');

  const updated: Character = {
    ...existing,
    playState: clonePlayState(playState),
    updatedAt: nextUpdatedAt(existing.updatedAt),
  };
  characters[index] = updated;
  saveCharacters(characters, storage);
  return updated;
}

export function deleteCharacter(id: string, storage: Storage = browserStorage()): boolean {
  const characters = loadCharacters(storage);
  const remaining = characters.filter((character) => character.id !== id);
  if (remaining.length === characters.length) return false;
  saveCharacters(remaining, storage);
  return true;
}
