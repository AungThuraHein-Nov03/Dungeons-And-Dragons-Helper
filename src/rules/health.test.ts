import { describe, expect, it } from 'vitest';
import { SRD_FIGHTER } from '../content/srd';
import { fighterInput } from '../test/fixtures';
import { createFixedHpProgression, deriveHealth, validateHpProgression } from './health';

describe('health derivation', () => {
  it('derives level 1 Fighter HP from the d10 maximum plus Constitution modifier', () => {
    const result = deriveHealth(fighterInput({ level: 1 }), SRD_FIGHTER);
    expect(result).toEqual({ ok: true, value: { maximumHp: 12, hitDie: 10, maximumHitDice: 1 } });
  });

  it('derives higher-level Fighter HP using fixed progression', () => {
    const result = deriveHealth(fighterInput({ level: 4 }), SRD_FIGHTER);
    expect(result).toEqual({ ok: true, value: { maximumHp: 36, hitDie: 10, maximumHitDice: 4 } });
  });

  it('derives HP from recorded manual rolls without inventing results', () => {
    const result = deriveHealth(fighterInput({
      level: 4,
      hpProgression: [
        { level: 2, method: 'rolled', roll: 7 },
        { level: 3, method: 'rolled', roll: 4 },
        { level: 4, method: 'rolled', roll: 5 },
      ],
    }), SRD_FIGHTER);
    expect(result).toMatchObject({ ok: true, value: { maximumHp: 34 } });
  });

  it('applies Constitution modifier changes across every character level', () => {
    const con14 = deriveHealth(fighterInput({ level: 4, abilityScores: { constitution: 14 } }), SRD_FIGHTER);
    const con16 = deriveHealth(fighterInput({ level: 4, abilityScores: { constitution: 16 } }), SRD_FIGHTER);
    expect(con14).toMatchObject({ ok: true, value: { maximumHp: 36 } });
    expect(con16).toMatchObject({ ok: true, value: { maximumHp: 40 } });
  });

  it('uses the class Hit Die and fixed value rather than Fighter-specific hardcoding', () => {
    const customClass = { ...SRD_FIGHTER, hitDie: 8 as const, fixedHitPointsPerLevel: 5 };
    const result = deriveHealth(fighterInput({ level: 3, abilityScores: { constitution: 12 } }), customClass);
    expect(result).toEqual({ ok: true, value: { maximumHp: 21, hitDie: 8, maximumHitDice: 3 } });
  });

  it('validates missing, duplicate, and out-of-range rolled progression', () => {
    expect(validateHpProgression(createFixedHpProgression(4), 4, 10)).toBeUndefined();
    expect(validateHpProgression([{ level: 2, method: 'fixed' }], 4, 10)).toMatch(/one entry/i);
    expect(validateHpProgression([
      { level: 2, method: 'fixed' },
      { level: 2, method: 'fixed' },
      { level: 4, method: 'fixed' },
    ], 4, 10)).toMatch(/duplicate/i);
    expect(validateHpProgression([
      { level: 2, method: 'rolled', roll: 11 },
      { level: 3, method: 'fixed' },
      { level: 4, method: 'fixed' },
    ], 4, 10)).toMatch(/1 to 10/i);
  });
});
