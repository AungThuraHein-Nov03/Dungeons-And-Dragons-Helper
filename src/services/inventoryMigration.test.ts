import { describe, expect, it } from 'vitest';
import { srdId } from '../content/srd';
import { FIGHTER_ACTION_SURGE_RESOURCE_ID, FIGHTER_SECOND_WIND_RESOURCE_ID } from '../content/srd/fighter';
import { rollRequest } from '../dice/diceEngine';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { rollWeaponAttack } from './characterRolls';
import { contentRegistry } from './contentRegistry';
import {
  CHARACTER_STORAGE_KEY,
  LEGACY_CHARACTER_STORAGE_V3_KEY,
  loadCharacters,
} from './characterStorage';
import { addRollHistory, loadRollHistory, ROLL_HISTORY_STORAGE_KEY } from './rollHistory';

const FIGHTER_ID = srdId('class', 'fighter');
const CHAIN_MAIL_ID = srdId('armor', 'chain-mail');
const SHIELD_ID = srdId('armor', 'shield');
const SCIMITAR_ID = srdId('weapon', 'scimitar');
const LIGHT_CROSSBOW_ID = srdId('weapon', 'light-crossbow');

function legacyV3Fighter() {
  return {
    id: 'fighter-v3-migration',
    name: 'Legacy Inventory Fighter',
    classId: FIGHTER_ID,
    level: 4,
    abilityScores: { strength: 14, dexterity: 18, constitution: 14, intelligence: 10, wisdom: 12, charisma: 12 },
    skillProficiencies: ['athletics', 'perception'],
    equipment: {
      equippedArmorId: CHAIN_MAIL_ID,
      equippedShieldId: SHIELD_ID,
      equippedWeaponIds: [SCIMITAR_ID, LIGHT_CROSSBOW_ID],
    },
    weaponAttackAbilityChoices: { [SCIMITAR_ID]: 'dexterity' },
    hpProgression: [
      { level: 2, method: 'fixed' },
      { level: 3, method: 'fixed' },
      { level: 4, method: 'fixed' },
    ],
    playState: {
      currentHp: 23,
      temporaryHp: 2,
      hitDiceRemaining: 3,
      resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 2, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 0 },
    },
    createdAt: '2026-09-15T10:00:00.000Z',
    updatedAt: '2026-09-15T11:00:00.000Z',
  };
}

describe('v3 to v4 inventory migration', () => {
  it('preserves identity, play state, equipment behavior, Finesse choice, dice, and separate roll history without duplicates', () => {
    const oldRecord = legacyV3Fighter();
    const oldRaw = JSON.stringify([oldRecord]);
    window.localStorage.setItem(LEGACY_CHARACTER_STORAGE_V3_KEY, oldRaw);

    const priorRoll = rollRequest({
      type: 'ability-check',
      label: 'Pre-Migration Roll',
      expression: { kind: 'dice', dice: [{ quantity: 1, die: 20 }], modifier: 2 },
      mode: 'normal',
      source: { characterId: oldRecord.id },
      outcome: { kind: 'check' },
    }, () => 9 / 20);
    if (!priorRoll.ok) throw new Error(priorRoll.error.message);
    addRollHistory(priorRoll.value);
    const historyRawBefore = window.localStorage.getItem(ROLL_HISTORY_STORAGE_KEY);

    const [migrated] = loadCharacters();
    expect(migrated).toBeDefined();
    expect(migrated.id).toBe(oldRecord.id);
    expect(migrated.name).toBe(oldRecord.name);
    expect(migrated.createdAt).toBe(oldRecord.createdAt);
    expect(migrated.updatedAt).toBe(oldRecord.updatedAt);
    expect(migrated.abilityScores).toEqual(oldRecord.abilityScores);
    expect(migrated.playState).toEqual(oldRecord.playState);
    expect(migrated.currency).toEqual({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });

    expect(migrated.inventory).toHaveLength(4);
    expect(new Set(migrated.inventory.map((entry) => entry.id)).size).toBe(4);
    expect(migrated.inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'registry', contentId: CHAIN_MAIL_ID, category: 'armor', equipped: true, quantity: 1 }),
      expect.objectContaining({ kind: 'registry', contentId: SHIELD_ID, category: 'shield', equipped: true, quantity: 1 }),
      expect.objectContaining({ kind: 'registry', contentId: SCIMITAR_ID, category: 'weapon', equipped: true, quantity: 1, attackAbilityChoice: 'dexterity' }),
      expect.objectContaining({ kind: 'registry', contentId: LIGHT_CROSSBOW_ID, category: 'weapon', equipped: true, quantity: 1 }),
    ]));

    const derived = deriveCharacterState(migrated, contentRegistry);
    expect(derived).toMatchObject({
      ok: true,
      value: {
        defense: { armorClass: 18, armor: { id: CHAIN_MAIL_ID }, shield: { id: SHIELD_ID, bonusApplied: 2 } },
        attacks: [
          { weaponId: SCIMITAR_ID, attackAbility: 'dexterity', attackModifier: 6, damage: { abilityModifier: 4, damageType: 'slashing' } },
          { weaponId: LIGHT_CROSSBOW_ID, attackModifier: 6, damage: { abilityModifier: 4, damageType: 'piercing' } },
        ],
      },
    });

    expect(rollWeaponAttack(migrated.id, SCIMITAR_ID, 'normal', { rng: () => 13 / 20 })).toMatchObject({ ok: true, value: { roll: { modifier: 6, total: 20 } } });
    expect(loadRollHistory().map((entry) => entry.result.request.label)).toEqual(['Scimitar Attack', 'Pre-Migration Roll']);

    expect(window.localStorage.getItem(LEGACY_CHARACTER_STORAGE_V3_KEY)).toBe(oldRaw);
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).not.toBeNull();
    expect(historyRawBefore).not.toBeNull();

    const [loadedAgain] = loadCharacters();
    expect(loadedAgain.inventory).toEqual(migrated.inventory);
    expect(loadedAgain.inventory).toHaveLength(4);
  });

  it('fails malformed v3 equipment safely rather than guessing or partially migrating it', () => {
    const broken = legacyV3Fighter();
    broken.equipment.equippedWeaponIds = [SCIMITAR_ID, SCIMITAR_ID];
    window.localStorage.setItem(LEGACY_CHARACTER_STORAGE_V3_KEY, JSON.stringify([broken]));
    expect(loadCharacters()).toEqual([]);
  });
});
