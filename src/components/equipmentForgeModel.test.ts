import { describe, expect, it } from 'vitest';
import { srdId } from '../content/srd';
import type { ArmorContent, EquipmentContent, WeaponContent } from '../models/content';
import { contentRegistry } from '../services/contentRegistry';
import {
  buildEquipmentContentFromDraft,
  copyEquipmentForgeDraft,
  createEquipmentForgeDraft,
  loadEquipmentForgeDraft,
  validateEquipmentForgeDraft,
} from './equipmentForgeModel';

const SCIMITAR_ID = srdId('weapon', 'scimitar');
const CHAIN_MAIL_ID = srdId('armor', 'chain-mail');

function homebrewWeapon(): WeaponContent {
  return {
    id: 'homebrew:local:weapon:11111111-1111-4111-8111-111111111111',
    kind: 'weapon',
    name: 'Surveyor Blade',
    source: { type: 'homebrew', namespace: 'local' },
    category: 'martial',
    mode: 'melee',
    damage: { kind: 'dice', count: 2, die: 6 },
    damageType: 'force',
    properties: [{ type: 'thrown', range: { normal: 30, long: 90 } }],
    masteryId: srdId('weapon-mastery', 'sap'),
    description: '  A precisely balanced blade.  ',
    referenceEffects: ['  Glows beside hidden measurements.  '],
    attackBonus: 2,
    damageBonus: 3,
    cost: { amount: 125, unit: 'gp' },
    weightPounds: 2.5,
  };
}

function homebrewArmor(): ArmorContent {
  return {
    id: 'homebrew:workshop:armor:22222222-2222-4222-8222-222222222222',
    kind: 'armor',
    name: 'Surveyor Plate',
    source: { type: 'homebrew', namespace: 'workshop' },
    category: 'heavy',
    armorClass: { kind: 'armor', base: 18, dexterity: 'none' },
    strengthRequirement: 15,
    stealthDisadvantage: true,
    description: 'Engraved plate.',
    referenceEffects: ['Acts as a field ruler.'],
    armorClassBonus: 4,
    cost: { amount: 1500, unit: 'gp' },
    weightPounds: 65,
  };
}

