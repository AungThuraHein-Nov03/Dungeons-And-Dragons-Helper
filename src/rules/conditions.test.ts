import { describe, expect, it } from 'vitest';
import { resolveD20RollContext } from '../dice/diceEngine';
import { CHARACTER_CONDITION_IDS, deriveConditionD20Context, getCharacterConditionDefinition } from './conditions';

describe('M13B Character-side condition rules', () => {
  it('supports exactly the 14 non-Exhaustion session conditions', () => {
    expect(CHARACTER_CONDITION_IDS).toEqual([
      'blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible',
      'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious',
    ]);
    expect(CHARACTER_CONDITION_IDS).not.toContain('exhaustion');
  });

  it('applies Poisoned only to attacks and ability/skill checks, not saving throws', () => {
    expect(deriveConditionD20Context(['poisoned'], { kind: 'attack' })).toEqual({ disadvantageSources: ['Poisoned'] });
    expect(deriveConditionD20Context(['poisoned'], { kind: 'ability-check' })).toEqual({ disadvantageSources: ['Poisoned'] });
    expect(deriveConditionD20Context(['poisoned'], { kind: 'skill-check' })).toEqual({ disadvantageSources: ['Poisoned'] });
    expect(deriveConditionD20Context(['poisoned'], { kind: 'saving-throw', ability: 'constitution' })).toBeUndefined();
  });

  it('routes Poisoned cancellation through the existing generic M13A resolver', () => {
    const poisoned = deriveConditionD20Context(['poisoned'], { kind: 'attack' });
    expect(resolveD20RollContext('normal', poisoned).mode).toBe('disadvantage');
    expect(resolveD20RollContext('advantage', poisoned).mode).toBe('normal');
    expect(resolveD20RollContext('normal', { ...poisoned, advantageSources: ['Synthetic Advantage'] }).mode).toBe('normal');
  });

  it('does not stack multiple automatic Disadvantage sources into extra dice', () => {
    const context = deriveConditionD20Context(['poisoned', 'blinded', 'prone'], { kind: 'attack' });
    expect(context?.disadvantageSources).toEqual(['Poisoned', 'Blinded', 'Prone']);
    expect(resolveD20RollContext('normal', context).mode).toBe('disadvantage');
  });

  it('automates only deterministic Blinded, Prone, Restrained, Invisible, and incapacitating consequences', () => {
    expect(deriveConditionD20Context(['blinded'], { kind: 'attack' })).toEqual({ disadvantageSources: ['Blinded'] });
    expect(deriveConditionD20Context(['prone'], { kind: 'attack' })).toEqual({ disadvantageSources: ['Prone'] });
    expect(deriveConditionD20Context(['restrained'], { kind: 'attack' })).toEqual({ disadvantageSources: ['Restrained'] });
    expect(deriveConditionD20Context(['restrained'], { kind: 'saving-throw', ability: 'dexterity' })).toEqual({ disadvantageSources: ['Restrained'] });
    expect(deriveConditionD20Context(['restrained'], { kind: 'saving-throw', ability: 'strength' })).toBeUndefined();
    expect(deriveConditionD20Context(['invisible'], { kind: 'initiative' })).toEqual({ advantageSources: ['Invisible'] });
    expect(deriveConditionD20Context(['stunned'], { kind: 'initiative' })).toEqual({ disadvantageSources: ['Stunned'] });
  });

  it('keeps source/target/table-dependent conditions informational rather than silently modifying rolls', () => {
    for (const condition of ['charmed', 'deafened', 'frightened', 'grappled'] as const) {
      expect(deriveConditionD20Context([condition], { kind: 'attack' })).toBeUndefined();
      expect(deriveConditionD20Context([condition], { kind: 'ability-check' })).toBeUndefined();
    }
    expect(getCharacterConditionDefinition('frightened').informational.join(' ')).toMatch(/line of sight/i);
    expect(getCharacterConditionDefinition('grappled').informational.join(' ')).toMatch(/grappler/i);
  });
});
