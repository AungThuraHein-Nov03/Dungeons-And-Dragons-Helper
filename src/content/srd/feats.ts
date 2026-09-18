import { ABILITY_KEYS, type AbilityKey } from '../../models/character';
import type { FeatChoiceDefinition, FeatContent, FeatEffect, FeatReferenceEffect } from '../../models/content';
import { SRD_5_2_1_SOURCE, srdId } from './source';

const featId = (slug: string) => srdId('feat', slug);
const level = (minimum: number) => ({ type: 'level', minimum } as const);
const feature = (name: string) => ({ type: 'feature' as const, name, support: 'reference-only' as const });
const abilityMinimum = (abilities: readonly AbilityKey[], minimum: number) => ({ type: 'ability-minimum', abilities, minimum } as const);
const ref = (id: string, name: string, description: string): FeatReferenceEffect => ({ id, name, description });
const abilityOptions = (abilities: readonly AbilityKey[] = ABILITY_KEYS) => abilities.map((ability) => ({ id: ability, name: ability[0].toUpperCase() + ability.slice(1) }));
const abilityChoice = (id: string, abilities: readonly AbilityKey[], description: string): FeatChoiceDefinition => ({
  id,
  name: 'Ability Score Increase',
  support: 'structured',
  description,
  options: abilityOptions(abilities),
});
const abilityEffect = (
  choiceId: string,
  allowedAbilities: readonly AbilityKey[],
  selections: 1 | 2,
  maximum: 20 | 30,
  allowDuplicateSelection = false,
): FeatEffect => ({ type: 'ability-score-increase', choiceId, allowedAbilities, selections, amountPerSelection: 1, maximum, allowDuplicateSelection });
const fightingStylePrerequisite = [feature('Fighting Style Feature')] as const;
const armorCategories = ['light', 'medium', 'heavy'] as const;

export const SRD_ALERT = {
  id: featId('alert'), kind: 'feat', name: 'Alert', source: SRD_5_2_1_SOURCE, category: 'origin', prerequisites: [], repeatable: false,
  choices: [], effects: [{ type: 'initiative-proficiency' }],
  referenceEffects: [
    ref('initiative-swap', 'Initiative Swap', 'Swap Initiative with one willing ally immediately after rolling. Ally initiative and combat-turn automation remain manual.'),
  ],
  description: 'An Origin feat focused on Initiative awareness and coordination.',
} as const satisfies FeatContent;

export const SRD_MAGIC_INITIATE = {
  id: featId('magic-initiate'), kind: 'feat', name: 'Magic Initiate', source: SRD_5_2_1_SOURCE, category: 'origin', prerequisites: [], repeatable: true,
  repeatabilityNote: 'Each repeat must use a different Cleric, Druid, or Wizard spell list.',
  choices: [
    { id: 'spell-list', name: 'Spell List', support: 'reference-only', description: 'Choose Cleric, Druid, or Wizard.', options: [{ id: 'cleric', name: 'Cleric' }, { id: 'druid', name: 'Druid' }, { id: 'wizard', name: 'Wizard' }] },
    { id: 'spellcasting-ability', name: 'Spellcasting Ability', support: 'reference-only', description: 'Choose Intelligence, Wisdom, or Charisma.', options: abilityOptions(['intelligence', 'wisdom', 'charisma']) },
    { id: 'spells', name: 'Cantrips and Level 1 Spell', support: 'reference-only', description: 'Choose two cantrips and one level 1 spell from the selected list. Spell selection is deferred to a future spellcasting system.' },
  ],
  effects: [],
  referenceEffects: [ref('spellcasting', 'Magic Initiate Spellcasting', 'Two cantrips and one level 1 spell, including the feat’s free-cast and spell-change rules. Spell automation is not implemented.')],
  description: 'An Origin feat that grants a small package of spells from the Cleric, Druid, or Wizard list.',
} as const satisfies FeatContent;

export const SRD_SAVAGE_ATTACKER = {
  id: featId('savage-attacker'), kind: 'feat', name: 'Savage Attacker', source: SRD_5_2_1_SOURCE, category: 'origin', prerequisites: [], repeatable: false,
  choices: [], effects: [],
  referenceEffects: [ref('damage-reroll', 'Savage Attacker', 'Once per turn after hitting with a weapon, roll the weapon’s damage dice twice and use either roll. Automatic hit/turn-trigger handling is not implemented.')],
  description: 'An Origin feat that can improve one weapon damage roll each turn.',
} as const satisfies FeatContent;

