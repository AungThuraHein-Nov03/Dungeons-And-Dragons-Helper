import type { ClassContent, ClassFeatureContent, ClassFeatureReferenceEffect, Money, ResourceConsumerGrant } from '../../models/content';
import { SRD_5_2_1_SOURCE, srdId } from './source';

export const FIGHTER_SECOND_WIND_RESOURCE_ID = srdId('class-resource', 'fighter:second-wind');
export const FIGHTER_ACTION_SURGE_RESOURCE_ID = srdId('class-resource', 'fighter:action-surge');

const featureId = (slug: string) => srdId('class-feature', `fighter:${slug}`);
const ref = (id: string, name: string, description: string): ClassFeatureReferenceEffect => ({ id, name, description });
const feature = (
  slug: string,
  name: string,
  description: string,
  options: {
    effects?: ClassFeatureContent['effects'];
    resourceConsumers?: readonly ResourceConsumerGrant[];
    referenceEffects?: readonly ClassFeatureReferenceEffect[];
  } = {},
): ClassFeatureContent => ({
  id: featureId(slug),
  name,
  description,
  effects: options.effects ?? [],
  ...(options.resourceConsumers ? { resourceConsumers: options.resourceConsumers } : {}),
  referenceEffects: options.referenceEffects ?? [],
});

const coin = (amount: number): Money => ({ amount, unit: 'gp' });
const content = (kind: 'weapon' | 'armor', slug: string) => srdId(kind, slug);

const FIGHTING_STYLE = feature('fighting-style', 'Fighting Style', 'You gain a Fighting Style feat.', {
  referenceEffects: [ref('fighting-style-choice', 'Fighting Style Choice', 'Fighting Style ownership and selection remain explicit player-managed choices.')],
});
const SECOND_WIND_ID = featureId('second-wind');
const SECOND_WIND = feature('second-wind', 'Second Wind', 'You can draw on stamina to recover Hit Points.', {
  resourceConsumers: [{ resourceId: FIGHTER_SECOND_WIND_RESOURCE_ID, consumer: { id: SECOND_WIND_ID, name: 'Second Wind', effect: { type: 'manual-healing', die: 10, bonus: 'class-level' } } }],
});
const WEAPON_MASTERY = feature('weapon-mastery', 'Weapon Mastery', 'You can use mastery properties of a number of weapons determined by Fighter level.', {
  referenceEffects: [ref('weapon-mastery-selection', 'Weapon Mastery Selection', 'Specific mastered weapon choices are not persisted by the current Character schema.')],
});
const ACTION_SURGE_ID = featureId('action-surge');
const ACTION_SURGE = feature('action-surge', 'Action Surge', 'You can push yourself beyond your normal limits for an additional action.', {
  resourceConsumers: [{ resourceId: FIGHTER_ACTION_SURGE_RESOURCE_ID, consumer: { id: ACTION_SURGE_ID, name: 'Action Surge', effect: { type: 'expend-only' } } }],
});
const TACTICAL_MIND_ID = featureId('tactical-mind');
const TACTICAL_MIND = feature('tactical-mind', 'Tactical Mind', 'You can expend Second Wind to improve a failed ability check.', {
  resourceConsumers: [{ resourceId: FIGHTER_SECOND_WIND_RESOURCE_ID, consumer: { id: TACTICAL_MIND_ID, name: 'Tactical Mind', effect: { type: 'tracking-only' } } }],
  referenceEffects: [ref('failed-check-resolution', 'Failed Check Resolution', 'The app tracks expenditure but does not know the failed check DC or decide whether the bonus changes the result.')],
});
const SUBCLASS = feature('subclass', 'Fighter Subclass', 'You gain a Fighter subclass.');
const ASI = feature('ability-score-improvement', 'Ability Score Improvement', 'You gain the Ability Score Improvement feat or another feat for which you qualify.', {
  referenceEffects: [ref('feat-acquisition', 'Feat Acquisition', 'Class-granted feat choice ownership remains player-managed; this is not a Level Up workflow.')],
});
const EXTRA_ATTACK = feature('extra-attack', 'Extra Attack', 'You can attack twice instead of once when you take the Attack action.', {
  referenceEffects: [ref('extra-attack', 'Extra Attack', 'Attack-action orchestration is reference-only.')],
});
const TACTICAL_SHIFT = feature('tactical-shift', 'Tactical Shift', 'Second Wind can also reposition you without provoking Opportunity Attacks.', {
  referenceEffects: [ref('movement', 'Tactical Shift Movement', 'Movement and Opportunity Attack automation are not implemented.')],
});
const SUBCLASS_FEATURE = feature('subclass-feature', 'Subclass feature', 'You gain a feature from your selected Fighter subclass.');
const INDOMITABLE_1 = feature('indomitable-one-use', 'Indomitable (one use)', 'You can reroll a failed saving throw with a Fighter-level bonus.', { referenceEffects: [ref('save-reroll', 'Indomitable', 'Saving-throw reroll orchestration is reference-only.')] });
const TACTICAL_MASTER = feature('tactical-master', 'Tactical Master', 'You can replace the mastery property of a qualifying weapon attack with a tactical mastery option.', { referenceEffects: [ref('mastery-substitution', 'Tactical Master', 'Per-attack mastery substitution is reference-only.')] });
const TWO_EXTRA_ATTACKS = feature('two-extra-attacks', 'Two Extra Attacks', 'Your Extra Attack feature allows three attacks.', { referenceEffects: [ref('attack-count', 'Two Extra Attacks', 'Attack-action orchestration is reference-only.')] });
const INDOMITABLE_2 = feature('indomitable-two-uses', 'Indomitable (two uses)', 'Your Indomitable feature can be used twice.', { referenceEffects: INDOMITABLE_1.referenceEffects });
const STUDIED_ATTACKS = feature('studied-attacks', 'Studied Attacks', 'Missing with an attack can grant Advantage on your next attack against the same target.', { referenceEffects: [ref('targeted-advantage', 'Studied Attacks', 'Target tracking and combat-event Advantage are reference-only.')] });
const ACTION_SURGE_2 = feature('action-surge-two-uses', 'Action Surge (two uses)', 'Your Action Surge resource maximum increases to two uses.');
const INDOMITABLE_3 = feature('indomitable-three-uses', 'Indomitable (three uses)', 'Your Indomitable feature can be used three times.', { referenceEffects: INDOMITABLE_1.referenceEffects });
const EPIC_BOON = feature('epic-boon', 'Epic Boon', 'You gain an Epic Boon feat or another feat for which you qualify.', { referenceEffects: [ref('feat-acquisition', 'Epic Boon Choice', 'Feat acquisition remains player-managed.')] });
const THREE_EXTRA_ATTACKS = feature('three-extra-attacks', 'Three Extra Attacks', 'Your Extra Attack feature allows four attacks.', { referenceEffects: [ref('attack-count', 'Three Extra Attacks', 'Attack-action orchestration is reference-only.')] });

