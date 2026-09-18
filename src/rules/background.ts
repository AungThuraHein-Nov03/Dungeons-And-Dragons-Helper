import { ABILITY_KEYS, type AbilityKey, type AbilityScores, type BackgroundAbilityChoice, type CharacterInput } from '../models/character';
import type { BackgroundContent } from '../models/content';
import type { ContentRegistry } from '../services/contentRegistry';
import { ruleError, ruleOk, type RuleResult } from './result';

export function validateBackgroundAbilityChoice(background: BackgroundContent, choice: BackgroundAbilityChoice | undefined): string | undefined {
  if (!choice) return 'Choose how the Background ability increases are assigned.';
  if (choice.mode === 'three-ones') return undefined;
  if (choice.plusTwo === choice.plusOne) return 'The +2 and +1 Background increases must use different abilities.';
  const allowed = new Set<AbilityKey>(background.abilityScores);
  if (!allowed.has(choice.plusTwo) || !allowed.has(choice.plusOne)) return 'Background ability increases must use abilities offered by the selected Background.';
  return undefined;
}

export function deriveBackgroundAbilityScores(
  baseScores: AbilityScores,
  background: BackgroundContent | undefined,
  choice: BackgroundAbilityChoice | undefined,
): RuleResult<AbilityScores> {
  const scores = { ...baseScores };
  if (!background) return ruleOk(scores);
  const invalid = validateBackgroundAbilityChoice(background, choice);
  if (invalid) return ruleError('invalid-background-choice', invalid, background.id);
  if (choice!.mode === 'three-ones') {
    for (const ability of background.abilityScores) scores[ability] += 1;
  } else {
    scores[choice!.plusTwo] += 2;
    scores[choice!.plusOne] += 1;
  }
  if (ABILITY_KEYS.some((ability) => scores[ability] > 20)) return ruleError('invalid-background-choice', 'Background increases cannot raise an ability score above 20.', background.id);
  return ruleOk(scores);
}

export function resolveBackgroundToolProficiency(background: BackgroundContent, toolChoice: string | undefined): RuleResult<{ id: string; name: string }> {
  if (background.toolProficiency.kind === 'fixed') return ruleOk({ id: background.toolProficiency.id, name: background.toolProficiency.name });
  const selected = background.toolProficiency.options.find((option) => option.id === toolChoice);
  return selected ? ruleOk(selected) : ruleError('invalid-background-choice', 'Choose a valid Background tool proficiency.', background.id);
}

export function deriveEffectiveAbilityScores(input: CharacterInput, registry: ContentRegistry): RuleResult<AbilityScores> {
  if (!input.backgroundId) return ruleOk({ ...input.abilityScores });
  const background = registry.findBackground(input.backgroundId);
  if (!background) return ruleError('missing-background', `Character Background could not be resolved: ${input.backgroundId}`, input.backgroundId);
  return deriveBackgroundAbilityScores(input.abilityScores, background, input.backgroundAbilityChoice);
}
