import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RollResult } from './types';
import {
  clearDiceVisualEvent,
  createDiceVisualEvent,
  getDiceVisualEventSnapshot,
  publishDiceVisualResult,
  subscribeDiceVisualEvents,
} from './diceVisualEvent';

function result(overrides: Partial<RollResult> = {}): RollResult {
  return {
    request: {
      type: 'damage',
      label: 'Scimitar Damage + Sneak Attack',
      expression: { kind: 'dice', dice: [{ quantity: 2, die: 6 }], modifier: 4 },
      mode: 'normal',
      source: { characterId: 'character-1' },
      outcome: { kind: 'damage' },
    },
    dice: [{ die: 6, values: [3, 5] }],
    modifier: 4,
    total: 12,
    effects: [],
    ...overrides,
  };
}

afterEach(() => {
  const current = getDiceVisualEventSnapshot();
  if (current) clearDiceVisualEvent(current.id);
});

describe('authoritative roll visual translation', () => {
  it('flattens every authoritative die while omitting the static modifier', () => {
    const event = createDiceVisualEvent(result({
      dice: [
        { die: 6, values: [3, 5] },
        { die: 8, values: [7] },
      ],
    }), 'event-1');

    expect(event).toEqual({
      id: 'event-1',
      title: 'Scimitar Damage + Sneak Attack',
      dice: [
        { id: 'event-1:0', sides: 6, value: 3, emphasis: 'normal', labelMode: 'standard' },
        { id: 'event-1:1', sides: 6, value: 5, emphasis: 'normal', labelMode: 'standard' },
        { id: 'event-1:2', sides: 8, value: 7, emphasis: 'normal', labelMode: 'standard' },
      ],
    });
  });

  it('returns no visual event for a fixed result with no dice', () => {
    expect(createDiceVisualEvent(result({
      request: {
        ...result().request,
        expression: { kind: 'fixed', amount: 5, modifier: 2 },
      },
      dice: [],
      total: 7,
    }), 'fixed')).toBeNull();
  });

  it.each([
    [7, 10, 10, 7],
    [20, 10, 2, 10],
    [100, 10, 10, 10],
  ] as const)('maps d100 value %i to percentile tens and ones dice', (percentile, sides, tensFace, onesFace) => {
    const event = createDiceVisualEvent(result({ dice: [{ die: 100, values: [percentile] }] }), `d100-${percentile}`);

    expect(event?.dice).toEqual([
      {
        id: `d100-${percentile}:0`,
        sides,
        value: tensFace,
        emphasis: 'normal',
        labelMode: 'percentile-tens',
      },
      {
        id: `d100-${percentile}:1`,
        sides,
        value: onesFace,
        emphasis: 'normal',
        labelMode: 'percentile-ones',
      },
    ]);
  });

  it('marks the uniquely identifiable kept and discarded d20 results', () => {
    const event = createDiceVisualEvent(result({
      request: { ...result().request, expression: { kind: 'dice', dice: [{ quantity: 1, die: 20 }], modifier: 4 }, mode: 'advantage' },
      dice: [{ die: 20, values: [8, 17] }],
      keptD20: 17,
      resolvedMode: 'advantage',
      total: 21,
    }), 'advantage');

    expect(event?.dice.map((die) => die.emphasis)).toEqual(['discarded', 'kept']);
  });

  it('does not invent kept-die identity for tied advantage dice', () => {
    const event = createDiceVisualEvent(result({
      request: { ...result().request, expression: { kind: 'dice', dice: [{ quantity: 1, die: 20 }], modifier: 4 }, mode: 'advantage' },
      dice: [{ die: 20, values: [17, 17] }],
      keptD20: 17,
      resolvedMode: 'advantage',
      total: 21,
    }), 'tie');

    expect(event?.dice.map((die) => die.emphasis)).toEqual(['normal', 'normal']);
  });

  it('fails closed when any visual die value is invalid', () => {
    expect(createDiceVisualEvent(result({ dice: [{ die: 6, values: [0] }] }), 'invalid-low')).toBeNull();
    expect(createDiceVisualEvent(result({ dice: [{ die: 20, values: [21] }] }), 'invalid-high')).toBeNull();
    expect(createDiceVisualEvent(result({ dice: [{ die: 100, values: [101] }] }), 'invalid-percentile')).toBeNull();
  });

  it('emits both Fighter 4 / Rogue 1 weapon and Sneak Attack dice', () => {
    const event = createDiceVisualEvent(result({
      request: {
        ...result().request,
        label: 'Scimitar Damage + Sneak Attack',
        expression: { kind: 'dice', dice: [{ quantity: 1, die: 6 }, { quantity: 1, die: 6 }], modifier: 4 },
      },
      dice: [{ die: 6, values: [4] }, { die: 6, values: [5] }],
      total: 13,
    }), 'sneak');

    expect(event?.dice.map(({ sides, value }) => ({ sides, value }))).toEqual([
      { sides: 6, value: 4 },
      { sides: 6, value: 5 },
    ]);
  });

  it('emits all doubled weapon and Sneak Attack dice for a critical', () => {
    const event = createDiceVisualEvent(result({
      request: {
        ...result().request,
        label: 'Scimitar Damage + Sneak Attack — Critical',
        expression: { kind: 'dice', dice: [{ quantity: 2, die: 6 }, { quantity: 2, die: 6 }], modifier: 4 },
      },
      dice: [{ die: 6, values: [5, 3] }, { die: 6, values: [4, 2] }],
      total: 18,
    }), 'critical-sneak');

    expect(event?.dice.map((die) => die.value)).toEqual([5, 3, 4, 2]);
  });

  it('represents Second Wind and multi-die spell rolls directly from authoritative values', () => {
    const secondWind = createDiceVisualEvent(result({
      request: { ...result().request, label: 'Second Wind', type: 'healing', outcome: { kind: 'healing' } },
      dice: [{ die: 10, values: [6] }],
      modifier: 4,
      total: 10,
    }), 'second-wind');
    const fireball = createDiceVisualEvent(result({
      request: { ...result().request, label: 'Fireball — Damage' },
      dice: [{ die: 6, values: [1, 2, 3, 4, 5, 6, 2, 4] }],
      modifier: 0,
      total: 27,
    }), 'fireball');

    expect(secondWind?.dice).toHaveLength(1);
    expect(secondWind?.dice[0]).toMatchObject({ sides: 10, value: 6 });
    expect(fireball?.dice.map((die) => die.value)).toEqual([1, 2, 3, 4, 5, 6, 2, 4]);
  });
});

