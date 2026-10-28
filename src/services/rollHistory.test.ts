import { afterEach, describe, expect, it, vi } from 'vitest';
import { rollRequest } from '../dice/diceEngine';
import { clearDiceVisualEvent, getDiceVisualEventSnapshot, subscribeDiceVisualEvents } from '../dice/diceVisualEvent';
import type { RollResult } from '../dice/types';
import { addRollHistory, applyRollHistoryDiceTransformation, clearRollHistory, loadRollHistory, MAX_ROLL_HISTORY, ROLL_HISTORY_STORAGE_KEY } from './rollHistory';

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

afterEach(() => {
  const current = getDiceVisualEventSnapshot();
  if (current) clearDiceVisualEvent(current.id);
});

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

  it('publishes the already-persisted authoritative result through the shared visual boundary', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDiceVisualEvents(listener);

    const entry = addRollHistory(result('Visual d20', 14));

    expect(loadRollHistory()).toEqual([entry]);
    expect(getDiceVisualEventSnapshot()).toMatchObject({
      title: 'Visual d20',
      dice: [{ sides: 20, value: 14 }],
    });
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('keeps authoritative history mutation successful when a visual subscriber fails', () => {
    const unsubscribe = subscribeDiceVisualEvents(() => { throw new Error('WebGL host failed'); });

    expect(() => addRollHistory(result('Still authoritative', 9))).not.toThrow();
    expect(loadRollHistory()[0].result.total).toBe(11);

    unsubscribe();
  });

  it('publishes an authoritative optional reroll as the newest visual event', () => {
    const rolled = rollRequest({
      type: 'ability-check',
      label: 'Lucky Check',
      expression: { kind: 'dice', dice: [{ quantity: 1, die: 20 }], modifier: 2 },
      mode: 'normal',
      diceTransformations: [{
        id: 'test:luck',
        sourceLabel: 'Luck',
        optional: true,
        type: 'reroll-once-use-new',
        die: 20,
        qualifyingFaces: [1],
      }],
      source: { characterId: 'character-test' },
      outcome: { kind: 'check' },
    }, () => 0);
    if (!rolled.ok) throw new Error(rolled.error.message);
    const entry = addRollHistory(rolled.value);

    const transformed = applyRollHistoryDiceTransformation(entry.id, 'test:luck', window.localStorage, () => 0.5);

    expect(transformed).toMatchObject({ ok: true, value: { result: { dice: [{ values: [11] }] } } });
    expect(getDiceVisualEventSnapshot()).toMatchObject({ dice: [{ sides: 20, value: 11 }] });
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
