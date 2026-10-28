import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createCharacter } from '../src/services/characterStorage';
import { fighterInput } from '../src/test/fixtures';
import {
  LEGACY_PROJECT_CHARACTERS_V9_RELATIVE_PATH,
  PROJECT_CHARACTERS_RELATIVE_PATH,
  ProjectStore,
} from './projectStore';

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key) { return values.get(key) ?? null; },
    key(index) { return [...values.keys()][index] ?? null; },
    removeItem(key) { values.delete(key); },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

function v10Character() {
  const input = fighterInput();
  input.classProgressions[0].weaponMasterySelections = [
    'srd-5.2.1:weapon:dagger',
    'srd-5.2.1:weapon:light-crossbow',
    'srd-5.2.1:weapon:scimitar',
    'srd-5.2.1:weapon:shortsword',
  ];
  return createCharacter(input, memoryStorage());
}

function v9Character() {
  const current = JSON.parse(JSON.stringify(v10Character()));
  const { languageChoices: _languages, ...legacy } = current;
  void _languages;
  return {
    ...legacy,
    classProgressions: current.classProgressions.map(({ skillExpertise: _expertise, weaponMasterySelections: _masteries, ...progression }) => {
      void _expertise;
      void _masteries;
      return progression;
    }),
  };
}

async function writeStore(root, relativePath, value) {
  const path = resolve(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value), 'utf8');
  return path;
}

describe('Character v10 project store foundation', () => {
  let root;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'dnd3-character-v10-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('uses characters.v10.json as project authority and preserves the v9 path as legacy', () => {
    const store = new ProjectStore(root);
    expect(PROJECT_CHARACTERS_RELATIVE_PATH).toBe('.dnd3/characters/characters.v10.json');
    expect(LEGACY_PROJECT_CHARACTERS_V9_RELATIVE_PATH).toBe('.dnd3/characters/characters.v9.json');
    expect(store.charactersPath).toBe(resolve(root, PROJECT_CHARACTERS_RELATIVE_PATH));
    expect(store.legacyCharactersV9Path).toBe(resolve(root, LEGACY_PROJECT_CHARACTERS_V9_RELATIVE_PATH));
  });

  it('converts a v9-only project in memory for inspection without creating v10', async () => {
    const legacy = v9Character();
    const legacyPath = await writeStore(root, LEGACY_PROJECT_CHARACTERS_V9_RELATIVE_PATH, [legacy]);
    const state = await new ProjectStore(root).readState();

    expect(state.characterMigrationRequired).toBe(true);
    expect(state.characters).toEqual([{
      ...legacy,
      languageChoices: [],
      classProgressions: legacy.classProgressions.map((progression) => ({
        ...progression,
        skillExpertise: [],
        weaponMasterySelections: [],
      })),
    }]);
    await expect(readFile(resolve(root, PROJECT_CHARACTERS_RELATIVE_PATH), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(JSON.parse(await readFile(legacyPath, 'utf8'))).toEqual([legacy]);
  });

  it('prefers v10 when both v10 and v9 exist', async () => {
    const legacy = v9Character();
    const current = { ...v10Character(), id: 'v10-authority', name: 'V10 Authority' };
    await writeStore(root, LEGACY_PROJECT_CHARACTERS_V9_RELATIVE_PATH, [legacy]);
    await writeStore(root, PROJECT_CHARACTERS_RELATIVE_PATH, [current]);

    const state = await new ProjectStore(root).readState();
    expect(state.characterMigrationRequired).toBe(false);
    expect(state.characters).toEqual([current]);
  });

  it('fails Character mutation closed while only v9 exists', async () => {
    await writeStore(root, LEGACY_PROJECT_CHARACTERS_V9_RELATIVE_PATH, [v9Character()]);
    const store = new ProjectStore(root);
    const state = await store.readState();
    await expect(store.putCharacters(state.characters, state.characterRevision, state.contentRevision))
      .rejects.toMatchObject({ code: 'character-migration-required' });
  });

  it('explicitly migrates v9 to v10, preserves v9 bytes, and restarts from v10', async () => {
    const legacy = v9Character();
    const legacyRaw = JSON.stringify([legacy]);
    const legacyPath = resolve(root, LEGACY_PROJECT_CHARACTERS_V9_RELATIVE_PATH);
    await mkdir(dirname(legacyPath), { recursive: true });
    await writeFile(legacyPath, legacyRaw, 'utf8');

    const store = new ProjectStore(root);
    const before = await store.readState();
    const migrated = await store.putMigration(
      before.content,
      before.characters,
      before.contentRevision,
      before.characterRevision,
    );

    expect(migrated.characterMigrationRequired).toBe(false);
    expect(await readFile(legacyPath, 'utf8')).toBe(legacyRaw);
    expect(JSON.parse(await readFile(resolve(root, PROJECT_CHARACTERS_RELATIVE_PATH), 'utf8'))).toEqual(before.characters);
    const restarted = await new ProjectStore(root).readState();
    expect(restarted.characterMigrationRequired).toBe(false);
    expect(restarted.characters).toEqual(before.characters);
  });

  it('rejects stale explicit migration and is idempotent after success', async () => {
    await writeStore(root, LEGACY_PROJECT_CHARACTERS_V9_RELATIVE_PATH, [v9Character()]);
    const store = new ProjectStore(root);
    const before = await store.readState();
    await expect(store.putMigration(before.content, before.characters, before.contentRevision, '"stale"'))
      .rejects.toMatchObject({ code: 'stale-characters' });

    const first = await store.putMigration(before.content, before.characters, before.contentRevision, before.characterRevision);
    const second = await store.putMigration(first.content, first.characters, first.contentRevision, first.characterRevision);
    expect(second.characterRevision).toBe(first.characterRevision);
    expect(second.characters).toEqual(first.characters);
  });
});
