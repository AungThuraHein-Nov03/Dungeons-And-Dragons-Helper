import type { CharacterSpellcastingSelection } from '../models/character';
import type { ClassContent, ContentSourceMetadata, LeveledSpellLevel, SpellContent, SpellDieTerm, SpellMechanic, SpellcastingProviderDefinition, SpellcastingProviderSpellGrant, SubclassContent } from '../models/content';
import type { ContentId } from '../models/contentId';
import type { ContentRegistry } from '../services/contentRegistry';
import { ruleError, ruleOk, type RuleResult } from './result';
import type { DerivedAbilityModifiers, DerivedResource, DerivedSpellcastingProvider } from './types';

export interface SpellcastingProviderGrant {
  readonly definition: SpellcastingProviderDefinition;
  readonly source: ContentSourceMetadata;
  readonly grantedBy: { readonly contentId: ContentId; readonly contentName: string };
}

export interface SpellcastingSpellGrant {
  readonly definition: SpellcastingProviderSpellGrant;
  readonly grantedBy: { readonly contentId: ContentId; readonly contentName: string };
}

export interface DerivedSpellcastingCollection {
  readonly providers: readonly DerivedSpellcastingProvider[];
  readonly resources: readonly DerivedResource[];
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

function progressionAtLevel(definition: SpellcastingProviderDefinition, level: number) {
  return [...(definition.slotPool?.progression ?? [])].filter((row) => row.level <= level).sort((a, b) => b.level - a.level)[0];
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
): RuleResult<DerivedSpellcastingCollection> {
  const providers: DerivedSpellcastingProvider[] = [];
  const resources = new Map<ContentId, DerivedResource>();
  const providerIds = new Set<ContentId>();

  for (const grant of grants) {
    const definition = grant.definition;
    if (providerIds.has(definition.id)) return ruleError('missing-spellcasting-provider', `Duplicate Spellcasting provider: ${definition.id}`, definition.id);
    providerIds.add(definition.id);

    const spells: SpellContent[] = [];
    const derivedSpellGrants: DerivedSpellcastingProvider['spellGrants'][number][] = [];
    const spellManagement = definition.spellManagement;
    const selection = spellcastingSelections.find((candidate) => candidate.providerId === definition.id);
    const countAtLevel = (values: readonly { readonly level: number; readonly count: number }[]) => [...values].filter((row) => row.level <= level).sort((a, b) => b.level - a.level)[0]?.count ?? 0;
    const resolveSelectedSpells = (ids: readonly ContentId[], predicate: (spell: SpellContent) => boolean): SpellContent[] => ids.flatMap((spellId) => {
      const spell = registry.findSpell(spellId);
      return spell && predicate(spell) ? [spell] : [];
    });
    const onProviderList = (spell: SpellContent, spellListId: string) => spell.spellLists.some((list) => list.id === spellListId);
    let management: DerivedSpellcastingProvider['management'];
    if (spellManagement.kind === 'granted-only') {
      for (const spellId of spellManagement.spellIds) {
        const spell = registry.findSpell(spellId);
        if (!spell) return ruleError('missing-spell', `Spellcasting provider ${definition.name} references an unresolved spell: ${spellId}`, spellId);
        spells.push(spell);
      }
      management = { kind: 'granted-only' };
    } else {
      const catalogSpells = registry.getAll('spell').filter((spell) => onProviderList(spell, spellManagement.spellListId));
      if (spellManagement.kind === 'prepared-from-list') {
        management = {
          kind: 'prepared-from-list',
          spellListId: spellManagement.spellListId,
          cantripCount: countAtLevel(spellManagement.cantripCount),
          preparedSpellCount: countAtLevel(spellManagement.preparedSpellCount),
          replacement: spellManagement.replacement,
          catalogSpells,
        };
      } else {
        const selectedCantrips = resolveSelectedSpells(selection?.cantripIds ?? [], (spell) => spell.level === 0 && onProviderList(spell, spellManagement.spellListId));
        const ownedSpells = resolveSelectedSpells(selection?.ownedSpellIds ?? [], (spell) => spell.level > 0 && onProviderList(spell, spellManagement.spellListId));
        const ownedIds = new Set(ownedSpells.map((spell) => spell.id));
        const preparedSpells = resolveSelectedSpells(selection?.preparedSpellIds ?? [], (spell) => ownedIds.has(spell.id));
        for (const spell of [...selectedCantrips, ...preparedSpells]) if (!spells.some((candidate) => candidate.id === spell.id)) spells.push(spell);
        management = {
          kind: 'prepared-from-owned',
          spellListId: spellManagement.spellListId,
          cantripCount: countAtLevel(spellManagement.cantripCount),
          preparedSpellCount: countAtLevel(spellManagement.preparedSpellCount),
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
    if (definition.slotPool) {
      const row = progressionAtLevel(definition, level);
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

  return ruleOk({ providers, resources: [...resources.values()] });
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
