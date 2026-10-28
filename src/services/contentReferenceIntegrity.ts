import { SRD_CONTENT } from '../content/srd';
import type { Character } from '../models/character';
import type {
  ClassContent,
  ClassFeatureContent,
  ContentEntry,
  SubclassContent,
  SubclassFeatureContent,
} from '../models/content';
import { CHARACTER_STORAGE_KEY, isCharacter } from './characterStorage';
import { createContentRegistry, type ContentRegistry } from './contentRegistry';

export type ReferenceSourceType = 'character' | 'content' | 'integrity';
export type ReferenceScope = 'top-level' | 'nested';

export type ReferenceKind =
  | 'character-starting-class'
  | 'character-class-progression'
  | 'character-subclass'
  | 'character-feat'
  | 'character-feat-choice'
  | 'character-spellcasting-provider'
  | 'character-cantrip'
  | 'character-owned-spell'
  | 'character-prepared-spell'
  | 'character-resource-state'
  | 'character-inventory-content'
  | 'character-weapon-mastery-selection'
  | 'subclass-parent-class'
  | 'background-origin-feat'
  | 'starting-equipment-content'
  | 'weapon-mastery'
  | 'provider-granted-spell'
  | 'spell-grant-provider'
  | 'spell-grant-spell'
  | 'resource-consumer-resource'
  | 'resource-transaction-resource'
  | 'resource-transaction-provider'
  | 'active-effect-resource'
  | 'active-effect-provider'
  | 'feat-effect-choice'
  | 'prospective-character-invalid'
  | 'canonical-dataset-invalid'
  | 'analysis-unavailable'
  | 'protected-content';

export interface ReferenceUsage {
  readonly targetId: string;
  readonly scope: ReferenceScope;
  readonly sourceType: Exclude<ReferenceSourceType, 'integrity'>;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceFamily?: ContentEntry['kind'];
  readonly ownerContentId?: string;
  readonly referenceKind: ReferenceKind;
  readonly path: string;
  readonly context: string;
}

export interface ReferenceBlocker {
  readonly sourceType: ReferenceSourceType;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceFamily?: ContentEntry['kind'];
  readonly referenceKind: ReferenceKind;
  readonly targetId: string;
  readonly path: string;
  readonly context: string;
  readonly message: string;
}

export interface NestedIdentity {
  readonly ownerContentId: string;
  readonly id: string;
  readonly kind:
    | 'feature'
    | 'resource'
    | 'resource-consumer'
    | 'resource-transaction'
    | 'active-self-effect'
    | 'spellcasting-provider'
    | 'spell-slot-pool'
    | 'spell-slot'
    | 'dice-transformation'
    | 'reference-effect'
    | 'feat-choice'
    | 'starting-equipment-option'
    | 'tool-proficiency'
    | 'multiclass-tool-choice';
  readonly name: string;
  readonly path: string;
}

export type ReferentialIntegrityPreflight =
  | {
      readonly ok: true;
      readonly prospectiveCustomEntries: readonly ContentEntry[];
      readonly registry: ContentRegistry;
      readonly removedNestedIdentities: readonly NestedIdentity[];
    }
  | {
      readonly ok: false;
      readonly blockers: readonly ReferenceBlocker[];
      readonly prospectiveCustomEntries?: readonly ContentEntry[];
      readonly removedNestedIdentities?: readonly NestedIdentity[];
    };

export type PersistedCharacterPopulationResult =
  | { readonly ok: true; readonly characters: readonly Character[] }
  | { readonly ok: false; readonly blocker: ReferenceBlocker };

const DESTRUCTIBLE_KINDS = new Set<ContentEntry['kind']>([
  'feat',
  'spell',
  'subclass',
  'class',
  'weapon',
  'armor',
  'equipment',
]);

function titleFamily(kind: ContentEntry['kind']): string {
  return kind === 'subclass' ? 'Subclass'
    : kind === 'class' ? 'Class'
    : kind === 'spell' ? 'Spell'
    : kind === 'feat' ? 'Feat'
    : kind[0].toUpperCase() + kind.slice(1);
}

function contentUsage(
  source: ContentEntry,
  targetId: string,
  referenceKind: ReferenceKind,
  path: string,
  context: string,
  scope: ReferenceScope = 'top-level',
): ReferenceUsage {
  return {
    targetId,
    scope,
    sourceType: 'content',
    sourceId: source.id,
    sourceName: source.name,
    sourceFamily: source.kind,
    ownerContentId: source.id,
    referenceKind,
    path,
    context,
  };
}

