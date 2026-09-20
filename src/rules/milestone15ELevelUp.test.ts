import { describe, expect, it } from 'vitest';
import { SRD_CONTENT, srdId } from '../content/srd';
import type { Character, CharacterClassProgression, CharacterInput, CharacterSpellcastingSelection } from '../models/character';
import type { ClassContent, SpellcastingProviderDefinition, SubclassContent } from '../models/content';
import type { ContentId } from '../models/contentId';
import { ContentRegistry, contentRegistry } from '../services/contentRegistry';
import { fighterCharacter } from '../test/fixtures';
import { classProgressionSkillChoiceContext } from './classProficiencies';
import { deriveCharacterState } from './deriveCharacter';
import { createFixedHpProgression } from './health';
import {
  buildLevelUpCandidate,
  createLevelUpDraft,
  getLevelUpSpellcastingChoiceContext,
  withFixedLevelUpHitPoints,
  withLevelUpFeatChoiceValue,
  withLevelUpFeatPath,
  withLevelUpSpellcastingCantrip,
  withLevelUpSpellcastingOwnedSpell,
  withLevelUpSpellcastingReplacement,
  withLevelUpSubclass,
  withLevelUpTarget,
  type LevelUpSpellcastingChoiceContext,
} from './levelUp';
import {
  maximumSelectableSpellLevel,
  spellBelongsToProviderList,
  spellcastingCountAtLevel,
  spellcastingProviderDefinitionsAtLevel,
} from './spellcasting';

const FIGHTER_ID = srdId('class', 'fighter');
const CLERIC_ID = srdId('class', 'cleric');
const BARD_ID = srdId('class', 'bard');
const PALADIN_ID = srdId('class', 'paladin');
const WIZARD_ID = srdId('class', 'wizard');
const WARLOCK_ID = srdId('class', 'warlock');

const EVOKER_ID = srdId('subclass', 'wizard:evoker');
const LIFE_ID = srdId('subclass', 'cleric:life-domain');
const DEVOTION_ID = srdId('subclass', 'paladin:oath-of-devotion');
const FIEND_ID = srdId('subclass', 'warlock:fiend-patron');

const WIZARD_PROVIDER_ID = srdId('spellcasting-provider', 'wizard:spellcasting');
const CLERIC_PROVIDER_ID = srdId('spellcasting-provider', 'cleric:spellcasting');
const BARD_PROVIDER_ID = srdId('spellcasting-provider', 'bard:spellcasting');
const PALADIN_PROVIDER_ID = srdId('spellcasting-provider', 'paladin:spellcasting');
const WARLOCK_PROVIDER_ID = srdId('spellcasting-provider', 'warlock:pact-magic');
const ASI_ID = srdId('feat', 'ability-score-improvement');

const SOURCE = { type: 'homebrew', namespace: 'm15-e' } as const;

