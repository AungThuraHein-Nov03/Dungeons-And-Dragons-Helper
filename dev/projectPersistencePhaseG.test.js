import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { join, resolve } from 'node:path';
import { createContentRegistry } from '../src/services/contentRegistry';
import { createCharacter } from '../src/services/characterStorage';
import { fighterInput } from '../src/test/fixtures';
import {
  LEGACY_CONTENT_EXPORT_RELATIVE_PATH,
  ProjectStore,
} from './projectStore';
import {
  PROJECT_LEGACY_CONTENT_EXPORT_ROUTE,
  PROJECT_MIGRATION_ROUTE,
  createProjectPersistenceMiddleware,
} from './projectPersistencePlugin';

const EK_ID = 'homebrew:local:subclass:abf1d7a2-e4fc-4c4b-9c23-02e87b77758f';
const FEAT_ID = 'homebrew:local:feat:phase-g-imported-feat';

function feat(name = 'Phase G Feat') {
  return {
    id: FEAT_ID,
    kind: 'feat',
    name,
    source: { type: 'homebrew', namespace: 'local' },
    category: 'general',
    prerequisites: [],
    repeatable: false,
    choices: [],
    effects: [],
    referenceEffects: [],
    description: 'Phase G migration fixture.',
  };
}

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

function character(content = [], patch = {}) {
  return createCharacter(fighterInput(patch), memoryStorage(), createContentRegistry(content));
}

const realFs = { readFile, mkdir, writeFile, rename, unlink };

async function startHttp(store) {
  const middleware = createProjectPersistenceMiddleware(store);
  const server = createServer((req, res) => {
    void middleware(req, res, () => {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: { code: 'fallthrough' } }));
    });
  });
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  return server;
}

