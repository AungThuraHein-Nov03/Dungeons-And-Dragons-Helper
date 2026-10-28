import { describe, expect, it, vi } from 'vitest';
import { buildEquipmentContentFromDraft, createEquipmentForgeDraft } from '../components/equipmentForgeModel';
import { buildFeatContentFromDraft, createFeatForgeDraft } from '../components/featForgeModel';
import type { ContentEntry } from '../models/content';
import {
  deserializeHomebrewContentResult,
  loadHomebrewContentResult,
  saveHomebrewContent,
} from '../services/homebrewContentStorage';
import {
  fetchProjectState,
  PROJECT_CONTENT_ENDPOINT,
  PROJECT_STATE_ENDPOINT,
  putProjectContent,
  type ProjectStateEnvelope,
} from '../services/projectPersistenceTransport';

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

function equipmentEntries(): ContentEntry[] {
  return [
    buildEquipmentContentFromDraft({
      ...createEquipmentForgeDraft('weapon'),
      name: 'Persistent Blade',
      description: 'A blade whose project fields survive.',
      referenceEffects: ['Glows near hidden doors.'],
      attackBonus: 2,
      damageBonus: 3,
    }),
    buildEquipmentContentFromDraft({
      ...createEquipmentForgeDraft('armor'),
      name: 'Persistent Mail',
      description: 'Armor whose project fields survive.',
      referenceEffects: ['The wearer leaves no tracks.'],
      armorClassBonus: 2,
    }),
    buildEquipmentContentFromDraft({
      ...createEquipmentForgeDraft('equipment'),
      name: 'Persistent Compass',
      description: 'Points toward the last safe campsite.',
      referenceEffects: ['Advantage on checks to retrace a route.'],
    }),
  ];
}

function envelope(content: ContentEntry[], contentRevision: string): ProjectStateEnvelope {
  return {
    content,
    characters: [],
    contentExists: true,
    charactersExists: true,
    characterMigrationRequired: false,
    contentRevision,
    characterRevision: '"characters-1"',
  };
}

describe('equipment project persistence and generic import/export', () => {
  it('round-trips weapon, armor, and equipment through an isolated project transport without losing canonical fields', async () => {
    const expected = equipmentEntries();
    let persisted: ContentEntry[] = [];
    let revision = '"content-1"';
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input) === PROJECT_CONTENT_ENDPOINT && init?.method === 'PUT') {
        persisted = JSON.parse(String(init.body)) as ContentEntry[];
        revision = '"content-2"';
        return new Response(JSON.stringify(envelope(persisted, revision)), { status: 200 });
      }
      if (String(input) === PROJECT_STATE_ENDPOINT && init?.method === 'GET') {
        return new Response(JSON.stringify(envelope(persisted, revision)), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { code: 'unexpected-request' } }), { status: 500 });
    });

    await putProjectContent(expected, '"content-1"', '"characters-1"', fetchMock);
    const reloaded = await fetchProjectState(fetchMock);

    expect(reloaded.content).toEqual(expected);
    expect(reloaded.content.map((entry) => entry.id)).toEqual(expected.map((entry) => entry.id));
    expect(reloaded.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'weapon', attackBonus: 2, damageBonus: 3, description: 'A blade whose project fields survive.', referenceEffects: ['Glows near hidden doors.'] }),
      expect.objectContaining({ kind: 'armor', armorClassBonus: 2, description: 'Armor whose project fields survive.', referenceEffects: ['The wearer leaves no tracks.'] }),
      expect.objectContaining({ kind: 'equipment', description: 'Points toward the last safe campsite.', referenceEffects: ['Advantage on checks to retrace a route.'] }),
    ]));
  });

  it('keeps one generic ContentEntry array compatible with existing and equipment kinds', () => {
    const existing = buildFeatContentFromDraft({
      ...createFeatForgeDraft(),
      name: 'Persistent Feat',
      description: 'Existing Creator Forge kind.',
    });
    const mixed = [existing, ...equipmentEntries()];
    const storage = memoryStorage();

    saveHomebrewContent(mixed, storage);
    expect(loadHomebrewContentResult(storage)).toEqual({ ok: true, entries: mixed });
  });

  it('rejects duplicate IDs and malformed entries through the existing generic loader', () => {
    const [weapon] = equipmentEntries();
    const duplicate = deserializeHomebrewContentResult(JSON.stringify([weapon, structuredClone(weapon)]));
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.error.code).toBe('invalid-dataset');
      expect(duplicate.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate-id', contentId: weapon.id }),
      ]));
    }

    const malformed = deserializeHomebrewContentResult(JSON.stringify([{ ...weapon, damage: null }]));
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.error.code).toBe('invalid-dataset');
  });
});
