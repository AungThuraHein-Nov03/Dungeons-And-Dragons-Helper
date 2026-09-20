import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { bootstrapApplication } from '../bootstrap';
import { buildFeatContentFromDraft, createFeatForgeDraft } from '../components/featForgeModel';
import type { Character } from '../models/character';
import type { ContentEntry } from '../models/content';
import { createContentRegistry, getContentRegistryGeneration, subscribeContentRegistry, contentRegistry } from '../services/contentRegistry';
import { saveAndPublishHomebrewContent } from '../services/contentCatalog';
import { createCharacter, saveCharacters } from '../services/characterStorage';
import { clearCharacterCatalog, getCharacterCatalogGeneration, subscribeCharacterCatalog } from '../services/characterCatalog';
import { saveHomebrewContent, HOMEBREW_CONTENT_STORAGE_KEY } from '../services/homebrewContentStorage';
import { configurePersistenceBackend, getPersistenceBackend, selectPersistenceBackend } from '../services/persistenceBackend';
import {
  getApplicationCharacterById,
  getApplicationCharacters,
  getApplicationProjectState,
  initializeApplicationPersistence,
} from '../services/projectState';
import {
  PROJECT_STATE_ENDPOINT,
  ProjectTransportError,
  fetchProjectState,
  parseProjectStateEnvelope,
  type ProjectStateEnvelope,
} from '../services/projectPersistenceTransport';
import { fighterInput } from './fixtures';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

function feat(name: string) {
  const draft = createFeatForgeDraft();
  return buildFeatContentFromDraft({ ...draft, name, description: 'Phase-B project content fixture.' });
}

function character(name: string, content: readonly ContentEntry[] = [], patch = {}): Character {
  return createCharacter(
    fighterInput({ name, ...patch }),
    memoryStorage(),
    createContentRegistry(content),
  );
}

function envelope(overrides: Partial<ProjectStateEnvelope> = {}): ProjectStateEnvelope {
  return {
    content: [],
    characters: [],
    contentExists: true,
    charactersExists: true,
    contentRevision: '"content-r1"',
    characterRevision: '"character-r1"',
    ...overrides,
  };
}

