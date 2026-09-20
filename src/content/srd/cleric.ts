import type { ClassContent, ClassFeatureContent, ClassFeatureReferenceEffect, LeveledSpellLevel, Money, SpellcastingProviderDefinition } from '../../models/content';
import { SRD_5_2_1_SOURCE, srdId } from './source';

export const CLERIC_CHANNEL_DIVINITY_RESOURCE_ID = srdId('class-resource', 'cleric:channel-divinity');
export const CLERIC_SPELLCASTING_PROVIDER_ID = srdId('spellcasting-provider', 'cleric:spellcasting');

const featureId = (slug: string) => srdId('class-feature', `cleric:${slug}`);
const ref = (id: string, name: string, description: string): ClassFeatureReferenceEffect => ({ id, name, description });
const feature = (
  slug: string,
  name: string,
  description: string,
  options: Partial<Pick<ClassFeatureContent, 'effects' | 'spellcasting' | 'resourceConsumers' | 'referenceEffects'>> = {},
): ClassFeatureContent => ({
  id: featureId(slug),
  name,
  description,
  effects: options.effects ?? [],
  ...(options.spellcasting ? { spellcasting: options.spellcasting } : {}),
  ...(options.resourceConsumers ? { resourceConsumers: options.resourceConsumers } : {}),
  referenceEffects: options.referenceEffects ?? [],
});
const coin = (amount: number): Money => ({ amount, unit: 'gp' });
const content = (kind: 'weapon' | 'armor', slug: string) => srdId(kind, slug);
const slotResourceId = (level: LeveledSpellLevel) => srdId('spell-slot', `cleric:${level}`);

const slotLevels = Array.from({ length: 9 }, (_, index) => {
  const spellLevel = (index + 1) as LeveledSpellLevel;
  return { spellLevel, resourceId: slotResourceId(spellLevel), name: `Level ${spellLevel} Spell Slots` };
});

const slots = (...values: number[]) => values.flatMap((maximum, index) => maximum > 0 ? [{ spellLevel: (index + 1) as LeveledSpellLevel, maximum }] : []);
const slotProgression = [
  slots(2), slots(3), slots(4, 2), slots(4, 3), slots(4, 3, 2), slots(4, 3, 3), slots(4, 3, 3, 1), slots(4, 3, 3, 2),
  slots(4, 3, 3, 3, 1), slots(4, 3, 3, 3, 2), slots(4, 3, 3, 3, 2, 1), slots(4, 3, 3, 3, 2, 1),
  slots(4, 3, 3, 3, 2, 1, 1), slots(4, 3, 3, 3, 2, 1, 1), slots(4, 3, 3, 3, 2, 1, 1, 1), slots(4, 3, 3, 3, 2, 1, 1, 1),
  slots(4, 3, 3, 3, 2, 1, 1, 1, 1), slots(4, 3, 3, 3, 3, 1, 1, 1, 1), slots(4, 3, 3, 3, 3, 2, 1, 1, 1), slots(4, 3, 3, 3, 3, 2, 2, 1, 1),
].map((row, index) => ({ level: index + 1, slots: row }));

const counts = (values: number[]) => values.map((count, index) => ({ level: index + 1, count }));
const clericSpellcasting: SpellcastingProviderDefinition = {
  id: CLERIC_SPELLCASTING_PROVIDER_ID,
  name: 'Cleric Spellcasting',
  spellcastingAbility: { kind: 'fixed', ability: 'wisdom' },
  multiclassSlotContribution: { kind: 'spellcasting', contribution: 'full' },
  spellManagement: {
    kind: 'prepared-from-list',
    spellListId: 'cleric',
    cantripCount: counts([3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]),
    preparedSpellCount: counts([4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22]),
    replacement: 'long-rest-any',
  },
  slotPool: {
    id: srdId('spell-slot-pool', 'cleric'),
    name: 'Cleric Spell Slots',
    slotLevels,
    progression: slotProgression,
    recovery: [{ trigger: 'long-rest', mode: 'all' }],
  },
  ritualCasting: 'prepared',
};

