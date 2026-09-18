import { useState } from 'react';
import { ROLL_DIE_SIZES, type RollDieSize, type RollHistoryEntry, type RollMode } from '../dice/types';
import { rollManualDice } from '../services/manualDice';
import { applyRollHistoryDiceTransformation } from '../services/rollHistory';
import { formatModifier } from '../utils/ability';
import { RollHistoryPanel } from './RollHistoryPanel';

interface DiceTrayProps {
  characterId: string;
  history: readonly RollHistoryEntry[];
  onHistoryChange: () => void;
  onClearHistory: () => void;
}

function formatDice(entry: RollHistoryEntry): string {
  return entry.result.dice.map((group) => `d${group.die}: ${group.values.join(', ')}`).join(' · ');
}

export function DiceTray({ characterId, history, onHistoryChange, onClearHistory }: DiceTrayProps) {
  const [die, setDie] = useState<RollDieSize>(20);
  const [quantity, setQuantity] = useState('1');
  const [modifier, setModifier] = useState('0');
  const [mode, setMode] = useState<RollMode>('normal');
  const [error, setError] = useState<string | null>(null);
  const latest = history[0];
  const supportsD20Mode = die === 20 && Number(quantity) === 1;

  function changeDie(next: RollDieSize) {
    setDie(next);
    if (next !== 20) setMode('normal');
  }

  function changeQuantity(next: string) {
    setQuantity(next);
    if (Number(next) !== 1) setMode('normal');
  }

  function roll() {
    const result = rollManualDice(characterId, die, Number(quantity), Number(modifier), supportsD20Mode ? mode : 'normal');
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    onHistoryChange();
  }

  function applyOptionalTransformation(entryId: string, transformationId: string) {
    const result = applyRollHistoryDiceTransformation(entryId, transformationId);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    onHistoryChange();
  }

  return (
    <details className="dice-tray panel" open>
      <summary className="dice-tray__summary"><span className="eyebrow">Tabletop Utility</span><strong>Dice Tray</strong></summary>
      <div className="dice-tray__body">
        <div className="dice-tray__dice" aria-label="Die size">
          {ROLL_DIE_SIZES.map((size) => (
            <button key={size} type="button" className="roll-toggle" aria-pressed={die === size} onClick={() => changeDie(size)}>d{size}</button>
          ))}
        </div>

        <div className="dice-tray__inputs">
          <label className="field" htmlFor="manual-dice-quantity"><span>Quantity</span><input id="manual-dice-quantity" type="number" min="1" step="1" value={quantity} onChange={(event) => changeQuantity(event.target.value)} /></label>
          <label className="field" htmlFor="manual-dice-modifier"><span>Modifier</span><input id="manual-dice-modifier" type="number" step="1" value={modifier} onChange={(event) => setModifier(event.target.value)} /></label>
        </div>

        {supportsD20Mode && (
          <div className="dice-tray__mode" role="group" aria-label="Manual d20 roll mode">
            {(['normal', 'advantage', 'disadvantage'] as const).map((option) => (
              <button key={option} type="button" className="roll-toggle" aria-pressed={mode === option} onClick={() => setMode(option)}>
                {option === 'normal' ? 'Normal' : option === 'advantage' ? 'Advantage' : 'Disadvantage'}
              </button>
            ))}
          </div>
        )}

        <button className="button button--primary dice-tray__roll" type="button" onClick={roll}>Roll {quantity || '0'}d{die}</button>
        {error && <div className="form-alert" role="alert">{error}</div>}

        <section className="dice-latest" aria-labelledby="dice-latest-heading">
          <span className="eyebrow">Latest Result</span>
          <h3 id="dice-latest-heading">{latest ? `Latest: ${latest.result.request.label}` : 'No roll yet'}</h3>
          {latest ? (
            <div className="dice-latest__result">
              <strong>{latest.result.total}</strong>
              <div>
                <span>{formatDice(latest)}</span>
                {latest.result.keptD20 !== undefined && latest.result.request.mode !== 'normal' && <span>Kept: {latest.result.keptD20}</span>}
                <span>Modifier: {formatModifier(latest.result.modifier)}</span>
                {latest.result.natural && <span>{latest.result.natural === 'nat20' ? 'Nat 20' : 'Nat 1'}</span>}
              </div>
            </div>
          ) : <p>Manual and contextual rolls will appear here.</p>}
        </section>

        <RollHistoryPanel entries={history} onClear={onClearHistory} onApplyOptionalTransformation={applyOptionalTransformation} limit={5} compact />
      </div>
    </details>
  );
}
