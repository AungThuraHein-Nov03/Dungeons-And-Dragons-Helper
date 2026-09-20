import type { ClassContent, ClassFeatureContent, ClassFeatureReferenceEffect, Money } from '../../models/content';
import { SRD_5_2_1_SOURCE, srdId } from './source';

export const MONK_FOCUS_RESOURCE_ID = srdId('class-resource', 'monk:focus-points');
export const MONK_SUPERIOR_DEFENSE_ACTIVE_EFFECT_ID = srdId('active-self-effect', 'monk:superior-defense');

const featureId = (slug: string) => srdId('class-feature', `monk:${slug}`);
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
const content = (kind: 'weapon', slug: string) => srdId(kind, slug);
const focusConsumer = (slug: string, name: string, amount = 1, trackingOnly = false) => ({
  resourceId: MONK_FOCUS_RESOURCE_ID,
  consumer: {
    id: srdId('class-resource-consumer', `monk:${slug}`),
    name,
    effect: trackingOnly ? ({ type: 'tracking-only' } as const) : amount === 1 ? ({ type: 'expend-only' } as const) : ({ type: 'fixed-expend', amount } as const),
  },
});

const MARTIAL_ARTS = feature('martial-arts', 'Martial Arts', 'Your Unarmed Strikes and Monk weapons use a scaling Martial Arts die and gain additional combat options.', { referenceEffects: [ref('martial-arts-die', 'Martial Arts Die', 'The die is d6 at levels 1–4, d8 at 5–10, d10 at 11–16, and d12 at 17–20. Unarmed Strike creation, conditional Dexterity substitution, and bonus-action attack orchestration remain reference-only.') ] });
const UNARMORED_DEFENSE = feature('unarmored-defense', 'Unarmored Defense', 'While unarmored and without a Shield, your base Armor Class is 10 plus Dexterity and Wisdom modifiers.', { effects: [{ type: 'unarmored-armor-class', base: 10, abilities: ['dexterity', 'wisdom'], allowShield: false }] });
const MONKS_FOCUS = feature('monks-focus', 'Monk’s Focus', 'You gain Focus Points equal to your Monk level beginning at level 2.', {
  resourceConsumers: [focusConsumer('flurry-of-blows', 'Flurry of Blows'), focusConsumer('patient-defense', 'Patient Defense'), focusConsumer('step-of-the-wind', 'Step of the Wind')],
  referenceEffects: [ref('focus-save-dc', 'Focus Save DC', 'Focus features use a save DC based on Wisdom and Proficiency Bonus; target saves and action/attack orchestration remain reference-only.')],
});
const UNARMORED_MOVEMENT = feature('unarmored-movement', 'Unarmored Movement', 'Your Speed increases while you are not wearing armor or wielding a Shield.', { effects: [{ type: 'speed-bonus', amount: { kind: 'level-table', values: [{ level: 2, amount: 10 }, { level: 6, amount: 15 }, { level: 10, amount: 20 }, { level: 14, amount: 25 }, { level: 18, amount: 30 }] }, disallowedArmorCategories: ['light', 'medium', 'heavy'], requireNoShield: true }] });
const UNCANNY_METABOLISM = feature('uncanny-metabolism', 'Uncanny Metabolism', 'When Initiative is rolled, you can restore Focus and recover Hit Points once per Long Rest.', { referenceEffects: [ref('initiative-recovery', 'Uncanny Metabolism', 'Initiative-triggered Focus restoration, Martial Arts healing, and once-per-Long-Rest event state remain reference-only.') ] });
const DEFLECT_ATTACKS = feature('deflect-attacks', 'Deflect Attacks', 'You can use a Reaction to reduce qualifying attack damage and may redirect a fully deflected attack by spending Focus.', { resourceConsumers: [focusConsumer('deflect-attacks-redirect', 'Deflect Attacks Redirect', 1, true)], referenceEffects: [ref('reaction-damage-reduction', 'Deflect Attacks', 'Incoming attack detection, Reaction timing, damage reduction, zero-damage detection, and redirected attacks remain reference-only.') ] });
const SUBCLASS = feature('subclass', 'Monk Subclass', 'You gain a Monk subclass.');
const ASI = feature('ability-score-improvement', 'Ability Score Improvement', 'You gain the Ability Score Improvement feat or another feat for which you qualify.', { referenceEffects: [ref('feat-acquisition', 'Feat Acquisition', 'Class-granted feat ownership remains player-managed; this is not a Level Up workflow.')] });
const SLOW_FALL = feature('slow-fall', 'Slow Fall', 'You can use a Reaction to reduce falling damage by five times your Monk level.', { referenceEffects: [ref('fall-reaction', 'Slow Fall', 'Fall detection and Reaction timing remain reference-only.')] });
const EXTRA_ATTACK = feature('extra-attack', 'Extra Attack', 'You can attack twice instead of once when you take the Attack action.', { referenceEffects: [ref('attack-count', 'Extra Attack', 'Attack-action orchestration remains reference-only.')] });
const STUNNING_STRIKE = feature('stunning-strike', 'Stunning Strike', 'Once per turn after a qualifying hit, you can spend 1 Focus Point to force a Constitution save.', { resourceConsumers: [focusConsumer('stunning-strike', 'Stunning Strike', 1, true)], referenceEffects: [ref('target-save-condition', 'Stunning Strike', 'Hit detection, target save, Stunned state, Speed reduction, and conditional Advantage remain reference-only.') ] });
const EMPOWERED_STRIKES = feature('empowered-strikes', 'Empowered Strikes', 'Your Unarmed Strike damage can become Force damage.', { referenceEffects: [ref('damage-type-choice', 'Empowered Strikes', 'Per-hit damage-type replacement remains reference-only.') ] });
const SUBCLASS_FEATURE = feature('subclass-feature', 'Subclass feature', 'You gain a feature from your selected Monk subclass.');
const EVASION = feature('evasion', 'Evasion', 'Certain Dexterity saving throws reduce or avoid damage more effectively.', { referenceEffects: [ref('save-damage-reduction', 'Evasion', 'Saving-throw event and damage-resolution automation remain reference-only.') ] });
const ACROBATIC_MOVEMENT = feature('acrobatic-movement', 'Acrobatic Movement', 'You can traverse vertical surfaces and liquids during movement.', { referenceEffects: [ref('movement-mode', 'Acrobatic Movement', 'Turn movement and terrain-state handling remain reference-only.') ] });
const HEIGHTENED_FOCUS = feature('heightened-focus', 'Heightened Focus', 'Flurry of Blows, Patient Defense, and Step of the Wind improve.', { referenceEffects: [ref('focus-feature-upgrades', 'Heightened Focus', 'Additional strikes, Temporary Hit Points, and creature-carrying movement remain reference-only; Focus spending continues through the shared pool.') ] });
const SELF_RESTORATION = feature('self-restoration', 'Self-Restoration', 'You can end certain conditions on yourself and no longer gain Exhaustion from lacking food or drink.', { referenceEffects: [ref('condition-removal', 'Self-Restoration', 'Condition and Exhaustion state remain reference-only.') ] });
const DEFLECT_ENERGY = feature('deflect-energy', 'Deflect Energy', 'Deflect Attacks expands to attacks dealing any damage type.', { referenceEffects: [ref('deflect-damage-types', 'Deflect Energy', 'Incoming attack and damage-type event handling remain reference-only.') ] });
const DISCIPLINED_SURVIVOR = feature('disciplined-survivor', 'Disciplined Survivor', 'You gain proficiency in all saving throws and can spend Focus to reroll a failed save.', { effects: [{ type: 'saving-throw-proficiency', abilities: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] }], resourceConsumers: [focusConsumer('disciplined-survivor', 'Disciplined Survivor Reroll', 1, true)], referenceEffects: [ref('failed-save-reroll', 'Disciplined Survivor Reroll', 'The one-Focus failed-save reroll remains an explicit player-managed resolution because the app does not know whether a saving throw failed against an external DC.') ] });
const PERFECT_FOCUS = feature('perfect-focus', 'Perfect Focus', 'Rolling Initiative can restore Focus Points until you have 4.', { referenceEffects: [ref('initiative-refresh', 'Perfect Focus', 'Initiative-triggered Focus restoration remains reference-only; M12C adds no initiative tracker.') ] });
const SUPERIOR_DEFENSE = feature('superior-defense', 'Superior Defense', 'You can spend 3 Focus Points to gain broad damage resistance for a limited duration.', {
  activeSelfEffects: [{
    id: MONK_SUPERIOR_DEFENSE_ACTIVE_EFFECT_ID,
    name: 'Superior Defense',
    description: 'At the start of your turn, expend 3 Focus Points to enter Superior Defense.',
    activationTiming: 'start-of-turn',
    activationCost: { resourceId: MONK_FOCUS_RESOURCE_ID, amount: 3 },
    termination: [{ type: 'condition', condition: 'incapacitated' }],
    referenceText: 'Resistance to all damage except Force and the one-minute duration remain reference-only because PLAY has no incoming-damage or combat-timeline engine.',
  }],
  referenceEffects: [ref('timed-resistance', 'Superior Defense Resistance', 'Resistance to all damage except Force and the one-minute duration remain manual/reference-only; Incapacitated termination is bounded session-state behavior.')],
});
const EPIC_BOON = feature('epic-boon', 'Epic Boon', 'You gain an Epic Boon feat or another feat for which you qualify.', { referenceEffects: [ref('feat-acquisition', 'Epic Boon Choice', 'Feat acquisition remains player-managed.')] });
const BODY_AND_MIND = feature('body-and-mind', 'Body and Mind', 'Your Dexterity and Wisdom scores increase by 4, to a maximum of 25.', { referenceEffects: [ref('ability-score-cap', 'Body and Mind', 'The level-20 ability-score increase is preserved as reference-only because class-driven score mutation with a 25 cap is not part of the bounded M12C effect vocabulary.') ] });