function characterUsage(
  character: Character,
  targetId: string,
  referenceKind: ReferenceKind,
  path: string,
  context: string,
  scope: ReferenceScope = 'top-level',
  ownerContentId?: string,
): ReferenceUsage {
  return {
    targetId,
    scope,
    sourceType: 'character',
    sourceId: character.id,
    sourceName: character.name,
    ...(ownerContentId ? { ownerContentId } : {}),
    referenceKind,
    path,
    context,
  };
}

function featureReferences(
  entry: ClassContent | SubclassContent,
  feature: ClassFeatureContent | SubclassFeatureContent,
  featurePath: string,
): ReferenceUsage[] {
  const references: ReferenceUsage[] = [];

  for (const provider of feature.spellcasting ?? []) {
    if (provider.spellManagement.kind === 'granted-only') {
      provider.spellManagement.spellIds.forEach((spellId, index) => references.push(contentUsage(
        entry,
        spellId,
        'provider-granted-spell',
        `${featurePath}.spellcasting[${provider.id}].spellManagement.spellIds[${index}]`,
        `${titleFamily(entry.kind)} "${entry.name}" → ${feature.name} → ${provider.name} granted Spell`,
      )));
    }
  }

  for (const grant of feature.spellGrants ?? []) {
    references.push(contentUsage(
      entry,
      grant.providerId,
      'spell-grant-provider',
      `${featurePath}.spellGrants.providerId`,
      `${titleFamily(entry.kind)} "${entry.name}" → ${feature.name} → Spell grant provider`,
      'nested',
    ));
    grant.spellIds.forEach((spellId, index) => references.push(contentUsage(
      entry,
      spellId,
      'spell-grant-spell',
      `${featurePath}.spellGrants.spellIds[${index}]`,
      `${titleFamily(entry.kind)} "${entry.name}" → ${feature.name} → granted Spell`,
    )));
  }

  for (const grant of feature.resourceConsumers ?? []) {
    references.push(contentUsage(
      entry,
      grant.resourceId,
      'resource-consumer-resource',
      `${featurePath}.resourceConsumers[${grant.consumer.id}].resourceId`,
      `${titleFamily(entry.kind)} "${entry.name}" → ${feature.name} → ${grant.consumer.name} resource`,
      'nested',
    ));
  }

  for (const transaction of feature.resourceTransactions ?? []) {
    if (transaction.kind === 'restore-resource') {
      references.push(contentUsage(
        entry,
        transaction.targetResourceId,
        'resource-transaction-resource',
        `${featurePath}.resourceTransactions[${transaction.id}].targetResourceId`,
        `${titleFamily(entry.kind)} "${entry.name}" → ${feature.name} → ${transaction.name} target resource`,
        'nested',
      ));
      if (transaction.usageResourceId) references.push(contentUsage(
        entry,
        transaction.usageResourceId,
        'resource-transaction-resource',
        `${featurePath}.resourceTransactions[${transaction.id}].usageResourceId`,
        `${titleFamily(entry.kind)} "${entry.name}" → ${feature.name} → ${transaction.name} usage resource`,
        'nested',
      ));
    } else {
      references.push(contentUsage(
        entry,
        transaction.providerId,
        'resource-transaction-provider',
        `${featurePath}.resourceTransactions[${transaction.id}].providerId`,
        `${titleFamily(entry.kind)} "${entry.name}" → ${feature.name} → ${transaction.name} provider`,
        'nested',
      ));
      references.push(contentUsage(
        entry,
        transaction.usageResourceId,
        'resource-transaction-resource',
        `${featurePath}.resourceTransactions[${transaction.id}].usageResourceId`,
        `${titleFamily(entry.kind)} "${entry.name}" → ${feature.name} → ${transaction.name} usage resource`,
        'nested',
      ));
    }
  }

  for (const effect of feature.activeSelfEffects ?? []) {
    if (effect.activationCost) references.push(contentUsage(
      entry,
      effect.activationCost.resourceId,
      'active-effect-resource',
      `${featurePath}.activeSelfEffects[${effect.id}].activationCost.resourceId`,
      `${titleFamily(entry.kind)} "${entry.name}" → ${feature.name} → ${effect.name} activation resource`,
      'nested',
    ));
    for (const modifier of effect.modifiers ?? []) {
      const providerIds = modifier.type === 'spell-save-dc-bonus'
        ? modifier.providerIds
        : modifier.type === 'd20-roll-mode' && modifier.target.kind === 'spell-attack'
          ? modifier.target.providerIds
          : [];
      providerIds.forEach((providerId, index) => references.push(contentUsage(
        entry,
        providerId,
        'active-effect-provider',
        `${featurePath}.activeSelfEffects[${effect.id}].modifiers.providerIds[${index}]`,
        `${titleFamily(entry.kind)} "${entry.name}" → ${feature.name} → ${effect.name} Spellcasting provider`,
        'nested',
      )));
    }
  }

  return references;
}

