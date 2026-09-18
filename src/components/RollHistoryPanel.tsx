import { listEligibleOptionalDiceTransformations } from '../dice/diceEngine';
import type { RollHistoryEntry, RollResult } from '../dice/types';
import { formatModifier } from '../utils/ability';

interface RollHistoryPanelProps {
  entries: readonly RollHistoryEntry[];
  onClear: () => void;
  onApplyOptionalTransformation?: (entryId: string, transformationId: string) => void;
  limit?: number;
  compact?: boolean;
}

function formatDice(result: RollResult): string {
  if (result.dice.length === 0) return 'No dice';
  return result.dice.map((group) => `d${group.die}: ${group.values.join(', ')}`).join(' · ');
}

function formatMode(mode: RollResult['request']['mode']): string {
  return mode === 'normal' ? 'Normal' : mode === 'advantage' ? 'Advantage' : 'Disadvantage';
}

function contextText(result: RollResult): string[] {
  const context = result.request.d20Context;
  if (!context) return [];
  const text: string[] = [`Manual: ${formatMode(result.request.mode)} · Final: ${formatMode(result.resolvedMode ?? result.request.mode)}`];
  if (context.advantageSources?.length) text.push(`Advantage: ${context.advantageSources.join(', ')}`);
  if (context.disadvantageSources?.length) text.push(`Disadvantage: ${context.disadvantageSources.join(', ')}`);
  if (context.modifiers?.length) text.push(`Context: ${context.modifiers.map((source) => `${source.label} ${formatModifier(source.amount)}`).join(', ')}`);
  return text;
}

function effectText(result: RollResult): string[] {
  return result.effects.map((effect) => {
    if (effect.kind === 'hp') return `HP ${effect.before} → ${effect.after}`;
    if (effect.kind === 'hit-dice') return `Hit Dice ${effect.before} → ${effect.after}`;
    return `Resource ${effect.before} → ${effect.after}`;
  });
}

function transformationText(result: RollResult): string[] {
  return (result.diceTransformationApplications ?? []).map((application) => {
    if (application.type === 'reroll-once-use-new') return `${application.sourceLabel}: d${application.die} ${application.original} → reroll ${application.replacement}; new result ${application.final} used`;
    return `${application.sourceLabel}: d${application.die} ${application.original} → ${application.final} (minimum face)`;
  });
}

export function RollHistoryPanel({ entries, onClear, onApplyOptionalTransformation, limit, compact = false }: RollHistoryPanelProps) {
  const visibleEntries = limit === undefined ? entries : entries.slice(0, limit);
  return (
    <section className={`sheet-section panel roll-history${compact ? ' roll-history--compact' : ''}`} aria-labelledby="roll-history-heading">
      <div className="section-heading section-heading--split">
        <div><span className="eyebrow">Dice Engine</span><h2 id="roll-history-heading">Roll History</h2></div>
        <button className="text-button" type="button" onClick={onClear} disabled={entries.length === 0}>Clear History</button>
      </div>
      {entries.length === 0 ? <p className="roll-history__empty">No rolls yet. Use the sheet controls to roll without leaving this page.</p> : (
        <div className="roll-history__list">
          {visibleEntries.map((entry, index) => {
            const result = entry.result;
            const finalMode = result.resolvedMode ?? result.request.mode;
            const modeLabel = finalMode === 'normal' ? '' : ` · ${finalMode === 'advantage' ? 'Advantage' : 'Disadvantage'}`;
            const outcomeSuffix = result.request.outcome.kind === 'damage' && result.request.outcome.damageType
              ? ` ${result.request.outcome.damageType[0].toUpperCase()}${result.request.outcome.damageType.slice(1)}`
              : result.request.outcome.kind === 'healing' ? ' Healing' : '';
            const eligibleOptionalTransformations = listEligibleOptionalDiceTransformations(result);
            return (
              <article className={`roll-entry${index === 0 ? ' roll-entry--latest' : ''}`} key={entry.id}>
                <div className="roll-entry__header"><strong>{result.request.label}{modeLabel}</strong><div>{result.critical && <span className="source-badge">Critical</span>}{result.natural && <span className={`natural-badge natural-badge--${result.natural}`}>{result.natural === 'nat20' ? 'Nat 20' : 'Nat 1'}</span>}</div></div>
                <div className="roll-entry__math">
                  <span>{formatDice(result)}</span>
                  {result.keptD20 !== undefined && finalMode !== 'normal' && <span>Kept: {result.keptD20}</span>}
                  <span>Modifier: {formatModifier(result.modifier)}</span>
                  <strong>Total: {result.total}{outcomeSuffix}</strong>
                </div>
                {contextText(result).length > 0 && <div className="roll-entry__effects">{contextText(result).map((text) => <small key={text}>{text}</small>)}</div>}
                {transformationText(result).length > 0 && <div className="roll-entry__effects">{transformationText(result).map((text, applicationIndex) => <small key={`${text}:${applicationIndex}`}>{text}</small>)}</div>}
                {eligibleOptionalTransformations.length > 0 && onApplyOptionalTransformation && <div className="roll-entry__effects">{eligibleOptionalTransformations.map((transformation) => <div key={transformation.id}><small><strong>{transformation.sourceLabel}:</strong> reroll the qualifying d{transformation.die}; the new result must be used.</small><button className="text-button" type="button" onClick={() => onApplyOptionalTransformation(entry.id, transformation.id)}>Reroll d{transformation.die}</button></div>)}</div>}
                {result.effects.length > 0 && <div className="roll-entry__effects">{effectText(result).map((text) => <small key={text}>{text}</small>)}</div>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
