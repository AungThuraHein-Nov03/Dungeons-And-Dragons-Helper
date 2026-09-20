import {
  ABILITY_KEYS,
  INVENTORY_CATEGORIES,
  SKILL_IDS,
  type AbilityKey,
  type InventoryCategory,
  type SkillId,
} from '../models/character';
import type {
  ActiveSelfEffectDefinition,
  ArmorCategory,
  ClassContent,
  ClassFeatureContent,
  ClassPrimaryAbility,
  ClassResourceDefinition,
  ClassToolProficiency,
  ContentSourceMetadata,
  DieSize,
  LeveledSpellLevel,
  MulticlassProficiencyGrants,
  MulticlassSkillProficiencyChoice,
  MulticlassSlotContribution,
  ResourceConsumerGrant,
  ResourceTransactionDefinition,
  SpellcastingProviderDefinition,
  SpellcastingProviderSpellGrant,
  StartingEquipmentItem,
  StartingEquipmentOption,
  WeaponProficiencyRule,
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

export interface ClassForgeReferenceEffectDraft {
  readonly draftId: string;
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly persisted: boolean;
}

export interface ClassForgeResourceDraft {
  readonly draftId: string;
  readonly definition: ClassResourceDefinition;
  readonly persisted: boolean;
}

export interface ClassForgeConsumerDraft {
  readonly draftId: string;
  readonly grant: ResourceConsumerGrant;
  readonly persisted: boolean;
}

export interface ClassForgeTransactionDraft {
  readonly draftId: string;
  readonly definition: ResourceTransactionDefinition;
  readonly persisted: boolean;
}

export interface ClassForgeActiveEffectDraft {
  readonly draftId: string;
  readonly definition: ActiveSelfEffectDefinition;
  readonly persisted: boolean;
}

export interface ClassForgeProviderDraft {
  readonly draftId: string;
  readonly definition: SpellcastingProviderDefinition;
  readonly persisted: boolean;
}

export interface ClassForgeSpellGrantDraft {
  readonly draftId: string;
  readonly grant: SpellcastingProviderSpellGrant;
  readonly persisted: boolean;
}

export interface ClassForgeFeatureDraft {
  readonly draftId: string;
  readonly id: ContentId;
  readonly level: number;
  readonly name: string;
  readonly description: string;
  readonly persisted: boolean;
  readonly staticEffects: readonly FeatForgeStaticEffectDraft[];
  readonly diceEffects: readonly FeatForgeDiceEffectDraft[];
  readonly resources: readonly ClassForgeResourceDraft[];
  readonly consumers: readonly ClassForgeConsumerDraft[];
  readonly transactions: readonly ClassForgeTransactionDraft[];
  readonly activeEffects: readonly ClassForgeActiveEffectDraft[];
  readonly providers: readonly ClassForgeProviderDraft[];
  readonly spellGrants: readonly ClassForgeSpellGrantDraft[];
  readonly referenceEffects: readonly ClassForgeReferenceEffectDraft[];
}

export interface ClassForgeEquipmentItemDraft {
  readonly draftId: string;
  readonly item: StartingEquipmentItem;
}

export interface ClassForgeEquipmentOptionDraft {
  readonly draftId: string;
  readonly id: string;
  readonly persisted: boolean;
  readonly items: readonly ClassForgeEquipmentItemDraft[];
  readonly currency?: StartingEquipmentOption['currency'];
}

export interface ClassForgeMasteryCapacityDraft {
  readonly level: number;
  readonly choices: number;
}

export interface ClassForgeDraft {
  readonly id: ContentId;
  readonly sourceNamespace: string;
  readonly name: string;
  readonly persisted: boolean;
  readonly hitDie: DieSize;
  readonly fixedHitPointsPerLevel: number;
  readonly primaryAbility: ClassPrimaryAbility;
  readonly multiclassProficiencies: MulticlassProficiencyGrants;
  readonly savingThrowProficiencies: readonly AbilityKey[];
  readonly weaponProficiencies: readonly WeaponProficiencyRule[];
  readonly armorTraining: readonly ArmorCategory[];
  readonly toolProficiencies: readonly ClassToolProficiency[];
  readonly skillChoices: {
    readonly choose: number;
    readonly from: readonly SkillId[];
  };
  readonly startingEquipment: readonly ClassForgeEquipmentOptionDraft[];
  readonly classResources: readonly ClassForgeResourceDraft[];
  readonly masteryCapacity: readonly ClassForgeMasteryCapacityDraft[];
  readonly features: readonly ClassForgeFeatureDraft[];
}

export type ClassForgeDraftLoadResult =
  | { readonly ok: true; readonly draft: ClassForgeDraft }
  | { readonly ok: false; readonly message: string };

export interface ClassForgeOption {
  readonly id: ContentId;
  readonly name: string;
}

export interface ClassForgeEquipmentCatalogOption {
  readonly id: ContentId;
  readonly name: string;
  readonly category: Extract<InventoryCategory, 'weapon' | 'armor' | 'shield'>;
}

export const CLASS_FORGE_HIT_DICE = [4, 6, 8, 10, 12] as const satisfies readonly DieSize[];
export const CLASS_FORGE_ARMOR_CATEGORIES = ['light', 'medium', 'heavy', 'shield'] as const satisfies readonly ArmorCategory[];
export const CLASS_FORGE_WEAPON_CATEGORIES = ['simple', 'martial'] as const;

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

export function standardClassProficiencyBonus(level: number): number {
  return 2 + Math.floor((level - 1) / 4);
}

function defaultStartingEquipment(): ClassForgeEquipmentOptionDraft[] {
  return [{
    draftId: draftId(),
    id: allocateHomebrewContentId('starting-equipment-option'),
    persisted: false,
    items: [],
    currency: { amount: 0, unit: 'gp' },
  }];
}

export function createClassForgeDraft(): ClassForgeDraft {
  return {
    id: allocateHomebrewContentId('class'),
    sourceNamespace: 'local',
    name: '',
    persisted: false,
    hitDie: 8,
    fixedHitPointsPerLevel: 5,
    primaryAbility: { mode: 'one-of', abilities: ['strength'] },
    multiclassProficiencies: {
      weaponProficiencies: [],
      armorTraining: [],
      toolProficiencies: [],
    },
    savingThrowProficiencies: ['strength', 'constitution'],
    weaponProficiencies: [{ kind: 'category', category: 'simple' }],
    armorTraining: [],
    toolProficiencies: [],
    skillChoices: { choose: 2, from: ['athletics', 'perception'] },
    startingEquipment: defaultStartingEquipment(),
    classResources: [],
    masteryCapacity: Array.from({ length: 20 }, (_, index) => ({ level: index + 1, choices: 0 })),
    features: [],
  };
}

function staticEffectDraft(effect: Exclude<ClassFeatureContent['effects'][number], { readonly type: 'dice-transformation' }>): FeatForgeStaticEffectDraft {
  return { draftId: draftId(), effect: clone(effect) };
}

function diceEffectDraft(effect: Extract<ClassFeatureContent['effects'][number], { readonly type: 'dice-transformation' }>): FeatForgeDiceEffectDraft {
  return { draftId: draftId(), effect: clone(effect) };
}

function loadFeature(level: number, feature: ClassFeatureContent): ClassForgeFeatureDraft {
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

function loadEquipmentOption(option: StartingEquipmentOption): ClassForgeEquipmentOptionDraft {
  return {
    draftId: draftId(),
    id: option.id,
    persisted: true,
    items: option.items.map((item) => ({ draftId: draftId(), item: clone(item) })),
    ...(option.currency ? { currency: clone(option.currency) } : {}),
  };
}

export function loadClassForgeDraft(classContent: ClassContent): ClassForgeDraftLoadResult {
  if (classContent.source.type !== 'homebrew') {
    return { ok: false, message: 'Bundled SRD Classes are read-only and cannot be edited in Creator Forge.' };
  }
  return {
    ok: true,
    draft: {
      id: classContent.id,
      sourceNamespace: classContent.source.namespace,
      name: classContent.name,
      persisted: true,
      hitDie: classContent.hitDie,
      fixedHitPointsPerLevel: classContent.fixedHitPointsPerLevel,
      primaryAbility: clone(classContent.primaryAbility),
      multiclassProficiencies: clone(classContent.multiclassProficiencies),
      savingThrowProficiencies: [...classContent.savingThrowProficiencies],
      weaponProficiencies: clone(classContent.weaponProficiencies),
      armorTraining: [...classContent.armorTraining],
      toolProficiencies: clone(classContent.toolProficiencies),
      skillChoices: clone(classContent.skillChoices),
      startingEquipment: classContent.startingEquipment.map(loadEquipmentOption),
      classResources: classContent.resources.map((definition) => ({ draftId: draftId(), definition: clone(definition), persisted: true })),
      masteryCapacity: classContent.progression.map((row) => ({ level: row.level, choices: row.weaponMasteryChoices ?? 0 })),
      features: classContent.progression.flatMap((row) => row.features.map((feature) => loadFeature(row.level, feature))),
    },
  };
}

export function createClassFeatureDraft(level: number): ClassForgeFeatureDraft {
  return {
    draftId: draftId(),
    id: allocateHomebrewContentId('class-feature'),
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

export function createClassSubclassMarkerFeatureDraft(level: number, className = ''): ClassForgeFeatureDraft {
  const feature = createClassFeatureDraft(level);
  return {
    ...feature,
    name: className.trim() ? `${className.trim()} Subclass` : 'Subclass',
    description: 'You gain a subclass for this Class at this level.',
    referenceEffects: [{
      draftId: draftId(),
      id: allocateHomebrewContentId('class-reference-effect'),
      name: 'Subclass Acquisition',
      description: 'Actual subclass availability is resolved from matching SubclassContent parent/acquisition metadata in the effective catalog.',
      persisted: false,
    }],
  };
}

export function createClassFeatAcquisitionFeatureDraft(
  level: number,
  kind: 'ability-score-improvement' | 'epic-boon',
): ClassForgeFeatureDraft {
  const feature = createClassFeatureDraft(level);
  const epic = kind === 'epic-boon';
  return {
    ...feature,
    name: epic ? 'Epic Boon' : 'Ability Score Improvement',
    description: epic
      ? 'You gain an Epic Boon feat or another feat for which you qualify.'
      : 'You gain the Ability Score Improvement feat or another feat for which you qualify.',
    referenceEffects: [{
      draftId: draftId(),
      id: 'feat-acquisition',
      name: epic ? 'Epic Boon Choice' : 'Feat Acquisition',
      description: 'Uses the exact existing M15 feat-acquisition convention; generic feat-grant semantics are not added by Class Forge.',
      persisted: false,
    }],
  };
}

export function createClassToolProficiency(name = ''): ClassToolProficiency {
  return { id: allocateHomebrewContentId('class-tool-proficiency'), name };
}

export function createClassEquipmentOptionDraft(): ClassForgeEquipmentOptionDraft {
  return {
    draftId: draftId(),
    id: allocateHomebrewContentId('starting-equipment-option'),
    persisted: false,
    items: [],
    currency: { amount: 0, unit: 'gp' },
  };
}

export function createClassEquipmentItemDraft(): ClassForgeEquipmentItemDraft {
  return {
    draftId: draftId(),
    item: { label: '', quantity: 1, inventoryCategory: 'adventuring-gear' },
  };
}

export function createMulticlassSkillChoice(
  kind: MulticlassSkillProficiencyChoice['kind'],
  classSkills: readonly SkillId[],
): MulticlassSkillProficiencyChoice {
  if (kind === 'any-skill') return { kind, choose: 1 };
  if (kind === 'class-skill-list') return { kind, choose: 1 };
  return { kind, choose: 1, from: classSkills.slice(0, Math.max(1, Math.min(2, classSkills.length))) };
}

export function createClassResourceDraft(level: number): ClassForgeResourceDraft {
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

export function createClassConsumerDraft(resourceId: ContentId): ClassForgeConsumerDraft {
  return {
    draftId: draftId(),
    persisted: false,
    grant: {
      resourceId,
      consumer: {
        id: allocateHomebrewContentId('class-resource-consumer'),
        name: '',
        effect: { type: 'expend-only' },
      },
    },
  };
}

export function createClassTransactionDraft(resourceId: ContentId): ClassForgeTransactionDraft {
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

export function createClassActiveEffectDraft(resourceId?: ContentId): ClassForgeActiveEffectDraft {
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

export type ClassForgeProviderContribution =
  | 'full'
  | 'half-up'
  | 'third-down'
  | 'pact'
  | 'independent';

export function providerContributionKey(value: MulticlassSlotContribution): ClassForgeProviderContribution {
  if (value.kind === 'pact-magic') return 'pact';
  if (value.kind === 'independent') return 'independent';
  if (value.contribution === 'full') return 'full';
  if (value.contribution === 'half') return 'half-up';
  return 'third-down';
}

export function providerContribution(value: ClassForgeProviderContribution): MulticlassSlotContribution {
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
    name: `Level ${spellLevel} Class Spell Slots`,
  }));
  return {
    id: allocateHomebrewContentId('spell-slot-pool'),
    name: 'Class Spell Slots',
    slotLevels,
    progression,
    recovery: [{ trigger: 'long-rest', mode: 'all' }],
  };
}

export function createClassProviderDraft(
  level: number,
  spellListId: string,
): ClassForgeProviderDraft {
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
    name: 'Class Spell Slots',
    slotLevels: [{ spellLevel: 1, resourceId, name: 'Level 1 Class Slots' }],
    progression: [{ level, slots: [{ spellLevel: 1, maximum: 1 }] }],
    recovery: [{ trigger: recovery, mode: 'all' }],
  };
}

export function createClassSpellGrantDraft(
  providerId: ContentId,
  spellId: ContentId,
  minimumLevel: number,
): ClassForgeSpellGrantDraft {
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

export function createClassReferenceEffectDraft(): ClassForgeReferenceEffectDraft {
  return {
    draftId: draftId(),
    id: allocateHomebrewContentId('class-reference-effect'),
    name: '',
    description: '',
    persisted: false,
  };
}

export function addFeatureStaticEffect(
  feature: ClassForgeFeatureDraft,
  type: FeatForgeStaticEffectType,
): ClassForgeFeatureDraft {
  return { ...feature, staticEffects: [...feature.staticEffects, createStaticEffectDraft(type)] };
}

export function addFeatureDiceEffect(
  feature: ClassForgeFeatureDraft,
  type: FeatForgeDiceTransformationType,
): ClassForgeFeatureDraft {
  return { ...feature, diceEffects: [...feature.diceEffects, createDiceEffectDraft(type)] };
}

function buildFeatureContent(feature: ClassForgeFeatureDraft): ClassFeatureContent {
  return {
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
  };
}

export function buildClassContentFromDraft(draft: ClassForgeDraft): ClassContent {
  return {
    id: draft.id,
    kind: 'class',
    name: draft.name.trim(),
    source: homebrewSource(draft.sourceNamespace),
    hitDie: draft.hitDie,
    fixedHitPointsPerLevel: draft.fixedHitPointsPerLevel,
    primaryAbility: clone(draft.primaryAbility),
    multiclassProficiencies: clone(draft.multiclassProficiencies),
    savingThrowProficiencies: [...draft.savingThrowProficiencies],
    weaponProficiencies: clone(draft.weaponProficiencies),
    armorTraining: [...draft.armorTraining],
    toolProficiencies: clone(draft.toolProficiencies),
    skillChoices: clone(draft.skillChoices),
    startingEquipment: draft.startingEquipment.map((option) => ({
      id: option.id,
      items: option.items.map((entry) => clone(entry.item)),
      ...(option.currency ? { currency: clone(option.currency) } : {}),
    })),
    progression: Array.from({ length: 20 }, (_, index) => {
      const level = index + 1;
      const mastery = draft.masteryCapacity.find((entry) => entry.level === level)?.choices ?? 0;
      return {
        level,
        proficiencyBonus: standardClassProficiencyBonus(level),
        features: draft.features.filter((feature) => feature.level === level).map(buildFeatureContent),
        ...(mastery > 0 ? { weaponMasteryChoices: mastery } : {}),
      };
    }),
    resources: draft.classResources.map((entry) => clone(entry.definition)),
  };
}

export function draftResourceOptions(
  draft: ClassForgeDraft,
): readonly ClassForgeOption[] {
  const values: ClassForgeOption[] = draft.classResources.map((resource) => ({
    id: resource.definition.id,
    name: resource.definition.name || 'Unnamed class resource',
  }));
  for (const feature of draft.features) {
    for (const resource of feature.resources) values.push({ id: resource.definition.id, name: resource.definition.name || 'Unnamed class resource' });
    for (const provider of feature.providers) {
      for (const slot of provider.definition.slotPool?.slotLevels ?? []) values.push({ id: slot.resourceId, name: slot.name });
    }
  }
  return values.filter((option, index, all) => all.findIndex((candidate) => candidate.id === option.id) === index);
}

export function draftProviderOptions(
  draft: ClassForgeDraft,
): readonly ClassForgeOption[] {
  const values: ClassForgeOption[] = [];
  for (const feature of draft.features) {
    for (const provider of feature.providers) values.push({ id: provider.definition.id, name: provider.definition.name || 'Unnamed class provider' });
  }
  return values.filter((option, index, all) => all.findIndex((candidate) => candidate.id === option.id) === index);
}

function remapId(id: ContentId, maps: ReadonlyMap<ContentId, ContentId>): ContentId {
  return maps.get(id) ?? id;
}

function allocateFeatureGraphIds(
  features: readonly ClassForgeFeatureDraft[],
  idMap: Map<ContentId, ContentId>,
): void {
  for (const feature of features) {
    idMap.set(feature.id, allocateHomebrewContentId('class-feature'));
    for (const entry of feature.diceEffects) idMap.set(entry.effect.id, allocateHomebrewContentId('dice-transformation'));
    for (const entry of feature.resources) idMap.set(entry.definition.id, allocateHomebrewContentId('class-resource'));
    for (const entry of feature.consumers) idMap.set(entry.grant.consumer.id, allocateHomebrewContentId('class-resource-consumer'));
    for (const entry of feature.transactions) idMap.set(entry.definition.id, allocateHomebrewContentId('resource-transaction'));
    for (const entry of feature.activeEffects) idMap.set(entry.definition.id, allocateHomebrewContentId('active-self-effect'));
    for (const entry of feature.providers) {
      idMap.set(entry.definition.id, allocateHomebrewContentId('spellcasting-provider'));
      if (entry.definition.slotPool) {
        idMap.set(entry.definition.slotPool.id, allocateHomebrewContentId('spell-slot-pool'));
        for (const slot of entry.definition.slotPool.slotLevels) idMap.set(slot.resourceId, allocateHomebrewContentId('spell-slot'));
      }
    }
    for (const entry of feature.referenceEffects) {
      if (entry.id !== 'feat-acquisition') idMap.set(entry.id, allocateHomebrewContentId('class-reference-effect'));
    }
  }
}

function duplicateFeatureGraph(
  features: readonly ClassForgeFeatureDraft[],
  idMap: ReadonlyMap<ContentId, ContentId>,
): readonly ClassForgeFeatureDraft[] {
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
      id: entry.id === 'feat-acquisition' ? entry.id : remapId(entry.id, idMap),
      persisted: false,
    })),
  }));
}