describe('equipment forge draft creation and identity semantics', () => {
  it('creates a structurally safe scratch weapon with a stable same-kind Homebrew identity', () => {
    const draft = createEquipmentForgeDraft('weapon', contentRegistry);

    expect(draft).toMatchObject({
      kind: 'weapon',
      sourceNamespace: 'local',
      name: '',
      description: '',
      referenceEffects: [],
      category: 'simple',
      mode: 'melee',
      damage: { kind: 'dice', count: 1, die: 6 },
      damageType: 'bludgeoning',
      properties: [],
      attackBonus: 0,
      damageBonus: 0,
      cost: { amount: 0, unit: 'gp' },
      weightPounds: 0,
    });
    expect(draft.id).toMatch(/^homebrew:local:weapon:[0-9a-f-]{36}$/);
    expect(draft.kind === 'weapon' && contentRegistry.findMastery(draft.masteryId)).toBeDefined();
  });

  it('copies an SRD weapon deeply, assigns a fresh same-kind ID, and leaves the source unchanged', () => {
    const source = contentRegistry.findWeapon(SCIMITAR_ID)!;
    const sourceSnapshot = structuredClone(source);

    const copied = copyEquipmentForgeDraft(source);

    expect(copied.ok).toBe(true);
    if (!copied.ok) return;
    expect(copied.draft.id).not.toBe(SCIMITAR_ID);
    expect(copied.draft.id).toMatch(/^homebrew:local:weapon:[0-9a-f-]{36}$/);
    expect(buildEquipmentContentFromDraft(copied.draft)).toMatchObject({ kind: 'weapon', damageType: 'slashing' });
    expect(contentRegistry.findWeapon(SCIMITAR_ID)).toEqual(sourceSnapshot);
  });

  it('allocates a fresh identity for every authoring copy and deep-copies nested supported fields', () => {
    const source = homebrewWeapon();
    const first = copyEquipmentForgeDraft(source);
    const second = copyEquipmentForgeDraft(source);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok || first.draft.kind !== 'weapon' || second.draft.kind !== 'weapon') return;
    expect(first.draft.id).not.toBe(second.draft.id);
    expect(first.draft.id).toMatch(/^homebrew:local:weapon:[0-9a-f-]{36}$/);
    expect(first.draft.damage).not.toBe(source.damage);
    expect(first.draft.properties).not.toBe(source.properties);
    expect(first.draft.properties[0]).not.toBe(source.properties[0]);
    expect(first.draft.referenceEffects).not.toBe(source.referenceEffects);
  });

  it('loads a Homebrew weapon for editing without changing its identity and keeps bonus fields distinct', () => {
    const source = homebrewWeapon();
    const loaded = loadEquipmentForgeDraft(source);

    expect(loaded.ok).toBe(true);
    if (!loaded.ok || loaded.draft.kind !== 'weapon') return;
    expect(loaded.draft.id).toBe(source.id);
    expect(loaded.draft.sourceNamespace).toBe('local');
    expect(loaded.draft.attackBonus).toBe(2);
    expect(loaded.draft.damageBonus).toBe(3);
    expect(loaded.draft.referenceEffects).toEqual(['  Glows beside hidden measurements.  ']);
    expect(buildEquipmentContentFromDraft(loaded.draft)).toMatchObject({
      description: 'A precisely balanced blade.',
      referenceEffects: ['Glows beside hidden measurements.'],
      attackBonus: 2,
      damageBonus: 3,
    });
  });

  it('rejects editing bundled entries', () => {
    expect(loadEquipmentForgeDraft(contentRegistry.findWeapon(SCIMITAR_ID)!)).toEqual({
      ok: false,
      message: 'Bundled SRD equipment is read-only and cannot be edited in Creator Forge.',
    });
  });
});

describe('equipment forge armor and miscellaneous equipment', () => {
  it('creates, copies, and edits armor with the correct identity semantics', () => {
    const scratch = createEquipmentForgeDraft('armor', contentRegistry);
    expect(scratch).toMatchObject({
      kind: 'armor',
      category: 'light',
      armorClass: { kind: 'armor', base: 11, dexterity: 'full' },
      strengthRequirement: null,
      stealthDisadvantage: false,
      armorClassBonus: 0,
    });
    expect(scratch.id).toMatch(/^homebrew:local:armor:[0-9a-f-]{36}$/);

    const copied = copyEquipmentForgeDraft(contentRegistry.findArmor(CHAIN_MAIL_ID)!);
    expect(copied.ok).toBe(true);
    if (!copied.ok) return;
    expect(copied.draft).toMatchObject({
      kind: 'armor',
      category: 'heavy',
      armorClass: { kind: 'armor', base: 16, dexterity: 'none' },
      strengthRequirement: 13,
      stealthDisadvantage: true,
    });
    expect(copied.draft.id).toMatch(/^homebrew:local:armor:[0-9a-f-]{36}$/);

    const edited = loadEquipmentForgeDraft(homebrewArmor());
    expect(edited.ok).toBe(true);
    if (!edited.ok || edited.draft.kind !== 'armor') return;
    expect(edited.draft.id).toBe(homebrewArmor().id);
    expect(edited.draft.sourceNamespace).toBe('workshop');
    expect(edited.draft.armorClassBonus).toBe(4);
  });

  it('creates and builds miscellaneous equipment with trimmed reference-only text', () => {
    const scratch = createEquipmentForgeDraft('equipment', contentRegistry);
    expect(scratch).toMatchObject({
      kind: 'equipment',
      category: 'adventuring-gear',
      name: '',
      description: '',
      referenceEffects: [],
      cost: { amount: 0, unit: 'gp' },
      weightPounds: 0,
    });
    expect(scratch.id).toMatch(/^homebrew:local:equipment:[0-9a-f-]{36}$/);

    const valid = {
      ...scratch,
      name: '  Brass Lens  ',
      description: '  Reveals tiny inscriptions.  ',
      referenceEffects: ['  Requires bright light.  '],
    };
    expect(validateEquipmentForgeDraft(valid, contentRegistry)).toEqual([]);
    expect(buildEquipmentContentFromDraft(valid)).toEqual({
      id: valid.id,
      kind: 'equipment',
      name: 'Brass Lens',
      source: { type: 'homebrew', namespace: 'local' },
      category: 'adventuring-gear',
      description: 'Reveals tiny inscriptions.',
      referenceEffects: ['Requires bright light.'],
      cost: { amount: 0, unit: 'gp' },
      weightPounds: 0,
    } satisfies EquipmentContent);
  });
});

