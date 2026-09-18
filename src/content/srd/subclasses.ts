import type { ResourceConsumerGrant, SubclassContent, SubclassFeatureContent, SubclassReferenceEffect } from '../../models/content';
import { BARD_BARDIC_INSPIRATION_RESOURCE_ID } from './bard';
import { DRUID_SPELLCASTING_PROVIDER_ID, DRUID_WILD_SHAPE_RESOURCE_ID } from './druid';
import { MONK_FOCUS_RESOURCE_ID } from './monk';
import { PALADIN_CHANNEL_DIVINITY_RESOURCE_ID, PALADIN_SPELLCASTING_PROVIDER_ID } from './paladin';
import { SORCERER_SPELLCASTING_PROVIDER_ID } from './sorcerer';
import { WARLOCK_SPELLCASTING_PROVIDER_ID } from './warlock';
import { SRD_5_2_1_SOURCE, srdId } from './source';

const ref = (id: string, name: string, description: string): SubclassReferenceEffect => ({ id, name, description });
const feature = (
  classSlug: string,
  subclassSlug: string,
  slug: string,
  name: string,
  description: string,
  options: {
    effects?: SubclassFeatureContent['effects'];
    spellGrants?: SubclassFeatureContent['spellGrants'];
    resources?: SubclassFeatureContent['resources'];
    resourceConsumers?: readonly ResourceConsumerGrant[];
    resourceTransactions?: SubclassFeatureContent['resourceTransactions'];
    referenceEffects?: readonly SubclassReferenceEffect[];
  } = {},
): SubclassFeatureContent => ({
  id: srdId('subclass-feature', `${classSlug}:${subclassSlug}:${slug}`),
  name,
  description,
  effects: options.effects ?? [],
  ...(options.spellGrants ? { spellGrants: options.spellGrants } : {}),
  ...(options.resources ? { resources: options.resources } : {}),
  ...(options.resourceConsumers ? { resourceConsumers: options.resourceConsumers } : {}),
  ...(options.resourceTransactions ? { resourceTransactions: options.resourceTransactions } : {}),
  referenceEffects: options.referenceEffects ?? [],
});

export const DRUID_NATURAL_RECOVERY_RESOURCE_ID = srdId('subclass-resource', 'druid:circle-of-the-land:natural-recovery');
export const DRUID_NATURAL_RECOVERY_TRANSACTION_ID = srdId('resource-transaction', 'druid:circle-of-the-land:natural-recovery');

const fighterId = srdId('class', 'fighter');
const championId = srdId('subclass', 'fighter:champion');
export const SRD_CHAMPION = {
  id: championId,
  kind: 'subclass',
  name: 'Champion',
  source: SRD_5_2_1_SOURCE,
  parentClassId: fighterId,
  acquisitionLevel: 3,
  description: 'A Fighter subclass focused on exceptional physical prowess, broader critical-hit ranges, and durable heroic performance.',
  progression: [
    { level: 3, features: [
      feature('fighter', 'champion', 'improved-critical', 'Improved Critical', 'Your attack rolls with weapons and Unarmed Strikes can score a Critical Hit on a wider range.', { effects: [{ type: 'critical-threshold', attackKind: 'weapon', minimumNatural: 19 }], referenceEffects: [ref('unarmed-critical-range-19-20', 'Improved Critical — Unarmed Strikes', 'Weapon attack critical range is automated. Unarmed Strike critical range remains reference-only because the current attack model has no derived Unarmed Strike attack entry.')] }),
      feature('fighter', 'champion', 'remarkable-athlete', 'Remarkable Athlete', 'Your athletic training improves specific checks and grants movement after a Critical Hit.', { effects: [{ type: 'skill-check-advantage', skillIds: ['athletics'] }, { type: 'initiative-roll-mode', mode: 'advantage' }], referenceEffects: [ref('critical-movement', 'Critical-Hit Movement', 'Post-critical movement and Opportunity Attack automation are not implemented.')] }),
    ] },
    { level: 7, features: [feature('fighter', 'champion', 'additional-fighting-style', 'Additional Fighting Style', 'You gain another Fighting Style feat of your choice.', { referenceEffects: [ref('fighting-style-choice', 'Additional Fighting Style', 'Subclass-granted feat-choice ownership is not implemented.')] })] },
    { level: 10, features: [feature('fighter', 'champion', 'heroic-warrior', 'Heroic Warrior', 'Your battle-tested resolve can restore Heroic Inspiration during combat.', { referenceEffects: [ref('heroic-inspiration', 'Heroic Warrior', 'Heroic Inspiration and turn-state automation are not implemented.')] })] },
    { level: 15, features: [feature('fighter', 'champion', 'superior-critical', 'Superior Critical', 'Your critical-hit range improves again.', { effects: [{ type: 'critical-threshold', attackKind: 'weapon', minimumNatural: 18 }], referenceEffects: [ref('unarmed-critical-range-18-20', 'Superior Critical — Unarmed Strikes', 'Weapon attack critical range is automated. Unarmed Strike critical range remains reference-only because the current attack model has no derived Unarmed Strike attack entry.')] })] },
    { level: 18, features: [feature('fighter', 'champion', 'survivor', 'Survivor', 'You become exceptionally difficult to kill and can recover while badly wounded.', { referenceEffects: [ref('defy-death', 'Defy Death', 'Death Saving Throw automation is not implemented.'), ref('heroic-rally', 'Heroic Rally', 'Bloodied and turn-start healing automation are not implemented.')] })] },
  ],
} as const satisfies SubclassContent;

