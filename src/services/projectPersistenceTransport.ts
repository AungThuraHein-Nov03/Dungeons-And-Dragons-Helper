import type { Character } from '../models/character';
import type { ContentEntry } from '../models/content';

export const PROJECT_STATE_ENDPOINT = '/__dnd3/project-state';
export const PROJECT_CONTENT_ENDPOINT = '/__dnd3/project-state/content';
export const PROJECT_CHARACTERS_ENDPOINT = '/__dnd3/project-state/characters';
export const PROJECT_MIGRATION_ENDPOINT = '/__dnd3/project-state/migration';
export const PROJECT_LEGACY_CONTENT_EXPORT_ENDPOINT = '/__dnd3/project-state/migration/legacy-content-export';

export interface ProjectStateEnvelope {
  readonly content: ContentEntry[];
  readonly characters: Character[];
  readonly contentExists: boolean;
  readonly charactersExists: boolean;
  readonly contentRevision: string;
  readonly characterRevision: string;
}

export type ProjectTransportErrorCode =
  | 'network-failed'
  | 'http-error'
  | 'malformed-envelope'
  | 'stale-content'
  | 'stale-characters'
  | 'canonical-validation-rejected'
  | 'character-compatibility-rejected';

export class ProjectTransportError extends Error {
  constructor(
    readonly code: ProjectTransportErrorCode,
    message: string,
    readonly status?: number,
    readonly serverCode?: string,
  ) {
    super(message);
    this.name = 'ProjectTransportError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseServerErrorCode(value: unknown): { code?: string; message?: string } {
  if (!isRecord(value) || !isRecord(value.error)) return {};
  return {
    ...(typeof value.error.code === 'string' ? { code: value.error.code } : {}),
    ...(typeof value.error.message === 'string' ? { message: value.error.message } : {}),
  };
}

function mapContentPutError(status: number, body: unknown): ProjectTransportError {
  const server = parseServerErrorCode(body);
  const message = server.message ?? 'Project content persistence request failed safely.';
  if (server.code === 'stale-content') {
    return new ProjectTransportError('stale-content', message, status, server.code);
  }
  if (server.code === 'stale-characters') {
    return new ProjectTransportError('stale-characters', message, status, server.code);
  }
  if (server.code === 'invalid-content') {
    return new ProjectTransportError('canonical-validation-rejected', message, status, server.code);
  }
  if (server.code === 'incompatible-characters' || server.code === 'invalid-characters') {
    return new ProjectTransportError('character-compatibility-rejected', message, status, server.code);
  }
  return new ProjectTransportError('http-error', message, status, server.code);
}

function mapCharacterPutError(status: number, body: unknown): ProjectTransportError {
  const server = parseServerErrorCode(body);
  const message = server.message ?? 'Project Character persistence request failed safely.';
  if (server.code === 'stale-characters') {
    return new ProjectTransportError('stale-characters', message, status, server.code);
  }
  if (server.code === 'stale-content') {
    return new ProjectTransportError('stale-content', message, status, server.code);
  }
  if (server.code === 'invalid-characters') {
    return new ProjectTransportError('canonical-validation-rejected', message, status, server.code);
  }
  if (server.code === 'incompatible-characters' || server.code === 'invalid-content') {
    return new ProjectTransportError('character-compatibility-rejected', message, status, server.code);
  }
  return new ProjectTransportError('http-error', message, status, server.code);
}

export function parseProjectStateEnvelope(value: unknown): ProjectStateEnvelope {
  if (!isRecord(value)) throw new ProjectTransportError('malformed-envelope', 'Project state response must be an object.');
  if (!Array.isArray(value.content)) throw new ProjectTransportError('malformed-envelope', 'Project state content must be an array.');
  if (!Array.isArray(value.characters)) throw new ProjectTransportError('malformed-envelope', 'Project state Characters must be an array.');
  if (typeof value.contentExists !== 'boolean' || typeof value.charactersExists !== 'boolean') {
    throw new ProjectTransportError('malformed-envelope', 'Project state existence metadata is invalid.');
  }
  if (typeof value.contentRevision !== 'string' || !value.contentRevision.trim()) {
    throw new ProjectTransportError('malformed-envelope', 'Project state content revision is missing.');
  }
  if (typeof value.characterRevision !== 'string' || !value.characterRevision.trim()) {
    throw new ProjectTransportError('malformed-envelope', 'Project state Character revision is missing.');
  }
  return {
    content: structuredClone(value.content as ContentEntry[]),
    characters: structuredClone(value.characters as Character[]),
    contentExists: value.contentExists,
    charactersExists: value.charactersExists,
    contentRevision: value.contentRevision,
    characterRevision: value.characterRevision,
  };
}

export async function fetchProjectState(
  fetchImpl: typeof fetch = fetch,
): Promise<ProjectStateEnvelope> {
  let response: Response;
  try {
    response = await fetchImpl(PROJECT_STATE_ENDPOINT, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new ProjectTransportError('network-failed', 'Project persistence endpoint could not be reached.');
  }

  if (!response.ok) {
    throw new ProjectTransportError('http-error', 'Project persistence endpoint rejected the startup request.', response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ProjectTransportError('malformed-envelope', 'Project persistence endpoint returned malformed JSON.');
  }
  return parseProjectStateEnvelope(body);
}

export async function putProjectContent(
  entries: readonly ContentEntry[],
  expectedContentRevision: string,
  expectedCharacterRevision: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProjectStateEnvelope> {
  let response: Response;
  try {
    response = await fetchImpl(PROJECT_CONTENT_ENDPOINT, {
      method: 'PUT',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'If-Match': expectedContentRevision,
        'X-DND3-Characters-If-Match': expectedCharacterRevision,
      },
      body: JSON.stringify(entries),
    });
  } catch {
    throw new ProjectTransportError('network-failed', 'Project content persistence endpoint could not be reached.');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ProjectTransportError(
      'malformed-envelope',
      response.ok
        ? 'Project content persistence endpoint returned malformed JSON.'
        : 'Project content persistence endpoint returned a malformed error response.',
      response.status,
    );
  }

  if (!response.ok) throw mapContentPutError(response.status, body);
  return parseProjectStateEnvelope(body);
}

export async function putProjectCharacters(
  characters: readonly Character[],
  expectedCharacterRevision: string,
  expectedContentRevision: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProjectStateEnvelope> {
  let response: Response;
  try {
    response = await fetchImpl(PROJECT_CHARACTERS_ENDPOINT, {
      method: 'PUT',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'If-Match': expectedCharacterRevision,
        'X-DND3-Content-If-Match': expectedContentRevision,
      },
      body: JSON.stringify(characters),
    });
  } catch {
    throw new ProjectTransportError('network-failed', 'Project Character persistence endpoint could not be reached.');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ProjectTransportError(
      'malformed-envelope',
      response.ok
        ? 'Project Character persistence endpoint returned malformed JSON.'
        : 'Project Character persistence endpoint returned a malformed error response.',
      response.status,
    );
  }

  if (!response.ok) throw mapCharacterPutError(response.status, body);
  return parseProjectStateEnvelope(body);
}

export async function putProjectMigration(
  content: readonly ContentEntry[],
  characters: readonly Character[],
  expectedContentRevision: string,
  expectedCharacterRevision: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProjectStateEnvelope> {
  let response: Response;
  try {
    response = await fetchImpl(PROJECT_MIGRATION_ENDPOINT, {
      method: 'PUT',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'If-Match': expectedContentRevision,
        'X-DND3-Characters-If-Match': expectedCharacterRevision,
      },
      body: JSON.stringify({ content, characters }),
    });
  } catch {
    throw new ProjectTransportError('network-failed', 'Project migration endpoint could not be reached.');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ProjectTransportError(
      'malformed-envelope',
      response.ok
        ? 'Project migration endpoint returned malformed JSON.'
        : 'Project migration endpoint returned a malformed error response.',
      response.status,
    );
  }

  if (!response.ok) throw mapContentPutError(response.status, body);
  return parseProjectStateEnvelope(body);
}

export async function fetchLegacyProjectContentExport(
  fetchImpl: typeof fetch = fetch,
): Promise<ContentEntry[]> {
  let response: Response;
  try {
    response = await fetchImpl(PROJECT_LEGACY_CONTENT_EXPORT_ENDPOINT, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new ProjectTransportError('network-failed', 'Preserved legacy content export endpoint could not be reached.');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ProjectTransportError('malformed-envelope', 'Preserved legacy content export endpoint returned malformed JSON.', response.status);
  }
  if (!response.ok) {
    const server = parseServerErrorCode(body);
    throw new ProjectTransportError('http-error', server.message ?? 'Preserved legacy content export request failed safely.', response.status, server.code);
  }
  if (!isRecord(body) || !Array.isArray(body.content)) {
    throw new ProjectTransportError('malformed-envelope', 'Preserved legacy content export response must contain a canonical content array.');
  }
  return structuredClone(body.content as ContentEntry[]);
}
