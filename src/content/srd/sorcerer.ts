import type { ClassContent, ClassFeatureContent, ClassFeatureReferenceEffect, LeveledSpellLevel, Money, SpellcastingProviderDefinition } from '../../models/content';
import { SRD_5_2_1_SOURCE, srdId } from './source';

export const SORCERER_INNATE_SORCERY_RESOURCE_ID = srdId('class-resource', 'sorcerer:innate-sorcery');
export const SORCERER_INNATE_SORCERY_ACTIVE_EFFECT_ID = srdId('active-self-effect', 'sorcerer:innate-sorcery');
export const SORCERER_SORCERY_POINTS_RESOURCE_ID = srdId('class-resource', 'sorcerer:sorcery-points');
export const SORCERER_SPELLCASTING_PROVIDER_ID = srdId('spellcasting-provider', 'sorcerer:spellcasting');

const featureId = (slug: string) => srdId('class-feature', `sorcerer:${slug}`);
const ref = (id: string, name: string, description: string): ClassFeatureReferenceEffect => ({ id, name, description });
const feature = (
  slug: string,
  name: string,
  description: string,
  options: Partial<Pick<ClassFeatureContent, 'effects' | 'spellcasting' | 'spellGrants' | 'resourceConsumers' | 'activeSelfEffects' | 'referenceEffects'>> = {},
): ClassFeatureContent => ({
  id: featureId(slug),
  name,
  description,
  effects: options.effects ?? [],
  ...(options.spellcasting ? { spellcasting: options.spellcasting } : {}),
  ...(options.spellGrants ? { spellGrants: options.spellGrants } : {}),
  ...(options.resourceConsumers ? { resourceConsumers: options.resourceConsumers } : {}),
  ...(options.activeSelfEffects ? { activeSelfEffects: options.activeSelfEffects } : {}),
  referenceEffects: options.referenceEffects ?? [],
});
const coin = (amount: number): Money => ({ amount, unit: 'gp' });
const content = (kind: 'weapon', slug: string) => srdId(kind, slug);
const slotResourceId = (level: LeveledSpellLevel) => srdId('spell-slot', `sorcerer:${level}`);
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

const sorcererSpellcasting: SpellcastingProviderDefinition = {
  id: SORCERER_SPELLCASTING_PROVIDER_ID,
  name: 'Sorcerer Spellcasting',
  spellcastingAbility: { kind: 'fixed', ability: 'charisma' },
  spellManagement: {
    kind: 'prepared-from-list',
    spellListId: 'sorcerer',
    cantripCount: counts([4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6]),
    preparedSpellCount: counts([2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22]),
    replacement: 'class-level-one',
  },
  slotPool: {
    id: srdId('spell-slot-pool', 'sorcerer'),
    name: 'Sorcerer Spell Slots',
    slotLevels,
    progression: slotProgression,
    recovery: [{ trigger: 'long-rest', mode: 'all' }],
  },
  ritualCasting: 'none',
};