function duplicateMulticlassProficiencies(
  value: MulticlassProficiencyGrants,
): MulticlassProficiencyGrants {
  return {
    weaponProficiencies: clone(value.weaponProficiencies),
    armorTraining: [...value.armorTraining],
    ...(value.skillChoices ? { skillChoices: clone(value.skillChoices) } : {}),
    toolProficiencies: value.toolProficiencies.map((tool) => ({
      ...clone(tool),
      id: allocateHomebrewContentId('class-tool-proficiency'),
    })),
    ...(value.toolChoices ? {
      toolChoices: value.toolChoices.map((choice) => choice.kind === 'category'
        ? { ...clone(choice), id: allocateHomebrewContentId('multiclass-tool-choice') }
        : {
            ...clone(choice),
            id: allocateHomebrewContentId('multiclass-tool-choice'),
            options: choice.options.map((tool) => ({
              ...clone(tool),
              id: allocateHomebrewContentId('class-tool-proficiency'),
            })),
          }),
    } : {}),
  };
}

export function duplicateClassForgeDraft(classContent: ClassContent): ClassForgeDraftLoadResult {
  const loaded = loadClassForgeDraft(classContent);
  if (!loaded.ok) return loaded;

  const idMap = new Map<ContentId, ContentId>();
  for (const resource of loaded.draft.classResources) idMap.set(resource.definition.id, allocateHomebrewContentId('class-resource'));
  allocateFeatureGraphIds(loaded.draft.features, idMap);

  return {
    ok: true,
    draft: {
      ...loaded.draft,
      id: allocateHomebrewContentId('class'),
      sourceNamespace: 'local',
      name: `${loaded.draft.name} Copy`,
      persisted: false,
      toolProficiencies: loaded.draft.toolProficiencies.map((tool) => ({
        ...clone(tool),
        id: allocateHomebrewContentId('class-tool-proficiency'),
      })),
      multiclassProficiencies: duplicateMulticlassProficiencies(loaded.draft.multiclassProficiencies),
      startingEquipment: loaded.draft.startingEquipment.map((option) => ({
        ...option,
        draftId: draftId(),
        id: allocateHomebrewContentId('starting-equipment-option'),
        persisted: false,
        items: option.items.map((entry) => ({ draftId: draftId(), item: clone(entry.item) })),
        ...(option.currency ? { currency: clone(option.currency) } : {}),
      })),
      classResources: loaded.draft.classResources.map((entry) => ({
        draftId: draftId(),
        persisted: false,
        definition: {
          ...clone(entry.definition),
          id: remapId(entry.definition.id, idMap),
          source: homebrewSource(),
        },
      })),
      features: duplicateFeatureGraph(loaded.draft.features, idMap),
    },
  };
}

