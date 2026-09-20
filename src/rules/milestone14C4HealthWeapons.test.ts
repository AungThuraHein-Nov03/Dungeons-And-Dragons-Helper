import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SRD_CONTENT, SRD_FIGHTER, srdId } from '../content/srd';
import type {
  AbilityScores,
  Character,
  CharacterClassProgression,
  CharacterInput,
  ClassHpProgressionEntry,
  SkillId,
} from '../models/character';
import type { ClassContent } from '../models/content';
import type { ContentId } from '../models/contentId';
import {
  applyCharacterDamage,
  finishCharacterLongRest,
  spendCharacterHitDie,
} from '../services/characterPlayState';
import { rollHitDie, rollWeaponAttack } from '../services/characterRolls';
import { ContentRegistry, contentRegistry } from '../services/contentRegistry';
import {
  createCharacter,
  getCharacterById,
} from '../services/characterStorage';
import {
  FIGHTER_ID,
  SCIMITAR_ID,
  fighterInput,
} from '../test/fixtures';
import { deriveAbilityModifiers } from './abilities';
import { deriveClassProficiencyContext } from './classProficiencies';
import { deriveCharacterState } from './deriveCharacter';
import {
  createFixedHpProgression,
  deriveHealth,
  deriveMulticlassHealth,
} from './health';
import {
  finishLongRest,
  reconcilePlayState,
} from './playState';
import {
  deriveWeaponAttack,
  deriveWeaponMasteryAccess,
} from './weapons';

const ROGUE_ID = srdId('class', 'rogue');
const PALADIN_ID = srdId('class', 'paladin');
const WIZARD_ID = srdId('class', 'wizard');
const MONK_ID = srdId('class', 'monk');

const CHAMPION_ID = srdId('subclass', 'fighter:champion');
const THIEF_ID = srdId('subclass', 'rogue:thief');
const LONGSWORD_ID = srdId('weapon', 'longsword');

const QUALIFYING_SCORES: Partial<AbilityScores> = {
  strength: 14,
  dexterity: 18,
  constitution: 14,
  intelligence: 13,
  wisdom: 14,
  charisma: 13,
};

function progression(
  classId: ContentId,
  level: number,
  skillProficiencies: SkillId[],
  starting: boolean,
  subclassId?: ContentId,
  hpProgression: ClassHpProgressionEntry[] = createFixedHpProgression(level, starting),
): CharacterClassProgression {
  return {
    classId,
    level,
    ...(subclassId ? { subclassId } : {}),
    skillProficiencies,
    hpProgression,
  };
}

function input(
  startingClassId: ContentId,
  classProgressions: CharacterClassProgression[],
  patch: Partial<CharacterInput> = {},
): CharacterInput {
  return fighterInput({
    startingClassId,
    classProgressions,
    abilityScores: QUALIFYING_SCORES,
    inventory: [],
    ...patch,
  });
}

function character(value: CharacterInput, id = 'm14-c4-character'): Character {
  return {
    ...value,
    id,
    playState: { currentHp: 1, temporaryHp: 0, hitDiceRemaining: {}, resourceUses: {} },
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
  };
}

function fighterRogueInput(
  fighterLevel = 4,
  rogueLevel = 3,
  startingClassId: typeof FIGHTER_ID | typeof ROGUE_ID = FIGHTER_ID,
  order: 'normal' | 'reversed' = 'normal',
  withScimitar = false,
): CharacterInput {
  const fighter = progression(
    FIGHTER_ID,
    fighterLevel,
    startingClassId === FIGHTER_ID ? ['athletics', 'perception'] : [],
    startingClassId === FIGHTER_ID,
    fighterLevel >= 3 ? CHAMPION_ID : undefined,
  );
  const rogue = progression(
    ROGUE_ID,
    rogueLevel,
    startingClassId === ROGUE_ID ? ['acrobatics', 'investigation', 'sleight-of-hand', 'stealth'] : ['stealth'],
    startingClassId === ROGUE_ID,
    rogueLevel >= 3 ? THIEF_ID : undefined,
  );
  const classProgressions = order === 'normal' ? [fighter, rogue] : [rogue, fighter];
  return input(startingClassId, classProgressions, withScimitar ? {
    inventory: [{
      id: 'm14-c4-scimitar',
      kind: 'registry',
      contentId: SCIMITAR_ID,
      category: 'weapon',
      quantity: 1,
      equipped: true,
      notes: '',
      attackAbilityChoice: 'dexterity',
    }],
  } : {});
}

