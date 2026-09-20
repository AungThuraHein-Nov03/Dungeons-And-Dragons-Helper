import type { Character } from '../models/character';
import { deriveCharacterState } from '../rules/deriveCharacter';
import {
  getConfirmableLevelUpCandidate,
  type LevelUpDraft,
  type LevelUpError,
} from '../rules/levelUp';
import { contentRegistry, type ContentRegistry } from './contentRegistry';
import { getCharacterById, updateCharacter } from './characterStorage';
import { reconcilePlaySessionState } from './playSessionState';

export type LevelUpCommitErrorCode =
  | 'missing-source'
  | 'stale-source'
  | 'invalid-candidate'
  | 'persistence-failed';

export interface LevelUpCommitError {
  readonly code: LevelUpCommitErrorCode;
  readonly message: string;
  readonly cause?: LevelUpError;
}

export interface LevelUpCommitSuccess {
  readonly character: Character;
  readonly sessionReconciled: boolean;
}

export type LevelUpCommitResult =
  | { readonly ok: true; readonly value: LevelUpCommitSuccess }
  | { readonly ok: false; readonly error: LevelUpCommitError };

function localStorageDefault(): Storage {
  return window.localStorage;
}

function sessionStorageDefault(): Storage {
  return window.sessionStorage;
}

export function confirmLevelUp(
  draft: LevelUpDraft,
  storage: Storage = localStorageDefault(),
  sessionStorage: Storage = sessionStorageDefault(),
  registry: ContentRegistry = contentRegistry,
): LevelUpCommitResult {
  const current = getCharacterById(draft.sourceCharacterId, storage, registry);
  if (!current) {
    return {
      ok: false,
      error: {
        code: 'missing-source',
        message: 'This Character no longer exists. Restart Level Up from the current Character list.',
      },
    };
  }

  if (current.updatedAt !== draft.sourceUpdatedAt) {
    return {
      ok: false,
      error: {
        code: 'stale-source',
        message: 'This Character changed while Level Up was open. Restart Level Up from the current Character state.',
      },
    };
  }

  const candidate = getConfirmableLevelUpCandidate(current, draft, registry);
  if (!candidate.ok) {
    return {
      ok: false,
      error: {
        code: 'invalid-candidate',
        message: candidate.error.message,
        cause: candidate.error,
      },
    };
  }

  let updated: Character | undefined;
  try {
    updated = updateCharacter(current.id, candidate.value.input, storage, registry);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'persistence-failed',
        message: error instanceof Error ? error.message : 'Level Up could not be persisted.',
      },
    };
  }

  if (!updated) {
    return {
      ok: false,
      error: {
        code: 'persistence-failed',
        message: 'The Character disappeared before Level Up could be persisted.',
      },
    };
  }

  const derived = deriveCharacterState(updated, registry);
  if (!derived.ok) {
    return { ok: true, value: { character: updated, sessionReconciled: false } };
  }

  try {
    reconcilePlaySessionState(updated.id, derived.value, sessionStorage);
    return { ok: true, value: { character: updated, sessionReconciled: true } };
  } catch {
    // Character + embedded PLAY state already committed atomically in localStorage.
    // The session cache is independently reconciled again when PLAY next loads.
    return { ok: true, value: { character: updated, sessionReconciled: false } };
  }
}
