import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CreatorForgeNav } from '../components/CreatorForgeNav';
import {
  DICE_TRANSFORMATION_LABELS,
  FeatForgeDiceEffectEditor,
  FeatForgeStaticEffectEditor,
  STATIC_EFFECT_LABELS,
} from '../components/FeatForgeEffectEditors';
import {
  FEAT_FORGE_CATEGORIES,
  allAbilities,
  buildFeatContentFromDraft,
  createAbilityPrerequisiteDraft,
  createAsiDraft,
  createDiceEffectDraft,
  createFeatForgeDraft,
  createFeaturePrerequisiteDraft,
  createLevelPrerequisiteDraft,
  createReferenceEffectDraft,
  createStaticEffectDraft,
  duplicateFeatForgeDraft,
  loadFeatForgeDraft,
  toggleAbility,
  validateFeatForgeDraft,
  type FeatForgeCategory,
  type FeatForgeDiceEffectDraft,
  type FeatForgeDiceTransformationType,
  type FeatForgeDraft,
  type FeatForgePrerequisiteDraft,
  type FeatForgeReferenceEffectDraft,
  type FeatForgeStaticEffectDraft,
  type FeatForgeStaticEffectType,
} from '../components/featForgeModel';
import type { AbilityKey } from '../models/character';
import { SKILL_DEFINITIONS } from '../rules/skills';
import { upsertAndPublishApplicationContent } from '../services/contentCatalog';
import { contentRegistry } from '../services/contentRegistry';

const CATEGORY_LABELS: Record<FeatForgeCategory, string> = {
  origin: 'Origin',
  general: 'General',
  'fighting-style': 'Fighting Style',
  'epic-boon': 'Epic Boon',
};

const ABILITY_LABELS: Record<AbilityKey, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma',
};

interface InitialDraftState {
  readonly mode: 'create' | 'edit' | 'duplicate';
  readonly draft?: FeatForgeDraft;
  readonly error?: string;
}

function resolveInitialDraft(contentId: string | undefined, duplicateId: string | null): InitialDraftState {
  if (contentId) {
    const feat = contentRegistry.findFeat(decodeURIComponent(contentId));
    if (!feat) return { mode: 'edit', error: 'Custom Feat not found.' };
    const loaded = loadFeatForgeDraft(feat);
    return loaded.ok ? { mode: 'edit', draft: loaded.draft } : { mode: 'edit', error: loaded.message };
  }
  if (duplicateId) {
    const feat = contentRegistry.findFeat(duplicateId);
    if (!feat || feat.source.type !== 'homebrew') return { mode: 'duplicate', error: 'Only an existing custom Feat can be duplicated.' };
    const duplicated = duplicateFeatForgeDraft(feat);
    return duplicated.ok ? { mode: 'duplicate', draft: duplicated.draft } : { mode: 'duplicate', error: duplicated.message };
  }
  return { mode: 'create', draft: createFeatForgeDraft() };
}

