import { describe, expect, it } from 'vitest';
import { srdId } from '../content/srd';
import type { Character, CharacterClassProgression } from '../models/character';
import type { ArmorContent, ClassContent, ContentEntry, EquipmentContent, SpellContent, SubclassContent, WeaponContent } from '../models/content';
import {
  buildClassContentFromDraft,
  createClassConsumerDraft,
  createClassFeatureDraft,
  createClassForgeDraft,
  createClassProviderDraft,
  createClassResourceDraft,
  createClassSpellGrantDraft,
} from '../components/classForgeModel';
import { buildFeatContentFromDraft, createFeatForgeDraft } from '../components/featForgeModel';
import { buildSpellContentFromDraft, createSpellForgeDraft } from '../components/spellForgeModel';
import { buildSubclassContentFromDraft, createSubclassFeatureDraft, createSubclassForgeDraft, createSubclassProviderDraft, createSubclassSpellGrantDraft } from '../components/subclassForgeModel';
import { buildEquipmentContentFromDraft, createEquipmentForgeDraft } from '../components/equipmentForgeModel';
import { contentRegistry, createContentRegistry } from './contentRegistry';
import {
  collectNestedIdentities,
  preflightContentDelete,
  preflightContentEdit,
  readPersistedCharactersForIntegrity,
} from './contentReferenceIntegrity';
import { fighterCharacter, FIGHTER_ID } from '../test/fixtures';
import { CHARACTER_STORAGE_KEY } from './characterStorage';
import { createFixedHpProgression } from '../rules/health';

function feat(name = 'Integrity Feat') {
  const draft = createFeatForgeDraft();
  return buildFeatContentFromDraft({ ...draft, name, description: 'Integrity fixture.' });
}

function spell(name = 'Integrity Spell') {
  const draft = createSpellForgeDraft();
  return buildSpellContentFromDraft({ ...draft, name, description: 'Integrity fixture.', spellLists: [{ id: 'wizard', name: 'Wizard' }] });
}

function weapon(name = 'Integrity Weapon'): WeaponContent {
  const entry = buildEquipmentContentFromDraft({
    ...createEquipmentForgeDraft('weapon'),
    name,
    description: 'A weapon kept intact by integrity checks.',
    referenceEffects: ['Counts as silvered against warded creatures.'],
    attackBonus: 2,
    damageBonus: 3,
  });
  if (entry.kind !== 'weapon') throw new Error('Expected weapon fixture.');
  return entry;
}

function armor(name = 'Integrity Armor'): ArmorContent {
  const entry = buildEquipmentContentFromDraft({
    ...createEquipmentForgeDraft('armor'),
    name,
    description: 'Armor kept intact by integrity checks.',
    referenceEffects: ['The wearer leaves no tracks.'],
    armorClassBonus: 2,
  });
  if (entry.kind !== 'armor') throw new Error('Expected armor fixture.');
  return entry;
}

function equipment(name = 'Integrity Equipment'): EquipmentContent {
  const entry = buildEquipmentContentFromDraft({
    ...createEquipmentForgeDraft('equipment'),
    name,
    description: 'A durable adventuring tool.',
    referenceEffects: ['Advantage on checks to map underground passages.'],
  });
  if (entry.kind !== 'equipment') throw new Error('Expected equipment fixture.');
  return entry;
}

function characterWithInventory(contentId: string, category: 'weapon' | 'armor' | 'adventuring-gear', name: string): Character {
  return fighterCharacter({
    name,
    inventory: [{
      id: `inventory-${contentId}`,
      kind: 'registry',
      contentId,
      category,
      quantity: 1,
      notes: '',
      equipped: false,
    }],
  });
}

