import type {
  AbilityKey,
  AbilityScores,
  Character,
  CharacterClassProgression,
  CharacterCurrency,
  CharacterInput,
  CharacterPlayState,
  ClassHpProgressionEntry,
  InventoryEntry,
  RegistryInventoryEntry,
  SkillId,
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

type FighterInputBasePatch = Omit<
  Partial<CharacterInput>,
  'abilityScores' | 'inventory' | 'currency' | 'classProgressions' | 'startingClassId'
>;

export type FighterInputPatch = FighterInputBasePatch & {
  classId?: ContentId;
  subclassId?: ContentId;
  level?: number;
  skillProficiencies?: SkillId[];
  hpProgression?: ClassHpProgressionEntry[];
  classProgressions?: CharacterClassProgression[];
  startingClassId?: ContentId;
  abilityScores?: Partial<AbilityScores>;
  inventory?: InventoryEntry[];
  currency?: Partial<CharacterCurrency>;
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

function cloneProgression(progression: CharacterClassProgression): CharacterClassProgression {
  return {
    ...progression,
    skillProficiencies: [...progression.skillProficiencies],
    hpProgression: progression.hpProgression.map((entry) => ({ ...entry })),
  };
}

export function fighterInput(patch: FighterInputPatch = {}): CharacterInput {
  const level = patch.level ?? patch.classProgressions?.[0]?.level ?? 4;
  const classId = patch.classId ?? patch.classProgressions?.[0]?.classId ?? FIGHTER_ID;
  const defaultSubclass = classId === FIGHTER_ID && level >= 3 ? CHAMPION_ID : undefined;
  const subclassId = Object.prototype.hasOwnProperty.call(patch, 'subclassId')
    ? patch.subclassId
    : patch.classProgressions?.[0]?.subclassId ?? defaultSubclass;
  const skillProficiencies = patch.skillProficiencies ?? patch.classProgressions?.[0]?.skillProficiencies ?? ['athletics', 'perception'];
  const hpProgression = patch.hpProgression ?? patch.classProgressions?.[0]?.hpProgression ?? createFixedHpProgression(level);
  const progression: CharacterClassProgression = {
    classId,
    level,
    ...(subclassId ? { subclassId } : {}),
    skillProficiencies: [...skillProficiencies],
    hpProgression: hpProgression.map((entry) => ({ ...entry })),
  };

  const base: CharacterInput = {
    name: 'Ren',
    startingClassId: patch.startingClassId ?? classId,
    classProgressions: patch.classProgressions ? patch.classProgressions.map(cloneProgression) : [progression],
    speciesId: DRAGONBORN_ID,
    backgroundId: ACOLYTE_ID,
    speciesChoices: { 'draconic-ancestry': 'black' },
    speciesSkillProficiencies: [],
    backgroundAbilityChoice: { mode: 'two-one', plusTwo: 'charisma', plusOne: 'intelligence' },
    backgroundEquipmentChoice: 'A',
    manualFeats: [],
    spellcastingSelections: [],
    abilityScores: { strength: 14, dexterity: 18, constitution: 14, intelligence: 10, wisdom: 12, charisma: 12 },
    inventory: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
  };

  const {
    equipment,
    weaponAttackAbilityChoices,
    classId: _classId,
    subclassId: _subclassId,
    level: _level,
    skillProficiencies: _skills,
    hpProgression: _hp,
    classProgressions: _progressions,
    startingClassId: _startingClassId,
    ...currentPatch
  } = patch;
  void _classId; void _subclassId; void _level; void _skills; void _hp; void _progressions; void _startingClassId;

  return {
    ...base,
    ...currentPatch,
    startingClassId: patch.startingClassId ?? base.startingClassId,
    classProgressions: patch.classProgressions ? patch.classProgressions.map(cloneProgression) : [progression],
    abilityScores: { ...base.abilityScores, ...patch.abilityScores },
    inventory: patch.inventory ? patch.inventory.map((entry) => ({ ...entry })) : legacyEquipmentInventory(equipment, weaponAttackAbilityChoices),
    currency: { ...base.currency, ...patch.currency },
  };
}

type PlayStatePatch = Omit<Partial<CharacterPlayState>, 'hitDiceRemaining'> & {
  hitDiceRemaining?: CharacterPlayState['hitDiceRemaining'] | number;
};

export function fullFighter4PlayState(overrides: PlayStatePatch = {}): CharacterPlayState {
  const hitDiceRemaining = typeof overrides.hitDiceRemaining === 'number'
    ? (overrides.hitDiceRemaining > 0 ? { 10: overrides.hitDiceRemaining } : {})
    : overrides.hitDiceRemaining ?? { 10: 4 };
  return {
    currentHp: overrides.currentHp ?? 36,
    temporaryHp: overrides.temporaryHp ?? 0,
    hitDiceRemaining,
    resourceUses: {
      [FIGHTER_SECOND_WIND_RESOURCE_ID]: 3,
      [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 1,
      ...overrides.resourceUses,
    },
  };
}

export function fighterCharacter(patch: FighterInputPatch & { playState?: CharacterPlayState | PlayStatePatch } = {}): Character {
  const { playState, ...inputPatch } = patch;
  const resolvedPlayState = playState
    ? fullFighter4PlayState(playState as PlayStatePatch)
    : fullFighter4PlayState();
  return {
    ...fighterInput(inputPatch),
    id: 'fighter-4-test',
    playState: resolvedPlayState,
    createdAt: '2026-09-16T06:00:00.000Z',
    updatedAt: '2026-09-16T06:00:00.000Z',
  };
}
