import type { Character } from '../models/character';
import { activeSelfEffectEligibilityError } from '../rules/activeSelfEffects';
import type { DerivedCharacterState } from '../rules/types';
import type { PlaySessionState } from '../services/playSessionState';

interface ActiveEffectsPanelProps {
  character: Character;
  state: DerivedCharacterState;
  sessionState: PlaySessionState;
  onActivate: (effectId: string) => void;
  onDeactivate: (effectId: string) => void;
}

function timingLabel(timing: DerivedCharacterState['activeSelfEffects'][number]['activationTiming']): string {
  if (timing === 'bonus-action') return 'Bonus Action';
  if (timing === 'start-of-turn') return 'Start of turn';
  return 'Manual';
}

export function ActiveEffectsPanel({ character, state, sessionState, onActivate, onDeactivate }: ActiveEffectsPanelProps) {
  return (
    <section className="sheet-section panel play-panel" aria-labelledby="active-effects-heading">
      <div className="section-heading">
        <span className="eyebrow">Feature Modes</span>
        <h2 id="active-effects-heading">Active Effects</h2>
        <p>Temporary self-only modes are session state. Duration and combat-event timing remain manual where noted.</p>
      </div>
      {state.activeSelfEffects.length === 0 ? <p>No active self-effect modes are available at this level.</p> : (
        <div className="resource-grid">
          {state.activeSelfEffects.map((effect) => {
            const active = sessionState.activeEffectIds.includes(effect.id);
            const cost = effect.activationCost;
            const resource = cost ? state.resources.find((candidate) => candidate.id === cost.resourceId) : undefined;
            const remaining = cost ? character.playState.resourceUses[cost.resourceId] ?? 0 : undefined;
            const eligibilityError = activeSelfEffectEligibilityError(effect, state);
            const legal = !active && !eligibilityError && (!cost || Boolean(resource) && (remaining ?? 0) >= cost.amount);
            return (
              <article className="resource-card" key={effect.id} aria-label={`${effect.name} active effect`}>
                <div className="resource-card__header">
                  <div><h3>{effect.name}</h3><p>{active ? 'Active' : 'Inactive'} · {timingLabel(effect.activationTiming)}</p></div>
                  <span className="source-badge">{active ? 'ACTIVE' : 'READY'}</span>
                </div>
                <p>{effect.description}</p>
                {cost && <p className="resource-shared">{resource ? `${resource.name}: ${remaining} / ${resource.maximumUses} remaining · activation costs ${cost.amount}` : 'Activation resource unavailable'}</p>}
                {eligibilityError && !active && <small>{eligibilityError}</small>}
                {effect.referenceText && <small>{effect.referenceText}</small>}
                {active
                  ? <button className="button button--secondary" type="button" onClick={() => onDeactivate(effect.id)}>End {effect.name}</button>
                  : <button className="button button--secondary" type="button" disabled={!legal} onClick={() => onActivate(effect.id)}>Activate {effect.name}</button>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
