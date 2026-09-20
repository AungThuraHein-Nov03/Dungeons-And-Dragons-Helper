import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildClassContentFromDraft,
  createClassFeatureDraft,
  createClassForgeDraft,
} from '../components/classForgeModel';
import { buildFeatContentFromDraft, createFeatForgeDraft } from '../components/featForgeModel';
import { buildSpellContentFromDraft, createSpellForgeDraft } from '../components/spellForgeModel';
import { buildSubclassContentFromDraft, createSubclassFeatureDraft, createSubclassForgeDraft } from '../components/subclassForgeModel';
import type { ContentEntry } from '../models/content';
import { fighterCharacter, FIGHTER_ID } from '../test/fixtures';
import {
  deleteAndPublishHomebrewContent,
  initializeContentCatalog,
  preflightHomebrewContentDelete,
  saveAndPublishHomebrewContent,
} from './contentCatalog';
import { contentRegistry } from './contentRegistry';
import { CHARACTER_STORAGE_KEY, saveCharacters } from './characterStorage';
import { allocateHomebrewContentId, HOMEBREW_CONTENT_STORAGE_KEY, loadHomebrewContent } from './homebrewContentStorage';

function feat(name = 'Delete Feat') {
  const draft = createFeatForgeDraft();
  return buildFeatContentFromDraft({ ...draft, name, description: 'Delete transaction fixture.' });
}

function spell(name = 'Delete Spell') {
  const draft = createSpellForgeDraft();
  return buildSpellContentFromDraft({
    ...draft,
    name,
    description: 'Delete transaction fixture.',
    spellLists: [{ id: 'wizard', name: 'Wizard' }],
  });
}

function customClass(name = 'Delete Class') {
  const base = createClassForgeDraft();
  return buildClassContentFromDraft({
    ...base,
    name,
    features: [{ ...createClassFeatureDraft(1), name: 'Delete Core', description: 'Delete transaction fixture.' }],
  });
}

function subclass(name = 'Delete Subclass') {
  const registry = contentRegistry;
  const base = createSubclassForgeDraft(registry, FIGHTER_ID);
  return buildSubclassContentFromDraft({
    ...base,
    name,
    description: 'Delete transaction fixture.',
    parentClassId: FIGHTER_ID,
    acquisitionLevel: 3,
    features: [{ ...createSubclassFeatureDraft(3), name: 'Delete Path', description: 'Delete transaction fixture.' }],
  });
}