function AbilityChecks({
  values,
  onChange,
  label,
}: {
  values: readonly AbilityKey[];
  onChange: (values: AbilityKey[]) => void;
  label: string;
}) {
  return (
    <fieldset className="forge-check-group">
      <legend>{label}</legend>
      <div className="forge-check-grid">
        {allAbilities().map((ability) => (
          <label className="forge-check" key={ability}>
            <input type="checkbox" checked={values.includes(ability)} onChange={() => onChange(toggleAbility(values, ability))} />
            <span>{ABILITY_LABELS[ability]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function formatPrerequisite(prerequisite: FeatForgePrerequisiteDraft): string {
  if (prerequisite.type === 'level') return 'Level ' + prerequisite.minimum + '+';
  if (prerequisite.type === 'ability-minimum') {
    return prerequisite.abilities.map((ability) => ABILITY_LABELS[ability]).join(' or ') + ' ' + prerequisite.minimum + '+';
  }
  return prerequisite.name + ' · reference only; not automatically evaluated';
}

function formatStaticEffect(entry: FeatForgeStaticEffectDraft): string {
  const effect = entry.effect;
  if (effect.type === 'attack-roll-bonus') return (effect.amount >= 0 ? '+' : '') + effect.amount + ' to ranged weapon attack rolls.';
  if (effect.type === 'armor-class-bonus') return (effect.amount >= 0 ? '+' : '') + effect.amount + ' AC while wearing ' + effect.armorCategories.join(', ') + ' armor.';
  if (effect.type === 'skill-check-advantage') return 'Advantage on ' + effect.skillIds.map((skill) => SKILL_DEFINITIONS[skill].name).join(', ') + ' checks.';
  if (effect.type === 'saving-throw-roll-mode') return effect.mode + ' on ' + effect.abilities.map((ability) => ABILITY_LABELS[ability]).join(', ') + ' saving throws.';
  if (effect.type === 'saving-throw-proficiency') return 'Saving throw proficiency: ' + effect.abilities.map((ability) => ABILITY_LABELS[ability]).join(', ') + '.';
  if (effect.type === 'initiative-modifier') return (effect.amount >= 0 ? '+' : '') + effect.amount + ' to Initiative.';
  if (effect.type === 'initiative-proficiency') return 'Add Proficiency Bonus to Initiative.';
  if (effect.type === 'initiative-half-proficiency') return 'Add half Proficiency Bonus to Initiative when applicable.';
  if (effect.type === 'initiative-roll-mode') return effect.mode + ' on Initiative.';
  if (effect.type === 'hit-point-bonus-per-class-level') return '+' + effect.amount + ' maximum HP per class level.';
  if (effect.type === 'speed-bonus') {
    const amount = effect.amount.kind === 'fixed'
      ? effect.amount.amount + ' feet'
      : 'level table: ' + effect.amount.values.map((row) => 'L' + row.level + ' +' + row.amount).join(', ');
    const conditions = [
      ...(effect.disallowedArmorCategories ?? []).map((category) => 'not ' + category + ' armor'),
      ...(effect.requireNoShield ? ['no shield'] : []),
    ];
    return 'Speed bonus ' + amount + (conditions.length ? ' (' + conditions.join(', ') + ')' : '') + '.';
  }
  if (effect.type === 'critical-threshold') return 'Weapon critical threshold ' + effect.minimumNatural + '-20.';
  return 'Unarmored AC ' + effect.base + ' + ' + effect.abilities.map((ability) => ABILITY_LABELS[ability]).join(' + ') + ' modifiers' + (effect.allowShield ? '; shield allowed.' : '; no shield.');
}

function formatDiceEffect(entry: FeatForgeDiceEffectDraft): string {
  const effect = entry.effect;
  if (effect.transformation.type === 'reroll-once-use-new') {
    const target = effect.target.kind === 'skill-check'
      ? 'skill checks' + (effect.target.requireProficiency ? ' with proficiency' : '')
      : 'D20 Tests';
    return 'Reroll d20 face' + (effect.transformation.qualifyingFaces.length === 1 ? ' ' : 's ') + effect.transformation.qualifyingFaces.join(', ') + ' once and use the new result for ' + target + (effect.optional ? ' (optional).' : '.');
  }
  const properties = effect.target.kind === 'weapon-damage' ? effect.target.anyWeaponProperties.join(' or ') : '';
  return 'Treat qualifying two-handed melee weapon damage die results below ' + effect.transformation.minimum + ' as ' + effect.transformation.minimum + ' for ' + properties + ' weapons' + (effect.optional ? ' (optional).' : '.');
}

function FeatForgeReview({
  draft,
  onBack,
  onSave,
  saveError,
}: {
  draft: FeatForgeDraft;
  onBack: () => void;
  onSave: () => void;
  saveError: string | null;
}) {
  return (
    <div className="forge-review">
      <section className="panel form-section">
        <div className="section-heading">
          <span className="eyebrow">Review</span>
          <h2>{draft.name}</h2>
          <p>No content has been persisted by entering Review. Save is the only commit point.</p>
        </div>
        <dl className="detail-list">
          <div><dt>Content ID</dt><dd className="forge-identity">{draft.id}</dd></div>
          <div><dt>Source</dt><dd>Homebrew · {draft.sourceNamespace}</dd></div>
          <div><dt>Category</dt><dd>{CATEGORY_LABELS[draft.category]}</dd></div>
          <div><dt>Repeatable</dt><dd>{draft.repeatable ? 'Yes' : 'No'}{draft.repeatable && draft.repeatabilityNote.trim() ? ' · ' + draft.repeatabilityNote.trim() : ''}</dd></div>
          <div><dt>Description</dt><dd>{draft.description}</dd></div>
        </dl>
      </section>

      <section className="detail-grid">
        <div className="panel detail-card">
          <span className="eyebrow">Prerequisites</span>
          <h2>Eligibility</h2>
          {draft.prerequisites.length === 0 ? <p>None.</p> : draft.prerequisites.map((prerequisite) => <p key={prerequisite.draftId}>{formatPrerequisite(prerequisite)}</p>)}
        </div>
        <div className="panel detail-card">
          <span className="eyebrow">Structured Choice</span>
          <h2>Ability Score Increase</h2>
          {draft.asi ? (
            <p>
              {draft.asi.selections} selection{draft.asi.selections === 1 ? '' : 's'} · +1 each · maximum {draft.asi.maximum} ·
              {' '}{draft.asi.allowedAbilities.map((ability) => ABILITY_LABELS[ability]).join(', ')}
              {draft.asi.selections === 2 ? draft.asi.allowDuplicateSelection ? ' · duplicate allowed' : ' · distinct selections' : ''}
            </p>
          ) : <p>No structured ASI choice.</p>}
          {draft.preservedReferenceChoices.length > 0 && (
            <p className="forge-reference-note">This edited Feat also preserves {draft.preservedReferenceChoices.length} pre-existing reference-only choice definition{draft.preservedReferenceChoices.length === 1 ? '' : 's'} without adding automation.</p>
          )}
        </div>
      </section>

      <section className="detail-grid">
        <div className="panel detail-card forge-review-card--automated">
          <span className="eyebrow">Automated</span>
          <h2>Existing rules engine</h2>
          {draft.asi && <p><strong>Ability Score Increase:</strong> structured selection consumed by the existing Feat rules.</p>}
          {draft.staticEffects.map((entry) => <p key={entry.draftId}><strong>{STATIC_EFFECT_LABELS[entry.effect.type]}:</strong> {formatStaticEffect(entry)}</p>)}
          {draft.diceEffects.map((entry) => <p key={entry.draftId}><strong>{DICE_TRANSFORMATION_LABELS[entry.effect.transformation.type]}:</strong> {formatDiceEffect(entry)}</p>)}
          {!draft.asi && draft.staticEffects.length === 0 && draft.diceEffects.length === 0 && <p>No automated mechanics.</p>}
        </div>
        <div className="panel detail-card forge-review-card--reference">
          <span className="eyebrow">Reference Only</span>
          <h2>Table-managed mechanics</h2>
          {draft.prerequisites.filter((prerequisite) => prerequisite.type === 'feature').map((prerequisite) => (
            <p key={prerequisite.draftId}><strong>Feature prerequisite:</strong> {prerequisite.type === 'feature' ? prerequisite.name : ''} — not automatically evaluated.</p>
          ))}
          {draft.referenceEffects.map((effect) => <div className="feat-detail-choice" key={effect.draftId}><strong>{effect.name}</strong><p>{effect.description}</p></div>)}
          {draft.prerequisites.every((prerequisite) => prerequisite.type !== 'feature') && draft.referenceEffects.length === 0 && draft.preservedReferenceChoices.length === 0 && <p>No reference-only mechanics.</p>}
          {draft.preservedReferenceChoices.map((choice) => <div className="feat-detail-choice" key={choice.id}><strong>{choice.name}</strong><p>{choice.description} This preserved choice remains reference-only.</p></div>)}
        </div>
      </section>

      {saveError && <div className="form-alert" role="alert">{saveError}</div>}
      <div className="forge-review-actions">
        <button className="button button--secondary" type="button" onClick={onBack}>Back to Edit</button>
        <button className="button button--primary" type="button" onClick={onSave}>Save Feat</button>
      </div>
    </div>
  );
}

export function FeatForgePage() {
  const { contentId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [initial] = useState<InitialDraftState>(() => resolveInitialDraft(contentId, searchParams.get('duplicate')));
  const [draft, setDraft] = useState<FeatForgeDraft | null>(() => initial.draft ?? null);
  const [stage, setStage] = useState<'edit' | 'review'>('edit');
  const [validationErrors, setValidationErrors] = useState<readonly string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [staticTypeToAdd, setStaticTypeToAdd] = useState<FeatForgeStaticEffectType>('attack-roll-bonus');
  const [diceTypeToAdd, setDiceTypeToAdd] = useState<FeatForgeDiceTransformationType>('reroll-once-use-new');

  if (!draft || initial.error) {
    return (
      <div className="stack-page creator-forge-page">
        <CreatorForgeNav />
        <section className="empty-state panel">
          <h1>Feat Forge unavailable</h1>
          <p>{initial.error ?? 'The requested Feat could not be loaded.'}</p>
          <Link className="button button--secondary" to="/creator-forge/feats">Back to Custom Feats</Link>
        </section>
      </div>
    );
  }

  const modeLabel = initial.mode === 'edit' ? 'Edit Feat' : initial.mode === 'duplicate' ? 'Duplicate Feat' : 'Create Feat';

  function updatePrerequisite(next: FeatForgePrerequisiteDraft) {
    setDraft((current) => current ? {
      ...current,
      prerequisites: current.prerequisites.map((entry) => entry.draftId === next.draftId ? next : entry),
    } : current);
  }

  function removePrerequisite(draftId: string) {
    setDraft((current) => current ? { ...current, prerequisites: current.prerequisites.filter((entry) => entry.draftId !== draftId) } : current);
  }

  function updateStaticEffect(next: FeatForgeStaticEffectDraft) {
    setDraft((current) => current ? {
      ...current,
      staticEffects: current.staticEffects.map((entry) => entry.draftId === next.draftId ? next : entry),
    } : current);
  }

  function updateDiceEffect(next: FeatForgeDiceEffectDraft) {
    setDraft((current) => current ? {
      ...current,
      diceEffects: current.diceEffects.map((entry) => entry.draftId === next.draftId ? next : entry),
    } : current);
  }

  function updateReferenceEffect(next: FeatForgeReferenceEffectDraft) {
    setDraft((current) => current ? {
      ...current,
      referenceEffects: current.referenceEffects.map((entry) => entry.draftId === next.draftId ? next : entry),
    } : current);
  }

  function review() {
    if (!draft) return;
    const errors = validateFeatForgeDraft(draft);
    setValidationErrors(errors);
    setSaveError(null);
    if (errors.length === 0) setStage('review');
  }

  async function save() {
    if (!draft) return;
    const errors = validateFeatForgeDraft(draft);
    if (errors.length > 0) {
      setValidationErrors(errors);
      setStage('edit');
      return;
    }
    const feat = buildFeatContentFromDraft(draft);
    const result = await upsertAndPublishApplicationContent(feat);
    if (!result.ok) {
      const issues = result.error.storageError?.issues?.map((issue) => issue.message).join(' ');
      setSaveError(issues ? result.error.message + ' ' + issues : result.error.message);
      return;
    }
    navigate('/creator-forge/feats');
  }

  if (stage === 'review') {
    return (
      <div className="stack-page creator-forge-page">
        <CreatorForgeNav />
        <header className="page-heading">
          <span className="eyebrow">Creator Forge · Feat Review</span>
          <h1>Review before Save</h1>
          <p>Automated mechanics below use existing canonical rules. Reference-only text remains table-managed.</p>
        </header>
        <FeatForgeReview draft={draft} onBack={() => { setStage('edit'); setSaveError(null); }} onSave={save} saveError={saveError} />
      </div>
    );
  }

  return (
    <div className="stack-page creator-forge-page">
      <CreatorForgeNav />
      <header className="page-heading page-heading--actions">
        <div>
          <span className="eyebrow">Creator Forge · Feats</span>
          <h1>{modeLabel}</h1>
          <p>The draft is ephemeral. Review does not persist; only Save publishes canonical FeatContent.</p>
        </div>
        <Link className="button button--secondary" to="/creator-forge/feats">Cancel</Link>
      </header>

      {validationErrors.length > 0 && (
        <div className="form-alert" role="alert">
          {validationErrors.map((error) => <div key={error}>{error}</div>)}
        </div>
      )}

      <section className="panel form-section">
        <div className="section-heading">
          <span className="eyebrow">Identity</span>
          <h2>Stable canonical identity</h2>
          <p>The ID, kind, and source namespace are fixed for this draft. Renaming never changes identity.</p>
        </div>
        <dl className="detail-list">
          <div><dt>Content ID</dt><dd className="forge-identity">{draft.id}</dd></div>
          <div><dt>Kind</dt><dd>Feat</dd></div>
          <div><dt>Source</dt><dd>Homebrew · {draft.sourceNamespace}</dd></div>
        </dl>
      </section>

      <section className="panel form-section">
        <div className="section-heading">
          <span className="eyebrow">Core</span>
          <h2>Feat details</h2>
        </div>
        <div className="field-grid field-grid--two">
          <label className="field">
            <span>Name</span>
            <input aria-label="Feat name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label className="field">
            <span>Category</span>
            <select aria-label="Feat category" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as FeatForgeCategory })}>
              {FEAT_FORGE_CATEGORIES.map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}
            </select>
          </label>
        </div>
        <label className="field forge-field-block">
          <span>Description</span>
          <textarea aria-label="Feat description" rows={4} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        </label>
        <label className="forge-check forge-check--standalone">
          <input type="checkbox" checked={draft.repeatable} onChange={(event) => setDraft({ ...draft, repeatable: event.target.checked, ...(event.target.checked ? {} : { repeatabilityNote: '' }) })} />
          <span>Repeatable</span>
        </label>
        {draft.repeatable && (
          <label className="field forge-field-block">
            <span>Repeatability note (optional)</span>
            <input aria-label="Repeatability note" value={draft.repeatabilityNote} onChange={(event) => setDraft({ ...draft, repeatabilityNote: event.target.value })} />
          </label>
        )}
      </section>

      <section className="panel form-section">
        <div className="section-heading">
          <span className="eyebrow">Prerequisites</span>
          <h2>Existing eligibility contracts</h2>
          <p>Level and ability prerequisites are evaluated by existing rules. Feature prerequisites are reference-only and are never implied to be automated.</p>
        </div>
        <div className="forge-inline-actions">
          <button className="button button--secondary" type="button" onClick={() => setDraft({ ...draft, prerequisites: [...draft.prerequisites, createLevelPrerequisiteDraft()] })}>Add Level Prerequisite</button>
          <button className="button button--secondary" type="button" onClick={() => setDraft({ ...draft, prerequisites: [...draft.prerequisites, createAbilityPrerequisiteDraft()] })}>Add Ability Prerequisite</button>
          <button className="button button--secondary" type="button" onClick={() => setDraft({ ...draft, prerequisites: [...draft.prerequisites, createFeaturePrerequisiteDraft()] })}>Add Reference-only Feature Prerequisite</button>
        </div>
        {draft.prerequisites.length === 0 && <p className="field-hint">No prerequisites.</p>}
        <div className="forge-editor-list">
          {draft.prerequisites.map((prerequisite) => (
            <article className="forge-editor-row" key={prerequisite.draftId}>
              <div className="forge-editor-row__header">
                <div>
                  <span className="eyebrow">{prerequisite.type === 'feature' ? 'Reference Only' : 'Automated'}</span>
                  <h3>{prerequisite.type === 'level' ? 'Level prerequisite' : prerequisite.type === 'ability-minimum' ? 'Ability prerequisite' : 'Feature prerequisite'}</h3>
                </div>
                <button className="button button--secondary" type="button" onClick={() => removePrerequisite(prerequisite.draftId)}>Remove prerequisite</button>
              </div>
              {prerequisite.type === 'level' && (
                <label className="field forge-field-small">
                  <span>Minimum Character level</span>
                  <input min="1" max="20" type="number" step="1" value={prerequisite.minimum} onChange={(event) => updatePrerequisite({ ...prerequisite, minimum: Number(event.target.value) })} />
                </label>
              )}
              {prerequisite.type === 'ability-minimum' && (
                <>
                  <AbilityChecks values={prerequisite.abilities} onChange={(abilities) => updatePrerequisite({ ...prerequisite, abilities })} label="Any of these abilities may satisfy the prerequisite" />
                  <label className="field forge-field-small">
                    <span>Minimum ability score</span>
                    <input type="number" step="1" value={prerequisite.minimum} onChange={(event) => updatePrerequisite({ ...prerequisite, minimum: Number(event.target.value) })} />
                  </label>
                </>
              )}
              {prerequisite.type === 'feature' && (
                <>
                  <label className="field forge-field-block">
                    <span>Required feature name</span>
                    <input aria-label="Reference-only feature prerequisite" value={prerequisite.name} onChange={(event) => updatePrerequisite({ ...prerequisite, name: event.target.value })} />
                  </label>
                  <p className="forge-reference-note">Reference only — the existing runtime does not evaluate whether a Character owns this feature.</p>
                </>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="panel form-section">
        <div className="section-heading">
          <span className="eyebrow">Structured Choice</span>
          <h2>Ability Score Increase</h2>
          <p>This is the only generic structured Feat choice supported by the existing rules and Level Up architecture.</p>
        </div>
        <label className="forge-check forge-check--standalone">
          <input
            aria-label="Enable structured Ability Score Increase"
            type="checkbox"
            checked={Boolean(draft.asi)}
            onChange={(event) => setDraft(event.target.checked ? { ...draft, asi: createAsiDraft() } : { ...draft, asi: undefined })}
          />
          <span>Add structured Ability Score Increase</span>
        </label>
        {draft.asi && (
          <div className="forge-subsection">
            <AbilityChecks
              values={draft.asi.allowedAbilities}
              onChange={(allowedAbilities) => setDraft({ ...draft, asi: draft.asi ? { ...draft.asi, allowedAbilities } : undefined })}
              label="Allowed ability selections"
            />
            <div className="field-grid field-grid--two">
              <label className="field">
                <span>Selections</span>
                <select
                  aria-label="ASI selections"
                  value={draft.asi.selections}
                  onChange={(event) => {
                    const selections = Number(event.target.value) as 1 | 2;
                    setDraft({ ...draft, asi: draft.asi ? { ...draft.asi, selections, ...(selections === 1 ? { allowDuplicateSelection: false } : {}) } : undefined });
                  }}
                >
                  <option value={1}>One +1 selection</option>
                  <option value={2}>Two +1 selections</option>
                </select>
              </label>
              <label className="field">
                <span>Maximum ability score</span>
                <select aria-label="ASI maximum" value={draft.asi.maximum} onChange={(event) => setDraft({ ...draft, asi: draft.asi ? { ...draft.asi, maximum: Number(event.target.value) as 20 | 30 } : undefined })}>
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                </select>
              </label>
            </div>
            {draft.asi.selections === 2 && (
              <label className="forge-check forge-check--standalone">
                <input type="checkbox" checked={draft.asi.allowDuplicateSelection} onChange={(event) => setDraft({ ...draft, asi: draft.asi ? { ...draft.asi, allowDuplicateSelection: event.target.checked } : undefined })} />
                <span>Allow selecting the same ability twice</span>
              </label>
            )}
          </div>
        )}
        {draft.preservedReferenceChoices.length > 0 && (
          <div className="forge-reference-note">
            This edited Feat contains {draft.preservedReferenceChoices.length} pre-existing reference-only choice definition{draft.preservedReferenceChoices.length === 1 ? '' : 's'}. M16-C preserves them unchanged but does not expose a generic choice editor.
          </div>
        )}
      </section>

      <section className="panel form-section">
        <div className="section-heading">
          <span className="eyebrow">Automated</span>
          <h2>Supported static rule effects</h2>
          <p>These emit the existing CharacterRuleEffect discriminated unions and are consumed by the existing rules engine.</p>
        </div>
        <div className="forge-add-row">
          <label className="field">
            <span>Effect type</span>
            <select aria-label="New automated effect type" value={staticTypeToAdd} onChange={(event) => setStaticTypeToAdd(event.target.value as FeatForgeStaticEffectType)}>
              {Object.entries(STATIC_EFFECT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button className="button button--secondary" type="button" onClick={() => setDraft({ ...draft, staticEffects: [...draft.staticEffects, createStaticEffectDraft(staticTypeToAdd)] })}>Add Automated Effect</button>
        </div>
        <div className="forge-editor-list">
          {draft.staticEffects.map((entry) => (
            <FeatForgeStaticEffectEditor
              key={entry.draftId}
              entry={entry}
              onChange={updateStaticEffect}
              onRemove={() => setDraft({ ...draft, staticEffects: draft.staticEffects.filter((candidate) => candidate.draftId !== entry.draftId) })}
            />
          ))}
        </div>
        {draft.staticEffects.length === 0 && <p className="field-hint">No static automated effects.</p>}
      </section>

      <section className="panel form-section">
        <div className="section-heading">
          <span className="eyebrow">Automated Dice</span>
          <h2>Dice transformations</h2>
          <p>Only the two bounded transformation contracts already supported by the Dice Engine are authorable here.</p>
        </div>
        <div className="forge-add-row">
          <label className="field">
            <span>Transformation type</span>
            <select aria-label="New dice transformation type" value={diceTypeToAdd} onChange={(event) => setDiceTypeToAdd(event.target.value as FeatForgeDiceTransformationType)}>
              {Object.entries(DICE_TRANSFORMATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button className="button button--secondary" type="button" onClick={() => setDraft({ ...draft, diceEffects: [...draft.diceEffects, createDiceEffectDraft(diceTypeToAdd)] })}>Add Dice Transformation</button>
        </div>
        <div className="forge-editor-list">
          {draft.diceEffects.map((entry) => (
            <FeatForgeDiceEffectEditor
              key={entry.draftId}
              entry={entry}
              onChange={updateDiceEffect}
              onRemove={() => setDraft({ ...draft, diceEffects: draft.diceEffects.filter((candidate) => candidate.draftId !== entry.draftId) })}
            />
          ))}
        </div>
        {draft.diceEffects.length === 0 && <p className="field-hint">No dice transformations.</p>}
      </section>

      <section className="panel form-section">
        <div className="section-heading">
          <span className="eyebrow">Reference Only</span>
          <h2>Table-managed mechanics</h2>
          <p>Use reference-only entries for mechanics the engine does not execute. These entries never alter rolls, resources, Character state, or PLAY automatically.</p>
        </div>
        <button className="button button--secondary" type="button" onClick={() => setDraft({ ...draft, referenceEffects: [...draft.referenceEffects, createReferenceEffectDraft()] })}>Add Reference-only Effect</button>
        <div className="forge-editor-list">
          {draft.referenceEffects.map((effect) => (
            <article className="forge-editor-row forge-editor-row--reference" key={effect.draftId}>
              <div className="forge-editor-row__header">
                <span className="source-badge">Reference only</span>
                <button className="button button--secondary" type="button" onClick={() => setDraft({ ...draft, referenceEffects: draft.referenceEffects.filter((candidate) => candidate.draftId !== effect.draftId) })}>Remove effect</button>
              </div>
              <label className="field forge-field-block">
                <span>Name</span>
                <input aria-label="Reference effect name" value={effect.name} onChange={(event) => updateReferenceEffect({ ...effect, name: event.target.value })} />
              </label>
              <label className="field forge-field-block">
                <span>Description</span>
                <textarea aria-label="Reference effect description" rows={3} value={effect.description} onChange={(event) => updateReferenceEffect({ ...effect, description: event.target.value })} />
              </label>
            </article>
          ))}
        </div>
        {draft.referenceEffects.length === 0 && <p className="field-hint">No reference-only effects.</p>}
      </section>

      <section className="panel form-section forge-unsupported">
        <div className="section-heading">
          <span className="eyebrow">Deferred</span>
          <h2>Not automated by Feat Forge</h2>
        </div>
        <p>General skill, weapon, armor, or tool proficiency grants; Feat-owned resources/actions/active effects; spellcasting or granted spells; generic choices; and arbitrary executable behavior remain unsupported. Record unusual mechanics as reference-only text instead.</p>
      </section>

      <div className="forge-review-actions">
        <Link className="button button--secondary" to="/creator-forge/feats">Cancel</Link>
        <button className="button button--primary" type="button" onClick={review}>Review Feat</button>
      </div>
    </div>
  );
}
