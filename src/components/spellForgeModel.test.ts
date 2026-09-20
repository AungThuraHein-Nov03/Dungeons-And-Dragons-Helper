import { describe, expect, it } from 'vitest';
import { SRD_CONTENT } from '../content/srd';
import { ContentRegistry } from '../services/contentRegistry';
import { validateHomebrewContent } from '../services/homebrewContentStorage';
import type { ClassContent, SpellContent } from '../models/content';
import {
  buildSpellContentFromDraft,
  collectSpellListOptions,
  createCharacterLevelScaling,
  createDefaultDamageDraft,
  createDefaultHealingDraft,
  createReferenceEffectDraft,
  createSlotLevelScaling,
  createSpellForgeDraft,
  duplicateSpellForgeDraft,
  loadSpellForgeDraft,
  validateSpellForgeDraft,
  withSpellLevel,
} from './spellForgeModel';

function completeSpellDraft() {
  const base = createSpellForgeDraft();
  const damage = {
    ...createDefaultDamageDraft(),
    amount: { dice: [{ count: 2, die: 8 as const }], modifier: 'none' as const },
    damageType: 'force' as const,
    scaling: createSlotLevelScaling(2),
  };
  const healing = {
    ...createDefaultHealingDraft(),
    amount: { dice: [{ count: 1, die: 6 as const }], modifier: 'spellcasting-ability' as const },
    scaling: { kind: 'slot-level-dice' as const, baseSpellLevel: 2 as const, dicePerLevel: [{ count: 1, die: 6 as const }] },
  };
  return {
    ...withSpellLevel(base, 2),
    name: 'Forge Pulse',
    description: 'Synthetic M16-D canonical Spell Forge fixture.',
    higherLevelDescription: 'The bounded rolls scale when a higher slot is selected.',
    school: 'evocation' as const,
    castingTime: 'Action',
    range: '90 feet',
    duration: 'Concentration, up to 1 minute',
    target: 'One creature within range',
    components: {
      verbal: true,
      somatic: true,
      material: true,
      materialText: 'a polished glass bead',
    },
    concentration: true,
    ritual: true,
    spellLists: [{ id: 'wizard', name: 'Wizard' }],
    attack: { type: 'spell-attack' as const, attackType: 'ranged' as const },
    savingThrow: { type: 'saving-throw' as const, ability: 'dexterity' as const, onSuccess: 'half' as const },
    damage,
    healing,
    referenceEffects: [{
      ...createReferenceEffectDraft(),
      name: 'Target Application',
      description: 'Applying rolled results to a target remains manual.',
    }],
  };
}