export function collectContentReferences(entries: readonly ContentEntry[]): readonly ReferenceUsage[] {
  const references: ReferenceUsage[] = [];

  for (const entry of entries) {
    if (entry.kind === 'subclass') {
      references.push(contentUsage(
        entry,
        entry.parentClassId,
        'subclass-parent-class',
        'parentClassId',
        `Subclass "${entry.name}" → parent Class`,
      ));
    }

    if (entry.kind === 'background') {
      references.push(contentUsage(
        entry,
        entry.originFeat.id,
        'background-origin-feat',
        'originFeat.id',
        `Background "${entry.name}" → Origin Feat`,
      ));
    }

    if (entry.kind === 'weapon') {
      references.push(contentUsage(
        entry,
        entry.masteryId,
        'weapon-mastery',
        'masteryId',
        `Weapon "${entry.name}" → Weapon Mastery`,
      ));
    }

    if (entry.kind === 'class' || entry.kind === 'background') {
      entry.startingEquipment.forEach((option, optionIndex) => option.items.forEach((item, itemIndex) => {
        if (!item.contentId) return;
        references.push(contentUsage(
          entry,
          item.contentId,
          'starting-equipment-content',
          `startingEquipment[${optionIndex}].items[${itemIndex}].contentId`,
          `${titleFamily(entry.kind)} "${entry.name}" → starting equipment "${item.label}"`,
        ));
      }));
    }

    if (entry.kind === 'feat') {
      for (const effect of entry.effects) {
        if (effect.type !== 'ability-score-increase') continue;
        references.push(contentUsage(
          entry,
          effect.choiceId,
          'feat-effect-choice',
          `effects[ability-score-increase].choiceId`,
          `Feat "${entry.name}" → structured ability-score choice`,
          'nested',
        ));
      }
    }

    if (entry.kind === 'class' || entry.kind === 'subclass') {
      entry.progression.forEach((row, rowIndex) => row.features.forEach((feature, featureIndex) => {
        references.push(...featureReferences(entry, feature, `progression[${rowIndex}].features[${featureIndex}]`));
      }));
    }
  }

  return references;
}

