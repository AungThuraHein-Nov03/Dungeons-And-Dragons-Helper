import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import type { Character, CharacterInput } from '../models/character';
import {
  createApplicationCharacter,
  deleteApplicationCharacter,
  updateApplicationCharacter,
} from '../services/applicationCharacterMutations';
import {
  getCharacterCatalogGeneration,
  listCatalogCharacters,
  subscribeCharacterCatalog,
} from '../services/characterCatalog';
import {
  CHARACTER_STORAGE_KEY,
  createCharacter,
  getCharacterById,
  loadCharacters,
} from '../services/characterStorage';
import { initializeContentCatalog } from '../services/contentCatalog';
import { configurePersistenceBackend, projectMutationsAreLocked } from '../services/persistenceBackend';
import {
  PROJECT_CHARACTERS_ENDPOINT,
  putProjectCharacters,
  type ProjectStateEnvelope,
} from '../services/projectPersistenceTransport';
import {
  getApplicationCharacterById,
  getApplicationCharacters,
  getApplicationProjectState,
  initializeApplicationPersistence,
} from '../services/projectState';
import { fighterCharacter, fighterInput } from './fixtures';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function envelope(
  characters: Character[] = [],
  characterRevision = '"c1"',
  contentRevision = '"h1"',
): ProjectStateEnvelope {
  return {
    content: [],
    characters,
    contentExists: true,
    charactersExists: true,
    contentRevision,
    characterRevision,
  };
}

async function bootProject(characters: Character[] = []) {
  const result = await initializeApplicationPersistence({
    backend: 'project',
    fetchImpl: async () => jsonResponse(envelope(characters)),
  });
  expect(result.ok).toBe(true);
}

function echoProjectPut(
  characterRevision = '"c2"',
  contentRevision = '"h1"',
) {
  return vi.fn<typeof fetch>(async (_input, init) => {
    const characters = JSON.parse(String(init?.body)) as Character[];
    return jsonResponse(envelope(characters, characterRevision, contentRevision));
  });
}

function staticStorageSnapshot(): string | null {
  return localStorage.getItem(CHARACTER_STORAGE_KEY);
}

