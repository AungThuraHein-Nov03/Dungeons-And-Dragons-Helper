import { SKILL_IDS } from '../../models/character';
import type { SpeciesContent, SpeciesTraitReference } from '../../models/content';
import { SRD_5_2_1_SOURCE, srdId } from './source';

const speciesId = (slug: string) => srdId('species', slug);
const trait = (id: string, name: string, description: string, support: SpeciesTraitReference['support'] = 'reference-only'): SpeciesTraitReference => ({ id, name, description, support });
const darkvision = (rangeFeet: number) => [{ type: 'darkvision' as const, rangeFeet }];

export const SRD_DRAGONBORN = {
  id: speciesId('dragonborn'), kind: 'species', name: 'Dragonborn', source: SRD_5_2_1_SOURCE,
  creatureType: 'humanoid', size: { kind: 'fixed', value: 'medium' }, speedFeet: 30, senses: darkvision(60),
  traits: [
    trait('draconic-ancestry', 'Draconic Ancestry', 'Choose a draconic ancestor; that choice determines the energy associated with Breath Weapon and Damage Resistance.', 'structured'),
    trait('breath-weapon', 'Breath Weapon', 'Provides a limited-use breath attack. Attack-area, save, scaling, and damage automation are deferred.'),
    trait('damage-resistance', 'Damage Resistance', 'Provides resistance matching Draconic Ancestry. Resistance automation is deferred.'),
    trait('darkvision', 'Darkvision', 'Darkvision is represented structurally in the species senses.', 'structured'),
    trait('draconic-flight', 'Draconic Flight', 'At higher level, grants a temporary Fly Speed equal to Speed. Flight automation is deferred.'),
  ],
  choices: [{
    id: 'draconic-ancestry', name: 'Draconic Ancestry', options: [
      ['black', 'Black', 'Acid'], ['blue', 'Blue', 'Lightning'], ['brass', 'Brass', 'Fire'], ['bronze', 'Bronze', 'Lightning'], ['copper', 'Copper', 'Acid'],
      ['gold', 'Gold', 'Fire'], ['green', 'Green', 'Poison'], ['red', 'Red', 'Fire'], ['silver', 'Silver', 'Cold'], ['white', 'White', 'Cold'],
    ].map(([id, name, damage]) => ({ id, name, description: `${damage} ancestry` })),
  }],
} as const satisfies SpeciesContent;

export const SRD_DWARF = {
  id: speciesId('dwarf'), kind: 'species', name: 'Dwarf', source: SRD_5_2_1_SOURCE,
  creatureType: 'humanoid', size: { kind: 'fixed', value: 'medium' }, speedFeet: 30, senses: darkvision(120),
  traits: [
    trait('darkvision', 'Darkvision', 'Darkvision is represented structurally in the species senses.', 'structured'),
    trait('dwarven-resilience', 'Dwarven Resilience', 'Provides Poison resistance and Advantage on saving throws to avoid or end Poisoned; purpose-specific saves and incoming-damage resistance remain reference-only.'),
    trait('dwarven-toughness', 'Dwarven Toughness', 'Increases Hit Point maximum by 1 per Character level.', 'structured'),
    trait('stonecunning', 'Stonecunning', 'Provides limited Tremorsense while in contact with stone; sense activation is not automated.'),
  ], choices: [],
  effects: [{ type: 'hit-point-bonus-per-class-level', amount: 1 }],
} as const satisfies SpeciesContent;

