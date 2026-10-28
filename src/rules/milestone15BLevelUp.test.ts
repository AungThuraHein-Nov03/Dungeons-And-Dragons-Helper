import { describe, expect, it } from 'vitest';
import { srdId } from '../content/srd/source';
import type { Character, CharacterClassProgression, CharacterInput } from '../models/character';
import type { ContentId } from '../models/contentId';
import { contentRegistry } from '../services/contentRegistry';
import { classProgressionSkillChoiceContext } from './classProficiencies';
import { createFixedHpProgression } from './health';
import {
  buildLevelUpCandidate,
  createLevelUpDraft,
  listLevelUpOptions,
  validateLevelUpTransition,
  withLevelUpTarget,
} from './levelUp';
import { fighterCharacter } from '../test/fixtures';

const FIGHTER_ID = srdId('class', 'fighter');
const CHAMPION_ID = srdId('subclass', 'fighter:champion');
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
    skillExpertise: [],
    weaponMasterySelections: [],
    hpProgression: createFixedHpProgression(level, starting),
  };
}

function multiclassCharacter(order: 'fighter-first' | 'wizard-first' = 'fighter-first'): Character {
  const fighter = progression(FIGHTER_ID, 4, true, CHAMPION_ID);
  const wizard = progression(WIZARD_ID, 2, false);
  return fighterCharacter({
    name: 'M15-B Fighter Wizard',
    startingClassId: FIGHTER_ID,
    classProgressions: order === 'fighter-first' ? [fighter, wizard] : [wizard, fighter],
    abilityScores: { intelligence: 12 },
  });
}

function targetOption(character: Character, kind: 'existing-class' | 'new-class', classId: ContentId) {
  const options = listLevelUpOptions(character, contentRegistry);
  const collection = kind === 'existing-class' ? options.existingClasses : options.newClasses;
  return collection.find((option) => option.target.classId === classId);
}

