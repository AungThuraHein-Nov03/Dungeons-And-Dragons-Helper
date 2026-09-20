import type { CharacterPlayState } from '../models/character';
import type { DerivedResource } from '../rules/types';

interface ResourcesPanelProps {
  resources: readonly DerivedResource[];
  playState: CharacterPlayState;
  compact?: boolean;
}

export function ResourcesPanel({ resources, playState, compact = false }: ResourcesPanelProps) {
  const panelClass = `sheet-section panel play-panel resources-panel${compact ? ' resources-panel--compact' : ''}`;

  if (resources.length === 0) {
    return (
      <section className={panelClass} aria-labelledby="resources-heading">
        <div className="section-heading"><span className="eyebrow">Class Resources</span><h2 id="resources-heading">Class Resources</h2></div>
        <p>No tracked class resources are available at this level.</p>
      </section>
    );
  }

  return (
    <section className={panelClass} aria-labelledby="resources-heading">
      <div className="section-heading"><span className="eyebrow">Remaining Uses</span><h2 id="resources-heading">Class Resources</h2></div>
      <div className="resource-grid">
        {resources.map((resource) => {
          const current = playState.resourceUses[resource.id] ?? 0;
          return (
            <article className="resource-card" key={resource.id} aria-label={`${resource.name} resource status`}>
              <div className="resource-card__header">
                <div><h3>{resource.name}</h3><p>{current} / {resource.maximumUses}</p></div>
                {resource.presentation === 'pips' && <div className="resource-pips" aria-label={`${current} of ${resource.maximumUses} uses remaining`}>
                  {Array.from({ length: resource.maximumUses }, (_, index) => <span key={index} className={index < current ? 'resource-pip resource-pip--filled' : 'resource-pip'} aria-hidden="true" />)}
                </div>}
              </div>
              {resource.consumers.length > 0 && (
                <details className="resource-consumer__details">
                  <summary>Details</summary>
                  <small>Used by: {resource.consumers.map((consumer) => consumer.name).join(', ')}</small>
                </details>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
