import { describe, expect, it } from 'vitest';
import type { RandomSource } from '../dice/types';
import { loadRollHistory } from './rollHistory';
import { rollManualDice } from './manualDice';

function sequence(...values: number[]): RandomSource {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}

describe('manual Dice Tray rolls', () => {
  it('uses the existing Dice Engine for a normal d20 and writes existing Roll History', () => {
    const result = rollManualDice('character-test', 20, 1, 3, 'normal', {
      rng: sequence(0.45), historyStorage: window.localStorage, now: () => new Date('2026-09-16T10:00:00.000Z'),
    });
    expect(result).toMatchObject({ ok: true, value: { dice: [{ die: 20, values: [10] }], keptD20: 10, modifier: 3, total: 13 } });
    expect(loadRollHistory()).toHaveLength(1);
    expect(loadRollHistory()[0].result.request.label).toBe('Manual 1d20 + 3');
  });

  it('preserves both d20s and keeps the higher value for Advantage', () => {
    const result = rollManualDice('character-test', 20, 1, 2, 'advantage', { rng: sequence(0.3, 0.8) });
    expect(result).toMatchObject({ ok: true, value: { dice: [{ die: 20, values: [7, 17] }], keptD20: 17, total: 19 } });
  });

  it('preserves both d20s and keeps the lower value for Disadvantage', () => {
    const result = rollManualDice('character-test', 20, 1, 2, 'disadvantage', { rng: sequence(0.3, 0.8) });
    expect(result).toMatchObject({ ok: true, value: { dice: [{ die: 20, values: [7, 17] }], keptD20: 7, total: 9 } });
  });

  it('supports a non-d20 quantity and modifier through the same Dice Engine', () => {
    const result = rollManualDice('character-test', 6, 2, 3, 'normal', { rng: sequence(0, 0.9999) });
    expect(result).toMatchObject({ ok: true, value: { dice: [{ die: 6, values: [1, 6] }], modifier: 3, total: 10 } });
  });
});
