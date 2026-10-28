import { ABILITY_KEYS } from '../models/character';
import type {
  AbilityKey,
  AbilityScores,
  Character,
  CharacterClassProgression,
  CharacterFeatSelection,
  CharacterInput,
  CharacterSpellcastingSelection,
  SkillId,
  LanguageId,
} from '../models/character';
import type { ClassContent, FeatCategory, FeatContent, SpellContent, SpellcastingProviderDefinition } from '../models/content';
import type { RandomSource } from '../dice/types';
import { rollRequest, systemRandom } from '../dice/diceEngine';
import type { ContentId } from '../models/contentId';
import type { ContentRegistry } from '../services/contentRegistry';
import { MAX_CHARACTER_LEVEL, hasValidationErrors, validateCharacterInput } from '../utils/characterValidation';
import { deriveEffectiveAbilityScores } from './background';
import { deriveSkillExpertiseChoices, validateSkillExpertiseSelections } from './characterChoices';
import { deriveWeaponMasteryChoices, validateWeaponMasterySelections } from './weaponMasteryChoices';
import { deriveLanguageChoices, validateLanguageChoices } from './languageChoices';
import { getTotalCharacterLevel } from './characterProgression';
import {
  classProgressionSkillChoiceContext,
  validateClassProgressionSkillProficiencies,
} from './classProficiencies';
import { validateHpProgression } from './health';
import { deriveCharacterFeats, validateFeatSelection } from './feats';
import { deriveCharacterState } from './deriveCharacter';
import {
  maximumSelectableSpellLevel,
  spellBelongsToProviderList,
  spellcastingProviderDefinitionsAtLevel,
} from './spellcasting';
import type { DerivedMechanicalOwner, DerivedSpellcastingProvider } from './types';
import {
  meetsMulticlassPrimaryAbilityRequirement,
  MULTICLASS_PRIMARY_ABILITY_MINIMUM,
} from './multiclass';

export type LevelUpTarget =
  | { readonly kind: 'existing-class'; readonly classId: ContentId }
  | { readonly kind: 'new-class'; readonly classId: ContentId };

export type LevelUpHitPointChoice =
  | { readonly method: 'fixed' }
  | { readonly method: 'rolled'; readonly roll: number };

export type LevelUpFeatPath = 'ability-score-improvement' | 'feat';

export interface LevelUpAdvancementFeatChoice {
  readonly grantId: ContentId;
  readonly path: LevelUpFeatPath;
  readonly selection?: CharacterFeatSelection;
}

export interface LevelUpSpellReplacementChoice {
  readonly outgoingSpellId?: ContentId;
  readonly incomingSpellId?: ContentId;
}

export interface LevelUpSpellcastingProviderChoice {
  readonly providerId: ContentId;
  readonly addedCantripIds: readonly ContentId[];
  readonly addedOwnedSpellIds: readonly ContentId[];
  readonly replacement?: LevelUpSpellReplacementChoice;
}

export interface LevelUpDraft {
  readonly sourceCharacterId: string;
  readonly sourceUpdatedAt: string;
  readonly target?: LevelUpTarget;
  readonly hitPoints?: LevelUpHitPointChoice;
  readonly subclassId?: ContentId;
  readonly addedClassSkillProficiencies?: readonly SkillId[];
  readonly skillExpertise?: readonly SkillId[];
  readonly weaponMasterySelections?: readonly { readonly classId: ContentId; readonly weaponIds: readonly ContentId[] }[];
  readonly languageChoices?: readonly LanguageId[];
  readonly advancementFeat?: LevelUpAdvancementFeatChoice;
  readonly spellcastingChoices?: readonly LevelUpSpellcastingProviderChoice[];
}

export type LevelUpErrorCode =
  | 'level-cap'
  | 'missing-target'
  | 'invalid-target'
  | 'duplicate-class'
  | 'multiclass-prerequisite'
  | 'source-mismatch'
  | 'invalid-transition'
  | 'invalid-core-choice'
  | 'invalid-advancement-choice'
  | 'invalid-spellcasting-choice'
  | 'incomplete-level-up'
  | 'unresolved-character-rules';

export interface LevelUpError {
  readonly code: LevelUpErrorCode;
  readonly message: string;
  readonly classId?: ContentId;
}

export type LevelUpResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: LevelUpError };

export interface ExistingClassLevelUpOption {
  readonly target: Extract<LevelUpTarget, { readonly kind: 'existing-class' }>;
  readonly className: string;
  readonly currentLevel: number;
  readonly nextLevel: number;
  readonly eligible: boolean;
  readonly reason?: string;
}

export interface NewClassLevelUpOption {
  readonly target: Extract<LevelUpTarget, { readonly kind: 'new-class' }>;
  readonly className: string;
  readonly eligible: boolean;
  readonly reason?: string;
}

export interface LevelUpOptions {
  readonly totalLevel: number;
  readonly atLevelCap: boolean;
  readonly existingClasses: readonly ExistingClassLevelUpOption[];
  readonly newClasses: readonly NewClassLevelUpOption[];
}

export type LevelUpIncompleteChoice =
  | {
      readonly kind: 'hit-points';
      readonly classId: ContentId;
      readonly className: string;
      readonly classLevel: number;
    }
  | {
      readonly kind: 'subclass';
      readonly classId: ContentId;
      readonly className: string;
      readonly classLevel: number;
    }
  | {
      readonly kind: 'added-class-skills';
      readonly classId: ContentId;
      readonly className: string;
      readonly choose: number;
    }
  | {
      readonly kind: 'skill-expertise';
      readonly classId: ContentId;
      readonly className: string;
      readonly choose: number;
    }
  | {
      readonly kind: 'weapon-mastery';
      readonly classId: ContentId;
      readonly className: string;
      readonly choose: number;
    }
  | {
      readonly kind: 'language';
      readonly classId: ContentId;
      readonly className: string;
      readonly choose: number;
    }
  | {
      readonly kind: 'advancement-feat';
      readonly classId: ContentId;
      readonly className: string;
      readonly classLevel: number;
      readonly grantId: ContentId;
      readonly grantName: string;
    }
  | {
      readonly kind: 'spellcasting-provider';
      readonly classId: ContentId;
      readonly className: string;
      readonly classLevel: number;
      readonly providerId: ContentId;
      readonly providerName: string;
      readonly requiredCantrips: number;
      readonly requiredOwnedSpells: number;
    };

export interface LevelUpCandidate {
  readonly input: CharacterInput;
  readonly target: LevelUpTarget;
  readonly incompleteChoices: readonly LevelUpIncompleteChoice[];
}

export interface LevelUpReview {
  readonly totalLevel: { readonly before: number; readonly after: number };
  readonly classAdvancement: {
    readonly classId: ContentId;
    readonly className: string;
    readonly kind: LevelUpTarget['kind'];
    readonly beforeLevel: number;
    readonly afterLevel: number;
  };
  readonly hitPoints: {
    readonly method: 'fixed' | 'rolled';
    readonly fixedValue?: number;
    readonly roll?: number;
    readonly maximumBefore: number;
    readonly maximumAfter: number;
  };
  readonly subclass?: { readonly id: ContentId; readonly name: string };
  readonly addedClassSkills: readonly SkillId[];
  readonly skillExpertise: readonly SkillId[];
  readonly weaponMasteries: readonly {
    readonly classId: ContentId;
    readonly className: string;
    readonly weapons: readonly { readonly id: ContentId; readonly name: string }[];
  }[];
  readonly languages: readonly LanguageId[];
  readonly feat?: {
    readonly id: ContentId;
    readonly name: string;
    readonly path: LevelUpFeatPath;
    readonly abilityChoices: readonly AbilityKey[];
  };
  readonly spellcasting: readonly {
    readonly providerId: ContentId;
    readonly providerName: string;
    readonly ownerLabel: string;
    readonly addedCantrips: readonly { readonly id: ContentId; readonly name: string }[];
    readonly addedOwnedSpells: readonly { readonly id: ContentId; readonly name: string }[];
    readonly replacement?: {
      readonly outgoing: { readonly id: ContentId; readonly name: string };
      readonly incoming: { readonly id: ContentId; readonly name: string };
    };
  }[];
}

export interface LevelUpSubclassChoice {
  readonly id: ContentId;
  readonly name: string;
  readonly description: string;
}

export interface LevelUpCoreChoiceContext {
  readonly target: LevelUpTarget;
  readonly classId: ContentId;
  readonly className: string;
  readonly currentClassLevel: number;
  readonly nextClassLevel: number;
  readonly addedClass: boolean;
  readonly hitDie: ClassContent['hitDie'];
  readonly fixedHitPointsPerLevel: number;
  readonly existingSubclassId?: ContentId;
  readonly subclassRequired: boolean;
  readonly subclasses: readonly LevelUpSubclassChoice[];
  readonly addedClassSkills: {
    readonly choose: number;
    readonly from: readonly SkillId[];
  };
}

export type LevelUpFeatGrantKind = 'general' | 'epic-boon';

export interface LevelUpFeatAbilityChoice {
  readonly choiceId: string;
  readonly selections: 1 | 2;
  readonly allowedAbilities: readonly AbilityKey[];
  readonly maximum: 20 | 30;
  readonly allowDuplicateSelection: boolean;
}

export interface LevelUpFeatOption {
  readonly id: ContentId;
  readonly name: string;
  readonly category: FeatCategory;
  readonly description: string;
  readonly isAbilityScoreImprovement: boolean;
  readonly abilityChoices: readonly LevelUpFeatAbilityChoice[];
}

