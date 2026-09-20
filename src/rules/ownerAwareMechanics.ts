import type {
  ClassFeatureContent,
  ClassResourceDefinition,
  ResourceConsumerGrant,
  SubclassFeatureContent,
} from '../models/content';
import type { ContentRegistry } from '../services/contentRegistry';
import { deriveActiveSelfEffects, type ActiveSelfEffectGrant } from './activeSelfEffects';
import { deriveResourceDefinitions } from './resources';
import { deriveResourceTransactions, type ResourceTransactionGrant } from './resourceTransactions';
import { ruleError, ruleOk, type RuleResult } from './result';
import type {
  DerivedAbilityModifiers,
  DerivedActiveSelfEffect,
  DerivedClassState,
  DerivedMechanicalOwner,
  DerivedResource,
  DerivedResourceTransaction,
  DerivedRuleEffectSource,
  DerivedSpellcastingProvider,
} from './types';

interface OwnerFeaturePackage {
  readonly classState: DerivedClassState;
  readonly classOwner: Extract<DerivedMechanicalOwner, { kind: 'class' }>;
  readonly subclassOwner?: Extract<DerivedMechanicalOwner, { kind: 'subclass' }>;
  readonly classFeatures: readonly ClassFeatureContent[];
  readonly subclassFeatures: readonly SubclassFeatureContent[];
  readonly classResourceDefinitions: readonly ClassResourceDefinition[];
  readonly subclassResourceDefinitions: readonly ClassResourceDefinition[];
}

export interface DerivedOwnerAwareMechanics {
  readonly ruleEffectSources: readonly DerivedRuleEffectSource[];
  readonly resources: readonly DerivedResource[];
  readonly resourceTransactions: readonly DerivedResourceTransaction[];
  readonly activeSelfEffects: readonly DerivedActiveSelfEffect[];
}

function classOwner(state: DerivedClassState): Extract<DerivedMechanicalOwner, { kind: 'class' }> {
  return {
    kind: 'class',
    level: state.classLevel,
    classId: state.id,
    className: state.name,
  };
}

function subclassOwner(state: DerivedClassState): Extract<DerivedMechanicalOwner, { kind: 'subclass' }> | undefined {
  const subclass = state.subclass;
  if (!subclass) return undefined;
  return {
    kind: 'subclass',
    level: subclass.parentClassLevel,
    classId: state.id,
    className: state.name,
    subclassId: subclass.id,
    subclassName: subclass.name,
  };
}

function acquiredClassFeatures(state: DerivedClassState, registry: ContentRegistry): RuleResult<readonly ClassFeatureContent[]> {
  const content = registry.findClass(state.id);
  if (!content) return ruleError('missing-class', `Character class could not be resolved: ${state.id}`, state.id);
  return ruleOk(content.progression
    .filter((row) => row.level <= state.classLevel)
    .flatMap((row) => row.features));
}

function acquiredSubclassFeatures(state: DerivedClassState, registry: ContentRegistry): RuleResult<readonly SubclassFeatureContent[]> {
  if (!state.subclass) return ruleOk([]);
  const content = registry.findSubclass(state.subclass.id);
  if (!content) return ruleError('missing-subclass', `Character subclass could not be resolved: ${state.subclass.id}`, state.subclass.id);
  if (content.parentClassId !== state.id) return ruleError('invalid-subclass-parent', `${content.name} does not belong to ${state.name}.`, content.id);
  return ruleOk(content.progression
    .filter((row) => row.level <= state.classLevel)
    .flatMap((row) => row.features));
}

function featurePackages(
  states: readonly DerivedClassState[],
  registry: ContentRegistry,
): RuleResult<readonly OwnerFeaturePackage[]> {
  const packages: OwnerFeaturePackage[] = [];
  for (const state of states) {
    const classContent = registry.findClass(state.id);
    if (!classContent) return ruleError('missing-class', `Character class could not be resolved: ${state.id}`, state.id);
    const classFeatures = acquiredClassFeatures(state, registry);
    if (!classFeatures.ok) return classFeatures;
    const subclassFeatures = acquiredSubclassFeatures(state, registry);
    if (!subclassFeatures.ok) return subclassFeatures;
    const ownedSubclass = subclassOwner(state);
    packages.push({
      classState: state,
      classOwner: classOwner(state),
      ...(ownedSubclass ? { subclassOwner: ownedSubclass } : {}),
      classFeatures: classFeatures.value,
      subclassFeatures: subclassFeatures.value,
      classResourceDefinitions: [
        ...classContent.resources,
        ...classFeatures.value.flatMap((feature) => feature.resources ?? []),
      ],
      subclassResourceDefinitions: subclassFeatures.value.flatMap((feature) => feature.resources ?? []),
    });
  }
  return ruleOk(packages);
}