describe('M16-D Spell Forge draft model', () => {
  it('allocates one stable local Spell identity and compiles directly to canonical SpellContent', () => {
    const draft = completeSpellDraft();
    const spell = buildSpellContentFromDraft(draft);

    expect(draft.id).toMatch(/^homebrew:local:spell:[a-z0-9-]+$/);
    expect(spell).toMatchObject({
      id: draft.id,
      kind: 'spell',
      name: 'Forge Pulse',
      source: { type: 'homebrew', namespace: 'local' },
      level: 2,
      school: 'evocation',
      castingTime: 'Action',
      range: '90 feet',
      duration: 'Concentration, up to 1 minute',
      concentration: true,
      ritual: true,
      target: 'One creature within range',
      components: {
        verbal: true,
        somatic: true,
        material: true,
        materialText: 'a polished glass bead',
      },
      spellLists: [{ id: 'wizard', name: 'Wizard' }],
    });

    expect(spell.mechanics).toEqual([
      { type: 'spell-attack', attackType: 'ranged' },
      { type: 'saving-throw', ability: 'dexterity', onSuccess: 'half' },
      {
        type: 'damage',
        amount: { dice: [{ count: 2, die: 8 }], modifier: 'none' },
        damageType: 'force',
        scaling: { kind: 'slot-level-dice', baseSpellLevel: 2, dicePerLevel: [{ count: 1, die: 8 }] },
      },
      {
        type: 'healing',
        amount: { dice: [{ count: 1, die: 6 }], modifier: 'spellcasting-ability' },
        scaling: { kind: 'slot-level-dice', baseSpellLevel: 2, dicePerLevel: [{ count: 1, die: 6 }] },
      },
    ]);
    expect(spell.referenceEffects).toEqual([
      expect.objectContaining({
        name: 'Target Application',
        description: 'Applying rolled results to a target remains manual.',
      }),
    ]);

    expect(validateSpellForgeDraft(draft)).toEqual([]);
    expect(validateHomebrewContent([spell])).toEqual({ ok: true });
  });

  it('preserves Spell ID, source, kind, metadata, and mechanics through Edit/rename', () => {
    const original = buildSpellContentFromDraft(completeSpellDraft());
    const loaded = loadSpellForgeDraft(original);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const renamed = buildSpellContentFromDraft({ ...loaded.draft, name: 'Renamed Forge Pulse' });
    expect(renamed.id).toBe(original.id);
    expect(renamed.kind).toBe('spell');
    expect(renamed.source).toEqual(original.source);
    expect(renamed.name).toBe('Renamed Forge Pulse');
    expect(renamed.mechanics).toEqual(original.mechanics);
    expect(renamed.spellLists).toEqual(original.spellLists);
    expect(original.name).toBe('Forge Pulse');
  });

  it('duplicates supported Spell semantics with a new Spell ID and fresh reference-effect IDs', () => {
    const original = buildSpellContentFromDraft(completeSpellDraft());
    const duplicated = duplicateSpellForgeDraft(original);
    expect(duplicated.ok).toBe(true);
    if (!duplicated.ok) return;

    const copy = buildSpellContentFromDraft(duplicated.draft);
    expect(copy.id).not.toBe(original.id);
    expect(copy.id).toMatch(/^homebrew:local:spell:/);
    expect(copy.name).toBe('Forge Pulse Copy');
    expect(copy.kind).toBe('spell');
    expect(copy.source).toEqual({ type: 'homebrew', namespace: 'local' });
    expect(copy.level).toBe(original.level);
    expect(copy.school).toBe(original.school);
    expect(copy.mechanics).toEqual(original.mechanics);
    expect(copy.spellLists).toEqual(original.spellLists);
    expect(copy.referenceEffects[0].id).not.toBe(original.referenceEffects[0].id);
    expect(original.name).toBe('Forge Pulse');
    expect(validateHomebrewContent([original, copy])).toEqual({ ok: true });
  });

  it('builds canonical cantrip scaling with the existing representative thresholds', () => {
    const base = createSpellForgeDraft();
    const damage = createDefaultDamageDraft();
    const draft = {
      ...base,
      name: 'Scaling Ray',
      description: 'Cantrip scaling fixture.',
      spellLists: [{ id: 'wizard', name: 'Wizard' }],
      damage: {
        ...damage,
        amount: { dice: [{ count: 1, die: 8 as const }], modifier: 'none' as const },
        scaling: createCharacterLevelScaling({ dice: [{ count: 1, die: 8 }], modifier: 'none' }),
      },
    };

    const spell = buildSpellContentFromDraft(draft);
    const mechanic = spell.mechanics.find((candidate) => candidate.type === 'damage');
    expect(mechanic).toEqual({
      type: 'damage',
      amount: { dice: [{ count: 1, die: 8 }], modifier: 'none' },
      damageType: 'force',
      scaling: {
        kind: 'character-level-dice',
        values: [
          { level: 1, dice: [{ count: 1, die: 8 }] },
          { level: 5, dice: [{ count: 2, die: 8 }] },
          { level: 11, dice: [{ count: 3, die: 8 }] },
          { level: 17, dice: [{ count: 4, die: 8 }] },
        ],
      },
    });
    expect(validateHomebrewContent([spell])).toEqual({ ok: true });
  });

  it('normalizes incompatible scaling when changing between cantrip and leveled Spell', () => {
    const base = createSpellForgeDraft();
    const cantrip = {
      ...base,
      damage: {
        ...createDefaultDamageDraft(),
        scaling: createCharacterLevelScaling(createDefaultDamageDraft().amount),
      },
    };
    const leveled = withSpellLevel(cantrip, 3);
    expect(leveled.level).toBe(3);
    expect(leveled.damage?.scaling).toBeUndefined();

    const slotted = {
      ...leveled,
      damage: {
        ...leveled.damage!,
        scaling: createSlotLevelScaling(3),
      },
    };
    const changed = withSpellLevel(slotted, 5);
    expect(changed.damage?.scaling).toMatchObject({ kind: 'slot-level-dice', baseSpellLevel: 5 });

    const backToCantrip = withSpellLevel(changed, 0);
    expect(backToCantrip.damage?.scaling).toBeUndefined();
  });

  it('collects finite Spell-list selector options from the effective catalog and provider definitions', () => {
    const providerListId = 'homebrew-provider-list';
    const syntheticClass: ClassContent = {
      id: 'homebrew:local:class:spell-list-owner',
      kind: 'class',
      name: 'List Owner',
      source: { type: 'homebrew', namespace: 'local' },
      hitDie: 8,
      fixedHitPointsPerLevel: 5,
      primaryAbility: { mode: 'one-of', abilities: ['intelligence'] },
      multiclassProficiencies: { weaponProficiencies: [], armorTraining: [], toolProficiencies: [] },
      savingThrowProficiencies: ['intelligence', 'wisdom'],
      weaponProficiencies: [{ kind: 'category', category: 'simple' }],
      armorTraining: [],
      toolProficiencies: [],
      skillChoices: { choose: 1, from: ['arcana'] },
      startingEquipment: [{ id: 'A', items: [], currency: { amount: 10, unit: 'gp' } }],
      progression: Array.from({ length: 20 }, (_, index) => ({
        level: index + 1,
        proficiencyBonus: index + 1 >= 17 ? 6 : index + 1 >= 13 ? 5 : index + 1 >= 9 ? 4 : index + 1 >= 5 ? 3 : 2,
        features: index === 0 ? [{
          id: 'homebrew:local:class-feature:spell-list-owner',
          name: 'Casting',
          description: 'Provider list fixture.',
          effects: [],
          spellcasting: [{
            id: 'homebrew:local:spellcasting-provider:spell-list-owner',
            name: 'Casting',
            spellcastingAbility: { kind: 'fixed', ability: 'intelligence' },
            multiclassSlotContribution: { kind: 'independent' },
            spellManagement: {
              kind: 'prepared-from-list',
              spellListId: providerListId,
              cantripCount: [{ level: 1, count: 1 }],
              preparedSpellCount: [{ level: 1, count: 1 }],
              replacement: 'long-rest-any',
            },
            ritualCasting: 'none',
          }],
          referenceEffects: [],
        }] : [],
      })),
      resources: [],
    };
    const syntheticSpell: SpellContent = {
      id: 'homebrew:local:spell:list-option',
      kind: 'spell',
      name: 'List Option',
      source: { type: 'homebrew', namespace: 'local' },
      level: 0,
      school: 'evocation',
      castingTime: 'Action',
      range: '60 feet',
      components: { verbal: true, somatic: true, material: false },
      duration: 'Instantaneous',
      concentration: false,
      ritual: false,
      description: 'List option fixture.',
      spellLists: [{ id: 'custom-catalog-list', name: 'Custom Catalog List' }],
      mechanics: [],
      referenceEffects: [],
    };
    const registry = new ContentRegistry(SRD_CONTENT, [syntheticClass, syntheticSpell]);
    const options = collectSpellListOptions(registry);

    expect(options).toEqual(expect.arrayContaining([
      { id: 'wizard', name: 'Wizard' },
      { id: 'custom-catalog-list', name: 'Custom Catalog List' },
      { id: providerListId, name: 'List Owner' },
    ]));
    expect(new Set(options.map((option) => option.id)).size).toBe(options.length);
  });
});
