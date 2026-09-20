import type { D20RollContext, RollDiceTransformation } from '../dice/types';
import type { Character, SkillId } from '../models/character';
import type { ActiveSelfEffectAmount, CharacterRuleEffect, DiceTransformationTarget } from '../models/content';
import type { ContentRegistry } from '../services/contentRegistry';
import { getTotalCharacterLevel } from './characterProgression';
import { getEquippedBodyArmor, getEquippedShield } from './inventory';
import type { DerivedCharacterState, DerivedRuleEffectSource, DerivedWeaponAttack, WeaponDamageMode } from './types';

export type StaticD20Target =
  | { readonly kind: 'skill-check'; readonly skillId: SkillId }
  | { readonly kind: 'saving-throw'; readonly ability: DerivedCharacterState['savingThrows'][keyof DerivedCharacterState['savingThrows']]['ability'] };

export function deriveStaticD20Context(
  sources: readonly DerivedRuleEffectSource[],
  target: StaticD20Target,
): D20RollContext | undefined {
  const advantageSources: string[] = [];
  const disadvantageSources: string[] = [];

  for (const source of sources) {
    for (const effect of source.effects) {
      if (target.kind === 'skill-check' && effect.type === 'skill-check-advantage' && effect.skillIds.includes(target.skillId)) {
        advantageSources.push(source.name);
      }
      if (target.kind === 'saving-throw' && effect.type === 'saving-throw-roll-mode' && effect.abilities.includes(target.ability)) {
        if (effect.mode === 'advantage') advantageSources.push(source.name);
        else disadvantageSources.push(source.name);
      }
    }
  }

  if (advantageSources.length === 0 && disadvantageSources.length === 0) return undefined;
  return {
    ...(advantageSources.length > 0 ? { advantageSources: [...new Set(advantageSources)] } : {}),
    ...(disadvantageSources.length > 0 ? { disadvantageSources: [...new Set(disadvantageSources)] } : {}),
  };
}

export interface CharacterDiceTransformationOption {
  readonly id: string;
  readonly sourceLabel: string;
  readonly optional: boolean;
  readonly type: 'reroll-once-use-new' | 'minimum-die-face';
  readonly summary: string;
}

function transformationEffects(state: DerivedCharacterState) {
  return state.ruleEffectSources.flatMap((source) =>
    source.effects.flatMap((effect) => effect.type === 'dice-transformation' ? [{ source, effect }] : []),
  );
}

function targetSummary(target: DiceTransformationTarget): string {
  if (target.kind === 'd20-test') return 'D20 Tests';
  if (target.kind === 'skill-check') return target.requireProficiency ? 'Proficient skill checks' : 'Skill checks';
  return 'Qualifying two-handed melee weapon damage';
}

export function listCharacterDiceTransformations(state: DerivedCharacterState): readonly CharacterDiceTransformationOption[] {
  return transformationEffects(state).map(({ source, effect }) => ({
    id: effect.id,
    sourceLabel: source.name,
    optional: effect.optional,
    type: effect.transformation.type,
    summary: targetSummary(effect.target),
  }));
}

export type DiceTransformationRollContext =
  | { readonly kind: 'd20-test' }
  | { readonly kind: 'skill-check'; readonly proficient: boolean }
  | { readonly kind: 'weapon-damage'; readonly attack: DerivedWeaponAttack; readonly damageMode: WeaponDamageMode };

function targetMatches(target: DiceTransformationTarget, context: DiceTransformationRollContext): boolean {
  if (target.kind === 'd20-test') return context.kind === 'd20-test' || context.kind === 'skill-check';
  if (target.kind === 'skill-check') return context.kind === 'skill-check' && (!target.requireProficiency || context.proficient);
  if (context.kind !== 'weapon-damage') return false;
  if (context.attack.useMode !== target.weaponMode) return false;

  const propertyTypes = context.attack.properties.map((property) => property.type);
  if (!target.anyWeaponProperties.some((property) => propertyTypes.includes(property))) return false;

  const hasUnconditionalTwoHanded = context.attack.properties.some((property) => property.type === 'two-handed' && property.condition === undefined);
  const heldWithTwoHands = context.damageMode === 'two-handed' || hasUnconditionalTwoHanded;
  return target.heldWithTwoHands ? heldWithTwoHands : true;
}

export function resolveCharacterDiceTransformations(
  state: DerivedCharacterState,
  context: DiceTransformationRollContext,
): readonly RollDiceTransformation[] {
  return transformationEffects(state).flatMap<RollDiceTransformation>(({ source, effect }) => {
    if (!targetMatches(effect.target, context)) return [];

    if (effect.transformation.type === 'reroll-once-use-new') {
      return [{
        id: effect.id,
        sourceLabel: source.name,
        optional: effect.optional,
        ...effect.transformation,
      } satisfies RollDiceTransformation];
    }

    if (context.kind !== 'weapon-damage') return [];
    const damage = context.attack.damageConfigurations.find((configuration) => configuration.mode === context.damageMode);
    if (!damage || damage.base.kind !== 'dice' || effect.transformation.minimum > damage.base.die) return [];
    return [{
      id: effect.id,
      sourceLabel: source.name,
      optional: effect.optional,
      type: 'minimum-die-face',
      die: damage.base.die,
      minimum: effect.transformation.minimum,
    } satisfies RollDiceTransformation];
  });
}

export function deriveWeaponCriticalThreshold(state: DerivedCharacterState): number {
  return state.ruleEffects
    .filter((effect): effect is Extract<CharacterRuleEffect, { type: 'critical-threshold' }> => effect.type === 'critical-threshold' && effect.attackKind === 'weapon')
    .reduce((threshold, effect) => Math.min(threshold, effect.minimumNatural), 20);
}

function amountAtLevel(amount: ActiveSelfEffectAmount, level: number): number {
  if (amount.kind === 'fixed') return amount.amount;
  let resolved = 0;
  for (const row of amount.values) {
    if (row.level > level) break;
    resolved = row.amount;
  }
  return resolved;
}

export interface DerivedSpeedResult {
  readonly speedFeet: number;
  readonly contributions: readonly { readonly label: string; readonly amount: number }[];
}

export function deriveCharacterSpeed(
  baseSpeedFeet: number,
  character: Character,
  registry: ContentRegistry,
  sources: readonly DerivedRuleEffectSource[],
): DerivedSpeedResult {
  const equippedArmor = getEquippedBodyArmor(character, registry)?.content;
  const equippedShield = getEquippedShield(character, registry)?.content;
  const characterLevel = getTotalCharacterLevel(character);
  const contributions: Array<{ label: string; amount: number }> = [];

  for (const source of sources) {
    for (const effect of source.effects) {
      if (effect.type !== 'speed-bonus') continue;
      if (equippedArmor && equippedArmor.category !== 'shield' && effect.disallowedArmorCategories?.includes(equippedArmor.category)) continue;
      if (equippedShield && effect.requireNoShield) continue;
      const amount = amountAtLevel(effect.amount, source.owner?.level ?? characterLevel);
      if (amount !== 0) contributions.push({ label: source.name, amount });
    }
  }

  if (equippedArmor?.strengthRequirement && character.abilityScores.strength < equippedArmor.strengthRequirement) {
    contributions.push({ label: `${equippedArmor.name} Strength requirement`, amount: -10 });
  }

  const speedFeet = Math.max(0, baseSpeedFeet + contributions.reduce((total, contribution) => total + contribution.amount, 0));
  return { speedFeet, contributions };
}
