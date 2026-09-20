import { describe, expect, it } from 'vitest';
import { srdId } from '../content/srd/source';
import type { Character, CharacterClassProgression } from '../models/character';
import type { ContentId } from '../models/contentId';
import { contentRegistry } from '../services/contentRegistry';
import { fighterCharacter } from '../test/fixtures';
import { classProgressionSkillChoiceContext, deriveClassProficiencyContext } from './classProficiencies';
import { createFixedHpProgression } from './health';
import {
  buildLevelUpCandidate,
  createLevelUpDraft,
  getLevelUpCoreChoiceContext,
  rollLevelUpHitPoints,
  validateLevelUpTransition,
  withFixedLevelUpHitPoints,
  withLevelUpAddedClassSkills,
  withLevelUpSubclass,
  withLevelUpTarget,
  withRolledLevelUpHitPoints,
} from './levelUp';

const FIGHTER_ID = srdId('class', 'fighter');
const CHAMPION_ID = srdId('subclass', 'fighter:champion');
const BERSERKER_ID = srdId('subclass', 'barbarian:path-of-the-berserker');
const WIZARD_ID = srdId('class', 'wizard');
const ROGUE_ID = srdId('class', 'rogue');

function progression(
  classId: ContentId,
  level: number,
  starting: boolean,
  subclassId?: ContentId,
): CharacterClassProgression {
  const classContent = contentRegistry.findClass(classId);
  if (!classContent) throw new Error(`Missing class ${classId}`);
  const skills = classProgressionSkillChoiceContext(classContent, starting);
  return {
    classId,
    level,
    ...(subclassId ? { subclassId } : {}),
    skillProficiencies: [...skills.from.slice(0, skills.choose)],
    hpProgression: createFixedHpProgression(level, starting),
  };
}

