import { beforeEach, describe, expect, it } from 'vitest';
import { BARBARIAN_RAGE_ACTIVE_EFFECT_ID, BARBARIAN_RAGE_RESOURCE_ID } from '../content/srd/barbarian';
import { CLERIC_CHANNEL_DIVINITY_RESOURCE_ID, CLERIC_SPELLCASTING_PROVIDER_ID } from '../content/srd/cleric';
import { srdId } from '../content/srd/source';
import { contentRegistry } from '../services/contentRegistry';
import { createCharacter } from '../services/characterStorage';
import { expendCharacterResource, finishCharacterLongRest, finishCharacterShortRest } from '../services/characterPlayState';
import { fighterInput } from '../test/fixtures';
import { deriveCharacterState } from './deriveCharacter';
import { isWeaponProficient } from './weapons';

const barbarianInput = (level = 4) => fighterInput({
  name: 'M11 Barbarian', classId: srdId('class', 'barbarian'), subclassId: level >= 3 ? srdId('subclass', 'barbarian:path-of-the-berserker') : undefined,
  level, skillProficiencies: ['athletics', 'survival'],
});
const clericInput = (level = 6) => fighterInput({
  name: 'M11 Cleric', classId: srdId('class', 'cleric'), subclassId: level >= 3 ? srdId('subclass', 'cleric:life-domain') : undefined,
  level, skillProficiencies: ['insight', 'medicine'], abilityScores: { wisdom: 16 },
});
const rogueInput = (level = 4) => fighterInput({
  name: 'M11 Rogue', classId: srdId('class', 'rogue'), subclassId: level >= 3 ? srdId('subclass', 'rogue:thief') : undefined,
  level, skillProficiencies: ['acrobatics', 'investigation', 'sleight-of-hand', 'stealth'],
});

describe('Milestone 11 generic class derivation', () => {
  beforeEach(() => window.localStorage.clear());

  it('derives Barbarian Rage and Unarmored Defense without class-name branching', () => {
    const character = createCharacter(barbarianInput());
    const state = deriveCharacterState(character, contentRegistry);
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    expect(state.value.health.hitDice).toEqual([{ die: 12, maximum: 4 }]);
    expect(state.value.defense.armorClass).toBe(16); // DEX 18 (+4) + CON 14 (+2) + base 10.
    expect(state.value.resources.find((resource) => resource.id === BARBARIAN_RAGE_RESOURCE_ID)).toMatchObject({ maximumUses: 3 });
    expect(state.value.activeSelfEffects.find((effect) => effect.id === BARBARIAN_RAGE_ACTIVE_EFFECT_ID)?.name).toBe('Rage');
  });

  it('recovers the generic Rage resource by +1 on Short Rest and fully on Long Rest', () => {
    const character = createCharacter(barbarianInput());
    expendCharacterResource(character.id, BARBARIAN_RAGE_RESOURCE_ID);
    expendCharacterResource(character.id, BARBARIAN_RAGE_RESOURCE_ID);
    expect(finishCharacterShortRest(character.id)).toMatchObject({ ok: true, value: { playState: { resourceUses: { [BARBARIAN_RAGE_RESOURCE_ID]: 2 } } } });
    expect(finishCharacterLongRest(character.id)).toMatchObject({ ok: true, value: { playState: { resourceUses: { [BARBARIAN_RAGE_RESOURCE_ID]: 3 } } } });
  });

  it('derives Cleric class Spellcasting from final Wisdom and exposes only catalog coverage, not prepared ownership', () => {
    const character = createCharacter(clericInput());
    const state = deriveCharacterState(character, contentRegistry);
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    const provider = state.value.spellcasting.find((candidate) => candidate.id === CLERIC_SPELLCASTING_PROVIDER_ID);
    expect(provider).toBeDefined();
    expect(provider).toMatchObject({ ability: 'wisdom', abilityModifier: 3, saveDc: 14, attackModifier: 6 });
    expect(provider?.spells).toEqual([]);
    expect(provider?.management).toMatchObject({ kind: 'prepared-from-list', spellListId: 'cleric', cantripCount: 4, preparedSpellCount: 10 });
    if (provider?.management.kind !== 'prepared-from-list') throw new Error('Prepared metadata missing.');
    expect(provider.management.catalogSpells.map((spell) => spell.name)).toEqual(expect.arrayContaining(['Sacred Flame', 'Cure Wounds', 'Guiding Bolt']));
    expect(provider.slotPool?.slots.map((slot) => [slot.spellLevel, slot.maximumUses])).toEqual([[1, 4], [2, 3], [3, 3]]);
  });

  it('gates Life Domain Preserve Life onto the parent Channel Divinity resource at level 3+', () => {
    const level2 = createCharacter(clericInput(2));
    const before = deriveCharacterState(level2, contentRegistry);
    expect(before.ok && before.value.resources.find((resource) => resource.id === CLERIC_CHANNEL_DIVINITY_RESOURCE_ID)?.consumers.map((consumer) => consumer.name)).toEqual(['Divine Spark', 'Turn Undead']);
    const level3 = createCharacter(clericInput(3));
    const after = deriveCharacterState(level3, contentRegistry);
    expect(after.ok && after.value.resources.find((resource) => resource.id === CLERIC_CHANNEL_DIVINITY_RESOURCE_ID)?.consumers.map((consumer) => consumer.name)).toEqual(['Divine Spark', 'Turn Undead', 'Preserve Life']);
  });

  it('uses Rogue property-qualified weapon proficiency rules', () => {
    const character = createCharacter(rogueInput());
    const base = deriveCharacterState(character, contentRegistry);
    expect(base.ok).toBe(true);
    const rogue = contentRegistry.findClass(srdId('class', 'rogue'))!;
    const scimitar = contentRegistry.findWeapon(srdId('weapon', 'scimitar'))!;
    const longsword = contentRegistry.findWeapon(srdId('weapon', 'longsword'))!;
    expect(isWeaponProficient(rogue, scimitar)).toBe(true);
    expect(isWeaponProficient(rogue, longsword)).toBe(false);
    expect(rogue.toolProficiencies.map((tool) => tool.name)).toEqual(['Thieves’ Tools']);
  });
});