const SPELLCASTING = feature('spellcasting', 'Spellcasting', 'You prepare Sorcerer spells and cast them using Charisma.', {
  spellcasting: [sorcererSpellcasting],
  referenceEffects: [ref('prepared-spell-ownership', 'Prepared Spell Ownership', 'Prepared spell and cantrip selections are not persisted or inferred in M12D.')],
});
const INNATE_SORCERY = feature('innate-sorcery', 'Innate Sorcery', 'You can unleash innate magic twice per Long Rest for one minute.', {
  activeSelfEffects: [{
    id: SORCERER_INNATE_SORCERY_ACTIVE_EFFECT_ID,
    name: 'Innate Sorcery',
    description: 'Unleash innate magic as a Bonus Action for 1 minute.',
    activationTiming: 'bonus-action',
    activationCost: { resourceId: SORCERER_INNATE_SORCERY_RESOURCE_ID, amount: 1 },
    modifiers: [
      { type: 'spell-save-dc-bonus', providerIds: [SORCERER_SPELLCASTING_PROVIDER_ID], amount: 1 },
      { type: 'd20-roll-mode', mode: 'advantage', target: { kind: 'spell-attack', providerIds: [SORCERER_SPELLCASTING_PROVIDER_ID] } },
    ],
    referenceText: 'The one-minute duration is not counted down because PLAY has no combat timeline. End the mode explicitly when its duration expires.',
  }],
  referenceEffects: [ref('innate-sorcery-duration', 'Innate Sorcery Duration', 'The one-minute duration remains manual; M13D does not introduce a round or duration engine.')],
});
const FONT_OF_MAGIC = feature('font-of-magic', 'Font of Magic', 'You gain Sorcery Points equal to your Sorcerer level and can spend them on Sorcerer features.', {
  resourceConsumers: [{ resourceId: SORCERER_SORCERY_POINTS_RESOURCE_ID, consumer: { id: srdId('class-resource-consumer', 'sorcerer:manual-sorcery-point-cost'), name: 'Manual Sorcery Point Cost', effect: { type: 'variable-expend' } } }],
  referenceEffects: [ref('spell-slot-conversion', 'Flexible Casting Conversion', 'Sorcery Point-to-spell-slot and spell-slot-to-Sorcery-Point conversion remain reference-only. M12D adds no cross-resource conversion transaction or generated slot state.')],
});
const METAMAGIC = feature('metamagic', 'Metamagic', 'Choose two Metamagic options that modify spells by spending Sorcery Points.', {
  referenceEffects: [ref('metamagic-options', 'Metamagic Options', 'Careful Spell (1), Distant Spell (1), Empowered Spell (1), Extended Spell (1), Heightened Spell (2), Quickened Spell (2), Seeking Spell (1), Subtle Spell (1), Transmuted Spell (1), and Twinned Spell (1) are reference-only choices. Option ownership, spell-event interception, targets, timing, damage rerolls, components, duration, range, and save/attack mutation are not automated.')],
});
const SUBCLASS = feature('subclass', 'Sorcerer Subclass', 'You gain a Sorcerer subclass.');
const ASI = feature('ability-score-improvement', 'Ability Score Improvement', 'You gain the Ability Score Improvement feat or another feat for which you qualify.', { referenceEffects: [ref('feat-acquisition', 'Feat Acquisition', 'Class-granted feat ownership remains player-managed; this is not a Level Up workflow.')] });
const SORCEROUS_RESTORATION = feature('sorcerous-restoration', 'Sorcerous Restoration', 'Once per Long Rest, finishing a Short Rest can restore Sorcery Points up to half your Sorcerer level.', { referenceEffects: [ref('limited-short-rest-recovery', 'Sorcerous Restoration', 'The once-per-Long-Rest gate and bounded Short Rest restoration remain reference-only; M12D does not add event-state or special recovery transactions.') ] });
const SUBCLASS_FEATURE = feature('subclass-feature', 'Subclass feature', 'You gain a feature from your selected Sorcerer subclass.');
const SORCERY_INCARNATE = feature('sorcery-incarnate', 'Sorcery Incarnate', 'Innate Sorcery improves, and when no uses remain you can spend Sorcery Points to activate it.', { referenceEffects: [ref('cross-resource-activation', 'Sorcery Incarnate', 'M13D tracks active Innate Sorcery, but spending Sorcery Points as a substitute activation remains reference-only; no cross-resource conversion path is introduced.')] });
const METAMAGIC_10 = feature('metamagic-10', 'Metamagic', 'You learn two additional Metamagic options.', { referenceEffects: [ref('metamagic-choice-count', 'Metamagic Choices', 'Metamagic choice ownership remains player-managed/reference-only; this raises the authoritative known option count to four.')] });
const METAMAGIC_17 = feature('metamagic-17', 'Metamagic', 'You learn two additional Metamagic options.', { referenceEffects: [ref('metamagic-choice-count', 'Metamagic Choices', 'Metamagic choice ownership remains player-managed/reference-only; this raises the authoritative known option count to six.')] });
const EPIC_BOON = feature('epic-boon', 'Epic Boon', 'You gain an Epic Boon feat or another feat for which you qualify.', { referenceEffects: [ref('feat-acquisition', 'Epic Boon Choice', 'Feat acquisition remains player-managed.')] });
const ARCANE_APOTHEOSIS = feature('arcane-apotheosis', 'Arcane Apotheosis', 'While Innate Sorcery is active, one Metamagic option on each of your turns can cost no Sorcery Points.', { referenceEffects: [ref('free-metamagic-event', 'Arcane Apotheosis', 'M13D can track Innate Sorcery as active, but turn state, Metamagic option use, and automatic Sorcery Point cost suppression remain reference-only.')] });

const rows: Array<[number, number, readonly ClassFeatureContent[]]> = [
  [1, 2, [SPELLCASTING, INNATE_SORCERY]], [2, 2, [FONT_OF_MAGIC, METAMAGIC]], [3, 2, [SUBCLASS]], [4, 2, [ASI]], [5, 3, [SORCEROUS_RESTORATION]],
  [6, 3, [SUBCLASS_FEATURE]], [7, 3, [SORCERY_INCARNATE]], [8, 3, [ASI]], [9, 4, []], [10, 4, [METAMAGIC_10]], [11, 4, []], [12, 4, [ASI]],
  [13, 5, []], [14, 5, [SUBCLASS_FEATURE]], [15, 5, []], [16, 5, [ASI]], [17, 6, [METAMAGIC_17]], [18, 6, [SUBCLASS_FEATURE]], [19, 6, [EPIC_BOON]], [20, 6, [ARCANE_APOTHEOSIS]],
];

export const SRD_SORCERER = {
  id: srdId('class', 'sorcerer'),
  kind: 'class',
  name: 'Sorcerer',
  source: SRD_5_2_1_SOURCE,
  hitDie: 6,
  fixedHitPointsPerLevel: 4,
  primaryAbility: { mode: 'one-of', abilities: ['charisma'] },
  savingThrowProficiencies: ['constitution', 'charisma'],
  weaponProficiencies: [{ kind: 'category', category: 'simple' }],
  armorTraining: [],
  toolProficiencies: [],
  skillChoices: { choose: 2, from: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'] },
  startingEquipment: [
    { id: 'A', items: [{ label: 'Spear', contentId: content('weapon', 'spear') }, { label: 'Dagger', quantity: 2, contentId: content('weapon', 'dagger') }, { label: 'Arcane Focus (crystal)', inventoryCategory: 'adventuring-gear' }, { label: 'Dungeoneer’s Pack', inventoryCategory: 'adventuring-gear' }], currency: coin(28) },
    { id: 'B', items: [], currency: coin(50) },
  ],
  progression: rows.map(([level, proficiencyBonus, features]) => ({ level, proficiencyBonus, features })),
  resources: [
    {
      id: SORCERER_INNATE_SORCERY_RESOURCE_ID,
      name: 'Innate Sorcery',
      source: SRD_5_2_1_SOURCE,
      maximum: { kind: 'level-table', values: [{ level: 1, uses: 2 }] },
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
    {
      id: SORCERER_SORCERY_POINTS_RESOURCE_ID,
      name: 'Sorcery Points',
      source: SRD_5_2_1_SOURCE,
      maximum: { kind: 'level-table', values: Array.from({ length: 19 }, (_, index) => ({ level: index + 2, uses: index + 2 })) },
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
      presentation: 'numeric',
    },
  ],
} as const satisfies ClassContent;
