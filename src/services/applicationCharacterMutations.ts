import type { Character, CharacterInput } from '../models/character';
import type { RuleResult } from '../rules/result';
import { listCatalogCharacters } from './characterCatalog';
import {
  createCharacter,
  deleteCharacter,
  loadCharacters,
  saveCharacters,
  updateCharacter,
} from './characterStorage';
import { contentRegistry } from './contentRegistry';
import { getPersistenceBackend } from './persistenceBackend';
import { ProjectTransportError, putProjectCharacters } from './projectPersistenceTransport';
import { acceptProjectCharacterMutationEnvelope, getApplicationProjectState } from './projectState';

export type ApplicationCharacterMutationErrorCode =
  | 'invalid-candidate'
  | 'not-found'
  | 'project-conflict'
  | 'project-persistence-failed';

export interface ApplicationCharacterMutationError {
  readonly code: ApplicationCharacterMutationErrorCode;
  readonly message: string;
}

export type ApplicationCharacterMutationResult =
  | { readonly ok: true; readonly character?: Character }
  | { readonly ok: false; readonly error: ApplicationCharacterMutationError };

export type ApplicationCharacterTransactionResult<T> =
  | { readonly ok: true; readonly value: T; readonly character?: Character }
  | { readonly ok: false; readonly error: ApplicationCharacterMutationError };

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

function projectError(error: unknown): ApplicationCharacterMutationError {
  if (error instanceof ProjectTransportError) {
    if (error.code === 'stale-content' || error.code === 'stale-characters') {
      return {
        code: 'project-conflict',
        message: 'Project state changed before this Character mutation could commit. Refresh or reload before trying again.',
      };
    }
    return { code: 'project-persistence-failed', message: error.message };
  }
  return {
    code: 'project-persistence-failed',
    message: error instanceof Error ? error.message : 'Project Character mutation failed safely.',
  };
}

function prepareProjectStorage(): Storage {
  const storage = memoryStorage();
  saveCharacters(listCatalogCharacters(), storage);
  return storage;
}

export function createApplicationCharacterSnapshotStorage(): Storage {
  return getPersistenceBackend() === 'project' ? prepareProjectStorage() : window.localStorage;
}

async function persistProjectCharacters(
  prospective: readonly Character[],
  changedCharacter?: Character,
): Promise<ApplicationCharacterMutationResult> {
  const state = getApplicationProjectState();
  if (state.backend !== 'project' || state.status !== 'ready' || !state.characterRevision || !state.contentRevision) {
    return {
      ok: false,
      error: {
        code: 'project-persistence-failed',
        message: 'Project persistence revisions are unavailable. Refresh or reload the project.',
      },
    };
  }

  let envelope;
  try {
    envelope = await putProjectCharacters(prospective, state.characterRevision, state.contentRevision);
  } catch (error) {
    return { ok: false, error: projectError(error) };
  }

  const accepted = acceptProjectCharacterMutationEnvelope(envelope);
  if (!accepted.ok) {
    return {
      ok: false,
      error: { code: 'project-persistence-failed', message: accepted.error },
    };
  }

  const persistedCharacter = changedCharacter
    ? envelope.characters.find((character) => character.id === changedCharacter.id)
    : undefined;
  return {
    ok: true,
    ...(persistedCharacter ? { character: structuredClone(persistedCharacter) } : {}),
  };
}