export interface LevelUpAdvancementChoiceContext {
  readonly classId: ContentId;
  readonly className: string;
  readonly currentClassLevel: number;
  readonly nextClassLevel: number;
  readonly currentAbilityScores: AbilityScores;
  readonly featGrant?: {
    readonly id: ContentId;
    readonly name: string;
    readonly kind: LevelUpFeatGrantKind;
    readonly options: readonly LevelUpFeatOption[];
  };
}

export interface LevelUpSpellOption {
  readonly id: ContentId;
  readonly name: string;
  readonly level: number;
  readonly school: string;
}

export interface LevelUpSpellcastingProviderContext {
  readonly providerId: ContentId;
  readonly providerName: string;
  readonly owner: Exclude<DerivedMechanicalOwner, { readonly kind: 'character' }>;
  readonly previousOwnerLevel?: number;
  readonly nextOwnerLevel: number;
  readonly managementKind: 'prepared-from-list' | 'prepared-from-owned';
  readonly contributionKind: SpellcastingProviderDefinition['multiclassSlotContribution']['kind'];
  readonly maximumSpellLevel: number;
  readonly currentSelection: CharacterSpellcastingSelection;
  readonly requiredCantripAdditions: number;
  readonly requiredOwnedSpellAdditions: number;
  readonly ownedSpellRequiredLevel?: number;
  readonly legalCantrips: readonly LevelUpSpellOption[];
  readonly legalOwnedSpells: readonly LevelUpSpellOption[];
  readonly replacement?: {
    readonly policy: 'class-level-one';
    readonly currentPreparedSpells: readonly LevelUpSpellOption[];
    readonly legalIncomingSpells: readonly LevelUpSpellOption[];
  };
}

export interface LevelUpSpellcastingChoiceContext {
  readonly classId: ContentId;
  readonly className: string;
  readonly currentClassLevel: number;
  readonly nextClassLevel: number;
  readonly providers: readonly LevelUpSpellcastingProviderContext[];
}

const ABILITY_LABELS: Record<AbilityKey, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma',
};

function ok<T>(value: T): LevelUpResult<T> {
  return { ok: true, value };
}

