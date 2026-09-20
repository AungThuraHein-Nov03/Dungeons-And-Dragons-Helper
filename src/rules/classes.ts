import type { CharacterClassProgression, CharacterInput } from '../models/character';
import type { CharacterRuleEffect, ClassContent, ClassResourceDefinition, ResourceConsumerGrant } from '../models/content';
import type { ActiveSelfEffectGrant } from './activeSelfEffects';
import { getSingleClassProgression } from './characterProgression';
import type { ContentRegistry } from '../services/contentRegistry';
import { ruleError, ruleOk, type RuleResult } from './result';
import type { SpellcastingProviderGrant, SpellcastingSpellGrant } from './spellcasting';
import type { ResourceTransactionGrant } from './resourceTransactions';
import type { DerivedClassFeature, DerivedClassState } from './types';

function derivedFeature(
  level: number,
  feature: ClassContent['progression'][number]['features'][number],
  classContent: ClassContent,
  classLevel: number,
): DerivedClassFeature {
  return {
    id: feature.id,
    level,
    name: feature.name,
    description: feature.description,
    owner: {
      classId: classContent.id,
      className: classContent.name,
      classLevel,
    },
    automatedEffects: feature.effects,
    referenceEffects: feature.referenceEffects,
  };
}

export function deriveClassProgressionState(
  progression: CharacterClassProgression,
  isStartingClass: boolean,
  registry: ContentRegistry,
): RuleResult<DerivedClassState> {
  const classContent = registry.findClass(progression.classId);
  if (!classContent) return ruleError('missing-class', `Character class could not be resolved: ${progression.classId}`, progression.classId);

  const acquiredFeatures: DerivedClassFeature[] = [];
  const futureFeatures: DerivedClassFeature[] = [];
  for (const row of classContent.progression) {
    for (const feature of row.features) {
      const derived = derivedFeature(row.level, feature, classContent, progression.level);
      if (row.level <= progression.level) acquiredFeatures.push(derived);
      else futureFeatures.push(derived);
    }
  }

  return ruleOk({
    id: classContent.id,
    name: classContent.name,
    source: classContent.source,
    classLevel: progression.level,
    isStartingClass,
    hitDie: classContent.hitDie,
    primaryAbility: classContent.primaryAbility,
    savingThrowProficiencies: classContent.savingThrowProficiencies,
    weaponProficiencies: classContent.weaponProficiencies,
    armorTraining: classContent.armorTraining,
    toolProficiencies: classContent.toolProficiencies,
    acquiredFeatures,
    futureFeatures,
  });
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
  const single = getSingleClassProgression(input);
  if (!single.ok) return single;
  const progression = single.value;
  const classContent = registry.findClass(progression.classId);
  if (!classContent) return ruleError('missing-class', `Character class could not be resolved: ${progression.classId}`, progression.classId);
  const classState = deriveClassProgressionState(progression, progression.classId === input.startingClassId, registry);
  if (!classState.ok) return classState;

  const effects: CharacterRuleEffect[] = [];
  const spellcastingProviders: SpellcastingProviderGrant[] = [];
  const spellGrants: SpellcastingSpellGrant[] = [];
  const resources: ClassResourceDefinition[] = [];
  const resourceConsumers: ResourceConsumerGrant[] = [];
  const resourceTransactions: ResourceTransactionGrant[] = [];
  const activeSelfEffects: ActiveSelfEffectGrant[] = [];

  for (const row of classContent.progression) {
    if (row.level > progression.level) continue;
    for (const feature of row.features) {
      effects.push(...feature.effects);
      resources.push(...(feature.resources ?? []));
      resourceConsumers.push(...(feature.resourceConsumers ?? []));
      for (const definition of feature.resourceTransactions ?? []) resourceTransactions.push({ definition, grantedBy: { contentId: feature.id, contentName: feature.name } });
      for (const definition of feature.activeSelfEffects ?? []) activeSelfEffects.push({ definition, grantedBy: { contentId: feature.id, contentName: feature.name } });
      for (const definition of feature.spellGrants ?? []) {
        if ((definition.minimumLevel ?? row.level) <= progression.level) {
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
    }
  }

  return ruleOk({
    classState: classState.value,
    effects,
    spellcastingProviders,
    spellGrants,
    resources,
    resourceConsumers,
    resourceTransactions,
    activeSelfEffects,
  });
}
