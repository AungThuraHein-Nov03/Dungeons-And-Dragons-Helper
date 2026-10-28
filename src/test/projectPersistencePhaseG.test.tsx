import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import type { Character } from '../models/character';
import type { ContentEntry } from '../models/content';
import { createCharacter, CHARACTER_STORAGE_KEY } from '../services/characterStorage';
import { getProjectContentEntries, initializeContentCatalog } from '../services/contentCatalog';
import { contentRegistry, createContentRegistry } from '../services/contentRegistry';
import { HOMEBREW_CONTENT_STORAGE_KEY } from '../services/homebrewContentStorage';
import { configurePersistenceBackend } from '../services/persistenceBackend';
import {
  executeProjectMigration,
  migrationCanonicalEqual,
  planCurrentProjectCharacterV10Migration,
  planProjectMigration,
  readLegacyBrowserMigrationSources,
  type LegacyMigrationSources,
  type ProjectMigrationPlan,
} from '../services/projectMigration';
import {
  PROJECT_MIGRATION_ENDPOINT,
  type ProjectStateEnvelope,
} from '../services/projectPersistenceTransport';
import {
  getApplicationCharacters,
  getApplicationProjectState,
  initializeApplicationPersistence,
} from '../services/projectState';
import { ROLL_HISTORY_STORAGE_KEY } from '../services/rollHistory';
import { playSessionStorageKey } from '../services/playSessionState';
import { DAGGER_ID, LIGHT_CROSSBOW_ID, SCIMITAR_ID, SHORTSWORD_ID, fighterInput } from './fixtures';

const FEAT_ID = 'homebrew:local:feat:phase-g-feat';
const OTHER_FEAT_ID = 'homebrew:local:feat:phase-g-other';
const EK_ID = 'homebrew:local:subclass:abf1d7a2-e4fc-4c4b-9c23-02e87b77758f';

