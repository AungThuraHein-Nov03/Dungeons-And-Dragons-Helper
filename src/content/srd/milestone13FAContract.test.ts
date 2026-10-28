import { describe, expect, it } from 'vitest';
import type { CharacterPlayState } from '../../models/character';
import type { SpellMechanic } from '../../models/content';
import { CHARACTER_STORAGE_KEY } from '../../services/characterStorage';
import { EMPTY_PLAY_SESSION_STATE, type PlaySessionState } from '../../services/playSessionState';
import { M13F_PROMOTED_SPELL_IDS, M13F_SPELL_AUTOMATION_CONTRACT } from './spellAutomationM13F';
import { SRD_SPELLS, SRD_STRUCTURED_SPELLS } from './spells';
import { SRD_REFERENCE_SPELLS } from './spellsReference.generated';
import { srdId } from './source';

const PROMOTED = [
  ['acid-splash', 'Acid Splash'],
  ['blight', 'Blight'],
  ['chain-lightning', 'Chain Lightning'],
  ['chill-touch', 'Chill Touch'],
  ['circle-of-death', 'Circle of Death'],
  ['cone-of-cold', 'Cone of Cold'],
  ['dissonant-whispers', 'Dissonant Whispers'],
  ['fire-storm', 'Fire Storm'],
  ['fireball', 'Fireball'],
  ['healing-word', 'Healing Word'],
  ['inflict-wounds', 'Inflict Wounds'],
  ['lightning-bolt', 'Lightning Bolt'],
  ['mass-cure-wounds', 'Mass Cure Wounds'],
  ['mass-healing-word', 'Mass Healing Word'],
  ['poison-spray', 'Poison Spray'],
  ['ray-of-frost', 'Ray of Frost'],
  ['ray-of-sickness', 'Ray of Sickness'],
  ['shatter', 'Shatter'],
  ['shocking-grasp', 'Shocking Grasp'],
  ['starry-wisp', 'Starry Wisp'],
  ['thunderwave', 'Thunderwave'],
  ['vicious-mockery', 'Vicious Mockery'],
] as const;

const ANCHORS = ['fire-bolt', 'sacred-flame', 'cure-wounds', 'guiding-bolt', 'burning-hands', 'detect-magic'] as const;

const d = (count: number, die: 4 | 6 | 8 | 10 | 12) => ({ count, die });
const cantrip = (die: 4 | 6 | 8 | 10 | 12) => ({
  kind: 'character-level-dice' as const,
  values: [
    { level: 1, dice: [d(1, die)] },
    { level: 5, dice: [d(2, die)] },
    { level: 11, dice: [d(3, die)] },
    { level: 17, dice: [d(4, die)] },
  ],
});
const slot = (baseSpellLevel: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, count: number, die: 4 | 6 | 8 | 10 | 12) => ({
  kind: 'slot-level-dice' as const,
  baseSpellLevel,
  dicePerLevel: [d(count, die)],
});

