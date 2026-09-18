import type { AbilityKey, AbilityScores, CharacterFeatSelection, CharacterInput } from '../models/character';
import type { FeatContent, FeatEffect, FeatPrerequisite } from '../models/content';
import type { ContentRegistry } from '../services/contentRegistry';
import { ruleError, ruleOk, type RuleResult } from './result';
import type { DerivedFeatPrerequisite, DerivedFeatState } from './types';

export interface DerivedFeatCollection {
  readonly abilityScores: AbilityScores;
  readonly feats: readonly DerivedFeatState[];
  readonly effects: readonly FeatEffect[];
}

function prerequisiteState(prerequisite: FeatPrerequisite, level: number, scores: AbilityScores): DerivedFeatPrerequisite {
  if (prerequisite.type === 'level') {
    const met = level >= prerequisite.minimum;
    return { description: `Level ${prerequisite.minimum}+`, status: met ? 'met' : 'unmet' };
  }
  if (prerequisite.type === 'ability-minimum') {
    const met = prerequisite.abilities.some((ability) => scores[ability] >= prerequisite.minimum);
    const names = prerequisite.abilities.map((ability) => ability[0].toUpperCase() + ability.slice(1)).join(' or ');
    return { description: `${names} ${prerequisite.minimum}+`, status: met ? 'met' : 'unmet' };
  }
  return { description: prerequisite.name, status: 'not-evaluated' };
}

function cloneChoices(choices: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(choices).map(([key, values]) => [key, [...values]]));
}

export function validateFeatSelection(
  feat: FeatContent,
  selection: CharacterFeatSelection,
  level: number,
  currentScores: AbilityScores,
): string | undefined {
  if (selection.featId !== feat.id) return 'Feat selection does not match the resolved Feat.';
  const knownChoices = new Map(feat.choices.map((choice) => [choice.id, choice]));
  if (Object.keys(selection.choices).some((choiceId) => !knownChoices.has(choiceId))) return `Stored choice is not supported by ${feat.name}.`;
  for (const [choiceId, values] of Object.entries(selection.choices)) {
    if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) return `Stored choice is invalid for ${feat.name}.`;
    const definition = knownChoices.get(choiceId)!;
    if (definition.options && values.some((value) => !definition.options!.some((option) => option.id === value))) return `Stored choice is invalid for ${feat.name}.`;
  }
  for (const prerequisite of feat.prerequisites) {
    const state = prerequisiteState(prerequisite, level, currentScores);
    if (state.status === 'unmet') return `${feat.name} prerequisite is not met: ${state.description}.`;
  }
  for (const effect of feat.effects) {
    if (effect.type !== 'ability-score-increase') continue;
    const selected = selection.choices[effect.choiceId];
    if (!selected || selected.length !== effect.selections) return `Choose the required ability increase for ${feat.name}.`;
    if (selected.some((ability) => !effect.allowedAbilities.includes(ability as AbilityKey))) return `Choose a valid ability for ${feat.name}.`;
    if (!effect.allowDuplicateSelection && new Set(selected).size !== selected.length) return `${feat.name} requires different ability selections.`;
    const increments = new Map<AbilityKey, number>();
    for (const ability of selected as AbilityKey[]) increments.set(ability, (increments.get(ability) ?? 0) + effect.amountPerSelection);
    for (const [ability, amount] of increments) if (currentScores[ability] + amount > effect.maximum) return `${feat.name} cannot raise ${ability} above ${effect.maximum}.`;
  }
  return undefined;
}

function applyAbilityEffects(scores: AbilityScores, feat: FeatContent, selection: CharacterFeatSelection): AbilityScores {
  const next = { ...scores };
  for (const effect of feat.effects) {
    if (effect.type !== 'ability-score-increase') continue;
    for (const ability of selection.choices[effect.choiceId] as AbilityKey[]) next[ability] += effect.amountPerSelection;
  }
  return next;
}

function derivedFeat(feat: FeatContent, acquisition: DerivedFeatState['acquisition'], choices: Record<string, string[]>, level: number, scores: AbilityScores, variant?: string): DerivedFeatState {
  return {
    id: feat.id,
    name: feat.name,
    category: feat.category,
    acquisition,
    ...(variant ? { variant } : {}),
    choices: cloneChoices(choices),
    prerequisites: feat.prerequisites.map((prerequisite) => prerequisiteState(prerequisite, level, scores)),
    automatedEffects: feat.effects,
    referenceEffects: feat.referenceEffects,
  };
}

export function deriveCharacterFeats(input: CharacterInput, registry: ContentRegistry, initialScores: AbilityScores): RuleResult<DerivedFeatCollection> {
  let scores = { ...initialScores };
  const feats: DerivedFeatState[] = [];
  const effects: FeatEffect[] = [];
  const acquiredNonrepeatable = new Set<string>();

  if (input.backgroundId) {
    const background = registry.findBackground(input.backgroundId);
    if (!background) return ruleError('missing-background', `Character Background could not be resolved: ${input.backgroundId}`, input.backgroundId);
    const feat = registry.findFeat(background.originFeat.id);
    if (!feat) return ruleError('missing-feat', `Background Origin Feat could not be resolved: ${background.originFeat.id}`, background.originFeat.id);
    if (!feat.repeatable) acquiredNonrepeatable.add(feat.id);
    const abilityEffects = feat.effects.filter((effect) => effect.type === 'ability-score-increase');
    if (abilityEffects.length > 0) return ruleError('invalid-feat-choice', `Background-granted ${feat.name} requires a structured choice that this Background does not store.`, feat.id);
    feats.push(derivedFeat(feat, { type: 'background', backgroundId: background.id, backgroundName: background.name }, {}, input.level, scores, background.originFeat.variant));
    effects.push(...feat.effects);
  }

  for (const selection of input.manualFeats) {
    const feat = registry.findFeat(selection.featId);
    if (!feat) return ruleError('missing-feat', `Character Feat could not be resolved: ${selection.featId}`, selection.featId);
    if (!feat.repeatable && acquiredNonrepeatable.has(feat.id)) return ruleError('duplicate-feat', `${feat.name} cannot be acquired more than once.`, feat.id);
    const invalid = validateFeatSelection(feat, selection, input.level, scores);
    if (invalid) return ruleError('invalid-feat-choice', invalid, feat.id);
    const before = { ...scores };
    scores = applyAbilityEffects(scores, feat, selection);
    feats.push(derivedFeat(feat, { type: 'manual' }, selection.choices, input.level, before));
    effects.push(...feat.effects);
    if (!feat.repeatable) acquiredNonrepeatable.add(feat.id);
  }

  return ruleOk({ abilityScores: scores, feats, effects });
}
