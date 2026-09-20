import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createContentRegistry } from '../src/services/contentRegistry';
import { createCharacter } from '../src/services/characterStorage';
import { fighterInput } from '../src/test/fixtures';
import {
  ABSENT_PROJECT_STORE_REVISION,
  PROJECT_CHARACTERS_RELATIVE_PATH,
  PROJECT_CONTENT_RELATIVE_PATH,
  ProjectStore,
} from './projectStore';
import {
  PROJECT_CHARACTERS_ROUTE,
  PROJECT_CONTENT_ROUTE,
  PROJECT_PERSISTENCE_MAX_BODY_BYTES,
  PROJECT_STATE_ROUTE,
  createProjectPersistenceMiddleware,
} from './projectPersistencePlugin';

const FEAT_ID = 'homebrew:local:feat:11111111-1111-4111-8111-111111111111';

function customFeat(name = 'Steady Horizon') {
  return {
    id: FEAT_ID,
    kind: 'feat',
    name,
    source: { type: 'homebrew', namespace: 'local' },
    category: 'general',
    prerequisites: [],
    repeatable: false,
    choices: [],
    effects: [{ type: 'attack-roll-bonus', weaponMode: 'ranged', amount: 1 }],
    referenceEffects: [],
    description: 'Synthetic Phase-A canonical custom Feat.',
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    key(index) { return [...values.keys()][index] ?? null; },
    removeItem(key) { values.delete(key); },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

function validCharacter(content = [], patch = {}) {
  return createCharacter(fighterInput(patch), memoryStorage(), createContentRegistry(content));
}

async function writeStore(root, relativePath, raw) {
  const path = resolve(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, raw, 'utf8');
  return path;
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
        resolvePromise({ status: res.statusCode, headers: res.headers, raw, json });
      });
    });
    req.on('error', rejectPromise);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function putHeaders(targetRevision, otherHeaderName, otherRevision) {
  return {
    'content-type': 'application/json',
    'if-match': targetRevision,
    [otherHeaderName]: otherRevision,
  };
}

