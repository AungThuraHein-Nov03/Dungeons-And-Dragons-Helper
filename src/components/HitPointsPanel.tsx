import { useState } from 'react';
import type { TemporaryHpDecision } from '../rules/playState';

interface HitPointsPanelProps {
  currentHp: number;
  maximumHp: number;
  temporaryHp: number;
  onDamage: (amount: number) => void;
  onHeal: (amount: number) => void;
  onSetTemporaryHp: (amount: number, decision: TemporaryHpDecision) => void;
}

export function HitPointsPanel({ currentHp, maximumHp, temporaryHp, onDamage, onHeal, onSetTemporaryHp }: HitPointsPanelProps) {
  const [damage, setDamage] = useState('');
  const [healing, setHealing] = useState('');
  const [temporary, setTemporary] = useState('');

  function setTemp() {
    const amount = Number(temporary);
    if (temporaryHp > 0 && amount > 0 && amount !== temporaryHp) {
      const replace = window.confirm(`You already have ${temporaryHp} Temporary HP. Replace it with ${amount}? Cancel keeps the current value.`);
      if (!replace) return;
    }
    onSetTemporaryHp(amount, 'replace');
    setTemporary('');
  }

  return (
    <section className="sheet-section panel play-panel hp-panel--compact" aria-labelledby="hit-points-heading">
      <div className="hp-panel__top">
        <div className="section-heading hp-panel__heading"><span className="eyebrow">Live Play State</span><h2 id="hit-points-heading">Hit Points</h2></div>
        <div className="hp-status" aria-label="Hit Point status">
          <div className="hp-status__main">
            <div><span>Current</span><strong>{currentHp}</strong></div>
            <span className="hp-status__slash" aria-hidden="true">/</span>
            <div><span>Maximum</span><strong>{maximumHp}</strong></div>
          </div>
          <div className="hp-status__temp"><span>Temporary</span><strong>{temporaryHp}</strong></div>
        </div>
      </div>
      <div className="play-action-grid play-action-grid--compact">
        <div className="play-action play-action--compact">
          <label className="field" htmlFor="damage-amount"><span>Damage</span><input id="damage-amount" aria-label="Damage amount" type="number" min="1" step="1" value={damage} onChange={(event) => setDamage(event.target.value)} /></label>
          <button className="button button--danger" type="button" onClick={() => { onDamage(Number(damage)); setDamage(''); }}>Take Damage</button>
        </div>
        <div className="play-action play-action--compact">
          <label className="field" htmlFor="healing-amount"><span>Heal</span><input id="healing-amount" aria-label="Healing amount" type="number" min="1" step="1" value={healing} onChange={(event) => setHealing(event.target.value)} /></label>
          <button className="button button--secondary" type="button" onClick={() => { onHeal(Number(healing)); setHealing(''); }}>Heal</button>
        </div>
        <div className="play-action play-action--compact">
          <label className="field" htmlFor="temporary-hp-amount"><span>Temp HP</span><input id="temporary-hp-amount" aria-label="Temporary HP amount" type="number" min="0" step="1" value={temporary} onChange={(event) => setTemporary(event.target.value)} /></label>
          <button className="button button--secondary" type="button" onClick={setTemp}>Set Temp HP</button>
        </div>
      </div>
    </section>
  );
}
