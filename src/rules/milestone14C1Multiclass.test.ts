import { describe, expect, it } from 'vitest';
import { srdId } from '../content/srd';
import type { AbilityScores, Character, CharacterClassProgression, SkillId } from '../models/character';
import type { ContentId } from '../models/contentId';
import { contentRegistry } from '../services/contentRegistry';
import { fighterCharacter, fighterInput } from '../test/fixtures';
import { validateCharacterInput } from '../utils/characterValidation';
import { deriveClassProficiencyContext } from './classProficiencies';
import { getClassProgression, getStartingClassProgression } from './characterProgression';
import { deriveCharacterState } from './deriveCharacter';
import { createFixedHpProgression } from './health';

const FIGHTER_ID = srdId('class', 'fighter');
const ROGUE_ID = srdId('class', 'rogue');
const BARBARIAN_ID = srdId('class', 'barbarian');
const WIZARD_ID = srdId('class', 'wizard');
const MONK_ID = srdId('class', 'monk');
const CHAMPION_ID = srdId('subclass', 'fighter:champion');
const THIEF_ID = srdId('subclass', 'rogue:thief');

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
    id: 'm14-c1-character',
    playState: { currentHp: 1, temporaryHp: 0, hitDiceRemaining: {}, resourceUses: {} },
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
  };
}

function fighterRogueFighterStart(): Character {
  return character(FIGHTER_ID, [
    progression(FIGHTER_ID, 4, ['athletics', 'perception'], true, CHAMPION_ID),
    progression(ROGUE_ID, 3, ['stealth'], false, THIEF_ID),
  ]);
}

function rogueFighterRogueStart(order: 'fighter-first' | 'rogue-first' = 'fighter-first'): Character {
  const rogue = progression(ROGUE_ID, 3, ['acrobatics', 'investigation', 'sleight-of-hand', 'stealth'], true, THIEF_ID);
  const fighter = progression(FIGHTER_ID, 4, [], false, CHAMPION_ID);
  return character(ROGUE_ID, order === 'fighter-first' ? [fighter, rogue] : [rogue, fighter]);
}

