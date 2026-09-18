import { describe, expect, it } from 'vitest';
import {
  applyOptionalDiceTransformation,
  listEligibleOptionalDiceTransformations,
  rollRequest,
  validateRollRequest,
} from './diceEngine';
import type { RollRequest } from './types';

function sequence(values: readonly number[], die: number) {
  let index = 0;
  return () => (values[Math.min(index++, values.length - 1)] - 1) / die;
}

const luck = {
  id: 'homebrew:test:transform:luck',
  sourceLabel: 'Lucky Echo',
  optional: true,
  type: 'reroll-once-use-new' as const,
  die: 20 as const,
  qualifyingFaces: [1],
};

const floorD6 = {
  id: 'homebrew:test:transform:floor-d6',
  sourceLabel: 'Measured Force',
  optional: false,
  type: 'minimum-die-face' as const,
  die: 6 as const,
  minimum: 3,
};

function d20Request(overrides: Partial<RollRequest> = {}): RollRequest {
  return {
    type: 'ability-check',
    label: 'Test',
    expression: { kind: 'dice', dice: [{ quantity: 1, die: 20 }], modifier: 2 },
    mode: 'normal',
    source: { characterId: 'm13e-dice' },
    outcome: { kind: 'check' },
    ...overrides,
  };
}

describe('M13E Dice Engine transformations', () => {
  it('keeps optional rerolls dormant until explicitly chosen, then uses the replacement even when it is another 1', () => {
    const rolled = rollRequest(d20Request({ diceTransformations: [luck] }), sequence([1], 20));
    expect(rolled).toMatchObject({ ok: true, value: { dice: [{ values: [1] }], keptD20: 1, natural: 'nat1', total: 3 } });
    if (!rolled.ok) return;

    expect(listEligibleOptionalDiceTransformations(rolled.value)).toEqual([luck]);
    const rerolled = applyOptionalDiceTransformation(rolled.value, luck.id, sequence([1], 20));
    expect(rerolled).toMatchObject({
      ok: true,
      value: {
        dice: [{ values: [1] }],
        keptD20: 1,
        natural: 'nat1',
        total: 3,
        diceTransformationApplications: [{
          transformationId: luck.id,
          sourceLabel: 'Lucky Echo',
          type: 'reroll-once-use-new',
          original: 1,
          replacement: 1,
          final: 1,
        }],
      },
    });
    if (!rerolled.ok) return;
    expect(listEligibleOptionalDiceTransformations(rerolled.value)).toEqual([]);
    expect(applyOptionalDiceTransformation(rerolled.value, luck.id, sequence([20], 20))).toMatchObject({
      ok: false,
      error: { code: 'invalid-dice-transformation' },
    });
  });

  it('rerolls only one qualifying die across an Advantage pair and resolves the kept d20 after replacement', () => {
    const request = d20Request({ mode: 'advantage', diceTransformations: [luck] });
    const rolled = rollRequest(request, sequence([1, 10], 20));
    expect(rolled).toMatchObject({ ok: true, value: { dice: [{ values: [1, 10] }], keptD20: 10, resolvedMode: 'advantage' } });
    if (!rolled.ok) return;
    const rerolled = applyOptionalDiceTransformation(rolled.value, luck.id, sequence([20], 20));
    expect(rerolled).toMatchObject({ ok: true, value: { dice: [{ values: [20, 10] }], keptD20: 20, natural: 'nat20', total: 22 } });
  });

  it('preserves Disadvantage selection after an explicit reroll', () => {
    const request = d20Request({ mode: 'disadvantage', diceTransformations: [luck] });
    const rolled = rollRequest(request, sequence([1, 10], 20));
    if (!rolled.ok) throw new Error(rolled.error.message);
    const rerolled = applyOptionalDiceTransformation(rolled.value, luck.id, sequence([18], 20));
    expect(rerolled).toMatchObject({ ok: true, value: { dice: [{ values: [18, 10] }], keptD20: 10, resolvedMode: 'disadvantage', total: 12 } });
  });

  it('derives attack critical state independently from natural-1/natural-20 metadata', () => {
    const threshold19 = d20Request({ type: 'attack', outcome: { kind: 'attack' }, criticalThreshold: 19 });
    expect(rollRequest(threshold19, sequence([19], 20))).toMatchObject({
      ok: true,
      value: { keptD20: 19, critical: true, natural: undefined },
    });
    expect(rollRequest(threshold19, sequence([20], 20))).toMatchObject({
      ok: true,
      value: { keptD20: 20, critical: true, natural: 'nat20' },
    });
    expect(rollRequest(threshold19, sequence([1], 20))).toMatchObject({
      ok: true,
      value: { keptD20: 1, critical: false, natural: 'nat1' },
    });
  });

  it('evaluates critical threshold after Advantage/Disadvantage chooses the kept d20', () => {
    const advantage = d20Request({ type: 'attack', outcome: { kind: 'attack' }, mode: 'advantage', criticalThreshold: 19 });
    expect(rollRequest(advantage, sequence([18, 19], 20))).toMatchObject({ ok: true, value: { keptD20: 19, critical: true } });
    const disadvantage = d20Request({ type: 'attack', outcome: { kind: 'attack' }, mode: 'disadvantage', criticalThreshold: 19 });
    expect(rollRequest(disadvantage, sequence([19, 18], 20))).toMatchObject({ ok: true, value: { keptD20: 18, critical: false } });
  });

  it('applies minimum-die-face independently to every qualifying damage die and preserves the modifier', () => {
    const request: RollRequest = {
      type: 'damage',
      label: 'Measured Damage',
      expression: { kind: 'dice', dice: [{ quantity: 4, die: 6 }], modifier: 5 },
      mode: 'normal',
      diceTransformations: [floorD6],
      source: { characterId: 'm13e-dice' },
      outcome: { kind: 'damage', damageType: 'slashing' },
    };
    const result = rollRequest(request, sequence([1, 2, 3, 6], 6));
    expect(result).toMatchObject({
      ok: true,
      value: {
        dice: [{ die: 6, values: [3, 3, 3, 6] }],
        modifier: 5,
        total: 20,
      },
    });
    if (!result.ok) return;
    expect(result.value.diceTransformationApplications).toHaveLength(2);
    expect(result.value.diceTransformationApplications?.map((entry) => [entry.original, entry.final])).toEqual([[1, 3], [2, 3]]);
  });

  it('does not transform qualifying-size dice that are already at or above the floor', () => {
    const request: RollRequest = {
      type: 'damage',
      label: 'Measured Damage',
      expression: { kind: 'dice', dice: [{ quantity: 2, die: 6 }], modifier: 0 },
      mode: 'normal',
      diceTransformations: [floorD6],
      source: { characterId: 'm13e-dice' },
      outcome: { kind: 'damage' },
    };
    const result = rollRequest(request, sequence([3, 5], 6));
    expect(result).toMatchObject({ ok: true, value: { dice: [{ values: [3, 5] }], total: 8 } });
    if (result.ok) expect(result.value.diceTransformationApplications).toBeUndefined();
  });

  it('rejects malformed, duplicate, and optional minimum-floor transformations', () => {
    const missingOptional = d20Request({
      diceTransformations: [{ ...luck, optional: undefined } as unknown as typeof luck],
    });
    expect(validateRollRequest(missingOptional)).toMatchObject({ ok: false, error: { code: 'invalid-dice-transformation' } });

    const duplicate = d20Request({ diceTransformations: [luck, luck] });
    expect(validateRollRequest(duplicate)).toMatchObject({ ok: false, error: { code: 'invalid-dice-transformation' } });

    const optionalFloor: RollRequest = {
      type: 'damage',
      label: 'Invalid floor',
      expression: { kind: 'dice', dice: [{ quantity: 1, die: 6 }], modifier: 0 },
      mode: 'normal',
      diceTransformations: [{ ...floorD6, optional: true }],
      source: { characterId: 'm13e-dice' },
      outcome: { kind: 'damage' },
    };
    expect(validateRollRequest(optionalFloor)).toMatchObject({ ok: false, error: { code: 'invalid-dice-transformation' } });
  });
});
