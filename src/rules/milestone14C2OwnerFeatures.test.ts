import { describe, expect, it } from 'vitest';
import { srdId } from '../content/srd';
import type { AbilityScores, Character, CharacterClassProgression, SkillId } from '../models/character';
import type { ContentId } from '../models/contentId';
import { contentRegistry } from '../services/contentRegistry';
import { fighterInput } from '../test/fixtures';
import { validateCharacterInput } from '../utils/characterValidation';
import { deriveCharacterClass } from './classes';
import { deriveCharacterState } from './deriveCharacter';
import { createFixedHpProgression } from './health';
import { deriveCharacterSubclass } from './subclasses';
import type { DerivedCharacterState, DerivedClassState } from './types';

const BARBARIAN_ID = srdId('class', 'barbarian');
const FIGHTER_ID = srdId('class', 'fighter');
const ROGUE_ID = srdId('class', 'rogue');
const WIZARD_ID = srdId('class', 'wizard');

const BERSERKER_ID = srdId('subclass', 'barbarian:path-of-the-berserker');
const CHAMPION_ID = srdId('subclass', 'fighter:champion');
const THIEF_ID = srdId('subclass', 'rogue:thief');

const BARBARIAN_RAGE_ID = srdId('class-feature', 'barbarian:rage');
const BARBARIAN_EXTRA_ATTACK_ID = srdId('class-feature', 'barbarian:extra-attack');
const BARBARIAN_FAST_MOVEMENT_ID = srdId('class-feature', 'barbarian:fast-movement');
const FIGHTER_EXTRA_ATTACK_ID = srdId('class-feature', 'fighter:extra-attack');
const ROGUE_CUNNING_ACTION_ID = srdId('class-feature', 'rogue:cunning-action');
const CHAMPION_IMPROVED_CRITICAL_ID = srdId('subclass-feature', 'fighter:champion:improved-critical');
const CHAMPION_ADDITIONAL_STYLE_ID = srdId('subclass-feature', 'fighter:champion:additional-fighting-style');
const THIEF_FAST_HANDS_ID = srdId('subclass-feature', 'rogue:thief:fast-hands');

const QUALIFYING_SCORES: Partial<AbilityScores> = {
  strength: 14,
  dexterity: 18,
  constitution: 14,
  intelligence: 13,
  wisdom: 13,
  charisma: 13,
};

function progression(
  classId: ContentId,
  level: number,
  skillProficiencies: SkillId[],
  starting: boolean,
  subclassId?: ContentId,
): CharacterClassProgression {
  return {
    classId,
    level,
    ...(subclassId ? { subclassId } : {}),
    skillProficiencies,
    hpProgression: createFixedHpProgression(level, starting),
  };
}

function character(
  startingClassId: ContentId,
  classProgressions: CharacterClassProgression[],
  abilityScores: Partial<AbilityScores> = QUALIFYING_SCORES,
): Character {
  return {
    ...fighterInput({
      startingClassId,
      classProgressions,
      abilityScores,
      inventory: [],
    }),
    id: 'm14-c2-character',
    playState: { currentHp: 1, temporaryHp: 0, hitDiceRemaining: {}, resourceUses: {} },
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
  };
}

function classState(state: DerivedCharacterState, classId: ContentId): DerivedClassState {
  const found = state.classProgressions.find((candidate) => candidate.id === classId);
  if (!found) throw new Error(`Missing derived class progression ${classId}`);
  return found;
}

function acquiredIds(owner: DerivedClassState): string[] {
  return owner.acquiredFeatures.map((feature) => feature.id);
}

function fighterRogue(startingClassId: typeof FIGHTER_ID | typeof ROGUE_ID, order: 'normal' | 'reversed' = 'normal'): Character {
  const fighter = progression(
    FIGHTER_ID,
    5,
    startingClassId === FIGHTER_ID ? ['athletics', 'perception'] : [],
    startingClassId === FIGHTER_ID,
    CHAMPION_ID,
  );
  const rogue = progression(
    ROGUE_ID,
    3,
    startingClassId === ROGUE_ID ? ['acrobatics', 'investigation', 'sleight-of-hand', 'stealth'] : ['stealth'],
    startingClassId === ROGUE_ID,
    THIEF_ID,
  );
  const progressions = order === 'normal' ? [fighter, rogue] : [rogue, fighter];
  return character(startingClassId, progressions);
}

