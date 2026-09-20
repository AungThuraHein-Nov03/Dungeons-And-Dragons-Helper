import type { CharacterPlayState, HitDiceRemaining } from '../models/character';
import type { DieSize, ResourceRecoveryTrigger } from '../models/content';
import { ruleError, ruleOk, type RuleResult } from './result';
import type { DerivedHealth, DerivedResource, DerivedResourceConsumer } from './types';

export interface PlayStateContext {
  readonly health: DerivedHealth;
  readonly resources: readonly DerivedResource[];
}

function validNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function resourceMaximumMap(resources: readonly DerivedResource[]): Map<string, number> {
  return new Map(resources.map((resource) => [resource.id, resource.maximumUses]));
}

function hitDieMaximumMap(health: DerivedHealth): Map<DieSize, number> {
  return new Map(health.hitDice.map((pool) => [pool.die, pool.maximum]));
}

function hitDiceRecord(pools: readonly { readonly die: DieSize; readonly maximum: number }[]): HitDiceRemaining {
  return Object.fromEntries(pools.filter((pool) => pool.maximum > 0).map((pool) => [pool.die, pool.maximum])) as HitDiceRemaining;
}

function setHitDieRemaining(state: HitDiceRemaining, die: DieSize, remaining: number): HitDiceRemaining {
  const next: HitDiceRemaining = { ...state };
  if (remaining > 0) next[die] = remaining;
  else delete next[die];
  return next;
}

export function hitDiceRemainingForDie(state: CharacterPlayState, die: DieSize): number {
  return state.hitDiceRemaining[die] ?? 0;
}

export function resolveHitDiePool(
  health: DerivedHealth,
  selectedDie?: DieSize,
): RuleResult<{ readonly die: DieSize; readonly maximum: number }> {
  if (selectedDie !== undefined) {
    const selected = health.hitDice.find((pool) => pool.die === selectedDie);
    return selected
      ? ruleOk(selected)
      : ruleError('unavailable-hit-die', `No d${selectedDie} Hit Die pool is available.`);
  }
  if (health.hitDice.length === 1) return ruleOk(health.hitDice[0]);
  if (health.hitDice.length === 0) return ruleError('unavailable-hit-die', 'No Hit Die pool is available.');
  return ruleError('unavailable-hit-die', 'Select a Hit Die size when more than one Hit Die pool is available.');
}

export function initializePlayState(context: PlayStateContext): CharacterPlayState {
  return {
    currentHp: context.health.maximumHp,
    temporaryHp: 0,
    hitDiceRemaining: hitDiceRecord(context.health.hitDice),
    resourceUses: Object.fromEntries(context.resources.map((resource) => [resource.id, resource.maximumUses])),
  };
}

export function validatePlayState(state: CharacterPlayState, context: PlayStateContext): RuleResult<CharacterPlayState> {
  if (!validNonNegativeInteger(state.currentHp) || state.currentHp > context.health.maximumHp || !validNonNegativeInteger(state.temporaryHp)) {
    return ruleError('invalid-play-state', 'HP or Temporary HP state is outside its valid range.');
  }

  const hitDieMaxima = hitDieMaximumMap(context.health);
  for (const [rawDie, current] of Object.entries(state.hitDiceRemaining)) {
    const die = Number(rawDie) as DieSize;
    const maximum = hitDieMaxima.get(die);
    if (maximum === undefined || !validNonNegativeInteger(current) || current > maximum) {
      return ruleError('invalid-play-state', `Hit Dice state is invalid for d${rawDie}.`);
    }
  }

  const maxima = resourceMaximumMap(context.resources);
  for (const [resourceId, current] of Object.entries(state.resourceUses)) {
    const maximum = maxima.get(resourceId);
    if (maximum === undefined || !validNonNegativeInteger(current) || current > maximum) {
      return ruleError('invalid-play-state', `Resource state is invalid for ${resourceId}.`, resourceId);
    }
  }
  for (const resource of context.resources) {
    if (!validNonNegativeInteger(state.resourceUses[resource.id] ?? Number.NaN)) {
      return ruleError('invalid-play-state', `Resource state is missing for ${resource.name}.`, resource.id);
    }
  }
  return ruleOk(state);
}

export function normalizePlayState(state: CharacterPlayState, context: PlayStateContext): CharacterPlayState {
  const hitDiceRemaining: HitDiceRemaining = {};
  for (const pool of context.health.hitDice) {
    const current = state.hitDiceRemaining[pool.die] ?? 0;
    const normalized = Math.min(Math.max(0, current), pool.maximum);
    if (normalized > 0) hitDiceRemaining[pool.die] = normalized;
  }

  return {
    currentHp: Math.min(state.currentHp, context.health.maximumHp),
    temporaryHp: state.temporaryHp,
    hitDiceRemaining,
    resourceUses: Object.fromEntries(
      context.resources.map((resource) => [
        resource.id,
        Math.min(state.resourceUses[resource.id] ?? resource.maximumUses, resource.maximumUses),
      ]),
    ),
  };
}