function combineResources(groups: readonly (readonly DerivedResource[])[]): RuleResult<readonly DerivedResource[]> {
  const resources: DerivedResource[] = [];
  const ids = new Set<string>();
  for (const group of groups) {
    for (const resource of group) {
      if (ids.has(resource.id)) return ruleError('duplicate-resource', `Duplicate derived resource id: ${resource.id}`, resource.id);
      ids.add(resource.id);
      resources.push(resource);
    }
  }
  return ruleOk(resources);
}

export function deriveOwnerAwareMechanics(
  states: readonly DerivedClassState[],
  registry: ContentRegistry,
  abilityModifiers: DerivedAbilityModifiers,
  characterLevel: number,
  spellcastingProviders: readonly DerivedSpellcastingProvider[] = [],
): RuleResult<DerivedOwnerAwareMechanics> {
  const packages = featurePackages(states, registry);
  if (!packages.ok) return packages;

  const allConsumerGrants: ResourceConsumerGrant[] = packages.value.flatMap((entry) => [
    ...entry.classFeatures.flatMap((feature) => feature.resourceConsumers ?? []),
    ...entry.subclassFeatures.flatMap((feature) => feature.resourceConsumers ?? []),
  ]);

  const resourceGroups: DerivedResource[][] = [];
  const ruleEffectSources: DerivedRuleEffectSource[] = [];
  const transactionGrants: ResourceTransactionGrant[] = [];
  const activeEffectGrants: ActiveSelfEffectGrant[] = [];

  for (const entry of packages.value) {
    const classResources = deriveResourceDefinitions(
      entry.classState.classLevel,
      entry.classResourceDefinitions,
      allConsumerGrants,
      abilityModifiers,
      entry.classOwner,
    );
    if (!classResources.ok) return classResources;
    resourceGroups.push([...classResources.value]);

    if (entry.subclassResourceDefinitions.length > 0 && entry.subclassOwner) {
      const subclassResources = deriveResourceDefinitions(
        entry.classState.classLevel,
        entry.subclassResourceDefinitions,
        allConsumerGrants,
        abilityModifiers,
        entry.subclassOwner,
      );
      if (!subclassResources.ok) return subclassResources;
      resourceGroups.push([...subclassResources.value]);
    }

    for (const feature of entry.classFeatures) {
      if (feature.effects.length > 0) {
        ruleEffectSources.push({
          contentId: feature.id,
          name: feature.name,
          effects: feature.effects,
          owner: entry.classOwner,
        });
      }
      for (const definition of feature.resourceTransactions ?? []) {
        transactionGrants.push({
          definition,
          grantedBy: { contentId: feature.id, contentName: feature.name },
          owner: entry.classOwner,
        });
      }
      for (const definition of feature.activeSelfEffects ?? []) {
        activeEffectGrants.push({
          definition,
          grantedBy: { contentId: feature.id, contentName: feature.name },
          owner: entry.classOwner,
        });
      }
    }

    if (entry.subclassOwner) {
      for (const feature of entry.subclassFeatures) {
        if (feature.effects.length > 0) {
          ruleEffectSources.push({
            contentId: feature.id,
            name: feature.name,
            effects: feature.effects,
            owner: entry.subclassOwner,
          });
        }
        for (const definition of feature.resourceTransactions ?? []) {
          transactionGrants.push({
            definition,
            grantedBy: { contentId: feature.id, contentName: feature.name },
            owner: entry.subclassOwner,
          });
        }
        for (const definition of feature.activeSelfEffects ?? []) {
          activeEffectGrants.push({
            definition,
            grantedBy: { contentId: feature.id, contentName: feature.name },
            owner: entry.subclassOwner,
          });
        }
      }
    }
  }

  const resources = combineResources(resourceGroups);
  if (!resources.ok) return resources;
  const activeSelfEffects = deriveActiveSelfEffects(activeEffectGrants);
  if (!activeSelfEffects.ok) return activeSelfEffects;
  const resourceTransactions = deriveResourceTransactions(characterLevel, transactionGrants, resources.value, spellcastingProviders);
  if (!resourceTransactions.ok) return resourceTransactions;

  return ruleOk({
    ruleEffectSources,
    resources: resources.value,
    resourceTransactions: resourceTransactions.value,
    activeSelfEffects: activeSelfEffects.value,
  });
}
