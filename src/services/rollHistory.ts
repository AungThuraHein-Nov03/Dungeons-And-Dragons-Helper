import { ROLL_DIE_SIZES, type RandomSource, type RollDiceTransformationApplication, type RollHistoryEntry, type RollRequest, type RollResult } from '../dice/types';
import { applyOptionalDiceTransformation, systemRandom, validateRollRequest } from '../dice/diceEngine';
import { publishDiceVisualResult } from '../dice/diceVisualEvent';
import { ruleError, ruleOk, type RuleResult } from '../rules/result';

export const ROLL_HISTORY_STORAGE_KEY = 'dnd3.roll-history.v1';
export const MAX_ROLL_HISTORY = 50;

function browserStorage(): Storage {
  return window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value);
}

function isRollStateEffect(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== 'string' || !isWholeNumber(value.before) || !isWholeNumber(value.after) || value.before < 0 || value.after < 0) return false;
  if (value.kind === 'hp') return true;
  if (value.kind === 'hit-dice') return isWholeNumber(value.die) && [4, 6, 8, 10, 12].includes(value.die);
  return value.kind === 'resource' && typeof value.resourceId === 'string' && value.resourceId.length > 0;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isDiceTransformationApplication(value: unknown, request: RollRequest): value is RollDiceTransformationApplication {
  if (!isRecord(value) || typeof value.transformationId !== 'string' || !value.transformationId || typeof value.sourceLabel !== 'string' || !value.sourceLabel || typeof value.type !== 'string' || !isWholeNumber(value.die) || !ROLL_DIE_SIZES.includes(value.die as (typeof ROLL_DIE_SIZES)[number]) || !isWholeNumber(value.original) || !isWholeNumber(value.final)) return false;
  const transformation = request.diceTransformations?.find((candidate) => candidate.id === value.transformationId);
  if (!transformation || transformation.sourceLabel !== value.sourceLabel || transformation.type !== value.type || transformation.die !== value.die) return false;
  if (value.original < 1 || value.original > value.die || value.final < 1 || value.final > value.die) return false;

  if (value.type === 'reroll-once-use-new') {
    if (!hasOnlyKeys(value, ['transformationId', 'sourceLabel', 'type', 'die', 'original', 'replacement', 'final'])) return false;
    if (transformation.type !== 'reroll-once-use-new' || !isWholeNumber(value.replacement) || value.replacement < 1 || value.replacement > value.die) return false;
    return transformation.qualifyingFaces.includes(value.original) && value.final === value.replacement;
  }
  if (value.type === 'minimum-die-face') {
    if (!hasOnlyKeys(value, ['transformationId', 'sourceLabel', 'type', 'die', 'original', 'final'])) return false;
    if (transformation.type !== 'minimum-die-face' || value.replacement !== undefined) return false;
    return value.original < transformation.minimum && value.final === transformation.minimum;
  }
  return false;
}

function isRollHistoryEntry(value: unknown): value is RollHistoryEntry {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.rolledAt !== 'string' || Number.isNaN(Date.parse(value.rolledAt)) || !isRecord(value.result)) {
    return false;
  }
  const result = value.result;
  if (!isRecord(result.request) || !Array.isArray(result.dice) || !Number.isInteger(result.modifier) || !Number.isInteger(result.total) || !Array.isArray(result.effects)) {
    return false;
  }
  const requestValidation = validateRollRequest(result.request);
  if (!requestValidation.ok || !result.effects.every(isRollStateEffect)) return false;
  if (result.keptD20 !== undefined) {
    if (typeof result.keptD20 !== 'number' || !Number.isInteger(result.keptD20) || result.keptD20 < 1 || result.keptD20 > 20) return false;
  }
  if (result.natural !== undefined && result.natural !== 'nat20' && result.natural !== 'nat1') return false;
  if (result.critical !== undefined && typeof result.critical !== 'boolean') return false;
  if (result.resolvedMode !== undefined && !['normal', 'advantage', 'disadvantage'].includes(result.resolvedMode as string)) return false;
  if (result.contextualModifier !== undefined && !isWholeNumber(result.contextualModifier)) return false;
  if (result.diceTransformationApplications !== undefined) {
    if (!Array.isArray(result.diceTransformationApplications) || !result.diceTransformationApplications.every((application) => isDiceTransformationApplication(application, requestValidation.value))) return false;
    const rerollIds = result.diceTransformationApplications
      .filter((application) => application.type === 'reroll-once-use-new')
      .map((application) => application.transformationId);
    if (new Set(rerollIds).size !== rerollIds.length) return false;
  }
  return result.dice.every((group) => {
    if (!isRecord(group) || !isWholeNumber(group.die) || !ROLL_DIE_SIZES.includes(group.die as (typeof ROLL_DIE_SIZES)[number]) || !Array.isArray(group.values)) return false;
    const dieSize = group.die;
    return group.values.every((die) => isWholeNumber(die) && die >= 1 && die <= dieSize);
  });
}

export function loadRollHistory(storage: Storage = browserStorage()): RollHistoryEntry[] {
  const raw = storage.getItem(ROLL_HISTORY_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRollHistoryEntry).slice(0, MAX_ROLL_HISTORY);
  } catch {
    return [];
  }
}

export function saveRollHistory(entries: readonly RollHistoryEntry[], storage: Storage = browserStorage()): void {
  storage.setItem(ROLL_HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ROLL_HISTORY)));
}

function createHistoryId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `roll-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function publishVisualResultFailOpen(result: RollResult): void {
  try {
    publishDiceVisualResult(result);
  } catch {
    // Rendering is supplemental; authoritative history must never depend on it.
  }
}

export function addRollHistory(
  result: RollResult,
  storage: Storage = browserStorage(),
  now: () => Date = () => new Date(),
): RollHistoryEntry {
  const entry: RollHistoryEntry = { id: createHistoryId(), rolledAt: now().toISOString(), result };
  saveRollHistory([entry, ...loadRollHistory(storage)], storage);
  publishVisualResultFailOpen(result);
  return entry;
}

export function applyRollHistoryDiceTransformation(
  entryId: string,
  transformationId: string,
  storage: Storage = browserStorage(),
  rng: RandomSource = systemRandom,
): RuleResult<RollHistoryEntry> {
  const entries = loadRollHistory(storage);
  const index = entries.findIndex((entry) => entry.id === entryId);
  if (index < 0) return ruleError('invalid-dice-transformation', 'Roll History entry could not be resolved.', transformationId);
  const transformed = applyOptionalDiceTransformation(entries[index].result, transformationId, rng);
  if (!transformed.ok) return transformed;
  const updated = { ...entries[index], result: transformed.value };
  const nextEntries = [...entries];
  nextEntries[index] = updated;
  saveRollHistory(nextEntries, storage);
  publishVisualResultFailOpen(updated.result);
  return ruleOk(updated);
}

export function clearRollHistory(storage: Storage = browserStorage()): void {
  storage.removeItem(ROLL_HISTORY_STORAGE_KEY);
}
