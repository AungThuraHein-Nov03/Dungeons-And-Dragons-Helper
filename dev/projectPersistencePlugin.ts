import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { ProjectStore, ProjectStoreError, type ProjectStateSnapshot } from './projectStore';

export const PROJECT_STATE_ROUTE = '/__dnd3/project-state';
export const PROJECT_CONTENT_ROUTE = '/__dnd3/project-state/content';
export const PROJECT_CHARACTERS_ROUTE = '/__dnd3/project-state/characters';
export const PROJECT_MIGRATION_ROUTE = '/__dnd3/project-state/migration';
export const PROJECT_LEGACY_CONTENT_EXPORT_ROUTE = '/__dnd3/project-state/migration/legacy-content-export';
export const PROJECT_PERSISTENCE_MAX_BODY_BYTES = 1024 * 1024;

type Next = (error?: unknown) => void;

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

function safeError(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof ProjectStoreError) {
    const status = error.code === 'stale-content' || error.code === 'stale-characters'
      ? 409
      : error.code === 'write-failed' || error.code === 'read-failed'
        ? 500
        : 422;
    return { status, code: error.code, message: error.message };
  }
  return { status: 500, code: 'project-store-failed', message: 'Project persistence request failed safely.' };
}

function responseState(state: ProjectStateSnapshot) {
  return {
    content: state.content,
    characters: state.characters,
    contentExists: state.contentExists,
    charactersExists: state.charactersExists,
    contentRevision: state.contentRevision,
    characterRevision: state.characterRevision,
  };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > PROJECT_PERSISTENCE_MAX_BODY_BYTES) {
      throw new RequestError(413, 'request-too-large', 'Project persistence request body is too large.');
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    throw new RequestError(400, 'malformed-json', 'Project persistence request contains malformed JSON.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function requiredHeader(request: IncomingMessage, name: string): string {
  const value = request.headers[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new RequestError(428, 'missing-revision', 'Project persistence request is missing required revision metadata.');
  }
  return value;
}

function ensureJsonRequest(request: IncomingMessage): void {
  const contentType = request.headers['content-type'];
  if (typeof contentType !== 'string' || !contentType.toLowerCase().startsWith('application/json')) {
    throw new RequestError(415, 'unsupported-content-type', 'Project persistence PUT requests require application/json.');
  }
}

export function createProjectPersistenceMiddleware(store: ProjectStore) {
  return async function projectPersistenceMiddleware(
    request: IncomingMessage,
    response: ServerResponse,
    next: Next,
  ): Promise<void> {
    const rawUrl = request.url ?? '/';
    const rawPath = rawUrl.split('?', 1)[0];
    const parsedUrl = new URL(rawUrl, 'http://127.0.0.1');
    const inProjectNamespace = rawPath.startsWith(PROJECT_STATE_ROUTE);
    if (!inProjectNamespace && !parsedUrl.pathname.startsWith(PROJECT_STATE_ROUTE)) {
      next();
      return;
    }

    const exactPath = parsedUrl.pathname;
    if (parsedUrl.search) {
      sendJson(response, 404, { error: { code: 'unsupported-route', message: 'Unsupported project persistence route.' } });
      return;
    }

    try {
      if (exactPath === PROJECT_STATE_ROUTE) {
        if (request.method !== 'GET') {
          sendJson(response, 405, { error: { code: 'unsupported-method', message: 'Only GET is supported for project state.' } });
          return;
        }
        sendJson(response, 200, responseState(await store.readState()));
        return;
      }

      if (exactPath === PROJECT_LEGACY_CONTENT_EXPORT_ROUTE) {
        if (request.method !== 'GET') {
          sendJson(response, 405, { error: { code: 'unsupported-method', message: 'Only GET is supported for the preserved legacy content export.' } });
          return;
        }
        sendJson(response, 200, { content: await store.readLegacyContentExport() });
        return;
      }

      if (exactPath === PROJECT_MIGRATION_ROUTE) {
        if (request.method !== 'PUT') {
          sendJson(response, 405, { error: { code: 'unsupported-method', message: 'Only PUT is supported for explicit project migration.' } });
          return;
        }
        ensureJsonRequest(request);
        const expectedContentRevision = requiredHeader(request, 'if-match');
        const expectedCharacterRevision = requiredHeader(request, 'x-dnd3-characters-if-match');
        const body = await readJsonBody(request);
        if (!isRecord(body) || !Array.isArray(body.content) || !Array.isArray(body.characters)) {
          throw new RequestError(400, 'invalid-body', 'Project migration PUT body must contain complete content and Character arrays.');
        }
        sendJson(
          response,
          200,
          responseState(await store.putMigration(body.content, body.characters, expectedContentRevision, expectedCharacterRevision)),
        );
        return;
      }

      if (exactPath === PROJECT_CONTENT_ROUTE) {
        if (request.method !== 'PUT') {
          sendJson(response, 405, { error: { code: 'unsupported-method', message: 'Only PUT is supported for project content.' } });
          return;
        }
        ensureJsonRequest(request);
        const expectedContentRevision = requiredHeader(request, 'if-match');
        const expectedCharacterRevision = requiredHeader(request, 'x-dnd3-characters-if-match');
        const body = await readJsonBody(request);
        if (!Array.isArray(body)) throw new RequestError(400, 'invalid-body', 'Project content PUT body must be a complete JSON array.');
        sendJson(response, 200, responseState(await store.putContent(body, expectedContentRevision, expectedCharacterRevision)));
        return;
      }

      if (exactPath === PROJECT_CHARACTERS_ROUTE) {
        if (request.method !== 'PUT') {
          sendJson(response, 405, { error: { code: 'unsupported-method', message: 'Only PUT is supported for project Characters.' } });
          return;
        }
        ensureJsonRequest(request);
        const expectedCharacterRevision = requiredHeader(request, 'if-match');
        const expectedContentRevision = requiredHeader(request, 'x-dnd3-content-if-match');
        const body = await readJsonBody(request);
        if (!Array.isArray(body)) throw new RequestError(400, 'invalid-body', 'Project Character PUT body must be a complete JSON array.');
        sendJson(response, 200, responseState(await store.putCharacters(body, expectedCharacterRevision, expectedContentRevision)));
        return;
      }

      sendJson(response, 404, { error: { code: 'unsupported-route', message: 'Unsupported project persistence route.' } });
    } catch (error) {
      if (error instanceof RequestError) {
        sendJson(response, error.status, { error: { code: error.code, message: error.message } });
        return;
      }
      const safe = safeError(error);
      sendJson(response, safe.status, { error: { code: safe.code, message: safe.message } });
    }
  };
}

export function projectPersistencePlugin(): Plugin {
  return {
    name: 'dnd3-project-persistence',
    apply: 'serve',
    configureServer(server) {
      const store = new ProjectStore(server.config.root);
      const middleware = createProjectPersistenceMiddleware(store);
      server.middlewares.use((request, response, next) => {
        void middleware(request as unknown as IncomingMessage, response as unknown as ServerResponse, next);
      });
    },
  };
}
