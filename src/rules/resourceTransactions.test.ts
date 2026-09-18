import { describe, expect, it } from 'vitest';
import type { CharacterPlayState } from '../models/character';
import type { DerivedResource, DerivedResourceTransaction } from './types';
import { executeResourceTransaction, deriveTransactionBudget } from './resourceTransactions';
import { finishLongRest, restoreResource } from './playState';

const SOURCE = { type: 'homebrew', namespace: 'm13c-pure' } as const;
const TARGET = 'homebrew:m13c-pure:resource:reserve';
const USAGE = 'homebrew:m13c-pure:resource:renewal';
const SIDE = 'homebrew:m13c-pure:resource:side';
const SLOT1 = 'homebrew:m13c-pure:slot:1';
const SLOT2 = 'homebrew:m13c-pure:slot:2';
const SLOT3 = 'homebrew:m13c-pure:slot:3';
const SLOT6 = 'homebrew:m13c-pure:slot:6';

function resource(id: string, name: string, maximumUses: number, recovery: DerivedResource['recovery'] = [{ trigger: 'long-rest', mode: 'all' }]): DerivedResource {
  return { id, name, maximumUses, source: SOURCE, recovery, consumers: [], presentation: 'numeric' };
}

const RESOURCES: DerivedResource[] = [
  resource(TARGET, 'Reserve', 5),
  resource(USAGE, 'Renewal Use', 1),
  resource(SIDE, 'Side Pool', 3, [{ trigger: 'short-rest', mode: 'amount', amount: 1 }, { trigger: 'long-rest', mode: 'all' }]),
  resource(SLOT1, 'Level 1 Slots', 4),
  resource(SLOT2, 'Level 2 Slots', 3),
  resource(SLOT3, 'Level 3 Slots', 2),
  resource(SLOT6, 'Level 6 Slots', 1),
];

function state(overrides: Partial<CharacterPlayState> = {}, resources: Partial<Record<string, number>> = {}): CharacterPlayState {
  return {
    currentHp: overrides.currentHp ?? 17,
    temporaryHp: overrides.temporaryHp ?? 4,
    hitDiceRemaining: overrides.hitDiceRemaining ?? 3,
    resourceUses: {
      [TARGET]: 2,
      [USAGE]: 1,
      [SIDE]: 0,
      [SLOT1]: 3,
      [SLOT2]: 2,
      [SLOT3]: 1,
      [SLOT6]: 0,
      ...resources,
    },
  };
}

const SELECTED_RESTORE: DerivedResourceTransaction = {
  id: 'homebrew:m13c-pure:transaction:renew',
  name: 'Renew',
  kind: 'restore-resource',
  targetResource: { id: TARGET, name: 'Reserve', maximumUses: 5 },
  restore: { kind: 'selected', maximum: 3 },
  usageResourceId: USAGE,
  grantedBy: { contentId: 'homebrew:m13c-pure:feature:renew', contentName: 'Renew' },
};

const FIXED_RESTORE: DerivedResourceTransaction = {
  ...SELECTED_RESTORE,
  id: 'homebrew:m13c-pure:transaction:fixed-renew',
  name: 'Fixed Renew',
  restore: { kind: 'fixed', amount: 2 },
};

const WEIGHTED: DerivedResourceTransaction = {
  id: 'homebrew:m13c-pure:transaction:recollect',
  name: 'Recollect',
  kind: 'restore-spell-slots-with-budget',
  providerId: 'homebrew:m13c-pure:provider:casting',
  providerName: 'Synthetic Casting',
  usageResourceId: USAGE,
  budget: 3,
  maximumSpellLevel: 5,
  timing: 'short-rest',
  slots: [
    { spellLevel: 1, resourceId: SLOT1, name: 'Level 1 Slots', maximumUses: 4 },
    { spellLevel: 2, resourceId: SLOT2, name: 'Level 2 Slots', maximumUses: 3 },
    { spellLevel: 3, resourceId: SLOT3, name: 'Level 3 Slots', maximumUses: 2 },
  ],
  grantedBy: { contentId: 'homebrew:m13c-pure:feature:recollect', contentName: 'Recollect' },
};

