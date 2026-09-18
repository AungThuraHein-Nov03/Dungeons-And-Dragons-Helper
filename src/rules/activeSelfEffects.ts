import type { AbilityKey } from '../models/character';
import type { ActiveSelfEffectAmount, ActiveSelfEffectDefinition, ResourceRecoveryTrigger } from '../models/content';
import type { ContentId } from '../models/contentId';
import type { D20RollContext } from '../dice/types';
import type { CharacterConditionId } from './conditions';
import { ruleError, ruleOk, type RuleResult } from './result';
import type { DerivedActiveSelfEffect, DerivedCharacterState, DerivedSpellcastingProvider } from './types';

export interface ActiveSelfEffectGrant {
  readonly definition: ActiveSelfEffectDefinition;
  readonly grantedBy: { readonly contentId: ContentId; readonly contentName: string };
}

export type ActiveSelfEffectD20Query =
  | { readonly kind: 'ability-check'; readonly ability: AbilityKey }
  | { readonly kind: 'saving-throw'; readonly ability: AbilityKey }
  | { readonly kind: 'weapon-attack'; readonly ability: AbilityKey }
  | { readonly kind: 'spell-attack'; readonly providerId: ContentId };

export function deriveActiveSelfEffects(grants: readonly ActiveSelfEffectGrant[]): RuleResult<readonly DerivedActiveSelfEffect[]> {
  const ids = new Set<ContentId>();
  const effects: DerivedActiveSelfEffect[] = [];
  for (const grant of grants) {
    if (ids.has(grant.definition.id)) return ruleError('duplicate-active-self-effect', `Duplicate active self-effect id: ${grant.definition.id}`, grant.definition.id);
    ids.add(grant.definition.id);
    effects.push({ ...grant.definition, grantedBy: grant.grantedBy });
  }
  return ruleOk(effects);
}

export function resolveActiveSelfEffects(
  state: DerivedCharacterState,
  activeEffectIds: readonly ContentId[],
): readonly DerivedActiveSelfEffect[] {
  const active = new Set(activeEffectIds);
  return state.activeSelfEffects.filter((effect) => active.has(effect.id));
}

function amountAtLevel(amount: ActiveSelfEffectAmount, level: number): number {
  if (amount.kind === 'fixed') return amount.amount;
  return [...amount.values].filter((row) => row.level <= level).sort((a, b) => b.level - a.level)[0]?.amount ?? 0;
}

// Kept separate from the public resolver so content matching remains data-driven and bounded.
function modifierMatches(
  modifier: NonNullable<ActiveSelfEffectDefinition['modifiers']>[number],
  query: ActiveSelfEffectD20Query,
): boolean {
  if (modifier.type !== 'd20-roll-mode') return false;
  const target = modifier.target;
  if (target.kind !== query.kind) return false;
  if (target.kind === 'spell-attack' && query.kind === 'spell-attack') return target.providerIds.includes(query.providerId);
  if (target.kind !== 'spell-attack' && query.kind !== 'spell-attack') return target.abilities.includes(query.ability);
  return false;
}

export function deriveActiveSelfEffectD20Context(
  state: DerivedCharacterState,
  activeEffectIds: readonly ContentId[],
  query: ActiveSelfEffectD20Query,
): D20RollContext | undefined {
  const advantageSources: string[] = [];
  const disadvantageSources: string[] = [];
  for (const effect of resolveActiveSelfEffects(state, activeEffectIds)) {
    for (const modifier of effect.modifiers ?? []) {
      if (!modifierMatches(modifier, query) || modifier.type !== 'd20-roll-mode') continue;
      const sources = modifier.mode === 'advantage' ? advantageSources : disadvantageSources;
      if (!sources.includes(effect.name)) sources.push(effect.name);
    }
  }
  if (advantageSources.length === 0 && disadvantageSources.length === 0) return undefined;
  return {
    ...(advantageSources.length > 0 ? { advantageSources } : {}),
    ...(disadvantageSources.length > 0 ? { disadvantageSources } : {}),
  };
}

export function deriveActiveSelfEffectWeaponDamageBonus(
  state: DerivedCharacterState,
  activeEffectIds: readonly ContentId[],
  attackAbility: AbilityKey,
): number {
  return resolveActiveSelfEffects(state, activeEffectIds).reduce((total, effect) => total + (effect.modifiers ?? []).reduce((subtotal, modifier) => {
    if (modifier.type !== 'weapon-damage-bonus' || !modifier.abilities.includes(attackAbility)) return subtotal;
    return subtotal + amountAtLevel(modifier.amount, state.level);
  }, 0), 0);
}

export function deriveActiveSelfEffectSpellSaveDc(
  provider: DerivedSpellcastingProvider,
  state: DerivedCharacterState,
  activeEffectIds: readonly ContentId[],
): number {
  const bonus = resolveActiveSelfEffects(state, activeEffectIds).reduce((total, effect) => total + (effect.modifiers ?? []).reduce((subtotal, modifier) => {
    if (modifier.type !== 'spell-save-dc-bonus' || !modifier.providerIds.includes(provider.id)) return subtotal;
    return subtotal + modifier.amount;
  }, 0), 0);
  return provider.saveDc + bonus;
}

export function activeSelfEffectsBlockConcentration(
  state: DerivedCharacterState,
  activeEffectIds: readonly ContentId[],
): boolean {
  return resolveActiveSelfEffects(state, activeEffectIds).some((effect) =>
    (effect.restrictions ?? []).some((restriction) => restriction.type === 'concentration' && restriction.mode === 'end-and-block'));
}

export function activeSelfEffectsBlockSpellcasting(
  state: DerivedCharacterState,
  activeEffectIds: readonly ContentId[],
): boolean {
  return resolveActiveSelfEffects(state, activeEffectIds).some((effect) =>
    (effect.restrictions ?? []).some((restriction) => restriction.type === 'spellcasting' && restriction.mode === 'block'));
}

export function activeSelfEffectEligibilityError(
  effect: DerivedActiveSelfEffect,
  state: DerivedCharacterState,
): string | undefined {
  for (const eligibility of effect.eligibility ?? []) {
    if (eligibility.type === 'not-wearing-armor-category' && state.defense.armor?.category === eligibility.category) {
      return `${effect.name} cannot be activated while wearing ${eligibility.category} armor.`;
    }
  }
  return undefined;
}

export function activeSelfEffectShouldTerminate(
  effect: DerivedActiveSelfEffect,
  state: DerivedCharacterState,
  conditions: readonly CharacterConditionId[],
): boolean {
  return (effect.termination ?? []).some((termination) => {
    if (termination.type === 'condition') return conditions.includes(termination.condition);
    return state.defense.armor?.category === termination.category;
  });
}

export function reconcileActiveSelfEffectIds(
  state: DerivedCharacterState,
  activeEffectIds: readonly ContentId[],
  conditions: readonly CharacterConditionId[],
): ContentId[] {
  const requested = new Set(activeEffectIds);
  return state.activeSelfEffects
    .filter((effect) => requested.has(effect.id) && !activeSelfEffectShouldTerminate(effect, state, conditions))
    .map((effect) => effect.id);
}

export function clearActiveSelfEffectsForRest(
  state: DerivedCharacterState,
  activeEffectIds: readonly ContentId[],
  trigger: ResourceRecoveryTrigger,
): ContentId[] {
  const active = new Set(activeEffectIds);
  return state.activeSelfEffects
    .filter((effect) => active.has(effect.id) && effect.clearOnRest !== trigger)
    .map((effect) => effect.id);
}
