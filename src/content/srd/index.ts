import type { ContentEntry } from '../../models/content';
import { deepFreeze } from '../../utils/deepFreeze';
import { SRD_ARMOR } from './armor';
import { SRD_BACKGROUNDS } from './backgrounds';
import { SRD_BARBARIAN } from './barbarian';
import { SRD_BARD } from './bard';
import { SRD_CLERIC } from './cleric';
import { SRD_DRUID } from './druid';
import { SRD_FIGHTER } from './fighter';
import { SRD_FEATS } from './feats';
import { SRD_MONK } from './monk';
import { SRD_PALADIN } from './paladin';
import { SRD_RANGER } from './ranger';
import { SRD_ROGUE } from './rogue';
import { SRD_SORCERER } from './sorcerer';
import { SRD_SPELLS } from './spells';
import { SRD_SPECIES } from './species';
import { SRD_WARLOCK } from './warlock';
import { SRD_WIZARD } from './wizard';
import { SRD_SUBCLASSES } from './subclasses';
import { SRD_WEAPON_MASTERIES } from './weaponMasteries';
import { SRD_WEAPONS } from './weapons';

export const SRD_CLASSES = [SRD_FIGHTER, SRD_BARBARIAN, SRD_CLERIC, SRD_ROGUE, SRD_BARD, SRD_PALADIN, SRD_RANGER, SRD_DRUID, SRD_MONK, SRD_SORCERER, SRD_WARLOCK, SRD_WIZARD] as const;

export const SRD_CONTENT = deepFreeze([
  ...SRD_CLASSES,
  ...SRD_SUBCLASSES,
  ...SRD_SPECIES,
  ...SRD_BACKGROUNDS,
  ...SRD_FEATS,
  ...SRD_SPELLS,
  ...SRD_WEAPONS,
  ...SRD_ARMOR,
  ...SRD_WEAPON_MASTERIES,
] satisfies ContentEntry[]);

export { SRD_ARMOR, SRD_BACKGROUNDS, SRD_BARBARIAN, SRD_BARD, SRD_CLERIC, SRD_DRUID, SRD_FEATS, SRD_FIGHTER, SRD_MONK, SRD_PALADIN, SRD_RANGER, SRD_ROGUE, SRD_SORCERER, SRD_SPELLS, SRD_SPECIES, SRD_SUBCLASSES, SRD_WARLOCK, SRD_WIZARD, SRD_WEAPON_MASTERIES, SRD_WEAPONS };
export { SRD_5_2_1_SOURCE, SRD_ID_PREFIX, srdId } from './source';