describe('Phase A project-backed Node store foundation', () => {
  let root;
  const servers = [];

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'dnd3-phase-a-'));
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise((resolvePromise) => server.close(resolvePromise))));
    await rm(root, { recursive: true, force: true });
  });

  it('1. treats both absent project files as valid empty stores', async () => {
    const state = await new ProjectStore(root).readState();
    expect(state).toMatchObject({ content: [], characters: [], contentExists: false, charactersExists: false });
  });

  it('2. reads explicit empty canonical stores', async () => {
    await writeStore(root, PROJECT_CONTENT_RELATIVE_PATH, '[]');
    await writeStore(root, PROJECT_CHARACTERS_RELATIVE_PATH, '[]');
    const state = await new ProjectStore(root).readState();
    expect(state).toMatchObject({ content: [], characters: [], contentExists: true, charactersExists: true });
  });

  it('3. reads valid canonical custom content', async () => {
    const feat = customFeat();
    await writeStore(root, PROJECT_CONTENT_RELATIVE_PATH, JSON.stringify([feat]));
    expect((await new ProjectStore(root).readState()).content).toEqual([feat]);
  });

  it('4. reads valid Character v9 records', async () => {
    const character = validCharacter();
    await writeStore(root, PROJECT_CHARACTERS_RELATIVE_PATH, JSON.stringify([character]));
    expect((await new ProjectStore(root).readState()).characters).toEqual([character]);
  });

  it('5. rejects malformed content JSON without rewriting it', async () => {
    const path = await writeStore(root, PROJECT_CONTENT_RELATIVE_PATH, '{bad');
    await expect(new ProjectStore(root).readState()).rejects.toMatchObject({ code: 'malformed-json' });
    expect(await readFile(path, 'utf8')).toBe('{bad');
  });

  it('6. rejects malformed Character JSON without rewriting it', async () => {
    const path = await writeStore(root, PROJECT_CHARACTERS_RELATIVE_PATH, '{bad');
    await expect(new ProjectStore(root).readState()).rejects.toMatchObject({ code: 'malformed-json' });
    expect(await readFile(path, 'utf8')).toBe('{bad');
  });

  it('7. rejects invalid canonical custom content', async () => {
    await writeStore(root, PROJECT_CONTENT_RELATIVE_PATH, JSON.stringify([{ ...customFeat(), id: 'not-homebrew' }]));
    await expect(new ProjectStore(root).readState()).rejects.toMatchObject({ code: 'invalid-content' });
  });

  it('8. rejects invalid Character v9 records', async () => {
    await writeStore(root, PROJECT_CHARACTERS_RELATIVE_PATH, JSON.stringify([{ id: 'broken', name: 'Broken' }]));
    await expect(new ProjectStore(root).readState()).rejects.toMatchObject({ code: 'invalid-characters' });
  });

  it('9. rejects a Character whose content references do not resolve in the effective project registry', async () => {
    const feat = customFeat();
    const character = validCharacter([feat], { manualFeats: [{ featId: feat.id, choices: {} }] });
    await writeStore(root, PROJECT_CHARACTERS_RELATIVE_PATH, JSON.stringify([character]));
    await expect(new ProjectStore(root).readState()).rejects.toMatchObject({ code: 'invalid-characters' });
  });

  it('10. commits a valid complete content PUT and advances only content revision', async () => {
    const store = new ProjectStore(root);
    const before = await store.readState();
    const after = await store.putContent([customFeat()], before.contentRevision, before.characterRevision);
    expect(after.content).toHaveLength(1);
    expect(after.contentRevision).not.toBe(before.contentRevision);
    expect(after.characterRevision).toBe(before.characterRevision);
  });

  it('11. commits a valid complete Character PUT and advances only Character revision', async () => {
    const store = new ProjectStore(root);
    const before = await store.readState();
    const after = await store.putCharacters([validCharacter()], before.characterRevision, before.contentRevision);
    expect(after.characters).toHaveLength(1);
    expect(after.characterRevision).not.toBe(before.characterRevision);
    expect(after.contentRevision).toBe(before.contentRevision);
  });

  it('12. rejects stale content revision', async () => {
    const store = new ProjectStore(root);
    const state = await store.readState();
    await expect(store.putContent([], '"stale"', state.characterRevision)).rejects.toMatchObject({ code: 'stale-content' });
  });

  it('13. rejects stale Character revision', async () => {
    const store = new ProjectStore(root);
    const state = await store.readState();
    await expect(store.putCharacters([], '"stale"', state.contentRevision)).rejects.toMatchObject({ code: 'stale-characters' });
  });

  it('14. rejects content PUT when expected Character revision is stale', async () => {
    const store = new ProjectStore(root);
    const state = await store.readState();
    await expect(store.putContent([], state.contentRevision, '"stale"')).rejects.toMatchObject({ code: 'stale-characters' });
  });

  it('15. rejects Character PUT when expected content revision is stale', async () => {
    const store = new ProjectStore(root);
    const state = await store.readState();
    await expect(store.putCharacters([], state.characterRevision, '"stale"')).rejects.toMatchObject({ code: 'stale-content' });
  });

  it('16. rejects content PUT when current authoritative Characters would become invalid', async () => {
    const store = new ProjectStore(root);
    const initial = await store.readState();
    const feat = customFeat();
    const withContent = await store.putContent([feat], initial.contentRevision, initial.characterRevision);
    const character = validCharacter([feat], { manualFeats: [{ featId: feat.id, choices: {} }] });
    const withCharacter = await store.putCharacters([character], withContent.characterRevision, withContent.contentRevision);
    await expect(store.putContent([], withCharacter.contentRevision, withCharacter.characterRevision))
      .rejects.toMatchObject({ code: 'incompatible-characters' });
  });

  it('17. rejects Character PUT against current authoritative content', async () => {
    const feat = customFeat();
    const character = validCharacter([feat], { manualFeats: [{ featId: feat.id, choices: {} }] });
    const store = new ProjectStore(root);
    const state = await store.readState();
    await expect(store.putCharacters([character], state.characterRevision, state.contentRevision))
      .rejects.toMatchObject({ code: 'invalid-characters' });
  });

  it('18. serializes content and Character PUTs through one cross-store mutation authority', async () => {
    const store = new ProjectStore(root);
    const state = await store.readState();
    const contentWrite = store.putContent([customFeat()], state.contentRevision, state.characterRevision);
    const characterWrite = store.putCharacters([validCharacter()], state.characterRevision, state.contentRevision);
    await expect(contentWrite).resolves.toMatchObject({ contentExists: true });
    await expect(characterWrite).rejects.toMatchObject({ code: 'stale-content' });
  });

  it('19. rejects malformed request JSON', async () => {
    const store = new ProjectStore(root);
    const state = await store.readState();
    const server = await startHttp(store); servers.push(server);
    const response = await httpRequest(server, PROJECT_CONTENT_ROUTE, {
      method: 'PUT',
      headers: putHeaders(state.contentRevision, 'x-dnd3-characters-if-match', state.characterRevision),
      body: '{bad',
    });
    expect(response.status).toBe(400);
    expect(response.json.error.code).toBe('malformed-json');
  });

  it('20. rejects a non-array PUT body', async () => {
    const store = new ProjectStore(root);
    const state = await store.readState();
    const server = await startHttp(store); servers.push(server);
    const response = await httpRequest(server, PROJECT_CONTENT_ROUTE, {
      method: 'PUT',
      headers: putHeaders(state.contentRevision, 'x-dnd3-characters-if-match', state.characterRevision),
      body: JSON.stringify({ content: [] }),
    });
    expect(response.status).toBe(400);
    expect(response.json.error.code).toBe('invalid-body');
  });

  it('21. rejects PUT with a non-JSON content type', async () => {
    const server = await startHttp(new ProjectStore(root)); servers.push(server);
    const response = await httpRequest(server, PROJECT_CONTENT_ROUTE, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: '[]' });
    expect(response.status).toBe(415);
  });

  it('22. rejects unsupported methods on supported project-state routes', async () => {
    const server = await startHttp(new ProjectStore(root)); servers.push(server);
    const response = await httpRequest(server, PROJECT_STATE_ROUTE, { method: 'POST' });
    expect(response.status).toBe(405);
    expect(response.json.error.code).toBe('unsupported-method');
  });

  it('23. rejects unsupported project-state routes instead of falling through', async () => {
    const server = await startHttp(new ProjectStore(root)); servers.push(server);
    const response = await httpRequest(server, `${PROJECT_STATE_ROUTE}/../../outside`);
    expect(response.status).toBe(404);
    expect(response.json.error.code).toBe('unsupported-route');
  });

  it('24. rejects oversized request bodies', async () => {
    const store = new ProjectStore(root);
    const state = await store.readState();
    const server = await startHttp(store); servers.push(server);
    const body = JSON.stringify(['x'.repeat(PROJECT_PERSISTENCE_MAX_BODY_BYTES + 1)]);
    const response = await httpRequest(server, PROJECT_CONTENT_ROUTE, {
      method: 'PUT',
      headers: putHeaders(state.contentRevision, 'x-dnd3-characters-if-match', state.characterRevision),
      body,
    });
    expect(response.status).toBe(413);
    expect(response.json.error.code).toBe('request-too-large');
  });

  it('25. enforces fixed server-owned paths and rejects request-controlled path payloads', async () => {
    const store = new ProjectStore(root);
    expect(store.contentPath).toBe(resolve(root, PROJECT_CONTENT_RELATIVE_PATH));
    expect(store.charactersPath).toBe(resolve(root, PROJECT_CHARACTERS_RELATIVE_PATH));
    const state = await store.readState();
    const server = await startHttp(store); servers.push(server);
    const response = await httpRequest(server, PROJECT_CONTENT_ROUTE, {
      method: 'PUT',
      headers: putHeaders(state.contentRevision, 'x-dnd3-characters-if-match', state.characterRevision),
      body: JSON.stringify({ path: '../../escape.json', content: [] }),
    });
    expect(response.status).toBe(400);
    await expect(readFile(resolve(root, 'escape.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('26. atomically replaces an existing target with a complete canonical array on success', async () => {
    const store = new ProjectStore(root);
    const initial = await store.readState();
    const first = await store.putContent([customFeat('First')], initial.contentRevision, initial.characterRevision);
    const replacement = customFeat('Replacement');
    await store.putContent([replacement], first.contentRevision, first.characterRevision);
    expect(JSON.parse(await readFile(store.contentPath, 'utf8'))).toEqual([replacement]);
  });

  it('27. simulated temp-file write failure leaves previous authoritative file unchanged', async () => {
    const seed = new ProjectStore(root);
    const first = await seed.readState();
    await seed.putContent([customFeat('First')], first.contentRevision, first.characterRevision);
    const beforeRaw = await readFile(seed.contentPath, 'utf8');
    const failingFs = { ...realFs, writeFile: async () => { throw new Error('write failed'); } };
    const store = new ProjectStore(root, failingFs);
    const state = await store.readState();
    await expect(store.putContent([customFeat('Second')], state.contentRevision, state.characterRevision))
      .rejects.toMatchObject({ code: 'write-failed' });
    expect(await readFile(seed.contentPath, 'utf8')).toBe(beforeRaw);
  });

  it('28. simulated rename failure leaves previous authoritative file unchanged', async () => {
    const seed = new ProjectStore(root);
    const first = await seed.readState();
    await seed.putContent([customFeat('First')], first.contentRevision, first.characterRevision);
    const beforeRaw = await readFile(seed.contentPath, 'utf8');
    const failingFs = { ...realFs, rename: async () => { throw new Error('rename failed'); } };
    const store = new ProjectStore(root, failingFs);
    const state = await store.readState();
    await expect(store.putContent([customFeat('Second')], state.contentRevision, state.characterRevision))
      .rejects.toMatchObject({ code: 'write-failed' });
    expect(await readFile(seed.contentPath, 'utf8')).toBe(beforeRaw);
  });

  it('29. revisions advance only after successful durable commit', async () => {
    const seed = new ProjectStore(root);
    const first = await seed.readState();
    const committed = await seed.putContent([customFeat('First')], first.contentRevision, first.characterRevision);
    const failingFs = { ...realFs, rename: async () => { throw new Error('rename failed'); } };
    const store = new ProjectStore(root, failingFs);
    await expect(store.putContent([customFeat('Second')], committed.contentRevision, committed.characterRevision))
      .rejects.toMatchObject({ code: 'write-failed' });
    expect((await seed.readState()).contentRevision).toBe(committed.contentRevision);
  });

  it('30. absent-store revisions are deterministic across project roots', async () => {
    const otherRoot = await mkdtemp(join(tmpdir(), 'dnd3-phase-a-other-'));
    try {
      const first = await new ProjectStore(root).readState();
      const second = await new ProjectStore(otherRoot).readState();
      expect(first.contentRevision).toBe(ABSENT_PROJECT_STORE_REVISION);
      expect(first.characterRevision).toBe(ABSENT_PROJECT_STORE_REVISION);
      expect(second.contentRevision).toBe(first.contentRevision);
      expect(second.characterRevision).toBe(first.characterRevision);
    } finally {
      await rm(otherRoot, { recursive: true, force: true });
    }
  });

  it('31. GET returns the bounded project-state transport envelope without CORS', async () => {
    const server = await startHttp(new ProjectStore(root)); servers.push(server);
    const response = await httpRequest(server, PROJECT_STATE_ROUTE);
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({
      content: [],
      characters: [],
      contentExists: false,
      charactersExists: false,
      contentRevision: ABSENT_PROJECT_STORE_REVISION,
      characterRevision: ABSENT_PROJECT_STORE_REVISION,
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('32. requires revision metadata for PUT requests', async () => {
    const server = await startHttp(new ProjectStore(root)); servers.push(server);
    const response = await httpRequest(server, PROJECT_CHARACTERS_ROUTE, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '[]',
    });
    expect(response.status).toBe(428);
    expect(response.json.error.code).toBe('missing-revision');
  });
});
