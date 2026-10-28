import { describe, expect, it, vi } from 'vitest';
import { FIGHTER_ACTION_SURGE_RESOURCE_ID, FIGHTER_SECOND_WIND_RESOURCE_ID } from '../content/srd/fighter';
import { srdId } from '../content/srd';
import type { Character, CharacterInput } from '../models/character';
import { CHAMPION_ID, completeCharacterV10Choices, fighterCharacter, fighterInput, fullFighter4PlayState } from '../test/fixtures';
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
  deleteCharacter,
  deserializeCharacters,
  loadCharacters,
  migrateLegacyCharacter,
  migrateLegacyV8Character,
  serializeCharacters,
  updateCharacter,
  updateCharacterPlayState,
} from './characterStorage';

function makeInput(name = 'Kael'): CharacterInput {
  return fighterInput({ name, level: 3, abilityScores: { strength: 16, dexterity: 14, constitution: 15, intelligence: 10, wisdom: 12, charisma: 8 } });
}

function legacyFighter(overrides: Record<string, unknown> = {}) {
  return {
    id: 'legacy-fighter', name: 'Legacy Fighter', class: 'Fighter', level: 4,
    abilityScores: { strength: 14, dexterity: 18, constitution: 14, intelligence: 10, wisdom: 12, charisma: 12 },
    createdAt: '2026-09-15T06:00:00.000Z', updatedAt: '2026-09-15T07:00:00.000Z', ...overrides,
  };
}

function legacyV2Fighter() {
  return {
    id: 'legacy-v2-fighter',
    name: 'Milestone Three',
    classId: srdId('class', 'fighter'),
    level: 4,
    abilityScores: { strength: 14, dexterity: 18, constitution: 14, intelligence: 10, wisdom: 12, charisma: 12 },
    skillProficiencies: ['athletics', 'perception'],
    equipment: { equippedWeaponIds: [] },
    weaponAttackAbilityChoices: {},
    createdAt: '2026-09-15T08:00:00.000Z',
    updatedAt: '2026-09-15T09:00:00.000Z',
  };
}

function legacyV3Fighter() {
  return {
    ...legacyV2Fighter(),
    id: 'legacy-v3-fighter',
    hpProgression: [{ level: 2, method: 'fixed' as const }, { level: 3, method: 'fixed' as const }, { level: 4, method: 'fixed' as const }],
    playState: {
      currentHp: 25,
      temporaryHp: 0,
      hitDiceRemaining: 4,
      resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 3, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 1 },
    },
  };
}

function legacyV4Fighter() {
  return {
    id: 'legacy-v4-fighter',
    name: 'Milestone Six',
    classId: srdId('class', 'fighter'),
    level: 4,
    abilityScores: { strength: 14, dexterity: 18, constitution: 14, intelligence: 10, wisdom: 12, charisma: 12 },
    skillProficiencies: ['athletics', 'perception'],
    inventory: [{ id: 'legacy-v4-scimitar', kind: 'registry', contentId: srdId('weapon', 'scimitar'), category: 'weapon', quantity: 1, equipped: true, notes: '', attackAbilityChoice: 'dexterity' }],
    currency: { cp: 1, sp: 2, ep: 3, gp: 4, pp: 5 },
    hpProgression: [{ level: 2, method: 'fixed' }, { level: 3, method: 'fixed' }, { level: 4, method: 'fixed' }],
    playState: { currentHp: 21, temporaryHp: 3, hitDiceRemaining: 2, resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 1, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 0 } },
    createdAt: '2026-09-15T10:00:00.000Z',
    updatedAt: '2026-09-15T11:00:00.000Z',
  };
}

function toLegacyV8Record(character: ReturnType<typeof fighterCharacter>) {
  const progression = character.classProgressions[0];
  if (!progression) throw new Error('Expected a single Fighter progression test fixture.');
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
    manualFeats: character.manualFeats.map((selection) => ({ ...selection, choices: structuredClone(selection.choices) })),
    spellcastingSelections: character.spellcastingSelections.map((selection) => ({ ...selection, cantripIds: [...selection.cantripIds], ownedSpellIds: [...selection.ownedSpellIds], preparedSpellIds: [...selection.preparedSpellIds] })),
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
      hitDiceRemaining: character.playState.hitDiceRemaining[10] ?? 0,
      resourceUses: { ...character.playState.resourceUses },
    },
    createdAt: character.createdAt,
    updatedAt: character.updatedAt,
  };
}

