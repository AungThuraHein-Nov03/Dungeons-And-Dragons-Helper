import type { LevelUpDraft } from '../rules/levelUp';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { ruleError, ruleOk } from '../rules/result';
import {
  confirmLevelUp,
  type LevelUpCommitError,
  type LevelUpCommitResult,
  type LevelUpCommitSuccess,
} from './levelUpPersistence';
import { runApplicationCharacterTransaction } from './applicationCharacterMutations';
import { contentRegistry } from './contentRegistry';
import { getPersistenceBackend } from './persistenceBackend';
import { reconcilePlaySessionState } from './playSessionState';

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

function projectFailure(message: string): LevelUpCommitResult {
  return {
    ok: false,
    error: {
      code: 'persistence-failed',
      message,
    },
  };
}

export async function confirmApplicationLevelUp(draft: LevelUpDraft): Promise<LevelUpCommitResult> {
  if (getPersistenceBackend() !== 'project') return confirmLevelUp(draft);

  const isolatedSession = memoryStorage();
  let levelUpError: LevelUpCommitError | undefined;

  const transaction = await runApplicationCharacterTransaction(
    (storage) => {
      const result = confirmLevelUp(draft, storage, isolatedSession, contentRegistry);
      if (!result.ok) {
        levelUpError = result.error;
        return ruleError('invalid-play-state', result.error.message);
      }
      return ruleOk(result.value);
    },
    (value) => value.character,
  );

  if (!transaction.ok) {
    if (levelUpError) return { ok: false, error: levelUpError };
    return projectFailure(transaction.error.message);
  }

  if (!transaction.character) {
    return projectFailure('Project Level Up persistence returned no Character.');
  }

  let sessionReconciled = false;
  const derived = deriveCharacterState(transaction.character, contentRegistry);
  if (derived.ok) {
    try {
      reconcilePlaySessionState(transaction.character.id, derived.value);
      sessionReconciled = true;
    } catch {
      sessionReconciled = false;
    }
  }

  const value: LevelUpCommitSuccess = {
    character: transaction.character,
    sessionReconciled,
  };
  return { ok: true, value };
}
