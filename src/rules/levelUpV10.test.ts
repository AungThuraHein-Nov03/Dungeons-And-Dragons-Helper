import { describe, expect, it } from 'vitest';
import { srdId } from '../content/srd/source';
import { contentRegistry } from '../services/contentRegistry';
import { fighterCharacter } from '../test/fixtures';
import {
  buildLevelUpCandidate,
  buildLevelUpReview,
  createLevelUpDraft,
  getConfirmableLevelUpCandidate,
  withFixedLevelUpHitPoints,
  withLevelUpAddedClassSkills,
  withLevelUpSkillExpertise,
  withLevelUpTarget,
  withLevelUpWeaponMasteries,
  withLevelUpLanguages,
} from './levelUp';

const ROGUE_ID = srdId('class', 'rogue');
const weapons = ['battleaxe', 'club', 'dagger', 'light-crossbow', 'scimitar', 'shortsword'].map((slug) => srdId('weapon', slug));

describe('Character v10 Level Up choices', () => {
  it('requires and persists two Rogue Expertise selections for Fighter 4 to Rogue 1', () => {
    const character = fighterCharacter();
    character.classProgressions[0].weaponMasterySelections = weapons.slice(0, 4);
    let draft = withLevelUpTarget(createLevelUpDraft(character), { kind: 'new-class', classId: ROGUE_ID });
    draft = withFixedLevelUpHitPoints(draft);
    draft = withLevelUpAddedClassSkills(draft, ['stealth']);

    const incomplete = buildLevelUpCandidate(character, draft, contentRegistry);
    expect(incomplete.ok).toBe(true);
    if (!incomplete.ok) return;
    expect(incomplete.value.incompleteChoices).toContainEqual(expect.objectContaining({
      kind: 'skill-expertise', classId: ROGUE_ID, choose: 2,
    }));
    expect(incomplete.value.incompleteChoices).toContainEqual(expect.objectContaining({
      kind: 'weapon-mastery', classId: ROGUE_ID, choose: 2,
    }));
    expect(getConfirmableLevelUpCandidate(character, draft, contentRegistry)).toMatchObject({
      ok: false, error: { code: 'incomplete-level-up' },
    });

    draft = withLevelUpSkillExpertise(draft, ['perception', 'stealth']);
    draft = withLevelUpWeaponMasteries(draft, ROGUE_ID, weapons.slice(4));
    draft = withLevelUpLanguages(draft, ['elvish']);
    const complete = getConfirmableLevelUpCandidate(character, draft, contentRegistry);
    expect(complete.ok, complete.ok ? undefined : complete.error.message).toBe(true);
    if (!complete.ok) return;
    expect(complete.value.input.classProgressions.find((entry) => entry.classId === ROGUE_ID)?.skillExpertise)
      .toEqual(['perception', 'stealth']);

    const review = buildLevelUpReview(character, draft, contentRegistry);
    expect(review.ok).toBe(true);
    if (review.ok) expect(review.value.skillExpertise).toEqual(['perception', 'stealth']);
    if (review.ok) expect(review.value.weaponMasteries).toHaveLength(2);
    if (review.ok) expect(review.value.languages).toEqual(['elvish']);
  });
});