function resolvedCandidate(character: Character, draft: ReturnType<typeof createLevelUpDraft>) {
  const result = buildLevelUpCandidate(character, draft, contentRegistry);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('Milestone 15-C core Level Up choices', () => {
  it('A resolves Fighter 1 -> 2 with one fixed HP entry and no unrelated core prompts', () => {
    const character = fighterCharacter({ level: 1, subclassId: undefined });
    let draft = withLevelUpTarget(createLevelUpDraft(character), { kind: 'existing-class', classId: FIGHTER_ID });

    const before = resolvedCandidate(character, draft);
    expect(before.incompleteChoices.map((choice) => choice.kind)).toEqual(['hit-points']);

    draft = withFixedLevelUpHitPoints(draft);
    const candidate = resolvedCandidate(character, draft);
    const fighter = candidate.input.classProgressions.find((entry) => entry.classId === FIGHTER_ID)!;

    expect(fighter.level).toBe(2);
    expect(fighter.hpProgression).toEqual([{ classLevel: 2, method: 'fixed' }]);
    expect(candidate.incompleteChoices).toEqual([]);
    expect(validateLevelUpTransition(character, candidate.input)).toMatchObject({
      ok: true,
      value: { kind: 'existing-class', classId: FIGHTER_ID },
    });
  });

  it('B requires Fighter subclass at owner class level 3 and rejects a wrong-parent subclass', () => {
    const character = fighterCharacter({ level: 2, subclassId: undefined });
    let draft = withLevelUpTarget(createLevelUpDraft(character), { kind: 'existing-class', classId: FIGHTER_ID });
    draft = withFixedLevelUpHitPoints(draft);

    const unresolved = resolvedCandidate(character, draft);
    expect(unresolved.incompleteChoices).toContainEqual(expect.objectContaining({
      kind: 'subclass',
      classId: FIGHTER_ID,
      classLevel: 3,
    }));

    const wrongParent = buildLevelUpCandidate(
      character,
      withLevelUpSubclass(draft, BERSERKER_ID),
      contentRegistry,
    );
    expect(wrongParent).toMatchObject({ ok: false, error: { code: 'invalid-core-choice' } });

    const resolved = resolvedCandidate(character, withLevelUpSubclass(draft, CHAMPION_ID));
    expect(resolved.input.classProgressions.find((entry) => entry.classId === FIGHTER_ID)?.subclassId).toBe(CHAMPION_ID);
    expect(resolved.incompleteChoices.some((choice) => choice.kind === 'subclass')).toBe(false);
  });

  it('C preserves an existing valid subclass above its threshold without prompting again', () => {
    const character = fighterCharacter({ level: 3, subclassId: CHAMPION_ID });
    const draft = withFixedLevelUpHitPoints(
      withLevelUpTarget(createLevelUpDraft(character), { kind: 'existing-class', classId: FIGHTER_ID }),
    );
    const context = getLevelUpCoreChoiceContext(character, draft, contentRegistry);
    expect(context).toMatchObject({
      ok: true,
      value: { currentClassLevel: 3, nextClassLevel: 4, existingSubclassId: CHAMPION_ID, subclassRequired: false },
    });

    const candidate = resolvedCandidate(character, draft);
    expect(candidate.input.classProgressions.find((entry) => entry.classId === FIGHTER_ID)?.subclassId).toBe(CHAMPION_ID);
    expect(candidate.incompleteChoices.some((choice) => choice.kind === 'subclass')).toBe(false);
  });

  it('D adds Wizard 1 with ordinary added-level HP and keeps starting Fighter saving throws authoritative', () => {
    const character = fighterCharacter({ abilityScores: { intelligence: 13 } });
    let draft = withLevelUpTarget(createLevelUpDraft(character), { kind: 'new-class', classId: WIZARD_ID });
    draft = withFixedLevelUpHitPoints(draft);
    const candidate = resolvedCandidate(character, draft);
    const wizard = candidate.input.classProgressions.find((entry) => entry.classId === WIZARD_ID)!;

    expect(wizard).toMatchObject({
      level: 1,
      skillProficiencies: [],
      hpProgression: [{ classLevel: 1, method: 'fixed' }],
    });
    expect(candidate.incompleteChoices.some((choice) => choice.kind === 'added-class-skills')).toBe(false);

    const proficiencies = deriveClassProficiencyContext(candidate.input, contentRegistry);
    if (!proficiencies.ok) throw new Error(proficiencies.error.message);
    expect(proficiencies.value.savingThrowProficiencies).toEqual(
      contentRegistry.findClass(FIGHTER_ID)?.savingThrowProficiencies,
    );
    expect(proficiencies.value.savingThrowProficiencies).not.toEqual(
      contentRegistry.findClass(WIZARD_ID)?.savingThrowProficiencies,
    );
  });

  it('E enforces the actual Rogue multiclass skill contract, including count, allowed values, and uniqueness', () => {
    const character = fighterCharacter({ abilityScores: { dexterity: 14 } });
    let draft = withLevelUpTarget(createLevelUpDraft(character), { kind: 'new-class', classId: ROGUE_ID });
    draft = withFixedLevelUpHitPoints(draft);

    const context = getLevelUpCoreChoiceContext(character, draft, contentRegistry);
    if (!context.ok) throw new Error(context.error.message);
    expect(context.value.addedClassSkills.choose).toBe(1);
    const allowedSkill = context.value.addedClassSkills.from[0];
    expect(allowedSkill).toBeDefined();

    const unresolved = resolvedCandidate(character, draft);
    expect(unresolved.incompleteChoices).toContainEqual(expect.objectContaining({
      kind: 'added-class-skills',
      classId: ROGUE_ID,
      choose: 1,
    }));

    const invalid = buildLevelUpCandidate(
      character,
      withLevelUpAddedClassSkills(draft, ['arcana']),
      contentRegistry,
    );
    expect(invalid).toMatchObject({ ok: false, error: { code: 'invalid-core-choice' } });

    const duplicate = buildLevelUpCandidate(
      character,
      withLevelUpAddedClassSkills(draft, [allowedSkill, allowedSkill]),
      contentRegistry,
    );
    expect(duplicate).toMatchObject({ ok: false, error: { code: 'invalid-core-choice' } });

    const resolved = resolvedCandidate(character, withLevelUpAddedClassSkills(draft, [allowedSkill]));
    expect(resolved.input.classProgressions.find((entry) => entry.classId === ROGUE_ID)?.skillProficiencies).toEqual([allowedSkill]);
    expect(resolved.incompleteChoices.some((choice) => choice.kind === 'added-class-skills')).toBe(false);
  });

  it('F resets target-dependent core choices when the target changes', () => {
    const character = fighterCharacter({ level: 2, subclassId: undefined, abilityScores: { dexterity: 14 } });
    let draft = withLevelUpTarget(createLevelUpDraft(character), { kind: 'existing-class', classId: FIGHTER_ID });
    draft = withFixedLevelUpHitPoints(draft);
    draft = withLevelUpSubclass(draft, CHAMPION_ID);

    const switched = withLevelUpTarget(draft, { kind: 'new-class', classId: ROGUE_ID });
    expect(switched).toEqual({
      sourceCharacterId: character.id,
      sourceUpdatedAt: character.updatedAt,
      target: { kind: 'new-class', classId: ROGUE_ID },
    });

    const candidate = resolvedCandidate(character, switched);
    expect(candidate.input.classProgressions.find((entry) => entry.classId === ROGUE_ID)).toMatchObject({
      level: 1,
      hpProgression: [],
      skillProficiencies: [],
    });
    expect(candidate.incompleteChoices.map((choice) => choice.kind)).toEqual(
      expect.arrayContaining(['hit-points', 'added-class-skills']),
    );
  });

  it('G keeps one rolled HP result stable in the draft and candidate until an explicit new choice occurs', () => {
    const character = fighterCharacter({ level: 1, subclassId: undefined });
    let draft = withLevelUpTarget(createLevelUpDraft(character), { kind: 'existing-class', classId: FIGHTER_ID });
    const rolled = rollLevelUpHitPoints(character, draft, contentRegistry, () => 0.5);
    expect(rolled).toEqual({ ok: true, value: 6 });

    draft = withRolledLevelUpHitPoints(draft, rolled.ok ? rolled.value : 0);
    const first = resolvedCandidate(character, draft);
    const second = resolvedCandidate(character, draft);
    expect(first.input.classProgressions[0].hpProgression).toEqual([{ classLevel: 2, method: 'rolled', roll: 6 }]);
    expect(second.input.classProgressions[0].hpProgression).toEqual(first.input.classProgressions[0].hpProgression);

    const fixed = withFixedLevelUpHitPoints(draft);
    expect(fixed.hitPoints).toEqual({ method: 'fixed' });
  });

  it('I is reorder-safe for owner-class advancement requirements', () => {
    const fighter = progression(FIGHTER_ID, 2, true);
    const wizard = progression(WIZARD_ID, 1, false);
    const normal = fighterCharacter({
      startingClassId: FIGHTER_ID,
      classProgressions: [fighter, wizard],
      abilityScores: { intelligence: 13 },
    });
    const reordered = fighterCharacter({
      startingClassId: FIGHTER_ID,
      classProgressions: [wizard, fighter],
      abilityScores: { intelligence: 13 },
    });

    const make = (character: Character) => {
      let draft = withLevelUpTarget(createLevelUpDraft(character), { kind: 'existing-class', classId: FIGHTER_ID });
      draft = withFixedLevelUpHitPoints(draft);
      return resolvedCandidate(character, draft);
    };
    const left = make(normal);
    const right = make(reordered);

    expect(left.incompleteChoices).toContainEqual(expect.objectContaining({ kind: 'subclass', classLevel: 3 }));
    expect(right.incompleteChoices).toContainEqual(expect.objectContaining({ kind: 'subclass', classLevel: 3 }));
    expect(left.input.classProgressions.find((entry) => entry.classId === FIGHTER_ID)?.level).toBe(3);
    expect(right.input.classProgressions.find((entry) => entry.classId === FIGHTER_ID)?.level).toBe(3);
  });

  it('J keeps the level-20 boundary enforced for Core Choice context and candidate construction', () => {
    const character = fighterCharacter({ level: 20 });
    const draft = withLevelUpTarget(createLevelUpDraft(character), { kind: 'existing-class', classId: FIGHTER_ID });
    expect(getLevelUpCoreChoiceContext(character, draft, contentRegistry)).toMatchObject({
      ok: false,
      error: { code: 'level-cap' },
    });
    expect(buildLevelUpCandidate(character, draft, contentRegistry)).toMatchObject({
      ok: false,
      error: { code: 'level-cap' },
    });
  });
});