export const SRD_BERSERKER = {
  id: srdId('subclass', 'barbarian:path-of-the-berserker'),
  kind: 'subclass',
  name: 'Path of the Berserker',
  source: SRD_5_2_1_SOURCE,
  parentClassId: srdId('class', 'barbarian'),
  acquisitionLevel: 3,
  description: 'A Barbarian path that channels Rage into violent fury.',
  progression: [
    { level: 3, features: [feature('barbarian', 'path-of-the-berserker', 'frenzy', 'Frenzy', 'Reckless Attack while raging can add extra damage to the first qualifying hit.', { referenceEffects: [ref('frenzy-damage', 'Frenzy', 'M13D tracks whether Rage is active, but Reckless Attack state, first-hit detection, and Frenzy bonus damage remain reference-only.')] })] },
    { level: 6, features: [feature('barbarian', 'path-of-the-berserker', 'mindless-rage', 'Mindless Rage', 'While raging, you are immune to being Charmed or Frightened and can end those conditions when Rage starts.', { referenceEffects: [ref('rage-condition-immunity', 'Mindless Rage', 'M13B/M13D track Character Conditions and active Rage, but Charmed/Frightened immunity and ending those conditions when Rage starts remain reference-only.')] })] },
    { level: 10, features: [feature('barbarian', 'path-of-the-berserker', 'retaliation', 'Retaliation', 'Taking nearby creature damage can trigger a Reaction melee attack.', { referenceEffects: [ref('damage-reaction', 'Retaliation', 'Incoming damage, distance, Reaction, and attack-event orchestration are reference-only.')] })] },
    { level: 14, features: [feature('barbarian', 'path-of-the-berserker', 'intimidating-presence', 'Intimidating Presence', 'You can frighten nearby creatures with a Strength-based save DC.', { referenceEffects: [ref('frighten-area', 'Intimidating Presence', 'Target selection, saving throws, frightened duration, and restoration via Rage expenditure are reference-only.')] })] },
  ],
} as const satisfies SubclassContent;

const channelDivinityId = srdId('class-resource', 'cleric:channel-divinity');
export const SRD_LIFE_DOMAIN = {
  id: srdId('subclass', 'cleric:life-domain'),
  kind: 'subclass',
  name: 'Life Domain',
  source: SRD_5_2_1_SOURCE,
  parentClassId: srdId('class', 'cleric'),
  acquisitionLevel: 3,
  description: 'A Cleric domain focused on healing, endurance, and preserving life.',
  progression: [
    { level: 3, features: [
      feature('cleric', 'life-domain', 'disciple-of-life', 'Disciple of Life', 'Healing spells cast with spell slots restore additional Hit Points.', { referenceEffects: [ref('healing-spell-bonus', 'Disciple of Life', 'Spell-effect healing modification is reference-only in Milestone 11.')] }),
      feature('cleric', 'life-domain', 'life-domain-spells', 'Life Domain Spells', 'Certain Life Domain spells are always prepared.', { referenceEffects: [ref('domain-spells', 'Life Domain Spells', 'Always-prepared domain-spell ownership is reference-only because M11 keeps the six-spell conformance catalog and does not persist prepared spells.')] }),
      feature('cleric', 'life-domain', 'preserve-life', 'Preserve Life', 'You can expend Channel Divinity to distribute healing among nearby Bloodied creatures.', { resourceConsumers: [{ resourceId: channelDivinityId, consumer: { id: srdId('subclass-resource-consumer', 'cleric:life-domain:preserve-life'), name: 'Preserve Life', effect: { type: 'tracking-only' } } }], referenceEffects: [ref('distributed-healing', 'Preserve Life', 'Target selection, Bloodied checks, and healing distribution remain manual.')] }),
    ] },
    { level: 6, features: [feature('cleric', 'life-domain', 'blessed-healer', 'Blessed Healer', 'Healing other creatures with leveled spells can also restore your Hit Points.', { referenceEffects: [ref('self-healing-rider', 'Blessed Healer', 'Spell target/event tracking and automatic self-healing are reference-only.')] })] },
    { level: 17, features: [feature('cleric', 'life-domain', 'supreme-healing', 'Supreme Healing', 'Healing dice from spells or Channel Divinity use their maximum possible value.', { referenceEffects: [ref('maximum-healing-dice', 'Supreme Healing', 'Conditional replacement of healing dice by maximum values is reference-only.')] })] },
  ],
} as const satisfies SubclassContent;

