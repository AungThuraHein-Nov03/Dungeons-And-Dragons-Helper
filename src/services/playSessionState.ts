import type { ContentId } from '../models/contentId';
import { activeSelfEffectShouldTerminate, activeSelfEffectsBlockConcentration, reconcileActiveSelfEffectIds } from '../rules/activeSelfEffects';
import type { DerivedCharacterState } from '../rules/types';
import { conditionBreaksConcentration, isCharacterConditionId, type CharacterConditionId } from '../rules/conditions';
import { resolveConcentrationCandidate } from '../rules/concentration';
import { ruleError, ruleOk, type RuleResult } from '../rules/result';

export interface PlaySessionConcentration {
  readonly spellId: ContentId;
  readonly providerId: ContentId;
}

export interface PlaySessionState {
  readonly conditions: CharacterConditionId[];
  readonly concentration?: PlaySessionConcentration;
  readonly activeEffectIds: ContentId[];
}

export const EMPTY_PLAY_SESSION_STATE: PlaySessionState = { conditions: [], activeEffectIds: [] };
export const PLAY_SESSION_STORAGE_PREFIX = 'dnd3.play-session.v1:';

function browserSessionStorage(): Storage {
  return window.sessionStorage;
}

export function playSessionStorageKey(characterId: string): string {
  return PLAY_SESSION_STORAGE_PREFIX + encodeURIComponent(characterId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function parseState(raw: string): PlaySessionState | undefined {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return undefined; }
  if (!isRecord(value) || !hasOnlyKeys(value, ['conditions', 'concentration', 'activeEffectIds']) || !Array.isArray(value.conditions)) return undefined;
  if (!value.conditions.every((condition) => typeof condition === 'string' && isCharacterConditionId(condition))) return undefined;
  const conditions = value.conditions as CharacterConditionId[];
  if (new Set(conditions).size !== conditions.length) return undefined;

  const rawActiveEffectIds = value.activeEffectIds ?? [];
  if (!Array.isArray(rawActiveEffectIds) || !rawActiveEffectIds.every((id) => typeof id === 'string' && id.trim().length > 0)) return undefined;
  const activeEffectIds = rawActiveEffectIds as ContentId[];
  if (new Set(activeEffectIds).size !== activeEffectIds.length) return undefined;

  if (value.concentration === undefined) return { conditions: [...conditions], activeEffectIds: [...activeEffectIds] };
  if (!isRecord(value.concentration) || !hasOnlyKeys(value.concentration, ['spellId', 'providerId'])) return undefined;
  const spellId = value.concentration.spellId;
  const providerId = value.concentration.providerId;
  if (typeof spellId !== 'string' || !spellId.trim() || typeof providerId !== 'string' || !providerId.trim()) return undefined;
  return { conditions: [...conditions], concentration: { spellId, providerId }, activeEffectIds: [...activeEffectIds] };
}

export function loadPlaySessionState(characterId: string, storage: Storage = browserSessionStorage()): PlaySessionState {
  const key = playSessionStorageKey(characterId);
  const raw = storage.getItem(key);
  if (raw === null) return { conditions: [], activeEffectIds: [] };
  const parsed = parseState(raw);
  if (parsed) return parsed;
  storage.removeItem(key);
  return { conditions: [], activeEffectIds: [] };
}

export function savePlaySessionState(
  characterId: string,
  state: Omit<PlaySessionState, 'activeEffectIds'> & { readonly activeEffectIds?: readonly ContentId[] },
  storage: Storage = browserSessionStorage(),
): PlaySessionState {
  const safe: PlaySessionState = {
    conditions: [...new Set(state.conditions)],
    ...(state.concentration ? { concentration: { ...state.concentration } } : {}),
    activeEffectIds: [...new Set(state.activeEffectIds ?? [])],
  };
  storage.setItem(playSessionStorageKey(characterId), JSON.stringify(safe));
  return safe;
}

export function clearPlaySessionState(characterId: string, storage: Storage = browserSessionStorage()): void {
  storage.removeItem(playSessionStorageKey(characterId));
}

export function addPlaySessionCondition(
  characterId: string,
  condition: CharacterConditionId,
  storage: Storage = browserSessionStorage(),
  derived?: DerivedCharacterState,
): PlaySessionState {
  const current = loadPlaySessionState(characterId, storage);
  const conditions = current.conditions.includes(condition) ? current.conditions : [...current.conditions, condition];
  const activeEffectIds = derived
    ? current.activeEffectIds.filter((id) => {
        const effect = derived.activeSelfEffects.find((candidate) => candidate.id === id);
        return effect ? !activeSelfEffectShouldTerminate(effect, derived, conditions) : false;
      })
    : current.activeEffectIds;
  return savePlaySessionState(characterId, {
    conditions,
    ...(!conditionBreaksConcentration(condition) && current.concentration && (!derived || !activeSelfEffectsBlockConcentration(derived, activeEffectIds)) ? { concentration: current.concentration } : {}),
    activeEffectIds,
  }, storage);
}

export function removePlaySessionCondition(characterId: string, condition: CharacterConditionId, storage: Storage = browserSessionStorage()): PlaySessionState {
  const current = loadPlaySessionState(characterId, storage);
  return savePlaySessionState(characterId, {
    conditions: current.conditions.filter((candidate) => candidate !== condition),
    ...(current.concentration ? { concentration: current.concentration } : {}),
    activeEffectIds: current.activeEffectIds,
  }, storage);
}

export function startPlaySessionConcentration(
  characterId: string,
  providerId: ContentId,
  spellId: ContentId,
  derived: DerivedCharacterState,
  storage: Storage = browserSessionStorage(),
): RuleResult<PlaySessionState> {
  const resolved = resolveConcentrationCandidate(derived, providerId, spellId);
  if (!resolved.ok) return resolved;
  const current = loadPlaySessionState(characterId, storage);
  if (current.conditions.some(conditionBreaksConcentration)) {
    return ruleError('invalid-concentration', 'Concentration cannot start while an active Character condition makes Concentration impossible.');
  }
  if (activeSelfEffectsBlockConcentration(derived, current.activeEffectIds)) {
    return ruleError('invalid-concentration', 'Concentration cannot start while an active self effect prevents Concentration.');
  }
  return ruleOk(savePlaySessionState(characterId, {
    conditions: current.conditions,
    concentration: { providerId, spellId },
    activeEffectIds: current.activeEffectIds,
  }, storage));
}

export function endPlaySessionConcentration(characterId: string, storage: Storage = browserSessionStorage()): PlaySessionState {
  const current = loadPlaySessionState(characterId, storage);
  return savePlaySessionState(characterId, { conditions: current.conditions, activeEffectIds: current.activeEffectIds }, storage);
}

export function reconcilePlaySessionState(
  characterId: string,
  derived: DerivedCharacterState,
  storage: Storage = browserSessionStorage(),
): PlaySessionState {
  const current = loadPlaySessionState(characterId, storage);
  const activeEffectIds = reconcileActiveSelfEffectIds(derived, current.activeEffectIds, current.conditions);
  let concentration = current.concentration;
  if (concentration) {
    const resolved = resolveConcentrationCandidate(derived, concentration.providerId, concentration.spellId);
    if (!resolved.ok || current.conditions.some(conditionBreaksConcentration) || activeSelfEffectsBlockConcentration(derived, activeEffectIds)) concentration = undefined;
  }
  const unchanged = activeEffectIds.length === current.activeEffectIds.length
    && activeEffectIds.every((id, index) => id === current.activeEffectIds[index])
    && concentration === current.concentration;
  if (unchanged) return current;
  return savePlaySessionState(characterId, {
    conditions: current.conditions,
    ...(concentration ? { concentration } : {}),
    activeEffectIds,
  }, storage);
}
