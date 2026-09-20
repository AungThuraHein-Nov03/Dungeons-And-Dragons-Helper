import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Character } from '../src/models/character';
import { CONTENT_KINDS, type ContentEntry, type ContentKind } from '../src/models/content';
import { createContentRegistry, type ContentRegistry } from '../src/services/contentRegistry';
import { isCharacter } from '../src/services/characterStorage';
import { validateHomebrewContent } from '../src/services/homebrewContentStorage';

export const PROJECT_CONTENT_RELATIVE_PATH = '.dnd3/creator-forge/homebrew-content.v1.json';
export const PROJECT_CHARACTERS_RELATIVE_PATH = '.dnd3/characters/characters.v9.json';
export const LEGACY_CONTENT_EXPORT_RELATIVE_PATH = 'dnd3-homebrew-content-v1.json';
export const ABSENT_PROJECT_STORE_REVISION = strongRevision('dnd3:absent-store:v1');

const MAX_ERROR_MESSAGE_LENGTH = 240;

export interface ProjectStateSnapshot {
  readonly content: ContentEntry[];
  readonly characters: Character[];
  readonly contentExists: boolean;
  readonly charactersExists: boolean;
  readonly contentRevision: string;
  readonly characterRevision: string;
}

export type ProjectStoreErrorCode =
  | 'malformed-json'
  | 'invalid-content'
  | 'invalid-characters'
  | 'incompatible-characters'
  | 'stale-content'
  | 'stale-characters'
  | 'read-failed'
  | 'write-failed';

export class ProjectStoreError extends Error {
  readonly code: ProjectStoreErrorCode;

  constructor(code: ProjectStoreErrorCode, message: string) {
    super(message.slice(0, MAX_ERROR_MESSAGE_LENGTH));
    this.name = 'ProjectStoreError';
    this.code = code;
  }
}

export interface ProjectFileSystem {
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

const nodeFileSystem: ProjectFileSystem = {
  readFile,
  mkdir,
  writeFile,
  rename,
  unlink,
};

interface StoreFile {
  readonly exists: boolean;
  readonly raw?: string;
  readonly revision: string;
}

function strongRevision(value: string): string {
  return `"${createHash('sha256').update(value).digest('hex')}"`;
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function looksLikeContentEntry(value: unknown): value is ContentEntry {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.kind === 'string'
    && CONTENT_KINDS.includes(value.kind as ContentKind)
    && typeof value.name === 'string'
    && isRecord(value.source);
}

function parseJsonArray(raw: string, label: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ProjectStoreError('malformed-json', `${label} store contains malformed JSON.`);
  }
  if (!Array.isArray(parsed)) throw new ProjectStoreError('malformed-json', `${label} store must contain a JSON array.`);
  return parsed;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function assertMigrationSuperset<T extends { readonly id: string }>(
  current: readonly T[],
  proposed: readonly T[],
  label: string,
): void {
  const proposedById = new Map(proposed.map((entry) => [entry.id, entry]));
  for (const entry of current) {
    const candidate = proposedById.get(entry.id);
    if (!candidate || !canonicalEqual(entry, candidate)) {
      throw new ProjectStoreError('invalid-content', 'Migration may not delete or overwrite existing project ' + label + '.');
    }
  }
}

export function validateProjectContent(value: unknown): { entries: ContentEntry[]; registry: ContentRegistry } {
  if (!Array.isArray(value) || !value.every(looksLikeContentEntry)) {
    throw new ProjectStoreError('invalid-content', 'Project content must be a canonical ContentEntry array.');
  }
  const entries = value as ContentEntry[];
  const validation = validateHomebrewContent(entries);
  if (!validation.ok) throw new ProjectStoreError('invalid-content', validation.error.message);
  try {
    return { entries: structuredClone(entries), registry: createContentRegistry(entries) };
  } catch {
    throw new ProjectStoreError('invalid-content', 'Project content does not form a valid canonical dataset.');
  }
}

export function validateProjectCharacters(value: unknown, registry: ContentRegistry): Character[] {
  if (!Array.isArray(value)) throw new ProjectStoreError('invalid-characters', 'Project Character store must contain a Character v9 array.');
  const invalid = value.find((entry) => !isCharacter(entry, registry));
  if (invalid !== undefined) {
    throw new ProjectStoreError('invalid-characters', 'Project Character store contains an invalid Character v9 record.');
  }
  return structuredClone(value as Character[]);
}

export class ProjectStore {
  readonly root: string;
  readonly contentPath: string;
  readonly charactersPath: string;
  readonly legacyContentExportPath: string;
  readonly #fs: ProjectFileSystem;
  #tail: Promise<void> = Promise.resolve();

  constructor(root: string, fileSystem: ProjectFileSystem = nodeFileSystem) {
    this.root = resolve(root);
    this.contentPath = resolve(this.root, PROJECT_CONTENT_RELATIVE_PATH);
    this.charactersPath = resolve(this.root, PROJECT_CHARACTERS_RELATIVE_PATH);
    this.legacyContentExportPath = resolve(this.root, LEGACY_CONTENT_EXPORT_RELATIVE_PATH);
    this.#fs = fileSystem;
  }

  #serialized<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.#tail.then(operation, operation);
    this.#tail = run.then(() => undefined, () => undefined);
    return run;
  }

  async #readStoreFile(path: string): Promise<StoreFile> {
    try {
      const raw = await this.#fs.readFile(path, 'utf8');
      return { exists: true, raw, revision: strongRevision(raw) };
    } catch (error) {
      if (isMissingFileError(error)) return { exists: false, revision: ABSENT_PROJECT_STORE_REVISION };
      throw new ProjectStoreError('read-failed', 'Project persistence store could not be read safely.');
    }
  }

