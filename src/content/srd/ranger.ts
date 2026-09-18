import type { ClassContent, ClassFeatureContent, ClassFeatureReferenceEffect, LeveledSpellLevel, Money, SpellcastingProviderDefinition } from '../../models/content';
import { SRD_5_2_1_SOURCE, srdId } from './source';

export const RANGER_FAVORED_ENEMY_RESOURCE_ID = srdId('class-resource', 'ranger:favored-enemy');
export const RANGER_TIRELESS_RESOURCE_ID = srdId('class-resource', 'ranger:tireless');
export const RANGER_NATURES_VEIL_RESOURCE_ID = srdId('class-resource', 'ranger:natures-veil');
export const RANGER_SPELLCASTING_PROVIDER_ID = srdId('spellcasting-provider', 'ranger:spellcasting');

const featureId = (slug: string) => srdId('class-feature', `ranger:${slug}`);
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
const slotResourceId = (level: LeveledSpellLevel) => srdId('spell-slot', `ranger:${level}`);
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

const rangerSpellcasting: SpellcastingProviderDefinition = {
  id: RANGER_SPELLCASTING_PROVIDER_ID,
  name: 'Ranger Spellcasting',
  spellcastingAbility: { kind: 'fixed', ability: 'wisdom' },
  spellManagement: {
    kind: 'prepared-from-list',
    spellListId: 'ranger',
    cantripCount: counts(Array.from({ length: 20 }, () => 0)),
    preparedSpellCount: counts([2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15]),
    replacement: 'long-rest-one',
  },
  slotPool: {
    id: srdId('spell-slot-pool', 'ranger'),
    name: 'Ranger Spell Slots',
    slotLevels,
    progression: slotProgression,
    recovery: [{ trigger: 'long-rest', mode: 'all' }],
  },
  ritualCasting: 'prepared',
};

