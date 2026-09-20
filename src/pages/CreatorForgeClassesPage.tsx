import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CreatorForgeDeletePanel } from '../components/CreatorForgeDeletePanel';
import { CreatorForgeNav } from '../components/CreatorForgeNav';
import { SourceBadge } from '../components/SourceBadge';
import type { ClassContent, ClassPrimaryAbility } from '../models/content';
import { contentRegistry } from '../services/contentRegistry';
import { projectContentMutationsAreLocked } from '../services/persistenceBackend';

function abilityLabel(value: ClassPrimaryAbility): string {
  const names = value.abilities.map((ability) => ability[0].toUpperCase() + ability.slice(1));
  return names.join(value.mode === 'one-of' ? ' or ' : ' and ');
}

export function CreatorForgeClassesPage() {
  const mutationsLocked = projectContentMutationsAreLocked();
  const [deleteTarget, setDeleteTarget] = useState<ClassContent | null>(null);
  const classes = [...contentRegistry.getAll('class')]
    .filter((entry) => entry.source.type === 'homebrew')
    .sort((left, right) => left.name.localeCompare(right.name));

  return (
    <div className="stack-page creator-forge-page">
      <header className="page-heading page-heading--actions">
        <div>
          <span className="eyebrow">Creator Forge · Classes</span>
          <h1>Custom Classes</h1>
          <p>Manage local canonical ClassContent. Bundled SRD Classes remain read-only.</p>
        </div>
        {mutationsLocked ? <button className="button button--primary" type="button" disabled>Create Class</button> : <Link className="button button--primary" to="/creator-forge/classes/new">Create Class</Link>}
      </header>
      <CreatorForgeNav />
      {mutationsLocked && <div className="form-alert" role="status">Project content is read-only during Phase B. Forge mutations unlock in Phase C.</div>}

      {classes.length === 0 ? (
        <section className="empty-state panel">
          <span className="eyebrow">No custom Classes yet</span>
          <h2>Create your first Class</h2>
          <p>Class Forge authors a complete canonical 1–20 Class progression that existing Character, multiclass, Level Up, spellcasting, and PLAY rules consume directly.</p>
          {mutationsLocked ? <button className="button button--primary" type="button" disabled>Create Class</button> : <Link className="button button--primary" to="/creator-forge/classes/new">Create Class</Link>}
        </section>
      ) : (
        <section className="compendium-grid" aria-label="Custom Classes">
          {classes.map((classContent) => {
            const features = classContent.progression.flatMap((row) => row.features);
            const providers = features.flatMap((feature) => feature.spellcasting ?? []);
            return (
              <article className="compendium-card panel" key={classContent.id}>
                <div className="compendium-card__header">
                  <div><span className="eyebrow">Custom Class</span><h2>{classContent.name}</h2></div>
                  <SourceBadge source={classContent.source} />
                </div>
                <p>d{classContent.hitDie} Hit Die · {abilityLabel(classContent.primaryAbility)}</p>
                <p>{features.length} feature{features.length === 1 ? '' : 's'} · {providers.length ? providers.length + ' Spellcasting provider' + (providers.length === 1 ? '' : 's') : 'No Spellcasting provider'}</p>
                <div className="form-actions">
                  {mutationsLocked ? <button className="button button--secondary" type="button" disabled>Edit</button> : <Link className="button button--secondary" to={'/creator-forge/classes/' + encodeURIComponent(classContent.id) + '/edit'}>Edit</Link>}
                  {mutationsLocked ? <button className="button button--secondary" type="button" disabled>Duplicate</button> : <Link className="button button--secondary" to={'/creator-forge/classes/new?duplicate=' + encodeURIComponent(classContent.id)}>Duplicate</Link>}
                  <button className="button button--secondary" type="button" disabled={mutationsLocked} onClick={() => setDeleteTarget(classContent)}>Delete</button>
                </div>
              </article>
            );
          })}
        </section>
      )}
      {deleteTarget ? <CreatorForgeDeletePanel entry={deleteTarget} onCancel={() => setDeleteTarget(null)} onDeleted={() => setDeleteTarget(null)} /> : null}
    </div>
  );
}
