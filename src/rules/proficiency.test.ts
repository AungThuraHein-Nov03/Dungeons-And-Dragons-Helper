import { describe, expect, it } from 'vitest';
import { SRD_FIGHTER } from '../content/srd';
import { deriveProficiencyBonus } from './proficiency';

describe('proficiency bonus', () => {
  it.each([
    [1, 2], [4, 2], [5, 3], [8, 3], [9, 4], [12, 4], [13, 5], [16, 5], [17, 6], [20, 6],
  ])('derives level %i as +%i from class progression', (level, expected) => {
    expect(deriveProficiencyBonus(level, SRD_FIGHTER)).toEqual({ ok: true, value: expected });
  });

  it('returns a predictable error for a level outside class progression', () => {
    const result = deriveProficiencyBonus(21, SRD_FIGHTER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid-level');
  });
});
