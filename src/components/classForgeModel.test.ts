import { describe, expect, it } from 'vitest';
import { SRD_CONTENT } from '../content/srd';
import { maximumSelectableSpellLevel } from '../rules/spellcasting';
import { ContentRegistry } from '../services/contentRegistry';
import { validateContentDataset } from '../services/contentValidation';
import {
  buildClassContentFromDraft,
  createClassActiveEffectDraft,
  createClassConsumerDraft,
  createClassFeatAcquisitionFeatureDraft,
  createClassFeatureDraft,
  createClassForgeDraft,
  createClassProviderDraft,
  createClassReferenceEffectDraft,
  createClassResourceDraft,
  createClassSpellGrantDraft,
  createClassTransactionDraft,
  duplicateClassForgeDraft,
  loadClassForgeDraft,
  replaceProviderContribution,
  standardClassProficiencyBonus,
  validateClassForgeDraft,
  type ClassForgeDraft,
  type ClassForgeFeatureDraft,
} from './classForgeModel';

const registry = new ContentRegistry(SRD_CONTENT);

function validDraft(): ClassForgeDraft {
  const base = createClassForgeDraft();
  const feature = {
    ...createClassFeatureDraft(1),
    name: 'Forge Training',
    description: 'Synthetic Class Forge feature.',
  };
  return {
    ...base,
    name: 'Forge Adept',
    features: [feature],
  };
}

function featureWithMechanics(): ClassForgeFeatureDraft {
  const spell = registry.getAll('spell').find((entry) => entry.spellLists.some((list) => list.id === 'wizard'));
  if (!spell) throw new Error('Expected Wizard spell fixture.');
  const resource = { ...createClassResourceDraft(1), definition: { ...createClassResourceDraft(1).definition, name: 'Forge Reserve' } };
  const provider = {
    ...createClassProviderDraft(1, 'wizard'),
    definition: { ...createClassProviderDraft(1, 'wizard').definition, name: 'Forge Casting' },
  };
  return {
    ...createClassFeatureDraft(1),
    name: 'Forge Core',
    description: 'Synthetic mechanics graph.',
    resources: [resource],
    consumers: [{ ...createClassConsumerDraft(resource.definition.id), grant: { ...createClassConsumerDraft(resource.definition.id).grant, consumer: { ...createClassConsumerDraft(resource.definition.id).grant.consumer, name: 'Forge Burst' } } }],
    transactions: [{ ...createClassTransactionDraft(resource.definition.id), definition: { ...createClassTransactionDraft(resource.definition.id).definition, name: 'Forge Renewal' } }],
    activeEffects: [{ ...createClassActiveEffectDraft(resource.definition.id), definition: { ...createClassActiveEffectDraft(resource.definition.id).definition, name: 'Forge Stance', description: 'Synthetic stance.' } }],
    providers: [provider],
    spellGrants: [createClassSpellGrantDraft(provider.definition.id, spell.id, 1)],
    referenceEffects: [{ ...createClassReferenceEffectDraft(), name: 'Manual Rider', description: 'Reference only.' }],
  };
}

