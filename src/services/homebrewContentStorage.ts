import type { ContentEntry, ContentKind, HomebrewSourceMetadata } from '../models/content';

export const HOMEBREW_CONTENT_STORAGE_KEY = 'dnd3.homebrew-content.v1';
const HOMEBREW_ID_PART = /^[a-z0-9][a-z0-9-]*$/;

export function buildHomebrewContentId(namespace: string, kind: ContentKind, slug: string): string {
  if (!HOMEBREW_ID_PART.test(namespace) || !HOMEBREW_ID_PART.test(slug)) {
    throw new Error('Homebrew namespace and slug must use lowercase letters, numbers, and hyphens.');
  }
  return `homebrew:${namespace}:${kind}:${slug}`;
}

export function isValidHomebrewIdentity(entry: ContentEntry): boolean {
  if (entry.source.type !== 'homebrew') {
    return false;
  }
  const source = entry.source as HomebrewSourceMetadata;
  return HOMEBREW_ID_PART.test(source.namespace) && entry.id.startsWith(`homebrew:${source.namespace}:${entry.kind}:`);
}

export function deserializeHomebrewContent(raw: string | null): ContentEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is ContentEntry => typeof entry === 'object' && entry !== null && 'id' in entry && 'kind' in entry && 'name' in entry && 'source' in entry && isValidHomebrewIdentity(entry as ContentEntry));
  } catch {
    return [];
  }
}

function browserStorage(): Storage {
  return window.localStorage;
}

export function loadHomebrewContent(storage: Storage = browserStorage()): ContentEntry[] {
  return deserializeHomebrewContent(storage.getItem(HOMEBREW_CONTENT_STORAGE_KEY));
}

export function saveHomebrewContent(entries: readonly ContentEntry[], storage: Storage = browserStorage()): void {
  if (entries.some((entry) => !isValidHomebrewIdentity(entry))) {
    throw new Error('Only valid Homebrew entries may be saved in Homebrew storage.');
  }
  storage.setItem(HOMEBREW_CONTENT_STORAGE_KEY, JSON.stringify(entries));
}

export function upsertHomebrewContent(entry: ContentEntry, storage: Storage = browserStorage()): void {
  if (!isValidHomebrewIdentity(entry)) {
    throw new Error('Invalid Homebrew content identity.');
  }
  const entries = loadHomebrewContent(storage);
  const index = entries.findIndex((candidate) => candidate.id === entry.id);
  if (index >= 0) entries[index] = entry;
  else entries.push(entry);
  saveHomebrewContent(entries, storage);
}

export function deleteHomebrewContent(id: string, storage: Storage = browserStorage()): boolean {
  const entries = loadHomebrewContent(storage);
  const remaining = entries.filter((entry) => entry.id !== id);
  if (remaining.length === entries.length) return false;
  saveHomebrewContent(remaining, storage);
  return true;
}