export function collectCharacterReferences(characters: readonly Character[]): readonly ReferenceUsage[] {
  const references: ReferenceUsage[] = [];

  for (const character of characters) {
    references.push(characterUsage(
      character,
      character.startingClassId,
      'character-starting-class',
      'startingClassId',
      `Character "${character.name}" → starting Class`,
    ));

    character.classProgressions.forEach((progression, index) => {
      references.push(characterUsage(
        character,
        progression.classId,
        'character-class-progression',
        `classProgressions[${index}].classId`,
        `Character "${character.name}" → Class progression level ${progression.level}`,
      ));
      if (progression.subclassId) references.push(characterUsage(
        character,
        progression.subclassId,
        'character-subclass',
        `classProgressions[${index}].subclassId`,
        `Character "${character.name}" → selected Subclass`,
      ));
      progression.weaponMasterySelections.forEach((weaponId, selectionIndex) => references.push(characterUsage(
        character,
        weaponId,
        'character-weapon-mastery-selection',
        `classProgressions[${index}].weaponMasterySelections[${selectionIndex}]`,
        `Character "${character.name}" → selected Weapon Mastery weapon`,
      )));
    });

    character.manualFeats.forEach((selection, selectionIndex) => {
      references.push(characterUsage(
        character,
        selection.featId,
        'character-feat',
        `manualFeats[${selectionIndex}].featId`,
        `Character "${character.name}" → selected Feat`,
      ));
      Object.keys(selection.choices).forEach((choiceId) => references.push(characterUsage(
        character,
        choiceId,
        'character-feat-choice',
        `manualFeats[${selectionIndex}].choices[${choiceId}]`,
        `Character "${character.name}" → Feat choice "${choiceId}"`,
        'nested',
        selection.featId,
      )));
    });

    character.spellcastingSelections.forEach((selection, selectionIndex) => {
      references.push(characterUsage(
        character,
        selection.providerId,
        'character-spellcasting-provider',
        `spellcastingSelections[${selectionIndex}].providerId`,
        `Character "${character.name}" → Spellcasting provider`,
        'nested',
      ));
      selection.cantripIds.forEach((spellId, index) => references.push(characterUsage(
        character,
        spellId,
        'character-cantrip',
        `spellcastingSelections[${selectionIndex}].cantripIds[${index}]`,
        `Character "${character.name}" → selected cantrip`,
      )));
      selection.ownedSpellIds.forEach((spellId, index) => references.push(characterUsage(
        character,
        spellId,
        'character-owned-spell',
        `spellcastingSelections[${selectionIndex}].ownedSpellIds[${index}]`,
        `Character "${character.name}" → owned Spell`,
      )));
      selection.preparedSpellIds.forEach((spellId, index) => references.push(characterUsage(
        character,
        spellId,
        'character-prepared-spell',
        `spellcastingSelections[${selectionIndex}].preparedSpellIds[${index}]`,
        `Character "${character.name}" → prepared Spell`,
      )));
    });

    Object.keys(character.playState.resourceUses).forEach((resourceId) => references.push(characterUsage(
      character,
      resourceId,
      'character-resource-state',
      `playState.resourceUses[${resourceId}]`,
      `Character "${character.name}" → persisted resource state`,
      'nested',
    )));

    character.inventory.forEach((item, index) => {
      if (item.kind !== 'registry') return;
      references.push(characterUsage(
        character,
        item.contentId,
        'character-inventory-content',
        `inventory[${index}].contentId`,
        `Character "${character.name}" → registry inventory item`,
      ));
    });
  }

  return references;
}

function featureNestedIdentities(
  owner: ClassContent | SubclassContent,
  feature: ClassFeatureContent | SubclassFeatureContent,
  featurePath: string,
): NestedIdentity[] {
  const identities: NestedIdentity[] = [{
    ownerContentId: owner.id,
    id: feature.id,
    kind: 'feature',
    name: feature.name,
    path: featurePath + '.id',
  }];

  for (const effect of feature.effects) {
    if (effect.type === 'dice-transformation') identities.push({
      ownerContentId: owner.id,
      id: effect.id,
      kind: 'dice-transformation',
      name: effect.id,
      path: featurePath + '.effects[dice-transformation].id',
    });
  }

  for (const effect of feature.referenceEffects) identities.push({
    ownerContentId: owner.id,
    id: effect.id,
    kind: 'reference-effect',
    name: effect.name,
    path: featurePath + '.referenceEffects.id',
  });

  for (const resource of feature.resources ?? []) identities.push({
    ownerContentId: owner.id,
    id: resource.id,
    kind: 'resource',
    name: resource.name,
    path: featurePath + '.resources.id',
  });

  for (const grant of feature.resourceConsumers ?? []) identities.push({
    ownerContentId: owner.id,
    id: grant.consumer.id,
    kind: 'resource-consumer',
    name: grant.consumer.name,
    path: featurePath + '.resourceConsumers.consumer.id',
  });

  for (const transaction of feature.resourceTransactions ?? []) identities.push({
    ownerContentId: owner.id,
    id: transaction.id,
    kind: 'resource-transaction',
    name: transaction.name,
    path: featurePath + '.resourceTransactions.id',
  });

  for (const effect of feature.activeSelfEffects ?? []) identities.push({
    ownerContentId: owner.id,
    id: effect.id,
    kind: 'active-self-effect',
    name: effect.name,
    path: featurePath + '.activeSelfEffects.id',
  });

  for (const provider of feature.spellcasting ?? []) {
    identities.push({
      ownerContentId: owner.id,
      id: provider.id,
      kind: 'spellcasting-provider',
      name: provider.name,
      path: featurePath + '.spellcasting.id',
    });
    if (provider.slotPool) {
      identities.push({
        ownerContentId: owner.id,
        id: provider.slotPool.id,
        kind: 'spell-slot-pool',
        name: provider.slotPool.name,
        path: featurePath + '.spellcasting.slotPool.id',
      });
      provider.slotPool.slotLevels.forEach((slot) => identities.push({
        ownerContentId: owner.id,
        id: slot.resourceId,
        kind: 'spell-slot',
        name: slot.name,
        path: featurePath + '.spellcasting.slotPool.slotLevels.resourceId',
      }));
    }
  }

  return identities;
}

