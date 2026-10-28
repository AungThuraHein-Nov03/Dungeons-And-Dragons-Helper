import type { ClassContent, ClassFeatureContent, ClassFeatureReferenceEffect, LeveledSpellLevel, Money, SpellcastingProviderDefinition } from '../../models/content';
import { SRD_5_2_1_SOURCE, srdId } from './source';

export const PALADIN_LAY_ON_HANDS_RESOURCE_ID = srdId('class-resource', 'paladin:lay-on-hands');
export const PALADIN_CHANNEL_DIVINITY_RESOURCE_ID = srdId('class-resource', 'paladin:channel-divinity');
export const PALADIN_DIVINE_SMITE_FREE_CAST_RESOURCE_ID = srdId('class-resource', 'paladin:divine-smite-free-cast');
export const PALADIN_FAITHFUL_STEED_FREE_CAST_RESOURCE_ID = srdId('class-resource', 'paladin:faithful-steed-free-cast');
export const PALADIN_SPELLCASTING_PROVIDER_ID = srdId('spellcasting-provider', 'paladin:spellcasting');

const featureId = (slug: string) => srdId('class-feature', `paladin:${slug}`);
const ref = (id: string, name: string, description: string): ClassFeatureReferenceEffect => ({ id, name, description });
const feature = (
  slug: string,
  name: string,
  description: string,
  options: Partial<Pick<ClassFeatureContent, 'effects' | 'spellcasting' | 'spellGrants' | 'resourceConsumers' | 'referenceEffects'>> = {},
): ClassFeatureContent => ({
  id: featureId(slug),
  name,
  description,
  effects: options.effects ?? [],
  ...(options.spellcasting ? { spellcasting: options.spellcasting } : {}),
  ...(options.spellGrants ? { spellGrants: options.spellGrants } : {}),
  ...(options.resourceConsumers ? { resourceConsumers: options.resourceConsumers } : {}),
  referenceEffects: options.referenceEffects ?? [],
});
const coin = (amount: number): Money => ({ amount, unit: 'gp' });
const content = (kind: 'weapon' | 'armor', slug: string) => srdId(kind, slug);
const slotResourceId = (level: LeveledSpellLevel) => srdId('spell-slot', `paladin:${level}`);
const slotLevels = Array.from({ length: 5 }, (_, index) => {
  const spellLevel = (index + 1) as LeveledSpellLevel;
  return { spellLevel, resourceId: slotResourceId(spellLevel), name: `Level ${spellLevel} Spell Slots` };
});
const slots = (...values: number[]) => values.flatMap((maximum, index) => maximum > 0 ? [{ spellLevel: (index + 1) as LeveledSpellLevel, maximum }] : []);
const slotProgression = [
  slots(2), slots(2), slots(3), slots(3), slots(4, 2), slots(4, 2), slots(4, 3), slots(4, 3), slots(4, 3, 2), slots(4, 3, 2),
  slots(4, 3, 3), slots(4, 3, 3), slots(4, 3, 3, 1), slots(4, 3, 3, 1), slots(4, 3, 3, 2), slots(4, 3, 3, 2),
  slots(4, 3, 3, 3, 1), slots(4, 3, 3, 3, 1), slots(4, 3, 3, 3, 2), slots(4, 3, 3, 3, 2),
].map((row, index) => ({ level: index + 1, slots: row }));
const counts = (values: number[]) => values.map((count, index) => ({ level: index + 1, count }));

const paladinSpellcasting: SpellcastingProviderDefinition = {
  id: PALADIN_SPELLCASTING_PROVIDER_ID,
  name: 'Paladin Spellcasting',
  spellcastingAbility: { kind: 'fixed', ability: 'charisma' },
  multiclassSlotContribution: { kind: 'spellcasting', contribution: 'half', rounding: 'up' },
  spellManagement: {
    kind: 'prepared-from-list',
    spellListId: 'paladin',
    cantripCount: counts(Array.from({ length: 20 }, () => 0)),
    preparedSpellCount: counts([2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15]),
    replacement: 'long-rest-one',
  },
  slotPool: {
    id: srdId('spell-slot-pool', 'paladin'),
    name: 'Paladin Spell Slots',
    slotLevels,
    progression: slotProgression,
    recovery: [{ trigger: 'long-rest', mode: 'all' }],
  },
  ritualCasting: 'prepared',
};

