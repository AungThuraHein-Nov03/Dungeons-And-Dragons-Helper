import {
  ABILITY_KEYS,
  SKILL_IDS,
  type AbilityKey,
  type SkillId,
} from '../models/character';
import type {
  CharacterRuleEffect,
  FeatChoiceDefinition,
  FeatContent,
  FeatPrerequisite,
  FeatReferenceEffect,
} from '../models/content';
import { allocateHomebrewContentId } from '../services/homebrewContentStorage';

export const FEAT_FORGE_CATEGORIES = ['origin', 'general', 'fighting-style', 'epic-boon'] as const;
export type FeatForgeCategory = (typeof FEAT_FORGE_CATEGORIES)[number];

export type FeatForgeStaticEffect = Exclude<CharacterRuleEffect, { readonly type: 'dice-transformation' }>;
export type FeatForgeStaticEffectType = FeatForgeStaticEffect['type'];
export type FeatForgeDiceEffect = Extract<CharacterRuleEffect, { readonly type: 'dice-transformation' }>;
export type FeatForgeDiceTransformationType = FeatForgeDiceEffect['transformation']['type'];

export type FeatForgePrerequisiteDraft =
  | { readonly draftId: string; readonly type: 'level'; readonly minimum: number }
  | { readonly draftId: string; readonly type: 'ability-minimum'; readonly abilities: readonly AbilityKey[]; readonly minimum: number }
  | { readonly draftId: string; readonly type: 'feature'; readonly name: string };

export interface FeatForgeAsiDraft {
  readonly choiceId: string;
  readonly allowedAbilities: readonly AbilityKey[];
  readonly selections: 1 | 2;
  readonly maximum: 20 | 30;
  readonly allowDuplicateSelection: boolean;
}

export interface FeatForgeStaticEffectDraft {
  readonly draftId: string;
  readonly effect: FeatForgeStaticEffect;
}

export interface FeatForgeDiceEffectDraft {
  readonly draftId: string;
  readonly effect: FeatForgeDiceEffect;
}

