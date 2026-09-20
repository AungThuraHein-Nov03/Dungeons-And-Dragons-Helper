import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CreatorForgeNav } from '../components/CreatorForgeNav';
import { SpellForgeDamageEditor, SpellForgeHealingEditor } from '../components/SpellForgeMechanicEditors';
import {
  SPELL_FORGE_SCHOOLS,
  abilityLabel,
  buildSpellContentFromDraft,
  collectSpellListOptions,
  createDefaultDamageDraft,
  createDefaultHealingDraft,
  createReferenceEffectDraft,
  createSpellForgeDraft,
  duplicateSpellForgeDraft,
  loadSpellForgeDraft,
  toggleSpellList,
  validateSpellForgeDraft,
  withSpellLevel,
  type SpellForgeDraft,
  type SpellForgeReferenceEffectDraft,
} from '../components/spellForgeModel';
import { ABILITY_KEYS } from '../models/character';
import type { SpellLevel, SpellRollAmount, SpellScaling, SpellSchool } from '../models/content';
import { upsertAndPublishApplicationContent } from '../services/contentCatalog';
import { contentRegistry } from '../services/contentRegistry';

const SCHOOL_LABELS: Record<SpellSchool, string> = {
  abjuration: 'Abjuration',
  conjuration: 'Conjuration',
  divination: 'Divination',
  enchantment: 'Enchantment',
  evocation: 'Evocation',
  illusion: 'Illusion',
  necromancy: 'Necromancy',
  transmutation: 'Transmutation',
};

interface InitialDraftState {
  readonly mode: 'create' | 'edit' | 'duplicate';
  readonly draft?: SpellForgeDraft;
  readonly error?: string;
}

function resolveInitialDraft(contentId: string | undefined, duplicateId: string | null): InitialDraftState {
  if (contentId) {
    const spell = contentRegistry.findSpell(decodeURIComponent(contentId));
    if (!spell) return { mode: 'edit', error: 'Custom Spell not found.' };
    const loaded = loadSpellForgeDraft(spell);
    return loaded.ok ? { mode: 'edit', draft: loaded.draft } : { mode: 'edit', error: loaded.message };
  }
  if (duplicateId) {
    const spell = contentRegistry.findSpell(duplicateId);
    if (!spell || spell.source.type !== 'homebrew') {
      return { mode: 'duplicate', error: 'Only an existing custom Spell can be duplicated.' };
    }
    const duplicated = duplicateSpellForgeDraft(spell);
    return duplicated.ok ? { mode: 'duplicate', draft: duplicated.draft } : { mode: 'duplicate', error: duplicated.message };
  }
  return { mode: 'create', draft: createSpellForgeDraft() };
}

function levelLabel(level: SpellLevel): string {
  return level === 0 ? 'Cantrip' : 'Level ' + level;
}

function componentsLabel(draft: SpellForgeDraft): string {
  const values = [
    draft.components.verbal ? 'V' : '',
    draft.components.somatic ? 'S' : '',
    draft.components.material ? 'M' : '',
  ].filter(Boolean);
  const base = values.join(', ') || 'None';
  return draft.components.material && draft.components.materialText.trim()
    ? base + ' (' + draft.components.materialText.trim() + ')'
    : base;
}

function diceLabel(amount: SpellRollAmount): string {
  const dice = amount.dice.map((term) => term.count + 'd' + term.die).join(' + ');
  return dice + (amount.modifier === 'spellcasting-ability' ? ' + Spellcasting Ability modifier' : '');
}

function scalingLabel(scaling: SpellScaling | undefined): string {
  if (!scaling) return 'No machine-readable scaling.';
  if (scaling.kind === 'character-level-dice') {
    return scaling.values.map((row) =>
      'Level ' + row.level + ': ' + row.dice.map((term) => term.count + 'd' + term.die).join(' + ')
    ).join(' · ');
  }
  return 'Each slot level above ' + scaling.baseSpellLevel + ' adds ' +
    scaling.dicePerLevel.map((term) => term.count + 'd' + term.die).join(' + ') + '.';
}