const EXPECTED_MECHANICS: Record<string, readonly SpellMechanic[]> = {
  'acid-splash': [
    { type: 'saving-throw', ability: 'dexterity', onSuccess: 'none' },
    { type: 'damage', amount: { dice: [d(1, 6)], modifier: 'none' }, damageType: 'acid', scaling: cantrip(6) },
  ],
  blight: [
    { type: 'saving-throw', ability: 'constitution', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [d(8, 8)], modifier: 'none' }, damageType: 'necrotic', scaling: slot(4, 1, 8) },
  ],
  'chain-lightning': [
    { type: 'saving-throw', ability: 'dexterity', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [d(10, 8)], modifier: 'none' }, damageType: 'lightning' },
  ],
  'chill-touch': [
    { type: 'spell-attack', attackType: 'melee' },
    { type: 'damage', amount: { dice: [d(1, 10)], modifier: 'none' }, damageType: 'necrotic', scaling: cantrip(10) },
  ],
  'circle-of-death': [
    { type: 'saving-throw', ability: 'constitution', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [d(8, 8)], modifier: 'none' }, damageType: 'necrotic', scaling: slot(6, 2, 8) },
  ],
  'cone-of-cold': [
    { type: 'saving-throw', ability: 'constitution', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [d(8, 8)], modifier: 'none' }, damageType: 'cold', scaling: slot(5, 1, 8) },
  ],
  'dissonant-whispers': [
    { type: 'saving-throw', ability: 'wisdom', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [d(3, 6)], modifier: 'none' }, damageType: 'psychic', scaling: slot(1, 1, 6) },
  ],
  'fire-storm': [
    { type: 'saving-throw', ability: 'dexterity', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [d(7, 10)], modifier: 'none' }, damageType: 'fire' },
  ],
  fireball: [
    { type: 'saving-throw', ability: 'dexterity', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [d(8, 6)], modifier: 'none' }, damageType: 'fire', scaling: slot(3, 1, 6) },
  ],
  'healing-word': [
    { type: 'healing', amount: { dice: [d(2, 4)], modifier: 'spellcasting-ability' }, scaling: slot(1, 2, 4) },
  ],
  'inflict-wounds': [
    { type: 'saving-throw', ability: 'constitution', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [d(2, 10)], modifier: 'none' }, damageType: 'necrotic', scaling: slot(1, 1, 10) },
  ],
  'lightning-bolt': [
    { type: 'saving-throw', ability: 'dexterity', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [d(8, 6)], modifier: 'none' }, damageType: 'lightning', scaling: slot(3, 1, 6) },
  ],
  'mass-cure-wounds': [
    { type: 'healing', amount: { dice: [d(5, 8)], modifier: 'spellcasting-ability' }, scaling: slot(5, 1, 8) },
  ],
  'mass-healing-word': [
    { type: 'healing', amount: { dice: [d(2, 4)], modifier: 'spellcasting-ability' }, scaling: slot(3, 1, 4) },
  ],
  'poison-spray': [
    { type: 'spell-attack', attackType: 'ranged' },
    { type: 'damage', amount: { dice: [d(1, 12)], modifier: 'none' }, damageType: 'poison', scaling: cantrip(12) },
  ],
  'ray-of-frost': [
    { type: 'spell-attack', attackType: 'ranged' },
    { type: 'damage', amount: { dice: [d(1, 8)], modifier: 'none' }, damageType: 'cold', scaling: cantrip(8) },
  ],
  'ray-of-sickness': [
    { type: 'spell-attack', attackType: 'ranged' },
    { type: 'damage', amount: { dice: [d(2, 8)], modifier: 'none' }, damageType: 'poison', scaling: slot(1, 1, 8) },
  ],
  shatter: [
    { type: 'saving-throw', ability: 'constitution', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [d(3, 8)], modifier: 'none' }, damageType: 'thunder', scaling: slot(2, 1, 8) },
  ],
  'shocking-grasp': [
    { type: 'spell-attack', attackType: 'melee' },
    { type: 'damage', amount: { dice: [d(1, 8)], modifier: 'none' }, damageType: 'lightning', scaling: cantrip(8) },
  ],
  'starry-wisp': [
    { type: 'spell-attack', attackType: 'ranged' },
    { type: 'damage', amount: { dice: [d(1, 8)], modifier: 'none' }, damageType: 'radiant', scaling: cantrip(8) },
  ],
  thunderwave: [
    { type: 'saving-throw', ability: 'constitution', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [d(2, 8)], modifier: 'none' }, damageType: 'thunder', scaling: slot(1, 1, 8) },
  ],
  'vicious-mockery': [
    { type: 'saving-throw', ability: 'wisdom', onSuccess: 'none' },
    { type: 'damage', amount: { dice: [d(1, 6)], modifier: 'none' }, damageType: 'psychic', scaling: cantrip(6) },
  ],
};

const EXPECTED_REFERENCE_IDS: Record<string, readonly string[]> = {
  'acid-splash': ['area-targeting'],
  blight: ['plant-creature-save', 'noncreature-plant'],
  'chain-lightning': ['secondary-targets', 'upcast-target-count'],
  'chill-touch': ['healing-prevention'],
  'circle-of-death': ['area-targeting'],
  'cone-of-cold': ['area-targeting', 'frozen-statue'],
  'dissonant-whispers': ['forced-reaction-movement'],
  'fire-storm': ['cube-layout', 'flammable-objects'],
  fireball: ['area-targeting', 'flammable-objects'],
  'healing-word': ['target-application'],
  'inflict-wounds': ['target-application'],
  'lightning-bolt': ['line-targeting'],
  'mass-cure-wounds': ['multi-target-healing'],
  'mass-healing-word': ['multi-target-healing'],
  'poison-spray': ['target-application'],
  'ray-of-frost': ['speed-reduction'],
  'ray-of-sickness': ['poisoned-condition'],
  shatter: ['construct-save-disadvantage', 'object-damage'],
  'shocking-grasp': ['opportunity-attack-denial'],
  'starry-wisp': ['light-and-invisibility'],
  thunderwave: ['creature-push', 'object-push', 'audible-boom'],
  'vicious-mockery': ['next-attack-disadvantage'],
};

