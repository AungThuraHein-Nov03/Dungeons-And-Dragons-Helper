import { useMemo, useState } from 'react';
import type { RollMode } from '../dice/types';
import type { ConcentrationCandidate } from '../rules/concentration';
import type { PlaySessionConcentration } from '../services/playSessionState';
import { RollModeControl } from './RollModeControl';

export interface ConcentrationSaveDisplay {
  readonly dc: number;
  readonly total: number;
  readonly success: boolean;
}

interface ConcentrationPanelProps {
  candidates: readonly ConcentrationCandidate[];
  concentration?: PlaySessionConcentration;
  onStart: (providerId: string, spellId: string) => void;
  onEnd: () => void;
  onSave: (damageTaken: number, mode: RollMode) => void;
  lastSave?: ConcentrationSaveDisplay;
}

function candidateKey(candidate: Pick<ConcentrationCandidate, 'providerId' | 'spellId'>): string {
  return `${candidate.providerId}::${candidate.spellId}`;
}

export function ConcentrationPanel({ candidates, concentration, onStart, onEnd, onSave, lastSave }: ConcentrationPanelProps) {
  const current = useMemo(() => concentration ? candidates.find((candidate) => candidate.providerId === concentration.providerId && candidate.spellId === concentration.spellId) : undefined, [candidates, concentration]);
  const [selected, setSelected] = useState('');
  const [damage, setDamage] = useState('');
  const [mode, setMode] = useState<RollMode>('normal');
  const selectedCandidate = candidates.find((candidate) => candidateKey(candidate) === selected);
  const damageNumber = Number(damage);
  return (
    <section className="sheet-section panel play-concentration" aria-labelledby="concentration-heading">
      <div className="section-heading"><span className="eyebrow">Session State</span><h2 id="concentration-heading">Concentration</h2><p>One Character-side Concentration effect at a time. Targets, duration, areas, and spell effects remain table-managed.</p></div>
      <div className="concentration-current">
        <span>Current</span>
        <strong>{current ? `${current.spellName} · ${current.providerName}` : 'None'}</strong>
        {current && <button className="text-button" type="button" onClick={onEnd}>End Concentration</button>}
      </div>
      <div className="concentration-start">
        <label className="field compact-field"><span>Concentration spell</span><select value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Choose spell</option>{candidates.map((candidate) => <option key={candidateKey(candidate)} value={candidateKey(candidate)}>{candidate.spellName} · {candidate.providerName}</option>)}</select></label>
        <button className="button button--secondary" type="button" disabled={!selectedCandidate} onClick={() => { if (selectedCandidate) onStart(selectedCandidate.providerId, selectedCandidate.spellId); }}>{concentration ? 'Replace Concentration' : 'Start Concentration'}</button>
      </div>
      {concentration && <div className="concentration-save">
        <label className="field compact-field"><span>Damage taken</span><input type="number" min="1" step="1" value={damage} onChange={(event) => setDamage(event.target.value)} /></label>
        <RollModeControl compact ariaLabel="Concentration save roll mode" mode={mode} onChange={setMode} />
        <button className="button button--primary" type="button" disabled={!Number.isInteger(damageNumber) || damageNumber <= 0} onClick={() => onSave(damageNumber, mode)}>Roll Concentration Save</button>
      </div>}
      {lastSave && <p className={`field-hint concentration-save-result concentration-save-result--${lastSave.success ? 'success' : 'failure'}`}><strong>{lastSave.success ? 'Success' : 'Failure'}:</strong> {lastSave.total} vs DC {lastSave.dc}. {lastSave.success ? 'Concentration remains.' : 'Concentration ended.'}</p>}
      <small className="field-hint">Damage DC: 10 or half the damage taken (round down), whichever is higher, maximum DC 30.</small>
    </section>
  );
}
