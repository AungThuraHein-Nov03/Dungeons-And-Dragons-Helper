import { ABILITY_KEYS, isSkillId, type AbilityKey, type Character, type SkillId } from '../models/character';
import type { DamageAmount } from '../models/content';
import type { ContentId } from '../models/contentId';
import { doubleDiceForCritical, mergeD20RollContexts, rollRequest, systemRandom } from '../dice/diceEngine';
import type { D20RollContext, RandomSource, RollDiceTransformation, RollExpression, RollMode, RollRequest, RollResult, RollStateEffect } from '../dice/types';
import { calculateConcentrationSaveDc } from '../rules/concentration';
import { deriveActiveSelfEffectD20Context, deriveActiveSelfEffectWeaponDamageBonus } from '../rules/activeSelfEffects';
import { consumeResourceConsumer, spendHitDie } from '../rules/playState';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { deriveStaticD20Context, deriveWeaponCriticalThreshold, resolveCharacterDiceTransformations } from '../rules/m13eRules';
import { ruleError, ruleOk, type RuleResult } from '../rules/result';
import type { WeaponDamageMode } from '../rules/types';
import { SKILL_DEFINITIONS } from '../rules/skills';
import type { ContentRegistry } from './contentRegistry';
import { contentRegistry } from './contentRegistry';
import { getCharacterById, updateCharacterPlayState } from './characterStorage';
import { addRollHistory } from './rollHistory';

const ABILITY_NAMES: Record<AbilityKey, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma',
};

export interface CharacterRollOutcome {
  readonly roll: RollResult;
  readonly character?: Character;
}

export interface ConcentrationSaveOutcome extends CharacterRollOutcome {
  readonly dc: number;
  readonly success: boolean;
}

export interface CharacterRollOptions {
  readonly rng?: RandomSource;
  readonly characterStorage?: Storage;
  readonly historyStorage?: Storage;
  readonly registry?: ContentRegistry;
  readonly d20Context?: D20RollContext;
  readonly activeEffectIds?: readonly ContentId[];
  readonly now?: () => Date;
}

function browserStorage(): Storage {
  return window.localStorage;
}

function resolveOptions(options: CharacterRollOptions) {
  return {
    rng: options.rng ?? systemRandom,
    characterStorage: options.characterStorage ?? browserStorage(),
    historyStorage: options.historyStorage ?? browserStorage(),
    registry: options.registry ?? contentRegistry,
    d20Context: options.d20Context,
    activeEffectIds: options.activeEffectIds ?? [],
    now: options.now ?? (() => new Date()),
  };
}

function loadCharacterState(characterId: string, options: ReturnType<typeof resolveOptions>) {
  const character = getCharacterById(characterId, options.characterStorage, options.registry);
  if (!character) return ruleError('missing-character', `Character not found: ${characterId}`);
  const derived = deriveCharacterState(character, options.registry);
  if (!derived.ok) return derived;
  return ruleOk({ character, derived: derived.value });
}

function recordRoll(result: RollResult, options: ReturnType<typeof resolveOptions>): CharacterRollOutcome {
  addRollHistory(result, options.historyStorage, options.now);
  return { roll: result };
}

function performStatelessRoll(request: RollRequest, options: ReturnType<typeof resolveOptions>): RuleResult<CharacterRollOutcome> {
  const rolled = rollRequest(request, options.rng);
  if (!rolled.ok) return rolled;
  return ruleOk(recordRoll(rolled.value, options));
}

function d20Request(
  characterId: string,
  label: string,
  type: RollRequest['type'],
  modifier: number,
  mode: RollMode,
  source: Omit<RollRequest['source'], 'characterId'>,
  outcome: RollRequest['outcome'],
  d20Context?: D20RollContext,
  diceTransformations?: readonly RollDiceTransformation[],
  criticalThreshold?: number,
): RollRequest {
  return {
    type,
    label,
    expression: { kind: 'dice', dice: [{ quantity: 1, die: 20 }], modifier },
    mode,
    ...(d20Context ? { d20Context } : {}),
    ...(diceTransformations?.length ? { diceTransformations } : {}),
    ...(criticalThreshold !== undefined ? { criticalThreshold } : {}),
    source: { ...source, characterId },
    outcome,
  };
}

