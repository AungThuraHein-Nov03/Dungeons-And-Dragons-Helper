import type { SpellMechanic, SpellReferenceEffect } from '../../models/content';
import type { ContentId } from '../../models/contentId';
import { srdId } from './source';

export interface M13FSpellAutomationContractEntry {
  readonly spellId: ContentId;
  readonly mechanics: readonly SpellMechanic[];
  readonly referenceEffects: readonly SpellReferenceEffect[];
}

const die = (count: number, size: 4 | 6 | 8 | 10 | 12) => ({ count, die: size }) as const;
const ref = (id: string, name: string, description: string): SpellReferenceEffect => ({ id, name, description });

const cantripScaling = (dieSize: 4 | 6 | 8 | 10 | 12) => ({
  kind: 'character-level-dice',
  values: [
    { level: 1, dice: [die(1, dieSize)] },
    { level: 5, dice: [die(2, dieSize)] },
    { level: 11, dice: [die(3, dieSize)] },
    { level: 17, dice: [die(4, dieSize)] },
  ],
}) as const;

const slotScaling = (baseSpellLevel: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, count: number, dieSize: 4 | 6 | 8 | 10 | 12) => ({
  kind: 'slot-level-dice',
  baseSpellLevel,
  dicePerLevel: [die(count, dieSize)],
}) as const;

const entry = (
  slug: string,
  mechanics: readonly SpellMechanic[],
  referenceEffects: readonly SpellReferenceEffect[],
): M13FSpellAutomationContractEntry => ({
  spellId: srdId('spell', slug),
  mechanics,
  referenceEffects,
});

/**
 * Milestone 13F-A contract only.
 *
 * These entries freeze the exact bounded mechanics approved for later M13F
 * integration. They are deliberately NOT applied to SRD_SPELLS here.
 * Authoritative spell metadata remains owned by spellsReference.generated.ts.
 */