export const SRD_THIEF = {
  id: srdId('subclass', 'rogue:thief'),
  kind: 'subclass',
  name: 'Thief',
  source: SRD_5_2_1_SOURCE,
  parentClassId: srdId('class', 'rogue'),
  acquisitionLevel: 3,
  description: 'A Rogue subclass built around speed, infiltration, agility, and opportunistic use of magic items.',
  progression: [
    { level: 3, features: [
      feature('rogue', 'thief', 'fast-hands', 'Fast Hands', 'You gain additional Bonus Action utility with Sleight of Hand, tools, objects, and magic items.', { referenceEffects: [ref('bonus-action-utility', 'Fast Hands', 'Action economy, tool checks, object use, and magic-item activation remain reference-only.')] }),
      feature('rogue', 'thief', 'second-story-work', 'Second-Story Work', 'Your climbing and jumping become more effective.', { referenceEffects: [ref('movement-jump', 'Second-Story Work', 'Climb Speed and Dexterity-based jump calculations are reference-only.')] }),
    ] },
    { level: 9, features: [feature('rogue', 'thief', 'supreme-sneak', 'Supreme Sneak', 'You gain an additional Cunning Strike option for stealthy attacks.', { referenceEffects: [ref('stealth-attack', 'Supreme Sneak', 'Invisible state and Cunning Strike event handling remain reference-only.')] })] },
    { level: 13, features: [feature('rogue', 'thief', 'use-magic-device', 'Use Magic Device', 'You gain broader and more efficient use of magic items and spell scrolls.', { referenceEffects: [ref('magic-item-attunement', 'Use Magic Device', 'Attunement limits, charge conservation, scroll casting, and Arcana checks remain reference-only.')] })] },
    { level: 17, features: [feature('rogue', 'thief', 'thiefs-reflexes', 'Thief’s Reflexes', 'You can take two turns during the first round of combat.', { referenceEffects: [ref('extra-first-round-turn', 'Thief’s Reflexes', 'Initiative and combat-turn orchestration are not implemented.')] })] },
  ],
} as const satisfies SubclassContent;

export const SRD_COLLEGE_OF_LORE = {
  id: srdId('subclass', 'bard:college-of-lore'),
  kind: 'subclass',
  name: 'College of Lore',
  source: SRD_5_2_1_SOURCE,
  parentClassId: srdId('class', 'bard'),
  acquisitionLevel: 3,
  description: 'A Bard college devoted to broad knowledge, cutting wit, and adaptable magical learning.',
  progression: [
    { level: 3, features: [
      feature('bard', 'college-of-lore', 'bonus-proficiencies', 'Bonus Proficiencies', 'You gain proficiency in three skills of your choice.', { referenceEffects: [ref('skill-proficiency-choice', 'Bonus Proficiencies', 'The three additional skill proficiency choices remain player-managed/reference-only in Milestone 12B.')] }),
      feature('bard', 'college-of-lore', 'cutting-words', 'Cutting Words', 'You can expend Bardic Inspiration as a Reaction to undermine another creature’s successful roll.', { resourceConsumers: [{ resourceId: BARD_BARDIC_INSPIRATION_RESOURCE_ID, consumer: { id: srdId('subclass-resource-consumer', 'bard:college-of-lore:cutting-words'), name: 'Cutting Words', effect: { type: 'tracking-only' } } }], referenceEffects: [ref('reaction-roll-reduction', 'Cutting Words', 'Trigger detection, reaction timing, Bardic Inspiration die rolling, target immunity, and success reversal remain manual/reference-only.')] }),
    ] },
    { level: 6, features: [feature('bard', 'college-of-lore', 'magical-discoveries', 'Magical Discoveries', 'You learn two additional spells from the Cleric, Druid, or Wizard spell lists that count as Bard spells for you.', { referenceEffects: [ref('spell-choice', 'Magical Discoveries', 'The two chosen spells are player-managed because M12B does not persist prepared spell selections or add cross-list choice storage.')] })] },
    { level: 14, features: [feature('bard', 'college-of-lore', 'peerless-skill', 'Peerless Skill', 'When an ability check or attack roll fails, you can expend Bardic Inspiration and add the die, spending it only if the roll then succeeds.', { resourceConsumers: [{ resourceId: BARD_BARDIC_INSPIRATION_RESOURCE_ID, consumer: { id: srdId('subclass-resource-consumer', 'bard:college-of-lore:peerless-skill'), name: 'Peerless Skill', effect: { type: 'tracking-only' } } }], referenceEffects: [ref('failed-roll-resolution', 'Peerless Skill', 'Failure detection, die rolling, and whether the bonus changes the result remain manual, so the user confirms expenditure only when appropriate.')] })] },
  ],
} as const satisfies SubclassContent;

