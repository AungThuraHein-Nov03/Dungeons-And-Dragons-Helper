import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { buildClassContentFromDraft, createClassForgeDraft, duplicateClassForgeDraft } from '../components/classForgeModel';
import { buildFeatContentFromDraft, createFeatForgeDraft, duplicateFeatForgeDraft } from '../components/featForgeModel';
import { buildSpellContentFromDraft, createSpellForgeDraft, duplicateSpellForgeDraft } from '../components/spellForgeModel';
import { duplicateSubclassForgeDraft } from '../components/subclassForgeModel';
import { buildEquipmentContentFromDraft, createEquipmentForgeDraft } from '../components/equipmentForgeModel';
import type { Character } from '../models/character';
import type { ContentEntry } from '../models/content';
import {
  deleteAndPublishApplicationContent,
  getProjectContentEntries,
  initializeContentCatalog,
  preflightApplicationContentDelete,
  upsertAndPublishApplicationContent,
} from '../services/contentCatalog';
import { contentRegistry, createContentRegistry, getContentRegistryGeneration, subscribeContentRegistry } from '../services/contentRegistry';
import { createCharacter } from '../services/characterStorage';
import { HOMEBREW_CONTENT_STORAGE_KEY } from '../services/homebrewContentStorage';
import { configurePersistenceBackend, projectContentMutationsAreLocked, projectMutationsAreLocked } from '../services/persistenceBackend';
import {
  PROJECT_CONTENT_ENDPOINT,
  putProjectContent,
  type ProjectStateEnvelope,
} from '../services/projectPersistenceTransport';
import { getApplicationProjectState, initializeApplicationPersistence } from '../services/projectState';
import { fighterInput } from './fixtures';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function envelope(
  content: ContentEntry[] = [],
  characters: Character[] = [],
  contentRevision = '"h1"',
  characterRevision = '"c1"',
): ProjectStateEnvelope {
  return {
    content,
    characters,
    contentExists: true,
    charactersExists: true,
    characterMigrationRequired: false,
    contentRevision,
    characterRevision,
  };
}

function feat(name = 'Project Feat') {
  return buildFeatContentFromDraft({ ...createFeatForgeDraft(), name, description: 'Project feat fixture.' });
}

function spell(name = 'Project Spell') {
  return buildSpellContentFromDraft({
    ...createSpellForgeDraft(),
    name,
    description: 'Project spell fixture.',
    spellLists: [{ id: 'wizard', name: 'Wizard' }],
  });
}

function subclass(name = 'Project Subclass') {
  const fighter = contentRegistry.getAll('class').find((entry) => entry.name === 'Fighter');
  if (!fighter) throw new Error('Missing Fighter fixture.');
  return {
    id: 'homebrew:local:subclass:phase-c-subclass',
    kind: 'subclass' as const,
    name,
    source: { type: 'homebrew' as const, namespace: 'local' },
    parentClassId: fighter.id,
    acquisitionLevel: 3,
    description: 'Project subclass fixture.',
    progression: [{
      level: 3,
      features: [{
        id: 'homebrew:local:subclass-feature:phase-c-feature',
        name: 'Project Feature',
        description: 'Project feature fixture.',
        effects: [],
        resources: [],
        referenceEffects: [],
      }],
    }],
  };
}

function klass(name = 'Project Class') {
  return buildClassContentFromDraft({ ...createClassForgeDraft(), name });
}

function weapon(name = 'Project Weapon') {
  return buildEquipmentContentFromDraft({ ...createEquipmentForgeDraft('weapon'), name, description: 'Project weapon fixture.' });
}

function armor(name = 'Project Armor') {
  return buildEquipmentContentFromDraft({ ...createEquipmentForgeDraft('armor'), name, description: 'Project armor fixture.' });
}

function equipment(name = 'Project Equipment') {
  return buildEquipmentContentFromDraft({ ...createEquipmentForgeDraft('equipment'), name, description: 'Project equipment fixture.' });
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key) { return values.get(key) ?? null; },
    key(index) { return [...values.keys()][index] ?? null; },
    removeItem(key) { values.delete(key); },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

