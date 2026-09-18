import { describe, expect, it, vi } from 'vitest';
import { FIGHTER_ACTION_SURGE_RESOURCE_ID, FIGHTER_SECOND_WIND_RESOURCE_ID } from '../content/srd/fighter';
import { srdId } from '../content/srd';
import type { CharacterInput } from '../models/character';
import { CHAMPION_ID, fighterCharacter, fighterInput, fullFighter4PlayState } from '../test/fixtures';
import {
  CHARACTER_STORAGE_KEY,
  LEGACY_CHARACTER_STORAGE_KEY,
  LEGACY_CHARACTER_STORAGE_V2_KEY,
  LEGACY_CHARACTER_STORAGE_V3_KEY,
  LEGACY_CHARACTER_STORAGE_V4_KEY,
  LEGACY_CHARACTER_STORAGE_V5_KEY,
  LEGACY_CHARACTER_STORAGE_V6_KEY,
  LEGACY_CHARACTER_STORAGE_V7_KEY,
  createCharacter,
  deleteCharacter,
  deserializeCharacters,
  loadCharacters,
  migrateLegacyCharacter,
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

function legacyV5Fighter() {
  const { manualFeats, subclassId, ...legacy } = fighterCharacter({
    name: 'Milestone Seven',
    inventory: [{ id: 'legacy-v5-scimitar', kind: 'registry', contentId: srdId('weapon', 'scimitar'), category: 'weapon', quantity: 1, equipped: true, notes: 'v5 note', attackAbilityChoice: 'dexterity' }],
    currency: { gp: 17 },
    playState: fullFighter4PlayState({ currentHp: 22, temporaryHp: 4, hitDiceRemaining: 2 }),
  });
  void manualFeats; void subclassId;
  return legacy;
}

function legacyV6Fighter() {
  const { subclassId, ...legacy } = fighterCharacter({
    name: 'Milestone Eight',
    manualFeats: [{ featId: srdId('feat', 'archery'), choices: {} }],
    inventory: [{ id: 'legacy-v6-scimitar', kind: 'registry', contentId: srdId('weapon', 'scimitar'), category: 'weapon', quantity: 1, equipped: true, notes: 'v6 note', attackAbilityChoice: 'dexterity' }],
    currency: { cp: 2, sp: 3, gp: 19 },
    playState: fullFighter4PlayState({ currentHp: 20, temporaryHp: 5, hitDiceRemaining: 2, resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 1, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 0 } }),
  });
  void subclassId;
  return legacy;
}

function legacyV7Fighter() {
  const { spellcastingSelections, ...legacy } = fighterCharacter({
    name: 'Milestone Twelve D',
    manualFeats: [{ featId: srdId('feat', 'archery'), choices: {} }],
    inventory: [{ id: 'legacy-v7-scimitar', kind: 'registry', contentId: srdId('weapon', 'scimitar'), category: 'weapon', quantity: 2, equipped: true, notes: 'v7 inventory must remain untouched', attackAbilityChoice: 'dexterity' }],
    currency: { cp: 7, sp: 8, ep: 1, gp: 29, pp: 2 },
    playState: fullFighter4PlayState({ currentHp: 17, temporaryHp: 6, hitDiceRemaining: 2, resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 1, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 0 } }),
  });
  void spellcastingSelections;
  return legacy;
}

const zeroCurrency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

