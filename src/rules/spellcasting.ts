import type { CharacterSpellcastingSelection } from '../models/character';
import type { ClassContent, ContentSourceMetadata, LeveledSpellLevel, SpellContent, SpellDieTerm, SpellMechanic, SpellcastingProviderDefinition, SpellcastingProviderSpellGrant, SubclassContent } from '../models/content';
import type { ContentId } from '../models/contentId';
import type { ContentRegistry } from '../services/contentRegistry';
import { MULTICLASS_SPELLCASTER_SLOT_PROGRESSION } from './multiclass';
import { ruleError, ruleOk, type RuleResult } from './result';
import type { DerivedAbilityModifiers, DerivedCharacterState, DerivedClassState, DerivedMechanicalOwner, DerivedResource, DerivedSpellcastingProvider, DerivedSpellSlotPool, DerivedSpellSlotSource } from './types';

export const MULTICLASS_ORDINARY_SLOT_POOL_ID: ContentId = 'dnd3:spell-slot-pool:multiclass-ordinary';
export function multiclassOrdinarySpellSlotResourceId(level: LeveledSpellLevel): ContentId {
  return `dnd3:spell-slot:multiclass-ordinary:${level}`;
}

export interface SpellcastingProviderGrant {
  readonly definition: SpellcastingProviderDefinition;
  readonly source: ContentSourceMetadata;
  readonly grantedBy: { readonly contentId: ContentId; readonly contentName: string };
  readonly owner?: DerivedMechanicalOwner;
}

export interface SpellcastingSpellGrant {
  readonly definition: SpellcastingProviderSpellGrant;
  readonly grantedBy: { readonly contentId: ContentId; readonly contentName: string };
}

export interface DerivedSpellcastingCollection {
  readonly providers: readonly DerivedSpellcastingProvider[];
  readonly resources: readonly DerivedResource[];
  readonly ordinaryMulticlassCasterLevel?: number;
  readonly ordinaryMulticlassSlotPool?: DerivedSpellSlotPool;
}

interface SpellcastingDerivationOptions {
  readonly ordinaryMulticlassCasterLevel?: number;
  readonly ordinaryMulticlassSlotPool?: DerivedSpellSlotPool;
}

export function spellcastingProviderDefinitionsAtLevel(
  classContent: ClassContent | undefined,
  subclassContent: SubclassContent | undefined,
  level: number,
): SpellcastingProviderDefinition[] {
  const providers: SpellcastingProviderDefinition[] = [];
  for (const row of classContent?.progression ?? []) {
    if (row.level > level) break;
    for (const feature of row.features) providers.push(...(feature.spellcasting ?? []));
  }
  if (subclassContent && subclassContent.parentClassId === classContent?.id) {
    for (const row of subclassContent.progression) {
      if (row.level > level) break;
      for (const feature of row.features) providers.push(...(feature.spellcasting ?? []));
    }
  }
  return providers;
}

export function spellcastingSpellGrantsAtLevel(
  classContent: ClassContent | undefined,
  subclassContent: SubclassContent | undefined,
  level: number,
): SpellcastingProviderSpellGrant[] {
  const grants: SpellcastingProviderSpellGrant[] = [];
  for (const row of classContent?.progression ?? []) {
    if (row.level > level) break;
    for (const feature of row.features) {
      for (const grant of feature.spellGrants ?? []) {
        if ((grant.minimumLevel ?? row.level) <= level) grants.push(grant);
      }
    }
  }
  if (subclassContent && subclassContent.parentClassId === classContent?.id) {
    for (const row of subclassContent.progression) {
      if (row.level > level) break;
      for (const feature of row.features) {
        for (const grant of feature.spellGrants ?? []) {
          if ((grant.minimumLevel ?? row.level) <= level) grants.push(grant);
        }
      }
    }
  }
  return grants;
}

function progressionAtLevel(definition: SpellcastingProviderDefinition, level: number) {
  return [...(definition.slotPool?.progression ?? [])].filter((row) => row.level <= level).sort((a, b) => b.level - a.level)[0];
}

