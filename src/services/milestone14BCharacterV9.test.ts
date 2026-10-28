import { beforeEach, describe, expect, it } from 'vitest';
import { FIGHTER_ACTION_SURGE_RESOURCE_ID, FIGHTER_SECOND_WIND_RESOURCE_ID } from '../content/srd/fighter';
import { PALADIN_LAY_ON_HANDS_RESOURCE_ID } from '../content/srd/paladin';
import { WARLOCK_SPELLCASTING_PROVIDER_ID } from '../content/srd/warlock';
import { WIZARD_SPELLCASTING_PROVIDER_ID } from '../content/srd/wizard';
import { srdId } from '../content/srd/source';
import type { Character, CharacterInput, CharacterSpellcastingSelection } from '../models/character';
import { getTotalCharacterLevel } from '../rules/characterProgression';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { contentRegistry } from './contentRegistry';
import {
  CHARACTER_STORAGE_KEY,
  LEGACY_CHARACTER_STORAGE_KEY,
  LEGACY_CHARACTER_STORAGE_V2_KEY,
  LEGACY_CHARACTER_STORAGE_V3_KEY,
  LEGACY_CHARACTER_STORAGE_V4_KEY,
  LEGACY_CHARACTER_STORAGE_V5_KEY,
  LEGACY_CHARACTER_STORAGE_V6_KEY,
  LEGACY_CHARACTER_STORAGE_V7_KEY,
  LEGACY_CHARACTER_STORAGE_V8_KEY,
  createCharacter,
  deserializeCharacters,
  loadCharacters,
  migrateLegacyCharacter,
  migrateLegacyV2Character,
  migrateLegacyV3Character,
  migrateLegacyV4Character,
  migrateLegacyV5Character,
  migrateLegacyV6Character,
  migrateLegacyV7Character,
  migrateLegacyV8Character,
  updateCharacterPlayState,
} from './characterStorage';
import { fighterInput, SCIMITAR_ID } from '../test/fixtures';
import { validateCharacterInput } from '../utils/characterValidation';

const FIGHTER_ID = srdId('class', 'fighter');
const CHAMPION_ID = srdId('subclass', 'fighter:champion');
const BARBARIAN_ID = srdId('class', 'barbarian');
const WIZARD_ID = srdId('class', 'wizard');
const PALADIN_ID = srdId('class', 'paladin');
const WARLOCK_ID = srdId('class', 'warlock');
const FIEND_ID = srdId('subclass', 'warlock:fiend-patron');
const LEVEL1_WIZARD_SLOT_ID = srdId('spell-slot', 'wizard:1');
const LEVEL3_PACT_SLOT_ID = srdId('spell-slot', 'warlock:pact-magic:3');

function onlyProgression(character: Pick<Character, 'classProgressions'>) {
  expect(character.classProgressions).toHaveLength(1);
  const iterator = character.classProgressions.values();
  const first = iterator.next();
  if (first.done) throw new Error('Expected exactly one class progression.');
  return first.value;
}