describe('M13C generic bounded resource restoration', () => {
  it('restores an existing resource through the authoritative bounded primitive and preserves unrelated state', () => {
    const before = state();
    const result = restoreResource(before, TARGET, RESOURCES, 2);
    expect(result).toMatchObject({ ok: true, value: { currentHp: 17, temporaryHp: 4, hitDiceRemaining: 3, resourceUses: { [TARGET]: 4, [USAGE]: 1, [SIDE]: 0 } } });
    expect(result.ok && result.value.resourceUses[SLOT1]).toBe(3);
  });

  it('reaches an exact maximum and clamps overflow without inventing excess uses', () => {
    expect(restoreResource(state({}, { [TARGET]: 3 }), TARGET, RESOURCES, 2)).toMatchObject({ ok: true, value: { resourceUses: { [TARGET]: 5 } } });
    expect(restoreResource(state({}, { [TARGET]: 4 }), TARGET, RESOURCES, 99)).toMatchObject({ ok: true, value: { resourceUses: { [TARGET]: 5 } } });
  });

  it('rejects zero, negative, unknown, and already-full restoration', () => {
    expect(restoreResource(state(), TARGET, RESOURCES, 0)).toMatchObject({ ok: false, error: { code: 'invalid-amount' } });
    expect(restoreResource(state(), TARGET, RESOURCES, -1)).toMatchObject({ ok: false, error: { code: 'invalid-amount' } });
    expect(restoreResource(state(), 'homebrew:m13c-pure:resource:missing', RESOURCES, 1)).toMatchObject({ ok: false, error: { code: 'unknown-resource' } });
    expect(restoreResource(state({}, { [TARGET]: 5 }), TARGET, RESOURCES, 1)).toMatchObject({ ok: false, error: { code: 'resource-full' } });
  });

  it('executes selected and fixed transactions, clamps target overflow, and consumes exactly one usage resource', () => {
    const selected = executeResourceTransaction(state({}, { [TARGET]: 4 }), SELECTED_RESTORE, RESOURCES, { kind: 'restore-resource', amount: 3 });
    expect(selected).toMatchObject({ ok: true, value: { resourceUses: { [TARGET]: 5, [USAGE]: 0 } } });

    const fixed = executeResourceTransaction(state(), FIXED_RESTORE, RESOURCES, { kind: 'restore-resource' });
    expect(fixed).toMatchObject({ ok: true, value: { resourceUses: { [TARGET]: 4, [USAGE]: 0 } } });
  });

  it('rejects invalid selected amounts, no-op/full targets, and unavailable uses without consuming the feature use', () => {
    for (const request of [
      { kind: 'restore-resource', amount: 0 },
      { kind: 'restore-resource', amount: -1 },
      { kind: 'restore-resource', amount: 4 },
      { kind: 'restore-resource' },
    ] as const) {
      const result = executeResourceTransaction(state(), SELECTED_RESTORE, RESOURCES, request);
      expect(result.ok).toBe(false);
      expect(state().resourceUses[USAGE]).toBe(1);
    }
    expect(executeResourceTransaction(state({}, { [TARGET]: 5 }), SELECTED_RESTORE, RESOURCES, { kind: 'restore-resource', amount: 1 })).toMatchObject({ ok: false, error: { code: 'resource-full' } });
    expect(executeResourceTransaction(state({}, { [USAGE]: 0 }), SELECTED_RESTORE, RESOURCES, { kind: 'restore-resource', amount: 1 })).toMatchObject({ ok: false, error: { code: 'resource-transaction-unavailable' } });
  });

  it('resets an ordinary usage resource through the existing Long Rest recovery path', () => {
    const used = executeResourceTransaction(state(), FIXED_RESTORE, RESOURCES, { kind: 'restore-resource' });
    if (!used.ok) throw new Error(used.error.message);
    const rested = finishLongRest(used.value, { health: { maximumHp: 20, hitDie: 8, maximumHitDice: 4 }, resources: RESOURCES });
    expect(rested).toMatchObject({ ok: true, value: { currentHp: 20, temporaryHp: 0, hitDiceRemaining: 4, resourceUses: { [USAGE]: 1 } } });
  });
});

