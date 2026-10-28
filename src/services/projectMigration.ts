import type { Character } from '../models/character';
import type { ContentEntry } from '../models/content';
import { listCatalogCharacters } from './characterCatalog';
import { getProjectContentEntries } from './contentCatalog';
import { contentRegistry, createContentRegistry } from './contentRegistry';
import {
  CHARACTER_STORAGE_KEY,
  LEGACY_CHARACTER_STORAGE_V9_KEY,
  isCharacter,
  migrateLegacyV9Character,
} from './characterStorage';
import {
  HOMEBREW_CONTENT_STORAGE_KEY,
  deserializeHomebrewContentResult,
  validateHomebrewContent,
} from './homebrewContentStorage';
import { getPersistenceBackend } from './persistenceBackend';
import {
  fetchLegacyProjectContentExport,
  ProjectTransportError,
  putProjectMigration,
} from './projectPersistenceTransport';
import { acceptProjectMigrationEnvelope, getApplicationProjectState } from './projectState';

export type MigrationClassification = 'addition' | 'identical' | 'conflict';

export interface MigrationItem {
  readonly id: string;
  readonly name: string;
  readonly classification: MigrationClassification;
  readonly message?: string;
}

export interface LegacyMigrationSources {
  readonly content: ContentEntry[];
  readonly characters: unknown[];
}

export interface ProjectMigrationPlan {
  readonly ok: boolean;
  readonly contentItems: MigrationItem[];
  readonly characterItems: MigrationItem[];
  readonly blockers: string[];
  readonly sourceContentCount: number;
  readonly sourceCharacterCount: number;
  readonly prospectiveContent: ContentEntry[];
  readonly prospectiveCharacters: Character[];
  readonly contentRevision?: string;
  readonly characterRevision?: string;
}

export type ProjectMigrationResult =
  | { readonly ok: true; readonly contentAdded: number; readonly charactersAdded: number }
  | { readonly ok: false; readonly message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function migrationCanonicalEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function displayName(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.name === 'string' && value.name.trim() ? value.name : fallback;
}

function strictCharacterArray(raw: string | null, label: string): { ok: true; values: unknown[] } | { ok: false; message: string } {
  if (raw === null || raw === '') return { ok: true, values: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: label + ' contains malformed JSON.' };
  }
  if (!Array.isArray(parsed)) return { ok: false, message: label + ' must contain a canonical Character array.' };
  return { ok: true, values: parsed };
}

export function readLegacyBrowserMigrationSources(
  storage: Storage = window.localStorage,
): { readonly ok: true; readonly sources: LegacyMigrationSources } | { readonly ok: false; readonly message: string } {
  const content = deserializeHomebrewContentResult(storage.getItem(HOMEBREW_CONTENT_STORAGE_KEY));
  if (!content.ok) return { ok: false, message: content.error.message };

  const currentRaw = storage.getItem(CHARACTER_STORAGE_KEY);
  const legacyV9 = currentRaw === null;
  const characters = strictCharacterArray(
    legacyV9 ? storage.getItem(LEGACY_CHARACTER_STORAGE_V9_KEY) : currentRaw,
    legacyV9 ? 'Legacy Character v9 storage' : 'Character v10 storage',
  );
  if (!characters.ok) return characters;

  const characterValues = legacyV9
    ? characters.values.map((value) => migrateLegacyV9Character(value) ?? value)
    : characters.values;

  return {
    ok: true,
    sources: {
      content: structuredClone(content.entries),
      characters: structuredClone(characterValues),
    },
  };
}

function classifyIncoming<T extends { readonly id: string }>(
  incoming: readonly T[],
  current: readonly T[],
  nameOf: (value: T) => string,
  label: string,
): { items: MigrationItem[]; additions: T[]; blockers: string[] } {
  const currentById = new Map(current.map((entry) => [entry.id, entry]));
  const seen = new Set<string>();
  const items: MigrationItem[] = [];
  const additions: T[] = [];
  const blockers: string[] = [];

  for (const entry of incoming) {
    if (seen.has(entry.id)) {
      items.push({ id: entry.id, name: nameOf(entry), classification: 'conflict', message: 'Duplicate incoming ID.' });
      blockers.push('Duplicate incoming ' + label + ' ID: ' + entry.id + '.');
      continue;
    }
    seen.add(entry.id);

    const existing = currentById.get(entry.id);
    if (!existing) {
      items.push({ id: entry.id, name: nameOf(entry), classification: 'addition' });
      additions.push(entry);
      continue;
    }
    if (migrationCanonicalEqual(existing, entry)) {
      items.push({ id: entry.id, name: nameOf(entry), classification: 'identical' });
      continue;
    }
    items.push({ id: entry.id, name: nameOf(entry), classification: 'conflict', message: 'Same ID has different canonical data.' });
    blockers.push(label + ' conflict for ID ' + entry.id + ': project and incoming canonical data differ.');
  }

  return { items, additions, blockers };
}

