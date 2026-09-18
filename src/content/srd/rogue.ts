import type { ClassContent, ClassFeatureContent, ClassFeatureReferenceEffect, Money } from '../../models/content';
import { SRD_5_2_1_SOURCE, srdId } from './source';

const featureId = (slug: string) => srdId('class-feature', `rogue:${slug}`);
const ref = (id: string, name: string, description: string): ClassFeatureReferenceEffect => ({ id, name, description });
const feature = (slug: string, name: string, description: string, referenceEffects: readonly ClassFeatureReferenceEffect[] = []): ClassFeatureContent => ({ id: featureId(slug), name, description, effects: [], referenceEffects });
const coin = (amount: number): Money => ({ amount, unit: 'gp' });
const content = (kind: 'weapon' | 'armor', slug: string) => srdId(kind, slug);

const EXPERTISE = feature('expertise', 'Expertise', 'You gain Expertise in selected skill proficiencies.', [ref('expertise-choice', 'Expertise Choices', 'Expertise ownership choices are intentionally reference-only in Milestone 11.')]);
const SNEAK_ATTACK = feature('sneak-attack', 'Sneak Attack', 'Once per turn, qualifying attacks can deal extra damage that scales with Rogue level.', [ref('sneak-attack', 'Sneak Attack', 'Qualifying target/Advantage conditions and once-per-turn damage are reference-only.')]);
const THIEVES_CANT = feature('thieves-cant', 'Thieves’ Cant', 'You know Thieves’ Cant and another language.', [ref('language-choice', 'Additional Language', 'Language ownership choices are not persisted by the current Character schema.')]);
const WEAPON_MASTERY = feature('weapon-mastery', 'Weapon Mastery', 'You can use the mastery properties of two weapons with which you are proficient.', [ref('weapon-mastery-selection', 'Weapon Mastery Selection', 'Specific mastered weapon choices are not persisted by the current Character schema.')]);
const CUNNING_ACTION = feature('cunning-action', 'Cunning Action', 'You can Dash, Disengage, or Hide as a Bonus Action.', [ref('bonus-actions', 'Cunning Action', 'Turn action economy and movement state are reference-only.')]);
const SUBCLASS = feature('subclass', 'Rogue Subclass', 'You gain a Rogue subclass.');
const STEADY_AIM = feature('steady-aim', 'Steady Aim', 'You can trade movement for Advantage on your next attack this turn.', [ref('steady-aim', 'Steady Aim', 'Turn movement and next-attack Advantage are reference-only.')]);
const ASI = feature('ability-score-improvement', 'Ability Score Improvement', 'You gain the Ability Score Improvement feat or another feat for which you qualify.', [ref('feat-acquisition', 'Feat Acquisition', 'Class-granted feat selection remains player-managed; this is not a Level Up workflow.')]);
const CUNNING_STRIKE = feature('cunning-strike', 'Cunning Strike', 'You can trade Sneak Attack dice for special strike effects.', [ref('cunning-strike', 'Cunning Strike', 'Sneak Attack die-cost options, targets, and saving throws are reference-only.')]);
const UNCANNY_DODGE = feature('uncanny-dodge', 'Uncanny Dodge', 'You can use a Reaction to halve qualifying attack damage.', [ref('damage-reaction', 'Uncanny Dodge', 'Incoming attack-event and Reaction orchestration are reference-only.')]);
const EVASION = feature('evasion', 'Evasion', 'You can avoid or reduce certain Dexterity-save damage.', [ref('save-damage', 'Evasion', 'Automatic save-result damage transformation is reference-only.')]);
const RELIABLE_TALENT = feature('reliable-talent', 'Reliable Talent', 'Low d20 results on proficient skill or tool checks can be treated as 10.', [ref('minimum-check-roll', 'Reliable Talent', 'This optional d20 replacement remains reference-only in M13E: exact Advantage/Disadvantage replacement requires a post-roll die choice, and tool checks are not represented by the current Character roll model.')]);
const SUBCLASS_FEATURE = feature('subclass-feature', 'Subclass feature', 'You gain a feature from your selected Rogue subclass.');
const IMPROVED_CUNNING_STRIKE = feature('improved-cunning-strike', 'Improved Cunning Strike', 'You can combine more Cunning Strike options.', CUNNING_STRIKE.referenceEffects);
const DEVIOUS_STRIKES = feature('devious-strikes', 'Devious Strikes', 'You gain additional Cunning Strike options.', CUNNING_STRIKE.referenceEffects);
const SLIPPERY_MIND: ClassFeatureContent = { id: featureId('slippery-mind'), name: 'Slippery Mind', description: 'You gain proficiency in Wisdom and Charisma saving throws.', effects: [{ type: 'saving-throw-proficiency', abilities: ['wisdom', 'charisma'] }], referenceEffects: [] };
const ELUSIVE = feature('elusive', 'Elusive', 'Attackers cannot gain Advantage against you while you are not Incapacitated.', [ref('conditional-defense', 'Elusive', 'Attacker and condition-state automation is reference-only.')]);
const EPIC_BOON = feature('epic-boon', 'Epic Boon', 'You gain an Epic Boon feat or another feat for which you qualify.', [ref('feat-acquisition', 'Epic Boon Choice', 'Feat acquisition remains player-managed.')]);
const STROKE_OF_LUCK = feature('stroke-of-luck', 'Stroke of Luck', 'You can turn a failed D20 Test into a 20 once per Short or Long Rest.', [ref('roll-replacement', 'Stroke of Luck', 'Failed-test detection and replacement are reference-only.')]);

