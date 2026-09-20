import type { ClassContent, ClassFeatureContent, ClassFeatureReferenceEffect, Money } from '../../models/content';
import { SRD_5_2_1_SOURCE, srdId } from './source';

export const BARBARIAN_RAGE_RESOURCE_ID = srdId('class-resource', 'barbarian:rage');
export const BARBARIAN_RAGE_ACTIVE_EFFECT_ID = srdId('active-self-effect', 'barbarian:rage');

const featureId = (slug: string) => srdId('class-feature', `barbarian:${slug}`);
const ref = (id: string, name: string, description: string): ClassFeatureReferenceEffect => ({ id, name, description });
const feature = (
  slug: string,
  name: string,
  description: string,
  options: Partial<Pick<ClassFeatureContent, 'effects' | 'resourceConsumers' | 'activeSelfEffects' | 'referenceEffects'>> = {},
): ClassFeatureContent => ({
  id: featureId(slug),
  name,
  description,
  effects: options.effects ?? [],
  ...(options.resourceConsumers ? { resourceConsumers: options.resourceConsumers } : {}),
  ...(options.activeSelfEffects ? { activeSelfEffects: options.activeSelfEffects } : {}),
  referenceEffects: options.referenceEffects ?? [],
});
const coin = (amount: number): Money => ({ amount, unit: 'gp' });
const weapon = (slug: string) => srdId('weapon', slug);

