import { describe, expect, it } from 'vitest';
import { srdId } from '../content/srd/source';
import type { Character, CharacterClassProgression } from '../models/character';
import type { ContentId } from '../models/contentId';
import { contentRegistry } from '../services/contentRegistry';
import { fighterCharacter } from '../test/fixtures';
import { classProgressionSkillChoiceContext } from './classProficiencies';
import { createFixedHpProgression } from './health';
import {
  buildLevelUpCandidate,
  createLevelUpDraft,
  deriveLevelUpCandidateAbilityScores,
  getLevelUpAdvancementChoiceContext,
  withFixedLevelUpHitPoints,
  withLevelUpFeatChoiceValue,
  withLevelUpFeatPath,
  withLevelUpFeatSelection,
  withLevelUpTarget,
} from './levelUp';

const FIGHTER_ID = srdId('class', 'fighter');
const WIZARD_ID = srdId('class', 'wizard');
const CHAMPION_ID = srdId('subclass', 'fighter:champion');
const ASI_ID = srdId('feat', 'ability-score-improvement');
const GRAPPLER_ID = srdId('feat', 'grappler');
const ARCHERY_ID = srdId('feat', 'archery');
const COMBAT_PROWESS_ID = srdId('feat', 'boon-of-combat-prowess');

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

function targetDraft(character: Character, classId: ContentId) {
  return withFixedLevelUpHitPoints(
    withLevelUpTarget(createLevelUpDraft(character), { kind: 'existing-class', classId }),
  );
}

function chooseAsi(character: Character, first: string, second: string) {
  const base = targetDraft(character, FIGHTER_ID);
  const context = getLevelUpAdvancementChoiceContext(character, base, contentRegistry);
  if (!context.ok || !context.value.featGrant) throw new Error('Expected feat grant');
  let draft = withLevelUpFeatPath(base, context.value.featGrant.id, 'ability-score-improvement', ASI_ID);
  draft = withLevelUpFeatChoiceValue(draft, context.value.featGrant.id, 'ability-increase', 0, first);
  draft = withLevelUpFeatChoiceValue(draft, context.value.featGrant.id, 'ability-increase', 1, second);
  return draft;
}

