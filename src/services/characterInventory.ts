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
import type { ContentId } from '../models/contentId';
import { inventoryCategoryForContent } from '../rules/inventory';
import { ruleError, ruleOk, type RuleResult } from '../rules/result';
import { getWeaponAttackAbilityOptions } from '../rules/weapons';
import { MAX_INVENTORY_NAME_LENGTH, MAX_INVENTORY_NOTES_LENGTH } from '../utils/characterValidation';
import type { ContentRegistry } from './contentRegistry';
import { contentRegistry } from './contentRegistry';
import { getCharacterById, updateCharacterInventoryState } from './characterStorage';

export interface CustomInventoryItemInput {
  readonly name: string;
  readonly category: InventoryCategory;
  readonly quantity: number;
  readonly notes?: string;
  readonly weightPounds?: number;
}

function browserStorage(): Storage {
  return window.localStorage;
}

function createInventoryEntryId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `inventory-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function validQuantity(quantity: number, allowZero = false): boolean {
  return Number.isInteger(quantity) && (allowZero ? quantity >= 0 : quantity > 0);
}

function cloneEntries(entries: readonly InventoryEntry[]): InventoryEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

function persist(
  character: Character,
  inventory: InventoryEntry[],
  currency: CharacterCurrency,
  storage: Storage,
): RuleResult<Character> {
  try {
    const updated = updateCharacterInventoryState(character.id, inventory, currency, storage);
    return updated ? ruleOk(updated) : ruleError('missing-character', `Character not found: ${character.id}`);
  } catch {
    return ruleError('invalid-inventory-item', 'Inventory change could not be persisted safely.');
  }
}

function loadCharacter(id: string, storage: Storage): RuleResult<Character> {
  const character = getCharacterById(id, storage);
  return character ? ruleOk(character) : ruleError('missing-character', `Character not found: ${id}`);
}

function validateNotes(notes: string): RuleResult<string> {
  return typeof notes === 'string' && notes.length <= MAX_INVENTORY_NOTES_LENGTH
    ? ruleOk(notes)
    : ruleError('invalid-inventory-item', `Item notes must be ${MAX_INVENTORY_NOTES_LENGTH} characters or fewer.`);
}

export function addRegistryInventoryItem(
  characterId: string,
  contentId: ContentId,
  quantity = 1,
  storage: Storage = browserStorage(),
  registry: ContentRegistry = contentRegistry,
): RuleResult<Character> {
  if (!validQuantity(quantity)) return ruleError('invalid-inventory-item', 'Item quantity must be a positive whole number.');
  const loaded = loadCharacter(characterId, storage);
  if (!loaded.ok) return loaded;
  const content = registry.getById(contentId);
  if (!content) return ruleError('invalid-inventory-item', `Content could not be resolved: ${contentId}`, contentId);
  const category = inventoryCategoryForContent(content);
  if (!category) return ruleError('invalid-inventory-item', `${content.name} is not an inventory equipment item.`, contentId);

  const inventory = cloneEntries(loaded.value.inventory);
  const existing = inventory.find((entry): entry is RegistryInventoryEntry => entry.kind === 'registry' && entry.contentId === contentId);
  if (existing) existing.quantity += quantity;
  else inventory.push({ id: createInventoryEntryId(), kind: 'registry', contentId, category, quantity, equipped: false, notes: '' });
  return persist(loaded.value, inventory, loaded.value.currency, storage);
}

export function addCustomInventoryItem(
  characterId: string,
  input: CustomInventoryItemInput,
  storage: Storage = browserStorage(),
): RuleResult<Character> {
  const name = input.name.trim();
  if (!name || name.length > MAX_INVENTORY_NAME_LENGTH || !INVENTORY_CATEGORIES.includes(input.category) || !validQuantity(input.quantity)) {
    return ruleError('invalid-inventory-item', 'Custom items need a valid name, category, and positive whole-number quantity.');
  }
  if (input.weightPounds !== undefined && (!Number.isFinite(input.weightPounds) || input.weightPounds < 0)) return ruleError('invalid-inventory-item', 'Custom item weight must be non-negative.');
  const notes = validateNotes(input.notes ?? '');
  if (!notes.ok) return notes;
  const loaded = loadCharacter(characterId, storage);
  if (!loaded.ok) return loaded;
  const entry: CustomInventoryEntry = {
    id: createInventoryEntryId(),
    kind: 'custom',
    name,
    category: input.category,
    quantity: input.quantity,
    notes: notes.value,
    ...(input.weightPounds !== undefined ? { weightPounds: input.weightPounds } : {}),
  };
  return persist(loaded.value, [...cloneEntries(loaded.value.inventory), entry], loaded.value.currency, storage);
}

export function setInventoryQuantity(
  characterId: string,
  entryId: string,
  quantity: number,
  storage: Storage = browserStorage(),
): RuleResult<Character> {
  if (!validQuantity(quantity, true)) return ruleError('invalid-inventory-item', 'Quantity must be a non-negative whole number.');
  const loaded = loadCharacter(characterId, storage);
  if (!loaded.ok) return loaded;
  const existing = loaded.value.inventory.find((entry) => entry.id === entryId);
  if (!existing) return ruleError('unknown-inventory-entry', `Inventory entry not found: ${entryId}`);
  const inventory = quantity === 0
    ? loaded.value.inventory.filter((entry) => entry.id !== entryId).map((entry) => ({ ...entry }))
    : loaded.value.inventory.map((entry) => entry.id === entryId ? { ...entry, quantity } : { ...entry });
  return persist(loaded.value, inventory, loaded.value.currency, storage);
}

export function adjustInventoryQuantity(characterId: string, entryId: string, delta: number, storage: Storage = browserStorage()): RuleResult<Character> {
  if (!Number.isInteger(delta) || delta === 0) return ruleError('invalid-inventory-item', 'Quantity adjustment must be a non-zero whole number.');
  const loaded = loadCharacter(characterId, storage);
  if (!loaded.ok) return loaded;
  const entry = loaded.value.inventory.find((candidate) => candidate.id === entryId);
  if (!entry) return ruleError('unknown-inventory-entry', `Inventory entry not found: ${entryId}`);
  return setInventoryQuantity(characterId, entryId, entry.quantity + delta, storage);
}

export function updateInventoryNotes(characterId: string, entryId: string, notesValue: string, storage: Storage = browserStorage()): RuleResult<Character> {
  const notes = validateNotes(notesValue);
  if (!notes.ok) return notes;
  const loaded = loadCharacter(characterId, storage);
  if (!loaded.ok) return loaded;
  if (!loaded.value.inventory.some((entry) => entry.id === entryId)) return ruleError('unknown-inventory-entry', `Inventory entry not found: ${entryId}`);
  const inventory = loaded.value.inventory.map((entry) => entry.id === entryId ? { ...entry, notes: notes.value } : { ...entry });
  return persist(loaded.value, inventory, loaded.value.currency, storage);
}

export function updateRegistryDisplayName(characterId: string, entryId: string, displayNameValue: string, storage: Storage = browserStorage()): RuleResult<Character> {
  const displayName = displayNameValue.trim();
  if (displayName.length > MAX_INVENTORY_NAME_LENGTH) return ruleError('invalid-inventory-item', `Display name must be ${MAX_INVENTORY_NAME_LENGTH} characters or fewer.`);
  const loaded = loadCharacter(characterId, storage);
  if (!loaded.ok) return loaded;
  const target = loaded.value.inventory.find((entry) => entry.id === entryId);
  if (!target) return ruleError('unknown-inventory-entry', `Inventory entry not found: ${entryId}`);
  if (target.kind !== 'registry') return ruleError('inventory-action-unavailable', 'Only registry-backed items can use a display override.');
  const inventory = loaded.value.inventory.map((entry) => entry.id === entryId && entry.kind === 'registry'
    ? { ...entry, ...(displayName ? { displayName } : { displayName: undefined }) }
    : { ...entry });
  return persist(loaded.value, inventory, loaded.value.currency, storage);
}

export function updateCustomInventoryItem(
  characterId: string,
  entryId: string,
  input: Omit<CustomInventoryItemInput, 'quantity' | 'notes'> & { readonly quantity?: number; readonly notes?: string },
  storage: Storage = browserStorage(),
): RuleResult<Character> {
  const loaded = loadCharacter(characterId, storage);
  if (!loaded.ok) return loaded;
  const target = loaded.value.inventory.find((entry) => entry.id === entryId);
  if (!target) return ruleError('unknown-inventory-entry', `Inventory entry not found: ${entryId}`);
  if (target.kind !== 'custom') return ruleError('inventory-action-unavailable', 'Registry-backed items must keep their registry identity.');
  const name = input.name.trim();
  const quantity = input.quantity ?? target.quantity;
  const notes = validateNotes(input.notes ?? target.notes);
  if (!name || name.length > MAX_INVENTORY_NAME_LENGTH || !INVENTORY_CATEGORIES.includes(input.category) || !validQuantity(quantity) || !notes.ok) return ruleError('invalid-inventory-item', 'Custom item update contains invalid values.');
  if (input.weightPounds !== undefined && (!Number.isFinite(input.weightPounds) || input.weightPounds < 0)) return ruleError('invalid-inventory-item', 'Custom item weight must be non-negative.');
  const inventory = loaded.value.inventory.map((entry) => entry.id === entryId && entry.kind === 'custom'
    ? { ...entry, name, category: input.category, quantity, notes: notes.value, ...(input.weightPounds !== undefined ? { weightPounds: input.weightPounds } : {}) }
    : { ...entry });
  return persist(loaded.value, inventory, loaded.value.currency, storage);
}

export function removeInventoryItem(characterId: string, entryId: string, storage: Storage = browserStorage()): RuleResult<Character> {
  return setInventoryQuantity(characterId, entryId, 0, storage);
}

export function setInventoryItemEquipped(
  characterId: string,
  entryId: string,
  equipped: boolean,
  storage: Storage = browserStorage(),
  registry: ContentRegistry = contentRegistry,
): RuleResult<Character> {
  const loaded = loadCharacter(characterId, storage);
  if (!loaded.ok) return loaded;
  const target = loaded.value.inventory.find((entry) => entry.id === entryId);
  if (!target) return ruleError('unknown-inventory-entry', `Inventory entry not found: ${entryId}`);
  if (target.kind !== 'registry') return ruleError('inventory-action-unavailable', 'Simple custom items do not provide mechanical equipment state.');
  const content = registry.getById(target.contentId);
  if (content?.kind === 'equipment') return ruleError('inventory-action-unavailable', 'Miscellaneous equipment cannot be equipped mechanically.', target.contentId);
  if (!content || (content.kind !== 'weapon' && content.kind !== 'armor')) return ruleError('inventory-action-unavailable', 'Unresolved items cannot be equipped mechanically.', target.contentId);

  const inventory = cloneEntries(loaded.value.inventory);
  for (const entry of inventory) {
    if (entry.kind !== 'registry') continue;
    if (entry.id === entryId) {
      entry.equipped = equipped;
      if (equipped && content.kind === 'weapon') {
        const options = getWeaponAttackAbilityOptions(content);
        if (options.length > 1 && !entry.attackAbilityChoice) entry.attackAbilityChoice = options.includes('dexterity') ? 'dexterity' : options[0];
      }
      continue;
    }
    if (!equipped) continue;
    if (target.category === 'armor' && entry.category === 'armor') entry.equipped = false;
    if (target.category === 'shield' && entry.category === 'shield') entry.equipped = false;
  }
  return persist(loaded.value, inventory, loaded.value.currency, storage);
}

export function setInventoryWeaponAbilityChoice(
  characterId: string,
  entryId: string,
  ability: AbilityKey,
  storage: Storage = browserStorage(),
  registry: ContentRegistry = contentRegistry,
): RuleResult<Character> {
  const loaded = loadCharacter(characterId, storage);
  if (!loaded.ok) return loaded;
  const target = loaded.value.inventory.find((entry) => entry.id === entryId);
  if (!target) return ruleError('unknown-inventory-entry', `Inventory entry not found: ${entryId}`);
  if (target.kind !== 'registry') return ruleError('inventory-action-unavailable', 'Custom items do not have structured attack abilities.');
  const weapon = registry.findWeapon(target.contentId);
  if (!weapon || !getWeaponAttackAbilityOptions(weapon).includes(ability)) return ruleError('invalid-inventory-item', 'That attack ability is not valid for this weapon.', target.contentId);
  const inventory = loaded.value.inventory.map((entry) => entry.id === entryId && entry.kind === 'registry' ? { ...entry, attackAbilityChoice: ability } : { ...entry });
  return persist(loaded.value, inventory, loaded.value.currency, storage);
}

export function setCharacterCurrency(characterId: string, currency: CharacterCurrency, storage: Storage = browserStorage()): RuleResult<Character> {
  if (CURRENCY_UNITS.some((unit) => !Number.isInteger(currency[unit]) || currency[unit] < 0)) return ruleError('invalid-inventory-item', 'Currency must use non-negative whole numbers.');
  const loaded = loadCharacter(characterId, storage);
  if (!loaded.ok) return loaded;
  return persist(loaded.value, cloneEntries(loaded.value.inventory), { ...currency }, storage);
}

export function setCharacterCurrencyAmount(characterId: string, unit: keyof CharacterCurrency, amount: number, storage: Storage = browserStorage()): RuleResult<Character> {
  if (!CURRENCY_UNITS.includes(unit) || !Number.isInteger(amount) || amount < 0) return ruleError('invalid-inventory-item', 'Currency must be a non-negative whole number.');
  const loaded = loadCharacter(characterId, storage);
  if (!loaded.ok) return loaded;
  return persist(loaded.value, cloneEntries(loaded.value.inventory), { ...loaded.value.currency, [unit]: amount }, storage);
}
