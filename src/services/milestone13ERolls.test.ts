import { beforeEach, describe, expect, it } from 'vitest';
import { srdId } from '../content/srd';
import type { SpellcastingProviderDefinition } from '../models/content';
import { deriveConditionD20Context } from '../rules/conditions';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { deriveSpellcastingProviders } from '../rules/spellcasting';
import type { DerivedCharacterState } from '../rules/types';
import { fighterCharacter, fighterInput, SCIMITAR_ID } from '../test/fixtures';
import { applyOptionalDiceTransformation, listEligibleOptionalDiceTransformations } from '../dice/diceEngine';
import { createCharacter } from './characterStorage';
import { contentRegistry } from './contentRegistry';
import {
  rollAbilityCheck,
  rollConcentrationSavingThrow,
  rollInitiative,
  rollSavingThrow,
  rollSkillCheck,
  rollWeaponAttack,
  rollWeaponDamage,
} from './characterRolls';
import { applyRollHistoryDiceTransformation, loadRollHistory } from './rollHistory';
import { rollSpellAttack } from './spellRolls';

const GNOME_ID = srdId('species', 'gnome');
const HALFLING_ID = srdId('species', 'halfling');
const GWF_ID = srdId('feat', 'great-weapon-fighting');
const GREAT_WEAPON_TRANSFORM_ID = srdId('dice-transformation', 'feat:great-weapon-fighting');
const HALFLING_LUCK_TRANSFORM_ID = srdId('dice-transformation', 'halfling:luck');
const GREAT_SWORD_ID = srdId('weapon', 'greatsword');
const GLAIVE_ID = srdId('weapon', 'glaive');
const GREATAXE_ID = srdId('weapon', 'greataxe');
const QUARTERSTAFF_ID = srdId('weapon', 'quarterstaff');

function dieValue(value: number, die: number) {
  return () => (value - 1) / die;
}

function sequence(values: readonly number[], die: number) {
  let index = 0;
  return () => (values[Math.min(index++, values.length - 1)] - 1) / die;
}

function gnomeCharacter() {
  return createCharacter(fighterInput({
    speciesId: GNOME_ID,
    speciesChoices: { 'gnomish-lineage': 'forest-gnome' },
    speciesSkillProficiencies: [],
  }));
}

function halflingFighter(level = 4, weapons: string[] = [SCIMITAR_ID]) {
  return createCharacter(fighterInput({
    level,
    speciesId: HALFLING_ID,
    speciesChoices: {},
    speciesSkillProficiencies: [],
    equipment: { equippedWeaponIds: weapons },
    weaponAttackAbilityChoices: weapons.includes(SCIMITAR_ID) ? { [SCIMITAR_ID]: 'dexterity' } : {},
  }));
}

function gwfFighter(weapons: string[]) {
  return createCharacter(fighterInput({
    manualFeats: [{ featId: GWF_ID, choices: {} }],
    equipment: { equippedWeaponIds: weapons },
    weaponAttackAbilityChoices: weapons.includes(SCIMITAR_ID) ? { [SCIMITAR_ID]: 'dexterity' } : {},
  }));
}

function championWithWeapon(level: number) {
  return createCharacter(fighterInput({
    level,
    ...(level < 3 ? { subclassId: undefined } : {}),
    equipment: { equippedWeaponIds: [GREAT_SWORD_ID] },
  }));
}

function monk14() {
  return createCharacter(fighterInput({
    classId: srdId('class', 'monk'),
    subclassId: srdId('subclass', 'monk:warrior-of-the-open-hand'),
    level: 14,
    skillProficiencies: ['athletics', 'insight'],
  }));
}