export interface FeatForgeReferenceEffectDraft {
  readonly draftId: string;
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface FeatForgeDraft {
  readonly id: string;
  readonly sourceNamespace: string;
  readonly name: string;
  readonly description: string;
  readonly category: FeatForgeCategory;
  readonly repeatable: boolean;
  readonly repeatabilityNote: string;
  readonly prerequisites: readonly FeatForgePrerequisiteDraft[];
  readonly asi?: FeatForgeAsiDraft;
  readonly staticEffects: readonly FeatForgeStaticEffectDraft[];
  readonly diceEffects: readonly FeatForgeDiceEffectDraft[];
  readonly referenceEffects: readonly FeatForgeReferenceEffectDraft[];
  readonly preservedReferenceChoices: readonly FeatChoiceDefinition[];
}

export type FeatForgeDraftLoadResult =
  | { readonly ok: true; readonly draft: FeatForgeDraft }
  | { readonly ok: false; readonly message: string };

function draftId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function abilityChoiceDescription(asi: FeatForgeAsiDraft): string {
  const selectionText = asi.selections === 2 ? 'Choose two ability selections' : 'Choose one ability';
  const duplicateText = asi.selections === 2 && asi.allowDuplicateSelection
    ? ' The same ability may be selected twice.'
    : asi.selections === 2
      ? ' Choose different abilities.'
      : '';
  return `${selectionText}. Each selection grants +1, to a maximum of ${asi.maximum}.${duplicateText}`;
}

function clonePrerequisite(prerequisite: FeatForgePrerequisiteDraft): FeatForgePrerequisiteDraft {
  if (prerequisite.type === 'ability-minimum') {
    return { ...prerequisite, draftId: draftId(), abilities: [...prerequisite.abilities] };
  }
  return { ...prerequisite, draftId: draftId() };
}

function cloneStaticEffect(effect: FeatForgeStaticEffect): FeatForgeStaticEffect {
  return structuredClone(effect);
}

function cloneDiceEffectForDuplicate(effect: FeatForgeDiceEffect): FeatForgeDiceEffect {
  return {
    ...structuredClone(effect),
    id: allocateHomebrewContentId('dice-transformation'),
  };
}

export function createFeatForgeDraft(): FeatForgeDraft {
  return {
    id: allocateHomebrewContentId('feat'),
    sourceNamespace: 'local',
    name: '',
    description: '',
    category: 'general',
    repeatable: false,
    repeatabilityNote: '',
    prerequisites: [],
    staticEffects: [],
    diceEffects: [],
    referenceEffects: [],
    preservedReferenceChoices: [],
  };
}

export function loadFeatForgeDraft(feat: FeatContent): FeatForgeDraftLoadResult {
  if (feat.source.type !== 'homebrew') {
    return { ok: false, message: 'Bundled SRD Feats are read-only and cannot be edited in Creator Forge.' };
  }

  const asiEffects = feat.effects.filter((effect) => effect.type === 'ability-score-increase');
  const structuredChoices = feat.choices.filter((choice) => choice.support === 'structured');
  if (asiEffects.length > 1) {
    return { ok: false, message: 'This Feat contains multiple structured ability-score effects, which M16-C does not edit safely.' };
  }

  let asi: FeatForgeAsiDraft | undefined;
  if (asiEffects.length === 1) {
    const [effect] = asiEffects;
    const choice = feat.choices.find((candidate) => candidate.id === effect.choiceId);
    if (!choice || choice.support !== 'structured' || structuredChoices.length !== 1) {
      return { ok: false, message: 'This Feat contains a structured choice outside the bounded ASI contract supported by M16-C.' };
    }
    asi = {
      choiceId: effect.choiceId,
      allowedAbilities: [...effect.allowedAbilities],
      selections: effect.selections,
      maximum: effect.maximum,
      allowDuplicateSelection: effect.allowDuplicateSelection,
    };
  } else if (structuredChoices.length > 0) {
    return { ok: false, message: 'This Feat contains a structured choice outside the bounded ASI contract supported by M16-C.' };
  }

  const prerequisites: FeatForgePrerequisiteDraft[] = feat.prerequisites.map((prerequisite) => {
    if (prerequisite.type === 'level') return { draftId: draftId(), type: 'level', minimum: prerequisite.minimum };
    if (prerequisite.type === 'ability-minimum') {
      return { draftId: draftId(), type: 'ability-minimum', abilities: [...prerequisite.abilities], minimum: prerequisite.minimum };
    }
    return { draftId: draftId(), type: 'feature', name: prerequisite.name };
  });

  const staticEffects: FeatForgeStaticEffectDraft[] = feat.effects.flatMap((effect) => (
    effect.type === 'ability-score-increase' || effect.type === 'dice-transformation'
      ? []
      : [{ draftId: draftId(), effect: cloneStaticEffect(effect) }]
  ));
  const diceEffects: FeatForgeDiceEffectDraft[] = feat.effects.flatMap((effect) => (
    effect.type === 'dice-transformation'
      ? [{ draftId: draftId(), effect: structuredClone(effect) }]
      : []
  ));

  return {
    ok: true,
    draft: {
      id: feat.id,
      sourceNamespace: feat.source.namespace,
      name: feat.name,
      description: feat.description,
      category: feat.category,
      repeatable: feat.repeatable,
      repeatabilityNote: feat.repeatabilityNote ?? '',
      prerequisites,
      ...(asi ? { asi } : {}),
      staticEffects,
      diceEffects,
      referenceEffects: feat.referenceEffects.map((effect) => ({
        draftId: draftId(),
        id: effect.id,
        name: effect.name,
        description: effect.description,
      })),
      preservedReferenceChoices: feat.choices
        .filter((choice) => choice.support === 'reference-only')
        .map((choice) => structuredClone(choice)),
    },
  };
}

export function duplicateFeatForgeDraft(feat: FeatContent): FeatForgeDraftLoadResult {
  const loaded = loadFeatForgeDraft(feat);
  if (!loaded.ok) return loaded;
  const original = loaded.draft;
  return {
    ok: true,
    draft: {
      ...original,
      id: allocateHomebrewContentId('feat'),
      sourceNamespace: 'local',
      name: `${original.name} Copy`,
      prerequisites: original.prerequisites.map(clonePrerequisite),
      staticEffects: original.staticEffects.map((entry) => ({ draftId: draftId(), effect: cloneStaticEffect(entry.effect) })),
      diceEffects: original.diceEffects.map((entry) => ({ draftId: draftId(), effect: cloneDiceEffectForDuplicate(entry.effect) })),
      referenceEffects: original.referenceEffects.map((entry) => ({
        ...entry,
        draftId: draftId(),
        id: allocateHomebrewContentId('feat-reference-effect'),
      })),
      preservedReferenceChoices: [],
    },
  };
}

export function buildFeatContentFromDraft(draft: FeatForgeDraft): FeatContent {
  const prerequisites: FeatPrerequisite[] = draft.prerequisites.map((prerequisite) => {
    if (prerequisite.type === 'level') return { type: 'level', minimum: prerequisite.minimum };
    if (prerequisite.type === 'ability-minimum') {
      return { type: 'ability-minimum', abilities: [...prerequisite.abilities], minimum: prerequisite.minimum };
    }
    return { type: 'feature', name: prerequisite.name.trim(), support: 'reference-only' };
  });

  const choices: FeatChoiceDefinition[] = draft.asi
    ? [{
        id: draft.asi.choiceId,
        name: 'Ability Score Increase',
        support: 'structured',
        description: abilityChoiceDescription(draft.asi),
        options: draft.asi.allowedAbilities.map((ability) => ({
          id: ability,
          name: ability[0].toUpperCase() + ability.slice(1),
        })),
      }, ...draft.preservedReferenceChoices.map((choice) => structuredClone(choice))]
    : draft.preservedReferenceChoices.map((choice) => structuredClone(choice));

  const effects: FeatContent['effects'][number][] = [];
  if (draft.asi) {
    effects.push({
      type: 'ability-score-increase',
      choiceId: draft.asi.choiceId,
      allowedAbilities: [...draft.asi.allowedAbilities],
      selections: draft.asi.selections,
      amountPerSelection: 1,
      maximum: draft.asi.maximum,
      allowDuplicateSelection: draft.asi.allowDuplicateSelection,
    });
  }
  effects.push(...draft.staticEffects.map((entry) => cloneStaticEffect(entry.effect)));
  effects.push(...draft.diceEffects.map((entry) => structuredClone(entry.effect)));

  const referenceEffects: FeatReferenceEffect[] = draft.referenceEffects.map((effect) => ({
    id: effect.id,
    name: effect.name.trim(),
    description: effect.description.trim(),
  }));

  return {
    id: draft.id,
    kind: 'feat',
    name: draft.name.trim(),
    source: { type: 'homebrew', namespace: draft.sourceNamespace },
    category: draft.category,
    prerequisites,
    repeatable: draft.repeatable,
    ...(draft.repeatable && draft.repeatabilityNote.trim() ? { repeatabilityNote: draft.repeatabilityNote.trim() } : {}),
    choices,
    effects,
    referenceEffects,
    description: draft.description.trim(),
  };
}

export function validateFeatForgeDraft(draft: FeatForgeDraft): readonly string[] {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push('Name is required.');
  if (!draft.description.trim()) errors.push('Description is required.');

  for (const prerequisite of draft.prerequisites) {
    if (prerequisite.type === 'level' && (!Number.isInteger(prerequisite.minimum) || prerequisite.minimum < 1 || prerequisite.minimum > 20)) {
      errors.push('Level prerequisites must be whole numbers from 1 to 20.');
    }
    if (prerequisite.type === 'ability-minimum') {
      if (prerequisite.abilities.length === 0) errors.push('Ability prerequisites must include at least one ability.');
      if (!Number.isInteger(prerequisite.minimum)) errors.push('Ability prerequisite minimums must be whole numbers.');
    }
    if (prerequisite.type === 'feature' && !prerequisite.name.trim()) errors.push('Reference-only feature prerequisites require a name.');
  }

  if (draft.asi) {
    if (draft.asi.allowedAbilities.length === 0) errors.push('Structured ASI must allow at least one ability.');
    if (draft.asi.selections === 2 && !draft.asi.allowDuplicateSelection && draft.asi.allowedAbilities.length < 2) {
      errors.push('A two-selection ASI without duplicate selection needs at least two allowed abilities.');
    }
  }

  for (const entry of draft.staticEffects) {
    const effect = entry.effect;
    if (effect.type === 'armor-class-bonus' && effect.armorCategories.length === 0) errors.push('Armor Class bonus effects need at least one armor category.');
    if (effect.type === 'skill-check-advantage' && effect.skillIds.length === 0) errors.push('Skill-check Advantage effects need at least one skill.');
    if ((effect.type === 'saving-throw-roll-mode' || effect.type === 'saving-throw-proficiency') && effect.abilities.length === 0) errors.push('Saving-throw effects need at least one ability.');
    if (effect.type === 'hit-point-bonus-per-class-level' && (!Number.isInteger(effect.amount) || effect.amount < 1)) errors.push('Hit Point bonus per class level must be a positive whole number.');
    if (effect.type === 'critical-threshold' && (!Number.isInteger(effect.minimumNatural) || effect.minimumNatural < 2 || effect.minimumNatural > 20)) errors.push('Critical threshold must be a whole number from 2 to 20.');
    if (effect.type === 'unarmored-armor-class' && effect.abilities.length === 0) errors.push('Unarmored Armor Class effects need at least one ability.');
    if (effect.type === 'speed-bonus' && effect.amount.kind === 'level-table' && effect.amount.values.length === 0) errors.push('Level-table Speed bonuses need at least one level row.');
  }

  for (const entry of draft.diceEffects) {
    const effect = entry.effect;
    if (effect.transformation.type === 'reroll-once-use-new' && effect.transformation.qualifyingFaces.length === 0) {
      errors.push('D20 rerolls need at least one qualifying face.');
    }
    if (effect.transformation.type === 'minimum-die-face') {
      if (!Number.isInteger(effect.transformation.minimum) || effect.transformation.minimum < 1 || effect.transformation.minimum > 12) {
        errors.push('Minimum die face must be a whole number from 1 to 12.');
      }
      if (effect.target.kind !== 'weapon-damage' || effect.target.anyWeaponProperties.length === 0) {
        errors.push('Minimum-die-face transformations need at least one supported weapon property.');
      }
    }
  }

  for (const effect of draft.referenceEffects) {
    if (!effect.name.trim()) errors.push('Reference-only effects require a name.');
    if (!effect.description.trim()) errors.push('Reference-only effects require a description.');
  }
  return [...new Set(errors)];
}

export function createLevelPrerequisiteDraft(): FeatForgePrerequisiteDraft {
  return { draftId: draftId(), type: 'level', minimum: 4 };
}

export function createAbilityPrerequisiteDraft(): FeatForgePrerequisiteDraft {
  return { draftId: draftId(), type: 'ability-minimum', abilities: ['strength'], minimum: 13 };
}

export function createFeaturePrerequisiteDraft(): FeatForgePrerequisiteDraft {
  return { draftId: draftId(), type: 'feature', name: '' };
}

export function createAsiDraft(): FeatForgeAsiDraft {
  return {
    choiceId: 'ability-increase',
    allowedAbilities: [...ABILITY_KEYS],
    selections: 1,
    maximum: 20,
    allowDuplicateSelection: false,
  };
}

export const FEAT_FORGE_STATIC_EFFECT_TYPES: readonly FeatForgeStaticEffectType[] = [
  'attack-roll-bonus',
  'armor-class-bonus',
  'skill-check-advantage',
  'saving-throw-roll-mode',
  'saving-throw-proficiency',
  'initiative-modifier',
  'initiative-proficiency',
  'initiative-half-proficiency',
  'initiative-roll-mode',
  'hit-point-bonus-per-class-level',
  'speed-bonus',
  'critical-threshold',
  'unarmored-armor-class',
];

export function createStaticEffectDraft(type: FeatForgeStaticEffectType): FeatForgeStaticEffectDraft {
  let effect: FeatForgeStaticEffect;
  if (type === 'attack-roll-bonus') effect = { type, weaponMode: 'ranged', amount: 1 };
  else if (type === 'armor-class-bonus') effect = { type, armorCategories: ['light', 'medium', 'heavy'], amount: 1 };
  else if (type === 'skill-check-advantage') effect = { type, skillIds: ['athletics'] };
  else if (type === 'saving-throw-roll-mode') effect = { type, abilities: ['strength'], mode: 'advantage' };
  else if (type === 'saving-throw-proficiency') effect = { type, abilities: ['strength'] };
  else if (type === 'initiative-modifier') effect = { type, amount: 1 };
  else if (type === 'initiative-proficiency') effect = { type };
  else if (type === 'initiative-half-proficiency') effect = { type };
  else if (type === 'initiative-roll-mode') effect = { type, mode: 'advantage' };
  else if (type === 'hit-point-bonus-per-class-level') effect = { type, amount: 1 };
  else if (type === 'speed-bonus') effect = { type, amount: { kind: 'fixed', amount: 5 } };
  else if (type === 'critical-threshold') effect = { type, attackKind: 'weapon', minimumNatural: 19 };
  else effect = { type: 'unarmored-armor-class', base: 10, abilities: ['dexterity'], allowShield: false };
  return { draftId: draftId(), effect };
}

export function replaceStaticEffectType(
  entry: FeatForgeStaticEffectDraft,
  type: FeatForgeStaticEffectType,
): FeatForgeStaticEffectDraft {
  return { ...createStaticEffectDraft(type), draftId: entry.draftId };
}

export function createDiceEffectDraft(type: FeatForgeDiceTransformationType): FeatForgeDiceEffectDraft {
  const id = allocateHomebrewContentId('dice-transformation');
  const effect: FeatForgeDiceEffect = type === 'reroll-once-use-new'
    ? {
        type: 'dice-transformation',
        id,
        optional: false,
        target: { kind: 'd20-test' },
        transformation: { type, die: 20, qualifyingFaces: [1] },
      }
    : {
        type: 'dice-transformation',
        id,
        optional: false,
        target: {
          kind: 'weapon-damage',
          weaponMode: 'melee',
          heldWithTwoHands: true,
          anyWeaponProperties: ['two-handed', 'versatile'],
        },
        transformation: { type, minimum: 3 },
      };
  return { draftId: draftId(), effect };
}

export function replaceDiceEffectType(
  entry: FeatForgeDiceEffectDraft,
  type: FeatForgeDiceTransformationType,
): FeatForgeDiceEffectDraft {
  const replacement = createDiceEffectDraft(type);
  return {
    draftId: entry.draftId,
    effect: { ...replacement.effect, id: entry.effect.id, optional: entry.effect.optional },
  };
}

export function createReferenceEffectDraft(): FeatForgeReferenceEffectDraft {
  return {
    draftId: draftId(),
    id: allocateHomebrewContentId('feat-reference-effect'),
    name: '',
    description: '',
  };
}

export function toggleAbility(values: readonly AbilityKey[], ability: AbilityKey): AbilityKey[] {
  return values.includes(ability) ? values.filter((candidate) => candidate !== ability) : [...values, ability];
}

export function toggleSkill(values: readonly SkillId[], skill: SkillId): SkillId[] {
  return values.includes(skill) ? values.filter((candidate) => candidate !== skill) : [...values, skill];
}

export function allAbilities(): readonly AbilityKey[] {
  return ABILITY_KEYS;
}

export function allSkills(): readonly SkillId[] {
  return SKILL_IDS;
}
