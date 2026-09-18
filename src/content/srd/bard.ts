import type { ClassContent, ClassFeatureContent, ClassFeatureReferenceEffect, LeveledSpellLevel, Money, SpellcastingProviderDefinition } from '../../models/content';
import { SRD_5_2_1_SOURCE, srdId } from './source';

export const BARD_BARDIC_INSPIRATION_RESOURCE_ID = srdId('class-resource', 'bard:bardic-inspiration');
export const BARD_SPELLCASTING_PROVIDER_ID = srdId('spellcasting-provider', 'bard:spellcasting');

const featureId = (slug: string) => srdId('class-feature', `bard:${slug}`);
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
const slotResourceId = (level: LeveledSpellLevel) => srdId('spell-slot', `bard:${level}`);
const slotLevels = Array.from({ length: 9 }, (_, index) => {
  const spellLevel = (index + 1) as LeveledSpellLevel;
  return { spellLevel, resourceId: slotResourceId(spellLevel), name: `Level ${spellLevel} Spell Slots` };
});
const slots = (...values: number[]) => values.flatMap((maximum, index) => maximum > 0 ? [{ spellLevel: (index + 1) as LeveledSpellLevel, maximum }] : []);
const slotProgression = [
  slots(2), slots(3), slots(4, 2), slots(4, 3), slots(4, 3, 2), slots(4, 3, 3), slots(4, 3, 3, 1), slots(4, 3, 3, 2), slots(4, 3, 3, 3, 1),
  slots(4, 3, 3, 3, 2), slots(4, 3, 3, 3, 2, 1), slots(4, 3, 3, 3, 2, 1), slots(4, 3, 3, 3, 2, 1, 1), slots(4, 3, 3, 3, 2, 1, 1),
  slots(4, 3, 3, 3, 2, 1, 1, 1), slots(4, 3, 3, 3, 2, 1, 1, 1), slots(4, 3, 3, 3, 2, 1, 1, 1, 1), slots(4, 3, 3, 3, 3, 1, 1, 1, 1),
  slots(4, 3, 3, 3, 3, 2, 1, 1, 1), slots(4, 3, 3, 3, 3, 2, 2, 1, 1),
].map((row, index) => ({ level: index + 1, slots: row }));
const counts = (values: number[]) => values.map((count, index) => ({ level: index + 1, count }));

const bardSpellcasting: SpellcastingProviderDefinition = {
  id: BARD_SPELLCASTING_PROVIDER_ID,
  name: 'Bard Spellcasting',
  spellcastingAbility: { kind: 'fixed', ability: 'charisma' },
  spellManagement: {
    kind: 'prepared-from-list',
    spellListId: 'bard',
    cantripCount: counts([2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]),
    preparedSpellCount: counts([4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22]),
    replacement: 'class-level-one',
  },
  slotPool: {
    id: srdId('spell-slot-pool', 'bard'),
    name: 'Bard Spell Slots',
    slotLevels,
    progression: slotProgression,
    recovery: [{ trigger: 'long-rest', mode: 'all' }],
  },
  ritualCasting: 'prepared',
};

