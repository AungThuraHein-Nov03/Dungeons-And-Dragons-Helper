import type { WeaponMasteryContent } from '../../models/content';
import { SRD_5_2_1_SOURCE, srdId } from './source';

export const SRD_WEAPON_MASTERIES = [
  {
    id: srdId('weapon-mastery', 'cleave'),
    kind: 'weaponMastery',
    name: 'Cleave',
    source: SRD_5_2_1_SOURCE,
    description: 'After a qualifying melee hit, make one additional attack against a nearby second creature; the extra hit omits a positive ability modifier to damage.',
    effectTag: 'extra-attack',
  },
  {
    id: srdId('weapon-mastery', 'graze'),
    kind: 'weaponMastery',
    name: 'Graze',
    source: SRD_5_2_1_SOURCE,
    description: 'On a miss, deal damage equal to the ability modifier used for the attack, using the weapon damage type.',
    effectTag: 'damage-on-miss',
  },
  {
    id: srdId('weapon-mastery', 'nick'),
    kind: 'weaponMastery',
    name: 'Nick',
    source: SRD_5_2_1_SOURCE,
    description: 'The extra attack granted by the Light property can occur within the Attack action rather than as a Bonus Action, once per turn.',
    effectTag: 'light-attack-timing',
  },
  {
    id: srdId('weapon-mastery', 'push'),
    kind: 'weaponMastery',
    name: 'Push',
    source: SRD_5_2_1_SOURCE,
    description: 'On a hit, move a Large-or-smaller target up to 10 feet directly away from you.',
    effectTag: 'forced-movement',
  },
  {
    id: srdId('weapon-mastery', 'sap'),
    kind: 'weaponMastery',
    name: 'Sap',
    source: SRD_5_2_1_SOURCE,
    description: 'On a hit, the target has Disadvantage on its next attack roll before the start of your next turn.',
    effectTag: 'attack-disadvantage',
  },
  {
    id: srdId('weapon-mastery', 'slow'),
    kind: 'weaponMastery',
    name: 'Slow',
    source: SRD_5_2_1_SOURCE,
    description: 'After a damaging hit, reduce the target’s Speed by 10 feet until the start of your next turn; repeated Slow hits do not stack beyond 10 feet.',
    effectTag: 'speed-reduction',
  },
  {
    id: srdId('weapon-mastery', 'topple'),
    kind: 'weaponMastery',
    name: 'Topple',
    source: SRD_5_2_1_SOURCE,
    description: 'On a hit, the target makes a Constitution save using the SRD mastery DC formula; on a failure it gains the Prone condition.',
    effectTag: 'prone-save',
  },
  {
    id: srdId('weapon-mastery', 'vex'),
    kind: 'weaponMastery',
    name: 'Vex',
    source: SRD_5_2_1_SOURCE,
    description: 'After a damaging hit, gain Advantage on your next attack roll against that creature before the end of your next turn.',
    effectTag: 'next-attack-advantage',
  },
] as const satisfies readonly WeaponMasteryContent[];