const RAGE = feature('rage', 'Rage', 'You can enter a primal Rage a limited number of times, recovering one use on a Short Rest and all uses on a Long Rest.', {
  activeSelfEffects: [{
    id: BARBARIAN_RAGE_ACTIVE_EFFECT_ID,
    name: 'Rage',
    description: 'Enter Rage as a Bonus Action while not wearing Heavy armor.',
    activationTiming: 'bonus-action',
    activationCost: { resourceId: BARBARIAN_RAGE_RESOURCE_ID, amount: 1 },
    modifiers: [
      { type: 'd20-roll-mode', mode: 'advantage', target: { kind: 'ability-check', abilities: ['strength'] } },
      { type: 'd20-roll-mode', mode: 'advantage', target: { kind: 'saving-throw', abilities: ['strength'] } },
      { type: 'weapon-damage-bonus', abilities: ['strength'], amount: { kind: 'level-table', values: [{ level: 1, amount: 2 }, { level: 9, amount: 3 }, { level: 16, amount: 4 }] } },
    ],
    restrictions: [{ type: 'concentration', mode: 'end-and-block' }, { type: 'spellcasting', mode: 'block' }],
    eligibility: [{ type: 'not-wearing-armor-category', category: 'heavy' }],
    termination: [{ type: 'wearing-armor-category', category: 'heavy' }, { type: 'condition', condition: 'incapacitated' }],
    referenceText: 'Rage duration and turn-by-turn extension/event maintenance remain manual. Heavy armor and Incapacitated termination are structured. Bludgeoning, Piercing, and Slashing resistance is reference-only because incoming damage is not intercepted.',
  }],
  referenceEffects: [
    ref('rage-resistance-duration', 'Rage Manual Limits', 'Damage resistance and turn-by-turn Rage duration/extension remain reference-only; M13D tracks only bounded self-side state and deterministic modifiers.'),
  ],
});
const UNARMORED_DEFENSE = feature('unarmored-defense', 'Unarmored Defense', 'While not wearing armor, your base Armor Class is 10 plus Dexterity and Constitution modifiers; a Shield is allowed.', {
  effects: [{ type: 'unarmored-armor-class', base: 10, abilities: ['dexterity', 'constitution'], allowShield: true }],
});
const WEAPON_MASTERY = feature('weapon-mastery', 'Weapon Mastery', 'You can use mastery properties of a number of weapons determined by Barbarian level.', {
  referenceEffects: [ref('weapon-mastery-selection', 'Weapon Mastery Selection', 'Specific mastered weapon choices are not persisted by the current Character schema.')],
});
const DANGER_SENSE = feature('danger-sense', 'Danger Sense', 'You have heightened awareness of effects you can see.', { referenceEffects: [ref('dex-save-advantage', 'Danger Sense', 'Conditional Dexterity saving-throw Advantage is reference-only.')] });
const RECKLESS_ATTACK = feature('reckless-attack', 'Reckless Attack', 'You can attack recklessly with Strength-based attacks.', { referenceEffects: [ref('reckless-attack', 'Reckless Attack', 'Turn-scoped attack Advantage and attacks-against-you Advantage require combat state and remain reference-only.')] });
const SUBCLASS = feature('subclass', 'Barbarian Subclass', 'You gain a Barbarian subclass.');
const PRIMAL_KNOWLEDGE = feature('primal-knowledge', 'Primal Knowledge', 'You gain another Barbarian skill proficiency and can use Strength for certain checks while raging.', { referenceEffects: [ref('primal-knowledge-choice', 'Primal Knowledge Choice', 'The added skill choice and Rage-dependent ability substitution are player-managed/reference-only in Milestone 11.')] });
const ASI = feature('ability-score-improvement', 'Ability Score Improvement', 'You gain the Ability Score Improvement feat or another feat for which you qualify.', { referenceEffects: [ref('feat-acquisition', 'Feat Acquisition', 'Class-granted feat selection remains player-managed; this is not a Level Up workflow.')] });
const EXTRA_ATTACK = feature('extra-attack', 'Extra Attack', 'You can attack twice when you take the Attack action.', { referenceEffects: [ref('attack-count', 'Extra Attack', 'Attack-action orchestration is reference-only.')] });
const FAST_MOVEMENT = feature('fast-movement', 'Fast Movement', 'Your Speed increases by 10 feet while you are not wearing Heavy armor.', { effects: [{ type: 'speed-bonus', amount: { kind: 'fixed', amount: 10 }, disallowedArmorCategories: ['heavy'] }] });
const SUBCLASS_FEATURE = feature('subclass-feature', 'Subclass feature', 'You gain a feature from your selected Barbarian subclass.');
const FERAL_INSTINCT = feature('feral-instinct', 'Feral Instinct', 'Your instincts sharpen your Initiative.', { effects: [{ type: 'initiative-roll-mode', mode: 'advantage' }] });
const INSTINCTIVE_POUNCE = feature('instinctive-pounce', 'Instinctive Pounce', 'Entering Rage can let you move up to half your Speed.', { referenceEffects: [ref('rage-movement', 'Instinctive Pounce', 'Turn movement and Rage activation state are reference-only.')] });
const BRUTAL_STRIKE = feature('brutal-strike', 'Brutal Strike', 'You can trade Reckless Attack Advantage for extra damage and a strike effect.', { referenceEffects: [ref('brutal-strike', 'Brutal Strike', 'Attack-event damage and rider selection are reference-only.')] });
const RELENTLESS_RAGE = feature('relentless-rage', 'Relentless Rage', 'While raging, you can sometimes remain at 1 Hit Point instead of dropping to 0.', { referenceEffects: [ref('zero-hp-save', 'Relentless Rage', 'Damage-event and automatic saving-throw adjudication are reference-only.')] });
const IMPROVED_BRUTAL_STRIKE = feature('improved-brutal-strike', 'Improved Brutal Strike', 'Brutal Strike improves.', { referenceEffects: BRUTAL_STRIKE.referenceEffects });
const PERSISTENT_RAGE = feature('persistent-rage', 'Persistent Rage', 'Your Rage lasts longer and can be restored when Initiative is rolled.', { referenceEffects: [ref('initiative-refresh', 'Persistent Rage', 'M13D tracks active Rage, but Initiative-triggered resource refresh and the feature-specific extended Rage duration remain reference-only.')] });
const INDOMITABLE_MIGHT = feature('indomitable-might', 'Indomitable Might', 'Low Strength check or save totals can use your Strength score instead.', { referenceEffects: [ref('minimum-strength-total', 'Indomitable Might', 'D20 result replacement is reference-only.')] });
const EPIC_BOON = feature('epic-boon', 'Epic Boon', 'You gain an Epic Boon feat or another feat for which you qualify.', { referenceEffects: [ref('feat-acquisition', 'Epic Boon Choice', 'Feat acquisition remains player-managed.')] });
const PRIMAL_CHAMPION = feature('primal-champion', 'Primal Champion', 'Your Strength and Constitution can increase beyond normal mortal limits.', { referenceEffects: [ref('ability-cap-increase', 'Primal Champion', 'Class-driven ability-score changes and altered caps are reference-only in Milestone 11.')] });