function fail(code: LevelUpErrorCode, message: string, classId?: ContentId): LevelUpResult<never> {
  return { ok: false, error: { code, message, ...(classId ? { classId } : {}) } };
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneInput(character: Character): CharacterInput {
  const { id: _id, playState: _playState, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = character;
  void _id;
  void _playState;
  void _createdAt;
  void _updatedAt;
  return structuredClone(input);
}

function classById(registry: ContentRegistry, classId: ContentId): LevelUpResult<ClassContent> {
  const classContent = registry.findClass(classId);
  return classContent
    ? ok(classContent)
    : fail('invalid-target', `Class could not be resolved: ${classId}.`, classId);
}

function effectiveAbilityScores(input: CharacterInput, registry: ContentRegistry): LevelUpResult<AbilityScores> {
  const background = deriveEffectiveAbilityScores(input, registry);
  if (!background.ok) return fail('unresolved-character-rules', background.error.message);
  const feats = deriveCharacterFeats(input, registry, background.value);
  return feats.ok
    ? ok(feats.value.abilityScores)
    : fail('unresolved-character-rules', feats.error.message);
}

function featGrantKind(feature: { readonly name: string; readonly referenceEffects: readonly { readonly id: string }[] }): LevelUpFeatGrantKind | undefined {
  if (!feature.referenceEffects.some((effect) => effect.id === 'feat-acquisition')) return undefined;
  if (feature.name === 'Ability Score Improvement') return 'general';
  if (feature.name === 'Epic Boon') return 'epic-boon';
  return undefined;
}

function allowedFeatCategories(kind: LevelUpFeatGrantKind): readonly FeatCategory[] {
  return kind === 'epic-boon' ? ['general', 'epic-boon'] : ['general'];
}

function abilityChoiceEffects(feat: FeatContent): LevelUpFeatAbilityChoice[] {
  return feat.effects.flatMap((effect) => effect.type === 'ability-score-increase'
    ? [{
        choiceId: effect.choiceId,
        selections: effect.selections,
        allowedAbilities: effect.allowedAbilities,
        maximum: effect.maximum,
        allowDuplicateSelection: effect.allowDuplicateSelection,
      }]
    : []);
}

function isAbilityScoreImprovementFeat(feat: FeatContent): boolean {
  const effects = abilityChoiceEffects(feat);
  return feat.category === 'general'
    && feat.repeatable
    && effects.length === 1
    && effects[0].selections === 2
    && effects[0].maximum === 20
    && effects[0].allowDuplicateSelection;
}

function possibleAbilityChoiceValues(
  effect: LevelUpFeatAbilityChoice,
  scores: AbilityScores,
): readonly string[][] {
  if (effect.selections === 1) {
    return effect.allowedAbilities
      .filter((ability) => scores[ability] + 1 <= effect.maximum)
      .map((ability) => [ability]);
  }
  const combinations: string[][] = [];
  for (const first of effect.allowedAbilities) {
    for (const second of effect.allowedAbilities) {
      if (!effect.allowDuplicateSelection && first === second) continue;
      const firstIncrease = first === second ? 2 : 1;
      const secondIncrease = first === second ? 0 : 1;
      if (scores[first] + firstIncrease > effect.maximum) continue;
      if (secondIncrease > 0 && scores[second] + secondIncrease > effect.maximum) continue;
      combinations.push([first, second]);
    }
  }
  return combinations;
}

function featHasResolvableStructuredChoices(feat: FeatContent, scores: AbilityScores): boolean {
  if (feat.choices.some((choice) => choice.support !== 'structured')) return false;
  const effects = abilityChoiceEffects(feat);
  const effectChoiceIds = new Set(effects.map((effect) => effect.choiceId));
  if (feat.choices.some((choice) => !effectChoiceIds.has(choice.id))) return false;
  return effects.every((effect) => possibleAbilityChoiceValues(effect, scores).length > 0);
}

function featSelectionComplete(feat: FeatContent, selection: CharacterFeatSelection): boolean {
  return abilityChoiceEffects(feat).every((effect) => selection.choices[effect.choiceId]?.length === effect.selections);
}

function availableFeatOptions(
  input: CharacterInput,
  grantKind: LevelUpFeatGrantKind,
  registry: ContentRegistry,
  scores: AbilityScores,
): LevelUpResult<readonly LevelUpFeatOption[]> {
  const background = deriveEffectiveAbilityScores(input, registry);
  if (!background.ok) return fail('unresolved-character-rules', background.error.message);
  const owned = deriveCharacterFeats(input, registry, background.value);
  if (!owned.ok) return fail('unresolved-character-rules', owned.error.message);
  const ownedIds = new Set(owned.value.feats.map((feat) => feat.id));
  const level = getTotalCharacterLevel(input);
  const allowedCategories = new Set(allowedFeatCategories(grantKind));

  const options: LevelUpFeatOption[] = [];
  for (const feat of registry.getAll('feat')) {
    if (!allowedCategories.has(feat.category)) continue;
    if (!feat.repeatable && ownedIds.has(feat.id)) continue;
    if (feat.prerequisites.some((prerequisite) => prerequisite.type === 'feature')) continue;
    if (!featHasResolvableStructuredChoices(feat, scores)) continue;

    const effects = abilityChoiceEffects(feat);
    let representative: CharacterFeatSelection = { featId: feat.id, choices: {} };
    for (const effect of effects) {
      const [firstValid] = possibleAbilityChoiceValues(effect, scores);
      if (!firstValid) {
        representative = { featId: feat.id, choices: {} };
        break;
      }
      representative = {
        ...representative,
        choices: { ...representative.choices, [effect.choiceId]: [...firstValid] },
      };
    }
    if (validateFeatSelection(feat, representative, level, scores)) continue;

    options.push({
      id: feat.id,
      name: feat.name,
      category: feat.category,
      description: feat.description,
      isAbilityScoreImprovement: isAbilityScoreImprovementFeat(feat),
      abilityChoices: effects,
    });
  }

  return ok(options.sort((left, right) => {
    if (left.isAbilityScoreImprovement !== right.isAbilityScoreImprovement) return left.isAbilityScoreImprovement ? -1 : 1;
    return left.name.localeCompare(right.name);
  }));
}

function primaryAbilityRequirementLabel(classContent: ClassContent): string {
  const separator = classContent.primaryAbility.mode === 'all-of' ? ' and ' : ' or ';
  const abilities = classContent.primaryAbility.abilities.map((ability) => ABILITY_LABELS[ability]).join(separator);
  return `${classContent.name} requires ${abilities} ${MULTICLASS_PRIMARY_ABILITY_MINIMUM} or higher for multiclassing.`;
}

function multiclassEligibility(
  character: Character,
  classContent: ClassContent,
  registry: ContentRegistry,
): LevelUpResult<true> {
  if (character.classProgressions.some((progression) => progression.classId === classContent.id)) {
    return fail('duplicate-class', `${classContent.name} already has a class progression.`, classContent.id);
  }

  const scores = effectiveAbilityScores(character, registry);
  if (!scores.ok) return scores;
  const participatingClassIds = [...character.classProgressions.map((progression) => progression.classId), classContent.id];
  for (const classId of participatingClassIds) {
    const participating = registry.findClass(classId);
    if (!participating) return fail('invalid-target', `Class could not be resolved: ${classId}.`, classId);
    if (!meetsMulticlassPrimaryAbilityRequirement(participating.primaryAbility, scores.value)) {
      return fail('multiclass-prerequisite', primaryAbilityRequirementLabel(participating), participating.id);
    }
  }
  return ok(true);
}

function progressionMap(progressions: readonly CharacterClassProgression[]): Map<ContentId, CharacterClassProgression> {
  return new Map(progressions.map((progression) => [progression.classId, progression]));
}

function hasUniqueClassIds(progressions: readonly CharacterClassProgression[]): boolean {
  return new Set(progressions.map((progression) => progression.classId)).size === progressions.length;
}

function foundationUnchanged(before: Character, after: CharacterInput): boolean {
  return before.name === after.name
    && before.startingClassId === after.startingClassId
    && before.speciesId === after.speciesId
    && before.backgroundId === after.backgroundId
    && before.speciesSize === after.speciesSize
    && deepEqual(before.speciesChoices, after.speciesChoices)
    && deepEqual(before.speciesSkillProficiencies, after.speciesSkillProficiencies)
    && deepEqual(before.backgroundAbilityChoice, after.backgroundAbilityChoice)
    && before.backgroundToolChoice === after.backgroundToolChoice
    && before.backgroundEquipmentChoice === after.backgroundEquipmentChoice
    && deepEqual(before.abilityScores, after.abilityScores)
    && deepEqual(before.inventory, after.inventory)
    && deepEqual(before.currency, after.currency);
}

export function createLevelUpDraft(character: Character): LevelUpDraft {
  return {
    sourceCharacterId: character.id,
    sourceUpdatedAt: character.updatedAt,
  };
}

function sameLevelUpTarget(left: LevelUpTarget | undefined, right: LevelUpTarget): boolean {
  return Boolean(left && left.kind === right.kind && left.classId === right.classId);
}

export function withLevelUpTarget(draft: LevelUpDraft, target: LevelUpTarget): LevelUpDraft {
  if (sameLevelUpTarget(draft.target, target)) return draft;
  return {
    sourceCharacterId: draft.sourceCharacterId,
    sourceUpdatedAt: draft.sourceUpdatedAt,
    target,
  };
}

export function withFixedLevelUpHitPoints(draft: LevelUpDraft): LevelUpDraft {
  return { ...draft, hitPoints: { method: 'fixed' } };
}

export function withRolledLevelUpHitPoints(draft: LevelUpDraft, roll: number): LevelUpDraft {
  return { ...draft, hitPoints: { method: 'rolled', roll } };
}

export function withLevelUpSubclass(draft: LevelUpDraft, subclassId: ContentId): LevelUpDraft {
  return { ...draft, subclassId };
}

export function withLevelUpAddedClassSkills(draft: LevelUpDraft, skills: readonly SkillId[]): LevelUpDraft {
  return { ...draft, addedClassSkillProficiencies: [...skills] };
}

export function withLevelUpSkillExpertise(draft: LevelUpDraft, skills: readonly SkillId[]): LevelUpDraft {
  return { ...draft, skillExpertise: [...skills] };
}

export function withLevelUpWeaponMasteries(
  draft: LevelUpDraft,
  classId: ContentId,
  weaponIds: readonly ContentId[],
): LevelUpDraft {
  return {
    ...draft,
    weaponMasterySelections: [
      ...(draft.weaponMasterySelections ?? []).filter((selection) => selection.classId !== classId),
      { classId, weaponIds: [...weaponIds] },
    ],
  };
}

export function withLevelUpLanguages(draft: LevelUpDraft, languages: readonly LanguageId[]): LevelUpDraft {
  return { ...draft, languageChoices: [...languages] };
}

export function withLevelUpFeatPath(
  draft: LevelUpDraft,
  grantId: ContentId,
  path: LevelUpFeatPath,
  abilityScoreImprovementFeatId?: ContentId,
): LevelUpDraft {
  const samePath = draft.advancementFeat?.grantId === grantId && draft.advancementFeat.path === path;
  if (samePath) return draft;
  return {
    ...draft,
    advancementFeat: {
      grantId,
      path,
      ...(path === 'ability-score-improvement' && abilityScoreImprovementFeatId
        ? { selection: { featId: abilityScoreImprovementFeatId, choices: {} } }
        : {}),
    },
  };
}

export function withLevelUpFeatSelection(
  draft: LevelUpDraft,
  grantId: ContentId,
  featId: ContentId,
): LevelUpDraft {
  return {
    ...draft,
    advancementFeat: {
      grantId,
      path: draft.advancementFeat?.grantId === grantId ? draft.advancementFeat.path : 'feat',
      selection: { featId, choices: {} },
    },
  };
}

export function withLevelUpFeatChoiceValue(
  draft: LevelUpDraft,
  grantId: ContentId,
  choiceId: string,
  choiceIndex: number,
  value: string,
): LevelUpDraft {
  const current = draft.advancementFeat;
  if (!current || current.grantId !== grantId || !current.selection) return draft;
  const values = [...(current.selection.choices[choiceId] ?? [])];
  values[choiceIndex] = value;
  return {
    ...draft,
    advancementFeat: {
      ...current,
      selection: {
        ...current.selection,
        choices: { ...current.selection.choices, [choiceId]: values },
      },
    },
  };
}

function updateLevelUpSpellcastingProviderChoice(
  draft: LevelUpDraft,
  providerId: ContentId,
  update: (choice: LevelUpSpellcastingProviderChoice) => LevelUpSpellcastingProviderChoice,
): LevelUpDraft {
  const current = draft.spellcastingChoices?.find((choice) => choice.providerId === providerId)
    ?? { providerId, addedCantripIds: [], addedOwnedSpellIds: [] };
  const next = update(current);
  return {
    ...draft,
    spellcastingChoices: [
      ...(draft.spellcastingChoices ?? []).filter((choice) => choice.providerId !== providerId),
      next,
    ],
  };
}

export function withLevelUpSpellcastingCantrip(
  draft: LevelUpDraft,
  providerId: ContentId,
  spellId: ContentId,
  selected: boolean,
): LevelUpDraft {
  return updateLevelUpSpellcastingProviderChoice(draft, providerId, (choice) => ({
    ...choice,
    addedCantripIds: selected
      ? [...choice.addedCantripIds.filter((id) => id !== spellId), spellId]
      : choice.addedCantripIds.filter((id) => id !== spellId),
  }));
}

export function withLevelUpSpellcastingOwnedSpell(
  draft: LevelUpDraft,
  providerId: ContentId,
  spellId: ContentId,
  selected: boolean,
): LevelUpDraft {
  return updateLevelUpSpellcastingProviderChoice(draft, providerId, (choice) => ({
    ...choice,
    addedOwnedSpellIds: selected
      ? [...choice.addedOwnedSpellIds.filter((id) => id !== spellId), spellId]
      : choice.addedOwnedSpellIds.filter((id) => id !== spellId),
  }));
}

export function withLevelUpSpellcastingReplacement(
  draft: LevelUpDraft,
  providerId: ContentId,
  replacement: LevelUpSpellReplacementChoice | undefined,
): LevelUpDraft {
  return updateLevelUpSpellcastingProviderChoice(draft, providerId, (choice) => ({
    ...choice,
    ...(replacement ? { replacement } : { replacement: undefined }),
  }));
}

export function getLevelUpCoreChoiceContext(
  character: Character,
  draft: LevelUpDraft,
  registry: ContentRegistry,
): LevelUpResult<LevelUpCoreChoiceContext> {
  if (draft.sourceCharacterId !== character.id || draft.sourceUpdatedAt !== character.updatedAt) {
    return fail('source-mismatch', 'The Level Up draft does not match this Character version.');
  }
  if (!draft.target) return fail('missing-target', 'Choose one class advancement target.');
  if (getTotalCharacterLevel(character) >= MAX_CHARACTER_LEVEL) {
    return fail('level-cap', `Level ${MAX_CHARACTER_LEVEL} is the maximum Character level.`);
  }

  const classContent = classById(registry, draft.target.classId);
  if (!classContent.ok) return classContent;

  let currentClassLevel: number;
  let nextClassLevel: number;
  let existingSubclassId: ContentId | undefined;
  const addedClass = draft.target.kind === 'new-class';

  if (draft.target.kind === 'existing-class') {
    const matches = character.classProgressions.filter((progression) => progression.classId === draft.target!.classId);
    if (matches.length !== 1) {
      return fail('invalid-target', 'Existing-class advancement must resolve exactly one stored class progression.', draft.target.classId);
    }
    currentClassLevel = matches[0].level;
    nextClassLevel = currentClassLevel + 1;
    existingSubclassId = matches[0].subclassId;
  } else {
    const eligibility = multiclassEligibility(character, classContent.value, registry);
    if (!eligibility.ok) return eligibility;
    currentClassLevel = 0;
    nextClassLevel = 1;
  }

  if (existingSubclassId) {
    const existingSubclass = registry.findSubclass(existingSubclassId);
    if (
      !existingSubclass
      || existingSubclass.parentClassId !== classContent.value.id
      || nextClassLevel < existingSubclass.acquisitionLevel
    ) {
      return fail('unresolved-character-rules', 'The existing subclass does not match the target class progression.', classContent.value.id);
    }
  }

  const subclasses = registry.findSubclassesForClass(classContent.value.id)
    .filter((subclass) => nextClassLevel >= subclass.acquisitionLevel)
    .map((subclass) => ({ id: subclass.id, name: subclass.name, description: subclass.description }));
  const skillContext = addedClass
    ? classProgressionSkillChoiceContext(classContent.value, false)
    : { choose: 0, from: [] as readonly SkillId[] };

  return ok({
    target: draft.target,
    classId: classContent.value.id,
    className: classContent.value.name,
    currentClassLevel,
    nextClassLevel,
    addedClass,
    hitDie: classContent.value.hitDie,
    fixedHitPointsPerLevel: classContent.value.fixedHitPointsPerLevel,
    ...(existingSubclassId ? { existingSubclassId } : {}),
    subclassRequired: !existingSubclassId && subclasses.length > 0,
    subclasses,
    addedClassSkills: { choose: skillContext.choose, from: skillContext.from },
  });
}

export function rollLevelUpHitPoints(
  character: Character,
  draft: LevelUpDraft,
  registry: ContentRegistry,
  rng: RandomSource = systemRandom,
): LevelUpResult<number> {
  const context = getLevelUpCoreChoiceContext(character, draft, registry);
  if (!context.ok) return context;
  const result = rollRequest({
    type: 'feature',
    label: `${context.value.className} Level Up Hit Points`,
    expression: { kind: 'dice', dice: [{ quantity: 1, die: context.value.hitDie }], modifier: 0 },
    mode: 'normal',
    source: { characterId: character.id, contentId: context.value.classId },
    outcome: { kind: 'feature' },
  }, rng);
  if (!result.ok) return fail('unresolved-character-rules', result.error.message, context.value.classId);
  const roll = result.value.dice[0]?.values[0];
  return Number.isInteger(roll)
    ? ok(roll)
    : fail('unresolved-character-rules', 'The hit-die roll did not produce a valid result.', context.value.classId);
}

export function listLevelUpOptions(character: Character, registry: ContentRegistry): LevelUpOptions {
  const totalLevel = getTotalCharacterLevel(character);
  const atLevelCap = totalLevel >= MAX_CHARACTER_LEVEL;
  const levelCapReason = `Level ${MAX_CHARACTER_LEVEL} is the maximum Character level.`;

  const existingClasses = character.classProgressions.map((progression) => {
    const classContent = registry.findClass(progression.classId);
    return {
      target: { kind: 'existing-class' as const, classId: progression.classId },
      className: classContent?.name ?? progression.classId,
      currentLevel: progression.level,
      nextLevel: progression.level + 1,
      eligible: !atLevelCap && Boolean(classContent),
      ...(atLevelCap
        ? { reason: levelCapReason }
        : !classContent
          ? { reason: `Class data is unavailable for ${progression.classId}.` }
          : {}),
    };
  });

  const represented = new Set(character.classProgressions.map((progression) => progression.classId));
  const newClasses = registry.getAll('class')
    .filter((classContent) => !represented.has(classContent.id))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((classContent) => {
      if (atLevelCap) {
        return {
          target: { kind: 'new-class' as const, classId: classContent.id },
          className: classContent.name,
          eligible: false,
          reason: levelCapReason,
        };
      }
      const eligibility = multiclassEligibility(character, classContent, registry);
      return {
        target: { kind: 'new-class' as const, classId: classContent.id },
        className: classContent.name,
        eligible: eligibility.ok,
        ...(!eligibility.ok ? { reason: eligibility.error.message } : {}),
      };
    });

  return { totalLevel, atLevelCap, existingClasses, newClasses };
}

export function validateLevelUpTransition(before: Character, after: CharacterInput): LevelUpResult<LevelUpTarget> {
  const beforeTotal = getTotalCharacterLevel(before);
  const afterTotal = getTotalCharacterLevel(after);
  if (beforeTotal >= MAX_CHARACTER_LEVEL || afterTotal > MAX_CHARACTER_LEVEL) {
    return fail('level-cap', `Level ${MAX_CHARACTER_LEVEL} is the maximum Character level.`);
  }
  if (afterTotal !== beforeTotal + 1) {
    return fail('invalid-transition', 'Level Up must increase total Character level by exactly one.');
  }
  if (after.startingClassId !== before.startingClassId) {
    return fail('invalid-transition', 'Level Up cannot change the Starting Class.');
  }
  if (!hasUniqueClassIds(before.classProgressions) || !hasUniqueClassIds(after.classProgressions)) {
    return fail('duplicate-class', 'Class progression class IDs must remain unique.');
  }
  if (!foundationUnchanged(before, after)) {
    return fail('invalid-transition', 'Level Up cannot change unrelated Character foundation fields.');
  }

  const beforeByClass = progressionMap(before.classProgressions);
  const afterByClass = progressionMap(after.classProgressions);
  for (const classId of beforeByClass.keys()) {
    if (!afterByClass.has(classId)) return fail('invalid-transition', 'Level Up cannot remove or replace an existing class progression.', classId);
  }

  const addedClassIds = [...afterByClass.keys()].filter((classId) => !beforeByClass.has(classId));
  if (addedClassIds.length > 1 || after.classProgressions.length > before.classProgressions.length + 1) {
    return fail('invalid-transition', 'Level Up can add at most one new class progression.');
  }

  if (addedClassIds.length === 1) {
    if (after.classProgressions.length !== before.classProgressions.length + 1) {
      return fail('invalid-transition', 'A new-class Level Up must add exactly one class progression.');
    }
    for (const [classId, previous] of beforeByClass) {
      const next = afterByClass.get(classId);
      if (!next || !deepEqual(previous, next)) {
        return fail('invalid-transition', 'Existing class progressions must remain unchanged when adding a new class.', classId);
      }
    }
    const added = afterByClass.get(addedClassIds[0])!;
    if (added.level !== 1) return fail('invalid-transition', 'A newly added class progression must begin at class level 1.', added.classId);
    return ok({ kind: 'new-class', classId: added.classId });
  }

  if (after.classProgressions.length !== before.classProgressions.length) {
    return fail('invalid-transition', 'Existing-class Level Up cannot change the number of class progressions.');
  }

  const advanced: ContentId[] = [];
  for (const [classId, previous] of beforeByClass) {
    const next = afterByClass.get(classId);
    if (!next) return fail('invalid-transition', 'Level Up cannot remove an existing class progression.', classId);
    if (next.level === previous.level + 1) {
      advanced.push(classId);
      continue;
    }
    if (next.level !== previous.level || !deepEqual(previous, next)) {
      return fail('invalid-transition', 'Only one existing class progression may change during Level Up.', classId);
    }
  }
  if (advanced.length !== 1) {
    return fail('invalid-transition', 'Exactly one existing class progression must increase by one level.');
  }
  return ok({ kind: 'existing-class', classId: advanced[0] });
}

function updateTargetProgression(
  input: CharacterInput,
  classId: ContentId,
  update: (progression: CharacterClassProgression) => CharacterClassProgression,
): LevelUpResult<CharacterClassProgression> {
  const matches = input.classProgressions.filter((progression) => progression.classId === classId);
  if (matches.length !== 1) {
    return fail('invalid-target', 'Level Up core choices must resolve exactly one target class progression.', classId);
  }
  let updated = matches[0];
  input.classProgressions = input.classProgressions.map((progression) => {
    if (progression.classId !== classId) return progression;
    updated = update(progression);
    return updated;
  });
  return ok(updated);
}

function buildCoreLevelUpCandidate(
  character: Character,
  draft: LevelUpDraft,
  registry: ContentRegistry,
): LevelUpResult<LevelUpCandidate> {
  const context = getLevelUpCoreChoiceContext(character, draft, registry);
  if (!context.ok) return context;

  const input = cloneInput(character);
  const incompleteChoices: LevelUpIncompleteChoice[] = [];

  if (context.value.addedClass) {
    input.classProgressions = [
      ...input.classProgressions,
      {
        classId: context.value.classId,
        level: 1,
        skillProficiencies: [],
        skillExpertise: [],
        weaponMasterySelections: [],
        hpProgression: [],
      },
    ];
  } else {
    const advanced = updateTargetProgression(input, context.value.classId, (progression) => ({
      ...progression,
      level: context.value.nextClassLevel,
    }));
    if (!advanced.ok) return advanced;
  }

  if (!draft.hitPoints) {
    incompleteChoices.push({
      kind: 'hit-points',
      classId: context.value.classId,
      className: context.value.className,
      classLevel: context.value.nextClassLevel,
    });
  } else {
    const hpEntry = draft.hitPoints.method === 'fixed'
      ? { classLevel: context.value.nextClassLevel, method: 'fixed' as const }
      : { classLevel: context.value.nextClassLevel, method: 'rolled' as const, roll: draft.hitPoints.roll };
    const hpProgression = updateTargetProgression(input, context.value.classId, (progression) => ({
      ...progression,
      hpProgression: [...progression.hpProgression, hpEntry],
    }));
    if (!hpProgression.ok) return hpProgression;
    const hpError = validateHpProgression(
      hpProgression.value.hpProgression,
      context.value.nextClassLevel,
      context.value.hitDie,
      context.value.classId === input.startingClassId,
    );
    if (hpError) return fail('invalid-core-choice', hpError, context.value.classId);
  }

  if (context.value.existingSubclassId) {
    if (draft.subclassId && draft.subclassId !== context.value.existingSubclassId) {
      return fail('invalid-core-choice', 'Level Up cannot replace an already selected subclass.', context.value.classId);
    }
  } else if (context.value.subclassRequired) {
    if (!draft.subclassId) {
      incompleteChoices.push({
        kind: 'subclass',
        classId: context.value.classId,
        className: context.value.className,
        classLevel: context.value.nextClassLevel,
      });
    } else {
      const subclass = context.value.subclasses.find((candidate) => candidate.id === draft.subclassId);
      if (!subclass) {
        return fail('invalid-core-choice', 'Choose an eligible subclass owned by the target class.', context.value.classId);
      }
      const subclassProgression = updateTargetProgression(input, context.value.classId, (progression) => ({
        ...progression,
        subclassId: subclass.id,
      }));
      if (!subclassProgression.ok) return subclassProgression;
    }
  } else if (draft.subclassId) {
    return fail('invalid-core-choice', 'This class level does not require a new subclass selection.', context.value.classId);
  }

  const selectedSkills = draft.addedClassSkillProficiencies ?? [];
  if (!context.value.addedClass) {
    if (selectedSkills.length > 0) {
      return fail('invalid-core-choice', 'Added-class skill choices only apply when beginning a new multiclass progression.', context.value.classId);
    }
  } else {
    const allowed = new Set(context.value.addedClassSkills.from);
    if (new Set(selectedSkills).size !== selectedSkills.length) {
      return fail('invalid-core-choice', 'Added-class skill selections must be unique.', context.value.classId);
    }
    if (selectedSkills.some((skill) => !allowed.has(skill))) {
      return fail('invalid-core-choice', `Choose skills permitted by the ${context.value.className} multiclass proficiency package.`, context.value.classId);
    }
    if (selectedSkills.length > context.value.addedClassSkills.choose) {
      return fail('invalid-core-choice', `Choose exactly ${context.value.addedClassSkills.choose} ${context.value.className} multiclass skill${context.value.addedClassSkills.choose === 1 ? '' : 's'}.`, context.value.classId);
    }

    const skillsProgression = updateTargetProgression(input, context.value.classId, (progression) => ({
      ...progression,
      skillProficiencies: [...selectedSkills],
    }));
    if (!skillsProgression.ok) return skillsProgression;

    if (context.value.addedClassSkills.choose > 0 && selectedSkills.length !== context.value.addedClassSkills.choose) {
      incompleteChoices.push({
        kind: 'added-class-skills',
        classId: context.value.classId,
        className: context.value.className,
        choose: context.value.addedClassSkills.choose,
      });
    } else {
      const skillError = validateClassProgressionSkillProficiencies(
        skillsProgression.value,
        registry.findClass(context.value.classId)!,
        input.startingClassId,
      );
      if (skillError) return fail('invalid-core-choice', skillError, context.value.classId);
    }
  }

  const transition = validateLevelUpTransition(character, input);
  if (!transition.ok) return transition;
  if (transition.value.kind !== context.value.target.kind || transition.value.classId !== context.value.target.classId) {
    return fail('invalid-transition', 'Constructed Level Up candidate does not match the selected advancement target.');
  }
  return ok({ input, target: context.value.target, incompleteChoices });
}

function advancementFeatGrant(
  coreCandidate: LevelUpCandidate,
  coreContext: LevelUpCoreChoiceContext,
  registry: ContentRegistry,
): LevelUpResult<{ id: ContentId; name: string; kind: LevelUpFeatGrantKind } | undefined> {
  const classContent = registry.findClass(coreContext.classId);
  if (!classContent) return fail('invalid-target', `Class could not be resolved: ${coreContext.classId}.`, coreContext.classId);
  const classRow = classContent.progression.find((row) => row.level === coreContext.nextClassLevel);
  if (!classRow) {
    return fail('unresolved-character-rules', `${classContent.name} has no progression row for class level ${coreContext.nextClassLevel}.`, classContent.id);
  }

  const marked = classRow.features
    .filter((feature) => feature.referenceEffects.some((effect) => effect.id === 'feat-acquisition'))
    .map((feature) => ({ id: feature.id, name: feature.name, kind: featGrantKind(feature) }));

  const progression = coreCandidate.input.classProgressions.find((entry) => entry.classId === coreContext.classId);
  if (!progression) return fail('invalid-target', 'The advanced class progression could not be resolved.', coreContext.classId);
  if (progression.subclassId) {
    const subclass = registry.findSubclass(progression.subclassId);
    if (!subclass || subclass.parentClassId !== coreContext.classId) {
      return fail('unresolved-character-rules', 'The advanced subclass could not be resolved for feat acquisition.', coreContext.classId);
    }
    const subclassRow = subclass.progression.find((row) => row.level === coreContext.nextClassLevel);
    if (subclassRow) {
      marked.push(...subclassRow.features
        .filter((feature) => feature.referenceEffects.some((effect) => effect.id === 'feat-acquisition'))
        .map((feature) => ({ id: feature.id, name: feature.name, kind: featGrantKind(feature) })));
    }
  }

  if (marked.length === 0) return ok(undefined);
  if (marked.length > 1) {
    return fail('unresolved-character-rules', 'This gained owner level contains multiple feat-acquisition features that M15-D cannot safely merge.', coreContext.classId);
  }
  const [grant] = marked;
  if (!grant.kind) {
    return fail('unresolved-character-rules', `${grant.name} marks feat acquisition but does not expose a supported M15-D grant kind.`, coreContext.classId);
  }
  return ok({ id: grant.id, name: grant.name, kind: grant.kind });
}

export function getLevelUpAdvancementChoiceContext(
  character: Character,
  draft: LevelUpDraft,
  registry: ContentRegistry,
): LevelUpResult<LevelUpAdvancementChoiceContext> {
  const coreContext = getLevelUpCoreChoiceContext(character, draft, registry);
  if (!coreContext.ok) return coreContext;
  const coreCandidate = buildCoreLevelUpCandidate(character, draft, registry);
  if (!coreCandidate.ok) return coreCandidate;

  const scores = effectiveAbilityScores(coreCandidate.value.input, registry);
  if (!scores.ok) return scores;
  const grant = advancementFeatGrant(coreCandidate.value, coreContext.value, registry);
  if (!grant.ok) return grant;

  if (!grant.value) {
    return ok({
      classId: coreContext.value.classId,
      className: coreContext.value.className,
      currentClassLevel: coreContext.value.currentClassLevel,
      nextClassLevel: coreContext.value.nextClassLevel,
      currentAbilityScores: scores.value,
    });
  }

  const options = availableFeatOptions(coreCandidate.value.input, grant.value.kind, registry, scores.value);
  if (!options.ok) return options;
  return ok({
    classId: coreContext.value.classId,
    className: coreContext.value.className,
    currentClassLevel: coreContext.value.currentClassLevel,
    nextClassLevel: coreContext.value.nextClassLevel,
    currentAbilityScores: scores.value,
    featGrant: {
      id: grant.value.id,
      name: grant.value.name,
      kind: grant.value.kind,
      options: options.value,
    },
  });
}

export function deriveLevelUpCandidateAbilityScores(
  input: CharacterInput,
  registry: ContentRegistry,
): LevelUpResult<AbilityScores> {
  return effectiveAbilityScores(input, registry);
}

function buildAdvancementLevelUpCandidate(
  character: Character,
  draft: LevelUpDraft,
  registry: ContentRegistry,
): LevelUpResult<LevelUpCandidate> {
  const core = buildCoreLevelUpCandidate(character, draft, registry);
  if (!core.ok) return core;
  const advancement = getLevelUpAdvancementChoiceContext(character, draft, registry);
  if (!advancement.ok) return advancement;

  const incompleteChoices = [...core.value.incompleteChoices];
  const grant = advancement.value.featGrant;
  if (!grant) {
    if (draft.advancementFeat) {
      return fail('invalid-advancement-choice', 'This gained owner level does not grant a feat-acquisition choice.', advancement.value.classId);
    }
    return ok({ ...core.value, incompleteChoices });
  }

  const choice = draft.advancementFeat;
  const incomplete = () => incompleteChoices.push({
    kind: 'advancement-feat' as const,
    classId: advancement.value.classId,
    className: advancement.value.className,
    classLevel: advancement.value.nextClassLevel,
    grantId: grant.id,
    grantName: grant.name,
  });

  if (!choice || choice.grantId !== grant.id || !choice.selection) {
    incomplete();
    return ok({ ...core.value, incompleteChoices });
  }

  const option = grant.options.find((candidate) => candidate.id === choice.selection!.featId);
  if (!option) {
    return fail('invalid-advancement-choice', 'Choose a feat that is mechanically eligible for this advancement opportunity.', advancement.value.classId);
  }
  if (choice.path === 'ability-score-improvement' && !option.isAbilityScoreImprovement) {
    return fail('invalid-advancement-choice', 'The Ability Score Improvement path must use the supported Ability Score Improvement feat.', advancement.value.classId);
  }
  if (choice.path === 'feat' && option.isAbilityScoreImprovement) {
    return fail('invalid-advancement-choice', 'Choose Ability Score Improvement through its dedicated advancement path.', advancement.value.classId);
  }

  const feat = registry.findFeat(option.id);
  if (!feat) return fail('unresolved-character-rules', `Feat could not be resolved: ${option.id}.`, advancement.value.classId);
  if (!featSelectionComplete(feat, choice.selection)) {
    incomplete();
    return ok({ ...core.value, incompleteChoices });
  }

  const invalid = validateFeatSelection(
    feat,
    choice.selection,
    getTotalCharacterLevel(core.value.input),
    advancement.value.currentAbilityScores,
  );
  if (invalid) return fail('invalid-advancement-choice', invalid, advancement.value.classId);

  const input: CharacterInput = {
    ...core.value.input,
    manualFeats: [
      ...core.value.input.manualFeats.map((selection) => ({
        featId: selection.featId,
        choices: Object.fromEntries(Object.entries(selection.choices).map(([choiceId, values]) => [choiceId, [...values]])),
      })),
      {
        featId: choice.selection.featId,
        choices: Object.fromEntries(Object.entries(choice.selection.choices).map(([choiceId, values]) => [choiceId, [...values]])),
      },
    ],
  };

  const background = deriveEffectiveAbilityScores(input, registry);
  if (!background.ok) return fail('unresolved-character-rules', background.error.message, advancement.value.classId);
  const feats = deriveCharacterFeats(input, registry, background.value);
  if (!feats.ok) return fail('invalid-advancement-choice', feats.error.message, advancement.value.classId);

  return ok({ input, target: core.value.target, incompleteChoices });
}

function cloneSpellcastingSelection(selection: CharacterSpellcastingSelection): CharacterSpellcastingSelection {
  return {
    providerId: selection.providerId,
    cantripIds: [...selection.cantripIds],
    ownedSpellIds: [...selection.ownedSpellIds],
    preparedSpellIds: [...selection.preparedSpellIds],
  };
}

function ephemeralCharacter(source: Character, input: CharacterInput): Character {
  return {
    ...structuredClone(input),
    id: source.id,
    playState: structuredClone(source.playState),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

function providerDefinitionForDerived(
  provider: DerivedSpellcastingProvider,
  registry: ContentRegistry,
): LevelUpResult<SpellcastingProviderDefinition> {
  const owner = provider.owner;
  if (!owner || owner.kind === 'character') {
    return fail('unresolved-character-rules', `${provider.name} does not expose a class/subclass mechanical owner.`);
  }
  const classContent = registry.findClass(owner.classId);
  if (!classContent) return fail('unresolved-character-rules', `Spellcasting owner class could not be resolved: ${owner.classId}.`, owner.classId);
  const subclass = owner.kind === 'subclass' ? registry.findSubclass(owner.subclassId) : undefined;
  if (owner.kind === 'subclass' && (!subclass || subclass.parentClassId !== owner.classId)) {
    return fail('unresolved-character-rules', `Spellcasting owner subclass could not be resolved: ${owner.subclassId}.`, owner.classId);
  }
  const matches = spellcastingProviderDefinitionsAtLevel(classContent, subclass, owner.level)
    .filter((definition) => definition.id === provider.id);
  if (matches.length !== 1) {
    return fail('unresolved-character-rules', `Spellcasting provider definition could not be resolved exactly once for ${provider.name}.`, owner.classId);
  }
  return ok(matches[0]);
}

function spellOption(spell: SpellContent): LevelUpSpellOption {
  return { id: spell.id, name: spell.name, level: spell.level, school: spell.school };
}

function reconcileSelectionAgainstGrants(
  selection: CharacterSpellcastingSelection,
  provider: DerivedSpellcastingProvider,
): CharacterSpellcastingSelection {
  const granted = new Set(provider.spellGrants.map((grant) => grant.spell.id));
  return {
    providerId: selection.providerId,
    cantripIds: selection.cantripIds.filter((id) => !granted.has(id)),
    ownedSpellIds: selection.ownedSpellIds.filter((id) => !granted.has(id)),
    preparedSpellIds: selection.preparedSpellIds.filter((id) => !granted.has(id)),
  };
}

function spellcastingOwner(
  provider: DerivedSpellcastingProvider,
): Exclude<DerivedMechanicalOwner, { readonly kind: 'character' }> | undefined {
  return provider.owner && provider.owner.kind !== 'character' ? provider.owner : undefined;
}

function relevantSpellcastingContext(
  provider: DerivedSpellcastingProvider,
  beforeProvider: DerivedSpellcastingProvider | undefined,
  input: CharacterInput,
  definition: SpellcastingProviderDefinition,
  registry: ContentRegistry,
): LevelUpResult<LevelUpSpellcastingProviderContext | undefined> {
  const owner = spellcastingOwner(provider);
  if (!owner) return fail('unresolved-character-rules', `${provider.name} does not expose provider ownership.`);
  if (definition.spellManagement.kind === 'granted-only') return ok(undefined);

  const stored = input.spellcastingSelections.find((selection) => selection.providerId === provider.id);
  const currentSelection = reconcileSelectionAgainstGrants(
    stored ? cloneSpellcastingSelection(stored) : { providerId: provider.id, cantripIds: [], ownedSpellIds: [], preparedSpellIds: [] },
    provider,
  );
  const grantedIds = new Set(provider.spellGrants.map((grant) => grant.spell.id));
  const management = definition.spellManagement;
  const maximumSpellLevel = maximumSelectableSpellLevel(definition, owner.level);
  const cantripTarget = provider.management.kind === 'granted-only' ? 0 : provider.management.cantripCount;
  const currentCantripCount = currentSelection.cantripIds.length;

  if (stored && currentCantripCount > cantripTarget) {
    return fail(
      'unresolved-character-rules',
      `${provider.name} cantrip capacity decreases from the stored selection during this level transition; M15-E will not guess removals.`,
      owner.classId,
    );
  }

  const requiredCantripAdditions = stored || management.kind === 'prepared-from-owned'
    ? Math.max(0, cantripTarget - currentCantripCount)
    : 0;

  let requiredOwnedSpellAdditions = 0;
  let ownedSpellRequiredLevel: number | undefined;
  if (management.kind === 'prepared-from-owned') {
    ownedSpellRequiredLevel = management.initialOwnedSpellLevel;
    if (!stored) {
      requiredOwnedSpellAdditions = management.initialOwnedSpellCount;
    } else {
      const resolved = currentSelection.ownedSpellIds.map((id) => registry.findSpell(id));
      if (currentSelection.ownedSpellIds.length < management.initialOwnedSpellCount) {
        requiredOwnedSpellAdditions = management.initialOwnedSpellCount - currentSelection.ownedSpellIds.length;
      } else if (resolved.every(Boolean)) {
        const initialLevelCount = resolved.filter((spell) => spell?.level === management.initialOwnedSpellLevel).length;
        requiredOwnedSpellAdditions = Math.max(0, management.initialOwnedSpellCount - initialLevelCount);
      }
    }
  }

  const catalog = registry.getAll('spell').filter((spell) => (
    spellBelongsToProviderList(spell, management.spellListId)
    && !grantedIds.has(spell.id)
  ));
  const selectedCantrips = new Set(currentSelection.cantripIds);
  const legalCantrips = catalog
    .filter((spell) => spell.level === 0 && !selectedCantrips.has(spell.id))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(spellOption);

  const selectedOwned = new Set(currentSelection.ownedSpellIds);
  const legalOwnedSpells = management.kind === 'prepared-from-owned'
    ? catalog
        .filter((spell) => (
          spell.level === management.initialOwnedSpellLevel
          && spell.level <= maximumSpellLevel
          && !selectedOwned.has(spell.id)
        ))
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(spellOption)
    : [];

  let replacement: LevelUpSpellcastingProviderContext['replacement'];
  if (
    beforeProvider
    && management.replacement === 'class-level-one'
    && currentSelection.preparedSpellIds.length > 0
  ) {
    const currentPreparedSpells = currentSelection.preparedSpellIds
      .flatMap((id) => {
        const spell = registry.findSpell(id);
        return spell ? [spellOption(spell)] : [];
      });
    const legalIncomingSpells = (management.kind === 'prepared-from-owned'
      ? currentSelection.ownedSpellIds.flatMap((id) => {
          const spell = registry.findSpell(id);
          return spell ? [spell] : [];
        })
      : catalog.filter((spell) => spell.level > 0 && spell.level <= maximumSpellLevel))
      .filter((spell, index, list) => (
        spell.level > 0
        && spell.level <= maximumSpellLevel
        && spellBelongsToProviderList(spell, management.spellListId)
        && !grantedIds.has(spell.id)
        && list.findIndex((candidate) => candidate.id === spell.id) === index
      ))
      .sort((left, right) => left.level - right.level || left.name.localeCompare(right.name))
      .map(spellOption);
    if (currentPreparedSpells.length > 0 && legalIncomingSpells.length > 0) {
      replacement = { policy: 'class-level-one', currentPreparedSpells, legalIncomingSpells };
    }
  }

  if (requiredCantripAdditions === 0 && requiredOwnedSpellAdditions === 0 && !replacement) return ok(undefined);

  const previousOwner = beforeProvider ? spellcastingOwner(beforeProvider) : undefined;
  return ok({
    providerId: provider.id,
    providerName: provider.name,
    owner,
    ...(previousOwner ? { previousOwnerLevel: previousOwner.level } : {}),
    nextOwnerLevel: owner.level,
    managementKind: management.kind,
    contributionKind: definition.multiclassSlotContribution.kind,
    maximumSpellLevel,
    currentSelection,
    requiredCantripAdditions,
    requiredOwnedSpellAdditions,
    ...(ownedSpellRequiredLevel !== undefined ? { ownedSpellRequiredLevel } : {}),
    legalCantrips,
    legalOwnedSpells,
    ...(replacement ? { replacement } : {}),
  });
}

export function getLevelUpSpellcastingChoiceContext(
  character: Character,
  draft: LevelUpDraft,
  registry: ContentRegistry,
): LevelUpResult<LevelUpSpellcastingChoiceContext> {
  const coreContext = getLevelUpCoreChoiceContext(character, draft, registry);
  if (!coreContext.ok) return coreContext;
  const candidate = buildAdvancementLevelUpCandidate(character, draft, registry);
  if (!candidate.ok) return candidate;

  const coreIncomplete = candidate.value.incompleteChoices.some((choice) => (
    choice.kind === 'hit-points' || choice.kind === 'subclass' || choice.kind === 'added-class-skills'
  ));
  if (coreIncomplete) {
    return ok({
      classId: coreContext.value.classId,
      className: coreContext.value.className,
      currentClassLevel: coreContext.value.currentClassLevel,
      nextClassLevel: coreContext.value.nextClassLevel,
      providers: [],
    });
  }

  const beforeState = deriveCharacterState(character, registry);
  if (!beforeState.ok) return fail('unresolved-character-rules', beforeState.error.message, coreContext.value.classId);
  const afterCharacter = ephemeralCharacter(character, candidate.value.input);
  const afterState = deriveCharacterState(afterCharacter, registry);
  if (!afterState.ok) return fail('unresolved-character-rules', afterState.error.message, coreContext.value.classId);
  const beforeById = new Map(beforeState.value.spellcasting.map((provider) => [provider.id, provider] as const));

  const providers: LevelUpSpellcastingProviderContext[] = [];
  for (const provider of afterState.value.spellcasting) {
    const owner = spellcastingOwner(provider);
    if (!owner || owner.classId !== coreContext.value.classId || owner.level !== coreContext.value.nextClassLevel) continue;
    const definition = providerDefinitionForDerived(provider, registry);
    if (!definition.ok) return definition;
    const context = relevantSpellcastingContext(
      provider,
      beforeById.get(provider.id),
      candidate.value.input,
      definition.value,
      registry,
    );
    if (!context.ok) return context;
    if (context.value) providers.push(context.value);
  }

  return ok({
    classId: coreContext.value.classId,
    className: coreContext.value.className,
    currentClassLevel: coreContext.value.currentClassLevel,
    nextClassLevel: coreContext.value.nextClassLevel,
    providers: providers.sort((left, right) => left.providerName.localeCompare(right.providerName)),
  });
}

function replaceSpellcastingSelection(
  input: CharacterInput,
  selection: CharacterSpellcastingSelection,
): void {
  input.spellcastingSelections = [
    ...input.spellcastingSelections.filter((candidate) => candidate.providerId !== selection.providerId),
    selection,
  ];
}

function reconcileCandidateSpellcastingGrants(
  input: CharacterInput,
  source: Character,
  registry: ContentRegistry,
): LevelUpResult<CharacterInput> {
  const state = deriveCharacterState(ephemeralCharacter(source, input), registry);
  if (!state.ok) return fail('unresolved-character-rules', state.error.message);
  const providers = new Map(state.value.spellcasting.map((provider) => [provider.id, provider] as const));
  return ok({
    ...input,
    spellcastingSelections: input.spellcastingSelections.map((selection) => {
      const provider = providers.get(selection.providerId);
      return provider ? reconcileSelectionAgainstGrants(selection, provider) : cloneSpellcastingSelection(selection);
    }),
  });
}

export function buildLevelUpCandidate(
  character: Character,
  draft: LevelUpDraft,
  registry: ContentRegistry,
): LevelUpResult<LevelUpCandidate> {
  const advancement = buildAdvancementLevelUpCandidate(character, draft, registry);
  if (!advancement.ok) return advancement;

  const coreIncomplete = advancement.value.incompleteChoices.some((choice) => (
    choice.kind === 'hit-points' || choice.kind === 'subclass' || choice.kind === 'added-class-skills'
  ));
  if (coreIncomplete) return advancement;

  const spellcasting = getLevelUpSpellcastingChoiceContext(character, draft, registry);
  if (!spellcasting.ok) return spellcasting;
  const reconciled = reconcileCandidateSpellcastingGrants(
    structuredClone(advancement.value.input),
    character,
    registry,
  );
  if (!reconciled.ok) return reconciled;
  const input = reconciled.value;
  const incompleteChoices = [...advancement.value.incompleteChoices];

  const contextsById = new Map(spellcasting.value.providers.map((provider) => [provider.providerId, provider] as const));
  const draftChoices = draft.spellcastingChoices ?? [];
  if (new Set(draftChoices.map((choice) => choice.providerId)).size !== draftChoices.length) {
    return fail('invalid-spellcasting-choice', 'Level Up spellcasting choices require unique provider IDs.', spellcasting.value.classId);
  }
  const staleChoice = draftChoices.find((choice) => !contextsById.has(choice.providerId));
  if (staleChoice) {
    return fail('invalid-spellcasting-choice', `This Level Up transition does not expose spellcasting choices for provider: ${staleChoice.providerId}.`, spellcasting.value.classId);
  }

  for (const context of spellcasting.value.providers) {
    const choice = draftChoices.find((candidate) => candidate.providerId === context.providerId)
      ?? { providerId: context.providerId, addedCantripIds: [], addedOwnedSpellIds: [] };
    if (
      new Set(choice.addedCantripIds).size !== choice.addedCantripIds.length
      || new Set(choice.addedOwnedSpellIds).size !== choice.addedOwnedSpellIds.length
    ) {
      return fail('invalid-spellcasting-choice', `${context.providerName} Level Up selections cannot contain duplicate spell IDs.`, context.owner.classId);
    }
    if (choice.addedCantripIds.length > context.requiredCantripAdditions) {
      return fail('invalid-spellcasting-choice', `Choose exactly ${context.requiredCantripAdditions} new cantrip${context.requiredCantripAdditions === 1 ? '' : 's'} for ${context.providerName}.`, context.owner.classId);
    }
    if (choice.addedOwnedSpellIds.length > context.requiredOwnedSpellAdditions) {
      return fail('invalid-spellcasting-choice', `Choose exactly ${context.requiredOwnedSpellAdditions} required owned spell${context.requiredOwnedSpellAdditions === 1 ? '' : 's'} for ${context.providerName}.`, context.owner.classId);
    }

    const legalCantripIds = new Set(context.legalCantrips.map((spell) => spell.id));
    if (choice.addedCantripIds.some((id) => !legalCantripIds.has(id))) {
      return fail('invalid-spellcasting-choice', `Choose cantrips from the provider-local legal list for ${context.providerName}.`, context.owner.classId);
    }
    const legalOwnedIds = new Set(context.legalOwnedSpells.map((spell) => spell.id));
    if (choice.addedOwnedSpellIds.some((id) => !legalOwnedIds.has(id))) {
      return fail('invalid-spellcasting-choice', `Choose required owned spells from the provider-local legal list for ${context.providerName}.`, context.owner.classId);
    }

    const selection: CharacterSpellcastingSelection = {
      providerId: context.providerId,
      cantripIds: [...context.currentSelection.cantripIds, ...choice.addedCantripIds],
      ownedSpellIds: [...context.currentSelection.ownedSpellIds, ...choice.addedOwnedSpellIds],
      preparedSpellIds: [...context.currentSelection.preparedSpellIds],
    };

    const replacement = choice.replacement;
    if (replacement?.outgoingSpellId && replacement.incomingSpellId) {
      if (!context.replacement) {
        return fail('invalid-spellcasting-choice', `${context.providerName} does not expose a class-level spell replacement for this transition.`, context.owner.classId);
      }
      const outgoing = replacement.outgoingSpellId;
      const incoming = replacement.incomingSpellId;
      if (!selection.preparedSpellIds.includes(outgoing)) {
        return fail('invalid-spellcasting-choice', `The outgoing ${context.providerName} spell is not currently prepared by that provider.`, context.owner.classId);
      }
      if (!context.replacement.legalIncomingSpells.some((spell) => spell.id === incoming)) {
        return fail('invalid-spellcasting-choice', `The incoming spell is not legal for ${context.providerName} at owner level ${context.nextOwnerLevel}.`, context.owner.classId);
      }
      if (incoming === outgoing || selection.preparedSpellIds.some((id) => id === incoming && id !== outgoing)) {
        return fail('invalid-spellcasting-choice', `The replacement spell must be a different, non-duplicate ${context.providerName} selection.`, context.owner.classId);
      }
      selection.preparedSpellIds = selection.preparedSpellIds.map((id) => id === outgoing ? incoming : id);
    }

    const mandatoryComplete = (
      choice.addedCantripIds.length === context.requiredCantripAdditions
      && choice.addedOwnedSpellIds.length === context.requiredOwnedSpellAdditions
    );
    if (!mandatoryComplete) {
      incompleteChoices.push({
        kind: 'spellcasting-provider',
        classId: context.owner.classId,
        className: context.owner.className,
        classLevel: context.nextOwnerLevel,
        providerId: context.providerId,
        providerName: context.providerName,
        requiredCantrips: context.requiredCantripAdditions,
        requiredOwnedSpells: context.requiredOwnedSpellAdditions,
      });
    }

    if (
      context.managementKind === 'prepared-from-owned'
      || character.spellcastingSelections.some((stored) => stored.providerId === context.providerId)
      || choice.addedCantripIds.length > 0
      || choice.addedOwnedSpellIds.length > 0
      || (replacement?.outgoingSpellId && replacement.incomingSpellId)
    ) {
      replaceSpellcastingSelection(input, selection);
    }
  }

  const targetProgression = input.classProgressions.find((progression) => progression.classId === advancement.value.target.classId);
  if (!targetProgression) return fail('invalid-target', 'The advanced class progression could not be resolved.', advancement.value.target.classId);
  const expertiseBefore = deriveSkillExpertiseChoices(input, registry);
  if (!expertiseBefore.ok) return fail('unresolved-character-rules', expertiseBefore.error.message, advancement.value.target.classId);
  const expertiseState = expertiseBefore.value.find((choice) => choice.classId === advancement.value.target.classId);
  const selectedExpertise = draft.skillExpertise ?? targetProgression.skillExpertise;
  if (!expertiseState && selectedExpertise.length > 0) {
    return fail('invalid-core-choice', 'This Level Up transition grants no Expertise selections.', advancement.value.target.classId);
  }
  targetProgression.skillExpertise = [...selectedExpertise];
  const expertiseError = validateSkillExpertiseSelections(input, { allowUnderfilled: true }, registry);
  if (expertiseError) return fail('invalid-core-choice', expertiseError, advancement.value.target.classId);
  if (expertiseState && selectedExpertise.length !== expertiseState.entitled) {
    incompleteChoices.push({
      kind: 'skill-expertise',
      classId: advancement.value.target.classId,
      className: registry.findClass(advancement.value.target.classId)?.name ?? advancement.value.target.classId,
      choose: expertiseState.entitled,
    });
  }

  const masteryBefore = deriveWeaponMasteryChoices(input, registry);
  if (!masteryBefore.ok) return fail('unresolved-character-rules', masteryBefore.error.message, advancement.value.target.classId);
  const masteryClassIds = new Set(masteryBefore.value.map((choice) => choice.classId));
  const staleMasteryDraft = (draft.weaponMasterySelections ?? []).find((selection) => !masteryClassIds.has(selection.classId));
  if (staleMasteryDraft) return fail('invalid-core-choice', 'This Level Up transition exposes no Weapon Mastery choices for the selected class.', staleMasteryDraft.classId);
  for (const state of masteryBefore.value) {
    const progression = input.classProgressions.find((entry) => entry.classId === state.classId)!;
    const selected = draft.weaponMasterySelections?.find((selection) => selection.classId === state.classId)?.weaponIds
      ?? progression.weaponMasterySelections;
    progression.weaponMasterySelections = [...selected];
    if (selected.length !== state.entitled) {
      incompleteChoices.push({
        kind: 'weapon-mastery',
        classId: state.classId,
        className: registry.findClass(state.classId)?.name ?? state.classId,
        choose: state.entitled,
      });
    }
  }
  const masteryError = validateWeaponMasterySelections(input, { allowUnderfilled: true }, registry);
  if (masteryError) return fail('invalid-core-choice', masteryError, advancement.value.target.classId);

  const languageBefore = deriveLanguageChoices(input, registry);
  if (!languageBefore.ok) return fail('unresolved-character-rules', languageBefore.error.message, advancement.value.target.classId);
  input.languageChoices = [...(draft.languageChoices ?? input.languageChoices)];
  const languageError = validateLanguageChoices(input, { allowUnderfilled: true }, registry);
  if (languageError) return fail('invalid-core-choice', languageError, advancement.value.target.classId);
  if (input.languageChoices.length !== languageBefore.value.entitled) {
    incompleteChoices.push({
      kind: 'language',
      classId: advancement.value.target.classId,
      className: registry.findClass(advancement.value.target.classId)?.name ?? advancement.value.target.classId,
      choose: languageBefore.value.entitled,
    });
  }

  if (!incompleteChoices.some((choice) => choice.kind === 'spellcasting-provider')) {
    const validationError = validateCharacterInput(input, {}, registry).spellcastingSelections;
    if (validationError) {
      return fail('invalid-spellcasting-choice', validationError, spellcasting.value.classId);
    }
  }

  return ok({ input, target: advancement.value.target, incompleteChoices });
}


export function getConfirmableLevelUpCandidate(
  character: Character,
  draft: LevelUpDraft,
  registry: ContentRegistry,
): LevelUpResult<LevelUpCandidate> {
  const candidate = buildLevelUpCandidate(character, draft, registry);
  if (!candidate.ok) return candidate;
  if (candidate.value.incompleteChoices.length > 0) {
    return fail(
      'incomplete-level-up',
      `Level Up is incomplete: ${candidate.value.incompleteChoices.map((choice) => choice.kind).join(', ')}.`,
    );
  }

  for (const choice of draft.spellcastingChoices ?? []) {
    const outgoing = choice.replacement?.outgoingSpellId;
    const incoming = choice.replacement?.incomingSpellId;
    if (Boolean(outgoing) !== Boolean(incoming)) {
      return fail('invalid-spellcasting-choice', 'A class-level spell replacement must either be left unchanged or specify both outgoing and incoming spells.');
    }
  }

  const transition = validateLevelUpTransition(character, candidate.value.input);
  if (!transition.ok) return transition;
  if (
    transition.value.kind !== candidate.value.target.kind
    || transition.value.classId !== candidate.value.target.classId
  ) {
    return fail('invalid-transition', 'The completed Level Up candidate no longer matches the selected advancement target.');
  }

  const validation = validateCharacterInput(candidate.value.input, {}, registry);
  if (hasValidationErrors(validation)) {
    return fail('unresolved-character-rules', 'The completed Level Up candidate does not satisfy Character v10 validation.');
  }

  return candidate;
}

export function buildLevelUpReview(
  character: Character,
  draft: LevelUpDraft,
  registry: ContentRegistry,
): LevelUpResult<LevelUpReview> {
  const candidate = getConfirmableLevelUpCandidate(character, draft, registry);
  if (!candidate.ok) return candidate;
  const core = getLevelUpCoreChoiceContext(character, draft, registry);
  if (!core.ok) return core;

  const beforeState = deriveCharacterState(character, registry);
  if (!beforeState.ok) return fail('unresolved-character-rules', beforeState.error.message, core.value.classId);
  const afterState = deriveCharacterState(ephemeralCharacter(character, candidate.value.input), registry);
  if (!afterState.ok) return fail('unresolved-character-rules', afterState.error.message, core.value.classId);

  const sourceProgression = character.classProgressions.find((progression) => progression.classId === core.value.classId);
  const candidateProgression = candidate.value.input.classProgressions.find((progression) => progression.classId === core.value.classId);
  if (!candidateProgression) return fail('invalid-transition', 'The reviewed advancement class progression is missing.', core.value.classId);

  let subclass: LevelUpReview['subclass'];
  if (candidateProgression.subclassId && candidateProgression.subclassId !== sourceProgression?.subclassId) {
    const content = registry.findSubclass(candidateProgression.subclassId);
    if (!content) return fail('unresolved-character-rules', `Subclass could not be resolved: ${candidateProgression.subclassId}.`, core.value.classId);
    subclass = { id: content.id, name: content.name };
  }

  let feat: LevelUpReview['feat'];
  const featSelection = draft.advancementFeat?.selection;
  if (featSelection) {
    const content = registry.findFeat(featSelection.featId);
    if (!content) return fail('unresolved-character-rules', `Feat could not be resolved: ${featSelection.featId}.`, core.value.classId);
    const abilityChoices = Object.values(featSelection.choices)
      .flat()
      .filter((value): value is AbilityKey => ABILITY_KEYS.includes(value as AbilityKey));
    feat = {
      id: content.id,
      name: content.name,
      path: draft.advancementFeat?.path ?? 'feat',
      abilityChoices,
    };
  }

  const spellcastingContext = getLevelUpSpellcastingChoiceContext(character, draft, registry);
  if (!spellcastingContext.ok) return spellcastingContext;
  const providerById = new Map(spellcastingContext.value.providers.map((provider) => [provider.providerId, provider] as const));
  const spellcasting: LevelUpReview['spellcasting'][number][] = [];
  for (const choice of draft.spellcastingChoices ?? []) {
    const provider = providerById.get(choice.providerId);
    if (!provider) continue;
    const addedCantrips = choice.addedCantripIds.flatMap((id) => {
      const spell = registry.findSpell(id);
      return spell ? [{ id: spell.id, name: spell.name }] : [];
    });
    const addedOwnedSpells = choice.addedOwnedSpellIds.flatMap((id) => {
      const spell = registry.findSpell(id);
      return spell ? [{ id: spell.id, name: spell.name }] : [];
    });
    const outgoingId = choice.replacement?.outgoingSpellId;
    const incomingId = choice.replacement?.incomingSpellId;
    let replacement: LevelUpReview['spellcasting'][number]['replacement'];
    if (outgoingId && incomingId) {
      const outgoing = registry.findSpell(outgoingId);
      const incoming = registry.findSpell(incomingId);
      if (!outgoing || !incoming) {
        return fail('unresolved-character-rules', 'A reviewed spell replacement could not be resolved.', core.value.classId);
      }
      replacement = {
        outgoing: { id: outgoing.id, name: outgoing.name },
        incoming: { id: incoming.id, name: incoming.name },
      };
    }
    if (addedCantrips.length === 0 && addedOwnedSpells.length === 0 && !replacement) continue;
    const ownerLabel = provider.owner.kind === 'subclass'
      ? `${provider.owner.className} · ${provider.owner.subclassName}`
      : provider.owner.className;
    spellcasting.push({
      providerId: provider.providerId,
      providerName: provider.providerName,
      ownerLabel,
      addedCantrips,
      addedOwnedSpells,
      ...(replacement ? { replacement } : {}),
    });
  }

  const hpChoice = draft.hitPoints;
  if (!hpChoice) return fail('incomplete-level-up', 'Hit Point advancement must be complete before Review.', core.value.classId);

  return ok({
    totalLevel: {
      before: getTotalCharacterLevel(character),
      after: getTotalCharacterLevel(candidate.value.input),
    },
    classAdvancement: {
      classId: core.value.classId,
      className: core.value.className,
      kind: core.value.target.kind,
      beforeLevel: core.value.currentClassLevel,
      afterLevel: core.value.nextClassLevel,
    },
    hitPoints: {
      method: hpChoice.method,
      ...(hpChoice.method === 'fixed' ? { fixedValue: core.value.fixedHitPointsPerLevel } : { roll: hpChoice.roll }),
      maximumBefore: beforeState.value.health.maximumHp,
      maximumAfter: afterState.value.health.maximumHp,
    },
    ...(subclass ? { subclass } : {}),
    addedClassSkills: core.value.addedClass ? [...(draft.addedClassSkillProficiencies ?? [])] : [],
    skillExpertise: [...candidateProgression.skillExpertise],
    weaponMasteries: candidate.value.input.classProgressions.flatMap((progression) => {
      if (progression.weaponMasterySelections.length === 0) return [];
      return [{
        classId: progression.classId,
        className: registry.findClass(progression.classId)?.name ?? progression.classId,
        weapons: progression.weaponMasterySelections.flatMap((id) => {
          const weapon = registry.findWeapon(id);
          return weapon ? [{ id: weapon.id, name: weapon.name }] : [];
        }),
      }];
    }),
    languages: [...candidate.value.input.languageChoices],
    ...(feat ? { feat } : {}),
    spellcasting,
  });
}
