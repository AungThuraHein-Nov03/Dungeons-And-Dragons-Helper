import { describe, expect, it, vi } from 'vitest';
import { SRD_CONTENT, SRD_FIGHTER, srdId } from '../content/srd';
import { FIGHTER_SECOND_WIND_RESOURCE_ID } from '../content/srd/fighter';
import { BARBARIAN_RAGE_ACTIVE_EFFECT_ID } from '../content/srd/barbarian';
import { createDiceVisualEvent } from '../dice/diceVisualEvent';
import type { WeaponContent } from '../models/content';
import { rollRequest } from '../dice/diceEngine';
import { deriveAbilityModifiers } from '../rules/abilities';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { deriveWeaponAttack } from '../rules/weapons';
import { applyCharacterDamage, consumeCharacterResource } from './characterPlayState';
import { ContentRegistry, contentRegistry } from './contentRegistry';
import { createCharacter, getCharacterById, saveCharacters, updateCharacterPlayState } from './characterStorage';
import {
  rollAbilityCheck,
  rollConcentrationSavingThrow,
  rollHealingResource,
  rollHitDie,
  rollInitiative,
  rollSavingThrow,
  rollSkillCheck,
  rollWeaponAttack,
  rollWeaponDamage,
} from './characterRolls';
import { loadRollHistory } from './rollHistory';
import { completeCharacterV10Choices, fighterCharacter, fighterInput, LIGHT_CROSSBOW_ID, SCIMITAR_ID } from '../test/fixtures';

const QUARTERSTAFF_ID = srdId('weapon', 'quarterstaff');
const FIGHTER_ID = srdId('class', 'fighter');
const ROGUE_ID = srdId('class', 'rogue');

function dieValue(value: number, die: number) {
  return () => (value - 1) / die;
}

function fighterWithWeapons() {
  return createCharacter(fighterInput({
    equipment: { equippedWeaponIds: [SCIMITAR_ID, LIGHT_CROSSBOW_ID] },
    weaponAttackAbilityChoices: { [SCIMITAR_ID]: 'dexterity' },
  }));
}

function fighterRogueWithWeapons() {
  const fighter = fighterInput({
    equipment: { equippedWeaponIds: [SCIMITAR_ID, LIGHT_CROSSBOW_ID, QUARTERSTAFF_ID] },
    weaponAttackAbilityChoices: { [SCIMITAR_ID]: 'dexterity' },
  });
  return createCharacter(completeCharacterV10Choices({
    ...fighter,
    startingClassId: FIGHTER_ID,
    classProgressions: [
      fighter.classProgressions[0],
      {
        classId: ROGUE_ID,
        level: 1,
        skillProficiencies: ['stealth'],
        skillExpertise: [],
        weaponMasterySelections: [],
        hpProgression: [{ classLevel: 1, method: 'fixed' }],
      },
    ],
  }));
}

function fighterResourceConsumerId(characterId: string, consumerName: 'Second Wind' | 'Tactical Mind'): string {
  const character = getCharacterById(characterId)!;
  const derived = deriveCharacterState(character, contentRegistry);
  if (!derived.ok) throw new Error(derived.error.message);
  const resource = derived.value.resources.find((entry) => entry.id === FIGHTER_SECOND_WIND_RESOURCE_ID)!;
  return resource.consumers.find((consumer) => consumer.name === consumerName)!.id;
}

function secondWindConsumerId(characterId: string): string {
  return fighterResourceConsumerId(characterId, 'Second Wind');
}

