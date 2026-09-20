import { useState } from 'react';
import { CHARACTER_CONDITION_IDS, getCharacterConditionDefinition, type CharacterConditionId } from '../rules/conditions';

interface CharacterConditionsPanelProps {
  conditions: readonly CharacterConditionId[];
  onAdd: (condition: CharacterConditionId) => void;
  onRemove: (condition: CharacterConditionId) => void;
}

export function CharacterConditionsPanel({ conditions, onAdd, onRemove }: CharacterConditionsPanelProps) {
  const [selected, setSelected] = useState<CharacterConditionId | ''>('');
  const available = CHARACTER_CONDITION_IDS.filter((condition) => !conditions.includes(condition));
  return (
    <section className="sheet-section panel play-conditions play-panel--compact" aria-labelledby="character-conditions-heading">
      <div className="section-heading"><span className="eyebrow">Session State</span><h2 id="character-conditions-heading">Character Conditions</h2></div>
      <div className="play-condition-add">
        <label className="field compact-field"><span>Add condition</span><select value={selected} onChange={(event) => setSelected(event.target.value as CharacterConditionId | '')}><option value="">Choose condition</option>{available.map((condition) => <option key={condition} value={condition}>{getCharacterConditionDefinition(condition).name}</option>)}</select></label>
        <button className="button button--secondary" type="button" disabled={!selected} onClick={() => { if (!selected) return; onAdd(selected); setSelected(''); }}>Add</button>
      </div>
      {conditions.length === 0 ? <p>No active Character conditions.</p> : <div className="play-condition-list">{conditions.map((condition) => {
        const definition = getCharacterConditionDefinition(condition);
        return <article className="feat-reference-card play-condition-card" key={condition}>
          <div className="feat-reference-card__header"><div><span className="eyebrow">Condition</span><h3>{definition.name}</h3></div><button className="text-button" type="button" onClick={() => onRemove(condition)}>Remove</button></div>
          <details className="play-reference-details">
            <summary>Details</summary>
            <div className="play-reference-details__body">
              <p>{definition.summary}</p>
              {definition.automated.length > 0 && <div className="feat-reference-card__effects"><strong>Automated</strong>{definition.automated.map((text) => <small key={text}>{text}</small>)}</div>}
              {definition.informational.length > 0 && <div className="feat-reference-card__effects"><strong>Table / reference</strong>{definition.informational.map((text) => <small key={text}>{text}</small>)}</div>}
            </div>
          </details>
        </article>;
      })}</div>}
      <details className="play-reference-details play-reference-details--section">
        <summary>Details</summary>
        <div className="play-reference-details__body">
          <small>Player-managed Character-side conditions only. Table-dependent targets, sources, duration, and opponent effects remain manual.</small>
          <small>Exhaustion is intentionally not represented in M13B session state.</small>
        </div>
      </details>
    </section>
  );
}
