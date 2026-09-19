import type { SpellContent, SpellDieTerm, SpellListReference, SpellReferenceEffect } from '../../models/content';
import { M13F_SPELL_AUTOMATION_CONTRACT } from './spellAutomationM13F';
import { SRD_5_2_1_SOURCE, srdId } from './source';
import { SRD_REFERENCE_SPELLS } from './spellsReference.generated';

const spellId = (slug: string) => srdId('spell', slug);
const list = (id: string, name: string): SpellListReference => ({ id, name });
const die = (count: number, size: SpellDieTerm['die']): SpellDieTerm => ({ count, die: size });
const ref = (id: string, name: string, description: string): SpellReferenceEffect => ({ id, name, description });
const noMaterial = { verbal: true, somatic: true, material: false } as const;

const FIRE_BOLT = {
  id: spellId('fire-bolt'),
  kind: 'spell',
  name: 'Fire Bolt',
  source: SRD_5_2_1_SOURCE,
  level: 0,
  school: 'evocation',
  castingTime: 'Action',
  range: '120 feet',
  components: noMaterial,
  duration: 'Instantaneous',
  concentration: false,
  ritual: false,
  target: 'One creature or object within range',
  description: 'Hurl a mote of fire at a creature or object within range and make a ranged spell attack.',
  spellLists: [list('sorcerer', 'Sorcerer'), list('wizard', 'Wizard')],
  mechanics: [
    { type: 'spell-attack', attackType: 'ranged' },
    {
      type: 'damage',
      amount: { dice: [die(1, 10)], modifier: 'none' },
      damageType: 'fire',
      scaling: { kind: 'character-level-dice', values: [{ level: 1, dice: [die(1, 10)] }, { level: 5, dice: [die(2, 10)] }, { level: 11, dice: [die(3, 10)] }, { level: 17, dice: [die(4, 10)] }] },
    },
  ],
  referenceEffects: [ref('flammable-object', 'Flammable Objects', 'A flammable object hit by the spell starts burning if it is not being worn or carried.')],
} as const satisfies SpellContent;

const SACRED_FLAME = {
  id: spellId('sacred-flame'),
  kind: 'spell',
  name: 'Sacred Flame',
  source: SRD_5_2_1_SOURCE,
  level: 0,
  school: 'evocation',
  castingTime: 'Action',
  range: '60 feet',
  components: noMaterial,
  duration: 'Instantaneous',
  concentration: false,
  ritual: false,
  target: 'One creature you can see within range',
  description: 'Flame-like radiance descends on a visible creature within range.',
  spellLists: [list('cleric', 'Cleric')],
  mechanics: [
    { type: 'saving-throw', ability: 'dexterity', onSuccess: 'none' },
    {
      type: 'damage',
      amount: { dice: [die(1, 8)], modifier: 'none' },
      damageType: 'radiant',
      scaling: { kind: 'character-level-dice', values: [{ level: 1, dice: [die(1, 8)] }, { level: 5, dice: [die(2, 8)] }, { level: 11, dice: [die(3, 8)] }, { level: 17, dice: [die(4, 8)] }] },
    },
  ],
  referenceEffects: [ref('cover', 'Cover', 'The target gains no benefit from Half Cover or Three-Quarters Cover for this saving throw.')],
} as const satisfies SpellContent;

const CURE_WOUNDS = {
  id: spellId('cure-wounds'),
  kind: 'spell',
  name: 'Cure Wounds',
  source: SRD_5_2_1_SOURCE,
  level: 1,
  school: 'abjuration',
  castingTime: 'Action',
  range: 'Touch',
  components: noMaterial,
  duration: 'Instantaneous',
  concentration: false,
  ritual: false,
  target: 'One creature you touch',
  description: 'A creature you touch regains Hit Points.',
  higherLevelDescription: 'Healing increases by 2d8 for each spell slot level above 1.',
  spellLists: [list('bard', 'Bard'), list('cleric', 'Cleric'), list('druid', 'Druid'), list('paladin', 'Paladin'), list('ranger', 'Ranger')],
  mechanics: [{ type: 'healing', amount: { dice: [die(2, 8)], modifier: 'spellcasting-ability' }, scaling: { kind: 'slot-level-dice', baseSpellLevel: 1, dicePerLevel: [die(2, 8)] } }],
  referenceEffects: [],
} as const satisfies SpellContent;

