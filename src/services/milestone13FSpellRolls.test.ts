import { beforeEach, describe, expect, it } from 'vitest';
import { SRD_CONTENT, srdId } from '../content/srd';
import { applyOptionalDiceTransformation, listEligibleOptionalDiceTransformations } from '../dice/diceEngine';
import type { Character } from '../models/character';
import type { SpellContent, SpellcastingProviderDefinition } from '../models/content';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { deriveSpellcastingProviders } from '../rules/spellcasting';
import type { DerivedCharacterState } from '../rules/types';
import { fighterCharacter } from '../test/fixtures';
import { ContentRegistry, contentRegistry } from './contentRegistry';
import { loadPlaySessionState, savePlaySessionState } from './playSessionState';
import { loadRollHistory } from './rollHistory';
import { rollSpellAttack, rollSpellDamage, rollSpellHealing } from './spellRolls';

const RAY_OF_FROST = srdId('spell', 'ray-of-frost');
const CHILL_TOUCH = srdId('spell', 'chill-touch');
const ACID_SPLASH = srdId('spell', 'acid-splash');
const FIREBALL = srdId('spell', 'fireball');
const HEALING_WORD = srdId('spell', 'healing-word');
const DETECT_MAGIC = srdId('spell', 'detect-magic');
const HALFLING_ID = srdId('species', 'halfling');
const HALFLING_LUCK_ID = srdId('dice-transformation', 'halfling:luck');

const WIS_PROVIDER_ID = 'homebrew:m13f-d:spellcasting-provider:wisdom';
const INT_PROVIDER_ID = 'homebrew:m13f-d:spellcasting-provider:intelligence';
const SLOT_PREFIX = 'homebrew:m13f-d:spell-slot';

function dieValue(value: number, die: number) {
  return () => (value - 1) / die;
}