function halflingSpellState(): { character: ReturnType<typeof fighterCharacter>; state: DerivedCharacterState; providerId: string } {
  const character = fighterCharacter({
    speciesId: HALFLING_ID,
    speciesChoices: {},
    speciesSkillProficiencies: [],
  });
  const base = deriveCharacterState(character, contentRegistry);
  if (!base.ok) throw new Error(base.error.message);
  const definition: SpellcastingProviderDefinition = {
    id: 'homebrew:m13e:spellcasting-provider:luck-test',
    name: 'Luck Test Casting',
    spellcastingAbility: { kind: 'fixed', ability: 'wisdom' },
    multiclassSlotContribution: { kind: 'independent' },
    spellManagement: { kind: 'granted-only', spellIds: [srdId('spell', 'fire-bolt')] },
    ritualCasting: 'none',
  };
  const casting = deriveSpellcastingProviders(
    [{ definition, source: { type: 'homebrew', namespace: 'm13e' }, grantedBy: { contentId: 'homebrew:m13e:feature:casting', contentName: 'Luck Test Casting' } }],
    base.value.level,
    base.value.abilityModifiers,
    base.value.proficiencyBonus,
    contentRegistry,
  );
  if (!casting.ok) throw new Error(casting.error.message);
  return {
    character,
    state: { ...base.value, spellcasting: casting.value.providers },
    providerId: definition.id,
  };
}

