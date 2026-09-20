import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SRD_CONTENT, srdId } from '../content/srd';
import type { ClassContent, ContentEntry, FeatContent, SpellContent, SubclassContent } from '../models/content';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { fighterCharacter, fighterInput, FIGHTER_ID } from '../test/fixtures';
import { validateCharacterInput } from '../utils/characterValidation';
import {
  getContentCatalogState,
  initializeContentCatalog,
  saveAndPublishHomebrewContent,
  upsertAndPublishHomebrewContent,
} from './contentCatalog';
import { contentRegistry } from './contentRegistry';
import { createCharacter } from './characterStorage';
import {
  allocateHomebrewContentId,
  HOMEBREW_CONTENT_STORAGE_KEY,
  loadHomebrewContent,
  loadHomebrewContentResult,
} from './homebrewContentStorage';

const source = { type: 'homebrew', namespace: 'local' } as const;
const FEAT_ID = 'homebrew:local:feat:11111111-1111-4111-8111-111111111111';
const SPELL_ID = 'homebrew:local:spell:22222222-2222-4222-8222-222222222222';
const SUBCLASS_ID = 'homebrew:local:subclass:33333333-3333-4333-8333-333333333333';
const CLASS_ID = 'homebrew:local:class:44444444-4444-4444-8444-444444444444';
const PROVIDER_ID = 'homebrew:local:spellcasting-provider:55555555-5555-4555-8555-555555555555';

function customFeat(name = 'Steady Horizon'): FeatContent {
  return {
    id: FEAT_ID,
    kind: 'feat',
    name,
    source,
    category: 'general',
    prerequisites: [],
    repeatable: false,
    choices: [],
    effects: [{ type: 'attack-roll-bonus', weaponMode: 'ranged', amount: 1 }],
    referenceEffects: [],
    description: 'Synthetic M16-B canonical custom Feat.',
  };
}

function customSpell(): SpellContent {
  return {
    id: SPELL_ID,
    kind: 'spell',
    name: 'Moon Lance',
    source,
    level: 0,
    school: 'evocation',
    castingTime: 'Action',
    range: '60 feet',
    components: { verbal: true, somatic: true, material: false },
    duration: 'Instantaneous',
    concentration: false,
    ritual: false,
    description: 'Synthetic M16-B canonical custom Spell.',
    spellLists: [{ id: 'moon-warden', name: 'Moon Warden' }],
    mechanics: [
      { type: 'spell-attack', attackType: 'ranged' },
      { type: 'damage', amount: { dice: [{ count: 1, die: 8 }], modifier: 'none' }, damageType: 'radiant' },
    ],
    referenceEffects: [],
  };
}

function customSubclass(parentClassId = FIGHTER_ID, spellId = SPELL_ID): SubclassContent {
  return {
    id: SUBCLASS_ID,
    kind: 'subclass',
    name: 'Moon Warden',
    source,
    parentClassId,
    acquisitionLevel: 3,
    description: 'Synthetic M16-B canonical custom Subclass.',
    progression: [{
      level: 3,
      features: [{
        id: 'homebrew:local:subclass-feature:66666666-6666-4666-8666-666666666666',
        name: 'Moon Casting',
        description: 'Grants the synthetic spell through an ordinary provider.',
        effects: [],
        spellcasting: [{
          id: PROVIDER_ID,
          name: 'Moon Casting',
          spellcastingAbility: { kind: 'fixed', ability: 'charisma' },
          multiclassSlotContribution: { kind: 'independent' },
          spellManagement: { kind: 'granted-only', spellIds: [spellId] },
          ritualCasting: 'none',
        }],
        referenceEffects: [],
      }],
    }],
  };
}

function customClass(name = 'Wayfarer'): ClassContent {
  return {
    id: CLASS_ID,
    kind: 'class',
    name,
    source,
    hitDie: 8,
    fixedHitPointsPerLevel: 5,
    primaryAbility: { mode: 'one-of', abilities: ['dexterity'] },
    multiclassProficiencies: { weaponProficiencies: [], armorTraining: [], toolProficiencies: [] },
    savingThrowProficiencies: ['dexterity', 'intelligence'],
    weaponProficiencies: [{ kind: 'category', category: 'simple' }],
    armorTraining: ['light'],
    toolProficiencies: [],
    skillChoices: { choose: 2, from: ['arcana', 'athletics', 'perception'] },
    startingEquipment: [{ id: 'A', items: [], currency: { amount: 10, unit: 'gp' } }],
    progression: Array.from({ length: 20 }, (_, index) => ({
      level: index + 1,
      proficiencyBonus: index + 1 >= 17 ? 6 : index + 1 >= 13 ? 5 : index + 1 >= 9 ? 4 : index + 1 >= 5 ? 3 : 2,
      features: [],
    })),
    resources: [],
  };
}

