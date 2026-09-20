import type { ClassContent, ClassFeatureContent, ClassFeatureReferenceEffect, LeveledSpellLevel, Money, SpellcastingProviderDefinition } from '../../models/content';
import { SRD_5_2_1_SOURCE, srdId } from './source';

export const WIZARD_SPELLCASTING_PROVIDER_ID = srdId('spellcasting-provider', 'wizard:spellcasting');
export const WIZARD_ARCANE_RECOVERY_RESOURCE_ID = srdId('class-resource', 'wizard:arcane-recovery');
export const WIZARD_ARCANE_RECOVERY_TRANSACTION_ID = srdId('resource-transaction', 'wizard:arcane-recovery');

const featureId = (slug: string) => srdId('class-feature', `wizard:${slug}`);
const ref = (id: string, name: string, description: string): ClassFeatureReferenceEffect => ({ id, name, description });
const feature = (
  slug: string,
  name: string,
  description: string,
  options: Partial<Pick<ClassFeatureContent, 'effects' | 'spellcasting' | 'spellGrants' | 'resources' | 'resourceConsumers' | 'resourceTransactions' | 'referenceEffects'>> = {},
): ClassFeatureContent => ({
  id: featureId(slug),
  name,
  description,
  effects: options.effects ?? [],
  ...(options.spellcasting ? { spellcasting: options.spellcasting } : {}),
  ...(options.spellGrants ? { spellGrants: options.spellGrants } : {}),
  ...(options.resources ? { resources: options.resources } : {}),
  ...(options.resourceConsumers ? { resourceConsumers: options.resourceConsumers } : {}),
  ...(options.resourceTransactions ? { resourceTransactions: options.resourceTransactions } : {}),
  referenceEffects: options.referenceEffects ?? [],
});
const coin = (amount: number): Money => ({ amount, unit: 'gp' });
const weapon = (slug: string) => srdId('weapon', slug);
const slotResourceId = (level: LeveledSpellLevel) => srdId('spell-slot', `wizard:${level}`);
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

const wizardSpellcasting: SpellcastingProviderDefinition = {
  id: WIZARD_SPELLCASTING_PROVIDER_ID,
  name: 'Wizard Spellcasting',
  spellcastingAbility: { kind: 'fixed', ability: 'intelligence' },
  multiclassSlotContribution: { kind: 'spellcasting', contribution: 'full' },
  spellManagement: {
    kind: 'prepared-from-owned',
    spellListId: 'wizard',
    cantripCount: counts([3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]),
    preparedSpellCount: counts([4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25]),
    replacement: 'long-rest-any',
    initialOwnedSpellCount: 6,
    initialOwnedSpellLevel: 1,
  },
  slotPool: {
    id: srdId('spell-slot-pool', 'wizard'),
    name: 'Wizard Spell Slots',
    slotLevels,
    progression: slotProgression,
    recovery: [{ trigger: 'long-rest', mode: 'all' }],
  },
  ritualCasting: 'owned',
};