export function rollAbilityCheck(
  characterId: string,
  ability: AbilityKey,
  mode: RollMode = 'normal',
  rawOptions: CharacterRollOptions = {},
): RuleResult<CharacterRollOutcome> {
  if (!ABILITY_KEYS.includes(ability)) return ruleError('invalid-roll-request', `Unknown ability: ${ability}`);
  const options = resolveOptions(rawOptions);
  const loaded = loadCharacterState(characterId, options);
  if (!loaded.ok) return loaded;
  const diceTransformations = resolveCharacterDiceTransformations(loaded.value.derived, { kind: 'd20-test' });
  return performStatelessRoll(
    d20Request(characterId, `${ABILITY_NAMES[ability]} Check`, 'ability-check', loaded.value.derived.abilityModifiers[ability], mode, { ability }, { kind: 'check' }, mergeD20RollContexts(deriveActiveSelfEffectD20Context(loaded.value.derived, options.activeEffectIds, { kind: 'ability-check', ability }), options.d20Context), diceTransformations),
    options,
  );
}

export function rollSkillCheck(
  characterId: string,
  skillId: SkillId,
  mode: RollMode = 'normal',
  rawOptions: CharacterRollOptions = {},
): RuleResult<CharacterRollOutcome> {
  if (!isSkillId(skillId)) return ruleError('unknown-skill', `Unknown skill: ${skillId}`);
  const options = resolveOptions(rawOptions);
  const loaded = loadCharacterState(characterId, options);
  if (!loaded.ok) return loaded;
  const skill = loaded.value.derived.skills[skillId];
  if (!skill) return ruleError('unknown-skill', `Unknown skill: ${skillId}`);
  const d20Context = mergeD20RollContexts(
    deriveStaticD20Context(loaded.value.derived.ruleEffectSources, { kind: 'skill-check', skillId }),
    deriveActiveSelfEffectD20Context(loaded.value.derived, options.activeEffectIds, { kind: 'ability-check', ability: skill.ability }),
    options.d20Context,
  );
  const diceTransformations = resolveCharacterDiceTransformations(loaded.value.derived, { kind: 'skill-check', proficient: skill.proficient });
  return performStatelessRoll(
    d20Request(characterId, `Skill Check — ${SKILL_DEFINITIONS[skillId].name}`, 'skill-check', skill.modifier, mode, { skillId, ability: skill.ability }, { kind: 'check' }, d20Context, diceTransformations),
    options,
  );
}

export function rollSavingThrow(
  characterId: string,
  ability: AbilityKey,
  mode: RollMode = 'normal',
  rawOptions: CharacterRollOptions = {},
): RuleResult<CharacterRollOutcome> {
  if (!ABILITY_KEYS.includes(ability)) return ruleError('unknown-saving-throw', `Unknown saving throw: ${ability}`);
  const options = resolveOptions(rawOptions);
  const loaded = loadCharacterState(characterId, options);
  if (!loaded.ok) return loaded;
  const save = loaded.value.derived.savingThrows[ability];
  if (!save) return ruleError('unknown-saving-throw', `Unknown saving throw: ${ability}`);
  const d20Context = mergeD20RollContexts(
    deriveStaticD20Context(loaded.value.derived.ruleEffectSources, { kind: 'saving-throw', ability }),
    deriveActiveSelfEffectD20Context(loaded.value.derived, options.activeEffectIds, { kind: 'saving-throw', ability }),
    options.d20Context,
  );
  const diceTransformations = resolveCharacterDiceTransformations(loaded.value.derived, { kind: 'd20-test' });
  return performStatelessRoll(
    d20Request(characterId, `Saving Throw — ${ABILITY_NAMES[ability]}`, 'saving-throw', save.modifier, mode, { ability }, { kind: 'save' }, d20Context, diceTransformations),
    options,
  );
}

export function rollConcentrationSavingThrow(
  characterId: string,
  damageTaken: number,
  mode: RollMode = 'normal',
  rawOptions: CharacterRollOptions = {},
): RuleResult<ConcentrationSaveOutcome> {
  const dc = calculateConcentrationSaveDc(damageTaken);
  if (!dc.ok) return dc;
  const options = resolveOptions(rawOptions);
  const loaded = loadCharacterState(characterId, options);
  if (!loaded.ok) return loaded;
  const save = loaded.value.derived.savingThrows.constitution;
  const d20Context = mergeD20RollContexts(
    deriveStaticD20Context(loaded.value.derived.ruleEffectSources, { kind: 'saving-throw', ability: 'constitution' }),
    deriveActiveSelfEffectD20Context(loaded.value.derived, options.activeEffectIds, { kind: 'saving-throw', ability: 'constitution' }),
    options.d20Context,
  );
  const diceTransformations = resolveCharacterDiceTransformations(loaded.value.derived, { kind: 'd20-test' });
  const rolled = performStatelessRoll(
    d20Request(characterId, `Concentration Save · DC ${dc.value}`, 'saving-throw', save.modifier, mode, { ability: 'constitution' }, { kind: 'save' }, d20Context, diceTransformations),
    options,
  );
  if (!rolled.ok) return rolled;
  return ruleOk({ ...rolled.value, dc: dc.value, success: rolled.value.roll.total >= dc.value });
}