function customBundle(): ContentEntry[] {
  return [customFeat(), customSpell(), customSubclass(), customClass()];
}

describe('M16-B effective custom catalog foundation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    initializeContentCatalog(window.localStorage);
  });

  it('bootstraps valid persisted custom content into the one effective runtime registry', () => {
    const entries = customBundle();
    window.localStorage.setItem(HOMEBREW_CONTENT_STORAGE_KEY, JSON.stringify(entries));

    const initialized = initializeContentCatalog(window.localStorage);
    expect(initialized.ok).toBe(true);
    expect(contentRegistry.findFeat(FEAT_ID)?.name).toBe('Steady Horizon');
    expect(contentRegistry.findSpell(SPELL_ID)?.name).toBe('Moon Lance');
    expect(contentRegistry.findSubclass(SUBCLASS_ID)?.parentClassId).toBe(FIGHTER_ID);
    expect(contentRegistry.findClass(CLASS_ID)?.name).toBe('Wayfarer');
    expect(contentRegistry.findClass(srdId('class', 'fighter'))?.name).toBe('Fighter');
    expect(contentRegistry.filterBySource('homebrew')).toHaveLength(4);
    expect(getContentCatalogState()).toMatchObject({ status: 'ready', customEntryCount: 4 });
  });

  it('publishes valid custom Feat, Spell, Subclass, and Class definitions through ordinary rules paths', () => {
    const saved = saveAndPublishHomebrewContent(customBundle(), window.localStorage);
    expect(saved.ok).toBe(true);

    const featCharacter = fighterCharacter({ manualFeats: [{ featId: FEAT_ID, choices: {} }] });
    const featState = deriveCharacterState(featCharacter, contentRegistry);
    expect(featState.ok).toBe(true);
    if (!featState.ok) throw new Error(featState.error.message);
    expect(featState.value.feats.some((feat) => feat.id === FEAT_ID)).toBe(true);
    expect(featState.value.ruleEffects).toContainEqual({ type: 'attack-roll-bonus', weaponMode: 'ranged', amount: 1 });

    const subclassCharacter = fighterCharacter({ level: 3, subclassId: SUBCLASS_ID });
    const subclassState = deriveCharacterState(subclassCharacter, contentRegistry);
    expect(subclassState.ok).toBe(true);
    if (!subclassState.ok) throw new Error(subclassState.error.message);
    expect(subclassState.value.subclass?.id).toBe(SUBCLASS_ID);
    expect(subclassState.value.spellcasting).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: PROVIDER_ID, spells: [expect.objectContaining({ id: SPELL_ID })] }),
    ]));

    const input = fighterInput({
      name: 'Custom Wayfarer',
      classId: CLASS_ID,
      level: 1,
      skillProficiencies: ['athletics', 'perception'],
      hpProgression: [],
      subclassId: undefined,
    });
    expect(validateCharacterInput(input, {}, contentRegistry)).toEqual({});
    const created = createCharacter(input, window.localStorage, contentRegistry);
    const classState = deriveCharacterState(created, contentRegistry);
    expect(classState.ok).toBe(true);
    if (!classState.ok) throw new Error(classState.error.message);
    expect(classState.value.classState?.id).toBe(CLASS_ID);
  });

  it('keeps stable opaque identity across rename/reload and allocates a distinct duplicate identity', () => {
    const firstId = allocateHomebrewContentId('feat', {
      randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    const secondId = allocateHomebrewContentId('feat', {
      randomUUID: () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
    const nestedId = allocateHomebrewContentId('class-feature', {
      randomUUID: () => 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    });
    expect(firstId).toBe('homebrew:local:feat:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(secondId).not.toBe(firstId);
    expect(nestedId).toBe('homebrew:local:class-feature:cccccccc-cccc-4ccc-8ccc-cccccccccccc');

    const original = { ...customFeat(), id: firstId };
    expect(saveAndPublishHomebrewContent([original], window.localStorage).ok).toBe(true);
    const renamed = { ...original, name: 'Renamed Horizon' };
    expect(upsertAndPublishHomebrewContent(renamed, window.localStorage).ok).toBe(true);
    expect(contentRegistry.findFeat(firstId)?.name).toBe('Renamed Horizon');
    expect(loadHomebrewContent(window.localStorage)).toEqual([renamed]);
    expect(initializeContentCatalog(window.localStorage).ok).toBe(true);
    expect(contentRegistry.findFeat(firstId)?.id).toBe(firstId);
  });

  it.each([
    ['malformed JSON', '{', 'malformed-json'],
    ['non-array storage shape', '{"id":"nope"}', 'invalid-shape'],
  ])('fails closed on %s while preserving SRD and the stored bytes', (_label, raw, expectedCode) => {
    window.localStorage.setItem(HOMEBREW_CONTENT_STORAGE_KEY, raw);
    const initialized = initializeContentCatalog(window.localStorage);
    expect(initialized.ok).toBe(false);
    expect(getContentCatalogState()).toMatchObject({ status: 'degraded', error: { storageError: { code: expectedCode } } });
    expect(contentRegistry.findClass(FIGHTER_ID)?.name).toBe('Fighter');
    expect(contentRegistry.filterBySource('homebrew')).toEqual([]);
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBe(raw);
  });

  it('rejects invalid Homebrew source/namespace without deleting stored bytes', () => {
    const invalid = { ...customFeat(), source: { type: 'homebrew', namespace: 'Bad Namespace' } } as unknown as ContentEntry;
    const raw = JSON.stringify([invalid]);
    window.localStorage.setItem(HOMEBREW_CONTENT_STORAGE_KEY, raw);
    const loaded = loadHomebrewContentResult(window.localStorage);
    expect(loaded).toMatchObject({ ok: false, error: { code: 'invalid-identity' } });
    const initialized = initializeContentCatalog(window.localStorage);
    expect(initialized.ok).toBe(false);
    expect(contentRegistry.findClass(FIGHTER_ID)).toBeTruthy();
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBe(raw);
  });

  it('rejects duplicate custom IDs and leaves persistence and the active catalog unchanged', () => {
    const original = customFeat();
    expect(saveAndPublishHomebrewContent([original], window.localStorage).ok).toBe(true);
    const beforeRaw = window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY);
    const beforeRegistry = contentRegistry;

    const duplicate = { ...original, name: 'Duplicate ID' };
    const failed = saveAndPublishHomebrewContent([original, duplicate], window.localStorage);
    expect(failed).toMatchObject({ ok: false, error: { code: 'invalid-candidate' } });
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBe(beforeRaw);
    expect(contentRegistry).toBe(beforeRegistry);
    expect(contentRegistry.findFeat(FEAT_ID)?.name).toBe('Steady Horizon');
  });

  it('rejects a custom identity that collides with the protected SRD namespace', () => {
    const alert = structuredClone(contentRegistry.findFeat(srdId('feat', 'alert'))!);
    const colliding = { ...alert, source } as FeatContent;
    const result = saveAndPublishHomebrewContent([colliding], window.localStorage);
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'invalid-candidate', storageError: { code: 'invalid-identity' } },
    });
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBeNull();
  });

  it('rejects a missing subclass parent before persistence/publication', () => {
    const result = saveAndPublishHomebrewContent([
      customSubclass('homebrew:local:class:missing-parent'),
      customSpell(),
    ], window.localStorage);
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-candidate' } });
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBeNull();
    expect(contentRegistry.findSubclass(SUBCLASS_ID)).toBeUndefined();
  });

  it('rejects an invalid cross-content spell reference before persistence/publication', () => {
    const result = saveAndPublishHomebrewContent([
      customSubclass(FIGHTER_ID, 'homebrew:local:spell:missing-spell'),
    ], window.localStorage);
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-candidate' } });
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBeNull();
    expect(contentRegistry.findSubclass(SUBCLASS_ID)).toBeUndefined();
  });

  it('does not publish a candidate when browser storage rejects the write', () => {
    expect(saveAndPublishHomebrewContent([customFeat()], window.localStorage).ok).toBe(true);
    const beforeRegistry = contentRegistry;
    const beforeRaw = window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY);
    const storage: Storage = {
      get length() { return window.localStorage.length; },
      clear: () => window.localStorage.clear(),
      getItem: (key) => window.localStorage.getItem(key),
      key: (index) => window.localStorage.key(index),
      removeItem: (key) => window.localStorage.removeItem(key),
      setItem: vi.fn(() => { throw new Error('quota denied'); }),
    };

    const result = saveAndPublishHomebrewContent([customFeat('Changed Name')], storage);
    expect(result).toMatchObject({ ok: false, error: { code: 'storage-write-failed' } });
    expect(contentRegistry).toBe(beforeRegistry);
    expect(contentRegistry.findFeat(FEAT_ID)?.name).toBe('Steady Horizon');
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBe(beforeRaw);
  });

  it('retains immutable registry snapshots after publication', () => {
    expect(saveAndPublishHomebrewContent([customFeat()], window.localStorage).ok).toBe(true);
    const feat = contentRegistry.findFeat(FEAT_ID)!;
    expect(Object.isFrozen(feat)).toBe(true);
    expect(Object.isFrozen(feat.effects)).toBe(true);
    expect(() => { (feat as unknown as { name: string }).name = 'Mutation'; }).toThrow();
    expect(contentRegistry.findFeat(FEAT_ID)?.name).toBe('Steady Horizon');
    expect(SRD_CONTENT.length).toBeGreaterThan(0);
  });
});