describe('character persistence', () => {
  it('serializes, stores, and restores a created v5 character with mutable play state', () => {
    const created = createCharacter(makeInput());
    const raw = window.localStorage.getItem(CHARACTER_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(deserializeCharacters(raw)).toEqual([created]);
    expect(loadCharacters()).toEqual([created]);
    expect(serializeCharacters([created])).toBe(raw);
    expect(created.playState).toMatchObject({ currentHp: 28, temporaryHp: 0, hitDiceRemaining: 3 });
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
    expect(created.classId).toBe(srdId('class', 'fighter'));
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
    expect(updated?.level).toBe(5);
    expect(updated?.hpProgression).toHaveLength(4);
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
    updateCharacterPlayState(created.id, { ...created.playState, hitDiceRemaining: 1, resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 1, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 0 } });
    const leveled = updateCharacter(created.id, fighterInput({ level: 4 }))!;
    expect(leveled.playState.hitDiceRemaining).toBe(2);
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
      id: 'legacy-fighter', name: 'Legacy Fighter', classId: srdId('class', 'fighter'), level: 4,
      abilityScores: { strength: 14, dexterity: 18, constitution: 14, intelligence: 10, wisdom: 12, charisma: 12 },
      speciesChoices: {}, speciesSkillProficiencies: [], manualFeats: [], spellcastingSelections: [],
      skillProficiencies: [], inventory: [], currency: zeroCurrency,
      hpProgression: [{ level: 2, method: 'fixed' }, { level: 3, method: 'fixed' }, { level: 4, method: 'fixed' }],
      playState: { currentHp: 36, temporaryHp: 0, hitDiceRemaining: 4, resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 3, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 1 } },
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
    expect(migrated.hpProgression).toEqual([{ level: 2, method: 'fixed' }, { level: 3, method: 'fixed' }, { level: 4, method: 'fixed' }]);
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
      classId: oldRecord.classId,
      level: oldRecord.level,
      abilityScores: oldRecord.abilityScores,
      skillProficiencies: oldRecord.skillProficiencies,
      inventory: oldRecord.inventory,
      currency: oldRecord.currency,
      hpProgression: oldRecord.hpProgression,
      playState: oldRecord.playState,
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

  it('migrates v5 directly to v6 by adding only an empty manual Feat list', () => {
    const oldRecord = legacyV5Fighter();
    const oldRaw = JSON.stringify([oldRecord]);
    window.localStorage.setItem(LEGACY_CHARACTER_STORAGE_V5_KEY, oldRaw);

    const [migrated] = loadCharacters();
    expect(migrated).toMatchObject(oldRecord);
    expect(migrated.manualFeats).toEqual([]);
    expect(migrated.backgroundId).toBe(srdId('background', 'acolyte'));
    expect(migrated.inventory).toEqual(oldRecord.inventory);
    expect(migrated.currency).toEqual(oldRecord.currency);
    expect(migrated.playState).toEqual(oldRecord.playState);
    expect(window.localStorage.getItem(LEGACY_CHARACTER_STORAGE_V5_KEY)).toBe(oldRaw);
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(serializeCharacters([migrated]));
  });

  it('maintains supported migration coverage from v1 through v5 into the current v6 key', () => {
    const v3 = {
      ...legacyV2Fighter(),
      id: 'legacy-v3-fighter',
      hpProgression: [{ level: 2, method: 'fixed' }, { level: 3, method: 'fixed' }, { level: 4, method: 'fixed' }],
      playState: fullFighter4PlayState({ currentHp: 25 }),
    };
    const cases: Array<[string, unknown, boolean]> = [
      [LEGACY_CHARACTER_STORAGE_KEY, legacyFighter(), false],
      [LEGACY_CHARACTER_STORAGE_V2_KEY, legacyV2Fighter(), false],
      [LEGACY_CHARACTER_STORAGE_V3_KEY, v3, false],
      [LEGACY_CHARACTER_STORAGE_V4_KEY, legacyV4Fighter(), false],
      [LEGACY_CHARACTER_STORAGE_V5_KEY, legacyV5Fighter(), true],
    ];

    for (const [key, record, hasOrigin] of cases) {
      window.localStorage.clear();
      window.localStorage.setItem(key, JSON.stringify([record]));
      const migrated = loadCharacters();
      expect(migrated).toHaveLength(1);
      expect(migrated[0].manualFeats).toEqual([]);
      if (hasOrigin) {
        expect(migrated[0].speciesId).toBe(srdId('species', 'dragonborn'));
        expect(migrated[0].backgroundId).toBe(srdId('background', 'acolyte'));
      } else {
        expect(migrated[0].speciesId).toBeUndefined();
        expect(migrated[0].backgroundId).toBeUndefined();
        expect(migrated[0].speciesChoices).toEqual({});
        expect(migrated[0].speciesSkillProficiencies).toEqual([]);
      }
      expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).not.toBeNull();
      expect(window.localStorage.getItem(key)).not.toBeNull();
    }
  });

  it('rejects malformed current v6 origin state rather than guessing Species or Background choices', () => {
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

  it('rejects malformed current v6 Feat ownership and structured choices without repairing them', () => {
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

  it('stores current characters under the v8 key and preserves subclass selection through save/load/edit', () => {
    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v8');
    expect(LEGACY_CHARACTER_STORAGE_V7_KEY).toBe('dnd3.characters.v7');
    const created = createCharacter(fighterInput({ name: 'V8 Champion' }));
    expect(created.subclassId).toBe(CHAMPION_ID);
    expect(created.spellcastingSelections).toEqual([]);
    expect(loadCharacters()[0].subclassId).toBe(CHAMPION_ID);
    const updated = updateCharacter(created.id, fighterInput({ name: 'V8 Champion Edited' }))!;
    expect(updated.subclassId).toBe(CHAMPION_ID);
    expect(updated.spellcastingSelections).toEqual([]);
    expect(loadCharacters()[0].subclassId).toBe(CHAMPION_ID);
  });

  it('migrates v7 directly to v8 by adding only empty provider spell selections and preserving all prior state', () => {
    const oldRecord = legacyV7Fighter();
    const oldRaw = JSON.stringify([oldRecord]);
    window.localStorage.setItem(LEGACY_CHARACTER_STORAGE_V7_KEY, oldRaw);

    const [migrated] = loadCharacters();
    expect(migrated).toBeDefined();
    expect(migrated.id).toBe(oldRecord.id);
    expect(migrated.createdAt).toBe(oldRecord.createdAt);
    expect(migrated.updatedAt).toBe(oldRecord.updatedAt);
    expect(migrated.classId).toBe(oldRecord.classId);
    expect(migrated.subclassId).toBe(oldRecord.subclassId);
    expect(migrated.speciesId).toBe(oldRecord.speciesId);
    expect(migrated.backgroundId).toBe(oldRecord.backgroundId);
    expect(migrated.manualFeats).toEqual(oldRecord.manualFeats);
    expect(migrated.abilityScores).toEqual(oldRecord.abilityScores);
    expect(migrated.skillProficiencies).toEqual(oldRecord.skillProficiencies);
    expect(migrated.inventory).toEqual(oldRecord.inventory);
    expect(migrated.currency).toEqual(oldRecord.currency);
    expect(migrated.hpProgression).toEqual(oldRecord.hpProgression);
    expect(migrated.playState).toEqual(oldRecord.playState);
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

  it('migrates v6 through the current v8 path without fabricating Champion and preserves all M8 state', () => {
    const oldRecord = legacyV6Fighter();
    const oldRaw = JSON.stringify([oldRecord]);
    window.localStorage.setItem(LEGACY_CHARACTER_STORAGE_V6_KEY, oldRaw);
    const [migrated] = loadCharacters();
    expect(migrated).toMatchObject(oldRecord);
    expect(migrated.subclassId).toBeUndefined();
    expect(migrated.manualFeats).toEqual(oldRecord.manualFeats);
    expect(migrated.speciesId).toBe(oldRecord.speciesId);
    expect(migrated.backgroundId).toBe(oldRecord.backgroundId);
    expect(migrated.inventory).toEqual(oldRecord.inventory);
    expect(migrated.currency).toEqual(oldRecord.currency);
    expect(migrated.hpProgression).toEqual(oldRecord.hpProgression);
    expect(migrated.playState).toEqual(oldRecord.playState);
    expect(migrated.id).toBe(oldRecord.id);
    expect(migrated.createdAt).toBe(oldRecord.createdAt);
    expect(migrated.updatedAt).toBe(oldRecord.updatedAt);
    expect(window.localStorage.getItem(LEGACY_CHARACTER_STORAGE_V6_KEY)).toBe(oldRaw);
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(serializeCharacters([migrated]));
  });

  it('supports migration from every pre-v7 legacy key into current v8 without fabricating subclasses', () => {
    const v3 = { ...legacyV2Fighter(), id: 'legacy-v3-fighter', hpProgression: [{ level: 2, method: 'fixed' }, { level: 3, method: 'fixed' }, { level: 4, method: 'fixed' }], playState: fullFighter4PlayState({ currentHp: 25 }) };
    const cases: Array<[string, unknown]> = [
      [LEGACY_CHARACTER_STORAGE_KEY, legacyFighter()], [LEGACY_CHARACTER_STORAGE_V2_KEY, legacyV2Fighter()], [LEGACY_CHARACTER_STORAGE_V3_KEY, v3],
      [LEGACY_CHARACTER_STORAGE_V4_KEY, legacyV4Fighter()], [LEGACY_CHARACTER_STORAGE_V5_KEY, legacyV5Fighter()], [LEGACY_CHARACTER_STORAGE_V6_KEY, legacyV6Fighter()],
    ];
    for (const [key, record] of cases) {
      window.localStorage.clear();
      const raw = JSON.stringify([record]);
      window.localStorage.setItem(key, raw);
      const [migrated] = loadCharacters();
      expect(migrated).toBeDefined();
      expect(migrated.subclassId).toBeUndefined();
      expect(window.localStorage.getItem(key)).toBe(raw);
      expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).not.toBeNull();
    }
  });

  it('rejects malformed current-v8 subclass state without silent repair while accepting the deliberate absent legacy sentinel', () => {
    const valid = createCharacter(fighterInput());
    const reject = (record: unknown) => { window.localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify([record])); expect(loadCharacters()).toEqual([]); };
    reject({ ...valid, subclassId: 42 });
    reject({ ...valid, subclassId: 'homebrew:missing:subclass:void' });
    reject({ ...valid, level: 2, hpProgression: [{ level: 2, method: 'fixed' }], subclassId: CHAMPION_ID });
    const { subclassId, ...unresolved } = valid;
    void subclassId;
    window.localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify([unresolved]));
    expect(loadCharacters()[0].subclassId).toBeUndefined();
  });

  it('keeps only the narrow unresolved-legacy edit allowance and requires subclass when crossing the threshold normally', () => {
    window.localStorage.setItem(LEGACY_CHARACTER_STORAGE_V6_KEY, JSON.stringify([legacyV6Fighter()]));
    const [legacy] = loadCharacters();
    const legacyEdited = updateCharacter(legacy.id, { ...legacy, name: 'Legacy unrelated edit' })!;
    expect(legacyEdited.name).toBe('Legacy unrelated edit');
    expect(legacyEdited.subclassId).toBeUndefined();

    window.localStorage.clear();
    const levelTwo = createCharacter(fighterInput({ level: 2, subclassId: undefined }));
    expect(() => updateCharacter(levelTwo.id, fighterInput({ level: 3, subclassId: undefined }))).toThrow(/invalid character/i);
    const promoted = updateCharacter(levelTwo.id, fighterInput({ level: 3, subclassId: CHAMPION_ID }))!;
    expect(promoted.subclassId).toBe(CHAMPION_ID);
  });

  it('does not guess a class for unknown legacy class names', () => {
    expect(migrateLegacyCharacter(legacyFighter({ class: 'Wizard' }))).toBeUndefined();
    window.localStorage.setItem(LEGACY_CHARACTER_STORAGE_KEY, JSON.stringify([legacyFighter({ class: 'Mystery Knight' })]));
    expect(loadCharacters()).toEqual([]);
  });
});