function derived(character: Character) {
  const result = deriveCharacterState(character, contentRegistry);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function wizardSelection(): CharacterSpellcastingSelection {
  const wizardSpells = contentRegistry.getAll('spell').filter((spell) => spell.spellLists.some((list) => list.id === 'wizard'));
  const cantrips = wizardSpells.filter((spell) => spell.level === 0).sort((a, b) => a.name.localeCompare(b.name));
  const levelOne = wizardSpells.filter((spell) => spell.level === 1).sort((a, b) => a.name.localeCompare(b.name));
  if (cantrips.length < 3 || levelOne.length < 6) throw new Error('Wizard catalog fixture is incomplete.');
  return {
    providerId: WIZARD_SPELLCASTING_PROVIDER_ID,
    cantripIds: cantrips.slice(0, 3).map((spell) => spell.id),
    ownedSpellIds: levelOne.slice(0, 6).map((spell) => spell.id),
    preparedSpellIds: levelOne.slice(0, 4).map((spell) => spell.id),
  };
}

function warlockSelection(): CharacterSpellcastingSelection {
  const warlockSpells = contentRegistry.getAll('spell').filter((spell) => spell.spellLists.some((list) => list.id === 'warlock'));
  const cantrips = warlockSpells.filter((spell) => spell.level === 0).sort((a, b) => a.name.localeCompare(b.name));
  const leveled = warlockSpells.filter((spell) => spell.level > 0 && spell.level <= 3).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  if (cantrips.length < 3 || leveled.length < 6) throw new Error('Warlock catalog fixture is incomplete.');
  return {
    providerId: WARLOCK_SPELLCASTING_PROVIDER_ID,
    cantripIds: cantrips.slice(0, 3).map((spell) => spell.id),
    ownedSpellIds: [],
    preparedSpellIds: leveled.slice(0, 6).map((spell) => spell.id),
  };
}

function wizardInput(): CharacterInput {
  return fighterInput({
    name: 'M14B Wizard',
    classId: WIZARD_ID,
    subclassId: undefined,
    level: 1,
    skillProficiencies: ['history', 'insight'],
    abilityScores: { intelligence: 16, wisdom: 14 },
    spellcastingSelections: [wizardSelection()],
  });
}

function warlockInput(): CharacterInput {
  return fighterInput({
    name: 'M14B Warlock',
    classId: WARLOCK_ID,
    subclassId: FIEND_ID,
    level: 5,
    skillProficiencies: ['arcana', 'deception'],
    abilityScores: { charisma: 16, constitution: 14 },
    spellcastingSelections: [warlockSelection()],
  });
}

function toLegacyV8(character: Character) {
  const progression = onlyProgression(character);
  const classContent = contentRegistry.findClass(progression.classId);
  if (!classContent) throw new Error('Missing class content for legacy conversion.');
  return {
    id: character.id,
    name: character.name,
    classId: progression.classId,
    ...(progression.subclassId ? { subclassId: progression.subclassId } : {}),
    ...(character.speciesId ? { speciesId: character.speciesId } : {}),
    ...(character.backgroundId ? { backgroundId: character.backgroundId } : {}),
    ...(character.speciesSize ? { speciesSize: character.speciesSize } : {}),
    speciesChoices: { ...character.speciesChoices },
    speciesSkillProficiencies: [...character.speciesSkillProficiencies],
    ...(character.backgroundAbilityChoice ? { backgroundAbilityChoice: { ...character.backgroundAbilityChoice } } : {}),
    ...(character.backgroundToolChoice ? { backgroundToolChoice: character.backgroundToolChoice } : {}),
    ...(character.backgroundEquipmentChoice ? { backgroundEquipmentChoice: character.backgroundEquipmentChoice } : {}),
    manualFeats: character.manualFeats.map((selection) => ({
      featId: selection.featId,
      choices: Object.fromEntries(Object.entries(selection.choices).map(([key, values]) => [key, [...values]])),
    })),
    spellcastingSelections: character.spellcastingSelections.map((selection) => ({
      providerId: selection.providerId,
      cantripIds: [...selection.cantripIds],
      ownedSpellIds: [...selection.ownedSpellIds],
      preparedSpellIds: [...selection.preparedSpellIds],
    })),
    level: progression.level,
    abilityScores: { ...character.abilityScores },
    skillProficiencies: [...progression.skillProficiencies],
    inventory: character.inventory.map((entry) => ({ ...entry })),
    currency: { ...character.currency },
    hpProgression: progression.hpProgression.map((entry) => entry.method === 'fixed'
      ? { level: entry.classLevel, method: 'fixed' as const }
      : { level: entry.classLevel, method: 'rolled' as const, roll: entry.roll }),
    playState: {
      currentHp: character.playState.currentHp,
      temporaryHp: character.playState.temporaryHp,
      hitDiceRemaining: character.playState.hitDiceRemaining[classContent.hitDie] ?? 0,
      resourceUses: { ...character.playState.resourceUses },
    },
    createdAt: character.createdAt,
    updatedAt: character.updatedAt,
  };
}

function migrateV8(character: Character) {
  const legacy = toLegacyV8(character);
  const first = migrateLegacyV8Character(legacy);
  const second = migrateLegacyV8Character(structuredClone(legacy));
  expect(first).toBeDefined();
  expect(second).toEqual(first);
  if (!first) throw new Error('Expected v8 migration to succeed.');
  const progression = onlyProgression(first);
  expect(first.startingClassId).toBe(legacy.classId);
  expect(progression.classId).toBe(legacy.classId);
  expect(progression.level).toBe(legacy.level);
  expect(progression.subclassId).toBe(legacy.subclassId);
  expect(progression.skillProficiencies).toEqual(legacy.skillProficiencies);
  expect(progression.hpProgression).toEqual(legacy.hpProgression.map((entry) => entry.method === 'fixed'
    ? { classLevel: entry.level, method: 'fixed' }
    : { classLevel: entry.level, method: 'rolled', roll: entry.roll }));
  expect(getTotalCharacterLevel(first)).toBe(legacy.level);
  expect(first.id).toBe(legacy.id);
  expect(first.createdAt).toBe(legacy.createdAt);
  expect(first.updatedAt).toBe(legacy.updatedAt);
  return { legacy, migrated: first };
}

function baseLegacyV2() {
  return {
    id: 'm14b-legacy-v2',
    name: 'M14B Legacy Fighter',
    classId: FIGHTER_ID,
    level: 2,
    abilityScores: { strength: 14, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 12, charisma: 10 },
    skillProficiencies: ['athletics', 'perception'],
    equipment: { equippedWeaponIds: [] },
    weaponAttackAbilityChoices: {},
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T01:00:00.000Z',
  };
}

function legacyV3() {
  return {
    ...baseLegacyV2(),
    id: 'm14b-legacy-v3',
    hpProgression: [{ level: 2, method: 'fixed' as const }],
    playState: {
      currentHp: 20,
      temporaryHp: 0,
      hitDiceRemaining: 1,
      resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 2, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 1 },
    },
  };
}