function customClass(name = 'Integrity Class', grantedSpell?: SpellContent): ClassContent {
  const base = createClassForgeDraft();
  let feature = { ...createClassFeatureDraft(1), name: 'Integrity Core', description: 'Integrity fixture.' };
  if (grantedSpell) {
    const providerBase = createClassProviderDraft(1, 'wizard');
    const provider = { ...providerBase, definition: { ...providerBase.definition, name: 'Integrity Casting' } };
    feature = {
      ...feature,
      providers: [provider],
      spellGrants: [createClassSpellGrantDraft(provider.definition.id, grantedSpell.id, 1)],
    };
  }
  return buildClassContentFromDraft({ ...base, name, features: [feature] });
}

function resourceClass(name = 'Resource Class'): ClassContent {
  const base = createClassForgeDraft();
  const resourceBase = createClassResourceDraft(1);
  const resource = { ...resourceBase, definition: { ...resourceBase.definition, name: 'Integrity Reserve' } };
  const consumerBase = createClassConsumerDraft(resource.definition.id);
  const consumer = {
    ...consumerBase,
    grant: {
      ...consumerBase.grant,
      consumer: { ...consumerBase.grant.consumer, name: 'Integrity Burst' },
    },
  };
  const feature = {
    ...createClassFeatureDraft(1),
    name: 'Resource Core',
    description: 'Internal private references.',
    resources: [resource],
    consumers: [consumer],
  };
  return buildClassContentFromDraft({ ...base, name, features: [feature] });
}

function subclass(parent: ClassContent | { id: string }, name = 'Integrity Subclass', grantedSpell?: SpellContent): SubclassContent {
  const customEntries: ContentEntry[] = [];
  if ('kind' in parent) customEntries.push(parent);
  if (grantedSpell) customEntries.push(grantedSpell);
  const registry = createContentRegistry(customEntries);
  let feature = { ...createSubclassFeatureDraft(3), name: 'Subclass Core', description: 'Integrity fixture.' };
  if (grantedSpell) {
    const providerBase = createSubclassProviderDraft(3, 'wizard');
    const provider = { ...providerBase, definition: { ...providerBase.definition, name: 'Subclass Casting' } };
    feature = {
      ...feature,
      providers: [provider],
      spellGrants: [createSubclassSpellGrantDraft(provider.definition.id, grantedSpell.id, 3)],
    };
  }
  const draft = createSubclassForgeDraft(registry, parent.id);
  return buildSubclassContentFromDraft({
    ...draft,
    name,
    description: 'Integrity fixture.',
    parentClassId: parent.id,
    acquisitionLevel: 3,
    features: [feature],
  });
}

function characterWithClass(classContent: ClassContent, name = 'Class User'): Character {
  return fighterCharacter({
    name,
    classId: classContent.id,
    startingClassId: classContent.id,
    subclassId: undefined,
    level: 1,
    skillProficiencies: classContent.skillChoices.from.slice(0, classContent.skillChoices.choose),
    hpProgression: [],
    playState: { hitDiceRemaining: { [classContent.hitDie]: 1 }, resourceUses: {} },
  });
}

function progression(classId: string, subclassId?: string): CharacterClassProgression {
  return {
    classId,
    level: 4,
    ...(subclassId ? { subclassId } : {}),
    skillProficiencies: ['athletics', 'perception'],
    skillExpertise: [],
    weaponMasterySelections: [],
    hpProgression: createFixedHpProgression(4),
  };
}

