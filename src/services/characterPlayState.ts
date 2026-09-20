import type { Character, CharacterPlayState } from '../models/character';
import type { DieSize, LeveledSpellLevel } from '../models/content';
import type { ContentId } from '../models/contentId';
import type { ContentRegistry } from './contentRegistry';
import {
  applyDamage,
  applyHealing,
  finishLongRest,
  finishShortRest,
  resolveHitDiePool,
  setTemporaryHp,
  spendHitDie,
  consumeResourceConsumer,
  expendResource,
  type TemporaryHpDecision,
} from '../rules/playState';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { executeResourceTransaction, type ResourceTransactionRequest } from '../rules/resourceTransactions';
import { ruleError, ruleOk, type RuleResult } from '../rules/result';
import { resolveSpellSlotResource, type SpellSlotSourceSelection } from '../rules/spellcasting';
import { contentRegistry } from './contentRegistry';
import { getCharacterById, updateCharacterPlayState } from './characterStorage';

function browserStorage(): Storage {
  return window.localStorage;
}

function mutateCharacterPlayState(
  id: string,
  transition: (character: Character, derived: NonNullable<ReturnType<typeof deriveCharacterState> extends RuleResult<infer T> ? T : never>) => RuleResult<CharacterPlayState>,
  storage: Storage,
  registry: ContentRegistry,
): RuleResult<Character> {
  const character = getCharacterById(id, storage, registry);
  if (!character) return ruleError('missing-character', `Character not found: ${id}`);
  const derived = deriveCharacterState(character, registry);
  if (!derived.ok) return derived;
  const next = transition(character, derived.value);
  if (!next.ok) return next;
  const updated = updateCharacterPlayState(id, next.value, storage, registry);
  return updated ? ruleOk(updated) : ruleError('missing-character', `Character not found: ${id}`);
}

export function applyCharacterDamage(
  id: string,
  amount: number,
  storage: Storage = browserStorage(),
  registry: ContentRegistry = contentRegistry,
): RuleResult<Character> {
  return mutateCharacterPlayState(id, (character) => applyDamage(character.playState, amount), storage, registry);
}

export function healCharacter(
  id: string,
  amount: number,
  storage: Storage = browserStorage(),
  registry: ContentRegistry = contentRegistry,
): RuleResult<Character> {
  return mutateCharacterPlayState(
    id,
    (character, derived) => applyHealing(character.playState, amount, derived.health.maximumHp),
    storage,
    registry,
  );
}

export function setCharacterTemporaryHp(
  id: string,
  amount: number,
  decision: TemporaryHpDecision = 'replace',
  storage: Storage = browserStorage(),
  registry: ContentRegistry = contentRegistry,
): RuleResult<Character> {
  return mutateCharacterPlayState(id, (character) => setTemporaryHp(character.playState, amount, decision), storage, registry);
}

export function spendCharacterHitDie(
  id: string,
  manualRoll: number,
  selectedDie?: DieSize,
  storage: Storage = browserStorage(),
  registry: ContentRegistry = contentRegistry,
): RuleResult<Character> {
  return mutateCharacterPlayState(
    id,
    (character, derived) => {
      const pool = resolveHitDiePool(derived.health, selectedDie);
      if (!pool.ok) return pool;
      return spendHitDie(character.playState, pool.value.die, manualRoll, derived.abilityModifiers.constitution, derived.health);
    },
    storage,
    registry,
  );
}

export function expendCharacterResource(
  id: string,
  resourceId: string,
  storage: Storage = browserStorage(),
  registry: ContentRegistry = contentRegistry,
  amount = 1,
): RuleResult<Character> {
  return mutateCharacterPlayState(
    id,
    (character, derived) => expendResource(character.playState, resourceId, derived.resources, amount),
    storage,
    registry,
  );
}

export function spendCharacterSpellSlot(
  id: string,
  providerId: ContentId,
  spellId: ContentId,
  slotLevel?: LeveledSpellLevel,
  slotSource?: SpellSlotSourceSelection,
  storage: Storage = browserStorage(),
  registry: ContentRegistry = contentRegistry,
): RuleResult<Character> {
  return mutateCharacterPlayState(
    id,
    (character, derived) => {
      const source = resolveSpellSlotResource(derived, providerId, spellId, slotLevel, slotSource);
      if (!source.ok) return source;
      return source.value
        ? expendResource(character.playState, source.value.resourceId, derived.resources)
        : ruleOk(character.playState);
    },
    storage,
    registry,
  );
}

export function consumeCharacterResource(
  id: string,
  resourceId: string,
  consumerId: string,
  manualRollOrOptions?: number | { readonly manualRoll?: number; readonly expenditureAmount?: number },
  storage: Storage = browserStorage(),
  registry: ContentRegistry = contentRegistry,
): RuleResult<Character> {
  const options = typeof manualRollOrOptions === 'number' ? { manualRoll: manualRollOrOptions } : (manualRollOrOptions ?? {});
  return mutateCharacterPlayState(
    id,
    (character, derived) => {
      const resource = derived.resources.find((candidate) => candidate.id === resourceId);
      if (!resource) return ruleError('unknown-resource', `Unknown resource: ${resourceId}`, resourceId);
      const ownerLevel = resource.owner?.kind === 'class' || resource.owner?.kind === 'subclass'
        ? resource.owner.level
        : character.classProgressions.length === 1 ? derived.level : undefined;
      if (ownerLevel === undefined) {
        return ruleError('multiclass-derivation-not-supported', `${resource.name} has no class-owner level context.`, resource.id);
      }
      return consumeResourceConsumer(
        character.playState,
        resourceId,
        consumerId,
        derived.resources,
        { ...options, classLevel: ownerLevel, maximumHp: derived.health.maximumHp },
      );
    },
    storage,
    registry,
  );
}

export function executeCharacterResourceTransaction(
  id: string,
  transactionId: string,
  request: ResourceTransactionRequest,
  storage: Storage = browserStorage(),
  registry: ContentRegistry = contentRegistry,
): RuleResult<Character> {
  return mutateCharacterPlayState(
    id,
    (character, derived) => {
      const transaction = derived.resourceTransactions.find((candidate) => candidate.id === transactionId);
      if (!transaction) return ruleError('unknown-resource-transaction', `Unknown resource transaction: ${transactionId}`, transactionId);
      return executeResourceTransaction(character.playState, transaction, derived.resources, request);
    },
    storage,
    registry,
  );
}

export function finishCharacterShortRest(
  id: string,
  storage: Storage = browserStorage(),
  registry: ContentRegistry = contentRegistry,
): RuleResult<Character> {
  return mutateCharacterPlayState(
    id,
    (character, derived) => finishShortRest(character.playState, derived.resources),
    storage,
    registry,
  );
}

export function finishCharacterLongRest(
  id: string,
  storage: Storage = browserStorage(),
  registry: ContentRegistry = contentRegistry,
): RuleResult<Character> {
  return mutateCharacterPlayState(
    id,
    (character, derived) => finishLongRest(character.playState, { health: derived.health, resources: derived.resources }),
    storage,
    registry,
  );
}