function providerDefinition(id: string, ability: 'wisdom' | 'intelligence', spellIds: readonly string[]): SpellcastingProviderDefinition {
  return {
    id,
    name: ability === 'wisdom' ? 'Wisdom Test Casting' : 'Intelligence Test Casting',
    spellcastingAbility: { kind: 'fixed', ability },
    multiclassSlotContribution: { kind: 'independent' },
    spellManagement: { kind: 'granted-only', spellIds },
    slotPool: {
      id: `${id}:slots`,
      name: 'Acceptance Slots',
      slotLevels: [
        { spellLevel: 1, resourceId: `${SLOT_PREFIX}:1`, name: 'Level 1 Spell Slots' },
        { spellLevel: 2, resourceId: `${SLOT_PREFIX}:2`, name: 'Level 2 Spell Slots' },
        { spellLevel: 3, resourceId: `${SLOT_PREFIX}:3`, name: 'Level 3 Spell Slots' },
        { spellLevel: 4, resourceId: `${SLOT_PREFIX}:4`, name: 'Level 4 Spell Slots' },
        { spellLevel: 5, resourceId: `${SLOT_PREFIX}:5`, name: 'Level 5 Spell Slots' },
      ],
      progression: [{
        level: 1,
        slots: [
          { spellLevel: 1, maximum: 4 },
          { spellLevel: 2, maximum: 3 },
          { spellLevel: 3, maximum: 3 },
          { spellLevel: 4, maximum: 2 },
          { spellLevel: 5, maximum: 2 },
        ],
      }],
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
    ritualCasting: 'none',
  };
}

function derivedSpellState(
  character: Character = fighterCharacter({ level: 11 }),
  registry: ContentRegistry = contentRegistry,
  spellIds: readonly string[] = [RAY_OF_FROST, CHILL_TOUCH, ACID_SPLASH, FIREBALL, HEALING_WORD],
) {
  const base = deriveCharacterState(character, registry);
  if (!base.ok) throw new Error(base.error.message);

  const wisdom = providerDefinition(WIS_PROVIDER_ID, 'wisdom', spellIds);
  const intelligence = providerDefinition(INT_PROVIDER_ID, 'intelligence', spellIds);
  const casting = deriveSpellcastingProviders([
    { definition: wisdom, source: { type: 'homebrew', namespace: 'm13f-d' }, grantedBy: { contentId: 'homebrew:m13f-d:feature:wisdom-casting', contentName: 'Wisdom Casting' } },
    { definition: intelligence, source: { type: 'homebrew', namespace: 'm13f-d' }, grantedBy: { contentId: 'homebrew:m13f-d:feature:intelligence-casting', contentName: 'Intelligence Casting' } },
  ], base.value.level, base.value.abilityModifiers, base.value.proficiencyBonus, registry);
  if (!casting.ok) throw new Error(casting.error.message);

  return {
    character,
    state: {
      ...base.value,
      spellcasting: casting.value.providers,
      resources: [...base.value.resources, ...casting.value.resources],
    } satisfies DerivedCharacterState,
    wisdomProvider: casting.value.providers.find((provider) => provider.id === WIS_PROVIDER_ID)!,
    intelligenceProvider: casting.value.providers.find((provider) => provider.id === INT_PROVIDER_ID)!,
  };
}

const HOME_ATTACK_ID = 'homebrew:m13f-d:spell:prism-bolt';
const HOME_SAVE_ID = 'homebrew:m13f-d:spell:echo-burst';
const HOME_HEAL_ID = 'homebrew:m13f-d:spell:mending-light';

const HOME_SOURCE = { type: 'homebrew', namespace: 'm13f-d' } as const;
const HOME_COMMON = {
  kind: 'spell' as const,
  source: HOME_SOURCE,
  school: 'evocation' as const,
  castingTime: 'Action',
  range: '60 feet',
  components: { verbal: true, somatic: true, material: false },
  duration: 'Instantaneous',
  concentration: false,
  ritual: false,
  spellLists: [{ id: 'm13f-d', name: 'M13F-D Test List' }],
  referenceEffects: [],
};

const HOME_SPELLS: readonly SpellContent[] = [
  {
    ...HOME_COMMON,
    id: HOME_ATTACK_ID,
    name: 'Prism Bolt',
    level: 0,
    description: 'Synthetic mechanic-driven attack cantrip.',
    mechanics: [
      { type: 'spell-attack', attackType: 'ranged' },
      {
        type: 'damage',
        amount: { dice: [{ count: 1, die: 8 }], modifier: 'none' },
        damageType: 'force',
        scaling: {
          kind: 'character-level-dice',
          values: [
            { level: 1, dice: [{ count: 1, die: 8 }] },
            { level: 5, dice: [{ count: 2, die: 8 }] },
            { level: 11, dice: [{ count: 3, die: 8 }] },
            { level: 17, dice: [{ count: 4, die: 8 }] },
          ],
        },
      },
    ],
  },
  {
    ...HOME_COMMON,
    id: HOME_SAVE_ID,
    name: 'Echo Burst',
    level: 1,
    description: 'Synthetic mechanic-driven saving throw spell.',
    mechanics: [
      { type: 'saving-throw', ability: 'constitution', onSuccess: 'half' },
      {
        type: 'damage',
        amount: { dice: [{ count: 2, die: 6 }], modifier: 'none' },
        damageType: 'thunder',
        scaling: { kind: 'slot-level-dice', baseSpellLevel: 1, dicePerLevel: [{ count: 1, die: 6 }] },
      },
    ],
  },
  {
    ...HOME_COMMON,
    id: HOME_HEAL_ID,
    name: 'Mending Light',
    level: 1,
    description: 'Synthetic mechanic-driven healing spell.',
    mechanics: [
      {
        type: 'healing',
        amount: { dice: [{ count: 1, die: 4 }], modifier: 'spellcasting-ability' },
        scaling: { kind: 'slot-level-dice', baseSpellLevel: 1, dicePerLevel: [{ count: 1, die: 4 }] },
      },
    ],
  },
];

describe('Milestone 13F-D real spell roll and generic acceptance', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('runs promoted ranged and melee spell attacks through provider modifiers and cantrip scaling', () => {
    const { character, state, wisdomProvider } = derivedSpellState();

    const rangedAttack = rollSpellAttack(character, state, WIS_PROVIDER_ID, RAY_OF_FROST, 'normal', { rng: dieValue(12, 20) });
    expect(rangedAttack).toMatchObject({
      ok: true,
      value: { roll: { keptD20: 12, modifier: wisdomProvider.attackModifier, total: 12 + wisdomProvider.attackModifier, request: { label: 'Ray of Frost — Spell Attack' } } },
    });

    const rangedDamage = rollSpellDamage(character, state, WIS_PROVIDER_ID, RAY_OF_FROST, undefined, false, { rng: dieValue(4, 8) });
    expect(rangedDamage).toMatchObject({
      ok: true,
      value: { roll: { dice: [{ die: 8, values: [4, 4, 4] }], total: 12, request: { outcome: { kind: 'damage', damageType: 'cold' } } } },
    });

    const meleeAttack = rollSpellAttack(character, state, WIS_PROVIDER_ID, CHILL_TOUCH, 'normal', { rng: dieValue(10, 20) });
    expect(meleeAttack).toMatchObject({ ok: true, value: { roll: { modifier: wisdomProvider.attackModifier } } });

    const meleeDamage = rollSpellDamage(character, state, WIS_PROVIDER_ID, CHILL_TOUCH, undefined, false, { rng: dieValue(5, 10) });
    expect(meleeDamage).toMatchObject({
      ok: true,
      value: { roll: { dice: [{ die: 10, values: [5, 5, 5] }], total: 15, request: { outcome: { damageType: 'necrotic' } } } },
    });
  });

  it('uses promoted save metadata for both no-damage and half-damage success behavior with provider-specific DCs', () => {
    const { state, wisdomProvider, intelligenceProvider } = derivedSpellState();
    expect(wisdomProvider.saveDc).toBe(13);
    expect(intelligenceProvider.saveDc).toBe(12);

    const acidSplash = wisdomProvider.spells.find((spell) => spell.id === ACID_SPLASH)!;
    expect(acidSplash.mechanics.find((mechanic) => mechanic.type === 'saving-throw')).toEqual({
      type: 'saving-throw',
      ability: 'dexterity',
      onSuccess: 'none',
    });

    const fireball = intelligenceProvider.spells.find((spell) => spell.id === FIREBALL)!;
    expect(fireball.mechanics.find((mechanic) => mechanic.type === 'saving-throw')).toEqual({
      type: 'saving-throw',
      ability: 'dexterity',
      onSuccess: 'half',
    });
    expect(state.spellcasting.map((provider) => [provider.id, provider.saveDc])).toEqual([
      [WIS_PROVIDER_ID, 13],
      [INT_PROVIDER_ID, 12],
    ]);
  });

  it('rolls promoted Fireball at base and higher slots through existing generic slot scaling', () => {
    const { character, state } = derivedSpellState();

    const base = rollSpellDamage(character, state, WIS_PROVIDER_ID, FIREBALL, 3, false, { rng: dieValue(3, 6) });
    expect(base).toMatchObject({
      ok: true,
      value: { roll: { dice: [{ die: 6, values: Array(8).fill(3) }], total: 24, request: { source: { spellSlotResourceId: `${SLOT_PREFIX}:3` } } } },
    });

    const upcast = rollSpellDamage(character, state, WIS_PROVIDER_ID, FIREBALL, 5, false, { rng: dieValue(4, 6) });
    expect(upcast).toMatchObject({
      ok: true,
      value: { roll: { dice: [{ die: 6, values: Array(10).fill(4) }], total: 40, request: { source: { spellSlotResourceId: `${SLOT_PREFIX}:5` } } } },
    });
  });

  it('rolls promoted Healing Word with the correct provider ability modifier and slot scaling', () => {
    const { character, state, wisdomProvider, intelligenceProvider } = derivedSpellState();

    const base = rollSpellHealing(character, state, WIS_PROVIDER_ID, HEALING_WORD, 1, { rng: dieValue(3, 4) });
    expect(base).toMatchObject({
      ok: true,
      value: { roll: { dice: [{ die: 4, values: [3, 3] }], modifier: wisdomProvider.abilityModifier, total: 6 + wisdomProvider.abilityModifier } },
    });

    const upcast = rollSpellHealing(character, state, WIS_PROVIDER_ID, HEALING_WORD, 3, { rng: dieValue(2, 4) });
    expect(upcast).toMatchObject({
      ok: true,
      value: { roll: { dice: [{ die: 4, values: Array(6).fill(2) }], modifier: wisdomProvider.abilityModifier, total: 12 + wisdomProvider.abilityModifier } },
    });

    const intelligence = rollSpellHealing(character, state, INT_PROVIDER_ID, HEALING_WORD, 1, { rng: dieValue(3, 4) });
    expect(intelligence).toMatchObject({
      ok: true,
      value: { roll: { modifier: intelligenceProvider.abilityModifier, total: 6 + intelligenceProvider.abilityModifier } },
    });
    expect(wisdomProvider.abilityModifier).toBe(1);
    expect(intelligenceProvider.abilityModifier).toBe(0);
  });

  it('uses provider-specific attack modifiers for the same promoted spell', () => {
    const { character, state, wisdomProvider, intelligenceProvider } = derivedSpellState();

    const wisdom = rollSpellAttack(character, state, WIS_PROVIDER_ID, RAY_OF_FROST, 'normal', { rng: dieValue(10, 20) });
    const intelligence = rollSpellAttack(character, state, INT_PROVIDER_ID, RAY_OF_FROST, 'normal', { rng: dieValue(10, 20) });

    expect(wisdom).toMatchObject({ ok: true, value: { roll: { modifier: wisdomProvider.attackModifier, total: 10 + wisdomProvider.attackModifier } } });
    expect(intelligence).toMatchObject({ ok: true, value: { roll: { modifier: intelligenceProvider.attackModifier, total: 10 + intelligenceProvider.attackModifier } } });
    expect(wisdomProvider.attackModifier).toBe(5);
    expect(intelligenceProvider.attackModifier).toBe(4);
  });

  it('reuses existing critical damage doubling for promoted spell-attack damage', () => {
    const { character, state } = derivedSpellState();
    const critical = rollSpellDamage(character, state, WIS_PROVIDER_ID, RAY_OF_FROST, undefined, true, { rng: dieValue(4, 8) });

    expect(critical).toMatchObject({
      ok: true,
      value: {
        roll: {
          dice: [{ die: 8, values: [4, 4, 4, 4, 4, 4] }],
          total: 24,
          request: { label: 'Ray of Frost — Damage — Critical', outcome: { kind: 'damage', damageType: 'cold' } },
        },
      },
    });
  });

  it('continues to expose and apply M13E d20 transformations on promoted spell attacks', () => {
    const halfling = fighterCharacter({
      level: 11,
      speciesId: HALFLING_ID,
      speciesChoices: {},
      speciesSkillProficiencies: [],
    });
    const { state } = derivedSpellState(halfling);

    const rolled = rollSpellAttack(halfling, state, WIS_PROVIDER_ID, RAY_OF_FROST, 'normal', { rng: dieValue(1, 20) });
    expect(rolled).toMatchObject({ ok: true, value: { roll: { keptD20: 1, natural: 'nat1', critical: false } } });
    if (!rolled.ok) throw new Error('Expected promoted spell attack roll.');

    expect(rolled.value.roll.request.diceTransformations?.map((entry) => entry.id)).toContain(HALFLING_LUCK_ID);
    expect(listEligibleOptionalDiceTransformations(rolled.value.roll).map((entry) => entry.id)).toContain(HALFLING_LUCK_ID);

    const transformed = applyOptionalDiceTransformation(rolled.value.roll, HALFLING_LUCK_ID, dieValue(20, 20));
    expect(transformed).toMatchObject({
      ok: true,
      value: {
        keptD20: 20,
        natural: 'nat20',
        critical: true,
        diceTransformationApplications: [expect.objectContaining({ original: 1, replacement: 20, final: 20 })],
      },
    });
  });

  it('records promoted spell provenance in Roll History through the existing history model', () => {
    const { character, state } = derivedSpellState();

    const result = rollSpellDamage(character, state, WIS_PROVIDER_ID, FIREBALL, 3, false, {
      rng: dieValue(5, 6),
      historyStorage: window.localStorage,
      now: () => new Date('2026-09-19T00:00:00.000Z'),
    });
    expect(result.ok).toBe(true);

    const history = loadRollHistory(window.localStorage);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      rolledAt: '2026-09-19T00:00:00.000Z',
      result: {
        request: {
          type: 'damage',
          label: 'Fireball — Damage · Level 3',
          source: {
            characterId: character.id,
            contentId: FIREBALL,
            spellId: FIREBALL,
            spellcastingProviderId: WIS_PROVIDER_ID,
            spellSlotResourceId: `${SLOT_PREFIX}:3`,
          },
          outcome: { kind: 'damage', damageType: 'fire' },
        },
        dice: [{ die: 6, values: Array(8).fill(5) }],
        modifier: 0,
        total: 40,
        effects: [],
      },
    });
  });

  it('keeps rolling separate from slot expenditure, Concentration, target state, and unsupported riders', () => {
    const character = fighterCharacter({
      level: 11,
      playState: {
        currentHp: 50,
        temporaryHp: 7,
        hitDiceRemaining: 6,
        resourceUses: {
          [`${SLOT_PREFIX}:3`]: 2,
          [`${SLOT_PREFIX}:5`]: 1,
        },
      },
    });
    const { state, wisdomProvider } = derivedSpellState(character);
    const beforePlayState = structuredClone(character.playState);
    const beforeSession = savePlaySessionState(character.id, {
      conditions: ['poisoned'],
      concentration: { spellId: DETECT_MAGIC, providerId: WIS_PROVIDER_ID },
      activeEffectIds: [],
    }, window.sessionStorage);

    const roll = rollSpellDamage(character, state, WIS_PROVIDER_ID, FIREBALL, 3, false, {
      rng: dieValue(2, 6),
      historyStorage: window.localStorage,
    });
    expect(roll).toMatchObject({ ok: true, value: { roll: { effects: [] } } });

    expect(character.playState).toEqual(beforePlayState);
    expect(character.playState.resourceUses[`${SLOT_PREFIX}:3`]).toBe(2);
    expect(loadPlaySessionState(character.id, window.sessionStorage)).toEqual(beforeSession);

    const fireball = wisdomProvider.spells.find((spell) => spell.id === FIREBALL)!;
    expect(fireball.referenceEffects.map((effect) => effect.id)).toEqual(['area-targeting', 'flammable-objects']);
    expect(Object.keys(character.playState).sort()).toEqual(['currentHp', 'hitDiceRemaining', 'resourceUses', 'temporaryHp']);
    expect(Object.keys(beforeSession).sort()).toEqual(['activeEffectIds', 'concentration', 'conditions']);
    expect(roll.ok && roll.value.roll.request.source).not.toHaveProperty('targetId');
    expect(roll.ok && roll.value.roll).not.toHaveProperty('target');
    expect(roll.ok && roll.value.roll).not.toHaveProperty('duration');
    expect(roll.ok && roll.value.roll).not.toHaveProperty('round');
    expect(roll.ok && roll.value.roll).not.toHaveProperty('turn');
  });

  it('accepts equivalent synthetic Homebrew spell mechanics through the same generic runtime pipeline', () => {
    const registry = new ContentRegistry(SRD_CONTENT, HOME_SPELLS);
    const character = fighterCharacter({ level: 11 });
    const { state, wisdomProvider } = derivedSpellState(character, registry, [HOME_ATTACK_ID, HOME_SAVE_ID, HOME_HEAL_ID]);

    const attack = rollSpellAttack(character, state, WIS_PROVIDER_ID, HOME_ATTACK_ID, 'normal', { rng: dieValue(13, 20) });
    expect(attack).toMatchObject({ ok: true, value: { roll: { modifier: wisdomProvider.attackModifier, request: { source: { spellId: HOME_ATTACK_ID } } } } });

    const attackDamage = rollSpellDamage(character, state, WIS_PROVIDER_ID, HOME_ATTACK_ID, undefined, false, { rng: dieValue(2, 8) });
    expect(attackDamage).toMatchObject({ ok: true, value: { roll: { dice: [{ die: 8, values: [2, 2, 2] }], total: 6 } } });

    const saveSpell = wisdomProvider.spells.find((spell) => spell.id === HOME_SAVE_ID)!;
    expect(saveSpell.mechanics.find((mechanic) => mechanic.type === 'saving-throw')).toEqual({ type: 'saving-throw', ability: 'constitution', onSuccess: 'half' });
    const saveDamage = rollSpellDamage(character, state, WIS_PROVIDER_ID, HOME_SAVE_ID, 3, false, { rng: dieValue(3, 6) });
    expect(saveDamage).toMatchObject({ ok: true, value: { roll: { dice: [{ die: 6, values: [3, 3, 3, 3] }], total: 12 } } });

    const healing = rollSpellHealing(character, state, WIS_PROVIDER_ID, HOME_HEAL_ID, 2, { rng: dieValue(4, 4) });
    expect(healing).toMatchObject({
      ok: true,
      value: { roll: { dice: [{ die: 4, values: [4, 4] }], modifier: wisdomProvider.abilityModifier, total: 8 + wisdomProvider.abilityModifier } },
    });
  });
});
