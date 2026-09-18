import type { D20RollContext } from '../dice/types';
import type { AbilityKey } from '../models/character';

export const CHARACTER_CONDITION_IDS = [
  'blinded',
  'charmed',
  'deafened',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
] as const;

export type CharacterConditionId = (typeof CHARACTER_CONDITION_IDS)[number];

export interface CharacterConditionDefinition {
  readonly id: CharacterConditionId;
  readonly name: string;
  readonly summary: string;
  readonly automated: readonly string[];
  readonly informational: readonly string[];
  readonly incapacitating?: boolean;
}

const DEFINITIONS: Record<CharacterConditionId, CharacterConditionDefinition> = {
  blinded: {
    id: 'blinded',
    name: 'Blinded',
    summary: 'You cannot see; sight-dependent checks and incoming attacks still require table context.',
    automated: ['Your attack rolls have Disadvantage.'],
    informational: ['You automatically fail ability checks that require sight.', 'Attack rolls against you have Advantage.'],
  },
  charmed: {
    id: 'charmed',
    name: 'Charmed',
    summary: 'Restrictions and social benefits depend on the creature that charmed you.',
    automated: [],
    informational: ['You cannot attack or target the charmer with damaging abilities or magical effects.', 'The charmer has Advantage on social ability checks to interact with you.'],
  },
  deafened: {
    id: 'deafened',
    name: 'Deafened',
    summary: 'Hearing-dependent checks require table context.',
    automated: [],
    informational: ['You automatically fail ability checks that require hearing.'],
  },
  frightened: {
    id: 'frightened',
    name: 'Frightened',
    summary: 'The roll penalty depends on whether the source of fear is within line of sight.',
    automated: [],
    informational: ['While the fear source is within line of sight, your ability checks and attack rolls have Disadvantage.', 'You cannot willingly move closer to the fear source.'],
  },
  grappled: {
    id: 'grappled',
    name: 'Grappled',
    summary: 'Speed and attack restrictions depend partly on the grappler and remain table-managed.',
    automated: [],
    informational: ['Your Speed is 0 and cannot increase.', 'Your attacks against targets other than the grappler have Disadvantage.'],
  },
  incapacitated: {
    id: 'incapacitated',
    name: 'Incapacitated',
    summary: 'You cannot take actions, Bonus Actions, or Reactions.',
    automated: ['Concentration ends.', 'Initiative rolls have Disadvantage.'],
    informational: ['You cannot take an action, Bonus Action, or Reaction.', 'You cannot speak.'],
    incapacitating: true,
  },
  invisible: {
    id: 'invisible',
    name: 'Invisible',
    summary: 'Visibility-dependent attack effects remain table-managed.',
    automated: ['Initiative rolls have Advantage.'],
    informational: ['Your attacks can have Advantage and attacks against you can have Disadvantage when the other creature cannot see you.', 'Effects that require seeing you may fail unless their creator can somehow see you.'],
  },
  paralyzed: {
    id: 'paralyzed',
    name: 'Paralyzed',
    summary: 'Paralyzed includes Incapacitated; opponent-facing attack and critical effects remain table-managed.',
    automated: ['Concentration ends.', 'Initiative rolls have Disadvantage.'],
    informational: ['Your Speed is 0.', 'You automatically fail Strength and Dexterity saving throws.', 'Attacks against you have Advantage; nearby hits can become automatic critical hits.'],
    incapacitating: true,
  },
  petrified: {
    id: 'petrified',
    name: 'Petrified',
    summary: 'Petrified includes Incapacitated; resistance and transformation effects remain informational.',
    automated: ['Concentration ends.', 'Initiative rolls have Disadvantage.'],
    informational: ['Your Speed is 0.', 'You automatically fail Strength and Dexterity saving throws.', 'You have Resistance to all damage and Immunity to Poisoned.', 'Attacks against you have Advantage.'],
    incapacitating: true,
  },
  poisoned: {
    id: 'poisoned',
    name: 'Poisoned',
    summary: 'The Character-side D20 penalties are deterministic.',
    automated: ['Your attack rolls and ability checks have Disadvantage.'],
    informational: [],
  },
  prone: {
    id: 'prone',
    name: 'Prone',
    summary: 'Your own attack penalty is deterministic; incoming attack effects depend on attacker distance.',
    automated: ['Your attack rolls have Disadvantage.'],
    informational: ['Standing costs movement equal to half your Speed.', 'Attacks against you depend on whether the attacker is within 5 feet.'],
  },
  restrained: {
    id: 'restrained',
    name: 'Restrained',
    summary: 'Your attack and Dexterity-save penalties are deterministic.',
    automated: ['Your attack rolls have Disadvantage.', 'Your Dexterity saving throws have Disadvantage.'],
    informational: ['Your Speed is 0 and cannot increase.', 'Attack rolls against you have Advantage.'],
  },
  stunned: {
    id: 'stunned',
    name: 'Stunned',
    summary: 'Stunned includes Incapacitated; incoming attack effects remain table-managed.',
    automated: ['Concentration ends.', 'Initiative rolls have Disadvantage.'],
    informational: ['You automatically fail Strength and Dexterity saving throws.', 'Attacks against you have Advantage.'],
    incapacitating: true,
  },
  unconscious: {
    id: 'unconscious',
    name: 'Unconscious',
    summary: 'Unconscious includes Incapacitated and Prone; opponent-facing critical effects remain table-managed.',
    automated: ['Concentration ends.', 'Initiative rolls have Disadvantage.'],
    informational: ['Your Speed is 0 and you drop what you are holding.', 'You automatically fail Strength and Dexterity saving throws.', 'Attacks against you have Advantage and nearby hits can become automatic critical hits.', 'You remain Prone when Unconscious ends.'],
    incapacitating: true,
  },
};