export const SRD_FIGHTER = {
  id: srdId('class', 'fighter'),
  kind: 'class',
  name: 'Fighter',
  source: SRD_5_2_1_SOURCE,
  hitDie: 10,
  fixedHitPointsPerLevel: 6,
  primaryAbility: { mode: 'one-of', abilities: ['strength', 'dexterity'] },
  multiclassProficiencies: { weaponProficiencies: [{ kind: 'category', category: 'martial' }], armorTraining: ['light', 'medium', 'shield'], toolProficiencies: [] },
  savingThrowProficiencies: ['strength', 'constitution'],
  weaponProficiencies: [{ kind: 'category', category: 'simple' }, { kind: 'category', category: 'martial' }],
  armorTraining: ['light', 'medium', 'heavy', 'shield'],
  toolProficiencies: [],
  skillChoices: {
    choose: 2,
    from: ['acrobatics', 'animal-handling', 'athletics', 'history', 'insight', 'intimidation', 'persuasion', 'perception', 'survival'],
  },
  startingEquipment: [
    {
      id: 'A',
      items: [
        { label: 'Chain Mail', contentId: content('armor', 'chain-mail') },
        { label: 'Greatsword', contentId: content('weapon', 'greatsword') },
        { label: 'Flail', contentId: content('weapon', 'flail') },
        { label: 'Javelin', quantity: 8, contentId: content('weapon', 'javelin') },
        { label: 'Dungeoneer’s Pack', inventoryCategory: 'adventuring-gear' },
      ],
      currency: coin(4),
    },
    {
      id: 'B',
      items: [
        { label: 'Studded Leather Armor', contentId: content('armor', 'studded-leather-armor') },
        { label: 'Scimitar', contentId: content('weapon', 'scimitar') },
        { label: 'Shortsword', contentId: content('weapon', 'shortsword') },
        { label: 'Longbow', contentId: content('weapon', 'longbow') },
        { label: 'Arrow', quantity: 20, inventoryCategory: 'ammunition' },
        { label: 'Quiver', inventoryCategory: 'adventuring-gear' },
        { label: 'Dungeoneer’s Pack', inventoryCategory: 'adventuring-gear' },
      ],
      currency: coin(11),
    },
    { id: 'C', items: [], currency: coin(155) },
  ],
  progression: [
    { level: 1, proficiencyBonus: 2, features: [FIGHTING_STYLE, SECOND_WIND, WEAPON_MASTERY], weaponMasteryChoices: 3 },
    { level: 2, proficiencyBonus: 2, features: [ACTION_SURGE, TACTICAL_MIND], weaponMasteryChoices: 3 },
    { level: 3, proficiencyBonus: 2, features: [SUBCLASS], weaponMasteryChoices: 3 },
    { level: 4, proficiencyBonus: 2, features: [ASI], weaponMasteryChoices: 4 },
    { level: 5, proficiencyBonus: 3, features: [EXTRA_ATTACK, TACTICAL_SHIFT], weaponMasteryChoices: 4 },
    { level: 6, proficiencyBonus: 3, features: [ASI], weaponMasteryChoices: 4 },
    { level: 7, proficiencyBonus: 3, features: [SUBCLASS_FEATURE], weaponMasteryChoices: 4 },
    { level: 8, proficiencyBonus: 3, features: [ASI], weaponMasteryChoices: 4 },
    { level: 9, proficiencyBonus: 4, features: [INDOMITABLE_1, TACTICAL_MASTER], weaponMasteryChoices: 4 },
    { level: 10, proficiencyBonus: 4, features: [SUBCLASS_FEATURE], weaponMasteryChoices: 5 },
    { level: 11, proficiencyBonus: 4, features: [TWO_EXTRA_ATTACKS], weaponMasteryChoices: 5 },
    { level: 12, proficiencyBonus: 4, features: [ASI], weaponMasteryChoices: 5 },
    { level: 13, proficiencyBonus: 5, features: [INDOMITABLE_2, STUDIED_ATTACKS], weaponMasteryChoices: 5 },
    { level: 14, proficiencyBonus: 5, features: [ASI], weaponMasteryChoices: 5 },
    { level: 15, proficiencyBonus: 5, features: [SUBCLASS_FEATURE], weaponMasteryChoices: 5 },
    { level: 16, proficiencyBonus: 5, features: [ASI], weaponMasteryChoices: 6 },
    { level: 17, proficiencyBonus: 6, features: [ACTION_SURGE_2, INDOMITABLE_3], weaponMasteryChoices: 6 },
    { level: 18, proficiencyBonus: 6, features: [SUBCLASS_FEATURE], weaponMasteryChoices: 6 },
    { level: 19, proficiencyBonus: 6, features: [EPIC_BOON], weaponMasteryChoices: 6 },
    { level: 20, proficiencyBonus: 6, features: [THREE_EXTRA_ATTACKS], weaponMasteryChoices: 6 },
  ],
  resources: [
    {
      id: FIGHTER_SECOND_WIND_RESOURCE_ID,
      name: 'Second Wind',
      source: SRD_5_2_1_SOURCE,
      maximum: { kind: 'level-table', values: [{ level: 1, uses: 2 }, { level: 4, uses: 3 }, { level: 10, uses: 4 }] },
      recovery: [{ trigger: 'short-rest', mode: 'amount', amount: 1 }, { trigger: 'long-rest', mode: 'all' }],
    },
    {
      id: FIGHTER_ACTION_SURGE_RESOURCE_ID,
      name: 'Action Surge',
      source: SRD_5_2_1_SOURCE,
      maximum: { kind: 'level-table', values: [{ level: 2, uses: 1 }, { level: 17, uses: 2 }] },
      recovery: [{ trigger: 'short-rest', mode: 'all' }, { trigger: 'long-rest', mode: 'all' }],
    },
  ],
} as const satisfies ClassContent;
