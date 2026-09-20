import type { AbilityKey } from '../models/character';
import type {
  DamageType,
  DieSize,
  SpellContent,
  SpellDieTerm,
  SpellLevel,
  SpellListReference,
  SpellMechanic,
  SpellRollAmount,
  SpellScaling,
  SpellSchool,
} from '../models/content';
import type { ContentRegistry } from '../services/contentRegistry';
import { allocateHomebrewContentId } from '../services/homebrewContentStorage';

export const SPELL_FORGE_SCHOOLS: readonly SpellSchool[] = [
  'abjuration',
  'conjuration',
  'divination',
  'enchantment',
  'evocation',
  'illusion',
  'necromancy',
  'transmutation',
];

export const SPELL_FORGE_DICE: readonly DieSize[] = [4, 6, 8, 10, 12];

export const SPELL_FORGE_DAMAGE_TYPES: readonly DamageType[] = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
];

export interface SpellForgeReferenceEffectDraft {
  readonly draftId: string;
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface SpellForgeDamageDraft {
  readonly amount: SpellRollAmount;
  readonly damageType: DamageType;
  readonly scaling?: SpellScaling;
}

export interface SpellForgeHealingDraft {
  readonly amount: SpellRollAmount;
  readonly scaling?: SpellScaling;
}

export interface SpellForgeDraft {
  readonly id: string;
  readonly sourceNamespace: string;
  readonly name: string;
  readonly description: string;
  readonly higherLevelDescription: string;
  readonly level: SpellLevel;
  readonly school: SpellSchool;
  readonly castingTime: string;
  readonly range: string;
  readonly duration: string;
  readonly target: string;
  readonly components: {
    readonly verbal: boolean;
    readonly somatic: boolean;
    readonly material: boolean;
    readonly materialText: string;
  };
  readonly concentration: boolean;
  readonly ritual: boolean;
  readonly spellLists: readonly SpellListReference[];
  readonly attack?: Extract<SpellMechanic, { readonly type: 'spell-attack' }>;
  readonly savingThrow?: Extract<SpellMechanic, { readonly type: 'saving-throw' }>;
  readonly damage?: SpellForgeDamageDraft;
  readonly healing?: SpellForgeHealingDraft;
  readonly referenceEffects: readonly SpellForgeReferenceEffectDraft[];
}

export type SpellForgeDraftLoadResult =
  | { readonly ok: true; readonly draft: SpellForgeDraft }
  | { readonly ok: false; readonly message: string };

function draftId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneDiceTerms(terms: readonly SpellDieTerm[]): SpellDieTerm[] {
  return terms.map((term) => ({ ...term }));
}

function cloneScaling(scaling: SpellScaling | undefined): SpellScaling | undefined {
  if (!scaling) return undefined;
  if (scaling.kind === 'character-level-dice') {
    return {
      kind: 'character-level-dice',
      values: scaling.values.map((row) => ({
        level: row.level,
        dice: cloneDiceTerms(row.dice),
      })),
    };
  }
  return {
    kind: 'slot-level-dice',
    baseSpellLevel: scaling.baseSpellLevel,
    dicePerLevel: cloneDiceTerms(scaling.dicePerLevel),
  };
}

function cloneAmount(amount: SpellRollAmount): SpellRollAmount {
  return { dice: cloneDiceTerms(amount.dice), modifier: amount.modifier };
}

function cloneSpellLists(lists: readonly SpellListReference[]): SpellListReference[] {
  return lists.map((list) => ({ ...list }));
}

function cloneReferenceEffect(effect: SpellForgeReferenceEffectDraft, freshIdentity: boolean): SpellForgeReferenceEffectDraft {
  return {
    draftId: draftId(),
    id: freshIdentity ? allocateHomebrewContentId('spell-reference-effect') : effect.id,
    name: effect.name,
    description: effect.description,
  };
}

export function createSpellForgeDraft(): SpellForgeDraft {
  return {
    id: allocateHomebrewContentId('spell'),
    sourceNamespace: 'local',
    name: '',
    description: '',
    higherLevelDescription: '',
    level: 0,
    school: 'evocation',
    castingTime: 'Action',
    range: '60 feet',
    duration: 'Instantaneous',
    target: '',
    components: {
      verbal: true,
      somatic: true,
      material: false,
      materialText: '',
    },
    concentration: false,
    ritual: false,
    spellLists: [],
    referenceEffects: [],
  };
}

export function loadSpellForgeDraft(spell: SpellContent): SpellForgeDraftLoadResult {
  if (spell.source.type !== 'homebrew') {
    return { ok: false, message: 'Bundled SRD Spells are read-only and cannot be edited in Creator Forge.' };
  }

  return {
    ok: true,
    draft: {
      id: spell.id,
      sourceNamespace: spell.source.namespace,
      name: spell.name,
      description: spell.description,
      higherLevelDescription: spell.higherLevelDescription ?? '',
      level: spell.level,
      school: spell.school,
      castingTime: spell.castingTime,
      range: spell.range,
      duration: spell.duration,
      target: spell.target ?? '',
      components: {
        verbal: spell.components.verbal,
        somatic: spell.components.somatic,
        material: spell.components.material,
        materialText: spell.components.materialText ?? '',
      },
      concentration: spell.concentration,
      ritual: spell.ritual,
      spellLists: cloneSpellLists(spell.spellLists),
      attack: spell.mechanics.find((mechanic): mechanic is Extract<SpellMechanic, { readonly type: 'spell-attack' }> => mechanic.type === 'spell-attack'),
      savingThrow: spell.mechanics.find((mechanic): mechanic is Extract<SpellMechanic, { readonly type: 'saving-throw' }> => mechanic.type === 'saving-throw'),
      damage: (() => {
        const mechanic = spell.mechanics.find((candidate): candidate is Extract<SpellMechanic, { readonly type: 'damage' }> => candidate.type === 'damage');
        return mechanic ? {
          amount: cloneAmount(mechanic.amount),
          damageType: mechanic.damageType,
          ...(mechanic.scaling ? { scaling: cloneScaling(mechanic.scaling) } : {}),
        } : undefined;
      })(),
      healing: (() => {
        const mechanic = spell.mechanics.find((candidate): candidate is Extract<SpellMechanic, { readonly type: 'healing' }> => candidate.type === 'healing');
        return mechanic ? {
          amount: cloneAmount(mechanic.amount),
          ...(mechanic.scaling ? { scaling: cloneScaling(mechanic.scaling) } : {}),
        } : undefined;
      })(),
      referenceEffects: spell.referenceEffects.map((effect) => ({
        draftId: draftId(),
        id: effect.id,
        name: effect.name,
        description: effect.description,
      })),
    },
  };
}

export function duplicateSpellForgeDraft(spell: SpellContent): SpellForgeDraftLoadResult {
  const loaded = loadSpellForgeDraft(spell);
  if (!loaded.ok) return loaded;
  const original = loaded.draft;
  return {
    ok: true,
    draft: {
      ...original,
      id: allocateHomebrewContentId('spell'),
      sourceNamespace: 'local',
      name: `${original.name} Copy`,
      spellLists: cloneSpellLists(original.spellLists),
      attack: original.attack ? { ...original.attack } : undefined,
      savingThrow: original.savingThrow ? { ...original.savingThrow } : undefined,
      damage: original.damage ? {
        amount: cloneAmount(original.damage.amount),
        damageType: original.damage.damageType,
        ...(original.damage.scaling ? { scaling: cloneScaling(original.damage.scaling) } : {}),
      } : undefined,
      healing: original.healing ? {
        amount: cloneAmount(original.healing.amount),
        ...(original.healing.scaling ? { scaling: cloneScaling(original.healing.scaling) } : {}),
      } : undefined,
      referenceEffects: original.referenceEffects.map((effect) => cloneReferenceEffect(effect, true)),
    },
  };
}

export function buildSpellContentFromDraft(draft: SpellForgeDraft): SpellContent {
  const mechanics: SpellMechanic[] = [];
  if (draft.attack) mechanics.push({ ...draft.attack });
  if (draft.savingThrow) mechanics.push({ ...draft.savingThrow });
  if (draft.damage) {
    mechanics.push({
      type: 'damage',
      amount: cloneAmount(draft.damage.amount),
      damageType: draft.damage.damageType,
      ...(draft.damage.scaling ? { scaling: cloneScaling(draft.damage.scaling) } : {}),
    });
  }
  if (draft.healing) {
    mechanics.push({
      type: 'healing',
      amount: cloneAmount(draft.healing.amount),
      ...(draft.healing.scaling ? { scaling: cloneScaling(draft.healing.scaling) } : {}),
    });
  }

  return {
    id: draft.id,
    kind: 'spell',
    name: draft.name.trim(),
    source: { type: 'homebrew', namespace: draft.sourceNamespace },
    level: draft.level,
    school: draft.school,
    castingTime: draft.castingTime.trim(),
    range: draft.range.trim(),
    components: {
      verbal: draft.components.verbal,
      somatic: draft.components.somatic,
      material: draft.components.material,
      ...(draft.components.material && draft.components.materialText.trim()
        ? { materialText: draft.components.materialText.trim() }
        : {}),
    },
    duration: draft.duration.trim(),
    concentration: draft.concentration,
    ritual: draft.ritual,
    ...(draft.target.trim() ? { target: draft.target.trim() } : {}),
    description: draft.description.trim(),
    ...(draft.higherLevelDescription.trim() ? { higherLevelDescription: draft.higherLevelDescription.trim() } : {}),
    spellLists: cloneSpellLists(draft.spellLists),
    mechanics,
    referenceEffects: draft.referenceEffects.map((effect) => ({
      id: effect.id,
      name: effect.name.trim(),
      description: effect.description.trim(),
    })),
  };
}

export function createDefaultDamageDraft(): SpellForgeDamageDraft {
  return {
    amount: { dice: [{ count: 1, die: 8 }], modifier: 'none' },
    damageType: 'force',
  };
}

export function createDefaultHealingDraft(): SpellForgeHealingDraft {
  return {
    amount: { dice: [{ count: 1, die: 8 }], modifier: 'spellcasting-ability' },
  };
}

export function createReferenceEffectDraft(): SpellForgeReferenceEffectDraft {
  return {
    draftId: draftId(),
    id: allocateHomebrewContentId('spell-reference-effect'),
    name: '',
    description: '',
  };
}

export function createCharacterLevelScaling(amount: SpellRollAmount): SpellScaling {
  return {
    kind: 'character-level-dice',
    values: [1, 5, 11, 17].map((level, index) => ({
      level,
      dice: amount.dice.map((term) => ({ ...term, count: term.count * (index + 1) })),
    })),
  };
}

export function createSlotLevelScaling(level: Exclude<SpellLevel, 0>): SpellScaling {
  return {
    kind: 'slot-level-dice',
    baseSpellLevel: level,
    dicePerLevel: [{ count: 1, die: 8 }],
  };
}

export function withSpellLevel(draft: SpellForgeDraft, level: SpellLevel): SpellForgeDraft {
  const normalizeScaling = <T extends SpellForgeDamageDraft | SpellForgeHealingDraft | undefined>(mechanic: T): T => {
    if (!mechanic?.scaling) return mechanic;
    const scaling = mechanic.scaling;
    if (level === 0 && scaling.kind !== 'character-level-dice') return { ...mechanic, scaling: undefined } as T;
    if (level > 0 && scaling.kind !== 'slot-level-dice') return { ...mechanic, scaling: undefined } as T;
    if (level > 0 && scaling.kind === 'slot-level-dice') {
      return { ...mechanic, scaling: { ...scaling, baseSpellLevel: level } } as T;
    }
    return mechanic;
  };

  return {
    ...draft,
    level,
    damage: normalizeScaling(draft.damage),
    healing: normalizeScaling(draft.healing),
  };
}

function validDice(terms: readonly SpellDieTerm[]): boolean {
  return terms.length > 0 && terms.every((term) =>
    Number.isInteger(term.count)
    && term.count > 0
    && SPELL_FORGE_DICE.includes(term.die));
}

function validateScaling(
  scaling: SpellScaling | undefined,
  spellLevel: SpellLevel,
  label: string,
  errors: string[],
): void {
  if (!scaling) return;

  if (scaling.kind === 'character-level-dice') {
    if (spellLevel !== 0) {
      errors.push(`${label} character-level scaling is only valid for a cantrip.`);
      return;
    }
    if (scaling.values.length === 0 || scaling.values[0]?.level !== 1) {
      errors.push(`${label} cantrip scaling must start at Character level 1.`);
    }
    scaling.values.forEach((row, index) => {
      if (!Number.isInteger(row.level) || row.level < 1 || row.level > 20) {
        errors.push(`${label} cantrip scaling levels must be whole numbers from 1 to 20.`);
      }
      if (index > 0 && row.level <= scaling.values[index - 1].level) {
        errors.push(`${label} cantrip scaling levels must be strictly increasing.`);
      }
      if (!validDice(row.dice)) errors.push(`${label} cantrip scaling rows require valid positive dice terms.`);
    });
    return;
  }

  if (spellLevel === 0) {
    errors.push(`${label} slot scaling is not valid for a cantrip.`);
    return;
  }
  if (scaling.baseSpellLevel !== spellLevel) {
    errors.push(`${label} slot scaling must use the Spell's base level.`);
  }
  if (!validDice(scaling.dicePerLevel)) {
    errors.push(`${label} slot scaling requires valid positive dice-per-level terms.`);
  }
}

export function validateSpellForgeDraft(draft: SpellForgeDraft): readonly string[] {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push('Name is required.');
  if (!draft.description.trim()) errors.push('Description is required.');
  if (!Number.isInteger(draft.level) || draft.level < 0 || draft.level > 9) errors.push('Spell level must be a whole number from 0 to 9.');
  if (!SPELL_FORGE_SCHOOLS.includes(draft.school)) errors.push('Spell school is invalid.');
  if (!draft.castingTime.trim()) errors.push('Casting time is required.');
  if (!draft.range.trim()) errors.push('Range is required.');
  if (!draft.duration.trim()) errors.push('Duration is required.');
  if (draft.components.material && !draft.components.materialText.trim()) errors.push('Material components require a description.');
  if (draft.spellLists.length === 0) errors.push('Select at least one Spell list.');
  if (new Set(draft.spellLists.map((list) => list.id)).size !== draft.spellLists.length) errors.push('Spell list selections must be unique.');

  if (draft.damage) {
    if (!validDice(draft.damage.amount.dice)) errors.push('Damage requires valid positive dice terms.');
    validateScaling(draft.damage.scaling, draft.level, 'Damage', errors);
  }
  if (draft.healing) {
    if (!validDice(draft.healing.amount.dice)) errors.push('Healing requires valid positive dice terms.');
    validateScaling(draft.healing.scaling, draft.level, 'Healing', errors);
  }

  for (const effect of draft.referenceEffects) {
    if (!effect.name.trim()) errors.push('Reference-only effects require a name.');
    if (!effect.description.trim()) errors.push('Reference-only effects require a description.');
  }

  return [...new Set(errors)];
}

function addSpellListOption(
  options: Map<string, SpellListReference>,
  id: string,
  name: string,
): void {
  const normalizedId = id.trim();
  const normalizedName = name.trim();
  if (!normalizedId || !normalizedName || options.has(normalizedId)) return;
  options.set(normalizedId, { id: normalizedId, name: normalizedName });
}

export function collectSpellListOptions(registry: ContentRegistry): readonly SpellListReference[] {
  const options = new Map<string, SpellListReference>();

  for (const spell of registry.getAll('spell')) {
    for (const list of spell.spellLists) addSpellListOption(options, list.id, list.name);
  }

  for (const classEntry of registry.getAll('class')) {
    for (const row of classEntry.progression) {
      for (const feature of row.features) {
        for (const provider of feature.spellcasting ?? []) {
          const management = provider.spellManagement;
          if (management.kind !== 'granted-only') addSpellListOption(options, management.spellListId, classEntry.name);
        }
      }
    }
  }

  for (const subclass of registry.getAll('subclass')) {
    for (const row of subclass.progression) {
      for (const feature of row.features) {
        for (const provider of feature.spellcasting ?? []) {
          const management = provider.spellManagement;
          if (management.kind !== 'granted-only') addSpellListOption(options, management.spellListId, subclass.name);
        }
      }
    }
  }

  return [...options.values()].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

export function toggleSpellList(
  current: readonly SpellListReference[],
  option: SpellListReference,
): SpellListReference[] {
  return current.some((list) => list.id === option.id)
    ? current.filter((list) => list.id !== option.id)
    : [...current, { ...option }];
}

export function updateDiceTerm(
  terms: readonly SpellDieTerm[],
  index: number,
  next: SpellDieTerm,
): SpellDieTerm[] {
  return terms.map((term, termIndex) => termIndex === index ? next : term);
}

export function removeDiceTerm(
  terms: readonly SpellDieTerm[],
  index: number,
): SpellDieTerm[] {
  return terms.filter((_, termIndex) => termIndex !== index);
}

export function addDiceTerm(terms: readonly SpellDieTerm[]): SpellDieTerm[] {
  return [...terms, { count: 1, die: 6 }];
}

export function abilityLabel(ability: AbilityKey): string {
  return ability[0].toUpperCase() + ability.slice(1);
}
