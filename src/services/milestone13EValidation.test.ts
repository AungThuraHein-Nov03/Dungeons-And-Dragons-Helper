import { beforeEach, describe, expect, it } from 'vitest';
import { applyOptionalDiceTransformation, rollRequest, validateRollRequest } from '../dice/diceEngine';
import type { RollDiceTransformation, RollRequest, RollResult } from '../dice/types';
import type { CharacterRuleEffect, ClassContent } from '../models/content';
import { validateContentDataset } from './contentValidation';
import { addRollHistory, loadRollHistory, ROLL_HISTORY_STORAGE_KEY } from './rollHistory';

const SOURCE = { type: 'homebrew', namespace: 'm13e-invalid' } as const;

function homeClass(effects: readonly CharacterRuleEffect[]): ClassContent {
  return {
    id: 'homebrew:m13e-invalid:class:validator',
    kind: 'class',
    name: 'Validator Class',
    source: SOURCE,
    hitDie: 8,
    fixedHitPointsPerLevel: 5,
    primaryAbility: { mode: 'one-of', abilities: ['wisdom'] },
    savingThrowProficiencies: ['wisdom', 'charisma'],
    weaponProficiencies: [],
    armorTraining: [],
    toolProficiencies: [],
    skillChoices: { choose: 2, from: ['insight', 'perception'] },
    startingEquipment: [{ id: 'A', items: [], currency: { amount: 0, unit: 'gp' } }],
    progression: Array.from({ length: 20 }, (_, index) => ({
      level: index + 1,
      proficiencyBonus: index + 1 >= 17 ? 6 : index + 1 >= 13 ? 5 : index + 1 >= 9 ? 4 : index + 1 >= 5 ? 3 : 2,
      features: index === 0 ? [{
        id: 'homebrew:m13e-invalid:class-feature:validator',
        name: 'Validator Feature',
        description: 'Negative validation fixture.',
        effects,
        referenceEffects: [],
      }] : [],
    })),
    resources: [],
  };
}

function issuesFor(rawEffect: unknown) {
  return validateContentDataset([homeClass([rawEffect as CharacterRuleEffect])]);
}

function baseRollRequest(transformations: readonly RollDiceTransformation[]): RollRequest {
  return {
    type: 'ability-check',
    label: 'Malformed Test',
    expression: { kind: 'dice', dice: [{ quantity: 1, die: 20 }], modifier: 0 },
    mode: 'normal',
    diceTransformations: transformations,
    source: { characterId: 'm13e-invalid' },
    outcome: { kind: 'check' },
  };
}

const validReroll: RollDiceTransformation = {
  id: 'homebrew:m13e-invalid:transform:once',
  sourceLabel: 'Validator Feature',
  optional: true,
  type: 'reroll-once-use-new',
  die: 20,
  qualifyingFaces: [1],
};

