import type { DerivedCharacterState } from '../rules/types';
import type { PlaySessionState } from '../services/playSessionState';

interface ActiveEffectsPanelProps {
  state: DerivedCharacterState;
  sessionState: PlaySessionState;
  onDeactivate: (effectId: string) => void;
}

function timingLabel(timing: DerivedCharacterState['activeSelfEffects'][number]['activationTiming']): string {
  if (timing === 'bonus-action') return 'Bonus Action';
  if (timing === 'start-of-turn') return 'Start of turn';
  return 'Manual';
}

export function ActiveEffectsPanel({ state, sessionState, onDeactivate }: ActiveEffectsPanelProps) {
  const activeEffects = state.activeSelfEffects.filter((effect) => sessionState.activeEffectIds.includes(effect.id));

  return (
    <section className="sheet-section panel play-panel play-panel--compact" aria-labelledby="active-effects-heading">
      <div className="section-heading">
        <span className="eyebrow">Current State</span>
        <h2 id="active-effects-heading">Active Effects</h2>
      </div>
      {activeEffects.length === 0 ? <p>No active effects.</p> : (
        <div className="resource-grid">
          {activeEffects.map((effect) => (
            <article className="resource-card play-effect-card" key={effect.id} aria-label={`${effect.name} active effect`}>
              <div className="resource-card__header">
                <div><h3>{effect.name}</h3><p>Active · {timingLabel(effect.activationTiming)}</p></div>
                <span className="source-badge">ACTIVE</span>
              </div>
              <button className="button button--secondary" type="button" onClick={() => onDeactivate(effect.id)}>End {effect.name}</button>
              <details className="play-reference-details">
                <summary>Details</summary>
                <div className="play-reference-details__body">
                  <p>{effect.description}</p>
                  {effect.referenceText && <small>{effect.referenceText}</small>}
                  <small>Temporary self-only modes are session state. Duration and combat-event timing remain manual where noted.</small>
                </div>
              </details>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