function httpRequest(server, path, { method = 'GET', headers = {}, body } = {}) {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not expose a TCP port.');
  return new Promise((resolvePromise, rejectPromise) => {
    const req = request({
      host: '127.0.0.1',
      port: address.port,
      path,
      method,
      headers,
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let json;
        try { json = raw ? JSON.parse(raw) : undefined; } catch { json = undefined; }
        resolvePromise({ status: res.statusCode, json, raw });
      });
    });
    req.on('error', rejectPromise);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function migrationHeaders(contentRevision, characterRevision) {
  return {
    'content-type': 'application/json',
    'if-match': contentRevision,
    'x-dnd3-characters-if-match': characterRevision,
  };
}

describe('Project Persistence Phase G server transaction', () => {
  let root;
  const servers = [];

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'dnd3-phase-g-'));
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise((resolvePromise) => server.close(resolvePromise))));
    await rm(root, { recursive: true, force: true });
  });

  it('S1. real exported EK fixture parses as canonical content and preserves exact ID', async () => {
    const store = new ProjectStore(process.cwd());
    const entries = await store.readLegacyContentExport();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(EK_ID);
    expect(entries[0].name).toBe('Eldritch Knight');
  });

  it('S2. real exported EK fixture bytes remain unchanged and semantic slotPool mismatch remains present', async () => {
    const path = resolve(process.cwd(), LEGACY_CONTENT_EXPORT_RELATIVE_PATH);
    const raw = await readFile(path, 'utf8');
    expect(createHash('sha256').update(raw).digest('hex')).toBe('2a764f941805bd82ba0932a5b1f7a558d6313461635cbaf2c74f14ba9bc8d6db');
    const [ek] = JSON.parse(raw);
    const provider = ek.progression[0].features[0].spellcasting[0];
    expect(provider.slotPool.slotLevels.map((row) => row.spellLevel)).toEqual([1, 2, 3]);
    expect(ek.progression[0].features[0].referenceEffects[0].description).toContain('1 fourth-level slot');
  });

  it('S3. combined migration validates Character against content imported in the same transaction', async () => {
    const store = new ProjectStore(root);
    const before = await store.readState();
    const importedFeat = feat();
    const importedCharacter = character([importedFeat], { manualFeats: [{ featId: importedFeat.id, choices: {} }] });
    const after = await store.putMigration([importedFeat], [importedCharacter], before.contentRevision, before.characterRevision);
    expect(after.content[0].id).toBe(importedFeat.id);
    expect(after.characters[0].manualFeats[0].featId).toBe(importedFeat.id);
  });

  it('S4. combined migration advances both revisions when both stores change', async () => {
    const store = new ProjectStore(root);
    const before = await store.readState();
    const after = await store.putMigration([feat()], [character()], before.contentRevision, before.characterRevision);
    expect(after.contentRevision).not.toBe(before.contentRevision);
    expect(after.characterRevision).not.toBe(before.characterRevision);
  });

  it('S5. stale content revision fails closed', async () => {
    const store = new ProjectStore(root);
    const before = await store.readState();
    await expect(store.putMigration([], [], '"stale"', before.characterRevision)).rejects.toMatchObject({ code: 'stale-content' });
    expect(await store.readState()).toMatchObject({ content: [], characters: [] });
  });

  it('S6. stale Character revision fails closed', async () => {
    const store = new ProjectStore(root);
    const before = await store.readState();
    await expect(store.putMigration([], [], before.contentRevision, '"stale"')).rejects.toMatchObject({ code: 'stale-characters' });
    expect(await store.readState()).toMatchObject({ content: [], characters: [] });
  });

  it('S7. migration may not overwrite existing content with the same ID and different data', async () => {
    const store = new ProjectStore(root);
    const initial = await store.readState();
    const seeded = await store.putContent([feat('Original')], initial.contentRevision, initial.characterRevision);
    await expect(store.putMigration([feat('Changed')], [], seeded.contentRevision, seeded.characterRevision))
      .rejects.toMatchObject({ code: 'invalid-content' });
    expect((await store.readState()).content[0].name).toBe('Original');
  });

  it('S8. migration may not overwrite an existing Character with the same ID and different data', async () => {
    const original = character();
    const store = new ProjectStore(root);
    const initial = await store.readState();
    const seeded = await store.putCharacters([original], initial.characterRevision, initial.contentRevision);
    const changed = { ...original, name: 'Changed' };
    await expect(store.putMigration([], [changed], seeded.contentRevision, seeded.characterRevision))
      .rejects.toMatchObject({ code: 'invalid-content' });
    expect((await store.readState()).characters[0].name).toBe(original.name);
  });

  it('S9. Character write failure rolls back a preceding content addition', async () => {
    let failedCharacterWrite = false;
    const failingFs = {
      ...realFs,
      writeFile: async (path, data, encoding) => {
        if (!failedCharacterWrite && String(path).includes(resolve(root, '.dnd3', 'characters'))) {
          failedCharacterWrite = true;
          throw new Error('simulated Character write failure');
        }
        return writeFile(path, data, encoding);
      },
    };
    const store = new ProjectStore(root, failingFs);
    const before = await store.readState();
    await expect(store.putMigration([feat()], [character()], before.contentRevision, before.characterRevision))
      .rejects.toMatchObject({ code: 'write-failed' });
    expect(await store.readState()).toMatchObject({ content: [], characters: [], contentExists: false, charactersExists: false });
  });

  it('S10. migration endpoint accepts only fixed complete datasets with dual revisions', async () => {
    const store = new ProjectStore(root);
    const before = await store.readState();
    const server = await startHttp(store); servers.push(server);
    const response = await httpRequest(server, PROJECT_MIGRATION_ROUTE, {
      method: 'PUT',
      headers: migrationHeaders(before.contentRevision, before.characterRevision),
      body: JSON.stringify({ content: [feat()], characters: [character()] }),
    });
    expect(response.status).toBe(200);
    expect(response.json.content).toHaveLength(1);
    expect(response.json.characters).toHaveLength(1);
  });

  it('S11. migration route exposes no arbitrary filesystem path parameter', async () => {
    const store = new ProjectStore(root);
    const before = await store.readState();
    const server = await startHttp(store); servers.push(server);
    const response = await httpRequest(server, PROJECT_MIGRATION_ROUTE, {
      method: 'PUT',
      headers: migrationHeaders(before.contentRevision, before.characterRevision),
      body: JSON.stringify({ path: '../../escape.json', content: [], characters: [] }),
    });
    expect(response.status).toBe(200);
    await expect(readFile(resolve(root, 'escape.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('S12. preserved export route is explicit, fixed, read-only, and does not create project stores', async () => {
    const projectRootStore = new ProjectStore(process.cwd());
    const server = await startHttp(projectRootStore); servers.push(server);
    const response = await httpRequest(server, PROJECT_LEGACY_CONTENT_EXPORT_ROUTE);
    expect(response.status).toBe(200);
    expect(response.json.content[0].id).toBe(EK_ID);
  });
});