describe('Milestone 15-D advancement choices', () => {
  it('A does not invent an advancement choice at a gained level with no feat-acquisition feature', () => {
    const character = fighterCharacter({ level: 1, subclassId: undefined });
    const draft = targetDraft(character, FIGHTER_ID);

    const context = getLevelUpAdvancementChoiceContext(character, draft, contentRegistry);
    expect(context).toMatchObject({
      ok: true,
      value: { classId: FIGHTER_ID, currentClassLevel: 1, nextClassLevel: 2 },
    });
    if (!context.ok) return;
    expect(context.value.featGrant).toBeUndefined();

    const candidate = buildLevelUpCandidate(character, draft, contentRegistry);
    expect(candidate).toMatchObject({ ok: true });
    if (candidate.ok) expect(candidate.value.incompleteChoices).toEqual([]);
  });

  it('B triggers the bundled Fighter ASI/Feat decision from Fighter owner level 3 -> 4', () => {
    const character = fighterCharacter({ level: 3, subclassId: CHAMPION_ID });
    const draft = targetDraft(character, FIGHTER_ID);
    const context = getLevelUpAdvancementChoiceContext(character, draft, contentRegistry);

    expect(context).toMatchObject({
      ok: true,
      value: {
        classId: FIGHTER_ID,
        currentClassLevel: 3,
        nextClassLevel: 4,
        featGrant: { name: 'Ability Score Improvement', kind: 'general' },
      },
    });
    if (!context.ok || !context.value.featGrant) return;
    expect(context.value.featGrant.options.map((option) => option.id)).toContain(ASI_ID);

    const candidate = buildLevelUpCandidate(character, draft, contentRegistry);
    expect(candidate).toMatchObject({
      ok: true,
      value: { incompleteChoices: [expect.objectContaining({ kind: 'advancement-feat', classLevel: 4, classId: FIGHTER_ID })] },
    });
  });

  it('C applies the +2 ASI path exactly once in the ephemeral candidate and respects the cap', () => {
    const character = fighterCharacter({ level: 3, subclassId: CHAMPION_ID });
    const draft = chooseAsi(character, 'constitution', 'constitution');
    const candidate = buildLevelUpCandidate(character, draft, contentRegistry);
    expect(candidate).toMatchObject({ ok: true });
    if (!candidate.ok) return;

    expect(character.abilityScores.constitution).toBe(14);
    expect(candidate.value.input.abilityScores.constitution).toBe(14);
    expect(candidate.value.input.manualFeats).toEqual([
      { featId: ASI_ID, choices: { 'ability-increase': ['constitution', 'constitution'] } },
    ]);
    const effective = deriveLevelUpCandidateAbilityScores(candidate.value.input, contentRegistry);
    expect(effective).toMatchObject({ ok: true, value: { constitution: 16 } });

    const capped = fighterCharacter({ level: 3, subclassId: CHAMPION_ID, abilityScores: { strength: 20 } });
    const invalid = buildLevelUpCandidate(capped, chooseAsi(capped, 'strength', 'strength'), contentRegistry);
    expect(invalid).toMatchObject({ ok: false, error: { code: 'invalid-advancement-choice' } });
  });

  it('D supports +1/+1 on two distinct abilities and rejects an invalid capped allocation', () => {
    const character = fighterCharacter({ level: 3, subclassId: CHAMPION_ID });
    const draft = chooseAsi(character, 'constitution', 'wisdom');
    const candidate = buildLevelUpCandidate(character, draft, contentRegistry);
    expect(candidate).toMatchObject({ ok: true });
    if (!candidate.ok) return;

    const effective = deriveLevelUpCandidateAbilityScores(candidate.value.input, contentRegistry);
    expect(effective).toMatchObject({ ok: true, value: { constitution: 15, wisdom: 13 } });

    const capped = fighterCharacter({ level: 3, subclassId: CHAMPION_ID, abilityScores: { dexterity: 20 } });
    const invalid = buildLevelUpCandidate(capped, chooseAsi(capped, 'dexterity', 'constitution'), contentRegistry);
    expect(invalid).toMatchObject({ ok: false, error: { code: 'invalid-advancement-choice' } });
  });

  it('E lists only mechanically safe eligible feats, rejects unresolved prerequisites, and validates Grappler internal choice', () => {
    const character = fighterCharacter({ level: 3, subclassId: CHAMPION_ID });
    const base = targetDraft(character, FIGHTER_ID);
    const context = getLevelUpAdvancementChoiceContext(character, base, contentRegistry);
    if (!context.ok || !context.value.featGrant) throw new Error('Expected feat grant');

    const ids = context.value.featGrant.options.map((option) => option.id);
    expect(ids).toContain(ASI_ID);
    expect(ids).toContain(GRAPPLER_ID);
    expect(ids).not.toContain(ARCHERY_ID);

    let grappler = withLevelUpFeatPath(base, context.value.featGrant.id, 'feat');
    grappler = withLevelUpFeatSelection(grappler, context.value.featGrant.id, GRAPPLER_ID);
    expect(buildLevelUpCandidate(character, grappler, contentRegistry)).toMatchObject({
      ok: true,
      value: { incompleteChoices: [expect.objectContaining({ kind: 'advancement-feat' })] },
    });
    grappler = withLevelUpFeatChoiceValue(grappler, context.value.featGrant.id, 'ability-increase', 0, 'strength');
    expect(buildLevelUpCandidate(character, grappler, contentRegistry)).toMatchObject({ ok: true, value: { incompleteChoices: [] } });

    const forged = {
      ...base,
      advancementFeat: {
        grantId: context.value.featGrant.id,
        path: 'feat' as const,
        selection: { featId: ARCHERY_ID, choices: {} },
      },
    };
    expect(buildLevelUpCandidate(character, forged, contentRegistry)).toMatchObject({
      ok: false,
      error: { code: 'invalid-advancement-choice' },
    });

    const low = fighterCharacter({
      level: 3,
      subclassId: CHAMPION_ID,
      abilityScores: { strength: 10, dexterity: 10 },
    });
    const lowContext = getLevelUpAdvancementChoiceContext(low, targetDraft(low, FIGHTER_ID), contentRegistry);
    if (!lowContext.ok || !lowContext.value.featGrant) throw new Error('Expected low-score feat grant');
    expect(lowContext.value.featGrant.options.map((option) => option.id)).not.toContain(GRAPPLER_ID);
  });

  it('F uses owner class level rather than total Character level in multiclass advancement', () => {
    const fighter = progression(FIGHTER_ID, 3, true, CHAMPION_ID);
    const wizard = progression(WIZARD_ID, 4, false);
    const character = fighterCharacter({
      startingClassId: FIGHTER_ID,
      classProgressions: [fighter, wizard],
      abilityScores: { intelligence: 12 },
    });

    const fighterContext = getLevelUpAdvancementChoiceContext(character, targetDraft(character, FIGHTER_ID), contentRegistry);
    expect(fighterContext).toMatchObject({
      ok: true,
      value: { currentClassLevel: 3, nextClassLevel: 4, featGrant: { kind: 'general' } },
    });

    const wizardContext = getLevelUpAdvancementChoiceContext(character, targetDraft(character, WIZARD_ID), contentRegistry);
    expect(wizardContext).toMatchObject({
      ok: true,
      value: { currentClassLevel: 4, nextClassLevel: 5 },
    });
    if (wizardContext.ok) expect(wizardContext.value.featGrant).toBeUndefined();
  });

  it('G preserves existing feats, excludes duplicate nonrepeatable feats, and appends the new selection', () => {
    const character = fighterCharacter({
      level: 7,
      subclassId: CHAMPION_ID,
      manualFeats: [{ featId: GRAPPLER_ID, choices: { 'ability-increase': ['strength'] } }],
    });
    const base = targetDraft(character, FIGHTER_ID);
    const context = getLevelUpAdvancementChoiceContext(character, base, contentRegistry);
    if (!context.ok || !context.value.featGrant) throw new Error('Expected level 8 feat grant');
    expect(context.value.featGrant.options.map((option) => option.id)).not.toContain(GRAPPLER_ID);

    let draft = withLevelUpFeatPath(base, context.value.featGrant.id, 'ability-score-improvement', ASI_ID);
    draft = withLevelUpFeatChoiceValue(draft, context.value.featGrant.id, 'ability-increase', 0, 'constitution');
    draft = withLevelUpFeatChoiceValue(draft, context.value.featGrant.id, 'ability-increase', 1, 'constitution');
    const candidate = buildLevelUpCandidate(character, draft, contentRegistry);
    expect(candidate).toMatchObject({ ok: true });
    if (!candidate.ok) return;
    expect(candidate.value.input.manualFeats).toEqual([
      { featId: GRAPPLER_ID, choices: { 'ability-increase': ['strength'] } },
      { featId: ASI_ID, choices: { 'ability-increase': ['constitution', 'constitution'] } },
    ]);
    expect(character.manualFeats).toHaveLength(1);
  });

  it('H clears M15-D state when the level target changes', () => {
    const character = fighterCharacter({
      level: 3,
      subclassId: CHAMPION_ID,
      abilityScores: { intelligence: 12 },
    });
    const chosen = chooseAsi(character, 'constitution', 'constitution');
    expect(chosen.advancementFeat).toBeDefined();

    const switched = withLevelUpTarget(chosen, { kind: 'new-class', classId: WIZARD_ID });
    expect(switched).toEqual({
      sourceCharacterId: character.id,
      sourceUpdatedAt: character.updatedAt,
      target: { kind: 'new-class', classId: WIZARD_ID },
    });
  });

  it('J derives the ASI bonus once without mutating base scores', () => {
    const character = fighterCharacter({ level: 3, subclassId: CHAMPION_ID });
    const candidate = buildLevelUpCandidate(character, chooseAsi(character, 'constitution', 'constitution'), contentRegistry);
    if (!candidate.ok) throw new Error(candidate.error.message);

    expect(candidate.value.input.abilityScores.constitution).toBe(14);
    const scores = deriveLevelUpCandidateAbilityScores(candidate.value.input, contentRegistry);
    expect(scores).toMatchObject({ ok: true, value: { constitution: 16 } });
    expect(scores.ok && scores.value.constitution).not.toBe(18);
  });

  it('K does not invent a Weapon Mastery selection contract even when the gained level changes mastery capacity', () => {
    const character = fighterCharacter({ level: 3, subclassId: CHAMPION_ID });
    const draft = targetDraft(character, FIGHTER_ID);
    const candidate = buildLevelUpCandidate(character, draft, contentRegistry);
    expect(candidate).toMatchObject({ ok: true });
    if (!candidate.ok) return;
    expect(candidate.value.incompleteChoices.map((choice) => choice.kind)).toEqual(['advancement-feat']);
    expect(candidate.value.input).not.toHaveProperty('weaponMasteries');
    expect(candidate.value.input).not.toHaveProperty('weaponMasteryChoices');
  });

  it('L remains reorder-safe for the advanced owner progression', () => {
    const fighter = progression(FIGHTER_ID, 3, true, CHAMPION_ID);
    const wizard = progression(WIZARD_ID, 4, false);
    const normal = fighterCharacter({
      startingClassId: FIGHTER_ID,
      classProgressions: [fighter, wizard],
      abilityScores: { intelligence: 12 },
    });
    const reordered = fighterCharacter({
      startingClassId: FIGHTER_ID,
      classProgressions: [wizard, fighter],
      abilityScores: { intelligence: 12 },
    });

    for (const character of [normal, reordered]) {
      const context = getLevelUpAdvancementChoiceContext(character, targetDraft(character, FIGHTER_ID), contentRegistry);
      expect(context).toMatchObject({
        ok: true,
        value: { classId: FIGHTER_ID, currentClassLevel: 3, nextClassLevel: 4, featGrant: { kind: 'general' } },
      });
    }
  });

  it('M preserves the level-20 boundary and supports the real level-19 Epic Boon grant shape', () => {
    const eighteen = fighterCharacter({ level: 18, subclassId: CHAMPION_ID });
    const epic = getLevelUpAdvancementChoiceContext(eighteen, targetDraft(eighteen, FIGHTER_ID), contentRegistry);
    expect(epic).toMatchObject({
      ok: true,
      value: { currentClassLevel: 18, nextClassLevel: 19, featGrant: { kind: 'epic-boon' } },
    });
    if (epic.ok && epic.value.featGrant) {
      expect(epic.value.featGrant.options.map((option) => option.id)).toContain(COMBAT_PROWESS_ID);
    }

    const twenty = fighterCharacter({ level: 20, subclassId: CHAMPION_ID });
    expect(getLevelUpAdvancementChoiceContext(twenty, withLevelUpTarget(createLevelUpDraft(twenty), { kind: 'existing-class', classId: FIGHTER_ID }), contentRegistry)).toMatchObject({
      ok: false,
      error: { code: 'level-cap' },
    });
  });
});