function feat(name = 'Phase G Feat', id = FEAT_ID): ContentEntry {
  return {
    id,
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

function projectCharacter(content: readonly ContentEntry[] = [], patch = {}): Character {
  const input = fighterInput(patch);
  input.classProgressions[0].weaponMasterySelections = [DAGGER_ID, LIGHT_CROSSBOW_ID, SCIMITAR_ID, SHORTSWORD_ID];
  return createCharacter(input, memoryStorage(), createContentRegistry(content));
}

function envelope(
  content: ContentEntry[] = [],
  characters: Character[] = [],
  contentRevision = '"h1"',
  characterRevision = '"c1"',
  characterMigrationRequired = false,
): ProjectStateEnvelope {
  return {
    content,
    characters,
    contentExists: true,
    charactersExists: true,
    characterMigrationRequired,
    contentRevision,
    characterRevision,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function bootProject(content: ContentEntry[] = [], characters: Character[] = [], h = '"h1"', c = '"c1"') {
  const result = await initializeApplicationPersistence({
    backend: 'project',
    fetchImpl: async () => jsonResponse(envelope(content, characters, h, c)),
  });
  expect(result.ok).toBe(true);
}

function echoMigrationFetch(nextH = '"h2"', nextC = '"c2"') {
  return vi.fn<typeof fetch>(async (input, init) => {
    expect(input).toBe(PROJECT_MIGRATION_ENDPOINT);
    const body = JSON.parse(String(init?.body)) as { content: ContentEntry[]; characters: Character[] };
    return jsonResponse(envelope(body.content, body.characters, nextH, nextC));
  });
}

function sources(content: ContentEntry[] = [], characters: unknown[] = []): LegacyMigrationSources {
  return { content, characters };
}

function plan(content: ContentEntry[] = [], characters: unknown[] = []): ProjectMigrationPlan {
  return planProjectMigration(sources(content, characters));
}

describe('Project Persistence Phase G application migration', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    configurePersistenceBackend('browser-local');
    initializeContentCatalog(localStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    configurePersistenceBackend('browser-local');
    initializeContentCatalog(localStorage);
    localStorage.clear();
    sessionStorage.clear();
  });

  it('A1. project bootstrap never imports legacy browser-local data automatically', async () => {
    localStorage.setItem(HOMEBREW_CONTENT_STORAGE_KEY, JSON.stringify([feat()]));
    localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify([projectCharacter()]));
    await bootProject();
    expect(getProjectContentEntries()).toEqual([]);
    expect(getApplicationCharacters()).toEqual([]);
  });

  it('A2. migration page performs no legacy read or export request merely by opening', async () => {
    await bootProject();
    const getSpy = vi.spyOn(Storage.prototype, 'getItem');
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchSpy);
    render(<MemoryRouter initialEntries={['/creator-forge/migration']}><App /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Legacy Migration' })).toBeInTheDocument();
    expect(getSpy.mock.calls.some(([key]) => key === HOMEBREW_CONTENT_STORAGE_KEY || key === CHARACTER_STORAGE_KEY)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('A3. explicit legacy content read parses canonical ContentEntry[]', async () => {
    localStorage.setItem(HOMEBREW_CONTENT_STORAGE_KEY, JSON.stringify([feat()]));
    const loaded = readLegacyBrowserMigrationSources();
    expect(loaded.ok && loaded.sources.content).toEqual([feat()]);
  });

  it('A4. explicit legacy Character read preserves canonical Character v9 records', () => {
    const character = projectCharacter();
    localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify([character]));
    const loaded = readLegacyBrowserMigrationSources();
    expect(loaded.ok && loaded.sources.characters).toEqual([character]);
  });

  it('A5. incoming IDs are preserved exactly in the prospective migration', async () => {
    await bootProject();
    const imported = feat();
    const candidate = plan([imported]);
    expect(candidate.prospectiveContent[0].id).toBe(imported.id);
  });

  it('A6. absent content ID is classified as addition', async () => {
    await bootProject();
    expect(plan([feat()]).contentItems[0]).toMatchObject({ id: FEAT_ID, classification: 'addition' });
  });

  it('A7. absent Character ID is classified as addition', async () => {
    await bootProject();
    const character = projectCharacter();
    expect(plan([], [character]).characterItems[0]).toMatchObject({ id: character.id, classification: 'addition' });
  });

  it('A8. identical content ID/data is a no-op', async () => {
    const imported = feat();
    await bootProject([imported]);
    expect(plan([structuredClone(imported)]).contentItems[0].classification).toBe('identical');
  });

  it('A9. identical Character ID/data is a no-op', async () => {
    const character = projectCharacter();
    await bootProject([], [character]);
    expect(plan([], [structuredClone(character)]).characterItems[0].classification).toBe('identical');
  });

  it('A10. differing same content ID is a conflict', async () => {
    await bootProject([feat('Project')]);
    expect(plan([feat('Incoming')]).contentItems[0].classification).toBe('conflict');
  });

  it('A11. differing same Character ID is a conflict', async () => {
    const character = projectCharacter();
    await bootProject([], [character]);
    expect(plan([], [{ ...character, name: 'Incoming' }]).characterItems[0].classification).toBe('conflict');
  });

  it('A12. a content conflict blocks execution before any write', async () => {
    await bootProject([feat('Project')]);
    const migration = plan([feat('Incoming')]);
    const fetchSpy = echoMigrationFetch();
    vi.stubGlobal('fetch', fetchSpy);
    expect((await executeProjectMigration(migration)).ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('A13. validation failure blocks execution before any write', async () => {
    await bootProject();
    const invalid = { ...feat(), id: 'invalid-id' } as ContentEntry;
    const migration = plan([invalid]);
    const fetchSpy = echoMigrationFetch();
    vi.stubGlobal('fetch', fetchSpy);
    expect((await executeProjectMigration(migration)).ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('A14. mixed valid + invalid input cannot partially migrate', async () => {
    await bootProject();
    const migration = plan([feat(), { ...feat('Broken', OTHER_FEAT_ID), id: 'bad' } as ContentEntry]);
    const fetchSpy = echoMigrationFetch();
    vi.stubGlobal('fetch', fetchSpy);
    expect(migration.ok).toBe(false);
    expect((await executeProjectMigration(migration)).ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getProjectContentEntries()).toEqual([]);
  });

  it('A15. duplicate incoming IDs are blocked instead of allocating replacements', async () => {
    await bootProject();
    const migration = plan([feat('One'), feat('Two')]);
    expect(migration.ok).toBe(false);
    expect(migration.blockers.join(' ')).toMatch(/Duplicate incoming content ID/);
  });

  it('A16. same names with different IDs are independent identity additions', async () => {
    await bootProject();
    const migration = plan([feat('Same', FEAT_ID), feat('Same', OTHER_FEAT_ID)]);
    expect(migration.ok).toBe(true);
    expect(migration.contentItems.map((item) => item.classification)).toEqual(['addition', 'addition']);
  });

  it('A17. prospective combined content forms the effective canonical registry', async () => {
    await bootProject();
    const migration = plan([feat()]);
    expect(() => createContentRegistry(migration.prospectiveContent)).not.toThrow();
  });

  it('A18. incoming Character is validated against prospective incoming content', async () => {
    const importedFeat = feat();
    const character = projectCharacter([importedFeat], { manualFeats: [{ featId: importedFeat.id, choices: {} }] });
    await bootProject();
    const migration = plan([importedFeat], [character]);
    expect(migration.ok).toBe(true);
    expect(migration.characterItems[0].classification).toBe('addition');
  });

  it('A19. failed migration leaves content catalog unchanged', async () => {
    await bootProject();
    const before = getProjectContentEntries();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'write-failed', message: 'nope' } }, 500)));
    expect((await executeProjectMigration(plan([feat()]))).ok).toBe(false);
    expect(getProjectContentEntries()).toEqual(before);
  });

  it('A20. failed migration leaves Character catalog unchanged', async () => {
    const existing = projectCharacter();
    await bootProject([], [existing]);
    const incoming = projectCharacter([], { name: 'Incoming' });
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'write-failed', message: 'nope' } }, 500)));
    expect((await executeProjectMigration(plan([], [incoming]))).ok).toBe(false);
    expect(getApplicationCharacters()).toEqual([existing]);
  });

  it('A21. successful migration publishes imported content', async () => {
    await bootProject();
    vi.stubGlobal('fetch', echoMigrationFetch());
    expect((await executeProjectMigration(plan([feat()]))).ok).toBe(true);
    expect(contentRegistry.getById(FEAT_ID)?.name).toBe('Phase G Feat');
  });

  it('A22. successful migration publishes imported Characters', async () => {
    const character = projectCharacter();
    await bootProject();
    vi.stubGlobal('fetch', echoMigrationFetch());
    expect((await executeProjectMigration(plan([], [character]))).ok).toBe(true);
    expect(getApplicationCharacters().map((entry) => entry.id)).toContain(character.id);
  });

  it('A23. successful combined migration accepts both advanced revisions', async () => {
    await bootProject();
    vi.stubGlobal('fetch', echoMigrationFetch('"h2"', '"c2"'));
    await executeProjectMigration(plan([feat()], [projectCharacter()]));
    expect(getApplicationProjectState()).toMatchObject({ contentRevision: '"h2"', characterRevision: '"c2"' });
  });

  it('A24. stale content revision fails closed', async () => {
    await bootProject();
    const migration = plan([feat()]);
    await bootProject([], [], '"h2"', '"c1"');
    const fetchSpy = echoMigrationFetch();
    vi.stubGlobal('fetch', fetchSpy);
    expect((await executeProjectMigration(migration)).ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('A25. stale Character revision fails closed', async () => {
    await bootProject();
    const migration = plan([], [projectCharacter()]);
    await bootProject([], [], '"h1"', '"c2"');
    const fetchSpy = echoMigrationFetch();
    vi.stubGlobal('fetch', fetchSpy);
    expect((await executeProjectMigration(migration)).ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('A26. stale server rejection is not automatically retried', async () => {
    await bootProject();
    const fetchSpy = vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'stale-content', message: 'stale' } }, 409));
    vi.stubGlobal('fetch', fetchSpy);
    expect((await executeProjectMigration(plan([feat()]))).ok).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('A27. successful migration leaves legacy content localStorage intact', async () => {
    const raw = JSON.stringify([feat()]);
    localStorage.setItem(HOMEBREW_CONTENT_STORAGE_KEY, raw);
    await bootProject();
    vi.stubGlobal('fetch', echoMigrationFetch());
    const loaded = readLegacyBrowserMigrationSources();
    if (!loaded.ok) throw new Error(loaded.message);
    await executeProjectMigration(planProjectMigration(loaded.sources));
    expect(localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBe(raw);
  });

  it('A28. successful migration leaves legacy Character localStorage intact', async () => {
    const character = projectCharacter();
    const raw = JSON.stringify([character]);
    localStorage.setItem(CHARACTER_STORAGE_KEY, raw);
    await bootProject();
    vi.stubGlobal('fetch', echoMigrationFetch());
    const loaded = readLegacyBrowserMigrationSources();
    if (!loaded.ok) throw new Error(loaded.message);
    await executeProjectMigration(planProjectMigration(loaded.sources));
    expect(localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(raw);
  });

  it('A29. migration does not clear unrelated or legacy keys', async () => {
    localStorage.setItem(HOMEBREW_CONTENT_STORAGE_KEY, JSON.stringify([feat()]));
    localStorage.setItem('phase-g-sentinel', 'keep');
    await bootProject();
    vi.stubGlobal('fetch', echoMigrationFetch());
    const loaded = readLegacyBrowserMigrationSources();
    if (!loaded.ok) throw new Error(loaded.message);
    await executeProjectMigration(planProjectMigration(loaded.sources));
    expect(localStorage.getItem('phase-g-sentinel')).toBe('keep');
  });

  it('A30. project mode never falls back to legacy localStorage without explicit migration', async () => {
    const legacy = projectCharacter();
    localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify([legacy]));
    await bootProject();
    expect(getApplicationCharacters()).toEqual([]);
  });

  it('A31. browser-local mode remains unchanged and migration planning is unavailable', async () => {
    configurePersistenceBackend('browser-local');
    initializeContentCatalog(localStorage);
    expect(planProjectMigration(sources([feat()])).ok).toBe(false);
  });

  it('A32. migration cannot overwrite bundled SRD content', async () => {
    await bootProject();
    const fighter = contentRegistry.getAll('class').find((entry) => entry.name === 'Fighter')!;
    const forged = { ...fighter, source: { type: 'homebrew', namespace: 'local' } } as unknown as ContentEntry;
    const migration = plan([forged]);
    expect(migration.ok).toBe(false);
  });

  it('A33. malformed imported content is rejected during explicit source inspection', () => {
    localStorage.setItem(HOMEBREW_CONTENT_STORAGE_KEY, JSON.stringify([{ id: 'broken' }]));
    const loaded = readLegacyBrowserMigrationSources();
    expect(loaded.ok).toBe(false);
  });

  it('A34. malformed imported Character is rejected by prospective Character-v10 validation', async () => {
    await bootProject();
    const migration = plan([], [{ id: 'broken', name: 'Broken' }]);
    expect(migration.ok).toBe(false);
    expect(migration.blockers.join(' ')).toMatch(/Invalid incoming Character v10/);
  });

  it('A35. conflicting content is never routed through edit/delete reference rewriting', async () => {
    await bootProject([feat('Project')]);
    const migration = plan([feat('Incoming')]);
    expect(migration.ok).toBe(false);
    expect(getProjectContentEntries()[0].name).toBe('Project');
  });

  it('A36. Character v10 storage key is authoritative', () => {
    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v10');
  });

  it('A37. migration does not persist or clear roll history', async () => {
    localStorage.setItem(ROLL_HISTORY_STORAGE_KEY, '[{"sentinel":true}]');
    await bootProject();
    vi.stubGlobal('fetch', echoMigrationFetch());
    await executeProjectMigration(plan([feat()]));
    expect(localStorage.getItem(ROLL_HISTORY_STORAGE_KEY)).toBe('[{"sentinel":true}]');
  });

  it('A38. migration does not persist or clear conditions/concentration/session state', async () => {
    const character = projectCharacter();
    const key = playSessionStorageKey(character.id);
    sessionStorage.setItem(key, JSON.stringify({ conditions: ['prone'], activeEffectIds: [] }));
    await bootProject();
    vi.stubGlobal('fetch', echoMigrationFetch());
    await executeProjectMigration(plan([], [character]));
    expect(sessionStorage.getItem(key)).toContain('prone');
    expect(getApplicationCharacters()[0]).not.toHaveProperty('conditions');
  });

  it('A39. migration UI requires explicit confirmation before writing', async () => {
    const user = userEvent.setup();
    localStorage.setItem(HOMEBREW_CONTENT_STORAGE_KEY, JSON.stringify([feat()]));
    await bootProject();
    const fetchSpy = echoMigrationFetch();
    vi.stubGlobal('fetch', fetchSpy);
    render(<MemoryRouter initialEntries={['/creator-forge/migration']}><App /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Inspect legacy browser data' }));
    const migrate = screen.getByRole('button', { name: 'Migrate to Project' });
    expect(migrate).toBeDisabled();
    expect(fetchSpy).not.toHaveBeenCalled();
    await user.click(screen.getByRole('checkbox', { name: /I reviewed this migration plan/ }));
    expect(migrate).toBeEnabled();
  });

  it('A40. migration UI reports additions', async () => {
    const user = userEvent.setup();
    localStorage.setItem(HOMEBREW_CONTENT_STORAGE_KEY, JSON.stringify([feat()]));
    await bootProject();
    render(<MemoryRouter initialEntries={['/creator-forge/migration']}><App /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Inspect legacy browser data' }));
    expect(screen.getByText(/1 additions · 0 identical\/no-op · 0 conflicts/)).toBeInTheDocument();
  });

  it('A41. migration UI reports identical/no-op items', async () => {
    const user = userEvent.setup();
    const imported = feat();
    localStorage.setItem(HOMEBREW_CONTENT_STORAGE_KEY, JSON.stringify([imported]));
    await bootProject([imported]);
    render(<MemoryRouter initialEntries={['/creator-forge/migration']}><App /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Inspect legacy browser data' }));
    expect(screen.getByText(/0 additions · 1 identical\/no-op · 0 conflicts/)).toBeInTheDocument();
    expect(screen.getByText('IDENTICAL / NO-OP')).toBeInTheDocument();
  });

  it('A42. migration UI reports conflicts and blocks confirmation', async () => {
    const user = userEvent.setup();
    localStorage.setItem(HOMEBREW_CONTENT_STORAGE_KEY, JSON.stringify([feat('Incoming')]));
    await bootProject([feat('Project')]);
    render(<MemoryRouter initialEntries={['/creator-forge/migration']}><App /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Inspect legacy browser data' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Migration blocked/);
    expect(screen.queryByRole('button', { name: 'Migrate to Project' })).not.toBeInTheDocument();
  });

  it('A43. migration UI reports bounded validation failure', async () => {
    const user = userEvent.setup();
    localStorage.setItem(HOMEBREW_CONTENT_STORAGE_KEY, JSON.stringify([{ id: 'broken' }]));
    await bootProject();
    render(<MemoryRouter initialEntries={['/creator-forge/migration']}><App /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Inspect legacy browser data' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid ContentEntry shape/i);
  });

  it('A44. exported EK file is never discovered or imported until its explicit button is pressed', async () => {
    await bootProject();
    const fetchSpy = vi.fn<typeof fetch>(async () => jsonResponse({ content: [{ ...feat(), id: EK_ID }] }));
    vi.stubGlobal('fetch', fetchSpy);
    render(<MemoryRouter initialEntries={['/creator-forge/migration']}><App /></MemoryRouter>);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(contentRegistry.getById(EK_ID)).toBeUndefined();
  });

  it('A45. canonical comparison ignores object key ordering but not data differences', () => {
    expect(migrationCanonicalEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(migrationCanonicalEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('A46. execute sends complete prospective content and Character arrays to the fixed migration endpoint', async () => {
    const existing = projectCharacter();
    const incoming = projectCharacter([], { name: 'Incoming' });
    await bootProject([], [existing]);
    const fetchSpy = echoMigrationFetch();
    vi.stubGlobal('fetch', fetchSpy);
    await executeProjectMigration(plan([feat()], [incoming]));
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)) as { content: ContentEntry[]; characters: Character[] };
    expect(body.content.map((entry) => entry.id)).toEqual([FEAT_ID]);
    expect(body.characters.map((entry) => entry.id)).toEqual([existing.id, incoming.id]);
  });

  it('A47. explicit migration preserves source IDs rather than allocating replacements', async () => {
    const imported = feat();
    const character = projectCharacter();
    await bootProject();
    const fetchSpy = echoMigrationFetch();
    vi.stubGlobal('fetch', fetchSpy);
    await executeProjectMigration(plan([imported], [character]));
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)) as { content: ContentEntry[]; characters: Character[] };
    expect(body.content[0].id).toBe(imported.id);
    expect(body.characters[0].id).toBe(character.id);
  });

  it('A48. explicit preserved-export button uses only the fixed export endpoint and still requires later confirmation', async () => {
    const user = userEvent.setup();
    await bootProject();
    const ek = feat('Eldritch Knight', 'homebrew:local:feat:ek-test');
    const fetchSpy = vi.fn<typeof fetch>(async () => jsonResponse({ content: [ek] }));
    vi.stubGlobal('fetch', fetchSpy);
    render(<MemoryRouter initialEntries={['/creator-forge/migration']}><App /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Load preserved Eldritch Knight export' }));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Migrate to Project' })).toBeDisabled();
  });

  it('A49. v9-only project migration is explicitly inspectable and writes the in-memory v10 conversion only after confirmation', async () => {
    const user = userEvent.setup();
    const character = projectCharacter();
    const result = await initializeApplicationPersistence({
      backend: 'project',
      fetchImpl: async () => jsonResponse(envelope([], [character], '"h1"', '"v9"', true)),
    });
    expect(result.ok).toBe(true);
    expect(planCurrentProjectCharacterV10Migration()).toMatchObject({ ok: true, sourceCharacterCount: 1 });

    const fetchSpy = echoMigrationFetch();
    vi.stubGlobal('fetch', fetchSpy);
    render(<MemoryRouter initialEntries={['/creator-forge/migration']}><App /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Inspect project Character v9 → v10 migration' }));
    const migrate = screen.getByRole('button', { name: 'Migrate to Project' });
    expect(migrate).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /I reviewed this migration plan/ }));
    await user.click(migrate);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(getApplicationProjectState().characterMigrationRequired).toBe(false);
  });
});
