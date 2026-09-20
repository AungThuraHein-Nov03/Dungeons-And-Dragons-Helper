import type { AbilityKey } from '../models/character';
import type {
  ActiveSelfEffectDefinition,
  ClassContent,
  ClassResourceDefinition,
  ContentSourceMetadata,
  LeveledSpellLevel,
  MulticlassSlotContribution,
  ResourceConsumerGrant,
  ResourceTransactionDefinition,
  SpellcastingProviderDefinition,
  SpellcastingProviderSpellGrant,
  SubclassContent,
  SubclassFeatureContent,
} from '../models/content';
import type { ContentId } from '../models/contentId';
import type { ContentRegistry } from '../services/contentRegistry';
import { MULTICLASS_SPELLCASTER_SLOT_PROGRESSION } from '../rules/multiclass';
import { allocateHomebrewContentId } from '../services/homebrewContentStorage';
import {
  createDiceEffectDraft,
  createStaticEffectDraft,
  type FeatForgeDiceEffectDraft,
  type FeatForgeDiceTransformationType,
  type FeatForgeStaticEffectDraft,
  type FeatForgeStaticEffectType,
} from './featForgeModel';

export interface SubclassForgeReferenceEffectDraft {
  readonly draftId: string;
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly persisted: boolean;
}

export interface SubclassForgeResourceDraft {
  readonly draftId: string;
  readonly definition: ClassResourceDefinition;
  readonly persisted: boolean;
}

export interface SubclassForgeConsumerDraft {
  readonly draftId: string;
  readonly grant: ResourceConsumerGrant;
  readonly persisted: boolean;
}

export interface SubclassForgeTransactionDraft {
  readonly draftId: string;
  readonly definition: ResourceTransactionDefinition;
  readonly persisted: boolean;
}

export interface SubclassForgeActiveEffectDraft {
  readonly draftId: string;
  readonly definition: ActiveSelfEffectDefinition;
  readonly persisted: boolean;
}

export interface SubclassForgeProviderDraft {
  readonly draftId: string;
  readonly definition: SpellcastingProviderDefinition;
  readonly persisted: boolean;
}

export interface SubclassForgeSpellGrantDraft {
  readonly draftId: string;
  readonly grant: SpellcastingProviderSpellGrant;
  readonly persisted: boolean;
}

export interface SubclassForgeFeatureDraft {
  readonly draftId: string;
  readonly id: ContentId;
  readonly level: number;
  readonly name: string;
  readonly description: string;
  readonly persisted: boolean;
  readonly staticEffects: readonly FeatForgeStaticEffectDraft[];
  readonly diceEffects: readonly FeatForgeDiceEffectDraft[];
  readonly resources: readonly SubclassForgeResourceDraft[];
  readonly consumers: readonly SubclassForgeConsumerDraft[];
  readonly transactions: readonly SubclassForgeTransactionDraft[];
  readonly activeEffects: readonly SubclassForgeActiveEffectDraft[];
  readonly providers: readonly SubclassForgeProviderDraft[];
  readonly spellGrants: readonly SubclassForgeSpellGrantDraft[];
  readonly referenceEffects: readonly SubclassForgeReferenceEffectDraft[];
}

export interface SubclassForgeDraft {
  readonly id: ContentId;
  readonly sourceNamespace: string;
  readonly name: string;
  readonly description: string;
  readonly parentClassId: ContentId;
  readonly acquisitionLevel: number;
  readonly persisted: boolean;
  readonly features: readonly SubclassForgeFeatureDraft[];
}

export type SubclassForgeDraftLoadResult =
  | { readonly ok: true; readonly draft: SubclassForgeDraft }
  | { readonly ok: false; readonly message: string };

export interface SubclassForgeOption {
  readonly id: ContentId;
  readonly name: string;
}