export function spellcastingCountAtLevel(
  values: readonly { readonly level: number; readonly count: number }[],
  ownerLevel: number,
): number {
  return [...values].filter((row) => row.level <= ownerLevel).sort((a, b) => b.level - a.level)[0]?.count ?? 0;
}

export function maximumSelectableSpellLevel(
  provider: SpellcastingProviderDefinition,
  ownerLevel: number,
): number {
  const row = progressionAtLevel(provider, ownerLevel);
  return Math.max(0, ...(row?.slots.filter((slot) => slot.maximum > 0).map((slot) => slot.spellLevel) ?? []));
}

export function spellBelongsToProviderList(spell: SpellContent, spellListId: string): boolean {
  return spell.spellLists.some((list) => list.id === spellListId);
}

export interface SpellSlotSourceSelection {
  readonly slotPoolId: ContentId;
  readonly resourceId: ContentId;
  readonly spellLevel: LeveledSpellLevel;
}

export function resolveSpellcastingProviderSpell(
  state: DerivedCharacterState,
  providerId: ContentId,
  spellId: ContentId,
): RuleResult<{ readonly provider: DerivedSpellcastingProvider; readonly spell: SpellContent }> {
  const provider = state.spellcasting.find((candidate) => candidate.id === providerId);
  if (!provider) return ruleError('missing-spellcasting-provider', `Spellcasting provider could not be resolved: ${providerId}`, providerId);
  const spell = provider.spells.find((candidate) => candidate.id === spellId);
  if (!spell) return ruleError('missing-spell', `${provider.name} does not grant spell: ${spellId}`, spellId);
  return ruleOk({ provider, spell });
}

function slotSourceKind(provider: DerivedSpellcastingProvider): DerivedSpellSlotSource['kind'] | undefined {
  const contribution = provider.multiclassSlotContribution;
  if (contribution.kind === 'spellcasting') return 'ordinary';
  if (contribution.kind === 'pact-magic') return 'pact';
  if (contribution.kind === 'independent') return 'independent';
  return undefined;
}

export function resolveLegalSpellSlotSources(
  state: DerivedCharacterState,
  providerId: ContentId,
  spellId: ContentId,
  slotLevel?: LeveledSpellLevel,
): RuleResult<readonly DerivedSpellSlotSource[]> {
  const resolved = resolveSpellcastingProviderSpell(state, providerId, spellId);
  if (!resolved.ok) return resolved;
  const { provider, spell } = resolved.value;

  if (spell.level === 0) {
    return slotLevel === undefined
      ? ruleOk([])
      : ruleError('invalid-spell-slot', `${spell.name} is a cantrip and does not use a spell slot.`, spell.id);
  }
  if (slotLevel !== undefined && (slotLevel < spell.level || slotLevel > 9)) {
    return ruleError('invalid-spell-slot', `${spell.name} requires a spell slot of level ${spell.level} or higher.`, spell.id);
  }

  const providerKind = slotSourceKind(provider);
  const sourceProviders = providerKind === 'independent'
    ? [provider]
    : state.spellcasting.filter((candidate) => {
        const kind = slotSourceKind(candidate);
        return kind === 'ordinary' || kind === 'pact';
      });

  const sources = new Map<string, DerivedSpellSlotSource>();
  for (const sourceProvider of sourceProviders) {
    const kind = slotSourceKind(sourceProvider);
    if (!kind || !sourceProvider.slotPool) continue;
    for (const slot of sourceProvider.slotPool.slots) {
      if (slot.spellLevel < spell.level) continue;
      if (slotLevel !== undefined && slot.spellLevel !== slotLevel) continue;
      const key = `${sourceProvider.slotPool.id}\u0000${slot.resourceId}`;
      if (!sources.has(key)) {
        sources.set(key, {
          kind,
          slotPoolId: sourceProvider.slotPool.id,
          resourceId: slot.resourceId,
          spellLevel: slot.spellLevel,
        });
      }
    }
  }

  return ruleOk(
    [...sources.values()].sort((left, right) =>
      left.spellLevel - right.spellLevel
      || left.kind.localeCompare(right.kind)
      || left.slotPoolId.localeCompare(right.slotPoolId)
      || left.resourceId.localeCompare(right.resourceId)),
  );
}

