import { beforeEach, describe, expect, it } from 'vitest';
import { BARBARIAN_RAGE_ACTIVE_EFFECT_ID } from '../content/srd/barbarian';
import { FIGHTER_ACTION_SURGE_RESOURCE_ID, FIGHTER_SECOND_WIND_RESOURCE_ID } from '../content/srd/fighter';
import { srdId } from '../content/srd/source';
import type { Character, CharacterClassProgression, CharacterInput, CharacterSpellcastingSelection } from '../models/character';
import type { SpellcastingProviderDefinition } from '../models/content';
import type { ContentId } from '../models/contentId';
import { classProgressionSkillChoiceContext } from '../rules/classProficiencies';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { createFixedHpProgression } from '../rules/health';
import {
  buildLevelUpReview,
  createLevelUpDraft,
  getConfirmableLevelUpCandidate,
  getLevelUpAdvancementChoiceContext,
  getLevelUpCoreChoiceContext,
  getLevelUpSpellcastingChoiceContext,
  withFixedLevelUpHitPoints,
  withLevelUpAddedClassSkills,
  withLevelUpFeatChoiceValue,
  withLevelUpFeatPath,
  withLevelUpSpellcastingCantrip,
  withLevelUpSubclass,
  withLevelUpTarget,
  withRolledLevelUpHitPoints,
  type LevelUpDraft,
} from '../rules/levelUp';
import {
  maximumSelectableSpellLevel,
  spellBelongsToProviderList,
  spellcastingCountAtLevel,
  spellcastingProviderDefinitionsAtLevel,
} from '../rules/spellcasting';
import {
  CHARACTER_STORAGE_KEY,
  createCharacter,
  deleteCharacter,
  getCharacterById,
  updateCharacter,
  updateCharacterPlayState,
} from './characterStorage';
import { contentRegistry } from './contentRegistry';
import { confirmLevelUp } from './levelUpPersistence';
import { loadPlaySessionState, savePlaySessionState } from './playSessionState';
import { completeLevelUpV10Choices, fighterInput } from '../test/fixtures';

const FIGHTER_ID = srdId('class', 'fighter');
const ROGUE_ID = srdId('class', 'rogue');
const CLERIC_ID = srdId('class', 'cleric');
const WIZARD_ID = srdId('class', 'wizard');
const BARBARIAN_ID = srdId('class', 'barbarian');

const CHAMPION_ID = srdId('subclass', 'fighter:champion');
const EVOKER_ID = srdId('subclass', 'wizard:evoker');
const BERSERKER_ID = srdId('subclass', 'barbarian:path-of-the-berserker');

const ASI_ID = srdId('feat', 'ability-score-improvement');
const WIZARD_PROVIDER_ID = srdId('spellcasting-provider', 'wizard:spellcasting');
const DETECT_MAGIC_ID = srdId('spell', 'detect-magic');

