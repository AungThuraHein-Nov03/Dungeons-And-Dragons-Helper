import { describe, expect, it } from 'vitest';
import { SRD_CONTENT, SRD_FIGHTER } from '../content/srd';
import type { ClassContent } from '../models/content';
import { ContentRegistry } from '../services/contentRegistry';
import { CHAMPION_ID, FIGHTER_ID, fighterInput, SCIMITAR_ID } from '../test/fixtures';
import { hasValidationErrors, validateCharacterInput } from './characterValidation';

describe('character validation', () => {
  it('accepts a sensible valid character input', () => {
    expect(validateCharacterInput(fighterInput())).toEqual({});
  });

  it('rejects an empty name and invalid level', () => {
    const input = fighterInput({ name: '   ', level: 21 });
    const errors = validateCharacterInput(input);
    expect(errors.name).toBeDefined();
    expect(errors.level).toBeDefined();
    expect(hasValidationErrors(errors)).toBe(true);
  });

  it.each([0, 31, 12.5])('rejects invalid ability score %s', (score) => {
    expect(validateCharacterInput(fighterInput({ abilityScores: { strength: score } })).strength).toBeDefined();
  });

  it('requires exactly the class-defined skill count for new/normal characters', () => {
    expect(validateCharacterInput(fighterInput({ skillProficiencies: ['athletics'] })).skillProficiencies).toBeDefined();
    expect(validateCharacterInput(fighterInput({ skillProficiencies: ['athletics', 'perception', 'survival'] })).skillProficiencies).toBeDefined();
  });

  it('rejects duplicates and skills outside the Fighter selection list', () => {
    expect(validateCharacterInput(fighterInput({ skillProficiencies: ['athletics', 'athletics'] })).skillProficiencies).toBeDefined();
    expect(validateCharacterInput(fighterInput({ skillProficiencies: ['athletics', 'arcana'] })).skillProficiencies).toBeDefined();
  });

  it('permits an empty skill list only for explicitly grandfathered legacy state', () => {
    const input = fighterInput({ skillProficiencies: [] });
    expect(validateCharacterInput(input).skillProficiencies).toBeDefined();
    expect(validateCharacterInput(input, { allowLegacyEmptySkills: true })).toEqual({});
  });

  it('requires an explicit valid ability choice for an equipped Finesse weapon', () => {
    const missingChoice = fighterInput({ equipment: { equippedWeaponIds: [SCIMITAR_ID] }, weaponAttackAbilityChoices: {} });
    expect(validateCharacterInput(missingChoice).inventory).toBeDefined();
    const valid = fighterInput({ equipment: { equippedWeaponIds: [SCIMITAR_ID] }, weaponAttackAbilityChoices: { [SCIMITAR_ID]: 'dexterity' } });
    expect(validateCharacterInput(valid)).toEqual({});
  });

  it('rejects incomplete or invalid HP progression history', () => {
    expect(validateCharacterInput(fighterInput({ level: 4, hpProgression: [{ classLevel: 2, method: 'fixed' }] })).hpProgression).toBeDefined();
    expect(validateCharacterInput(fighterInput({
      level: 4,
      hpProgression: [
        { classLevel: 2, method: 'rolled', roll: 11 },
        { classLevel: 3, method: 'fixed' },
        { classLevel: 4, method: 'fixed' },
      ],
    })).hpProgression).toBeDefined();
  });

  it('requires explicit subclass selection at the acquisition threshold but not below it', () => {
    expect(validateCharacterInput(fighterInput({ level: 2, subclassId: undefined })).subclassId).toBeUndefined();
    expect(validateCharacterInput(fighterInput({ level: 3, subclassId: undefined })).subclassId).toBe('Choose a subclass.');
    expect(validateCharacterInput(fighterInput({ level: 3, subclassId: undefined }), { allowIncompleteSubclass: true }).subclassId).toBeUndefined();
  });

  it('rejects unknown and below-acquisition subclass selections', () => {
    expect(validateCharacterInput(fighterInput({ subclassId: 'homebrew:missing:subclass:void' })).subclassId).toBeDefined();
    expect(validateCharacterInput(fighterInput({ level: 2, subclassId: CHAMPION_ID })).subclassId).toMatch(/requires level 3/i);
  });

  it('rejects a valid subclass whose parent differs from the selected class', () => {
    const otherClass: ClassContent = { ...SRD_FIGHTER, id: 'homebrew:test:class:other-fighter', name: 'Other Fighter', source: { type: 'homebrew', namespace: 'test' } };
    const registry = new ContentRegistry(SRD_CONTENT, [otherClass]);
    const input = fighterInput({ classId: otherClass.id, subclassId: CHAMPION_ID });
    expect(validateCharacterInput(input, {}, registry).classId).toBeUndefined();
    expect(validateCharacterInput(input, {}, registry).subclassId).toBe('Choose a subclass for the selected class.');
    expect(FIGHTER_ID).not.toBe(otherClass.id);
  });
});
