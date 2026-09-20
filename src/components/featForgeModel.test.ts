import { describe, expect, it } from 'vitest';
import type { FeatContent } from '../models/content';
import { validateHomebrewContent } from '../services/homebrewContentStorage';
import {
  FEAT_FORGE_STATIC_EFFECT_TYPES,
  buildFeatContentFromDraft,
  createAbilityPrerequisiteDraft,
  createAsiDraft,
  createDiceEffectDraft,
  createFeatForgeDraft,
  createFeaturePrerequisiteDraft,
  createLevelPrerequisiteDraft,
  createReferenceEffectDraft,
  createStaticEffectDraft,
  duplicateFeatForgeDraft,
  loadFeatForgeDraft,
  validateFeatForgeDraft,
} from './featForgeModel';

function completeDraft() {
  const base = createFeatForgeDraft();
  const reference = { ...createReferenceEffectDraft(), name: 'Manual Rider', description: 'Table-managed rider only.' };
  return {
    ...base,
    name: 'Forge Adept',
    description: 'Synthetic M16-C Feat Forge contract fixture.',
    category: 'general' as const,
    repeatable: true,
    repeatabilityNote: 'May be selected more than once.',
    prerequisites: [
      createLevelPrerequisiteDraft(),
      { ...createAbilityPrerequisiteDraft(), abilities: ['strength', 'dexterity'] as const, minimum: 13 },
      { ...createFeaturePrerequisiteDraft(), name: 'Special Training' },
    ],
    asi: { ...createAsiDraft(), selections: 2 as const, allowDuplicateSelection: true },
    staticEffects: FEAT_FORGE_STATIC_EFFECT_TYPES.map(createStaticEffectDraft),
    diceEffects: [
      createDiceEffectDraft('reroll-once-use-new'),
      createDiceEffectDraft('minimum-die-face'),
    ],
    referenceEffects: [reference],
  };
}

