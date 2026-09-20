import { describe, expect, it } from 'vitest';
import { SRD_CONTENT } from '../content/srd';
import type { ClassContent } from '../models/content';
import { maximumSelectableSpellLevel } from '../rules/spellcasting';
import { ContentRegistry } from '../services/contentRegistry';
import { validateHomebrewContent } from '../services/homebrewContentStorage';
import {
  addFeatureDiceEffect,
  addFeatureStaticEffect,
  buildSubclassContentFromDraft,
  createSubclassActiveEffectDraft,
  createSubclassConsumerDraft,
  createSubclassFeatureDraft,
  createSubclassForgeDraft,
  createSubclassProviderDraft,
  createSubclassReferenceEffectDraft,
  createSubclassResourceDraft,
  createSubclassSpellGrantDraft,
  createSubclassTransactionDraft,
  duplicateSubclassForgeDraft,
  loadSubclassForgeDraft,
  parentAcquisitionConstraint,
  replaceProviderContribution,
  validateSubclassForgeDraft,
} from './subclassForgeModel';

function classByName(registry: ContentRegistry, name: string): ClassContent {
  const value = registry.getAll('class').find((entry) => entry.name === name);
  if (!value) throw new Error('Missing Class fixture: ' + name);
  return value;
}

function buildComplexDraft(registry: ContentRegistry) {
  const fighter = classByName(registry, 'Fighter');
  let feature = createSubclassFeatureDraft(3);
  feature = { ...feature, name: 'Forge Core', description: 'Synthetic bounded subclass feature.' };
  feature = addFeatureStaticEffect(feature, 'speed-bonus');
  feature = addFeatureDiceEffect(feature, 'reroll-once-use-new');

  const resourceBase = createSubclassResourceDraft(3);
  const resource = {
    ...resourceBase,
    definition: {
      ...resourceBase.definition,
      name: 'Forge Charge',
      maximum: { kind: 'level-table' as const, values: [{ level: 3, uses: 1 }, { level: 5, uses: 2 }] },
    },
  };
  const consumerBase = createSubclassConsumerDraft(resource.definition.id);
  const consumer = {
    ...consumerBase,
    grant: {
      ...consumerBase.grant,
      consumer: { ...consumerBase.grant.consumer, name: 'Forge Burst', effect: { type: 'fixed-expend' as const, amount: 1 } },
    },
  };
  const transactionBase = createSubclassTransactionDraft(resource.definition.id);
  const transaction = {
    ...transactionBase,
    definition: {
      ...transactionBase.definition,
      name: 'Forge Renewal',
      usageResourceId: resource.definition.id,
    },
  };
  const activeBase = createSubclassActiveEffectDraft(resource.definition.id);
  const active = {
    ...activeBase,
    definition: { ...activeBase.definition, name: 'Forge Stance', description: 'Synthetic active self effect.' },
  };

  const wizardSpell = registry.getAll('spell').find((spell) => spell.spellLists.some((list) => list.id === 'wizard'));
  if (!wizardSpell) throw new Error('Missing Wizard Spell fixture.');
  let provider = createSubclassProviderDraft(3, 'wizard');
  provider = {
    ...replaceProviderContribution(provider, 'independent', 3),
    definition: { ...replaceProviderContribution(provider, 'independent', 3).definition, name: 'Forge Casting' },
  };
  const spellGrant = createSubclassSpellGrantDraft(provider.definition.id, wizardSpell.id, 3);
  const referenceBase = createSubclassReferenceEffectDraft();
  const reference = { ...referenceBase, name: 'Manual Rider', description: 'Table-managed only.' };

  feature = {
    ...feature,
    resources: [resource],
    consumers: [consumer],
    transactions: [transaction],
    activeEffects: [active],
    providers: [provider],
    spellGrants: [spellGrant],
    referenceEffects: [reference],
  };

  return {
    ...createSubclassForgeDraft(registry, fighter.id),
    name: 'Forge Vanguard',
    description: 'Synthetic canonical Subclass Forge fixture.',
    parentClassId: fighter.id,
    acquisitionLevel: 3,
    features: [feature],
  };
}