export function resolveSpellSlotResource(
  state: DerivedCharacterState,
  providerId: ContentId,
  spellId: ContentId,
  slotLevel?: LeveledSpellLevel,
  selectedSource?: SpellSlotSourceSelection,
): RuleResult<DerivedSpellSlotSource | undefined> {
  const resolved = resolveSpellcastingProviderSpell(state, providerId, spellId);
  if (!resolved.ok) return resolved;
  const spell = resolved.value.spell;

  if (spell.level === 0) {
    if (slotLevel !== undefined || selectedSource !== undefined) {
      return ruleError('invalid-spell-slot', `${spell.name} is a cantrip and does not use a spell slot.`, spell.id);
    }
    return ruleOk(undefined);
  }

  if (selectedSource && slotLevel !== undefined && selectedSource.spellLevel !== slotLevel) {
    return ruleError('invalid-spell-slot-source', 'Selected spell-slot source does not match the requested slot level.', selectedSource.resourceId);
  }
  const effectiveLevel = slotLevel ?? selectedSource?.spellLevel;
  const legalSources = resolveLegalSpellSlotSources(state, providerId, spellId, effectiveLevel);
  if (!legalSources.ok) return legalSources;

  if (selectedSource) {
    const selected = legalSources.value.find((candidate) =>
      candidate.slotPoolId === selectedSource.slotPoolId
      && candidate.resourceId === selectedSource.resourceId
      && candidate.spellLevel === selectedSource.spellLevel);
    return selected
      ? ruleOk(selected)
      : ruleError('invalid-spell-slot-source', 'Selected spell-slot source is not legal for this provider-owned spell.', selectedSource.resourceId);
  }

  if (legalSources.value.length === 0) {
    return ruleError('invalid-spell-slot', `No legal spell slot is available for ${spell.name}${effectiveLevel ? ` at level ${effectiveLevel}` : ''}.`, spell.id);
  }
  if (legalSources.value.length > 1) {
    return ruleError('ambiguous-spell-slot-source', `Select an explicit spell-slot source for ${spell.name}.`, spell.id);
  }
  return ruleOk(legalSources.value[0]);
}

