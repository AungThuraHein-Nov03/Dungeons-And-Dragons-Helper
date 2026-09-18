import type { CharacterInput } from '../models/character';
import type { CharacterRuleEffect, ClassContent, ClassResourceDefinition, ResourceConsumerGrant } from '../models/content';
import type { ActiveSelfEffectGrant } from './activeSelfEffects';
import type { ContentRegistry } from '../services/contentRegistry';
import { ruleError, ruleOk, type RuleResult } from './result';
import type { SpellcastingProviderGrant, SpellcastingSpellGrant } from './spellcasting';
import type { ResourceTransactionGrant } from './resourceTransactions';
import type { DerivedClassFeature, DerivedClassState } from './types';

function derivedFeature(level: number, feature: ClassContent['progression'][number]['features'][number]): DerivedClassFeature {
  return {
    id: feature.id,
    level,
    name: feature.name,
    description: feature.description,
    automatedEffects: feature.effects,
    referenceEffects: feature.referenceEffects,
  };
}

export interface DerivedClassCollection {
  readonly classState: DerivedClassState;
  readonly effects: readonly CharacterRuleEffect[];
  readonly spellcastingProviders: readonly SpellcastingProviderGrant[];
  readonly spellGrants: readonly SpellcastingSpellGrant[];
  readonly resources: readonly ClassResourceDefinition[];
  readonly resourceConsumers: readonly ResourceConsumerGrant[];
  readonly resourceTransactions: readonly ResourceTransactionGrant[];
  readonly activeSelfEffects: readonly ActiveSelfEffectGrant[];
}

export function deriveCharacterClass(input: CharacterInput, registry: ContentRegistry): RuleResult<DerivedClassCollection> {
  const classContent = registry.findClass(input.classId);
  if (!classContent) return ruleError('missing-class', `Character class could not be resolved: ${input.classId}`, input.classId);

  const acquiredFeatures: DerivedClassFeature[] = [];
  const futureFeatures: DerivedClassFeature[] = [];
  const effects: CharacterRuleEffect[] = [];
  const spellcastingProviders: SpellcastingProviderGrant[] = [];
  const spellGrants: SpellcastingSpellGrant[] = [];
  const resources: ClassResourceDefinition[] = [];
  const resourceConsumers: ResourceConsumerGrant[] = [];
  const resourceTransactions: ResourceTransactionGrant[] = [];
  const activeSelfEffects: ActiveSelfEffectGrant[] = [];

  for (const row of classContent.progression) {
    for (const feature of row.features) {
      const derived = derivedFeature(row.level, feature);
      if (row.level <= input.level) {
        acquiredFeatures.push(derived);
        effects.push(...feature.effects);
        resources.push(...(feature.resources ?? []));
        resourceConsumers.push(...(feature.resourceConsumers ?? []));
        for (const definition of feature.resourceTransactions ?? []) resourceTransactions.push({ definition, grantedBy: { contentId: feature.id, contentName: feature.name } });
        for (const definition of feature.activeSelfEffects ?? []) activeSelfEffects.push({ definition, grantedBy: { contentId: feature.id, contentName: feature.name } });
        for (const definition of feature.spellGrants ?? []) {
          if ((definition.minimumLevel ?? row.level) <= input.level) {
            spellGrants.push({ definition, grantedBy: { contentId: feature.id, contentName: feature.name } });
          }
        }
        for (const definition of feature.spellcasting ?? []) {
          spellcastingProviders.push({
            definition,
            source: classContent.source,
            grantedBy: { contentId: feature.id, contentName: feature.name },
          });
        }
      } else {
        futureFeatures.push(derived);
      }
    }
  }

  return ruleOk({
    classState: {
      id: classContent.id,
      name: classContent.name,
      source: classContent.source,
      hitDie: classContent.hitDie,
      primaryAbility: classContent.primaryAbility,
      savingThrowProficiencies: classContent.savingThrowProficiencies,
      weaponProficiencies: classContent.weaponProficiencies,
      armorTraining: classContent.armorTraining,
      toolProficiencies: classContent.toolProficiencies,
      acquiredFeatures,
      futureFeatures,
    },
    effects,
    spellcastingProviders,
    spellGrants,
    resources,
    resourceConsumers,
    resourceTransactions,
    activeSelfEffects,
  });
}