describe('M16-F Class Forge canonical model', () => {
  it('emits canonical ClassContent with complete 1-20 progression and standard PB', () => {
    const draft = validDraft();
    const content = buildClassContentFromDraft(draft);

    expect(content).toMatchObject({
      id: draft.id,
      kind: 'class',
      name: 'Forge Adept',
      source: { type: 'homebrew', namespace: 'local' },
      hitDie: 8,
      fixedHitPointsPerLevel: 5,
      primaryAbility: { mode: 'one-of', abilities: ['strength'] },
    });
    expect(content.progression).toHaveLength(20);
    expect(content.progression.map((row) => row.level)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(content.progression.map((row) => row.proficiencyBonus)).toEqual(Array.from({ length: 20 }, (_, index) => standardClassProficiencyBonus(index + 1)));
    expect(content.progression[0].features[0]).toMatchObject({ name: 'Forge Training' });
    expect(validateContentDataset([...SRD_CONTENT, content])).toEqual([]);
  });

  it('authors mastery capacity and exact existing ASI/Epic Boon markers without a new choice system', () => {
    const base = validDraft();
    const asi = createClassFeatAcquisitionFeatureDraft(4, 'ability-score-improvement');
    const boon = createClassFeatAcquisitionFeatureDraft(19, 'epic-boon');
    const draft: ClassForgeDraft = {
      ...base,
      masteryCapacity: base.masteryCapacity.map((row) => row.level === 1 ? { ...row, choices: 2 } : row),
      features: [...base.features, asi, boon],
    };
    const content = buildClassContentFromDraft(draft);

    expect(content.progression[0].weaponMasteryChoices).toBe(2);
    expect(content.progression[3].features[0]).toMatchObject({
      name: 'Ability Score Improvement',
      referenceEffects: [expect.objectContaining({ id: 'feat-acquisition' })],
    });
    expect(content.progression[18].features[0]).toMatchObject({
      name: 'Epic Boon',
      referenceEffects: [expect.objectContaining({ id: 'feat-acquisition' })],
    });
    expect(validateContentDataset([...SRD_CONTENT, content])).toEqual([]);
  });

  it('emits canonical local progression metadata for full, half-up, and third-down ordinary providers', () => {
    const base = createClassProviderDraft(1, 'wizard');
    const cases = [
      { key: 'full' as const, ownerLevel: 5, maximumSpellLevel: 3 },
      { key: 'half-up' as const, ownerLevel: 5, maximumSpellLevel: 2 },
      { key: 'third-down' as const, ownerLevel: 5, maximumSpellLevel: 1 },
    ];
    for (const expected of cases) {
      const provider = replaceProviderContribution(base, expected.key, 1).definition;
      expect(provider.slotPool?.progression.length).toBeGreaterThan(0);
      expect(maximumSelectableSpellLevel(provider, expected.ownerLevel)).toBe(expected.maximumSpellLevel);
    }
  });

  it('duplicates a private Class graph with fresh nested IDs while external Spell references remain stable', () => {
    const base = validDraft();
    const graphFeature = featureWithMechanics();
    const original = buildClassContentFromDraft({ ...base, features: [graphFeature] });
    expect(validateContentDataset([...SRD_CONTENT, original])).toEqual([]);

    const duplicated = duplicateClassForgeDraft(original);
    if (!duplicated.ok) throw new Error(duplicated.message);
    const copy = buildClassContentFromDraft(duplicated.draft);
    expect(validateContentDataset([...SRD_CONTENT, original, copy])).toEqual([]);

    const oldFeature = original.progression[0].features[0];
    const newFeature = copy.progression[0].features[0];
    expect(copy.id).not.toBe(original.id);
    expect(newFeature.id).not.toBe(oldFeature.id);
    expect(newFeature.resources?.[0].id).not.toBe(oldFeature.resources?.[0].id);
    expect(newFeature.resourceConsumers?.[0].consumer.id).not.toBe(oldFeature.resourceConsumers?.[0].consumer.id);
    expect(newFeature.resourceConsumers?.[0].resourceId).toBe(newFeature.resources?.[0].id);
    expect(newFeature.resourceTransactions?.[0].id).not.toBe(oldFeature.resourceTransactions?.[0].id);
    expect(newFeature.activeSelfEffects?.[0].id).not.toBe(oldFeature.activeSelfEffects?.[0].id);
    expect(newFeature.spellcasting?.[0].id).not.toBe(oldFeature.spellcasting?.[0].id);
    expect(newFeature.spellGrants?.[0].providerId).toBe(newFeature.spellcasting?.[0].id);
    expect(newFeature.spellGrants?.[0].spellIds).toEqual(oldFeature.spellGrants?.[0].spellIds);
    expect(newFeature.referenceEffects[0].id).not.toBe(oldFeature.referenceEffects[0].id);
  });

  it('loads an existing custom Class with stable top-level and nested identity intact', () => {
    const original = buildClassContentFromDraft(validDraft());
    const loaded = loadClassForgeDraft(original);
    if (!loaded.ok) throw new Error(loaded.message);

    expect(loaded.draft.id).toBe(original.id);
    expect(loaded.draft.sourceNamespace).toBe('local');
    expect(loaded.draft.hitDie).toBe(original.hitDie);
    expect(loaded.draft.masteryCapacity).toHaveLength(20);
    expect(loaded.draft.features[0].id).toBe(original.progression[0].features[0].id);
    expect(loaded.draft.features[0].persisted).toBe(true);
  });

  it('friendly validation rejects malformed Class core/progression inputs before authoritative Save', () => {
    const base = createClassForgeDraft();
    const errors = validateClassForgeDraft({
      ...base,
      name: '',
      fixedHitPointsPerLevel: 99,
      primaryAbility: { mode: 'one-of', abilities: [] },
      savingThrowProficiencies: ['strength'],
      skillChoices: { choose: 3, from: ['athletics'] },
      masteryCapacity: base.masteryCapacity.slice(0, 19),
      features: [],
    }, registry);

    expect(errors).toEqual(expect.arrayContaining([
      'Class name is required.',
      'Fixed Hit Points per level must be a whole number from 1 through the Hit Die maximum.',
      'Primary Ability must use one or more unique standard abilities.',
      'Choose exactly two unique starting saving-throw proficiencies.',
      'Starting skill choices require unique standard skills and a valid number chosen.',
      'Weapon Mastery capacity must contain Class levels 1 through 20 with non-negative whole-number capacity.',
      'Add at least one Class feature.',
    ]));
  });
});
