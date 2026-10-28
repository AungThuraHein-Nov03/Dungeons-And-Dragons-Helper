import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CURRENCY_UNITS,
  INVENTORY_CATEGORIES,
  type AbilityKey,
  type Character,
  type CharacterCurrency,
  type CustomInventoryEntry,
  type InventoryCategory,
  type InventoryEntry,
  type RegistryInventoryEntry,
} from '../models/character';
import { calculateInventoryWeight, inventoryCategoryForContent, resolveRegistryInventoryEntry } from '../rules/inventory';
import type { RuleResult } from '../rules/result';
import { getWeaponAttackAbilityOptions } from '../rules/weapons';
import {
  addApplicationCustomInventoryItem,
  addApplicationRegistryInventoryItem,
  adjustApplicationInventoryQuantity,
  removeApplicationInventoryItem,
  setApplicationCharacterCurrency,
  setApplicationInventoryItemEquipped,
  setApplicationInventoryWeaponAbilityChoice,
  updateApplicationCustomInventoryItem,
  updateApplicationInventoryNotes,
  updateApplicationRegistryDisplayName,
} from '../services/applicationInventoryMutations';
import { contentRegistry } from '../services/contentRegistry';
import { getApplicationCharacterById } from '../services/projectState';
import { formatArmorClass, formatDamage, formatWeaponProperty } from '../utils/contentFormat';

const CATEGORY_LABELS: Record<InventoryCategory, string> = {
  weapon: 'Weapon', armor: 'Armor', shield: 'Shield', ammunition: 'Ammunition', consumable: 'Consumable',
  'adventuring-gear': 'Adventuring Gear', 'campaign-item': 'Campaign Item', other: 'Other',
};
const ABILITY_LABELS: Record<AbilityKey, string> = {
  strength: 'Strength', dexterity: 'Dexterity', constitution: 'Constitution', intelligence: 'Intelligence', wisdom: 'Wisdom', charisma: 'Charisma',
};
type RegistryFilter = 'all' | InventoryCategory;
type OwnedFilter = 'all' | 'equipped' | 'unequipped';

interface ItemCardProps {
  characterId: string;
  entry: InventoryEntry;
  onResult: (result: RuleResult<Character> | Promise<RuleResult<Character>>) => void;
}