export const SRD_OATH_OF_DEVOTION = {
  id: srdId('subclass', 'paladin:oath-of-devotion'),
  kind: 'subclass',
  name: 'Oath of Devotion',
  source: SRD_5_2_1_SOURCE,
  parentClassId: srdId('class', 'paladin'),
  acquisitionLevel: 3,
  description: 'A Paladin oath centered on justice, order, protection, and sacred devotion.',
  progression: [
    { level: 3, features: [
      feature('paladin', 'oath-of-devotion', 'oath-spells', 'Oath of Devotion Spells', 'Your oath grants fixed spells that are always prepared at the listed Paladin levels.', { spellGrants: [
        { providerId: PALADIN_SPELLCASTING_PROVIDER_ID, spellIds: [srdId('spell', 'protection-from-evil-and-good'), srdId('spell', 'shield-of-faith')], status: 'always-prepared', minimumLevel: 3 },
        { providerId: PALADIN_SPELLCASTING_PROVIDER_ID, spellIds: [srdId('spell', 'aid'), srdId('spell', 'zone-of-truth')], status: 'always-prepared', minimumLevel: 5 },
        { providerId: PALADIN_SPELLCASTING_PROVIDER_ID, spellIds: [srdId('spell', 'beacon-of-hope'), srdId('spell', 'dispel-magic')], status: 'always-prepared', minimumLevel: 9 },
        { providerId: PALADIN_SPELLCASTING_PROVIDER_ID, spellIds: [srdId('spell', 'freedom-of-movement'), srdId('spell', 'guardian-of-faith')], status: 'always-prepared', minimumLevel: 13 },
        { providerId: PALADIN_SPELLCASTING_PROVIDER_ID, spellIds: [srdId('spell', 'commune'), srdId('spell', 'flame-strike')], status: 'always-prepared', minimumLevel: 17 },
      ] }),
      feature('paladin', 'oath-of-devotion', 'sacred-weapon', 'Sacred Weapon', 'You can expend Channel Divinity to empower a held melee weapon for 10 minutes.', { resourceConsumers: [{ resourceId: PALADIN_CHANNEL_DIVINITY_RESOURCE_ID, consumer: { id: srdId('subclass-resource-consumer', 'paladin:oath-of-devotion:sacred-weapon'), name: 'Sacred Weapon', effect: { type: 'tracking-only' } } }], referenceEffects: [ref('weapon-empowerment', 'Sacred Weapon', 'The Charisma-based attack bonus, Radiant damage choice, light, duration, and end conditions remain reference-only; M12B adds no active-effect or weapon-state UI.')] }),
    ] },
    { level: 7, features: [feature('paladin', 'oath-of-devotion', 'aura-of-devotion', 'Aura of Devotion', 'Your Aura of Protection also wards against the Charmed condition.', { referenceEffects: [ref('condition-immunity-aura', 'Aura of Devotion', 'Aura geometry, nearby allies, and Charmed condition state remain reference-only.')] })] },
    { level: 15, features: [feature('paladin', 'oath-of-devotion', 'smite-of-protection', 'Smite of Protection', 'Casting Divine Smite can grant nearby allies Half Cover for a short time.', { referenceEffects: [ref('smite-cover', 'Smite of Protection', 'Spell-cast event detection, aura geometry, cover, and duration remain reference-only.')] })] },
    { level: 20, features: [feature('paladin', 'oath-of-devotion', 'holy-nimbus', 'Holy Nimbus', 'You can emanate holy power that damages nearby enemies and grants defensive benefits.', { referenceEffects: [ref('holy-nimbus-state', 'Holy Nimbus', 'Activation, aura targets, automatic damage, save Advantage, duration, and once-per-Long-Rest state remain reference-only in M12B.')] })] },
  ],
} as const satisfies SubclassContent;