function responseFor(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fetchEnvelope(value: unknown = envelope()): typeof fetch {
  return vi.fn(async () => responseFor(value)) as unknown as typeof fetch;
}

async function resetBrowserLocal() {
  window.localStorage.clear();
  clearCharacterCatalog();
  configurePersistenceBackend('browser-local');
  await initializeApplicationPersistence({ backend: 'browser-local', storage: window.localStorage });
}

beforeEach(async () => {
  await resetBrowserLocal();
});

afterEach(async () => {
  await resetBrowserLocal();
});

describe('Project Persistence Phase B — browser transport and project-state bootstrap', () => {
  it('1. development mode selects the project backend explicitly', () => {
    expect(selectPersistenceBackend('development')).toBe('project');
  });

  it('2. production/static mode selects browser-local backend', () => {
    expect(selectPersistenceBackend('production')).toBe('browser-local');
    expect(selectPersistenceBackend('test')).toBe('browser-local');
  });

  it('3. project bootstrap network failure does not silently fall back to localStorage', async () => {
    const legacy = feat('Legacy Local Feat');
    saveHomebrewContent([legacy], window.localStorage);
    const result = await initializeApplicationPersistence({
      backend: 'project',
      fetchImpl: vi.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(getPersistenceBackend()).toBe('project');
    expect(contentRegistry.findFeat(legacy.id)).toBeUndefined();
    expect(getApplicationCharacters()).toEqual([]);
  });

  it('4. parses a successful project-state transport envelope', async () => {
    const result = await fetchProjectState(fetchEnvelope());
    expect(result).toEqual(envelope());
  });

  it('5. rejects a malformed project-state envelope', () => {
    expect(() => parseProjectStateEnvelope(null)).toThrow(ProjectTransportError);
  });

  it('6. rejects non-array project content', () => {
    expect(() => parseProjectStateEnvelope({ ...envelope(), content: {} })).toThrow(/content must be an array/i);
  });

  it('7. rejects non-array project Characters', () => {
    expect(() => parseProjectStateEnvelope({ ...envelope(), characters: {} })).toThrow(/Characters must be an array/i);
  });

  it('8. rejects missing project revisions', () => {
    expect(() => parseProjectStateEnvelope({ ...envelope(), contentRevision: '' })).toThrow(/content revision/i);
    expect(() => parseProjectStateEnvelope({ ...envelope(), characterRevision: '' })).toThrow(/Character revision/i);
  });

  it('9. rejects project content that fails canonical Homebrew validation', async () => {
    const invalid = { ...feat('Broken'), id: 'invalid-id' };
    const result = await initializeApplicationPersistence({
      backend: 'project',
      fetchImpl: fetchEnvelope(envelope({ content: [invalid] as ContentEntry[] })),
    });
    expect(result.ok).toBe(false);
    expect(contentRegistry.findFeat('invalid-id')).toBeUndefined();
  });

  it('10. rejects malformed Character v9 records during project bootstrap', async () => {
    const result = await initializeApplicationPersistence({
      backend: 'project',
      fetchImpl: fetchEnvelope(envelope({ characters: [{ id: 'broken' } as Character] })),
    });
    expect(result.ok).toBe(false);
    expect(getApplicationCharacters()).toEqual([]);
  });

  it('11. rejects a Character whose custom reference is absent from project content', async () => {
    const customFeat = feat('Referenced Project Feat');
    const dependent = character('Dependent Hero', [customFeat], {
      manualFeats: [{ featId: customFeat.id, choices: {} }],
    });
    const result = await initializeApplicationPersistence({
      backend: 'project',
      fetchImpl: fetchEnvelope(envelope({ content: [], characters: [dependent] })),
    });
    expect(result.ok).toBe(false);
    expect(getApplicationCharacters()).toEqual([]);
  });

  it('12. bootstrapApplication waits for project bootstrap before rendering', async () => {
    let resolveFetch!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { resolveFetch = resolve; });
    const renderApplication = vi.fn();
    const promise = bootstrapApplication(renderApplication, {
      backend: 'project',
      fetchImpl: vi.fn(() => pending) as unknown as typeof fetch,
    });
    await Promise.resolve();
    expect(renderApplication).not.toHaveBeenCalled();
    resolveFetch(responseFor(envelope()));
    await expect(promise).resolves.toMatchObject({ ok: true });
    expect(renderApplication).toHaveBeenCalledTimes(1);
  });

  it('13. publishes project content registry only after successful validation', async () => {
    const projectFeat = feat('Project Registry Feat');
    const result = await initializeApplicationPersistence({
      backend: 'project',
      fetchImpl: fetchEnvelope(envelope({ content: [projectFeat] })),
    });
    expect(result.ok).toBe(true);
    expect(contentRegistry.findFeat(projectFeat.id)).toEqual(projectFeat);
  });

  it('14. hydrates project Characters after successful validation', async () => {
    const projectCharacter = character('Project Character');
    await initializeApplicationPersistence({
      backend: 'project',
      fetchImpl: fetchEnvelope(envelope({ characters: [projectCharacter] })),
    });
    expect(getApplicationCharacters()).toEqual([projectCharacter]);
  });

  it('15. retains both authoritative project revisions in runtime metadata', async () => {
    await initializeApplicationPersistence({
      backend: 'project',
      fetchImpl: fetchEnvelope(envelope({ contentRevision: '"c-22"', characterRevision: '"p-37"' })),
    });
    expect(getApplicationProjectState()).toMatchObject({
      backend: 'project',
      status: 'ready',
      contentRevision: '"c-22"',
      characterRevision: '"p-37"',
    });
  });

  it('16. accepts an empty project content dataset', async () => {
    const result = await initializeApplicationPersistence({ backend: 'project', fetchImpl: fetchEnvelope(envelope({ content: [] })) });
    expect(result.ok).toBe(true);
    expect(contentRegistry.filterBySource('homebrew')).toEqual([]);
  });

  it('17. accepts an empty project Character set', async () => {
    const result = await initializeApplicationPersistence({ backend: 'project', fetchImpl: fetchEnvelope(envelope({ characters: [] })) });
    expect(result.ok).toBe(true);
    expect(getApplicationCharacters()).toEqual([]);
  });

  it('18. project content authority ignores legacy localStorage Homebrew data', async () => {
    const legacy = feat('Legacy Browser Feat');
    const project = feat('Project Feat');
    saveHomebrewContent([legacy], window.localStorage);
    await initializeApplicationPersistence({
      backend: 'project',
      fetchImpl: fetchEnvelope(envelope({ content: [project] })),
    });
    expect(contentRegistry.findFeat(project.id)).toEqual(project);
    expect(contentRegistry.findFeat(legacy.id)).toBeUndefined();
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).not.toBeNull();
  });

  it('19. project Character authority ignores legacy localStorage Characters', async () => {
    const legacy = character('Legacy Browser Character');
    const project = character('Project Character');
    saveCharacters([legacy], window.localStorage);
    await initializeApplicationPersistence({
      backend: 'project',
      fetchImpl: fetchEnvelope(envelope({ characters: [project] })),
    });
    expect(getApplicationCharacters().map((entry) => entry.name)).toEqual(['Project Character']);
  });

  it('20. browser-local mode still loads existing localStorage content', async () => {
    const localFeat = feat('Static Local Feat');
    saveHomebrewContent([localFeat], window.localStorage);
    const result = await initializeApplicationPersistence({ backend: 'browser-local', storage: window.localStorage });
    expect(result.ok).toBe(true);
    expect(contentRegistry.findFeat(localFeat.id)).toEqual(localFeat);
  });

  it('21. browser-local mode still reads existing localStorage Characters', async () => {
    const localCharacter = character('Static Local Character');
    saveCharacters([localCharacter], window.localStorage);
    await initializeApplicationPersistence({ backend: 'browser-local', storage: window.localStorage });
    expect(getApplicationCharacters()).toEqual([localCharacter]);
  });

  it('22. failed project content bootstrap never publishes the invalid candidate', async () => {
    const beforeGeneration = getContentRegistryGeneration();
    const invalid = { ...feat('Invalid Candidate'), source: { type: 'homebrew', namespace: '' } } as ContentEntry;
    const result = await initializeApplicationPersistence({
      backend: 'project',
      fetchImpl: fetchEnvelope(envelope({ content: [invalid] })),
    });
    expect(result.ok).toBe(false);
    expect(contentRegistry.getById(invalid.id)).toBeUndefined();
    expect(getContentRegistryGeneration()).toBeGreaterThan(beforeGeneration);
  });

  it('23. failed project Character bootstrap leaves the Character catalog empty', async () => {
    const valid = character('Previously Hydrated');
    await initializeApplicationPersistence({
      backend: 'project',
      fetchImpl: fetchEnvelope(envelope({ characters: [valid] })),
    });
    expect(getApplicationCharacters()).toHaveLength(1);
    const failed = await initializeApplicationPersistence({
      backend: 'project',
      fetchImpl: fetchEnvelope(envelope({ characters: [{ bad: true } as unknown as Character] })),
    });
    expect(failed.ok).toBe(false);
    expect(getApplicationCharacters()).toEqual([]);
  });

  it('24. CharactersPage reads the project Character snapshot instead of localStorage', async () => {
    const legacy = character('Legacy Chrome Hero');
    const project = character('Project Hero');
    saveCharacters([legacy], window.localStorage);
    await initializeApplicationPersistence({
      backend: 'project',
      fetchImpl: fetchEnvelope(envelope({ characters: [project] })),
    });
    render(<MemoryRouter initialEntries={['/characters']}><AppRoutes /></MemoryRouter>);
    expect(screen.getByText('Project Hero')).toBeInTheDocument();
    expect(screen.queryByText('Legacy Chrome Hero')).not.toBeInTheDocument();
  });

  it('25. CharactersPage uses the existing browser-local adapter in static mode', async () => {
    const local = character('Static Hero');
    saveCharacters([local], window.localStorage);
    await initializeApplicationPersistence({ backend: 'browser-local', storage: window.localStorage });
    render(<MemoryRouter initialEntries={['/characters']}><AppRoutes /></MemoryRouter>);
    expect(screen.getByText('Static Hero')).toBeInTheDocument();
  });

  it('26. project-mode content mutation is rejected before localStorage persistence', async () => {
    const projectFeat = feat('Project Readonly Feat');
    await initializeApplicationPersistence({
      backend: 'project',
      fetchImpl: fetchEnvelope(envelope({ content: [projectFeat] })),
    });
    const before = window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY);
    const result = saveAndPublishHomebrewContent([projectFeat], window.localStorage);
    expect(result).toMatchObject({ ok: false, error: { code: 'project-mutations-locked' } });
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBe(before);
  });

  it('27. project Character creation route opens after the Phase D core-CRUD lock is superseded', async () => {
    await initializeApplicationPersistence({ backend: 'project', fetchImpl: fetchEnvelope() });
    render(<MemoryRouter initialEntries={['/characters/new']}><AppRoutes /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Create Character' })).toBeInTheDocument();
  });

  it('28. project bootstrap performs no automatic legacy migration', async () => {
    const legacyFeat = feat('Unmigrated Feat');
    const legacyCharacter = character('Unmigrated Character');
    saveHomebrewContent([legacyFeat], window.localStorage);
    saveCharacters([legacyCharacter], window.localStorage);
    const contentBytes = window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY);
    const characterBytes = window.localStorage.getItem('dnd3.characters.v9');
    await initializeApplicationPersistence({ backend: 'project', fetchImpl: fetchEnvelope() });
    expect(contentRegistry.findFeat(legacyFeat.id)).toBeUndefined();
    expect(getApplicationCharacters()).toEqual([]);
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBe(contentBytes);
    expect(window.localStorage.getItem('dnd3.characters.v9')).toBe(characterBytes);
  });

  it('29. transport always requests the single fixed project-state endpoint', async () => {
    const mockFetch = vi.fn(async () => responseFor(envelope())) as unknown as typeof fetch;
    await fetchProjectState(mockFetch);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mockFetch).mock.calls[0][0]).toBe(PROJECT_STATE_ENDPOINT);
  });

  it('30. existing content-registry generation subscription updates on successful project bootstrap', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeContentRegistry(listener);
    const before = getContentRegistryGeneration();
    await initializeApplicationPersistence({
      backend: 'project',
      fetchImpl: fetchEnvelope(envelope({ content: [feat('Subscription Feat')] })),
    });
    expect(getContentRegistryGeneration()).toBeGreaterThan(before);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('31. Character catalog generation/subscription updates when project Characters hydrate', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCharacterCatalog(listener);
    const before = getCharacterCatalogGeneration();
    await initializeApplicationPersistence({
      backend: 'project',
      fetchImpl: fetchEnvelope(envelope({ characters: [character('Subscribed Hero')] })),
    });
    expect(getCharacterCatalogGeneration()).toBeGreaterThan(before);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('32. project Character readers return project snapshots by id while browser-local readers remain adapter-backed', async () => {
    const project = character('Project By Id');
    await initializeApplicationPersistence({
      backend: 'project',
      fetchImpl: fetchEnvelope(envelope({ characters: [project] })),
    });
    expect(getApplicationCharacterById(project.id)?.name).toBe('Project By Id');

    const local = character('Static By Id');
    saveCharacters([local], window.localStorage);
    await initializeApplicationPersistence({ backend: 'browser-local', storage: window.localStorage });
    expect(getApplicationCharacterById(local.id)?.name).toBe('Static By Id');
  });

  it('33. project Character workspace keeps later-phase mutations locked while Phase D core Edit is enabled', async () => {
    const project = character('Readonly Project Hero');
    await initializeApplicationPersistence({
      backend: 'project',
      fetchImpl: fetchEnvelope(envelope({ characters: [project] })),
    });
    render(<MemoryRouter initialEntries={[`/characters/${project.id}`]}><AppRoutes /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Readonly Project Hero' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Character' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Edit Character' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Level Up' })).toBeInTheDocument();
  });

  it('34. project Forge management remains readable after the Phase C content-mutation lock is superseded', async () => {
    const projectFeat = feat('Readonly Forge Feat');
    await initializeApplicationPersistence({
      backend: 'project',
      fetchImpl: fetchEnvelope(envelope({ content: [projectFeat] })),
    });
    render(<MemoryRouter initialEntries={['/creator-forge/feats']}><AppRoutes /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Readonly Forge Feat' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create Feat' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Duplicate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });
});