function derived(value: Character) {
  const result = deriveCharacterState(value, contentRegistry);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function dieValue(value: number, die: number) {
  return () => (value - 1) / die;
}

const DELAYED_MASTERY_ID = 'homebrew:c4:class:delayed-mastery';

const delayedMasteryClass: ClassContent = {
  ...SRD_FIGHTER,
  id: DELAYED_MASTERY_ID,
  name: 'Delayed Mastery Fighter',
  source: { type: 'homebrew', namespace: 'c4' },
  progression: SRD_FIGHTER.progression.map((row) => ({
    level: row.level,
    proficiencyBonus: row.proficiencyBonus,
    features: [],
    ...(row.level >= 3 ? { weaponMasteryChoices: 1 } : {}),
  })),
  resources: [],
};

describe('Milestone 14-C4 multiclass health/Hit-Dice and weapon/mastery runtime', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('A derives Fighter 4 / Rogue 3 HP from persisted owner histories and aggregates d10:4 plus d8:3', () => {
    const fighterHistory: ClassHpProgressionEntry[] = [
      { classLevel: 2, method: 'rolled', roll: 7 },
      { classLevel: 3, method: 'rolled', roll: 8 },
      { classLevel: 4, method: 'rolled', roll: 9 },
    ];
    const rogueHistory: ClassHpProgressionEntry[] = [
      { classLevel: 1, method: 'rolled', roll: 4 },
      { classLevel: 2, method: 'rolled', roll: 5 },
      { classLevel: 3, method: 'rolled', roll: 6 },
    ];
    const value = input(FIGHTER_ID, [
      progression(FIGHTER_ID, 4, ['athletics', 'perception'], true, CHAMPION_ID, fighterHistory),
      progression(ROGUE_ID, 3, ['stealth'], false, THIEF_ID, rogueHistory),
    ]);
    const health = deriveMulticlassHealth(value, contentRegistry, []);

    expect(health).toEqual({
      ok: true,
      value: {
        maximumHp: 63,
        hitDice: [{ die: 8, maximum: 3 }, { die: 10, maximum: 4 }],
      },
    });
  });

  it('B aggregates equal d10 Hit Dice across Fighter 3 / Paladin 2 without entering M14-D spellcasting runtime', () => {
    const value = input(FIGHTER_ID, [
      progression(FIGHTER_ID, 3, ['athletics', 'perception'], true, CHAMPION_ID),
      progression(PALADIN_ID, 2, [], false),
    ]);
    const health = deriveMulticlassHealth(value, contentRegistry, []);

    expect(health).toMatchObject({
      ok: true,
      value: {
        maximumHp: 44,
        hitDice: [{ die: 10, maximum: 5 }],
      },
    });
    const derivedState = deriveCharacterState(character(value), contentRegistry);
    expect(derivedState.ok).toBe(true);
    if (!derivedState.ok) return;
    expect(derivedState.value.health).toEqual({ maximumHp: 44, hitDice: [{ die: 10, maximum: 5 }] });
    expect(derivedState.value.spellcasting).toMatchObject([{
      id: srdId('spellcasting-provider', 'paladin:spellcasting'),
      owner: { kind: 'class', classId: PALADIN_ID, level: 2 },
    }]);
  });

  it('C follows startingClassId for first-Character-level HP rather than classProgressions array order', () => {
    const fighterStart = input(FIGHTER_ID, [
      progression(ROGUE_ID, 3, ['stealth'], false, THIEF_ID),
      progression(FIGHTER_ID, 4, ['athletics', 'perception'], true, CHAMPION_ID),
    ]);
    const rogueStart = input(ROGUE_ID, [
      progression(FIGHTER_ID, 4, [], false, CHAMPION_ID),
      progression(ROGUE_ID, 3, ['acrobatics', 'investigation', 'sleight-of-hand', 'stealth'], true, THIEF_ID),
    ]);

    expect(deriveMulticlassHealth(fighterStart, contentRegistry, [])).toMatchObject({ ok: true, value: { maximumHp: 57 } });
    expect(deriveMulticlassHealth(rogueStart, contentRegistry, [])).toMatchObject({ ok: true, value: { maximumHp: 56 } });
  });

  it('D treats added-class level 1 as persisted per-level HP rather than a second max-die first level', () => {
    const value = input(FIGHTER_ID, [
      progression(FIGHTER_ID, 1, ['athletics', 'perception'], true),
      progression(ROGUE_ID, 1, ['stealth'], false),
    ]);
    const health = deriveMulticlassHealth(value, contentRegistry, []);

    expect(health).toMatchObject({
      ok: true,
      value: {
        maximumHp: 19,
        hitDice: [{ die: 8, maximum: 1 }, { die: 10, maximum: 1 }],
      },
    });
  });

  it('E spends exact selected d10 and d8 pools independently and uses the selected die roll plus CON modifier', () => {
    const created = createCharacter(fighterRogueInput());
    expect(created.playState.hitDiceRemaining).toEqual({ 8: 3, 10: 4 });
    expect(applyCharacterDamage(created.id, 37).ok).toBe(true);

    const d10 = spendCharacterHitDie(created.id, 7, 10);
    expect(d10).toMatchObject({
      ok: true,
      value: { playState: { currentHp: 29, hitDiceRemaining: { 8: 3, 10: 3 } } },
    });

    const d8 = spendCharacterHitDie(created.id, 4, 8);
    expect(d8).toMatchObject({
      ok: true,
      value: { playState: { currentHp: 35, hitDiceRemaining: { 8: 2, 10: 3 } } },
    });
  });

  it('F requires an explicit die selection for multiple pools and rolls the exact selected die without auto-picking', () => {
    const created = createCharacter(fighterRogueInput());
    expect(applyCharacterDamage(created.id, 20).ok).toBe(true);
    const before = getCharacterById(created.id);
    const rng = vi.fn(dieValue(5, 8));

    const missingSelection = rollHitDie(created.id, { rng });
    expect(missingSelection).toMatchObject({
      ok: false,
      error: { code: 'unavailable-hit-die', message: expect.stringMatching(/Select a Hit Die size/i) },
    });
    expect(rng).not.toHaveBeenCalled();
    expect(getCharacterById(created.id)).toEqual(before);

    const selected = rollHitDie(created.id, 8, { rng });
    expect(selected).toMatchObject({
      ok: true,
      value: {
        roll: {
          dice: [{ die: 8, values: [5] }],
          modifier: 2,
          total: 7,
          effects: [
            { kind: 'hp', before: 37, after: 44 },
            { kind: 'hit-dice', die: 8, before: 3, after: 2 },
          ],
        },
        character: { playState: { hitDiceRemaining: { 8: 2, 10: 4 } } },
      },
    });
  });

  it('G reconciles multiple spent pools by die size and preserves spent counts when maxima increase', () => {
    const previousContext = {
      health: { maximumHp: 57, hitDice: [{ die: 8 as const, maximum: 3 }, { die: 10 as const, maximum: 4 }] },
      resources: [],
    };
    const nextContext = {
      health: { maximumHp: 73, hitDice: [{ die: 8 as const, maximum: 4 }, { die: 10 as const, maximum: 5 }] },
      resources: [],
    };
    const previous = {
      currentHp: 40,
      temporaryHp: 3,
      hitDiceRemaining: { 8: 1, 10: 2 },
      resourceUses: {},
    };

    expect(reconcilePlayState(previous, previousContext, nextContext)).toEqual({
      currentHp: 40,
      temporaryHp: 3,
      hitDiceRemaining: { 8: 2, 10: 3 },
      resourceUses: {},
    });
  });

  it('H Long Rest restores every multi-pool Hit Die to its established maximum and never exceeds it', () => {
    const created = createCharacter(fighterRogueInput());
    expect(spendCharacterHitDie(created.id, 4, 8).ok).toBe(true);
    expect(spendCharacterHitDie(created.id, 6, 10).ok).toBe(true);
    const rested = finishCharacterLongRest(created.id);

    expect(rested).toMatchObject({
      ok: true,
      value: { playState: { hitDiceRemaining: { 8: 3, 10: 4 } } },
    });

    const pure = finishLongRest({
      ...created.playState,
      hitDiceRemaining: { 8: 99, 10: 99 },
    }, {
      health: { maximumHp: 57, hitDice: [{ die: 8, maximum: 3 }, { die: 10, maximum: 4 }] },
      resources: [],
    });
    expect(pure).toMatchObject({ ok: true, value: { hitDiceRemaining: { 8: 3, 10: 4 } } });
  });

  it('I preserves single-class Fighter health and exact-die behavior', () => {
    const singleInput = fighterInput({ level: 4 });
    const fighter = contentRegistry.findClass(FIGHTER_ID);
    if (!fighter) throw new Error('Missing Fighter fixture.');
    const health = deriveHealth(singleInput, fighter, []);
    expect(health).toMatchObject({
      ok: true,
      value: { maximumHp: 36, hitDice: [{ die: 10, maximum: 4 }] },
    });

    const created = createCharacter(singleInput);
    expect(applyCharacterDamage(created.id, 20).ok).toBe(true);
    expect(spendCharacterHitDie(created.id, 7)).toMatchObject({
      ok: true,
      value: { playState: { currentHp: 25, hitDiceRemaining: { 10: 3 } } },
    });
  });

  it('J derives Fighter 4 / Rogue 3 equipped Finesse attack with total-level PB +3', () => {
    const state = derived(character(fighterRogueInput(4, 3, FIGHTER_ID, 'normal', true)));

    expect(state.level).toBe(7);
    expect(state.proficiencyBonus).toBe(3);
    expect(state.attacks).toHaveLength(1);
    expect(state.attacks[0]).toMatchObject({
      weaponId: SCIMITAR_ID,
      proficient: true,
      applicableAttackAbilities: ['strength', 'dexterity'],
      attackAbility: 'dexterity',
      attackModifier: 7,
      damage: { abilityModifier: 4 },
      mastery: { canPotentiallyUse: true },
    });
  });

  it('K executes the ordinary multiclass equipped-weapon roll path instead of failing on multiclass ownership', () => {
    const created = createCharacter(fighterRogueInput(4, 3, FIGHTER_ID, 'normal', true));
    const rolled = rollWeaponAttack(created.id, SCIMITAR_ID, 'normal', { rng: dieValue(14, 20) });

    expect(rolled).toMatchObject({
      ok: true,
      value: { roll: { modifier: 7, total: 21 } },
    });
  });

  it('L honors added Fighter weapon proficiency for Wizard-start/Fighter-added without leaking Fighter starting saves', () => {
    const value = input(WIZARD_ID, [
      progression(WIZARD_ID, 1, ['arcana', 'history'], true),
      progression(FIGHTER_ID, 1, [], false),
    ]);
    const proficiency = deriveClassProficiencyContext(value, contentRegistry);
    expect(proficiency.ok).toBe(true);
    if (!proficiency.ok) return;

    expect(proficiency.value.savingThrowProficiencies).toEqual(['intelligence', 'wisdom']);
    expect(proficiency.value.savingThrowProficiencies).not.toContain('strength');
    expect(proficiency.value.weaponProficiencies).toContainEqual({ kind: 'category', category: 'martial' });

    const effectiveClass: ClassContent = {
      ...proficiency.value.startingClass,
      weaponProficiencies: proficiency.value.weaponProficiencies,
      armorTraining: proficiency.value.armorTraining,
      toolProficiencies: proficiency.value.toolProficiencies,
    };
    const valueCharacter = character(value, 'wizard-fighter-helper');
    const attack = deriveWeaponAttack(
      valueCharacter,
      effectiveClass,
      contentRegistry,
      deriveAbilityModifiers(valueCharacter.abilityScores),
      LONGSWORD_ID,
    );
    expect(attack).toMatchObject({
      ok: true,
      value: {
        proficient: true,
        attackAbility: 'strength',
        attackModifier: 4,
        mastery: { canPotentiallyUse: true },
      },
    });
    expect(deriveWeaponMasteryAccess(valueCharacter, contentRegistry)).toEqual({
      ok: true,
      value: {
        totalChoices: 3,
        owners: [{ classId: FIGHTER_ID, className: 'Fighter', classLevel: 1, choices: 3 }],
      },
    });

    const derivedState = deriveCharacterState(valueCharacter, contentRegistry);
    expect(derivedState.ok).toBe(true);
    if (!derivedState.ok) return;
    expect(derivedState.value.savingThrows.intelligence.proficient).toBe(true);
    expect(derivedState.value.savingThrows.wisdom.proficient).toBe(true);
    expect(derivedState.value.savingThrows.strength.proficient).toBe(false);
    expect(derivedState.value.spellcasting).toMatchObject([{
      id: srdId('spellcasting-provider', 'wizard:spellcasting'),
      owner: { kind: 'class', classId: WIZARD_ID, level: 1 },
    }]);
  });

  it('M derives Weapon Mastery capacity from each owner class level and aggregates multiple legitimate owners', () => {
    const value = character(fighterRogueInput(4, 3));
    const access = deriveWeaponMasteryAccess(value, contentRegistry);

    expect(access).toEqual({
      ok: true,
      value: {
        totalChoices: 6,
        owners: [
          { classId: FIGHTER_ID, className: 'Fighter', classLevel: 4, choices: 4 },
          { classId: ROGUE_ID, className: 'Rogue', classLevel: 3, choices: 2 },
        ],
      },
    });
  });

  it('N does not unlock an owner mastery allowance from total Character level when that owner is below its threshold', () => {
    const registry = new ContentRegistry(SRD_CONTENT, [delayedMasteryClass]);
    const below = character(input(DELAYED_MASTERY_ID, [
      progression(DELAYED_MASTERY_ID, 2, ['athletics', 'perception'], true),
      progression(MONK_ID, 5, [], false),
    ]), 'delayed-below');
    const acquired = character(input(DELAYED_MASTERY_ID, [
      progression(DELAYED_MASTERY_ID, 3, ['athletics', 'perception'], true),
      progression(MONK_ID, 4, [], false),
    ]), 'delayed-acquired');

    expect(below.classProgressions.reduce((total, owner) => total + owner.level, 0)).toBe(7);
    expect(deriveWeaponMasteryAccess(below, registry)).toEqual({
      ok: true,
      value: { totalChoices: 0, owners: [] },
    });
    expect(deriveWeaponMasteryAccess(acquired, registry)).toEqual({
      ok: true,
      value: {
        totalChoices: 1,
        owners: [{ classId: DELAYED_MASTERY_ID, className: 'Delayed Mastery Fighter', classLevel: 3, choices: 1 }],
      },
    });
  });

  it('O preserves representative single-class Fighter weapon/mastery parity', () => {
    const single = character(fighterInput({
      level: 4,
      inventory: [{
        id: 'single-scimitar',
        kind: 'registry',
        contentId: SCIMITAR_ID,
        category: 'weapon',
        quantity: 1,
        equipped: true,
        notes: '',
        attackAbilityChoice: 'dexterity',
      }],
    }), 'single-fighter');
    const state = derived(single);

    expect(state.attacks[0]).toMatchObject({
      weaponId: SCIMITAR_ID,
      proficient: true,
      attackAbility: 'dexterity',
      attackModifier: 6,
      mastery: { canPotentiallyUse: true },
    });
    expect(deriveWeaponMasteryAccess(single, contentRegistry)).toMatchObject({
      ok: true,
      value: {
        totalChoices: 4,
        owners: [{ classId: FIGHTER_ID, classLevel: 4, choices: 4 }],
      },
    });
  });

  it('P keeps multiclass weapon/mastery semantics independent of classProgressions array order', () => {
    const normal = derived(character(fighterRogueInput(4, 3, FIGHTER_ID, 'normal', true), 'same-c4'));
    const reversed = derived(character(fighterRogueInput(4, 3, FIGHTER_ID, 'reversed', true), 'same-c4'));

    expect(reversed.attacks).toEqual(normal.attacks);
    expect(reversed.health).toEqual(normal.health);
    expect(deriveWeaponMasteryAccess(character(fighterRogueInput(4, 3, FIGHTER_ID, 'reversed')), contentRegistry))
      .toEqual(deriveWeaponMasteryAccess(character(fighterRogueInput(4, 3, FIGHTER_ID, 'normal')), contentRegistry));
  });
});
