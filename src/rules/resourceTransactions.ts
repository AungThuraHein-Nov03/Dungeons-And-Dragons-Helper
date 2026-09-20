import type { CharacterPlayState } from '../models/character';
import type { ContentId } from '../models/contentId';
import type { ResourceTransactionBudgetRule, ResourceTransactionDefinition } from '../models/content';
import { expendResource, finishShortRest, restoreResource } from './playState';
import { ruleError, ruleOk, type RuleResult } from './result';
import type { DerivedMechanicalOwner, DerivedResource, DerivedResourceTransaction, DerivedSpellcastingProvider } from './types';

export interface ResourceTransactionGrant {
  readonly definition: ResourceTransactionDefinition;
  readonly grantedBy: { readonly contentId: ContentId; readonly contentName: string };
  readonly owner?: DerivedMechanicalOwner;
}

export type ResourceTransactionRequest =
  | { readonly kind: 'restore-resource'; readonly amount?: number }
  | {
      readonly kind: 'restore-spell-slots-with-budget';
      readonly selections: readonly { readonly resourceId: ContentId; readonly amount: number }[];
    };

export function deriveTransactionBudget(level: number, definition: ResourceTransactionBudgetRule): number {
  if (definition.kind !== 'half-level-round-up') return 0;
  return Math.ceil(level / 2);
}

export function deriveResourceTransactions(
  level: number,
  grants: readonly ResourceTransactionGrant[],
  resources: readonly DerivedResource[],
  providers: readonly DerivedSpellcastingProvider[],
): RuleResult<readonly DerivedResourceTransaction[]> {
  const transactions: DerivedResourceTransaction[] = [];
  const ids = new Set<ContentId>();

  for (const grant of grants) {
    const definition = grant.definition;
    if (ids.has(definition.id)) return ruleError('invalid-resource-transaction', `Duplicate resource transaction: ${definition.id}`, definition.id);
    ids.add(definition.id);

    const usageResource = definition.usageResourceId
      ? resources.find((resource) => resource.id === definition.usageResourceId)
      : undefined;
    if (definition.usageResourceId && !usageResource) {
      return ruleError('invalid-resource-transaction', `${definition.name} references an inactive usage resource.`, definition.usageResourceId);
    }

    if (definition.kind === 'restore-resource') {
      const target = resources.find((resource) => resource.id === definition.targetResourceId);
      if (!target) return ruleError('invalid-resource-transaction', `${definition.name} references an inactive target resource.`, definition.targetResourceId);
      transactions.push({
        id: definition.id,
        name: definition.name,
        kind: definition.kind,
        targetResource: { id: target.id, name: target.name, maximumUses: target.maximumUses },
        restore: definition.restore,
        ...(definition.usageResourceId ? { usageResourceId: definition.usageResourceId } : {}),
        grantedBy: grant.grantedBy,
        ...(grant.owner ? { owner: grant.owner } : {}),
      });
      continue;
    }

    const provider = providers.find((candidate) => candidate.id === definition.providerId);
    if (!provider?.slotPool) {
      return ruleError('invalid-resource-transaction', `${definition.name} requires an active Spellcasting provider with spell slots.`, definition.providerId);
    }
    const slots = provider.slotPool.slots
      .filter((slot) => slot.spellLevel <= definition.maximumSpellLevel)
      .map((slot) => ({ ...slot }));
    if (slots.length === 0) {
      return ruleError('invalid-resource-transaction', `${definition.name} has no eligible spell-slot resources.`, definition.id);
    }
    transactions.push({
      id: definition.id,
      name: definition.name,
      kind: definition.kind,
      providerId: provider.id,
      providerName: provider.name,
      usageResourceId: definition.usageResourceId,
      budget: deriveTransactionBudget(grant.owner?.level ?? level, definition.budget),
      maximumSpellLevel: definition.maximumSpellLevel,
      timing: definition.timing,
      slots,
      grantedBy: grant.grantedBy,
      ...(grant.owner ? { owner: grant.owner } : {}),
    });
  }

  return ruleOk(transactions);
}