export function collectNestedIdentities(entry: ContentEntry): readonly NestedIdentity[] {
  const identities: NestedIdentity[] = [];

  if (entry.kind === 'class') {
    for (const resource of entry.resources) identities.push({
      ownerContentId: entry.id,
      id: resource.id,
      kind: 'resource',
      name: resource.name,
      path: 'resources.id',
    });
    entry.startingEquipment.forEach((option) => identities.push({
      ownerContentId: entry.id,
      id: option.id,
      kind: 'starting-equipment-option',
      name: option.id,
      path: 'startingEquipment.id',
    }));
    entry.toolProficiencies.forEach((tool) => identities.push({
      ownerContentId: entry.id,
      id: tool.id,
      kind: 'tool-proficiency',
      name: tool.name,
      path: 'toolProficiencies.id',
    }));
    (entry.multiclassProficiencies.toolChoices ?? []).forEach((choice) => identities.push({
      ownerContentId: entry.id,
      id: choice.id,
      kind: 'multiclass-tool-choice',
      name: choice.name,
      path: 'multiclassProficiencies.toolChoices.id',
    }));
  }

  if (entry.kind === 'feat') {
    entry.choices.forEach((choice) => identities.push({
      ownerContentId: entry.id,
      id: choice.id,
      kind: 'feat-choice',
      name: choice.name,
      path: 'choices.id',
    }));
    entry.effects.forEach((effect) => {
      if (effect.type === 'dice-transformation') identities.push({
        ownerContentId: entry.id,
        id: effect.id,
        kind: 'dice-transformation',
        name: effect.id,
        path: 'effects[dice-transformation].id',
      });
    });
    entry.referenceEffects.forEach((effect) => identities.push({
      ownerContentId: entry.id,
      id: effect.id,
      kind: 'reference-effect',
      name: effect.name,
      path: 'referenceEffects.id',
    }));
  }

  if (entry.kind === 'spell') {
    entry.referenceEffects.forEach((effect) => identities.push({
      ownerContentId: entry.id,
      id: effect.id,
      kind: 'reference-effect',
      name: effect.name,
      path: 'referenceEffects.id',
    }));
  }

  if (entry.kind === 'class' || entry.kind === 'subclass') {
    entry.progression.forEach((row, rowIndex) => row.features.forEach((feature, featureIndex) => {
      identities.push(...featureNestedIdentities(entry, feature, `progression[${rowIndex}].features[${featureIndex}]`));
    }));
  }

  return identities;
}

function usageMessage(usage: ReferenceUsage, targetName: string): string {
  if (usage.sourceType === 'character') {
    return `Character "${usage.sourceName}" uses "${targetName}" through ${usage.context.replace(/^Character "[^"]+" → /, '')}.`;
  }
  return `${titleFamily(usage.sourceFamily!)} "${usage.sourceName}" uses "${targetName}" through ${usage.context.replace(/^[^→]+→ /, '')}.`;
}

function blockerFromUsage(usage: ReferenceUsage, targetName: string): ReferenceBlocker {
  return {
    sourceType: usage.sourceType,
    sourceId: usage.sourceId,
    sourceName: usage.sourceName,
    ...(usage.sourceFamily ? { sourceFamily: usage.sourceFamily } : {}),
    referenceKind: usage.referenceKind,
    targetId: usage.targetId,
    path: usage.path,
    context: usage.context,
    message: usageMessage(usage, targetName),
  };
}

function integrityBlocker(
  referenceKind: Extract<ReferenceKind, 'prospective-character-invalid' | 'canonical-dataset-invalid' | 'analysis-unavailable' | 'protected-content'>,
  targetId: string,
  message: string,
  sourceId = 'integrity',
  sourceName = 'Referential integrity',
): ReferenceBlocker {
  return {
    sourceType: 'integrity',
    sourceId,
    sourceName,
    referenceKind,
    targetId,
    path: '',
    context: message,
    message,
  };
}