function RegistryItemCard({ characterId, entry, onResult }: ItemCardProps & { entry: RegistryInventoryEntry }) {
  const content = resolveRegistryInventoryEntry(entry, contentRegistry);
  const [notes, setNotes] = useState(entry.notes);
  const [displayName, setDisplayName] = useState(entry.displayName ?? '');
  const display = entry.displayName?.trim() || content?.name || 'Unresolved Item';
  const weapon = content?.kind === 'weapon' ? content : undefined;
  const abilityOptions = weapon ? getWeaponAttackAbilityOptions(weapon) : [];

  function remove() {
    if (!window.confirm(`Remove ${display} from inventory?`)) return;
    onResult(removeApplicationInventoryItem(characterId, entry.id));
  }

  return <article className={`inventory-card ${!content ? 'inventory-card--unresolved' : ''}`}>
    <div className="inventory-card__header">
      <div>
        <span className="eyebrow">{CATEGORY_LABELS[entry.category]}{entry.equipped ? ' · Equipped' : ''}</span>
        <h3>{display}</h3>
        {entry.displayName && content && <small>Base Item: {content.name}</small>}
        {!content && <small>Unresolved reference: {entry.contentId}</small>}
      </div>
      <div className="inventory-quantity" aria-label={`${display} quantity`}>
        <button type="button" className="mini-roll-button" aria-label={`Decrease ${display} quantity`} disabled={entry.quantity <= 1} onClick={() => onResult(adjustApplicationInventoryQuantity(characterId, entry.id, -1))}>−</button>
        <strong>{entry.quantity}</strong>
        <button type="button" className="mini-roll-button" aria-label={`Increase ${display} quantity`} onClick={() => onResult(adjustApplicationInventoryQuantity(characterId, entry.id, 1))}>+</button>
      </div>
    </div>

    {content ? <dl className="inventory-summary">
      {content.kind === 'weapon' ? <>
        <div><dt>Type</dt><dd>{content.category[0].toUpperCase() + content.category.slice(1)} {content.mode} weapon</dd></div>
        <div><dt>Damage</dt><dd>{formatDamage(content.damage)} {content.damageType}</dd></div>
        <div><dt>Properties</dt><dd>{content.properties.length ? content.properties.map(formatWeaponProperty).join(', ') : 'None'}</dd></div>
        <div><dt>Weight</dt><dd>{content.weightPounds === null ? 'Unknown' : `${content.weightPounds} lb.`}</dd></div>
      </> : content.kind === 'armor' ? <>
        <div><dt>Armor</dt><dd>{content.category === 'shield' ? `Shield ${formatArmorClass(content.armorClass)}` : `${content.category} · AC ${formatArmorClass(content.armorClass)}`}</dd></div>
        <div><dt>Weight</dt><dd>{content.weightPounds} lb.</dd></div>
      </> : <>
        <div><dt>Type</dt><dd>{CATEGORY_LABELS[content.category]}</dd></div>
        <div><dt>Cost</dt><dd>{content.cost.amount} {content.cost.unit.toUpperCase()}</dd></div>
        <div><dt>Weight</dt><dd>{content.weightPounds === null ? 'Unknown' : `${content.weightPounds} lb.`}</dd></div>
      </>}
    </dl> : <p className="inventory-warning">This content reference no longer resolves. It has no mechanical effect, but its stored record and notes are preserved until you remove it.</p>}

    {content?.description && <p>{content.description}</p>}
    {content?.referenceEffects?.length ? <div className="inventory-reference-effects"><span className="eyebrow">Reference Effects</span>{content.referenceEffects.map((effect) => <p key={effect}>{effect}</p>)}</div> : null}

    <div className="inventory-card__controls">
      {(content?.kind === 'weapon' || content?.kind === 'armor') && <button className="button button--secondary" type="button" onClick={() => onResult(setApplicationInventoryItemEquipped(characterId, entry.id, !entry.equipped))}>{entry.equipped ? 'Unequip' : 'Equip'}</button>}
      {entry.equipped && weapon && abilityOptions.length > 1 && <label className="field compact-field" htmlFor={`inventory-ability-${entry.id}`}><span>Attack ability</span><select id={`inventory-ability-${entry.id}`} value={entry.attackAbilityChoice ?? abilityOptions[0]} onChange={(event) => onResult(setApplicationInventoryWeaponAbilityChoice(characterId, entry.id, event.target.value as AbilityKey))}>{abilityOptions.map((ability) => <option key={ability} value={ability}>{ABILITY_LABELS[ability]}</option>)}</select></label>}
      <button className="button button--danger" type="button" onClick={remove}>Remove</button>
    </div>

    <div className="inventory-edit-grid">
      <label className="field" htmlFor={`display-name-${entry.id}`}><span>Display name (optional)</span><input id={`display-name-${entry.id}`} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <button className="button button--secondary inventory-save-button" type="button" onClick={() => onResult(updateApplicationRegistryDisplayName(characterId, entry.id, displayName))}>Save Name</button>
      <label className="field inventory-notes" htmlFor={`notes-${entry.id}`}><span>Notes</span><textarea id={`notes-${entry.id}`} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Player-facing notes only; notes never alter mechanics." /></label>
      <button className="button button--secondary inventory-save-button" type="button" onClick={() => onResult(updateApplicationInventoryNotes(characterId, entry.id, notes))}>Save Notes</button>
    </div>
  </article>;
}

