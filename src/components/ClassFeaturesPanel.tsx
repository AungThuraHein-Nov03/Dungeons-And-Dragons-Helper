import { useState } from 'react';
import type { Character } from '../models/character';
import { activeSelfEffectEligibilityError } from '../rules/activeSelfEffects';
import type { ResourceTransactionRequest } from '../rules/resourceTransactions';
import type { DerivedCharacterState, DerivedResourceTransaction } from '../rules/types';
import type { PlaySessionState } from '../services/playSessionState';

interface ClassFeaturesPanelProps {
  character: Character;
  state: DerivedCharacterState;
  sessionState: PlaySessionState;
  onActivateEffect: (effectId: string) => void;
  onRollHealing: (resourceId: string, consumerId: string) => void;
  onUse: (resourceId: string, consumerId: string, amount?: number) => void;
  onTransaction: (transactionId: string, request: ResourceTransactionRequest) => void;
}

function wholeNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function activationType(timing: DerivedCharacterState['activeSelfEffects'][number]['activationTiming']): string {
  if (timing === 'bonus-action') return 'Bonus Action';
  if (timing === 'start-of-turn') return 'Start of turn';
  return 'Manual';
}

function consumerActionType(type: DerivedCharacterState['resources'][number]['consumers'][number]['effect']['type']): string {
  if (type === 'manual-healing') return 'Healing';
  if (type === 'tracking-only') return 'Conditional use';
  return 'Resource use';
}

