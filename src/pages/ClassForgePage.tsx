import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ClassForgeFeatureEditor, ClassForgeResourceEditor } from '../components/ClassForgeFeatureEditor';
import { CreatorForgeNav } from '../components/CreatorForgeNav';
import {
  CLASS_FORGE_ARMOR_CATEGORIES,
  CLASS_FORGE_HIT_DICE,
  CLASS_FORGE_WEAPON_CATEGORIES,
  abilityOptions,
  buildClassContentFromDraft,
  createClassEquipmentItemDraft,
  createClassEquipmentOptionDraft,
  createClassFeatAcquisitionFeatureDraft,
  createClassFeatureDraft,
  createClassForgeDraft,
  createClassResourceDraft,
  createClassSubclassMarkerFeatureDraft,
  createClassToolProficiency,
  createMulticlassSkillChoice,
  duplicateClassForgeDraft,
  equipmentCatalogOptions,
  inventoryCategoryOptions,
  loadClassForgeDraft,
  skillOptions,
  standardClassProficiencyBonus,
  validateClassForgeDraft,
  type ClassForgeDraft,
  type ClassForgeEquipmentOptionDraft,
  type ClassForgeFeatureDraft,
  type ClassForgeResourceDraft,
} from '../components/classForgeModel';
import { collectSpellListOptions } from '../components/spellForgeModel';
import type { AbilityKey } from '../models/character';
import type { ClassPrimaryAbility, MulticlassSkillProficiencyChoice, WeaponCategory, WeaponProficiencyRule } from '../models/content';
import { upsertAndPublishApplicationContent } from '../services/contentCatalog';
import { contentRegistry } from '../services/contentRegistry';
import { SKILL_DEFINITIONS } from '../rules/skills';

interface InitialDraftState {
  readonly mode: 'create' | 'edit' | 'duplicate';
  readonly draft?: ClassForgeDraft;
  readonly error?: string;
}

const ABILITY_LABELS: Record<AbilityKey, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma',
};

function titleCase(value: string): string {
  return value.split('-').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
}

function resolveInitialDraft(contentId: string | undefined, duplicateId: string | null): InitialDraftState {
  if (contentId) {
    const classContent = contentRegistry.findClass(decodeURIComponent(contentId));
    if (!classContent) return { mode: 'edit', error: 'Custom Class not found.' };
    const loaded = loadClassForgeDraft(classContent);
    return loaded.ok ? { mode: 'edit', draft: loaded.draft } : { mode: 'edit', error: loaded.message };
  }
  if (duplicateId) {
    const classContent = contentRegistry.findClass(duplicateId);
    if (!classContent || classContent.source.type !== 'homebrew') return { mode: 'duplicate', error: 'Only an existing custom Class can be duplicated.' };
    const duplicated = duplicateClassForgeDraft(classContent);
    return duplicated.ok ? { mode: 'duplicate', draft: duplicated.draft } : { mode: 'duplicate', error: duplicated.message };
  }
  return { mode: 'create', draft: createClassForgeDraft() };
}

function replaceByDraftId<T extends { readonly draftId: string }>(values: readonly T[], next: T): T[] {
  return values.map((value) => value.draftId === next.draftId ? next : value);
}

function toggleValue<T>(values: readonly T[], value: T, checked: boolean): T[] {
  return checked ? [...values, value] : values.filter((candidate) => candidate !== value);
}

function weaponCategorySelected(rules: readonly WeaponProficiencyRule[], category: WeaponCategory): boolean {
  return rules.some((rule) => rule.kind === 'category' && rule.category === category);
}

function toggleWeaponCategory(rules: readonly WeaponProficiencyRule[], category: WeaponCategory, checked: boolean): WeaponProficiencyRule[] {
  const retained = rules.filter((rule) => !(rule.kind === 'category' && rule.category === category));
  return checked ? [...retained, { kind: 'category', category }] : retained;
}

function primaryAbilityLabel(value: ClassPrimaryAbility): string {
  return value.abilities.map((ability) => ABILITY_LABELS[ability]).join(value.mode === 'one-of' ? ' or ' : ' and ');
}