describe('Milestone 13F-A frozen spell automation contract', () => {
  it('freezes exactly the approved 22 stable SRD spell IDs with no extras or duplicates', () => {
    const expectedIds = PROMOTED.map(([slug]) => srdId('spell', slug));
    expect(M13F_SPELL_AUTOMATION_CONTRACT).toHaveLength(22);
    expect(M13F_PROMOTED_SPELL_IDS).toEqual(expectedIds);
    expect(new Set(M13F_PROMOTED_SPELL_IDS).size).toBe(22);

    for (const [slug, name] of PROMOTED) {
      const id = srdId('spell', slug);
      const source = SRD_REFERENCE_SPELLS.find((spell) => spell.id === id);
      expect(source?.name).toBe(name);
    }
  });

  it('freezes the exact approved structured mechanics and formulas for every promoted spell', () => {
    expect(Object.keys(EXPECTED_MECHANICS).sort()).toEqual(PROMOTED.map(([slug]) => slug).sort());
    for (const [slug] of PROMOTED) {
      const contract = M13F_SPELL_AUTOMATION_CONTRACT.find((candidate) => candidate.spellId === srdId('spell', slug));
      expect(contract?.mechanics).toEqual(EXPECTED_MECHANICS[slug]);
      expect(contract?.mechanics.every((mechanic) => ['spell-attack', 'saving-throw', 'damage', 'healing'].includes(mechanic.type))).toBe(true);
    }
  });

  it('freezes explicit reference-only residue for every promoted spell', () => {
    expect(Object.keys(EXPECTED_REFERENCE_IDS).sort()).toEqual(PROMOTED.map(([slug]) => slug).sort());
    for (const [slug] of PROMOTED) {
      const contract = M13F_SPELL_AUTOMATION_CONTRACT.find((candidate) => candidate.spellId === srdId('spell', slug));
      expect(contract?.referenceEffects.map((effect) => effect.id)).toEqual(EXPECTED_REFERENCE_IDS[slug]);
      expect(contract?.referenceEffects.every((effect) => effect.name.trim().length > 0 && effect.description.trim().length > 0)).toBe(true);
    }
  });

  it('leaves the generated reference catalog unintegrated and preserves its authoritative records for M13F-A', () => {
    for (const [slug, name] of PROMOTED) {
      const source = SRD_REFERENCE_SPELLS.find((spell) => spell.id === srdId('spell', slug));
      expect(source).toMatchObject({
        id: srdId('spell', slug),
        name,
        mechanics: [],
        referenceEffects: [{ id: 'reference-only', name: 'Reference Only' }],
      });
    }
  });

  it('preserves all six M10 anchors and keeps the M13F-A contract disjoint from them', () => {
    const anchorIds = ANCHORS.map((slug) => srdId('spell', slug));
    expect(SRD_STRUCTURED_SPELLS.map((spell) => spell.id)).toEqual(anchorIds);
    expect(M13F_PROMOTED_SPELL_IDS.some((id) => anchorIds.includes(id as (typeof anchorIds)[number]))).toBe(false);
  });

  it('accounts for all 339 spells by explicit catalog membership without runtime text inference', () => {
    const anchorIds = new Set(SRD_STRUCTURED_SPELLS.map((spell) => spell.id));
    const promotedIds = new Set(M13F_PROMOTED_SPELL_IDS);
    const remainingReferenceIds = SRD_REFERENCE_SPELLS.map((spell) => spell.id).filter((id) => !promotedIds.has(id));

    expect(SRD_SPELLS).toHaveLength(339);
    expect(SRD_STRUCTURED_SPELLS).toHaveLength(6);
    expect(promotedIds.size).toBe(22);
    expect(remainingReferenceIds).toHaveLength(311);
    expect([...promotedIds].every((id) => !anchorIds.has(id))).toBe(true);

    const classified = new Set([...anchorIds, ...promotedIds, ...remainingReferenceIds]);
    expect(classified.size).toBe(339);
    expect([...classified].sort()).toEqual(SRD_SPELLS.map((spell) => spell.id).sort());
  });

  it('does not expand Character v9 beyond the approved M14-B representation, CharacterPlayState, or PlaySessionState', () => {
    const playState: CharacterPlayState = {
      currentHp: 1,
      temporaryHp: 0,
      hitDiceRemaining: { 10: 1 },
      resourceUses: {},
    };
    const sessionState: PlaySessionState = {
      conditions: [],
      concentration: { spellId: srdId('spell', 'detect-magic'), providerId: 'test:provider' },
      activeEffectIds: [],
    };

    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v10');
    expect(Object.keys(playState).sort()).toEqual(['currentHp', 'hitDiceRemaining', 'resourceUses', 'temporaryHp']);
    expect(Object.keys(sessionState).sort()).toEqual(['activeEffectIds', 'concentration', 'conditions']);
    expect(EMPTY_PLAY_SESSION_STATE).toEqual({ conditions: [], activeEffectIds: [] });
  });
});