const mastery = (level: number) => level >= 10 ? 4 : level >= 4 ? 3 : 2;
const rows: Array<[number, number, readonly ClassFeatureContent[]]> = [
  [1, 2, [RAGE, UNARMORED_DEFENSE, WEAPON_MASTERY]],
  [2, 2, [DANGER_SENSE, RECKLESS_ATTACK]],
  [3, 2, [SUBCLASS, PRIMAL_KNOWLEDGE]],
  [4, 2, [ASI]],
  [5, 3, [EXTRA_ATTACK, FAST_MOVEMENT]],
  [6, 3, [SUBCLASS_FEATURE]],
  [7, 3, [FERAL_INSTINCT, INSTINCTIVE_POUNCE]],
  [8, 3, [ASI]],
  [9, 4, [BRUTAL_STRIKE]],
  [10, 4, [SUBCLASS_FEATURE]],
  [11, 4, [RELENTLESS_RAGE]],
  [12, 4, [ASI]],
  [13, 5, [IMPROVED_BRUTAL_STRIKE]],
  [14, 5, [SUBCLASS_FEATURE]],
  [15, 5, [PERSISTENT_RAGE]],
  [16, 5, [ASI]],
  [17, 6, [IMPROVED_BRUTAL_STRIKE]],
  [18, 6, [INDOMITABLE_MIGHT]],
  [19, 6, [EPIC_BOON]],
  [20, 6, [PRIMAL_CHAMPION]],
];

export const SRD_BARBARIAN = {
  id: srdId('class', 'barbarian'),
  kind: 'class',
  name: 'Barbarian',
  source: SRD_5_2_1_SOURCE,
  hitDie: 12,
  fixedHitPointsPerLevel: 7,
  primaryAbility: { mode: 'one-of', abilities: ['strength'] },
  multiclassProficiencies: { weaponProficiencies: [{ kind: 'category', category: 'martial' }], armorTraining: ['shield'], toolProficiencies: [] },
  savingThrowProficiencies: ['strength', 'constitution'],
  weaponProficiencies: [{ kind: 'category', category: 'simple' }, { kind: 'category', category: 'martial' }],
  armorTraining: ['light', 'medium', 'shield'],
  toolProficiencies: [],
  skillChoices: { choose: 2, from: ['animal-handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'] },
  startingEquipment: [
    { id: 'A', items: [{ label: 'Greataxe', contentId: weapon('greataxe') }, { label: 'Handaxe', quantity: 4, contentId: weapon('handaxe') }, { label: 'Explorer’s Pack', inventoryCategory: 'adventuring-gear' }], currency: coin(15) },
    { id: 'B', items: [], currency: coin(75) },
  ],
  progression: rows.map(([level, proficiencyBonus, features]) => ({ level, proficiencyBonus, features, weaponMasteryChoices: mastery(level) })),
  resources: [{
    id: BARBARIAN_RAGE_RESOURCE_ID,
    name: 'Rage',
    source: SRD_5_2_1_SOURCE,
    maximum: { kind: 'level-table', values: [{ level: 1, uses: 2 }, { level: 3, uses: 3 }, { level: 6, uses: 4 }, { level: 12, uses: 5 }, { level: 17, uses: 6 }] },
    recovery: [{ trigger: 'short-rest', mode: 'amount', amount: 1 }, { trigger: 'long-rest', mode: 'all' }],
  }],
} as const satisfies ClassContent;