const rows: Array<[number, number, readonly ClassFeatureContent[]]> = [
  [1, 2, [EXPERTISE, SNEAK_ATTACK, THIEVES_CANT, WEAPON_MASTERY]], [2, 2, [CUNNING_ACTION]], [3, 2, [SUBCLASS, STEADY_AIM]], [4, 2, [ASI]],
  [5, 3, [CUNNING_STRIKE, UNCANNY_DODGE]], [6, 3, [EXPERTISE]], [7, 3, [EVASION, RELIABLE_TALENT]], [8, 3, [ASI]], [9, 4, [SUBCLASS_FEATURE]],
  [10, 4, [ASI]], [11, 4, [IMPROVED_CUNNING_STRIKE]], [12, 4, [ASI]], [13, 5, [SUBCLASS_FEATURE]], [14, 5, [DEVIOUS_STRIKES]],
  [15, 5, [SLIPPERY_MIND]], [16, 5, [ASI]], [17, 6, [SUBCLASS_FEATURE]], [18, 6, [ELUSIVE]], [19, 6, [EPIC_BOON]], [20, 6, [STROKE_OF_LUCK]],
];

export const SRD_ROGUE = {
  id: srdId('class', 'rogue'),
  kind: 'class',
  name: 'Rogue',
  source: SRD_5_2_1_SOURCE,
  hitDie: 8,
  fixedHitPointsPerLevel: 5,
  primaryAbility: { mode: 'one-of', abilities: ['dexterity'] },
  savingThrowProficiencies: ['dexterity', 'intelligence'],
  weaponProficiencies: [
    { kind: 'category', category: 'simple' },
    { kind: 'category-with-property', category: 'martial', anyOfProperties: ['finesse', 'light'] },
  ],
  armorTraining: ['light'],
  toolProficiencies: [{ id: 'thieves-tools', name: 'Thieves’ Tools' }],
  skillChoices: { choose: 4, from: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'persuasion', 'sleight-of-hand', 'stealth'] },
  startingEquipment: [
    { id: 'A', items: [{ label: 'Leather Armor', contentId: content('armor', 'leather-armor') }, { label: 'Dagger', quantity: 2, contentId: content('weapon', 'dagger') }, { label: 'Shortsword', contentId: content('weapon', 'shortsword') }, { label: 'Shortbow', contentId: content('weapon', 'shortbow') }, { label: 'Arrow', quantity: 20, inventoryCategory: 'ammunition' }, { label: 'Quiver', inventoryCategory: 'adventuring-gear' }, { label: 'Thieves’ Tools', inventoryCategory: 'adventuring-gear' }, { label: 'Burglar’s Pack', inventoryCategory: 'adventuring-gear' }], currency: coin(8) },
    { id: 'B', items: [], currency: coin(100) },
  ],
  progression: rows.map(([level, proficiencyBonus, features]) => ({ level, proficiencyBonus, features, weaponMasteryChoices: 2 })),
  resources: [],
} as const satisfies ClassContent;
