import type { ClassContent, ClassResourceDefinition, ResourceConsumerGrant, ResourceRecoveryRule } from '../models/content';
import { ruleError, ruleOk, type RuleResult } from './result';
import type { DerivedAbilityModifiers, DerivedResource } from './types';

function maximumUsesAtLevel(
  level: number,
  definition: ClassResourceDefinition,
  abilityModifiers?: DerivedAbilityModifiers,
): RuleResult<number> {
  if (definition.maximum.kind === 'ability-modifier') {
    if ((definition.maximum.minimumLevel ?? 1) > level) return ruleOk(0);
    if (!abilityModifiers) return ruleError('missing-resource-ability', `Ability modifiers are required to derive ${definition.name}.`, definition.id);
    return ruleOk(Math.max(definition.maximum.minimum, abilityModifiers[definition.maximum.ability]));
  }

  const applicable = [...definition.maximum.values]
    .filter((entry) => entry.level <= level)
    .sort((a, b) => b.level - a.level)[0];
  return ruleOk(applicable?.uses ?? 0);
}

function recoveryAtLevel(level: number, recovery: readonly ResourceRecoveryRule[]): ResourceRecoveryRule[] {
  const byTrigger = new Map<ResourceRecoveryRule['trigger'], ResourceRecoveryRule>();
  for (const rule of recovery) {
    if ((rule.minimumLevel ?? 1) > level) continue;
    const existing = byTrigger.get(rule.trigger);
    if (!existing || (rule.minimumLevel ?? 1) >= (existing.minimumLevel ?? 1)) byTrigger.set(rule.trigger, rule);
  }
  return [...byTrigger.values()];
}

export function deriveResourceDefinitions(
  level: number,
  definitions: readonly ClassResourceDefinition[],
  consumerGrants: readonly ResourceConsumerGrant[] = [],
  abilityModifiers?: DerivedAbilityModifiers,
): RuleResult<readonly DerivedResource[]> {
  const resources: DerivedResource[] = [];

  for (const definition of definitions) {
    const maximumResult = maximumUsesAtLevel(level, definition, abilityModifiers);
    if (!maximumResult.ok) return maximumResult;
    const maximum = maximumResult.value;
    if (maximum <= 0) continue;

    const matchingConsumers = consumerGrants
      .filter((grant) => grant.resourceId === definition.id)
      .map((grant) => grant.consumer);
    if (new Set(matchingConsumers.map((consumer) => consumer.id)).size !== matchingConsumers.length) {
      return ruleError('duplicate-resource-consumer', `Duplicate resource consumer for ${definition.name}.`, definition.id);
    }

    resources.push({
      id: definition.id,
      name: definition.name,
      maximumUses: maximum,
      source: definition.source,
      recovery: recoveryAtLevel(level, definition.recovery),
      consumers: matchingConsumers,
      presentation: definition.presentation ?? 'pips',
    });
  }

  return ruleOk(resources);
}

export function deriveClassResources(
  level: number,
  classContent: ClassContent,
  consumerGrants: readonly ResourceConsumerGrant[] = [],
  abilityModifiers?: DerivedAbilityModifiers,
): RuleResult<readonly DerivedResource[]> {
  return deriveResourceDefinitions(level, classContent.resources, consumerGrants, abilityModifiers);
}
