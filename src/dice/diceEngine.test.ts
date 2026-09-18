import { describe, expect, it, vi } from 'vitest';
import { doubleDiceForCritical, resolveD20RollContext, rollRequest } from './diceEngine';
import type { RandomSource, RollDieSize, RollRequest } from './types';

function sequence(...values: number[]): RandomSource {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}

function request(die: RollDieSize, quantity = 1, modifier = 0, mode: RollRequest['mode'] = 'normal'): RollRequest {
  return {
    type: die === 20 ? 'ability-check' : 'feature',
    label: 'Test Roll',
    expression: { kind: 'dice', dice: [{ quantity, die }], modifier },
    mode,
    source: { characterId: 'character-test' },
    outcome: { kind: die === 20 ? 'check' : 'feature' },
  };
}

describe('M13A D20 context resolution', () => {
  it.each([
    ['normal', {}, 'normal'],
    ['advantage', {}, 'advantage'],
    ['disadvantage', {}, 'disadvantage'],
    ['normal', { advantageSources: ['A'] }, 'advantage'],
    ['normal', { disadvantageSources: ['D'] }, 'disadvantage'],
    ['normal', { advantageSources: ['A', 'B'] }, 'advantage'],
    ['normal', { disadvantageSources: ['D', 'E'] }, 'disadvantage'],
    ['normal', { advantageSources: ['A'], disadvantageSources: ['D'] }, 'normal'],
    ['advantage', { disadvantageSources: ['D'] }, 'normal'],
    ['disadvantage', { advantageSources: ['A'] }, 'normal'],
    ['advantage', { advantageSources: ['A'] }, 'advantage'],
    ['disadvantage', { disadvantageSources: ['D'] }, 'disadvantage'],
  ] as const)('resolves manual %s with automatic context', (manual, context, expected) => {
    expect(resolveD20RollContext(manual, context).mode).toBe(expected);
  });

  it('applies contextual modifiers once while retaining manual and resolved modes', () => {
    const contextual = { ...request(20, 1, 3, 'advantage'), d20Context: { modifiers: [{ label: 'Cover', amount: 2 }], disadvantageSources: ['Hindrance'] } };
    expect(rollRequest(contextual, sequence(0.45))).toMatchObject({ ok: true, value: { request: { mode: 'advantage' }, resolvedMode: 'normal', contextualModifier: 2, modifier: 5, keptD20: 10, total: 15 } });
  });
});

