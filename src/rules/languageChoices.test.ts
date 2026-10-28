import { describe, expect, it } from 'vitest';
import { srdId } from '../content/srd/source';
import type { LanguageId } from '../models/character';
import { contentRegistry } from '../services/contentRegistry';
import { fighterInput } from '../test/fixtures';
import { validateCharacterInput } from '../utils/characterValidation';
import { createFixedHpProgression } from './health';
import { deriveLanguageChoices, validateLanguageChoices } from './languageChoices';

const ROGUE_ID = srdId('class', 'rogue');

function rogueInput(languageChoices: LanguageId[] = []) {
  const input = fighterInput({
    preserveV10Choices: true,
    startingClassId: ROGUE_ID,
    classProgressions: [{
      classId: ROGUE_ID,
      level: 1,
      skillProficiencies: ['acrobatics', 'insight', 'perception', 'stealth'],
      skillExpertise: ['perception', 'stealth'],
      weaponMasterySelections: [srdId('weapon', 'dagger'), srdId('weapon', 'shortsword')],
      hpProgression: createFixedHpProgression(1),
    }],
  });
  input.languageChoices = languageChoices;
  return input;
}

describe('Character v10 languages', () => {
  it('derives Common and Thieves’ Cant as fixed plus one explicit Rogue language choice', () => {
    const state = deriveLanguageChoices(rogueInput(['elvish']), contentRegistry);
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    expect(state.value).toMatchObject({ entitled: 1, fixed: ['common', 'thieves-cant'], selected: ['elvish'], missing: 0 });
    expect(state.value.known).toEqual(['common', 'thieves-cant', 'elvish']);
  });

  it('allows historical underfill but rejects invalid, duplicate, fixed, overfilled, and incomplete normal choices', () => {
    const empty = rogueInput();
    expect(validateCharacterInput(empty, { allowIncompleteV10Choices: true }).languageChoices).toBeUndefined();
    expect(validateCharacterInput(empty).languageChoices).toMatch(/exactly 1/i);
    expect(validateLanguageChoices(rogueInput(['common']), { allowUnderfilled: true }, contentRegistry)).toMatch(/fixed/i);
    expect(validateLanguageChoices(rogueInput(['elvish', 'elvish']), { allowUnderfilled: true }, contentRegistry)).toMatch(/unique/i);
    expect(validateLanguageChoices(rogueInput(['elvish', 'dwarvish']), { allowUnderfilled: true }, contentRegistry)).toMatch(/at most 1/i);
    const invalid = rogueInput();
    invalid.languageChoices = ['not-a-language' as LanguageId];
    expect(validateLanguageChoices(invalid, { allowUnderfilled: true }, contentRegistry)).toMatch(/canonical/i);
  });
});
