import type { ClassContent, ClassFeatureContent, ClassFeatureReferenceEffect, LeveledSpellLevel, Money, SpellcastingProviderDefinition } from '../../models/content';
import { SRD_5_2_1_SOURCE, srdId } from './source';

export const WARLOCK_SPELLCASTING_PROVIDER_ID = srdId('spellcasting-provider', 'warlock:pact-magic');
export const WARLOCK_CONTACT_PATRON_FREE_CAST_RESOURCE_ID = srdId('class-resource', 'warlock:contact-patron-free-cast');

const featureId = (slug: string) => srdId('class-feature', `warlock:${slug}`);
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
const pactResourceId = (level: LeveledSpellLevel) => srdId('spell-slot', `warlock:pact-magic:${level}`);
const pactSlotLevels = Array.from({ length: 5 }, (_, index) => {
  const spellLevel = (index + 1) as LeveledSpellLevel;
  return { spellLevel, resourceId: pactResourceId(spellLevel), name: `Level ${spellLevel} Pact Magic Slots` };
});
const pactSlotCounts = [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4];
const pactSlotLevelsByClass = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5] as const;
const pactProgression = pactSlotCounts.map((maximum, index) => ({
  level: index + 1,
  slots: [{ spellLevel: pactSlotLevelsByClass[index] as LeveledSpellLevel, maximum }],
}));
const counts = (values: number[]) => values.map((count, index) => ({ level: index + 1, count }));

const pactMagic: SpellcastingProviderDefinition = {
  id: WARLOCK_SPELLCASTING_PROVIDER_ID,
  name: 'Warlock Pact Magic',
  spellcastingAbility: { kind: 'fixed', ability: 'charisma' },
  multiclassSlotContribution: { kind: 'pact-magic' },
  spellManagement: {
    kind: 'prepared-from-list',
    spellListId: 'warlock',
    cantripCount: counts([2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]),
    preparedSpellCount: counts([2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15]),
    replacement: 'class-level-one',
  },
  slotPool: {
    id: srdId('spell-slot-pool', 'warlock:pact-magic'),
    name: 'Pact Magic Slots',
    slotLevels: pactSlotLevels,
    progression: pactProgression,
    recovery: [{ trigger: 'short-rest', mode: 'all' }, { trigger: 'long-rest', mode: 'all' }],
  },
  ritualCasting: 'none',
};

const ELDRITCH_INVOCATIONS = feature('eldritch-invocations', 'Eldritch Invocations', 'You gain selectable Eldritch Invocations, beginning with one option and gaining more as shown in the Warlock progression.', {
  referenceEffects: [ref('invocation-selection', 'Eldritch Invocation Choices', 'Authoritative invocation choice counts are 1 at Warlock 1, 3 at 2–4, 5 at 5–6, 6 at 7–8, 7 at 9–11, 8 at 12–14, 9 at 15–17, and 10 at 18–20. Invocation ownership and invocation-driven spell/event mutations are not persisted or automated in M12D.')],
});
const PACT_MAGIC = feature('pact-magic', 'Pact Magic', 'You prepare Warlock spells and cast them with Charisma using a small pool of Pact Magic slots that all share the same current slot level.', {
  spellcasting: [pactMagic],
  referenceEffects: [ref('prepared-spell-ownership', 'Prepared Spell Ownership', 'Prepared Warlock spell and cantrip selections are not persisted or inferred in M12D. Pact slots use the generic provider slot-resource architecture.')],
});
const MAGICAL_CUNNING = feature('magical-cunning', 'Magical Cunning', 'A one-minute rite can restore up to half your maximum Pact Magic slots, rounded up, once per Long Rest.', { referenceEffects: [ref('limited-slot-recovery', 'Magical Cunning', 'The one-minute rite, once-per-Long-Rest state, and partial Pact-slot recovery transaction remain reference-only. Ordinary Pact slots still recover through generic Short/Long Rest metadata.')] });
const SUBCLASS = feature('subclass', 'Warlock Subclass', 'You gain a Warlock subclass.');
const ASI = feature('ability-score-improvement', 'Ability Score Improvement', 'You gain the Ability Score Improvement feat or another feat for which you qualify.', { referenceEffects: [ref('feat-acquisition', 'Feat Acquisition', 'Class-granted feat ownership remains player-managed; this is not a Level Up workflow.')] });
const SUBCLASS_FEATURE = feature('subclass-feature', 'Subclass feature', 'You gain a feature from your selected Warlock subclass.');
const CONTACT_PATRON = feature('contact-patron', 'Contact Patron', 'You always have Contact Other Plane prepared and can contact your patron with it once per Long Rest without spending a spell slot.', {
  spellGrants: [{ providerId: WARLOCK_SPELLCASTING_PROVIDER_ID, spellIds: [srdId('spell', 'contact-other-plane')], status: 'always-prepared' }],
  resourceConsumers: [{ resourceId: WARLOCK_CONTACT_PATRON_FREE_CAST_RESOURCE_ID, consumer: { id: srdId('class-resource-consumer', 'warlock:contact-patron-free-cast'), name: 'Contact Patron (free cast)', effect: { type: 'expend-only' } } }],
  referenceEffects: [ref('free-contact-cast', 'Contact Patron Free Cast', 'The free-cast use is tracked generically. Spell-event coupling and the special automatic-success behavior remain manual/reference-only.')],
});
const mysticArcanum = (spellLevel: 6 | 7 | 8 | 9) => feature(`mystic-arcanum-${spellLevel}`, `Mystic Arcanum (Level ${spellLevel})`, `Choose a level ${spellLevel} Warlock spell that you can cast once per Long Rest without a spell slot.`, { referenceEffects: [ref(`arcanum-choice-${spellLevel}`, `Level ${spellLevel} Mystic Arcanum Choice`, 'The selected spell and its once-per-Long-Rest ownership are not persisted in M12D; no separate Warlock spell store is introduced.')] });
const EPIC_BOON = feature('epic-boon', 'Epic Boon', 'You gain an Epic Boon feat or another feat for which you qualify.', { referenceEffects: [ref('feat-acquisition', 'Epic Boon Choice', 'Feat acquisition remains player-managed.')] });
const ELDRITCH_MASTER = feature('eldritch-master', 'Eldritch Master', 'Magical Cunning improves so the rite can restore all expended Pact Magic slots.', { referenceEffects: [ref('magical-cunning-upgrade', 'Eldritch Master', 'The once-per-Long-Rest rite state and special recovery transaction remain reference-only; no second Pact recovery engine is introduced.')] });