describe('character roll application service', () => {
  it.each([false, true])('keeps item damage flat on critical=%s and isolates the other weapon and roll history', (critical) => {
    const weapon: WeaponContent = { ...contentRegistry.findWeapon(SCIMITAR_ID)!, id: 'homebrew:test:weapon:moonblade', name: 'Moonblade', source: { type: 'homebrew', namespace: 'test' }, attackBonus: 2, damageBonus: 3 };
    const registry = new ContentRegistry(SRD_CONTENT, [weapon]);
    const character = createCharacter(fighterInput({ equipment: { equippedWeaponIds: [weapon.id, LIGHT_CROSSBOW_ID] }, weaponAttackAbilityChoices: { [weapon.id]: 'dexterity' } }), window.localStorage, registry);
    const before = getCharacterById(character.id, window.localStorage, registry);
    expect(rollWeaponAttack(character.id, weapon.id, 'normal', { registry, rng: dieValue(14, 20) })).toMatchObject({ ok: true, value: { roll: { modifier: 8, total: 22 } } });
    const result = rollWeaponDamage(character.id, weapon.id, 'standard', critical, { registry, rng: dieValue(5, 6) });
    expect(result).toMatchObject({ ok: true, value: { roll: { request: { expression: { dice: [{ quantity: critical ? 2 : 1, die: 6 }], modifier: 7 } }, modifier: 7, total: critical ? 17 : 12 } } });
    if (!result.ok) return;
    expect(loadRollHistory()[0].result).toEqual(result.value.roll);
    const visual = createDiceVisualEvent(result.value.roll, 'item-damage');
    expect(visual?.dice.map((die) => [die.sides, die.value])).toEqual(critical ? [[6, 5], [6, 5]] : [[6, 5]]);
    expect(rollWeaponAttack(character.id, LIGHT_CROSSBOW_ID, 'normal', { registry, rng: dieValue(14, 20) })).toMatchObject({ ok: true, value: { roll: { modifier: 6, total: 20 } } });
    expect(rollWeaponDamage(character.id, LIGHT_CROSSBOW_ID, 'standard', false, { registry, rng: dieValue(5, 8) })).toMatchObject({ ok: true, value: { roll: { modifier: 4, total: 9 } } });
    expect(getCharacterById(character.id, window.localStorage, registry)).toEqual(before);
  });

  it('combines item damage with Sneak Attack without doubling flat bonuses', () => {
    const weapon: WeaponContent = { ...contentRegistry.findWeapon(SCIMITAR_ID)!, id: 'homebrew:test:weapon:moonblade', source: { type: 'homebrew', namespace: 'test' }, damageBonus: 3 };
    const registry = new ContentRegistry(SRD_CONTENT, [weapon]);
    const character = fighterRogueWithWeapons();
    character.inventory = character.inventory.map((entry) => entry.kind === 'registry' && entry.contentId === SCIMITAR_ID ? { ...entry, contentId: weapon.id } : entry);
    saveCharacters([character]);
    expect(rollWeaponDamage(character.id, weapon.id, 'standard', true, { registry, sneakAttack: true, rng: dieValue(4, 6) })).toMatchObject({ ok: true, value: { roll: { request: { expression: { dice: [{ quantity: 2, die: 6 }, { quantity: 2, die: 6 }], modifier: 7 } }, modifier: 7, total: 23 } } });
  });

  it('adds item and active-effect damage once each on a critical', () => {
    const weapon: WeaponContent = { ...contentRegistry.findWeapon(QUARTERSTAFF_ID)!, id: 'homebrew:test:weapon:bright-staff', source: { type: 'homebrew', namespace: 'test' }, damageBonus: 3 };
    const registry = new ContentRegistry(SRD_CONTENT, [weapon]);
    const character = createCharacter(fighterInput({ classId: srdId('class', 'barbarian'), subclassId: undefined, level: 1, abilityScores: { strength: 18 }, equipment: { equippedWeaponIds: [weapon.id] } }), window.localStorage, registry);
    expect(rollWeaponDamage(character.id, weapon.id, 'one-handed', true, { registry, activeEffectIds: [BARBARIAN_RAGE_ACTIVE_EFFECT_ID], rng: dieValue(4, 6) })).toMatchObject({ ok: true, value: { roll: { modifier: 9, total: 17, request: { expression: { dice: [{ quantity: 2, die: 6 }], modifier: 9 } } } } });
  });

  it('uses derived skill, saving throw, and raw ability modifiers with d20 modes', () => {
    const character = fighterWithWeapons();
    const skill = rollSkillCheck(character.id, 'perception', 'advantage', { rng: (() => { const values = [0.3, 0.8]; let i = 0; return () => values[i++]; })() });
    expect(skill).toMatchObject({ ok: true, value: { roll: { request: { label: 'Skill Check — Perception', mode: 'advantage' }, dice: [{ values: [7, 17] }], keptD20: 17, modifier: 3, total: 20 } } });

    expect(rollSavingThrow(character.id, 'strength', 'normal', { rng: dieValue(10, 20) })).toMatchObject({ ok: true, value: { roll: { modifier: 4, total: 14 } } });
    expect(rollSavingThrow(character.id, 'dexterity', 'normal', { rng: dieValue(10, 20) })).toMatchObject({ ok: true, value: { roll: { modifier: 4, total: 14 } } });
    expect(rollAbilityCheck(character.id, 'strength', 'normal', { rng: dieValue(10, 20) })).toMatchObject({ ok: true, value: { roll: { modifier: 2, total: 12 } } });
  });

  it('routes Champion Remarkable Athlete Athletics Advantage through generic D20 context', () => {
    const character = fighterWithWeapons();
    const values = [0.2, 0.8]; let index = 0;
    const result = rollSkillCheck(character.id, 'athletics', 'normal', { rng: () => values[index++] });
    expect(result).toMatchObject({ ok: true, value: { roll: { request: { mode: 'normal', d20Context: { advantageSources: ['Remarkable Athlete'] } }, resolvedMode: 'advantage', dice: [{ values: [5, 17] }], keptD20: 17 } } });
  });

  it('cancels automatic Athletics Advantage against manual Disadvantage inside RollRequest resolution', () => {
    const character = fighterWithWeapons();
    const rng = vi.fn(dieValue(11, 20));
    const result = rollSkillCheck(character.id, 'athletics', 'disadvantage', { rng });
    expect(result).toMatchObject({ ok: true, value: { roll: { request: { mode: 'disadvantage', d20Context: { advantageSources: ['Remarkable Athlete'] } }, resolvedMode: 'normal', dice: [{ values: [11] }], keptD20: 11 } } });
    expect(rng).toHaveBeenCalledTimes(1);
  });

  it('rolls first-class Initiative through the existing Dice Engine and history', () => {
    const character = fighterWithWeapons();
    const values = [0.2, 0.8]; let index = 0;
    const result = rollInitiative(character.id, 'normal', { rng: () => values[index++] });
    expect(result).toMatchObject({ ok: true, value: { roll: { request: { type: 'initiative', label: 'Initiative', mode: 'normal', source: { ability: 'dexterity' }, d20Context: { advantageSources: ['Remarkable Athlete'] } }, resolvedMode: 'advantage', modifier: 4, total: 21 } } });
    expect(loadRollHistory()[0].result.request.type).toBe('initiative');
  });

  it('rolls explicit Concentration saves with the existing Constitution save and Roll History', () => {
    const character = fighterWithWeapons();
    const success = rollConcentrationSavingThrow(character.id, 22, 'normal', { rng: dieValue(10, 20) });
    expect(success).toMatchObject({ ok: true, value: { dc: 11, success: true, roll: { request: { type: 'saving-throw', label: 'Concentration Save · DC 11', mode: 'normal', source: { ability: 'constitution' } }, modifier: 4, total: 14 } } });
    expect(loadRollHistory()[0].result.request.label).toBe('Concentration Save · DC 11');

    const naturalOne = rollConcentrationSavingThrow(character.id, 1, 'normal', { rng: dieValue(1, 20) });
    expect(naturalOne).toMatchObject({ ok: true, value: { dc: 10, success: false, roll: { natural: 'nat1', modifier: 4, total: 5 } } });
  });

  it('uses existing manual and contextual D20 mode resolution for Concentration saves', () => {
    const character = fighterWithWeapons();
    const rng = vi.fn(dieValue(12, 20));
    const result = rollConcentrationSavingThrow(character.id, 1, 'advantage', { rng, d20Context: { disadvantageSources: ['Synthetic Condition'] } });
    expect(result).toMatchObject({ ok: true, value: { roll: { request: { mode: 'advantage', d20Context: { disadvantageSources: ['Synthetic Condition'] } }, resolvedMode: 'normal', dice: [{ values: [12] }], total: 16 }, success: true } });
    expect(rng).toHaveBeenCalledTimes(1);
  });

  it('does not fake automation for Champion reference-only critical mechanics', () => {
    const character = fighterWithWeapons();
    const result = rollWeaponAttack(character.id, SCIMITAR_ID, 'normal', { rng: dieValue(19, 20) });
    expect(result).toMatchObject({ ok: true, value: { roll: { dice: [{ values: [19] }] } } });
    if (result.ok) expect(result.value.roll.natural).toBeUndefined();
  });

  it('does not mutate character state for checks, attacks, or damage rolls', () => {
    const character = fighterWithWeapons();
    const before = JSON.stringify(getCharacterById(character.id));
    rollSkillCheck(character.id, 'perception', 'normal', { rng: dieValue(12, 20) });
    rollWeaponAttack(character.id, SCIMITAR_ID, 'normal', { rng: dieValue(14, 20) });
    rollWeaponDamage(character.id, SCIMITAR_ID, 'standard', false, { rng: dieValue(5, 6) });
    expect(JSON.stringify(getCharacterById(character.id))).toBe(before);
    expect(loadRollHistory()).toHaveLength(3);
  });

  it('rolls Scimitar and Light Crossbow attacks/damage from existing derivation', () => {
    const character = fighterWithWeapons();
    expect(rollWeaponAttack(character.id, SCIMITAR_ID, 'normal', { rng: dieValue(14, 20) })).toMatchObject({ ok: true, value: { roll: { modifier: 6, total: 20 } } });
    expect(rollWeaponDamage(character.id, SCIMITAR_ID, 'standard', false, { rng: dieValue(5, 6) })).toMatchObject({ ok: true, value: { roll: { dice: [{ die: 6, values: [5] }], modifier: 4, total: 9, request: { outcome: { damageType: 'slashing' } } } } });
    expect(rollWeaponAttack(character.id, LIGHT_CROSSBOW_ID, 'normal', { rng: dieValue(13, 20) })).toMatchObject({ ok: true, value: { roll: { modifier: 6, total: 19 } } });
    expect(rollWeaponDamage(character.id, LIGHT_CROSSBOW_ID, 'standard', false, { rng: dieValue(6, 8) })).toMatchObject({ ok: true, value: { roll: { dice: [{ die: 8, values: [6] }], modifier: 4, total: 10, request: { outcome: { damageType: 'piercing' } } } } });
  });

  it('respects explicit Finesse choice and doubles only damage dice for Critical', () => {
    const character = fighterWithWeapons();
    const critical = rollWeaponDamage(character.id, SCIMITAR_ID, 'standard', true, { rng: (() => { const values = [dieValue(5, 6)(), dieValue(3, 6)()]; let i = 0; return () => values[i++]; })() });
    expect(critical).toMatchObject({ ok: true, value: { roll: { dice: [{ die: 6, values: [5, 3] }], modifier: 4, total: 12, request: { label: 'Scimitar Damage — Critical' } } } });
  });

  it('adds Fighter 4 / Rogue 1 Sneak Attack to the same weapon damage RollRequest without changing ordinary damage', () => {
    const character = fighterRogueWithWeapons();
    const ordinary = rollWeaponDamage(character.id, SCIMITAR_ID, 'standard', false, { rng: dieValue(4, 6) });
    expect(ordinary).toMatchObject({
      ok: true,
      value: {
        roll: {
          request: {
            expression: { kind: 'dice', dice: [{ quantity: 1, die: 6 }], modifier: 4 },
            label: 'Scimitar Damage',
          },
          dice: [{ die: 6, values: [4] }],
          modifier: 4,
          total: 8,
        },
      },
    });

    const values = [dieValue(4, 6)(), dieValue(5, 6)()];
    let index = 0;
    const sneak = rollWeaponDamage(character.id, SCIMITAR_ID, 'standard', false, {
      sneakAttack: true,
      rng: () => values[index++],
    });
    expect(sneak).toMatchObject({
      ok: true,
      value: {
        roll: {
          request: {
            expression: {
              kind: 'dice',
              dice: [{ quantity: 1, die: 6 }, { quantity: 1, die: 6 }],
              modifier: 4,
            },
            label: 'Scimitar Damage + Sneak Attack',
          },
          dice: [{ die: 6, values: [4] }, { die: 6, values: [5] }],
          modifier: 4,
          total: 13,
        },
      },
    });
  });

  it('doubles weapon and Sneak Attack dice on a critical while leaving the static modifier unchanged', () => {
    const character = fighterRogueWithWeapons();
    const raw = [5, 3, 4, 2].map((value) => dieValue(value, 6)());
    let index = 0;
    const critical = rollWeaponDamage(character.id, SCIMITAR_ID, 'standard', true, {
      sneakAttack: true,
      rng: () => raw[index++],
    });
    expect(critical).toMatchObject({
      ok: true,
      value: {
        roll: {
          request: {
            expression: {
              kind: 'dice',
              dice: [{ quantity: 2, die: 6 }, { quantity: 2, die: 6 }],
              modifier: 4,
            },
            label: 'Scimitar Damage + Sneak Attack — Critical',
          },
          dice: [{ die: 6, values: [5, 3] }, { die: 6, values: [4, 2] }],
          modifier: 4,
          total: 18,
        },
      },
    });
  });

  it('rejects Sneak Attack for a non-finesse melee weapon before rolling', () => {
    const character = fighterRogueWithWeapons();
    const rng = vi.fn(dieValue(4, 6));
    const result = rollWeaponDamage(character.id, QUARTERSTAFF_ID, 'one-handed', false, { sneakAttack: true, rng });
    expect(result).toMatchObject({ ok: false, error: { code: 'sneak-attack-ineligible-weapon' } });
    expect(rng).not.toHaveBeenCalled();
  });

  it('rejects requested Sneak Attack when the Character does not own the feature', () => {
    const character = fighterWithWeapons();
    const rng = vi.fn(dieValue(4, 6));
    const result = rollWeaponDamage(character.id, SCIMITAR_ID, 'standard', false, { sneakAttack: true, rng });
    expect(result).toMatchObject({ ok: false, error: { code: 'sneak-attack-unavailable' } });
    expect(rng).not.toHaveBeenCalled();
  });

  it('preserves Versatile one-handed/two-handed damage modes', () => {
    const character = fighterCharacter({ equipment: { equippedWeaponIds: [QUARTERSTAFF_ID] } });
    saveCharacters([character]);
    expect(rollWeaponDamage(character.id, QUARTERSTAFF_ID, 'one-handed', false, { rng: dieValue(4, 6) })).toMatchObject({ ok: true, value: { roll: { dice: [{ die: 6, values: [4] }], modifier: 2, total: 6 } } });
    expect(rollWeaponDamage(character.id, QUARTERSTAFF_ID, 'two-handed', false, { rng: dieValue(7, 8) })).toMatchObject({ ok: true, value: { roll: { dice: [{ die: 8, values: [7] }], modifier: 2, total: 9 } } });
  });

  it('rolls Second Wind atomically, caps HP, spends the shared resource, and records effects', () => {
    const character = createCharacter(fighterInput());
    applyCharacterDamage(character.id, 10);
    const consumerId = secondWindConsumerId(character.id);
    const outcome = rollHealingResource(character.id, FIGHTER_SECOND_WIND_RESOURCE_ID, consumerId, { rng: dieValue(6, 10) });
    expect(outcome).toMatchObject({ ok: true, value: { character: { playState: { currentHp: 36, resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 2 } } }, roll: { dice: [{ die: 10, values: [6] }], modifier: 4, total: 10 } } });
    if (!outcome.ok) return;
    expect(outcome.value.roll.effects).toEqual([
      { kind: 'hp', before: 26, after: 36 },
      { kind: 'resource', resourceId: FIGHTER_SECOND_WIND_RESOURCE_ID, before: 3, after: 2 },
    ]);
    expect(loadRollHistory()[0].result).toEqual(outcome.value.roll);
  });

  it('uses the owning Fighter level for Fighter 4 / Rogue 1 Second Wind healing and spends exactly one shared charge', () => {
    const character = fighterRogueWithWeapons();
    const beforeUses = character.playState.resourceUses[FIGHTER_SECOND_WIND_RESOURCE_ID];
    expect(beforeUses).toBe(3);

    expect(applyCharacterDamage(character.id, 20)).toMatchObject({ ok: true });
    const damaged = getCharacterById(character.id);
    if (!damaged) throw new Error('Expected damaged multiclass Character.');

    const outcome = rollHealingResource(
      character.id,
      FIGHTER_SECOND_WIND_RESOURCE_ID,
      secondWindConsumerId(character.id),
      { rng: dieValue(6, 10) },
    );

    expect(outcome).toMatchObject({
      ok: true,
      value: {
        character: {
          playState: {
            currentHp: damaged.playState.currentHp + 10,
            resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 2 },
          },
        },
        roll: {
          dice: [{ die: 10, values: [6] }],
          modifier: 4,
          total: 10,
          request: {
            expression: {
              kind: 'dice',
              dice: [{ quantity: 1, die: 10 }],
              modifier: 4,
            },
          },
        },
      },
    });
  });

  it('keeps Tactical Mind on the same Second Wind pool for Fighter 4 / Rogue 1', () => {
    const character = fighterRogueWithWeapons();
    const tacticalMindId = fighterResourceConsumerId(character.id, 'Tactical Mind');
    const before = character.playState.resourceUses[FIGHTER_SECOND_WIND_RESOURCE_ID];

    const spent = consumeCharacterResource(
      character.id,
      FIGHTER_SECOND_WIND_RESOURCE_ID,
      tacticalMindId,
    );

    expect(spent).toMatchObject({
      ok: true,
      value: {
        playState: {
          resourceUses: {
            [FIGHTER_SECOND_WIND_RESOURCE_ID]: (before ?? 0) - 1,
          },
        },
      },
    });
  });

  it('rejects unavailable Second Wind before rolling or mutating', () => {
    const character = createCharacter(fighterInput());
    const consumerId = secondWindConsumerId(character.id);
    updateCharacterPlayState(character.id, { ...character.playState, resourceUses: { ...character.playState.resourceUses, [FIGHTER_SECOND_WIND_RESOURCE_ID]: 0 } });
    const rng = vi.fn(() => 0.5);
    const before = getCharacterById(character.id);
    expect(rollHealingResource(character.id, FIGHTER_SECOND_WIND_RESOURCE_ID, consumerId, { rng })).toMatchObject({ ok: false, error: { code: 'resource-depleted' } });
    expect(rng).not.toHaveBeenCalled();
    expect(getCharacterById(character.id)).toEqual(before);
    expect(loadRollHistory()).toEqual([]);
  });

  it('rolls and spends a Hit Die atomically with CON modifier and history effects', () => {
    const character = createCharacter(fighterInput());
    applyCharacterDamage(character.id, 20);
    const outcome = rollHitDie(character.id, { rng: dieValue(7, 10) });
    expect(outcome).toMatchObject({ ok: true, value: { character: { playState: { currentHp: 25, hitDiceRemaining: { 10: 3 } } }, roll: { dice: [{ die: 10, values: [7] }], modifier: 2, total: 9 } } });
    if (!outcome.ok) return;
    expect(outcome.value.roll.effects).toEqual([
      { kind: 'hp', before: 16, after: 25 },
      { kind: 'hit-dice', die: 10, before: 4, after: 3 },
    ]);
  });

  it('rejects unavailable Hit Dice before RNG', () => {
    const character = createCharacter(fighterInput());
    updateCharacterPlayState(character.id, { ...character.playState, hitDiceRemaining: {} });
    const rng = vi.fn(() => 0.5);
    expect(rollHitDie(character.id, { rng })).toMatchObject({ ok: false, error: { code: 'unavailable-hit-die' } });
    expect(rng).not.toHaveBeenCalled();
  });

  it('keeps Tactical Mind on the same Second Wind pool rather than inventing a second roll resource', () => {
    const character = createCharacter(fighterInput());
    const derived = deriveCharacterState(character, contentRegistry);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    const secondWind = derived.value.resources.find((resource) => resource.id === FIGHTER_SECOND_WIND_RESOURCE_ID)!;
    expect(secondWind.consumers.map((consumer) => consumer.name)).toEqual(['Second Wind', 'Tactical Mind']);
    expect(derived.value.resources.filter((resource) => resource.name.includes('Tactical Mind'))).toHaveLength(0);
  });

  it('uses the same Dice Engine for a structurally compatible Homebrew weapon', () => {
    const scimitar = contentRegistry.findWeapon(SCIMITAR_ID)!;
    const homebrew: WeaponContent = { ...scimitar, id: 'homebrew:test:weapon:moonblade', name: 'Moonblade', source: { type: 'homebrew', namespace: 'test' } };
    const registry = new ContentRegistry(SRD_CONTENT, [homebrew]);
    const character = fighterCharacter({ equipment: { equippedWeaponIds: [homebrew.id] }, weaponAttackAbilityChoices: { [homebrew.id]: 'dexterity' } });
    const attack = deriveWeaponAttack(character, SRD_FIGHTER, registry, deriveAbilityModifiers(character.abilityScores), homebrew.id);
    expect(attack.ok).toBe(true);
    if (!attack.ok) return;
    const rolled = rollRequest({
      type: 'attack',
      label: `${attack.value.name} Attack`,
      expression: { kind: 'dice', dice: [{ quantity: 1, die: 20 }], modifier: attack.value.attackModifier },
      mode: 'normal',
      source: { characterId: character.id, weaponId: homebrew.id },
      outcome: { kind: 'attack' },
    }, dieValue(14, 20));
    expect(rolled).toMatchObject({ ok: true, value: { request: { label: 'Moonblade Attack' }, modifier: 6, total: 20 } });
  });

  it('handles unknown roll sources safely', () => {
    const character = fighterWithWeapons();
    expect(rollSkillCheck(character.id, 'made-up' as 'perception')).toMatchObject({ ok: false, error: { code: 'unknown-skill' } });
    expect(rollSavingThrow(character.id, 'made-up' as 'dexterity')).toMatchObject({ ok: false, error: { code: 'unknown-saving-throw' } });
    expect(rollWeaponAttack(character.id, 'srd-5.2.1:weapon:not-real')).toMatchObject({ ok: false, error: { code: 'missing-derived-attack' } });
  });
});
