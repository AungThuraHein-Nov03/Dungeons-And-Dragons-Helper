import { describe, expect, it } from 'vitest';
import { SRD_CONTENT, srdId } from '../content/srd';
import type { WeaponContent } from '../models/content';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { calculateInventoryWeight } from '../rules/inventory';
import { rollWeaponAttack, rollWeaponDamage } from './characterRolls';
import { ContentRegistry, contentRegistry } from './contentRegistry';
import { createCharacter, getCharacterById, updateCharacter } from './characterStorage';
import {
  addCustomInventoryItem,
  addRegistryInventoryItem,
  adjustInventoryQuantity,
  removeInventoryItem,
  setCharacterCurrency,
  setInventoryItemEquipped,
  setInventoryQuantity,
  setInventoryWeaponAbilityChoice,
  updateCustomInventoryItem,
  updateInventoryNotes,
  updateRegistryDisplayName,
} from './characterInventory';
import { fighterInput, LIGHT_CROSSBOW_ID, SCIMITAR_ID, SHIELD_ID } from '../test/fixtures';

const CHAIN_MAIL_ID = srdId('armor', 'chain-mail');
const STUDDED_LEATHER_ID = srdId('armor', 'studded-leather-armor');

function createBareFighter() {
  return createCharacter(fighterInput({ inventory: [] }));
}

function registryEntry(characterId: string, contentId: string) {
  const character = getCharacterById(characterId)!;
  const entry = character.inventory.find((candidate) => candidate.kind === 'registry' && candidate.contentId === contentId);
  if (!entry || entry.kind !== 'registry') throw new Error(`Missing registry entry: ${contentId}`);
  return entry;
}