const SPELLCASTING = feature('spellcasting', 'Spellcasting', 'You prepare Ranger spells and cast them using Wisdom.', {
  spellcasting: [rangerSpellcasting],
  referenceEffects: [ref('prepared-spell-ownership', 'Prepared Spell Ownership', 'Prepared spell selections are not persisted or inferred in Milestone 12B.')],
});
const FAVORED_ENEMY = feature('favored-enemy', 'Favored Enemy', 'You always have Hunter’s Mark prepared and can cast it without a spell slot a level-scaled number of times per Long Rest.', {
  spellGrants: [{ providerId: RANGER_SPELLCASTING_PROVIDER_ID, spellIds: [srdId('spell', 'hunter-s-mark')], status: 'always-prepared' }],
  resourceConsumers: [{ resourceId: RANGER_FAVORED_ENEMY_RESOURCE_ID, consumer: { id: srdId('class-resource-consumer', 'ranger:hunter-mark-free-cast'), name: 'Hunter’s Mark (free cast)', effect: { type: 'expend-only' } } }],
  referenceEffects: [ref('hunter-mark-target', 'Hunter’s Mark Target', 'Free-cast bookkeeping is tracked generically; target selection, marked-target state, and Concentration enforcement are not implemented.')],
});
const WEAPON_MASTERY = feature('weapon-mastery', 'Weapon Mastery', 'You can use the mastery properties of two weapons with which you are proficient.', { referenceEffects: [ref('weapon-mastery-selection', 'Weapon Mastery Selection', 'Specific mastered weapon choices are not persisted by the current Character schema.')] });
const DEFT_EXPLORER = feature('deft-explorer', 'Deft Explorer', 'You gain Expertise in one skill proficiency and learn two languages.', { referenceEffects: [ref('expertise-language-choice', 'Deft Explorer Choices', 'Expertise and language ownership choices remain player-managed/reference-only.')] });
const FIGHTING_STYLE = feature('fighting-style', 'Fighting Style', 'You gain a Fighting Style feat, with Druidic Warrior available as an alternative.', { referenceEffects: [ref('fighting-style-choice', 'Fighting Style Choice', 'Fighting Style ownership and Druidic Warrior cantrip choices remain player-managed/reference-only.')] });
const SUBCLASS = feature('subclass', 'Ranger Subclass', 'You gain a Ranger subclass.');
const ASI = feature('ability-score-improvement', 'Ability Score Improvement', 'You gain the Ability Score Improvement feat or another feat for which you qualify.', { referenceEffects: [ref('feat-acquisition', 'Feat Acquisition', 'Class-granted feat choice ownership remains player-managed; this is not a Level Up workflow.')] });
const EXTRA_ATTACK = feature('extra-attack', 'Extra Attack', 'You can attack twice instead of once when you take the Attack action.', { referenceEffects: [ref('attack-count', 'Extra Attack', 'Attack-action orchestration is reference-only.')] });
const ROVING = feature('roving', 'Roving', 'Your movement improves while you are not wearing Heavy armor.', { effects: [{ type: 'speed-bonus', amount: { kind: 'fixed', amount: 10 }, disallowedArmorCategories: ['heavy'] }], referenceEffects: [ref('climb-swim-speeds', 'Roving Climb and Swim Speeds', 'The +10 walking Speed is automated. Setting Climb and Swim Speeds equal to Speed remains reference-only because the current Character sheet exposes only the primary Speed value.')] });
const SUBCLASS_FEATURE = feature('subclass-feature', 'Subclass feature', 'You gain a feature from your selected Ranger subclass.');
const EXPERTISE = feature('expertise', 'Expertise', 'You gain Expertise in two additional skill proficiencies.', { referenceEffects: [ref('expertise-choice', 'Expertise Choices', 'Expertise ownership choices remain player-managed/reference-only.')] });
const TIRELESS = feature('tireless', 'Tireless', 'You can draw on primal forces for temporary resilience, and Short Rests can reduce Exhaustion.', {
  resourceConsumers: [{ resourceId: RANGER_TIRELESS_RESOURCE_ID, consumer: { id: srdId('class-resource-consumer', 'ranger:tireless-temporary-hp'), name: 'Tireless Temporary HP', effect: { type: 'tracking-only' } } }],
  referenceEffects: [ref('temporary-hp-roll', 'Tireless Temporary HP', 'The Wisdom-derived use count is tracked; the 1d8 + Wisdom Temporary HP roll and application remain manual.'), ref('exhaustion', 'Decrease Exhaustion', 'Exhaustion state is not tracked in M12B.')],
});
const RELENTLESS_HUNTER = feature('relentless-hunter', 'Relentless Hunter', 'Damage can no longer break your Concentration on Hunter’s Mark.', { referenceEffects: [ref('concentration-exception', 'Relentless Hunter', 'Concentration remains metadata only; M12B does not enforce Concentration checks or exceptions.')] });
const NATURES_VEIL = feature('natures-veil', 'Nature’s Veil', 'You can become Invisible briefly a number of times based on your Wisdom modifier.', {
  resourceConsumers: [{ resourceId: RANGER_NATURES_VEIL_RESOURCE_ID, consumer: { id: srdId('class-resource-consumer', 'ranger:natures-veil'), name: 'Nature’s Veil', effect: { type: 'expend-only' } } }],
  referenceEffects: [ref('invisible-condition', 'Nature’s Veil', 'The Wisdom-derived use count is tracked; Invisible condition state and duration remain reference-only.')],
});
const PRECISE_HUNTER = feature('precise-hunter', 'Precise Hunter', 'You have Advantage on attacks against the creature marked by your Hunter’s Mark.', { referenceEffects: [ref('marked-target-advantage', 'Precise Hunter', 'Marked-target state and conditional attack Advantage remain reference-only.')] });
const FERAL_SENSES = feature('feral-senses', 'Feral Senses', 'You gain Blindsight out to 30 feet.', { referenceEffects: [ref('blindsight', 'Feral Senses', 'Blindsight is reference-visible but does not alter encounter or targeting state.')] });
const EPIC_BOON = feature('epic-boon', 'Epic Boon', 'You gain an Epic Boon feat or another feat for which you qualify.', { referenceEffects: [ref('feat-acquisition', 'Epic Boon Choice', 'Feat acquisition remains player-managed.')] });
const FOE_SLAYER = feature('foe-slayer', 'Foe Slayer', 'Your Hunter’s Mark damage die becomes a d10.', { referenceEffects: [ref('hunter-mark-die', 'Foe Slayer', 'Hunter’s Mark spell-effect damage mutation remains reference-only.')] });

