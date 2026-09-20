import type { DieSize } from '../models/content';

interface RestPanelProps {
  hitDie: DieSize;
  remainingHitDice: number;
  maximumHitDice: number;
  onSpendHitDie: () => void;
  onShortRest: () => void;
  onLongRest: () => void;
}

export function RestPanel({ hitDie, remainingHitDice, maximumHitDice, onSpendHitDie, onShortRest, onLongRest }: RestPanelProps) {
  return (
    <section className="sheet-section panel play-panel play-panel--compact" aria-labelledby="rest-heading">
      <div className="section-heading"><span className="eyebrow">Recovery</span><h2 id="rest-heading">Hit Dice & Rests</h2></div>
      <div className="rest-summary">
        <span>Hit Dice</span>
        <strong>{remainingHitDice} / {maximumHitDice} d{hitDie}</strong>
      </div>
      <div className="rest-actions">
        <div className="play-action">
          <button className="button button--secondary" type="button" onClick={onSpendHitDie} disabled={remainingHitDice <= 0}>Roll & Spend 1d{hitDie}</button>
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