export const M13F_SPELL_AUTOMATION_CONTRACT = [
  entry('acid-splash', [
    { type: 'saving-throw', ability: 'dexterity', onSuccess: 'none' },
    { type: 'damage', amount: { dice: [die(1, 6)], modifier: 'none' }, damageType: 'acid', scaling: cantripScaling(6) },
  ], [
    ref('area-targeting', 'Area Targeting', 'Selecting creatures in the 5-foot-radius Sphere and applying the rolled damage to each target remain manual.'),
  ]),
  entry('blight', [
    { type: 'saving-throw', ability: 'constitution', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [die(8, 8)], modifier: 'none' }, damageType: 'necrotic', scaling: slotScaling(4, 1, 8) },
  ], [
    ref('plant-creature-save', 'Plant Creature Save', 'A Plant creature automatically failing the saving throw remains reference-only.'),
    ref('noncreature-plant', 'Noncreature Plant', 'Targeting and withering a nonmagical plant that is not a creature remains reference-only.'),
  ]),
  entry('chain-lightning', [
    { type: 'saving-throw', ability: 'dexterity', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [die(10, 8)], modifier: 'none' }, damageType: 'lightning' },
  ], [
    ref('secondary-targets', 'Secondary Targets', 'Selecting the initial and leaping-bolt targets, enforcing their spacing and uniqueness, and applying damage per target remain manual.'),
    ref('upcast-target-count', 'Higher-Level Targets', 'Higher-level slots add another leaping bolt per slot level above 6; target-count scaling remains reference-only and does not change the damage roll.'),
  ]),
  entry('chill-touch', [
    { type: 'spell-attack', attackType: 'melee' },
    { type: 'damage', amount: { dice: [die(1, 10)], modifier: 'none' }, damageType: 'necrotic', scaling: cantripScaling(10) },
  ], [
    ref('healing-prevention', 'Healing Prevention', 'Preventing the hit target from regaining Hit Points until the end of your next turn remains reference-only.'),
  ]),
  entry('circle-of-death', [
    { type: 'saving-throw', ability: 'constitution', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [die(8, 8)], modifier: 'none' }, damageType: 'necrotic', scaling: slotScaling(6, 2, 8) },
  ], [
    ref('area-targeting', 'Area Targeting', 'Selecting creatures in the 60-foot-radius Sphere and applying the rolled damage to each target remain manual.'),
  ]),
  entry('cone-of-cold', [
    { type: 'saving-throw', ability: 'constitution', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [die(8, 8)], modifier: 'none' }, damageType: 'cold', scaling: slotScaling(5, 1, 8) },
  ], [
    ref('area-targeting', 'Area Targeting', 'Selecting creatures in the 60-foot Cone and applying the rolled damage to each target remain manual.'),
    ref('frozen-statue', 'Frozen Statue', 'A creature killed by the spell becoming a frozen statue until it thaws remains reference-only.'),
  ]),
  entry('dissonant-whispers', [
    { type: 'saving-throw', ability: 'wisdom', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [die(3, 6)], modifier: 'none' }, damageType: 'psychic', scaling: slotScaling(1, 1, 6) },
  ], [
    ref('forced-reaction-movement', 'Forced Reaction Movement', 'On a failed save, requiring the target to use its Reaction to move away by the safest route remains reference-only.'),
  ]),
  entry('fire-storm', [
    { type: 'saving-throw', ability: 'dexterity', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [die(7, 10)], modifier: 'none' }, damageType: 'fire' },
  ], [
    ref('cube-layout', 'Storm Layout', 'Arranging up to ten contiguous 10-foot Cubes and selecting affected creatures remain manual.'),
    ref('flammable-objects', 'Flammable Objects', 'Igniting flammable objects in the area that are not worn or carried remains reference-only.'),
  ]),
  entry('fireball', [
    { type: 'saving-throw', ability: 'dexterity', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [die(8, 6)], modifier: 'none' }, damageType: 'fire', scaling: slotScaling(3, 1, 6) },
  ], [
    ref('area-targeting', 'Area Targeting', 'Selecting creatures in the 20-foot-radius Sphere and applying the rolled damage to each target remain manual.'),
    ref('flammable-objects', 'Flammable Objects', 'Igniting flammable objects in the area that are not worn or carried remains reference-only.'),
  ]),
  entry('healing-word', [
    { type: 'healing', amount: { dice: [die(2, 4)], modifier: 'spellcasting-ability' }, scaling: slotScaling(1, 2, 4) },
  ], [
    ref('target-application', 'Target Application', 'Selecting the visible creature and applying the rolled healing to that target remain manual.'),
  ]),
  entry('inflict-wounds', [
    { type: 'saving-throw', ability: 'constitution', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [die(2, 10)], modifier: 'none' }, damageType: 'necrotic', scaling: slotScaling(1, 1, 10) },
  ], [
    ref('target-application', 'Target Application', 'Selecting the touched creature, resolving its saving throw, and applying the rolled damage remain manual.'),
  ]),
  entry('lightning-bolt', [
    { type: 'saving-throw', ability: 'dexterity', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [die(8, 6)], modifier: 'none' }, damageType: 'lightning', scaling: slotScaling(3, 1, 6) },
  ], [
    ref('line-targeting', 'Line Targeting', 'Choosing the Line direction, determining affected creatures, and applying the rolled damage to each target remain manual.'),
  ]),
  entry('mass-cure-wounds', [
    { type: 'healing', amount: { dice: [die(5, 8)], modifier: 'spellcasting-ability' }, scaling: slotScaling(5, 1, 8) },
  ], [
    ref('multi-target-healing', 'Multi-Target Healing', 'Choosing up to six creatures in the Sphere and applying the rolled healing to each chosen target remain manual.'),
  ]),
  entry('mass-healing-word', [
    { type: 'healing', amount: { dice: [die(2, 4)], modifier: 'spellcasting-ability' }, scaling: slotScaling(3, 1, 4) },
  ], [
    ref('multi-target-healing', 'Multi-Target Healing', 'Choosing up to six visible creatures and applying the rolled healing to each chosen target remain manual.'),
  ]),
  entry('poison-spray', [
    { type: 'spell-attack', attackType: 'ranged' },
    { type: 'damage', amount: { dice: [die(1, 12)], modifier: 'none' }, damageType: 'poison', scaling: cantripScaling(12) },
  ], [
    ref('target-application', 'Target Application', 'Determining the target hit and applying the rolled Poison damage remain manual.'),
  ]),
  entry('ray-of-frost', [
    { type: 'spell-attack', attackType: 'ranged' },
    { type: 'damage', amount: { dice: [die(1, 8)], modifier: 'none' }, damageType: 'cold', scaling: cantripScaling(8) },
  ], [
    ref('speed-reduction', 'Speed Reduction', 'Reducing the hit target\'s Speed by 10 feet until the start of your next turn remains reference-only.'),
  ]),
  entry('ray-of-sickness', [
    { type: 'spell-attack', attackType: 'ranged' },
    { type: 'damage', amount: { dice: [die(2, 8)], modifier: 'none' }, damageType: 'poison', scaling: slotScaling(1, 1, 8) },
  ], [
    ref('poisoned-condition', 'Poisoned Condition', 'Applying the Poisoned condition to the hit target until the end of your next turn remains reference-only.'),
  ]),
  entry('shatter', [
    { type: 'saving-throw', ability: 'constitution', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [die(3, 8)], modifier: 'none' }, damageType: 'thunder', scaling: slotScaling(2, 1, 8) },
  ], [
    ref('construct-save-disadvantage', 'Construct Save Disadvantage', 'A Construct having Disadvantage on the saving throw remains reference-only because target creature type and target saves are not modeled.'),
    ref('object-damage', 'Object Damage', 'Applying the spell\'s damage to nonmagical unattended objects in the area remains reference-only.'),
  ]),
  entry('shocking-grasp', [
    { type: 'spell-attack', attackType: 'melee' },
    { type: 'damage', amount: { dice: [die(1, 8)], modifier: 'none' }, damageType: 'lightning', scaling: cantripScaling(8) },
  ], [
    ref('opportunity-attack-denial', 'Opportunity Attack Denial', 'Preventing the hit target from making Opportunity Attacks until the start of its next turn remains reference-only.'),
  ]),
  entry('starry-wisp', [
    { type: 'spell-attack', attackType: 'ranged' },
    { type: 'damage', amount: { dice: [die(1, 8)], modifier: 'none' }, damageType: 'radiant', scaling: cantripScaling(8) },
  ], [
    ref('light-and-invisibility', 'Light and Invisibility Rider', 'The hit target emitting Dim Light and being unable to benefit from Invisible until the end of your next turn remain reference-only.'),
  ]),
  entry('thunderwave', [
    { type: 'saving-throw', ability: 'constitution', onSuccess: 'half' },
    { type: 'damage', amount: { dice: [die(2, 8)], modifier: 'none' }, damageType: 'thunder', scaling: slotScaling(1, 1, 8) },
  ], [
    ref('creature-push', 'Creature Push', 'Pushing creatures 10 feet on a failed save remains reference-only.'),
    ref('object-push', 'Object Push', 'Pushing unsecured objects in the Cube remains reference-only.'),
    ref('audible-boom', 'Audible Boom', 'The thunderous boom being audible within 300 feet remains reference-only.'),
  ]),
  entry('vicious-mockery', [
    { type: 'saving-throw', ability: 'wisdom', onSuccess: 'none' },
    { type: 'damage', amount: { dice: [die(1, 6)], modifier: 'none' }, damageType: 'psychic', scaling: cantripScaling(6) },
  ], [
    ref('next-attack-disadvantage', 'Next Attack Disadvantage', 'Giving the target Disadvantage on its next attack roll before the end of its next turn remains reference-only.'),
  ]),
] as const satisfies readonly M13FSpellAutomationContractEntry[];

export const M13F_PROMOTED_SPELL_IDS = M13F_SPELL_AUTOMATION_CONTRACT.map((entry) => entry.spellId);