describe('M16-G shared referential-integrity authority', () => {
  it('A/B allows unused custom Feat deletion and blocks a Character-selected Feat with useful Character context', () => {
    const target = feat();
    expect(preflightContentDelete(target.id, [target], []).ok).toBe(true);

    const character = fighterCharacter({
      name: 'Feat User',
      manualFeats: [{ featId: target.id, choices: {} }],
    });
    const blocked = preflightContentDelete(target.id, [target], [character]);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceType: 'character',
        sourceName: 'Feat User',
        referenceKind: 'character-feat',
      }),
    ]));
    expect(blocked.blockers[0].message).toMatch(/Feat User/);
  });

  it('C/D/E allows unused custom Spell deletion and blocks Class/Subclass grants', () => {
    const target = spell();
    expect(preflightContentDelete(target.id, [target], []).ok).toBe(true);

    const ownerClass = customClass('Spell Class', target);
    const classBlocked = preflightContentDelete(target.id, [target, ownerClass], []);
    expect(classBlocked.ok).toBe(false);
    if (!classBlocked.ok) expect(classBlocked.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: ownerClass.id, referenceKind: 'spell-grant-spell' }),
    ]));

    const ownerSubclass = subclass({ id: FIGHTER_ID }, 'Spell Subclass', target);
    const subclassBlocked = preflightContentDelete(target.id, [target, ownerSubclass], []);
    expect(subclassBlocked.ok).toBe(false);
    if (!subclassBlocked.ok) expect(subclassBlocked.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: ownerSubclass.id, referenceKind: 'spell-grant-spell' }),
    ]));
  });

  it('F blocks a canonical persisted Character Spell reference', () => {
    const target = spell();
    const character = fighterCharacter({
      name: 'Spell User',
      spellcastingSelections: [{
        providerId: 'homebrew:test:spellcasting-provider:fixture',
        cantripIds: [target.id],
        ownedSpellIds: [],
        preparedSpellIds: [],
      }],
    });
    const blocked = preflightContentDelete(target.id, [target], [character]);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceName: 'Spell User', referenceKind: 'character-cantrip' }),
    ]));
  });

  it('G/H allows unused Subclass deletion and blocks a selected Subclass', () => {
    const target = subclass({ id: FIGHTER_ID });
    expect(preflightContentDelete(target.id, [target], []).ok).toBe(true);

    const character = fighterCharacter({
      name: 'Subclass User',
      classProgressions: [progression(FIGHTER_ID, target.id)],
    });
    const blocked = preflightContentDelete(target.id, [target], [character]);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceName: 'Subclass User', referenceKind: 'character-subclass' }),
    ]));
  });

  it('I/J/K allows unused Class deletion, blocks Character use, and blocks a surviving Subclass parent reference', () => {
    const target = customClass();
    expect(preflightContentDelete(target.id, [target], []).ok).toBe(true);

    const characterBlocked = preflightContentDelete(target.id, [target], [characterWithClass(target)]);
    expect(characterBlocked.ok).toBe(false);
    if (!characterBlocked.ok) expect(characterBlocked.blockers.map((blocker) => blocker.referenceKind)).toEqual(expect.arrayContaining([
      'character-starting-class',
      'character-class-progression',
    ]));

    const child = subclass(target, 'Dependent Subclass');
    const contentBlocked = preflightContentDelete(target.id, [target, child], []);
    expect(contentBlocked.ok).toBe(false);
    if (!contentBlocked.ok) expect(contentBlocked.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceName: 'Dependent Subclass', referenceKind: 'subclass-parent-class' }),
    ]));
  });

  it('L ignores private self-references when deleting their whole owning entry', () => {
    const target = resourceClass();
    const result = preflightContentDelete(target.id, [target], []);
    expect(result.ok).toBe(true);
  });

  it('M blocks removal of an externally referenced nested provider ID', () => {
    const targetSpell = spell();
    const current = customClass('Provider Class', targetSpell);
    const providerId = current.progression[0].features[0].spellcasting?.[0].id;
    if (!providerId) throw new Error('Expected provider.');

    const replacement = customClass('Replacement Shape');
    const prospective: ClassContent = {
      ...replacement,
      id: current.id,
      source: current.source,
      name: current.name,
    };

    const character = fighterCharacter({
      name: 'Provider User',
      spellcastingSelections: [{
        providerId,
        cantripIds: [],
        ownedSpellIds: [],
        preparedSpellIds: [],
      }],
    });
    const result = preflightContentEdit(prospective, [targetSpell, current], [character]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceName: 'Provider User', referenceKind: 'character-spellcasting-provider' }),
    ]));
  });

  it('N allows removal of an unreferenced nested resource when the prospective entry remains canonical', () => {
    const current = resourceClass();
    const feature = current.progression[0].features[0];
    const prospective: ClassContent = {
      ...current,
      progression: current.progression.map((row, index) => index === 0 ? {
        ...row,
        features: [{
          ...feature,
          resources: [],
          resourceConsumers: [],
        }],
      } : row),
    };
    const removed = collectNestedIdentities(current).filter((identity) => !collectNestedIdentities(prospective).some((next) => next.id === identity.id));
    expect(removed.some((identity) => identity.kind === 'resource')).toBe(true);
    expect(preflightContentEdit(prospective, [current], []).ok).toBe(true);
  });

  it('O fails closed when Character v10 storage is malformed/unanalysable', () => {
    const storage = new Map<string, string>();
    const fakeStorage: Storage = {
      get length() { return storage.size; },
      clear: () => storage.clear(),
      getItem: (key) => storage.get(key) ?? null,
      key: (index) => [...storage.keys()][index] ?? null,
      removeItem: (key) => { storage.delete(key); },
      setItem: (key, value) => { storage.set(key, value); },
    };
    fakeStorage.setItem(CHARACTER_STORAGE_KEY, '{not json');
    const result = readPersistedCharactersForIntegrity(fakeStorage, createContentRegistry());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.blocker.referenceKind).toBe('analysis-unavailable');
  });

  it('blocks deletion of a weapon selected by a Character Weapon Mastery owner', () => {
    const target = weapon('Mastered Weapon');
    const character = fighterCharacter({ name: 'Mastery User' });
    character.classProgressions[0].weaponMasterySelections = [target.id];
    const result = preflightContentDelete(target.id, [target], [character]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetId: target.id, sourceName: 'Mastery User', referenceKind: 'character-weapon-mastery-selection' }),
    ]));
  });

  it.each([
    ['weapon', weapon(), 'weapon'],
    ['armor', armor(), 'armor'],
    ['equipment', equipment(), 'adventuring-gear'],
  ] as const)('allows an unreferenced custom %s to be deleted and blocks its Character inventory reference', (_kind, target, category) => {
    expect(preflightContentDelete(target.id, [target], []).ok).toBe(true);

    const character = characterWithInventory(target.id, category, `${target.name} Owner`);
    const result = preflightContentDelete(target.id, [target], [character]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        targetId: target.id,
        sourceName: `${target.name} Owner`,
        referenceKind: 'character-inventory-content',
      }),
    ]));
  });

  it('preserves equipment identity on a safe edit and rejects a referenced armor edit that becomes category-invalid', () => {
    const currentWeapon = weapon('Before Rename');
    const editedWeapon = { ...currentWeapon, name: 'After Rename', attackBonus: 4 };
    const safe = preflightContentEdit(editedWeapon, [currentWeapon], []);
    expect(safe.ok).toBe(true);
    if (safe.ok) expect(safe.prospectiveCustomEntries[0]).toMatchObject({ id: currentWeapon.id, name: 'After Rename', attackBonus: 4 });

    const currentArmor = armor('Referenced Armor');
    const character = characterWithInventory(currentArmor.id, 'armor', 'Armor Owner');
    const invalidArmor = { ...currentArmor, category: 'shield' as const };
    const blocked = preflightContentEdit(invalidArmor, [currentArmor], [character]);
    expect(blocked.ok).toBe(false);
  });

  it.each([
    ['weapon', contentRegistry.getAll('weapon')[0]],
    ['armor', contentRegistry.getAll('armor')[0]],
    ['equipment', {
      ...equipment('Bundled Equipment'),
      id: srdId('equipment', 'bundled-equipment'),
      source: contentRegistry.getAll('weapon')[0].source,
    }],
  ] as const)('keeps bundled %s content protected from deletion', (_kind, target) => {
    const customEntries = target.kind === 'equipment' ? [target] : [];
    const result = preflightContentDelete(target.id, customEntries, []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.blockers[0].referenceKind).toBe('protected-content');
  });

  it('P rejects bundled SRD targets from destructive preflight', () => {
    const result = preflightContentDelete(srdId('feat', 'alert'), [], []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.blockers[0]).toMatchObject({ referenceKind: 'protected-content' });
  });
});
