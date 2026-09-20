import type { CharacterClassProgression, CharacterInput } from '../models/character';
import type { CharacterRuleEffect, ClassResourceDefinition, ResourceConsumerGrant, SubclassContent } from '../models/content';
import type { ActiveSelfEffectGrant } from './activeSelfEffects';
import { getSingleClassProgression } from './characterProgression';
import type { ContentRegistry } from '../services/contentRegistry';
import { ruleError, ruleOk, type RuleResult } from './result';
import type { SpellcastingProviderGrant, SpellcastingSpellGrant } from './spellcasting';
import type { ResourceTransactionGrant } from './resourceTransactions';
import type { DerivedSubclassFeature, DerivedSubclassState } from './types';

function derivedFeature(
  level: number,
  feature: SubclassContent['progression'][number]['features'][number],
  subclass: SubclassContent,
  parentClassName: string,
  parentClassLevel: number,
): DerivedSubclassFeature {
  return {
    id: feature.id,
    level,
    name: feature.name,
    description: feature.description,
    owner: {
      classId: subclass.parentClassId,
      className: parentClassName,
      classLevel: parentClassLevel,
      subclassId: subclass.id,
      subclassName: subclass.name,
    },
    automatedEffects: feature.effects,
    referenceEffects: feature.referenceEffects,
  };
}

export function deriveSubclassProgressionState(
  progression: CharacterClassProgression,
  registry: ContentRegistry,
): RuleResult<DerivedSubclassState | undefined> {
  if (!progression.subclassId) return ruleOk(undefined);

  const subclass = registry.findSubclass(progression.subclassId);
  if (!subclass) return ruleError('missing-subclass', `Character subclass could not be resolved: ${progression.subclassId}`, progression.subclassId);
  if (subclass.parentClassId !== progression.classId) return ruleError('invalid-subclass-parent', `${subclass.name} does not belong to the selected class.`, subclass.id);
  if (progression.level < subclass.acquisitionLevel) return ruleError('subclass-not-acquired', `${subclass.name} requires level ${subclass.acquisitionLevel}.`, subclass.id);

  const parentClass = registry.findClass(subclass.parentClassId);
  if (!parentClass) return ruleError('missing-class', `Subclass parent class could not be resolved: ${subclass.parentClassId}`, subclass.parentClassId);

  const acquiredFeatures: DerivedSubclassFeature[] = [];
  const futureFeatures: DerivedSubclassFeature[] = [];
  for (const row of subclass.progression) {
    for (const feature of row.features) {
      const derived = derivedFeature(row.level, feature, subclass, parentClass.name, progression.level);
      if (row.level <= progression.level) acquiredFeatures.push(derived);
      else futureFeatures.push(derived);
    }
  }

  return ruleOk({
    id: subclass.id,
    name: subclass.name,
    source: subclass.source,
    parentClassId: parentClass.id,
    parentClassName: parentClass.name,
    parentClassLevel: progression.level,
    acquisitionLevel: subclass.acquisitionLevel,
    acquiredFeatures,
    futureFeatures,
  });
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
  const single = getSingleClassProgression(input);
  if (!single.ok) return single;
  const progression = single.value;
  const subclassState = deriveSubclassProgressionState(progression, registry);
  if (!subclassState.ok) return subclassState;
  if (!subclassState.value) return ruleOk({ effects: [], spellcastingProviders: [], spellGrants: [], resources: [], resourceConsumers: [], resourceTransactions: [], activeSelfEffects: [] });

  const subclass = registry.findSubclass(subclassState.value.id);
  if (!subclass) return ruleError('missing-subclass', `Character subclass could not be resolved: ${subclassState.value.id}`, subclassState.value.id);

  const effects: CharacterRuleEffect[] = [];
  const spellcastingProviders: SpellcastingProviderGrant[] = [];
  const spellGrants: SpellcastingSpellGrant[] = [];
  const resources: ClassResourceDefinition[] = [];
  const resourceConsumers: ResourceConsumerGrant[] = [];
  const resourceTransactions: ResourceTransactionGrant[] = [];
  const activeSelfEffects: ActiveSelfEffectGrant[] = [];
  for (const row of subclass.progression) {
    if (row.level > progression.level) continue;
    for (const feature of row.features) {
      effects.push(...feature.effects);
      resources.push(...(feature.resources ?? []));
      resourceConsumers.push(...(feature.resourceConsumers ?? []));
      for (const definition of feature.resourceTransactions ?? []) resourceTransactions.push({ definition, grantedBy: { contentId: feature.id, contentName: feature.name } });
      for (const definition of feature.activeSelfEffects ?? []) activeSelfEffects.push({ definition, grantedBy: { contentId: feature.id, contentName: feature.name } });
      for (const definition of feature.spellGrants ?? []) {
        if ((definition.minimumLevel ?? row.level) <= progression.level) spellGrants.push({ definition, grantedBy: { contentId: feature.id, contentName: feature.name } });
      }
      for (const definition of feature.spellcasting ?? []) {
        spellcastingProviders.push({ definition, source: subclass.source, grantedBy: { contentId: feature.id, contentName: feature.name } });
      }
    }
  }

  return ruleOk({
    subclass: subclassState.value,
    effects,
    spellcastingProviders,
    spellGrants,
    resources,
    resourceConsumers,
    resourceTransactions,
    activeSelfEffects,
  });
}