function progression(
  classId: ContentId,
  level: number,
  starting: boolean,
  registry: ContentRegistry = contentRegistry,
  subclassId?: ContentId,
): CharacterClassProgression {
  const classContent = registry.findClass(classId);
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

function providerDefinition(
  classId: ContentId,
  ownerLevel: number,
  providerId: ContentId,
  registry: ContentRegistry = contentRegistry,
  subclassId?: ContentId,
): SpellcastingProviderDefinition {
  const classContent = registry.findClass(classId);
  if (!classContent) throw new Error(`Missing class ${classId}`);
  const subclass = subclassId ? registry.findSubclass(subclassId) : undefined;
  const provider = spellcastingProviderDefinitionsAtLevel(classContent, subclass, ownerLevel)
    .find((candidate) => candidate.id === providerId);
  if (!provider) throw new Error(`Missing provider ${providerId}`);
  return provider;
}

function spellsOnList(spellListId: string, predicate: (level: number) => boolean, registry: ContentRegistry = contentRegistry) {
  return registry.getAll('spell')
    .filter((spell) => spellBelongsToProviderList(spell, spellListId) && predicate(spell.level))
    .sort((left, right) => left.level - right.level || left.name.localeCompare(right.name));
}

function selectionFor(
  provider: SpellcastingProviderDefinition,
  ownerLevel: number,
  registry: ContentRegistry = contentRegistry,
): CharacterSpellcastingSelection {
  const management = provider.spellManagement;
  if (management.kind === 'granted-only') {
    return { providerId: provider.id, cantripIds: [], ownedSpellIds: [], preparedSpellIds: [] };
  }
  const cantripCount = spellcastingCountAtLevel(management.cantripCount, ownerLevel);
  const cantripIds = spellsOnList(management.spellListId, (level) => level === 0, registry)
    .slice(0, cantripCount)
    .map((spell) => spell.id);
  const maximum = maximumSelectableSpellLevel(provider, ownerLevel);
  if (management.kind === 'prepared-from-list') {
    const prepared = spellsOnList(management.spellListId, (level) => level > 0 && level <= maximum, registry)[0];
    return {
      providerId: provider.id,
      cantripIds,
      ownedSpellIds: [],
      preparedSpellIds: prepared ? [prepared.id] : [],
    };
  }
  const ownedSpellIds = spellsOnList(
    management.spellListId,
    (level) => level === management.initialOwnedSpellLevel && level <= maximum,
    registry,
  ).slice(0, management.initialOwnedSpellCount).map((spell) => spell.id);
  return {
    providerId: provider.id,
    cantripIds,
    ownedSpellIds,
    preparedSpellIds: ownedSpellIds.slice(0, 1),
  };
}

function existingDraft(character: Character, classId: ContentId) {
  return withFixedLevelUpHitPoints(
    withLevelUpTarget(createLevelUpDraft(character), { kind: 'existing-class', classId }),
  );
}

function newClassDraft(character: Character, classId: ContentId) {
  return withFixedLevelUpHitPoints(
    withLevelUpTarget(createLevelUpDraft(character), { kind: 'new-class', classId }),
  );
}

function completeRequiredProviderChoices(
  draft: ReturnType<typeof createLevelUpDraft>,
  context: LevelUpSpellcastingChoiceContext,
) {
  let next = draft;
  for (const provider of context.providers) {
    for (const spell of provider.legalCantrips.slice(0, provider.requiredCantripAdditions)) {
      next = withLevelUpSpellcastingCantrip(next, provider.providerId, spell.id, true);
    }
    for (const spell of provider.legalOwnedSpells.slice(0, provider.requiredOwnedSpellAdditions)) {
      next = withLevelUpSpellcastingOwnedSpell(next, provider.providerId, spell.id, true);
    }
  }
  return next;
}

function derived(character: Character, input: CharacterInput, registry: ContentRegistry = contentRegistry) {
  const state = deriveCharacterState({
    ...input,
    id: character.id,
    playState: character.playState,
    createdAt: character.createdAt,
    updatedAt: character.updatedAt,
  }, registry);
  if (!state.ok) throw new Error(state.error.message);
  return state.value;
}

function independentOwnedProvider(): SpellcastingProviderDefinition {
  return {
    id: 'homebrew:m15-e:spellcasting-provider:independent',
    name: 'Independent Casting',
    spellcastingAbility: { kind: 'fixed', ability: 'intelligence' },
    multiclassSlotContribution: { kind: 'independent' },
    spellManagement: {
      kind: 'prepared-from-owned',
      spellListId: 'wizard',
      cantripCount: [{ level: 1, count: 1 }, { level: 2, count: 2 }],
      preparedSpellCount: [{ level: 1, count: 1 }],
      replacement: 'long-rest-any',
      initialOwnedSpellCount: 2,
      initialOwnedSpellLevel: 1,
    },
    slotPool: {
      id: 'homebrew:m15-e:spell-slot-pool:independent',
      name: 'Independent Slots',
      slotLevels: [{ spellLevel: 1, resourceId: 'homebrew:m15-e:spell-slot:independent:1', name: 'Independent Level 1 Slots' }],
      progression: [
        { level: 1, slots: [{ spellLevel: 1, maximum: 2 }] },
        { level: 2, slots: [{ spellLevel: 1, maximum: 3 }] },
      ],
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
    ritualCasting: 'owned',
  };
}

function syntheticClass(provider: SpellcastingProviderDefinition): ClassContent {
  const classId = 'homebrew:m15-e:class:independent-adept';
  return {
    id: classId,
    kind: 'class',
    name: 'Independent Adept',
    source: SOURCE,
    hitDie: 8,
    fixedHitPointsPerLevel: 5,
    primaryAbility: { mode: 'one-of', abilities: ['intelligence'] },
    multiclassProficiencies: { weaponProficiencies: [], armorTraining: [], toolProficiencies: [] },
    savingThrowProficiencies: ['intelligence', 'wisdom'],
    weaponProficiencies: [{ kind: 'category', category: 'simple' }],
    armorTraining: [],
    toolProficiencies: [],
    skillChoices: { choose: 2, from: ['arcana', 'history', 'investigation'] },
    startingEquipment: [{ id: 'A', items: [], currency: { amount: 10, unit: 'gp' } }],
    progression: Array.from({ length: 20 }, (_, index) => {
      const level = index + 1;
      return {
        level,
        proficiencyBonus: level >= 17 ? 6 : level >= 13 ? 5 : level >= 9 ? 4 : level >= 5 ? 3 : 2,
        features: level === 1 ? [{
          id: 'homebrew:m15-e:class-feature:independent-spellcasting',
          name: 'Independent Spellcasting',
          description: 'Synthetic provider fixture.',
          effects: [],
          spellcasting: [provider],
          referenceEffects: [],
        }] : [],
      };
    }),
    resources: [],
  };
}

function subclassOwnedProvider(): SpellcastingProviderDefinition {
  return {
    id: 'homebrew:m15-e:spellcasting-provider:fighter-subclass',
    name: 'Subclass Casting',
    spellcastingAbility: { kind: 'fixed', ability: 'intelligence' },
    multiclassSlotContribution: { kind: 'independent' },
    spellManagement: {
      kind: 'prepared-from-owned',
      spellListId: 'wizard',
      cantripCount: [{ level: 3, count: 1 }],
      preparedSpellCount: [{ level: 3, count: 1 }],
      replacement: 'long-rest-any',
      initialOwnedSpellCount: 2,
      initialOwnedSpellLevel: 1,
    },
    slotPool: {
      id: 'homebrew:m15-e:spell-slot-pool:fighter-subclass',
      name: 'Subclass Slots',
      slotLevels: [{ spellLevel: 1, resourceId: 'homebrew:m15-e:spell-slot:fighter-subclass:1', name: 'Subclass Level 1 Slots' }],
      progression: [{ level: 3, slots: [{ spellLevel: 1, maximum: 2 }] }],
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
    ritualCasting: 'owned',
  };
}

function syntheticSubclass(provider: SpellcastingProviderDefinition): SubclassContent {
  return {
    id: 'homebrew:m15-e:subclass:fighter-caster',
    kind: 'subclass',
    name: 'Fighter Caster',
    source: SOURCE,
    parentClassId: FIGHTER_ID,
    acquisitionLevel: 3,
    description: 'Synthetic subclass-owned provider fixture.',
    progression: [{
      level: 3,
      features: [{
        id: 'homebrew:m15-e:subclass-feature:fighter-caster:spellcasting',
        name: 'Subclass Casting',
        description: 'Synthetic subclass-owned provider.',
        effects: [],
        spellcasting: [provider],
        referenceEffects: [],
      }],
    }],
  };
}

describe('Milestone 15-E transactional spellcasting advancement', () => {
  it('A invents no spellcasting choice for a non-spellcasting Fighter level', () => {
    const character = fighterCharacter({ level: 1, subclassId: undefined });
    const draft = existingDraft(character, FIGHTER_ID);
    const context = getLevelUpSpellcastingChoiceContext(character, draft, contentRegistry);
    expect(context).toMatchObject({ ok: true, value: { providers: [] } });
    expect(buildLevelUpCandidate(character, draft, contentRegistry)).toMatchObject({ ok: true, value: { incompleteChoices: [] } });
  });

  it('B does not force preparation merely because a prepared-from-list provider gains capacity', () => {
    const provider = providerDefinition(CLERIC_ID, 1, CLERIC_PROVIDER_ID);
    const character = fighterCharacter({
      startingClassId: CLERIC_ID,
      classProgressions: [progression(CLERIC_ID, 1, true)],
      abilityScores: { wisdom: 14 },
      spellcastingSelections: [selectionFor(provider, 1)],
    });
    const draft = existingDraft(character, CLERIC_ID);
    const context = getLevelUpSpellcastingChoiceContext(character, draft, contentRegistry);
    expect(context).toMatchObject({ ok: true, value: { providers: [] } });
    const candidate = buildLevelUpCandidate(character, draft, contentRegistry);
    expect(candidate).toMatchObject({ ok: true });
    if (candidate.ok) expect(candidate.value.input.spellcastingSelections).toEqual([selectionFor(provider, 1)]);
  });

  it('C requires only the Wizard 3 -> 4 cantrip delta and preserves existing provider selections', () => {
    const provider = providerDefinition(WIZARD_ID, 3, WIZARD_PROVIDER_ID);
    const sourceSelection = selectionFor(provider, 3);
    const character = fighterCharacter({
      startingClassId: WIZARD_ID,
      classProgressions: [progression(WIZARD_ID, 3, true, contentRegistry, EVOKER_ID)],
      abilityScores: { intelligence: 14 },
      spellcastingSelections: [sourceSelection],
    });
    const draft = existingDraft(character, WIZARD_ID);
    const context = getLevelUpSpellcastingChoiceContext(character, draft, contentRegistry);
    if (!context.ok) throw new Error(context.error.message);
    expect(context.value.providers).toHaveLength(1);
    const wizard = context.value.providers[0];
    expect(wizard).toMatchObject({
      providerId: WIZARD_PROVIDER_ID,
      previousOwnerLevel: 3,
      nextOwnerLevel: 4,
      requiredCantripAdditions: 1,
      requiredOwnedSpellAdditions: 0,
      maximumSpellLevel: 2,
    });
    expect(wizard.currentSelection).toEqual(sourceSelection);

    const incomplete = buildLevelUpCandidate(character, draft, contentRegistry);
    expect(incomplete).toMatchObject({
      ok: true,
      value: { incompleteChoices: expect.arrayContaining([expect.objectContaining({ kind: 'spellcasting-provider', providerId: WIZARD_PROVIDER_ID, requiredCantrips: 1 })]) },
    });

    const chosen = withLevelUpSpellcastingCantrip(draft, WIZARD_PROVIDER_ID, wizard.legalCantrips[0].id, true);
    const candidate = buildLevelUpCandidate(character, chosen, contentRegistry);
    expect(candidate).toMatchObject({ ok: true });
    if (!candidate.ok) return;
    const selection = candidate.value.input.spellcastingSelections.find((entry) => entry.providerId === WIZARD_PROVIDER_ID)!;
    expect(selection.cantripIds).toEqual([...sourceSelection.cantripIds, wizard.legalCantrips[0].id]);
    expect(selection.ownedSpellIds).toEqual(sourceSelection.ownedSpellIds);
    expect(selection.preparedSpellIds).toEqual(sourceSelection.preparedSpellIds);

    const clericCantrip = spellsOnList('cleric', (level) => level === 0).find((spell) => !spellBelongsToProviderList(spell, 'wizard'));
    if (!clericCantrip) throw new Error('Need provider-local invalid cantrip fixture.');
    const invalid = buildLevelUpCandidate(
      character,
      withLevelUpSpellcastingCantrip(draft, WIZARD_PROVIDER_ID, clericCantrip.id, true),
      contentRegistry,
    );
    expect(invalid).toMatchObject({ ok: false, error: { code: 'invalid-spellcasting-choice' } });
  });

  it('D leaves Wizard post-level spellbook additions deferred because no machine-readable owned-spell progression exists', () => {
    const provider = providerDefinition(WIZARD_ID, 1, WIZARD_PROVIDER_ID);
    const character = fighterCharacter({
      startingClassId: WIZARD_ID,
      classProgressions: [progression(WIZARD_ID, 1, true)],
      abilityScores: { intelligence: 14 },
      spellcastingSelections: [selectionFor(provider, 1)],
    });
    const context = getLevelUpSpellcastingChoiceContext(character, existingDraft(character, WIZARD_ID), contentRegistry);
    expect(context).toMatchObject({ ok: true, value: { providers: [] } });
  });

  it('E initializes a newly multiclassed Wizard provider locally at level 1 despite higher combined ordinary slot capacity', () => {
    const character = fighterCharacter({
      startingClassId: CLERIC_ID,
      classProgressions: [progression(CLERIC_ID, 3, true, contentRegistry, LIFE_ID)],
      abilityScores: { wisdom: 14, intelligence: 14 },
      spellcastingSelections: [],
    });
    let draft = newClassDraft(character, WIZARD_ID);
    const context = getLevelUpSpellcastingChoiceContext(character, draft, contentRegistry);
    if (!context.ok) throw new Error(context.error.message);
    expect(context.value.providers).toHaveLength(1);
    const wizard = context.value.providers[0];
    expect(wizard).toMatchObject({
      providerId: WIZARD_PROVIDER_ID,
      nextOwnerLevel: 1,
      requiredCantripAdditions: 3,
      requiredOwnedSpellAdditions: 6,
      ownedSpellRequiredLevel: 1,
      maximumSpellLevel: 1,
      contributionKind: 'spellcasting',
    });
    expect(wizard.legalOwnedSpells.every((spell) => spell.level === 1)).toBe(true);

    draft = completeRequiredProviderChoices(draft, context.value);
    const candidate = buildLevelUpCandidate(character, draft, contentRegistry);
    expect(candidate).toMatchObject({ ok: true, value: { incompleteChoices: [] } });
    if (!candidate.ok) return;
    const state = derived(character, candidate.value.input);
    expect(state.ordinaryMulticlassCasterLevel).toBe(4);
    expect(state.ordinaryMulticlassSlotPool?.slots.some((slot) => slot.spellLevel === 2)).toBe(true);
    const derivedWizard = state.spellcasting.find((entry) => entry.id === WIZARD_PROVIDER_ID)!;
    expect(derivedWizard.owner).toMatchObject({ kind: 'class', classId: WIZARD_ID, level: 1 });
    expect(derivedWizard.management.kind).toBe('prepared-from-owned');
    if (derivedWizard.management.kind === 'prepared-from-owned') {
      expect(derivedWizard.management.ownedSpells.every((spell) => spell.level === 1)).toBe(true);
    }
  });

  it('F keeps combined ordinary slot capacity separate from Cleric and Wizard provider-local access', () => {
    const wizard = providerDefinition(WIZARD_ID, 2, WIZARD_PROVIDER_ID);
    const cleric = providerDefinition(CLERIC_ID, 3, CLERIC_PROVIDER_ID, contentRegistry, LIFE_ID);
    expect(maximumSelectableSpellLevel(wizard, 2)).toBe(1);
    expect(maximumSelectableSpellLevel(cleric, 3)).toBe(2);

    const character = fighterCharacter({
      startingClassId: CLERIC_ID,
      classProgressions: [
        progression(CLERIC_ID, 3, true, contentRegistry, LIFE_ID),
        progression(WIZARD_ID, 2, false),
      ],
      abilityScores: { wisdom: 14, intelligence: 14 },
      spellcastingSelections: [selectionFor(cleric, 3), selectionFor(wizard, 2)],
    });
    const state = derived(character, character);
    expect(state.ordinaryMulticlassCasterLevel).toBe(5);
    expect(state.ordinaryMulticlassSlotPool?.slots.some((slot) => slot.spellLevel === 3)).toBe(true);
    const wizardState = state.spellcasting.find((entry) => entry.id === WIZARD_PROVIDER_ID)!;
    expect(wizardState.management.kind).toBe('prepared-from-owned');
    if (wizardState.management.kind === 'prepared-from-owned') {
      expect(wizardState.management.catalogSpells.some((spell) => spell.level === 3)).toBe(true);
      expect(wizardState.management.ownedSpells.every((spell) => spell.level <= 1)).toBe(true);
    }
  });

  it('G preserves Pact ownership and requests only Warlock provider-local cantrip delta at 3 -> 4', () => {
    const provider = providerDefinition(WARLOCK_ID, 3, WARLOCK_PROVIDER_ID, contentRegistry, FIEND_ID);
    const character = fighterCharacter({
      startingClassId: WARLOCK_ID,
      classProgressions: [progression(WARLOCK_ID, 3, true, contentRegistry, FIEND_ID)],
      abilityScores: { charisma: 14 },
      spellcastingSelections: [selectionFor(provider, 3)],
    });
    const context = getLevelUpSpellcastingChoiceContext(character, existingDraft(character, WARLOCK_ID), contentRegistry);
    if (!context.ok) throw new Error(context.error.message);
    expect(context.value.providers).toHaveLength(1);
    expect(context.value.providers[0]).toMatchObject({
      providerId: WARLOCK_PROVIDER_ID,
      contributionKind: 'pact-magic',
      previousOwnerLevel: 3,
      nextOwnerLevel: 4,
      requiredCantripAdditions: 1,
      requiredOwnedSpellAdditions: 0,
      maximumSpellLevel: 2,
    });
    expect(context.value.providers[0].legalCantrips.every((spell) => spellBelongsToProviderList(contentRegistry.findSpell(spell.id)!, 'warlock'))).toBe(true);
  });

  it('H keeps a generic independent provider isolated while resolving its cantrip delta', () => {
    const provider = independentOwnedProvider();
    const classContent = syntheticClass(provider);
    const registry = new ContentRegistry(SRD_CONTENT, [classContent]);
    const character = fighterCharacter({
      startingClassId: classContent.id,
      classProgressions: [progression(classContent.id, 1, true, registry)],
      abilityScores: { intelligence: 14 },
      spellcastingSelections: [selectionFor(provider, 1, registry)],
    });
    let draft = existingDraft(character, classContent.id);
    const context = getLevelUpSpellcastingChoiceContext(character, draft, registry);
    if (!context.ok) throw new Error(context.error.message);
    expect(context.value.providers[0]).toMatchObject({
      providerId: provider.id,
      contributionKind: 'independent',
      requiredCantripAdditions: 1,
    });
    draft = withLevelUpSpellcastingCantrip(draft, provider.id, context.value.providers[0].legalCantrips[0].id, true);
    const candidate = buildLevelUpCandidate(character, draft, registry);
    expect(candidate).toMatchObject({ ok: true, value: { incompleteChoices: [] } });
    if (!candidate.ok) return;
    const state = derived(character, candidate.value.input, registry);
    const independent = state.spellcasting.find((entry) => entry.id === provider.id)!;
    expect(independent.multiclassSlotContribution).toEqual({ kind: 'independent' });
    expect(independent.slotPool?.id).toBe(provider.slotPool?.id);
    expect(state.ordinaryMulticlassSlotPool).toBeUndefined();
  });

  it('I derives a newly granted spell automatically without consuming manual selection capacity', () => {
    const provider = providerDefinition(PALADIN_ID, 4, PALADIN_PROVIDER_ID, contentRegistry, DEVOTION_ID);
    const sourceSelection = selectionFor(provider, 4);
    const character = fighterCharacter({
      startingClassId: PALADIN_ID,
      classProgressions: [progression(PALADIN_ID, 4, true, contentRegistry, DEVOTION_ID)],
      abilityScores: { strength: 14, charisma: 14 },
      spellcastingSelections: [sourceSelection],
    });
    const draft = existingDraft(character, PALADIN_ID);
    const context = getLevelUpSpellcastingChoiceContext(character, draft, contentRegistry);
    expect(context).toMatchObject({ ok: true, value: { providers: [] } });
    const candidate = buildLevelUpCandidate(character, draft, contentRegistry);
    expect(candidate).toMatchObject({ ok: true });
    if (!candidate.ok) return;
    expect(candidate.value.input.spellcastingSelections[0]).toEqual(sourceSelection);
    const state = derived(character, candidate.value.input);
    const paladin = state.spellcasting.find((entry) => entry.id === PALADIN_PROVIDER_ID)!;
    expect(paladin.spellGrants.map((grant) => grant.spell.id)).toContain(srdId('spell', 'find-steed'));
  });

  it('J supports a generic subclass-owned provider at the parent progression level without position assumptions', () => {
    const provider = subclassOwnedProvider();
    const subclass = syntheticSubclass(provider);
    const registry = new ContentRegistry(SRD_CONTENT, [subclass]);
    const character = fighterCharacter({ level: 2, subclassId: undefined, abilityScores: { intelligence: 14 } });
    let draft = existingDraft(character, FIGHTER_ID);
    draft = withLevelUpSubclass(draft, subclass.id);
    const context = getLevelUpSpellcastingChoiceContext(character, draft, registry);
    if (!context.ok) throw new Error(context.error.message);
    expect(context.value.providers).toHaveLength(1);
    expect(context.value.providers[0]).toMatchObject({
      providerId: provider.id,
      owner: { kind: 'subclass', classId: FIGHTER_ID, subclassId: subclass.id, level: 3 },
      nextOwnerLevel: 3,
      requiredCantripAdditions: 1,
      requiredOwnedSpellAdditions: 2,
      contributionKind: 'independent',
    });
    draft = completeRequiredProviderChoices(draft, context.value);
    const candidate = buildLevelUpCandidate(character, draft, registry);
    expect(candidate).toMatchObject({ ok: true, value: { incompleteChoices: [] } });
  });

  it('K clears stale provider choices when the Step 1 target changes', () => {
    const wizard = providerDefinition(WIZARD_ID, 3, WIZARD_PROVIDER_ID);
    const character = fighterCharacter({
      startingClassId: WIZARD_ID,
      classProgressions: [progression(WIZARD_ID, 3, true, contentRegistry, EVOKER_ID)],
      abilityScores: { intelligence: 14, charisma: 14 },
      spellcastingSelections: [selectionFor(wizard, 3)],
    });
    let draft = existingDraft(character, WIZARD_ID);
    const context = getLevelUpSpellcastingChoiceContext(character, draft, contentRegistry);
    if (!context.ok) throw new Error(context.error.message);
    draft = withLevelUpSpellcastingCantrip(draft, WIZARD_PROVIDER_ID, context.value.providers[0].legalCantrips[0].id, true);
    expect(draft.spellcastingChoices).toHaveLength(1);

    const switched = withLevelUpTarget(draft, { kind: 'new-class', classId: WARLOCK_ID });
    expect(switched).toEqual({
      sourceCharacterId: character.id,
      sourceUpdatedAt: character.updatedAt,
      target: { kind: 'new-class', classId: WARLOCK_ID },
    });
  });

  it('L supports one explicit class-level prepared-spell replacement without making it mandatory', () => {
    const provider = providerDefinition(BARD_ID, 1, BARD_PROVIDER_ID);
    const sourceSelection = selectionFor(provider, 1);
    const character = fighterCharacter({
      startingClassId: BARD_ID,
      classProgressions: [progression(BARD_ID, 1, true)],
      abilityScores: { charisma: 14 },
      spellcastingSelections: [sourceSelection],
    });
    let draft = existingDraft(character, BARD_ID);
    const context = getLevelUpSpellcastingChoiceContext(character, draft, contentRegistry);
    if (!context.ok) throw new Error(context.error.message);
    const bard = context.value.providers[0];
    expect(bard).toMatchObject({
      providerId: BARD_PROVIDER_ID,
      requiredCantripAdditions: 0,
      requiredOwnedSpellAdditions: 0,
      replacement: { policy: 'class-level-one' },
    });
    const noReplacement = buildLevelUpCandidate(character, draft, contentRegistry);
    expect(noReplacement).toMatchObject({ ok: true, value: { incompleteChoices: [] } });

    const outgoing = bard.replacement!.currentPreparedSpells[0].id;
    const incoming = bard.replacement!.legalIncomingSpells.find((spell) => spell.id !== outgoing && !sourceSelection.preparedSpellIds.includes(spell.id));
    if (!incoming) throw new Error('Need legal Bard replacement.');
    draft = withLevelUpSpellcastingReplacement(draft, BARD_PROVIDER_ID, { outgoingSpellId: outgoing, incomingSpellId: incoming.id });
    const replaced = buildLevelUpCandidate(character, draft, contentRegistry);
    expect(replaced).toMatchObject({ ok: true, value: { incompleteChoices: [] } });
    if (!replaced.ok) return;
    expect(replaced.value.input.spellcastingSelections[0].preparedSpellIds).not.toContain(outgoing);
    expect(replaced.value.input.spellcastingSelections[0].preparedSpellIds).toContain(incoming.id);
  });

  it('M is reorder-safe for provider ownership and requirements', () => {
    const cleric = progression(CLERIC_ID, 3, true, contentRegistry, LIFE_ID);
    const wizardProgression = progression(WIZARD_ID, 3, false, contentRegistry, EVOKER_ID);
    const wizard = providerDefinition(WIZARD_ID, 3, WIZARD_PROVIDER_ID);
    const inputSelection = selectionFor(wizard, 3);
    const make = (classProgressions: CharacterClassProgression[]) => fighterCharacter({
      startingClassId: CLERIC_ID,
      classProgressions,
      abilityScores: { wisdom: 14, intelligence: 14 },
      spellcastingSelections: [inputSelection],
    });
    const normal = make([cleric, wizardProgression]);
    const reversed = make([wizardProgression, cleric]);

    for (const character of [normal, reversed]) {
      const context = getLevelUpSpellcastingChoiceContext(character, existingDraft(character, WIZARD_ID), contentRegistry);
      if (!context.ok) throw new Error(context.error.message);
      expect(context.value.providers).toHaveLength(1);
      expect(context.value.providers[0]).toMatchObject({
        providerId: WIZARD_PROVIDER_ID,
        owner: { kind: 'class', classId: WIZARD_ID, level: 4 },
        requiredCantripAdditions: 1,
      });
    }
  });

  it('N preserves the M15-D ASI candidate while resolving M15-E Wizard cantrip advancement', () => {
    const provider = providerDefinition(WIZARD_ID, 3, WIZARD_PROVIDER_ID);
    const character = fighterCharacter({
      startingClassId: WIZARD_ID,
      classProgressions: [progression(WIZARD_ID, 3, true, contentRegistry, EVOKER_ID)],
      abilityScores: { intelligence: 14 },
      spellcastingSelections: [selectionFor(provider, 3)],
    });
    let draft = existingDraft(character, WIZARD_ID);
    const spellContext = getLevelUpSpellcastingChoiceContext(character, draft, contentRegistry);
    if (!spellContext.ok) throw new Error(spellContext.error.message);
    const grantId = srdId('class-feature', 'wizard:ability-score-improvement');
    draft = withLevelUpFeatPath(draft, grantId, 'ability-score-improvement', ASI_ID);
    draft = withLevelUpFeatChoiceValue(draft, grantId, 'ability-increase', 0, 'constitution');
    draft = withLevelUpFeatChoiceValue(draft, grantId, 'ability-increase', 1, 'constitution');
    draft = withLevelUpSpellcastingCantrip(draft, WIZARD_PROVIDER_ID, spellContext.value.providers[0].legalCantrips[0].id, true);

    const candidate = buildLevelUpCandidate(character, draft, contentRegistry);
    expect(candidate).toMatchObject({ ok: true, value: { incompleteChoices: [] } });
    if (!candidate.ok) return;
    expect(candidate.value.input.manualFeats).toContainEqual({
      featId: ASI_ID,
      choices: { 'ability-increase': ['constitution', 'constitution'] },
    });
    expect(candidate.value.input.spellcastingSelections.find((entry) => entry.providerId === WIZARD_PROVIDER_ID)?.cantripIds).toHaveLength(4);
  });

  it('O preserves the level-20 boundary', () => {
    const provider = providerDefinition(WIZARD_ID, 20, WIZARD_PROVIDER_ID);
    const character = fighterCharacter({
      startingClassId: WIZARD_ID,
      classProgressions: [progression(WIZARD_ID, 20, true)],
      abilityScores: { intelligence: 14 },
      spellcastingSelections: [selectionFor(provider, 20)],
    });
    const draft = withLevelUpTarget(createLevelUpDraft(character), { kind: 'existing-class', classId: WIZARD_ID });
    expect(getLevelUpSpellcastingChoiceContext(character, draft, contentRegistry)).toMatchObject({
      ok: false,
      error: { code: 'level-cap' },
    });
    expect(buildLevelUpCandidate(character, draft, contentRegistry)).toMatchObject({
      ok: false,
      error: { code: 'level-cap' },
    });
  });
});