describe('Milestone 14-C2 owner-aware class/subclass feature derivation', () => {
  it('A keeps Barbarian 4 / Fighter 5 feature acquisition on each owner level while PB uses total level 9', () => {
    const input = character(BARBARIAN_ID, [
      progression(BARBARIAN_ID, 4, ['athletics', 'perception'], true, BERSERKER_ID),
      progression(FIGHTER_ID, 5, [], false, CHAMPION_ID),
    ]);
    const result = deriveCharacterState(input, contentRegistry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.level).toBe(9);
    expect(result.value.proficiencyBonus).toBe(4);

    const barbarian = classState(result.value, BARBARIAN_ID);
    const fighter = classState(result.value, FIGHTER_ID);
    expect(barbarian.classLevel).toBe(4);
    expect(fighter.classLevel).toBe(5);
    expect(acquiredIds(fighter)).toContain(FIGHTER_EXTRA_ATTACK_ID);
    expect(acquiredIds(barbarian)).not.toContain(BARBARIAN_EXTRA_ATTACK_ID);
    expect(acquiredIds(barbarian)).not.toContain(BARBARIAN_FAST_MOVEMENT_ID);

    const rage = barbarian.acquiredFeatures.find((feature) => feature.id === BARBARIAN_RAGE_ID);
    expect(rage?.owner).toEqual({ classId: BARBARIAN_ID, className: 'Barbarian', classLevel: 4 });
    expect(rage?.owner.classLevel).not.toBe(result.value.level);

  });

  it('B derives earned Fighter 5 and Rogue 3 class features without starting-class-only ownership', () => {
    const result = deriveCharacterState(fighterRogue(FIGHTER_ID), contentRegistry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const fighter = classState(result.value, FIGHTER_ID);
    const rogue = classState(result.value, ROGUE_ID);
    expect(fighter.classLevel).toBe(5);
    expect(rogue.classLevel).toBe(3);
    expect(acquiredIds(fighter)).toContain(FIGHTER_EXTRA_ATTACK_ID);
    expect(acquiredIds(rogue)).toContain(ROGUE_CUNNING_ACTION_ID);
    expect(rogue.acquiredFeatures.every((feature) => feature.owner.classId === ROGUE_ID && feature.owner.classLevel === 3)).toBe(true);
  });

  it('C changing startingClassId changes starting semantics but not either progression feature schedule', () => {
    const fighterStart = deriveCharacterState(fighterRogue(FIGHTER_ID), contentRegistry);
    const rogueStart = deriveCharacterState(fighterRogue(ROGUE_ID), contentRegistry);
    expect(fighterStart.ok).toBe(true);
    expect(rogueStart.ok).toBe(true);
    if (!fighterStart.ok || !rogueStart.ok) return;

    for (const classId of [FIGHTER_ID, ROGUE_ID]) {
      const left = classState(fighterStart.value, classId);
      const right = classState(rogueStart.value, classId);
      expect(acquiredIds(left)).toEqual(acquiredIds(right));
      expect(left.classLevel).toBe(right.classLevel);
      expect(left.subclass?.acquiredFeatures.map((feature) => feature.id)).toEqual(right.subclass?.acquiredFeatures.map((feature) => feature.id));
    }

    expect(fighterStart.value.startingClassId).toBe(FIGHTER_ID);
    expect(rogueStart.value.startingClassId).toBe(ROGUE_ID);
    expect(fighterStart.value.savingThrows.strength.proficient).toBe(true);
    expect(rogueStart.value.savingThrows.strength.proficient).toBe(false);
  });

  it('D binds Champion to Fighter level 5 and does not use total level 9 to unlock level-7 Champion features', () => {
    const result = deriveCharacterState(character(FIGHTER_ID, [
      progression(FIGHTER_ID, 5, ['athletics', 'perception'], true, CHAMPION_ID),
      progression(BARBARIAN_ID, 4, [], false, BERSERKER_ID),
    ]), contentRegistry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const fighter = classState(result.value, FIGHTER_ID);
    expect(fighter.subclass).toMatchObject({
      id: CHAMPION_ID,
      parentClassId: FIGHTER_ID,
      parentClassLevel: 5,
      acquisitionLevel: 3,
    });
    const championIds = fighter.subclass?.acquiredFeatures.map((feature) => feature.id) ?? [];
    expect(championIds).toContain(CHAMPION_IMPROVED_CRITICAL_ID);
    expect(championIds).not.toContain(CHAMPION_ADDITIONAL_STYLE_ID);
    expect(fighter.subclass?.acquiredFeatures[0]?.owner).toMatchObject({
      classId: FIGHTER_ID,
      classLevel: 5,
      subclassId: CHAMPION_ID,
    });
  });

  it('E keeps two subclass owners attached to their own parent progressions', () => {
    const result = deriveCharacterState(fighterRogue(FIGHTER_ID), contentRegistry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const fighter = classState(result.value, FIGHTER_ID);
    const rogue = classState(result.value, ROGUE_ID);
    expect(fighter.subclass).toMatchObject({ id: CHAMPION_ID, parentClassId: FIGHTER_ID, parentClassLevel: 5 });
    expect(rogue.subclass).toMatchObject({ id: THIEF_ID, parentClassId: ROGUE_ID, parentClassLevel: 3 });
    expect(fighter.subclass?.acquiredFeatures.map((feature) => feature.id)).toContain(CHAMPION_IMPROVED_CRITICAL_ID);
    expect(rogue.subclass?.acquiredFeatures.map((feature) => feature.id)).toContain(THIEF_FAST_HANDS_ID);
    expect(rogue.subclass?.acquiredFeatures.every((feature) => feature.owner.classLevel === 3)).toBe(true);
  });

  it('F rejects a Fighter subclass below Fighter acquisition level even when total Character level is 3', () => {
    const invalid = fighterInput({
      startingClassId: FIGHTER_ID,
      classProgressions: [
        progression(FIGHTER_ID, 1, ['athletics', 'perception'], true, CHAMPION_ID),
        progression(ROGUE_ID, 2, ['stealth'], false),
      ],
      abilityScores: QUALIFYING_SCORES,
    });
    expect(validateCharacterInput(invalid).subclassId).toMatch(/requires level 3/i);

    const result = deriveCharacterState({
      ...invalid,
      id: 'm14-c2-early-subclass',
      playState: { currentHp: 1, temporaryHp: 0, hitDiceRemaining: {}, resourceUses: {} },
      createdAt: '2026-09-19T00:00:00.000Z',
      updatedAt: '2026-09-19T00:00:00.000Z',
    }, contentRegistry);
    expect(result).toMatchObject({ ok: false, error: { code: 'subclass-not-acquired', contentId: CHAMPION_ID } });
  });

  it('G preserves representative single-class Fighter/Champion, Barbarian/Berserker, and Rogue/Thief feature semantics', () => {
    const fixtures = [
      character(FIGHTER_ID, [progression(FIGHTER_ID, 5, ['athletics', 'perception'], true, CHAMPION_ID)]),
      character(BARBARIAN_ID, [progression(BARBARIAN_ID, 4, ['athletics', 'perception'], true, BERSERKER_ID)]),
      character(ROGUE_ID, [progression(ROGUE_ID, 3, ['acrobatics', 'investigation', 'sleight-of-hand', 'stealth'], true, THIEF_ID)]),
    ];

    for (const fixture of fixtures) {
      const result = deriveCharacterState(fixture, contentRegistry);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value.classState).toBeDefined();
      expect(result.value.classProgressions).toHaveLength(1);
      expect(result.value.classState?.id).toBe(fixture.startingClassId);
      expect(result.value.classState?.classLevel).toBe(fixture.classProgressions[0].level);
      expect(result.value.classState?.acquiredFeatures.map((feature) => feature.id))
        .toEqual(result.value.classProgressions[0].acquiredFeatures.map((feature) => feature.id));
      expect(result.value.subclass?.id).toBe(fixture.classProgressions[0].subclassId);
    }
  });

  it('H is semantically independent of classProgressions array order', () => {
    const first = fighterRogue(FIGHTER_ID, 'normal');
    const reversed = fighterRogue(FIGHTER_ID, 'reversed');
    const left = deriveCharacterState(first, contentRegistry);
    const right = deriveCharacterState(reversed, contentRegistry);
    expect(left.ok).toBe(true);
    expect(right.ok).toBe(true);
    if (!left.ok || !right.ok) return;
    expect(right.value).toEqual(left.value);
  });

  it('I never exposes singular class/subclass compatibility state for a multiclass Character', () => {
    const multiclass = fighterRogue(FIGHTER_ID);
    const result = deriveCharacterState(multiclass, contentRegistry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.classState).toBeUndefined();
    expect(result.value.classId).toBeUndefined();
    expect(result.value.className).toBeUndefined();
    expect(result.value.subclass).toBeUndefined();
    expect(deriveCharacterClass(multiclass, contentRegistry)).toMatchObject({
      ok: false,
      error: { code: 'multiclass-derivation-not-supported' },
    });
    expect(deriveCharacterSubclass(multiclass, contentRegistry)).toMatchObject({
      ok: false,
      error: { code: 'multiclass-derivation-not-supported' },
    });
  });

  it('J preserves derived-only owner semantics when D1 activates multiclass spellcasting', () => {
    const spellcasting = character(WIZARD_ID, [
      progression(WIZARD_ID, 1, ['arcana', 'history'], true),
      progression(FIGHTER_ID, 1, [], false),
    ]);
    const result = deriveCharacterState(spellcasting, contentRegistry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.classState).toBeUndefined();
    expect(result.value.subclass).toBeUndefined();
    expect(result.value.spellcasting).toMatchObject([{
      id: srdId('spellcasting-provider', 'wizard:spellcasting'),
      owner: { kind: 'class', classId: WIZARD_ID, level: 1 },
    }]);
  });
});