function legacyV4() {
  const v3 = legacyV3();
  const { equipment: _equipment, weaponAttackAbilityChoices: _choices, ...rest } = v3;
  void _equipment; void _choices;
  return {
    ...rest,
    id: 'm14b-legacy-v4',
    inventory: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 5, pp: 0 },
  };
}

function legacyV5() {
  return {
    ...legacyV4(),
    id: 'm14b-legacy-v5',
    speciesId: srdId('species', 'dragonborn'),
    backgroundId: srdId('background', 'acolyte'),
    speciesChoices: { 'draconic-ancestry': 'black' },
    speciesSkillProficiencies: [],
    backgroundAbilityChoice: { mode: 'two-one' as const, plusTwo: 'charisma' as const, plusOne: 'intelligence' as const },
    backgroundEquipmentChoice: 'A',
  };
}

function legacyV6() {
  return { ...legacyV5(), id: 'm14b-legacy-v6', manualFeats: [] };
}

function legacyV7() {
  return { ...legacyV6(), id: 'm14b-legacy-v7', subclassId: undefined };
}

describe('Milestone 14-B Character v9 migration, validation, and single-class parity', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('A migrates a level-1 martial into exactly one v9 progression', () => {
    const current = createCharacter(fighterInput({ name: 'M14B A', level: 1, subclassId: undefined }));
    const { migrated } = migrateV8(current);
    expect(onlyProgression(migrated).hpProgression).toEqual([]);
    expect(migrated.playState.hitDiceRemaining).toEqual({ 10: 1 });
  });

  it('B preserves a higher-level martial subclass and fixed HP history', () => {
    const current = createCharacter(fighterInput({ name: 'M14B B', level: 4, subclassId: CHAMPION_ID }));
    const { migrated } = migrateV8(current);
    expect(onlyProgression(migrated).subclassId).toBe(CHAMPION_ID);
    expect(onlyProgression(migrated).hpProgression).toEqual([
      { classLevel: 2, method: 'fixed' },
      { classLevel: 3, method: 'fixed' },
      { classLevel: 4, method: 'fixed' },
    ]);
  });

  it('C preserves exact rolled HP history without rerolling', () => {
    const hpProgression = [
      { classLevel: 2, method: 'rolled' as const, roll: 7 },
      { classLevel: 3, method: 'rolled' as const, roll: 5 },
      { classLevel: 4, method: 'rolled' as const, roll: 9 },
    ];
    const current = createCharacter(fighterInput({ name: 'M14B C', level: 4, hpProgression }));
    const { migrated } = migrateV8(current);
    expect(onlyProgression(migrated).hpProgression).toEqual(hpProgression);
  });

  it('D preserves full-caster selections and partially spent ordinary spell-slot resources', () => {
    const created = createCharacter(wizardInput());
    const spent = updateCharacterPlayState(created.id, {
      ...created.playState,
      resourceUses: { ...created.playState.resourceUses, [LEVEL1_WIZARD_SLOT_ID]: 1 },
    })!;
    const { migrated } = migrateV8(spent);
    expect(migrated.spellcastingSelections).toEqual(spent.spellcastingSelections);
    expect(migrated.playState.resourceUses[LEVEL1_WIZARD_SLOT_ID]).toBe(1);
    expect(derived(migrated).spellcasting.find((provider) => provider.id === WIZARD_SPELLCASTING_PROVIDER_ID)?.slotPool?.slots)
      .toContainEqual(expect.objectContaining({ spellLevel: 1, maximumUses: 2 }));
  });

  it('E preserves Warlock Pact resources and stored spell selections without merging slot systems', () => {
    const created = createCharacter(warlockInput());
    const spent = updateCharacterPlayState(created.id, {
      ...created.playState,
      resourceUses: { ...created.playState.resourceUses, [LEVEL3_PACT_SLOT_ID]: 1 },
    })!;
    const { migrated } = migrateV8(spent);
    expect(migrated.spellcastingSelections).toEqual(spent.spellcastingSelections);
    expect(migrated.playState.resourceUses[LEVEL3_PACT_SLOT_ID]).toBe(1);
    const pact = derived(migrated).spellcasting.find((provider) => provider.id === WARLOCK_SPELLCASTING_PROVIDER_ID);
    expect(pact?.slotPool?.slots).toEqual([
      expect.objectContaining({ spellLevel: 3, resourceId: LEVEL3_PACT_SLOT_ID, maximumUses: 2 }),
    ]);
  });

  it('F preserves damage, Temporary HP, spent Hit Dice, and spent Fighter resources', () => {
    const created = createCharacter(fighterInput({ name: 'M14B F', level: 4 }));
    const damaged = updateCharacterPlayState(created.id, {
      currentHp: 19,
      temporaryHp: 5,
      hitDiceRemaining: { 10: 2 },
      resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 1, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 0 },
    })!;
    const { migrated } = migrateV8(damaged);
    expect(migrated.playState).toEqual({
      currentHp: 19,
      temporaryHp: 5,
      hitDiceRemaining: { 10: 2 },
      resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 1, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 0 },
    });
  });

  it('G preserves persistence-heavy Species/Background/Feat/Inventory/currency metadata', () => {
    const current = createCharacter(fighterInput({
      name: 'M14B G',
      manualFeats: [{ featId: srdId('feat', 'archery'), choices: {} }],
      inventory: [
        { id: 'm14b-custom', kind: 'custom', name: 'Campaign Token', category: 'other', quantity: 2, notes: 'Keep this exact note.', weightPounds: 0.25 },
        { id: 'm14b-scimitar', kind: 'registry', contentId: SCIMITAR_ID, category: 'weapon', quantity: 1, equipped: true, notes: 'Named keepsake blade.', attackAbilityChoice: 'dexterity' },
      ],
      currency: { cp: 7, sp: 8, ep: 1, gp: 29, pp: 2 },
    }));
    const { migrated } = migrateV8(current);
    expect(migrated.speciesId).toBe(current.speciesId);
    expect(migrated.backgroundId).toBe(current.backgroundId);
    expect(migrated.speciesChoices).toEqual(current.speciesChoices);
    expect(migrated.backgroundAbilityChoice).toEqual(current.backgroundAbilityChoice);
    expect(migrated.manualFeats).toEqual(current.manualFeats);
    expect(migrated.inventory).toEqual(current.inventory);
    expect(migrated.currency).toEqual(current.currency);
  });

  it('freezes legacy v1-v7 continuity into Character v9', () => {
    const v1 = {
      id: 'm14b-legacy-v1',
      name: 'M14B Legacy V1',
      class: 'Fighter',
      level: 2,
      abilityScores: { strength: 14, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 12, charisma: 10 },
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T01:00:00.000Z',
    };
    const cases = [
      [LEGACY_CHARACTER_STORAGE_KEY, v1, migrateLegacyCharacter],
      [LEGACY_CHARACTER_STORAGE_V2_KEY, baseLegacyV2(), migrateLegacyV2Character],
      [LEGACY_CHARACTER_STORAGE_V3_KEY, legacyV3(), migrateLegacyV3Character],
      [LEGACY_CHARACTER_STORAGE_V4_KEY, legacyV4(), migrateLegacyV4Character],
      [LEGACY_CHARACTER_STORAGE_V5_KEY, legacyV5(), migrateLegacyV5Character],
      [LEGACY_CHARACTER_STORAGE_V6_KEY, legacyV6(), migrateLegacyV6Character],
      [LEGACY_CHARACTER_STORAGE_V7_KEY, legacyV7(), migrateLegacyV7Character],
    ] as const;

    for (const [key, record, migrate] of cases) {
      const migrated = migrate(record);
      expect(migrated, key).toBeDefined();
      if (!migrated) continue;
      expect(migrated.startingClassId, key).toBe(FIGHTER_ID);
      expect(migrated.classProgressions, key).toHaveLength(1);
      expect(getTotalCharacterLevel(migrated), key).toBe(2);
      window.localStorage.clear();
      window.localStorage.setItem(key, JSON.stringify([record]));
      const loaded = loadCharacters();
      expect(loaded, key).toHaveLength(1);
      expect(loaded[0].startingClassId, key).toBe(FIGHTER_ID);
      expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY), key).not.toBeNull();
      expect(window.localStorage.getItem(key), key).not.toBeNull();
    }
    expect(LEGACY_CHARACTER_STORAGE_V8_KEY).toBe('dnd3.characters.v8');
    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v10');
  });

  it('rejects invalid v9 progression topology and total-level state', () => {
    const base = fighterInput({ level: 4 });
    const p = base.classProgressions.values().next().value;
    if (!p) throw new Error('Missing base progression.');

    expect(validateCharacterInput({ ...base, classProgressions: [] }).classProgressions).toBeDefined();
    expect(validateCharacterInput({ ...base, classProgressions: [p, { ...p }] }).classProgressions).toMatch(/unique/i);
    expect(validateCharacterInput({ ...base, classProgressions: [{ ...p, level: 0 }] }).classProgressions).toBeDefined();
    expect(validateCharacterInput({
      ...base,
      classProgressions: [
        { ...p, level: 20, hpProgression: Array.from({ length: 19 }, (_, index) => ({ classLevel: index + 2, method: 'fixed' as const })) },
        { classId: BARBARIAN_ID, level: 1, skillProficiencies: [], skillExpertise: [], weaponMasterySelections: [], hpProgression: [{ classLevel: 1, method: 'fixed' }] },
      ],
    }).level).toBeDefined();
    expect(validateCharacterInput({ ...base, startingClassId: BARBARIAN_ID }).startingClassId).toBeDefined();
  });

  it('rejects malformed progression-local HP histories fail-closed', () => {
    const base = fighterInput({ level: 4 });
    const p = base.classProgressions.values().next().value;
    if (!p) throw new Error('Missing base progression.');
    const check = (hpProgression: unknown[]) => validateCharacterInput({
      ...base,
      classProgressions: [{ ...p, hpProgression: hpProgression as typeof p.hpProgression }],
    }).hpProgression;

    expect(check([{ classLevel: 2, method: 'fixed' }, { classLevel: 2, method: 'fixed' }, { classLevel: 4, method: 'fixed' }])).toBeDefined();
    expect(check([{ classLevel: 2, method: 'fixed' }, { classLevel: 4, method: 'fixed' }, { classLevel: 5, method: 'fixed' }])).toBeDefined();
    expect(check([{ classLevel: 2, method: 'rolled' }, { classLevel: 3, method: 'fixed' }, { classLevel: 4, method: 'fixed' }])).toBeDefined();
    expect(check([{ classLevel: 2, method: 'rolled', roll: 11 }, { classLevel: 3, method: 'fixed' }, { classLevel: 4, method: 'fixed' }])).toBeDefined();
    expect(check([{ classLevel: 2, method: 'fixed', roll: 5 }, { classLevel: 3, method: 'fixed' }, { classLevel: 4, method: 'fixed' }])).toBeDefined();
  });

  it('rejects malformed current-v9 Hit Dice pools and unsupported current fields', () => {
    const current = createCharacter(fighterInput({ level: 4 }));
    const reject = (record: unknown) => expect(deserializeCharacters(JSON.stringify([record]))).toEqual([]);

    reject({ ...current, playState: { ...current.playState, hitDiceRemaining: [] } });
    reject({ ...current, playState: { ...current.playState, hitDiceRemaining: { 20: 1 } } });
    reject({ ...current, playState: { ...current.playState, hitDiceRemaining: { 10: -1 } } });
    reject({ ...current, playState: { ...current.playState, hitDiceRemaining: { 10: 5 } } });
    reject({ ...current, playState: { ...current.playState, hitDiceRemaining: 2 } });
    reject({ ...current, classId: FIGHTER_ID });
  });

  it('freezes representative v9 single-class parity without deriving multiple progressions', () => {
    const fighter = createCharacter(fighterInput({
      name: 'Parity Fighter',
      level: 4,
      equipment: { equippedArmorId: srdId('armor', 'chain-mail'), equippedWeaponIds: [SCIMITAR_ID] },
      weaponAttackAbilityChoices: { [SCIMITAR_ID]: 'dexterity' },
      manualFeats: [{ featId: srdId('feat', 'archery'), choices: {} }],
      currency: { gp: 11 },
    }));
    const fighterState = derived(fighter);
    expect(fighterState).toMatchObject({
      level: 4,
      proficiencyBonus: 2,
      className: 'Fighter',
      subclass: { id: CHAMPION_ID },
      health: { hitDice: [{ die: 10, maximum: 4 }] },
    });
    expect(fighterState.savingThrows.strength.proficient).toBe(true);
    expect(fighterState.skills.athletics.proficient).toBe(true);
    expect(fighterState.defense.armor?.name).toBe('Chain Mail');
    expect(fighterState.attacks.some((attack) => attack.weaponId === SCIMITAR_ID)).toBe(true);
    expect(fighterState.resources.some((resource) => resource.id === FIGHTER_SECOND_WIND_RESOURCE_ID)).toBe(true);
    expect(fighterState.feats.some((feat) => feat.id === srdId('feat', 'archery'))).toBe(true);
    expect(fighterState.species?.id).toBe(fighter.speciesId);
    expect(fighterState.background?.id).toBe(fighter.backgroundId);
    expect(fighter.currency.gp).toBe(11);

    window.localStorage.clear();
    const barbarian = createCharacter(fighterInput({
      name: 'Parity Barbarian',
      classId: BARBARIAN_ID,
      subclassId: undefined,
      level: 2,
      skillProficiencies: ['athletics', 'perception'],
    }));
    const barbarianState = derived(barbarian);
    expect(barbarianState).toMatchObject({ level: 2, proficiencyBonus: 2, className: 'Barbarian', health: { hitDice: [{ die: 12, maximum: 2 }] } });
    expect(barbarianState.resources.some((resource) => resource.name === 'Rage')).toBe(true);
    expect(barbarianState.activeSelfEffects.length).toBeGreaterThan(0);

    window.localStorage.clear();
    const wizard = createCharacter(wizardInput());
    const wizardState = derived(wizard);
    expect(wizardState).toMatchObject({ level: 1, proficiencyBonus: 2, className: 'Wizard', health: { hitDice: [{ die: 6, maximum: 1 }] } });
    expect(wizardState.savingThrows.intelligence.proficient).toBe(true);
    expect(wizardState.spellcasting.find((provider) => provider.id === WIZARD_SPELLCASTING_PROVIDER_ID)?.management.kind).toBe('prepared-from-owned');
    expect(wizard.playState.resourceUses[LEVEL1_WIZARD_SLOT_ID]).toBe(2);

    window.localStorage.clear();
    const paladin = createCharacter(fighterInput({
      name: 'Parity Paladin',
      classId: PALADIN_ID,
      subclassId: undefined,
      level: 2,
      skillProficiencies: ['athletics', 'medicine'],
      abilityScores: { charisma: 16 },
    }));
    const paladinState = derived(paladin);
    expect(paladinState).toMatchObject({ level: 2, proficiencyBonus: 2, className: 'Paladin', health: { hitDice: [{ die: 10, maximum: 2 }] } });
    expect(paladinState.spellcasting.some((provider) => provider.name === 'Paladin Spellcasting')).toBe(true);
    expect(paladin.playState.resourceUses[PALADIN_LAY_ON_HANDS_RESOURCE_ID]).toBe(10);

    window.localStorage.clear();
    const warlock = createCharacter(warlockInput());
    const warlockState = derived(warlock);
    expect(warlockState).toMatchObject({ level: 5, proficiencyBonus: 3, className: 'Warlock', subclass: { id: FIEND_ID }, health: { hitDice: [{ die: 8, maximum: 5 }] } });
    expect(warlockState.spellcasting.find((provider) => provider.id === WARLOCK_SPELLCASTING_PROVIDER_ID)?.slotPool?.slots)
      .toEqual([expect.objectContaining({ spellLevel: 3, maximumUses: 2 })]);
    expect(warlock.spellcastingSelections).toEqual([warlockSelection()]);
  });
});