const GUIDING_BOLT = {
  id: spellId('guiding-bolt'),
  kind: 'spell',
  name: 'Guiding Bolt',
  source: SRD_5_2_1_SOURCE,
  level: 1,
  school: 'evocation',
  castingTime: 'Action',
  range: '120 feet',
  components: noMaterial,
  duration: '1 round',
  concentration: false,
  ritual: false,
  target: 'One creature within range',
  description: 'Hurl a bolt of light at a creature within range and make a ranged spell attack.',
  higherLevelDescription: 'Damage increases by 1d6 for each spell slot level above 1.',
  spellLists: [list('cleric', 'Cleric')],
  mechanics: [
    { type: 'spell-attack', attackType: 'ranged' },
    { type: 'damage', amount: { dice: [die(4, 6)], modifier: 'none' }, damageType: 'radiant', scaling: { kind: 'slot-level-dice', baseSpellLevel: 1, dicePerLevel: [die(1, 6)] } },
  ],
  referenceEffects: [ref('next-attack-advantage', 'Guiding Light', 'On a hit, the next attack roll against the target before the end of your next turn has Advantage. Target/event automation is not implemented.')],
} as const satisfies SpellContent;

const BURNING_HANDS = {
  id: spellId('burning-hands'),
  kind: 'spell',
  name: 'Burning Hands',
  source: SRD_5_2_1_SOURCE,
  level: 1,
  school: 'evocation',
  castingTime: 'Action',
  range: 'Self',
  components: noMaterial,
  duration: 'Instantaneous',
  concentration: false,
  ritual: false,
  target: 'Each creature in a 15-foot Cone',
  description: 'A thin sheet of flames shoots forth from you into a 15-foot Cone.',
  higherLevelDescription: 'Damage increases by 1d6 for each spell slot level above 1.',
  spellLists: [list('sorcerer', 'Sorcerer'), list('wizard', 'Wizard')],
  mechanics: [
    { type: 'saving-throw', ability: 'dexterity', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [die(3, 6)], modifier: 'none' }, damageType: 'fire', scaling: { kind: 'slot-level-dice', baseSpellLevel: 1, dicePerLevel: [die(1, 6)] } },
  ],
  referenceEffects: [ref('flammable-objects', 'Flammable Objects', 'Flammable objects in the Cone that are not being worn or carried start burning.')],
} as const satisfies SpellContent;

const DETECT_MAGIC = {
  id: spellId('detect-magic'),
  kind: 'spell',
  name: 'Detect Magic',
  source: SRD_5_2_1_SOURCE,
  level: 1,
  school: 'divination',
  castingTime: 'Action or Ritual',
  range: 'Self',
  components: noMaterial,
  duration: 'Concentration, up to 10 minutes',
  concentration: true,
  ritual: true,
  target: 'Self; magical effects within 30 feet',
  description: 'Sense the presence of magical effects nearby and inspect visible magical auras.',
  spellLists: [list('bard', 'Bard'), list('cleric', 'Cleric'), list('druid', 'Druid'), list('paladin', 'Paladin'), list('ranger', 'Ranger'), list('sorcerer', 'Sorcerer'), list('warlock', 'Warlock'), list('wizard', 'Wizard')],
  mechanics: [],
  referenceEffects: [ref('magic-sense', 'Detect Magic', 'Sensing magical effects, revealing visible auras, and learning a spell effect’s school remain reference-only; Concentration is metadata only.')],
} as const satisfies SpellContent;

export const SRD_STRUCTURED_SPELLS = [FIRE_BOLT, SACRED_FLAME, CURE_WOUNDS, GUIDING_BOLT, BURNING_HANDS, DETECT_MAGIC] as const satisfies readonly SpellContent[];

const m13fAutomationBySpellId = new Map(
  M13F_SPELL_AUTOMATION_CONTRACT.map((contract) => [contract.spellId, contract] as const),
);

const SRD_COMPOSED_REFERENCE_SPELLS = SRD_REFERENCE_SPELLS.map((spell): SpellContent => {
  const automation = m13fAutomationBySpellId.get(spell.id);
  if (!automation) return spell;
  return {
    ...spell,
    mechanics: automation.mechanics,
    referenceEffects: automation.referenceEffects,
  };
});

export const SRD_SPELLS = [...SRD_STRUCTURED_SPELLS, ...SRD_COMPOSED_REFERENCE_SPELLS] as const satisfies readonly SpellContent[];
