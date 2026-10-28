import { useState } from 'react';
import type { ContentEntry } from '../models/content';
import {
  deleteAndPublishApplicationContent,
  preflightApplicationContentDelete,
  type ContentCatalogDeletePreflightResult,
} from '../services/contentCatalog';

type ForgeDeletableEntry = Extract<ContentEntry, { kind: 'feat' | 'spell' | 'subclass' | 'class' | 'weapon' | 'armor' | 'equipment' }>;

function familyLabel(entry: ForgeDeletableEntry): string {
  if (entry.kind === 'feat') return 'Feat';
  if (entry.kind === 'spell') return 'Spell';
  if (entry.kind === 'subclass') return 'Subclass';
  if (entry.kind === 'class') return 'Class';
  if (entry.kind === 'weapon') return 'Weapon';
  if (entry.kind === 'armor') return entry.category === 'shield' ? 'Shield' : 'Armor';
  return 'Equipment';
}

export function CreatorForgeDeletePanel({
  entry,
  onCancel,
  onDeleted,
}: {
  entry: ForgeDeletableEntry;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [preflight] = useState<ContentCatalogDeletePreflightResult>(() => preflightApplicationContentDelete(entry.id));
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function confirmDelete() {
    const result = await deleteAndPublishApplicationContent(entry.id);
    if (!result.ok) {
      setDeleteError(result.error.message);
      return;
    }
    onDeleted();
  }

  const family = familyLabel(entry);

  return (
    <section className="panel form-section forge-delete-panel" role="dialog" aria-modal="true" aria-labelledby="forge-delete-title">
      <div className="section-heading">
        <span className="eyebrow">Creator Forge · Delete {family}</span>
        <h2 id="forge-delete-title">{preflight.ok ? 'Delete "' + entry.name + '"?' : 'Cannot delete "' + entry.name + '"'}</h2>
        {preflight.ok ? (
          <p>
            This permanently removes this custom {family} from the active content store.
            Creator Forge will not modify Characters, delete dependents, or choose replacements.
          </p>
        ) : (
          <p>The operation is blocked because surviving data depends on this {family}, or the authoritative state cannot be analyzed safely.</p>
        )}
      </div>

      {preflight.ok ? (
        <div className="forge-reference-note">
          <strong>Safe preflight.</strong> No persisted Character or surviving canonical content depends on this {family}.
        </div>
      ) : (
        <div className="forge-delete-blockers" aria-label="Delete blockers">
          <strong>Used by:</strong>
          <ul>
            {preflight.error.blockers?.map((blocker, index) => (
              <li key={blocker.sourceType + ':' + blocker.sourceId + ':' + blocker.referenceKind + ':' + index}>
                <span>{blocker.message}</span>
                {blocker.path ? <small className="forge-identity">{blocker.path}</small> : null}
              </li>
            )) ?? <li>{preflight.error.message}</li>}
          </ul>
        </div>
      )}

      {deleteError ? <p className="form-error" role="alert">{deleteError}</p> : null}

      <div className="forge-review-actions">
        <button className="button button--secondary" type="button" onClick={onCancel}>Cancel</button>
        {preflight.ok ? (
          <button className="button button--danger" type="button" onClick={confirmDelete}>Confirm Delete</button>
        ) : null}
      </div>
    </section>
  );
}