function sameRecovery(left: DerivedResource['recovery'], right: DerivedResource['recovery']): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function deriveSpellcastingProviders(
  grants: readonly SpellcastingProviderGrant[],
  level: number,
  abilityModifiers: DerivedAbilityModifiers,
  proficiencyBonus: number,
  registry: ContentRegistry,
  spellGrants: readonly SpellcastingSpellGrant[] = [],
  spellcastingSelections: readonly CharacterSpellcastingSelection[] = [],
  options: SpellcastingDerivationOptions = {},
): RuleResult<DerivedSpellcastingCollection> {
  const providers: DerivedSpellcastingProvider[] = [];
  const resources = new Map<ContentId, DerivedResource>();
  const providerIds = new Set<ContentId>();

  if (options.ordinaryMulticlassSlotPool) {
    for (const slot of options.ordinaryMulticlassSlotPool.slots) {
      resources.set(slot.resourceId, {
        id: slot.resourceId,
        name: slot.name,
        maximumUses: slot.maximumUses,
        recovery: options.ordinaryMulticlassSlotPool.recovery,
        consumers: [],
        presentation: 'pips',
      });
    }
  }

  for (const grant of grants) {
    const definition = grant.definition;
    const providerLevel = grant.owner?.level ?? level;
    if (providerIds.has(definition.id)) return ruleError('missing-spellcasting-provider', `Duplicate Spellcasting provider: ${definition.id}`, definition.id);
    providerIds.add(definition.id);

    const spells: SpellContent[] = [];
    const derivedSpellGrants: DerivedSpellcastingProvider['spellGrants'][number][] = [];
    const spellManagement = definition.spellManagement;
    const selection = spellcastingSelections.find((candidate) => candidate.providerId === definition.id);
    const grantedIds = new Set(
      spellGrants
        .filter((candidate) => candidate.definition.providerId === definition.id)
        .flatMap((candidate) => candidate.definition.spellIds),
    );
    const resolveSelectedSpells = (ids: readonly ContentId[], predicate: (spell: SpellContent) => boolean): SpellContent[] => ids.flatMap((spellId) => {
      if (grantedIds.has(spellId)) return [];
      const spell = registry.findSpell(spellId);
      return spell && predicate(spell) ? [spell] : [];
    });
    let management: DerivedSpellcastingProvider['management'];
    if (spellManagement.kind === 'granted-only') {
      for (const spellId of spellManagement.spellIds) {
        const spell = registry.findSpell(spellId);
        if (!spell) return ruleError('missing-spell', `Spellcasting provider ${definition.name} references an unresolved spell: ${spellId}`, spellId);
        spells.push(spell);
      }
      management = { kind: 'granted-only' };
    } else {
      const catalogSpells = registry.getAll('spell').filter((spell) => spellBelongsToProviderList(spell, spellManagement.spellListId));
      if (spellManagement.kind === 'prepared-from-list') {
        const selectedCantrips = resolveSelectedSpells(
          selection?.cantripIds ?? [],
          (spell) => spell.level === 0 && spellBelongsToProviderList(spell, spellManagement.spellListId),
        );
        const preparedSpells = resolveSelectedSpells(
          selection?.preparedSpellIds ?? [],
          (spell) => spell.level > 0 && spellBelongsToProviderList(spell, spellManagement.spellListId),
        );
        for (const spell of [...selectedCantrips, ...preparedSpells]) {
          if (!spells.some((candidate) => candidate.id === spell.id)) spells.push(spell);
        }
        management = {
          kind: 'prepared-from-list',
          spellListId: spellManagement.spellListId,
          cantripCount: spellcastingCountAtLevel(spellManagement.cantripCount, providerLevel),
          preparedSpellCount: spellcastingCountAtLevel(spellManagement.preparedSpellCount, providerLevel),
          replacement: spellManagement.replacement,
          catalogSpells,
          selectedCantrips,
          preparedSpells,
        };
      } else {
        const selectedCantrips = resolveSelectedSpells(
          selection?.cantripIds ?? [],
          (spell) => spell.level === 0 && spellBelongsToProviderList(spell, spellManagement.spellListId),
        );
        const ownedSpells = resolveSelectedSpells(
          selection?.ownedSpellIds ?? [],
          (spell) => spell.level > 0 && spellBelongsToProviderList(spell, spellManagement.spellListId),
        );
        const ownedIds = new Set(ownedSpells.map((spell) => spell.id));
        const preparedSpells = resolveSelectedSpells(selection?.preparedSpellIds ?? [], (spell) => ownedIds.has(spell.id));
        for (const spell of [...selectedCantrips, ...preparedSpells]) if (!spells.some((candidate) => candidate.id === spell.id)) spells.push(spell);
        management = {
          kind: 'prepared-from-owned',
          spellListId: spellManagement.spellListId,
          cantripCount: spellcastingCountAtLevel(spellManagement.cantripCount, providerLevel),
          preparedSpellCount: spellcastingCountAtLevel(spellManagement.preparedSpellCount, providerLevel),
          replacement: spellManagement.replacement,
          initialOwnedSpellCount: spellManagement.initialOwnedSpellCount,
          initialOwnedSpellLevel: spellManagement.initialOwnedSpellLevel,
          catalogSpells,
          selectedCantrips,
          ownedSpells,
          preparedSpells,
        };
      }
    }

    for (const spellGrant of spellGrants.filter((candidate) => candidate.definition.providerId === definition.id)) {
      for (const spellId of spellGrant.definition.spellIds) {
        const spell = registry.findSpell(spellId);
        if (!spell) return ruleError('missing-spell', `Spell grant for ${definition.name} references an unresolved spell: ${spellId}`, spellId);
        if (!derivedSpellGrants.some((candidate) => candidate.spell.id === spell.id)) {
          derivedSpellGrants.push({ spell, status: spellGrant.definition.status, grantedBy: spellGrant.grantedBy });
        }
        if (!spells.some((candidate) => candidate.id === spell.id)) spells.push(spell);
      }
    }

    const ability = definition.spellcastingAbility.ability;
    const abilityModifier = abilityModifiers[ability];
    let slotPool: DerivedSpellcastingProvider['slotPool'];
    if (options.ordinaryMulticlassSlotPool && definition.multiclassSlotContribution.kind === 'spellcasting') {
      slotPool = options.ordinaryMulticlassSlotPool;
    } else if (definition.slotPool) {
      const row = progressionAtLevel(definition, providerLevel);
      const slots: NonNullable<DerivedSpellcastingProvider['slotPool']>['slots'][number][] = [];
      for (const slot of definition.slotPool.slotLevels) {
        const maximumUses = row?.slots.find((candidate) => candidate.spellLevel === slot.spellLevel)?.maximum ?? 0;
        if (maximumUses <= 0) continue;
        const resource: DerivedResource = {
          id: slot.resourceId,
          name: slot.name,
          maximumUses,
          source: grant.source,
          recovery: definition.slotPool.recovery,
          consumers: [],
          presentation: 'pips',
        };
        const existing = resources.get(resource.id);
        if (existing && (existing.maximumUses !== resource.maximumUses || !sameRecovery(existing.recovery, resource.recovery))) {
          return ruleError('duplicate-resource', `Conflicting shared spell-slot resource definition: ${resource.id}`, resource.id);
        }
        if (!existing) resources.set(resource.id, resource);
        slots.push({ spellLevel: slot.spellLevel, resourceId: slot.resourceId, name: slot.name, maximumUses });
      }
      slotPool = { id: definition.slotPool.id, name: definition.slotPool.name, recovery: definition.slotPool.recovery, slots };
    }

    const ritualCandidates = definition.ritualCasting === 'owned' && management.kind === 'prepared-from-owned'
      ? management.ownedSpells
      : definition.ritualCasting === 'prepared'
        ? spells
        : [];
    const ritualSpells = ritualCandidates.filter((spell, index, list) => spell.ritual && list.findIndex((candidate) => candidate.id === spell.id) === index);

    providers.push({
      id: definition.id,
      name: definition.name,
      source: grant.source,
      grantedBy: grant.grantedBy,
      ...(grant.owner ? { owner: grant.owner } : {}),
      multiclassSlotContribution: definition.multiclassSlotContribution,
      ability,
      abilityModifier,
      saveDc: 8 + proficiencyBonus + abilityModifier,
      attackModifier: proficiencyBonus + abilityModifier,
      ritualCasting: definition.ritualCasting,
      ritualSpells,
      management,
      spells,
      spellGrants: derivedSpellGrants,
      ...(slotPool ? { slotPool } : {}),
    });
  }

  return ruleOk({
    providers,
    resources: [...resources.values()],
    ...(options.ordinaryMulticlassCasterLevel !== undefined
      ? { ordinaryMulticlassCasterLevel: options.ordinaryMulticlassCasterLevel }
      : {}),
    ...(options.ordinaryMulticlassSlotPool
      ? { ordinaryMulticlassSlotPool: options.ordinaryMulticlassSlotPool }
      : {}),
  });
}

