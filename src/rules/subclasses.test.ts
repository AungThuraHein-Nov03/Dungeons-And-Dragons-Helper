import { describe, expect, it } from 'vitest';
import { contentRegistry } from '../services/contentRegistry';
import { fighterInput, CHAMPION_ID } from '../test/fixtures';
import { deriveCharacterSubclass } from './subclasses';

describe('subclass derivation', () => {
  it('rejects Champion below acquisition level', () => {
    const result = deriveCharacterSubclass(fighterInput({ level: 2, subclassId: CHAMPION_ID }), contentRegistry);
    expect(result).toMatchObject({ ok: false, error: { code: 'subclass-not-acquired' } });
  });

  it.each([
    [3, ['Improved Critical', 'Remarkable Athlete'], ['Additional Fighting Style', 'Heroic Warrior', 'Superior Critical', 'Survivor']],
    [6, ['Improved Critical', 'Remarkable Athlete'], ['Additional Fighting Style', 'Heroic Warrior', 'Superior Critical', 'Survivor']],
    [7, ['Improved Critical', 'Remarkable Athlete', 'Additional Fighting Style'], ['Heroic Warrior', 'Superior Critical', 'Survivor']],
    [10, ['Improved Critical', 'Remarkable Athlete', 'Additional Fighting Style', 'Heroic Warrior'], ['Superior Critical', 'Survivor']],
    [15, ['Improved Critical', 'Remarkable Athlete', 'Additional Fighting Style', 'Heroic Warrior', 'Superior Critical'], ['Survivor']],
    [18, ['Improved Critical', 'Remarkable Athlete', 'Additional Fighting Style', 'Heroic Warrior', 'Superior Critical', 'Survivor'], []],
  ])('gates Champion progression at level %i', (level, acquired, future) => {
    const result = deriveCharacterSubclass(fighterInput({ level }), contentRegistry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.subclass?.acquiredFeatures.map((feature) => feature.name)).toEqual(acquired);
    expect(result.value.subclass?.futureFeatures.map((feature) => feature.name)).toEqual(future);
    expect(result.value.effects).toEqual([
      { type: 'critical-threshold', attackKind: 'weapon', minimumNatural: 19 },
      { type: 'skill-check-advantage', skillIds: ['athletics'] },
      { type: 'initiative-roll-mode', mode: 'advantage' },
      ...(level >= 15 ? [{ type: 'critical-threshold' as const, attackKind: 'weapon' as const, minimumNatural: 18 }] : []),
    ]);
  });

  it('leaves an unresolved legacy subclass mechanically empty', () => {
    const result = deriveCharacterSubclass(fighterInput({ level: 4, subclassId: undefined }), contentRegistry);
    expect(result).toEqual({ ok: true, value: { effects: [], spellcastingProviders: [], spellGrants: [], resources: [], resourceConsumers: [], resourceTransactions: [], activeSelfEffects: [] } });
  });
});
