import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CreatorForgeNav } from '../components/CreatorForgeNav';
import { SubclassForgeFeatureEditor } from '../components/SubclassForgeFeatureEditor';
import {
  allParentClasses,
  buildSubclassContentFromDraft,
  classDisplayName,
  createSubclassFeatureDraft,
  createSubclassForgeDraft,
  duplicateSubclassForgeDraft,
  loadSubclassForgeDraft,
  parentAcquisitionConstraint,
  validateSubclassForgeDraft,
  type SubclassForgeDraft,
  type SubclassForgeFeatureDraft,
} from '../components/subclassForgeModel';
import { collectSpellListOptions } from '../components/spellForgeModel';
import type { ContentId } from '../models/contentId';
import { upsertAndPublishApplicationContent } from '../services/contentCatalog';
import { contentRegistry } from '../services/contentRegistry';

interface InitialDraftState {
  readonly mode: 'create' | 'edit' | 'duplicate';
  readonly draft?: SubclassForgeDraft;
  readonly error?: string;
}

function resolveInitialDraft(contentId: string | undefined, duplicateId: string | null): InitialDraftState {
  if (contentId) {
    const subclass = contentRegistry.findSubclass(decodeURIComponent(contentId));
    if (!subclass) return { mode: 'edit', error: 'Custom Subclass not found.' };
    const loaded = loadSubclassForgeDraft(subclass);
    return loaded.ok ? { mode: 'edit', draft: loaded.draft } : { mode: 'edit', error: loaded.message };
  }
  if (duplicateId) {
    const subclass = contentRegistry.findSubclass(duplicateId);
    if (!subclass || subclass.source.type !== 'homebrew') {
      return { mode: 'duplicate', error: 'Only an existing custom Subclass can be duplicated.' };
    }
    const duplicated = duplicateSubclassForgeDraft(subclass);
    return duplicated.ok ? { mode: 'duplicate', draft: duplicated.draft } : { mode: 'duplicate', error: duplicated.message };
  }
  return { mode: 'create', draft: createSubclassForgeDraft(contentRegistry) };
}

function replaceFeature(
  values: readonly SubclassForgeFeatureDraft[],
  next: SubclassForgeFeatureDraft,
): SubclassForgeFeatureDraft[] {
  return values.map((value) => value.draftId === next.draftId ? next : value);
}

function summarizeFeature(feature: SubclassForgeFeatureDraft) {
  return {
    automated: [
      feature.staticEffects.length ? feature.staticEffects.length + ' static effect' + (feature.staticEffects.length === 1 ? '' : 's') : '',
      feature.diceEffects.length ? feature.diceEffects.length + ' dice transformation' + (feature.diceEffects.length === 1 ? '' : 's') : '',
      feature.resources.length ? feature.resources.length + ' resource' + (feature.resources.length === 1 ? '' : 's') : '',
      feature.consumers.length ? feature.consumers.length + ' consumer/action' + (feature.consumers.length === 1 ? '' : 's') : '',
      feature.transactions.length ? feature.transactions.length + ' transaction' + (feature.transactions.length === 1 ? '' : 's') : '',
      feature.activeEffects.length ? feature.activeEffects.length + ' active self effect' + (feature.activeEffects.length === 1 ? '' : 's') : '',
      feature.providers.length ? feature.providers.length + ' Spellcasting provider' + (feature.providers.length === 1 ? '' : 's') : '',
      feature.spellGrants.length ? feature.spellGrants.length + ' granted-Spell group' + (feature.spellGrants.length === 1 ? '' : 's') : '',
    ].filter(Boolean),
    manual: feature.referenceEffects,
  };
}

