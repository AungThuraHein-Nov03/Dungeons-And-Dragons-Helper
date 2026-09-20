import type { Character } from '../models/character';
import type { ContentRegistry } from './contentRegistry';
import { activeSelfEffectEligibilityError } from '../rules/activeSelfEffects';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { ruleError, ruleOk, type RuleResult } from '../rules/result';
import { contentRegistry } from './contentRegistry';
import { expendCharacterResource } from './characterPlayState';
import { getCharacterById } from './characterStorage';
import { loadPlaySessionState, savePlaySessionState, type PlaySessionState } from './playSessionState';
import { createApplicationCharacterSnapshotStorage } from './applicationCharacterMutations';

export interface ActiveSelfEffectMutation {
  readonly character: Character;
  readonly sessionState: PlaySessionState;
}

function browserCharacterStorage(): Storage {
  return createApplicationCharacterSnapshotStorage();
}

function browserSessionStorage(): Storage {
  return window.sessionStorage;
}

export function activateCharacterActiveSelfEffect(
  characterId: string,
  effectId: string,
  characterStorage: Storage = browserCharacterStorage(),
  sessionStorage: Storage = browserSessionStorage(),
  registry: ContentRegistry = contentRegistry,
): RuleResult<ActiveSelfEffectMutation> {
  const character = getCharacterById(characterId, characterStorage, registry);
  if (!character) return ruleError('missing-character', `Character not found: ${characterId}`);
  const derived = deriveCharacterState(character, registry);
  if (!derived.ok) return derived;

  const effect = derived.value.activeSelfEffects.find((candidate) => candidate.id === effectId);
  if (!effect) return ruleError('unknown-active-self-effect', `Character does not own active self effect: ${effectId}`, effectId);

  const sessionState = loadPlaySessionState(characterId, sessionStorage);
  if (sessionState.activeEffectIds.includes(effectId)) return ruleError('active-self-effect-already-active', `${effect.name} is already active.`, effectId);

  const eligibilityError = activeSelfEffectEligibilityError(effect, derived.value);
  if (eligibilityError) return ruleError('active-self-effect-ineligible', eligibilityError, effectId);

  let nextCharacter = character;
  const cost = effect.activationCost;
  if (cost) {
    const resource = derived.value.resources.find((candidate) => candidate.id === cost.resourceId);
    if (!resource) return ruleError('unknown-resource', `${effect.name} activation references an unavailable resource.`, cost.resourceId);
    const remaining = character.playState.resourceUses[cost.resourceId] ?? 0;
    if (remaining < cost.amount) return ruleError('resource-depleted', `${effect.name} requires ${cost.amount} ${resource.name}.`, cost.resourceId);
  }

  // Every validation above succeeds before authoritative resource state is mutated.
  if (cost) {
    const spent = expendCharacterResource(characterId, cost.resourceId, characterStorage, registry, cost.amount);
    if (!spent.ok) return spent;
    nextCharacter = spent.value;
  }

  const nextSessionState = savePlaySessionState(characterId, {
    conditions: sessionState.conditions,
    ...((effect.restrictions ?? []).some((restriction) => restriction.type === 'concentration' && restriction.mode === 'end-and-block')
      ? {}
      : sessionState.concentration ? { concentration: sessionState.concentration } : {}),
    activeEffectIds: [...sessionState.activeEffectIds, effect.id],
  }, sessionStorage);

  return ruleOk({ character: nextCharacter, sessionState: nextSessionState });
}

export function deactivateCharacterActiveSelfEffect(
  characterId: string,
  effectId: string,
  characterStorage: Storage = browserCharacterStorage(),
  sessionStorage: Storage = browserSessionStorage(),
  registry: ContentRegistry = contentRegistry,
): RuleResult<ActiveSelfEffectMutation> {
  const character = getCharacterById(characterId, characterStorage, registry);
  if (!character) return ruleError('missing-character', `Character not found: ${characterId}`);
  const derived = deriveCharacterState(character, registry);
  if (!derived.ok) return derived;
  if (!derived.value.activeSelfEffects.some((effect) => effect.id === effectId)) {
    return ruleError('unknown-active-self-effect', `Character does not own active self effect: ${effectId}`, effectId);
  }
  const sessionState = loadPlaySessionState(characterId, sessionStorage);
  if (!sessionState.activeEffectIds.includes(effectId)) return ruleError('active-self-effect-not-active', 'The selected active self effect is not active.', effectId);
  const nextSessionState = savePlaySessionState(characterId, {
    conditions: sessionState.conditions,
    ...(sessionState.concentration ? { concentration: sessionState.concentration } : {}),
    activeEffectIds: sessionState.activeEffectIds.filter((id) => id !== effectId),
  }, sessionStorage);
  return ruleOk({ character, sessionState: nextSessionState });
}