function draftId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function homebrewSource(namespace = 'local'): ContentSourceMetadata {
  return { type: 'homebrew', namespace };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function parentAcquisitionConstraint(
  registry: ContentRegistry,
  parentClassId: ContentId,
): { readonly level: number; readonly locked: boolean; readonly reason: string } {
  const siblingLevels = [...new Set(registry.findSubclassesForClass(parentClassId).map((subclass) => subclass.acquisitionLevel))];
  if (siblingLevels.length === 1) {
    return {
      level: siblingLevels[0],
      locked: true,
      reason: `Existing subclasses for this Class are acquired at Class level ${siblingLevels[0]}.`,
    };
  }
  return {
    level: 3,
    locked: false,
    reason: siblingLevels.length > 1
      ? 'Existing subclasses for this Class use multiple acquisition levels; choose the canonical level for this Subclass.'
      : 'This Class has no existing subclass acquisition precedent in the effective catalog.',
  };
}

export function createSubclassForgeDraft(
  registry: ContentRegistry,
  parentClassId?: ContentId,
): SubclassForgeDraft {
  const parent = parentClassId ?? registry.getAll('class')[0]?.id ?? '';
  const acquisition = parent ? parentAcquisitionConstraint(registry, parent) : { level: 3 };
  return {
    id: allocateHomebrewContentId('subclass'),
    sourceNamespace: 'local',
    name: '',
    description: '',
    parentClassId: parent,
    acquisitionLevel: acquisition.level,
    persisted: false,
    features: [],
  };
}

function staticEffectDraft(effect: Exclude<SubclassFeatureContent['effects'][number], { readonly type: 'dice-transformation' }>): FeatForgeStaticEffectDraft {
  return { draftId: draftId(), effect: clone(effect) };
}

function diceEffectDraft(effect: Extract<SubclassFeatureContent['effects'][number], { readonly type: 'dice-transformation' }>): FeatForgeDiceEffectDraft {
  return { draftId: draftId(), effect: clone(effect) };
}

function loadFeature(level: number, feature: SubclassFeatureContent): SubclassForgeFeatureDraft {
  return {
    draftId: draftId(),
    id: feature.id,
    level,
    name: feature.name,
    description: feature.description,
    persisted: true,
    staticEffects: feature.effects.flatMap((effect) => effect.type === 'dice-transformation' ? [] : [staticEffectDraft(effect)]),
    diceEffects: feature.effects.flatMap((effect) => effect.type === 'dice-transformation' ? [diceEffectDraft(effect)] : []),
    resources: (feature.resources ?? []).map((definition) => ({ draftId: draftId(), definition: clone(definition), persisted: true })),
    consumers: (feature.resourceConsumers ?? []).map((grant) => ({ draftId: draftId(), grant: clone(grant), persisted: true })),
    transactions: (feature.resourceTransactions ?? []).map((definition) => ({ draftId: draftId(), definition: clone(definition), persisted: true })),
    activeEffects: (feature.activeSelfEffects ?? []).map((definition) => ({ draftId: draftId(), definition: clone(definition), persisted: true })),
    providers: (feature.spellcasting ?? []).map((definition) => ({ draftId: draftId(), definition: clone(definition), persisted: true })),
    spellGrants: (feature.spellGrants ?? []).map((grant) => ({ draftId: draftId(), grant: clone(grant), persisted: true })),
    referenceEffects: feature.referenceEffects.map((effect) => ({
      draftId: draftId(),
      id: effect.id,
      name: effect.name,
      description: effect.description,
      persisted: true,
    })),
  };
}

export function loadSubclassForgeDraft(subclass: SubclassContent): SubclassForgeDraftLoadResult {
  if (subclass.source.type !== 'homebrew') {
    return { ok: false, message: 'Bundled SRD Subclasses are read-only and cannot be edited in Creator Forge.' };
  }
  return {
    ok: true,
    draft: {
      id: subclass.id,
      sourceNamespace: subclass.source.namespace,
      name: subclass.name,
      description: subclass.description,
      parentClassId: subclass.parentClassId,
      acquisitionLevel: subclass.acquisitionLevel,
      persisted: true,
      features: subclass.progression.flatMap((row) => row.features.map((feature) => loadFeature(row.level, feature))),
    },
  };
}

export function createSubclassFeatureDraft(level: number): SubclassForgeFeatureDraft {
  return {
    draftId: draftId(),
    id: allocateHomebrewContentId('subclass-feature'),
    level,
    name: '',
    description: '',
    persisted: false,
    staticEffects: [],
    diceEffects: [],
    resources: [],
    consumers: [],
    transactions: [],
    activeEffects: [],
    providers: [],
    spellGrants: [],
    referenceEffects: [],
  };
}

export function createSubclassResourceDraft(level: number): SubclassForgeResourceDraft {
  return {
    draftId: draftId(),
    persisted: false,
    definition: {
      id: allocateHomebrewContentId('class-resource'),
      name: '',
      source: homebrewSource(),
      maximum: { kind: 'level-table', values: [{ level, uses: 1 }] },
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
      presentation: 'pips',
    },
  };
}

export function createSubclassConsumerDraft(resourceId: ContentId): SubclassForgeConsumerDraft {
  return {
    draftId: draftId(),
    persisted: false,
    grant: {
      resourceId,
      consumer: {
        id: allocateHomebrewContentId('subclass-resource-consumer'),
        name: '',
        effect: { type: 'expend-only' },
      },
    },
  };
}

export function createSubclassTransactionDraft(resourceId: ContentId): SubclassForgeTransactionDraft {
  return {
    draftId: draftId(),
    persisted: false,
    definition: {
      id: allocateHomebrewContentId('resource-transaction'),
      name: '',
      kind: 'restore-resource',
      targetResourceId: resourceId,
      restore: { kind: 'fixed', amount: 1 },
    },
  };
}

export function createSubclassActiveEffectDraft(resourceId?: ContentId): SubclassForgeActiveEffectDraft {
  return {
    draftId: draftId(),
    persisted: false,
    definition: {
      id: allocateHomebrewContentId('active-self-effect'),
      name: '',
      description: '',
      activationTiming: 'bonus-action',
      ...(resourceId ? { activationCost: { resourceId, amount: 1 } } : {}),
      modifiers: [{
        type: 'd20-roll-mode',
        mode: 'advantage',
        target: { kind: 'ability-check', abilities: ['strength'] },
      }],
      clearOnRest: 'long-rest',
    },
  };
}

export type SubclassForgeProviderContribution =
  | 'full'
  | 'half-up'
  | 'third-down'
  | 'pact'
  | 'independent';

export function providerContributionKey(value: MulticlassSlotContribution): SubclassForgeProviderContribution {
  if (value.kind === 'pact-magic') return 'pact';
  if (value.kind === 'independent') return 'independent';
  if (value.contribution === 'full') return 'full';
  if (value.contribution === 'half') return 'half-up';
  return 'third-down';
}

export function providerContribution(value: SubclassForgeProviderContribution): MulticlassSlotContribution {
  if (value === 'pact') return { kind: 'pact-magic' };
  if (value === 'independent') return { kind: 'independent' };
  if (value === 'full') return { kind: 'spellcasting', contribution: 'full' };
  if (value === 'half-up') return { kind: 'spellcasting', contribution: 'half', rounding: 'up' };
  return { kind: 'spellcasting', contribution: 'third', rounding: 'down' };
}

function ordinaryCasterLevel(
  contribution: Extract<MulticlassSlotContribution, { readonly kind: 'spellcasting' }>,
  ownerLevel: number,
): number {
  if (contribution.contribution === 'full') return ownerLevel;
  if (contribution.contribution === 'half') return Math.ceil(ownerLevel / 2);
  return Math.floor(ownerLevel / 3);
}

export function createOrdinaryProviderSlotPool(
  firstOwnerLevel: number,
  contribution: Extract<MulticlassSlotContribution, { readonly kind: 'spellcasting' }>,
): NonNullable<SpellcastingProviderDefinition['slotPool']> {
  const progression = Array.from({ length: 21 - firstOwnerLevel }, (_, index) => firstOwnerLevel + index)
    .flatMap((ownerLevel) => {
      const casterLevel = ordinaryCasterLevel(contribution, ownerLevel);
      if (casterLevel <= 0) return [];
      const row = MULTICLASS_SPELLCASTER_SLOT_PROGRESSION.find((candidate) => candidate.level === casterLevel);
      return row ? [{ level: ownerLevel, slots: row.slots.map((slot) => ({ ...slot })) }] : [];
    });
  const spellLevels = [...new Set(progression.flatMap((row) => row.slots.map((slot) => slot.spellLevel)))].sort((a, b) => a - b);
  const slotLevels = spellLevels.map((spellLevel) => ({
    spellLevel,
    resourceId: allocateHomebrewContentId('spell-slot'),
    name: `Level ${spellLevel} Subclass Spell Slots`,
  }));
  return {
    id: allocateHomebrewContentId('spell-slot-pool'),
    name: 'Subclass Spell Slots',
    slotLevels,
    progression,
    recovery: [{ trigger: 'long-rest', mode: 'all' }],
  };
}

export function createSubclassProviderDraft(
  level: number,
  spellListId: string,
): SubclassForgeProviderDraft {
  const contribution = { kind: 'spellcasting', contribution: 'third', rounding: 'down' } as const;
  return {
    draftId: draftId(),
    persisted: false,
    definition: {
      id: allocateHomebrewContentId('spellcasting-provider'),
      name: '',
      spellcastingAbility: { kind: 'fixed', ability: 'intelligence' },
      multiclassSlotContribution: contribution,
      spellManagement: {
        kind: 'prepared-from-list',
        spellListId,
        cantripCount: [{ level, count: 2 }],
        preparedSpellCount: [{ level, count: 3 }],
        replacement: 'long-rest-any',
      },
      slotPool: createOrdinaryProviderSlotPool(level, contribution),
      ritualCasting: 'prepared',
    },
  };
}

export function createProviderSlotPool(
  level: number,
  recovery: 'short-rest' | 'long-rest' = 'long-rest',
): NonNullable<SpellcastingProviderDefinition['slotPool']> {
  const resourceId = allocateHomebrewContentId('spell-slot');
  return {
    id: allocateHomebrewContentId('spell-slot-pool'),
    name: 'Subclass Spell Slots',
    slotLevels: [{ spellLevel: 1, resourceId, name: 'Level 1 Subclass Slots' }],
    progression: [{ level, slots: [{ spellLevel: 1, maximum: 1 }] }],
    recovery: [{ trigger: recovery, mode: 'all' }],
  };
}

export function createSubclassSpellGrantDraft(
  providerId: ContentId,
  spellId: ContentId,
  minimumLevel: number,
): SubclassForgeSpellGrantDraft {
  return {
    draftId: draftId(),
    grant: {
      providerId,
      spellIds: [spellId],
      status: 'always-prepared',
      minimumLevel,
    },
    persisted: false,
  };
}

export function createSubclassReferenceEffectDraft(): SubclassForgeReferenceEffectDraft {
  return {
    draftId: draftId(),
    id: allocateHomebrewContentId('subclass-reference-effect'),
    name: '',
    description: '',
    persisted: false,
  };
}

export function addFeatureStaticEffect(
  feature: SubclassForgeFeatureDraft,
  type: FeatForgeStaticEffectType,
): SubclassForgeFeatureDraft {
  return { ...feature, staticEffects: [...feature.staticEffects, createStaticEffectDraft(type)] };
}

export function addFeatureDiceEffect(
  feature: SubclassForgeFeatureDraft,
  type: FeatForgeDiceTransformationType,
): SubclassForgeFeatureDraft {
  return { ...feature, diceEffects: [...feature.diceEffects, createDiceEffectDraft(type)] };
}

export function buildSubclassContentFromDraft(draft: SubclassForgeDraft): SubclassContent {
  const levels = [...new Set(draft.features.map((feature) => feature.level))].sort((a, b) => a - b);
  return {
    id: draft.id,
    kind: 'subclass',
    name: draft.name.trim(),
    source: homebrewSource(draft.sourceNamespace),
    parentClassId: draft.parentClassId,
    acquisitionLevel: draft.acquisitionLevel,
    description: draft.description.trim(),
    progression: levels.map((level) => ({
      level,
      features: draft.features.filter((feature) => feature.level === level).map((feature): SubclassFeatureContent => ({
        id: feature.id,
        name: feature.name.trim(),
        description: feature.description.trim(),
        effects: [
          ...feature.staticEffects.map((entry) => clone(entry.effect)),
          ...feature.diceEffects.map((entry) => clone(entry.effect)),
        ],
        ...(feature.providers.length ? { spellcasting: feature.providers.map((entry) => clone(entry.definition)) } : {}),
        ...(feature.spellGrants.length ? { spellGrants: feature.spellGrants.map((entry) => clone(entry.grant)) } : {}),
        ...(feature.resources.length ? { resources: feature.resources.map((entry) => clone(entry.definition)) } : {}),
        ...(feature.consumers.length ? { resourceConsumers: feature.consumers.map((entry) => clone(entry.grant)) } : {}),
        ...(feature.transactions.length ? { resourceTransactions: feature.transactions.map((entry) => clone(entry.definition)) } : {}),
        ...(feature.activeEffects.length ? { activeSelfEffects: feature.activeEffects.map((entry) => clone(entry.definition)) } : {}),
        referenceEffects: feature.referenceEffects.map((entry) => ({
          id: entry.id,
          name: entry.name.trim(),
          description: entry.description.trim(),
        })),
      })),
    })),
  };
}

export function parentResourceOptions(
  registry: ContentRegistry,
  parentClassId: ContentId,
): readonly SubclassForgeOption[] {
  const parent = registry.findClass(parentClassId);
  if (!parent) return [];
  const values: SubclassForgeOption[] = parent.resources.map((resource) => ({ id: resource.id, name: resource.name }));
  for (const row of parent.progression) {
    for (const feature of row.features) {
      for (const resource of feature.resources ?? []) values.push({ id: resource.id, name: resource.name });
      for (const provider of feature.spellcasting ?? []) {
        for (const slot of provider.slotPool?.slotLevels ?? []) values.push({ id: slot.resourceId, name: slot.name });
      }
    }
  }
  return values;
}

export function draftResourceOptions(
  draft: SubclassForgeDraft,
  registry: ContentRegistry,
): readonly SubclassForgeOption[] {
  const values = [...parentResourceOptions(registry, draft.parentClassId)];
  for (const feature of draft.features) {
    for (const resource of feature.resources) values.push({ id: resource.definition.id, name: resource.definition.name || 'Unnamed subclass resource' });
    for (const provider of feature.providers) {
      for (const slot of provider.definition.slotPool?.slotLevels ?? []) values.push({ id: slot.resourceId, name: slot.name });
    }
  }
  return values.filter((option, index, all) => all.findIndex((candidate) => candidate.id === option.id) === index);
}

export function parentProviderOptions(
  registry: ContentRegistry,
  parentClassId: ContentId,
): readonly SubclassForgeOption[] {
  const parent = registry.findClass(parentClassId);
  if (!parent) return [];
  const values: SubclassForgeOption[] = [];
  for (const row of parent.progression) {
    for (const feature of row.features) {
      for (const provider of feature.spellcasting ?? []) values.push({ id: provider.id, name: provider.name });
    }
  }
  return values;
}

export function draftProviderOptions(
  draft: SubclassForgeDraft,
  registry: ContentRegistry,
): readonly SubclassForgeOption[] {
  const values = [...parentProviderOptions(registry, draft.parentClassId)];
  for (const feature of draft.features) {
    for (const provider of feature.providers) values.push({ id: provider.definition.id, name: provider.definition.name || 'Unnamed subclass provider' });
  }
  return values.filter((option, index, all) => all.findIndex((candidate) => candidate.id === option.id) === index);
}

function remapId(id: ContentId, maps: ReadonlyMap<ContentId, ContentId>): ContentId {
  return maps.get(id) ?? id;
}

function duplicateFeatureGraph(
  features: readonly SubclassForgeFeatureDraft[],
): readonly SubclassForgeFeatureDraft[] {
  const idMap = new Map<ContentId, ContentId>();

  for (const feature of features) {
    idMap.set(feature.id, allocateHomebrewContentId('subclass-feature'));
    for (const entry of feature.diceEffects) idMap.set(entry.effect.id, allocateHomebrewContentId('dice-transformation'));
    for (const entry of feature.resources) idMap.set(entry.definition.id, allocateHomebrewContentId('class-resource'));
    for (const entry of feature.consumers) idMap.set(entry.grant.consumer.id, allocateHomebrewContentId('subclass-resource-consumer'));
    for (const entry of feature.transactions) idMap.set(entry.definition.id, allocateHomebrewContentId('resource-transaction'));
    for (const entry of feature.activeEffects) idMap.set(entry.definition.id, allocateHomebrewContentId('active-self-effect'));
    for (const entry of feature.providers) {
      idMap.set(entry.definition.id, allocateHomebrewContentId('spellcasting-provider'));
      if (entry.definition.slotPool) {
        idMap.set(entry.definition.slotPool.id, allocateHomebrewContentId('spell-slot-pool'));
        for (const slot of entry.definition.slotPool.slotLevels) idMap.set(slot.resourceId, allocateHomebrewContentId('spell-slot'));
      }
    }
    for (const entry of feature.referenceEffects) idMap.set(entry.id, allocateHomebrewContentId('subclass-reference-effect'));
  }

  return features.map((feature) => ({
    ...feature,
    draftId: draftId(),
    id: remapId(feature.id, idMap),
    persisted: false,
    staticEffects: feature.staticEffects.map((entry) => ({ draftId: draftId(), effect: clone(entry.effect) })),
    diceEffects: feature.diceEffects.map((entry) => ({
      draftId: draftId(),
      effect: { ...clone(entry.effect), id: remapId(entry.effect.id, idMap) },
    })),
    resources: feature.resources.map((entry) => ({
      draftId: draftId(),
      persisted: false,
      definition: {
        ...clone(entry.definition),
        id: remapId(entry.definition.id, idMap),
        source: homebrewSource(),
      },
    })),
    consumers: feature.consumers.map((entry) => ({
      draftId: draftId(),
      persisted: false,
      grant: {
        ...clone(entry.grant),
        resourceId: remapId(entry.grant.resourceId, idMap),
        consumer: { ...clone(entry.grant.consumer), id: remapId(entry.grant.consumer.id, idMap) },
      },
    })),
    transactions: feature.transactions.map((entry) => {
      const definition = clone(entry.definition);
      const remapped: ResourceTransactionDefinition = definition.kind === 'restore-resource'
        ? {
            ...definition,
            id: remapId(definition.id, idMap),
            targetResourceId: remapId(definition.targetResourceId, idMap),
            ...(definition.usageResourceId ? { usageResourceId: remapId(definition.usageResourceId, idMap) } : {}),
          }
        : {
            ...definition,
            id: remapId(definition.id, idMap),
            providerId: remapId(definition.providerId, idMap),
            usageResourceId: remapId(definition.usageResourceId, idMap),
          };
      return { draftId: draftId(), persisted: false, definition: remapped };
    }),
    activeEffects: feature.activeEffects.map((entry) => {
      const definition = clone(entry.definition);
      return {
        draftId: draftId(),
        persisted: false,
        definition: {
          ...definition,
          id: remapId(definition.id, idMap),
          ...(definition.activationCost ? {
            activationCost: {
              ...definition.activationCost,
              resourceId: remapId(definition.activationCost.resourceId, idMap),
            },
          } : {}),
          ...(definition.modifiers ? {
            modifiers: definition.modifiers.map((modifier) => {
              if (modifier.type === 'spell-save-dc-bonus') return { ...modifier, providerIds: modifier.providerIds.map((id) => remapId(id, idMap)) };
              if (modifier.type === 'd20-roll-mode' && modifier.target.kind === 'spell-attack') {
                return { ...modifier, target: { ...modifier.target, providerIds: modifier.target.providerIds.map((id) => remapId(id, idMap)) } };
              }
              return modifier;
            }),
          } : {}),
        },
      };
    }),
    providers: feature.providers.map((entry) => {
      const definition = clone(entry.definition);
      return {
        draftId: draftId(),
        persisted: false,
        definition: {
          ...definition,
          id: remapId(definition.id, idMap),
          ...(definition.slotPool ? {
            slotPool: {
              ...definition.slotPool,
              id: remapId(definition.slotPool.id, idMap),
              slotLevels: definition.slotPool.slotLevels.map((slot) => ({
                ...slot,
                resourceId: remapId(slot.resourceId, idMap),
              })),
            },
          } : {}),
        },
      };
    }),
    spellGrants: feature.spellGrants.map((entry) => ({
      draftId: draftId(),
      persisted: false,
      grant: { ...clone(entry.grant), providerId: remapId(entry.grant.providerId, idMap) },
    })),
    referenceEffects: feature.referenceEffects.map((entry) => ({
      ...entry,
      draftId: draftId(),
      id: remapId(entry.id, idMap),
      persisted: false,
    })),
  }));
}

export function duplicateSubclassForgeDraft(subclass: SubclassContent): SubclassForgeDraftLoadResult {
  const loaded = loadSubclassForgeDraft(subclass);
  if (!loaded.ok) return loaded;
  return {
    ok: true,
    draft: {
      ...loaded.draft,
      id: allocateHomebrewContentId('subclass'),
      sourceNamespace: 'local',
      name: `${loaded.draft.name} Copy`,
      persisted: false,
      features: duplicateFeatureGraph(loaded.draft.features),
    },
  };
}

export function replaceProviderContribution(
  entry: SubclassForgeProviderDraft,
  contribution: SubclassForgeProviderContribution,
  ownerLevel: number,
): SubclassForgeProviderDraft {
  const current = entry.definition;
  const nextContribution = providerContribution(contribution);
  const slotPool = nextContribution.kind === 'spellcasting'
    ? createOrdinaryProviderSlotPool(ownerLevel, nextContribution)
    : createProviderSlotPool(ownerLevel, contribution === 'pact' ? 'short-rest' : 'long-rest');
  return {
    ...entry,
    definition: {
      ...current,
      multiclassSlotContribution: nextContribution,
      slotPool,
    },
  };
}

export function replaceProviderManagementKind(
  entry: SubclassForgeProviderDraft,
  kind: SpellcastingProviderDefinition['spellManagement']['kind'],
  spellListId: string,
): SubclassForgeProviderDraft {
  const level = entry.definition.slotPool?.progression[0]?.level ?? 1;
  let spellManagement: SpellcastingProviderDefinition['spellManagement'];
  if (kind === 'granted-only') {
    spellManagement = { kind: 'granted-only', spellIds: [] };
  } else if (kind === 'prepared-from-owned') {
    spellManagement = {
      kind,
      spellListId,
      cantripCount: [{ level, count: 2 }],
      preparedSpellCount: [{ level, count: 3 }],
      replacement: 'class-level-one',
      initialOwnedSpellCount: 6,
      initialOwnedSpellLevel: 1,
    };
  } else {
    spellManagement = {
      kind,
      spellListId,
      cantripCount: [{ level, count: 2 }],
      preparedSpellCount: [{ level, count: 3 }],
      replacement: 'long-rest-any',
    };
  }
  return { ...entry, definition: { ...entry.definition, spellManagement } };
}

export function validateSubclassForgeDraft(
  draft: SubclassForgeDraft,
  registry: ContentRegistry,
): readonly string[] {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push('Subclass name is required.');
  if (!draft.description.trim()) errors.push('Subclass description is required.');
  const parent = registry.findClass(draft.parentClassId);
  if (!parent) errors.push('Choose a valid parent Class.');
  if (!Number.isInteger(draft.acquisitionLevel) || draft.acquisitionLevel < 1 || draft.acquisitionLevel > 20) errors.push('Subclass acquisition level must be a whole number from 1 to 20.');
  if (draft.features.length === 0) errors.push('Add at least one Subclass feature.');
  if (!draft.features.some((feature) => feature.level === draft.acquisitionLevel)) errors.push('At least one feature must be gained at the Subclass acquisition level.');

  const resourceIds = new Set(draftResourceOptions(draft, registry).map((option) => option.id));
  const providerIds = new Set(draftProviderOptions(draft, registry).map((option) => option.id));
  const spellIds = new Set(registry.getAll('spell').map((spell) => spell.id));

  for (const feature of draft.features) {
    if (!feature.name.trim()) errors.push('Every Subclass feature requires a name.');
    if (!feature.description.trim()) errors.push('Every Subclass feature requires a description.');
    if (!Number.isInteger(feature.level) || feature.level < draft.acquisitionLevel || feature.level > 20) errors.push('Feature levels must be whole numbers from acquisition level through 20.');

    for (const resource of feature.resources) {
      if (!resource.definition.name.trim()) errors.push('Every Subclass resource requires a name.');
      if (resource.definition.maximum.kind === 'level-table' && resource.definition.maximum.values.length === 0) errors.push('Level-table resources require at least one capacity row.');
    }
    for (const consumer of feature.consumers) {
      if (!consumer.grant.consumer.name.trim()) errors.push('Every resource consumer requires a name.');
      if (!resourceIds.has(consumer.grant.resourceId)) errors.push('Resource consumers must select an existing owner resource.');
    }
    for (const transaction of feature.transactions) {
      if (!transaction.definition.name.trim()) errors.push('Every resource transaction requires a name.');
      if (transaction.definition.kind === 'restore-resource') {
        if (!resourceIds.has(transaction.definition.targetResourceId)) errors.push('Restore-resource transactions must select an existing target resource.');
        if (transaction.definition.usageResourceId && !resourceIds.has(transaction.definition.usageResourceId)) errors.push('Resource transactions must select an existing usage resource.');
      } else {
        if (!providerIds.has(transaction.definition.providerId)) errors.push('Spell-slot recovery transactions must select an existing owner provider.');
        if (!resourceIds.has(transaction.definition.usageResourceId)) errors.push('Spell-slot recovery transactions must select an existing usage resource.');
      }
    }
    for (const effect of feature.activeEffects) {
      if (!effect.definition.name.trim() || !effect.definition.description.trim()) errors.push('Every active self effect requires a name and description.');
      if (effect.definition.activationCost && !resourceIds.has(effect.definition.activationCost.resourceId)) errors.push('Active self-effect costs must select an existing owner resource.');
    }
    for (const provider of feature.providers) {
      if (!provider.definition.name.trim()) errors.push('Every Subclass Spellcasting provider requires a name.');
      if (provider.definition.spellManagement.kind !== 'granted-only' && !provider.definition.spellManagement.spellListId.trim()) errors.push('Prepared Spellcasting providers require a Spell-list selection.');
      if (provider.definition.spellManagement.kind === 'granted-only' && provider.definition.spellManagement.spellIds.length === 0) errors.push('Granted-only providers require at least one Spell.');
    }
    for (const grant of feature.spellGrants) {
      if (!providerIds.has(grant.grant.providerId)) errors.push('Granted Spells must select an existing owner Spellcasting provider.');
      if (grant.grant.spellIds.length === 0 || grant.grant.spellIds.some((spellId) => !spellIds.has(spellId))) errors.push('Granted Spells must reference existing effective-catalog Spells.');
      if (grant.grant.minimumLevel !== undefined && grant.grant.minimumLevel < feature.level) errors.push('Granted Spell minimum level cannot precede its feature level.');
    }
    for (const effect of feature.referenceEffects) {
      if (!effect.name.trim() || !effect.description.trim()) errors.push('Manual/reference effects require a name and description.');
    }
  }
  return [...new Set(errors)];
}

export function classDisplayName(registry: ContentRegistry, classId: ContentId): string {
  return registry.findClass(classId)?.name ?? classId;
}

export function providerSpellListId(definition: SpellcastingProviderDefinition): string {
  return definition.spellManagement.kind === 'granted-only' ? '' : definition.spellManagement.spellListId;
}

export function allParentClasses(registry: ContentRegistry): readonly ClassContent[] {
  return [...registry.getAll('class')].sort((left, right) => left.name.localeCompare(right.name));
}

export function abilityOptions(): readonly AbilityKey[] {
  return ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
}

export function leveledSpellLevels(): readonly LeveledSpellLevel[] {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9];
}