const rows: Array<[number, number, readonly ClassFeatureContent[]]> = [
  [1, 2, [SPELLCASTING, FAVORED_ENEMY, WEAPON_MASTERY]], [2, 2, [DEFT_EXPLORER, FIGHTING_STYLE]], [3, 2, [SUBCLASS]], [4, 2, [ASI]], [5, 3, [EXTRA_ATTACK]],
  [6, 3, [ROVING]], [7, 3, [SUBCLASS_FEATURE]], [8, 3, [ASI]], [9, 4, [EXPERTISE]], [10, 4, [TIRELESS]], [11, 4, [SUBCLASS_FEATURE]], [12, 4, [ASI]],
  [13, 5, [RELENTLESS_HUNTER]], [14, 5, [NATURES_VEIL]], [15, 5, [SUBCLASS_FEATURE]], [16, 5, [ASI]], [17, 6, [PRECISE_HUNTER]], [18, 6, [FERAL_SENSES]], [19, 6, [EPIC_BOON]], [20, 6, [FOE_SLAYER]],
];

export const SRD_RANGER = {
  id: srdId('class', 'ranger'),
  kind: 'class',
  name: 'Ranger',
  source: SRD_5_2_1_SOURCE,
  hitDie: 10,
  fixedHitPointsPerLevel: 6,
  primaryAbility: { mode: 'all-of', abilities: ['dexterity', 'wisdom'] },
  savingThrowProficiencies: ['strength', 'dexterity'],
  weaponProficiencies: [{ kind: 'category', category: 'simple' }, { kind: 'category', category: 'martial' }],
  armorTraining: ['light', 'medium', 'shield'],
  toolProficiencies: [],
  skillChoices: { choose: 3, from: ['animal-handling', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'] },
  startingEquipment: [
    { id: 'A', items: [{ label: 'Studded Leather Armor', contentId: content('armor', 'studded-leather-armor') }, { label: 'Scimitar', contentId: content('weapon', 'scimitar') }, { label: 'Shortsword', contentId: content('weapon', 'shortsword') }, { label: 'Longbow', contentId: content('weapon', 'longbow') }, { label: 'Arrow', quantity: 20, inventoryCategory: 'ammunition' }, { label: 'Quiver', inventoryCategory: 'adventuring-gear' }, { label: 'Druidic Focus', inventoryCategory: 'adventuring-gear' }, { label: 'Explorer’s Pack', inventoryCategory: 'adventuring-gear' }], currency: coin(7) },
    { id: 'B', items: [], currency: coin(150) },
  ],
  progression: rows.map(([level, proficiencyBonus, features]) => ({ level, proficiencyBonus, features, weaponMasteryChoices: 2 })),
  resources: [
    {
      id: RANGER_FAVORED_ENEMY_RESOURCE_ID,
      name: 'Favored Enemy Free Casts',
      source: SRD_5_2_1_SOURCE,
      maximum: { kind: 'level-table', values: [{ level: 1, uses: 2 }, { level: 5, uses: 3 }, { level: 9, uses: 4 }, { level: 13, uses: 5 }, { level: 17, uses: 6 }] },
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
    {
      id: RANGER_TIRELESS_RESOURCE_ID,
      name: 'Tireless',
      source: SRD_5_2_1_SOURCE,
      maximum: { kind: 'ability-modifier', ability: 'wisdom', minimum: 1, minimumLevel: 10 },
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
    {
      id: RANGER_NATURES_VEIL_RESOURCE_ID,
      name: 'Nature’s Veil',
      source: SRD_5_2_1_SOURCE,
      maximum: { kind: 'ability-modifier', ability: 'wisdom', minimum: 1, minimumLevel: 14 },
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
  ],
} as const satisfies ClassContent;
