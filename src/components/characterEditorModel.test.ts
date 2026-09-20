import { describe, expect, it } from 'vitest';
import { SRD_CONTENT, srdId } from '../content/srd';
import type { Character, CharacterClassProgression, CharacterInput } from '../models/character';
import type { ClassContent, SpellcastingProviderDefinition } from '../models/content';
import type { ContentId } from '../models/contentId';
import { classProgressionSkillChoiceContext } from '../rules/classProficiencies';
import { createFixedHpProgression } from '../rules/health';
import { ContentRegistry, contentRegistry } from '../services/contentRegistry';
import { fighterInput } from '../test/fixtures';
import { validateCharacterInput } from '../utils/characterValidation';
import {
  activeEditorSpellcastingProviders,
  canAddClass,
  createProgressionDraft,
  hydrateClassProgressionDrafts,
  progressionDraftToInput,
  reconcileSpellcastingSelections,
  setDraftStartingClass,
  totalDraftLevel,
  updateProgressionLevel,
  type ClassProgressionDraft,
} from './characterEditorModel';

const FIGHTER_ID = srdId('class', 'fighter');
const CHAMPION_ID = srdId('subclass', 'fighter:champion');
const WIZARD_ID = srdId('class', 'wizard');
const ROGUE_ID = srdId('class', 'rogue');

function progression(classId: ContentId, level: number, starting: boolean, subclassId?: ContentId): CharacterClassProgression {
  const classContent = contentRegistry.findClass(classId);
  if (!classContent) throw new Error(`Missing class ${classId}`);
  const skillContext = classProgressionSkillChoiceContext(classContent, starting);
  return {
    classId,
    level,
    ...(subclassId ? { subclassId } : {}),
    skillProficiencies: [...skillContext.from.slice(0, skillContext.choose)],
    hpProgression: createFixedHpProgression(level, starting),
  };
}

function characterFromInput(input: CharacterInput): Character {
  return {
    ...input,
    id: 'm14-e-model',
    playState: { currentHp: 1, temporaryHp: 0, hitDiceRemaining: {}, resourceUses: {} },
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
  };
}

function multiclassInput(order: 'normal' | 'reversed' = 'normal'): CharacterInput {
  const fighter = progression(FIGHTER_ID, 4, true, CHAMPION_ID);
  const wizard = progression(WIZARD_ID, 2, false);
  return fighterInput({
    startingClassId: FIGHTER_ID,
    classProgressions: order === 'normal' ? [fighter, wizard] : [wizard, fighter],
    abilityScores: { intelligence: 14 },
  });
}

function pb(level: number): number {
  return level >= 17 ? 6 : level >= 13 ? 5 : level >= 9 ? 4 : level >= 5 ? 3 : 2;
}

function delayedProviderRegistry() {
  const provider: SpellcastingProviderDefinition = {
    id: 'homebrew:m14-e:spellcasting-provider:delayed',
    name: 'Delayed Casting',
    spellcastingAbility: { kind: 'fixed', ability: 'intelligence' },
    multiclassSlotContribution: { kind: 'independent' },
    spellManagement: {
      kind: 'prepared-from-list',
      spellListId: 'wizard',
      cantripCount: [{ level: 3, count: 1 }],
      preparedSpellCount: [{ level: 3, count: 1 }],
      replacement: 'long-rest-any',
    },
    slotPool: {
      id: 'homebrew:m14-e:spell-slot-pool:delayed',
      name: 'Delayed Slots',
      slotLevels: [{ spellLevel: 1, resourceId: 'homebrew:m14-e:spell-slot:delayed:1', name: 'Level 1 Delayed Slots' }],
      progression: [{ level: 3, slots: [{ spellLevel: 1, maximum: 2 }] }],
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
    ritualCasting: 'prepared',
  };
  const classContent: ClassContent = {
    id: 'homebrew:m14-e:class:delayed',
    kind: 'class',
    name: 'Delayed Adept',
    source: { type: 'homebrew', namespace: 'm14-e' },
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
        proficiencyBonus: pb(level),
        features: level === 3 ? [{
          id: 'homebrew:m14-e:class-feature:delayed:spellcasting',
          name: 'Delayed Spellcasting',
          description: 'Synthetic M14-E owner-level fixture.',
          effects: [],
          spellcasting: [provider],
          referenceEffects: [],
        }] : [],
      };
    }),
    resources: [],
  };
  return { registry: new ContentRegistry(SRD_CONTENT, [classContent]), provider, classContent };
}