export function ClassFeaturesPanel({
  character,
  state,
  sessionState,
  onActivateEffect,
  onRollHealing,
  onUse,
  onTransaction,
}: ClassFeaturesPanelProps) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [transactionAmounts, setTransactionAmounts] = useState<Record<string, string>>({});
  const resources = state.resources;
  const transactions = state.resourceTransactions;
  const resourceCurrent = (resourceId: string) => character.playState.resourceUses[resourceId] ?? 0;

  const clearTransactionAmounts = (transactionId: string) => {
    setTransactionAmounts((values) => Object.fromEntries(Object.entries(values).filter(([key]) => !key.startsWith(transactionId + ':'))));
  };

  const renderTransaction = (transaction: DerivedResourceTransaction) => {
    const usageResource = transaction.usageResourceId ? resources.find((resource) => resource.id === transaction.usageResourceId) : undefined;
    const usageCurrent = usageResource ? resourceCurrent(usageResource.id) : undefined;
    const usageAvailable = !transaction.usageResourceId || Boolean(usageResource) && (usageCurrent ?? 0) > 0;
    const usageLabel = transaction.usageResourceId
      ? usageResource ? `${usageCurrent} / ${usageResource.maximumUses} use${usageResource.maximumUses === 1 ? '' : 's'} remaining` : 'Usage resource unavailable'
      : 'No separate use limit';

    if (transaction.kind === 'restore-spell-slots-with-budget') {
      const eligible = transaction.slots.map((slot) => {
        const current = resourceCurrent(slot.resourceId);
        return { ...slot, current, expended: Math.max(0, slot.maximumUses - current) };
      }).filter((slot) => slot.expended > 0);

      const selections = eligible.map((slot) => {
        const key = `${transaction.id}:${slot.resourceId}`;
        const amount = wholeNumber(transactionAmounts[key] ?? '0') ?? -1;
        return { slot, key, amount };
      });
      const weightedCost = selections.reduce((total, selection) => total + Math.max(0, selection.amount) * selection.slot.spellLevel, 0);
      const validAmounts = selections.every((selection) => selection.amount >= 0 && selection.amount <= selection.slot.expended);
      const hasSelection = selections.some((selection) => selection.amount > 0);
      const withinBudget = weightedCost <= transaction.budget;
      const remainingBudget = transaction.budget - weightedCost;
      const canExecute = usageAvailable && eligible.length > 0 && validAmounts && hasSelection && withinBudget;

      return (
        <article className="class-feature-row" key={transaction.id} data-transaction-kind={transaction.kind} aria-label={`${transaction.name} class feature`}>
          <div className="class-feature-row__main">
            <div className="class-feature-row__identity">
              <h3>{transaction.name}</h3>
              <span>Recovery</span>
            </div>
            <button
              className="button button--secondary class-feature-row__primary"
              type="button"
              disabled={!canExecute}
              onClick={() => {
                onTransaction(transaction.id, {
                  kind: 'restore-spell-slots-with-budget',
                  selections: selections.filter((selection) => selection.amount > 0).map((selection) => ({ resourceId: selection.slot.resourceId, amount: selection.amount })),
                });
                clearTransactionAmounts(transaction.id);
              }}
            >
              Use {transaction.name}
            </button>
          </div>

          <div className="class-feature-row__controls">
            {eligible.length === 0 ? <small>No eligible expended spell slots to recover.</small> : eligible.map((slot) => {
              const key = `${transaction.id}:${slot.resourceId}`;
              const value = transactionAmounts[key] ?? '0';
              return (
                <label className="field compact-field" key={slot.resourceId}>
                  <span>{slot.name} · {slot.expended} expended</span>
                  <input
                    aria-label={`${transaction.name} ${slot.name} recovery count`}
                    type="number"
                    min="0"
                    max={slot.expended}
                    value={value}
                    onChange={(event) => setTransactionAmounts((values) => ({ ...values, [key]: event.target.value }))}
                  />
                </label>
              );
            })}
            {!withinBudget && <small role="status">Selection exceeds the recovery budget.</small>}
          </div>

          <details className="resource-consumer__details class-feature-row__details">
            <summary>Details</summary>
            <small>{usageLabel}</small>
            <small>Recovery budget: {transaction.budget} slot level{transaction.budget === 1 ? '' : 's'} · Maximum slot level {transaction.maximumSpellLevel}</small>
            <small>Remaining budget: {remainingBudget >= 0 ? remainingBudget : 0}</small>
            <small>Selected weighted cost: {weightedCost}{remainingBudget < 0 ? ` · Over budget by ${Math.abs(remainingBudget)}` : ''}</small>
          </details>
        </article>
      );
    }

    const target = resources.find((resource) => resource.id === transaction.targetResource.id);
    const current = target ? resourceCurrent(target.id) : 0;
    const missing = target ? Math.max(0, target.maximumUses - current) : 0;
    const key = `${transaction.id}:restore`;
    const rawAmount = transactionAmounts[key] ?? '1';
    const selectedAmount = wholeNumber(rawAmount);
    const fixedAmount = transaction.restore.kind === 'fixed' ? transaction.restore.amount : undefined;
    const maximumSelected = transaction.restore.kind === 'selected' ? Math.min(transaction.restore.maximum, missing) : missing;
    const amount = fixedAmount ?? selectedAmount;
    const validAmount = amount !== undefined && amount > 0 && (transaction.restore.kind === 'fixed' || amount <= maximumSelected);
    const canExecute = usageAvailable && Boolean(target) && missing > 0 && validAmount;

    return (
      <article className="class-feature-row" key={transaction.id} data-transaction-kind={transaction.kind} aria-label={`${transaction.name} class feature`}>
        <div className="class-feature-row__main">
          <div className="class-feature-row__identity">
            <h3>{transaction.name}</h3>
            <span>Recovery</span>
          </div>
          <button
            className="button button--secondary class-feature-row__primary"
            type="button"
            disabled={!canExecute}
            onClick={() => {
              onTransaction(transaction.id, {
                kind: 'restore-resource',
                ...(transaction.restore.kind === 'selected' ? { amount } : {}),
              });
              clearTransactionAmounts(transaction.id);
            }}
          >
            Use {transaction.name}
          </button>
        </div>

        <div className="class-feature-row__controls">
          {missing <= 0 && target && <small>{target.name} is already full.</small>}
          {transaction.restore.kind === 'selected' && missing > 0 && (
            <label className="field compact-field">
              <span>Restore amount</span>
              <input
                aria-label={`${transaction.name} restoration amount`}
                type="number"
                min="1"
                max={Math.max(1, maximumSelected)}
                value={rawAmount}
                onChange={(event) => setTransactionAmounts((values) => ({ ...values, [key]: event.target.value }))}
              />
            </label>
          )}
        </div>

        <details className="resource-consumer__details class-feature-row__details">
          <summary>Details</summary>
          <small>{usageLabel}</small>
          <small>{target ? `${target.name}: ${current} / ${target.maximumUses}` : 'Target resource unavailable'}</small>
        </details>
      </article>
    );
  };

  const consumerFeatures = resources.flatMap((resource) => resource.consumers.map((consumer) => ({ resource, consumer })));
  const hasFeatures = consumerFeatures.length > 0 || transactions.length > 0 || state.activeSelfEffects.length > 0;

  return (
    <section className="sheet-section panel play-panel resources-panel resources-panel--compact class-features-panel" aria-labelledby="class-features-heading">
      <div className="section-heading"><span className="eyebrow">Available Actions</span><h2 id="class-features-heading">Class Features</h2></div>
      {!hasFeatures ? <p>No executable class features are available at this level.</p> : (
        <div className="class-feature-list">
          {state.activeSelfEffects.map((effect) => {
            const active = sessionState.activeEffectIds.includes(effect.id);
            const eligibilityError = activeSelfEffectEligibilityError(effect, state);
            const cost = effect.activationCost;
            const resource = cost ? resources.find((candidate) => candidate.id === cost.resourceId) : undefined;
            const remaining = cost ? resourceCurrent(cost.resourceId) : undefined;
            const canActivate = !active && !eligibilityError && (!cost || Boolean(resource) && (remaining ?? 0) >= cost.amount);

            return (
              <article className="class-feature-row" key={effect.id} aria-label={`${effect.name} class feature`}>
                <div className="class-feature-row__main">
                  <div className="class-feature-row__identity">
                    <h3>{effect.name}</h3>
                    <span>{active ? 'Currently active' : activationType(effect.activationTiming)}</span>
                  </div>
                  {active
                    ? <span className="class-feature-row__state">Active</span>
                    : <button className="button button--secondary class-feature-row__primary" type="button" disabled={!canActivate} onClick={() => onActivateEffect(effect.id)}>Activate {effect.name}</button>}
                </div>
                {eligibilityError && !active && <small className="class-feature-row__note">{eligibilityError}</small>}
                {active && <small className="class-feature-row__note">Manage this effect below in Active Effects.</small>}
                <details className="resource-consumer__details class-feature-row__details">
                  <summary>Details</summary>
                  <small>{effect.description}</small>
                  {cost && resource && <small>Uses {cost.amount} from {resource.name}.</small>}
                  {effect.referenceText && <small>{effect.referenceText}</small>}
                </details>
              </article>
            );
          })}

          {consumerFeatures.map(({ resource, consumer }) => {
            const current = resourceCurrent(resource.id);
            const amountKey = `${resource.id}:${consumer.id}`;
            const amount = amounts[amountKey] ?? '1';
            const parsed = Number(amount);
            const validVariable = Number.isInteger(parsed) && parsed > 0 && parsed <= current;
            const detailText = consumer.effect.type === 'manual-healing'
              ? `The Dice Engine rolls d${consumer.effect.die}; healing and resource expenditure are applied together.`
              : consumer.effect.type === 'tracking-only'
                ? 'Explicit confirmation remains required because the app does not know the triggering event.'
                : consumer.effect.type === 'fixed-expend'
                  ? `Uses ${consumer.effect.amount} from ${resource.name}.`
                  : consumer.effect.type === 'variable-expend'
                    ? `Choose how many uses to expend from ${resource.name}.`
                    : `Uses one charge from ${resource.name}.`;

            return (
              <article className="class-feature-row" key={`${resource.id}:${consumer.id}`} aria-label={`${consumer.name} class feature`}>
                <div className="class-feature-row__main">
                  <div className="class-feature-row__identity">
                    <h3>{consumer.name}</h3>
                    <span>{consumerActionType(consumer.effect.type)}</span>
                  </div>

                  {consumer.effect.type === 'manual-healing' && <button className="button button--secondary class-feature-row__primary" type="button" disabled={current <= 0} onClick={() => onRollHealing(resource.id, consumer.id)}>Use {consumer.name}</button>}
                  {consumer.effect.type === 'tracking-only' && <button className="button button--secondary class-feature-row__primary" type="button" disabled={current <= 0} onClick={() => onUse(resource.id, consumer.id)}>Expend for {consumer.name}</button>}
                  {consumer.effect.type === 'fixed-expend' && <button className="button button--secondary class-feature-row__primary" type="button" disabled={current < consumer.effect.amount} onClick={() => onUse(resource.id, consumer.id)}>Expend {consumer.effect.amount} for {consumer.name}</button>}
                  {consumer.effect.type === 'expend-only' && <button className="button button--secondary class-feature-row__primary" type="button" disabled={current <= 0} onClick={() => onUse(resource.id, consumer.id)}>Expend {consumer.name}</button>}
                </div>

                {consumer.effect.type === 'variable-expend' && (
                  <div className="class-feature-row__controls class-feature-row__controls--action">
                    <label className="field compact-field"><span>Amount</span><input aria-label={`${consumer.name} amount`} type="number" min="1" max={Math.max(1, current)} value={amount} onChange={(event) => setAmounts((values) => ({ ...values, [amountKey]: event.target.value }))} /></label>
                    <button className="button button--secondary class-feature-row__primary" type="button" disabled={!validVariable} onClick={() => onUse(resource.id, consumer.id, parsed)}>Expend {Number.isFinite(parsed) ? parsed : 0}</button>
                  </div>
                )}

                <details className="resource-consumer__details class-feature-row__details">
                  <summary>Details</summary>
                  <small>{detailText}</small>
                  <small>{resource.name}: {current} / {resource.maximumUses} remaining.</small>
                </details>
              </article>
            );
          })}

          {transactions.map(renderTransaction)}
        </div>
      )}
    </section>
  );
}