export function reconcilePlayState(
  previous: CharacterPlayState,
  previousContext: PlayStateContext,
  nextContext: PlayStateContext,
): CharacterPlayState {
  const resourceUses: Record<string, number> = {};
  const previousResourceIds = new Set(previousContext.resources.map((resource) => resource.id));

  for (const resource of nextContext.resources) {
    resourceUses[resource.id] = previousResourceIds.has(resource.id)
      ? Math.min(previous.resourceUses[resource.id] ?? 0, resource.maximumUses)
      : resource.maximumUses;
  }

  const hitDiceRemaining: HitDiceRemaining = {};
  if (previousContext.health.hitDice.length === 1 && nextContext.health.hitDice.length === 1) {
    const previousPool = previousContext.health.hitDice[0];
    const nextPool = nextContext.health.hitDice[0];
    const previousRemaining = previous.hitDiceRemaining[previousPool.die] ?? 0;
    const delta = Math.max(0, nextPool.maximum - previousPool.maximum);
    const remaining = Math.min(nextPool.maximum, Math.max(0, previousRemaining) + delta);
    if (remaining > 0) hitDiceRemaining[nextPool.die] = remaining;
  } else {
    const previousMaxima = hitDieMaximumMap(previousContext.health);
    for (const pool of nextContext.health.hitDice) {
      const previousMaximum = previousMaxima.get(pool.die) ?? 0;
      const previousRemaining = previous.hitDiceRemaining[pool.die] ?? 0;
      const delta = Math.max(0, pool.maximum - previousMaximum);
      const remaining = Math.min(pool.maximum, Math.max(0, previousRemaining) + delta);
      if (remaining > 0) hitDiceRemaining[pool.die] = remaining;
    }
  }

  return {
    currentHp: Math.min(Math.max(0, previous.currentHp), nextContext.health.maximumHp),
    temporaryHp: Math.max(0, previous.temporaryHp),
    hitDiceRemaining,
    resourceUses,
  };
}

function validatePositiveAmount(amount: number, label: string): RuleResult<number> {
  return Number.isInteger(amount) && amount > 0
    ? ruleOk(amount)
    : ruleError('invalid-amount', `${label} must be a positive whole number.`);
}

export function applyDamage(state: CharacterPlayState, amount: number): RuleResult<CharacterPlayState> {
  const valid = validatePositiveAmount(amount, 'Damage');
  if (!valid.ok) return valid;
  const absorbed = Math.min(state.temporaryHp, amount);
  const remainingDamage = amount - absorbed;
  return ruleOk({
    ...state,
    temporaryHp: state.temporaryHp - absorbed,
    currentHp: Math.max(0, state.currentHp - remainingDamage),
  });
}

export function applyHealing(state: CharacterPlayState, amount: number, maximumHp: number): RuleResult<CharacterPlayState> {
  const valid = validatePositiveAmount(amount, 'Healing');
  if (!valid.ok) return valid;
  return ruleOk({ ...state, currentHp: Math.min(maximumHp, state.currentHp + amount) });
}

export type TemporaryHpDecision = 'replace' | 'keep';

export function setTemporaryHp(
  state: CharacterPlayState,
  amount: number,
  decision: TemporaryHpDecision = 'replace',
): RuleResult<CharacterPlayState> {
  if (!validNonNegativeInteger(amount)) return ruleError('invalid-amount', 'Temporary HP must be a non-negative whole number.');
  if (decision === 'keep' && state.temporaryHp > 0 && amount > 0) return ruleOk(state);
  return ruleOk({ ...state, temporaryHp: amount });
}

export function spendHitDie(
  state: CharacterPlayState,
  die: DieSize,
  roll: number,
  constitutionModifier: number,
  health: DerivedHealth,
): RuleResult<CharacterPlayState> {
  if (state.currentHp < 1) return ruleError('rest-unavailable', 'A Short Rest requires at least 1 Hit Point.');
  const pool = health.hitDice.find((candidate) => candidate.die === die);
  if (!pool) return ruleError('unavailable-hit-die', `No d${die} Hit Die pool is available.`);
  const remaining = state.hitDiceRemaining[die] ?? 0;
  if (remaining <= 0) return ruleError('unavailable-hit-die', `No d${die} Hit Dice remain to spend.`);
  if (!Number.isInteger(roll) || roll < 1 || roll > die) {
    return ruleError('invalid-hit-die-roll', `Hit Die result must be a whole number from 1 to ${die}.`);
  }
  const healing = Math.max(1, roll + constitutionModifier);
  return ruleOk({
    ...state,
    hitDiceRemaining: setHitDieRemaining(state.hitDiceRemaining, die, remaining - 1),
    currentHp: Math.min(health.maximumHp, state.currentHp + healing),
  });
}