function classOwner(state: DerivedClassState): Extract<DerivedMechanicalOwner, { kind: 'class' }> {
  return { kind: 'class', level: state.classLevel, classId: state.id, className: state.name };
}

function subclassOwner(state: DerivedClassState): Extract<DerivedMechanicalOwner, { kind: 'subclass' }> | undefined {
  if (!state.subclass) return undefined;
  return {
    kind: 'subclass',
    level: state.subclass.parentClassLevel,
    classId: state.id,
    className: state.name,
    subclassId: state.subclass.id,
    subclassName: state.subclass.name,
  };
}

function collectMulticlassSpellcastingGrants(
  states: readonly DerivedClassState[],
  registry: ContentRegistry,
): RuleResult<{ readonly providers: SpellcastingProviderGrant[]; readonly spells: SpellcastingSpellGrant[] }> {
  const providers: SpellcastingProviderGrant[] = [];
  const spells: SpellcastingSpellGrant[] = [];

  for (const state of states) {
    const classContent = registry.findClass(state.id);
    if (!classContent) return ruleError('missing-class', `Character class could not be resolved: ${state.id}`, state.id);
    const ownedClass = classOwner(state);
    for (const row of classContent.progression) {
      if (row.level > state.classLevel) continue;
      for (const feature of row.features) {
        for (const definition of feature.spellcasting ?? []) {
          providers.push({
            definition,
            source: classContent.source,
            grantedBy: { contentId: feature.id, contentName: feature.name },
            owner: ownedClass,
          });
        }
        for (const definition of feature.spellGrants ?? []) {
          if ((definition.minimumLevel ?? row.level) <= state.classLevel) {
            spells.push({ definition, grantedBy: { contentId: feature.id, contentName: feature.name } });
          }
        }
      }
    }

    if (!state.subclass) continue;
    const subclassContent = registry.findSubclass(state.subclass.id);
    if (!subclassContent) return ruleError('missing-subclass', `Character subclass could not be resolved: ${state.subclass.id}`, state.subclass.id);
    if (subclassContent.parentClassId !== state.id) {
      return ruleError('invalid-subclass-parent', `${subclassContent.name} does not belong to ${state.name}.`, subclassContent.id);
    }
    const ownedSubclass = subclassOwner(state);
    if (!ownedSubclass) continue;
    for (const row of subclassContent.progression) {
      if (row.level > state.classLevel) continue;
      for (const feature of row.features) {
        for (const definition of feature.spellcasting ?? []) {
          providers.push({
            definition,
            source: subclassContent.source,
            grantedBy: { contentId: feature.id, contentName: feature.name },
            owner: ownedSubclass,
          });
        }
        for (const definition of feature.spellGrants ?? []) {
          if ((definition.minimumLevel ?? row.level) <= state.classLevel) {
            spells.push({ definition, grantedBy: { contentId: feature.id, contentName: feature.name } });
          }
        }
      }
    }
  }

  return ruleOk({ providers, spells });
}