function progression(classId: ContentId, level: number, starting: boolean, subclassId?: ContentId): CharacterClassProgression {
  const classContent = contentRegistry.findClass(classId);
  if (!classContent) throw new Error('Missing class ' + classId);
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

function providerDefinition(
  classId: ContentId,
  ownerLevel: number,
  providerId: ContentId,
  subclassId?: ContentId,
): SpellcastingProviderDefinition {
  const classContent = contentRegistry.findClass(classId);
  if (!classContent) throw new Error('Missing class ' + classId);
  const subclass = subclassId ? contentRegistry.findSubclass(subclassId) : undefined;
  const provider = spellcastingProviderDefinitionsAtLevel(classContent, subclass, ownerLevel)
    .find((candidate) => candidate.id === providerId);
  if (!provider) throw new Error('Missing provider ' + providerId);
  return provider;
}

function spellsOnList(spellListId: string, predicate: (level: number) => boolean) {
  return contentRegistry.getAll('spell')
    .filter((spell) => spellBelongsToProviderList(spell, spellListId) && predicate(spell.level))
    .sort((left, right) => left.level - right.level || left.name.localeCompare(right.name));
}

function wizardSelection(ownerLevel: number, concentrationPrepared = false): CharacterSpellcastingSelection {
  const provider = providerDefinition(WIZARD_ID, ownerLevel, WIZARD_PROVIDER_ID, ownerLevel >= 3 ? EVOKER_ID : undefined);
  if (provider.spellManagement.kind !== 'prepared-from-owned') throw new Error('Expected Wizard owned-spell management.');
  const management = provider.spellManagement;
  const cantripIds = spellsOnList(management.spellListId, (level) => level === 0)
    .slice(0, spellcastingCountAtLevel(management.cantripCount, ownerLevel))
    .map((spell) => spell.id);
  const maximum = maximumSelectableSpellLevel(provider, ownerLevel);
  const ownedCandidates = spellsOnList(management.spellListId, (level) => level === management.initialOwnedSpellLevel && level <= maximum);
  const ownedSpellIds = [
    ...(concentrationPrepared ? [DETECT_MAGIC_ID] : []),
    ...ownedCandidates.map((spell) => spell.id).filter((id) => id !== DETECT_MAGIC_ID),
  ].slice(0, management.initialOwnedSpellCount);
  return {
    providerId: provider.id,
    cantripIds,
    ownedSpellIds,
    preparedSpellIds: [concentrationPrepared ? DETECT_MAGIC_ID : ownedSpellIds[0]],
  };
}

function existingFixedDraft(character: Character, classId: ContentId): LevelUpDraft {
  return completeLevelUpV10Choices(character, withFixedLevelUpHitPoints(
    withLevelUpTarget(createLevelUpDraft(character), { kind: 'existing-class', classId }),
  ));
}

function fighterAsiDraft(character: Character): LevelUpDraft {
  let draft = existingFixedDraft(character, FIGHTER_ID);
  const context = getLevelUpAdvancementChoiceContext(character, draft, contentRegistry);
  if (!context.ok || !context.value.featGrant) throw new Error('Expected Fighter feat grant.');
  draft = withLevelUpFeatPath(draft, context.value.featGrant.id, 'ability-score-improvement', ASI_ID);
  draft = withLevelUpFeatChoiceValue(draft, context.value.featGrant.id, 'ability-increase', 0, 'constitution');
  draft = withLevelUpFeatChoiceValue(draft, context.value.featGrant.id, 'ability-increase', 1, 'constitution');
  return draft;
}

function wizardInput(level: number, concentrationPrepared = false): CharacterInput {
  return fighterInput({
    name: 'M15-F Wizard',
    startingClassId: WIZARD_ID,
    classProgressions: [progression(WIZARD_ID, level, true, level >= 3 ? EVOKER_ID : undefined)],
    abilityScores: { intelligence: 14 },
    spellcastingSelections: [wizardSelection(level, concentrationPrepared)],
  });
}

function completeWizardThreeToFourDraft(character: Character): LevelUpDraft {
  let draft = existingFixedDraft(character, WIZARD_ID);
  const advancement = getLevelUpAdvancementChoiceContext(character, draft, contentRegistry);
  if (!advancement.ok || !advancement.value.featGrant) throw new Error('Expected Wizard feat grant.');
  draft = withLevelUpFeatPath(draft, advancement.value.featGrant.id, 'ability-score-improvement', ASI_ID);
  draft = withLevelUpFeatChoiceValue(draft, advancement.value.featGrant.id, 'ability-increase', 0, 'constitution');
  draft = withLevelUpFeatChoiceValue(draft, advancement.value.featGrant.id, 'ability-increase', 1, 'constitution');

  const spellcasting = getLevelUpSpellcastingChoiceContext(character, draft, contentRegistry);
  if (!spellcasting.ok || spellcasting.value.providers.length !== 1) throw new Error('Expected Wizard spellcasting delta.');
  const provider = spellcasting.value.providers[0];
  return withLevelUpSpellcastingCantrip(draft, provider.providerId, provider.legalCantrips[0].id, true);
}

function totalLevel(character: Character): number {
  return character.classProgressions.reduce((total, entry) => total + entry.level, 0);
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('Milestone 15-F Review / Confirm / persistence boundary', () => {
  it('A1/A3 reviews a simple fixed existing-class +1 without fake unchanged entries', () => {
    const character = createCharacter(fighterInput({ level: 1, subclassId: undefined }));
    const draft = existingFixedDraft(character, FIGHTER_ID);
    const review = buildLevelUpReview(character, draft, contentRegistry);

    expect(review).toMatchObject({
      ok: true,
      value: {
        totalLevel: { before: 1, after: 2 },
        classAdvancement: { classId: FIGHTER_ID, kind: 'existing-class', beforeLevel: 1, afterLevel: 2 },
        hitPoints: { method: 'fixed' },
        addedClassSkills: [],
        spellcasting: [],
      },
    });
    if (!review.ok) return;
    expect(review.value.subclass).toBeUndefined();
    expect(review.value.feat).toBeUndefined();
    expect(review.value.hitPoints.maximumAfter).toBeGreaterThan(review.value.hitPoints.maximumBefore);
  });

  it('A4/A5 reviews rolled HP and a newly gained subclass only when they actually changed', () => {
    const character = createCharacter(fighterInput({ level: 2, subclassId: undefined }));
    let draft = withLevelUpTarget(createLevelUpDraft(character), { kind: 'existing-class', classId: FIGHTER_ID });
    draft = withRolledLevelUpHitPoints(draft, 7);
    draft = withLevelUpSubclass(draft, CHAMPION_ID);

    const review = buildLevelUpReview(character, draft, contentRegistry);
    expect(review).toMatchObject({
      ok: true,
      value: {
        classAdvancement: { beforeLevel: 2, afterLevel: 3 },
        hitPoints: { method: 'rolled', roll: 7 },
        subclass: { id: CHAMPION_ID, name: 'Champion' },
      },
    });
  });

  it('A2 reviews a new multiclass and its added-class skill without implying unrelated changes', () => {
    const character = createCharacter(fighterInput({ level: 2, subclassId: undefined, abilityScores: { dexterity: 14 } }));
    let draft = withFixedLevelUpHitPoints(
      withLevelUpTarget(createLevelUpDraft(character), { kind: 'new-class', classId: ROGUE_ID }),
    );
    const core = getLevelUpCoreChoiceContext(character, draft, contentRegistry);
    if (!core.ok) throw new Error(core.error.message);
    const selected = core.value.addedClassSkills.from[0];
    draft = withLevelUpAddedClassSkills(draft, [selected]);
    draft = completeLevelUpV10Choices(character, draft);

    const review = buildLevelUpReview(character, draft, contentRegistry);
    expect(review).toMatchObject({
      ok: true,
      value: {
        totalLevel: { before: 2, after: 3 },
        classAdvancement: { classId: ROGUE_ID, kind: 'new-class', beforeLevel: 0, afterLevel: 1 },
        addedClassSkills: [selected],
        spellcasting: [],
      },
    });
  });

  it('A6/A7 reviews ASI structure and provider-local spellcasting changes', () => {
    const fighter = createCharacter(fighterInput({ level: 3, subclassId: CHAMPION_ID }));
    const asi = buildLevelUpReview(fighter, fighterAsiDraft(fighter), contentRegistry);
    expect(asi).toMatchObject({
      ok: true,
      value: {
        feat: {
          id: ASI_ID,
          path: 'ability-score-improvement',
          abilityChoices: ['constitution', 'constitution'],
        },
      },
    });

    window.localStorage.clear();
    const wizard = createCharacter(wizardInput(3));
    const wizardDraft = completeWizardThreeToFourDraft(wizard);
    const spellReview = buildLevelUpReview(wizard, wizardDraft, contentRegistry);
    expect(spellReview).toMatchObject({
      ok: true,
      value: {
        spellcasting: [{
          providerId: WIZARD_PROVIDER_ID,
          providerName: 'Wizard Spellcasting',
          ownerLabel: 'Wizard',
          addedCantrips: [expect.objectContaining({ id: expect.any(String) })],
          addedOwnedSpells: [],
        }],
      },
    });
  });

  it('B1/B2/B3/B11 confirms exactly one +1 advancement and persists no draft record', () => {
    const character = createCharacter(fighterInput({ level: 1, subclassId: undefined }));
    const draft = existingFixedDraft(character, FIGHTER_ID);
    const rawBefore = window.localStorage.getItem(CHARACTER_STORAGE_KEY);

    expect(getConfirmableLevelUpCandidate(character, draft, contentRegistry)).toMatchObject({ ok: true });
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(rawBefore);

    const first = confirmLevelUp(draft);
    expect(first).toMatchObject({ ok: true });
    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v10');
    const persisted = getCharacterById(character.id)!;
    expect(totalLevel(persisted)).toBe(2);
    expect(persisted.updatedAt).not.toBe(character.updatedAt);
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).not.toContain('sourceUpdatedAt');

    const second = confirmLevelUp(draft);
    expect(second).toMatchObject({ ok: false, error: { code: 'stale-source' } });
    expect(totalLevel(getCharacterById(character.id)!)).toBe(2);
  });

  it('B5/B6 rejects incomplete or invalid confirmation before persistence', () => {
    const character = createCharacter(fighterInput({ level: 1, subclassId: undefined }));
    const raw = window.localStorage.getItem(CHARACTER_STORAGE_KEY)!;
    const incomplete = withLevelUpTarget(createLevelUpDraft(character), { kind: 'existing-class', classId: FIGHTER_ID });
    expect(confirmLevelUp(incomplete)).toMatchObject({
      ok: false,
      error: { code: 'invalid-candidate', cause: { code: 'incomplete-level-up' } },
    });
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(raw);

    const forged = { ...existingFixedDraft(character, FIGHTER_ID), target: { kind: 'new-class' as const, classId: FIGHTER_ID } };
    expect(confirmLevelUp(forged)).toMatchObject({ ok: false, error: { code: 'invalid-candidate' } });
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(raw);
  });

  it('B7 keeps the level-20 boundary closed at final confirmability', () => {
    const character = createCharacter(fighterInput({ level: 20, subclassId: CHAMPION_ID }));
    const draft = withFixedLevelUpHitPoints(
      withLevelUpTarget(createLevelUpDraft(character), { kind: 'existing-class', classId: FIGHTER_ID }),
    );
    expect(getConfirmableLevelUpCandidate(character, draft, contentRegistry)).toMatchObject({
      ok: false,
      error: { code: 'level-cap' },
    });
  });

  it('B8/B10 stale source fails closed without Character or session mutation', () => {
    const character = createCharacter(fighterInput({ level: 1, subclassId: undefined }));
    const draft = existingFixedDraft(character, FIGHTER_ID);
    savePlaySessionState(character.id, { conditions: ['poisoned'], activeEffectIds: [] });

    const changed = updateCharacter(character.id, { ...fighterInput({ level: 1, subclassId: undefined }), name: 'Changed Elsewhere' })!;
    const characterRaw = window.localStorage.getItem(CHARACTER_STORAGE_KEY);
    const sessionRaw = window.sessionStorage.getItem('dnd3.play-session.v1:' + encodeURIComponent(character.id));

    expect(confirmLevelUp(draft)).toMatchObject({ ok: false, error: { code: 'stale-source' } });
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(characterRaw);
    expect(window.sessionStorage.getItem('dnd3.play-session.v1:' + encodeURIComponent(character.id))).toBe(sessionRaw);
    expect(getCharacterById(character.id)?.updatedAt).toBe(changed.updatedAt);
  });

  it('B9 missing source fails closed without creating a replacement Character or touching session state', () => {
    const character = createCharacter(fighterInput({ level: 1, subclassId: undefined }));
    const draft = existingFixedDraft(character, FIGHTER_ID);
    savePlaySessionState(character.id, { conditions: ['prone'], activeEffectIds: [] });
    deleteCharacter(character.id);
    const localBefore = window.localStorage.getItem(CHARACTER_STORAGE_KEY);
    const sessionBefore = JSON.stringify(loadPlaySessionState(character.id));

    expect(confirmLevelUp(draft)).toMatchObject({ ok: false, error: { code: 'missing-source' } });
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(localBefore);
    expect(JSON.stringify(loadPlaySessionState(character.id))).toBe(sessionBefore);
  });

  it('C1/C2/C3/C6 confirms without free healing/refill and initializes only genuinely new Fighter resources/Hit Dice', () => {
    let character = createCharacter(fighterInput({ level: 1, subclassId: undefined }));
    character = updateCharacterPlayState(character.id, {
      ...character.playState,
      currentHp: Math.max(1, character.playState.currentHp - 5),
      temporaryHp: 4,
      hitDiceRemaining: {},
      resourceUses: { ...character.playState.resourceUses, [FIGHTER_SECOND_WIND_RESOURCE_ID]: 0 },
    })!;
    const hpBefore = character.playState.currentHp;
    const draft = existingFixedDraft(character, FIGHTER_ID);

    const committed = confirmLevelUp(draft);
    expect(committed).toMatchObject({ ok: true });
    const updated = getCharacterById(character.id)!;
    expect(updated.playState.currentHp).toBe(hpBefore);
    expect(updated.playState.temporaryHp).toBe(4);
    expect(updated.playState.resourceUses[FIGHTER_SECOND_WIND_RESOURCE_ID]).toBe(0);
    expect(updated.playState.resourceUses[FIGHTER_ACTION_SURGE_RESOURCE_ID]).toBe(1);
    expect(updated.playState.hitDiceRemaining).toEqual({ 10: 1 });
  });

  it('C4/C5/C8 confirms Wizard slot advancement without refilling spent slots and preserves valid condition/concentration', () => {
    let character = createCharacter(wizardInput(4, true));
    const beforeDerived = deriveCharacterState(character, contentRegistry);
    if (!beforeDerived.ok) throw new Error(beforeDerived.error.message);
    const wizardBefore = beforeDerived.value.spellcasting.find((provider) => provider.id === WIZARD_PROVIDER_ID)!;
    const level1 = wizardBefore.slotPool!.slots.find((slot) => slot.spellLevel === 1)!;

    character = updateCharacterPlayState(character.id, {
      ...character.playState,
      resourceUses: { ...character.playState.resourceUses, [level1.resourceId]: 0 },
    })!;
    savePlaySessionState(character.id, {
      conditions: ['poisoned'],
      concentration: { providerId: WIZARD_PROVIDER_ID, spellId: DETECT_MAGIC_ID },
      activeEffectIds: [],
    });
    const draft = existingFixedDraft(character, WIZARD_ID);
    expect(confirmLevelUp(draft)).toMatchObject({ ok: true });

    const updated = getCharacterById(character.id)!;
    const afterDerived = deriveCharacterState(updated, contentRegistry);
    if (!afterDerived.ok) throw new Error(afterDerived.error.message);
    const wizardAfter = afterDerived.value.spellcasting.find((provider) => provider.id === WIZARD_PROVIDER_ID)!;
    const level3 = wizardAfter.slotPool!.slots.find((slot) => slot.spellLevel === 3)!;
    expect(updated.playState.resourceUses[level1.resourceId]).toBe(0);
    expect(updated.playState.resourceUses[level3.resourceId]).toBe(level3.maximumUses);
    expect(loadPlaySessionState(character.id)).toEqual({
      conditions: ['poisoned'],
      concentration: { providerId: WIZARD_PROVIDER_ID, spellId: DETECT_MAGIC_ID },
      activeEffectIds: [],
    });
  });

  it('C6/D2 preserves spent multiclass Hit Dice by die size while adding the new class at level 1', () => {
    let character = createCharacter(fighterInput({ level: 4, subclassId: CHAMPION_ID, abilityScores: { dexterity: 14 } }));
    character = updateCharacterPlayState(character.id, {
      ...character.playState,
      hitDiceRemaining: { 10: 2 },
    })!;
    let draft = withFixedLevelUpHitPoints(
      withLevelUpTarget(createLevelUpDraft(character), { kind: 'new-class', classId: ROGUE_ID }),
    );
    const core = getLevelUpCoreChoiceContext(character, draft, contentRegistry);
    if (!core.ok) throw new Error(core.error.message);
    draft = withLevelUpAddedClassSkills(draft, [core.value.addedClassSkills.from[0]]);
    draft = completeLevelUpV10Choices(character, draft);

    expect(confirmLevelUp(draft)).toMatchObject({ ok: true });
    const updated = getCharacterById(character.id)!;
    expect(updated.startingClassId).toBe(FIGHTER_ID);
    expect(updated.classProgressions.find((entry) => entry.classId === ROGUE_ID)?.level).toBe(1);
    expect(updated.playState.hitDiceRemaining).toEqual({ 8: 1, 10: 2 });
  });

  it('C8/C9/C10 preserves valid active effects, conditions, and unrelated session state through confirmation', () => {
    let character = createCharacter(fighterInput({
      name: 'M15-F Barbarian',
      startingClassId: BARBARIAN_ID,
      classProgressions: [progression(BARBARIAN_ID, 2, true)],
      abilityScores: { strength: 14 },
    }));
    savePlaySessionState(character.id, {
      conditions: ['prone'],
      activeEffectIds: [BARBARIAN_RAGE_ACTIVE_EFFECT_ID],
    });
    let draft = existingFixedDraft(character, BARBARIAN_ID);
    draft = withLevelUpSubclass(draft, BERSERKER_ID);

    expect(confirmLevelUp(draft)).toMatchObject({ ok: true, value: { sessionReconciled: true } });
    expect(loadPlaySessionState(character.id)).toEqual({
      conditions: ['prone'],
      activeEffectIds: [BARBARIAN_RAGE_ACTIVE_EFFECT_ID],
    });
    character = getCharacterById(character.id)!;
    expect(totalLevel(character)).toBe(3);
  });

  it('D1/D3 confirms an existing-class advancement in reordered multiclass progressions without changing startingClassId', () => {
    const fighter = progression(FIGHTER_ID, 2, true);
    const rogue = progression(ROGUE_ID, 1, false);
    const character = createCharacter(fighterInput({
      startingClassId: FIGHTER_ID,
      classProgressions: [rogue, fighter],
      abilityScores: { dexterity: 14 },
    }));
    let draft = existingFixedDraft(character, FIGHTER_ID);
    draft = withLevelUpSubclass(draft, CHAMPION_ID);

    expect(confirmLevelUp(draft)).toMatchObject({ ok: true });
    const updated = getCharacterById(character.id)!;
    expect(updated.startingClassId).toBe(FIGHTER_ID);
    expect(updated.classProgressions.map((entry) => entry.classId)).toEqual([ROGUE_ID, FIGHTER_ID]);
    expect(updated.classProgressions.find((entry) => entry.classId === FIGHTER_ID)?.level).toBe(3);
  });

  it('D4/E persists completed M15-E provider selections without rewriting Wizard reference-only spellbook history', () => {
    const character = createCharacter(wizardInput(3));
    const beforeOwned = character.spellcastingSelections[0].ownedSpellIds;
    const draft = completeWizardThreeToFourDraft(character);
    const review = buildLevelUpReview(character, draft, contentRegistry);
    if (!review.ok) throw new Error(review.error.message);
    const addedCantrip = review.value.spellcasting[0].addedCantrips[0].id;

    expect(confirmLevelUp(draft)).toMatchObject({ ok: true });
    const updated = getCharacterById(character.id)!;
    const selection = updated.spellcastingSelections.find((entry) => entry.providerId === WIZARD_PROVIDER_ID)!;
    expect(selection.cantripIds).toContain(addedCantrip);
    expect(selection.ownedSpellIds).toEqual(beforeOwned);
  });

  it('D4/E confirms Wizard spellcasting advancement inside a multiclass Character while shared slots remain capacity-only', () => {
    const character = createCharacter(fighterInput({
      name: 'M15-F Cleric Wizard',
      startingClassId: CLERIC_ID,
      classProgressions: [
        progression(CLERIC_ID, 2, true),
        progression(WIZARD_ID, 3, false, EVOKER_ID),
      ],
      abilityScores: { wisdom: 14, intelligence: 14 },
      spellcastingSelections: [wizardSelection(3)],
    }));
    const ownedBefore = character.spellcastingSelections[0].ownedSpellIds;
    const draft = completeWizardThreeToFourDraft(character);

    expect(confirmLevelUp(draft)).toMatchObject({ ok: true });
    const updated = getCharacterById(character.id)!;
    expect(updated.startingClassId).toBe(CLERIC_ID);
    expect(updated.classProgressions.find((entry) => entry.classId === WIZARD_ID)?.level).toBe(4);

    const selection = updated.spellcastingSelections.find((entry) => entry.providerId === WIZARD_PROVIDER_ID)!;
    expect(selection.cantripIds).toHaveLength(4);
    expect(selection.ownedSpellIds).toEqual(ownedBefore);

    const state = deriveCharacterState(updated, contentRegistry);
    if (!state.ok) throw new Error(state.error.message);
    expect(state.value.ordinaryMulticlassCasterLevel).toBe(6);
    expect(state.value.ordinaryMulticlassSlotPool?.slots.some((slot) => slot.spellLevel === 3)).toBe(true);
    const wizardProvider = state.value.spellcasting.find((provider) => provider.id === WIZARD_PROVIDER_ID)!;
    expect(wizardProvider.owner).toMatchObject({ kind: 'class', classId: WIZARD_ID, level: 4 });
    expect(maximumSelectableSpellLevel(providerDefinition(WIZARD_ID, 4, WIZARD_PROVIDER_ID, EVOKER_ID), 4)).toBe(2);
  });

  it('atomicity limitation is explicit: a session-cache write failure does not turn an already committed Character into a retryable failure', () => {
    const character = createCharacter(fighterInput({ level: 1, subclassId: undefined }));
    const draft = existingFixedDraft(character, FIGHTER_ID);
    const throwingSessionStorage: Storage = {
      get length() { return 1; },
      clear() {},
      getItem() { return JSON.stringify({ conditions: [], activeEffectIds: ['homebrew:missing:active-effect'] }); },
      key() { return 'dnd3.play-session.v1:' + encodeURIComponent(character.id); },
      removeItem() {},
      setItem() { throw new Error('session unavailable'); },
    };

    const result = confirmLevelUp(draft, window.localStorage, throwingSessionStorage, contentRegistry);
    expect(result).toMatchObject({ ok: true, value: { sessionReconciled: false } });
    expect(totalLevel(getCharacterById(character.id)!)).toBe(2);
  });
});
