import { beforeEach, describe, expect, it } from 'vitest';
import { srdId } from '../content/srd';
import { deriveCharacterState } from './deriveCharacter';
import { deriveCharacterSpeed, deriveStaticD20Context, deriveWeaponCriticalThreshold } from './m13eRules';
import { derivePassivePerception, deriveSkills } from './skills';
import { deriveAbilityModifiers } from './abilities';
import { createCharacter } from '../services/characterStorage';
import { contentRegistry } from '../services/contentRegistry';
import { fighterCharacter, fighterInput, SHIELD_ID } from '../test/fixtures';

const CHAIN_MAIL_ID = srdId('armor', 'chain-mail');
const PLATE_ID = srdId('armor', 'plate-armor');
const LEATHER_ID = srdId('armor', 'leather-armor');

type ClassSlug = 'barbarian' | 'monk' | 'ranger' | 'rogue';

function subclassId(classSlug: ClassSlug, level: number): string | undefined {
  if (level < 3) return undefined;
  if (classSlug === 'barbarian') return srdId('subclass', 'barbarian:path-of-the-berserker');
  if (classSlug === 'monk') return srdId('subclass', 'monk:warrior-of-the-open-hand');
  if (classSlug === 'ranger') return srdId('subclass', 'ranger:hunter');
  return srdId('subclass', 'rogue:thief');
}

function skillsFor(classSlug: ClassSlug) {
  if (classSlug === 'barbarian') return ['athletics', 'perception'] as const;
  if (classSlug === 'monk') return ['athletics', 'insight'] as const;
  if (classSlug === 'ranger') return ['animal-handling', 'perception', 'survival'] as const;
  return ['acrobatics', 'insight', 'perception', 'stealth'] as const;
}

function classCharacter(
  classSlug: ClassSlug,
  level: number,
  patch: Parameters<typeof fighterInput>[0] = {},
) {
  return createCharacter(fighterInput({
    classId: srdId('class', classSlug),
    subclassId: subclassId(classSlug, level),
    level,
    skillProficiencies: [...skillsFor(classSlug)],
    ...patch,
  }));
}

