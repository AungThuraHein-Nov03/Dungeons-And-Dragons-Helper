import { useMemo, useState } from 'react';
import type { DieSize } from '../models/content';

interface HitDiePoolDisplay {
  readonly die: DieSize;
  readonly remaining: number;
  readonly maximum: number;
}

interface RestPanelProps {
  hitDice: readonly HitDiePoolDisplay[];
  onSpendHitDie: (die: DieSize) => void;
  onShortRest: () => void;
  onLongRest: () => void;
}

export function RestPanel({ hitDice, onSpendHitDie, onShortRest, onLongRest }: RestPanelProps) {
  const firstAvailable = useMemo(() => hitDice.find((pool) => pool.remaining > 0)?.die ?? hitDice[0]?.die ?? 6, [hitDice]);
  const [selectedDie, setSelectedDie] = useState<DieSize>(firstAvailable);
  const selectedPool = hitDice.find((pool) => pool.die === selectedDie) ?? hitDice[0];

  return (
    <section className="sheet-section panel play-panel play-panel--compact" aria-labelledby="rest-heading">
      <div className="section-heading"><span className="eyebrow">Recovery</span><h2 id="rest-heading">Hit Dice & Rests</h2></div>
      <div className="rest-summary">
        <span>Hit Dice</span>
        <strong>{hitDice.map((pool) => `${pool.remaining} / ${pool.maximum} d${pool.die}`).join(' · ')}</strong>
      </div>
      <div className="rest-actions">
        <div className="play-action">
          {hitDice.length > 1 && <label className="field compact-field"><span>Hit Die</span><select aria-label="Hit Die" value={selectedDie} onChange={(event) => setSelectedDie(Number(event.target.value) as DieSize)}>{hitDice.map((pool) => <option key={pool.die} value={pool.die}>d{pool.die}</option>)}</select></label>}
          <button className="button button--secondary" type="button" onClick={() => selectedPool && onSpendHitDie(selectedPool.die)} disabled={!selectedPool || selectedPool.remaining <= 0}>Roll & Spend 1d{selectedPool?.die ?? selectedDie}</button>
        </div>
        <div className="rest-button-stack">
          <button className="button button--secondary" type="button" onClick={onShortRest}>Finish Short Rest</button>
          <button className="button button--primary" type="button" onClick={onLongRest}>Long Rest</button>
        </div>
      </div>
      <details className="play-reference-details play-reference-details--section">
        <summary>Details</summary>
        <div className="play-reference-details__body">
          <small>The Dice Engine rolls the Hit Die, adds the existing Constitution modifier, heals, consumes one die, and records the result.</small>
          <small>Finish Short Rest recovers only resources whose rules recharge on a Short Rest.</small>
          <small>Long Rest requires confirmation. It restores HP, all spent Hit Dice, Long-Rest resources, and removes Temporary HP.</small>
        </div>
      </details>
    </section>
  );
}
