import { SRD_CONTENT } from '../content/srd';
import { CONTENT_KINDS, type ContentEntry, type ContentKind, type HomebrewSourceMetadata } from '../models/content';
import type { ContentValidationIssue } from './contentValidation';
import { validateContentDataset } from './contentValidation';

export const HOMEBREW_CONTENT_STORAGE_KEY = 'dnd3.homebrew-content.v1';
const HOMEBREW_ID_PART = /^[a-z0-9][a-z0-9-]*$/;
const HOMEBREW_NESTED_ENTITY_KINDS = [
  'class-feature',
  'subclass-feature',
  'class-resource',
  'class-resource-consumer',
  'subclass-resource-consumer',
  'resource-transaction',
  'active-self-effect',
  'dice-transformation',
  'feat-reference-effect',
  'spell-reference-effect',
  'subclass-reference-effect',
  'class-reference-effect',
  'class-tool-proficiency',
  'multiclass-tool-choice',
  'starting-equipment-option',
  'spellcasting-provider',
  'spell-slot-pool',
  'spell-slot',
] as const;

export type HomebrewNestedEntityKind = (typeof HOMEBREW_NESTED_ENTITY_KINDS)[number];
export type HomebrewEntityKind = ContentKind | HomebrewNestedEntityKind;

const HOMEBREW_ENTITY_KIND_SET = new Set<string>([...CONTENT_KINDS, ...HOMEBREW_NESTED_ENTITY_KINDS]);

export interface HomebrewContentStorageError {
  readonly code: 'storage-read-failed' | 'malformed-json' | 'invalid-shape' | 'invalid-identity' | 'invalid-dataset';
  readonly message: string;
  readonly issues?: readonly ContentValidationIssue[];
}

export type HomebrewContentLoadResult =
  | { readonly ok: true; readonly entries: ContentEntry[] }
  | { readonly ok: false; readonly error: HomebrewContentStorageError };

export type HomebrewContentValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: HomebrewContentStorageError };

export interface HomebrewContentIdAllocationOptions {
  readonly namespace?: string;
  readonly randomUUID?: () => string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function buildHomebrewEntityId(namespace: string, kind: HomebrewEntityKind, token: string): string {
  if (!HOMEBREW_ID_PART.test(namespace) || !HOMEBREW_ID_PART.test(token) || !HOMEBREW_ENTITY_KIND_SET.has(kind)) {
    throw new Error('Homebrew namespace and identity token must use lowercase letters, numbers, and hyphens with a supported entity kind.');
  }
  return `homebrew:${namespace}:${kind}:${token}`;
}

export function buildHomebrewContentId(namespace: string, kind: ContentKind, slug: string): string {
  return buildHomebrewEntityId(namespace, kind, slug);
}

export function allocateHomebrewContentId(
  kind: HomebrewEntityKind,
  options: HomebrewContentIdAllocationOptions = {},
): string {
  const namespace = options.namespace ?? 'local';
  const randomUUID = options.randomUUID ?? (() => {
    if (typeof globalThis.crypto?.randomUUID !== 'function') {
      throw new Error('This runtime does not provide crypto.randomUUID for stable Homebrew identity allocation.');
    }
    return globalThis.crypto.randomUUID();
  });
  return buildHomebrewEntityId(namespace, kind, randomUUID().toLowerCase());
}

export function isValidHomebrewIdentity(entry: ContentEntry): boolean {
  if (!entry.source || entry.source.type !== 'homebrew') return false;
  const source = entry.source as HomebrewSourceMetadata;
  if (!HOMEBREW_ID_PART.test(source.namespace)) return false;
  const prefix = `homebrew:${source.namespace}:${entry.kind}:`;
  return entry.id.startsWith(prefix) && HOMEBREW_ID_PART.test(entry.id.slice(prefix.length));
}

function looksLikeContentEntry(value: unknown): value is ContentEntry {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.kind === 'string'
    && CONTENT_KINDS.includes(value.kind as ContentKind)
    && typeof value.name === 'string'
    && isRecord(value.source);
}

export function validateHomebrewContent(entries: readonly ContentEntry[]): HomebrewContentValidationResult {
  const invalidIdentity = entries.find((entry) => !isValidHomebrewIdentity(entry));
  if (invalidIdentity) {
    return {
      ok: false,
      error: {
        code: 'invalid-identity',
        message: `Invalid Homebrew content identity: ${invalidIdentity.id || '(missing id)'}.`,
      },
    };
  }

  try {
    const issues = validateContentDataset([...SRD_CONTENT, ...entries]);
    return issues.length === 0
      ? { ok: true }
      : {
          ok: false,
          error: {
            code: 'invalid-dataset',
            message: 'Homebrew content does not form a valid canonical dataset with bundled SRD content.',
            issues,
          },
        };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'invalid-dataset',
        message: error instanceof Error
          ? `Homebrew content could not be validated safely: ${error.message}`
          : 'Homebrew content could not be validated safely.',
      },
    };
  }
}

export function deserializeHomebrewContentResult(raw: string | null): HomebrewContentLoadResult {
  if (!raw) return { ok: true, entries: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: { code: 'malformed-json', message: 'Homebrew content storage contains malformed JSON.' } };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, error: { code: 'invalid-shape', message: 'Homebrew content storage must contain a canonical ContentEntry array.' } };
  }
  if (!parsed.every(looksLikeContentEntry)) {
    return { ok: false, error: { code: 'invalid-shape', message: 'Homebrew content storage contains an invalid ContentEntry shape.' } };
  }

  const validation = validateHomebrewContent(parsed);
  return validation.ok ? { ok: true, entries: parsed } : validation;
}

export function deserializeHomebrewContent(raw: string | null): ContentEntry[] {
  const result = deserializeHomebrewContentResult(raw);
  return result.ok ? result.entries : [];
}

function browserStorage(): Storage {
  return window.localStorage;
}

export function loadHomebrewContentResult(storage: Storage = browserStorage()): HomebrewContentLoadResult {
  try {
    return deserializeHomebrewContentResult(storage.getItem(HOMEBREW_CONTENT_STORAGE_KEY));
  } catch {
    return { ok: false, error: { code: 'storage-read-failed', message: 'Homebrew content storage could not be read.' } };
  }
}

export function loadHomebrewContent(storage: Storage = browserStorage()): ContentEntry[] {
  const result = loadHomebrewContentResult(storage);
  return result.ok ? result.entries : [];
}

export function saveHomebrewContent(entries: readonly ContentEntry[], storage: Storage = browserStorage()): void {
  const validation = validateHomebrewContent(entries);
  if (!validation.ok) throw new Error(validation.error.message);
  storage.setItem(HOMEBREW_CONTENT_STORAGE_KEY, JSON.stringify(entries));
}

export function upsertHomebrewContent(entry: ContentEntry, storage: Storage = browserStorage()): void {
  const loaded = loadHomebrewContentResult(storage);
  if (!loaded.ok) throw new Error(loaded.error.message);

  const entries = [...loaded.entries];
  const index = entries.findIndex((candidate) => candidate.id === entry.id);
  if (index >= 0) entries[index] = entry;
  else entries.push(entry);
  saveHomebrewContent(entries, storage);
}

export function deleteHomebrewContent(id: string, storage: Storage = browserStorage()): boolean {
  const loaded = loadHomebrewContentResult(storage);
  if (!loaded.ok) return false;

  const remaining = loaded.entries.filter((entry) => entry.id !== id);
  if (remaining.length === loaded.entries.length) return false;
  saveHomebrewContent(remaining, storage);
  return true;
}