describe('M16-G atomic delete catalog transaction', () => {
  beforeEach(() => {
    window.localStorage.clear();
    initializeContentCatalog(window.localStorage);
  });

  it.each([
    ['Feat', () => feat()],
    ['Spell', () => spell()],
    ['Subclass', () => subclass()],
    ['Class', () => customClass()],
  ])('safely deletes an unused custom %s from persistence and the live registry', (_family, makeEntry) => {
    const target = makeEntry();
    expect(saveAndPublishHomebrewContent([target], window.localStorage).ok).toBe(true);
    const generationTarget = contentRegistry.getById(target.id);
    expect(generationTarget).toBeDefined();

    const preflight = preflightHomebrewContentDelete(target.id, window.localStorage);
    expect(preflight.ok).toBe(true);
    expect(contentRegistry.getById(target.id)).toBeDefined();

    const deleted = deleteAndPublishHomebrewContent(target.id, window.localStorage);
    expect(deleted.ok).toBe(true);
    expect(loadHomebrewContent(window.localStorage)).toEqual([]);
    expect(contentRegistry.getById(target.id)).toBeUndefined();
  });

  it('blocked preflight and delete mutate neither custom content nor Character v9 bytes', () => {
    const target = feat('Protected Feat');
    expect(saveAndPublishHomebrewContent([target], window.localStorage).ok).toBe(true);
    const character = fighterCharacter({
      name: 'Protected Character',
      manualFeats: [{ featId: target.id, choices: {} }],
    });
    saveCharacters([character], window.localStorage);
    const beforeContent = window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY);
    const beforeCharacters = window.localStorage.getItem(CHARACTER_STORAGE_KEY);
    const beforeRegistry = contentRegistry;

    const preflight = preflightHomebrewContentDelete(target.id, window.localStorage);
    expect(preflight.ok).toBe(false);
    if (!preflight.ok) {
      expect(preflight.error.code).toBe('reference-blocked');
      expect(preflight.error.message).toMatch(/Protected Character/);
    }

    const deleted = deleteAndPublishHomebrewContent(target.id, window.localStorage);
    expect(deleted.ok).toBe(false);
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBe(beforeContent);
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(beforeCharacters);
    expect(contentRegistry).toBe(beforeRegistry);
    expect(contentRegistry.findFeat(target.id)).toEqual(target);
  });

  it('storage failure leaves persisted custom bytes and the live registry unchanged', () => {
    const target = feat('Atomic Feat');
    expect(saveAndPublishHomebrewContent([target], window.localStorage).ok).toBe(true);
    const beforeRaw = window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY);
    const beforeRegistry = contentRegistry;

    const originalSetItem = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === HOMEBREW_CONTENT_STORAGE_KEY) throw new Error('quota denied');
      return originalSetItem.call(this, key, value);
    });
    try {
      const result = deleteAndPublishHomebrewContent(target.id, window.localStorage);
      expect(result).toMatchObject({ ok: false, error: { code: 'storage-write-failed' } });
    } finally {
      spy.mockRestore();
    }

    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBe(beforeRaw);
    expect(contentRegistry).toBe(beforeRegistry);
    expect(contentRegistry.findFeat(target.id)).toEqual(target);
  });

  it('preserves mixed custom families while deleting only the requested ID', () => {
    const entries: ContentEntry[] = [feat(), spell(), subclass(), customClass()];
    expect(saveAndPublishHomebrewContent(entries, window.localStorage).ok).toBe(true);
    const target = entries[0];

    expect(deleteAndPublishHomebrewContent(target.id, window.localStorage).ok).toBe(true);
    const remaining = loadHomebrewContent(window.localStorage);
    expect(remaining.map((entry) => entry.id)).toEqual(entries.slice(1).map((entry) => entry.id));
    expect(contentRegistry.findFeat(target.id)).toBeUndefined();
    expect(contentRegistry.filterBySource('homebrew')).toHaveLength(3);
  });

  it('delete then recreate with the same human-readable name uses a fresh opaque ContentId', () => {
    const name = 'Recreated Feat';
    const firstDraft = createFeatForgeDraft();
    const first = buildFeatContentFromDraft({
      ...firstDraft,
      id: allocateHomebrewContentId('feat', { randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
      name,
      description: 'First identity.',
    });
    expect(saveAndPublishHomebrewContent([first], window.localStorage).ok).toBe(true);
    expect(deleteAndPublishHomebrewContent(first.id, window.localStorage).ok).toBe(true);

    const secondDraft = createFeatForgeDraft();
    const second = buildFeatContentFromDraft({
      ...secondDraft,
      id: allocateHomebrewContentId('feat', { randomUUID: () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
      name,
      description: 'Second identity.',
    });
    expect(saveAndPublishHomebrewContent([second], window.localStorage).ok).toBe(true);

    expect(second.id).not.toBe(first.id);
    expect(contentRegistry.findFeat(first.id)).toBeUndefined();
    expect(contentRegistry.findFeat(second.id)?.name).toBe(name);
  });

  it('corrupt Character v9 state fails closed before storage/publication mutation', () => {
    const target = feat('Corrupt Guard');
    expect(saveAndPublishHomebrewContent([target], window.localStorage).ok).toBe(true);
    const beforeContent = window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY);
    const beforeRegistry = contentRegistry;
    window.localStorage.setItem(CHARACTER_STORAGE_KEY, '{bad');

    const result = deleteAndPublishHomebrewContent(target.id, window.localStorage);
    expect(result).toMatchObject({ ok: false, error: { code: 'analysis-unavailable' } });
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBe(beforeContent);
    expect(contentRegistry).toBe(beforeRegistry);
  });
});