export async function runApplicationCharacterTransaction<T>(
  mutation: (storage: Storage) => RuleResult<T>,
  selectCharacter: (value: T) => Character | undefined,
): Promise<ApplicationCharacterTransactionResult<T>> {
  if (getPersistenceBackend() !== 'project') {
    const result = mutation(window.localStorage);
    return result.ok
      ? { ok: true, value: result.value, ...(selectCharacter(result.value) ? { character: selectCharacter(result.value) } : {}) }
      : { ok: false, error: { code: 'invalid-candidate', message: result.error.message } };
  }

  const currentCharacters = listCatalogCharacters();
  const storage = prepareProjectStorage();
  const result = mutation(storage);
  if (!result.ok) {
    return { ok: false, error: { code: 'invalid-candidate', message: result.error.message } };
  }

  let prospective: Character[];
  try {
    prospective = loadCharacters(storage, contentRegistry);
  } catch (error) {
    return {
      ok: false,
      error: { code: 'invalid-candidate', message: error instanceof Error ? error.message : 'Character mutation could not be validated.' },
    };
  }

  const changedCharacter = selectCharacter(result.value);
  if (!changedCharacter) {
    return { ok: false, error: { code: 'not-found', message: 'Character mutation did not return a Character record.' } };
  }

  if (JSON.stringify(prospective) === JSON.stringify(currentCharacters)) {
    return { ok: true, value: result.value, character: structuredClone(changedCharacter) };
  }

  const persisted = await persistProjectCharacters(prospective, changedCharacter);
  if (!persisted.ok) return persisted;
  return {
    ok: true,
    value: result.value,
    ...(persisted.character ? { character: persisted.character } : {}),
  };
}

export async function createApplicationCharacter(input: CharacterInput): Promise<ApplicationCharacterMutationResult> {
  if (getPersistenceBackend() !== 'project') {
    try {
      return { ok: true, character: createCharacter(input) };
    } catch (error) {
      return {
        ok: false,
        error: { code: 'invalid-candidate', message: error instanceof Error ? error.message : 'Character could not be created.' },
      };
    }
  }

  const storage = prepareProjectStorage();
  let character: Character;
  let prospective: Character[];
  try {
    character = createCharacter(input, storage, contentRegistry);
    prospective = loadCharacters(storage, contentRegistry);
  } catch (error) {
    return {
      ok: false,
      error: { code: 'invalid-candidate', message: error instanceof Error ? error.message : 'Character could not be created.' },
    };
  }
  return persistProjectCharacters(prospective, character);
}

export async function updateApplicationCharacter(
  id: string,
  input: CharacterInput,
): Promise<ApplicationCharacterMutationResult> {
  if (getPersistenceBackend() !== 'project') {
    try {
      const character = updateCharacter(id, input);
      return character
        ? { ok: true, character }
        : { ok: false, error: { code: 'not-found', message: 'Character not found.' } };
    } catch (error) {
      return {
        ok: false,
        error: { code: 'invalid-candidate', message: error instanceof Error ? error.message : 'Character could not be updated.' },
      };
    }
  }

  const storage = prepareProjectStorage();
  let character: Character | undefined;
  let prospective: Character[];
  try {
    character = updateCharacter(id, input, storage, contentRegistry);
    if (!character) return { ok: false, error: { code: 'not-found', message: 'Character not found.' } };
    prospective = loadCharacters(storage, contentRegistry);
  } catch (error) {
    return {
      ok: false,
      error: { code: 'invalid-candidate', message: error instanceof Error ? error.message : 'Character could not be updated.' },
    };
  }
  return persistProjectCharacters(prospective, character);
}

export async function deleteApplicationCharacter(id: string): Promise<ApplicationCharacterMutationResult> {
  if (getPersistenceBackend() !== 'project') {
    try {
      return deleteCharacter(id)
        ? { ok: true }
        : { ok: false, error: { code: 'not-found', message: 'Character not found.' } };
    } catch (error) {
      return {
        ok: false,
        error: { code: 'invalid-candidate', message: error instanceof Error ? error.message : 'Character could not be deleted.' },
      };
    }
  }

  const storage = prepareProjectStorage();
  let prospective: Character[];
  try {
    if (!deleteCharacter(id, storage)) {
      return { ok: false, error: { code: 'not-found', message: 'Character not found.' } };
    }
    prospective = loadCharacters(storage, contentRegistry);
  } catch (error) {
    return {
      ok: false,
      error: { code: 'invalid-candidate', message: error instanceof Error ? error.message : 'Character could not be deleted.' },
    };
  }
  return persistProjectCharacters(prospective);
}