export const SRD_SKILLED = {
  id: featId('skilled'), kind: 'feat', name: 'Skilled', source: SRD_5_2_1_SOURCE, category: 'origin', prerequisites: [], repeatable: true,
  choices: [{ id: 'proficiencies', name: 'Three Skill or Tool Proficiencies', support: 'reference-only', description: 'Choose any combination of three skills or tools. Generic tool proficiency ownership is not implemented in Milestone 8.' }],
  effects: [],
  referenceEffects: [ref('proficiencies', 'Skilled Proficiencies', 'Gain proficiency in any combination of three skills or tools. This choice remains reference-only until generic tool proficiency ownership is modeled.')],
  description: 'An Origin feat that grants three skill or tool proficiencies.',
} as const satisfies FeatContent;

export const SRD_ABILITY_SCORE_IMPROVEMENT = {
  id: featId('ability-score-improvement'), kind: 'feat', name: 'Ability Score Improvement', source: SRD_5_2_1_SOURCE, category: 'general', prerequisites: [level(4)], repeatable: true,
  choices: [abilityChoice('ability-increase', ABILITY_KEYS, 'Choose two ability selections. Selecting the same ability twice grants +2; choosing two different abilities grants +1 to each.')],
  effects: [abilityEffect('ability-increase', ABILITY_KEYS, 2, 20, true)], referenceEffects: [],
  description: 'Increase one ability score by 2 or two ability scores by 1, to a maximum of 20.',
} as const satisfies FeatContent;

export const SRD_GRAPPLER = {
  id: featId('grappler'), kind: 'feat', name: 'Grappler', source: SRD_5_2_1_SOURCE, category: 'general',
  prerequisites: [level(4), abilityMinimum(['strength', 'dexterity'], 13)], repeatable: false,
  choices: [abilityChoice('ability-increase', ['strength', 'dexterity'], 'Choose Strength or Dexterity for the feat’s +1 increase.')],
  effects: [abilityEffect('ability-increase', ['strength', 'dexterity'], 1, 20)],
  referenceEffects: [
    ref('punch-and-grab', 'Punch and Grab', 'Unarmed Strike Attack-action grapple interaction; combat action automation is not implemented.'),
    ref('attack-advantage', 'Attack Advantage', 'Advantage against a creature Grappled by you; condition/enemy-state automation is not implemented.'),
    ref('fast-wrestler', 'Fast Wrestler', 'Movement while moving a Grappled creature; grapple-state automation is not implemented.'),
  ],
  description: 'A General feat combining a Strength/Dexterity increase with grappling combat benefits.',
} as const satisfies FeatContent;

export const SRD_ARCHERY = {
  id: featId('archery'), kind: 'feat', name: 'Archery', source: SRD_5_2_1_SOURCE, category: 'fighting-style', prerequisites: fightingStylePrerequisite, repeatable: false,
  choices: [], effects: [{ type: 'attack-roll-bonus', weaponMode: 'ranged', amount: 2 }], referenceEffects: [],
  description: 'Gain a +2 bonus to attack rolls made with Ranged weapons.',
} as const satisfies FeatContent;

export const SRD_DEFENSE = {
  id: featId('defense'), kind: 'feat', name: 'Defense', source: SRD_5_2_1_SOURCE, category: 'fighting-style', prerequisites: fightingStylePrerequisite, repeatable: false,
  choices: [], effects: [{ type: 'armor-class-bonus', armorCategories, amount: 1 }], referenceEffects: [],
  description: 'Gain +1 Armor Class while wearing Light, Medium, or Heavy armor.',
} as const satisfies FeatContent;

export const SRD_GREAT_WEAPON_FIGHTING = {
  id: featId('great-weapon-fighting'), kind: 'feat', name: 'Great Weapon Fighting', source: SRD_5_2_1_SOURCE, category: 'fighting-style', prerequisites: fightingStylePrerequisite, repeatable: false,
  choices: [], effects: [{
    type: 'dice-transformation',
    id: srdId('dice-transformation', 'feat:great-weapon-fighting'),
    optional: false,
    target: { kind: 'weapon-damage', weaponMode: 'melee', heldWithTwoHands: true, anyWeaponProperties: ['two-handed', 'versatile'] },
    transformation: { type: 'minimum-die-face', minimum: 3 },
  }],
  referenceEffects: [ref('conditional-two-handed-context', 'Great Weapon Fighting Conditional Context', 'The generic transformation applies to deterministically known two-handed/Versatile weapon damage. Conditional mounted-state handling for weapons such as the Lance remains table-managed.')],
  description: 'A Fighting Style feat for qualifying two-handed melee weapon damage.',
} as const satisfies FeatContent;

export const SRD_TWO_WEAPON_FIGHTING = {
  id: featId('two-weapon-fighting'), kind: 'feat', name: 'Two-Weapon Fighting', source: SRD_5_2_1_SOURCE, category: 'fighting-style', prerequisites: fightingStylePrerequisite, repeatable: false,
  choices: [], effects: [],
  referenceEffects: [ref('light-extra-attack-damage', 'Two-Weapon Fighting', 'Add your ability modifier to the Light-property extra attack damage when it is not already added. Extra-attack timing automation is not implemented.')],
  description: 'A Fighting Style feat improving damage on the Light-property extra attack.',
} as const satisfies FeatContent;