const rows: Array<[number, number, readonly ClassFeatureContent[]]> = [
  [1, 2, [ELDRITCH_INVOCATIONS, PACT_MAGIC]], [2, 2, [MAGICAL_CUNNING]], [3, 2, [SUBCLASS]], [4, 2, [ASI]], [5, 3, []],
  [6, 3, [SUBCLASS_FEATURE]], [7, 3, []], [8, 3, [ASI]], [9, 4, [CONTACT_PATRON]], [10, 4, [SUBCLASS_FEATURE]], [11, 4, [mysticArcanum(6)]], [12, 4, [ASI]],
  [13, 5, [mysticArcanum(7)]], [14, 5, [SUBCLASS_FEATURE]], [15, 5, [mysticArcanum(8)]], [16, 5, [ASI]], [17, 6, [mysticArcanum(9)]], [18, 6, []], [19, 6, [EPIC_BOON]], [20, 6, [ELDRITCH_MASTER]],
];

export const SRD_WARLOCK = {
  id: srdId('class', 'warlock'),
  kind: 'class',
  name: 'Warlock',
  source: SRD_5_2_1_SOURCE,
  hitDie: 8,
  fixedHitPointsPerLevel: 5,
  primaryAbility: { mode: 'one-of', abilities: ['charisma'] },
  multiclassProficiencies: { weaponProficiencies: [], armorTraining: ['light'], toolProficiencies: [] },
  savingThrowProficiencies: ['wisdom', 'charisma'],
  weaponProficiencies: [{ kind: 'category', category: 'simple' }],
  armorTraining: ['light'],
  toolProficiencies: [],
  skillChoices: { choose: 2, from: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'] },
  startingEquipment: [
    { id: 'A', items: [{ label: 'Leather Armor', contentId: content('armor', 'leather-armor') }, { label: 'Sickle', contentId: content('weapon', 'sickle') }, { label: 'Dagger', quantity: 2, contentId: content('weapon', 'dagger') }, { label: 'Arcane Focus (orb)', inventoryCategory: 'adventuring-gear' }, { label: 'Book (occult lore)', inventoryCategory: 'adventuring-gear' }, { label: 'Scholar’s Pack', inventoryCategory: 'adventuring-gear' }], currency: coin(15) },
    { id: 'B', items: [], currency: coin(100) },
  ],
  progression: rows.map(([level, proficiencyBonus, features]) => ({ level, proficiencyBonus, features })),
  resources: [{
    id: WARLOCK_CONTACT_PATRON_FREE_CAST_RESOURCE_ID,
    name: 'Contact Patron Free Cast',
    source: SRD_5_2_1_SOURCE,
    maximum: { kind: 'level-table', values: [{ level: 9, uses: 1 }] },
    recovery: [{ trigger: 'long-rest', mode: 'all' }],
  }],
} as const satisfies ClassContent;
