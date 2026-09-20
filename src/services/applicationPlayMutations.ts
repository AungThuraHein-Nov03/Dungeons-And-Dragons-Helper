import type { Character } from '../models/character';
import type { DieSize, LeveledSpellLevel } from '../models/content';
import type { ContentId } from '../models/contentId';
import type { ResourceTransactionRequest } from '../rules/resourceTransactions';
import { ruleError, ruleOk, type RuleResult } from '../rules/result';
import type { TemporaryHpDecision } from '../rules/playState';
import {
  applyCharacterDamage,
  consumeCharacterResource,
  executeCharacterResourceTransaction,
  finishCharacterLongRest,
  finishCharacterShortRest,
  healCharacter,
  setCharacterTemporaryHp,
  spendCharacterSpellSlot,
} from './characterPlayState';
import {
  rollHealingResource,
  rollHitDie,
  type CharacterRollOptions,
  type CharacterRollOutcome,
} from './characterRolls';
import {
  activateCharacterActiveSelfEffect,
  type ActiveSelfEffectMutation,
} from './activeSelfEffects';
import {
  runApplicationCharacterTransaction,
} from './applicationCharacterMutations';
import { getPersistenceBackend } from './persistenceBackend';
import { loadRollHistory, saveRollHistory } from './rollHistory';
import { loadPlaySessionState, savePlaySessionState } from './playSessionState';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key) { return values.get(key) ?? null; },
    key(index) { return [...values.keys()][index] ?? null; },
    removeItem(key) { values.delete(key); },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

function failedCharacter(message: string): RuleResult<Character> {
  return ruleError('invalid-play-state', message);
}

async function runCharacterMutation(
  mutation: (storage: Storage) => RuleResult<Character>,
): Promise<RuleResult<Character>> {
  if (getPersistenceBackend() !== 'project') return mutation(window.localStorage);
  const result = await runApplicationCharacterTransaction(mutation, (character) => character);
  if (!result.ok) return failedCharacter(result.error.message);
  return result.character ? ruleOk(result.character) : failedCharacter('Project Character mutation returned no Character.');
}

export function applyApplicationCharacterDamage(id: string, amount: number): Promise<RuleResult<Character>> {
  return runCharacterMutation((storage) => applyCharacterDamage(id, amount, storage));
}

export function healApplicationCharacter(id: string, amount: number): Promise<RuleResult<Character>> {
  return runCharacterMutation((storage) => healCharacter(id, amount, storage));
}

export function setApplicationCharacterTemporaryHp(
  id: string,
  amount: number,
  decision: TemporaryHpDecision = 'replace',
): Promise<RuleResult<Character>> {
  return runCharacterMutation((storage) => setCharacterTemporaryHp(id, amount, decision, storage));
}

export function consumeApplicationCharacterResource(
  id: string,
  resourceId: string,
  consumerId: string,
  manualRollOrOptions?: number | { readonly manualRoll?: number; readonly expenditureAmount?: number },
): Promise<RuleResult<Character>> {
  return runCharacterMutation((storage) => consumeCharacterResource(id, resourceId, consumerId, manualRollOrOptions, storage));
}

export function executeApplicationCharacterResourceTransaction(
  id: string,
  transactionId: string,
  request: ResourceTransactionRequest,
): Promise<RuleResult<Character>> {
  return runCharacterMutation((storage) => executeCharacterResourceTransaction(id, transactionId, request, storage));
}

export function finishApplicationCharacterShortRest(id: string): Promise<RuleResult<Character>> {
  return runCharacterMutation((storage) => finishCharacterShortRest(id, storage));
}

export function finishApplicationCharacterLongRest(id: string): Promise<RuleResult<Character>> {
  return runCharacterMutation((storage) => finishCharacterLongRest(id, storage));
}

export function spendApplicationCharacterSpellSlot(
  id: string,
  providerId: ContentId,
  spellId: ContentId,
  slotLevel?: LeveledSpellLevel,
  slotSource?: Parameters<typeof spendCharacterSpellSlot>[4],
): Promise<RuleResult<Character>> {
  return runCharacterMutation((storage) => spendCharacterSpellSlot(id, providerId, spellId, slotLevel, slotSource, storage));
}

function commitDeferredHistory(tempHistory: Storage, destination: Storage): void {
  const deferred = loadRollHistory(tempHistory);
  if (deferred.length === 0) return;
  saveRollHistory([...deferred, ...loadRollHistory(destination)], destination);
}

async function runStatefulRoll(
  mutation: (characterStorage: Storage, historyStorage: Storage) => RuleResult<CharacterRollOutcome>,
  options: CharacterRollOptions = {},
): Promise<RuleResult<CharacterRollOutcome>> {
  if (getPersistenceBackend() !== 'project') {
    return mutation(options.characterStorage ?? window.localStorage, options.historyStorage ?? window.localStorage);
  }

  const tempHistory = memoryStorage();
  const result = await runApplicationCharacterTransaction(
    (storage) => mutation(storage, tempHistory),
    (outcome) => outcome.character,
  );
  if (!result.ok) return ruleError('invalid-play-state', result.error.message);
  if (!result.character) return ruleError('invalid-play-state', 'Project stateful roll returned no Character.');

  commitDeferredHistory(tempHistory, options.historyStorage ?? window.localStorage);
  return ruleOk({ ...result.value, character: result.character });
}

export function rollApplicationHealingResource(
  characterId: string,
  resourceId: ContentId,
  consumerId: ContentId,
  options: CharacterRollOptions = {},
): Promise<RuleResult<CharacterRollOutcome>> {
  return runStatefulRoll(
    (characterStorage, historyStorage) => rollHealingResource(characterId, resourceId, consumerId, {
      ...options,
      characterStorage,
      historyStorage,
    }),
    options,
  );
}

export function rollApplicationHitDie(
  characterId: string,
  dieOrOptions: DieSize | CharacterRollOptions = {},
  rawOptions: CharacterRollOptions = {},
): Promise<RuleResult<CharacterRollOutcome>> {
  const selectedDie = typeof dieOrOptions === 'number' ? dieOrOptions : undefined;
  const options = typeof dieOrOptions === 'number' ? rawOptions : dieOrOptions;
  return runStatefulRoll(
    (characterStorage, historyStorage) => selectedDie === undefined
      ? rollHitDie(characterId, { ...options, characterStorage, historyStorage })
      : rollHitDie(characterId, selectedDie, { ...options, characterStorage, historyStorage }),
    options,
  );
}

export async function activateApplicationCharacterActiveSelfEffect(
  characterId: string,
  effectId: string,
): Promise<RuleResult<ActiveSelfEffectMutation>> {
  if (getPersistenceBackend() !== 'project') {
    return activateCharacterActiveSelfEffect(characterId, effectId);
  }

  const tempSession = memoryStorage();
  savePlaySessionState(characterId, loadPlaySessionState(characterId), tempSession);

  const result = await runApplicationCharacterTransaction(
    (storage) => activateCharacterActiveSelfEffect(characterId, effectId, storage, tempSession),
    (value) => value.character,
  );
  if (!result.ok) return ruleError('invalid-play-state', result.error.message);
  if (!result.character) return ruleError('invalid-play-state', 'Project active-effect mutation returned no Character.');

  const sessionState = savePlaySessionState(characterId, result.value.sessionState);
  return ruleOk({ character: result.character, sessionState });
}