  async #readUnlocked(): Promise<ProjectStateSnapshot> {
    const [contentFile, characterFile] = await Promise.all([
      this.#readStoreFile(this.contentPath),
      this.#readStoreFile(this.charactersPath),
    ]);
    const contentRaw = contentFile.raw === undefined ? [] : parseJsonArray(contentFile.raw, 'Creator Forge content');
    const { entries: content, registry } = validateProjectContent(contentRaw);
    const characterRaw = characterFile.raw === undefined ? [] : parseJsonArray(characterFile.raw, 'Character v9');
    const characters = validateProjectCharacters(characterRaw, registry);
    return {
      content,
      characters,
      contentExists: contentFile.exists,
      charactersExists: characterFile.exists,
      contentRevision: contentFile.revision,
      characterRevision: characterFile.revision,
    };
  }

  readState(): Promise<ProjectStateSnapshot> {
    return this.#serialized(() => this.#readUnlocked());
  }

  async #atomicWriteRaw(path: string, raw: string): Promise<string> {
    const parent = dirname(path);
    const tempPath = resolve(parent, `.${randomUUID()}.tmp`);
    let tempExists = false;
    try {
      await this.#fs.mkdir(parent, { recursive: true });
      await this.#fs.writeFile(tempPath, raw, 'utf8');
      tempExists = true;
      await this.#fs.rename(tempPath, path);
      tempExists = false;
      return strongRevision(raw);
    } catch {
      if (tempExists) {
        try { await this.#fs.unlink(tempPath); } catch { /* best-effort cleanup */ }
      }
      throw new ProjectStoreError('write-failed', 'Project persistence store could not be committed safely.');
    }
  }

  #atomicWrite(path: string, value: readonly unknown[]): Promise<string> {
    return this.#atomicWriteRaw(path, JSON.stringify(value));
  }

  async #restoreStoreFile(path: string, previous: StoreFile): Promise<void> {
    if (previous.exists) {
      if (previous.raw === undefined) throw new ProjectStoreError('write-failed', 'Project persistence rollback source is unavailable.');
      await this.#atomicWriteRaw(path, previous.raw);
      return;
    }
    try {
      await this.#fs.unlink(path);
    } catch (error) {
      if (!isMissingFileError(error)) throw new ProjectStoreError('write-failed', 'Project persistence rollback failed.');
    }
  }

  async readLegacyContentExport(): Promise<ContentEntry[]> {
    return this.#serialized(async () => {
      let raw: string;
      try {
        raw = await this.#fs.readFile(this.legacyContentExportPath, 'utf8');
      } catch (error) {
        if (isMissingFileError(error)) return [];
        throw new ProjectStoreError('read-failed', 'Preserved legacy content export could not be read safely.');
      }
      return validateProjectContent(parseJsonArray(raw, 'Preserved legacy content export')).entries;
    });
  }

  putContent(
    proposed: unknown,
    expectedContentRevision: string,
    expectedCharacterRevision: string,
  ): Promise<ProjectStateSnapshot> {
    return this.#serialized(async () => {
      const current = await this.#readUnlocked();
      if (expectedContentRevision !== current.contentRevision) {
        throw new ProjectStoreError('stale-content', 'Project content changed before this write could commit.');
      }
      if (expectedCharacterRevision !== current.characterRevision) {
        throw new ProjectStoreError('stale-characters', 'Project Characters changed before this content write could commit.');
      }
      const { entries, registry } = validateProjectContent(proposed);
      try {
        validateProjectCharacters(current.characters, registry);
      } catch {
        throw new ProjectStoreError('incompatible-characters', 'Current project Characters would be invalid under the proposed content.');
      }
      const contentRevision = await this.#atomicWrite(this.contentPath, entries);
      return {
        ...current,
        content: entries,
        contentExists: true,
        contentRevision,
      };
    });
  }

  putCharacters(
    proposed: unknown,
    expectedCharacterRevision: string,
    expectedContentRevision: string,
  ): Promise<ProjectStateSnapshot> {
    return this.#serialized(async () => {
      const current = await this.#readUnlocked();
      if (expectedCharacterRevision !== current.characterRevision) {
        throw new ProjectStoreError('stale-characters', 'Project Characters changed before this write could commit.');
      }
      if (expectedContentRevision !== current.contentRevision) {
        throw new ProjectStoreError('stale-content', 'Project content changed before this Character write could commit.');
      }
      const registry = createContentRegistry(current.content);
      const characters = validateProjectCharacters(proposed, registry);
      const characterRevision = await this.#atomicWrite(this.charactersPath, characters);
      return {
        ...current,
        characters,
        charactersExists: true,
        characterRevision,
      };
    });
  }

  putMigration(
    proposedContent: unknown,
    proposedCharacters: unknown,
    expectedContentRevision: string,
    expectedCharacterRevision: string,
  ): Promise<ProjectStateSnapshot> {
    return this.#serialized(async () => {
      const current = await this.#readUnlocked();
      if (expectedContentRevision !== current.contentRevision) {
        throw new ProjectStoreError('stale-content', 'Project content changed before this migration could commit.');
      }
      if (expectedCharacterRevision !== current.characterRevision) {
        throw new ProjectStoreError('stale-characters', 'Project Characters changed before this migration could commit.');
      }

      const { entries, registry } = validateProjectContent(proposedContent);
      const characters = validateProjectCharacters(proposedCharacters, registry);
      assertMigrationSuperset(current.content, entries, 'content');
      assertMigrationSuperset(current.characters, characters, 'Characters');

      const currentContentFile = await this.#readStoreFile(this.contentPath);
      const currentCharacterFile = await this.#readStoreFile(this.charactersPath);
      const contentChanged = !canonicalEqual(current.content, entries);
      const charactersChanged = !canonicalEqual(current.characters, characters);
      let contentRevision = current.contentRevision;
      let characterRevision = current.characterRevision;
      let contentCommitted = false;
      let charactersCommitted = false;

      try {
        if (contentChanged) {
          contentRevision = await this.#atomicWrite(this.contentPath, entries);
          contentCommitted = true;
        }
        if (charactersChanged) {
          characterRevision = await this.#atomicWrite(this.charactersPath, characters);
          charactersCommitted = true;
        }
      } catch (error) {
        if (charactersCommitted) await this.#restoreStoreFile(this.charactersPath, currentCharacterFile);
        if (contentCommitted) await this.#restoreStoreFile(this.contentPath, currentContentFile);
        throw error;
      }

      return {
        content: entries,
        characters,
        contentExists: current.contentExists || contentChanged,
        charactersExists: current.charactersExists || charactersChanged,
        contentRevision,
        characterRevision,
      };
    });
  }
}