export function rollInitiative(
  characterId: string,
  mode: RollMode = 'normal',
  rawOptions: CharacterRollOptions = {},
): RuleResult<CharacterRollOutcome> {
  const options = resolveOptions(rawOptions);
  const loaded = loadCharacterState(characterId, options);
  if (!loaded.ok) return loaded;
  const initiative = loaded.value.derived.initiative;
  const derivedContext: D20RollContext = {
    ...(initiative.contributions.length > 0 ? { modifiers: initiative.contributions } : {}),
    ...(initiative.advantageSources.length > 0 ? { advantageSources: initiative.advantageSources } : {}),
    ...(initiative.disadvantageSources.length > 0 ? { disadvantageSources: initiative.disadvantageSources } : {}),
  };
  const d20Context = mergeD20RollContexts(derivedContext, deriveActiveSelfEffectD20Context(loaded.value.derived, options.activeEffectIds, { kind: 'ability-check', ability: 'dexterity' }), options.d20Context);
  const diceTransformations = resolveCharacterDiceTransformations(loaded.value.derived, { kind: 'd20-test' });
  return performStatelessRoll(
    d20Request(characterId, 'Initiative', 'initiative', initiative.baseModifier, mode, { ability: 'dexterity' }, { kind: 'check' }, d20Context, diceTransformations),
    options,
  );
}

export function rollWeaponAttack(
  characterId: string,
  weaponId: ContentId,
  mode: RollMode = 'normal',
  rawOptions: CharacterRollOptions = {},
): RuleResult<CharacterRollOutcome> {
  const options = resolveOptions(rawOptions);
  const loaded = loadCharacterState(characterId, options);
  if (!loaded.ok) return loaded;
  const attack = loaded.value.derived.attacks.find((candidate) => candidate.weaponId === weaponId);
  if (!attack) return ruleError('missing-derived-attack', `No derived attack is available for weapon: ${weaponId}`, weaponId);
  const diceTransformations = resolveCharacterDiceTransformations(loaded.value.derived, { kind: 'd20-test' });
  const criticalThreshold = deriveWeaponCriticalThreshold(loaded.value.derived);
  return performStatelessRoll(
    d20Request(characterId, `${attack.name} Attack`, 'attack', attack.attackModifier, mode, { weaponId }, { kind: 'attack' }, mergeD20RollContexts(deriveActiveSelfEffectD20Context(loaded.value.derived, options.activeEffectIds, { kind: 'weapon-attack', ability: attack.attackAbility }), options.d20Context), diceTransformations, criticalThreshold),
    options,
  );
}

function damageExpression(damage: DamageAmount, modifier: number): RollExpression {
  return damage.kind === 'dice'
    ? { kind: 'dice', dice: [{ quantity: damage.count, die: damage.die }], modifier }
    : { kind: 'fixed', amount: damage.amount, modifier };
}

export function rollWeaponDamage(
  characterId: string,
  weaponId: ContentId,
  damageMode?: WeaponDamageMode,
  critical = false,
  rawOptions: CharacterRollOptions = {},
): RuleResult<CharacterRollOutcome> {
  const options = resolveOptions(rawOptions);
  const loaded = loadCharacterState(characterId, options);
  if (!loaded.ok) return loaded;
  const attack = loaded.value.derived.attacks.find((candidate) => candidate.weaponId === weaponId);
  if (!attack) return ruleError('missing-derived-attack', `No derived attack is available for weapon: ${weaponId}`, weaponId);
  const damage = damageMode
    ? attack.damageConfigurations.find((candidate) => candidate.mode === damageMode)
    : attack.damageConfigurations[0];
  if (!damage) return ruleError('invalid-damage-mode', `${damageMode} is not a valid damage mode for ${attack.name}.`, weaponId);
  const activeBonus = deriveActiveSelfEffectWeaponDamageBonus(loaded.value.derived, options.activeEffectIds, attack.attackAbility);
  const normalExpression = damageExpression(damage.base, damage.abilityModifier + activeBonus);
  const diceTransformations = resolveCharacterDiceTransformations(loaded.value.derived, { kind: 'weapon-damage', attack, damageMode: damage.mode });
  const request: RollRequest = {
    type: 'damage',
    label: `${attack.name} Damage${critical ? ' — Critical' : ''}`,
    expression: critical ? doubleDiceForCritical(normalExpression) : normalExpression,
    mode: 'normal',
    ...(diceTransformations.length > 0 ? { diceTransformations } : {}),
    source: { characterId, weaponId },
    outcome: { kind: 'damage', damageType: damage.damageType },
  };
  return performStatelessRoll(request, options);
}

function withEffects(result: RollResult, effects: readonly RollStateEffect[]): RollResult {
  return { ...result, effects };
}