const rows: Array<[number, number, readonly ClassFeatureContent[]]> = [
  [1, 2, [MARTIAL_ARTS, UNARMORED_DEFENSE]], [2, 2, [MONKS_FOCUS, UNARMORED_MOVEMENT, UNCANNY_METABOLISM]], [3, 2, [DEFLECT_ATTACKS, SUBCLASS]], [4, 2, [ASI, SLOW_FALL]],
  [5, 3, [EXTRA_ATTACK, STUNNING_STRIKE]], [6, 3, [EMPOWERED_STRIKES, SUBCLASS_FEATURE]], [7, 3, [EVASION]], [8, 3, [ASI]], [9, 4, [ACROBATIC_MOVEMENT]],
  [10, 4, [HEIGHTENED_FOCUS, SELF_RESTORATION]], [11, 4, [SUBCLASS_FEATURE]], [12, 4, [ASI]], [13, 5, [DEFLECT_ENERGY]], [14, 5, [DISCIPLINED_SURVIVOR]],
  [15, 5, [PERFECT_FOCUS]], [16, 5, [ASI]], [17, 6, [SUBCLASS_FEATURE]], [18, 6, [SUPERIOR_DEFENSE]], [19, 6, [EPIC_BOON]], [20, 6, [BODY_AND_MIND]],
];

