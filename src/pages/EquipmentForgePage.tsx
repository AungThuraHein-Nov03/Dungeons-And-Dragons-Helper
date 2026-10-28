import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CreatorForgeNav } from '../components/CreatorForgeNav';
import {
  EQUIPMENT_FORGE_AMMUNITION_TYPES,
  EQUIPMENT_FORGE_ARMOR_CATEGORIES,
  EQUIPMENT_FORGE_CURRENCY_UNITS,
  EQUIPMENT_FORGE_DAMAGE_TYPES,
  EQUIPMENT_FORGE_DICE,
  EQUIPMENT_FORGE_EQUIPMENT_CATEGORIES,
  EQUIPMENT_FORGE_WEAPON_CATEGORIES,
  EQUIPMENT_FORGE_WEAPON_MODES,
  EQUIPMENT_FORGE_WEAPON_PROPERTY_TYPES,
  buildEquipmentContentFromDraft,
  copyEquipmentForgeDraft,
  createEquipmentForgeDraft,
  loadEquipmentForgeDraft,
  validateEquipmentForgeDraft,
  type EquipmentForgeBaseDraft,
  type EquipmentForgeContent,
  type EquipmentForgeDraft,
  type EquipmentForgeWeaponDraft,
} from '../components/equipmentForgeModel';
import type { ArmorCategory, ArmorClassModel, DamageAmount, EquipmentCategory, WeaponProperty } from '../models/content';
import { upsertAndPublishApplicationContent } from '../services/contentCatalog';
import { contentRegistry } from '../services/contentRegistry';
import { projectContentMutationsAreLocked } from '../services/persistenceBackend';

const LABELS: Record<string, string> = {
  weapon: 'Weapon',
  armor: 'Armor & Shield',
  equipment: 'Miscellaneous Equipment',
  simple: 'Simple',
  martial: 'Martial',
  melee: 'Melee',
  ranged: 'Ranged',
  light: 'Light',
  medium: 'Medium',
  heavy: 'Heavy',
  shield: 'Shield',
  ammunition: 'Ammunition',
  consumable: 'Consumable',
  'adventuring-gear': 'Adventuring gear',
  'campaign-item': 'Campaign item',
  other: 'Other',
  'two-handed': 'Two-handed',
  thrown: 'Thrown',
  versatile: 'Versatile',
  loading: 'Loading',
  reach: 'Reach',
  finesse: 'Finesse',
  full: 'Full Dexterity modifier',
  capped: 'Capped Dexterity modifier',
  none: 'No Dexterity modifier',
};

type EquipmentKind = EquipmentForgeDraft['kind'];

interface InitialState {
  readonly mode: 'create' | 'copy' | 'edit';
  readonly draft?: EquipmentForgeDraft;
  readonly error?: string;
}

function isEquipmentContent(entry: ReturnType<typeof contentRegistry.getById>): entry is EquipmentForgeContent {
  return entry?.kind === 'weapon' || entry?.kind === 'armor' || entry?.kind === 'equipment';
}

function resolveInitialState(contentId: string | undefined, templateId: string | null): InitialState {
  if (contentId) {
    const entry = contentRegistry.getById(decodeURIComponent(contentId));
    if (!isEquipmentContent(entry)) return { mode: 'edit', error: 'Custom equipment not found.' };
    const loaded = loadEquipmentForgeDraft(entry);
    return loaded.ok ? { mode: 'edit', draft: loaded.draft } : { mode: 'edit', error: loaded.message };
  }
  if (templateId) {
    const entry = contentRegistry.getById(templateId);
    if (!isEquipmentContent(entry)) return { mode: 'copy', error: 'The selected equipment template was not found.' };
    const copied = copyEquipmentForgeDraft(entry);
    return copied.ok ? { mode: 'copy', draft: copied.draft } : { mode: 'copy', error: copied.message };
  }
  return { mode: 'create' };
}

