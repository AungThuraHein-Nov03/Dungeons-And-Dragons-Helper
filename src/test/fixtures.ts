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
import { deriveSkillExpertiseChoices } from '../rules/characterChoices';
import { deriveLanguageChoices } from '../rules/languageChoices';
import { deriveWeaponMasteryChoices } from '../rules/weaponMasteryChoices';
import { contentRegistry, type ContentRegistry } from '../services/contentRegistry';
import {
  buildLevelUpCandidate,
  withLevelUpLanguages,
  withLevelUpSkillExpertise,
  withLevelUpWeaponMasteries,
  type LevelUpDraft,
} from '../rules/levelUp';

export const FIGHTER_ID = srdId('class', 'fighter');
export const CHAMPION_ID = srdId('subclass', 'fighter:champion');
export const DRAGONBORN_ID = srdId('species', 'dragonborn');
export const ACOLYTE_ID = srdId('background', 'acolyte');
export const SCIMITAR_ID = srdId('weapon', 'scimitar');
export const LIGHT_CROSSBOW_ID = srdId('weapon', 'light-crossbow');
export const DAGGER_ID = srdId('weapon', 'dagger');
export const SHORTSWORD_ID = srdId('weapon', 'shortsword');
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
  preserveV10Choices?: boolean;
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
    skillExpertise: [...progression.skillExpertise],
    weaponMasterySelections: [...progression.weaponMasterySelections],
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
    skillExpertise: [],
    weaponMasterySelections: classId === FIGHTER_ID
      ? [DAGGER_ID, LIGHT_CROSSBOW_ID, SCIMITAR_ID, SHORTSWORD_ID]
      : [],
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
    languageChoices: [],
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
    preserveV10Choices,
    ...currentPatch
  } = patch;
  void _classId; void _subclassId; void _level; void _skills; void _hp; void _progressions; void _startingClassId;

  const result: CharacterInput = {
    ...base,
    ...currentPatch,
    startingClassId: patch.startingClassId ?? base.startingClassId,
    classProgressions: patch.classProgressions ? patch.classProgressions.map(cloneProgression) : [progression],
    abilityScores: { ...base.abilityScores, ...patch.abilityScores },
    inventory: patch.inventory ? patch.inventory.map((entry) => ({ ...entry })) : legacyEquipmentInventory(equipment, weaponAttackAbilityChoices),
    currency: { ...base.currency, ...patch.currency },
  };

  if (!preserveV10Choices) {
    const expertise = deriveSkillExpertiseChoices(result, contentRegistry);
    if (expertise.ok) {
      for (const owner of expertise.value) {
        const progression = result.classProgressions.find((entry) => entry.classId === owner.classId);
        if (progression) progression.skillExpertise = owner.eligible.slice(0, owner.entitled);
      }
    }

    const masteries = deriveWeaponMasteryChoices(result, contentRegistry);
    if (masteries.ok) {
      const alreadySelected = new Set<ContentId>();
      for (const owner of masteries.value) {
        const progression = result.classProgressions.find((entry) => entry.classId === owner.classId);
        if (!progression) continue;
        progression.weaponMasterySelections = owner.eligible
          .map((weapon) => weapon.id)
          .filter((id) => !alreadySelected.has(id))
          .slice(0, owner.entitled);
        progression.weaponMasterySelections.forEach((id) => alreadySelected.add(id));
      }
    }

    const languages = deriveLanguageChoices(result, contentRegistry);
    if (languages.ok) result.languageChoices = languages.value.eligible.slice(0, languages.value.entitled);
  }

  return result;
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

export function completeCharacterV10Choices(
  input: CharacterInput,
  registry: ContentRegistry = contentRegistry,
): CharacterInput {
  const completed: CharacterInput = {
    ...input,
    classProgressions: input.classProgressions.map(cloneProgression),
    languageChoices: [...input.languageChoices],
    speciesChoices: { ...input.speciesChoices },
    speciesSkillProficiencies: [...input.speciesSkillProficiencies],
    manualFeats: input.manualFeats.map((selection) => ({
      featId: selection.featId,
      choices: Object.fromEntries(Object.entries(selection.choices).map(([choiceId, values]) => [choiceId, [...values]])),
    })),
    spellcastingSelections: input.spellcastingSelections.map((selection) => ({
      providerId: selection.providerId,
      cantripIds: [...selection.cantripIds],
      ownedSpellIds: [...selection.ownedSpellIds],
      preparedSpellIds: [...selection.preparedSpellIds],
    })),
    abilityScores: { ...input.abilityScores },
    inventory: input.inventory.map((entry) => ({ ...entry })),
    currency: { ...input.currency },
  };

  const expertise = deriveSkillExpertiseChoices(completed, registry);
  if (expertise.ok) {
    for (const owner of expertise.value) {
      const progression = completed.classProgressions.find((entry) => entry.classId === owner.classId);
      if (progression) progression.skillExpertise = owner.eligible.slice(0, owner.entitled);
    }
  }

  const masteries = deriveWeaponMasteryChoices(completed, registry);
  if (masteries.ok) {
    const selected = new Set<ContentId>();
    for (const owner of masteries.value) {
      const progression = completed.classProgressions.find((entry) => entry.classId === owner.classId);
      if (!progression) continue;
      progression.weaponMasterySelections = owner.eligible
        .map((weapon) => weapon.id)
        .filter((weaponId) => !selected.has(weaponId))
        .slice(0, owner.entitled);
      progression.weaponMasterySelections.forEach((weaponId) => selected.add(weaponId));
    }
  }

  const languages = deriveLanguageChoices(completed, registry);
  if (languages.ok) completed.languageChoices = languages.value.eligible.slice(0, languages.value.entitled);
  return completed;
}

export function completeLevelUpV10Choices(character: Character, draft: LevelUpDraft): LevelUpDraft {
  const candidate = buildLevelUpCandidate(character, draft, contentRegistry);
  if (!candidate.ok || !draft.target) return draft;
  let completed = draft;

  const expertise = deriveSkillExpertiseChoices(candidate.value.input, contentRegistry);
  if (expertise.ok) {
    const owner = expertise.value.find((choice) => choice.classId === draft.target?.classId);
    if (owner) completed = withLevelUpSkillExpertise(completed, owner.eligible.slice(0, owner.entitled));
  }

  const masteries = deriveWeaponMasteryChoices(candidate.value.input, contentRegistry);
  if (masteries.ok) {
    const globallySelected = new Set<ContentId>();
    for (const owner of masteries.value) {
      const selections = [
        ...owner.selected,
        ...owner.eligible.map((weapon) => weapon.id).filter((id) => !owner.selected.includes(id)),
      ].filter((id) => !globallySelected.has(id)).slice(0, owner.entitled);
      selections.forEach((id) => globallySelected.add(id));
      completed = withLevelUpWeaponMasteries(completed, owner.classId, selections);
    }
  }

  const languages = deriveLanguageChoices(candidate.value.input, contentRegistry);
  if (languages.ok) {
    completed = withLevelUpLanguages(completed, [
      ...languages.value.selected,
      ...languages.value.eligible.filter((id) => !languages.value.selected.includes(id)),
    ].slice(0, languages.value.entitled));
  }
  return completed;
}