function CustomItemCard({ characterId, entry, onResult }: ItemCardProps & { entry: CustomInventoryEntry }) {
  const [name, setName] = useState(entry.name);
  const [category, setCategory] = useState<InventoryCategory>(entry.category);
  const [notes, setNotes] = useState(entry.notes);
  const [weight, setWeight] = useState(entry.weightPounds === undefined ? '' : String(entry.weightPounds));

  function save() {
    onResult(updateApplicationCustomInventoryItem(characterId, entry.id, {
      name, category, notes, quantity: entry.quantity,
      ...(weight.trim() ? { weightPounds: Number(weight) } : {}),
    }));
  }
  function remove() {
    if (!window.confirm(`Remove ${entry.name} from inventory?`)) return;
    onResult(removeApplicationInventoryItem(characterId, entry.id));
  }

  return <article className="inventory-card inventory-card--custom">
    <div className="inventory-card__header"><div><span className="eyebrow">{CATEGORY_LABELS[entry.category]} · Custom</span><h3>{entry.name}</h3><small>Text-only campaign item; no automated mechanics.</small></div><div className="inventory-quantity" aria-label={`${entry.name} quantity`}><button type="button" className="mini-roll-button" aria-label={`Decrease ${entry.name} quantity`} disabled={entry.quantity <= 1} onClick={() => onResult(adjustApplicationInventoryQuantity(characterId, entry.id, -1))}>−</button><strong>{entry.quantity}</strong><button type="button" className="mini-roll-button" aria-label={`Increase ${entry.name} quantity`} onClick={() => onResult(adjustApplicationInventoryQuantity(characterId, entry.id, 1))}>+</button></div></div>
    <div className="inventory-edit-grid">
      <label className="field" htmlFor={`custom-name-${entry.id}`}><span>Name</span><input id={`custom-name-${entry.id}`} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="field" htmlFor={`custom-category-${entry.id}`}><span>Category</span><select id={`custom-category-${entry.id}`} value={category} onChange={(event) => setCategory(event.target.value as InventoryCategory)}>{INVENTORY_CATEGORIES.map((value) => <option key={value} value={value}>{CATEGORY_LABELS[value]}</option>)}</select></label>
      <label className="field" htmlFor={`custom-weight-${entry.id}`}><span>Weight (lb., optional)</span><input id={`custom-weight-${entry.id}`} type="number" min="0" step="0.01" value={weight} onChange={(event) => setWeight(event.target.value)} /></label>
      <label className="field inventory-notes" htmlFor={`custom-notes-${entry.id}`}><span>Notes</span><textarea id={`custom-notes-${entry.id}`} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
    </div>
    <div className="inventory-card__controls"><button className="button button--secondary" type="button" onClick={save}>Save Item</button><button className="button button--danger" type="button" onClick={remove}>Remove</button></div>
  </article>;
}

interface InventoryViewProps {
  characterId: string;
  onCharacterChange?: (character: Character) => void;
}