const LAY_ON_HANDS = feature('lay-on-hands', 'Lay On Hands', 'You have a healing-power pool equal to five times your Paladin level.', {
  resourceConsumers: [{ resourceId: PALADIN_LAY_ON_HANDS_RESOURCE_ID, consumer: { id: srdId('class-resource-consumer', 'paladin:lay-on-hands'), name: 'Lay On Hands', effect: { type: 'variable-expend' } } }],
  referenceEffects: [ref('healing-target', 'Lay On Hands Resolution', 'The numeric pool is tracked and can be spent in arbitrary whole-point amounts; target selection, healing application, and Poisoned removal remain manual.')],
});
const SPELLCASTING = feature('spellcasting', 'Spellcasting', 'You prepare Paladin spells and cast them using Charisma.', {
  spellcasting: [paladinSpellcasting],
  referenceEffects: [ref('prepared-spell-ownership', 'Prepared Spell Ownership', 'Prepared spell selections are not persisted or inferred in Milestone 12B.')],
});
const WEAPON_MASTERY = feature('weapon-mastery', 'Weapon Mastery', 'Choose two proficient weapons whose mastery properties you can use; those selections are persisted on the Paladin progression.');
const FIGHTING_STYLE = feature('fighting-style', 'Fighting Style', 'You gain a Fighting Style feat, with Blessed Warrior available as an alternative.', { referenceEffects: [ref('fighting-style-choice', 'Fighting Style Choice', 'Fighting Style ownership and Blessed Warrior cantrip choices remain player-managed/reference-only.')] });
const PALADINS_SMITE = feature('paladins-smite', 'Paladin’s Smite', 'You always have Divine Smite prepared and can cast it once per Long Rest without a spell slot.', {
  spellGrants: [{ providerId: PALADIN_SPELLCASTING_PROVIDER_ID, spellIds: [srdId('spell', 'divine-smite')], status: 'always-prepared' }],
  resourceConsumers: [{ resourceId: PALADIN_DIVINE_SMITE_FREE_CAST_RESOURCE_ID, consumer: { id: srdId('class-resource-consumer', 'paladin:divine-smite-free-cast'), name: 'Divine Smite (free cast)', effect: { type: 'expend-only' } } }],
  referenceEffects: [ref('free-cast', 'Divine Smite Free Cast', 'The once-per-Long-Rest free cast is tracked as a generic resource; spell-event coupling remains manual.')],
});
const CHANNEL_DIVINITY = feature('channel-divinity', 'Channel Divinity', 'You channel divine energy, beginning with Divine Sense.', {
  resourceConsumers: [{ resourceId: PALADIN_CHANNEL_DIVINITY_RESOURCE_ID, consumer: { id: srdId('class-resource-consumer', 'paladin:divine-sense'), name: 'Divine Sense', effect: { type: 'tracking-only' } } }],
  referenceEffects: [ref('divine-sense', 'Divine Sense', 'Creature-type detection, distance, duration, and consecration/desecration sensing remain reference-only.')],
});
const SUBCLASS = feature('subclass', 'Paladin Subclass', 'You gain a Paladin subclass.');
const ASI = feature('ability-score-improvement', 'Ability Score Improvement', 'You gain the Ability Score Improvement feat or another feat for which you qualify.', { referenceEffects: [ref('feat-acquisition', 'Feat Acquisition', 'Class-granted feat choice ownership remains player-managed; this is not a Level Up workflow.')] });
const EXTRA_ATTACK = feature('extra-attack', 'Extra Attack', 'You can attack twice instead of once when you take the Attack action.', { referenceEffects: [ref('attack-count', 'Extra Attack', 'Attack-action orchestration is reference-only.')] });
const FAITHFUL_STEED = feature('faithful-steed', 'Faithful Steed', 'You always have Find Steed prepared and can cast it once per Long Rest without a spell slot.', {
  spellGrants: [{ providerId: PALADIN_SPELLCASTING_PROVIDER_ID, spellIds: [srdId('spell', 'find-steed')], status: 'always-prepared' }],
  resourceConsumers: [{ resourceId: PALADIN_FAITHFUL_STEED_FREE_CAST_RESOURCE_ID, consumer: { id: srdId('class-resource-consumer', 'paladin:faithful-steed-free-cast'), name: 'Find Steed (free cast)', effect: { type: 'expend-only' } } }],
  referenceEffects: [ref('free-cast', 'Find Steed Free Cast', 'The once-per-Long-Rest free cast is tracked as a generic resource; summon state remains reference-only.')],
});
const AURA_OF_PROTECTION = feature('aura-of-protection', 'Aura of Protection', 'You and nearby allies can add your Charisma modifier to saving throws.', { referenceEffects: [ref('saving-throw-aura', 'Aura of Protection', 'Aura range, nearby allies, Incapacitated state, and automatic saving-throw bonuses are reference-only.') ] });
const SUBCLASS_FEATURE = feature('subclass-feature', 'Subclass feature', 'You gain a feature from your selected Paladin subclass.');
const ABJURE_FOES = feature('abjure-foes', 'Abjure Foes', 'You can expend Channel Divinity to frighten a bounded number of visible creatures.', {
  resourceConsumers: [{ resourceId: PALADIN_CHANNEL_DIVINITY_RESOURCE_ID, consumer: { id: srdId('class-resource-consumer', 'paladin:abjure-foes'), name: 'Abjure Foes', effect: { type: 'tracking-only' } } }],
  referenceEffects: [ref('frighten-targets', 'Abjure Foes', 'Target selection, saving throws, Frightened state, and duration remain reference-only.')],
});
const AURA_OF_COURAGE = feature('aura-of-courage', 'Aura of Courage', 'Your Aura of Protection also protects against the Frightened condition.', { referenceEffects: [ref('condition-immunity-aura', 'Aura of Courage', 'Aura and condition-state automation are reference-only.')] });
const RADIANT_STRIKES = feature('radiant-strikes', 'Radiant Strikes', 'Melee weapon and Unarmed Strike hits deal extra Radiant damage.', { referenceEffects: [ref('melee-hit-rider', 'Radiant Strikes', 'Attack-event extra damage is reference-only.')] });
const RESTORING_TOUCH = feature('restoring-touch', 'Restoring Touch', 'Lay On Hands can remove certain conditions by spending additional points.', { referenceEffects: [ref('condition-removal', 'Restoring Touch', 'Condition state and the 5-point-per-condition transaction remain manual; the shared Lay On Hands pool stays authoritative.')] });
const AURA_EXPANSION = feature('aura-expansion', 'Aura Expansion', 'Your Aura of Protection expands to a 30-foot Emanation.', { referenceEffects: [ref('aura-range', 'Aura Expansion', 'Aura geometry and proximity are reference-only.')] });
const EPIC_BOON = feature('epic-boon', 'Epic Boon', 'You gain an Epic Boon feat or another feat for which you qualify.', { referenceEffects: [ref('feat-acquisition', 'Epic Boon Choice', 'Feat acquisition remains player-managed.')] });

