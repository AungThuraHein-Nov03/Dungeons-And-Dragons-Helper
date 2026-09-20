import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CreatorForgeDeletePanel } from '../components/CreatorForgeDeletePanel';
import { CreatorForgeNav } from '../components/CreatorForgeNav';
import { SourceBadge } from '../components/SourceBadge';
import type { FeatCategory, FeatContent } from '../models/content';
import { contentRegistry } from '../services/contentRegistry';
import { projectContentMutationsAreLocked } from '../services/persistenceBackend';

const CATEGORY_LABELS: Record<FeatCategory, string> = {
  origin: 'Origin',
  general: 'General',
  'fighting-style': 'Fighting Style',
  'epic-boon': 'Epic Boon',
};

export function CreatorForgeFeatsPage() {
  const mutationsLocked = projectContentMutationsAreLocked();
  const [deleteTarget, setDeleteTarget] = useState<FeatContent | null>(null);
  const feats = contentRegistry.getAll('feat')
    .filter((feat) => feat.source.type === 'homebrew')
    .sort((left, right) => left.name.localeCompare(right.name));

  return (
    <div className="stack-page creator-forge-page">
      <CreatorForgeNav />
      <header className="page-heading page-heading--actions">
        <div>
          <span className="eyebrow">Creator Forge · Feats</span>
          <h1>Custom Feats</h1>
          <p>Manage authored Feats only. Bundled SRD Feats remain read-only in the Compendium.</p>
        </div>
        {mutationsLocked ? <button className="button button--primary" type="button" disabled>Create Feat</button> : <Link className="button button--primary" to="/creator-forge/feats/new">Create Feat</Link>}
      </header>

      {mutationsLocked && <div className="form-alert" role="status">Project content is read-only during Phase B. Forge mutations unlock in Phase C.</div>}
      {feats.length === 0 ? (
        <section className="empty-state panel">
          <div className="empty-state__icon" aria-hidden="true">+</div>
          <h2>No custom Feats yet</h2>
          <p>Create a Feat to add canonical homebrew content to the effective registry.</p>
          {mutationsLocked ? <button className="button button--primary" type="button" disabled>Create Feat</button> : <Link className="button button--primary" to="/creator-forge/feats/new">Create Feat</Link>}
        </section>
      ) : (
        <section className="content-list" aria-label="Custom Feats">
          {feats.map((feat) => (
            <article className="forge-list-row panel" key={feat.id}>
              <div className="forge-list-row__content">
                <SourceBadge source={feat.source} />
                <h2>{feat.name}</h2>
                <p>{CATEGORY_LABELS[feat.category]} · {feat.effects.length} automated effect{feat.effects.length === 1 ? '' : 's'} · {feat.referenceEffects.length} reference-only effect{feat.referenceEffects.length === 1 ? '' : 's'}</p>
              </div>
              <div className="forge-list-row__actions">
                {mutationsLocked ? <button className="button button--secondary" type="button" disabled>Edit</button> : <Link className="button button--secondary" to={'/creator-forge/feats/' + encodeURIComponent(feat.id) + '/edit'}>Edit</Link>}
                {mutationsLocked ? <button className="button button--secondary" type="button" disabled>Duplicate</button> : <Link className="button button--secondary" to={'/creator-forge/feats/new?duplicate=' + encodeURIComponent(feat.id)}>Duplicate</Link>}
                <button className="button button--secondary" type="button" disabled={mutationsLocked} onClick={() => setDeleteTarget(feat)}>Delete</button>
              </div>
            </article>
          ))}
        </section>
      )}
      {deleteTarget ? <CreatorForgeDeletePanel entry={deleteTarget} onCancel={() => setDeleteTarget(null)} onDeleted={() => setDeleteTarget(null)} /> : null}
    </div>
  );
}