function featureSummary(feature: ClassForgeFeatureDraft): string[] {
  return [
    feature.staticEffects.length ? feature.staticEffects.length + ' static effect' + (feature.staticEffects.length === 1 ? '' : 's') : '',
    feature.diceEffects.length ? feature.diceEffects.length + ' dice transformation' + (feature.diceEffects.length === 1 ? '' : 's') : '',
    feature.resources.length ? feature.resources.length + ' resource' + (feature.resources.length === 1 ? '' : 's') : '',
    feature.consumers.length ? feature.consumers.length + ' action' + (feature.consumers.length === 1 ? '' : 's') : '',
    feature.transactions.length ? feature.transactions.length + ' transaction' + (feature.transactions.length === 1 ? '' : 's') : '',
    feature.activeEffects.length ? feature.activeEffects.length + ' active self effect' + (feature.activeEffects.length === 1 ? '' : 's') : '',
    feature.providers.length ? feature.providers.length + ' Spellcasting provider' + (feature.providers.length === 1 ? '' : 's') : '',
    feature.spellGrants.length ? feature.spellGrants.length + ' Spell-grant group' + (feature.spellGrants.length === 1 ? '' : 's') : '',
  ].filter(Boolean);
}

function EquipmentPackageEditor({
  entry,
  structuralLocked,
  onChange,
  onRemove,
}: {
  entry: ClassForgeEquipmentOptionDraft;
  structuralLocked: boolean;
  onChange: (entry: ClassForgeEquipmentOptionDraft) => void;
  onRemove: () => void;
}) {
  const catalog = equipmentCatalogOptions(contentRegistry);
  return (
    <article className="forge-editor-row">
      <div className="forge-editor-row__header">
        <div><span className="eyebrow">Starting Equipment Package</span><h3>{entry.id}</h3></div>
        <button className="button button--secondary" type="button" disabled={entry.persisted || structuralLocked} onClick={onRemove}>{entry.persisted || structuralLocked ? 'Identity locked on Edit' : 'Remove package'}</button>
      </div>
      <small className="forge-identity">{entry.id}</small>
      <div className="forge-editor-list">
        {entry.items.map((itemEntry) => {
          const catalogValue = itemEntry.item.contentId ?? '';
          const selectedCatalog = catalog.find((option) => option.id === catalogValue);
          return (
            <div className="forge-editor-row" key={itemEntry.draftId}>
              <div className="field-grid field-grid--two">
                <label className="field"><span>Catalog item</span><select disabled={structuralLocked} value={catalogValue} onChange={(event) => {
                  const selected = catalog.find((option) => option.id === event.target.value);
                  const item = selected
                    ? { ...itemEntry.item, label: selected.name, contentId: selected.id, inventoryCategory: selected.category }
                    : { ...itemEntry.item, contentId: undefined };
                  onChange({ ...entry, items: entry.items.map((candidate) => candidate.draftId === itemEntry.draftId ? { ...candidate, item } : candidate) });
                }}><option value="">Manual / non-catalog item</option>{catalog.map((option) => <option key={option.id} value={option.id}>{option.name} · {titleCase(option.category)}</option>)}</select></label>
                <label className="field"><span>Label</span><input disabled={structuralLocked || Boolean(selectedCatalog)} value={itemEntry.item.label} onChange={(event) => onChange({ ...entry, items: entry.items.map((candidate) => candidate.draftId === itemEntry.draftId ? { ...candidate, item: { ...candidate.item, label: event.target.value } } : candidate) })} /></label>
                <label className="field"><span>Quantity</span><input disabled={structuralLocked} type="number" min="1" value={itemEntry.item.quantity ?? 1} onChange={(event) => onChange({ ...entry, items: entry.items.map((candidate) => candidate.draftId === itemEntry.draftId ? { ...candidate, item: { ...candidate.item, quantity: Number(event.target.value) } } : candidate) })} /></label>
                {!selectedCatalog && <label className="field"><span>Inventory category</span><select disabled={structuralLocked} value={itemEntry.item.inventoryCategory ?? 'adventuring-gear'} onChange={(event) => onChange({ ...entry, items: entry.items.map((candidate) => candidate.draftId === itemEntry.draftId ? { ...candidate, item: { ...candidate.item, inventoryCategory: event.target.value as typeof candidate.item.inventoryCategory } } : candidate) })}>{inventoryCategoryOptions().map((category) => <option key={category} value={category}>{titleCase(category)}</option>)}</select></label>}
              </div>
              <button className="button button--secondary" type="button" disabled={structuralLocked} onClick={() => onChange({ ...entry, items: entry.items.filter((candidate) => candidate.draftId !== itemEntry.draftId) })}>Remove item</button>
            </div>
          );
        })}
      </div>
      <div className="forge-inline-actions">
        <button className="button button--secondary" disabled={structuralLocked} type="button" onClick={() => onChange({ ...entry, items: [...entry.items, createClassEquipmentItemDraft()] })}>Add equipment item</button>
      </div>
      <div className="field-grid field-grid--two">
        <label className="field"><span>Starting currency</span><input disabled={structuralLocked} type="number" min="0" value={entry.currency?.amount ?? 0} onChange={(event) => onChange({ ...entry, currency: { amount: Number(event.target.value), unit: entry.currency?.unit ?? 'gp' } })} /></label>
        <label className="field"><span>Currency unit</span><select disabled={structuralLocked} value={entry.currency?.unit ?? 'gp'} onChange={(event) => onChange({ ...entry, currency: { amount: entry.currency?.amount ?? 0, unit: event.target.value as 'cp' | 'sp' | 'gp' } })}><option value="cp">CP</option><option value="sp">SP</option><option value="gp">GP</option></select></label>
      </div>
    </article>
  );
}

