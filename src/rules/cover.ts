import type { D20RollContext } from '../dice/types';
import type { AbilityKey } from '../models/character';

export type CoverLevel = 'none' | 'half' | 'three-quarters' | 'total';

export interface CoverContext {
  readonly level: CoverLevel;
  readonly label: string;
  readonly armorClassBonus: number | null;
  readonly dexteritySaveBonus: number;
  readonly blocksDirectTargeting: boolean;
}

const COVER_CONTEXTS: Record<CoverLevel, CoverContext> = {
  none: { level: 'none', label: 'None', armorClassBonus: 0, dexteritySaveBonus: 0, blocksDirectTargeting: false },
  half: { level: 'half', label: 'Half Cover', armorClassBonus: 2, dexteritySaveBonus: 2, blocksDirectTargeting: false },
  'three-quarters': { level: 'three-quarters', label: 'Three-Quarters Cover', armorClassBonus: 5, dexteritySaveBonus: 5, blocksDirectTargeting: false },
  total: { level: 'total', label: 'Total Cover', armorClassBonus: null, dexteritySaveBonus: 0, blocksDirectTargeting: true },
};

export function deriveCoverContext(level: CoverLevel): CoverContext {
  return COVER_CONTEXTS[level];
}

export function coverSavingThrowContext(level: CoverLevel, ability: AbilityKey): D20RollContext | undefined {
  const cover = deriveCoverContext(level);
  if (ability !== 'dexterity' || cover.dexteritySaveBonus === 0) return undefined;
  return { modifiers: [{ label: cover.label, amount: cover.dexteritySaveBonus }] };
}
