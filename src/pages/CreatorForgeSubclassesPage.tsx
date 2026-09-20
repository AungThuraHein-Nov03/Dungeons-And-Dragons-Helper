import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CreatorForgeDeletePanel } from '../components/CreatorForgeDeletePanel';
import { CreatorForgeNav } from '../components/CreatorForgeNav';
import { SourceBadge } from '../components/SourceBadge';
import type { SubclassContent } from '../models/content';
import { contentRegistry } from '../services/contentRegistry';
import { projectContentMutationsAreLocked } from '../services/persistenceBackend';

export function CreatorForgeSubclassesPage() {
  const mutationsLocked = projectContentMutationsAreLocked();
  const [deleteTarget, setDeleteTarget] = useState<SubclassContent | null>(null);
  const subclasses = contentRegistry.getAll('subclass')
    .filter((subclass) => subclass.source.type === 'homebrew')
    .sort((left, right) => left.name.localeCompare(right.name));

  return (
    <div className="stack-page creator-forge-page">
      <CreatorForgeNav />
      <header className="page-heading page-heading--actions">
        <div>
          <span className="eyebrow">Creator Forge · Subclasses</span>
          <h1>Custom Subclasses</h1>
          <p>Manage authored Subclasses only. Bundled SRD Subclasses remain read-only in the Compendium.</p>
        </div>
        {mutationsLocked ? <button className="button button--primary" type="button" disabled>Create Subclass</button> : <Link className="button button--primary" to="/creator-forge/subclasses/new">Create Subclass</Link>}
      </header>

      {mutationsLocked && <div className="form-alert" role="status">Project content is read-only during Phase B. Forge mutations unlock in Phase C.</div>}
      {subclasses.length === 0 ? (
        <section className="empty-state panel">
          <div className="empty-state__icon" aria-hidden="true">+</div>
          <h2>No custom Subclasses yet</h2>
          <p>Create a Subclass to add canonical homebrew content to the effective registry.</p>
          {mutationsLocked ? <button className="button button--primary" type="button" disabled>Create Subclass</button> : <Link className="button button--primary" to="/creator-forge/subclasses/new">Create Subclass</Link>}
        </section>
      ) : (
        <section className="content-list" aria-label="Custom Subclasses">
          {subclasses.map((subclass) => {
            const parent = contentRegistry.findClass(subclass.parentClassId);
            const featureCount = subclass.progression.reduce((count, row) => count + row.features.length, 0);
            return (
              <article className="forge-list-row panel" key={subclass.id}>
                <div className="forge-list-row__content">
                  <SourceBadge source={subclass.source} />
                  <h2>{subclass.name}</h2>
                  <p>{parent?.name ?? subclass.parentClassId} · Class level {subclass.acquisitionLevel} · {featureCount} feature{featureCount === 1 ? '' : 's'}</p>
                </div>
                <div className="forge-list-row__actions">
                  {mutationsLocked ? <button className="button button--secondary" type="button" disabled>Edit</button> : <Link className="button button--secondary" to={'/creator-forge/subclasses/' + encodeURIComponent(subclass.id) + '/edit'}>Edit</Link>}
                  {mutationsLocked ? <button className="button button--secondary" type="button" disabled>Duplicate</button> : <Link className="button button--secondary" to={'/creator-forge/subclasses/new?duplicate=' + encodeURIComponent(subclass.id)}>Duplicate</Link>}
                  <button className="button button--secondary" type="button" disabled={mutationsLocked} onClick={() => setDeleteTarget(subclass)}>Delete</button>
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
