import type { AbilityScores } from '../models/character';
import type { ClassPrimaryAbility, SpellSlotProgressionEntry } from '../models/content';

export const MULTICLASS_PRIMARY_ABILITY_MINIMUM = 13;

export function meetsMulticlassPrimaryAbilityRequirement(
  primaryAbility: ClassPrimaryAbility,
  abilityScores: AbilityScores,
): boolean {
  const qualifies = primaryAbility.abilities.map((ability) => abilityScores[ability] >= MULTICLASS_PRIMARY_ABILITY_MINIMUM);
  return primaryAbility.mode === 'all-of' ? qualifies.every(Boolean) : qualifies.some(Boolean);
}

export const MULTICLASS_SPELLCASTER_SLOT_PROGRESSION = [
  { level: 1, slots: [{ spellLevel: 1, maximum: 2 }] },
  { level: 2, slots: [{ spellLevel: 1, maximum: 3 }] },
  { level: 3, slots: [{ spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 2 }] },
  { level: 4, slots: [{ spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 3 }] },
  { level: 5, slots: [{ spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 3 }, { spellLevel: 3, maximum: 2 }] },
  { level: 6, slots: [{ spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 3 }, { spellLevel: 3, maximum: 3 }] },
  { level: 7, slots: [{ spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 3 }, { spellLevel: 3, maximum: 3 }, { spellLevel: 4, maximum: 1 }] },
  { level: 8, slots: [{ spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 3 }, { spellLevel: 3, maximum: 3 }, { spellLevel: 4, maximum: 2 }] },
  { level: 9, slots: [{ spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 3 }, { spellLevel: 3, maximum: 3 }, { spellLevel: 4, maximum: 3 }, { spellLevel: 5, maximum: 1 }] },
  { level: 10, slots: [{ spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 3 }, { spellLevel: 3, maximum: 3 }, { spellLevel: 4, maximum: 3 }, { spellLevel: 5, maximum: 2 }] },
  { level: 11, slots: [{ spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 3 }, { spellLevel: 3, maximum: 3 }, { spellLevel: 4, maximum: 3 }, { spellLevel: 5, maximum: 2 }, { spellLevel: 6, maximum: 1 }] },
  { level: 12, slots: [{ spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 3 }, { spellLevel: 3, maximum: 3 }, { spellLevel: 4, maximum: 3 }, { spellLevel: 5, maximum: 2 }, { spellLevel: 6, maximum: 1 }] },
  { level: 13, slots: [{ spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 3 }, { spellLevel: 3, maximum: 3 }, { spellLevel: 4, maximum: 3 }, { spellLevel: 5, maximum: 2 }, { spellLevel: 6, maximum: 1 }, { spellLevel: 7, maximum: 1 }] },
  { level: 14, slots: [{ spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 3 }, { spellLevel: 3, maximum: 3 }, { spellLevel: 4, maximum: 3 }, { spellLevel: 5, maximum: 2 }, { spellLevel: 6, maximum: 1 }, { spellLevel: 7, maximum: 1 }] },
  { level: 15, slots: [{ spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 3 }, { spellLevel: 3, maximum: 3 }, { spellLevel: 4, maximum: 3 }, { spellLevel: 5, maximum: 2 }, { spellLevel: 6, maximum: 1 }, { spellLevel: 7, maximum: 1 }, { spellLevel: 8, maximum: 1 }] },
  { level: 16, slots: [{ spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 3 }, { spellLevel: 3, maximum: 3 }, { spellLevel: 4, maximum: 3 }, { spellLevel: 5, maximum: 2 }, { spellLevel: 6, maximum: 1 }, { spellLevel: 7, maximum: 1 }, { spellLevel: 8, maximum: 1 }] },
  { level: 17, slots: [{ spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 3 }, { spellLevel: 3, maximum: 3 }, { spellLevel: 4, maximum: 3 }, { spellLevel: 5, maximum: 2 }, { spellLevel: 6, maximum: 1 }, { spellLevel: 7, maximum: 1 }, { spellLevel: 8, maximum: 1 }, { spellLevel: 9, maximum: 1 }] },
  { level: 18, slots: [{ spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 3 }, { spellLevel: 3, maximum: 3 }, { spellLevel: 4, maximum: 3 }, { spellLevel: 5, maximum: 3 }, { spellLevel: 6, maximum: 1 }, { spellLevel: 7, maximum: 1 }, { spellLevel: 8, maximum: 1 }, { spellLevel: 9, maximum: 1 }] },
  { level: 19, slots: [{ spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 3 }, { spellLevel: 3, maximum: 3 }, { spellLevel: 4, maximum: 3 }, { spellLevel: 5, maximum: 3 }, { spellLevel: 6, maximum: 2 }, { spellLevel: 7, maximum: 1 }, { spellLevel: 8, maximum: 1 }, { spellLevel: 9, maximum: 1 }] },
  { level: 20, slots: [{ spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 3 }, { spellLevel: 3, maximum: 3 }, { spellLevel: 4, maximum: 3 }, { spellLevel: 5, maximum: 3 }, { spellLevel: 6, maximum: 2 }, { spellLevel: 7, maximum: 2 }, { spellLevel: 8, maximum: 1 }, { spellLevel: 9, maximum: 1 }] },
] as const satisfies readonly SpellSlotProgressionEntry[];