describe('Milestone 14-C1 multiclass proficiency foundation', () => {
  it('A derives Fighter 4 / Rogue 3 from total level and starting-class ownership', () => {
    const result = deriveCharacterState(fighterRogueFighterStart(), contentRegistry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.level).toBe(7);
    expect(result.value.proficiencyBonus).toBe(3);
    expect(result.value.savingThrows.strength.proficient).toBe(true);
    expect(result.value.savingThrows.constitution.proficient).toBe(true);
    expect(result.value.savingThrows.dexterity.proficient).toBe(false);
    expect(result.value.savingThrows.intelligence.proficient).toBe(false);
    expect(result.value.skills.stealth.proficient).toBe(true);
    expect(result.value.classProficiencies.weaponProficiencies).toEqual([
      { kind: 'category', category: 'simple' },
      { kind: 'category', category: 'martial' },
    ]);
    expect(result.value.classProficiencies.armorTraining).toEqual(['light', 'medium', 'heavy', 'shield']);
    expect(result.value.classProficiencies.toolProficiencies).toEqual([{ id: 'thieves-tools', name: 'Thieves’ Tools' }]);
  });

  it('B makes startingClassId authoritative even when the starting progression is not first', () => {
    const fighterFirst = deriveCharacterState(rogueFighterRogueStart('fighter-first'), contentRegistry);
    const rogueFirst = deriveCharacterState(rogueFighterRogueStart('rogue-first'), contentRegistry);
    expect(fighterFirst.ok).toBe(true);
    expect(rogueFirst.ok).toBe(true);
    if (!fighterFirst.ok || !rogueFirst.ok) return;

    for (const state of [fighterFirst.value, rogueFirst.value]) {
      expect(state.startingClassId).toBe(ROGUE_ID);
      expect(state.savingThrows.dexterity.proficient).toBe(true);
      expect(state.savingThrows.intelligence.proficient).toBe(true);
      expect(state.savingThrows.strength.proficient).toBe(false);
      expect(state.savingThrows.constitution.proficient).toBe(false);
      expect(state.classProficiencies.armorTraining).toEqual(['light', 'medium', 'shield']);
      expect(state.classProficiencies.armorTraining).not.toContain('heavy');
      expect(state.classProficiencies.weaponProficiencies).toEqual([
        { kind: 'category', category: 'simple' },
        { kind: 'category-with-property', category: 'martial', anyOfProperties: ['finesse', 'light'] },
        { kind: 'category', category: 'martial' },
      ]);
    }
  });

  it('C deduplicates overlapping Fighter / Barbarian multiclass proficiencies deterministically', () => {
    const input = character(FIGHTER_ID, [
      progression(FIGHTER_ID, 2, ['athletics', 'perception'], true),
      progression(BARBARIAN_ID, 1, [], false),
    ]);
    const context = deriveClassProficiencyContext(input, contentRegistry);
    expect(context.ok).toBe(true);
    if (!context.ok) return;
    expect(context.value.weaponProficiencies.filter((rule) => rule.kind === 'category' && rule.category === 'martial')).toHaveLength(1);
    expect(context.value.armorTraining.filter((category) => category === 'shield')).toHaveLength(1);
  });

  it('D gives added Fighter only its M14-A package when Wizard is the starting class and keeps Wizard saves', () => {
    const input = character(WIZARD_ID, [
      progression(FIGHTER_ID, 1, [], false),
      progression(WIZARD_ID, 1, ['arcana', 'history'], true),
    ]);
    const context = deriveClassProficiencyContext(input, contentRegistry);
    expect(context.ok).toBe(true);
    if (!context.ok) return;

    expect(context.value.startingClass.id).toBe(WIZARD_ID);
    expect(context.value.savingThrowProficiencies).toEqual(['intelligence', 'wisdom']);
    expect(context.value.weaponProficiencies).toEqual([
      { kind: 'category', category: 'simple' },
      { kind: 'category', category: 'martial' },
    ]);
    expect(context.value.armorTraining).toEqual(['light', 'medium', 'shield']);
    expect(context.value.armorTraining).not.toContain('heavy');

    const derived = deriveCharacterState(input, contentRegistry);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.value.classState).toBeUndefined();
    expect(derived.value.savingThrows.intelligence.proficient).toBe(true);
    expect(derived.value.savingThrows.wisdom.proficient).toBe(true);
    expect(derived.value.savingThrows.strength.proficient).toBe(false);
    expect(derived.value.spellcasting).toMatchObject([{
      id: srdId('spellcasting-provider', 'wizard:spellcasting'),
      owner: { kind: 'class', classId: WIZARD_ID, level: 1 },
    }]);
  });

  it('E leaves the Fighter package unchanged when added Monk contributes no multiclass proficiencies', () => {
    const input = character(FIGHTER_ID, [
      progression(FIGHTER_ID, 2, ['athletics', 'perception'], true),
      progression(MONK_ID, 1, [], false),
    ]);
    const context = deriveClassProficiencyContext(input, contentRegistry);
    expect(context.ok).toBe(true);
    if (!context.ok) return;

    const fighter = contentRegistry.findClass(FIGHTER_ID)!;
    expect(context.value.weaponProficiencies).toEqual(fighter.weaponProficiencies);
    expect(context.value.armorTraining).toEqual(fighter.armorTraining);
    expect(context.value.toolProficiencies).toEqual(fighter.toolProficiencies);
  });

  it('F rejects an added-class skill outside the multiclass class-skill-list contract', () => {
    const input = fighterInput({
      startingClassId: FIGHTER_ID,
      classProgressions: [
        progression(FIGHTER_ID, 2, ['athletics', 'perception'], true),
        progression(ROGUE_ID, 1, ['arcana'], false),
      ],
      abilityScores: QUALIFYING_SCORES,
    });
    expect(validateCharacterInput(input).skillProficiencies).toMatch(/multiclass proficiency package/i);
    expect(deriveClassProficiencyContext(input, contentRegistry).ok).toBe(false);
  });

  it('G rejects too many added-class skill selections', () => {
    const input = fighterInput({
      startingClassId: FIGHTER_ID,
      classProgressions: [
        progression(FIGHTER_ID, 2, ['athletics', 'perception'], true),
        progression(ROGUE_ID, 1, ['stealth', 'perception'], false),
      ],
      abilityScores: QUALIFYING_SCORES,
    });
    expect(validateCharacterInput(input).skillProficiencies).toMatch(/exactly 1 Rogue multiclass skill/i);
  });

  it('H rejects a stored multiclass Character that fails a participating class primary-ability prerequisite', () => {
    const input = fighterInput({
      startingClassId: FIGHTER_ID,
      classProgressions: [
        progression(FIGHTER_ID, 1, ['athletics', 'perception'], true),
        progression(MONK_ID, 1, [], false),
      ],
      abilityScores: { strength: 13, dexterity: 12, wisdom: 12 },
    });
    expect(validateCharacterInput(input).classProgressions).toMatch(/Monk multiclassing requires/i);
  });

  it('I preserves representative single-class Fighter and Rogue proficiency behavior', () => {
    const fighter = deriveCharacterState(fighterCharacter({ inventory: [] }), contentRegistry);
    expect(fighter.ok).toBe(true);
    if (fighter.ok) {
      const content = contentRegistry.findClass(FIGHTER_ID)!;
      expect(fighter.value.classState!.savingThrowProficiencies).toEqual(content.savingThrowProficiencies);
      expect(fighter.value.classState!.weaponProficiencies).toEqual(content.weaponProficiencies);
      expect(fighter.value.classState!.armorTraining).toEqual(content.armorTraining);
    }

    const rogue = character(ROGUE_ID, [
      progression(ROGUE_ID, 2, ['acrobatics', 'investigation', 'sleight-of-hand', 'stealth'], true),
    ]);
    const rogueState = deriveCharacterState(rogue, contentRegistry);
    expect(rogueState.ok).toBe(true);
    if (rogueState.ok) {
      const content = contentRegistry.findClass(ROGUE_ID)!;
      expect(rogueState.value.classState!.savingThrowProficiencies).toEqual(content.savingThrowProficiencies);
      expect(rogueState.value.classState!.weaponProficiencies).toEqual(content.weaponProficiencies);
      expect(rogueState.value.classState!.toolProficiencies).toEqual(content.toolProficiencies);
    }
  });

  it('J produces the same semantic multiclass state when classProgressions are reordered', () => {
    const first = fighterRogueFighterStart();
    const reversed = { ...first, classProgressions: [...first.classProgressions].reverse() };
    const left = deriveCharacterState(first, contentRegistry);
    const right = deriveCharacterState(reversed, contentRegistry);
    expect(left.ok).toBe(true);
    expect(right.ok).toBe(true);
    if (!left.ok || !right.ok) return;

    expect(right.value).toEqual(left.value);
  });

  it('fails explicitly when startingClassId has no progression and never falls back to the first progression', () => {
    const input = character(WIZARD_ID, [
      progression(FIGHTER_ID, 1, ['athletics', 'perception'], false),
      progression(ROGUE_ID, 1, ['stealth'], false),
    ]);
    expect(getStartingClassProgression(input)).toMatchObject({
      ok: false,
      error: { code: 'multiclass-derivation-not-supported' },
    });
    expect(deriveClassProficiencyContext(input, contentRegistry)).toMatchObject({
      ok: false,
      error: { contentId: WIZARD_ID },
    });
  });

  it('resolves an explicitly requested progression by class ID independent of array order', () => {
    const input = fighterRogueFighterStart();
    const reversed = { ...input, classProgressions: [...input.classProgressions].reverse() };
    expect(getClassProgression(reversed, FIGHTER_ID)).toMatchObject({ ok: true, value: { classId: FIGHTER_ID, level: 4 } });
    expect(getClassProgression(reversed, ROGUE_ID)).toMatchObject({ ok: true, value: { classId: ROGUE_ID, level: 3 } });
  });

  it('does not grant added-class saving throws or an added class full starting-only proficiency package', () => {
    const context = deriveClassProficiencyContext(rogueFighterRogueStart(), contentRegistry);
    expect(context.ok).toBe(true);
    if (!context.ok) return;
    expect(context.value.savingThrowProficiencies).toEqual(['dexterity', 'intelligence']);
    expect(context.value.armorTraining).not.toContain('heavy');
  });

  it('does not invent a persisted multiclass tool choice when Character v9 has no progression-owned tool-choice field', () => {
    const bardId = srdId('class', 'bard');
    const input = character(FIGHTER_ID, [
      progression(FIGHTER_ID, 1, ['athletics', 'perception'], true),
      progression(bardId, 1, ['performance'], false),
    ]);
    const context = deriveClassProficiencyContext(input, contentRegistry);
    expect(context.ok).toBe(true);
    if (!context.ok) return;
    expect(context.value.toolProficiencies).toEqual([]);
  });
});