describe('transient newest-roll store', () => {
  it('replaces an active event with the newest authoritative result', () => {
    publishDiceVisualResult(result(), 'first');
    publishDiceVisualResult(result({ dice: [{ die: 12, values: [11] }] }), 'second');

    expect(getDiceVisualEventSnapshot()).toMatchObject({
      id: 'second',
      dice: [{ sides: 12, value: 11 }],
    });
  });

  it('isolates subscriber failures so publication still reaches healthy subscribers', () => {
    const healthy = vi.fn();
    const stopThrowing = subscribeDiceVisualEvents(() => { throw new Error('visual subscriber failed'); });
    const stopHealthy = subscribeDiceVisualEvents(healthy);

    expect(() => publishDiceVisualResult(result(), 'safe')).not.toThrow();
    expect(healthy).toHaveBeenCalledOnce();

    stopThrowing();
    stopHealthy();
  });

  it('does not write character, project, or play-session persistence', () => {
    window.localStorage.setItem('character-sentinel', 'unchanged');
    window.sessionStorage.setItem('session-sentinel', 'unchanged');
    const localBefore = JSON.stringify({ ...window.localStorage });
    const sessionBefore = JSON.stringify({ ...window.sessionStorage });

    publishDiceVisualResult(result(), 'transient-only');

    expect(JSON.stringify({ ...window.localStorage })).toBe(localBefore);
    expect(JSON.stringify({ ...window.sessionStorage })).toBe(sessionBefore);
  });
});