function findResource(resources: readonly DerivedResource[], resourceId: string): RuleResult<DerivedResource> {
  const resource = resources.find((candidate) => candidate.id === resourceId);
  return resource ? ruleOk(resource) : ruleError('unknown-resource', `Unknown resource: ${resourceId}`, resourceId);
}

export function restoreResource(
  state: CharacterPlayState,
  resourceId: string,
  resources: readonly DerivedResource[],
  amount: number,
): RuleResult<CharacterPlayState> {
  const found = findResource(resources, resourceId);
  if (!found.ok) return found;
  const valid = validatePositiveAmount(amount, 'Resource restoration');
  if (!valid.ok) return valid;
  const current = state.resourceUses[resourceId];
  if (!validNonNegativeInteger(current)) return ruleError('invalid-play-state', `Resource state is missing for ${found.value.name}.`, resourceId);
  if (current >= found.value.maximumUses) return ruleError('resource-full', `${found.value.name} is already full.`, resourceId);
  return ruleOk({ ...state, resourceUses: { ...state.resourceUses, [resourceId]: Math.min(found.value.maximumUses, current + amount) } });
}

export function expendResource(
  state: CharacterPlayState,
  resourceId: string,
  resources: readonly DerivedResource[],
  amount = 1,
): RuleResult<CharacterPlayState> {
  const found = findResource(resources, resourceId);
  if (!found.ok) return found;
  const valid = validatePositiveAmount(amount, 'Resource expenditure');
  if (!valid.ok) return valid;
  const current = state.resourceUses[resourceId] ?? 0;
  if (current < amount) return ruleError('resource-depleted', `${found.value.name} does not have ${amount} remaining.`, resourceId);
  return ruleOk({ ...state, resourceUses: { ...state.resourceUses, [resourceId]: current - amount } });
}

function recoverResources(
  state: CharacterPlayState,
  resources: readonly DerivedResource[],
  trigger: ResourceRecoveryTrigger,
): CharacterPlayState {
  const resourceUses = { ...state.resourceUses };
  for (const resource of resources) {
    const recovery = resource.recovery.find((rule) => rule.trigger === trigger);
    if (!recovery) continue;
    const current = resourceUses[resource.id] ?? 0;
    resourceUses[resource.id] = recovery.mode === 'all'
      ? resource.maximumUses
      : Math.min(resource.maximumUses, current + recovery.amount);
  }
  return { ...state, resourceUses };
}

export function finishShortRest(state: CharacterPlayState, resources: readonly DerivedResource[]): RuleResult<CharacterPlayState> {
  if (state.currentHp < 1) return ruleError('rest-unavailable', 'A Short Rest requires at least 1 Hit Point.');
  return ruleOk(recoverResources(state, resources, 'short-rest'));
}

export function finishLongRest(state: CharacterPlayState, context: PlayStateContext): RuleResult<CharacterPlayState> {
  if (state.currentHp < 1) return ruleError('rest-unavailable', 'A Long Rest requires at least 1 Hit Point.');
  const recovered = recoverResources(state, context.resources, 'long-rest');
  return ruleOk({
    ...recovered,
    currentHp: context.health.maximumHp,
    temporaryHp: 0,
    hitDiceRemaining: hitDiceRecord(context.health.hitDice),
  });
}

export function consumeResourceConsumer(
  state: CharacterPlayState,
  resourceId: string,
  consumerId: string,
  resources: readonly DerivedResource[],
  options: { readonly manualRoll?: number; readonly expenditureAmount?: number; readonly classLevel: number; readonly maximumHp: number },
): RuleResult<CharacterPlayState> {
  const found = findResource(resources, resourceId);
  if (!found.ok) return found;
  const consumer: DerivedResourceConsumer | undefined = found.value.consumers.find((candidate) => candidate.id === consumerId);
  if (!consumer) return ruleError('unknown-resource-consumer', `Unknown use of ${found.value.name}.`, consumerId);

  if (consumer.effect.type === 'manual-healing') {
    const roll = options.manualRoll;
    if (!Number.isInteger(roll) || roll === undefined || roll < 1 || roll > consumer.effect.die) {
      return ruleError('invalid-amount', `${consumer.name} roll must be a whole number from 1 to ${consumer.effect.die}.`);
    }
    const spent = expendResource(state, resourceId, resources);
    if (!spent.ok) return spent;
    const bonus = consumer.effect.bonus === 'class-level' ? options.classLevel : 0;
    return ruleOk({ ...spent.value, currentHp: Math.min(options.maximumHp, spent.value.currentHp + roll + bonus) });
  }

  if (consumer.effect.type === 'variable-expend') {
    if (options.expenditureAmount === undefined) return ruleError('invalid-amount', `${consumer.name} requires an expenditure amount.`, consumer.id);
    return expendResource(state, resourceId, resources, options.expenditureAmount);
  }

  if (consumer.effect.type === 'fixed-expend') {
    return expendResource(state, resourceId, resources, consumer.effect.amount);
  }

  return expendResource(state, resourceId, resources);
}