function prospectiveRegistry(
  prospectiveCustomEntries: readonly ContentEntry[],
  targetId: string,
): { readonly ok: true; readonly registry: ContentRegistry } | { readonly ok: false; readonly blocker: ReferenceBlocker } {
  try {
    return { ok: true, registry: createContentRegistry(prospectiveCustomEntries) };
  } catch (error) {
    return {
      ok: false,
      blocker: integrityBlocker(
        'canonical-dataset-invalid',
        targetId,
        error instanceof Error ? error.message : 'Prospective content does not form a valid canonical dataset.',
      ),
    };
  }
}

function characterValidityBlockers(
  characters: readonly Character[],
  registry: ContentRegistry,
  targetId: string,
): ReferenceBlocker[] {
  const blockers: ReferenceBlocker[] = [];
  for (const character of characters) {
    if (isCharacter(character as unknown, registry)) continue;
    blockers.push(integrityBlocker(
      'prospective-character-invalid',
      targetId,
      `Character "${character.name}" would no longer be valid under the prospective content catalog.`,
      character.id,
      character.name,
    ));
  }
  return blockers;
}

function effectiveEntries(customEntries: readonly ContentEntry[]): readonly ContentEntry[] {
  return [...SRD_CONTENT, ...customEntries];
}

function topLevelTarget(
  targetId: string,
  customEntries: readonly ContentEntry[],
): ContentEntry | undefined {
  return effectiveEntries(customEntries).find((entry) => entry.id === targetId);
}

export function preflightContentDelete(
  targetId: string,
  customEntries: readonly ContentEntry[],
  characters: readonly Character[],
): ReferentialIntegrityPreflight {
  const target = topLevelTarget(targetId, customEntries);
  if (!target) {
    return { ok: false, blockers: [integrityBlocker('analysis-unavailable', targetId, `Content target does not exist: ${targetId}.`)] };
  }
  if (target.source.type !== 'homebrew' || !DESTRUCTIBLE_KINDS.has(target.kind)) {
    return { ok: false, blockers: [integrityBlocker('protected-content', targetId, `${titleFamily(target.kind)} "${target.name}" is bundled/protected content and cannot be deleted through Creator Forge.`)] };
  }

  const entries = effectiveEntries(customEntries);
  const usages = [...collectContentReferences(entries), ...collectCharacterReferences(characters)];
  const blockers = usages
    .filter((usage) => usage.targetId === target.id)
    .filter((usage) => usage.sourceType === 'character' || usage.sourceId !== target.id)
    .map((usage) => blockerFromUsage(usage, target.name));

  const prospectiveCustomEntries = customEntries.filter((entry) => entry.id !== target.id);
  if (blockers.length > 0) return { ok: false, blockers, prospectiveCustomEntries, removedNestedIdentities: collectNestedIdentities(target) };

  const registryResult = prospectiveRegistry(prospectiveCustomEntries, target.id);
  if (!registryResult.ok) return { ok: false, blockers: [registryResult.blocker], prospectiveCustomEntries };

  const characterBlockers = characterValidityBlockers(characters, registryResult.registry, target.id);
  if (characterBlockers.length > 0) return { ok: false, blockers: characterBlockers, prospectiveCustomEntries };

  return {
    ok: true,
    prospectiveCustomEntries,
    registry: registryResult.registry,
    removedNestedIdentities: collectNestedIdentities(target),
  };
}

function nestedUsageMatches(identity: NestedIdentity, usage: ReferenceUsage): boolean {
  if (usage.targetId !== identity.id) return false;
  if (usage.referenceKind === 'character-feat-choice') return usage.ownerContentId === identity.ownerContentId;
  return true;
}