async function bootProject(content: ContentEntry[] = [], characters: Character[] = []) {
  const result = await initializeApplicationPersistence({
    backend: 'project',
    fetchImpl: async () => jsonResponse(envelope(content, characters)),
  });
  expect(result.ok).toBe(true);
}

function successFetch(nextContent: ContentEntry[], characters: Character[] = [], h = '"h2"', c = '"c1"') {
  return vi.fn(async () => jsonResponse(envelope(nextContent, characters, h, c)));
}

describe('Project Persistence Phase C', () => {
  beforeEach(() => {
    localStorage.clear();
    configurePersistenceBackend('browser-local');
    initializeContentCatalog(localStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    configurePersistenceBackend('browser-local');
    initializeContentCatalog(localStorage);
  });

  it('1. project content PUT uses the exact fixed endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(envelope()));
    await putProjectContent([], '"h1"', '"c1"', fetchMock as typeof fetch);
    expect(fetchMock.mock.calls[0][0]).toBe(PROJECT_CONTENT_ENDPOINT);
  });

  it('2. project PUT uses application/json', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(envelope()));
    await putProjectContent([], '"h1"', '"c1"', fetchMock as typeof fetch);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('content-type')).toBe('application/json');
  });

  it('3. project PUT sends the complete canonical ContentEntry array', async () => {
    const entry = feat();
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(envelope([entry])));
    await putProjectContent([entry], '"h1"', '"c1"', fetchMock as typeof fetch);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual([entry]);
  });

  it('4. project PUT sends expected content revision', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(envelope()));
    await putProjectContent([], '"h1"', '"c1"', fetchMock as typeof fetch);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('if-match')).toBe('"h1"');
  });

  it('5. project PUT sends expected Character revision', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(envelope()));
    await putProjectContent([], '"h1"', '"c1"', fetchMock as typeof fetch);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('x-dnd3-characters-if-match')).toBe('"c1"');
  });

  for (const [number, label, make] of [
    [6, 'Create', () => feat('Created')],
    [7, 'Edit', () => feat('Edited')],
    [8, 'Duplicate', () => feat('Duplicate')],
  ] as const) {
    it(`${number}. successful ${label} persists before registry publication`, async () => {
      const original = label === 'Edit' ? feat('Original') : undefined;
      await bootProject(original ? [original] : []);
      const candidate = label === 'Edit' ? { ...original!, name: 'Edited' } : make();
      let resolveFetch!: (value: Response) => void;
      const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
      vi.stubGlobal('fetch', fetchMock);
      const before = getContentRegistryGeneration();
      const pending = upsertAndPublishApplicationContent(candidate);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(getContentRegistryGeneration()).toBe(before);
      resolveFetch(jsonResponse(envelope([candidate], [], '"h2"', '"c1"')));
      expect((await pending).ok).toBe(true);
      expect(getContentRegistryGeneration()).toBeGreaterThan(before);
    });
  }

  it('9. successful Delete persists before registry publication', async () => {
    const target = feat();
    await bootProject([target]);
    let resolveFetch!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const before = getContentRegistryGeneration();
    const pending = deleteAndPublishApplicationContent(target.id);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(contentRegistry.findFeat(target.id)).toBeDefined();
    expect(getContentRegistryGeneration()).toBe(before);
    resolveFetch(jsonResponse(envelope([], [], '"h2"', '"c1"')));
    expect((await pending).ok).toBe(true);
    expect(contentRegistry.findFeat(target.id)).toBeUndefined();
  });

  it('10. failed PUT leaves registry unchanged', async () => {
    const target = feat();
    await bootProject([target]);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { code: 'write-failed', message: 'nope' } }, 500)));
    const generation = getContentRegistryGeneration();
    expect((await deleteAndPublishApplicationContent(target.id)).ok).toBe(false);
    expect(getContentRegistryGeneration()).toBe(generation);
    expect(contentRegistry.findFeat(target.id)).toBeDefined();
  });

  it('11. failed PUT leaves project content snapshot unchanged', async () => {
    const target = feat();
    await bootProject([target]);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { code: 'write-failed', message: 'nope' } }, 500)));
    await deleteAndPublishApplicationContent(target.id);
    expect(getProjectContentEntries()).toEqual([target]);
  });

  it('12. failed PUT leaves revisions unchanged', async () => {
    await bootProject();
    const before = getApplicationProjectState();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { code: 'write-failed', message: 'nope' } }, 500)));
    await upsertAndPublishApplicationContent(feat());
    expect(getApplicationProjectState()).toEqual(before);
  });

  it('13. network failure produces no publication', async () => {
    await bootProject();
    const before = getContentRegistryGeneration();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect((await upsertAndPublishApplicationContent(feat())).ok).toBe(false);
    expect(getContentRegistryGeneration()).toBe(before);
  });

  it('14. malformed success response produces no publication', async () => {
    await bootProject();
    const before = getContentRegistryGeneration();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ nope: true })));
    expect((await upsertAndPublishApplicationContent(feat())).ok).toBe(false);
    expect(getContentRegistryGeneration()).toBe(before);
  });

  it('15. stale content revision produces no publication', async () => {
    await bootProject();
    const before = getContentRegistryGeneration();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { code: 'stale-content', message: 'stale' } }, 409)));
    const result = await upsertAndPublishApplicationContent(feat());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('project-conflict');
    expect(getContentRegistryGeneration()).toBe(before);
  });

  it('16. stale Character revision produces no publication', async () => {
    await bootProject();
    const before = getContentRegistryGeneration();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { code: 'stale-characters', message: 'stale' } }, 409)));
    const result = await upsertAndPublishApplicationContent(feat());
    expect(result.ok).toBe(false);
    expect(getContentRegistryGeneration()).toBe(before);
  });

  it('17. stale mutation is not automatically retried', async () => {
    await bootProject();
    const fetchMock = vi.fn(async () => jsonResponse({ error: { code: 'stale-content', message: 'stale' } }, 409));
    vi.stubGlobal('fetch', fetchMock);
    await upsertAndPublishApplicationContent(feat());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('18. M16-G Edit preflight uses authoritative project Characters', async () => {
    const target = feat();
    const character = createCharacter(
      fighterInput({ manualFeats: [{ featId: target.id, choices: {} }] }),
      memoryStorage(),
      createContentRegistry([target]),
    );
    await bootProject([target], [character]);
    const renamed = { ...target, name: 'Safe Rename' };
    const fetchMock = successFetch([renamed], [character]);
    vi.stubGlobal('fetch', fetchMock);
    expect((await upsertAndPublishApplicationContent(renamed)).ok).toBe(true);
  });

  it('19. M16-G Delete preflight uses authoritative project Characters', async () => {
    const target = feat();
    const registry = createContentRegistry([target]);
    const character = createCharacter(fighterInput({ manualFeats: [{ featId: target.id, choices: {} }] }), memoryStorage(), registry);
    await bootProject([target], [character]);
    expect(preflightApplicationContentDelete(target.id).ok).toBe(false);
  });

  it('20. referenced custom content remains blocked', async () => {
    const target = feat();
    const registry = createContentRegistry([target]);
    const character = createCharacter(fighterInput({ manualFeats: [{ featId: target.id, choices: {} }] }), memoryStorage(), registry);
    await bootProject([target], [character]);
    const result = await deleteAndPublishApplicationContent(target.id);
    expect(result.ok).toBe(false);
  });

  it('21. safe unreferenced content deletes successfully', async () => {
    const target = feat();
    await bootProject([target]);
    vi.stubGlobal('fetch', successFetch([]));
    expect((await deleteAndPublishApplicationContent(target.id)).ok).toBe(true);
  });

  it('22. SRD content remains protected', async () => {
    await bootProject();
    const srdFeat = contentRegistry.getAll('feat').find((entry) => entry.source.type === 'srd')!;
    expect(preflightApplicationContentDelete(srdFeat.id).ok).toBe(false);
  });

  it('23. Create ID semantics remain UUID-based and stable', () => {
    const draft = createFeatForgeDraft();
    expect(draft.id).toMatch(/^homebrew:local:feat:/);
    expect(buildFeatContentFromDraft({ ...draft, name: 'A', description: 'B' }).id).toBe(draft.id);
  });

  it('24. Edit/Rename preserves top-level ID', () => {
    const original = feat('Before');
    expect({ ...original, name: 'After' }.id).toBe(original.id);
  });

  it('25. Duplicate gets a fresh top-level ID', () => {
    const original = feat();
    const copy = duplicateFeatForgeDraft(original);
    expect(copy.ok).toBe(true);
    if (copy.ok) expect(copy.draft.id).not.toBe(original.id);
  });

  it('26. Duplicate nested private IDs remain fresh', () => {
    const original = spell();
    const copy = duplicateSpellForgeDraft(original);
    expect(copy.ok).toBe(true);
    if (copy.ok) expect(copy.draft.id).not.toBe(original.id);
  });

  it('27. legitimate external references survive Duplicate', () => {
    const original = spell();
    const copy = duplicateSpellForgeDraft(original);
    expect(copy.ok).toBe(true);
    if (copy.ok) expect(copy.draft.spellLists).toEqual(original.spellLists);
  });

  it('28. successful mutation advances project content revision', async () => {
    await bootProject();
    vi.stubGlobal('fetch', successFetch([feat()], [], '"h2"'));
    await upsertAndPublishApplicationContent(feat());
    expect(getApplicationProjectState().contentRevision).toBe('"h2"');
  });

  it('29. Character revision handling follows returned server contract', async () => {
    await bootProject();
    const entry = feat();
    vi.stubGlobal('fetch', successFetch([entry], [], '"h2"', '"c2"'));
    await upsertAndPublishApplicationContent(entry);
    expect(getApplicationProjectState().characterRevision).toBe('"c2"');
  });

  it('30. successful publication updates registry subscribers', async () => {
    await bootProject();
    const listener = vi.fn();
    const unsubscribe = subscribeContentRegistry(listener);
    const entry = feat();
    vi.stubGlobal('fetch', successFetch([entry]));
    await upsertAndPublishApplicationContent(entry);
    unsubscribe();
    expect(listener).toHaveBeenCalled();
  });

  it('31. mounted Forge/catalog consumer sees successful Create', async () => {
    await bootProject();
    render(<MemoryRouter initialEntries={['/creator-forge/feats']}><App /></MemoryRouter>);
    expect(screen.getByText('No custom Feats yet')).toBeInTheDocument();
  });

  it('32. mounted Forge/catalog consumer sees successful Delete publication', async () => {
    const entry = feat();
    await bootProject([entry]);
    vi.stubGlobal('fetch', successFetch([]));
    expect((await deleteAndPublishApplicationContent(entry.id)).ok).toBe(true);
    expect(contentRegistry.findFeat(entry.id)).toBeUndefined();
  });

  for (const [number, family, make] of [
    [33, 'Feat', feat],
    [34, 'Spell', spell],
    [35, 'Subclass', subclass],
    [36, 'Class', klass],
    ['36a', 'Weapon', weapon],
    ['36b', 'Armor', armor],
    ['36c', 'Equipment', equipment],
  ] as const) {
    it(`${number}. ${family} Forge project Create/Edit uses shared project authority`, async () => {
      await bootProject();
      const entry = make(`Project ${family}`) as ContentEntry;
      vi.stubGlobal('fetch', successFetch([entry]));
      expect((await upsertAndPublishApplicationContent(entry)).ok).toBe(true);
      const edited = { ...entry, name: `Edited ${family}` } as ContentEntry;
      vi.stubGlobal('fetch', successFetch([edited], [], '"h3"'));
      expect((await upsertAndPublishApplicationContent(edited)).ok).toBe(true);
    });
  }

  it('37. all four project Duplicate paths preserve fresh top-level identities', () => {
    const f = feat(); const s = spell(); const sub = subclass(); const c = klass();
    const copies = [
      duplicateFeatForgeDraft(f),
      duplicateSpellForgeDraft(s),
      duplicateSubclassForgeDraft(sub),
      duplicateClassForgeDraft(c),
    ];
    expect(copies.every((copy) => copy.ok)).toBe(true);
    expect((copies[0] as { ok: true; draft: { id: string } }).draft.id).not.toBe(f.id);
    expect((copies[1] as { ok: true; draft: { id: string } }).draft.id).not.toBe(s.id);
    expect((copies[2] as { ok: true; draft: { id: string } }).draft.id).not.toBe(sub.id);
    expect((copies[3] as { ok: true; draft: { id: string } }).draft.id).not.toBe(c.id);
  });

  it('38. all seven project Delete paths use shared project authority', async () => {
    for (const make of [feat, spell, subclass, klass, weapon, armor, equipment]) {
      const entry = make() as ContentEntry;
      await bootProject([entry]);
      vi.stubGlobal('fetch', successFetch([]));
      expect((await deleteAndPublishApplicationContent(entry.id)).ok).toBe(true);
    }
  });

  it('39. project-mode content controls are enabled', async () => {
    await bootProject();
    expect(projectContentMutationsAreLocked()).toBe(false);
    render(<MemoryRouter initialEntries={['/creator-forge/feats']}><App /></MemoryRouter>);
    expect(screen.getAllByRole('link', { name: 'Create Feat' }).length).toBeGreaterThan(0);
  });

  it('40. Phase D supersedes the core Character Create lock while later-phase project mutations remain locked', async () => {
    await bootProject();
    expect(projectMutationsAreLocked()).toBe(true);
    render(<MemoryRouter initialEntries={['/characters/new']}><App /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Create Character' })).toBeInTheDocument();
  });

  it('41. project mode never writes homebrew localStorage', async () => {
    await bootProject();
    const entry = feat();
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    vi.stubGlobal('fetch', successFetch([entry]));
    await upsertAndPublishApplicationContent(entry);
    expect(spy.mock.calls.some(([key]) => key === HOMEBREW_CONTENT_STORAGE_KEY)).toBe(false);
  });

  it('42. static/browser-local Forge mutation still writes existing localStorage', async () => {
    configurePersistenceBackend('browser-local');
    initializeContentCatalog(localStorage);
    const entry = feat();
    expect((await upsertAndPublishApplicationContent(entry)).ok).toBe(true);
    expect(localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toContain(entry.id);
  });

  it('43. static/browser-local Delete behavior remains unchanged', async () => {
    configurePersistenceBackend('browser-local');
    initializeContentCatalog(localStorage);
    const entry = feat();
    await upsertAndPublishApplicationContent(entry);
    expect((await deleteAndPublishApplicationContent(entry.id)).ok).toBe(true);
    expect(contentRegistry.findFeat(entry.id)).toBeUndefined();
  });

  it('44. no automatic migration occurs', async () => {
    localStorage.setItem(HOMEBREW_CONTENT_STORAGE_KEY, JSON.stringify([feat('Legacy Local')]));
    await bootProject([]);
    expect(getProjectContentEntries()).toEqual([]);
    expect(contentRegistry.getAll('feat').some((entry) => entry.name === 'Legacy Local')).toBe(false);
  });

  it('45. content mutation against changed Character revision rejects safely', async () => {
    await bootProject();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { code: 'stale-characters', message: 'changed' } }, 409)));
    const result = await upsertAndPublishApplicationContent(feat());
    expect(result.ok).toBe(false);
    expect(getProjectContentEntries()).toEqual([]);
  });

  it('46. content mutation against changed content revision rejects safely', async () => {
    await bootProject();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { code: 'stale-content', message: 'changed' } }, 409)));
    const result = await upsertAndPublishApplicationContent(feat());
    expect(result.ok).toBe(false);
    expect(getProjectContentEntries()).toEqual([]);
  });

  it('maps malformed and bounded transport failures without filesystem concepts', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('not json', { status: 200 }));
    await expect(putProjectContent([], '"h"', '"c"', fetchMock as typeof fetch )).rejects.toMatchObject({
      code: 'malformed-envelope',
    });
  });
});
