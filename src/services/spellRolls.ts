import type { Character } from '../models/character';
import type { LeveledSpellLevel, SpellContent } from '../models/content';
import type { ContentId } from '../models/contentId';
import { doubleDiceForCritical, mergeD20RollContexts, rollRequest, systemRandom } from '../dice/diceEngine';
import type { D20RollContext, RandomSource, RollExpression, RollMode, RollRequest, RollResult } from '../dice/types';
import { deriveActiveSelfEffectD20Context } from '../rules/activeSelfEffects';
import { resolveCharacterDiceTransformations } from '../rules/m13eRules';
import { deriveSpellRollAmount, type SpellRollMechanic } from '../rules/spellcasting';
import { ruleError, ruleOk, type RuleResult } from '../rules/result';
import type { DerivedCharacterState, DerivedSpellcastingProvider } from '../rules/types';
import { addRollHistory } from './rollHistory';

export interface SpellRollOutcome {
  readonly roll: RollResult;
}

export interface SpellRollOptions {
  readonly rng?: RandomSource;
  readonly historyStorage?: Storage;
  readonly d20Context?: D20RollContext;
  readonly activeEffectIds?: readonly ContentId[];
  readonly now?: () => Date;
}

function browserStorage(): Storage {
  return window.localStorage;
}

function resolveOptions(options: SpellRollOptions) {
  return {
    rng: options.rng ?? systemRandom,
    historyStorage: options.historyStorage ?? browserStorage(),
    d20Context: options.d20Context,
    activeEffectIds: options.activeEffectIds ?? [],
    now: options.now ?? (() => new Date()),
  };
}

function resolveProviderAndSpell(
  state: DerivedCharacterState,
  providerId: ContentId,
  spellId: ContentId,
): RuleResult<{ provider: DerivedSpellcastingProvider; spell: SpellContent }> {
  const provider = state.spellcasting.find((candidate) => candidate.id === providerId);
  if (!provider) return ruleError('missing-spellcasting-provider', `Spellcasting provider could not be resolved: ${providerId}`, providerId);
  const spell = provider.spells.find((candidate) => candidate.id === spellId);
  if (!spell) return ruleError('missing-spell', `${provider.name} does not grant spell: ${spellId}`, spellId);
  return ruleOk({ provider, spell });
}

export function resolveSpellSlotResource(
  provider: DerivedSpellcastingProvider,
  spell: SpellContent,
  slotLevel: LeveledSpellLevel | undefined,
): RuleResult<ContentId | undefined> {
  if (spell.level === 0) {
    return slotLevel === undefined
      ? ruleOk(undefined)
      : ruleError('invalid-spell-slot', `${spell.name} is a cantrip and does not use a spell slot.`, spell.id);
  }
  if (!slotLevel || slotLevel < spell.level) return ruleError('invalid-spell-slot', `${spell.name} requires a spell slot of level ${spell.level} or higher.`, spell.id);
  const slot = provider.slotPool?.slots.find((candidate) => candidate.spellLevel === slotLevel);
  return slot
    ? ruleOk(slot.resourceId)
    : ruleError('invalid-spell-slot', `${provider.name} has no level ${slotLevel} spell slot.`, provider.id);
}

function spellSource(characterId: string, providerId: ContentId, spellId: ContentId, slotResourceId?: ContentId): RollRequest['source'] {
  return {
    characterId,
    spellId,
    spellcastingProviderId: providerId,
    contentId: spellId,
    ...(slotResourceId ? { spellSlotResourceId: slotResourceId } : {}),
  };
}

function perform(request: RollRequest, rawOptions: SpellRollOptions): RuleResult<SpellRollOutcome> {
  const options = resolveOptions(rawOptions);
  const rolled = rollRequest(request, options.rng);
  if (!rolled.ok) return rolled;
  addRollHistory(rolled.value, options.historyStorage, options.now);
  return ruleOk({ roll: rolled.value });
}