function SubclassForgeReview({
  draft,
  onBack,
  onSave,
  saveError,
}: {
  draft: SubclassForgeDraft;
  onBack: () => void;
  onSave: () => void;
  saveError: string | null;
}) {
  const parentName = classDisplayName(contentRegistry, draft.parentClassId);
  return (
    <div className="forge-review">
      <section className="panel form-section">
        <div className="section-heading">
          <span className="eyebrow">Review</span>
          <h2>{draft.name}</h2>
          <p>Review is semantic only. Save is the single persistence/publication point.</p>
        </div>
        <dl className="detail-list">
          <div><dt>Content ID</dt><dd className="forge-identity">{draft.id}</dd></div>
          <div><dt>Source</dt><dd>Homebrew · {draft.sourceNamespace}</dd></div>
          <div><dt>Parent Class</dt><dd>{parentName}</dd></div>
          <div><dt>Acquisition</dt><dd>{parentName} Class level {draft.acquisitionLevel}</dd></div>
          <div><dt>Description</dt><dd>{draft.description}</dd></div>
        </dl>
      </section>

      <section className="panel form-section">
        <div className="section-heading">
          <span className="eyebrow">Ordered Features</span>
          <h2>Subclass progression</h2>
          <p>Feature owner level is the parent Class progression level. No Forge-specific owner calculation is stored.</p>
        </div>
        <div className="forge-review-feature-list">
          {draft.features.map((feature, index) => {
            const summary = summarizeFeature(feature);
            return (
              <article className="forge-review-feature" key={feature.draftId}>
                <div>
                  <span className="eyebrow">#{index + 1} · Class level {feature.level}</span>
                  <h3>{feature.name}</h3>
                  <p>{feature.description}</p>
                  <small className="forge-identity">{feature.id}</small>
                </div>
                <div className="detail-grid">
                  <div className="forge-review-card--automated detail-card">
                    <strong>AUTOMATED</strong>
                    {summary.automated.length
                      ? summary.automated.map((line) => <p key={line}>{line}</p>)
                      : <p>No executable mechanics.</p>}
                    {feature.resources.map((entry) => <p key={entry.definition.id}>Resource: {entry.definition.name}</p>)}
                    {feature.consumers.map((entry) => <p key={entry.grant.consumer.id}>Action: {entry.grant.consumer.name}</p>)}
                    {feature.transactions.map((entry) => <p key={entry.definition.id}>Transaction: {entry.definition.name}</p>)}
                    {feature.activeEffects.map((entry) => <p key={entry.definition.id}>Self effect: {entry.definition.name}</p>)}
                    {feature.providers.map((entry) => <p key={entry.definition.id}>Provider: {entry.definition.name} · {entry.definition.multiclassSlotContribution.kind === 'spellcasting' ? entry.definition.multiclassSlotContribution.contribution : entry.definition.multiclassSlotContribution.kind}</p>)}
                    {feature.spellGrants.map((entry) => <p key={entry.draftId}>Granted Spells: {entry.grant.spellIds.map((id) => contentRegistry.findSpell(id)?.name ?? id).join(', ')}</p>)}
                  </div>
                  <div className="forge-review-card--reference detail-card">
                    <strong>MANUAL / REFERENCE</strong>
                    {summary.manual.length
                      ? summary.manual.map((effect) => <div key={effect.draftId}><strong>{effect.name}</strong><p>{effect.description}</p></div>)
                      : <p>No manual/reference entries.</p>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel form-section forge-unsupported">
        <span className="eyebrow">Boundaries</span>
        <h2>Deliberately not machine-authored</h2>
        <p>Generic feature choices and arbitrary feat grants are not implemented. Existing exact M15 feat-acquisition conventions are preserved if already present in loaded content, but M16-E does not create a new feat-choice or acquisition system.</p>
      </section>

      {saveError && <div className="form-alert" role="alert">{saveError}</div>}
      <div className="forge-review-actions">
        <button className="button button--secondary" type="button" onClick={onBack}>Back to Edit</button>
        <button className="button button--primary" type="button" onClick={onSave}>Save Subclass</button>
      </div>
    </div>
  );
}

export function SubclassForgePage() {
  const { contentId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [initial] = useState<InitialDraftState>(() => resolveInitialDraft(contentId, searchParams.get('duplicate')));
  const [draft, setDraft] = useState<SubclassForgeDraft | null>(() => initial.draft ?? null);
  const [stage, setStage] = useState<'edit' | 'review'>('edit');
  const [validationErrors, setValidationErrors] = useState<readonly string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!draft || initial.error) {
    return (
      <div className="stack-page creator-forge-page">
        <CreatorForgeNav />
        <section className="empty-state panel">
          <h1>Subclass Forge unavailable</h1>
          <p>{initial.error ?? 'The requested Subclass could not be loaded.'}</p>
          <Link className="button button--secondary" to="/creator-forge/subclasses">Back to Custom Subclasses</Link>
        </section>
      </div>
    );
  }

  const classes = allParentClasses(contentRegistry);
  const spellLists = collectSpellListOptions(contentRegistry);
  const spells = [...contentRegistry.getAll('spell')].sort((left, right) => left.level - right.level || left.name.localeCompare(right.name));
  const acquisitionConstraint = parentAcquisitionConstraint(contentRegistry, draft.parentClassId);
  const parentEditLocked = initial.mode === 'duplicate';
  const modeLabel = initial.mode === 'edit' ? 'Edit Subclass' : initial.mode === 'duplicate' ? 'Duplicate Subclass' : 'Create Subclass';

  function updateParent(parentClassId: ContentId) {
    if (parentEditLocked || !draft) return;
    const constraint = parentAcquisitionConstraint(contentRegistry, parentClassId);
    const acquisitionLevel = constraint.level;
    setDraft({
      ...draft,
      parentClassId,
      acquisitionLevel,
      features: draft.features.map((feature) => ({
        ...feature,
        level: Math.max(acquisitionLevel, feature.level),
      })),
    });
  }

  function updateFeature(next: SubclassForgeFeatureDraft) {
    setDraft((current) => current ? { ...current, features: replaceFeature(current.features, next) } : current);
  }

  function moveFeature(index: number, direction: -1 | 1) {
    setDraft((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.features.length) return current;
      const features = [...current.features];
      [features[index], features[target]] = [features[target], features[index]];
      return { ...current, features };
    });
  }

  function review() {
    if (!draft) return;
    const errors = validateSubclassForgeDraft(draft, contentRegistry);
    setValidationErrors(errors);
    setSaveError(null);
    if (errors.length === 0) setStage('review');
  }

  async function save() {
    if (!draft) return;
    const errors = validateSubclassForgeDraft(draft, contentRegistry);
    if (errors.length > 0) {
      setValidationErrors(errors);
      setStage('edit');
      return;
    }
    const subclass = buildSubclassContentFromDraft(draft);
    const result = await upsertAndPublishApplicationContent(subclass);
    if (!result.ok) {
      const issues = result.error.storageError?.issues?.map((issue) => issue.message).join(' ');
      setSaveError(issues ? result.error.message + ' ' + issues : result.error.message);
      return;
    }
    navigate('/creator-forge/subclasses');
  }

  if (stage === 'review') {
    return (
      <div className="stack-page creator-forge-page">
        <CreatorForgeNav />
        <header className="page-heading">
          <span className="eyebrow">Creator Forge · Subclass Review</span>
          <h1>Review before Save</h1>
          <p>Automated mechanics use existing owner-aware rules. Manual/reference content remains table-managed.</p>
        </header>
        <SubclassForgeReview draft={draft} onBack={() => { setStage('edit'); setSaveError(null); }} onSave={save} saveError={saveError} />
      </div>
    );
  }

  return (
    <div className="stack-page creator-forge-page">
      <CreatorForgeNav />
      <header className="page-heading page-heading--actions">
        <div>
          <span className="eyebrow">Creator Forge · Subclasses</span>
          <h1>{modeLabel}</h1>
          <p>The draft is ephemeral. Save publishes canonical SubclassContent through the existing M16-B catalog authority.</p>
        </div>
        <Link className="button button--secondary" to="/creator-forge/subclasses">Cancel</Link>
      </header>

      {validationErrors.length > 0 && <div className="form-alert" role="alert">{validationErrors.map((error) => <div key={error}>{error}</div>)}</div>}

      <section className="panel form-section">
        <div className="section-heading">
          <span className="eyebrow">Identity</span>
          <h2>Stable canonical identity</h2>
          <p>Rename preserves ID. On Edit, parent/acquisition changes are allowed only when M16-G referential preflight proves the prospective catalog and persisted Characters remain valid; no migration or remapping occurs.</p>
        </div>
        <dl className="detail-list">
          <div><dt>Content ID</dt><dd className="forge-identity">{draft.id}</dd></div>
          <div><dt>Kind</dt><dd>Subclass</dd></div>
          <div><dt>Source</dt><dd>Homebrew · {draft.sourceNamespace}</dd></div>
        </dl>
      </section>

      <section className="panel form-section">
        <div className="section-heading"><span className="eyebrow">Core</span><h2>Subclass details</h2></div>
        <div className="field-grid field-grid--two">
          <label className="field"><span>Name</span><input aria-label="Subclass name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label className="field"><span>Parent Class</span><select aria-label="Parent Class" disabled={parentEditLocked} value={draft.parentClassId} onChange={(event) => updateParent(event.target.value)}>{classes.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.source.type === 'homebrew' ? ' · Homebrew' : ''}</option>)}</select></label>
        </div>
        <label className="field forge-field-block"><span>Description</span><textarea aria-label="Subclass description" rows={4} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>

        <div className="forge-subsection">
          <label className="field forge-field-small">
            <span>Subclass acquisition — parent Class level</span>
            <input
              aria-label="Subclass acquisition level"
              type="number"
              min="1"
              max="20"
              disabled={parentEditLocked || acquisitionConstraint.locked}
              value={draft.acquisitionLevel}
              onChange={(event) => {
                const acquisitionLevel = Number(event.target.value);
                setDraft({ ...draft, acquisitionLevel, features: draft.features.map((feature) => ({ ...feature, level: Math.max(acquisitionLevel, feature.level) })) });
              }}
            />
          </label>
          <p className="field-hint">{parentEditLocked ? 'Duplicate keeps its copied acquisition authority during this bounded editor flow. ' : 'Edit changes are checked against persisted Characters and the prospective canonical catalog before Save. '}{acquisitionConstraint.reason}</p>
        </div>
      </section>

      <section className="panel form-section">
        <div className="section-heading">
          <span className="eyebrow">Progression</span>
          <h2>Ordered Subclass features</h2>
          <p>Levels are parent Class levels. Reordering and renaming never change feature IDs.</p>
        </div>
        <button className="button button--secondary" type="button" onClick={() => setDraft({ ...draft, features: [...draft.features, createSubclassFeatureDraft(draft.acquisitionLevel)] })}>Add Subclass Feature</button>
      </section>

      <div className="subclass-forge-feature-list">
        {draft.features.map((feature, index) => (
          <SubclassForgeFeatureEditor
            key={feature.draftId}
            draft={draft}
            feature={feature}
            index={index}
            featureCount={draft.features.length}
            spellLists={spellLists}
            spells={spells}
            onChange={updateFeature}
            onMove={(direction) => moveFeature(index, direction)}
            onRemove={() => setDraft({ ...draft, features: draft.features.filter((candidate) => candidate.draftId !== feature.draftId) })}
          />
        ))}
      </div>

      <section className="panel form-section forge-unsupported">
        <div className="section-heading"><span className="eyebrow">Deferred</span><h2>Generic feature choices are not a Forge contract</h2></div>
        <p>Choice branches such as choosing a fighting technique, damage type, proficiency, or one of several feature paths remain manual/reference-only unless the existing canonical runtime already has an exact machine-readable contract. M16-E adds no universal feature-choice engine.</p>
      </section>

      <div className="forge-review-actions">
        <Link className="button button--secondary" to="/creator-forge/subclasses">Cancel</Link>
        <button className="button button--primary" type="button" onClick={review}>Review Subclass</button>
      </div>
    </div>
  );
}
