import type { AbilityKey, Character, CharacterCurrency, InventoryCategory } from '../models/character';
import type { ContentId } from '../models/contentId';
import { ruleError, ruleOk, type RuleResult } from '../rules/result';
import {
  addCustomInventoryItem,
  addRegistryInventoryItem,
  adjustInventoryQuantity,
  removeInventoryItem,
  setCharacterCurrency,
  setInventoryItemEquipped,
  setInventoryWeaponAbilityChoice,
  updateCustomInventoryItem,
  updateInventoryNotes,
  updateRegistryDisplayName,
  type CustomInventoryItemInput,
} from './characterInventory';
import { runApplicationCharacterTransaction } from './applicationCharacterMutations';
import { getPersistenceBackend } from './persistenceBackend';

async function runInventoryMutation(
  mutation: (storage: Storage) => RuleResult<Character>,
): Promise<RuleResult<Character>> {
  if (getPersistenceBackend() !== 'project') return mutation(window.localStorage);
  const result = await runApplicationCharacterTransaction(mutation, (character) => character);
  if (!result.ok) return ruleError('invalid-inventory-item', result.error.message);
  return result.character
    ? ruleOk(result.character)
    : ruleError('invalid-inventory-item', 'Project Inventory mutation returned no Character.');
}

export function addApplicationRegistryInventoryItem(
  characterId: string,
  contentId: ContentId,
  quantity = 1,
): Promise<RuleResult<Character>> {
  return runInventoryMutation((storage) => addRegistryInventoryItem(characterId, contentId, quantity, storage));
}

export function addApplicationCustomInventoryItem(
  characterId: string,
  input: CustomInventoryItemInput,
): Promise<RuleResult<Character>> {
  return runInventoryMutation((storage) => addCustomInventoryItem(characterId, input, storage));
}

export function adjustApplicationInventoryQuantity(
  characterId: string,
  entryId: string,
  delta: number,
): Promise<RuleResult<Character>> {
  return runInventoryMutation((storage) => adjustInventoryQuantity(characterId, entryId, delta, storage));
}

export function updateApplicationInventoryNotes(
  characterId: string,
  entryId: string,
  notes: string,
): Promise<RuleResult<Character>> {
  return runInventoryMutation((storage) => updateInventoryNotes(characterId, entryId, notes, storage));
}

export function updateApplicationRegistryDisplayName(
  characterId: string,
  entryId: string,
  displayName: string,
): Promise<RuleResult<Character>> {
  return runInventoryMutation((storage) => updateRegistryDisplayName(characterId, entryId, displayName, storage));
}

export function updateApplicationCustomInventoryItem(
  characterId: string,
  entryId: string,
  input: {
    readonly name: string;
    readonly category: InventoryCategory;
    readonly quantity?: number;
    readonly notes?: string;
    readonly weightPounds?: number;
  },
): Promise<RuleResult<Character>> {
  return runInventoryMutation((storage) => updateCustomInventoryItem(characterId, entryId, input, storage));
}

export function removeApplicationInventoryItem(
  characterId: string,
  entryId: string,
): Promise<RuleResult<Character>> {
  return runInventoryMutation((storage) => removeInventoryItem(characterId, entryId, storage));
}

export function setApplicationInventoryItemEquipped(
  characterId: string,
  entryId: string,
  equipped: boolean,
): Promise<RuleResult<Character>> {
  return runInventoryMutation((storage) => setInventoryItemEquipped(characterId, entryId, equipped, storage));
}

export function setApplicationInventoryWeaponAbilityChoice(
  characterId: string,
  entryId: string,
  ability: AbilityKey,
): Promise<RuleResult<Character>> {
  return runInventoryMutation((storage) => setInventoryWeaponAbilityChoice(characterId, entryId, ability, storage));
}

export function setApplicationCharacterCurrency(
  characterId: string,
  currency: CharacterCurrency,
): Promise<RuleResult<Character>> {
  return runInventoryMutation((storage) => setCharacterCurrency(characterId, currency, storage));
}