const SPELLCASTING = feature('spellcasting', 'Spellcasting', 'You use Intelligence to cast Wizard spells. Your selected cantrips, spellbook-owned leveled spells, and prepared spells are tracked separately.', {
  spellcasting: [wizardSpellcasting],
  referenceEffects: [ref('spellbook-advancement', 'Spellbook Advancement', 'The spellbook begins with six chosen level 1 Wizard spells. Each Wizard level after 1 normally adds two eligible chosen Wizard spells, and found Wizard spells can be copied under the SRD time and cost rules. M12E persists the resulting ownership but does not implement Level Up history or copying transactions.')],
});
const RITUAL_ADEPT = feature('ritual-adept', 'Ritual Adept', 'You can cast a Wizard spell as a Ritual from your spellbook even when that spell is not prepared.', { referenceEffects: [ref('ritual-execution', 'Ritual Execution', 'M12E derives ritual eligibility from provider-owned spellbook content. The additional ritual casting time and cast execution remain player-managed.')] });
const ARCANE_RECOVERY = feature('arcane-recovery', 'Arcane Recovery', 'When you finish a Short Rest, recover expended Wizard spell slots with a combined level no greater than half your Wizard level rounded up; level 6+ slots are ineligible. Once used, this recovery is unavailable until a Long Rest.', {
  resources: [{ id: WIZARD_ARCANE_RECOVERY_RESOURCE_ID, name: 'Arcane Recovery', source: SRD_5_2_1_SOURCE, maximum: { kind: 'level-table', values: [{ level: 1, uses: 1 }] }, recovery: [{ trigger: 'long-rest', mode: 'all' }] }],
  resourceTransactions: [{ id: WIZARD_ARCANE_RECOVERY_TRANSACTION_ID, name: 'Arcane Recovery', kind: 'restore-spell-slots-with-budget', providerId: WIZARD_SPELLCASTING_PROVIDER_ID, usageResourceId: WIZARD_ARCANE_RECOVERY_RESOURCE_ID, budget: { kind: 'half-level-round-up' }, maximumSpellLevel: 5, timing: 'short-rest' }],
});
const SCHOLAR = feature('scholar', 'Scholar', 'Choose one qualifying Wizard skill in which you are proficient and gain Expertise in it.', { referenceEffects: [ref('expertise-choice', 'Scholar Expertise', 'The qualifying skill choice and resulting Expertise ownership remain reference-only; M12E does not add a Wizard-specific persistent choice field.')] });
const SUBCLASS = feature('subclass', 'Wizard Subclass', 'You gain a Wizard subclass.');
const ASI = feature('ability-score-improvement', 'Ability Score Improvement', 'You gain the Ability Score Improvement feat or another feat for which you qualify.', { referenceEffects: [ref('feat-acquisition', 'Feat Acquisition', 'Class-granted feat ownership remains player-managed; this is not a Level Up workflow.')] });
const MEMORIZE_SPELL = feature('memorize-spell', 'Memorize Spell', 'After a Short Rest, you can replace one prepared level 1+ Wizard spell with another eligible spell from your spellbook.', { referenceEffects: [ref('short-rest-preparation-swap', 'Memorize Spell', 'M12E persists the final prepared selection but does not automatically gate or orchestrate this Short Rest replacement transaction.')] });
const SUBCLASS_FEATURE = feature('subclass-feature', 'Subclass feature', 'You gain a feature from your selected Wizard subclass.');
const SPELL_MASTERY = feature('spell-mastery', 'Spell Mastery', 'Choose one eligible level 1 and one eligible level 2 Wizard spell from your spellbook; they are always prepared and can be cast at their lowest level without spending a spell slot.', { referenceEffects: [ref('spell-mastery-choice', 'Spell Mastery', 'Spell Mastery ownership, its Long Rest replacement option, and free-cast spell-event handling remain reference-only in M12E.')] });
const EPIC_BOON = feature('epic-boon', 'Epic Boon', 'You gain an Epic Boon feat or another feat for which you qualify.', { referenceEffects: [ref('feat-acquisition', 'Epic Boon Choice', 'Feat acquisition remains player-managed.')] });
const SIGNATURE_SPELLS = feature('signature-spells', 'Signature Spells', 'Choose two eligible level 3 Wizard spells from your spellbook. They are always prepared and each can be cast once at level 3 without a spell slot per Short or Long Rest.', { referenceEffects: [ref('signature-spell-choice', 'Signature Spells', 'Signature spell ownership, always-prepared derivation, free-cast uses, and rest recovery remain reference-only in M12E rather than adding feature-specific spell ownership or cast-state fields.')] });

const rows: Array<[number, number, readonly ClassFeatureContent[]]> = [
  [1, 2, [SPELLCASTING, RITUAL_ADEPT, ARCANE_RECOVERY]], [2, 2, [SCHOLAR]], [3, 2, [SUBCLASS]], [4, 2, [ASI]], [5, 3, [MEMORIZE_SPELL]],
  [6, 3, [SUBCLASS_FEATURE]], [7, 3, []], [8, 3, [ASI]], [9, 4, []], [10, 4, [SUBCLASS_FEATURE]], [11, 4, []], [12, 4, [ASI]],
  [13, 5, []], [14, 5, [SUBCLASS_FEATURE]], [15, 5, []], [16, 5, [ASI]], [17, 6, []], [18, 6, [SPELL_MASTERY]], [19, 6, [EPIC_BOON]], [20, 6, [SIGNATURE_SPELLS]],
];

export const SRD_WIZARD = {
  id: srdId('class', 'wizard'),
  kind: 'class',
  name: 'Wizard',
  source: SRD_5_2_1_SOURCE,
  hitDie: 6,
  fixedHitPointsPerLevel: 4,
  primaryAbility: { mode: 'one-of', abilities: ['intelligence'] },
  multiclassProficiencies: { weaponProficiencies: [], armorTraining: [], toolProficiencies: [] },
  savingThrowProficiencies: ['intelligence', 'wisdom'],
  weaponProficiencies: [{ kind: 'category', category: 'simple' }],
  armorTraining: [],
  toolProficiencies: [],
  skillChoices: { choose: 2, from: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'nature', 'religion'] },
  startingEquipment: [
    { id: 'A', items: [{ label: 'Dagger', quantity: 2, contentId: weapon('dagger') }, { label: 'Arcane Focus (Quarterstaff)', contentId: weapon('quarterstaff') }, { label: 'Robe', inventoryCategory: 'adventuring-gear' }, { label: 'Spellbook', inventoryCategory: 'adventuring-gear' }, { label: 'Scholar’s Pack', inventoryCategory: 'adventuring-gear' }], currency: coin(5) },
    { id: 'B', items: [], currency: coin(55) },
  ],
  progression: rows.map(([level, proficiencyBonus, features]) => ({ level, proficiencyBonus, features })),
  resources: [],
} as const satisfies ClassContent;
