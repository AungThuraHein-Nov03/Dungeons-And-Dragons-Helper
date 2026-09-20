import type { ContentEntry } from '../models/content';
import { listCatalogCharacters } from './characterCatalog';
import {
  formatReferenceBlockers,
  preflightContentDelete,
  preflightContentEdit,
  readPersistedCharactersForIntegrity,
  type ReferenceBlocker,
} from './contentReferenceIntegrity';
import {
  contentRegistry,
  createContentRegistry,
  getContentRegistryGeneration,
  publishContentRegistry,
  type ContentRegistry,
} from './contentRegistry';
import { isCharacter } from './characterStorage';
import {
  loadHomebrewContentResult,
  saveHomebrewContent,
  type HomebrewContentStorageError,
  validateHomebrewContent,
} from './homebrewContentStorage';
import { getPersistenceBackend, projectMutationsAreLocked } from './persistenceBackend';
import { putProjectContent, ProjectTransportError } from './projectPersistenceTransport';

export type ContentCatalogErrorCode =
  | 'persisted-content-invalid'
  | 'invalid-candidate'
  | 'reference-blocked'
  | 'analysis-unavailable'
  | 'project-mutations-locked'
  | 'project-conflict'
  | 'project-persistence-failed'
  | 'storage-write-failed';

export interface ContentCatalogError {
  readonly code: ContentCatalogErrorCode;
  readonly message: string;
  readonly storageError?: HomebrewContentStorageError;
  readonly blockers?: readonly ReferenceBlocker[];
}

export interface ContentCatalogState {
  readonly status: 'ready' | 'degraded';
  readonly generation: number;
  readonly customEntryCount: number;
  readonly error?: ContentCatalogError;
}

export type ContentCatalogMutationResult =
  | { readonly ok: true; readonly entries: readonly ContentEntry[]; readonly registry: ContentRegistry }
  | { readonly ok: false; readonly error: ContentCatalogError; readonly registry: ContentRegistry };

export type ContentCatalogDeletePreflightResult =
  | {
      readonly ok: true;
      readonly target: ContentEntry;
      readonly entries: readonly ContentEntry[];
      readonly registry: ContentRegistry;
    }
  | {
      readonly ok: false;
      readonly error: ContentCatalogError;
      readonly registry: ContentRegistry;
    };

let catalogState: ContentCatalogState = {
  status: 'ready',
  generation: getContentRegistryGeneration(),
  customEntryCount: 0,
};

let projectEntries: ContentEntry[] = [];

function browserStorage(): Storage {
  return window.localStorage;
}

function currentRegistry(): ContentRegistry {
  return contentRegistry;
}

function publishReady(registry: ContentRegistry, customEntryCount: number): void {
  publishContentRegistry(registry);
  catalogState = {
    status: 'ready',
    generation: getContentRegistryGeneration(),
    customEntryCount,
  };
}

function publishDegraded(error: ContentCatalogError): ContentCatalogMutationResult {
  projectEntries = [];
  const registry = createContentRegistry();
  publishContentRegistry(registry);
  catalogState = {
    status: 'degraded',
    generation: getContentRegistryGeneration(),
    customEntryCount: 0,
    error,
  };
  return { ok: false, error, registry };
}

export function getContentCatalogState(): ContentCatalogState {
  return {
    ...catalogState,
    ...(catalogState.error ? { error: { ...catalogState.error } } : {}),
  };
}

export function getProjectContentEntries(): readonly ContentEntry[] {
  return structuredClone(projectEntries);
}

export function initializeContentCatalogFromEntries(
  entries: readonly ContentEntry[],
): ContentCatalogMutationResult {
  const validation = validateHomebrewContent(entries);
  if (!validation.ok) {
    return publishDegraded({
      code: 'persisted-content-invalid',
      message: validation.error.message,
      storageError: validation.error,
    });
  }

  try {
    const registry = createContentRegistry(entries);
    projectEntries = structuredClone([...entries]);
    publishReady(registry, entries.length);
    return { ok: true, entries: [...entries], registry };
  } catch (error) {
    return publishDegraded({
      code: 'persisted-content-invalid',
      message: error instanceof Error ? error.message : 'Project Homebrew content could not be loaded safely.',
    });
  }
}