function updateReferenceEffect(
  draft: SpellForgeDraft,
  next: SpellForgeReferenceEffectDraft,
): SpellForgeDraft {
  return {
    ...draft,
    referenceEffects: draft.referenceEffects.map((entry) => entry.draftId === next.draftId ? next : entry),
  };
}

function SpellForgeReview({
  draft,
  onBack,
  onSave,
  saveError,
}: {
  draft: SpellForgeDraft;
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
          <div><dt>Level</dt><dd>{levelLabel(draft.level)}</dd></div>
          <div><dt>School</dt><dd>{SCHOOL_LABELS[draft.school]}</dd></div>
          <div><dt>Casting time</dt><dd>{draft.castingTime}</dd></div>
          <div><dt>Range</dt><dd>{draft.range}</dd></div>
          <div><dt>Duration</dt><dd>{draft.duration}</dd></div>
          <div><dt>Components</dt><dd>{componentsLabel(draft)}</dd></div>
          <div><dt>Concentration</dt><dd>{draft.concentration ? 'Yes' : 'No'}</dd></div>
          <div><dt>Ritual</dt><dd>{draft.ritual ? 'Yes' : 'No'}</dd></div>
          <div><dt>Spell lists</dt><dd>{draft.spellLists.map((list) => list.name).join(', ')}</dd></div>
          {draft.target.trim() && <div><dt>Target / Area</dt><dd>{draft.target.trim()}</dd></div>}
          <div><dt>Description</dt><dd>{draft.description}</dd></div>
          {draft.higherLevelDescription.trim() && <div><dt>Higher levels</dt><dd>{draft.higherLevelDescription.trim()}</dd></div>}
        </dl>
      </section>

      <section className="detail-grid">
        <div className="panel detail-card forge-review-card--automated">
          <span className="eyebrow">Automated</span>
          <h2>Existing Spell rules</h2>
          {draft.attack
            ? <p><strong>Spell attack:</strong> {draft.attack.attackType} spell attack using the owning provider's existing Spell Attack modifier.</p>
            : <p>No spell-attack declaration.</p>}
          {draft.damage && (
            <>
              <p><strong>Damage:</strong> {diceLabel(draft.damage.amount)} {draft.damage.damageType}.</p>
              <p><strong>Damage scaling:</strong> {scalingLabel(draft.damage.scaling)}</p>
              {draft.attack && <p><strong>Critical damage:</strong> existing spell critical-damage doubling remains authoritative.</p>}
            </>
          )}
          {draft.healing && (
            <>
              <p><strong>Healing:</strong> {diceLabel(draft.healing.amount)}.</p>
              <p><strong>Healing scaling:</strong> {scalingLabel(draft.healing.scaling)}</p>
            </>
          )}
          {!draft.attack && !draft.damage && !draft.healing && <p>No executable roll mechanics.</p>}
          {draft.concentration && <p><strong>Concentration:</strong> existing concentration candidate/session bookkeeping can recognize this provider-owned Spell.</p>}
          {draft.ritual && <p><strong>Ritual:</strong> existing provider ritual policy determines whether this Spell is ritual-eligible.</p>}
        </div>

        <div className="panel detail-card forge-review-card--reference">
          <span className="eyebrow">Manual / Reference</span>
          <h2>Table-managed behavior</h2>
          {draft.savingThrow && (
            <p>
              <strong>Saving throw declaration:</strong> {abilityLabel(draft.savingThrow.ability)} save;
              {' '}{draft.savingThrow.onSuccess === 'half' ? 'half damage on success' : 'no damage on success'}.
              Target save resolution remains manual.
            </p>
          )}
          {draft.target.trim() && <p><strong>Target / Area:</strong> {draft.target.trim()} — descriptive metadata only; no battlefield targeting is created.</p>}
          {draft.referenceEffects.map((effect) => (
            <div className="feat-detail-choice" key={effect.draftId}>
              <strong>{effect.name}</strong>
              <p>{effect.description}</p>
            </div>
          ))}
          {!draft.savingThrow && !draft.target.trim() && draft.referenceEffects.length === 0 && (
            <p>No additional manual/reference mechanics.</p>
          )}
        </div>
      </section>

      {saveError && <div className="form-alert" role="alert">{saveError}</div>}
      <div className="forge-review-actions">
        <button className="button button--secondary" type="button" onClick={onBack}>Back to Edit</button>
        <button className="button button--primary" type="button" onClick={onSave}>Save Spell</button>
      </div>
    </div>
  );
}