describe('M13E strict malformed-data acceptance', () => {
  beforeEach(() => window.localStorage.clear());

  it('rejects unsupported transformation kinds and malformed transformation targets', () => {
    expect(issuesFor({
      type: 'dice-transformation',
      id: 'homebrew:m13e-invalid:transform:unknown',
      optional: false,
      target: { kind: 'd20-test' },
      transformation: { type: 'roll-until-success', die: 20 },
    }).some((issue) => issue.code === 'dice-transformation' && /Unsupported/.test(issue.message))).toBe(true);

    expect(issuesFor({
      type: 'dice-transformation',
      id: 'homebrew:m13e-invalid:transform:bad-target',
      optional: false,
      target: { kind: 'weapon-damage', weaponMode: 'melee', heldWithTwoHands: true, anyWeaponProperties: [] },
      transformation: { type: 'minimum-die-face', minimum: 3 },
    }).some((issue) => issue.code === 'dice-transformation-target')).toBe(true);

    expect(issuesFor({
      type: 'dice-transformation',
      id: 'homebrew:m13e-invalid:transform:unsupported-target',
      optional: true,
      target: { kind: 'turn-start' },
      transformation: { type: 'reroll-once-use-new', die: 20, qualifyingFaces: [1] },
    }).some((issue) => issue.code === 'dice-transformation-target')).toBe(true);
  });

  it('rejects invalid reroll die sizes, qualifying values, duplicate faces, and recursive/unbounded policy metadata', () => {
    for (const transformation of [
      { type: 'reroll-once-use-new', die: 12, qualifyingFaces: [1] },
      { type: 'reroll-once-use-new', die: 20, qualifyingFaces: [0] },
      { type: 'reroll-once-use-new', die: 20, qualifyingFaces: [21] },
      { type: 'reroll-once-use-new', die: 20, qualifyingFaces: [1, 1] },
      { type: 'reroll-once-use-new', die: 20, qualifyingFaces: [1], recursive: true },
      { type: 'reroll-once-use-new', die: 20, qualifyingFaces: [1], maximumRerolls: Infinity },
    ]) {
      const issues = issuesFor({
        type: 'dice-transformation',
        id: 'homebrew:m13e-invalid:transform:bad-reroll',
        optional: true,
        target: { kind: 'd20-test' },
        transformation,
      });
      expect(issues.some((issue) => issue.code === 'dice-transformation')).toBe(true);
    }
  });

  it('rejects malformed minimum-face transformations and incompatible targets', () => {
    for (const minimum of [0, 13, 2.5]) {
      const issues = issuesFor({
        type: 'dice-transformation',
        id: 'homebrew:m13e-invalid:transform:bad-floor',
        optional: false,
        target: { kind: 'weapon-damage', weaponMode: 'melee', heldWithTwoHands: true, anyWeaponProperties: ['two-handed'] },
        transformation: { type: 'minimum-die-face', minimum },
      });
      expect(issues.some((issue) => issue.code === 'dice-transformation')).toBe(true);
    }

    expect(issuesFor({
      type: 'dice-transformation',
      id: 'homebrew:m13e-invalid:transform:floor-d20',
      optional: false,
      target: { kind: 'd20-test' },
      transformation: { type: 'minimum-die-face', minimum: 3 },
    }).some((issue) => issue.code === 'dice-transformation-target')).toBe(true);
  });

  it('rejects duplicate transformation IDs across acquired rule effects', () => {
    const duplicateId = 'homebrew:m13e-invalid:transform:duplicate';
    const transform = {
      type: 'dice-transformation',
      id: duplicateId,
      optional: true,
      target: { kind: 'd20-test' },
      transformation: { type: 'reroll-once-use-new', die: 20, qualifyingFaces: [1] },
    } as const;
    const issues = validateContentDataset([homeClass([transform, { ...transform }])]);
    expect(issues).toContainEqual(expect.objectContaining({ code: 'duplicate-dice-transformation' }));
  });

  it('rejects malformed saving-throw roll-mode and proficiency targets', () => {
    expect(issuesFor({ type: 'saving-throw-roll-mode', abilities: ['luck'], mode: 'advantage' })
      .some((issue) => issue.code === 'rule-effect' && /Saving-throw roll-mode/.test(issue.message))).toBe(true);
    expect(issuesFor({ type: 'saving-throw-roll-mode', abilities: ['wisdom'], mode: 'normal' })
      .some((issue) => issue.code === 'rule-effect' && /Saving-throw roll-mode/.test(issue.message))).toBe(true);
    expect(issuesFor({ type: 'saving-throw-proficiency', abilities: [] })
      .some((issue) => issue.code === 'rule-effect' && /Saving-throw proficiency/.test(issue.message))).toBe(true);
    expect(issuesFor({ type: 'saving-throw-proficiency', abilities: ['wisdom', 'wisdom'] })
      .some((issue) => issue.code === 'rule-effect' && /Saving-throw proficiency/.test(issue.message))).toBe(true);
  });

  it('rejects malformed Speed conditions and critical thresholds', () => {
    for (const speed of [
      { type: 'speed-bonus', amount: { kind: 'fixed', amount: 5 }, disallowedArmorCategories: ['shield'] },
      { type: 'speed-bonus', amount: { kind: 'fixed', amount: 5 }, requireNoShield: 'yes' },
      { type: 'speed-bonus', amount: { kind: 'level-table', values: [{ level: 2, amount: 10 }, { level: 2, amount: 15 }] } },
    ]) {
      expect(issuesFor(speed).some((issue) => issue.code === 'rule-effect' && /Speed bonus/.test(issue.message))).toBe(true);
    }

    for (const critical of [
      { type: 'critical-threshold', attackKind: 'unarmed', minimumNatural: 19 },
      { type: 'critical-threshold', attackKind: 'weapon', minimumNatural: 1 },
      { type: 'critical-threshold', attackKind: 'weapon', minimumNatural: 21 },
    ]) {
      expect(issuesFor(critical).some((issue) => issue.code === 'rule-effect' && /Critical-threshold/.test(issue.message))).toBe(true);
    }
  });

  it('rejects executable/function metadata instead of treating it as a rule script', () => {
    const issues = issuesFor({
      type: 'speed-bonus',
      amount: { kind: 'fixed', amount: () => 5 },
    });
    expect(issues).toContainEqual(expect.objectContaining({ code: 'rule-effect-executable' }));
  });

  it('rejects unknown runtime reroll policy fields, duplicate IDs, bad dice, and optional minimum-face policies', () => {
    const recursive = baseRollRequest([{ ...validReroll, recursive: true } as unknown as RollDiceTransformation]);
    expect(validateRollRequest(recursive)).toMatchObject({ ok: false, error: { code: 'invalid-dice-transformation' } });

    const unlimited = baseRollRequest([{ ...validReroll, maximumRerolls: 99 } as unknown as RollDiceTransformation]);
    expect(validateRollRequest(unlimited)).toMatchObject({ ok: false, error: { code: 'invalid-dice-transformation' } });

    expect(validateRollRequest(baseRollRequest([validReroll, validReroll])))
      .toMatchObject({ ok: false, error: { code: 'invalid-dice-transformation' } });

    expect(validateRollRequest(baseRollRequest([{ ...validReroll, die: 12 } as unknown as RollDiceTransformation])))
      .toMatchObject({ ok: false, error: { code: 'invalid-dice-transformation' } });

    const optionalFloor = {
      id: 'homebrew:m13e-invalid:transform:optional-floor',
      sourceLabel: 'Validator Feature',
      optional: true,
      type: 'minimum-die-face',
      die: 6,
      minimum: 3,
    } as unknown as RollDiceTransformation;
    expect(validateRollRequest({
      type: 'damage',
      label: 'Bad Floor',
      expression: { kind: 'dice', dice: [{ quantity: 1, die: 6 }], modifier: 0 },
      mode: 'normal',
      diceTransformations: [optionalFloor],
      source: { characterId: 'm13e-invalid' },
      outcome: { kind: 'damage' },
    })).toMatchObject({ ok: false, error: { code: 'invalid-dice-transformation' } });
  });

  it('filters malformed persisted transformation applications and keeps only strict valid history entries', () => {
    const rolled = rollRequest(baseRollRequest([validReroll]), () => 0);
    if (!rolled.ok) throw new Error(rolled.error.message);
    const transformed = applyOptionalDiceTransformation(rolled.value, validReroll.id, () => 0.5);
    if (!transformed.ok) throw new Error(transformed.error.message);
    const valid = addRollHistory(transformed.value);
    const app = transformed.value.diceTransformationApplications?.[0];
    if (!app || app.type !== 'reroll-once-use-new') throw new Error('Expected reroll transformation application.');

    const variants: RollResult[] = [
      { ...transformed.value, diceTransformationApplications: [{ ...app, sourceLabel: 'Wrong Source' }] },
      { ...transformed.value, diceTransformationApplications: [{ ...app, final: 20 }] },
      { ...transformed.value, diceTransformationApplications: [{ ...app, replacement: 0, final: 0 }] },
      { ...transformed.value, diceTransformationApplications: [{ ...app, transformationId: 'homebrew:m13e-invalid:transform:missing' }] },
      { ...transformed.value, diceTransformationApplications: [{ ...app, recursive: true } as unknown as typeof app] },
      { ...transformed.value, diceTransformationApplications: [app, { ...app }] },
    ];

    const malformedEntries = variants.map((result, index) => ({
      id: `malformed-${index}`,
      rolledAt: '2026-09-18T11:00:00.000Z',
      result,
    }));
    window.localStorage.setItem(ROLL_HISTORY_STORAGE_KEY, JSON.stringify([...malformedEntries, valid]));
    expect(loadRollHistory()).toEqual([valid]);
  });
});