export function replaceProviderContribution(
  entry: ClassForgeProviderDraft,
  contribution: ClassForgeProviderContribution,
  ownerLevel: number,
): ClassForgeProviderDraft {
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
  entry: ClassForgeProviderDraft,
  kind: SpellcastingProviderDefinition['spellManagement']['kind'],
  spellListId: string,
): ClassForgeProviderDraft {
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

function validateResourceDraft(
  resource: ClassForgeResourceDraft,
  errors: string[],
): void {
  if (!resource.definition.name.trim()) errors.push('Every Class resource requires a name.');
  if (resource.definition.maximum.kind === 'level-table') {
    const values = resource.definition.maximum.values;
    if (
      values.length === 0
      || values.some((row, index) => !Number.isInteger(row.level) || row.level < 1 || row.level > 20 || !Number.isInteger(row.uses) || row.uses < 0 || (index > 0 && row.level <= values[index - 1].level))
    ) errors.push('Level-table resources require ordered owner-level rows from 1 to 20 with non-negative whole-number uses.');
  }
}

export function validateClassForgeDraft(
  draft: ClassForgeDraft,
  registry: ContentRegistry,
): readonly string[] {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push('Class name is required.');
  if (!CLASS_FORGE_HIT_DICE.includes(draft.hitDie)) errors.push('Choose a supported Class Hit Die.');
  if (!Number.isInteger(draft.fixedHitPointsPerLevel) || draft.fixedHitPointsPerLevel < 1 || draft.fixedHitPointsPerLevel > draft.hitDie) errors.push('Fixed Hit Points per level must be a whole number from 1 through the Hit Die maximum.');

  if (
    !['one-of', 'all-of'].includes(draft.primaryAbility.mode)
    || draft.primaryAbility.abilities.length === 0
    || new Set(draft.primaryAbility.abilities).size !== draft.primaryAbility.abilities.length
    || draft.primaryAbility.abilities.some((ability) => !ABILITY_KEYS.includes(ability))
  ) errors.push('Primary Ability must use one or more unique standard abilities.');

  if (
    draft.savingThrowProficiencies.length !== 2
    || new Set(draft.savingThrowProficiencies).size !== 2
    || draft.savingThrowProficiencies.some((ability) => !ABILITY_KEYS.includes(ability))
  ) errors.push('Choose exactly two unique starting saving-throw proficiencies.');

  if (
    !Number.isInteger(draft.skillChoices.choose)
    || draft.skillChoices.choose < 0
    || draft.skillChoices.choose > draft.skillChoices.from.length
    || new Set(draft.skillChoices.from).size !== draft.skillChoices.from.length
    || draft.skillChoices.from.some((skill) => !SKILL_IDS.includes(skill))
  ) errors.push('Starting skill choices require unique standard skills and a valid number chosen.');

  if (new Set(draft.armorTraining).size !== draft.armorTraining.length || draft.armorTraining.some((category) => !CLASS_FORGE_ARMOR_CATEGORIES.includes(category))) errors.push('Starting armor training must use unique supported categories.');
  if (new Set(draft.multiclassProficiencies.armorTraining).size !== draft.multiclassProficiencies.armorTraining.length || draft.multiclassProficiencies.armorTraining.some((category) => !CLASS_FORGE_ARMOR_CATEGORIES.includes(category))) errors.push('Multiclass armor training must use unique supported categories.');
  if (new Set(draft.toolProficiencies.map((tool) => tool.id)).size !== draft.toolProficiencies.length || draft.toolProficiencies.some((tool) => !tool.id.trim() || !tool.name.trim())) errors.push('Starting fixed tool proficiencies require stable unique IDs and names.');
  if (new Set(draft.multiclassProficiencies.toolProficiencies.map((tool) => tool.id)).size !== draft.multiclassProficiencies.toolProficiencies.length || draft.multiclassProficiencies.toolProficiencies.some((tool) => !tool.id.trim() || !tool.name.trim())) errors.push('Multiclass fixed tool proficiencies require stable unique IDs and names.');

  const multiclassSkills = draft.multiclassProficiencies.skillChoices;
  if (multiclassSkills) {
    const allowed = multiclassSkills.kind === 'any-skill'
      ? SKILL_IDS
      : multiclassSkills.kind === 'class-skill-list'
        ? draft.skillChoices.from
        : multiclassSkills.from;
    if (!Number.isInteger(multiclassSkills.choose) || multiclassSkills.choose < 1 || multiclassSkills.choose > allowed.length || (multiclassSkills.kind === 'options' && (new Set(multiclassSkills.from).size !== multiclassSkills.from.length || multiclassSkills.from.some((skill) => !SKILL_IDS.includes(skill))))) {
      errors.push('Multiclass skill choices must use the existing bounded skill-choice contract.');
    }
  }

  if (draft.startingEquipment.length === 0) errors.push('Add at least one starting-equipment package.');
  if (new Set(draft.startingEquipment.map((option) => option.id)).size !== draft.startingEquipment.length) errors.push('Starting-equipment package IDs must be unique.');
  for (const option of draft.startingEquipment) {
    if (!option.id.trim()) errors.push('Starting-equipment packages require stable IDs.');
    for (const entry of option.items) {
      if (!entry.item.label.trim()) errors.push('Every starting-equipment item requires a label.');
      if (entry.item.quantity !== undefined && (!Number.isInteger(entry.item.quantity) || entry.item.quantity < 1)) errors.push('Starting-equipment quantities must be positive whole numbers.');
      if (entry.item.contentId && !registry.getById(entry.item.contentId)) errors.push('Starting-equipment catalog references must resolve in the effective catalog.');
      if (entry.item.inventoryCategory && !INVENTORY_CATEGORIES.includes(entry.item.inventoryCategory)) errors.push('Starting-equipment manual items must use a supported Inventory category.');
    }
    if (option.currency && (!Number.isFinite(option.currency.amount) || option.currency.amount < 0 || !['cp', 'sp', 'gp'].includes(option.currency.unit))) errors.push('Starting-equipment currency must use a non-negative amount and CP/SP/GP.');
  }

  if (
    draft.masteryCapacity.length !== 20
    || draft.masteryCapacity.some((row, index) => row.level !== index + 1 || !Number.isInteger(row.choices) || row.choices < 0)
  ) errors.push('Weapon Mastery capacity must contain Class levels 1 through 20 with non-negative whole-number capacity.');

  draft.classResources.forEach((resource) => validateResourceDraft(resource, errors));
  if (draft.features.length === 0) errors.push('Add at least one Class feature.');

  const resourceIds = new Set(draftResourceOptions(draft).map((option) => option.id));
  const providerIds = new Set(draftProviderOptions(draft).map((option) => option.id));
  const spellIds = new Set(registry.getAll('spell').map((spell) => spell.id));

  for (const feature of draft.features) {
    if (!feature.name.trim()) errors.push('Every Class feature requires a name.');
    if (!feature.description.trim()) errors.push('Every Class feature requires a description.');
    if (!Number.isInteger(feature.level) || feature.level < 1 || feature.level > 20) errors.push('Feature levels must be whole numbers from 1 through 20.');

    const featMarker = feature.referenceEffects.some((effect) => effect.id === 'feat-acquisition');
    const supportedFeatName = feature.name === 'Ability Score Improvement' || feature.name === 'Epic Boon';
    if (featMarker !== supportedFeatName) errors.push('Feat acquisition must use the exact supported Ability Score Improvement or Epic Boon template; other feat behavior belongs in Manual / Reference.');

    for (const resource of feature.resources) validateResourceDraft(resource, errors);
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
      if (!provider.definition.name.trim()) errors.push('Every Class Spellcasting provider requires a name.');
      if (provider.definition.spellManagement.kind !== 'granted-only' && !provider.definition.spellManagement.spellListId.trim()) errors.push('Prepared Spellcasting providers require a Spell-list selection.');
      if (provider.definition.spellManagement.kind === 'granted-only' && (provider.definition.spellManagement.spellIds.length === 0 || provider.definition.spellManagement.spellIds.some((spellId) => !spellIds.has(spellId)))) errors.push('Granted-only providers require existing effective-catalog Spells.');
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

export function providerSpellListId(definition: SpellcastingProviderDefinition): string {
  return definition.spellManagement.kind === 'granted-only' ? '' : definition.spellManagement.spellListId;
}

export function equipmentCatalogOptions(registry: ContentRegistry): readonly ClassForgeEquipmentCatalogOption[] {
  return [
    ...registry.getAll('weapon').map((entry) => ({ id: entry.id, name: entry.name, category: 'weapon' as const })),
    ...registry.getAll('armor').map((entry) => ({ id: entry.id, name: entry.name, category: entry.category === 'shield' ? 'shield' as const : 'armor' as const })),
  ].sort((left, right) => left.name.localeCompare(right.name));
}

export function abilityOptions(): readonly AbilityKey[] {
  return ABILITY_KEYS;
}

export function skillOptions(): readonly SkillId[] {
  return SKILL_IDS;
}

export function inventoryCategoryOptions(): readonly InventoryCategory[] {
  return INVENTORY_CATEGORIES;
}

export function leveledSpellLevels(): readonly LeveledSpellLevel[] {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9];
}
