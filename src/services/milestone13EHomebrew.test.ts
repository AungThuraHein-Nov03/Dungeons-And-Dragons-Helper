import { beforeEach, describe, expect, it } from 'vitest';
import { SRD_CONTENT, srdId } from '../content/srd';
import type { ClassContent, ClassFeatureContent } from '../models/content';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { fighterInput } from '../test/fixtures';
import { createCharacter } from './characterStorage';
import { ContentRegistry } from './contentRegistry';
import { validateContentDataset } from './contentValidation';
import {
  rollAbilityCheck,
  rollSavingThrow,
  rollWeaponAttack,
  rollWeaponDamage,
} from './characterRolls';
import { applyRollHistoryDiceTransformation, loadRollHistory } from './rollHistory';

const HOME_SOURCE = { type: 'homebrew', namespace: 'm13e-generic' } as const;
const HOME_CLASS_ID = 'homebrew:m13e-generic:class:wayline-adept';
const HOME_REROLL_ID = 'homebrew:m13e-generic:dice-transformation:echo-correction';
const HOME_FLOOR_ID = 'homebrew:m13e-generic:dice-transformation:measured-impact';
const GREAT_SWORD_ID = srdId('weapon', 'greatsword');
const SHIELD_ID = srdId('armor', 'shield');

const HOME_FEATURE: ClassFeatureContent = {
  id: 'homebrew:m13e-generic:class-feature:wayline-discipline',
  name: 'Wayline Discipline',
  description: 'Synthetic generic M13E acceptance feature.',
  effects: [
    {
      type: 'dice-transformation',
      id: HOME_REROLL_ID,
      optional: true,
      target: { kind: 'd20-test' },
      transformation: { type: 'reroll-once-use-new', die: 20, qualifyingFaces: [2] },
    },
    {
      type: 'dice-transformation',
      id: HOME_FLOOR_ID,
      optional: false,
      target: { kind: 'weapon-damage', weaponMode: 'melee', heldWithTwoHands: true, anyWeaponProperties: ['two-handed'] },
      transformation: { type: 'minimum-die-face', minimum: 4 },
    },
    { type: 'saving-throw-roll-mode', abilities: ['wisdom'], mode: 'disadvantage' },
    { type: 'saving-throw-proficiency', abilities: ['intelligence'] },
    { type: 'speed-bonus', amount: { kind: 'fixed', amount: 5 }, requireNoShield: true },
    { type: 'critical-threshold', attackKind: 'weapon', minimumNatural: 17 },
  ],
  referenceEffects: [],
};

function proficiencyBonus(level: number): number {
  return level >= 17 ? 6 : level >= 13 ? 5 : level >= 9 ? 4 : level >= 5 ? 3 : 2;
}

const HOME_CLASS: ClassContent = {
  id: HOME_CLASS_ID,
  kind: 'class',
  name: 'Wayline Adept',
  source: HOME_SOURCE,
  hitDie: 8,
  fixedHitPointsPerLevel: 5,
  primaryAbility: { mode: 'one-of', abilities: ['intelligence'] },
  savingThrowProficiencies: ['dexterity', 'charisma'],
  weaponProficiencies: [{ kind: 'category', category: 'simple' }, { kind: 'category', category: 'martial' }],
  armorTraining: ['light', 'shield'],
  toolProficiencies: [],
  skillChoices: { choose: 2, from: ['history', 'perception', 'insight'] },
  startingEquipment: [{ id: 'A', items: [], currency: { amount: 0, unit: 'gp' } }],
  progression: Array.from({ length: 20 }, (_, index) => ({
    level: index + 1,
    proficiencyBonus: proficiencyBonus(index + 1),
    features: index === 0 ? [HOME_FEATURE] : [],
  })),
  resources: [],
};

function rngSequence(values: readonly number[], die: number) {
  let index = 0;
  return () => (values[Math.min(index++, values.length - 1)] - 1) / die;
}

function homeCharacter(registry: ContentRegistry, shield = false) {
  return createCharacter(fighterInput({
    name: 'Generic Wayline Test',
    classId: HOME_CLASS_ID,
    subclassId: undefined,
    level: 1,
    skillProficiencies: ['history', 'perception'],
    equipment: {
      equippedWeaponIds: [GREAT_SWORD_ID],
      ...(shield ? { equippedShieldId: SHIELD_ID } : {}),
    },
  }), window.localStorage, registry);
}

