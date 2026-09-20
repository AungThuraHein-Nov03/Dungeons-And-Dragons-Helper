import type { DieSize } from './content';
import type { ContentId } from './contentId';

export const ABILITY_KEYS = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
] as const;

export type AbilityKey = (typeof ABILITY_KEYS)[number];
export type AbilityScores = Record<AbilityKey, number>;

export const SKILL_IDS = [
  'acrobatics',
  'animal-handling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleight-of-hand',
  'stealth',
  'survival',
] as const;

export type SkillId = (typeof SKILL_IDS)[number];

export function isSkillId(value: string): value is SkillId {
  return SKILL_IDS.includes(value as SkillId);
}

export const INVENTORY_CATEGORIES = [
  'weapon',
  'armor',
  'shield',
  'ammunition',
  'consumable',
  'adventuring-gear',
  'campaign-item',
  'other',
] as const;

export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

interface BaseInventoryEntry {
  id: string;
  quantity: number;
  notes: string;
  category: InventoryCategory;
}

export interface RegistryInventoryEntry extends BaseInventoryEntry {
  kind: 'registry';
  contentId: ContentId;
  equipped: boolean;
  displayName?: string;
  attackAbilityChoice?: AbilityKey;
}

export interface CustomInventoryEntry extends BaseInventoryEntry {
  kind: 'custom';
  name: string;
  weightPounds?: number;
}

export type InventoryEntry = RegistryInventoryEntry | CustomInventoryEntry;

export const CURRENCY_UNITS = ['cp', 'sp', 'ep', 'gp', 'pp'] as const;
export type CurrencyUnit = (typeof CURRENCY_UNITS)[number];
export type CharacterCurrency = Record<CurrencyUnit, number>;

export const EMPTY_CURRENCY: CharacterCurrency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

export type ClassHpProgressionEntry =
  | { readonly classLevel: number; readonly method: 'fixed' }
  | { readonly classLevel: number; readonly method: 'rolled'; readonly roll: number };

export interface CharacterClassProgression {
  classId: ContentId;
  level: number;
  subclassId?: ContentId;
  skillProficiencies: SkillId[];
  hpProgression: ClassHpProgressionEntry[];
}

export type HitDiceRemaining = Partial<Record<DieSize, number>>;

export interface CharacterPlayState {
  currentHp: number;
  temporaryHp: number;
  hitDiceRemaining: HitDiceRemaining;
  resourceUses: Record<ContentId, number>;
}

export type BackgroundAbilityChoice =
  | { mode: 'two-one'; plusTwo: AbilityKey; plusOne: AbilityKey }
  | { mode: 'three-ones' };

export interface CharacterFeatSelection {
  featId: ContentId;
  choices: Record<string, string[]>;
}

export interface CharacterSpellcastingSelection {
  providerId: ContentId;
  cantripIds: ContentId[];
  ownedSpellIds: ContentId[];
  preparedSpellIds: ContentId[];
}

export interface CharacterInput {
  name: string;
  startingClassId: ContentId;
  classProgressions: CharacterClassProgression[];
  speciesId?: ContentId;
  backgroundId?: ContentId;
  speciesSize?: 'small' | 'medium';
  speciesChoices: Record<string, string>;
  speciesSkillProficiencies: SkillId[];
  backgroundAbilityChoice?: BackgroundAbilityChoice;
  backgroundToolChoice?: string;
  backgroundEquipmentChoice?: string;
  manualFeats: CharacterFeatSelection[];
  spellcastingSelections: CharacterSpellcastingSelection[];
  abilityScores: AbilityScores;
  inventory: InventoryEntry[];
  currency: CharacterCurrency;
}

export interface Character extends CharacterInput {
  id: string;
  playState: CharacterPlayState;
  createdAt: string;
  updatedAt: string;
}

export const LEGACY_CHARACTER_CLASSES = ['Fighter'] as const;
export type LegacyCharacterClass = (typeof LEGACY_CHARACTER_CLASSES)[number];