const SPELLCASTING = feature('spellcasting', 'Spellcasting', 'You prepare Cleric spells and cast them using Wisdom.', {
  spellcasting: [clericSpellcasting],
  referenceEffects: [ref('prepared-spell-ownership', 'Prepared Spell Ownership', 'Milestone 11 records preparation rules and visible catalog coverage but does not persist or fabricate prepared spell selections.')],
});
const DIVINE_ORDER = feature('divine-order', 'Divine Order', 'You choose Protector or Thaumaturge.', { referenceEffects: [ref('divine-order-choice', 'Divine Order Choice', 'Protector/Thaumaturge ownership and their dependent mechanics are reference-only in Milestone 11.')] });
const CHANNEL_DIVINITY = feature('channel-divinity', 'Channel Divinity', 'You channel divine energy through Divine Spark or Turn Undead.', {
  resourceConsumers: [
    { resourceId: CLERIC_CHANNEL_DIVINITY_RESOURCE_ID, consumer: { id: srdId('class-resource-consumer', 'cleric:divine-spark'), name: 'Divine Spark', effect: { type: 'tracking-only' } } },
    { resourceId: CLERIC_CHANNEL_DIVINITY_RESOURCE_ID, consumer: { id: srdId('class-resource-consumer', 'cleric:turn-undead'), name: 'Turn Undead', effect: { type: 'tracking-only' } } },
  ],
  referenceEffects: [ref('channel-resolution', 'Channel Divinity Resolution', 'Target selection, healing/damage resolution, and Turn Undead saving throws remain manual.')],
});
const SUBCLASS = feature('subclass', 'Cleric Subclass', 'You gain a Cleric subclass.');
const ASI = feature('ability-score-improvement', 'Ability Score Improvement', 'You gain the Ability Score Improvement feat or another feat for which you qualify.', { referenceEffects: [ref('feat-acquisition', 'Feat Acquisition', 'Class-granted feat selection remains player-managed; this is not a Level Up workflow.')] });
const SEAR_UNDEAD = feature('sear-undead', 'Sear Undead', 'Turn Undead can also damage Undead.', { referenceEffects: [ref('turn-undead-damage', 'Sear Undead', 'Turn Undead target/save/damage orchestration remains reference-only.')] });
const SUBCLASS_FEATURE = feature('subclass-feature', 'Subclass feature', 'You gain a feature from your selected Cleric subclass.');
const BLESSED_STRIKES = feature('blessed-strikes', 'Blessed Strikes', 'Your divine power can empower weapon attacks or cantrips.', { referenceEffects: [ref('blessed-strikes-choice', 'Blessed Strikes', 'The option choice and once-per-turn damage event are reference-only.')] });
const DIVINE_INTERVENTION = feature('divine-intervention', 'Divine Intervention', 'You can call on divine aid to produce a Cleric spell effect within the feature limits.', { referenceEffects: [ref('divine-intervention', 'Divine Intervention', 'Spell selection and free-cast orchestration are reference-only.')] });
const IMPROVED_BLESSED_STRIKES = feature('improved-blessed-strikes', 'Improved Blessed Strikes', 'Blessed Strikes improves.', { referenceEffects: BLESSED_STRIKES.referenceEffects });
const EPIC_BOON = feature('epic-boon', 'Epic Boon', 'You gain an Epic Boon feat or another feat for which you qualify.', { referenceEffects: [ref('feat-acquisition', 'Epic Boon Choice', 'Feat acquisition remains player-managed.')] });
const GREATER_DIVINE_INTERVENTION = feature('greater-divine-intervention', 'Greater Divine Intervention', 'Divine Intervention can produce a greater divine effect.', { referenceEffects: [ref('greater-divine-intervention', 'Greater Divine Intervention', 'Wish-like or other broad effect resolution is reference-only.')] });

const rows: Array<[number, number, readonly ClassFeatureContent[]]> = [
  [1, 2, [SPELLCASTING, DIVINE_ORDER]], [2, 2, [CHANNEL_DIVINITY]], [3, 2, [SUBCLASS]], [4, 2, [ASI]], [5, 3, [SEAR_UNDEAD]],
  [6, 3, [SUBCLASS_FEATURE]], [7, 3, [BLESSED_STRIKES]], [8, 3, [ASI]], [9, 4, []], [10, 4, [DIVINE_INTERVENTION]],
  [11, 4, []], [12, 4, [ASI]], [13, 5, []], [14, 5, [IMPROVED_BLESSED_STRIKES]], [15, 5, []], [16, 5, [ASI]],
  [17, 6, [SUBCLASS_FEATURE]], [18, 6, []], [19, 6, [EPIC_BOON]], [20, 6, [GREATER_DIVINE_INTERVENTION]],
];

export const SRD_CLERIC = {
  id: srdId('class', 'cleric'),
  kind: 'class',
  name: 'Cleric',
  source: SRD_5_2_1_SOURCE,
  hitDie: 8,
  fixedHitPointsPerLevel: 5,
  primaryAbility: { mode: 'one-of', abilities: ['wisdom'] },
  multiclassProficiencies: { weaponProficiencies: [], armorTraining: ['light', 'medium', 'shield'], toolProficiencies: [] },
  savingThrowProficiencies: ['wisdom', 'charisma'],
  weaponProficiencies: [{ kind: 'category', category: 'simple' }],
  armorTraining: ['light', 'medium', 'shield'],
  toolProficiencies: [],
  skillChoices: { choose: 2, from: ['history', 'insight', 'medicine', 'persuasion', 'religion'] },
  startingEquipment: [
    { id: 'A', items: [{ label: 'Chain Shirt', contentId: content('armor', 'chain-shirt') }, { label: 'Shield', contentId: content('armor', 'shield') }, { label: 'Mace', contentId: content('weapon', 'mace') }, { label: 'Holy Symbol', inventoryCategory: 'adventuring-gear' }, { label: 'Priest’s Pack', inventoryCategory: 'adventuring-gear' }], currency: coin(7) },
    { id: 'B', items: [], currency: coin(110) },
  ],
  progression: rows.map(([level, proficiencyBonus, features]) => ({ level, proficiencyBonus, features })),
  resources: [{
    id: CLERIC_CHANNEL_DIVINITY_RESOURCE_ID,
    name: 'Channel Divinity',
    source: SRD_5_2_1_SOURCE,
    maximum: { kind: 'level-table', values: [{ level: 2, uses: 2 }, { level: 6, uses: 3 }, { level: 18, uses: 4 }] },
    recovery: [{ trigger: 'short-rest', mode: 'amount', amount: 1 }, { trigger: 'long-rest', mode: 'all' }],
  }],
} as const satisfies ClassContent;