export function degradeContentCatalog(message: string): ContentCatalogMutationResult {
  return publishDegraded({
    code: 'persisted-content-invalid',
    message,
  });
}

function lockedMutationResult(): ContentCatalogMutationResult {
  const error: ContentCatalogError = {
    code: 'project-mutations-locked',
    message: 'This legacy browser-local mutation path is unavailable in project mode.',
  };
  return { ok: false, error, registry: currentRegistry() };
}

export function initializeContentCatalog(storage: Storage = browserStorage()): ContentCatalogMutationResult {
  projectEntries = [];
  const loaded = loadHomebrewContentResult(storage);
  if (!loaded.ok) {
    return publishDegraded({
      code: 'persisted-content-invalid',
      message: loaded.error.message,
      storageError: loaded.error,
    });
  }

  try {
    const registry = createContentRegistry(loaded.entries);
    publishReady(registry, loaded.entries.length);
    return { ok: true, entries: loaded.entries, registry };
  } catch (error) {
    return publishDegraded({
      code: 'persisted-content-invalid',
      message: error instanceof Error ? error.message : 'Persisted Homebrew content could not be loaded safely.',
    });
  }
}

export function saveAndPublishHomebrewContent(
  entries: readonly ContentEntry[],
  storage: Storage = browserStorage(),
): ContentCatalogMutationResult {
  if (projectMutationsAreLocked()) return lockedMutationResult();
  const validation = validateHomebrewContent(entries);
  if (!validation.ok) {
    return {
      ok: false,
      error: {
        code: 'invalid-candidate',
        message: validation.error.message,
        storageError: validation.error,
      },
      registry: currentRegistry(),
    };
  }

  let nextRegistry: ContentRegistry;
  try {
    nextRegistry = createContentRegistry(entries);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'invalid-candidate',
        message: error instanceof Error ? error.message : 'Homebrew content could not form a valid effective catalog.',
      },
      registry: currentRegistry(),
    };
  }

  try {
    saveHomebrewContent(entries, storage);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'storage-write-failed',
        message: error instanceof Error ? error.message : 'Homebrew content could not be persisted.',
      },
      registry: currentRegistry(),
    };
  }

  publishReady(nextRegistry, entries.length);
  return { ok: true, entries: [...entries], registry: nextRegistry };
}

function integrityError(
  blockers: readonly ReferenceBlocker[],
  fallbackCode: Extract<ContentCatalogErrorCode, 'reference-blocked' | 'analysis-unavailable'> = 'reference-blocked',
): ContentCatalogError {
  const analysisUnavailable = blockers.some((blocker) => blocker.referenceKind === 'analysis-unavailable');
  return {
    code: analysisUnavailable ? 'analysis-unavailable' : fallbackCode,
    message: formatReferenceBlockers(blockers) || 'Referential-integrity preflight blocked this operation.',
    blockers,
  };
}

function currentIntegrityContext(
  entries: readonly ContentEntry[],
  characterStorage: Storage,
): { readonly ok: true; readonly registry: ContentRegistry; readonly characters: readonly import('../models/character').Character[] }
  | { readonly ok: false; readonly error: ContentCatalogError } {
  let registry: ContentRegistry;
  try {
    registry = createContentRegistry(entries);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'persisted-content-invalid',
        message: error instanceof Error ? error.message : 'The current effective content catalog could not be analyzed safely.',
      },
    };
  }

  const population = readPersistedCharactersForIntegrity(characterStorage, registry);
  if (!population.ok) return { ok: false, error: integrityError([population.blocker], 'analysis-unavailable') };
  return { ok: true, registry, characters: population.characters };
}