export function multiclassOrdinaryCasterContribution(
  definition: SpellcastingProviderDefinition,
  ownerLevel: number,
): number {
  const contribution = definition.multiclassSlotContribution;
  if (contribution.kind !== 'spellcasting') return 0;
  if (contribution.contribution === 'full') return ownerLevel;
  if (contribution.contribution === 'half') return Math.ceil(ownerLevel / 2);
  return Math.floor(ownerLevel / 3);
}

function deriveOrdinaryMulticlassSlotPool(casterLevel: number): RuleResult<DerivedSpellSlotPool | undefined> {
  if (casterLevel === 0) return ruleOk(undefined);
  const row = MULTICLASS_SPELLCASTER_SLOT_PROGRESSION.find((candidate) => candidate.level === casterLevel);
  if (!row) return ruleError('invalid-level', `No multiclass spell-slot progression exists for caster level ${casterLevel}.`);
  return ruleOk({
    id: MULTICLASS_ORDINARY_SLOT_POOL_ID,
    name: 'Multiclass Spell Slots',
    recovery: [{ trigger: 'long-rest', mode: 'all' }],
    slots: row.slots.map((slot) => ({
      spellLevel: slot.spellLevel,
      resourceId: multiclassOrdinarySpellSlotResourceId(slot.spellLevel),
      name: `Level ${slot.spellLevel} Spell Slots`,
      maximumUses: slot.maximum,
    })),
  });
}

