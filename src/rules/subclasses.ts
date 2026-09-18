import type { CharacterInput } from '../models/character';
import type { CharacterRuleEffect, ClassResourceDefinition, ResourceConsumerGrant, SubclassContent } from '../models/content';
import type { ActiveSelfEffectGrant } from './activeSelfEffects';
import type { ContentRegistry } from '../services/contentRegistry';
import { ruleError, ruleOk, type RuleResult } from './result';
import type { SpellcastingProviderGrant, SpellcastingSpellGrant } from './spellcasting';
import type { ResourceTransactionGrant } from './resourceTransactions';
import type { DerivedSubclassFeature, DerivedSubclassState } from './types';

function derivedFeature(level: number, feature: SubclassContent['progression'][number]['features'][number]): DerivedSubclassFeature {
  return {
    id: feature.id,
    level,
    name: feature.name,
    description: feature.description,
    automatedEffects: feature.effects,
    referenceEffects: feature.referenceEffects,
  };
}

export interface DerivedSubclassCollection {
  readonly subclass?: DerivedSubclassState;
  readonly effects: readonly CharacterRuleEffect[];
  readonly spellcastingProviders: readonly SpellcastingProviderGrant[];
  readonly spellGrants: readonly SpellcastingSpellGrant[];
  readonly resources: readonly ClassResourceDefinition[];
  readonly resourceConsumers: readonly ResourceConsumerGrant[];
  readonly resourceTransactions: readonly ResourceTransactionGrant[];
  readonly activeSelfEffects: readonly ActiveSelfEffectGrant[];
}

export function deriveCharacterSubclass(input: CharacterInput, registry: ContentRegistry): RuleResult<DerivedSubclassCollection> {
  if (!input.subclassId) return ruleOk({ effects: [], spellcastingProviders: [], spellGrants: [], resources: [], resourceConsumers: [], resourceTransactions: [], activeSelfEffects: [] });
  const subclass = registry.findSubclass(input.subclassId);
  if (!subclass) return ruleError('missing-subclass', `Character subclass could not be resolved: ${input.subclassId}`, input.subclassId);
  if (subclass.parentClassId !== input.classId) return ruleError('invalid-subclass-parent', `${subclass.name} does not belong to the selected class.`, subclass.id);
  if (input.level < subclass.acquisitionLevel) return ruleError('subclass-not-acquired', `${subclass.name} requires level ${subclass.acquisitionLevel}.`, subclass.id);
  const parentClass = registry.findClass(subclass.parentClassId);
  if (!parentClass) return ruleError('missing-class', `Subclass parent class could not be resolved: ${subclass.parentClassId}`, subclass.parentClassId);

  const acquiredFeatures: DerivedSubclassFeature[] = [];
  const futureFeatures: DerivedSubclassFeature[] = [];
  const effects: CharacterRuleEffect[] = [];
  const spellcastingProviders: SpellcastingProviderGrant[] = [];
  const spellGrants: SpellcastingSpellGrant[] = [];
  const resources: ClassResourceDefinition[] = [];
  const resourceConsumers: ResourceConsumerGrant[] = [];
  const resourceTransactions: ResourceTransactionGrant[] = [];
  const activeSelfEffects: ActiveSelfEffectGrant[] = [];
  for (const row of subclass.progression) {
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
          if ((definition.minimumLevel ?? row.level) <= input.level) spellGrants.push({ definition, grantedBy: { contentId: feature.id, contentName: feature.name } });
        }
        for (const definition of feature.spellcasting ?? []) {
          spellcastingProviders.push({ definition, source: subclass.source, grantedBy: { contentId: feature.id, contentName: feature.name } });
        }
      } else futureFeatures.push(derived);
    }
  }

  return ruleOk({
    subclass: {
      id: subclass.id,
      name: subclass.name,
      source: subclass.source,
      parentClassId: parentClass.id,
      parentClassName: parentClass.name,
      acquisitionLevel: subclass.acquisitionLevel,
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