const epic = (
  slug: string,
  name: string,
  allowedAbilities: readonly AbilityKey[],
  referenceEffects: readonly FeatReferenceEffect[],
  extraPrerequisites: readonly ReturnType<typeof feature>[] = [],
): FeatContent => ({
  id: featId(slug), kind: 'feat', name, source: SRD_5_2_1_SOURCE, category: 'epic-boon',
  prerequisites: [level(19), ...extraPrerequisites], repeatable: false,
  choices: [abilityChoice('ability-increase', allowedAbilities, 'Choose the ability score increased by 1, to a maximum of 30.')],
  effects: [abilityEffect('ability-increase', allowedAbilities, 1, 30)], referenceEffects,
  description: `${name} grants an Epic Boon ability increase plus its listed reference benefit.`,
});

export const SRD_BOON_OF_COMBAT_PROWESS = epic('boon-of-combat-prowess', 'Boon of Combat Prowess', ABILITY_KEYS, [ref('peerless-aim', 'Peerless Aim', 'Turn a missed attack roll into a hit once until the start of your next turn. Hit/miss and turn-state automation is not implemented.')]);
export const SRD_BOON_OF_DIMENSIONAL_TRAVEL = epic('boon-of-dimensional-travel', 'Boon of Dimensional Travel', ABILITY_KEYS, [ref('blink-steps', 'Blink Steps', 'Teleport after the Attack or Magic action. Action and position automation is not implemented.')]);
export const SRD_BOON_OF_FATE = epic('boon-of-fate', 'Boon of Fate', ABILITY_KEYS, [ref('improve-fate', 'Improve Fate', 'Apply 2d4 as a bonus or penalty to a nearby D20 Test with its recharge rules. Reaction/event automation is not implemented.')]);
export const SRD_BOON_OF_IRRESISTIBLE_OFFENSE = epic('boon-of-irresistible-offense', 'Boon of Irresistible Offense', ['strength', 'dexterity'], [
  ref('overcome-defenses', 'Overcome Defenses', 'Ignore resistance to Bludgeoning, Piercing, and Slashing damage. Resistance automation is not implemented.'),
  ref('overwhelming-strike', 'Overwhelming Strike', 'A natural 20 attack can deal extra damage based on the ability increased by this feat. Automatic critical-hit/event handling is not implemented.'),
]);
export const SRD_BOON_OF_SPELL_RECALL = epic('boon-of-spell-recall', 'Boon of Spell Recall', ['intelligence', 'wisdom', 'charisma'], [ref('free-casting', 'Free Casting', 'Potentially avoid expending level 1–4 spell slots after a d4 roll. Spell-slot automation is not implemented.')], [feature('Spellcasting Feature')]);
export const SRD_BOON_OF_THE_NIGHT_SPIRIT = epic('boon-of-the-night-spirit', 'Boon of the Night Spirit', ABILITY_KEYS, [
  ref('merge-with-shadows', 'Merge with Shadows', 'Become Invisible in Dim Light or Darkness until taking an action, Bonus Action, or Reaction. Conditions/lighting automation is not implemented.'),
  ref('shadowy-form', 'Shadowy Form', 'Gain broad damage Resistance while in Dim Light or Darkness. Resistance/lighting automation is not implemented.'),
]);
export const SRD_BOON_OF_TRUESIGHT = epic('boon-of-truesight', 'Boon of Truesight', ABILITY_KEYS, [ref('truesight', 'Truesight', 'Gain Truesight out to 60 feet. General senses automation beyond the existing Species reference is not implemented.')]);

export const SRD_FEATS = [
  SRD_ALERT,
  SRD_MAGIC_INITIATE,
  SRD_SAVAGE_ATTACKER,
  SRD_SKILLED,
  SRD_ABILITY_SCORE_IMPROVEMENT,
  SRD_GRAPPLER,
  SRD_ARCHERY,
  SRD_DEFENSE,
  SRD_GREAT_WEAPON_FIGHTING,
  SRD_TWO_WEAPON_FIGHTING,
  SRD_BOON_OF_COMBAT_PROWESS,
  SRD_BOON_OF_DIMENSIONAL_TRAVEL,
  SRD_BOON_OF_FATE,
  SRD_BOON_OF_IRRESISTIBLE_OFFENSE,
  SRD_BOON_OF_SPELL_RECALL,
  SRD_BOON_OF_THE_NIGHT_SPIRIT,
  SRD_BOON_OF_TRUESIGHT,
] as const satisfies readonly FeatContent[];