function derived(character: ReturnType<typeof createCharacter>) {
  const result = deriveCharacterState(character, contentRegistry);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('M13E static and derived Character rules', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('derives Dwarven Toughness as +1 maximum HP per Character level without mutating CharacterInput', () => {
    const baseInput = fighterInput({ level: 6, speciesId: srdId('species', 'dwarf'), speciesChoices: {}, speciesSkillProficiencies: [] });
    const before = JSON.stringify(baseInput);
    const dwarf = createCharacter(baseInput);
    const dwarfState = derived(dwarf);

    window.localStorage.clear();
    const control = createCharacter(fighterInput({ level: 6 }));
    const controlState = derived(control);

    expect(dwarfState.health.maximumHp).toBe(controlState.health.maximumHp + 6);
    expect(JSON.stringify(baseInput)).toBe(before);
    expect(dwarfState.ruleEffects).toContainEqual({ type: 'hit-point-bonus-per-class-level', amount: 1 });
  });

  it('derives Passive Perception from the actual Perception modifier and resolved Advantage/Disadvantage context', () => {
    const modifiers = deriveAbilityModifiers({ strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 16, charisma: 10 });
    const skills = deriveSkills(modifiers, 3, ['perception']);
    expect(skills.perception.modifier).toBe(6);
    expect(derivePassivePerception(skills)).toBe(16);
    expect(derivePassivePerception(skills, { advantageSources: ['Keen Watch'] })).toBe(21);
    expect(derivePassivePerception(skills, { disadvantageSources: ['Obscured'] })).toBe(11);
    expect(derivePassivePerception(skills, { advantageSources: ['Keen Watch'], disadvantageSources: ['Obscured'] })).toBe(16);
  });

  it('does not apply unresolved Expertise choices when deriving Passive Perception', () => {
    const rogue = fighterCharacter({
      classId: srdId('class', 'rogue'),
      subclassId: srdId('subclass', 'rogue:thief'),
      level: 7,
      skillProficiencies: ['acrobatics', 'insight', 'perception', 'stealth'],
      preserveV10Choices: true,
    });
    const state = derived(rogue);
    expect(state.skills.perception.proficient).toBe(true);
    expect(state.skills.perception.expertise).toBe(false);
    expect(state.skills.perception.modifier).toBe(state.abilityModifiers.wisdom + state.proficiencyBonus);
    expect(state.classState!.acquiredFeatures.find((feature) => feature.name === 'Expertise')?.automatedEffects).toEqual([{
      type: 'skill-expertise-choice',
      choose: 2,
      eligibility: 'proficient-skills',
    }]);
  });

  it('applies armor Strength requirement as a generic -10 Speed consequence and removes it when the requirement is met', () => {
    const lowStrengthInput = fighterInput({
      level: 1,
      subclassId: undefined,
      abilityScores: { strength: 14 },
      equipment: { equippedArmorId: PLATE_ID },
    });
    const before = JSON.stringify(lowStrengthInput);
    const low = createCharacter(lowStrengthInput);
    expect(derived(low).species?.speedFeet).toBe(20);
    expect(JSON.stringify(lowStrengthInput)).toBe(before);

    window.localStorage.clear();
    const meets = createCharacter(fighterInput({
      level: 1,
      subclassId: undefined,
      abilityScores: { strength: 15 },
      equipment: { equippedArmorId: PLATE_ID },
    }));
    expect(derived(meets).species?.speedFeet).toBe(30);

    window.localStorage.clear();
    const unrelated = createCharacter(fighterInput({
      level: 1,
      subclassId: undefined,
      abilityScores: { strength: 8 },
      equipment: { equippedArmorId: LEATHER_ID },
    }));
    expect(derived(unrelated).species?.speedFeet).toBe(30);
  });

  it('composes Barbarian Fast Movement with Species Speed and armor restrictions at level 5', () => {
    const level4 = classCharacter('barbarian', 4);
    expect(derived(level4).species?.speedFeet).toBe(30);

    window.localStorage.clear();
    const level5 = classCharacter('barbarian', 5);
    expect(derived(level5).species?.speedFeet).toBe(40);

    window.localStorage.clear();
    const mediumArmor = classCharacter('barbarian', 5, { equipment: { equippedArmorId: LEATHER_ID } });
    expect(derived(mediumArmor).species?.speedFeet).toBe(40);

    window.localStorage.clear();
    const heavyArmor = classCharacter('barbarian', 5, {
      abilityScores: { strength: 13 },
      equipment: { equippedArmorId: CHAIN_MAIL_ID },
    });
    expect(derived(heavyArmor).species?.speedFeet).toBe(30);

    window.localStorage.clear();
    const heavyAndWeak = classCharacter('barbarian', 5, {
      abilityScores: { strength: 12 },
      equipment: { equippedArmorId: CHAIN_MAIL_ID },
    });
    expect(derived(heavyAndWeak).species?.speedFeet).toBe(20);
  });

  it('applies Monk Unarmored Movement at exact progression levels and suppresses it for armor or Shield', () => {
    const level2 = classCharacter('monk', 2);
    expect(derived(level2).species?.speedFeet).toBe(40);

    window.localStorage.clear();
    const level6 = classCharacter('monk', 6);
    expect(derived(level6).species?.speedFeet).toBe(45);

    window.localStorage.clear();
    const level18 = classCharacter('monk', 18);
    expect(derived(level18).species?.speedFeet).toBe(60);

    window.localStorage.clear();
    const shielded = classCharacter('monk', 6, { equipment: { equippedShieldId: SHIELD_ID } });
    expect(derived(shielded).species?.speedFeet).toBe(30);

    window.localStorage.clear();
    const armored = classCharacter('monk', 6, { equipment: { equippedArmorId: LEATHER_ID } });
    expect(derived(armored).species?.speedFeet).toBe(30);
  });

  it('applies Ranger Roving walking Speed starting at level 6 and suppresses it in Heavy armor', () => {
    const level5 = classCharacter('ranger', 5);
    expect(derived(level5).species?.speedFeet).toBe(30);

    window.localStorage.clear();
    const level6 = classCharacter('ranger', 6);
    expect(derived(level6).species?.speedFeet).toBe(40);

    window.localStorage.clear();
    const heavy = classCharacter('ranger', 6, { abilityScores: { strength: 13 }, equipment: { equippedArmorId: CHAIN_MAIL_ID } });
    expect(derived(heavy).species?.speedFeet).toBe(30);
    expect(derived(heavy).classState!.acquiredFeatures.find((feature) => feature.name === 'Roving')?.referenceEffects[0]?.name).toBe('Roving Climb and Swim Speeds');
  });

  it('adds all-save proficiency only when Monk Disciplined Survivor is acquired at level 14', () => {
    const level13 = derived(classCharacter('monk', 13));
    expect(Object.values(level13.savingThrows).filter((save) => save.proficient).map((save) => save.ability).sort()).toEqual(['dexterity', 'strength']);

    window.localStorage.clear();
    const level14 = derived(classCharacter('monk', 14));
    expect(Object.values(level14.savingThrows).every((save) => save.proficient)).toBe(true);
    const feature = level14.classState!.acquiredFeatures.find((candidate) => candidate.name === 'Disciplined Survivor');
    expect(feature?.automatedEffects).toContainEqual({
      type: 'saving-throw-proficiency',
      abilities: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'],
    });
    expect(feature?.referenceEffects[0]?.name).toBe('Disciplined Survivor Reroll');
  });

  it('adds Rogue Slippery Mind Wisdom and Charisma save proficiency only from level 15', () => {
    const level14 = derived(classCharacter('rogue', 14));
    expect(level14.savingThrows.wisdom.proficient).toBe(false);
    expect(level14.savingThrows.charisma.proficient).toBe(false);

    window.localStorage.clear();
    const level15 = derived(classCharacter('rogue', 15));
    expect(level15.savingThrows.wisdom.proficient).toBe(true);
    expect(level15.savingThrows.charisma.proficient).toBe(true);
  });

  it('derives Champion weapon critical thresholds at the exact acquired levels without automating Survivor', () => {
    const level2 = createCharacter(fighterInput({ level: 2, subclassId: undefined }));
    expect(deriveWeaponCriticalThreshold(derived(level2))).toBe(20);

    window.localStorage.clear();
    const level3 = createCharacter(fighterInput({ level: 3 }));
    expect(deriveWeaponCriticalThreshold(derived(level3))).toBe(19);

    window.localStorage.clear();
    const level14 = createCharacter(fighterInput({ level: 14 }));
    expect(deriveWeaponCriticalThreshold(derived(level14))).toBe(19);

    window.localStorage.clear();
    const level15 = createCharacter(fighterInput({ level: 15 }));
    expect(deriveWeaponCriticalThreshold(derived(level15))).toBe(18);

    window.localStorage.clear();
    const level18 = derived(createCharacter(fighterInput({ level: 18 })));
    const survivor = level18.subclass?.acquiredFeatures.find((feature) => feature.name === 'Survivor');
    expect(survivor?.automatedEffects).toEqual([]);
    expect(survivor?.referenceEffects.map((effect) => effect.name)).toEqual(['Defy Death', 'Heroic Rally']);
  });

  it('deduplicates same-direction static D20 sources and resolves opposing sources before passive adjustment', () => {
    const sources = [
      { contentId: 'homebrew:test:a', name: 'First Watch', effects: [{ type: 'skill-check-advantage' as const, skillIds: ['perception' as const] }] },
      { contentId: 'homebrew:test:b', name: 'First Watch', effects: [{ type: 'skill-check-advantage' as const, skillIds: ['perception' as const] }] },
      { contentId: 'homebrew:test:c', name: 'Fog', effects: [{ type: 'saving-throw-roll-mode' as const, abilities: ['wisdom' as const], mode: 'disadvantage' as const }] },
    ];
    expect(deriveStaticD20Context(sources, { kind: 'skill-check', skillId: 'perception' })).toEqual({ advantageSources: ['First Watch'] });
  });

  it('keeps derived Speed contextual and out of persisted Character fields', () => {
    const barbarian = classCharacter('barbarian', 5);
    const state = derived(barbarian);
    expect(state.species?.speedFeet).toBe(40);
    expect(barbarian).not.toHaveProperty('speedFeet');
    expect(barbarian.playState).not.toHaveProperty('speedFeet');

    const species = state.species!;
    const direct = deriveCharacterSpeed(species.speedFeet - 10, barbarian, contentRegistry, state.ruleEffectSources);
    expect(direct.speedFeet).toBe(40);
    expect(direct.contributions).toContainEqual({ label: 'Fast Movement', amount: 10 });
  });
});
