import type { Character } from '../models/character';
import type { LeveledSpellLevel } from '../models/content';
import type { ContentId } from '../models/contentId';
import { doubleDiceForCritical, mergeD20RollContexts, rollRequest, systemRandom } from '../dice/diceEngine';
import type { D20RollContext, RandomSource, RollExpression, RollMode, RollRequest, RollResult } from '../dice/types';
import { deriveActiveSelfEffectD20Context } from '../rules/activeSelfEffects';
import { getTotalCharacterLevel } from '../rules/characterProgression';
import { resolveCharacterDiceTransformations } from '../rules/m13eRules';
import { deriveSpellRollAmount, resolveLegalSpellSlotSources, resolveSpellSlotResource, resolveSpellcastingProviderSpell, type SpellRollMechanic, type SpellSlotSourceSelection } from '../rules/spellcasting';
import { ruleError, ruleOk, type RuleResult } from '../rules/result';
import type { DerivedCharacterState } from '../rules/types';
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
  readonly slotSource?: SpellSlotSourceSelection;
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
  const resolved = resolveSpellcastingProviderSpell(state, providerId, spellId);
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
  const resolved = resolveSpellcastingProviderSpell(state, providerId, spellId);
  if (!resolved.ok) return resolved;
  const { provider, spell } = resolved.value;
  const mechanic = spell.mechanics.find((candidate): candidate is SpellRollMechanic => candidate.type === mechanicType);
  if (!mechanic) return ruleError('invalid-spell-mechanic', `${spell.name} has no supported ${mechanicType} roll.`, spell.id);
  const amount = deriveSpellRollAmount(spell, mechanic, getTotalCharacterLevel(character), slotLevel, provider.abilityModifier);
  if (!amount.ok) return amount;

  let slotResourceId: ContentId | undefined;
  if (rawOptions.slotSource) {
    const selectedSource = resolveSpellSlotResource(state, provider.id, spell.id, slotLevel, rawOptions.slotSource);
    if (!selectedSource.ok) return selectedSource;
    slotResourceId = selectedSource.value?.resourceId;
  } else if (spell.level > 0) {
    const legalSources = resolveLegalSpellSlotSources(state, provider.id, spell.id, slotLevel);
    if (!legalSources.ok) return legalSources;
    if (legalSources.value.length === 0) {
      return ruleError('invalid-spell-slot', `No legal spell slot is available for ${spell.name} at level ${slotLevel}.`, spell.id);
    }
    if (legalSources.value.length === 1) slotResourceId = legalSources.value[0].resourceId;
  }

  const normalExpression: RollExpression = { kind: 'dice', dice: amount.value.dice.map((term) => ({ quantity: term.count, die: term.die })), modifier: amount.value.modifier };
  const expression = critical ? doubleDiceForCritical(normalExpression) : normalExpression;
  const isDamage = mechanic.type === 'damage';
  return perform({
    type: isDamage ? 'damage' : 'healing',
    label: `${spell.name} — ${isDamage ? 'Damage' : 'Healing'}${critical ? ' — Critical' : ''}${slotLevel ? ` · Level ${slotLevel}` : ''}`,
    expression,
    mode: 'normal',
    source: spellSource(character.id, provider.id, spell.id, slotResourceId),
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
