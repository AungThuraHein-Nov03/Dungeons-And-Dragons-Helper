import type {
  AbilityKey,
  AbilityScores,
  Character,
  CharacterCurrency,
  CharacterInput,
  CharacterPlayState,
  HpProgressionEntry,
  InventoryEntry,
  RegistryInventoryEntry,
} from '../models/character';
import type { ContentId } from '../models/contentId';
import { srdId } from '../content/srd/source';
import { FIGHTER_ACTION_SURGE_RESOURCE_ID, FIGHTER_SECOND_WIND_RESOURCE_ID } from '../content/srd/fighter';
import { createFixedHpProgression } from '../rules/health';

export const FIGHTER_ID = srdId('class', 'fighter');
export const CHAMPION_ID = srdId('subclass', 'fighter:champion');
export const DRAGONBORN_ID = srdId('species', 'dragonborn');
export const ACOLYTE_ID = srdId('background', 'acolyte');
export const SCIMITAR_ID = srdId('weapon', 'scimitar');
export const LIGHT_CROSSBOW_ID = srdId('weapon', 'light-crossbow');
export const SHIELD_ID = srdId('armor', 'shield');

interface LegacyEquipmentPatch {
  equippedArmorId?: ContentId;
  equippedShieldId?: ContentId;
  equippedWeaponIds?: ContentId[];
}

export type FighterInputPatch = Omit<Partial<CharacterInput>, 'abilityScores' | 'inventory' | 'currency' | 'hpProgression'> & {
  abilityScores?: Partial<AbilityScores>;
  inventory?: InventoryEntry[];
  currency?: Partial<CharacterCurrency>;
  hpProgression?: HpProgressionEntry[];
  equipment?: LegacyEquipmentPatch;
  weaponAttackAbilityChoices?: Partial<Record<ContentId, AbilityKey>>;
};

function legacyEquipmentInventory(equipment?: LegacyEquipmentPatch, choices: Partial<Record<ContentId, AbilityKey>> = {}): InventoryEntry[] {
  if (!equipment) return [];
  const entries: RegistryInventoryEntry[] = [];
  if (equipment.equippedArmorId) entries.push({ id: `test:${equipment.equippedArmorId}`, kind: 'registry', contentId: equipment.equippedArmorId, category: 'armor', quantity: 1, equipped: true, notes: '' });
  if (equipment.equippedShieldId) entries.push({ id: `test:${equipment.equippedShieldId}`, kind: 'registry', contentId: equipment.equippedShieldId, category: 'shield', quantity: 1, equipped: true, notes: '' });
  for (const weaponId of equipment.equippedWeaponIds ?? []) entries.push({ id: `test:${weaponId}`, kind: 'registry', contentId: weaponId, category: 'weapon', quantity: 1, equipped: true, notes: '', ...(choices[weaponId] ? { attackAbilityChoice: choices[weaponId] } : {}) });
  return entries;
}

export function fighterInput(patch: FighterInputPatch = {}): CharacterInput {
  const level = patch.level ?? 4;
  const base: CharacterInput = {
    name: 'Ren', classId: FIGHTER_ID, ...(level >= 3 ? { subclassId: CHAMPION_ID } : {}), speciesId: DRAGONBORN_ID, backgroundId: ACOLYTE_ID, level,
    speciesChoices: { 'draconic-ancestry': 'black' }, speciesSkillProficiencies: [],
    backgroundAbilityChoice: { mode: 'two-one', plusTwo: 'charisma', plusOne: 'intelligence' }, backgroundEquipmentChoice: 'A',
    manualFeats: [], spellcastingSelections: [],
    abilityScores: { strength: 14, dexterity: 18, constitution: 14, intelligence: 10, wisdom: 12, charisma: 12 },
    skillProficiencies: ['athletics', 'perception'], inventory: [], currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, hpProgression: createFixedHpProgression(level),
  };
  const { equipment, weaponAttackAbilityChoices, ...currentPatch } = patch;
  return {
    ...base, ...currentPatch, level,
    abilityScores: { ...base.abilityScores, ...patch.abilityScores },
    skillProficiencies: [...(patch.skillProficiencies ?? base.skillProficiencies)],
    inventory: patch.inventory ? patch.inventory.map((entry) => ({ ...entry })) : legacyEquipmentInventory(equipment, weaponAttackAbilityChoices),
    currency: { ...base.currency, ...patch.currency },
    hpProgression: patch.hpProgression ? patch.hpProgression.map((entry) => ({ ...entry })) : createFixedHpProgression(level),
  };
}

export function fullFighter4PlayState(overrides: Partial<CharacterPlayState> = {}): CharacterPlayState {
  return { currentHp: overrides.currentHp ?? 36, temporaryHp: overrides.temporaryHp ?? 0, hitDiceRemaining: overrides.hitDiceRemaining ?? 4, resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 3, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 1, ...overrides.resourceUses } };
}

export function fighterCharacter(patch: FighterInputPatch & { playState?: CharacterPlayState } = {}): Character {
  const { playState, ...inputPatch } = patch;
  return { ...fighterInput(inputPatch), id: 'fighter-4-test', playState: playState ?? fullFighter4PlayState(), createdAt: '2026-09-16T06:00:00.000Z', updatedAt: '2026-09-16T06:00:00.000Z' };
}