export const SRD_ELF = {
  id: speciesId('elf'), kind: 'species', name: 'Elf', source: SRD_5_2_1_SOURCE,
  creatureType: 'humanoid', size: { kind: 'fixed', value: 'medium' }, speedFeet: 30, senses: darkvision(60),
  traits: [
    trait('darkvision', 'Darkvision', 'Base Darkvision is represented structurally; Drow lineage extends its range.', 'structured'),
    trait('elven-lineage', 'Elven Lineage', 'Choose Drow, High Elf, or Wood Elf. Spell benefits remain reference-only; lineage Speed and Darkvision changes are structured.', 'structured'),
    trait('fey-ancestry', 'Fey Ancestry', 'Provides Advantage against being Charmed; condition automation is deferred.'),
    trait('keen-senses', 'Keen Senses', 'Choose proficiency in Insight, Perception, or Survival.', 'structured'),
    trait('trance', 'Trance', 'Changes the species rest fiction and sleep interaction; no rest-duration automation is added here.'),
  ],
  choices: [{ id: 'elven-lineage', name: 'Elven Lineage', options: [
    { id: 'drow', name: 'Drow', description: 'Extends Darkvision and grants lineage spell benefits.', darkvisionFeet: 120 },
    { id: 'high-elf', name: 'High Elf', description: 'Grants High Elf lineage spell benefits.' },
    { id: 'wood-elf', name: 'Wood Elf', description: 'Raises Speed to 35 feet and grants Wood Elf lineage spell benefits.', speedFeet: 35 },
  ] }],
  skillProficiencyChoice: { id: 'keen-senses', choose: 1, from: ['insight', 'perception', 'survival'] },
} as const satisfies SpeciesContent;

export const SRD_GNOME = {
  id: speciesId('gnome'), kind: 'species', name: 'Gnome', source: SRD_5_2_1_SOURCE,
  creatureType: 'humanoid', size: { kind: 'fixed', value: 'small' }, speedFeet: 30, senses: darkvision(60),
  traits: [
    trait('darkvision', 'Darkvision', 'Darkvision is represented structurally in the species senses.', 'structured'),
    trait('gnomish-cunning', 'Gnomish Cunning', 'Provides Advantage on Intelligence, Wisdom, and Charisma saving throws.', 'structured'),
    trait('gnomish-lineage', 'Gnomish Lineage', 'Choose Forest Gnome or Rock Gnome. Spell and device effects remain reference-only.', 'structured'),
  ],
  choices: [{ id: 'gnomish-lineage', name: 'Gnomish Lineage', options: [
    { id: 'forest-gnome', name: 'Forest Gnome', description: 'Forest lineage spell benefits.' },
    { id: 'rock-gnome', name: 'Rock Gnome', description: 'Rock lineage cantrips and clockwork-device benefit.' },
  ] }],
  effects: [{ type: 'saving-throw-roll-mode', abilities: ['intelligence', 'wisdom', 'charisma'], mode: 'advantage' }],
} as const satisfies SpeciesContent;

export const SRD_GOLIATH = {
  id: speciesId('goliath'), kind: 'species', name: 'Goliath', source: SRD_5_2_1_SOURCE,
  creatureType: 'humanoid', size: { kind: 'fixed', value: 'medium' }, speedFeet: 35, senses: [],
  traits: [
    trait('giant-ancestry', 'Giant Ancestry', 'Choose one giant ancestry benefit. Its combat effects remain reference-only.', 'structured'),
    trait('large-form', 'Large Form', 'At higher level, temporarily becomes Large and gains a Speed increase. Transformation automation is deferred.'),
    trait('powerful-build', 'Powerful Build', 'Improves escape checks and carrying-size treatment. Encumbrance and grapple automation are deferred.'),
  ],
  choices: [{ id: 'giant-ancestry', name: 'Giant Ancestry', options: [
    { id: 'cloud', name: 'Cloud Giant', description: 'Cloud’s Jaunt teleport benefit.' },
    { id: 'fire', name: 'Fire Giant', description: 'Fire’s Burn damage benefit.' },
    { id: 'frost', name: 'Frost Giant', description: 'Frost’s Chill damage and Speed-reduction benefit.' },
    { id: 'hill', name: 'Hill Giant', description: 'Hill’s Tumble prone benefit.' },
    { id: 'stone', name: 'Stone Giant', description: 'Stone’s Endurance damage-reduction benefit.' },
    { id: 'storm', name: 'Storm Giant', description: 'Storm’s Thunder reaction damage benefit.' },
  ] }],
} as const satisfies SpeciesContent;

