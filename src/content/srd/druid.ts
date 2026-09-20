import type { ClassContent, ClassFeatureContent, ClassFeatureReferenceEffect, LeveledSpellLevel, Money, SpellcastingProviderDefinition } from '../../models/content';
import { SRD_5_2_1_SOURCE, srdId } from './source';

export const DRUID_WILD_SHAPE_RESOURCE_ID = srdId('class-resource', 'druid:wild-shape');
export const DRUID_SPELLCASTING_PROVIDER_ID = srdId('spellcasting-provider', 'druid:spellcasting');

const featureId = (slug: string) => srdId('class-feature', `druid:${slug}`);
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
const slotResourceId = (level: LeveledSpellLevel) => srdId('spell-slot', `druid:${level}`);
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

const druidSpellcasting: SpellcastingProviderDefinition = {
  id: DRUID_SPELLCASTING_PROVIDER_ID,
  name: 'Druid Spellcasting',
  spellcastingAbility: { kind: 'fixed', ability: 'wisdom' },
  multiclassSlotContribution: { kind: 'spellcasting', contribution: 'full' },
  spellManagement: {
    kind: 'prepared-from-list',
    spellListId: 'druid',
    cantripCount: counts([2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]),
    preparedSpellCount: counts([4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22]),
    replacement: 'long-rest-any',
  },
  slotPool: {
    id: srdId('spell-slot-pool', 'druid'),
    name: 'Druid Spell Slots',
    slotLevels,
    progression: slotProgression,
    recovery: [{ trigger: 'long-rest', mode: 'all' }],
  },
  ritualCasting: 'prepared',
};

const SPELLCASTING = feature('spellcasting', 'Spellcasting', 'You prepare Druid spells and cast them using Wisdom.', {
  spellcasting: [druidSpellcasting],
  referenceEffects: [ref('prepared-spell-ownership', 'Prepared Spell Ownership', 'Prepared spell and cantrip selections are not persisted or inferred in Milestone 12C.')],
});
const DRUIDIC = feature('druidic', 'Druidic', 'You know the secret Druidic language and always have Speak with Animals prepared.', {
  spellGrants: [{ providerId: DRUID_SPELLCASTING_PROVIDER_ID, spellIds: [srdId('spell', 'speak-with-animals')], status: 'always-prepared' }],
  referenceEffects: [ref('druidic-language', 'Druidic', 'Hidden Druidic messages and language ownership remain reference-only.')],
});
const PRIMAL_ORDER = feature('primal-order', 'Primal Order', 'Choose Magician or Warden to shape your early Druid training.', {
  referenceEffects: [ref('primal-order-choice', 'Primal Order Choice', 'Magician and Warden alter cantrips, checks, weapon proficiency, and armor training. The choice is not persisted in M12C, so these effects remain reference-only.')],
});
const WILD_SHAPE = feature('wild-shape', 'Wild Shape', 'You gain a level-scaled pool of Wild Shape uses.', {
  resourceConsumers: [{ resourceId: DRUID_WILD_SHAPE_RESOURCE_ID, consumer: { id: srdId('class-resource-consumer', 'druid:wild-shape'), name: 'Wild Shape', effect: { type: 'expend-only' } } }],
  referenceEffects: [ref('wild-shape-transformation', 'Wild Shape Transformation', 'Eligible Beast forms, form selection, temporary statistics, Temporary Hit Points, duration, attacks, equipment handling, and active transformation state remain reference-only and are not persisted.')],
});
const WILD_COMPANION = feature('wild-companion', 'Wild Companion', 'You can cast Find Familiar by expending a spell slot or a use of Wild Shape.', {
  resourceConsumers: [{ resourceId: DRUID_WILD_SHAPE_RESOURCE_ID, consumer: { id: srdId('class-resource-consumer', 'druid:wild-companion'), name: 'Wild Companion (Wild Shape use)', effect: { type: 'tracking-only' } } }],
  referenceEffects: [ref('slot-alternative', 'Wild Companion Spell-Slot Option', 'Choosing between a spell slot and Wild Shape, familiar summon state, and duration remain manual/reference-only.')],
});
const SUBCLASS = feature('subclass', 'Druid Subclass', 'You gain a Druid subclass.');
const ASI = feature('ability-score-improvement', 'Ability Score Improvement', 'You gain the Ability Score Improvement feat or another feat for which you qualify.', { referenceEffects: [ref('feat-acquisition', 'Feat Acquisition', 'Class-granted feat ownership remains player-managed; this is not a Level Up workflow.')] });
const WILD_RESURGENCE = feature('wild-resurgence', 'Wild Resurgence', 'You can exchange spell-slot and Wild Shape resources in limited ways.', { referenceEffects: [ref('cross-resource-conversion', 'Wild Resurgence', 'Spell-slot/Wild-Shape conversion and once-per-turn/Long-Rest limits remain reference-only because M12C does not add cross-resource transactions or event state.')] });
const SUBCLASS_FEATURE = feature('subclass-feature', 'Subclass feature', 'You gain a feature from your selected Druid subclass.');
const ELEMENTAL_FURY = feature('elemental-fury', 'Elemental Fury', 'Choose Potent Spellcasting or Primal Strike.', { referenceEffects: [ref('elemental-fury-choice', 'Elemental Fury Choice', 'Choice ownership and cantrip/attack-event damage modification remain reference-only.')] });
const IMPROVED_ELEMENTAL_FURY = feature('improved-elemental-fury', 'Improved Elemental Fury', 'Your Elemental Fury option improves.', { referenceEffects: [ref('elemental-fury-improvement', 'Improved Elemental Fury', 'Conditional range or damage modification remains reference-only.')] });
const BEAST_SPELLS = feature('beast-spells', 'Beast Spells', 'You can cast most spells while using Wild Shape.', { referenceEffects: [ref('wild-shape-spellcasting', 'Beast Spells', 'Wild Shape active-state and component restrictions remain reference-only because transformation state is not implemented.')] });
const EPIC_BOON = feature('epic-boon', 'Epic Boon', 'You gain an Epic Boon feat or another feat for which you qualify.', { referenceEffects: [ref('feat-acquisition', 'Epic Boon Choice', 'Feat acquisition remains player-managed.')] });
const ARCHDRUID = feature('archdruid', 'Archdruid', 'Your mastery of nature improves Wild Shape recovery, resource conversion, and longevity.', { referenceEffects: [ref('initiative-refresh', 'Evergreen Wild Shape', 'Initiative-triggered Wild Shape recovery remains reference-only; M12C adds no initiative tracker.'), ref('cross-resource-conversion', 'Nature Magician', 'Converting multiple Wild Shape uses into a spell slot remains reference-only.'), ref('longevity', 'Longevity', 'Aging effects are reference-only.')] });

