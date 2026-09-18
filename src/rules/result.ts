export type RuleErrorCode =
  | 'missing-character'
  | 'missing-class'
  | 'missing-species'
  | 'missing-background'
  | 'missing-feat'
  | 'missing-subclass'
  | 'missing-spell'
  | 'missing-spellcasting-provider'
  | 'missing-resource-ability'
  | 'invalid-spell-slot'
  | 'invalid-spell-mechanic'
  | 'invalid-concentration'
  | 'duplicate-resource'
  | 'duplicate-resource-consumer'
  | 'duplicate-active-self-effect'
  | 'unknown-active-self-effect'
  | 'active-self-effect-already-active'
  | 'active-self-effect-not-active'
  | 'active-self-effect-ineligible'
  | 'invalid-subclass-parent'
  | 'subclass-not-acquired'
  | 'invalid-species-choice'
  | 'invalid-background-choice'
  | 'invalid-feat-choice'
  | 'duplicate-feat'
  | 'invalid-level'
  | 'missing-weapon'
  | 'missing-armor'
  | 'missing-shield'
  | 'missing-mastery'
  | 'invalid-attack-ability'
  | 'invalid-weapon-use'
  | 'invalid-damage-mode'
  | 'invalid-hp-progression'
  | 'invalid-play-state'
  | 'invalid-amount'
  | 'invalid-hit-die-roll'
  | 'unavailable-hit-die'
  | 'unknown-resource'
  | 'resource-depleted'
  | 'resource-full'
  | 'unknown-resource-consumer'
  | 'unknown-resource-transaction'
  | 'invalid-resource-transaction'
  | 'resource-transaction-unavailable'
  | 'rest-unavailable'
  | 'invalid-dice-expression'
  | 'invalid-dice-transformation'
  | 'invalid-critical-threshold'
  | 'invalid-roll-mode'
  | 'invalid-roll-context'
  | 'invalid-rng'
  | 'invalid-roll-request'
  | 'unknown-skill'
  | 'unknown-saving-throw'
  | 'missing-derived-attack'
  | 'unknown-inventory-entry'
  | 'invalid-inventory-item'
  | 'inventory-action-unavailable';

export interface RuleError {
  readonly code: RuleErrorCode;
  readonly message: string;
  readonly contentId?: string;
}

export type RuleResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: RuleError };

export function ruleOk<T>(value: T): RuleResult<T> {
  return { ok: true, value };
}

export function ruleError(code: RuleErrorCode, message: string, contentId?: string): RuleResult<never> {
  return { ok: false, error: { code, message, ...(contentId ? { contentId } : {}) } };
}