export function preflightHomebrewContentDelete(
  targetId: string,
  storage: Storage = browserStorage(),
  characterStorage: Storage = storage,
): ContentCatalogDeletePreflightResult {
  if (projectMutationsAreLocked()) {
    const locked = lockedMutationResult();
    if (!locked.ok) return { ok: false, error: locked.error, registry: locked.registry };
  }
  const loaded = loadHomebrewContentResult(storage);
  if (!loaded.ok) {
    return {
      ok: false,
      error: {
        code: 'persisted-content-invalid',
        message: loaded.error.message,
        storageError: loaded.error,
      },
      registry: currentRegistry(),
    };
  }

  const target = [...loaded.entries].find((entry) => entry.id === targetId)
    ?? currentRegistry().getById(targetId);
  const context = currentIntegrityContext(loaded.entries, characterStorage);
  if (!context.ok) return { ok: false, error: context.error, registry: currentRegistry() };

  const preflight = preflightContentDelete(targetId, loaded.entries, context.characters);
  if (!preflight.ok) return {
    ok: false,
    error: integrityError(preflight.blockers),
    registry: currentRegistry(),
  };

  if (!target) {
    return {
      ok: false,
      error: {
        code: 'analysis-unavailable',
        message: `Content target does not exist: ${targetId}.`,
      },
      registry: currentRegistry(),
    };
  }

  return {
    ok: true,
    target,
    entries: preflight.prospectiveCustomEntries,
    registry: preflight.registry,
  };
}

export function deleteAndPublishHomebrewContent(
  targetId: string,
  storage: Storage = browserStorage(),
  characterStorage: Storage = storage,
): ContentCatalogMutationResult {
  if (projectMutationsAreLocked()) return lockedMutationResult();
  const preflight = preflightHomebrewContentDelete(targetId, storage, characterStorage);
  if (!preflight.ok) return { ok: false, error: preflight.error, registry: preflight.registry };
  return saveAndPublishHomebrewContent(preflight.entries, storage);
}

export function upsertAndPublishHomebrewContent(
  entry: ContentEntry,
  storage: Storage = browserStorage(),
  characterStorage: Storage = storage,
): ContentCatalogMutationResult {
  if (projectMutationsAreLocked()) return lockedMutationResult();
  const loaded = loadHomebrewContentResult(storage);
  if (!loaded.ok) {
    return {
      ok: false,
      error: {
        code: 'persisted-content-invalid',
        message: loaded.error.message,
        storageError: loaded.error,
      },
      registry: currentRegistry(),
    };
  }

  const index = loaded.entries.findIndex((candidate) => candidate.id === entry.id);
  if (index < 0) return saveAndPublishHomebrewContent([...loaded.entries, entry], storage);

  const context = currentIntegrityContext(loaded.entries, characterStorage);
  if (!context.ok) return { ok: false, error: context.error, registry: currentRegistry() };

  const preflight = preflightContentEdit(entry, loaded.entries, context.characters);
  if (!preflight.ok) {
    return {
      ok: false,
      error: integrityError(preflight.blockers),
      registry: currentRegistry(),
    };
  }

  return saveAndPublishHomebrewContent(preflight.prospectiveCustomEntries, storage);
}

function projectPreflightDelete(targetId: string): ContentCatalogDeletePreflightResult {
  const target = projectEntries.find((entry) => entry.id === targetId) ?? currentRegistry().getById(targetId);
  const preflight = preflightContentDelete(targetId, projectEntries, listCatalogCharacters());
  if (!preflight.ok) {
    return { ok: false, error: integrityError(preflight.blockers), registry: currentRegistry() };
  }
  if (!target) {
    return {
      ok: false,
      error: { code: 'analysis-unavailable', message: `Content target does not exist: ${targetId}.` },
      registry: currentRegistry(),
    };
  }
  return { ok: true, target, entries: preflight.prospectiveCustomEntries, registry: preflight.registry };
}

export function preflightApplicationContentDelete(targetId: string): ContentCatalogDeletePreflightResult {
  return getPersistenceBackend() === 'project'
    ? projectPreflightDelete(targetId)
    : preflightHomebrewContentDelete(targetId);
}