describe('Milestone 14-E editor draft and mapping model', () => {
  it('A hydrates an existing single-class Character as exactly one progression', () => {
    const input = fighterInput({ level: 4, subclassId: CHAMPION_ID });
    const drafts = hydrateClassProgressionDrafts(characterFromInput(input));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ classId: FIGHTER_ID, level: '4', subclassId: CHAMPION_ID });
  });

  it('B hydrates Fighter4/Wizard2 without dropping either progression', () => {
    const drafts = hydrateClassProgressionDrafts(characterFromInput(multiclassInput()));
    expect(drafts.map((entry) => [entry.classId, entry.level])).toEqual([[FIGHTER_ID, '4'], [WIZARD_ID, '2']]);
  });

  it('C identifies the starting class from startingClassId rather than draft position', () => {
    const input = multiclassInput('reversed');
    const drafts = hydrateClassProgressionDrafts(characterFromInput(input));
    expect(drafts[0].classId).toBe(WIZARD_ID);
    expect(input.startingClassId).toBe(FIGHTER_ID);
    const normalized = setDraftStartingClass(drafts, input.startingClassId);
    expect(normalized.find((entry) => entry.classId === FIGHTER_ID)?.hpProgression[0]?.level).toBe(2);
    expect(normalized.find((entry) => entry.classId === WIZARD_ID)?.hpProgression[0]?.level).toBe(1);
  });

  it('D source progression reorder does not change explicit starting-class semantics', () => {
    const normal = setDraftStartingClass(hydrateClassProgressionDrafts(characterFromInput(multiclassInput('normal'))), FIGHTER_ID);
    const reversed = setDraftStartingClass(hydrateClassProgressionDrafts(characterFromInput(multiclassInput('reversed'))), FIGHTER_ID);
    const summary = (entries: readonly ClassProgressionDraft[]) => [...entries].sort((a, b) => a.classId.localeCompare(b.classId)).map((entry) => ({
      classId: entry.classId,
      hpLevels: entry.hpProgression.map((hp) => hp.level),
      skills: [...entry.skillProficiencies],
    }));
    expect(summary(reversed)).toEqual(summary(normal));
  });

  it('E creates an added class as a canonical level-1 non-starting progression draft', () => {
    const draft = createProgressionDraft(ROGUE_ID, false);
    expect(progressionDraftToInput(draft)).toEqual({
      classId: ROGUE_ID,
      level: 1,
      skillProficiencies: [],
      hpProgression: [{ classLevel: 1, method: 'fixed' }],
    });
  });

  it('F rejects duplicate Add Class choices in the editor model', () => {
    const fighter = createProgressionDraft(FIGHTER_ID, true);
    expect(canAddClass([fighter], FIGHTER_ID)).toBe(false);
    expect(canAddClass([fighter], WIZARD_ID)).toBe(true);
  });

  it('G leaves multiclass prerequisite enforcement to the authoritative validator', () => {
    const input = fighterInput({
      startingClassId: FIGHTER_ID,
      classProgressions: [progression(FIGHTER_ID, 1, true), progression(WIZARD_ID, 1, false)],
      abilityScores: { intelligence: 8 },
    });
    expect(validateCharacterInput(input).classProgressions).toMatch(/Wizard multiclassing requires/i);
  });

  it('H exposes different starting and added skill-choice contracts from the rules layer', () => {
    const rogue = contentRegistry.findClass(ROGUE_ID);
    if (!rogue) throw new Error('Missing Rogue');
    const starting = classProgressionSkillChoiceContext(rogue, true);
    const added = classProgressionSkillChoiceContext(rogue, false);
    expect(starting.choose).toBe(4);
    expect(added.choose).toBeLessThan(starting.choose);
  });

  it('I retains each class level independently through hydration and mapping', () => {
    const drafts = hydrateClassProgressionDrafts(characterFromInput(multiclassInput()));
    const mapped = drafts.map(progressionDraftToInput);
    expect(mapped.find((entry) => entry.classId === FIGHTER_ID)?.level).toBe(4);
    expect(mapped.find((entry) => entry.classId === WIZARD_ID)?.level).toBe(2);
  });

  it('J derives total Character level from progression levels without storing a separate field', () => {
    const drafts = hydrateClassProgressionDrafts(characterFromInput(multiclassInput()));
    expect(totalDraftLevel(drafts)).toBe(6);
    expect(multiclassInput()).not.toHaveProperty('level');
  });

  it('K clears a subclass by owning-class level, not total Character level', () => {
    const fighter = hydrateClassProgressionDrafts(characterFromInput(fighterInput({ level: 4, subclassId: CHAMPION_ID })))[0];
    const lowered = updateProgressionLevel(fighter, 2, true);
    expect(lowered.subclassId).toBe('');
  });

  it('L round-trips per-class HP progression entries without semantic loss', () => {
    const input = fighterInput({
      level: 3,
      hpProgression: [
        { classLevel: 2, method: 'rolled', roll: 7 },
        { classLevel: 3, method: 'fixed' },
      ],
    });
    const draft = hydrateClassProgressionDrafts(characterFromInput(input))[0];
    expect(progressionDraftToInput(draft).hpProgression).toEqual(input.classProgressions[0].hpProgression);
  });

  it('M gives added class level 1 a recorded HP entry rather than another max-die first level', () => {
    const wizard = createProgressionDraft(WIZARD_ID, false);
    expect(wizard.hpProgression).toEqual([{ level: 1, method: 'fixed', roll: '' }]);
    expect(createProgressionDraft(WIZARD_ID, true).hpProgression).toEqual([]);
  });

  it('T activates a provider only at its owner class level', () => {
    const { registry, provider, classContent } = delayedProviderRegistry();
    const level2 = createProgressionDraft(classContent.id, true, registry);
    const level3 = updateProgressionLevel(level2, 3, true, registry);
    expect(activeEditorSpellcastingProviders([updateProgressionLevel(level2, 2, true, registry)], registry)).toEqual([]);
    expect(activeEditorSpellcastingProviders([level3], registry).map((entry) => entry.provider.id)).toEqual([provider.id]);
  });

  it('U lowering owner level removes inactive provider selections and stale subclass choices safely', () => {
    const { registry, provider, classContent } = delayedProviderRegistry();
    const level3 = updateProgressionLevel(createProgressionDraft(classContent.id, true, registry), 3, true, registry);
    const level2 = updateProgressionLevel(level3, 2, true, registry);
    const selection = {
      providerId: provider.id,
      cantripIds: [srdId('spell', 'fire-bolt')],
      ownedSpellIds: [],
      preparedSpellIds: [srdId('spell', 'magic-missile')],
    };
    expect(reconcileSpellcastingSelections([selection], [level3], registry)).toEqual([selection]);
    expect(reconcileSpellcastingSelections([selection], [level2], registry)).toEqual([]);

    const fighter = hydrateClassProgressionDrafts(characterFromInput(fighterInput({ level: 4, subclassId: CHAMPION_ID })))[0];
    expect(updateProgressionLevel(fighter, 2, true).subclassId).toBe('');
  });
});