const rows: Array<[number, number, readonly ClassFeatureContent[]]> = [
  [1, 2, [LAY_ON_HANDS, SPELLCASTING, WEAPON_MASTERY]], [2, 2, [FIGHTING_STYLE, PALADINS_SMITE]], [3, 2, [CHANNEL_DIVINITY, SUBCLASS]], [4, 2, [ASI]],
  [5, 3, [EXTRA_ATTACK, FAITHFUL_STEED]], [6, 3, [AURA_OF_PROTECTION]], [7, 3, [SUBCLASS_FEATURE]], [8, 3, [ASI]], [9, 4, [ABJURE_FOES]], [10, 4, [AURA_OF_COURAGE]],
  [11, 4, [RADIANT_STRIKES]], [12, 4, [ASI]], [13, 5, []], [14, 5, [RESTORING_TOUCH]], [15, 5, [SUBCLASS_FEATURE]], [16, 5, [ASI]], [17, 6, []],
  [18, 6, [AURA_EXPANSION]], [19, 6, [EPIC_BOON]], [20, 6, [SUBCLASS_FEATURE]],
];

export const SRD_PALADIN = {
  id: srdId('class', 'paladin'),
  kind: 'class',
  name: 'Paladin',
  source: SRD_5_2_1_SOURCE,
  hitDie: 10,
  fixedHitPointsPerLevel: 6,
  primaryAbility: { mode: 'all-of', abilities: ['strength', 'charisma'] },
  multiclassProficiencies: { weaponProficiencies: [{ kind: 'category', category: 'martial' }], armorTraining: ['light', 'medium', 'shield'], toolProficiencies: [] },
  savingThrowProficiencies: ['wisdom', 'charisma'],
  weaponProficiencies: [{ kind: 'category', category: 'simple' }, { kind: 'category', category: 'martial' }],
  armorTraining: ['light', 'medium', 'heavy', 'shield'],
  toolProficiencies: [],
  skillChoices: { choose: 2, from: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'] },
  startingEquipment: [
    { id: 'A', items: [{ label: 'Chain Mail', contentId: content('armor', 'chain-mail') }, { label: 'Shield', contentId: content('armor', 'shield') }, { label: 'Longsword', contentId: content('weapon', 'longsword') }, { label: 'Javelin', quantity: 6, contentId: content('weapon', 'javelin') }, { label: 'Holy Symbol', inventoryCategory: 'adventuring-gear' }, { label: 'Priest’s Pack', inventoryCategory: 'adventuring-gear' }], currency: coin(9) },
    { id: 'B', items: [], currency: coin(150) },
  ],
  progression: rows.map(([level, proficiencyBonus, features]) => ({ level, proficiencyBonus, features, weaponMasteryChoices: 2 })),
  resources: [
    {
      id: PALADIN_LAY_ON_HANDS_RESOURCE_ID,
      name: 'Lay On Hands',
      source: SRD_5_2_1_SOURCE,
      maximum: { kind: 'level-table', values: Array.from({ length: 20 }, (_, index) => ({ level: index + 1, uses: (index + 1) * 5 })) },
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
      presentation: 'numeric',
    },
    {
      id: PALADIN_DIVINE_SMITE_FREE_CAST_RESOURCE_ID,
      name: 'Divine Smite Free Cast',
      source: SRD_5_2_1_SOURCE,
      maximum: { kind: 'level-table', values: [{ level: 2, uses: 1 }] },
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
    {
      id: PALADIN_CHANNEL_DIVINITY_RESOURCE_ID,
      name: 'Channel Divinity',
      source: SRD_5_2_1_SOURCE,
      maximum: { kind: 'level-table', values: [{ level: 3, uses: 2 }, { level: 11, uses: 3 }] },
      recovery: [{ trigger: 'short-rest', mode: 'amount', amount: 1 }, { trigger: 'long-rest', mode: 'all' }],
    },
    {
      id: PALADIN_FAITHFUL_STEED_FREE_CAST_RESOURCE_ID,
      name: 'Faithful Steed Free Cast',
      source: SRD_5_2_1_SOURCE,
      maximum: { kind: 'level-table', values: [{ level: 5, uses: 1 }] },
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
  ],
} as const satisfies ClassContent;