export function InventoryView({ characterId, onCharacterChange }: InventoryViewProps) {
  const [snapshot, setSnapshot] = useState<{ id: string; character: Character } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registrySearch, setRegistrySearch] = useState('');
  const [registryFilter, setRegistryFilter] = useState<RegistryFilter>('all');
  const [registryQuantity, setRegistryQuantity] = useState('1');
  const [ownedSearch, setOwnedSearch] = useState('');
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>('all');
  const [customName, setCustomName] = useState('');
  const [customCategory, setCustomCategory] = useState<InventoryCategory>('campaign-item');
  const [customQuantity, setCustomQuantity] = useState('1');
  const [customNotes, setCustomNotes] = useState('');
  const [customWeight, setCustomWeight] = useState('');
  const character = snapshot?.id === characterId ? snapshot.character : getApplicationCharacterById(characterId);
  const [currencyDraft, setCurrencyDraft] = useState<Record<string, string>>(() => {
    const loaded = getApplicationCharacterById(characterId);
    return Object.fromEntries(CURRENCY_UNITS.map((unit) => [unit, String(loaded?.currency[unit] ?? 0)]));
  });

  const registryItems = [...contentRegistry.getAll('weapon'), ...contentRegistry.getAll('armor'), ...contentRegistry.getAll('equipment')];
  if (!character) return <section className="empty-state panel"><h1>Character not found</h1><Link className="button button--secondary" to="/characters">Back to Characters</Link></section>;

  async function applyResult(result: RuleResult<Character> | Promise<RuleResult<Character>>) {
    const resolved = await result;
    if (!resolved.ok) { setError(resolved.error.message); return; }
    setError(null);
    setSnapshot({ id: characterId, character: resolved.value });
    onCharacterChange?.(resolved.value);
  }

  async function addCustom(event: FormEvent) {
    event.preventDefault();
    const result = await addApplicationCustomInventoryItem(characterId, {
      name: customName, category: customCategory, quantity: Number(customQuantity), notes: customNotes,
      ...(customWeight.trim() ? { weightPounds: Number(customWeight) } : {}),
    });
    if (result.ok) { setCustomName(''); setCustomQuantity('1'); setCustomNotes(''); setCustomWeight(''); }
    await applyResult(result);
  }

  function saveCurrency() {
    const next = Object.fromEntries(CURRENCY_UNITS.map((unit) => [unit, Number(currencyDraft[unit])])) as CharacterCurrency;
    applyResult(setApplicationCharacterCurrency(characterId, next));
  }

  const filteredRegistry = registryItems.filter((content) => {
    const category = inventoryCategoryForContent(content);
    return category !== undefined && (registryFilter === 'all' || category === registryFilter) && content.name.toLowerCase().includes(registrySearch.trim().toLowerCase());
  });
  const filteredOwned = character.inventory.filter((entry) => {
    const content = entry.kind === 'registry' ? resolveRegistryInventoryEntry(entry, contentRegistry) : undefined;
    const name = entry.kind === 'custom' ? entry.name : entry.displayName || content?.name || entry.contentId;
    const equipped = entry.kind === 'registry' && entry.equipped;
    return name.toLowerCase().includes(ownedSearch.trim().toLowerCase()) && (ownedFilter === 'all' || (ownedFilter === 'equipped' ? equipped : !equipped));
  });
  const weight = calculateInventoryWeight(character.inventory, contentRegistry);

  return <div className="stack-page inventory-page workspace-view workspace-view--inventory" data-testid="character-workspace-inventory">
    <section className="inventory-workspace-intro"><span className="eyebrow">Character Inventory</span><h2>Equipment & Gear</h2><p>Ownership lives here. Only equipped structured items participate in AC and active attacks.</p></section>
    {error && <div className="form-alert" role="alert">{error}</div>}
    <section className="panel inventory-overview"><div><span className="eyebrow">Carried Weight</span><strong>{weight.knownWeightPounds.toFixed(1).replace(/\.0$/, '')} lb.</strong><small>{weight.unknownQuantity ? `+ ${weight.unknownQuantity} item(s) with unknown weight` : 'Known items only; no encumbrance automation.'}</small></div><div><span className="eyebrow">Owned Entries</span><strong>{character.inventory.length}</strong><small>Quantity is tracked separately per entry.</small></div></section>
    <fieldset className="project-readonly-fieldset">
    <section className="panel inventory-section"><div className="section-heading"><span className="eyebrow">Currency</span><h2>Coins</h2><p>Tracking only. No conversion, shop, or transaction automation.</p></div><div className="currency-grid">{CURRENCY_UNITS.map((unit) => <label className="field" key={unit} htmlFor={`currency-${unit}`}><span>{unit.toUpperCase()}</span><input id={`currency-${unit}`} type="number" min="0" step="1" value={currencyDraft[unit]} onChange={(event) => setCurrencyDraft((current) => ({ ...current, [unit]: event.target.value }))} /></label>)}</div><button className="button button--secondary" type="button" onClick={saveCurrency}>Save Currency</button></section>
    <section className="panel inventory-section"><div className="section-heading"><span className="eyebrow">Add Structured Item</span><h2>Weapons, armor & gear</h2><p>Items resolve from the Content Registry; rules are never copied into Character storage.</p></div><div className="inventory-toolbar"><label className="field"><span>Search registry</span><input aria-label="Search registry items" value={registrySearch} onChange={(event) => setRegistrySearch(event.target.value)} placeholder="Scimitar, Chain Mail..." /></label><label className="field"><span>Category</span><select aria-label="Registry category" value={registryFilter} onChange={(event) => setRegistryFilter(event.target.value as RegistryFilter)}><option value="all">All Equipment</option>{INVENTORY_CATEGORIES.map((category) => <option value={category} key={category}>{CATEGORY_LABELS[category]}</option>)}</select></label><label className="field inventory-quantity-input"><span>Quantity</span><input aria-label="Registry item quantity" type="number" min="1" step="1" value={registryQuantity} onChange={(event) => setRegistryQuantity(event.target.value)} /></label></div><div className="inventory-add-results" role="region" aria-label="Registry item results">{filteredRegistry.map((content) => <div className="inventory-add-row" key={content.id}><div><strong>{content.name}</strong><small>{content.kind === 'weapon' ? `${content.category} ${content.mode} · ${formatDamage(content.damage)} ${content.damageType}` : content.kind === 'armor' ? `${content.category} · AC ${formatArmorClass(content.armorClass)}` : CATEGORY_LABELS[content.category]}</small></div><button className="button button--secondary" type="button" onClick={() => applyResult(addApplicationRegistryInventoryItem(characterId, content.id, Number(registryQuantity)))}>Add</button></div>)}</div></section>
    <section className="panel inventory-section"><div className="section-heading"><span className="eyebrow">Simple Custom Item</span><h2>Campaign & personal items</h2><p>These records are descriptive only. Notes and names never create mechanics.</p></div><form className="custom-item-form" onSubmit={addCustom}><label className="field"><span>Name</span><input aria-label="Custom item name" value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="House-Sealed Letter" /></label><label className="field"><span>Category</span><select aria-label="Custom item category" value={customCategory} onChange={(event) => setCustomCategory(event.target.value as InventoryCategory)}>{INVENTORY_CATEGORIES.map((value) => <option key={value} value={value}>{CATEGORY_LABELS[value]}</option>)}</select></label><label className="field"><span>Quantity</span><input aria-label="Custom item quantity" type="number" min="1" step="1" value={customQuantity} onChange={(event) => setCustomQuantity(event.target.value)} /></label><label className="field"><span>Weight (lb., optional)</span><input aria-label="Custom item weight" type="number" min="0" step="0.01" value={customWeight} onChange={(event) => setCustomWeight(event.target.value)} /></label><label className="field inventory-notes"><span>Notes</span><textarea aria-label="Custom item notes" value={customNotes} onChange={(event) => setCustomNotes(event.target.value)} placeholder="Campaign details, provenance, condition..." /></label><button className="button button--primary" type="submit">Add Custom Item</button></form></section>
    <section className="panel inventory-section"><div className="section-heading"><span className="eyebrow">Owned Inventory</span><h2>Items</h2><p>Quantity 0 means removal at the service layer; the UI uses an explicit Remove confirmation for destructive changes.</p></div><div className="inventory-toolbar"><label className="field"><span>Search owned items</span><input aria-label="Search owned items" value={ownedSearch} onChange={(event) => setOwnedSearch(event.target.value)} /></label><label className="field"><span>State</span><select aria-label="Owned item filter" value={ownedFilter} onChange={(event) => setOwnedFilter(event.target.value as OwnedFilter)}><option value="all">All</option><option value="equipped">Equipped</option><option value="unequipped">Unequipped</option></select></label></div>{filteredOwned.length === 0 ? <div className="inventory-empty">No inventory entries match this view.</div> : <div className="inventory-grid">{filteredOwned.map((entry) => entry.kind === 'registry' ? <RegistryItemCard key={entry.id} characterId={characterId} entry={entry} onResult={applyResult} /> : <CustomItemCard key={entry.id} characterId={characterId} entry={entry} onResult={applyResult} />)}</div>}</section>
    </fieldset>
  </div>;
}

export function InventoryPage() {
  const { characterId = '' } = useParams();
  return <InventoryView characterId={characterId} />;
}
