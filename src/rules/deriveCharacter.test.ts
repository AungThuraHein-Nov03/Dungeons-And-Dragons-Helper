import { describe, expect, it } from 'vitest';
import { FIGHTER_ACTION_SURGE_RESOURCE_ID, FIGHTER_SECOND_WIND_RESOURCE_ID } from '../content/srd/fighter';
import { contentRegistry } from '../services/contentRegistry';
import { fighterCharacter, LIGHT_CROSSBOW_ID, SCIMITAR_ID } from '../test/fixtures';
import { deriveCharacterState } from './deriveCharacter';

describe('Renethal-style Fighter 4 rules integration', () => {
  it('derives the expected Fighter 4 values from stored source state', () => {
    const character = fighterCharacter({
      name: 'Renethal Vaeloren',
      skillProficiencies: ['athletics', 'perception'],
      equipment: { equippedWeaponIds: [SCIMITAR_ID, LIGHT_CROSSBOW_ID] },
      weaponAttackAbilityChoices: { [SCIMITAR_ID]: 'dexterity' },
    });

    const result = deriveCharacterState(character, contentRegistry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = result.value;

    expect(state.abilityModifiers).toEqual({ strength: 2, dexterity: 4, constitution: 2, intelligence: 0, wisdom: 1, charisma: 2 });
    expect(state.proficiencyBonus).toBe(2);
    expect(state.savingThrows.strength).toMatchObject({ modifier: 4, proficient: true });
    expect(state.savingThrows.constitution).toMatchObject({ modifier: 4, proficient: true });
    expect(state.skills.perception).toMatchObject({ modifier: 3, proficient: true });
    expect(state.passivePerception).toBe(13);
    expect(state.health).toEqual({ maximumHp: 36, hitDie: 10, maximumHitDice: 4 });

    const secondWind = state.resources.find((resource) => resource.id === FIGHTER_SECOND_WIND_RESOURCE_ID)!;
    const actionSurge = state.resources.find((resource) => resource.id === FIGHTER_ACTION_SURGE_RESOURCE_ID)!;
    expect(secondWind.maximumUses).toBe(3);
    expect(secondWind.consumers.map((consumer) => consumer.name)).toEqual(['Second Wind', 'Tactical Mind']);
    expect(actionSurge.maximumUses).toBe(1);

    const scimitar = state.attacks.find((attack) => attack.weaponId === SCIMITAR_ID)!;
    expect(scimitar.applicableAttackAbilities).toEqual(['strength', 'dexterity']);
    expect(scimitar).toMatchObject({ attackAbility: 'dexterity', attackModifier: 6, mastery: { name: 'Nick' } });
    expect(scimitar.damage).toEqual({ base: { kind: 'dice', count: 1, die: 6 }, abilityModifier: 4, damageType: 'slashing' });

    const crossbow = state.attacks.find((attack) => attack.weaponId === LIGHT_CROSSBOW_ID)!;
    expect(crossbow).toMatchObject({ attackAbility: 'dexterity', attackModifier: 6, mastery: { name: 'Slow' } });
    expect(crossbow.damage).toEqual({ base: { kind: 'dice', count: 1, die: 8 }, abilityModifier: 4, damageType: 'piercing' });
  });

  it('returns a safe error rather than substituting an unknown class', () => {
    const result = deriveCharacterState(fighterCharacter({ classId: 'homebrew:missing:class:unknown' }), contentRegistry);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('missing-class');
  });
});
