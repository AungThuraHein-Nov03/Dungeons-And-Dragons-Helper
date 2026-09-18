import { describe, expect, it } from 'vitest';
import { rollRequest } from '../dice/diceEngine';
import type { RollResult } from '../dice/types';
import { addRollHistory, clearRollHistory, loadRollHistory, MAX_ROLL_HISTORY, ROLL_HISTORY_STORAGE_KEY } from './rollHistory';

function result(label: string, dieValue: number): RollResult {
  const rolled = rollRequest({
    type: 'ability-check',
    label,
    expression: { kind: 'dice', dice: [{ quantity: 1, die: 20 }], modifier: 2 },
    mode: 'normal',
    source: { characterId: 'character-test' },
    outcome: { kind: 'check' },
  }, () => (dieValue - 1) / 20);
  if (!rolled.ok) throw new Error(rolled.error.message);
  return rolled.value;
}

describe('roll history', () => {
  it('stores newest rolls first and clears independently from character state', () => {
    addRollHistory(result('First', 5), window.localStorage, () => new Date('2026-09-16T01:00:00Z'));
    addRollHistory(result('Second', 10), window.localStorage, () => new Date('2026-09-16T01:01:00Z'));
    expect(loadRollHistory().map((entry) => entry.result.request.label)).toEqual(['Second', 'First']);
    clearRollHistory();
    expect(loadRollHistory()).toEqual([]);
  });

  it('bounds persisted history size', () => {
    for (let index = 0; index < MAX_ROLL_HISTORY + 12; index += 1) {
      addRollHistory(result(`Roll ${index}`, (index % 20) + 1));
    }
    const history = loadRollHistory();
    expect(history).toHaveLength(MAX_ROLL_HISTORY);
    expect(history[0].result.request.label).toBe(`Roll ${MAX_ROLL_HISTORY + 11}`);
  });

  it('handles malformed persisted history safely and filters bad entries', () => {
    window.localStorage.setItem(ROLL_HISTORY_STORAGE_KEY, '{bad-json');
    expect(loadRollHistory()).toEqual([]);
    window.localStorage.setItem(ROLL_HISTORY_STORAGE_KEY, JSON.stringify({ nope: true }));
    expect(loadRollHistory()).toEqual([]);

    const valid = addRollHistory(result('Valid', 12));
    const badEffects = { ...valid, id: 'bad-effects', result: { ...valid.result, effects: [{ kind: 'hp', before: 'oops', after: 2 }] } };
    window.localStorage.setItem(ROLL_HISTORY_STORAGE_KEY, JSON.stringify([{ id: 'bad', rolledAt: 'bad', result: {} }, badEffects, valid]));
    expect(loadRollHistory()).toEqual([valid]);
  });
});