describe('character inventory service', () => {
  it('adds and stacks registry-backed equipment without copying rules', () => {
    const character = createBareFighter();
    expect(addRegistryInventoryItem(character.id, SCIMITAR_ID, 1).ok).toBe(true);
    expect(addRegistryInventoryItem(character.id, SCIMITAR_ID, 2).ok).toBe(true);
    const saved = getCharacterById(character.id)!;
    expect(saved.inventory).toHaveLength(1);
    expect(saved.inventory[0]).toMatchObject({ kind: 'registry', contentId: SCIMITAR_ID, category: 'weapon', quantity: 3, equipped: false, notes: '' });
    expect(saved.inventory[0]).not.toHaveProperty('damage');
    expect(saved.inventory[0]).not.toHaveProperty('properties');
  });

  it('validates quantity, supports increment/decrement, and treats quantity zero as removal', () => {
    const character = createBareFighter();
    addRegistryInventoryItem(character.id, LIGHT_CROSSBOW_ID, 2);
    const entry = registryEntry(character.id, LIGHT_CROSSBOW_ID);
    expect(adjustInventoryQuantity(character.id, entry.id, 1)).toMatchObject({ ok: true, value: { inventory: [{ quantity: 3 }] } });
    expect(adjustInventoryQuantity(character.id, entry.id, -1)).toMatchObject({ ok: true, value: { inventory: [{ quantity: 2 }] } });
    expect(setInventoryQuantity(character.id, entry.id, -1)).toMatchObject({ ok: false, error: { code: 'invalid-inventory-item' } });
    expect(setInventoryQuantity(character.id, entry.id, Number.NaN)).toMatchObject({ ok: false });
    expect(setInventoryQuantity(character.id, entry.id, 0)).toMatchObject({ ok: true, value: { inventory: [] } });
  });

  it('creates, edits, persists, and deletes simple custom campaign items without rules behavior', () => {
    const character = createBareFighter();
    const added = addCustomInventoryItem(character.id, { name: 'House-Sealed Letter', category: 'campaign-item', quantity: 1, notes: 'Still sealed.', weightPounds: 0.1 });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const entry = added.value.inventory[0];
    expect(entry).toMatchObject({ kind: 'custom', name: 'House-Sealed Letter', category: 'campaign-item', notes: 'Still sealed.', quantity: 1 });
    const before = deriveCharacterState(added.value, contentRegistry);
    expect(updateCustomInventoryItem(character.id, entry.id, { name: 'House Vaelorén Letter', category: 'campaign-item', quantity: 2, notes: 'Bears the family seal.', weightPounds: 0.1 }).ok).toBe(true);
    const afterCharacter = getCharacterById(character.id)!;
    expect(afterCharacter.inventory[0]).toMatchObject({ name: 'House Vaelorén Letter', quantity: 2, notes: 'Bears the family seal.' });
    expect(deriveCharacterState(afterCharacter, contentRegistry)).toEqual(before);
    expect(removeInventoryItem(character.id, entry.id)).toMatchObject({ ok: true, value: { inventory: [] } });
  });

  it('persists notes and display names without changing registry-backed mechanics', () => {
    const character = createBareFighter();
    addRegistryInventoryItem(character.id, SCIMITAR_ID);
    const entry = registryEntry(character.id, SCIMITAR_ID);
    setInventoryItemEquipped(character.id, entry.id, true);
    setInventoryWeaponAbilityChoice(character.id, entry.id, 'dexterity');
    const before = deriveCharacterState(getCharacterById(character.id)!, contentRegistry);
    expect(updateInventoryNotes(character.id, entry.id, 'Critical hits against me are treated as normal hits.')).toMatchObject({ ok: true });
    expect(updateRegistryDisplayName(character.id, entry.id, 'Vaelorén Moonblade')).toMatchObject({ ok: true });
    const saved = getCharacterById(character.id)!;
    const after = deriveCharacterState(saved, contentRegistry);
    expect(saved.inventory[0]).toMatchObject({ notes: 'Critical hits against me are treated as normal hits.', displayName: 'Vaelorén Moonblade' });
    expect(after.ok).toBe(true);
    if (before.ok && after.ok) {
      expect(after.value.attacks[0].attackModifier).toBe(before.value.attacks[0].attackModifier);
      expect(after.value.attacks[0].damage).toEqual(before.value.attacks[0].damage);
      expect(after.value.attacks[0].name).toBe('Vaelorén Moonblade');
      expect(after.value.attacks[0].baseName).toBe('Scimitar');
    }
  });

  it('equips exactly one body armor and recalculates AC while keeping shield separate', () => {
    const character = createBareFighter();
    addRegistryInventoryItem(character.id, CHAIN_MAIL_ID);
    addRegistryInventoryItem(character.id, STUDDED_LEATHER_ID);
    addRegistryInventoryItem(character.id, SHIELD_ID);
    const chain = registryEntry(character.id, CHAIN_MAIL_ID);
    const studded = registryEntry(character.id, STUDDED_LEATHER_ID);
    const shield = registryEntry(character.id, SHIELD_ID);

    setInventoryItemEquipped(character.id, chain.id, true);
    let derived = deriveCharacterState(getCharacterById(character.id)!, contentRegistry);
    expect(derived).toMatchObject({ ok: true, value: { defense: { armorClass: 16, armor: { id: CHAIN_MAIL_ID }, shield: null } } });
    setInventoryItemEquipped(character.id, shield.id, true);
    derived = deriveCharacterState(getCharacterById(character.id)!, contentRegistry);
    expect(derived).toMatchObject({ ok: true, value: { defense: { armorClass: 18, shield: { bonusApplied: 2 } } } });
    setInventoryItemEquipped(character.id, studded.id, true);
    const saved = getCharacterById(character.id)!;
    expect(registryEntry(character.id, CHAIN_MAIL_ID).equipped).toBe(false);
    expect(registryEntry(character.id, STUDDED_LEATHER_ID).equipped).toBe(true);
    expect(deriveCharacterState(saved, contentRegistry)).toMatchObject({ ok: true, value: { defense: { armorClass: 18, armor: { id: STUDDED_LEATHER_ID }, shield: { bonusApplied: 2 } } } });
    setInventoryItemEquipped(character.id, shield.id, false);
    expect(deriveCharacterState(getCharacterById(character.id)!, contentRegistry)).toMatchObject({ ok: true, value: { defense: { armorClass: 16, shield: null } } });
    setInventoryItemEquipped(character.id, studded.id, false);
    expect(deriveCharacterState(getCharacterById(character.id)!, contentRegistry)).toMatchObject({ ok: true, value: { defense: { armorClass: 14, armor: null } } });
  });

  it('continues to apply armor DEX rules after build-stat edits', () => {
    const character = createCharacter(fighterInput({ abilityScores: { dexterity: 18 }, inventory: [] }));
    addRegistryInventoryItem(character.id, STUDDED_LEATHER_ID);
    setInventoryItemEquipped(character.id, registryEntry(character.id, STUDDED_LEATHER_ID).id, true);
    expect(deriveCharacterState(getCharacterById(character.id)!, contentRegistry)).toMatchObject({ ok: true, value: { defense: { armorClass: 16 } } });
    const current = getCharacterById(character.id)!;
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, playState: _playState, ...input } = current;
    void _id; void _createdAt; void _updatedAt; void _playState;
    updateCharacter(character.id, { ...input, abilityScores: { ...input.abilityScores, dexterity: 16 } });
    expect(deriveCharacterState(getCharacterById(character.id)!, contentRegistry)).toMatchObject({ ok: true, value: { defense: { armorClass: 15 } } });
  });

  it('makes only equipped weapons active while preserving Finesse choice and Dice Engine math', () => {
    const character = createBareFighter();
    addRegistryInventoryItem(character.id, SCIMITAR_ID);
    addRegistryInventoryItem(character.id, LIGHT_CROSSBOW_ID);
    const scimitar = registryEntry(character.id, SCIMITAR_ID);
    const crossbow = registryEntry(character.id, LIGHT_CROSSBOW_ID);
    setInventoryItemEquipped(character.id, scimitar.id, true);
    setInventoryWeaponAbilityChoice(character.id, scimitar.id, 'dexterity');
    let derived = deriveCharacterState(getCharacterById(character.id)!, contentRegistry);
    expect(derived).toMatchObject({ ok: true, value: { attacks: [{ weaponId: SCIMITAR_ID, attackAbility: 'dexterity', attackModifier: 6 }] } });
    expect(rollWeaponAttack(character.id, SCIMITAR_ID, 'normal', { rng: () => 13 / 20 })).toMatchObject({ ok: true, value: { roll: { total: 20, modifier: 6 } } });
    expect(rollWeaponDamage(character.id, SCIMITAR_ID, 'standard', false, { rng: () => 4 / 6 })).toMatchObject({ ok: true, value: { roll: { total: 9, modifier: 4 } } });
    setInventoryItemEquipped(character.id, scimitar.id, false);
    expect(deriveCharacterState(getCharacterById(character.id)!, contentRegistry)).toMatchObject({ ok: true, value: { attacks: [] } });
    setInventoryItemEquipped(character.id, crossbow.id, true);
    derived = deriveCharacterState(getCharacterById(character.id)!, contentRegistry);
    expect(derived).toMatchObject({ ok: true, value: { attacks: [{ weaponId: LIGHT_CROSSBOW_ID, attackModifier: 6 }] } });
  });

  it('removing equipped items safely reconciles derived attacks and defense', () => {
    const character = createBareFighter();
    addRegistryInventoryItem(character.id, CHAIN_MAIL_ID);
    addRegistryInventoryItem(character.id, SCIMITAR_ID);
    const chain = registryEntry(character.id, CHAIN_MAIL_ID);
    const scimitar = registryEntry(character.id, SCIMITAR_ID);
    setInventoryItemEquipped(character.id, chain.id, true);
    setInventoryItemEquipped(character.id, scimitar.id, true);
    removeInventoryItem(character.id, chain.id);
    removeInventoryItem(character.id, scimitar.id);
    expect(deriveCharacterState(getCharacterById(character.id)!, contentRegistry)).toMatchObject({ ok: true, value: { defense: { armorClass: 14, armor: null }, attacks: [] } });
  });

  it('tracks CP/SP/EP/GP/PP as non-negative integers only', () => {
    const character = createBareFighter();
    expect(setCharacterCurrency(character.id, { cp: 8, sp: 18, ep: 1, gp: 42, pp: 2 })).toMatchObject({ ok: true, value: { currency: { cp: 8, sp: 18, ep: 1, gp: 42, pp: 2 } } });
    expect(setCharacterCurrency(character.id, { cp: -1, sp: 0, ep: 0, gp: 0, pp: 0 })).toMatchObject({ ok: false });
    expect(setCharacterCurrency(character.id, { cp: 0, sp: 0.5, ep: 0, gp: 0, pp: 0 })).toMatchObject({ ok: false });
  });

  it('supports ammunition and consumable foundations as non-mechanical custom records', () => {
    const character = createBareFighter();
    addCustomInventoryItem(character.id, { name: 'Crossbow Bolts', category: 'ammunition', quantity: 20 });
    addCustomInventoryItem(character.id, { name: 'Potion', category: 'consumable', quantity: 2, notes: 'Do not automate healing.' });
    const saved = getCharacterById(character.id)!;
    expect(saved.inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'custom', name: 'Crossbow Bolts', category: 'ammunition', quantity: 20 }),
      expect.objectContaining({ kind: 'custom', name: 'Potion', category: 'consumable', quantity: 2 }),
    ]));
    expect(deriveCharacterState(saved, contentRegistry)).toMatchObject({ ok: true, value: { attacks: [] } });
  });

  it('keeps unresolved content references loadable, non-mechanical, and removable', () => {
    const character = createCharacter(fighterInput({ inventory: [{ id: 'missing-entry', kind: 'registry', contentId: 'homebrew:gone:weapon:blade', category: 'weapon', quantity: 1, equipped: true, notes: 'Keep this history.' }] }));
    const loaded = getCharacterById(character.id)!;
    expect(loaded.inventory[0]).toMatchObject({ contentId: 'homebrew:gone:weapon:blade', notes: 'Keep this history.' });
    expect(deriveCharacterState(loaded, contentRegistry)).toMatchObject({ ok: true, value: { attacks: [] } });
    expect(removeInventoryItem(character.id, 'missing-entry')).toMatchObject({ ok: true, value: { inventory: [] } });
  });

  it('uses the same inventory/rules/dice path for structurally compatible Homebrew weapons', () => {
    const base = contentRegistry.findWeapon(SCIMITAR_ID)!;
    const homebrew: WeaponContent = { ...base, id: 'homebrew:test:weapon:moonblade', name: 'Moonblade', source: { type: 'homebrew', namespace: 'test' } };
    const registry = new ContentRegistry(SRD_CONTENT, [homebrew]);
    const character = createBareFighter();
    expect(addRegistryInventoryItem(character.id, homebrew.id, 1, window.localStorage, registry).ok).toBe(true);
    const entry = registryEntry(character.id, homebrew.id);
    expect(setInventoryItemEquipped(character.id, entry.id, true, window.localStorage, registry).ok).toBe(true);
    expect(setInventoryWeaponAbilityChoice(character.id, entry.id, 'dexterity', window.localStorage, registry).ok).toBe(true);
    expect(deriveCharacterState(getCharacterById(character.id)!, registry)).toMatchObject({ ok: true, value: { attacks: [{ weaponId: homebrew.id, attackModifier: 6 }] } });
    expect(rollWeaponAttack(character.id, homebrew.id, 'normal', { registry, rng: () => 13 / 20 })).toMatchObject({ ok: true, value: { roll: { total: 20 } } });
  });

  it('derives carried weight without adding encumbrance rules', () => {
    const character = createBareFighter();
    addRegistryInventoryItem(character.id, SCIMITAR_ID, 2);
    addCustomInventoryItem(character.id, { name: 'Rope', category: 'adventuring-gear', quantity: 1, weightPounds: 10 });
    addCustomInventoryItem(character.id, { name: 'Mysterious Token', category: 'campaign-item', quantity: 1 });
    const summary = calculateInventoryWeight(getCharacterById(character.id)!.inventory, contentRegistry);
    expect(summary.knownWeightPounds).toBe(16);
    expect(summary.unknownQuantity).toBe(1);
  });
});