describe('equipment forge validation', () => {
  it('reports invalid weapon identity, bonuses, damage, property payloads, mastery, costs, weights, and references', () => {
    const draft = createEquipmentForgeDraft('weapon', contentRegistry);
    if (draft.kind !== 'weapon') throw new Error('Expected a weapon draft.');
    const invalid = {
      ...draft,
      id: 'homebrew:other:armor:not-a-weapon',
      sourceNamespace: 'local',
      name: ' ',
      damage: { kind: 'dice', count: 0, die: 3 },
      properties: [{ type: 'thrown', range: { normal: 60, long: 20 } }],
      masteryId: '',
      attackBonus: -1,
      damageBonus: 6,
      referenceEffects: [' '],
      cost: { amount: -1, unit: 'gp' },
      weightPounds: -0.5,
    } as unknown as typeof draft;

    expect(validateEquipmentForgeDraft(invalid, contentRegistry)).toEqual(expect.arrayContaining([
      'Name is required.',
      'Homebrew ID must match the draft namespace and equipment kind.',
      'Weapon damage is malformed.',
      'Weapon properties contain a malformed payload.',
      'Weapon mastery is required and must exist in the content registry.',
      'Attack bonus must be a whole number from 0 through 5.',
      'Damage bonus must be a whole number from 0 through 5.',
      'Cost must be a nonnegative finite amount in cp, sp, or gp.',
      'Weight must be null or a nonnegative finite number.',
      'Reference-only effects cannot contain empty rows.',
    ]));
  });

  it('reports malformed armor category/model combinations and bounded fields', () => {
    const draft = createEquipmentForgeDraft('armor', contentRegistry);
    if (draft.kind !== 'armor') throw new Error('Expected an armor draft.');
    const invalid = {
      ...draft,
      name: 'Broken Shield',
      category: 'shield',
      armorClass: { kind: 'armor', base: 0, dexterity: 'capped', dexterityCap: -1 },
      strengthRequirement: -1,
      armorClassBonus: 1.5,
      weightPounds: null,
    } as unknown as typeof draft;

    expect(validateEquipmentForgeDraft(invalid, contentRegistry)).toEqual(expect.arrayContaining([
      'Shield category must use the shield Armor Class model, and other categories must use the armor model.',
      'Armor Class model is malformed.',
      'Strength requirement must be null or a positive whole number.',
      'Armor Class bonus must be a whole number from 0 through 5.',
      'Armor weight must be a nonnegative finite number.',
    ]));
  });

  it('accepts zero and five as distinct item-bonus boundaries', () => {
    const weapon = { ...createEquipmentForgeDraft('weapon', contentRegistry), name: 'Bounded Blade', attackBonus: 0, damageBonus: 5 };
    const armor = { ...createEquipmentForgeDraft('armor', contentRegistry), name: 'Bounded Armor', armorClassBonus: 5 };

    expect(validateEquipmentForgeDraft(weapon, contentRegistry)).toEqual([]);
    expect(validateEquipmentForgeDraft(armor, contentRegistry)).toEqual([]);
  });
});
