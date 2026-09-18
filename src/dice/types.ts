import type { AbilityKey, SkillId } from '../models/character';
import type { DamageType } from '../models/content';
import type { ContentId } from '../models/contentId';

export const ROLL_DIE_SIZES = [4, 6, 8, 10, 12, 20, 100] as const;
export type RollDieSize = (typeof ROLL_DIE_SIZES)[number];

export interface DiceTerm {
  readonly quantity: number;
  readonly die: RollDieSize;
}

export type RollExpression =
  | { readonly kind: 'dice'; readonly dice: readonly DiceTerm[]; readonly modifier: number }
  | { readonly kind: 'fixed'; readonly amount: number; readonly modifier: number };

export type RollMode = 'normal' | 'advantage' | 'disadvantage';
export type NaturalD20 = 'nat20' | 'nat1';
export type RollType = 'ability-check' | 'skill-check' | 'saving-throw' | 'initiative' | 'attack' | 'damage' | 'healing' | 'hit-die' | 'feature';

export interface D20ModifierSource {
  readonly label: string;
  readonly amount: number;
}

export interface D20RollContext {
  readonly modifiers?: readonly D20ModifierSource[];
  readonly advantageSources?: readonly string[];
  readonly disadvantageSources?: readonly string[];
}

export interface RollSource {
  readonly characterId: string;
  readonly ability?: AbilityKey;
  readonly skillId?: SkillId;
  readonly weaponId?: ContentId;
  readonly spellId?: ContentId;
  readonly spellcastingProviderId?: ContentId;
  readonly spellSlotResourceId?: ContentId;
  readonly resourceId?: ContentId;
  readonly consumerId?: ContentId;
  readonly contentId?: ContentId;
}

export interface RollOutcomeContext {
  readonly kind: 'damage' | 'healing' | 'check' | 'attack' | 'save' | 'feature';
  readonly damageType?: DamageType;
}

export type RollDiceTransformation =
  | {
      readonly id: ContentId;
      readonly sourceLabel: string;
      readonly optional: boolean;
      readonly type: 'reroll-once-use-new';
      readonly die: 20;
      readonly qualifyingFaces: readonly number[];
    }
  | {
      readonly id: ContentId;
      readonly sourceLabel: string;
      readonly optional: boolean;
      readonly type: 'minimum-die-face';
      readonly die: RollDieSize;
      readonly minimum: number;
    };

export type RollDiceTransformationApplication =
  | {
      readonly transformationId: ContentId;
      readonly sourceLabel: string;
      readonly type: 'reroll-once-use-new';
      readonly die: RollDieSize;
      readonly original: number;
      readonly replacement: number;
      readonly final: number;
    }
  | {
      readonly transformationId: ContentId;
      readonly sourceLabel: string;
      readonly type: 'minimum-die-face';
      readonly die: RollDieSize;
      readonly original: number;
      readonly final: number;
    };

export interface RollRequest {
  readonly type: RollType;
  readonly label: string;
  readonly expression: RollExpression;
  readonly mode: RollMode;
  readonly d20Context?: D20RollContext;
  readonly diceTransformations?: readonly RollDiceTransformation[];
  readonly criticalThreshold?: number;
  readonly source: RollSource;
  readonly outcome: RollOutcomeContext;
}

export interface RolledDiceGroup {
  readonly die: RollDieSize;
  readonly values: readonly number[];
}

export type RollStateEffect =
  | { readonly kind: 'hp'; readonly before: number; readonly after: number }
  | { readonly kind: 'resource'; readonly resourceId: ContentId; readonly before: number; readonly after: number }
  | { readonly kind: 'hit-dice'; readonly before: number; readonly after: number };

export interface RollResult {
  readonly request: RollRequest;
  readonly dice: readonly RolledDiceGroup[];
  readonly modifier: number;
  readonly total: number;
  readonly keptD20?: number;
  readonly natural?: NaturalD20;
  readonly critical?: boolean;
  readonly resolvedMode?: RollMode;
  readonly contextualModifier?: number;
  readonly diceTransformationApplications?: readonly RollDiceTransformationApplication[];
  readonly effects: readonly RollStateEffect[];
}

export interface RollHistoryEntry {
  readonly id: string;
  readonly rolledAt: string;
  readonly result: RollResult;
}

export type RandomSource = () => number;