describe('M16-C Feat Forge draft model', () => {
  it('allocates a stable local Feat identity and builds canonical FeatContent directly', () => {
    const draft = completeDraft();
    const feat = buildFeatContentFromDraft(draft);

    expect(draft.id).toMatch(/^homebrew:local:feat:[a-z0-9-]+$/);
    expect(feat).toMatchObject({
      id: draft.id,
      kind: 'feat',
      name: 'Forge Adept',
      source: { type: 'homebrew', namespace: 'local' },
      category: 'general',
      repeatable: true,
    });
    expect(feat.prerequisites).toEqual([
      { type: 'level', minimum: 4 },
      { type: 'ability-minimum', abilities: ['strength', 'dexterity'], minimum: 13 },
      { type: 'feature', name: 'Special Training', support: 'reference-only' },
    ]);
    expect(feat.choices).toEqual([
      expect.objectContaining({
        id: 'ability-increase',
        support: 'structured',
        options: expect.arrayContaining([
          { id: 'strength', name: 'Strength' },
          { id: 'charisma', name: 'Charisma' },
        ]),
      }),
    ]);
    expect(feat.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'ability-score-increase',
        choiceId: 'ability-increase',
        selections: 2,
        amountPerSelection: 1,
        maximum: 20,
        allowDuplicateSelection: true,
      }),
      ...FEAT_FORGE_STATIC_EFFECT_TYPES.map((type) => expect.objectContaining({ type })),
      expect.objectContaining({ type: 'dice-transformation', transformation: { type: 'reroll-once-use-new', die: 20, qualifyingFaces: [1] } }),
      expect.objectContaining({ type: 'dice-transformation', transformation: { type: 'minimum-die-face', minimum: 3 } }),
    ]));
    expect(feat.referenceEffects).toEqual([
      expect.objectContaining({ name: 'Manual Rider', description: 'Table-managed rider only.' }),
    ]);

    expect(validateFeatForgeDraft(draft)).toEqual([]);
    expect(validateHomebrewContent([feat])).toEqual({ ok: true });
  });

  it('emits every bounded static effect using canonical validator-safe defaults', () => {
    const base = createFeatForgeDraft();
    const feat = buildFeatContentFromDraft({
      ...base,
      name: 'Static Matrix',
      description: 'Every bounded static effect.',
      staticEffects: FEAT_FORGE_STATIC_EFFECT_TYPES.map(createStaticEffectDraft),
    });

    expect(feat.effects.map((effect) => effect.type)).toEqual(FEAT_FORGE_STATIC_EFFECT_TYPES);
    expect(validateHomebrewContent([feat])).toEqual({ ok: true });
  });

  it('preserves Feat ID, kind, namespace, and supported semantics during Edit/rename', () => {
    const original = buildFeatContentFromDraft(completeDraft());
    const loaded = loadFeatForgeDraft(original);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const renamed = buildFeatContentFromDraft({ ...loaded.draft, name: 'Renamed Forge Adept' });
    expect(renamed.id).toBe(original.id);
    expect(renamed.kind).toBe('feat');
    expect(renamed.source).toEqual(original.source);
    expect(renamed.name).toBe('Renamed Forge Adept');
    expect(renamed.effects).toEqual(original.effects);
    expect(original.name).toBe('Forge Adept');
  });

  it('duplicates supported semantics with a new Feat ID and new nested dice/reference IDs', () => {
    const original = buildFeatContentFromDraft(completeDraft());
    const duplicated = duplicateFeatForgeDraft(original);
    expect(duplicated.ok).toBe(true);
    if (!duplicated.ok) return;

    const copy = buildFeatContentFromDraft(duplicated.draft);
    expect(copy.id).not.toBe(original.id);
    expect(copy.id).toMatch(/^homebrew:local:feat:/);
    expect(copy.name).toBe('Forge Adept Copy');
    expect(copy.category).toBe(original.category);
    expect(copy.prerequisites).toEqual(original.prerequisites);
    expect(copy.effects.filter((effect) => effect.type !== 'dice-transformation'))
      .toEqual(original.effects.filter((effect) => effect.type !== 'dice-transformation'));

    const originalDiceIds = original.effects
      .filter((effect) => effect.type === 'dice-transformation')
      .map((effect) => effect.id);
    const copyDiceIds = copy.effects
      .filter((effect) => effect.type === 'dice-transformation')
      .map((effect) => effect.id);
    expect(copyDiceIds).toHaveLength(originalDiceIds.length);
    expect(copyDiceIds.every((id) => !originalDiceIds.includes(id))).toBe(true);

    expect(copy.referenceEffects[0].id).not.toBe(original.referenceEffects[0].id);
    expect(original.name).toBe('Forge Adept');
    expect(validateHomebrewContent([original, copy])).toEqual({ ok: true });
  });

  it('preserves existing reference-only choices on Edit without treating them as a generic structured editor', () => {
    const feat: FeatContent = {
      id: 'homebrew:local:feat:reference-choice',
      kind: 'feat',
      name: 'Reference Choice',
      source: { type: 'homebrew', namespace: 'local' },
      category: 'origin',
      prerequisites: [],
      repeatable: false,
      choices: [{
        id: 'manual-choice',
        name: 'Manual Choice',
        support: 'reference-only',
        description: 'Keep this table-managed choice.',
        options: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      }],
      effects: [],
      referenceEffects: [],
      description: 'Fixture with an existing reference-only choice.',
    };

    const loaded = loadFeatForgeDraft(feat);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.draft.preservedReferenceChoices).toEqual(feat.choices);
    expect(buildFeatContentFromDraft(loaded.draft).choices).toEqual(feat.choices);
  });

  it('fails closed when an existing Feat contains unsupported structured choice semantics', () => {
    const feat: FeatContent = {
      id: 'homebrew:local:feat:unsupported-choice',
      kind: 'feat',
      name: 'Unsupported Choice',
      source: { type: 'homebrew', namespace: 'local' },
      category: 'general',
      prerequisites: [],
      repeatable: false,
      choices: [{
        id: 'mystery',
        name: 'Mystery',
        support: 'structured',
        description: 'Not associated with the canonical ASI effect.',
        options: [{ id: 'a', name: 'A' }],
      }],
      effects: [],
      referenceEffects: [],
      description: 'Unsupported structured-choice fixture.',
    };

    expect(loadFeatForgeDraft(feat)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/structured choice outside/i),
    });
  });
});