function legacyV8Fighter() {
  return toLegacyV8Record(fighterCharacter({
    name: 'Milestone Thirteen',
    manualFeats: [{ featId: srdId('feat', 'archery'), choices: {} }],
    inventory: [{ id: 'legacy-v8-scimitar', kind: 'registry', contentId: srdId('weapon', 'scimitar'), category: 'weapon', quantity: 2, equipped: true, notes: 'v8 inventory must remain untouched', attackAbilityChoice: 'dexterity' }],
    currency: { cp: 9, sp: 8, ep: 1, gp: 31, pp: 2 },
    playState: fullFighter4PlayState({ currentHp: 16, temporaryHp: 7, hitDiceRemaining: 2, resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 1, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 0 } }),
  }));
}

function legacyV5Fighter() {
  const { manualFeats, subclassId, spellcastingSelections, ...legacy } = toLegacyV8Record(fighterCharacter({
    name: 'Milestone Seven',
    inventory: [{ id: 'legacy-v5-scimitar', kind: 'registry', contentId: srdId('weapon', 'scimitar'), category: 'weapon', quantity: 1, equipped: true, notes: 'v5 note', attackAbilityChoice: 'dexterity' }],
    currency: { gp: 17 },
    playState: fullFighter4PlayState({ currentHp: 22, temporaryHp: 4, hitDiceRemaining: 2 }),
  }));
  void manualFeats; void subclassId; void spellcastingSelections;
  return legacy;
}

function legacyV6Fighter() {
  const { subclassId, spellcastingSelections, ...legacy } = toLegacyV8Record(fighterCharacter({
    name: 'Milestone Eight',
    manualFeats: [{ featId: srdId('feat', 'archery'), choices: {} }],
    inventory: [{ id: 'legacy-v6-scimitar', kind: 'registry', contentId: srdId('weapon', 'scimitar'), category: 'weapon', quantity: 1, equipped: true, notes: 'v6 note', attackAbilityChoice: 'dexterity' }],
    currency: { cp: 2, sp: 3, gp: 19 },
    playState: fullFighter4PlayState({ currentHp: 20, temporaryHp: 5, hitDiceRemaining: 2, resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 1, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 0 } }),
  }));
  void subclassId; void spellcastingSelections;
  return legacy;
}

function legacyV7Fighter() {
  const { spellcastingSelections, ...legacy } = toLegacyV8Record(fighterCharacter({
    name: 'Milestone Twelve D',
    manualFeats: [{ featId: srdId('feat', 'archery'), choices: {} }],
    inventory: [{ id: 'legacy-v7-scimitar', kind: 'registry', contentId: srdId('weapon', 'scimitar'), category: 'weapon', quantity: 2, equipped: true, notes: 'v7 inventory must remain untouched', attackAbilityChoice: 'dexterity' }],
    currency: { cp: 7, sp: 8, ep: 1, gp: 29, pp: 2 },
    playState: fullFighter4PlayState({ currentHp: 17, temporaryHp: 6, hitDiceRemaining: 2, resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 1, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 0 } }),
  }));
  void spellcastingSelections;
  return legacy;
}

const zeroCurrency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

function progressionOf(character: Character) {
  if (character.classProgressions.length !== 1) throw new Error('Expected one class progression in single-class persistence test.');
  const progression = character.classProgressions[0];
  if (!progression) throw new Error('Missing class progression.');
  return progression;
}