function validateProjectProspectiveEntries(entries: readonly ContentEntry[]): { ok: true; registry: ContentRegistry } | { ok: false; error: ContentCatalogError } {
  const validation = validateHomebrewContent(entries);
  if (!validation.ok) {
    return {
      ok: false,
      error: { code: 'invalid-candidate', message: validation.error.message, storageError: validation.error },
    };
  }

  let registry: ContentRegistry;
  try {
    registry = createContentRegistry(entries);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'invalid-candidate',
        message: error instanceof Error ? error.message : 'Homebrew content could not form a valid effective catalog.',
      },
    };
  }

  for (const character of listCatalogCharacters()) {
    if (!isCharacter(character as unknown, registry)) {
      return {
        ok: false,
        error: {
          code: 'reference-blocked',
          message: 'The proposed content change would make an authoritative project Character invalid.',
        },
      };
    }
  }
  return { ok: true, registry };
}

function projectTransportError(error: unknown): ContentCatalogError {
  if (error instanceof ProjectTransportError) {
    if (error.code === 'stale-content' || error.code === 'stale-characters') {
      return {
        code: 'project-conflict',
        message: 'Project state changed before this mutation could be committed. Refresh or reload before trying again.',
      };
    }
    return { code: 'project-persistence-failed', message: error.message };
  }
  return { code: 'project-persistence-failed', message: 'Project content could not be persisted safely.' };
}

async function persistProjectEntries(entries: readonly ContentEntry[]): Promise<ContentCatalogMutationResult> {
  const { acceptProjectContentMutationEnvelope, getApplicationProjectState } = await import('./projectState');
  const state = getApplicationProjectState();
  if (state.backend !== 'project' || state.status !== 'ready' || !state.contentRevision || !state.characterRevision) {
    return {
      ok: false,
      error: { code: 'project-persistence-failed', message: 'Project persistence revisions are unavailable. Refresh or reload the project.' },
      registry: currentRegistry(),
    };
  }

  let envelope;
  try {
    envelope = await putProjectContent(entries, state.contentRevision, state.characterRevision);
  } catch (error) {
    return { ok: false, error: projectTransportError(error), registry: currentRegistry() };
  }

  const returnedValidation = validateProjectProspectiveEntries(envelope.content);
  if (!returnedValidation.ok) {
    return { ok: false, error: returnedValidation.error, registry: currentRegistry() };
  }

  const accepted = acceptProjectContentMutationEnvelope(envelope);
  if (!accepted.ok) {
    return {
      ok: false,
      error: { code: 'project-persistence-failed', message: accepted.error },
      registry: currentRegistry(),
    };
  }

  projectEntries = structuredClone(envelope.content);
  publishReady(returnedValidation.registry, envelope.content.length);
  return { ok: true, entries: structuredClone(envelope.content), registry: returnedValidation.registry };
}

async function saveAndPublishProjectContent(entries: readonly ContentEntry[]): Promise<ContentCatalogMutationResult> {
  const prospective = validateProjectProspectiveEntries(entries);
  if (!prospective.ok) return { ok: false, error: prospective.error, registry: currentRegistry() };
  return persistProjectEntries(entries);
}

export async function upsertAndPublishApplicationContent(entry: ContentEntry): Promise<ContentCatalogMutationResult> {
  if (getPersistenceBackend() !== 'project') return upsertAndPublishHomebrewContent(entry);

  const index = projectEntries.findIndex((candidate) => candidate.id === entry.id);
  if (index < 0) return saveAndPublishProjectContent([...projectEntries, entry]);

  const preflight = preflightContentEdit(entry, projectEntries, listCatalogCharacters());
  if (!preflight.ok) {
    return { ok: false, error: integrityError(preflight.blockers), registry: currentRegistry() };
  }
  return saveAndPublishProjectContent(preflight.prospectiveCustomEntries);
}

export async function deleteAndPublishApplicationContent(targetId: string): Promise<ContentCatalogMutationResult> {
  if (getPersistenceBackend() !== 'project') return deleteAndPublishHomebrewContent(targetId);
  const preflight = projectPreflightDelete(targetId);
  if (!preflight.ok) return { ok: false, error: preflight.error, registry: preflight.registry };
  return saveAndPublishProjectContent(preflight.entries);
}
