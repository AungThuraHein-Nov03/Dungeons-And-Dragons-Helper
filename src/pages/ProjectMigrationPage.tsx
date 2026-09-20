import { useMemo, useState } from 'react';
import { CreatorForgeNav } from '../components/CreatorForgeNav';
import { getPersistenceBackend } from '../services/persistenceBackend';
import {
  executeProjectMigration,
  loadPreservedLegacyContentExport,
  planProjectMigration,
  readLegacyBrowserMigrationSources,
  type LegacyMigrationSources,
  type MigrationItem,
} from '../services/projectMigration';

function summary(items: readonly MigrationItem[]) {
  return {
    additions: items.filter((item) => item.classification === 'addition').length,
    identical: items.filter((item) => item.classification === 'identical').length,
    conflicts: items.filter((item) => item.classification === 'conflict').length,
  };
}

function MigrationItems({ title, items }: { title: string; items: readonly MigrationItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="panel form-section" aria-label={title}>
      <div className="section-heading">
        <h2>{title}</h2>
      </div>
      <div className="feat-editor__list">
        {items.map((item, index) => (
          <article className="feat-editor__card" key={item.id + ':' + index}>
            <div className="feat-editor__header">
              <div>
                <span className="eyebrow">{item.classification === 'identical' ? 'IDENTICAL / NO-OP' : item.classification.toUpperCase()}</span>
                <h3>{item.name}</h3>
                <small>{item.id}</small>
                {item.message ? <p className="field-hint">{item.message}</p> : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ProjectMigrationPage() {
  const projectMode = getPersistenceBackend() === 'project';
  const [sources, setSources] = useState<LegacyMigrationSources | null>(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [inspectError, setInspectError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState('');

  const plan = useMemo(() => sources ? planProjectMigration(sources) : null, [sources]);
  const contentSummary = summary(plan?.contentItems ?? []);
  const characterSummary = summary(plan?.characterItems ?? []);

  function inspectBrowserLegacy() {
    setInspectError('');
    setResult('');
    setConfirmed(false);
    const loaded = readLegacyBrowserMigrationSources();
    if (!loaded.ok) {
      setSources(null);
      setInspectError(loaded.message);
      return;
    }
    setSourceLabel('Legacy browser-local stores');
    setSources(loaded.sources);
  }

  async function inspectPreservedExport() {
    setInspectError('');
    setResult('');
    setConfirmed(false);
    const loaded = await loadPreservedLegacyContentExport();
    if (!loaded.ok) {
      setSources(null);
      setInspectError(loaded.message);
      return;
    }
    setSourceLabel('Preserved project-root content export');
    setSources({ content: loaded.content, characters: [] });
  }

  async function confirmMigration() {
    if (!plan || !plan.ok || !confirmed || pending) return;
    setPending(true);
    setResult('');
    const migrated = await executeProjectMigration(plan);
    setPending(false);
    if (!migrated.ok) {
      setResult(migrated.message);
      return;
    }
    setResult('Migration complete: ' + migrated.contentAdded + ' content addition(s), ' + migrated.charactersAdded + ' Character addition(s). Legacy source data was preserved.');
    setConfirmed(false);
  }

  return (
    <div className="stack-page creator-forge-page">
      <CreatorForgeNav />
      <header className="page-heading">
        <span className="eyebrow">Creator Forge · Project Persistence</span>
        <h1>Legacy Migration</h1>
        <p>Explicitly inspect canonical legacy data, review additions/no-ops/conflicts, then confirm a bounded copy into project persistence.</p>
      </header>

      {!projectMode ? (
        <div className="form-alert" role="status">Project migration is available only while the project persistence backend is active. Browser-local storage remains unchanged.</div>
      ) : (
        <>
          <section className="panel form-section" aria-labelledby="migration-source-heading">
            <div className="section-heading">
              <span className="eyebrow">Explicit source selection</span>
              <h2 id="migration-source-heading">Inspect legacy data</h2>
              <p>Nothing is read or migrated automatically when this page opens.</p>
            </div>
            <div className="form-actions">
              <button className="button button--primary" type="button" onClick={inspectBrowserLegacy}>Inspect legacy browser data</button>
              <button className="button button--secondary" type="button" onClick={() => void inspectPreservedExport()}>Load preserved Eldritch Knight export</button>
            </div>
          </section>

          {inspectError ? <div className="form-alert" role="alert">{inspectError}</div> : null}

          {plan ? (
            <>
              <section className="panel form-section" aria-labelledby="migration-plan-heading">
                <div className="section-heading">
                  <span className="eyebrow">{sourceLabel}</span>
                  <h2 id="migration-plan-heading">Migration plan</h2>
                  <p>Legacy content: <strong>{plan.sourceContentCount}</strong> · Legacy Characters: <strong>{plan.sourceCharacterCount}</strong></p>
                </div>
                <div className="choice-grid">
                  <article className="choice-card">
                    <span><strong>Content</strong><small>{contentSummary.additions} additions · {contentSummary.identical} identical/no-op · {contentSummary.conflicts} conflicts</small></span>
                  </article>
                  <article className="choice-card">
                    <span><strong>Characters</strong><small>{characterSummary.additions} additions · {characterSummary.identical} identical/no-op · {characterSummary.conflicts} conflicts</small></span>
                  </article>
                </div>
              </section>

              <MigrationItems title="Content classification" items={plan.contentItems} />
              <MigrationItems title="Character classification" items={plan.characterItems} />

              {plan.blockers.length > 0 ? (
                <div className="form-alert" role="alert">
                  <strong>Migration blocked.</strong>
                  <ul>{plan.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
                </div>
              ) : (
                <section className="panel form-section" aria-labelledby="migration-confirm-heading">
                  <div className="section-heading">
                    <h2 id="migration-confirm-heading">Confirm migration</h2>
                    <p>This copies safe additions only. Existing identical IDs remain no-ops, and legacy source data is not cleared or deleted.</p>
                  </div>
                  <label className="choice-card">
                    <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                    <span><strong>I reviewed this migration plan.</strong><small>Persist the complete prospective project content and Character datasets.</small></span>
                  </label>
                  <div className="form-actions">
                    <button className="button button--primary" type="button" disabled={!confirmed || pending} onClick={() => void confirmMigration()}>
                      {pending ? 'Migrating…' : 'Migrate to Project'}
                    </button>
                  </div>
                </section>
              )}
            </>
          ) : null}

          {result ? <div className={result.startsWith('Migration complete') ? 'form-success' : 'form-alert'} role="status">{result}</div> : null}
        </>
      )}
    </div>
  );
}