describe('character persistence', () => {
  it('serializes, stores, and restores a created v5 character with mutable play state', () => {
    const created = createCharacter(makeInput());
    const raw = window.localStorage.getItem(CHARACTER_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(deserializeCharacters(raw)).toEqual([created]);
    expect(loadCharacters()).toEqual([created]);
    expect(serializeCharacters([created])).toBe(raw);
    expect(created.playState).toMatchObject({ currentHp: 28, temporaryHp: 0, hitDiceRemaining: { 10: 3 } });
  });

  it('does not redundantly persist derived maxima', () => {
    createCharacter(fighterInput());
    const parsed = JSON.parse(window.localStorage.getItem(CHARACTER_STORAGE_KEY)!)[0];
    expect(parsed.maxHp).toBeUndefined();
    expect(parsed.maximumHp).toBeUndefined();
    expect(parsed.maximumHitDice).toBeUndefined();
    expect(parsed.resources).toBeUndefined();
    expect(parsed.playState).toBeDefined();
  });

  it('handles malformed current storage and malformed play state safely', () => {
    window.localStorage.setItem(CHARACTER_STORAGE_KEY, '{not-json');
    expect(loadCharacters()).toEqual([]);
    window.localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify({ character: 'wrong shape' }));
    expect(loadCharacters()).toEqual([]);
    const valid = createCharacter(fighterInput());
    window.localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify([{ ...valid, playState: { ...valid.playState, currentHp: -1 } }]));
    expect(loadCharacters()).toEqual([]);
  });

  it('rejects malformed current v5 inventory safely', () => {
    const valid = createCharacter(fighterInput());
    const malformed = {
      ...valid,
      inventory: [{
        id: 'broken-inventory-entry',
        kind: 'registry',
        contentId: srdId('weapon', 'scimitar'),
        category: 'weapon',
        quantity: 0,
        equipped: true,
        notes: '',
      }],
    };
    window.localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify([malformed]));
    expect(loadCharacters()).toEqual([]);
    expect(deserializeCharacters(window.localStorage.getItem(CHARACTER_STORAGE_KEY))).toEqual([]);
  });

  it('filters invalid entries instead of crashing the whole roster', () => {
    const valid = createCharacter(makeInput());
    window.localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify([valid, { id: 'broken', name: 'Broken' }]));
    expect(loadCharacters()).toEqual([valid]);
  });

  it('creates a character with persisted identity and timestamps', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T06:00:00.000Z'));
    const created = createCharacter(makeInput('  Theren  '));
    expect(created.id).toBeTruthy();
    expect(created.name).toBe('Theren');
    expect(progressionOf(created).classId).toBe(srdId('class', 'fighter'));
    expect(created.createdAt).toBe('2026-09-16T06:00:00.000Z');
    expect(created.updatedAt).toBe(created.createdAt);
    expect(loadCharacters()).toHaveLength(1);
  });

  it('edits build state while preserving id, createdAt, and valid HP history', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T06:00:00.000Z'));
    const original = createCharacter(makeInput('Old Name'));
    vi.setSystemTime(new Date('2026-09-16T07:00:00.000Z'));
    const updated = updateCharacter(original.id, fighterInput({ name: 'New Name', level: 5, abilityScores: { strength: 16, dexterity: 14, constitution: 15, intelligence: 10, wisdom: 12, charisma: 8 } }));
    expect(updated).toBeDefined();
    expect(updated?.id).toBe(original.id);
    expect(updated?.createdAt).toBe(original.createdAt);
    expect(updated?.updatedAt).toBe('2026-09-16T07:00:00.000Z');
    expect(updated?.name).toBe('New Name');
    expect(updated && progressionOf(updated).level).toBe(5);
    expect(updated && progressionOf(updated).hpProgression).toHaveLength(4);
  });

  it('persists current HP, Temp HP, Hit Dice, and resource uses', () => {
    const created = createCharacter(fighterInput());
    const playState = fullFighter4PlayState({ currentHp: 23, temporaryHp: 5, hitDiceRemaining: 2, resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 1, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 0 } });
    const updated = updateCharacterPlayState(created.id, playState)!;
    expect(loadCharacters()[0].playState).toEqual(updated.playState);
  });

  it('reconciles Constitution changes without silently healing and clamps when maximum falls below current HP', () => {
    const created = createCharacter(fighterInput());
    updateCharacterPlayState(created.id, fullFighter4PlayState({ currentHp: 20 }));
    const increased = updateCharacter(created.id, fighterInput({ abilityScores: { constitution: 16 } }))!;
    expect(increased.playState.currentHp).toBe(20);
    updateCharacterPlayState(created.id, { ...increased.playState, currentHp: 40 });
    const decreased = updateCharacter(created.id, fighterInput({ abilityScores: { constitution: 8 } }))!;
    expect(decreased.playState.currentHp).toBe(24);
  });

  it('reconciles level/resource maxima without treating a build edit as a rest', () => {
    const created = createCharacter(fighterInput({ level: 3 }));
    updateCharacterPlayState(created.id, { ...created.playState, hitDiceRemaining: { 10: 1 }, resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 1, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 0 } });
    const leveled = updateCharacter(created.id, fighterInput({ level: 4 }))!;
    expect(leveled.playState.hitDiceRemaining).toEqual({ 10: 2 });
    expect(leveled.playState.resourceUses[FIGHTER_SECOND_WIND_RESOURCE_ID]).toBe(1);
    expect(leveled.playState.resourceUses[FIGHTER_ACTION_SURGE_RESOURCE_ID]).toBe(0);
  });

  it('deletes only the requested character', () => {
    const first = createCharacter(makeInput('First'));
    const second = createCharacter(makeInput('Second'));
    expect(deleteCharacter(first.id)).toBe(true);
    expect(loadCharacters()).toEqual([second]);
    expect(deleteCharacter('missing-id')).toBe(false);
  });

  it('migrates a valid v1 Fighter with fixed HP fallback and full initial play state', () => {
    window.localStorage.setItem(LEGACY_CHARACTER_STORAGE_KEY, JSON.stringify([legacyFighter()]));
    const [migrated] = loadCharacters();
    expect(migrated).toEqual({
      id: 'legacy-fighter',
      name: 'Legacy Fighter',
      startingClassId: srdId('class', 'fighter'),
      classProgressions: [{
        classId: srdId('class', 'fighter'),
        level: 4,
        skillProficiencies: [],
        skillExpertise: [],
        weaponMasterySelections: [],
        hpProgression: [{ classLevel: 2, method: 'fixed' }, { classLevel: 3, method: 'fixed' }, { classLevel: 4, method: 'fixed' }],
      }],
      abilityScores: { strength: 14, dexterity: 18, constitution: 14, intelligence: 10, wisdom: 12, charisma: 12 },
      speciesChoices: {}, speciesSkillProficiencies: [], languageChoices: [], manualFeats: [], spellcastingSelections: [],
      inventory: [], currency: zeroCurrency,
      playState: { currentHp: 36, temporaryHp: 0, hitDiceRemaining: { 10: 4 }, resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 3, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 1 } },
      createdAt: '2026-09-15T06:00:00.000Z', updatedAt: '2026-09-15T07:00:00.000Z',
    });
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(serializeCharacters([migrated]));
    expect(window.localStorage.getItem(LEGACY_CHARACTER_STORAGE_KEY)).not.toBeNull();
  });

  it('migrates a Milestone 3 v2 character without destructively changing the v2 record', () => {
    const oldRecord = legacyV2Fighter();
    window.localStorage.setItem(LEGACY_CHARACTER_STORAGE_V2_KEY, JSON.stringify([oldRecord]));
    const [migrated] = loadCharacters();
    expect(migrated.id).toBe(oldRecord.id);
    expect(migrated.name).toBe(oldRecord.name);
    expect(migrated.createdAt).toBe(oldRecord.createdAt);
    expect(migrated.updatedAt).toBe(oldRecord.updatedAt);
    expect(migrated.inventory).toEqual([]);
    expect(migrated.currency).toEqual(zeroCurrency);
    expect(progressionOf(migrated).hpProgression).toEqual([{ classLevel: 2, method: 'fixed' }, { classLevel: 3, method: 'fixed' }, { classLevel: 4, method: 'fixed' }]);
    expect(migrated.playState).toEqual(fullFighter4PlayState());
    expect(window.localStorage.getItem(LEGACY_CHARACTER_STORAGE_V2_KEY)).toBe(JSON.stringify([oldRecord]));
  });

  it('migrates an intact v4 character to v6 without fabricating Species, Background, or manual Feats', () => {
    const oldRecord = legacyV4Fighter();
    const oldRaw = JSON.stringify([oldRecord]);
    window.localStorage.setItem(LEGACY_CHARACTER_STORAGE_V4_KEY, oldRaw);

    const [migrated] = loadCharacters();
    expect(migrated).toBeDefined();
    expect(migrated).toMatchObject({
      id: oldRecord.id,
      name: oldRecord.name,
      startingClassId: oldRecord.classId,
      classProgressions: [{
        classId: oldRecord.classId,
        level: oldRecord.level,
        skillProficiencies: oldRecord.skillProficiencies,
        hpProgression: oldRecord.hpProgression.map((entry) => ({ classLevel: entry.level, method: entry.method })),
      }],
      abilityScores: oldRecord.abilityScores,
      inventory: oldRecord.inventory,
      currency: oldRecord.currency,
      playState: { ...oldRecord.playState, hitDiceRemaining: { 10: oldRecord.playState.hitDiceRemaining } },
      speciesChoices: {},
      speciesSkillProficiencies: [],
      manualFeats: [],
      createdAt: oldRecord.createdAt,
      updatedAt: oldRecord.updatedAt,
    });
    expect(migrated.speciesId).toBeUndefined();
    expect(migrated.backgroundId).toBeUndefined();
    expect(window.localStorage.getItem(LEGACY_CHARACTER_STORAGE_V4_KEY)).toBe(oldRaw);
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(serializeCharacters([migrated]));
  });

  it('migrates v5 through the current v9 representation while preserving its prior state', () => {
    const oldRecord = legacyV5Fighter();
    const oldRaw = JSON.stringify([oldRecord]);
    window.localStorage.setItem(LEGACY_CHARACTER_STORAGE_V5_KEY, oldRaw);

    const [migrated] = loadCharacters();
    expect(migrated.id).toBe(oldRecord.id);
    expect(migrated.name).toBe(oldRecord.name);
    expect(migrated.startingClassId).toBe(oldRecord.classId);
    expect(progressionOf(migrated)).toMatchObject({
      classId: oldRecord.classId,
      level: oldRecord.level,
      skillProficiencies: oldRecord.skillProficiencies,
      hpProgression: oldRecord.hpProgression.map((entry) => (
        entry.method === 'fixed'
          ? { classLevel: entry.level, method: 'fixed' }
          : { classLevel: entry.level, method: 'rolled', roll: entry.roll }
      )),
    });
    expect(migrated.manualFeats).toEqual([]);
    expect(migrated.backgroundId).toBe(srdId('background', 'acolyte'));
    expect(migrated.inventory).toEqual(oldRecord.inventory);
    expect(migrated.currency).toEqual(oldRecord.currency);
    expect(migrated.playState).toEqual({ ...oldRecord.playState, hitDiceRemaining: { 10: oldRecord.playState.hitDiceRemaining } });
    expect(window.localStorage.getItem(LEGACY_CHARACTER_STORAGE_V5_KEY)).toBe(oldRaw);
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(serializeCharacters([migrated]));
  });

  it('rejects malformed current v9 origin state rather than guessing Species or Background choices', () => {
    const valid = createCharacter(fighterInput());
    const malformedSpecies = { ...valid, speciesChoices: { 'draconic-ancestry': 'not-a-dragon' } };
    window.localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify([malformedSpecies]));
    expect(loadCharacters()).toEqual([]);

    const malformedBackground = { ...valid, backgroundAbilityChoice: { mode: 'two-one', plusTwo: 'charisma', plusOne: 'charisma' } };
    window.localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify([malformedBackground]));
    expect(loadCharacters()).toEqual([]);

    const unknownOrigin = { ...valid, speciesId: 'homebrew:missing:species:void' };
    window.localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify([unknownOrigin]));
    expect(loadCharacters()).toEqual([]);

    const invalidFixedSize = { ...valid, speciesSize: 'small' };
    window.localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify([invalidFixedSize]));
    expect(loadCharacters()).toEqual([]);

    const malformedChoiceShape = { ...valid, speciesChoices: [] };
    window.localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify([malformedChoiceShape]));
    expect(loadCharacters()).toEqual([]);

    const partialOrigin = { ...valid, backgroundId: undefined, backgroundAbilityChoice: undefined, backgroundEquipmentChoice: undefined };
    window.localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify([partialOrigin]));
    expect(loadCharacters()).toEqual([]);

    const invalidEquipmentChoice = { ...valid, backgroundEquipmentChoice: 'not-an-option' };
    window.localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify([invalidEquipmentChoice]));
    expect(loadCharacters()).toEqual([]);

    const invalidFixedToolChoice = { ...valid, backgroundToolChoice: 'dice-set' };
    window.localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify([invalidFixedToolChoice]));
    expect(loadCharacters()).toEqual([]);
  });

  it('rejects malformed current v9 Feat ownership and structured choices without repairing them', () => {
    const base = createCharacter(fighterInput());
    const reject = (record: unknown) => {
      window.localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify([record]));
      expect(loadCharacters()).toEqual([]);
      expect(deserializeCharacters(window.localStorage.getItem(CHARACTER_STORAGE_KEY))).toEqual([]);
    };

    reject({ ...base, manualFeats: [{ featId: 'homebrew:missing:feat:void', choices: {} }] });

    reject({
      ...base,
      backgroundId: srdId('background', 'soldier'),
      backgroundAbilityChoice: { mode: 'two-one', plusTwo: 'dexterity', plusOne: 'constitution' },
      backgroundToolChoice: 'dice-set',
      backgroundEquipmentChoice: 'A',
      manualFeats: [{ featId: srdId('feat', 'savage-attacker'), choices: {} }],
    });

    reject({ ...base, manualFeats: [{ featId: srdId('feat', 'ability-score-improvement'), choices: {} }] });
    reject({ ...base, manualFeats: [{ featId: srdId('feat', 'ability-score-improvement'), choices: { 'ability-increase': ['not-an-ability', 'dexterity'] } }] });

    const levelThree = createCharacter(fighterInput({ level: 3 }));
    reject({ ...levelThree, manualFeats: [{ featId: srdId('feat', 'grappler'), choices: { 'ability-increase': ['strength'] } }] });

    reject({ ...base, manualFeats: [{ featId: srdId('feat', 'grappler'), choices: { 'ability-increase': ['intelligence'] } }] });

    const capped = createCharacter(fighterInput({ abilityScores: { strength: 20 } }));
    reject({ ...capped, manualFeats: [{ featId: srdId('feat', 'ability-score-improvement'), choices: { 'ability-increase': ['strength', 'strength'] } }] });

    reject({ ...base, manualFeats: [{ featId: srdId('feat', 'archery'), choices: [] }] });
  });

  it('stores current characters under the v10 key and preserves subclass selection through save/load/edit', () => {
    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v10');
    expect(LEGACY_CHARACTER_STORAGE_V8_KEY).toBe('dnd3.characters.v8');
    const created = createCharacter(fighterInput({ name: 'V10 Champion' }));
    expect(progressionOf(created).subclassId).toBe(CHAMPION_ID);
    expect(created.spellcastingSelections).toEqual([]);
    expect(progressionOf(loadCharacters()[0]).subclassId).toBe(CHAMPION_ID);
    const updated = updateCharacter(created.id, fighterInput({ name: 'V10 Champion Edited' }))!;
    expect(progressionOf(updated).subclassId).toBe(CHAMPION_ID);
    expect(updated.spellcastingSelections).toEqual([]);
    expect(progressionOf(loadCharacters()[0]).subclassId).toBe(CHAMPION_ID);
  });

  it('migrates genuine v8 deterministically through v10 with progression-local class state and a d10 Hit Dice pool', () => {
    const oldRecord = legacyV8Fighter();
    const first = migrateLegacyV8Character(oldRecord);
    const second = migrateLegacyV8Character(structuredClone(oldRecord));
    expect(first).toBeDefined();
    expect(second).toEqual(first);
    if (!first) return;

    expect(first.id).toBe(oldRecord.id);
    expect(first.createdAt).toBe(oldRecord.createdAt);
    expect(first.updatedAt).toBe(oldRecord.updatedAt);
    expect(first.startingClassId).toBe(oldRecord.classId);
    expect(first.classProgressions).toHaveLength(1);
    expect(progressionOf(first)).toEqual({
      classId: oldRecord.classId,
      level: oldRecord.level,
      subclassId: oldRecord.subclassId,
      skillProficiencies: oldRecord.skillProficiencies,
      skillExpertise: [],
      weaponMasterySelections: [],
      hpProgression: oldRecord.hpProgression.map((entry) => (
        entry.method === 'fixed'
          ? { classLevel: entry.level, method: 'fixed' }
          : { classLevel: entry.level, method: 'rolled', roll: entry.roll }
      )),
    });
    expect(first.speciesId).toBe(oldRecord.speciesId);
    expect(first.backgroundId).toBe(oldRecord.backgroundId);
    expect(first.manualFeats).toEqual(oldRecord.manualFeats);
    expect(first.spellcastingSelections).toEqual(oldRecord.spellcastingSelections);
    expect(first.abilityScores).toEqual(oldRecord.abilityScores);
    expect(first.inventory).toEqual(oldRecord.inventory);
    expect(first.currency).toEqual(oldRecord.currency);
    expect(first.playState).toEqual({ ...oldRecord.playState, hitDiceRemaining: { 10: oldRecord.playState.hitDiceRemaining } });

    const oldRaw = JSON.stringify([oldRecord]);
    window.localStorage.setItem(LEGACY_CHARACTER_STORAGE_V8_KEY, oldRaw);
    const [loaded] = loadCharacters();
    expect(loaded).toEqual(first);
    expect(window.localStorage.getItem(LEGACY_CHARACTER_STORAGE_V8_KEY)).toBe(oldRaw);
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(serializeCharacters([first]));
    const persisted = JSON.parse(window.localStorage.getItem(CHARACTER_STORAGE_KEY)!)[0];
    expect(persisted.classId).toBeUndefined();
    expect(persisted.level).toBeUndefined();
    expect(persisted.subclassId).toBeUndefined();
    expect(persisted.skillProficiencies).toBeUndefined();
    expect(persisted.hpProgression).toBeUndefined();
  });

  it('migrates v7 through v10 by adding only the historically missing and approved additive fields', () => {
    const oldRecord = legacyV7Fighter();
    const oldRaw = JSON.stringify([oldRecord]);
    window.localStorage.setItem(LEGACY_CHARACTER_STORAGE_V7_KEY, oldRaw);

    const [migrated] = loadCharacters();
    expect(migrated.id).toBe(oldRecord.id);
    expect(migrated.createdAt).toBe(oldRecord.createdAt);
    expect(migrated.updatedAt).toBe(oldRecord.updatedAt);
    expect(migrated.startingClassId).toBe(oldRecord.classId);
    expect(progressionOf(migrated)).toEqual({
      classId: oldRecord.classId,
      level: oldRecord.level,
      subclassId: oldRecord.subclassId,
      skillProficiencies: oldRecord.skillProficiencies,
      skillExpertise: [],
      weaponMasterySelections: [],
      hpProgression: oldRecord.hpProgression.map((entry) => (
        entry.method === 'fixed'
          ? { classLevel: entry.level, method: 'fixed' }
          : { classLevel: entry.level, method: 'rolled', roll: entry.roll }
      )),
    });
    expect(migrated.speciesId).toBe(oldRecord.speciesId);
    expect(migrated.backgroundId).toBe(oldRecord.backgroundId);
    expect(migrated.manualFeats).toEqual(oldRecord.manualFeats);
    expect(migrated.abilityScores).toEqual(oldRecord.abilityScores);
    expect(migrated.inventory).toEqual(oldRecord.inventory);
    expect(migrated.currency).toEqual(oldRecord.currency);
    expect(migrated.playState).toEqual({ ...oldRecord.playState, hitDiceRemaining: { 10: oldRecord.playState.hitDiceRemaining } });
    expect(migrated.spellcastingSelections).toEqual([]);
    expect(window.localStorage.getItem(LEGACY_CHARACTER_STORAGE_V7_KEY)).toBe(oldRaw);
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(serializeCharacters([migrated]));
  });

  it('filters malformed v7 records without guessing or silently repairing their build state', () => {
    const valid = legacyV7Fighter();
    const malformed = { ...valid, inventory: [{ ...valid.inventory[0], quantity: 0 }] };
    window.localStorage.setItem(LEGACY_CHARACTER_STORAGE_V7_KEY, JSON.stringify([malformed, valid]));
    const migrated = loadCharacters();
    expect(migrated).toHaveLength(1);
    expect(migrated[0].id).toBe(valid.id);
    expect(migrated[0].spellcastingSelections).toEqual([]);
  });

  it('migrates v6 through current v10 without fabricating Champion and preserves all M8 state', () => {
    const oldRecord = legacyV6Fighter();
    const oldRaw = JSON.stringify([oldRecord]);
    window.localStorage.setItem(LEGACY_CHARACTER_STORAGE_V6_KEY, oldRaw);
    const [migrated] = loadCharacters();
    expect(migrated.id).toBe(oldRecord.id);
    expect(migrated.name).toBe(oldRecord.name);
    expect(migrated.startingClassId).toBe(oldRecord.classId);
    expect(progressionOf(migrated)).toEqual({
      classId: oldRecord.classId,
      level: oldRecord.level,
      skillProficiencies: oldRecord.skillProficiencies,
      skillExpertise: [],
      weaponMasterySelections: [],
      hpProgression: oldRecord.hpProgression.map((entry) => (
        entry.method === 'fixed'
          ? { classLevel: entry.level, method: 'fixed' }
          : { classLevel: entry.level, method: 'rolled', roll: entry.roll }
      )),
    });
    expect(progressionOf(migrated).subclassId).toBeUndefined();
    expect(migrated.manualFeats).toEqual(oldRecord.manualFeats);
    expect(migrated.speciesId).toBe(oldRecord.speciesId);
    expect(migrated.backgroundId).toBe(oldRecord.backgroundId);
    expect(migrated.inventory).toEqual(oldRecord.inventory);
    expect(migrated.currency).toEqual(oldRecord.currency);
    expect(migrated.playState).toEqual({ ...oldRecord.playState, hitDiceRemaining: { 10: oldRecord.playState.hitDiceRemaining } });
    expect(migrated.createdAt).toBe(oldRecord.createdAt);
    expect(migrated.updatedAt).toBe(oldRecord.updatedAt);
    expect(window.localStorage.getItem(LEGACY_CHARACTER_STORAGE_V6_KEY)).toBe(oldRaw);
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(serializeCharacters([migrated]));
  });

  it('supports migration from every v1-v7 legacy key into current v9 without fabricating missing subclasses', () => {
    const cases: Array<[string, unknown, string | undefined]> = [
      [LEGACY_CHARACTER_STORAGE_KEY, legacyFighter(), undefined],
      [LEGACY_CHARACTER_STORAGE_V2_KEY, legacyV2Fighter(), undefined],
      [LEGACY_CHARACTER_STORAGE_V3_KEY, legacyV3Fighter(), undefined],
      [LEGACY_CHARACTER_STORAGE_V4_KEY, legacyV4Fighter(), undefined],
      [LEGACY_CHARACTER_STORAGE_V5_KEY, legacyV5Fighter(), undefined],
      [LEGACY_CHARACTER_STORAGE_V6_KEY, legacyV6Fighter(), undefined],
      [LEGACY_CHARACTER_STORAGE_V7_KEY, legacyV7Fighter(), CHAMPION_ID],
    ];
    for (const [key, record, expectedSubclassId] of cases) {
      window.localStorage.clear();
      const raw = JSON.stringify([record]);
      window.localStorage.setItem(key, raw);
      const [migrated] = loadCharacters();
      expect(migrated).toBeDefined();
      expect(migrated.classProgressions).toHaveLength(1);
      expect(migrated.startingClassId).toBe(progressionOf(migrated).classId);
      expect(progressionOf(migrated).subclassId).toBe(expectedSubclassId);
      expect(window.localStorage.getItem(key)).toBe(raw);
      expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).not.toBeNull();
    }
  });

  it('rejects malformed current-v9 progression-local subclass state while accepting the deliberate migrated unresolved sentinel', () => {
    const valid = createCharacter(fighterInput());
    const validProgression = progressionOf(valid);
    const reject = (record: unknown) => {
      window.localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify([record]));
      expect(loadCharacters()).toEqual([]);
    };
    reject({ ...valid, classProgressions: [{ ...validProgression, subclassId: 42 }] });
    reject({ ...valid, classProgressions: [{ ...validProgression, subclassId: 'homebrew:missing:subclass:void' }] });

    const levelTwo = fighterCharacter({ level: 2, subclassId: undefined });
    reject({ ...levelTwo, classProgressions: [{ ...progressionOf(levelTwo), subclassId: CHAMPION_ID }] });

    window.localStorage.clear();
    const legacyRaw = JSON.stringify([legacyV6Fighter()]);
    window.localStorage.setItem(LEGACY_CHARACTER_STORAGE_V6_KEY, legacyRaw);
    const [unresolved] = loadCharacters();
    expect(progressionOf(unresolved).subclassId).toBeUndefined();
    expect(loadCharacters()).toEqual([unresolved]);
  });

  it('keeps only the narrow unresolved-legacy edit allowance and requires subclass when crossing the threshold normally', () => {
    window.localStorage.setItem(LEGACY_CHARACTER_STORAGE_V6_KEY, JSON.stringify([legacyV6Fighter()]));
    const [legacy] = loadCharacters();
    const { id: _legacyId, playState: _legacyPlayState, createdAt: _legacyCreatedAt, updatedAt: _legacyUpdatedAt, ...legacyInput } = legacy;
    void _legacyId;
    void _legacyPlayState;
    void _legacyCreatedAt;
    void _legacyUpdatedAt;
    const legacyEdited = updateCharacter(
      legacy.id,
      completeCharacterV10Choices({ ...legacyInput, name: 'Legacy unrelated edit' }),
    )!;
    expect(legacyEdited.name).toBe('Legacy unrelated edit');
    expect(progressionOf(legacyEdited).subclassId).toBeUndefined();
    expect(progressionOf(legacyEdited).weaponMasterySelections).toHaveLength(4);

    window.localStorage.clear();
    const levelTwo = createCharacter(fighterInput({ level: 2, subclassId: undefined }));
    expect(() => updateCharacter(levelTwo.id, fighterInput({ level: 3, subclassId: undefined }))).toThrow(/invalid character/i);
    const promoted = updateCharacter(levelTwo.id, fighterInput({ level: 3, subclassId: CHAMPION_ID }))!;
    expect(progressionOf(promoted).subclassId).toBe(CHAMPION_ID);
  });

  it('does not guess a class for unknown legacy class names', () => {
    expect(migrateLegacyCharacter(legacyFighter({ class: 'Wizard' }))).toBeUndefined();
    window.localStorage.setItem(LEGACY_CHARACTER_STORAGE_KEY, JSON.stringify([legacyFighter({ class: 'Mystery Knight' })]));
    expect(loadCharacters()).toEqual([]);
  });
});