export function isCharacterConditionId(value: string): value is CharacterConditionId {
  return CHARACTER_CONDITION_IDS.includes(value as CharacterConditionId);
}

export function getCharacterConditionDefinition(id: CharacterConditionId): CharacterConditionDefinition {
  return DEFINITIONS[id];
}

export function conditionBreaksConcentration(id: CharacterConditionId): boolean {
  return Boolean(DEFINITIONS[id].incapacitating);
}

export type ConditionRollContext =
  | { readonly kind: 'ability-check' | 'skill-check' | 'attack' | 'initiative' }
  | { readonly kind: 'saving-throw'; readonly ability: AbilityKey };

export function deriveConditionD20Context(
  conditions: readonly CharacterConditionId[],
  roll: ConditionRollContext,
): D20RollContext | undefined {
  const advantageSources: string[] = [];
  const disadvantageSources: string[] = [];

  for (const id of [...new Set(conditions)]) {
    const name = DEFINITIONS[id].name;
    if (roll.kind === 'initiative') {
      if (id === 'invisible') advantageSources.push(name);
      if (DEFINITIONS[id].incapacitating) disadvantageSources.push(name);
      continue;
    }

    if (roll.kind === 'attack') {
      if (id === 'poisoned' || id === 'blinded' || id === 'prone' || id === 'restrained') disadvantageSources.push(name);
      continue;
    }

    if (roll.kind === 'ability-check' || roll.kind === 'skill-check') {
      if (id === 'poisoned') disadvantageSources.push(name);
      continue;
    }

    if (roll.kind === 'saving-throw' && roll.ability === 'dexterity' && id === 'restrained') {
      disadvantageSources.push(name);
    }
  }

  if (advantageSources.length === 0 && disadvantageSources.length === 0) return undefined;
  return {
    ...(advantageSources.length > 0 ? { advantageSources } : {}),
    ...(disadvantageSources.length > 0 ? { disadvantageSources } : {}),
  };
}