describe('Project Persistence Phase D', () => {
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

  it('1. exact Character PUT endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(envelope()));
    await putProjectCharacters([], '"c1"', '"h1"', fetchMock);
    expect(fetchMock.mock.calls[0][0]).toBe(PROJECT_CHARACTERS_ENDPOINT);
  });

  it('2. PUT uses application/json', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(envelope()));
    await putProjectCharacters([], '"c1"', '"h1"', fetchMock);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('content-type')).toBe('application/json');
  });

  it('3. complete Character[] is sent', async () => {
    const character = fighterCharacter();
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(envelope([character])));
    await putProjectCharacters([character], '"c1"', '"h1"', fetchMock);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual([character]);
  });

  it('4. expected Character revision is sent', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(envelope()));
    await putProjectCharacters([], '"c1"', '"h1"', fetchMock);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('if-match')).toBe('"c1"');
  });

  it('5. expected content revision is sent', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(envelope()));
    await putProjectCharacters([], '"c1"', '"h1"', fetchMock);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('x-dnd3-content-if-match')).toBe('"h1"');
  });

  it('6. project Create uses existing Character-v9 mutation semantics', async () => {
    await bootProject();
    vi.stubGlobal('fetch', echoProjectPut());
    const result = await createApplicationCharacter(fighterInput({ name: 'Project Ren' }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.character?.name).toBe('Project Ren');
      expect(result.character?.playState).toBeDefined();
      expect(result.character?.createdAt).toBeTruthy();
      expect(result.character?.updatedAt).toBe(result.character?.createdAt);
    }
  });

  it('7. successful Create persists before catalog publication', async () => {
    await bootProject();
    let resolvePut!: (response: Response) => void;
    const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((resolve) => {
      const characters = JSON.parse(String(init?.body)) as Character[];
      resolvePut = (response) => resolve(response.status ? response : jsonResponse(envelope(characters, '"c2"')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const before = getCharacterCatalogGeneration();
    const pending = createApplicationCharacter(fighterInput({ name: 'Deferred Ren' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(getCharacterCatalogGeneration()).toBe(before);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Character[];
    resolvePut(jsonResponse(envelope(body, '"c2"')));
    expect((await pending).ok).toBe(true);
    expect(getCharacterCatalogGeneration()).toBeGreaterThan(before);
  });

  it('8. successful Create updates Character catalog', async () => {
    await bootProject();
    vi.stubGlobal('fetch', echoProjectPut());
    const result = await createApplicationCharacter(fighterInput({ name: 'Catalog Ren' }));
    expect(result.ok).toBe(true);
    expect(listCatalogCharacters().some((character) => character.name === 'Catalog Ren')).toBe(true);
  });

  it('9. successful Create advances Character revision', async () => {
    await bootProject();
    vi.stubGlobal('fetch', echoProjectPut('"c2"'));
    await createApplicationCharacter(fighterInput());
    expect(getApplicationProjectState().characterRevision).toBe('"c2"');
  });

  it('10. content revision handling follows server response contract', async () => {
    await bootProject();
    vi.stubGlobal('fetch', echoProjectPut('"c2"', '"h2"'));
    await createApplicationCharacter(fighterInput());
    expect(getApplicationProjectState().contentRevision).toBe('"h2"');
  });

  it('11. failed Create does not publish', async () => {
    await bootProject();
    const before = getCharacterCatalogGeneration();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'write-failed', message: 'nope' } }, 500)));
    expect((await createApplicationCharacter(fighterInput())).ok).toBe(false);
    expect(getCharacterCatalogGeneration()).toBe(before);
    expect(listCatalogCharacters()).toEqual([]);
  });

  it('12. failed Create does not report success navigation eligibility', async () => {
    await bootProject();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'write-failed', message: 'nope' } }, 500)));
    const result = await createApplicationCharacter(fighterInput());
    const wouldNavigate = result.ok && Boolean(result.character);
    expect(wouldNavigate).toBe(false);
  });

  it('13. failed Create does not write localStorage', async () => {
    await bootProject();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'write-failed', message: 'nope' } }, 500)));
    await createApplicationCharacter(fighterInput());
    expect(staticStorageSnapshot()).toBeNull();
  });

  it('14. project Edit uses authoritative Character snapshot', async () => {
    const original = fighterCharacter({ name: 'Authoritative Ren' });
    await bootProject([original]);
    vi.stubGlobal('fetch', echoProjectPut());
    const result = await updateApplicationCharacter(original.id, fighterInput({ name: 'Edited Ren' }));
    expect(result.ok).toBe(true);
    expect(getApplicationCharacterById(original.id)?.name).toBe('Edited Ren');
  });

  it('15. Edit preserves Character ID', async () => {
    const original = fighterCharacter();
    await bootProject([original]);
    vi.stubGlobal('fetch', echoProjectPut());
    const result = await updateApplicationCharacter(original.id, fighterInput({ name: 'Same ID' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.character?.id).toBe(original.id);
  });

  it('16. Edit preserves existing v9 semantics', async () => {
    const original = fighterCharacter();
    await bootProject([original]);
    vi.stubGlobal('fetch', echoProjectPut());
    const result = await updateApplicationCharacter(original.id, fighterInput({ name: 'Semantics' }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.character?.createdAt).toBe(original.createdAt);
      expect(Date.parse(result.character?.updatedAt ?? '')).toBeGreaterThan(Date.parse(original.updatedAt));
      expect(result.character?.playState).toEqual(original.playState);
    }
  });

  it('17. successful Edit persists before publication', async () => {
    const original = fighterCharacter();
    await bootProject([original]);
    let resolvePut!: (response: Response) => void;
    const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((resolve) => {
      const body = JSON.parse(String(init?.body)) as Character[];
      resolvePut = () => resolve(jsonResponse(envelope(body, '"c2"')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = updateApplicationCharacter(original.id, fighterInput({ name: 'Deferred Edit' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(getApplicationCharacterById(original.id)?.name).toBe(original.name);
    resolvePut(jsonResponse(envelope([], '"unused"')));
    expect((await pending).ok).toBe(true);
    expect(getApplicationCharacterById(original.id)?.name).toBe('Deferred Edit');
  });

  it('18. successful Edit updates Character catalog', async () => {
    const original = fighterCharacter();
    await bootProject([original]);
    vi.stubGlobal('fetch', echoProjectPut());
    await updateApplicationCharacter(original.id, fighterInput({ name: 'Published Edit' }));
    expect(listCatalogCharacters()[0]?.name).toBe('Published Edit');
  });

  it('19. failed Edit leaves catalog unchanged', async () => {
    const original = fighterCharacter();
    await bootProject([original]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'write-failed', message: 'nope' } }, 500)));
    await updateApplicationCharacter(original.id, fighterInput({ name: 'Rejected Edit' }));
    expect(getApplicationCharacterById(original.id)).toEqual(original);
  });

  it('20. project Delete uses authoritative Character snapshot', async () => {
    const original = fighterCharacter();
    await bootProject([original]);
    const fetchMock = echoProjectPut();
    vi.stubGlobal('fetch', fetchMock);
    expect((await deleteApplicationCharacter(original.id)).ok).toBe(true);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual([]);
  });

  it('21. successful Delete persists before publication', async () => {
    const original = fighterCharacter();
    await bootProject([original]);
    let resolvePut!: () => void;
    const fetchMock = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => {
      resolvePut = () => resolve(jsonResponse(envelope([], '"c2"')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = deleteApplicationCharacter(original.id);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(getApplicationCharacterById(original.id)).toBeDefined();
    resolvePut();
    expect((await pending).ok).toBe(true);
    expect(getApplicationCharacterById(original.id)).toBeUndefined();
  });

  it('22. successful Delete removes Character only after PUT success', async () => {
    const original = fighterCharacter();
    await bootProject([original]);
    vi.stubGlobal('fetch', echoProjectPut());
    await deleteApplicationCharacter(original.id);
    expect(getApplicationCharacters()).toEqual([]);
  });

  it('23. failed Delete leaves Character visible', async () => {
    const original = fighterCharacter();
    await bootProject([original]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'write-failed', message: 'nope' } }, 500)));
    await deleteApplicationCharacter(original.id);
    expect(getApplicationCharacterById(original.id)).toEqual(original);
  });

  it('24. stale Character revision fails closed', async () => {
    await bootProject();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'stale-characters', message: 'stale' } }, 409)));
    const result = await createApplicationCharacter(fighterInput());
    expect(result.ok).toBe(false);
    expect(listCatalogCharacters()).toEqual([]);
  });

  it('25. stale content revision fails closed', async () => {
    await bootProject();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'stale-content', message: 'stale' } }, 409)));
    const result = await createApplicationCharacter(fighterInput());
    expect(result.ok).toBe(false);
    expect(listCatalogCharacters()).toEqual([]);
  });

  it('26. stale mutation is not automatically retried', async () => {
    await bootProject();
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'stale-content', message: 'stale' } }, 409));
    vi.stubGlobal('fetch', fetchMock);
    await createApplicationCharacter(fighterInput());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('27. network failure fails closed', async () => {
    await bootProject();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => { throw new Error('offline'); }));
    expect((await createApplicationCharacter(fighterInput())).ok).toBe(false);
    expect(listCatalogCharacters()).toEqual([]);
  });

  it('28. malformed success response fails closed', async () => {
    await bootProject();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ nope: true })));
    expect((await createApplicationCharacter(fighterInput())).ok).toBe(false);
    expect(listCatalogCharacters()).toEqual([]);
  });

  it('29. Character validation rejection fails closed', async () => {
    await bootProject();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'invalid-characters', message: 'invalid' } }, 422)));
    expect((await createApplicationCharacter(fighterInput())).ok).toBe(false);
    expect(listCatalogCharacters()).toEqual([]);
  });

  it('30. content compatibility rejection fails closed', async () => {
    await bootProject();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'incompatible-characters', message: 'incompatible' } }, 422)));
    expect((await createApplicationCharacter(fighterInput())).ok).toBe(false);
    expect(listCatalogCharacters()).toEqual([]);
  });

  it('31. revisions remain unchanged after failed mutation', async () => {
    await bootProject();
    const before = getApplicationProjectState();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'write-failed', message: 'nope' } }, 500)));
    await createApplicationCharacter(fighterInput());
    expect(getApplicationProjectState()).toEqual(before);
  });

  it('32. Character catalog generation/subscribers update after success', async () => {
    await bootProject();
    const listener = vi.fn();
    const unsubscribe = subscribeCharacterCatalog(listener);
    vi.stubGlobal('fetch', echoProjectPut());
    await createApplicationCharacter(fighterInput());
    unsubscribe();
    expect(listener).toHaveBeenCalled();
  });

  it('33. Create Character control enabled in project mode', async () => {
    await bootProject();
    render(<MemoryRouter initialEntries={['/characters']}><App /></MemoryRouter>);
    expect(screen.getAllByRole('link', { name: 'Create Character' }).length).toBeGreaterThan(0);
  });

  it('34. core Edit Character control enabled in project mode', async () => {
    const original = fighterCharacter({ name: 'Editable Ren' });
    await bootProject([original]);
    render(<MemoryRouter initialEntries={['/characters']}><App /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Edit Editable Ren' })).toBeInTheDocument();
  });

  it('35. Delete Character control enabled in project mode', async () => {
    const original = fighterCharacter({ name: 'Deletable Ren' });
    await bootProject([original]);
    render(<MemoryRouter initialEntries={['/characters']}><App /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('36. Phase E supersedes the PLAY mutation lock while the Level-Up gate remains globally identifiable', async () => {
    const original = fighterCharacter();
    await bootProject([original]);
    expect(projectMutationsAreLocked()).toBe(true);
    render(<MemoryRouter initialEntries={[`/characters/${original.id}`]}><App /></MemoryRouter>);
    expect(document.querySelector('fieldset.project-readonly-fieldset')).not.toBeDisabled();
  });

  it('37. Phase E supersedes the Inventory mutation lock in project mode', async () => {
    const original = fighterCharacter();
    await bootProject([original]);
    render(<MemoryRouter initialEntries={[`/characters/${original.id}/inventory`]}><App /></MemoryRouter>);
    expect(document.querySelector('fieldset.project-readonly-fieldset')).not.toBeDisabled();
  });

  it('38. Phase F supersedes the Level-Up project lock', async () => {
    const original = fighterCharacter();
    await bootProject([original]);
    render(<MemoryRouter initialEntries={[`/characters/${original.id}/level-up`]}><App /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: `Level Up ${original.name}` })).toBeInTheDocument();
  });

  it('39. static Create still uses existing localStorage behavior', async () => {
    configurePersistenceBackend('browser-local');
    const result = await createApplicationCharacter(fighterInput({ name: 'Static Create' }));
    expect(result.ok).toBe(true);
    expect(loadCharacters(localStorage)[0]?.name).toBe('Static Create');
  });

  it('40. static Edit still uses existing localStorage behavior', async () => {
    configurePersistenceBackend('browser-local');
    const original = createCharacter(fighterInput({ name: 'Static Before' }), localStorage);
    const result = await updateApplicationCharacter(original.id, fighterInput({ name: 'Static After' }));
    expect(result.ok).toBe(true);
    expect(getCharacterById(original.id, localStorage)?.name).toBe('Static After');
  });

  it('41. static Delete still uses existing localStorage behavior', async () => {
    configurePersistenceBackend('browser-local');
    const original = createCharacter(fighterInput(), localStorage);
    expect((await deleteApplicationCharacter(original.id)).ok).toBe(true);
    expect(getCharacterById(original.id, localStorage)).toBeUndefined();
  });

  it('42. project mode never falls back to Character localStorage', async () => {
    await bootProject();
    const before = staticStorageSnapshot();
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    vi.stubGlobal('fetch', echoProjectPut());
    await createApplicationCharacter(fighterInput());
    expect(staticStorageSnapshot()).toBe(before);
    expect(spy.mock.calls.some(([key]) => key === CHARACTER_STORAGE_KEY)).toBe(false);
  });

  it('43. project Character mutation validates against effective content registry', async () => {
    await bootProject();
    const invalidInput = { ...fighterInput(), startingClassId: 'homebrew:local:class:missing' } as CharacterInput;
    const fetchMock = echoProjectPut();
    vi.stubGlobal('fetch', fetchMock);
    const result = await createApplicationCharacter(invalidInput);
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('44. content change/revision race rejects Character mutation', async () => {
    await bootProject();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'stale-content', message: 'changed' } }, 409)));
    const before = getApplicationProjectState();
    await createApplicationCharacter(fighterInput());
    expect(getApplicationProjectState()).toEqual(before);
  });

  it('45. Character change/revision race rejects Character mutation', async () => {
    await bootProject();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'stale-characters', message: 'changed' } }, 409)));
    const before = getApplicationProjectState();
    await createApplicationCharacter(fighterInput());
    expect(getApplicationProjectState()).toEqual(before);
  });

  it('46. no automatic Character migration occurs', async () => {
    localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify([fighterCharacter({ name: 'Local Only' })]));
    await bootProject([]);
    expect(getApplicationCharacters()).toEqual([]);
  });

  it('47. Character v9 schema/storage version remains unchanged', () => {
    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v9');
    expect('version' in fighterCharacter()).toBe(false);
  });

  it('48. successful Character mutation is visible through existing project read facade', async () => {
    await bootProject();
    vi.stubGlobal('fetch', echoProjectPut());
    const result = await createApplicationCharacter(fighterInput({ name: 'Facade Visible' }));
    expect(result.ok).toBe(true);
    if (result.ok && result.character) {
      expect(getApplicationCharacterById(result.character.id)?.name).toBe('Facade Visible');
    }
  });
});