export function SpellForgePage() {
  const { contentId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [initial] = useState<InitialDraftState>(() => resolveInitialDraft(contentId, searchParams.get('duplicate')));
  const [draft, setDraft] = useState<SpellForgeDraft | null>(() => initial.draft ?? null);
  const [stage, setStage] = useState<'edit' | 'review'>('edit');
  const [validationErrors, setValidationErrors] = useState<readonly string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const spellListOptions = collectSpellListOptions(contentRegistry);

  if (!draft || initial.error) {
    return (
      <div className="stack-page creator-forge-page">
        <CreatorForgeNav />
        <section className="empty-state panel">
          <h1>Spell Forge unavailable</h1>
          <p>{initial.error ?? 'The requested Spell could not be loaded.'}</p>
          <Link className="button button--secondary" to="/creator-forge/spells">Back to Custom Spells</Link>
        </section>
      </div>
    );
  }

  const modeLabel = initial.mode === 'edit' ? 'Edit Spell' : initial.mode === 'duplicate' ? 'Duplicate Spell' : 'Create Spell';

  function review() {
    if (!draft) return;
    const errors = validateSpellForgeDraft(draft);
    setValidationErrors(errors);
    setSaveError(null);
    if (errors.length === 0) setStage('review');
  }

  async function save() {
    if (!draft) return;
    const errors = validateSpellForgeDraft(draft);
    if (errors.length > 0) {
      setValidationErrors(errors);
      setStage('edit');
      return;
    }

    const spell = buildSpellContentFromDraft(draft);
    const result = await upsertAndPublishApplicationContent(spell);
    if (!result.ok) {
      const issues = result.error.storageError?.issues?.map((issue) => issue.message).join(' ');
      setSaveError(issues ? result.error.message + ' ' + issues : result.error.message);
      return;
    }
    navigate('/creator-forge/spells');
  }

  if (stage === 'review') {
    return (
      <div className="stack-page creator-forge-page">
        <CreatorForgeNav />
        <header className="page-heading">
          <span className="eyebrow">Creator Forge · Spell Review</span>
          <h1>Review before Save</h1>
          <p>Automated mechanics below use the existing spellcasting and Dice Engine paths. Target/save/rider behavior remains explicitly manual where the runtime does not model it.</p>
        </header>
        <SpellForgeReview
          draft={draft}
          onBack={() => { setStage('edit'); setSaveError(null); }}
          onSave={save}
          saveError={saveError}
        />
      </div>
    );
  }

  return (
    <div className="stack-page creator-forge-page">
      <CreatorForgeNav />
      <header className="page-heading page-heading--actions">
        <div>
          <span className="eyebrow">Creator Forge · Spells</span>
          <h1>{modeLabel}</h1>
          <p>The draft is ephemeral. Review does not persist; only Save publishes canonical SpellContent.</p>
        </div>
        <Link className="button button--secondary" to="/creator-forge/spells">Cancel</Link>
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
          <div><dt>Kind</dt><dd>Spell</dd></div>
          <div><dt>Source</dt><dd>Homebrew · {draft.sourceNamespace}</dd></div>
        </dl>
      </section>

      <section className="panel form-section">
        <div className="section-heading">
          <span className="eyebrow">Core</span>
          <h2>Spell metadata</h2>
          <p>Casting time, range, duration, and target/area are reference metadata. Spell Forge does not turn them into geometry, timing, or target-state automation.</p>
        </div>
        <div className="field-grid field-grid--two">
          <label className="field">
            <span>Name</span>
            <input aria-label="Spell name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label className="field">
            <span>Spell level</span>
            <select
              aria-label="Spell level"
              value={draft.level}
              onChange={(event) => setDraft(withSpellLevel(draft, Number(event.target.value) as SpellLevel))}
            >
              <option value={0}>Cantrip</option>
              {Array.from({ length: 9 }, (_, index) => index + 1).map((level) => <option key={level} value={level}>Level {level}</option>)}
            </select>
          </label>
          <label className="field">
            <span>School</span>
            <select aria-label="Spell school" value={draft.school} onChange={(event) => setDraft({ ...draft, school: event.target.value as SpellSchool })}>
              {SPELL_FORGE_SCHOOLS.map((school) => <option key={school} value={school}>{SCHOOL_LABELS[school]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Casting time</span>
            <input aria-label="Casting time" value={draft.castingTime} onChange={(event) => setDraft({ ...draft, castingTime: event.target.value })} />
          </label>
          <label className="field">
            <span>Range</span>
            <input aria-label="Spell range" value={draft.range} onChange={(event) => setDraft({ ...draft, range: event.target.value })} />
          </label>
          <label className="field">
            <span>Duration</span>
            <input aria-label="Spell duration" value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: event.target.value })} />
          </label>
        </div>
        <label className="field forge-field-block">
          <span>Target / Area (optional reference metadata)</span>
          <input aria-label="Target or area" value={draft.target} onChange={(event) => setDraft({ ...draft, target: event.target.value })} />
        </label>
        <label className="field forge-field-block">
          <span>Description</span>
          <textarea aria-label="Spell description" rows={4} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        </label>
        <label className="field forge-field-block">
          <span>Higher-level description (optional reference text)</span>
          <textarea aria-label="Higher-level description" rows={3} value={draft.higherLevelDescription} onChange={(event) => setDraft({ ...draft, higherLevelDescription: event.target.value })} />
        </label>
      </section>

      <section className="panel form-section">
        <div className="section-heading">
          <span className="eyebrow">Components</span>
          <h2>V / S / M</h2>
          <p>Material text is reference data only; no material-cost economy or consumption engine is created.</p>
        </div>
        <div className="forge-inline-actions">
          <label className="forge-check">
            <input
              aria-label="Verbal component"
              type="checkbox"
              checked={draft.components.verbal}
              onChange={(event) => setDraft({ ...draft, components: { ...draft.components, verbal: event.target.checked } })}
            />
            <span>Verbal (V)</span>
          </label>
          <label className="forge-check">
            <input
              aria-label="Somatic component"
              type="checkbox"
              checked={draft.components.somatic}
              onChange={(event) => setDraft({ ...draft, components: { ...draft.components, somatic: event.target.checked } })}
            />
            <span>Somatic (S)</span>
          </label>
          <label className="forge-check">
            <input
              aria-label="Material component"
              type="checkbox"
              checked={draft.components.material}
              onChange={(event) => setDraft({
                ...draft,
                components: {
                  ...draft.components,
                  material: event.target.checked,
                  ...(event.target.checked ? {} : { materialText: '' }),
                },
              })}
            />
            <span>Material (M)</span>
          </label>
        </div>
        {draft.components.material && (
          <label className="field forge-field-block">
            <span>Material component description</span>
            <input
              aria-label="Material component description"
              value={draft.components.materialText}
              onChange={(event) => setDraft({ ...draft, components: { ...draft.components, materialText: event.target.value } })}
            />
          </label>
        )}
      </section>

      <section className="panel form-section">
        <div className="section-heading">
          <span className="eyebrow">Spell Flags</span>
          <h2>Concentration and Ritual</h2>
          <p>These flags feed the existing concentration and provider ritual policies only. No extra target or duration engine is introduced.</p>
        </div>
        <div className="forge-inline-actions">
          <label className="forge-check">
            <input aria-label="Concentration Spell" type="checkbox" checked={draft.concentration} onChange={(event) => setDraft({ ...draft, concentration: event.target.checked })} />
            <span>Concentration</span>
          </label>
          <label className="forge-check">
            <input aria-label="Ritual Spell" type="checkbox" checked={draft.ritual} onChange={(event) => setDraft({ ...draft, ritual: event.target.checked })} />
            <span>Ritual</span>
          </label>
        </div>
      </section>

      <section className="panel form-section">
        <div className="section-heading">
          <span className="eyebrow">Spell Lists</span>
          <h2>Provider list membership</h2>
          <p>Membership uses the same stable Spell-list IDs already present in the effective catalog/provider architecture. It does not create a provider.</p>
        </div>
        <div className="forge-check-grid forge-check-grid--skills" role="group" aria-label="Spell lists">
          {spellListOptions.map((option) => (
            <label className="forge-check" key={option.id}>
              <input
                aria-label={'Spell list ' + option.name}
                type="checkbox"
                checked={draft.spellLists.some((list) => list.id === option.id)}
                onChange={() => setDraft({ ...draft, spellLists: toggleSpellList(draft.spellLists, option) })}
              />
              <span>{option.name}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="panel form-section">
        <div className="section-heading">
          <span className="eyebrow">Attack / Save</span>
          <h2>Canonical declarations</h2>
          <p>Spell attacks use the existing provider attack modifier. Saving throws are structured for display and DC context, but target save resolution remains manual.</p>
        </div>

        <label className="forge-check forge-check--standalone">
          <input
            aria-label="Enable Spell Attack"
            type="checkbox"
            checked={Boolean(draft.attack)}
            onChange={(event) => setDraft({
              ...draft,
              attack: event.target.checked ? { type: 'spell-attack', attackType: 'ranged' } : undefined,
            })}
          />
          <span>Add Spell Attack declaration</span>
        </label>
        {draft.attack && (
          <label className="field forge-field-small">
            <span>Spell attack type</span>
            <select
              aria-label="Spell attack type"
              value={draft.attack.attackType}
              onChange={(event) => setDraft({ ...draft, attack: { ...draft.attack!, attackType: event.target.value as 'melee' | 'ranged' } })}
            >
              <option value="ranged">Ranged</option>
              <option value="melee">Melee</option>
            </select>
          </label>
        )}

        <label className="forge-check forge-check--standalone">
          <input
            aria-label="Enable Saving Throw"
            type="checkbox"
            checked={Boolean(draft.savingThrow)}
            onChange={(event) => setDraft({
              ...draft,
              savingThrow: event.target.checked
                ? { type: 'saving-throw', ability: 'dexterity', onSuccess: 'half' }
                : undefined,
            })}
          />
          <span>Add Saving Throw declaration</span>
        </label>
        {draft.savingThrow && (
          <div className="forge-subsection">
            <div className="field-grid field-grid--two">
              <label className="field">
                <span>Save ability</span>
                <select
                  aria-label="Saving throw ability"
                  value={draft.savingThrow.ability}
                  onChange={(event) => setDraft({
                    ...draft,
                    savingThrow: { ...draft.savingThrow!, ability: event.target.value as typeof draft.savingThrow.ability },
                  })}
                >
                  {ABILITY_KEYS.map((ability) => <option key={ability} value={ability}>{abilityLabel(ability)}</option>)}
                </select>
              </label>
              <label className="field">
                <span>On successful save</span>
                <select
                  aria-label="Saving throw success behavior"
                  value={draft.savingThrow.onSuccess}
                  onChange={(event) => setDraft({
                    ...draft,
                    savingThrow: { ...draft.savingThrow!, onSuccess: event.target.value as 'none' | 'half' },
                  })}
                >
                  <option value="none">No damage</option>
                  <option value="half">Half damage</option>
                </select>
              </label>
            </div>
            <p className="forge-reference-note">MANUAL / REFERENCE — the engine displays this declaration and provider save DC, but does not roll target saves, enumerate targets, or mutate target state.</p>
          </div>
        )}
      </section>

      <section className="panel form-section">
        <div className="section-heading">
          <span className="eyebrow">Automated Rolls</span>
          <h2>Damage and Healing</h2>
          <p>Each bounded mechanic is limited to one canonical roll definition. Slot legality and critical damage remain owned by the existing spellcasting/Dice Engine paths.</p>
        </div>

        {!draft.damage && (
          <button className="button button--secondary" type="button" onClick={() => setDraft({ ...draft, damage: createDefaultDamageDraft() })}>Add Damage Mechanic</button>
        )}
        {draft.damage && (
          <SpellForgeDamageEditor
            spellLevel={draft.level}
            damage={draft.damage}
            onChange={(damage) => setDraft({ ...draft, damage })}
            onRemove={() => setDraft({ ...draft, damage: undefined })}
          />
        )}

        {!draft.healing && (
          <button className="button button--secondary" type="button" onClick={() => setDraft({ ...draft, healing: createDefaultHealingDraft() })}>Add Healing Mechanic</button>
        )}
        {draft.healing && (
          <SpellForgeHealingEditor
            spellLevel={draft.level}
            healing={draft.healing}
            onChange={(healing) => setDraft({ ...draft, healing })}
            onRemove={() => setDraft({ ...draft, healing: undefined })}
          />
        )}
      </section>

      <section className="panel form-section">
        <div className="section-heading">
          <span className="eyebrow">Manual / Reference</span>
          <h2>Unsupported Spell behavior</h2>
          <p>Record riders the runtime does not execute: area targeting, extra targets, push/pull, prone, conditions, persistent effects, summons, unusual secondary behavior, or other table-managed rules.</p>
        </div>
        <button className="button button--secondary" type="button" onClick={() => setDraft({ ...draft, referenceEffects: [...draft.referenceEffects, createReferenceEffectDraft()] })}>Add Reference-only Effect</button>
        <div className="forge-editor-list">
          {draft.referenceEffects.map((effect) => (
            <article className="forge-editor-row forge-editor-row--reference" key={effect.draftId}>
              <div className="forge-editor-row__header">
                <span className="source-badge">Manual / Reference</span>
                <button className="button button--secondary" type="button" onClick={() => setDraft({ ...draft, referenceEffects: draft.referenceEffects.filter((candidate) => candidate.draftId !== effect.draftId) })}>Remove effect</button>
              </div>
              <label className="field forge-field-block">
                <span>Name</span>
                <input
                  aria-label="Spell reference effect name"
                  value={effect.name}
                  onChange={(event) => setDraft(updateReferenceEffect(draft, { ...effect, name: event.target.value }))}
                />
              </label>
              <label className="field forge-field-block">
                <span>Description</span>
                <textarea
                  aria-label="Spell reference effect description"
                  rows={3}
                  value={effect.description}
                  onChange={(event) => setDraft(updateReferenceEffect(draft, { ...effect, description: event.target.value }))}
                />
              </label>
            </article>
          ))}
        </div>
        {draft.referenceEffects.length === 0 && <p className="field-hint">No additional manual/reference effects.</p>}
      </section>

      <section className="panel form-section forge-unsupported">
        <div className="section-heading">
          <span className="eyebrow">Deferred</span>
          <h2>Not automated by Spell Forge</h2>
        </div>
        <p>Multiple independent damage/healing mechanics, target HP or AC, target save resolution, conditions, push/pull movement, AoE enumeration, persistent zones, duration enforcement, battlefield geometry, line of sight, cover-specific spell rules, summons, arbitrary executable effects, scripting, formulas, Spell-owned resources/providers, and target-state automation remain outside M16-D.</p>
      </section>

      <div className="forge-review-actions">
        <Link className="button button--secondary" to="/creator-forge/spells">Cancel</Link>
        <button className="button button--primary" type="button" onClick={review}>Review Spell</button>
      </div>
    </div>
  );
}