describe('M16-E Subclass Forge model', () => {
  const registry = new ContentRegistry(SRD_CONTENT);

  it('derives the canonical acquisition precedent from the effective parent Class', () => {
    const fighter = classByName(registry, 'Fighter');
    expect(parentAcquisitionConstraint(registry, fighter.id)).toEqual({
      level: 3,
      locked: true,
      reason: 'Existing subclasses for this Class are acquired at Class level 3.',
    });
  });

  it('builds canonical SubclassContent directly with the bounded existing feature vocabulary', () => {
    const draft = buildComplexDraft(registry);
    const subclass = buildSubclassContentFromDraft(draft);

    expect(subclass).toMatchObject({
      id: draft.id,
      kind: 'subclass',
      name: 'Forge Vanguard',
      source: { type: 'homebrew', namespace: 'local' },
      parentClassId: draft.parentClassId,
      acquisitionLevel: 3,
      progression: [{
        level: 3,
        features: [{
          id: draft.features[0].id,
          name: 'Forge Core',
          resources: [expect.objectContaining({ name: 'Forge Charge' })],
          resourceConsumers: [expect.objectContaining({ resourceId: draft.features[0].resources[0].definition.id })],
          resourceTransactions: [expect.objectContaining({ name: 'Forge Renewal' })],
          activeSelfEffects: [expect.objectContaining({ name: 'Forge Stance' })],
          spellcasting: [expect.objectContaining({ name: 'Forge Casting' })],
          spellGrants: [expect.objectContaining({ providerId: draft.features[0].providers[0].definition.id })],
          referenceEffects: [expect.objectContaining({ name: 'Manual Rider' })],
        }],
      }],
    });
    expect(subclass.progression[0].features[0].effects.map((effect) => effect.type)).toEqual([
      'speed-bonus',
      'dice-transformation',
    ]);
    expect(validateSubclassForgeDraft(draft, registry)).toEqual([]);
    expect(validateHomebrewContent([subclass])).toEqual({ ok: true });
  });

  it('preserves top-level and nested identity during Edit/rename', () => {
    const original = buildSubclassContentFromDraft(buildComplexDraft(registry));
    const loaded = loadSubclassForgeDraft(original);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const before = loaded.draft;
    const renamed = buildSubclassContentFromDraft({
      ...before,
      name: 'Renamed Forge Vanguard',
      features: before.features.map((feature) => ({ ...feature, name: 'Renamed Forge Core' })),
    });

    expect(renamed.id).toBe(original.id);
    expect(renamed.parentClassId).toBe(original.parentClassId);
    expect(renamed.acquisitionLevel).toBe(original.acquisitionLevel);
    expect(renamed.progression[0].features[0].id).toBe(original.progression[0].features[0].id);
    expect(renamed.progression[0].features[0].resources?.[0].id).toBe(original.progression[0].features[0].resources?.[0].id);
    expect(renamed.progression[0].features[0].spellcasting?.[0].id).toBe(original.progression[0].features[0].spellcasting?.[0].id);
  });

  it('duplicates with a fully fresh private identity graph and remaps every internal reference', () => {
    const original = buildSubclassContentFromDraft(buildComplexDraft(registry));
    const duplicated = duplicateSubclassForgeDraft(original);
    expect(duplicated.ok).toBe(true);
    if (!duplicated.ok) return;
    const copy = buildSubclassContentFromDraft(duplicated.draft);

    const a = original.progression[0].features[0];
    const b = copy.progression[0].features[0];
    expect(copy.id).not.toBe(original.id);
    expect(copy.parentClassId).toBe(original.parentClassId);
    expect(b.id).not.toBe(a.id);

    const aDice = a.effects.find((effect) => effect.type === 'dice-transformation');
    const bDice = b.effects.find((effect) => effect.type === 'dice-transformation');
    expect(bDice?.type === 'dice-transformation' && aDice?.type === 'dice-transformation' && bDice.id).not.toBe(aDice?.type === 'dice-transformation' ? aDice.id : undefined);

    const aResource = a.resources![0].id;
    const bResource = b.resources![0].id;
    expect(bResource).not.toBe(aResource);
    expect(b.resourceConsumers![0].consumer.id).not.toBe(a.resourceConsumers![0].consumer.id);
    expect(b.resourceConsumers![0].resourceId).toBe(bResource);
    expect(b.resourceTransactions![0].id).not.toBe(a.resourceTransactions![0].id);
    expect(b.resourceTransactions![0].kind).toBe('restore-resource');
    if (b.resourceTransactions![0].kind === 'restore-resource') {
      expect(b.resourceTransactions![0].targetResourceId).toBe(bResource);
      expect(b.resourceTransactions![0].usageResourceId).toBe(bResource);
    }
    expect(b.activeSelfEffects![0].id).not.toBe(a.activeSelfEffects![0].id);
    expect(b.activeSelfEffects![0].activationCost?.resourceId).toBe(bResource);

    const aProvider = a.spellcasting![0];
    const bProvider = b.spellcasting![0];
    expect(bProvider.id).not.toBe(aProvider.id);
    expect(bProvider.slotPool?.id).not.toBe(aProvider.slotPool?.id);
    expect(bProvider.slotPool?.slotLevels[0].resourceId).not.toBe(aProvider.slotPool?.slotLevels[0].resourceId);
    expect(b.spellGrants![0].providerId).toBe(bProvider.id);
    expect(b.spellGrants![0].spellIds).toEqual(a.spellGrants![0].spellIds);
    expect(b.referenceEffects[0].id).not.toBe(a.referenceEffects[0].id);

    expect(validateHomebrewContent([original, copy])).toEqual({ ok: true });
  });

  it('emits canonical local progression metadata for ordinary full, half-up, and third-down providers', () => {
    const base = createSubclassProviderDraft(3, 'wizard');
    const cases = [
      { key: 'full' as const, ownerLevel: 5, maximumSpellLevel: 3, contribution: { kind: 'spellcasting', contribution: 'full' } },
      { key: 'half-up' as const, ownerLevel: 5, maximumSpellLevel: 2, contribution: { kind: 'spellcasting', contribution: 'half', rounding: 'up' } },
      { key: 'third-down' as const, ownerLevel: 5, maximumSpellLevel: 1, contribution: { kind: 'spellcasting', contribution: 'third', rounding: 'down' } },
    ];
    for (const expected of cases) {
      const provider = replaceProviderContribution(base, expected.key, 3).definition;
      expect(provider.multiclassSlotContribution).toEqual(expected.contribution);
      expect(provider.slotPool).toBeDefined();
      expect(provider.slotPool?.progression[0]?.level).toBe(3);
      expect(provider.slotPool?.slotLevels.length).toBeGreaterThan(0);
      expect(maximumSelectableSpellLevel(provider, expected.ownerLevel)).toBe(expected.maximumSpellLevel);
    }
  });

  it('preserves ordered feature presentation and stable IDs while canonical progression stays level-sorted', () => {
    const draft = createSubclassForgeDraft(registry, classByName(registry, 'Fighter').id);
    const first = { ...createSubclassFeatureDraft(3), name: 'First', description: 'First.' };
    const second = { ...createSubclassFeatureDraft(3), name: 'Second', description: 'Second.' };
    const later = { ...createSubclassFeatureDraft(7), name: 'Later', description: 'Later.' };
    const subclass = buildSubclassContentFromDraft({
      ...draft,
      name: 'Ordered',
      description: 'Order fixture.',
      acquisitionLevel: 3,
      features: [second, first, later],
    });
    expect(subclass.progression.map((row) => row.level)).toEqual([3, 7]);
    expect(subclass.progression[0].features.map((feature) => feature.id)).toEqual([second.id, first.id]);
  });
});
