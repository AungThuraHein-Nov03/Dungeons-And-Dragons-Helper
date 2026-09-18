import { describe, expect, it } from 'vitest';
import { deriveAbilityModifiers } from './abilities';
import { derivePassivePerception, deriveSkills, SKILL_DEFINITIONS } from './skills';
import { fighterInput } from '../test/fixtures';

describe('skills', () => {
  it('contains the complete standard skill-to-ability mapping', () => {
    expect(Object.keys(SKILL_DEFINITIONS)).toHaveLength(18);
    expect(SKILL_DEFINITIONS.athletics.ability).toBe('strength');
    expect(SKILL_DEFINITIONS.acrobatics.ability).toBe('dexterity');
    expect(SKILL_DEFINITIONS.stealth.ability).toBe('dexterity');
    expect(SKILL_DEFINITIONS.arcana.ability).toBe('intelligence');
    expect(SKILL_DEFINITIONS.perception.ability).toBe('wisdom');
    expect(SKILL_DEFINITIONS.persuasion.ability).toBe('charisma');
  });

  it('adds proficiency and derives passive Perception', () => {
    const modifiers = deriveAbilityModifiers(fighterInput().abilityScores);
    const skills = deriveSkills(modifiers, 2, ['athletics', 'perception']);
    expect(skills.athletics).toMatchObject({ ability: 'strength', modifier: 4, proficient: true });
    expect(skills.perception).toMatchObject({ ability: 'wisdom', modifier: 3, proficient: true });
    expect(skills.stealth).toMatchObject({ ability: 'dexterity', modifier: 4, proficient: false });
    expect(derivePassivePerception(skills)).toBe(13);
  });

  it('uses the unproficient Perception modifier when not selected', () => {
    const modifiers = deriveAbilityModifiers(fighterInput().abilityScores);
    expect(derivePassivePerception(deriveSkills(modifiers, 2, []))).toBe(11);
  });
});