export const SRD_HUNTER = {
  id: srdId('subclass', 'ranger:hunter'),
  kind: 'subclass',
  name: 'Hunter',
  source: SRD_5_2_1_SOURCE,
  parentClassId: srdId('class', 'ranger'),
  acquisitionLevel: 3,
  description: 'A Ranger archetype that studies prey and adapts tactics against dangerous foes.',
  progression: [
    { level: 3, features: [
      feature('ranger', 'hunter', 'hunters-lore', 'Hunter’s Lore', 'Hunter’s Mark also reveals useful information about the marked creature.', { referenceEffects: [ref('marked-target-information', 'Hunter’s Lore', 'Marked-target state and automatic discovery of immunities, resistances, and vulnerabilities remain reference-only.')] }),
      feature('ranger', 'hunter', 'hunters-prey', 'Hunter’s Prey', 'You choose a hunting tactic such as Colossus Slayer or Horde Breaker.', { referenceEffects: [ref('hunter-choice', 'Hunter’s Prey Choice', 'Subclass option ownership and its attack-event effects remain player-managed/reference-only; no new persistent choice field is added.')] }),
    ] },
    { level: 7, features: [feature('ranger', 'hunter', 'defensive-tactics', 'Defensive Tactics', 'You choose a defensive tactic suited to surviving dangerous foes.', { referenceEffects: [ref('hunter-choice', 'Defensive Tactics Choice', 'Subclass option ownership and conditional defense mechanics remain player-managed/reference-only.')] })] },
    { level: 11, features: [feature('ranger', 'hunter', 'superior-hunters-prey', 'Superior Hunter’s Prey', 'Your chosen hunting technique improves.', { referenceEffects: [ref('hunter-improvement', 'Superior Hunter’s Prey', 'Attack-event, target, and once-per-turn adjudication remain reference-only.')] })] },
    { level: 15, features: [feature('ranger', 'hunter', 'superior-hunters-defense', 'Superior Hunter’s Defense', 'Your chosen defensive technique improves.', { referenceEffects: [ref('hunter-defense-improvement', 'Superior Hunter’s Defense', 'Reaction, save, damage, and targeting adjudication remain reference-only.')] })] },
  ],
} as const satisfies SubclassContent;

export const SRD_CIRCLE_OF_THE_LAND = {
  id: srdId('subclass', 'druid:circle-of-the-land'),
  kind: 'subclass',
  name: 'Circle of the Land',
  source: SRD_5_2_1_SOURCE,
  parentClassId: srdId('class', 'druid'),
  acquisitionLevel: 3,
  description: 'A Druid circle that adapts its magic and defenses to a chosen environment.',
  progression: [
    { level: 3, features: [
      feature('druid', 'circle-of-the-land', 'circle-spells', 'Circle of the Land Spells', 'After each Long Rest, choose arid, polar, temperate, or tropical land and prepare that land’s listed spells for your Druid level.', { referenceEffects: [ref('land-spell-tables', 'Land Spell Tables', 'Arid: Blur, Burning Hands, Fire Bolt; then Fireball, Blight, Wall of Stone. Polar: Fog Cloud, Hold Person, Ray of Frost; then Sleet Storm, Ice Storm, Cone of Cold. Temperate: Misty Step, Shocking Grasp, Sleep; then Lightning Bolt, Freedom of Movement, Tree Stride. Tropical: Acid Splash, Ray of Sickness, Web; then Stinking Cloud, Polymorph, Insect Plague. The land choice changes on a Long Rest and is not persisted in M12C, so these conditional prepared spells remain reference-only rather than being granted as all four lists at once.')] }),
      feature('druid', 'circle-of-the-land', 'lands-aid', 'Land’s Aid', 'You can expend a Wild Shape use to create a brief area that harms selected creatures and heals one selected creature.', { resourceConsumers: [{ resourceId: DRUID_WILD_SHAPE_RESOURCE_ID, consumer: { id: srdId('subclass-resource-consumer', 'druid:circle-of-the-land:lands-aid'), name: 'Land’s Aid', effect: { type: 'tracking-only' } } }], referenceEffects: [ref('area-damage-healing', 'Land’s Aid', 'Point selection, area targets, Constitution saves, damage/healing rolls, and level scaling remain reference-only; only the shared Wild Shape expenditure is tracked.')] }),
    ] },
    { level: 6, features: [feature('druid', 'circle-of-the-land', 'natural-recovery', 'Natural Recovery', 'Once per Long Rest, cast one prepared Circle spell without a slot. Separately, when you finish a Short Rest, recover expended Druid spell slots with combined levels no greater than half your Druid level rounded up; level 6+ slots are ineligible, and this slot recovery is unavailable again until a Long Rest.', {
      resources: [{ id: DRUID_NATURAL_RECOVERY_RESOURCE_ID, name: 'Natural Recovery (Spell Slots)', source: SRD_5_2_1_SOURCE, maximum: { kind: 'level-table', values: [{ level: 1, uses: 1 }] }, recovery: [{ trigger: 'long-rest', mode: 'all' }] }],
      resourceTransactions: [{ id: DRUID_NATURAL_RECOVERY_TRANSACTION_ID, name: 'Natural Recovery', kind: 'restore-spell-slots-with-budget', providerId: DRUID_SPELLCASTING_PROVIDER_ID, usageResourceId: DRUID_NATURAL_RECOVERY_RESOURCE_ID, budget: { kind: 'half-level-round-up' }, maximumSpellLevel: 5, timing: 'short-rest' }],
      referenceEffects: [ref('free-circle-cast', 'Free Circle Spell Cast', 'The current land choice and prepared Circle spell are not persisted, so Natural Recovery’s separate free Circle-spell cast remains reference-only.')],
    })] },
    { level: 10, features: [feature('druid', 'circle-of-the-land', 'natures-ward', 'Nature’s Ward', 'You become immune to Poisoned and gain a resistance determined by your current land choice.', { referenceEffects: [ref('land-resistance', 'Nature’s Ward', 'Arid grants Fire resistance, Polar Cold, Temperate Lightning, and Tropical Poison. The current land choice, condition immunity, and resistance state remain reference-only.')] })] },
    { level: 14, features: [feature('druid', 'circle-of-the-land', 'natures-sanctuary', 'Nature’s Sanctuary', 'You can expend a Wild Shape use to create a movable protective natural area.', { resourceConsumers: [{ resourceId: DRUID_WILD_SHAPE_RESOURCE_ID, consumer: { id: srdId('subclass-resource-consumer', 'druid:circle-of-the-land:natures-sanctuary'), name: 'Nature’s Sanctuary', effect: { type: 'tracking-only' } } }], referenceEffects: [ref('persistent-area', 'Nature’s Sanctuary', 'Area position, movement, Half Cover, allied resistance, duration, and incapacitation termination remain reference-only; only the shared Wild Shape expenditure is tracked.')] })] },
  ],
} as const satisfies SubclassContent;

