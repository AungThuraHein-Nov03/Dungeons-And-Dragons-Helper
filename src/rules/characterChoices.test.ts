import { describe, expect, it } from 'vitest';
import { srdId } from '../content/srd/source';
import type { Character, CharacterInput } from '../models/character';
import { contentRegistry } from '../services/contentRegistry';
import { validateCharacterInput } from '../utils/characterValidation';
import { fighterCharacter, fighterInput } from '../test/fixtures';
import { deriveCharacterState } from './deriveCharacter';
import { deriveSkillExpertiseChoices, validateSkillExpertiseSelections } from './characterChoices';

const FIGHTER_ID = srdId('class', 'fighter');
const ROGUE_ID = srdId('class', 'rogue');

function fighterRogueInput(expertise: readonly ('athletics' | 'perception' | 'stealth')[] = []): CharacterInput {
  const fighter = fighterInput();
  return fighterInput({
    preserveV10Choices: true,
    startingClassId: FIGHTER_ID,
    classProgressions: [
      { ...fighter.classProgressions[0] },
      {
        classId: ROGUE_ID,
        level: 1,
        skillProficiencies: ['stealth'],
        skillExpertise: [...expertise],
        weaponMasterySelections: [],
        hpProgression: [{ classLevel: 1, method: 'fixed' }],
      },
    ],
  });
}

function asCharacter(input: CharacterInput): Character {
  return {
    ...input,
    id: 'v10-expertise-fixture',
    playState: fighterCharacter().playState,
    createdAt: '2026-09-21T00:00:00.000Z',
    updatedAt: '2026-09-21T00:00:00.000Z',
  };
}

describe('Character v10 Expertise choices and derivation', () => {
  it('derives Rogue-owned entitlement and eligible proficient skills without class-name branching', () => {
    const state = deriveSkillExpertiseChoices(fighterRogueInput(), contentRegistry);
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    expect(state.value).toEqual([expect.objectContaining({
      classId: ROGUE_ID,
      entitled: 2,
      selected: [],
      missing: 2,
      eligible: expect.arrayContaining(['athletics', 'perception', 'stealth']),
    })]);
  });

  it('allows historical underfill structurally but rejects it for completed workflows', () => {
    const input = fighterRogueInput();
    expect(validateSkillExpertiseSelections(input, { allowUnderfilled: true }, contentRegistry)).toBeUndefined();
    expect(validateSkillExpertiseSelections(input, { allowUnderfilled: false }, contentRegistry)).toMatch(/exactly 2/i);
    expect(validateCharacterInput(input, { allowIncompleteV10Choices: true }).skillExpertise).toBeUndefined();
    expect(validateCharacterInput(input).skillExpertise).toMatch(/exactly 2/i);
  });

  it('rejects invalid, duplicate, ineligible, and over-entitled owner selections', () => {
    expect(validateSkillExpertiseSelections(fighterRogueInput(['stealth', 'stealth']), { allowUnderfilled: true }, contentRegistry)).toMatch(/unique/i);
    expect(validateSkillExpertiseSelections(fighterRogueInput(['stealth', 'perception', 'athletics']), { allowUnderfilled: true }, contentRegistry)).toMatch(/at most 2/i);
    const unproficient = fighterRogueInput(['stealth']);
    unproficient.classProgressions[1].skillExpertise = ['arcana'];
    expect(validateSkillExpertiseSelections(unproficient, { allowUnderfilled: true }, contentRegistry)).toMatch(/proficient/i);
  });

  it('derives ordinary Stealth +7 and Expertise Stealth +10 at DEX 18 and total level 5 PB +3', () => {
    const ordinary = deriveCharacterState(asCharacter(fighterRogueInput(['athletics', 'perception'])), contentRegistry);
    const expert = deriveCharacterState(asCharacter(fighterRogueInput(['stealth', 'perception'])), contentRegistry);
    expect(ordinary.ok).toBe(true);
    expect(expert.ok).toBe(true);
    if (!ordinary.ok || !expert.ok) return;
    expect(ordinary.value.proficiencyBonus).toBe(3);
    expect(ordinary.value.skills.stealth).toMatchObject({ proficient: true, expertise: false, modifier: 7 });
    expect(expert.value.skills.stealth).toMatchObject({ proficient: true, expertise: true, modifier: 10 });
  });
});