function NumberField({
  label,
  value,
  min,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={value} min={min} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function DamageFields({
  damage,
  prefix,
  onChange,
}: {
  damage: DamageAmount;
  prefix: string;
  onChange: (damage: DamageAmount) => void;
}) {
  return (
    <div className="form-grid form-grid--three">
      <label className="field">
        <span>{prefix} model</span>
        <select
          value={damage.kind}
          onChange={(event) => onChange(event.target.value === 'fixed' ? { kind: 'fixed', amount: 1 } : { kind: 'dice', count: 1, die: 6 })}
        >
          <option value="dice">Dice</option>
          <option value="fixed">Fixed amount</option>
        </select>
      </label>
      {damage.kind === 'dice' ? (
        <>
          <NumberField label={`${prefix} dice count`} value={damage.count} min={1} onChange={(count) => onChange({ ...damage, count })} />
          <label className="field">
            <span>{prefix} die size</span>
            <select value={damage.die} onChange={(event) => onChange({ ...damage, die: Number(event.target.value) as (typeof EQUIPMENT_FORGE_DICE)[number] })}>
              {EQUIPMENT_FORGE_DICE.map((die) => <option value={die} key={die}>d{die}</option>)}
            </select>
          </label>
        </>
      ) : (
        <NumberField label={`${prefix} amount`} value={damage.amount} min={1} onChange={(amount) => onChange({ ...damage, amount })} />
      )}
    </div>
  );
}

function defaultProperty(type: WeaponProperty['type']): WeaponProperty {
  if (type === 'two-handed') return { type };
  if (type === 'thrown') return { type, range: { normal: 20, long: 60 } };
  if (type === 'ammunition') return { type, range: { normal: 80, long: 320 }, ammunition: 'arrow' };
  if (type === 'versatile') return { type, alternateDamage: { kind: 'dice', count: 1, die: 8 } };
  return { type };
}

function WeaponFields({ draft, onChange }: { draft: EquipmentForgeWeaponDraft; onChange: (draft: EquipmentForgeWeaponDraft) => void }) {
  function updateProperty(next: WeaponProperty) {
    onChange({ ...draft, properties: draft.properties.map((property) => property.type === next.type ? next : property) });
  }

  return (
    <>
      <section className="panel form-section">
        <div className="section-heading"><span className="eyebrow">Weapon profile</span><h2>Damage and handling</h2></div>
        <div className="form-grid form-grid--three">
          <label className="field"><span>Weapon category</span><select value={draft.category} onChange={(event) => onChange({ ...draft, category: event.target.value as EquipmentForgeWeaponDraft['category'] })}>{EQUIPMENT_FORGE_WEAPON_CATEGORIES.map((value) => <option value={value} key={value}>{LABELS[value]}</option>)}</select></label>
          <label className="field"><span>Weapon mode</span><select value={draft.mode} onChange={(event) => onChange({ ...draft, mode: event.target.value as EquipmentForgeWeaponDraft['mode'] })}>{EQUIPMENT_FORGE_WEAPON_MODES.map((value) => <option value={value} key={value}>{LABELS[value]}</option>)}</select></label>
          <label className="field"><span>Damage type</span><select value={draft.damageType} onChange={(event) => onChange({ ...draft, damageType: event.target.value as EquipmentForgeWeaponDraft['damageType'] })}>{EQUIPMENT_FORGE_DAMAGE_TYPES.map((value) => <option value={value} key={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
        </div>
        <DamageFields damage={draft.damage} prefix="Damage" onChange={(damage) => onChange({ ...draft, damage })} />
      </section>

      <section className="panel form-section">
        <div className="section-heading"><span className="eyebrow">Structured properties</span><h2>Properties and mastery</h2></div>
        <fieldset className="forge-check-group">
          <legend>Weapon properties</legend>
          <div className="forge-check-grid">
            {EQUIPMENT_FORGE_WEAPON_PROPERTY_TYPES.map((type) => {
              const selected = draft.properties.some((property) => property.type === type);
              return <label className="forge-check" key={type}><input type="checkbox" checked={selected} onChange={() => onChange({ ...draft, properties: selected ? draft.properties.filter((property) => property.type !== type) : [...draft.properties, defaultProperty(type)] })} /><span>{LABELS[type]}</span></label>;
            })}
          </div>
        </fieldset>
        <div className="equipment-property-details">
          {draft.properties.map((property) => {
            if (property.type === 'two-handed') return <label className="field" key={property.type}><span>Two-handed condition</span><select value={property.condition ?? 'always'} onChange={(event) => updateProperty(event.target.value === 'unless-mounted' ? { type: 'two-handed', condition: 'unless-mounted' } : { type: 'two-handed' })}><option value="always">Always</option><option value="unless-mounted">Unless mounted</option></select></label>;
            if (property.type === 'thrown' || property.type === 'ammunition') return (
              <div className="form-grid form-grid--three" key={property.type}>
                <NumberField label={`${LABELS[property.type]} normal range`} value={property.range.normal} min={1} onChange={(normal) => updateProperty({ ...property, range: { ...property.range, normal } })} />
                <NumberField label={`${LABELS[property.type]} long range`} value={property.range.long} min={1} onChange={(long) => updateProperty({ ...property, range: { ...property.range, long } })} />
                {property.type === 'ammunition' ? <label className="field"><span>Ammunition type</span><select value={property.ammunition} onChange={(event) => updateProperty({ ...property, ammunition: event.target.value as typeof property.ammunition })}>{EQUIPMENT_FORGE_AMMUNITION_TYPES.map((value) => <option value={value} key={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label> : null}
              </div>
            );
            if (property.type === 'versatile') return <DamageFields key={property.type} damage={property.alternateDamage} prefix="Versatile damage" onChange={(alternateDamage) => updateProperty({ ...property, alternateDamage })} />;
            return null;
          })}
        </div>
        <div className="form-grid form-grid--three">
          <label className="field"><span>Weapon mastery</span><select value={draft.masteryId} onChange={(event) => onChange({ ...draft, masteryId: event.target.value })}>{contentRegistry.getAll('weaponMastery').map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></label>
          <label className="field"><span>Attack bonus</span><select value={draft.attackBonus} onChange={(event) => onChange({ ...draft, attackBonus: Number(event.target.value) })}>{[0, 1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>+{value}</option>)}</select></label>
          <label className="field"><span>Damage bonus</span><select value={draft.damageBonus} onChange={(event) => onChange({ ...draft, damageBonus: Number(event.target.value) })}>{[0, 1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>+{value}</option>)}</select></label>
        </div>
      </section>
    </>
  );
}

function armorModelForCategory(category: ArmorCategory, current: ArmorClassModel): ArmorClassModel {
  if (category === 'shield') return current.kind === 'shield' ? current : { kind: 'shield', bonus: 2 };
  return current.kind === 'armor' ? current : { kind: 'armor', base: 11, dexterity: 'full' };
}

function ArmorFields({ draft, onChange }: { draft: Extract<EquipmentForgeDraft, { kind: 'armor' }>; onChange: (draft: Extract<EquipmentForgeDraft, { kind: 'armor' }>) => void }) {
  const armorClass = draft.armorClass;
  return (
    <section className="panel form-section">
      <div className="section-heading"><span className="eyebrow">Armor profile</span><h2>Protection and requirements</h2></div>
      <div className="form-grid form-grid--three">
        <label className="field"><span>Armor category</span><select value={draft.category} onChange={(event) => { const category = event.target.value as ArmorCategory; onChange({ ...draft, category, armorClass: armorModelForCategory(category, draft.armorClass) }); }}>{EQUIPMENT_FORGE_ARMOR_CATEGORIES.map((value) => <option value={value} key={value}>{LABELS[value]}</option>)}</select></label>
        {armorClass.kind === 'shield' ? <NumberField label="Shield Armor Class bonus" value={armorClass.bonus} min={1} onChange={(bonus) => onChange({ ...draft, armorClass: { kind: 'shield', bonus } })} /> : (
          <>
            <NumberField label="Base Armor Class" value={armorClass.base} min={1} onChange={(base) => onChange({ ...draft, armorClass: { ...armorClass, base } })} />
            <label className="field"><span>Dexterity contribution</span><select value={armorClass.dexterity} onChange={(event) => { const dexterity = event.target.value as 'full' | 'capped' | 'none'; onChange({ ...draft, armorClass: dexterity === 'capped' ? { kind: 'armor', base: armorClass.base, dexterity, dexterityCap: armorClass.dexterity === 'capped' ? armorClass.dexterityCap : 2 } : { kind: 'armor', base: armorClass.base, dexterity } }); }}>{['full', 'capped', 'none'].map((value) => <option value={value} key={value}>{LABELS[value]}</option>)}</select></label>
          </>
        )}
      </div>
      {armorClass.kind === 'armor' && armorClass.dexterity === 'capped' ? <div className="forge-field-small"><NumberField label="Dexterity modifier cap" value={armorClass.dexterityCap ?? 0} min={0} onChange={(dexterityCap) => onChange({ ...draft, armorClass: { ...armorClass, dexterityCap } })} /></div> : null}
      <div className="form-grid form-grid--three equipment-armor-options">
        <label className="forge-check forge-check--aligned"><input type="checkbox" checked={draft.strengthRequirement === null} onChange={(event) => onChange({ ...draft, strengthRequirement: event.target.checked ? null : 13 })} /><span>No Strength requirement</span></label>
        {draft.strengthRequirement === null ? null : <NumberField label="Strength requirement" value={draft.strengthRequirement} min={1} onChange={(strengthRequirement) => onChange({ ...draft, strengthRequirement })} />}
        <label className="forge-check forge-check--aligned"><input type="checkbox" checked={draft.stealthDisadvantage} onChange={(event) => onChange({ ...draft, stealthDisadvantage: event.target.checked })} /><span>Stealth Disadvantage</span></label>
        <label className="field"><span>Armor Class bonus</span><select value={draft.armorClassBonus} onChange={(event) => onChange({ ...draft, armorClassBonus: Number(event.target.value) })}>{[0, 1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>+{value}</option>)}</select></label>
      </div>
    </section>
  );
}

function StartingPoint({ onStart }: { onStart: (draft: EquipmentForgeDraft, mode: 'create' | 'copy') => void }) {
  const [kind, setKind] = useState<EquipmentKind>('weapon');
  const entries = contentRegistry.getAll(kind).slice().sort((a, b) => a.name.localeCompare(b.name));
  const [templateId, setTemplateId] = useState('');
  const selectedId = entries.some((entry) => entry.id === templateId) ? templateId : entries[0]?.id ?? '';

  function startTemplate() {
    const entry = contentRegistry.getById(selectedId);
    if (!isEquipmentContent(entry) || entry.kind !== kind) return;
    const copied = copyEquipmentForgeDraft(entry);
    if (copied.ok) onStart(copied.draft, 'copy');
  }

  return (
    <div className="equipment-start-grid">
      <section className="panel form-section">
        <div className="section-heading"><span className="eyebrow">Start from scratch</span><h2>Choose an equipment group</h2><p>Begin with safe canonical defaults for the selected kind.</p></div>
        <div className="equipment-scratch-actions">
          <button className="button button--secondary" type="button" onClick={() => onStart(createEquipmentForgeDraft('weapon'), 'create')}>Create Weapon from Scratch</button>
          <button className="button button--secondary" type="button" onClick={() => onStart(createEquipmentForgeDraft('armor'), 'create')}>Create Armor or Shield from Scratch</button>
          <button className="button button--secondary" type="button" onClick={() => onStart(createEquipmentForgeDraft('equipment'), 'create')}>Create Miscellaneous Equipment from Scratch</button>
        </div>
      </section>
      <section className="panel form-section">
        <div className="section-heading"><span className="eyebrow">Start from existing</span><h2>Copy a same-kind template</h2><p>Bundled and custom entries are copied into a new homebrew identity.</p></div>
        <div className="equipment-template-fields">
          <label className="field"><span>Template kind</span><select value={kind} onChange={(event) => { setKind(event.target.value as EquipmentKind); setTemplateId(''); }}><option value="weapon">Weapon</option><option value="armor">Armor &amp; Shield</option><option value="equipment">Miscellaneous Equipment</option></select></label>
          <label className="field"><span>Equipment template</span><select value={selectedId} onChange={(event) => setTemplateId(event.target.value)}>{entries.map((entry) => <option value={entry.id} key={entry.id}>{entry.name} · {entry.source.type === 'srd' ? 'Bundled SRD' : 'Homebrew'}</option>)}</select></label>
          <button className="button button--primary" type="button" disabled={!selectedId} onClick={startTemplate}>Start From Existing</button>
        </div>
      </section>
    </div>
  );
}

function CommonFields({ draft, onChange }: { draft: EquipmentForgeDraft; onChange: (draft: EquipmentForgeDraft) => void }) {
  function update(patch: Partial<EquipmentForgeBaseDraft>) {
    onChange({ ...draft, ...patch } as EquipmentForgeDraft);
  }
  return (
    <>
      <section className="panel form-section">
        <div className="section-heading"><span className="eyebrow">Identity</span><h2>Name and description</h2></div>
        <dl className="detail-list equipment-forge-identity"><div><dt>Content ID</dt><dd className="forge-identity">{draft.id}</dd></div><div><dt>Source</dt><dd>Homebrew · {draft.sourceNamespace}</dd></div><div><dt>Kind</dt><dd>{LABELS[draft.kind]}</dd></div></dl>
        <div className="form-grid">
          <label className="field"><span>Equipment name</span><input value={draft.name} onChange={(event) => update({ name: event.target.value })} /></label>
          <label className="field"><span>Description</span><textarea rows={4} value={draft.description} onChange={(event) => update({ description: event.target.value })} /></label>
        </div>
      </section>
      <section className="panel form-section">
        <div className="section-heading"><span className="eyebrow">Physical details</span><h2>Cost and weight</h2></div>
        <div className="form-grid form-grid--three">
          <NumberField label="Cost amount" value={draft.cost.amount} min={0} step={0.01} onChange={(amount) => update({ cost: { ...draft.cost, amount } })} />
          <label className="field"><span>Currency</span><select value={draft.cost.unit} onChange={(event) => update({ cost: { ...draft.cost, unit: event.target.value as typeof draft.cost.unit } })}>{EQUIPMENT_FORGE_CURRENCY_UNITS.map((unit) => <option value={unit} key={unit}>{unit.toUpperCase()}</option>)}</select></label>
          {draft.weightPounds === null ? null : <NumberField label="Weight in pounds" value={draft.weightPounds} min={0} step={0.1} onChange={(weightPounds) => update({ weightPounds })} />}
        </div>
        {draft.kind !== 'armor' ? <label className="forge-check forge-check--standalone"><input type="checkbox" checked={draft.weightPounds === null} onChange={(event) => update({ weightPounds: event.target.checked ? null : 0 })} /><span>Weight not specified</span></label> : null}
      </section>
      <section className="panel form-section">
        <div className="section-heading"><span className="eyebrow">Reference / Manual Effects</span><h2>Table-managed notes</h2><p>These notes remain descriptive and do not execute rules.</p></div>
        <div className="forge-editor-list">
          {draft.referenceEffects.map((effect, index) => <div className="forge-editor-row forge-editor-row--reference" key={index}><label className="field"><span>Reference effect {index + 1}</span><textarea rows={3} value={effect} onChange={(event) => update({ referenceEffects: draft.referenceEffects.map((candidate, candidateIndex) => candidateIndex === index ? event.target.value : candidate) })} /></label><button className="button button--secondary" type="button" onClick={() => update({ referenceEffects: draft.referenceEffects.filter((_, candidateIndex) => candidateIndex !== index) })}>Remove Reference Effect</button></div>)}
        </div>
        <button className="button button--secondary forge-field-block" type="button" onClick={() => update({ referenceEffects: [...draft.referenceEffects, ''] })}>Add Reference Effect</button>
      </section>
    </>
  );
}

function automatedEffects(draft: EquipmentForgeDraft): string[] {
  if (draft.kind === 'weapon') {
    const damage = draft.damage.kind === 'dice' ? `${draft.damage.count}d${draft.damage.die}` : String(draft.damage.amount);
    const mastery = contentRegistry.findMastery(draft.masteryId)?.name ?? 'Unknown mastery';
    return [`${damage} ${draft.damageType} damage.`, `${mastery} weapon mastery.`, `+${draft.attackBonus} weapon attack rolls.`, `+${draft.damageBonus} weapon damage rolls.`];
  }
  if (draft.kind === 'armor') {
    const armorClass = draft.armorClass.kind === 'shield' ? `+${draft.armorClass.bonus} shield Armor Class.` : `Base Armor Class ${draft.armorClass.base} with ${draft.armorClass.dexterity === 'capped' ? `Dexterity modifier (max ${draft.armorClass.dexterityCap ?? 0})` : draft.armorClass.dexterity === 'full' ? 'Dexterity modifier' : 'no Dexterity modifier'}.`;
    return [armorClass, `+${draft.armorClassBonus} item Armor Class bonus.`];
  }
  return [];
}

function Review({ draft, saving, saveError, onBack, onSave }: { draft: EquipmentForgeDraft; saving: boolean; saveError: string | null; onBack: () => void; onSave: () => void }) {
  const automated = automatedEffects(draft);
  return (
    <div className="forge-review">
      <section className="panel form-section"><div className="section-heading"><span className="eyebrow">Review</span><h2>{draft.name}</h2><p>Nothing is persisted until Save Equipment succeeds.</p></div><dl className="detail-list"><div><dt>Content ID</dt><dd className="forge-identity">{draft.id}</dd></div><div><dt>Kind</dt><dd>{LABELS[draft.kind]}</dd></div><div><dt>Description</dt><dd>{draft.description || 'No description.'}</dd></div></dl></section>
      <section className="detail-grid equipment-review-grid">
        <div className="panel detail-card forge-review-card--automated"><span className="eyebrow">Existing rules engine</span><h2>Automated Effects</h2>{automated.length ? automated.map((effect) => <p key={effect}>{effect}</p>) : <p>No automated effects.</p>}</div>
        <div className="panel detail-card forge-review-card--reference"><span className="eyebrow">Table managed</span><h2>Reference / Manual Effects</h2>{draft.referenceEffects.length ? draft.referenceEffects.map((effect, index) => <p key={`${effect}:${index}`}>{effect}</p>) : <p>No reference or manual effects.</p>}</div>
      </section>
      {saveError ? <p className="form-error" role="alert">{saveError}</p> : null}
      <div className="forge-review-actions"><button className="button button--secondary" type="button" onClick={onBack}>Back to Edit</button><button className="button button--primary" type="button" disabled={saving} onClick={onSave}>{saving ? 'Saving…' : 'Save Equipment'}</button></div>
    </div>
  );
}

export function EquipmentForgePage() {
  const { contentId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [initial] = useState(() => resolveInitialState(contentId, searchParams.get('template')));
  const [mode, setMode] = useState(initial.mode);
  const [draft, setDraft] = useState<EquipmentForgeDraft | undefined>(initial.draft);
  const [reviewing, setReviewing] = useState(false);
  const [validationErrors, setValidationErrors] = useState<readonly string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mutationsLocked = projectContentMutationsAreLocked();

  if (initial.error) {
    return <div className="stack-page creator-forge-page"><CreatorForgeNav /><section className="empty-state panel"><span className="eyebrow">Creator Forge · Equipment</span><h1>Equipment Forge unavailable</h1><p>{initial.error}</p><Link className="button button--primary" to="/creator-forge/equipment">Return to Equipment</Link></section></div>;
  }

  function beginReview() {
    if (!draft) return;
    const errors = validateEquipmentForgeDraft(draft, contentRegistry);
    setValidationErrors(errors);
    if (errors.length === 0) { setSaveError(null); setReviewing(true); }
  }

  async function save() {
    if (!draft) return;
    if (projectContentMutationsAreLocked()) { setSaveError('Project content mutations are currently locked.'); return; }
    setSaving(true);
    setSaveError(null);
    const result = await upsertAndPublishApplicationContent(buildEquipmentContentFromDraft(draft));
    setSaving(false);
    if (!result.ok) { setSaveError(result.error.message); return; }
    navigate('/creator-forge/equipment');
  }

  const title = mode === 'edit' ? 'Edit Equipment' : mode === 'copy' ? 'Create Equipment From Existing' : 'Create Equipment';
  return (
    <div className="stack-page creator-forge-page equipment-forge-editor">
      <CreatorForgeNav />
      <header className="page-heading page-heading--actions"><div><span className="eyebrow">Creator Forge · Equipment</span><h1>{title}</h1><p>Author canonical equipment with bounded fields and an explicit review before saving.</p></div><Link className="button button--secondary" to="/creator-forge/equipment">Cancel</Link></header>
      {mutationsLocked ? <div className="form-alert" role="status">Project content mutations are currently locked.</div> : null}
      {!draft ? <StartingPoint onStart={(nextDraft, nextMode) => { setDraft(nextDraft); setMode(nextMode); }} /> : reviewing ? (
        <Review draft={draft} saving={saving} saveError={saveError} onBack={() => setReviewing(false)} onSave={save} />
      ) : (
        <>
          <CommonFields draft={draft} onChange={setDraft} />
          {draft.kind === 'weapon' ? <WeaponFields draft={draft} onChange={setDraft} /> : null}
          {draft.kind === 'armor' ? <ArmorFields draft={draft} onChange={setDraft} /> : null}
          {draft.kind === 'equipment' ? <section className="panel form-section"><div className="section-heading"><span className="eyebrow">Equipment profile</span><h2>Miscellaneous category</h2></div><label className="field forge-field-small"><span>Equipment category</span><select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as EquipmentCategory })}>{EQUIPMENT_FORGE_EQUIPMENT_CATEGORIES.map((value) => <option value={value} key={value}>{LABELS[value]}</option>)}</select></label></section> : null}
          {validationErrors.length ? <div className="form-alert" role="alert"><strong>Resolve these fields before review:</strong><ul>{validationErrors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}
          <div className="forge-review-actions"><Link className="button button--secondary" to="/creator-forge/equipment">Cancel</Link><button className="button button--primary" type="button" disabled={mutationsLocked} onClick={beginReview}>Review Equipment</button></div>
        </>
      )}
    </div>
  );
}