function usageAvailable(
  state: CharacterPlayState,
  resources: readonly DerivedResource[],
  transaction: DerivedResourceTransaction,
): RuleResult<true> {
  if (!transaction.usageResourceId) return ruleOk(true);
  const resource = resources.find((candidate) => candidate.id === transaction.usageResourceId);
  if (!resource) return ruleError('resource-transaction-unavailable', `${transaction.name} usage resource is inactive.`, transaction.usageResourceId);
  const current = state.resourceUses[resource.id];
  if (!Number.isInteger(current) || current < 0) return ruleError('invalid-play-state', `Resource state is missing for ${resource.name}.`, resource.id);
  if (current <= 0) return ruleError('resource-transaction-unavailable', `${transaction.name} has no uses remaining.`, resource.id);
  return ruleOk(true);
}

export function executeResourceTransaction(
  state: CharacterPlayState,
  transaction: DerivedResourceTransaction,
  resources: readonly DerivedResource[],
  request: ResourceTransactionRequest,
): RuleResult<CharacterPlayState> {
  if (request.kind !== transaction.kind) return ruleError('invalid-resource-transaction', 'Resource transaction request kind does not match the selected action.', transaction.id);
  const available = usageAvailable(state, resources, transaction);
  if (!available.ok) return available;

  let next = state;

  if (transaction.kind === 'restore-resource') {
    const amount = transaction.restore.kind === 'fixed' ? transaction.restore.amount : request.kind === 'restore-resource' ? request.amount : undefined;
    if (!Number.isInteger(amount) || amount === undefined || amount <= 0) {
      return ruleError('invalid-amount', `${transaction.name} requires a positive whole-number restoration amount.`, transaction.id);
    }
    if (transaction.restore.kind === 'selected' && amount > transaction.restore.maximum) {
      return ruleError('invalid-resource-transaction', `${transaction.name} cannot restore more than ${transaction.restore.maximum} in one transaction.`, transaction.id);
    }
    const restored = restoreResource(next, transaction.targetResource.id, resources, amount);
    if (!restored.ok) return restored;
    next = restored.value;
  } else {
    if (request.kind !== 'restore-spell-slots-with-budget' || request.selections.length === 0) {
      return ruleError('invalid-resource-transaction', `${transaction.name} requires at least one spell slot to recover.`, transaction.id);
    }
    if (new Set(request.selections.map((selection) => selection.resourceId)).size !== request.selections.length) {
      return ruleError('invalid-resource-transaction', `${transaction.name} cannot contain duplicate spell-slot selections.`, transaction.id);
    }

    let weightedCost = 0;
    for (const selection of request.selections) {
      if (!Number.isInteger(selection.amount) || selection.amount <= 0) return ruleError('invalid-amount', 'Recovered spell-slot counts must be positive whole numbers.', selection.resourceId);
      const slot = transaction.slots.find((candidate) => candidate.resourceId === selection.resourceId);
      if (!slot) return ruleError('invalid-resource-transaction', `${transaction.name} cannot recover the selected spell-slot resource.`, selection.resourceId);
      const current = state.resourceUses[slot.resourceId];
      if (!Number.isInteger(current) || current < 0) return ruleError('invalid-play-state', `Spell-slot state is missing for ${slot.name}.`, slot.resourceId);
      const expended = slot.maximumUses - current;
      if (expended <= 0) return ruleError('resource-full', `${slot.name} has no expended slots to recover.`, slot.resourceId);
      if (selection.amount > expended) return ruleError('invalid-resource-transaction', `Only ${expended} expended ${slot.name} can be recovered.`, slot.resourceId);
      weightedCost += slot.spellLevel * selection.amount;
    }
    if (weightedCost > transaction.budget) {
      return ruleError('invalid-resource-transaction', `${transaction.name} selection costs ${weightedCost}, exceeding its recovery budget of ${transaction.budget}.`, transaction.id);
    }

    if (transaction.timing === 'short-rest') {
      const rested = finishShortRest(next, resources);
      if (!rested.ok) return rested;
      next = rested.value;
    }
    for (const selection of request.selections) {
      const restored = restoreResource(next, selection.resourceId, resources, selection.amount);
      if (!restored.ok) return restored;
      next = restored.value;
    }
  }

  if (transaction.usageResourceId) {
    const spent = expendResource(next, transaction.usageResourceId, resources, 1);
    if (!spent.ok) return spent;
    next = spent.value;
  }
  return ruleOk(next);
}