describe('M13E Character roll integration', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('composes Gnomish Cunning Advantage with manual Disadvantage through the existing D20 resolver', () => {
    const character = gnomeCharacter();
    const result = rollSavingThrow(character.id, 'wisdom', 'disadvantage', { rng: dieValue(12, 20) });
    expect(result).toMatchObject({
      ok: true,
      value: {
        roll: {
          resolvedMode: 'normal',
          request: { d20Context: { advantageSources: ['Gnome'] } },
          dice: [{ values: [12] }],
        },
      },
    });
  });

  it('keeps same-direction Gnomish Cunning sources as one Advantage mode and Poisoned does not affect saves', () => {
    const character = gnomeCharacter();
    const poisoned = deriveConditionD20Context(['poisoned'], { kind: 'saving-throw', ability: 'wisdom' });
    expect(poisoned).toBeUndefined();

    const result = rollSavingThrow(character.id, 'wisdom', 'normal', {
      rng: sequence([4, 16], 20),
      d20Context: { advantageSources: ['Gnome', 'Arcane Ward'] },
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        roll: {
          resolvedMode: 'advantage',
          dice: [{ values: [4, 16] }],
          keptD20: 16,
          request: { d20Context: { advantageSources: ['Gnome', 'Arcane Ward'] } },
        },
      },
    });
  });

  it('uses newly acquired Disciplined Survivor proficiency in the existing Constitution Concentration save path', () => {
    const character = monk14();
    const state = deriveCharacterState(character, contentRegistry);
    if (!state.ok) throw new Error(state.error.message);
    expect(state.value.savingThrows.constitution.proficient).toBe(true);

    const result = rollConcentrationSavingThrow(character.id, 12, 'normal', { rng: dieValue(8, 20) });
    expect(result).toMatchObject({
      ok: true,
      value: {
        dc: 10,
        roll: {
          modifier: state.value.savingThrows.constitution.modifier,
          request: { source: { ability: 'constitution' } },
        },
      },
    });
  });

  it('preserves Initiative architecture while exposing Halfling Luck as optional d20 metadata', () => {
    const character = halflingFighter();
    const result = rollInitiative(character.id, 'normal', { rng: dieValue(1, 20) });
    expect(result).toMatchObject({ ok: true, value: { roll: { keptD20: 1, natural: 'nat1' } } });
    if (!result.ok) return;
    expect(result.value.roll.request.diceTransformations).toEqual([
      expect.objectContaining({ id: HALFLING_LUCK_TRANSFORM_ID, sourceLabel: 'Halfling', optional: true }),
    ]);
    expect(listEligibleOptionalDiceTransformations(result.value.roll).map((entry) => entry.id)).toEqual([HALFLING_LUCK_TRANSFORM_ID]);
  });

  it('uses ordinary 20, Champion 19, and Superior Critical 18 thresholds only when acquired', () => {
    const ordinary = championWithWeapon(2);
    expect(rollWeaponAttack(ordinary.id, GREAT_SWORD_ID, 'normal', { rng: dieValue(19, 20) }))
      .toMatchObject({ ok: true, value: { roll: { keptD20: 19, critical: false, natural: undefined } } });

    window.localStorage.clear();
    const improved = championWithWeapon(3);
    expect(rollWeaponAttack(improved.id, GREAT_SWORD_ID, 'normal', { rng: dieValue(19, 20) }))
      .toMatchObject({ ok: true, value: { roll: { keptD20: 19, critical: true, natural: undefined, request: { criticalThreshold: 19 } } } });

    window.localStorage.clear();
    const superior = championWithWeapon(15);
    expect(rollWeaponAttack(superior.id, GREAT_SWORD_ID, 'normal', { rng: dieValue(18, 20) }))
      .toMatchObject({ ok: true, value: { roll: { keptD20: 18, critical: true, natural: undefined, request: { criticalThreshold: 18 } } } });

    expect(rollWeaponAttack(superior.id, GREAT_SWORD_ID, 'normal', { rng: dieValue(1, 20) }))
      .toMatchObject({ ok: true, value: { roll: { critical: false, natural: 'nat1' } } });
  });

  it('evaluates Champion critical threshold after manual Advantage selects the kept weapon-attack d20', () => {
    const champion = championWithWeapon(3);
    const result = rollWeaponAttack(champion.id, GREAT_SWORD_ID, 'advantage', { rng: sequence([18, 19], 20) });
    expect(result).toMatchObject({ ok: true, value: { roll: { dice: [{ values: [18, 19] }], keptD20: 19, critical: true } } });
  });

  it.each([
    [GREAT_SWORD_ID, undefined, 6, [1, 2], [3, 3]],
    [GLAIVE_ID, undefined, 10, [2], [3]],
    [GREATAXE_ID, undefined, 12, [1], [3]],
    [QUARTERSTAFF_ID, 'two-handed' as const, 8, [2], [3]],
  ])('Great Weapon Fighting floors actual qualifying weapon damage dice for %s', (weaponId, damageMode, die, raw, expected) => {
    const fighter = gwfFighter([weaponId]);
    const result = rollWeaponDamage(fighter.id, weaponId, damageMode, false, { rng: sequence(raw, die) });
    expect(result).toMatchObject({
      ok: true,
      value: {
        roll: {
          dice: [{ die, values: expected }],
          request: { diceTransformations: [expect.objectContaining({ id: GREAT_WEAPON_TRANSFORM_ID, die, minimum: 3, optional: false })] },
        },
      },
    });
    if (!result.ok) return;
    expect(result.value.roll.diceTransformationApplications?.every((application) => application.sourceLabel === 'Great Weapon Fighting')).toBe(true);
  });

  it('does not apply Great Weapon Fighting to a non-qualifying weapon or a one-handed Versatile use', () => {
    const fighter = gwfFighter([SCIMITAR_ID, QUARTERSTAFF_ID]);
    const scimitar = rollWeaponDamage(fighter.id, SCIMITAR_ID, undefined, false, { rng: dieValue(1, 6) });
    expect(scimitar).toMatchObject({ ok: true, value: { roll: { dice: [{ values: [1] }] } } });
    if (scimitar.ok) {
      expect(scimitar.value.roll.request.diceTransformations).toBeUndefined();
      expect(scimitar.value.roll.diceTransformationApplications).toBeUndefined();
    }

    const staffOneHanded = rollWeaponDamage(fighter.id, QUARTERSTAFF_ID, 'one-handed', false, { rng: dieValue(1, 6) });
    expect(staffOneHanded).toMatchObject({ ok: true, value: { roll: { dice: [{ values: [1] }] } } });
    if (staffOneHanded.ok) expect(staffOneHanded.value.roll.request.diceTransformations).toBeUndefined();
  });

  it('applies Great Weapon Fighting to every doubled critical weapon die and leaves the ability modifier unchanged', () => {
    const fighter = gwfFighter([GREAT_SWORD_ID]);
    const result = rollWeaponDamage(fighter.id, GREAT_SWORD_ID, undefined, true, { rng: sequence([1, 2, 3, 6], 6) });
    expect(result).toMatchObject({
      ok: true,
      value: {
        roll: {
          dice: [{ die: 6, values: [3, 3, 3, 6] }],
          modifier: 2,
          total: 17,
        },
      },
    });
    if (!result.ok) return;
    expect(result.value.roll.diceTransformationApplications?.map((entry) => [entry.original, entry.final])).toEqual([[1, 3], [2, 3]]);
  });

  it('records automatic Great Weapon Fighting provenance in the authoritative Roll History entry', () => {
    const fighter = gwfFighter([GREATAXE_ID]);
    const result = rollWeaponDamage(fighter.id, GREATAXE_ID, undefined, false, { rng: dieValue(1, 12) });
    expect(result.ok).toBe(true);
    const history = loadRollHistory();
    expect(history).toHaveLength(1);
    expect(history[0].result.diceTransformationApplications).toEqual([
      expect.objectContaining({
        transformationId: GREAT_WEAPON_TRANSFORM_ID,
        sourceLabel: 'Great Weapon Fighting',
        type: 'minimum-die-face',
        original: 1,
        final: 3,
      }),
    ]);
  });

  it('keeps Halfling Luck player-chosen, replaces the same Roll History entry, and never creates a second roll', () => {
    const halfling = halflingFighter();
    const result = rollAbilityCheck(halfling.id, 'strength', 'normal', { rng: dieValue(1, 20) });
    expect(result.ok).toBe(true);
    const before = loadRollHistory();
    expect(before).toHaveLength(1);
    expect(before[0].result.keptD20).toBe(1);

    const transformed = applyRollHistoryDiceTransformation(before[0].id, HALFLING_LUCK_TRANSFORM_ID, window.localStorage, dieValue(17, 20));
    expect(transformed).toMatchObject({
      ok: true,
      value: {
        id: before[0].id,
        result: {
          keptD20: 17,
          natural: undefined,
          diceTransformationApplications: [{
            transformationId: HALFLING_LUCK_TRANSFORM_ID,
            sourceLabel: 'Halfling',
            original: 1,
            replacement: 17,
            final: 17,
          }],
        },
      },
    });
    const after = loadRollHistory();
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before[0].id);
    expect(applyRollHistoryDiceTransformation(after[0].id, HALFLING_LUCK_TRANSFORM_ID, window.localStorage, dieValue(20, 20)))
      .toMatchObject({ ok: false, error: { code: 'invalid-dice-transformation' } });
  });

  it('exposes Halfling Luck generically on ability, proficient skill, saving throw, and weapon attack d20 requests', () => {
    const halfling = halflingFighter(4, [SCIMITAR_ID]);
    const outcomes = [
      rollAbilityCheck(halfling.id, 'strength', 'normal', { rng: dieValue(1, 20) }),
      rollSkillCheck(halfling.id, 'perception', 'normal', { rng: dieValue(1, 20) }),
      rollSavingThrow(halfling.id, 'wisdom', 'normal', { rng: dieValue(1, 20) }),
      rollWeaponAttack(halfling.id, SCIMITAR_ID, 'normal', { rng: dieValue(1, 20) }),
    ];
    for (const outcome of outcomes) {
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) continue;
      expect(outcome.value.roll.request.diceTransformations?.some((entry) => entry.id === HALFLING_LUCK_TRANSFORM_ID)).toBe(true);
      expect(outcome.value.roll.keptD20).toBe(1);
    }
  });

  it('applies Halfling Luck to spell attacks and recomputes ordinary attack critical state from the replacement', () => {
    const { character, state, providerId } = halflingSpellState();
    const result = rollSpellAttack(character, state, providerId, srdId('spell', 'fire-bolt'), 'normal', { rng: dieValue(1, 20) });
    expect(result).toMatchObject({ ok: true, value: { roll: { keptD20: 1, critical: false, natural: 'nat1' } } });
    if (!result.ok) return;
    expect(listEligibleOptionalDiceTransformations(result.value.roll).map((entry) => entry.id)).toEqual([HALFLING_LUCK_TRANSFORM_ID]);

    const transformed = applyOptionalDiceTransformation(result.value.roll, HALFLING_LUCK_TRANSFORM_ID, dieValue(20, 20));
    expect(transformed).toMatchObject({
      ok: true,
      value: {
        keptD20: 20,
        critical: true,
        natural: 'nat20',
        diceTransformationApplications: [expect.objectContaining({ original: 1, replacement: 20, final: 20 })],
      },
    });
  });
});