function ClassForgeReview({ draft, onBack, onSave, saveError }: { draft: ClassForgeDraft; onBack: () => void; onSave: () => void; saveError: string | null }) {
  const subclassMarkers = draft.features.filter((feature) => feature.referenceEffects.some((effect) => effect.name === 'Subclass Acquisition'));
  const asiFeatures = draft.features.filter((feature) => feature.referenceEffects.some((effect) => effect.id === 'feat-acquisition'));
  const providers = draft.features.flatMap((feature) => feature.providers.map((provider) => ({ level: feature.level, provider })));
  return (
    <div className="forge-review">
      <section className="panel form-section">
        <div className="section-heading"><span className="eyebrow">Review</span><h2>{draft.name}</h2><p>Review is semantic only. Save is the single persistence/publication point.</p></div>
        <dl className="detail-list">
          <div><dt>Content ID</dt><dd className="forge-identity">{draft.id}</dd></div>
          <div><dt>Source</dt><dd>Homebrew · {draft.sourceNamespace}</dd></div>
          <div><dt>Hit Die</dt><dd>d{draft.hitDie} · fixed later-level HP {draft.fixedHitPointsPerLevel}</dd></div>
          <div><dt>Primary / multiclass prerequisite</dt><dd>{primaryAbilityLabel(draft.primaryAbility)} · existing M14 threshold 13+</dd></div>
          <div><dt>Starting saves</dt><dd>{draft.savingThrowProficiencies.map((ability) => ABILITY_LABELS[ability]).join(', ')}</dd></div>
          <div><dt>Starting skills</dt><dd>Choose {draft.skillChoices.choose} from {draft.skillChoices.from.map((skill) => SKILL_DEFINITIONS[skill].name).join(', ')}</dd></div>
          <div><dt>Starting armor</dt><dd>{draft.armorTraining.join(', ') || 'None'}</dd></div>
          <div><dt>Multiclass armor</dt><dd>{draft.multiclassProficiencies.armorTraining.join(', ') || 'None'}</dd></div>
          <div><dt>Starting equipment</dt><dd>{draft.startingEquipment.length} package{draft.startingEquipment.length === 1 ? '' : 's'}</dd></div>
          <div><dt>Progression</dt><dd>20 canonical rows · standard PB +2 → +6</dd></div>
          <div><dt>HP semantics</dt><dd>Starting level 1 uses full d{draft.hitDie}; added-Class and later levels use the existing fixed/rolled HP pipeline.</dd></div>
        </dl>
      </section>

      <section className="panel form-section">
        <div className="section-heading"><span className="eyebrow">Advancement</span><h2>1–20 progression</h2><p>PB is generated from the standard progression; Character PB still uses total Character level through the existing runtime.</p></div>
        <div className="forge-review-feature-list">
          {Array.from({ length: 20 }, (_, index) => index + 1).map((level) => {
            const features = draft.features.filter((feature) => feature.level === level);
            const mastery = draft.masteryCapacity.find((row) => row.level === level)?.choices ?? 0;
            return <article className="forge-review-feature" key={level}><div><span className="eyebrow">Class Level {level} · PB +{standardClassProficiencyBonus(level)} · Mastery capacity {mastery}</span>{features.length ? features.map((feature) => <div key={feature.draftId}><h3>{feature.name}</h3><p>{feature.description}</p><small>{featureSummary(feature).join(' · ') || 'No executable mechanics'}</small></div>) : <p>No feature gained at this level.</p>}</div></article>;
          })}
        </div>
      </section>

      <section className="panel form-section">
        <div className="section-heading"><span className="eyebrow">AUTOMATED</span><h2>Bounded runtime contracts</h2></div>
        <p>{draft.classResources.length + draft.features.flatMap((feature) => feature.resources).length} resources · {draft.features.flatMap((feature) => feature.consumers).length} actions · {draft.features.flatMap((feature) => feature.transactions).length} transactions · {draft.features.flatMap((feature) => feature.activeEffects).length} active self effects.</p>
        <p>{providers.length} Spellcasting provider{providers.length === 1 ? '' : 's'}: {providers.map(({ level, provider }) => provider.definition.name + ' @ Class ' + level + ' (' + (provider.definition.multiclassSlotContribution.kind === 'spellcasting' ? provider.definition.multiclassSlotContribution.contribution : provider.definition.multiclassSlotContribution.kind) + ')').join(', ') || 'None'}.</p>
        <p>Subclass acquisition markers: {subclassMarkers.map((feature) => 'level ' + feature.level).join(', ') || 'none authored'}. Actual subclass choices remain matching SubclassContent in the effective catalog.</p>
        <p>Supported M15 feat acquisition: {asiFeatures.map((feature) => feature.name + ' @ ' + feature.level).join(', ') || 'none authored'}.</p>
        <p>Weapon Mastery capacity is authored as capacity only; generic persisted mastery selection/advancement remains deferred.</p>
      </section>

      <section className="panel form-section forge-unsupported">
        <span className="eyebrow">MANUAL / REFERENCE</span>
        <h2>Deliberate boundaries</h2>
        <p>Generic feature choices, multiclass tool-choice persistence, generic mastery selection, arbitrary feat grants, later Wizard-style spellbook gains, target-state mechanics, scripts, formulas, and encounter/world automation remain outside M16-F.</p>
        {draft.features.flatMap((feature) => feature.referenceEffects.filter((effect) => effect.id !== 'feat-acquisition').map((effect) => <div key={feature.id + ':' + effect.id}><strong>{feature.name} · {effect.name}</strong><p>{effect.description}</p></div>))}
      </section>

      {saveError && <div className="form-alert" role="alert">{saveError}</div>}
      <div className="forge-review-actions"><button className="button button--secondary" type="button" onClick={onBack}>Back to Edit</button><button className="button button--primary" type="button" onClick={onSave}>Save Class</button></div>
    </div>
  );
}

