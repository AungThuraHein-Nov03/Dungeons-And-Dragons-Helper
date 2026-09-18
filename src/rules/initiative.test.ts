import { describe, expect, it } from 'vitest';
import { SRD_CONTENT, srdId } from '../content/srd';
import type { ClassContent } from '../models/content';
import { ContentRegistry, contentRegistry } from '../services/contentRegistry';
import { fighterCharacter } from '../test/fixtures';
import { deriveCharacterState } from './deriveCharacter';

const BARD_ID = srdId('class', 'bard');
const BARBARIAN_ID = srdId('class', 'barbarian');
const CRIMINAL_ID = srdId('background', 'criminal');

function derived(character: ReturnType<typeof fighterCharacter>, registry = contentRegistry) {
  const result = deriveCharacterState(character, registry);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('M13A Initiative derivation', () => {
  it('derives base Dexterity Initiative including negative modifiers', () => {
    const state = derived(fighterCharacter({ level: 1, subclassId: undefined, abilityScores: { dexterity: 8 } }));
    expect(state.initiative).toMatchObject({ baseModifier: -1, modifier: -1, proficiency: 'none', contributions: [] });
  });

  it('applies Jack of All Trades half proficiency when Initiative is not already proficient', () => {
    const state = derived(fighterCharacter({ classId: BARD_ID, subclassId: undefined, level: 2 }));
    expect(state.initiative).toMatchObject({ baseModifier: 4, modifier: 5, proficiency: 'half' });
    expect(state.initiative.contributions).toEqual([{ label: 'Jack of All Trades', amount: 1 }]);
  });

  it('lets full Initiative proficiency suppress half proficiency without double counting', () => {
    const state = derived(fighterCharacter({
      classId: BARD_ID,
      subclassId: undefined,
      level: 2,
      backgroundId: CRIMINAL_ID,
      backgroundAbilityChoice: { mode: 'two-one', plusTwo: 'dexterity', plusOne: 'constitution' },
    }));
    expect(state.initiative.proficiency).toBe('full');
    expect(state.initiative.contributions).toContainEqual({ label: 'Alert', amount: 2 });
    expect(state.initiative.contributions.some((entry) => entry.label === 'Jack of All Trades')).toBe(false);
  });

  it('derives Champion and Feral Instinct Initiative Advantage through the same typed effect', () => {
    expect(derived(fighterCharacter({ level: 3 })).initiative.advantageSources).toEqual(['Remarkable Athlete']);
    expect(derived(fighterCharacter({ classId: BARBARIAN_ID, subclassId: undefined, level: 7 })).initiative.advantageSources).toEqual(['Feral Instinct']);
  });
});

describe('M13A unrelated Homebrew Initiative conformance', () => {
  const SOURCE = { type: 'homebrew', namespace: 'm13a-lantern' } as const;
  const CLASS_ID = 'homebrew:m13a-lantern:class:wayfinder';
  const homebrewClass: ClassContent = {
    id: CLASS_ID,
    kind: 'class',
    name: 'Wayfinder',
    source: SOURCE,
    hitDie: 8,
    fixedHitPointsPerLevel: 5,
    primaryAbility: { mode: 'one-of', abilities: ['wisdom'] },
    savingThrowProficiencies: ['wisdom', 'charisma'],
    weaponProficiencies: [{ kind: 'category', category: 'simple' }],
    armorTraining: [],
    toolProficiencies: [],
    skillChoices: { choose: 1, from: ['perception'] },
    startingEquipment: [{ id: 'A', items: [], currency: { amount: 0, unit: 'gp' } }],
    progression: Array.from({ length: 20 }, (_, index) => ({
      level: index + 1,
      proficiencyBonus: index + 1 >= 17 ? 6 : index + 1 >= 13 ? 5 : index + 1 >= 9 ? 4 : index + 1 >= 5 ? 3 : 2,
      features: index === 0 ? [
        { id: 'homebrew:m13a-lantern:class-feature:quick-start', name: 'Quick Start', description: 'Synthetic Initiative bonus.', effects: [{ type: 'initiative-modifier', amount: 3 }], referenceEffects: [] },
        { id: 'homebrew:m13a-lantern:class-feature:trained-start', name: 'Trained Start', description: 'Synthetic Initiative proficiency.', effects: [{ type: 'initiative-proficiency' }], referenceEffects: [] },
        { id: 'homebrew:m13a-lantern:class-feature:bright-start', name: 'Bright Start', description: 'Synthetic Initiative Advantage.', effects: [{ type: 'initiative-roll-mode', mode: 'advantage' }], referenceEffects: [] },
        { id: 'homebrew:m13a-lantern:class-feature:heavy-start', name: 'Heavy Start', description: 'Synthetic Initiative Disadvantage.', effects: [{ type: 'initiative-roll-mode', mode: 'disadvantage' }], referenceEffects: [] },
        { id: 'homebrew:m13a-lantern:class-feature:steady-climb', name: 'Steady Climb', description: 'Synthetic generic skill Advantage.', effects: [{ type: 'skill-check-advantage', skillIds: ['athletics'] }], referenceEffects: [] },
      ] : [],
    })),
    resources: [],
  };

  it('derives numeric, proficiency, opposing roll-mode, and generic skill effects without SRD identity branches', () => {
    const registry = new ContentRegistry(SRD_CONTENT, [homebrewClass]);
    const state = derived(fighterCharacter({ classId: CLASS_ID, subclassId: undefined, level: 1 }), registry);
    expect(state.initiative.proficiency).toBe('full');
    expect(state.initiative.contributions).toEqual([
      { label: 'Quick Start', amount: 3 },
      { label: 'Trained Start', amount: 2 },
    ]);
    expect(state.initiative.advantageSources).toEqual(['Bright Start']);
    expect(state.initiative.disadvantageSources).toEqual(['Heavy Start']);
    expect(state.ruleEffectSources.find((source) => source.name === 'Steady Climb')?.effects).toEqual([{ type: 'skill-check-advantage', skillIds: ['athletics'] }]);
  });

  it('rejects malformed generic Initiative metadata through normal ContentRegistry validation', () => {
    const malformed = structuredClone(homebrewClass) as ClassContent;
    const feature = malformed.progression[0].features[0];
    (feature.effects as unknown as Array<unknown>)[0] = { type: 'initiative-modifier', amount: Number.POSITIVE_INFINITY };
    expect(() => new ContentRegistry(SRD_CONTENT, [malformed])).toThrow(/Initiative modifier/i);

    const malformedMode = structuredClone(homebrewClass) as ClassContent;
    const modeFeature = malformedMode.progression[0].features[2];
    (modeFeature.effects as unknown as Array<unknown>)[0] = { type: 'initiative-roll-mode', mode: 'sideways' };
    expect(() => new ContentRegistry(SRD_CONTENT, [malformedMode])).toThrow(/Initiative roll-mode/i);
  });
});