export const SRD_WARRIOR_OF_THE_OPEN_HAND = {
  id: srdId('subclass', 'monk:warrior-of-the-open-hand'),
  kind: 'subclass',
  name: 'Warrior of the Open Hand',
  source: SRD_5_2_1_SOURCE,
  parentClassId: srdId('class', 'monk'),
  acquisitionLevel: 3,
  description: 'A Monk tradition devoted to advanced unarmed techniques, recovery, movement, and precise finishing strikes.',
  progression: [
    { level: 3, features: [feature('monk', 'warrior-of-the-open-hand', 'open-hand-technique', 'Open Hand Technique', 'A Flurry of Blows hit can addle, push, or topple its target.', { referenceEffects: [ref('flurry-target-effect', 'Open Hand Technique', 'Hit confirmation, target choice, Opportunity Attack suppression, Strength/Dexterity saves, forced movement, and Prone state remain reference-only.')] })] },
    { level: 6, features: [feature('monk', 'warrior-of-the-open-hand', 'wholeness-of-body', 'Wholeness of Body', 'As a Bonus Action, heal yourself using your Martial Arts die plus Wisdom modifier, a number of times equal to your Wisdom modifier (minimum once) per Long Rest.', { referenceEffects: [ref('subclass-healing-pool', 'Wholeness of Body', 'The authoritative use count is subclass-specific and Wisdom-derived. M12C does not introduce a new subclass-resource-definition subsystem solely for this feature, so its uses, Martial Arts die scaling, and healing application remain explicit reference-only behavior.')] })] },
    { level: 11, features: [feature('monk', 'warrior-of-the-open-hand', 'fleet-step', 'Fleet Step', 'After another Bonus Action, you can immediately use Step of the Wind.', { referenceEffects: [ref('bonus-action-followup', 'Fleet Step', 'Bonus Action sequencing and automatic Step of the Wind execution remain reference-only.')] })] },
    { level: 17, features: [feature('monk', 'warrior-of-the-open-hand', 'quivering-palm', 'Quivering Palm', 'After a qualifying Unarmed Strike hit, you can spend 4 Focus Points to establish vibrations that can later be ended for a Constitution save and Force damage.', { resourceConsumers: [{ resourceId: MONK_FOCUS_RESOURCE_ID, consumer: { id: srdId('subclass-resource-consumer', 'monk:warrior-of-the-open-hand:quivering-palm'), name: 'Quivering Palm', effect: { type: 'fixed-expend', amount: 4 } } }], referenceEffects: [ref('vibration-target-state', 'Quivering Palm', 'Hit detection, target/vibration persistence, duration, plane checks, later detonation, Constitution save, and damage remain reference-only; only the bounded four-point Focus expenditure is automated.')] })] },
  ],
} as const satisfies SubclassContent;

