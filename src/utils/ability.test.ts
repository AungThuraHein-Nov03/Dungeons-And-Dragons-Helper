import { describe, expect, it } from 'vitest';
import { calculateAbilityModifier, formatModifier } from './ability';

describe('ability modifiers', () => {
  it.each([
    [1, -5],
    [9, -1],
    [10, 0],
    [11, 0],
    [18, 4],
    [30, 10],
  ])('calculates score %i as modifier %i', (score, expected) => {
    expect(calculateAbilityModifier(score)).toBe(expected);
  });

  it('formats modifiers with an explicit sign for zero and positive values', () => {
    expect(formatModifier(4)).toBe('+4');
    expect(formatModifier(0)).toBe('+0');
    expect(formatModifier(-1)).toBe('-1');
  });
});
