import { describe, expect, it } from 'vitest';
import { srdId } from '../content/srd/source';
import { ContentRegistry, contentRegistry } from '../services/contentRegistry';
import { SRD_CONTENT } from '../content/srd';
import type { WeaponContent } from '../models/content';
import { fighterCharacter, fighterInput, SCIMITAR_ID } from '../test/fixtures';
import { validateCharacterInput } from '../utils/characterValidation';
import { deriveCharacterState } from './deriveCharacter';
import { createFixedHpProgression } from './health';
import { deriveWeaponMasteryChoices, validateWeaponMasterySelections } from './weaponMasteryChoices';

const FIGHTER_ID = srdId('class', 'fighter');
const ROGUE_ID = srdId('class', 'rogue');
const DAGGER_ID = srdId('weapon', 'dagger');
const LONGSWORD_ID = srdId('weapon', 'longsword');
const LIGHT_CROSSBOW_ID = srdId('weapon', 'light-crossbow');

describe('Character v10 Weapon Mastery choices', () => {
  it('offers a custom proficient weapon and activates only its selected canonical mastery', () => {
    const weapon: WeaponContent = { ...contentRegistry.findWeapon(SCIMITAR_ID)!, id: 'homebrew:test:weapon:moonblade', source: { type: 'homebrew', namespace: 'test' }, attackBonus: 2, damageBonus: 3 };
    const registry = new ContentRegistry(SRD_CONTENT, [weapon]);
    const character = fighterCharacter({ equipment: { equippedWeaponIds: [weapon.id, SCIMITAR_ID] } });
    character.classProgressions[0].weaponMasterySelections = [weapon.id];
    expect(deriveWeaponMasteryChoices(character, registry)).toMatchObject({ ok: true, value: [{ eligible: expect.arrayContaining([expect.objectContaining({ id: weapon.id })]), selected: [weapon.id] }] });
    expect(validateWeaponMasterySelections(character, { allowUnderfilled: true }, registry)).toBeUndefined();
    const result = deriveCharacterState(character, registry);
    expect(result).toMatchObject({ ok: true, value: { attacks: [
      { weaponId: weapon.id, proficient: true, attackModifier: 8, mastery: { name: 'Nick', canPotentiallyUse: true } },
      { weaponId: SCIMITAR_ID, attackModifier: 6, mastery: { canPotentiallyUse: false } },
    ] } });
  });

  it('derives owner capacity and permits migrated historical underfill only in structural mode', () => {
    const input = fighterInput();
    input.classProgressions[0].weaponMasterySelections = [];
    const states = deriveWeaponMasteryChoices(input, contentRegistry);
    expect(states.ok).toBe(true);
    if (!states.ok) return;
    expect(states.value).toEqual([expect.objectContaining({ classId: FIGHTER_ID, entitled: 4, selected: [], missing: 4 })]);
    expect(validateCharacterInput(input, { allowIncompleteV10Choices: true }).weaponMasterySelections).toBeUndefined();
    expect(validateCharacterInput(input).weaponMasterySelections).toMatch(/exactly 4/i);
  });

  it('validates resolved weapons, proficiency, owner capacity, and global uniqueness', () => {
    const input = fighterInput();
    input.classProgressions[0].weaponMasterySelections = [DAGGER_ID, LIGHT_CROSSBOW_ID, LONGSWORD_ID, SCIMITAR_ID];
    expect(validateWeaponMasterySelections(input, { allowUnderfilled: false }, contentRegistry)).toBeUndefined();

    input.classProgressions.push({
      classId: ROGUE_ID,
      level: 1,
      skillProficiencies: ['stealth'],
      skillExpertise: ['athletics', 'stealth'],
      weaponMasterySelections: [DAGGER_ID],
      hpProgression: createFixedHpProgression(1, false),
    });
    expect(validateWeaponMasterySelections(input, { allowUnderfilled: true }, contentRegistry)).toMatch(/same weapon/i);

    const rogue = fighterInput({
      preserveV10Choices: true,
      startingClassId: ROGUE_ID,
      classProgressions: [{
        classId: ROGUE_ID,
        level: 1,
        skillProficiencies: ['acrobatics', 'insight', 'perception', 'stealth'],
        skillExpertise: ['perception', 'stealth'],
        weaponMasterySelections: [LONGSWORD_ID],
        hpProgression: createFixedHpProgression(1),
      }],
    });
    expect(validateWeaponMasterySelections(rogue, { allowUnderfilled: true }, contentRegistry)).toMatch(/not a weapon.*proficient/i);
    rogue.classProgressions[0].weaponMasterySelections = ['missing:weapon'];
    expect(validateWeaponMasterySelections(rogue, { allowUnderfilled: true }, contentRegistry)).toMatch(/does not resolve/i);
  });

  it('activates mastery only for the persisted selected weapon ID', () => {
    const ordinary = fighterCharacter({
      inventory: [{ id: 'scimitar', kind: 'registry', contentId: SCIMITAR_ID, category: 'weapon', quantity: 1, equipped: true, notes: '' }],
    });
    ordinary.classProgressions[0].weaponMasterySelections = [];
    const mastered = structuredClone(ordinary);
    mastered.classProgressions[0].weaponMasterySelections = [SCIMITAR_ID];
    const ordinaryState = deriveCharacterState(ordinary, contentRegistry);
    const masteredState = deriveCharacterState(mastered, contentRegistry);
    expect(ordinaryState.ok).toBe(true);
    expect(masteredState.ok).toBe(true);
    if (!ordinaryState.ok || !masteredState.ok) return;
    expect(ordinaryState.value.attacks[0].mastery.canPotentiallyUse).toBe(false);
    expect(masteredState.value.attacks[0].mastery.canPotentiallyUse).toBe(true);
  });
});