export const SRD_MONK = {
  id: srdId('class', 'monk'),
  kind: 'class',
  name: 'Monk',
  source: SRD_5_2_1_SOURCE,
  hitDie: 8,
  fixedHitPointsPerLevel: 5,
  primaryAbility: { mode: 'all-of', abilities: ['dexterity', 'wisdom'] },
  multiclassProficiencies: { weaponProficiencies: [], armorTraining: [], toolProficiencies: [] },
  savingThrowProficiencies: ['strength', 'dexterity'],
  weaponProficiencies: [{ kind: 'category', category: 'simple' }, { kind: 'category-with-property', category: 'martial', anyOfProperties: ['light'] }],
  armorTraining: [],
  toolProficiencies: [{ id: 'artisan-tools-or-musical-instrument-choice', name: 'Artisan’s Tools or Musical Instrument (choice)' }],
  skillChoices: { choose: 2, from: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'] },
  startingEquipment: [
    { id: 'A', items: [{ label: 'Spear', contentId: content('weapon', 'spear') }, { label: 'Dagger', quantity: 5, contentId: content('weapon', 'dagger') }, { label: 'Artisan’s Tools or Musical Instrument (chosen proficiency)', inventoryCategory: 'other' }, { label: 'Explorer’s Pack', inventoryCategory: 'adventuring-gear' }], currency: coin(11) },
    { id: 'B', items: [], currency: coin(50) },
  ],
  progression: rows.map(([level, proficiencyBonus, features]) => ({ level, proficiencyBonus, features })),
  resources: [
    {
      id: MONK_FOCUS_RESOURCE_ID,
      name: 'Focus Points',
      source: SRD_5_2_1_SOURCE,
      maximum: { kind: 'level-table', values: Array.from({ length: 19 }, (_, index) => ({ level: index + 2, uses: index + 2 })) },
      recovery: [{ trigger: 'short-rest', mode: 'all' }, { trigger: 'long-rest', mode: 'all' }],
      presentation: 'numeric',
    },
  ],
} as const satisfies ClassContent;