export function rollSpellAttack(
  character: Character,
  state: DerivedCharacterState,
  providerId: ContentId,
  spellId: ContentId,
  mode: RollMode = 'normal',
  rawOptions: SpellRollOptions = {},
): RuleResult<SpellRollOutcome> {
  const resolved = resolveProviderAndSpell(state, providerId, spellId);
  if (!resolved.ok) return resolved;
  const { provider, spell } = resolved.value;
  if (!spell.mechanics.some((mechanic) => mechanic.type === 'spell-attack')) return ruleError('invalid-spell-mechanic', `${spell.name} does not use a spell attack roll.`, spell.id);
  const activeContext = deriveActiveSelfEffectD20Context(state, rawOptions.activeEffectIds ?? [], { kind: 'spell-attack', providerId: provider.id });
  const d20Context = mergeD20RollContexts(activeContext, rawOptions.d20Context);
  const diceTransformations = resolveCharacterDiceTransformations(state, { kind: 'd20-test' });
  return perform({
    type: 'attack',
    label: `${spell.name} — Spell Attack`,
    expression: { kind: 'dice', dice: [{ quantity: 1, die: 20 }], modifier: provider.attackModifier },
    mode,
    ...(d20Context ? { d20Context } : {}),
    ...(diceTransformations.length > 0 ? { diceTransformations } : {}),
    source: spellSource(character.id, provider.id, spell.id),
    outcome: { kind: 'attack' },
  }, rawOptions);
}

function rollMechanic(
  character: Character,
  state: DerivedCharacterState,
  providerId: ContentId,
  spellId: ContentId,
  mechanicType: SpellRollMechanic['type'],
  slotLevel: LeveledSpellLevel | undefined,
  critical: boolean,
  rawOptions: SpellRollOptions,
): RuleResult<SpellRollOutcome> {
  const resolved = resolveProviderAndSpell(state, providerId, spellId);
  if (!resolved.ok) return resolved;
  const { provider, spell } = resolved.value;
  const mechanic = spell.mechanics.find((candidate): candidate is SpellRollMechanic => candidate.type === mechanicType);
  if (!mechanic) return ruleError('invalid-spell-mechanic', `${spell.name} has no supported ${mechanicType} roll.`, spell.id);
  const slotResource = resolveSpellSlotResource(provider, spell, slotLevel);
  if (!slotResource.ok) return slotResource;
  const amount = deriveSpellRollAmount(spell, mechanic, character.level, slotLevel, provider.abilityModifier);
  if (!amount.ok) return amount;
  const normalExpression: RollExpression = { kind: 'dice', dice: amount.value.dice.map((term) => ({ quantity: term.count, die: term.die })), modifier: amount.value.modifier };
  const expression = critical ? doubleDiceForCritical(normalExpression) : normalExpression;
  const isDamage = mechanic.type === 'damage';
  return perform({
    type: isDamage ? 'damage' : 'healing',
    label: `${spell.name} — ${isDamage ? 'Damage' : 'Healing'}${critical ? ' — Critical' : ''}${slotLevel ? ` · Level ${slotLevel}` : ''}`,
    expression,
    mode: 'normal',
    source: spellSource(character.id, provider.id, spell.id, slotResource.value),
    outcome: isDamage ? { kind: 'damage', damageType: mechanic.damageType } : { kind: 'healing' },
  }, rawOptions);
}

export function rollSpellDamage(
  character: Character,
  state: DerivedCharacterState,
  providerId: ContentId,
  spellId: ContentId,
  slotLevel?: LeveledSpellLevel,
  critical = false,
  rawOptions: SpellRollOptions = {},
): RuleResult<SpellRollOutcome> {
  return rollMechanic(character, state, providerId, spellId, 'damage', slotLevel, critical, rawOptions);
}

export function rollSpellHealing(
  character: Character,
  state: DerivedCharacterState,
  providerId: ContentId,
  spellId: ContentId,
  slotLevel?: LeveledSpellLevel,
  rawOptions: SpellRollOptions = {},
): RuleResult<SpellRollOutcome> {
  return rollMechanic(character, state, providerId, spellId, 'healing', slotLevel, false, rawOptions);
}