describe('Dice Engine', () => {
  it.each([
    [4, 4], [6, 6], [8, 8], [10, 10], [12, 12], [20, 20], [100, 100],
  ] as const)('supports d%i', (die, expected) => {
    const result = rollRequest(request(die), () => 0.999999);
    expect(result).toMatchObject({ ok: true, value: { total: expected, dice: [{ die, values: [expected] }] } });
  });

  it('retains multiple individual dice and applies the modifier once', () => {
    const result = rollRequest(request(6, 4, 3), sequence(0, 0.2, 0.5, 0.9999));
    expect(result).toMatchObject({
      ok: true,
      value: { dice: [{ die: 6, values: [1, 2, 4, 6] }], modifier: 3, total: 16 },
    });
  });

  it('supports Normal, Advantage, and Disadvantage with both raw d20s retained', () => {
    expect(rollRequest(request(20, 1, 3, 'normal'), sequence(0.45))).toMatchObject({ ok: true, value: { keptD20: 10, total: 13 } });
    expect(rollRequest(request(20, 1, 3, 'advantage'), sequence(0.3, 0.8))).toMatchObject({ ok: true, value: { dice: [{ values: [7, 17] }], keptD20: 17, total: 20 } });
    expect(rollRequest(request(20, 1, 3, 'disadvantage'), sequence(0.3, 0.8))).toMatchObject({ ok: true, value: { dice: [{ values: [7, 17] }], keptD20: 7, total: 10 } });
  });

  it('uses the kept die for Nat 20 / Nat 1 detection', () => {
    expect(rollRequest(request(20, 1, 0, 'advantage'), sequence(0.9999, 0.15))).toMatchObject({ ok: true, value: { keptD20: 20, natural: 'nat20' } });
    const disadvantaged = rollRequest(request(20, 1, 0, 'disadvantage'), sequence(0.9999, 0.15));
    expect(disadvantaged).toMatchObject({ ok: true, value: { keptD20: 4 } });
    if (disadvantaged.ok) expect(disadvantaged.value.natural).toBeUndefined();
    expect(rollRequest(request(20), () => 0)).toMatchObject({ ok: true, value: { keptD20: 1, natural: 'nat1' } });
  });

  it('doubles only dice quantities for critical damage', () => {
    expect(doubleDiceForCritical({ kind: 'dice', dice: [{ quantity: 1, die: 6 }], modifier: 4 })).toEqual({ kind: 'dice', dice: [{ quantity: 2, die: 6 }], modifier: 4 });
    expect(doubleDiceForCritical({ kind: 'dice', dice: [{ quantity: 2, die: 6 }, { quantity: 1, die: 8 }], modifier: 3 })).toEqual({ kind: 'dice', dice: [{ quantity: 4, die: 6 }, { quantity: 2, die: 8 }], modifier: 3 });
    expect(doubleDiceForCritical({ kind: 'fixed', amount: 1, modifier: 4 })).toEqual({ kind: 'fixed', amount: 1, modifier: 4 });
  });

  it('rejects zero quantity, unsupported dice, invalid modifiers, invalid modes, and RNG boundary values', () => {
    const zero = request(6, 1);
    const zeroExpression = { ...zero, expression: { kind: 'dice' as const, dice: [{ quantity: 0, die: 6 as const }], modifier: 0 } };
    expect(rollRequest(zeroExpression)).toMatchObject({ ok: false, error: { code: 'invalid-dice-expression' } });

    const unsupported = { ...zero, expression: { kind: 'dice' as const, dice: [{ quantity: 1, die: 7 as 6 }], modifier: 0 } };
    expect(rollRequest(unsupported)).toMatchObject({ ok: false, error: { code: 'invalid-dice-expression' } });

    const invalidModifier = { ...zero, expression: { kind: 'dice' as const, dice: [{ quantity: 1, die: 6 as const }], modifier: Number.NaN } };
    expect(rollRequest(invalidModifier)).toMatchObject({ ok: false, error: { code: 'invalid-dice-expression' } });
    expect(rollRequest(request(6, 1, 0, 'advantage'))).toMatchObject({ ok: false, error: { code: 'invalid-roll-mode' } });
    expect(rollRequest(request(6), () => 1)).toMatchObject({ ok: false, error: { code: 'invalid-rng' } });
    expect(rollRequest(request(6), () => -0.01)).toMatchObject({ ok: false, error: { code: 'invalid-rng' } });
  });

  it('rejects malformed roll requests without throwing', () => {
    expect(rollRequest({} as RollRequest)).toMatchObject({ ok: false, error: { code: 'invalid-roll-request' } });
    expect(rollRequest({ label: 'Bad', type: 'ability-check', mode: 'normal', source: {}, outcome: { kind: 'check' }, expression: null } as unknown as RollRequest)).toMatchObject({ ok: false, error: { code: 'invalid-roll-request' } });
  });

  it('does not call RNG for a fixed expression', () => {
    const rng = vi.fn(() => 0.5);
    const result = rollRequest({
      type: 'damage', label: 'Fixed Damage', expression: { kind: 'fixed', amount: 1, modifier: 4 }, mode: 'normal',
      source: { characterId: 'character-test' }, outcome: { kind: 'damage', damageType: 'piercing' },
    }, rng);
    expect(result).toMatchObject({ ok: true, value: { dice: [], total: 5 } });
    expect(rng).not.toHaveBeenCalled();
  });
});