export function planProjectMigration(sources: LegacyMigrationSources): ProjectMigrationPlan {
  const blockers: string[] = [];
  const state = getApplicationProjectState();
  if (getPersistenceBackend() !== 'project' || state.backend !== 'project' || state.status !== 'ready') {
    blockers.push('Project persistence must be ready before migration can be planned.');
  }

  const contentValidation = validateHomebrewContent(sources.content);
  if (!contentValidation.ok) blockers.push(contentValidation.error.message);

  const currentContent = [...getProjectContentEntries()];
  const currentCharacters = listCatalogCharacters();
  const contentClassified = classifyIncoming(
    sources.content,
    currentContent,
    (entry) => entry.name,
    'content',
  );
  blockers.push(...contentClassified.blockers);

  for (const entry of sources.content) {
    const effective = contentRegistry.getById(entry.id);
    if (effective?.source.type === 'srd') {
      blockers.push('Bundled SRD content cannot be overwritten by migration: ' + entry.id + '.');
    }
  }

  const prospectiveContent = [...currentContent, ...contentClassified.additions];
  let prospectiveRegistry;
  try {
    prospectiveRegistry = createContentRegistry(prospectiveContent);
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : 'Prospective migrated content is invalid.');
    prospectiveRegistry = createContentRegistry(currentContent);
  }

  const parsedCharacters: Character[] = [];
  const invalidCharacterItems: MigrationItem[] = [];
  for (const value of sources.characters) {
    if (!isCharacter(value, prospectiveRegistry)) {
      const id = isRecord(value) && typeof value.id === 'string' ? value.id : '(missing id)';
      invalidCharacterItems.push({
        id,
        name: displayName(value, id),
        classification: 'conflict',
        message: 'Incoming record is not a canonical Character v10 record under the prospective content.',
      });
      blockers.push('Invalid incoming Character v10 record: ' + id + '.');
      continue;
    }
    parsedCharacters.push(structuredClone(value));
  }

  const characterClassified = classifyIncoming(
    parsedCharacters,
    currentCharacters,
    (entry) => entry.name,
    'Character',
  );
  blockers.push(...characterClassified.blockers);
  const characterItems = [...characterClassified.items, ...invalidCharacterItems];
  const prospectiveCharacters = [...currentCharacters, ...characterClassified.additions];

  return {
    ok: blockers.length === 0,
    contentItems: contentClassified.items,
    characterItems,
    blockers: [...new Set(blockers)],
    sourceContentCount: sources.content.length,
    sourceCharacterCount: sources.characters.length,
    prospectiveContent: structuredClone(prospectiveContent),
    prospectiveCharacters: structuredClone(prospectiveCharacters),
    ...(state.contentRevision ? { contentRevision: state.contentRevision } : {}),
    ...(state.characterRevision ? { characterRevision: state.characterRevision } : {}),
  };
}

export function planCurrentProjectCharacterV10Migration(): ProjectMigrationPlan {
  const blockers: string[] = [];
  const state = getApplicationProjectState();
  if (getPersistenceBackend() !== 'project' || state.backend !== 'project' || state.status !== 'ready') {
    blockers.push('Project persistence must be ready before Character v10 migration can be planned.');
  }
  if (!state.characterMigrationRequired) {
    blockers.push('This project does not require Character v9 to v10 migration.');
  }

  const currentContent = [...getProjectContentEntries()];
  const currentCharacters = listCatalogCharacters();
  return {
    ok: blockers.length === 0,
    contentItems: [],
    characterItems: currentCharacters.map((character) => ({
      id: character.id,
      name: character.name,
      classification: 'identical' as const,
      message: 'Deterministic v9 to v10 conversion; legacy fields are preserved and new choice arrays start empty.',
    })),
    blockers,
    sourceContentCount: 0,
    sourceCharacterCount: currentCharacters.length,
    prospectiveContent: structuredClone(currentContent),
    prospectiveCharacters: structuredClone(currentCharacters),
    ...(state.contentRevision ? { contentRevision: state.contentRevision } : {}),
    ...(state.characterRevision ? { characterRevision: state.characterRevision } : {}),
  };
}

export async function loadPreservedLegacyContentExport(): Promise<
  { readonly ok: true; readonly content: ContentEntry[] } | { readonly ok: false; readonly message: string }
> {
  try {
    const content = await fetchLegacyProjectContentExport();
    const validation = validateHomebrewContent(content);
    return validation.ok
      ? { ok: true, content }
      : { ok: false, message: validation.error.message };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Preserved legacy content export could not be loaded safely.',
    };
  }
}

export async function executeProjectMigration(plan: ProjectMigrationPlan): Promise<ProjectMigrationResult> {
  if (!plan.ok || plan.blockers.length > 0) {
    return { ok: false, message: plan.blockers[0] ?? 'Migration plan is blocked.' };
  }
  if (!plan.contentRevision || !plan.characterRevision) {
    return { ok: false, message: 'Project migration revisions are unavailable. Refresh or reload before trying again.' };
  }

  const current = getApplicationProjectState();
  if (current.contentRevision !== plan.contentRevision || current.characterRevision !== plan.characterRevision) {
    return { ok: false, message: 'Project state changed after this migration plan was prepared. Inspect the legacy data again before retrying.' };
  }

  let envelope;
  try {
    envelope = await putProjectMigration(
      plan.prospectiveContent,
      plan.prospectiveCharacters,
      plan.contentRevision,
      plan.characterRevision,
    );
  } catch (error) {
    if (error instanceof ProjectTransportError && (error.code === 'stale-content' || error.code === 'stale-characters')) {
      return { ok: false, message: 'Project state changed before migration could commit. Inspect the legacy data again before retrying.' };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Project migration failed safely.',
    };
  }

  const accepted = acceptProjectMigrationEnvelope(envelope);
  if (!accepted.ok) return { ok: false, message: accepted.error };
  return {
    ok: true,
    contentAdded: plan.contentItems.filter((item) => item.classification === 'addition').length,
    charactersAdded: plan.characterItems.filter((item) => item.classification === 'addition').length,
  };
}
