import { useState } from 'react';
import type { CharacterPlayState } from '../models/character';
import type { ResourceTransactionRequest } from '../rules/resourceTransactions';
import type { DerivedResource, DerivedResourceTransaction } from '../rules/types';

interface ResourcesPanelProps {
  resources: readonly DerivedResource[];
  transactions?: readonly DerivedResourceTransaction[];
  playState: CharacterPlayState;
  onRollHealing: (resourceId: string, consumerId: string) => void;
  onUse: (resourceId: string, consumerId: string, amount?: number) => void;
  onTransaction?: (transactionId: string, request: ResourceTransactionRequest) => void;
  compact?: boolean;
}

function wholeNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

export function ResourcesPanel({
  resources,
  transactions = [],
  playState,
  onRollHealing,
  onUse,
  onTransaction,
  compact = false,
}: ResourcesPanelProps) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [transactionAmounts, setTransactionAmounts] = useState<Record<string, string>>({});
  const panelClass = `sheet-section panel play-panel resources-panel${compact ? ' resources-panel--compact' : ''}`;
  const heading = compact ? 'Class Resources' : 'Resources';

  const resourceCurrent = (resourceId: string) => playState.resourceUses[resourceId] ?? 0;
  const usageSummary = (transaction: DerivedResourceTransaction) => {
    if (!transaction.usageResourceId) return { available: true, label: 'No separate use limit' };
    const resource = resources.find((candidate) => candidate.id === transaction.usageResourceId);
    if (!resource) return { available: false, label: 'Usage resource unavailable' };
    const current = resourceCurrent(resource.id);
    return { available: current > 0, label: `${current} / ${resource.maximumUses} use${resource.maximumUses === 1 ? '' : 's'} remaining` };
  };

  const clearTransactionAmounts = (transactionId: string) => {
    setTransactionAmounts((values) => Object.fromEntries(Object.entries(values).filter(([key]) => !key.startsWith(transactionId + ':'))));
  };

  const renderTransaction = (transaction: DerivedResourceTransaction) => {
    const usage = usageSummary(transaction);

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
      const canExecute = Boolean(onTransaction) && usage.available && eligible.length > 0 && validAmounts && hasSelection && withinBudget;

      return (
        <article className="resource-card resource-transaction-card" key={transaction.id} data-transaction-kind={transaction.kind} aria-label={`${transaction.name} resource transaction`}>
          <div className="resource-card__header">
            <div><h3>{transaction.name}</h3><p>{usage.label}</p></div>
          </div>
          <p className="resource-shared">Recovery budget: {transaction.budget} slot level{transaction.budget === 1 ? '' : 's'} · Maximum slot level {transaction.maximumSpellLevel}</p>
          <div className="resource-consumers">
            <div className="resource-consumer">
              <strong>Remaining budget: {remainingBudget >= 0 ? remainingBudget : 0}</strong>
              <small>Selected weighted cost: {weightedCost}{remainingBudget < 0 ? ` · Over budget by ${Math.abs(remainingBudget)}` : ''}</small>
            </div>
            {!usage.available && <small>{transaction.name} has no uses remaining.</small>}
            {eligible.length === 0 ? (
              <small>No eligible expended spell slots to recover.</small>
            ) : eligible.map((slot) => {
              const key = `${transaction.id}:${slot.resourceId}`;
              const value = transactionAmounts[key] ?? '0';
              return (
                <div className="resource-consumer" key={slot.resourceId}>
                  <strong>{slot.name}</strong>
                  <small>{slot.expended} expended · weighted cost {slot.spellLevel} each</small>
                  <label className="field compact-field">
                    <span>Recover</span>
                    <input
                      aria-label={`${transaction.name} ${slot.name} recovery count`}
                      type="number"
                      min="0"
                      max={slot.expended}
                      value={value}
                      onChange={(event) => setTransactionAmounts((values) => ({ ...values, [key]: event.target.value }))}
                    />
                  </label>
                </div>
              );
            })}
            {!withinBudget && <small role="status">Selection exceeds the recovery budget.</small>}
            <button
              className="button button--secondary"
              type="button"
              disabled={!canExecute}
              onClick={() => {
                if (!onTransaction) return;
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
    const canExecute = Boolean(onTransaction) && usage.available && Boolean(target) && missing > 0 && validAmount;

    return (
      <article className="resource-card resource-transaction-card" key={transaction.id} data-transaction-kind={transaction.kind} aria-label={`${transaction.name} resource transaction`}>
        <div className="resource-card__header">
          <div><h3>{transaction.name}</h3><p>{usage.label}</p></div>
        </div>
        <p className="resource-shared">{target ? `${target.name}: ${current} / ${target.maximumUses}` : 'Target resource unavailable'}</p>
        <div className="resource-consumers">
          {!usage.available && <small>{transaction.name} has no uses remaining.</small>}
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
          <button
            className="button button--secondary"
            type="button"
            disabled={!canExecute}
            onClick={() => {
              if (!onTransaction) return;
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
      </article>
    );
  };

  if (resources.length === 0 && transactions.length === 0) {
    return (
      <section className={panelClass} aria-labelledby="resources-heading">
        <div className="section-heading"><span className="eyebrow">Class Features</span><h2 id="resources-heading">{heading}</h2></div>
        <p>No tracked resources are available at this level.</p>
      </section>
    );
  }

  return (
    <section className={panelClass} aria-labelledby="resources-heading">
      <div className="section-heading"><span className="eyebrow">Class Features</span><h2 id="resources-heading">{heading}</h2></div>
      <div className="resource-grid">
        {resources.map((resource) => {
          const current = playState.resourceUses[resource.id] ?? 0;
          return (
            <article className="resource-card" key={resource.id}>
              <div className="resource-card__header">
                <div><h3>{resource.name}</h3><p>{current} / {resource.maximumUses}</p></div>
                {resource.presentation === 'pips' && <div className="resource-pips" aria-label={`${current} of ${resource.maximumUses} uses remaining`}>
                  {Array.from({ length: resource.maximumUses }, (_, index) => <span key={index} className={index < current ? 'resource-pip resource-pip--filled' : 'resource-pip'} aria-hidden="true" />)}
                </div>}
              </div>
              <p className="resource-shared">Used by: {resource.consumers.map((consumer) => consumer.name).join(', ') || 'Manual tracking'}</p>
              <div className="resource-consumers">
                {resource.consumers.map((consumer) => {
                  if (consumer.effect.type === 'manual-healing') {
                    const explanation = <>The Dice Engine rolls d{consumer.effect.die}; healing and resource expenditure are applied together.</>;
                    return (
                      <div className="resource-consumer" key={consumer.id}>
                        <strong>{consumer.name}</strong>
                        <button className="button button--secondary" type="button" disabled={current <= 0} onClick={() => onRollHealing(resource.id, consumer.id)}>Use {consumer.name}</button>
                        {compact ? <details className="resource-consumer__details"><summary>Details</summary><small>{explanation}</small></details> : <small>{explanation}</small>}
                      </div>
                    );
                  }
                  if (consumer.effect.type === 'tracking-only') {
                    const explanation = <>Explicit confirmation remains required because the app does not know the triggering event. This uses the shared resource pool.</>;
                    return (
                      <div className="resource-consumer" key={consumer.id}>
                        <strong>{consumer.name}</strong>
                        <button className="button button--secondary" type="button" disabled={current <= 0} onClick={() => onUse(resource.id, consumer.id)}>Expend for {consumer.name}</button>
                        {compact ? <details className="resource-consumer__details"><summary>Details</summary><small>{explanation}</small></details> : <small>{explanation}</small>}
                      </div>
                    );
                  }
                  if (consumer.effect.type === 'variable-expend') {
                    const amountKey = `${resource.id}:${consumer.id}`;
                    const amount = amounts[amountKey] ?? '1';
                    const parsed = Number(amount);
                    const valid = Number.isInteger(parsed) && parsed > 0 && parsed <= current;
                    return (
                      <div className="resource-consumer" key={consumer.id}>
                        <strong>{consumer.name}</strong>
                        <label className="field compact-field"><span>Amount</span><input aria-label={`${consumer.name} amount`} type="number" min="1" max={Math.max(1, current)} value={amount} onChange={(event) => setAmounts((values) => ({ ...values, [amountKey]: event.target.value }))} /></label>
                        <button className="button button--secondary" type="button" disabled={!valid} onClick={() => onUse(resource.id, consumer.id, parsed)}>Expend {Number.isFinite(parsed) ? parsed : 0}</button>
                      </div>
                    );
                  }
                  if (consumer.effect.type === 'fixed-expend') {
                    return (
                      <div className="resource-consumer" key={consumer.id}>
                        <strong>{consumer.name}</strong>
                        <button className="button button--secondary" type="button" disabled={current < consumer.effect.amount} onClick={() => onUse(resource.id, consumer.id)}>Expend {consumer.effect.amount} for {consumer.name}</button>
                      </div>
                    );
                  }
                  return (
                    <div className="resource-consumer" key={consumer.id}>
                      <strong>{consumer.name}</strong>
                      <button className="button button--secondary" type="button" disabled={current <= 0} onClick={() => onUse(resource.id, consumer.id)}>Expend {consumer.name}</button>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
        {transactions.map(renderTransaction)}
      </div>
    </section>
  );
}