const BARDIC_INSPIRATION = feature('bardic-inspiration', 'Bardic Inspiration', 'You can grant a Bardic Inspiration die a number of times based on your Charisma modifier.', {
  resourceConsumers: [{ resourceId: BARD_BARDIC_INSPIRATION_RESOURCE_ID, consumer: { id: srdId('class-resource-consumer', 'bard:bardic-inspiration'), name: 'Bardic Inspiration', effect: { type: 'expend-only' } } }],
  referenceEffects: [ref('bardic-die', 'Bardic Inspiration Die', 'The inspiration die is d6, becoming d8 at Bard 5, d10 at Bard 10, and d12 at Bard 15. Applying the die to another creature’s failed D20 Test remains manual.')],
});
const SPELLCASTING = feature('spellcasting', 'Spellcasting', 'You prepare Bard spells and cast them using Charisma.', {
  spellcasting: [bardSpellcasting],
  referenceEffects: [ref('prepared-spell-ownership', 'Prepared Spell Ownership', 'Prepared spell selections and cantrip choices are not persisted or inferred in Milestone 12B.')],
});
const EXPERTISE = feature('expertise', 'Expertise', 'You gain Expertise in selected skill proficiencies.', { referenceEffects: [ref('expertise-choice', 'Expertise Choices', 'Expertise ownership choices remain player-managed/reference-only.') ] });
const JACK_OF_ALL_TRADES = feature('jack-of-all-trades', 'Jack of All Trades', 'You add half your Proficiency Bonus to certain ability checks that otherwise lack your Proficiency Bonus.', { effects: [{ type: 'initiative-half-proficiency' }], referenceEffects: [ref('other-ability-checks', 'Other Ability Checks', 'Initiative uses the generic half-Proficiency rule; other qualifying non-skill ability checks remain table-managed where the app has no dedicated roll surface.') ] });
const SUBCLASS = feature('subclass', 'Bard Subclass', 'You gain a Bard subclass.');
const ASI = feature('ability-score-improvement', 'Ability Score Improvement', 'You gain the Ability Score Improvement feat or another feat for which you qualify.', { referenceEffects: [ref('feat-acquisition', 'Feat Acquisition', 'Class-granted feat choice ownership remains player-managed; this is not a Level Up workflow.')] });
const FONT_OF_INSPIRATION = feature('font-of-inspiration', 'Font of Inspiration', 'Bardic Inspiration now fully recovers on a Short or Long Rest.', { referenceEffects: [ref('slot-to-inspiration', 'Spell Slot Conversion', 'Regaining Bardic Inspiration by expending a spell slot is reference-only; M12B does not add cross-resource conversion.')] });
const SUBCLASS_FEATURE = feature('subclass-feature', 'Subclass feature', 'You gain a feature from your selected Bard subclass.');
const COUNTERCHARM = feature('countercharm', 'Countercharm', 'You can react to help reroll certain failed saves against Charmed or Frightened effects.', { referenceEffects: [ref('save-reroll', 'Countercharm', 'Condition detection, reaction timing, and save rerolls remain reference-only.')] });
const MAGICAL_SECRETS = feature('magical-secrets', 'Magical Secrets', 'Your later Bard spell choices can draw from additional spell lists.', { referenceEffects: [ref('expanded-prepared-list', 'Magical Secrets', 'Cross-list prepared-spell choices remain reference-only because M12B does not persist spell selections.')] });
const SUPERIOR_INSPIRATION = feature('superior-inspiration', 'Superior Inspiration', 'Rolling Initiative can restore Bardic Inspiration until you have two uses.', { referenceEffects: [ref('initiative-refresh', 'Superior Inspiration', 'Initiative-triggered refresh remains reference-only; M12B adds no initiative tracker.')] });
const EPIC_BOON = feature('epic-boon', 'Epic Boon', 'You gain an Epic Boon feat or another feat for which you qualify.', { referenceEffects: [ref('feat-acquisition', 'Epic Boon Choice', 'Feat acquisition remains player-managed.')] });
const WORDS_OF_CREATION = feature('words-of-creation', 'Words of Creation', 'You always have Power Word Heal and Power Word Kill prepared.', {
  spellGrants: [{ providerId: BARD_SPELLCASTING_PROVIDER_ID, spellIds: [srdId('spell', 'power-word-heal'), srdId('spell', 'power-word-kill')], status: 'always-prepared' }],
  referenceEffects: [ref('second-target', 'Words of Creation Targeting', 'The optional second-target behavior is reference-only.')],
});

const rows: Array<[number, number, readonly ClassFeatureContent[]]> = [
  [1, 2, [BARDIC_INSPIRATION, SPELLCASTING]], [2, 2, [EXPERTISE, JACK_OF_ALL_TRADES]], [3, 2, [SUBCLASS]], [4, 2, [ASI]], [5, 3, [FONT_OF_INSPIRATION]],
  [6, 3, [SUBCLASS_FEATURE]], [7, 3, [COUNTERCHARM]], [8, 3, [ASI]], [9, 4, [EXPERTISE]], [10, 4, [MAGICAL_SECRETS]], [11, 4, []], [12, 4, [ASI]],
  [13, 5, []], [14, 5, [SUBCLASS_FEATURE]], [15, 5, []], [16, 5, [ASI]], [17, 6, []], [18, 6, [SUPERIOR_INSPIRATION]], [19, 6, [EPIC_BOON]], [20, 6, [WORDS_OF_CREATION]],
];

export const SRD_BARD = {
  id: srdId('class', 'bard'),
  kind: 'class',
  name: 'Bard',
  source: SRD_5_2_1_SOURCE,
  hitDie: 8,
  fixedHitPointsPerLevel: 5,
  primaryAbility: { mode: 'one-of', abilities: ['charisma'] },
  savingThrowProficiencies: ['dexterity', 'charisma'],
  weaponProficiencies: [{ kind: 'category', category: 'simple' }],
  armorTraining: ['light'],
  toolProficiencies: [
    { id: 'musical-instrument-choice-1', name: 'Musical Instrument (choice)' },
    { id: 'musical-instrument-choice-2', name: 'Musical Instrument (choice)' },
    { id: 'musical-instrument-choice-3', name: 'Musical Instrument (choice)' },
  ],
  skillChoices: { choose: 3, from: ['acrobatics', 'animal-handling', 'arcana', 'athletics', 'deception', 'history', 'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion', 'religion', 'sleight-of-hand', 'stealth', 'survival'] },
  startingEquipment: [
    { id: 'A', items: [{ label: 'Leather Armor', contentId: content('armor', 'leather-armor') }, { label: 'Dagger', quantity: 2, contentId: content('weapon', 'dagger') }, { label: 'Musical Instrument of your choice', inventoryCategory: 'adventuring-gear' }, { label: 'Entertainer’s Pack', inventoryCategory: 'adventuring-gear' }], currency: coin(19) },
    { id: 'B', items: [], currency: coin(90) },
  ],
  progression: rows.map(([level, proficiencyBonus, features]) => ({ level, proficiencyBonus, features })),
  resources: [{
    id: BARD_BARDIC_INSPIRATION_RESOURCE_ID,
    name: 'Bardic Inspiration',
    source: SRD_5_2_1_SOURCE,
    maximum: { kind: 'ability-modifier', ability: 'charisma', minimum: 1 },
    recovery: [{ trigger: 'long-rest', mode: 'all' }, { trigger: 'short-rest', mode: 'all', minimumLevel: 5 }],
  }],
} as const satisfies ClassContent;
