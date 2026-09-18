import { describe, expect, it } from 'vitest';
import { deriveAbilityModifiers } from './abilities';
import { fighterInput } from '../test/fixtures';

describe('rules ability modifiers', () => {
  it('derives all six numeric modifiers', () => {
    expect(deriveAbilityModifiers(fighterInput().abilityScores)).toEqual({
      strength: 2,
      dexterity: 4,
      constitution: 2,
      intelligence: 0,
      wisdom: 1,
      charisma: 1,
    });
  });
});