export function ClassForgePage() {
  const { contentId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [initial] = useState<InitialDraftState>(() => resolveInitialDraft(contentId, searchParams.get('duplicate')));
  const [draft, setDraft] = useState<ClassForgeDraft | null>(() => initial.draft ?? null);
  const [stage, setStage] = useState<'edit' | 'review'>('edit');
  const [validationErrors, setValidationErrors] = useState<readonly string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!draft || initial.error) {
    return <div className="stack-page creator-forge-page"><CreatorForgeNav /><section className="empty-state panel"><h1>Class Forge unavailable</h1><p>{initial.error ?? 'The requested Class could not be loaded.'}</p><Link className="button button--secondary" to="/creator-forge/classes">Back to Custom Classes</Link></section></div>;
  }

  const structuralLocked = initial.mode === 'edit';
  const modeLabel = initial.mode === 'edit' ? 'Edit Class' : initial.mode === 'duplicate' ? 'Duplicate Class' : 'Create Class';
  const spellLists = collectSpellListOptions(contentRegistry);
  const spells = [...contentRegistry.getAll('spell')].sort((left, right) => left.level - right.level || left.name.localeCompare(right.name));

  function updateFeature(next: ClassForgeFeatureDraft) {
    setDraft((current) => current ? { ...current, features: replaceByDraftId(current.features, next) } : current);
  }

  function moveFeature(feature: ClassForgeFeatureDraft, direction: -1 | 1) {
    setDraft((current) => {
      if (!current) return current;
      const index = current.features.findIndex((entry) => entry.draftId === feature.draftId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.features.length) return current;
      const features = [...current.features];
      [features[index], features[target]] = [features[target], features[index]];
      return { ...current, features };
    });
  }

  function review() {
    if (!draft) return;
    const errors = validateClassForgeDraft(draft, contentRegistry);
    setValidationErrors(errors);
    setSaveError(null);
    if (errors.length === 0) setStage('review');
  }

  async function save() {
    if (!draft) return;
    const errors = validateClassForgeDraft(draft, contentRegistry);
    if (errors.length) {
      setValidationErrors(errors);
      setStage('edit');
      return;
    }
    const classContent = buildClassContentFromDraft(draft);
    const result = await upsertAndPublishApplicationContent(classContent);
    if (!result.ok) {
      const issues = result.error.storageError?.issues?.map((issue) => issue.message).join(' ');
      setSaveError(issues ? result.error.message + ' ' + issues : result.error.message);
      return;
    }
    navigate('/creator-forge/classes');
  }

  if (stage === 'review') {
    return <div className="stack-page creator-forge-page"><CreatorForgeNav /><header className="page-heading"><span className="eyebrow">Creator Forge · Class Review</span><h1>Review before Save</h1><p>Canonical ClassContent only; unsupported behavior remains explicit reference content.</p></header><ClassForgeReview draft={draft} onBack={() => { setStage('edit'); setSaveError(null); }} onSave={save} saveError={saveError} /></div>;
  }

  const unsupportedStartingWeaponRules = draft.weaponProficiencies.filter((rule) => rule.kind !== 'category');
  const unsupportedMulticlassWeaponRules = draft.multiclassProficiencies.weaponProficiencies.filter((rule) => rule.kind !== 'category');

  return (
    <div className="stack-page creator-forge-page">
      <CreatorForgeNav />
      <header className="page-heading page-heading--actions"><div><span className="eyebrow">Creator Forge · Classes</span><h1>{modeLabel}</h1><p>The draft is ephemeral. Save publishes canonical ClassContent through the existing M16-B catalog authority.</p></div><Link className="button button--secondary" to="/creator-forge/classes">Cancel</Link></header>
      {validationErrors.length > 0 && <div className="form-alert" role="alert">{validationErrors.map((error) => <div key={error}>{error}</div>)}</div>}

      <section className="panel form-section">
        <div className="section-heading"><span className="eyebrow">Identity</span><h2>Stable canonical identity</h2><p>Rename preserves the Class ID. Edit locks structural Character-facing contracts until M16-G can analyze references; Duplicate owns a fresh private graph.</p></div>
        <dl className="detail-list"><div><dt>Content ID</dt><dd className="forge-identity">{draft.id}</dd></div><div><dt>Kind</dt><dd>Class</dd></div><div><dt>Source</dt><dd>Homebrew · {draft.sourceNamespace}</dd></div></dl>
        <label className="field forge-field-block"><span>Class name</span><input aria-label="Class name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      </section>

      <section className="panel form-section">
        <div className="section-heading"><span className="eyebrow">Core</span><h2>Hit Die, HP, and primary ability</h2><p>Primary ability is also the existing M14 multiclass prerequisite: every required ability must meet the current 13+ rule according to one-of/all-of mode.</p></div>
        <div className="field-grid field-grid--two">
          <label className="field"><span>Hit Die</span><select aria-label="Hit Die" disabled={structuralLocked} value={draft.hitDie} onChange={(event) => setDraft({ ...draft, hitDie: Number(event.target.value) as typeof draft.hitDie, fixedHitPointsPerLevel: Math.min(draft.fixedHitPointsPerLevel, Number(event.target.value)) })}>{CLASS_FORGE_HIT_DICE.map((die) => <option key={die} value={die}>d{die}</option>)}</select></label>
          <label className="field"><span>Fixed HP per added/later level</span><input aria-label="Fixed HP per level" disabled={structuralLocked} type="number" min="1" max={draft.hitDie} value={draft.fixedHitPointsPerLevel} onChange={(event) => setDraft({ ...draft, fixedHitPointsPerLevel: Number(event.target.value) })} /></label>
          <label className="field"><span>Primary ability mode</span><select aria-label="Primary ability mode" disabled={structuralLocked} value={draft.primaryAbility.mode} onChange={(event) => setDraft({ ...draft, primaryAbility: { ...draft.primaryAbility, mode: event.target.value as ClassPrimaryAbility['mode'] } })}><option value="one-of">One of selected abilities</option><option value="all-of">All selected abilities</option></select></label>
        </div>
        <div className="choice-grid" aria-label="Primary abilities">{abilityOptions().map((ability) => <label className="choice-card" key={ability}><input disabled={structuralLocked} type="checkbox" checked={draft.primaryAbility.abilities.includes(ability)} onChange={(event) => setDraft({ ...draft, primaryAbility: { ...draft.primaryAbility, abilities: toggleValue(draft.primaryAbility.abilities, ability, event.target.checked) } })} /><span>{ABILITY_LABELS[ability]}</span></label>)}</div>
      </section>

      <section className="panel form-section">
        <div className="section-heading"><span className="eyebrow">Starting Class</span><h2>Saves, skills, weapons, armor, and tools</h2><p>These apply only when the Class is the explicit startingClassId. Added multiclass levels use the separate contract below.</p></div>
        <h3>Saving throws · choose exactly 2</h3>
        <div className="choice-grid" aria-label="Starting saving throws">{abilityOptions().map((ability) => <label className="choice-card" key={ability}><input disabled={structuralLocked} type="checkbox" checked={draft.savingThrowProficiencies.includes(ability)} onChange={(event) => setDraft({ ...draft, savingThrowProficiencies: toggleValue(draft.savingThrowProficiencies, ability, event.target.checked) })} /><span>{ABILITY_LABELS[ability]}</span></label>)}</div>
        <div className="field-grid field-grid--two"><label className="field"><span>Starting skills chosen</span><input aria-label="Starting skill choice count" disabled={structuralLocked} type="number" min="0" max={draft.skillChoices.from.length} value={draft.skillChoices.choose} onChange={(event) => setDraft({ ...draft, skillChoices: { ...draft.skillChoices, choose: Number(event.target.value) } })} /></label></div>
        <div className="choice-grid" aria-label="Starting class skill list">{skillOptions().map((skill) => <label className="choice-card" key={skill}><input disabled={structuralLocked} type="checkbox" checked={draft.skillChoices.from.includes(skill)} onChange={(event) => setDraft({ ...draft, skillChoices: { ...draft.skillChoices, from: toggleValue(draft.skillChoices.from, skill, event.target.checked) } })} /><span>{SKILL_DEFINITIONS[skill].name}</span></label>)}</div>
        <h3>Weapon training</h3>
        <div className="choice-grid">{CLASS_FORGE_WEAPON_CATEGORIES.map((category) => <label className="choice-card" key={category}><input disabled={structuralLocked} type="checkbox" checked={weaponCategorySelected(draft.weaponProficiencies, category)} onChange={(event) => setDraft({ ...draft, weaponProficiencies: toggleWeaponCategory(draft.weaponProficiencies, category, event.target.checked) })} /><span>{titleCase(category)}</span></label>)}</div>
        {unsupportedStartingWeaponRules.length > 0 && <p className="legacy-note">Loaded property-qualified weapon proficiency rules are preserved canonically but are not generalized into a new Class Forge proficiency DSL.</p>}
        <h3>Armor training</h3>
        <div className="choice-grid">{CLASS_FORGE_ARMOR_CATEGORIES.map((category) => <label className="choice-card" key={category}><input disabled={structuralLocked} type="checkbox" checked={draft.armorTraining.includes(category)} onChange={(event) => setDraft({ ...draft, armorTraining: toggleValue(draft.armorTraining, category, event.target.checked) })} /><span>{titleCase(category)}</span></label>)}</div>
        <h3>Fixed tool proficiencies</h3>
        <div className="forge-editor-list">{draft.toolProficiencies.map((tool) => <div className="forge-level-table__row" key={tool.id}><label className="field"><span>Tool</span><input disabled={structuralLocked} value={tool.name} onChange={(event) => setDraft({ ...draft, toolProficiencies: draft.toolProficiencies.map((candidate) => candidate.id === tool.id ? { ...candidate, name: event.target.value } : candidate) })} /></label><small className="forge-identity">{tool.id}</small><button className="button button--secondary" disabled={structuralLocked} type="button" onClick={() => setDraft({ ...draft, toolProficiencies: draft.toolProficiencies.filter((candidate) => candidate.id !== tool.id) })}>Remove</button></div>)}</div>
        <button className="button button--secondary" disabled={structuralLocked} type="button" onClick={() => setDraft({ ...draft, toolProficiencies: [...draft.toolProficiencies, createClassToolProficiency()] })}>Add fixed tool</button>
      </section>

      <section className="panel form-section">
        <div className="section-heading"><span className="eyebrow">Added Class</span><h2>Multiclass proficiency package</h2><p>This is deliberately separate from starting saves/proficiencies. Character v9 supports fixed grants and bounded skill choices; multiclass tool-choice persistence remains reference-only.</p></div>
        <h3>Weapon grants</h3>
        <div className="choice-grid">{CLASS_FORGE_WEAPON_CATEGORIES.map((category) => <label className="choice-card" key={category}><input disabled={structuralLocked} type="checkbox" checked={weaponCategorySelected(draft.multiclassProficiencies.weaponProficiencies, category)} onChange={(event) => setDraft({ ...draft, multiclassProficiencies: { ...draft.multiclassProficiencies, weaponProficiencies: toggleWeaponCategory(draft.multiclassProficiencies.weaponProficiencies, category, event.target.checked) } })} /><span>{titleCase(category)}</span></label>)}</div>
        {unsupportedMulticlassWeaponRules.length > 0 && <p className="legacy-note">Loaded property-qualified multiclass weapon rules are preserved but not expanded into a universal proficiency editor.</p>}
        <h3>Armor grants</h3>
        <div className="choice-grid">{CLASS_FORGE_ARMOR_CATEGORIES.map((category) => <label className="choice-card" key={category}><input disabled={structuralLocked} type="checkbox" checked={draft.multiclassProficiencies.armorTraining.includes(category)} onChange={(event) => setDraft({ ...draft, multiclassProficiencies: { ...draft.multiclassProficiencies, armorTraining: toggleValue(draft.multiclassProficiencies.armorTraining, category, event.target.checked) } })} /><span>{titleCase(category)}</span></label>)}</div>
        <label className="field forge-field-small"><span>Multiclass skill-choice contract</span><select aria-label="Multiclass skill choice kind" disabled={structuralLocked} value={draft.multiclassProficiencies.skillChoices?.kind ?? 'none'} onChange={(event) => {
          const kind = event.target.value;
          setDraft({ ...draft, multiclassProficiencies: { ...draft.multiclassProficiencies, skillChoices: kind === 'none' ? undefined : createMulticlassSkillChoice(kind as MulticlassSkillProficiencyChoice['kind'], draft.skillChoices.from) } });
        }}><option value="none">No added skill choice</option><option value="class-skill-list">Choose from Class skill list</option><option value="any-skill">Choose any skill</option><option value="options">Choose from explicit options</option></select></label>
        {draft.multiclassProficiencies.skillChoices && <label className="field forge-field-small"><span>Skills chosen</span><input aria-label="Multiclass skill choice count" disabled={structuralLocked} type="number" min="1" value={draft.multiclassProficiencies.skillChoices.choose} onChange={(event) => setDraft({ ...draft, multiclassProficiencies: { ...draft.multiclassProficiencies, skillChoices: { ...draft.multiclassProficiencies.skillChoices!, choose: Number(event.target.value) } as MulticlassSkillProficiencyChoice } })} /></label>}
        {draft.multiclassProficiencies.skillChoices?.kind === 'options' && <div className="choice-grid" aria-label="Multiclass skill options">{skillOptions().map((skill) => <label className="choice-card" key={skill}><input disabled={structuralLocked} type="checkbox" checked={draft.multiclassProficiencies.skillChoices?.kind === 'options' && draft.multiclassProficiencies.skillChoices.from.includes(skill)} onChange={(event) => {
          const current = draft.multiclassProficiencies.skillChoices;
          if (!current || current.kind !== 'options') return;
          setDraft({ ...draft, multiclassProficiencies: { ...draft.multiclassProficiencies, skillChoices: { ...current, from: toggleValue(current.from, skill, event.target.checked) } } });
        }} /><span>{SKILL_DEFINITIONS[skill].name}</span></label>)}</div>}
        <h3>Fixed multiclass tools</h3>
        {draft.multiclassProficiencies.toolProficiencies.map((tool) => <div className="forge-level-table__row" key={tool.id}><label className="field"><span>Tool</span><input disabled={structuralLocked} value={tool.name} onChange={(event) => setDraft({ ...draft, multiclassProficiencies: { ...draft.multiclassProficiencies, toolProficiencies: draft.multiclassProficiencies.toolProficiencies.map((candidate) => candidate.id === tool.id ? { ...candidate, name: event.target.value } : candidate) } })} /></label><small className="forge-identity">{tool.id}</small><button className="button button--secondary" disabled={structuralLocked} type="button" onClick={() => setDraft({ ...draft, multiclassProficiencies: { ...draft.multiclassProficiencies, toolProficiencies: draft.multiclassProficiencies.toolProficiencies.filter((candidate) => candidate.id !== tool.id) } })}>Remove</button></div>)}
        <button className="button button--secondary" disabled={structuralLocked} type="button" onClick={() => setDraft({ ...draft, multiclassProficiencies: { ...draft.multiclassProficiencies, toolProficiencies: [...draft.multiclassProficiencies.toolProficiencies, createClassToolProficiency()] } })}>Add fixed multiclass tool</button>
        {(draft.multiclassProficiencies.toolChoices?.length ?? 0) > 0 && <p className="legacy-note">This Class contains canonical multiclass tool-choice metadata. It is preserved unchanged on Edit, but Character v9 has no persisted field for the choice itself, so Class Forge does not pretend to automate it.</p>}
      </section>

      <section className="panel form-section">
        <div className="section-heading"><span className="eyebrow">Starting Equipment</span><h2>Creation-time packages</h2><p>Only ordinary Character creation consumes a chosen starting-Class package. Added multiclass Classes do not reseed Inventory.</p></div>
        <div className="forge-editor-list">{draft.startingEquipment.map((entry) => <EquipmentPackageEditor key={entry.draftId} entry={entry} structuralLocked={structuralLocked} onChange={(next) => setDraft({ ...draft, startingEquipment: replaceByDraftId(draft.startingEquipment, next) })} onRemove={() => setDraft({ ...draft, startingEquipment: draft.startingEquipment.filter((candidate) => candidate.draftId !== entry.draftId) })} />)}</div>
        <button className="button button--secondary" disabled={structuralLocked} type="button" onClick={() => setDraft({ ...draft, startingEquipment: [...draft.startingEquipment, createClassEquipmentOptionDraft()] })}>Add equipment package</button>
      </section>

      <section className="panel form-section">
        <div className="section-heading"><span className="eyebrow">Class-wide Resources</span><h2>Canonical Class resources</h2><p>These use the existing owner-level resource model. Feature-owned resources can also be authored directly on their feature cards below.</p></div>
        <div className="forge-editor-list">{draft.classResources.map((entry) => <ClassForgeResourceEditor key={entry.draftId} entry={entry} featureLevel={1} onChange={(next: ClassForgeResourceDraft) => setDraft({ ...draft, classResources: replaceByDraftId(draft.classResources, next) })} onRemove={() => setDraft({ ...draft, classResources: draft.classResources.filter((candidate) => candidate.draftId !== entry.draftId) })} />)}</div>
        <button className="button button--secondary" type="button" onClick={() => setDraft({ ...draft, classResources: [...draft.classResources, createClassResourceDraft(1)] })}>Add Class Resource</button>
      </section>

      <section className="panel form-section">
        <div className="section-heading"><span className="eyebrow">Progression</span><h2>Complete Class levels 1–20</h2><p>All twenty canonical rows are generated automatically. PB is standard and non-arbitrary. Weapon Mastery is capacity only; persisted mastery selection remains deferred.</p></div>
        <div className="forge-class-progression">
          {Array.from({ length: 20 }, (_, index) => index + 1).map((level) => {
            const features = draft.features.filter((feature) => feature.level === level);
            const mastery = draft.masteryCapacity.find((entry) => entry.level === level)?.choices ?? 0;
            return (
              <article className="forge-editor-row" key={level} aria-label={'Class level ' + level}>
                <div className="forge-editor-row__header"><div><span className="eyebrow">Level {level}</span><h3>PB +{standardClassProficiencyBonus(level)}</h3></div><label className="field forge-field-small"><span>Weapon Mastery capacity</span><input aria-label={'Level ' + level + ' Weapon Mastery capacity'} disabled={structuralLocked} type="number" min="0" value={mastery} onChange={(event) => setDraft({ ...draft, masteryCapacity: draft.masteryCapacity.map((row) => row.level === level ? { ...row, choices: Number(event.target.value) } : row) })} /></label></div>
                <div className="forge-inline-actions">
                  <button className="button button--secondary" type="button" onClick={() => setDraft({ ...draft, features: [...draft.features, createClassFeatureDraft(level)] })}>Add Feature</button>
                  <button className="button button--secondary" type="button" onClick={() => setDraft({ ...draft, features: [...draft.features, createClassSubclassMarkerFeatureDraft(level, draft.name)] })}>Add Subclass Marker</button>
                  <button className="button button--secondary" type="button" onClick={() => setDraft({ ...draft, features: [...draft.features, createClassFeatAcquisitionFeatureDraft(level, 'ability-score-improvement')] })}>Add ASI</button>
                  <button className="button button--secondary" type="button" onClick={() => setDraft({ ...draft, features: [...draft.features, createClassFeatAcquisitionFeatureDraft(level, 'epic-boon')] })}>Add Epic Boon</button>
                </div>
                <small>{features.length ? features.map((feature) => feature.name || 'Unnamed feature').join(' · ') : 'No features at this level.'}</small>
              </article>
            );
          })}
        </div>
      </section>

      <div className="class-forge-feature-list">
        {draft.features.map((feature, index) => <ClassForgeFeatureEditor key={feature.draftId} draft={draft} feature={feature} index={index} featureCount={draft.features.length} spellLists={spellLists} spells={spells} onChange={updateFeature} onMove={(direction) => moveFeature(feature, direction)} onRemove={() => setDraft({ ...draft, features: draft.features.filter((candidate) => candidate.draftId !== feature.draftId) })} />)}
      </div>

      <section className="panel form-section forge-unsupported">
        <div className="section-heading"><span className="eyebrow">Deferred</span><h2>Bounded Class authoring only</h2></div>
        <p>Generic feature choices, generic mastery-selection persistence, arbitrary feat acquisition, multiclass tool-choice persistence, later Wizard-style spellbook growth, scripting, formulas, target-state rules, and encounter/VTT mechanics remain manual/reference-only or deferred.</p>
      </section>

      <div className="forge-review-actions"><Link className="button button--secondary" to="/creator-forge/classes">Cancel</Link><button className="button button--primary" type="button" onClick={review}>Review Class</button></div>
    </div>
  );
}