export const SRD_HALFLING = {
  id: speciesId('halfling'), kind: 'species', name: 'Halfling', source: SRD_5_2_1_SOURCE,
  creatureType: 'humanoid', size: { kind: 'fixed', value: 'small' }, speedFeet: 30, senses: [],
  traits: [
    trait('brave', 'Brave', 'Provides Advantage against the Frightened condition; condition automation is deferred.'),
    trait('halfling-nimbleness', 'Halfling Nimbleness', 'Allows movement through spaces of larger creatures; movement-grid automation is deferred.'),
    trait('luck', 'Luck', 'When a D20 Test die rolls a 1, you can reroll that die once and must use the new roll.', 'structured'),
    trait('naturally-stealthy', 'Naturally Stealthy', 'Expands circumstances for hiding; hiding automation is deferred.'),
  ], choices: [],
  effects: [{
    type: 'dice-transformation',
    id: srdId('dice-transformation', 'halfling:luck'),
    optional: true,
    target: { kind: 'd20-test' },
    transformation: { type: 'reroll-once-use-new', die: 20, qualifyingFaces: [1] },
  }],
} as const satisfies SpeciesContent;

export const SRD_HUMAN = {
  id: speciesId('human'), kind: 'species', name: 'Human', source: SRD_5_2_1_SOURCE,
  creatureType: 'humanoid', size: { kind: 'choice', options: ['small', 'medium'] }, speedFeet: 30, senses: [],
  traits: [
    trait('resourceful', 'Resourceful', 'Grants Heroic Inspiration after a Long Rest; inspiration tracking is not automated.'),
    trait('skillful', 'Skillful', 'Choose proficiency in one skill.', 'structured'),
    trait('versatile', 'Versatile', 'Grants an Origin Feat of choice. Feat selection and feat effects are deferred to the dedicated feat system.'),
  ], choices: [],
  skillProficiencyChoice: { id: 'skillful', choose: 1, from: SKILL_IDS },
} as const satisfies SpeciesContent;

export const SRD_ORC = {
  id: speciesId('orc'), kind: 'species', name: 'Orc', source: SRD_5_2_1_SOURCE,
  creatureType: 'humanoid', size: { kind: 'fixed', value: 'medium' }, speedFeet: 30, senses: darkvision(120),
  traits: [
    trait('adrenaline-rush', 'Adrenaline Rush', 'Provides a limited Bonus Action Dash with Temporary Hit Points. Action/resource automation is deferred.'),
    trait('darkvision', 'Darkvision', 'Darkvision is represented structurally in the species senses.', 'structured'),
    trait('relentless-endurance', 'Relentless Endurance', 'Can prevent dropping to 0 Hit Points once per Long Rest; death-state automation is deferred.'),
  ], choices: [],
} as const satisfies SpeciesContent;

export const SRD_TIEFLING = {
  id: speciesId('tiefling'), kind: 'species', name: 'Tiefling', source: SRD_5_2_1_SOURCE,
  creatureType: 'humanoid', size: { kind: 'choice', options: ['small', 'medium'] }, speedFeet: 30, senses: darkvision(60),
  traits: [
    trait('darkvision', 'Darkvision', 'Darkvision is represented structurally in the species senses.', 'structured'),
    trait('fiendish-legacy', 'Fiendish Legacy', 'Choose Abyssal, Chthonic, or Infernal legacy. Resistance and spell benefits remain reference-only.', 'structured'),
    trait('otherworldly-presence', 'Otherworldly Presence', 'Provides a lineage-linked cantrip; spell automation is deferred.'),
  ],
  choices: [{ id: 'fiendish-legacy', name: 'Fiendish Legacy', options: [
    { id: 'abyssal', name: 'Abyssal', description: 'Poison resistance and Abyssal legacy spells.' },
    { id: 'chthonic', name: 'Chthonic', description: 'Necrotic resistance and Chthonic legacy spells.' },
    { id: 'infernal', name: 'Infernal', description: 'Fire resistance and Infernal legacy spells.' },
  ] }],
} as const satisfies SpeciesContent;

export const SRD_SPECIES = [
  SRD_DRAGONBORN, SRD_DWARF, SRD_ELF, SRD_GNOME, SRD_GOLIATH, SRD_HALFLING, SRD_HUMAN, SRD_ORC, SRD_TIEFLING,
] as const satisfies readonly SpeciesContent[];