export function deriveMulticlassSpellcastingProviders(
  states: readonly DerivedClassState[],
  abilityModifiers: DerivedAbilityModifiers,
  proficiencyBonus: number,
  registry: ContentRegistry,
  spellcastingSelections: readonly CharacterSpellcastingSelection[] = [],
): RuleResult<DerivedSpellcastingCollection> {
  const grants = collectMulticlassSpellcastingGrants(states, registry);
  if (!grants.ok) return grants;
  if (grants.value.providers.length === 0) {
    return deriveSpellcastingProviders([], 0, abilityModifiers, proficiencyBonus, registry, [], spellcastingSelections);
  }

  let ordinaryCasterLevel = 0;
  for (const grant of grants.value.providers) {
    if (!grant.owner) {
      return ruleError('multiclass-derivation-not-supported', `Spellcasting provider ${grant.definition.id} has no mechanical owner.`, grant.definition.id);
    }
    ordinaryCasterLevel += multiclassOrdinaryCasterContribution(grant.definition, grant.owner.level);
  }
  const ordinarySlotPool = deriveOrdinaryMulticlassSlotPool(ordinaryCasterLevel);
  if (!ordinarySlotPool.ok) return ordinarySlotPool;

  return deriveSpellcastingProviders(
    grants.value.providers,
    0,
    abilityModifiers,
    proficiencyBonus,
    registry,
    grants.value.spells,
    spellcastingSelections,
    {
      ordinaryMulticlassCasterLevel: ordinaryCasterLevel,
      ...(ordinarySlotPool.value ? { ordinaryMulticlassSlotPool: ordinarySlotPool.value } : {}),
    },
  );
}

export type SpellRollMechanic = Extract<SpellMechanic, { type: 'damage' | 'healing' }>;
export interface DerivedSpellRollAmount {
  readonly dice: readonly SpellDieTerm[];
  readonly modifier: number;
}

function mergeDice(terms: readonly SpellDieTerm[]): SpellDieTerm[] {
  const counts = new Map<SpellDieTerm['die'], number>();
  for (const term of terms) counts.set(term.die, (counts.get(term.die) ?? 0) + term.count);
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([die, count]) => ({ count, die }));
}

export function deriveSpellRollAmount(
  spell: SpellContent,
  mechanic: SpellRollMechanic,
  characterLevel: number,
  slotLevel: LeveledSpellLevel | undefined,
  spellcastingAbilityModifier: number,
): RuleResult<DerivedSpellRollAmount> {
  if (spell.level === 0) {
    if (slotLevel !== undefined) return ruleError('invalid-spell-slot', `${spell.name} is a cantrip and does not use a spell slot.`, spell.id);
  } else if (!slotLevel || slotLevel < spell.level || slotLevel > 9) {
    return ruleError('invalid-spell-slot', `${spell.name} requires a spell slot of level ${spell.level} or higher.`, spell.id);
  }

  let dice = [...mechanic.amount.dice];
  const scaling = mechanic.scaling;
  if (scaling?.kind === 'character-level-dice') {
    const row = [...scaling.values].filter((candidate) => candidate.level <= characterLevel).sort((a, b) => b.level - a.level)[0];
    if (!row) return ruleError('invalid-spell-mechanic', `${spell.name} has no valid cantrip scaling row for level ${characterLevel}.`, spell.id);
    dice = [...row.dice];
  } else if (scaling?.kind === 'slot-level-dice') {
    const delta = (slotLevel ?? scaling.baseSpellLevel) - scaling.baseSpellLevel;
    dice = mergeDice([...dice, ...scaling.dicePerLevel.map((term) => ({ ...term, count: term.count * delta })).filter((term) => term.count > 0)]);
  }

  return ruleOk({
    dice: mergeDice(dice),
    modifier: mechanic.amount.modifier === 'spellcasting-ability' ? spellcastingAbilityModifier : 0,
  });
}
