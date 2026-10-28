import { LANGUAGE_IDS, isLanguageId, type CharacterInput, type LanguageId } from '../models/character';
import type { CharacterRuleEffect, ClassFeatureContent } from '../models/content';
import type { ContentRegistry } from '../services/contentRegistry';
import { ruleError, ruleOk, type RuleResult } from './result';

export interface LanguageChoiceState {
  readonly entitled: number;
  readonly fixed: readonly LanguageId[];
  readonly selected: readonly LanguageId[];
  readonly eligible: readonly LanguageId[];
  readonly known: readonly LanguageId[];
  readonly missing: number;
}

function acquiredFeatures(character: CharacterInput, registry: ContentRegistry): RuleResult<readonly ClassFeatureContent[]> {
  const features: ClassFeatureContent[] = [];
  for (const progression of character.classProgressions) {
    const classContent = registry.findClass(progression.classId);
    if (!classContent) return ruleError('missing-class', `Character class could not be resolved: ${progression.classId}`, progression.classId);
    features.push(...classContent.progression.filter((row) => row.level <= progression.level).flatMap((row) => row.features));
    if (progression.subclassId) {
      const subclass = registry.findSubclass(progression.subclassId);
      if (!subclass || subclass.parentClassId !== progression.classId) return ruleError('invalid-subclass-parent', 'Character subclass could not be resolved for language derivation.', progression.subclassId);
      features.push(...subclass.progression.filter((row) => row.level <= progression.level).flatMap((row) => row.features));
    }
  }
  return ruleOk(features);
}

export function deriveLanguageChoices(character: CharacterInput, registry: ContentRegistry): RuleResult<LanguageChoiceState> {
  const features = acquiredFeatures(character, registry);
  if (!features.ok) return features;
  const effects = features.value.flatMap((feature) => feature.effects);
  const fixed = [...new Set<LanguageId>([
    'common',
    ...effects.flatMap((effect): LanguageId[] => effect.type === 'language-grant' ? [effect.languageId] : []),
  ])];
  const entitled = effects
    .filter((effect): effect is Extract<CharacterRuleEffect, { readonly type: 'language-choice' }> => effect.type === 'language-choice')
    .reduce((total, effect) => total + effect.choose, 0);
  return ruleOk({
    entitled,
    fixed,
    selected: [...character.languageChoices],
    eligible: LANGUAGE_IDS.filter((language) => !fixed.includes(language)),
    known: [...new Set([...fixed, ...character.languageChoices])],
    missing: Math.max(0, entitled - character.languageChoices.length),
  });
}

export function validateLanguageChoices(character: CharacterInput, options: { readonly allowUnderfilled: boolean }, registry: ContentRegistry): string | undefined {
  if (character.languageChoices.some((language) => !isLanguageId(language))) return 'Language choices must use supported canonical languages.';
  if (new Set(character.languageChoices).size !== character.languageChoices.length) return 'Language choices must be unique.';
  const state = deriveLanguageChoices(character, registry);
  if (!state.ok) return state.error.message;
  if (character.languageChoices.some((language) => state.value.fixed.includes(language))) return 'Selected additional languages cannot duplicate a fixed language grant.';
  if (character.languageChoices.length > state.value.entitled) return `This Character can select at most ${state.value.entitled} additional language${state.value.entitled === 1 ? '' : 's'}.`;
  if (!options.allowUnderfilled && character.languageChoices.length !== state.value.entitled) return `Choose exactly ${state.value.entitled} additional language${state.value.entitled === 1 ? '' : 's'}.`;
  return undefined;
}