function persistStatefulRoll(
  characterId: string,
  nextPlayState: Character['playState'],
  result: RollResult,
  options: ReturnType<typeof resolveOptions>,
): RuleResult<CharacterRollOutcome> {
  const updated = updateCharacterPlayState(characterId, nextPlayState, options.characterStorage);
  if (!updated) return ruleError('missing-character', `Character not found: ${characterId}`);
  addRollHistory(result, options.historyStorage, options.now);
  return ruleOk({ roll: result, character: updated });
}

export function rollHealingResource(
  characterId: string,
  resourceId: ContentId,
  consumerId: ContentId,
  rawOptions: CharacterRollOptions = {},
): RuleResult<CharacterRollOutcome> {
  const options = resolveOptions(rawOptions);
  const loaded = loadCharacterState(characterId, options);
  if (!loaded.ok) return loaded;
  const { character, derived } = loaded.value;
  const resource = derived.resources.find((candidate) => candidate.id === resourceId);
  if (!resource) return ruleError('unknown-resource', `Unknown resource: ${resourceId}`, resourceId);
  const consumer = resource.consumers.find((candidate) => candidate.id === consumerId);
  if (!consumer) return ruleError('unknown-resource-consumer', `Unknown use of ${resource.name}.`, consumerId);
  if (consumer.effect.type !== 'manual-healing') {
    return ruleError('invalid-roll-request', `${consumer.name} is not a dice-driven healing resource.`, consumerId);
  }
  const beforeResource = character.playState.resourceUses[resourceId] ?? 0;
  if (beforeResource <= 0) return ruleError('resource-depleted', `${resource.name} has no remaining uses.`, resourceId);
  const bonus = consumer.effect.bonus === 'class-level' ? character.level : 0;
  const request: RollRequest = {
    type: 'healing',
    label: consumer.name,
    expression: { kind: 'dice', dice: [{ quantity: 1, die: consumer.effect.die }], modifier: bonus },
    mode: 'normal',
    source: { characterId, resourceId, consumerId, contentId: consumer.id },
    outcome: { kind: 'healing' },
  };
  const rolled = rollRequest(request, options.rng);
  if (!rolled.ok) return rolled;
  const rawDie = rolled.value.dice[0]?.values[0];
  if (!rawDie) return ruleError('invalid-roll-request', 'Healing roll did not produce a die result.');
  const transitioned = consumeResourceConsumer(
    character.playState,
    resourceId,
    consumerId,
    derived.resources,
    { manualRoll: rawDie, classLevel: character.level, maximumHp: derived.health.maximumHp },
  );
  if (!transitioned.ok) return transitioned;
  const effects: RollStateEffect[] = [
    { kind: 'hp', before: character.playState.currentHp, after: transitioned.value.currentHp },
    { kind: 'resource', resourceId, before: beforeResource, after: transitioned.value.resourceUses[resourceId] ?? 0 },
  ];
  return persistStatefulRoll(characterId, transitioned.value, withEffects(rolled.value, effects), options);
}

export function rollHitDie(
  characterId: string,
  rawOptions: CharacterRollOptions = {},
): RuleResult<CharacterRollOutcome> {
  const options = resolveOptions(rawOptions);
  const loaded = loadCharacterState(characterId, options);
  if (!loaded.ok) return loaded;
  const { character, derived } = loaded.value;
  if (character.playState.currentHp < 1) return ruleError('rest-unavailable', 'A Short Rest requires at least 1 Hit Point.');
  if (character.playState.hitDiceRemaining <= 0) return ruleError('unavailable-hit-die', 'No Hit Dice remain to spend.');
  const request: RollRequest = {
    type: 'hit-die',
    label: `Hit Die — d${derived.health.hitDie}`,
    expression: { kind: 'dice', dice: [{ quantity: 1, die: derived.health.hitDie }], modifier: derived.abilityModifiers.constitution },
    mode: 'normal',
    source: { characterId, contentId: character.classId },
    outcome: { kind: 'healing' },
  };
  const rolled = rollRequest(request, options.rng);
  if (!rolled.ok) return rolled;
  const rawDie = rolled.value.dice[0]?.values[0];
  if (!rawDie) return ruleError('invalid-roll-request', 'Hit Die roll did not produce a die result.');
  const transitioned = spendHitDie(character.playState, rawDie, derived.abilityModifiers.constitution, derived.health);
  if (!transitioned.ok) return transitioned;
  const effects: RollStateEffect[] = [
    { kind: 'hp', before: character.playState.currentHp, after: transitioned.value.currentHp },
    { kind: 'hit-dice', before: character.playState.hitDiceRemaining, after: transitioned.value.hitDiceRemaining },
  ];
  return persistStatefulRoll(characterId, transitioned.value, withEffects(rolled.value, effects), options);
}