function cloneInput(character: Character): CharacterInput {
  const { id: _id, playState: _playState, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = character;
  void _id;
  void _playState;
  void _createdAt;
  void _updatedAt;
  return structuredClone(input);
}

describe('Milestone 15-B Level Up transactional foundation', () => {
  it('A offers Fighter 4 -> Fighter 5 as exactly one existing-class target', () => {
    const character = fighterCharacter({ level: 4, subclassId: CHAMPION_ID });
    const option = targetOption(character, 'existing-class', FIGHTER_ID);

    expect(option).toMatchObject({
      className: 'Fighter',
      currentLevel: 4,
      nextLevel: 5,
      eligible: true,
      target: { kind: 'existing-class', classId: FIGHTER_ID },
    });
  });

  it('B/F/G/H offers owner-specific Fighter or Wizard +1 intents and changes only the selected progression', () => {
    const character = multiclassCharacter();
    const options = listLevelUpOptions(character, contentRegistry);

    expect(options.existingClasses.map((option) => [option.className, option.currentLevel, option.nextLevel])).toEqual([
      ['Fighter', 4, 5],
      ['Wizard', 2, 3],
    ]);

    const fighterCandidate = buildLevelUpCandidate(
      character,
      withLevelUpTarget(createLevelUpDraft(character), { kind: 'existing-class', classId: FIGHTER_ID }),
      contentRegistry,
    );
    const wizardCandidate = buildLevelUpCandidate(
      character,
      withLevelUpTarget(createLevelUpDraft(character), { kind: 'existing-class', classId: WIZARD_ID }),
      contentRegistry,
    );
    if (!fighterCandidate.ok || !wizardCandidate.ok) throw new Error('Expected valid structural candidates.');

    expect(fighterCandidate.value.input.classProgressions.map((entry) => [entry.classId, entry.level])).toEqual([
      [FIGHTER_ID, 5],
      [WIZARD_ID, 2],
    ]);
    expect(wizardCandidate.value.input.classProgressions.map((entry) => [entry.classId, entry.level])).toEqual([
      [FIGHTER_ID, 4],
      [WIZARD_ID, 3],
    ]);
    expect(fighterCandidate.value.input.startingClassId).toBe(FIGHTER_ID);
    expect(wizardCandidate.value.input.startingClassId).toBe(FIGHTER_ID);

    expect(validateLevelUpTransition(character, fighterCandidate.value.input)).toMatchObject({
      ok: true,
      value: { kind: 'existing-class', classId: FIGHTER_ID },
    });
    expect(validateLevelUpTransition(character, wizardCandidate.value.input)).toMatchObject({
      ok: true,
      value: { kind: 'existing-class', classId: WIZARD_ID },
    });
  });

  it('C allows Fighter 4 -> Fighter 4 / Wizard 1 when all multiclass prerequisites pass', () => {
    const character = fighterCharacter({ abilityScores: { intelligence: 12 } });
    const option = targetOption(character, 'new-class', WIZARD_ID);
    expect(option).toMatchObject({ className: 'Wizard', eligible: true });

    const candidate = buildLevelUpCandidate(
      character,
      withLevelUpTarget(createLevelUpDraft(character), { kind: 'new-class', classId: WIZARD_ID }),
      contentRegistry,
    );
    if (!candidate.ok) throw new Error(candidate.error.message);

    expect(candidate.value.input.classProgressions.map((entry) => [entry.classId, entry.level])).toEqual([
      [FIGHTER_ID, 4],
      [WIZARD_ID, 1],
    ]);
    expect(candidate.value.input.startingClassId).toBe(FIGHTER_ID);
  });

  it('D derives an ineligible multiclass reason from the authoritative primary-ability requirement', () => {
    const character = fighterCharacter({ abilityScores: { intelligence: 10 } });
    const option = targetOption(character, 'new-class', WIZARD_ID);

    expect(option).toMatchObject({ className: 'Wizard', eligible: false });
    expect(option?.reason).toMatch(/Wizard requires Intelligence 13 or higher for multiclassing/i);

    const candidate = buildLevelUpCandidate(
      character,
      withLevelUpTarget(createLevelUpDraft(character), { kind: 'new-class', classId: WIZARD_ID }),
      contentRegistry,
    );
    expect(candidate).toMatchObject({ ok: false, error: { code: 'multiclass-prerequisite' } });
  });

  it('E excludes represented classes from Add Class and fails closed on a manually constructed duplicate target', () => {
    const character = fighterCharacter();
    expect(listLevelUpOptions(character, contentRegistry).newClasses.some((option) => option.target.classId === FIGHTER_ID)).toBe(false);

    const candidate = buildLevelUpCandidate(
      character,
      withLevelUpTarget(createLevelUpDraft(character), { kind: 'new-class', classId: FIGHTER_ID }),
      contentRegistry,
    );
    expect(candidate).toMatchObject({ ok: false, error: { code: 'duplicate-class' } });
  });

  it('I keeps Starting Class and advancement semantics independent of classProgressions array order', () => {
    const normal = multiclassCharacter('fighter-first');
    const reordered = multiclassCharacter('wizard-first');

    const normalCandidate = buildLevelUpCandidate(
      normal,
      withLevelUpTarget(createLevelUpDraft(normal), { kind: 'existing-class', classId: FIGHTER_ID }),
      contentRegistry,
    );
    const reorderedCandidate = buildLevelUpCandidate(
      reordered,
      withLevelUpTarget(createLevelUpDraft(reordered), { kind: 'existing-class', classId: FIGHTER_ID }),
      contentRegistry,
    );
    if (!normalCandidate.ok || !reorderedCandidate.ok) throw new Error('Expected reorder-safe candidates.');

    const levels = (input: CharacterInput) => Object.fromEntries(input.classProgressions.map((entry) => [entry.classId, entry.level]));
    expect(levels(normalCandidate.value.input)).toEqual(levels(reorderedCandidate.value.input));
    expect(normalCandidate.value.input.startingClassId).toBe(FIGHTER_ID);
    expect(reorderedCandidate.value.input.startingClassId).toBe(FIGHTER_ID);

    const normalWizard = targetOption(normal, 'new-class', ROGUE_ID);
    const reorderedWizard = targetOption(reordered, 'new-class', ROGUE_ID);
    expect(normalWizard?.eligible).toBe(reorderedWizard?.eligible);
    expect(normalWizard?.reason).toBe(reorderedWizard?.reason);
  });

  it('J rejects every advancement path at total Character level 20', () => {
    const character = fighterCharacter({ level: 20 });
    const options = listLevelUpOptions(character, contentRegistry);

    expect(options.atLevelCap).toBe(true);
    expect(options.existingClasses.every((option) => !option.eligible)).toBe(true);
    expect(options.newClasses.every((option) => !option.eligible)).toBe(true);

    const candidate = buildLevelUpCandidate(
      character,
      withLevelUpTarget(createLevelUpDraft(character), { kind: 'existing-class', classId: FIGHTER_ID }),
      contentRegistry,
    );
    expect(candidate).toMatchObject({ ok: false, error: { code: 'level-cap' } });
  });

  it('K captures source Character identity/version and rejects a mismatched transient source token', () => {
    const character = fighterCharacter();
    const draft = createLevelUpDraft(character);

    expect(draft).toEqual({
      sourceCharacterId: character.id,
      sourceUpdatedAt: character.updatedAt,
    });

    expect(buildLevelUpCandidate(character, {
      ...draft,
      sourceUpdatedAt: '2099-01-01T00:00:00.000Z',
      target: { kind: 'existing-class', classId: FIGHTER_ID },
    }, contentRegistry)).toMatchObject({ ok: false, error: { code: 'source-mismatch' } });
  });

  it('N leaves HP/subclass/feat/spell choices untouched and reports progression incompleteness instead of fabricating choices', () => {
    const character = fighterCharacter({ level: 4, subclassId: CHAMPION_ID });
    const existing = buildLevelUpCandidate(
      character,
      withLevelUpTarget(createLevelUpDraft(character), { kind: 'existing-class', classId: FIGHTER_ID }),
      contentRegistry,
    );
    if (!existing.ok) throw new Error(existing.error.message);

    const fighterBefore = character.classProgressions[0];
    const fighterAfter = existing.value.input.classProgressions[0];
    expect(fighterAfter.hpProgression).toEqual(fighterBefore.hpProgression);
    expect(fighterAfter.subclassId).toBe(CHAMPION_ID);
    expect(existing.value.input.manualFeats).toEqual(character.manualFeats);
    expect(existing.value.input.spellcastingSelections).toEqual(character.spellcastingSelections);
    expect(existing.value.incompleteChoices).toContainEqual(expect.objectContaining({ kind: 'hit-points', classId: FIGHTER_ID, classLevel: 5 }));

    const rogue = buildLevelUpCandidate(
      character,
      withLevelUpTarget(createLevelUpDraft(character), { kind: 'new-class', classId: ROGUE_ID }),
      contentRegistry,
    );
    if (!rogue.ok) throw new Error(rogue.error.message);
    const added = rogue.value.input.classProgressions.find((entry) => entry.classId === ROGUE_ID);
    expect(added).toMatchObject({ level: 1, skillProficiencies: [], hpProgression: [] });
    expect(added).not.toHaveProperty('subclassId');
    expect(rogue.value.incompleteChoices.map((choice) => choice.kind)).toEqual(expect.arrayContaining(['hit-points', 'added-class-skills']));
  });

  it('O fails closed on +2, multiple simultaneous progression increases, Starting-Class changes, and unrelated foundation changes', () => {
    const single = fighterCharacter();
    const plusTwo = cloneInput(single);
    plusTwo.classProgressions[0].level += 2;
    expect(validateLevelUpTransition(single, plusTwo)).toMatchObject({ ok: false, error: { code: 'invalid-transition' } });

    const multi = multiclassCharacter();
    const twoProgressions = cloneInput(multi);
    twoProgressions.classProgressions = twoProgressions.classProgressions.map((entry) => ({ ...entry, level: entry.level + 1 }));
    expect(validateLevelUpTransition(multi, twoProgressions)).toMatchObject({ ok: false, error: { code: 'invalid-transition' } });

    const changedStarting = cloneInput(multi);
    changedStarting.classProgressions = changedStarting.classProgressions.map((entry) => (
      entry.classId === WIZARD_ID ? { ...entry, level: entry.level + 1 } : entry
    ));
    changedStarting.startingClassId = WIZARD_ID;
    expect(validateLevelUpTransition(multi, changedStarting)).toMatchObject({ ok: false, error: { code: 'invalid-transition' } });

    const renamed = cloneInput(single);
    renamed.classProgressions[0].level += 1;
    renamed.name = 'Not Allowed';
    expect(validateLevelUpTransition(single, renamed)).toMatchObject({ ok: false, error: { code: 'invalid-transition' } });
  });
});