describe('M13C weighted spell-slot restoration', () => {
  it('derives the exact half-level rounded-up budget rule', () => {
    expect(deriveTransactionBudget(1, { kind: 'half-level-round-up' })).toBe(1);
    expect(deriveTransactionBudget(2, { kind: 'half-level-round-up' })).toBe(1);
    expect(deriveTransactionBudget(3, { kind: 'half-level-round-up' })).toBe(2);
    expect(deriveTransactionBudget(6, { kind: 'half-level-round-up' })).toBe(3);
    expect(deriveTransactionBudget(11, { kind: 'half-level-round-up' })).toBe(6);
  });

  it('restores one level-1 slot and consumes the feature use once', () => {
    const result = executeResourceTransaction(state(), WEIGHTED, RESOURCES, { kind: 'restore-spell-slots-with-budget', selections: [{ resourceId: SLOT1, amount: 1 }] });
    expect(result).toMatchObject({ ok: true, value: { resourceUses: { [SLOT1]: 4, [USAGE]: 0, [SIDE]: 1 } } });
  });

  it('restores one higher-level slot and an exact-budget multi-slot combination', () => {
    expect(executeResourceTransaction(state(), WEIGHTED, RESOURCES, { kind: 'restore-spell-slots-with-budget', selections: [{ resourceId: SLOT3, amount: 1 }] })).toMatchObject({ ok: true, value: { resourceUses: { [SLOT3]: 2, [USAGE]: 0 } } });
    expect(executeResourceTransaction(state(), WEIGHTED, RESOURCES, { kind: 'restore-spell-slots-with-budget', selections: [{ resourceId: SLOT1, amount: 1 }, { resourceId: SLOT2, amount: 1 }] })).toMatchObject({ ok: true, value: { resourceUses: { [SLOT1]: 4, [SLOT2]: 3, [USAGE]: 0 } } });
  });

  it('rejects over-budget, ineligible-level/provider resources, full slots, and requests beyond expended count without consuming use', () => {
    const cases = [
      { state: state(), selections: [{ resourceId: SLOT2, amount: 1 }, { resourceId: SLOT3, amount: 1 }], code: 'invalid-resource-transaction' },
      { state: state(), selections: [{ resourceId: SLOT6, amount: 1 }], code: 'invalid-resource-transaction' },
      { state: state({}, { [SLOT1]: 4 }), selections: [{ resourceId: SLOT1, amount: 1 }], code: 'resource-full' },
      { state: state(), selections: [{ resourceId: SLOT1, amount: 2 }], code: 'invalid-resource-transaction' },
      { state: state(), selections: [], code: 'invalid-resource-transaction' },
    ] as const;
    for (const testCase of cases) {
      const result = executeResourceTransaction(testCase.state, WEIGHTED, RESOURCES, { kind: 'restore-spell-slots-with-budget', selections: testCase.selections });
      expect(result).toMatchObject({ ok: false, error: { code: testCase.code } });
      expect(testCase.state.resourceUses[USAGE]).toBe(1);
    }
  });

  it('rejects duplicate slot selections, non-positive counts, and unavailable feature uses', () => {
    expect(executeResourceTransaction(state(), WEIGHTED, RESOURCES, { kind: 'restore-spell-slots-with-budget', selections: [{ resourceId: SLOT1, amount: 1 }, { resourceId: SLOT1, amount: 1 }] })).toMatchObject({ ok: false, error: { code: 'invalid-resource-transaction' } });
    expect(executeResourceTransaction(state(), WEIGHTED, RESOURCES, { kind: 'restore-spell-slots-with-budget', selections: [{ resourceId: SLOT1, amount: 0 }] })).toMatchObject({ ok: false, error: { code: 'invalid-amount' } });
    expect(executeResourceTransaction(state({}, { [USAGE]: 0 }), WEIGHTED, RESOURCES, { kind: 'restore-spell-slots-with-budget', selections: [{ resourceId: SLOT1, amount: 1 }] })).toMatchObject({ ok: false, error: { code: 'resource-transaction-unavailable' } });
  });

  it('preserves HP, Temporary HP, Hit Dice, unrelated Long-Rest resources, and unselected slots while applying the existing Short Rest path', () => {
    const before = state({ currentHp: 9, temporaryHp: 7, hitDiceRemaining: 2 });
    const result = executeResourceTransaction(before, WEIGHTED, RESOURCES, { kind: 'restore-spell-slots-with-budget', selections: [{ resourceId: SLOT2, amount: 1 }] });
    expect(result).toMatchObject({ ok: true, value: { currentHp: 9, temporaryHp: 7, hitDiceRemaining: 2, resourceUses: { [SLOT1]: 3, [SLOT2]: 3, [SLOT3]: 1, [SLOT6]: 0, [TARGET]: 2, [SIDE]: 1, [USAGE]: 0 } } });
  });
});