const rows: Array<[number, number, readonly ClassFeatureContent[]]> = [
  [1, 2, [SPELLCASTING, DRUIDIC, PRIMAL_ORDER]], [2, 2, [WILD_SHAPE, WILD_COMPANION]], [3, 2, [SUBCLASS]], [4, 2, [ASI]], [5, 3, [WILD_RESURGENCE]],
  [6, 3, [SUBCLASS_FEATURE]], [7, 3, [ELEMENTAL_FURY]], [8, 3, [ASI]], [9, 4, []], [10, 4, [SUBCLASS_FEATURE]], [11, 4, []], [12, 4, [ASI]],
  [13, 5, []], [14, 5, [SUBCLASS_FEATURE]], [15, 5, [IMPROVED_ELEMENTAL_FURY]], [16, 5, [ASI]], [17, 6, []], [18, 6, [BEAST_SPELLS]], [19, 6, [EPIC_BOON]], [20, 6, [ARCHDRUID]],
];

export const SRD_DRUID = {
  id: srdId('class', 'druid'),
  kind: 'class',
  name: 'Druid',
  source: SRD_5_2_1_SOURCE,
  hitDie: 8,
  fixedHitPointsPerLevel: 5,
  primaryAbility: { mode: 'one-of', abilities: ['wisdom'] },
  multiclassProficiencies: { weaponProficiencies: [], armorTraining: ['light', 'shield'], toolProficiencies: [] },
  savingThrowProficiencies: ['intelligence', 'wisdom'],
  weaponProficiencies: [{ kind: 'category', category: 'simple' }],
  armorTraining: ['light', 'shield'],
  toolProficiencies: [{ id: 'herbalism-kit', name: 'Herbalism Kit' }],
  skillChoices: { choose: 2, from: ['arcana', 'animal-handling', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival'] },
  startingEquipment: [
    { id: 'A', items: [{ label: 'Leather Armor', contentId: content('armor', 'leather-armor') }, { label: 'Shield', contentId: content('armor', 'shield') }, { label: 'Sickle', contentId: content('weapon', 'sickle') }, { label: 'Druidic Focus (Quarterstaff)', contentId: content('weapon', 'quarterstaff') }, { label: 'Explorer’s Pack', inventoryCategory: 'adventuring-gear' }, { label: 'Herbalism Kit', inventoryCategory: 'other' }], currency: coin(9) },
    { id: 'B', items: [], currency: coin(50) },
  ],
  progression: rows.map(([level, proficiencyBonus, features]) => ({ level, proficiencyBonus, features })),
  resources: [{
    id: DRUID_WILD_SHAPE_RESOURCE_ID,
    name: 'Wild Shape',
    source: SRD_5_2_1_SOURCE,
    maximum: { kind: 'level-table', values: [{ level: 2, uses: 2 }, { level: 6, uses: 3 }, { level: 17, uses: 4 }] },
    recovery: [{ trigger: 'short-rest', mode: 'amount', amount: 1 }, { trigger: 'long-rest', mode: 'all' }],
  }],
} as const satisfies ClassContent;