export const SRD_DRACONIC_SORCERY = {
  id: srdId('subclass', 'sorcerer:draconic-sorcery'),
  kind: 'subclass',
  name: 'Draconic Sorcery',
  source: SRD_5_2_1_SOURCE,
  parentClassId: srdId('class', 'sorcerer'),
  acquisitionLevel: 3,
  description: 'A Sorcerer origin that manifests draconic resilience, elemental affinity, wings, and a dragon companion.',
  progression: [
    { level: 3, features: [
      feature('sorcerer', 'draconic-sorcery', 'draconic-resilience', 'Draconic Resilience', 'Draconic magic toughens your body and protects you while you are not wearing armor.', { effects: [
        { type: 'hit-point-bonus-per-class-level', amount: 1 },
        { type: 'unarmored-armor-class', base: 10, abilities: ['dexterity', 'charisma'], allowShield: true },
      ] }),
      feature('sorcerer', 'draconic-sorcery', 'draconic-spells', 'Draconic Spells', 'Your draconic origin grants fixed spells that are always prepared at the listed Sorcerer levels.', { spellGrants: [
        { providerId: SORCERER_SPELLCASTING_PROVIDER_ID, spellIds: [srdId('spell', 'alter-self'), srdId('spell', 'chromatic-orb'), srdId('spell', 'command'), srdId('spell', 'dragon-s-breath')], status: 'always-prepared', minimumLevel: 3 },
        { providerId: SORCERER_SPELLCASTING_PROVIDER_ID, spellIds: [srdId('spell', 'fear'), srdId('spell', 'fly')], status: 'always-prepared', minimumLevel: 5 },
        { providerId: SORCERER_SPELLCASTING_PROVIDER_ID, spellIds: [srdId('spell', 'arcane-eye'), srdId('spell', 'charm-monster')], status: 'always-prepared', minimumLevel: 7 },
        { providerId: SORCERER_SPELLCASTING_PROVIDER_ID, spellIds: [srdId('spell', 'legend-lore'), srdId('spell', 'summon-dragon')], status: 'always-prepared', minimumLevel: 9 },
      ] }),
    ] },
    { level: 6, features: [feature('sorcerer', 'draconic-sorcery', 'elemental-affinity', 'Elemental Affinity', 'Choose Acid, Cold, Fire, Lightning, or Poison; the choice grants resistance and can empower matching Sorcerer spell damage.', { referenceEffects: [ref('damage-type-choice', 'Elemental Affinity Choice', 'Damage-type choice ownership, resistance state, spell-damage event inspection, and once-per-spell Charisma bonus application remain reference-only in M12D.')] })] },
    { level: 14, features: [feature('sorcerer', 'draconic-sorcery', 'dragon-wings', 'Dragon Wings', 'You can manifest spectral dragon wings for one hour, normally once per Long Rest.', { referenceEffects: [ref('flight-active-state', 'Dragon Wings', 'Timed flight state, once-per-Long-Rest use state, and the optional three-Sorcery-Point restoration transaction remain reference-only; no active-mode or cross-resource engine is introduced.')] })] },
    { level: 18, features: [feature('sorcerer', 'draconic-sorcery', 'dragon-companion', 'Dragon Companion', 'Summon Dragon gains special material, free-cast, and Concentration benefits.', { referenceEffects: [ref('summon-dragon-modification', 'Dragon Companion', 'Free-cast state, material-component bypass, summon state, and conditional Concentration removal are reference-only spell/runtime mutations in M12D.')] })] },
  ],
} as const satisfies SubclassContent;

export const SRD_FIEND_PATRON = {
  id: srdId('subclass', 'warlock:fiend-patron'),
  kind: 'subclass',
  name: 'Fiend Patron',
  source: SRD_5_2_1_SOURCE,
  parentClassId: srdId('class', 'warlock'),
  acquisitionLevel: 3,
  description: 'A Warlock patron whose infernal power grants destructive magic, luck, resilience, and punishment.',
  progression: [
    { level: 3, features: [
      feature('warlock', 'fiend-patron', 'fiend-spells', 'Fiend Spells', 'Your patron grants fixed spells that are always prepared at the listed Warlock levels.', { spellGrants: [
        { providerId: WARLOCK_SPELLCASTING_PROVIDER_ID, spellIds: [srdId('spell', 'burning-hands'), srdId('spell', 'command'), srdId('spell', 'scorching-ray'), srdId('spell', 'suggestion')], status: 'always-prepared', minimumLevel: 3 },
        { providerId: WARLOCK_SPELLCASTING_PROVIDER_ID, spellIds: [srdId('spell', 'fireball'), srdId('spell', 'stinking-cloud')], status: 'always-prepared', minimumLevel: 5 },
        { providerId: WARLOCK_SPELLCASTING_PROVIDER_ID, spellIds: [srdId('spell', 'fire-shield'), srdId('spell', 'wall-of-fire')], status: 'always-prepared', minimumLevel: 7 },
        { providerId: WARLOCK_SPELLCASTING_PROVIDER_ID, spellIds: [srdId('spell', 'geas'), srdId('spell', 'insect-plague')], status: 'always-prepared', minimumLevel: 9 },
      ] }),
      feature('warlock', 'fiend-patron', 'dark-ones-blessing', 'Dark One’s Blessing', 'When an enemy is reduced to 0 Hit Points near you, you can gain Temporary Hit Points.', { referenceEffects: [ref('creature-death-trigger', 'Dark One’s Blessing', 'Creature death, enemy/nearby checks, trigger timing, and automatic Temporary Hit Point application remain reference-only because M12D has no combatant/death event state.')] }),
    ] },
    { level: 6, features: [feature('warlock', 'fiend-patron', 'dark-ones-own-luck', 'Dark One’s Own Luck', 'You can add a d10 to an ability check or saving throw a limited number of times based on Charisma.', { referenceEffects: [ref('ability-derived-subclass-uses', 'Dark One’s Own Luck', 'The authoritative use count is Charisma-modifier based (minimum one), but M12D does not introduce subclass-owned resource definitions solely for this event-driven feature; uses and trigger resolution remain reference-only.')] })] },
    { level: 10, features: [feature('warlock', 'fiend-patron', 'fiendish-resilience', 'Fiendish Resilience', 'After a Short or Long Rest, choose a damage type and gain resistance to it until you choose again.', { referenceEffects: [ref('damage-resistance-choice', 'Fiendish Resilience', 'Rest-time damage-type choice ownership and active resistance state remain reference-only.')] })] },
    { level: 14, features: [feature('warlock', 'fiend-patron', 'hurl-through-hell', 'Hurl Through Hell', 'A qualifying hit can send a target through a nightmare realm before it returns and takes damage.', { referenceEffects: [ref('target-banishment-event', 'Hurl Through Hell', 'Attack-event detection, target removal/return, saving throw, damage, once-per-Long-Rest state, and Pact-slot restoration remain reference-only; no target/event or cross-resource engine is added.')] })] },
  ],
} as const satisfies SubclassContent;

