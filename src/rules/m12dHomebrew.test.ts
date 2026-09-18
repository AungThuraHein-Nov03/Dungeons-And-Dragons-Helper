import { describe, expect, it } from 'vitest';
import { SRD_CONTENT, srdId } from '../content/srd';
import type { ClassContent, LeveledSpellLevel, SpellcastingProviderDefinition } from '../models/content';
import { ContentRegistry } from '../services/contentRegistry';
import { fighterCharacter } from '../test/fixtures';
import { deriveCharacterState } from './deriveCharacter';
import { expendResource, finishShortRest, initializePlayState } from './playState';

const SOURCE = { type: 'homebrew', namespace: 'm12d-generic' } as const;
const CLASS_ID = 'homebrew:m12d-generic:class:echo-adept';
const PROVIDER_ID = 'homebrew:m12d-generic:spellcasting-provider:echo-casting';
const SLOT_IDS = {
  1: 'homebrew:m12d-generic:spell-slot:echo:1',
  2: 'homebrew:m12d-generic:spell-slot:echo:2',
  3: 'homebrew:m12d-generic:spell-slot:echo:3',
} as const;

const pactStyleProvider: SpellcastingProviderDefinition = {
  id: PROVIDER_ID,
  name: 'Echo Casting',
  spellcastingAbility: { kind: 'fixed', ability: 'charisma' },
  spellManagement: { kind: 'granted-only', spellIds: [srdId('spell', 'fire-bolt')] },
  slotPool: {
    id: 'homebrew:m12d-generic:spell-slot-pool:echo',
    name: 'Echo Slots',
    slotLevels: ([1, 2, 3] as const).map((spellLevel) => ({
      spellLevel,
      resourceId: SLOT_IDS[spellLevel],
      name: `Level ${spellLevel} Echo Slots`,
    })),
    progression: [
      { level: 1, slots: [{ spellLevel: 1, maximum: 1 }] },
      { level: 3, slots: [{ spellLevel: 2, maximum: 2 }] },
      { level: 5, slots: [{ spellLevel: 3, maximum: 3 }] },
    ],
    recovery: [{ trigger: 'short-rest', mode: 'all' }, { trigger: 'long-rest', mode: 'all' }],
  },
  ritualCasting: 'none',
};

const progression = Array.from({ length: 20 }, (_, index) => ({
  level: index + 1,
  proficiencyBonus: index + 1 >= 17 ? 6 : index + 1 >= 13 ? 5 : index + 1 >= 9 ? 4 : index + 1 >= 5 ? 3 : 2,
  features: index === 0 ? [{
    id: 'homebrew:m12d-generic:class-feature:echo-core',
    name: 'Echo Core',
    description: 'Synthetic M12D generic capability fixture.',
    effects: [{ type: 'hit-point-bonus-per-class-level', amount: 2 }] as const,
    spellcasting: [pactStyleProvider],
    referenceEffects: [],
  }] : [],
}));

const homebrewClass: ClassContent = {
  id: CLASS_ID,
  kind: 'class',
  name: 'Echo Adept',
  source: SOURCE,
  hitDie: 8,
  fixedHitPointsPerLevel: 5,
  primaryAbility: { mode: 'one-of', abilities: ['charisma'] },
  savingThrowProficiencies: ['constitution', 'charisma'],
  weaponProficiencies: [{ kind: 'category', category: 'simple' }],
  armorTraining: [],
  toolProficiencies: [],
  skillChoices: { choose: 2, from: ['arcana', 'insight', 'perception'] },
  startingEquipment: [{ id: 'A', items: [], currency: { amount: 15, unit: 'gp' } }],
  progression,
  resources: [],
};

function deriveAt(level: number, registry: ContentRegistry) {
  const character = fighterCharacter({
    name: `Echo Adept ${level}`,
    classId: CLASS_ID,
    subclassId: undefined,
    level,
    skillProficiencies: ['arcana', 'perception'],
    abilityScores: { constitution: 14, charisma: 16 },
  });
  const result = deriveCharacterState(character, registry);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('Milestone 12D Homebrew generic conformance', () => {
  it('reuses the same generic provider for Pact-style slot level/count progression and Short/Long Rest recovery', () => {
    const registry = new ContentRegistry(SRD_CONTENT, [homebrewClass]);
    const level1 = deriveAt(1, registry);
    const level3 = deriveAt(3, registry);
    const level5 = deriveAt(5, registry);

    expect(level1.spellcasting[0].slotPool?.slots).toEqual([{ spellLevel: 1, resourceId: SLOT_IDS[1], name: 'Level 1 Echo Slots', maximumUses: 1 }]);
    expect(level3.spellcasting[0].slotPool?.slots).toEqual([{ spellLevel: 2, resourceId: SLOT_IDS[2], name: 'Level 2 Echo Slots', maximumUses: 2 }]);
    expect(level5.spellcasting[0].slotPool?.slots).toEqual([{ spellLevel: 3, resourceId: SLOT_IDS[3], name: 'Level 3 Echo Slots', maximumUses: 3 }]);
    expect(level5.spellcasting[0].slotPool?.recovery).toEqual([{ trigger: 'short-rest', mode: 'all' }, { trigger: 'long-rest', mode: 'all' }]);

    const context = { health: level5.health, resources: level5.resources };
    const initial = initializePlayState(context);
    const spentOnce = expendResource(initial, SLOT_IDS[3], level5.resources);
    if (!spentOnce.ok) throw new Error(spentOnce.error.message);
    const spentTwice = expendResource(spentOnce.value, SLOT_IDS[3], level5.resources);
    if (!spentTwice.ok) throw new Error(spentTwice.error.message);
    expect(spentTwice.value.resourceUses[SLOT_IDS[3]]).toBe(1);
    expect(finishShortRest(spentTwice.value, level5.resources)).toMatchObject({ ok: true, value: { resourceUses: { [SLOT_IDS[3]]: 3 } } });
  });

  it('applies the new static HP effect generically through unrelated Homebrew content', () => {
    const registry = new ContentRegistry(SRD_CONTENT, [homebrewClass]);
    const level5 = deriveAt(5, registry);
    expect(level5.ruleEffects).toContainEqual({ type: 'hit-point-bonus-per-class-level', amount: 2 });
    expect(level5.health).toEqual({ maximumHp: 48, hitDie: 8, maximumHitDice: 5 });
  });

  it('rejects malformed HP-effect and slot-progression metadata without source or class-name branches', () => {
    const badHp = structuredClone(homebrewClass);
    const hpEffect = badHp.progression[0].features[0].effects[0];
    if (hpEffect?.type !== 'hit-point-bonus-per-class-level') throw new Error('Synthetic HP effect missing.');
    (hpEffect as { type: 'hit-point-bonus-per-class-level'; amount: number }).amount = 0;
    expect(() => new ContentRegistry(SRD_CONTENT, [badHp])).toThrow(/Hit Point bonus-per-class-level/i);

    const badSlots = structuredClone(homebrewClass);
    const provider = badSlots.progression[0].features[0].spellcasting?.[0];
    if (!provider?.slotPool) throw new Error('Synthetic slot pool missing.');
    (provider.slotPool.progression[0].slots[0] as { spellLevel: LeveledSpellLevel; maximum: number }).maximum = -1;
    expect(() => new ContentRegistry(SRD_CONTENT, [badSlots])).toThrow(/slot progression/i);
  });
});