export function preflightContentEdit(
  prospectiveEntry: ContentEntry,
  customEntries: readonly ContentEntry[],
  characters: readonly Character[],
): ReferentialIntegrityPreflight {
  const current = customEntries.find((entry) => entry.id === prospectiveEntry.id);
  if (!current) {
    const registryResult = prospectiveRegistry([...customEntries, prospectiveEntry], prospectiveEntry.id);
    if (!registryResult.ok) return { ok: false, blockers: [registryResult.blocker] };
    const characterBlockers = characterValidityBlockers(characters, registryResult.registry, prospectiveEntry.id);
    return characterBlockers.length
      ? { ok: false, blockers: characterBlockers }
      : { ok: true, prospectiveCustomEntries: [...customEntries, prospectiveEntry], registry: registryResult.registry, removedNestedIdentities: [] };
  }

  if (current.source.type !== 'homebrew') {
    return { ok: false, blockers: [integrityBlocker('protected-content', current.id, `${titleFamily(current.kind)} "${current.name}" is bundled/protected content and cannot be edited through Creator Forge.`)] };
  }
  if (
    current.kind !== prospectiveEntry.kind
    || prospectiveEntry.source.type !== 'homebrew'
    || prospectiveEntry.source.namespace !== current.source.namespace
  ) {
    return { ok: false, blockers: [integrityBlocker('protected-content', current.id, 'Content kind, source namespace, and top-level identity are immutable during Edit.')] };
  }

  const prospectiveCustomEntries = customEntries.map((entry) => entry.id === current.id ? prospectiveEntry : entry);
  const currentNested = collectNestedIdentities(current);
  const prospectiveNestedIds = new Set(collectNestedIdentities(prospectiveEntry).map((identity) => identity.id));
  const removedNestedIdentities = currentNested.filter((identity) => !prospectiveNestedIds.has(identity.id));

  const usages = [...collectContentReferences(effectiveEntries(customEntries)), ...collectCharacterReferences(characters)];
  const nestedBlockers: ReferenceBlocker[] = [];
  for (const identity of removedNestedIdentities) {
    for (const usage of usages) {
      if (!nestedUsageMatches(identity, usage)) continue;
      if (usage.sourceType === 'content' && usage.sourceId === current.id) continue;
      nestedBlockers.push(blockerFromUsage(usage, identity.name || identity.id));
    }
  }
  if (nestedBlockers.length > 0) {
    return { ok: false, blockers: nestedBlockers, prospectiveCustomEntries, removedNestedIdentities };
  }

  const registryResult = prospectiveRegistry(prospectiveCustomEntries, current.id);
  if (!registryResult.ok) return { ok: false, blockers: [registryResult.blocker], prospectiveCustomEntries, removedNestedIdentities };

  const characterBlockers = characterValidityBlockers(characters, registryResult.registry, current.id);
  if (characterBlockers.length > 0) {
    return { ok: false, blockers: characterBlockers, prospectiveCustomEntries, removedNestedIdentities };
  }

  return {
    ok: true,
    prospectiveCustomEntries,
    registry: registryResult.registry,
    removedNestedIdentities,
  };
}

export function readPersistedCharactersForIntegrity(
  storage: Storage,
  registry: ContentRegistry,
): PersistedCharacterPopulationResult {
  let raw: string | null;
  try {
    raw = storage.getItem(CHARACTER_STORAGE_KEY);
  } catch {
    return {
      ok: false,
      blocker: integrityBlocker('analysis-unavailable', CHARACTER_STORAGE_KEY, 'Character storage could not be read safely. Destructive content operations are blocked.'),
    };
  }
  if (raw === null) return { ok: true, characters: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      blocker: integrityBlocker('analysis-unavailable', CHARACTER_STORAGE_KEY, 'Character v10 storage contains malformed JSON. Destructive content operations are blocked.'),
    };
  }
  if (!Array.isArray(parsed)) {
    return {
      ok: false,
      blocker: integrityBlocker('analysis-unavailable', CHARACTER_STORAGE_KEY, 'Character v10 storage is not a Character array. Destructive content operations are blocked.'),
    };
  }

  const characters: Character[] = [];
  for (const value of parsed) {
    if (!isCharacter(value, registry)) {
      return {
        ok: false,
        blocker: integrityBlocker('analysis-unavailable', CHARACTER_STORAGE_KEY, 'At least one persisted Character cannot be safely analyzed under the current effective catalog. Destructive content operations are blocked.'),
      };
    }
    characters.push(structuredClone(value));
  }
  return { ok: true, characters };
}

export function formatReferenceBlockers(blockers: readonly ReferenceBlocker[]): string {
  return blockers.map((blocker) => blocker.message).join(' ');
}