export const SRD_EVOKER = {
  id: srdId('subclass', 'wizard:evoker'),
  kind: 'subclass',
  name: 'Evoker',
  source: SRD_5_2_1_SOURCE,
  parentClassId: srdId('class', 'wizard'),
  acquisitionLevel: 3,
  description: 'A Wizard tradition that specializes in destructive Evocation magic and protecting allies from its effects.',
  progression: [
    { level: 3, features: [
      feature('wizard', 'evoker', 'evocation-savant', 'Evocation Savant', 'Add two eligible low-level Wizard Evocation spells to your spellbook for free; later access to new Wizard spell-slot levels can add another eligible Evocation spell.', { referenceEffects: [ref('spellbook-ownership-grant', 'Evocation Savant', 'M12E persists the resulting spellbook ownership through the generic provider selection model, but the subclass-triggered choice flow and future level-up timing remain player-managed rather than adding Evoker-specific state or M15 Level Up automation.')] }),
      feature('wizard', 'evoker', 'potent-cantrip', 'Potent Cantrip', 'Your damaging cantrips can still deal half damage when an attack misses or a target succeeds on its saving throw.', { referenceEffects: [ref('cantrip-outcome-damage', 'Potent Cantrip', 'Attack results, target saving throws, half-damage calculation, and suppression of non-damage effects remain reference-only; M12E adds no spell-event or target engine.')] }),
    ] },
    { level: 6, features: [feature('wizard', 'evoker', 'sculpt-spells', 'Sculpt Spells', 'You can protect selected creatures from the effects of your Evocation spells.', { referenceEffects: [ref('evocation-protected-targets', 'Sculpt Spells', 'Affected-creature discovery, protected-target selection, automatic saving-throw success, and damage suppression remain reference-only.')] })] },
    { level: 10, features: [feature('wizard', 'evoker', 'empowered-evocation', 'Empowered Evocation', 'You can add your Intelligence modifier to one damage roll of a qualifying Wizard Evocation spell.', { referenceEffects: [ref('evocation-damage-bonus', 'Empowered Evocation', 'Spell school/event inspection and one-roll damage mutation remain reference-only.')] })] },
    { level: 14, features: [feature('wizard', 'evoker', 'overchannel', 'Overchannel', 'You can maximize the damage of qualifying lower-level Wizard spells, with repeated uses before a Long Rest causing escalating self-damage.', { referenceEffects: [ref('overchannel-state', 'Overchannel', 'Spell-slot cast detection, maximum-damage replacement, repeated-use state, escalating self-damage, and Long Rest reset remain reference-only; no universal cast/damage event engine is introduced.')] })] },
  ],
} as const satisfies SubclassContent;

export const SRD_SUBCLASSES = [SRD_CHAMPION, SRD_BERSERKER, SRD_LIFE_DOMAIN, SRD_THIEF, SRD_COLLEGE_OF_LORE, SRD_OATH_OF_DEVOTION, SRD_HUNTER, SRD_CIRCLE_OF_THE_LAND, SRD_WARRIOR_OF_THE_OPEN_HAND, SRD_DRACONIC_SORCERY, SRD_FIEND_PATRON, SRD_EVOKER] as const satisfies readonly SubclassContent[];
