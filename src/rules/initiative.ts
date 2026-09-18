import type { CharacterRuleEffect } from '../models/content';
import type { DerivedInitiative, DerivedRuleEffectSource } from './types';

function initiativeEffects(source: DerivedRuleEffectSource) {
  return source.effects.filter((effect): effect is Extract<CharacterRuleEffect,
    { type: 'initiative-modifier' | 'initiative-proficiency' | 'initiative-half-proficiency' | 'initiative-roll-mode' }
  > => effect.type === 'initiative-modifier'
    || effect.type === 'initiative-proficiency'
    || effect.type === 'initiative-half-proficiency'
    || effect.type === 'initiative-roll-mode');
}

export function deriveInitiative(
  dexterityModifier: number,
  proficiencyBonus: number,
  sources: readonly DerivedRuleEffectSource[],
): DerivedInitiative {
  const contributions: Array<{ label: string; amount: number }> = [];
  const advantageSources: string[] = [];
  const disadvantageSources: string[] = [];
  const fullProficiencySources: string[] = [];
  const halfProficiencySources: string[] = [];

  for (const source of sources) {
    for (const effect of initiativeEffects(source)) {
      if (effect.type === 'initiative-modifier') {
        contributions.push({ label: source.name, amount: effect.amount });
      } else if (effect.type === 'initiative-proficiency') {
        fullProficiencySources.push(source.name);
      } else if (effect.type === 'initiative-half-proficiency') {
        halfProficiencySources.push(source.name);
      } else if (effect.mode === 'advantage') {
        advantageSources.push(source.name);
      } else {
        disadvantageSources.push(source.name);
      }
    }
  }

  let proficiency: DerivedInitiative['proficiency'] = 'none';
  if (fullProficiencySources.length > 0) {
    proficiency = 'full';
    contributions.push({ label: fullProficiencySources[0], amount: proficiencyBonus });
  } else if (halfProficiencySources.length > 0) {
    proficiency = 'half';
    contributions.push({ label: halfProficiencySources[0], amount: Math.floor(proficiencyBonus / 2) });
  }

  return {
    baseModifier: dexterityModifier,
    modifier: dexterityModifier + contributions.reduce((total, contribution) => total + contribution.amount, 0),
    proficiency,
    contributions,
    advantageSources: [...new Set(advantageSources)],
    disadvantageSources: [...new Set(disadvantageSources)],
  };
}
