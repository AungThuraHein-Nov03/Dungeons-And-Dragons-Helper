import type { Character } from '../models/character';
import { clearCharacterCatalog, findCatalogCharacter, hydrateCharacterCatalog, listCatalogCharacters } from './characterCatalog';
import { degradeContentCatalog, initializeContentCatalog, initializeContentCatalogFromEntries } from './contentCatalog';
import { createContentRegistry } from './contentRegistry';
import { getCharacterById, isCharacter, loadCharacters } from './characterStorage';
import { validateHomebrewContent } from './homebrewContentStorage';
import { configurePersistenceBackend, getPersistenceBackend, selectPersistenceBackend, type PersistenceBackend } from './persistenceBackend';
import { fetchProjectState, ProjectTransportError, type ProjectStateEnvelope } from './projectPersistenceTransport';

export type ProjectStateStatus = 'idle' | 'ready' | 'degraded';

export interface ApplicationProjectState {
  readonly backend: PersistenceBackend;
  readonly status: ProjectStateStatus;
  readonly contentRevision?: string;
  readonly characterRevision?: string;
  readonly contentExists?: boolean;
  readonly charactersExists?: boolean;
  readonly characterMigrationRequired?: boolean;
  readonly error?: string;
}

export type PersistenceBootstrapResult =
  | { readonly ok: true; readonly state: ApplicationProjectState }
  | { readonly ok: false; readonly state: ApplicationProjectState; readonly error: string };

let applicationProjectState: ApplicationProjectState = {
  backend: getPersistenceBackend(),
  status: 'idle',
};

export function getApplicationProjectState(): ApplicationProjectState {
  return { ...applicationProjectState };
}

function failProjectBootstrap(message: string): PersistenceBootstrapResult {
  clearCharacterCatalog();
  degradeContentCatalog(message);
  applicationProjectState = {
    backend: 'project',
    status: 'degraded',
    error: message,
  };
  return { ok: false, state: getApplicationProjectState(), error: message };
}

function validateProjectEnvelope(envelope: ProjectStateEnvelope): { characters: Character[] } {
  const contentValidation = validateHomebrewContent(envelope.content);
  if (!contentValidation.ok) throw new Error(contentValidation.error.message);

  const registry = createContentRegistry(envelope.content);
  const characters: Character[] = [];
  for (const candidate of envelope.characters) {
    if (!isCharacter(candidate as unknown, registry)) {
      throw new Error('Project Character store contains an invalid Character v10 record for the effective project content catalog.');
    }
    characters.push(structuredClone(candidate));
  }
  return { characters };
}

export async function initializeApplicationPersistence(options: {
  backend?: PersistenceBackend;
  fetchImpl?: typeof fetch;
  storage?: Storage;
} = {}): Promise<PersistenceBootstrapResult> {
  const backend = options.backend ?? selectPersistenceBackend(import.meta.env.MODE);
  configurePersistenceBackend(backend);

  if (backend === 'browser-local') {
    clearCharacterCatalog();
    const result = initializeContentCatalog(options.storage);
    applicationProjectState = {
      backend,
      status: result.ok ? 'ready' : 'degraded',
      ...(result.ok ? {} : { error: result.error.message }),
    };
    return result.ok
      ? { ok: true, state: getApplicationProjectState() }
      : { ok: false, state: getApplicationProjectState(), error: result.error.message };
  }

  let envelope: ProjectStateEnvelope;
  try {
    envelope = await fetchProjectState(options.fetchImpl);
  } catch (error) {
    const message = error instanceof ProjectTransportError
      ? error.message
      : 'Project persistence bootstrap failed before authoritative state could be loaded.';
    return failProjectBootstrap(message);
  }

  let validated: { characters: Character[] };
  try {
    validated = validateProjectEnvelope(envelope);
  } catch (error) {
    return failProjectBootstrap(error instanceof Error ? error.message : 'Project persistence data is invalid.');
  }

  hydrateCharacterCatalog(validated.characters);
  applicationProjectState = {
    backend,
    status: 'ready',
    contentRevision: envelope.contentRevision,
    characterRevision: envelope.characterRevision,
    contentExists: envelope.contentExists,
    charactersExists: envelope.charactersExists,
    characterMigrationRequired: envelope.characterMigrationRequired,
  };

  const contentResult = initializeContentCatalogFromEntries(envelope.content);
  if (!contentResult.ok) return failProjectBootstrap(contentResult.error.message);
  return { ok: true, state: getApplicationProjectState() };
}

export function getApplicationCharacters(): Character[] {
  return getPersistenceBackend() === 'project' ? listCatalogCharacters() : loadCharacters();
}

export function getApplicationCharacterById(id: string): Character | undefined {
  return getPersistenceBackend() === 'project' ? findCatalogCharacter(id) : getCharacterById(id);
}

export function acceptProjectContentMutationEnvelope(envelope: ProjectStateEnvelope): { readonly ok: true } | { readonly ok: false; readonly error: string } {
  if (getPersistenceBackend() !== 'project' || applicationProjectState.status !== 'ready') {
    return { ok: false, error: 'Project persistence is not ready to accept a content mutation response.' };
  }

  let validated: { characters: Character[] };
  try {
    validated = validateProjectEnvelope(envelope);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Project content mutation response is invalid.' };
  }

  hydrateCharacterCatalog(validated.characters);
  applicationProjectState = {
    backend: 'project',
    status: 'ready',
    contentRevision: envelope.contentRevision,
    characterRevision: envelope.characterRevision,
    contentExists: envelope.contentExists,
    charactersExists: envelope.charactersExists,
    characterMigrationRequired: envelope.characterMigrationRequired,
  };
  return { ok: true };
}

export function acceptProjectMigrationEnvelope(envelope: ProjectStateEnvelope): { readonly ok: true } | { readonly ok: false; readonly error: string } {
  if (getPersistenceBackend() !== 'project' || applicationProjectState.status !== 'ready') {
    return { ok: false, error: 'Project persistence is not ready to accept a migration response.' };
  }

  let validated: { characters: Character[] };
  try {
    validated = validateProjectEnvelope(envelope);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Project migration response is invalid.' };
  }

  const contentResult = initializeContentCatalogFromEntries(envelope.content);
  if (!contentResult.ok) {
    return { ok: false, error: contentResult.error.message };
  }
  hydrateCharacterCatalog(validated.characters);
  applicationProjectState = {
    backend: 'project',
    status: 'ready',
    contentRevision: envelope.contentRevision,
    characterRevision: envelope.characterRevision,
    contentExists: envelope.contentExists,
    charactersExists: envelope.charactersExists,
    characterMigrationRequired: envelope.characterMigrationRequired,
  };
  return { ok: true };
}

export function acceptProjectCharacterMutationEnvelope(envelope: ProjectStateEnvelope): { readonly ok: true } | { readonly ok: false; readonly error: string } {
  if (getPersistenceBackend() !== 'project' || applicationProjectState.status !== 'ready') {
    return { ok: false, error: 'Project persistence is not ready to accept a Character mutation response.' };
  }

  let validated: { characters: Character[] };
  try {
    validated = validateProjectEnvelope(envelope);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Project Character mutation response is invalid.' };
  }

  hydrateCharacterCatalog(validated.characters);
  applicationProjectState = {
    backend: 'project',
    status: 'ready',
    contentRevision: envelope.contentRevision,
    characterRevision: envelope.characterRevision,
    contentExists: envelope.contentExists,
    charactersExists: envelope.charactersExists,
    characterMigrationRequired: envelope.characterMigrationRequired,
  };
  return { ok: true };
}