describe('M13E unrelated Homebrew generic acceptance', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('validates and acquires every new generic M13E primitive without source/name dispatch', () => {
    expect(validateContentDataset([...SRD_CONTENT, HOME_CLASS])).toEqual([]);
    const registry = new ContentRegistry(SRD_CONTENT, [HOME_CLASS]);
    const character = homeCharacter(registry);
    const state = deriveCharacterState(character, registry);
    if (!state.ok) throw new Error(state.error.message);

    expect(state.value.classState.acquiredFeatures.find((feature) => feature.id === HOME_FEATURE.id)?.automatedEffects)
      .toEqual(HOME_FEATURE.effects);
    expect(state.value.species?.speedFeet).toBe(35);
    expect(state.value.savingThrows.intelligence.proficient).toBe(true);
    expect(state.value.savingThrows.wisdom.proficient).toBe(false);
    expect(state.value.ruleEffects).toEqual(expect.arrayContaining([...HOME_FEATURE.effects]));
  });

  it('honors the supplied custom ContentRegistry through Character roll services', () => {
    const registry = new ContentRegistry(SRD_CONTENT, [HOME_CLASS]);
    const character = homeCharacter(registry);

    const save = rollSavingThrow(character.id, 'wisdom', 'normal', {
      registry,
      rng: rngSequence([15, 6], 20),
    });
    expect(save).toMatchObject({
      ok: true,
      value: {
        roll: {
          request: { d20Context: { disadvantageSources: ['Wayline Discipline'] } },
          resolvedMode: 'disadvantage',
          dice: [{ values: [15, 6] }],
          keptD20: 6,
        },
      },
    });

    const attack = rollWeaponAttack(character.id, GREAT_SWORD_ID, 'normal', {
      registry,
      rng: rngSequence([17], 20),
    });
    expect(attack).toMatchObject({
      ok: true,
      value: {
        roll: {
          keptD20: 17,
          critical: true,
          natural: undefined,
          request: { criticalThreshold: 17 },
        },
      },
    });
  });

  it('executes an unrelated automatic minimum-face transform through weapon damage, Dice Engine, Roll Result, and Roll History', () => {
    const registry = new ContentRegistry(SRD_CONTENT, [HOME_CLASS]);
    const character = homeCharacter(registry);
    const damage = rollWeaponDamage(character.id, GREAT_SWORD_ID, undefined, false, {
      registry,
      rng: rngSequence([1, 3], 6),
    });

    expect(damage).toMatchObject({
      ok: true,
      value: {
        roll: {
          dice: [{ die: 6, values: [4, 4] }],
          request: {
            diceTransformations: [expect.objectContaining({
              id: HOME_FLOOR_ID,
              sourceLabel: 'Wayline Discipline',
              optional: false,
              die: 6,
              minimum: 4,
            })],
          },
          diceTransformationApplications: [
            expect.objectContaining({ transformationId: HOME_FLOOR_ID, sourceLabel: 'Wayline Discipline', original: 1, final: 4 }),
            expect.objectContaining({ transformationId: HOME_FLOOR_ID, sourceLabel: 'Wayline Discipline', original: 3, final: 4 }),
          ],
        },
      },
    });

    const history = loadRollHistory();
    expect(history[0].result.diceTransformationApplications).toEqual(damage.ok ? damage.value.roll.diceTransformationApplications : []);
  });

  it('executes an unrelated optional reroll only after player action and updates the same Roll History entry', () => {
    const registry = new ContentRegistry(SRD_CONTENT, [HOME_CLASS]);
    const character = homeCharacter(registry);
    const rolled = rollAbilityCheck(character.id, 'intelligence', 'normal', {
      registry,
      rng: rngSequence([2], 20),
    });
    expect(rolled).toMatchObject({
      ok: true,
      value: {
        roll: {
          keptD20: 2,
          request: {
            diceTransformations: [expect.objectContaining({
              id: HOME_REROLL_ID,
              sourceLabel: 'Wayline Discipline',
              optional: true,
              qualifyingFaces: [2],
            })],
          },
        },
      },
    });

    const before = loadRollHistory();
    expect(before).toHaveLength(1);
    const transformed = applyRollHistoryDiceTransformation(
      before[0].id,
      HOME_REROLL_ID,
      window.localStorage,
      rngSequence([14], 20),
    );
    expect(transformed).toMatchObject({
      ok: true,
      value: {
        id: before[0].id,
        result: {
          keptD20: 14,
          diceTransformationApplications: [{
            transformationId: HOME_REROLL_ID,
            sourceLabel: 'Wayline Discipline',
            type: 'reroll-once-use-new',
            die: 20,
            original: 2,
            replacement: 14,
            final: 14,
          }],
        },
      },
    });

    const after = loadRollHistory();
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before[0].id);
    expect(applyRollHistoryDiceTransformation(after[0].id, HOME_REROLL_ID, window.localStorage, rngSequence([19], 20)))
      .toMatchObject({ ok: false, error: { code: 'invalid-dice-transformation' } });
  });

  it('applies conditional Speed generically and suppresses the bonus when its structured Shield condition fails', () => {
    const registry = new ContentRegistry(SRD_CONTENT, [HOME_CLASS]);
    const unshielded = homeCharacter(registry);
    const fast = deriveCharacterState(unshielded, registry);
    if (!fast.ok) throw new Error(fast.error.message);
    expect(fast.value.species?.speedFeet).toBe(35);

    window.localStorage.clear();
    const shielded = homeCharacter(registry, true);
    const normal = deriveCharacterState(shielded, registry);
    if (!normal.ok) throw new Error(normal.error.message);
    expect(normal.value.species?.speedFeet).toBe(30);
  });
});
