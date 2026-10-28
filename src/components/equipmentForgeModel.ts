import type {
  ArmorCategory,
  ArmorClassModel,
  ArmorContent,
  CurrencyUnit,
  DamageAmount,
  DamageType,
  EquipmentCategory,
  EquipmentContent,
  Money,
  WeaponCategory,
  WeaponContent,
  WeaponMode,
  WeaponProperty,
} from '../models/content';
import type { ContentId } from '../models/contentId';
import { contentRegistry, type ContentRegistry } from '../services/contentRegistry';
import { allocateHomebrewContentId } from '../services/homebrewContentStorage';

export const EQUIPMENT_FORGE_KINDS = ['weapon', 'armor', 'equipment'] as const;
export const EQUIPMENT_FORGE_WEAPON_CATEGORIES: readonly WeaponCategory[] = ['simple', 'martial'];
export const EQUIPMENT_FORGE_WEAPON_MODES: readonly WeaponMode[] = ['melee', 'ranged'];
export const EQUIPMENT_FORGE_DAMAGE_TYPES: readonly DamageType[] = [
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
export const EQUIPMENT_FORGE_DICE = [4, 6, 8, 10, 12] as const;
export const EQUIPMENT_FORGE_WEAPON_PROPERTY_TYPES: readonly WeaponProperty['type'][] = [
  'finesse',
  'light',
  'heavy',
  'loading',
  'reach',
  'two-handed',
  'thrown',
  'ammunition',
  'versatile',
];
export const EQUIPMENT_FORGE_AMMUNITION_TYPES = ['arrow', 'bolt', 'bullet', 'needle'] as const;
export const EQUIPMENT_FORGE_ARMOR_CATEGORIES: readonly ArmorCategory[] = ['light', 'medium', 'heavy', 'shield'];
export const EQUIPMENT_FORGE_EQUIPMENT_CATEGORIES: readonly EquipmentCategory[] = [
  'ammunition',
  'consumable',
  'adventuring-gear',
  'campaign-item',
  'other',
];
export const EQUIPMENT_FORGE_CURRENCY_UNITS: readonly CurrencyUnit[] = ['cp', 'sp', 'gp'];

export interface EquipmentForgeBaseDraft {
  readonly id: ContentId;
  readonly sourceNamespace: string;
  readonly name: string;
  readonly description: string;
  readonly referenceEffects: readonly string[];
  readonly cost: Money;
  readonly weightPounds: number | null;
}

export type EquipmentForgeWeaponDraft = EquipmentForgeBaseDraft & {
  readonly kind: 'weapon';
  readonly category: WeaponCategory;
  readonly mode: WeaponMode;
  readonly damage: DamageAmount;
  readonly damageType: DamageType;
  readonly properties: readonly WeaponProperty[];
  readonly masteryId: ContentId;
  readonly attackBonus: number;
  readonly damageBonus: number;
};

export type EquipmentForgeArmorDraft = EquipmentForgeBaseDraft & {
  readonly kind: 'armor';
  readonly category: ArmorCategory;
  readonly armorClass: ArmorClassModel;
  readonly strengthRequirement: number | null;
  readonly stealthDisadvantage: boolean;
  readonly armorClassBonus: number;
};

export type EquipmentForgeMiscellaneousDraft = EquipmentForgeBaseDraft & {
  readonly kind: 'equipment';
  readonly category: EquipmentCategory;
};

export type EquipmentForgeDraft =
  | EquipmentForgeWeaponDraft
  | EquipmentForgeArmorDraft
  | EquipmentForgeMiscellaneousDraft;

export type EquipmentForgeContent = WeaponContent | ArmorContent | EquipmentContent;

export type EquipmentForgeDraftLoadResult =
  | { readonly ok: true; readonly draft: EquipmentForgeDraft }
  | { readonly ok: false; readonly message: string };

function baseDraft(kind: EquipmentForgeDraft['kind']): EquipmentForgeBaseDraft {
  return {
    id: allocateHomebrewContentId(kind),
    sourceNamespace: 'local',
    name: '',
    description: '',
    referenceEffects: [],
    cost: { amount: 0, unit: 'gp' },
    weightPounds: 0,
  };
}

export function createEquipmentForgeDraft(kind: 'weapon', registry?: ContentRegistry): EquipmentForgeWeaponDraft;
export function createEquipmentForgeDraft(kind: 'armor', registry?: ContentRegistry): EquipmentForgeArmorDraft;
export function createEquipmentForgeDraft(kind: 'equipment', registry?: ContentRegistry): EquipmentForgeMiscellaneousDraft;
export function createEquipmentForgeDraft(
  kind: EquipmentForgeDraft['kind'],
  registry: ContentRegistry = contentRegistry,
): EquipmentForgeDraft {
  const base = baseDraft(kind);
  if (kind === 'weapon') {
    return {
      ...base,
      kind,
      category: 'simple',
      mode: 'melee',
      damage: { kind: 'dice', count: 1, die: 6 },
      damageType: 'bludgeoning',
      properties: [],
      masteryId: registry.getAll('weaponMastery')[0]?.id ?? '',
      attackBonus: 0,
      damageBonus: 0,
    };
  }
  if (kind === 'armor') {
    return {
      ...base,
      kind,
      category: 'light',
      armorClass: { kind: 'armor', base: 11, dexterity: 'full' },
      strengthRequirement: null,
      stealthDisadvantage: false,
      armorClassBonus: 0,
    };
  }
  return { ...base, kind, category: 'adventuring-gear' };
}

function draftFromContent(entry: EquipmentForgeContent, id: ContentId, sourceNamespace: string): EquipmentForgeDraft {
  const cloned = structuredClone(entry);
  const base: EquipmentForgeBaseDraft = {
    id,
    sourceNamespace,
    name: cloned.name,
    description: cloned.description ?? '',
    referenceEffects: [...(cloned.referenceEffects ?? [])],
    cost: { ...cloned.cost },
    weightPounds: cloned.weightPounds,
  };

  if (cloned.kind === 'weapon') {
    return {
      ...base,
      kind: 'weapon',
      category: cloned.category,
      mode: cloned.mode,
      damage: structuredClone(cloned.damage),
      damageType: cloned.damageType,
      properties: structuredClone(cloned.properties),
      masteryId: cloned.masteryId,
      attackBonus: cloned.attackBonus ?? 0,
      damageBonus: cloned.damageBonus ?? 0,
    };
  }
  if (cloned.kind === 'armor') {
    return {
      ...base,
      kind: 'armor',
      category: cloned.category,
      armorClass: structuredClone(cloned.armorClass),
      strengthRequirement: cloned.strengthRequirement,
      stealthDisadvantage: cloned.stealthDisadvantage,
      armorClassBonus: cloned.armorClassBonus ?? 0,
    };
  }
  return { ...base, kind: 'equipment', category: cloned.category };
}

export function loadEquipmentForgeDraft(entry: EquipmentForgeContent): EquipmentForgeDraftLoadResult {
  if (entry.source.type !== 'homebrew') {
    return { ok: false, message: 'Bundled SRD equipment is read-only and cannot be edited in Creator Forge.' };
  }
  return { ok: true, draft: draftFromContent(entry, entry.id, entry.source.namespace) };
}

export function copyEquipmentForgeDraft(entry: EquipmentForgeContent): EquipmentForgeDraftLoadResult {
  return {
    ok: true,
    draft: draftFromContent(entry, allocateHomebrewContentId(entry.kind), 'local'),
  };
}

function trimmedReferenceEffects(referenceEffects: readonly string[]): string[] {
  return referenceEffects.map((effect) => effect.trim());
}

export function buildEquipmentContentFromDraft(draft: EquipmentForgeDraft): EquipmentForgeContent {
  const common = {
    id: draft.id,
    name: draft.name.trim(),
    source: { type: 'homebrew' as const, namespace: draft.sourceNamespace },
    cost: { ...draft.cost },
    weightPounds: draft.weightPounds,
  };
  const description = draft.description.trim();
  const referenceEffects = trimmedReferenceEffects(draft.referenceEffects);

  if (draft.kind === 'weapon') {
    return {
      ...common,
      kind: 'weapon',
      category: draft.category,
      mode: draft.mode,
      damage: structuredClone(draft.damage),
      damageType: draft.damageType,
      properties: structuredClone(draft.properties),
      masteryId: draft.masteryId,
      ...(description ? { description } : {}),
      referenceEffects,
      attackBonus: draft.attackBonus,
      damageBonus: draft.damageBonus,
    };
  }
  if (draft.kind === 'armor') {
    return {
      ...common,
      kind: 'armor',
      category: draft.category,
      armorClass: structuredClone(draft.armorClass),
      strengthRequirement: draft.strengthRequirement,
      stealthDisadvantage: draft.stealthDisadvantage,
      ...(description ? { description } : {}),
      referenceEffects,
      armorClassBonus: draft.armorClassBonus,
      weightPounds: draft.weightPounds as number,
    };
  }
  return {
    ...common,
    kind: 'equipment',
    category: draft.category,
    description,
    referenceEffects,
  };
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validDamage(damage: unknown): damage is DamageAmount {
  if (!isRecord(damage) || typeof damage.kind !== 'string') return false;
  if (damage.kind === 'fixed') {
    return hasOnlyKeys(damage, ['kind', 'amount'])
      && Number.isInteger(damage.amount)
      && Number(damage.amount) > 0;
  }
  return damage.kind === 'dice'
    && hasOnlyKeys(damage, ['kind', 'count', 'die'])
    && Number.isInteger(damage.count)
    && Number(damage.count) > 0
    && EQUIPMENT_FORGE_DICE.includes(damage.die as (typeof EQUIPMENT_FORGE_DICE)[number]);
}

function validRange(range: unknown): boolean {
  return isRecord(range)
    && hasOnlyKeys(range, ['normal', 'long'])
    && Number.isInteger(range.normal)
    && Number(range.normal) > 0
    && Number.isInteger(range.long)
    && Number(range.long) >= Number(range.normal);
}

function validWeaponProperty(property: unknown): property is WeaponProperty {
  if (!isRecord(property) || typeof property.type !== 'string') return false;
  if (['finesse', 'light', 'heavy', 'loading', 'reach'].includes(property.type)) {
    return hasOnlyKeys(property, ['type']);
  }
  if (property.type === 'two-handed') {
    return hasOnlyKeys(property, ['type', 'condition'])
      && (property.condition === undefined || property.condition === 'unless-mounted');
  }
  if (property.type === 'thrown') {
    return hasOnlyKeys(property, ['type', 'range']) && validRange(property.range);
  }
  if (property.type === 'ammunition') {
    return hasOnlyKeys(property, ['type', 'range', 'ammunition'])
      && validRange(property.range)
      && EQUIPMENT_FORGE_AMMUNITION_TYPES.includes(property.ammunition as (typeof EQUIPMENT_FORGE_AMMUNITION_TYPES)[number]);
  }
  return property.type === 'versatile'
    && hasOnlyKeys(property, ['type', 'alternateDamage'])
    && validDamage(property.alternateDamage);
}

function validArmorClass(armorClass: unknown): armorClass is ArmorClassModel {
  if (!isRecord(armorClass)) return false;
  if (armorClass.kind === 'shield') {
    return hasOnlyKeys(armorClass, ['kind', 'bonus'])
      && Number.isInteger(armorClass.bonus)
      && Number(armorClass.bonus) > 0;
  }
  if (armorClass.kind !== 'armor'
    || !hasOnlyKeys(armorClass, ['kind', 'base', 'dexterity', 'dexterityCap'])
    || !Number.isInteger(armorClass.base)
    || Number(armorClass.base) <= 0
    || !['full', 'capped', 'none'].includes(String(armorClass.dexterity))) return false;
  if (armorClass.dexterity === 'capped') {
    return Number.isInteger(armorClass.dexterityCap) && Number(armorClass.dexterityCap) >= 0;
  }
  return armorClass.dexterityCap === undefined;
}

function validItemBonus(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 5;
}

function validIdentity(draft: EquipmentForgeDraft): boolean {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(draft.sourceNamespace)) return false;
  const prefix = `homebrew:${draft.sourceNamespace}:${draft.kind}:`;
  return draft.id.startsWith(prefix) && /^[a-z0-9][a-z0-9-]*$/.test(draft.id.slice(prefix.length));
}

function validateCommonFields(draft: EquipmentForgeDraft, errors: string[]): void {
  if (!draft.name.trim()) errors.push('Name is required.');
  if (!validIdentity(draft)) errors.push('Homebrew ID must match the draft namespace and equipment kind.');
  if (!Number.isFinite(draft.cost.amount)
    || draft.cost.amount < 0
    || !EQUIPMENT_FORGE_CURRENCY_UNITS.includes(draft.cost.unit)) {
    errors.push('Cost must be a nonnegative finite amount in cp, sp, or gp.');
  }
  if (draft.kind === 'armor') {
    if (!Number.isFinite(draft.weightPounds) || Number(draft.weightPounds) < 0) {
      errors.push('Armor weight must be a nonnegative finite number.');
    }
  } else if (draft.weightPounds !== null
    && (!Number.isFinite(draft.weightPounds) || draft.weightPounds < 0)) {
    errors.push('Weight must be null or a nonnegative finite number.');
  }
  if (!Array.isArray(draft.referenceEffects)
    || draft.referenceEffects.some((effect) => typeof effect !== 'string' || !effect.trim())) {
    errors.push('Reference-only effects cannot contain empty rows.');
  }
}

export function validateEquipmentForgeDraft(
  draft: EquipmentForgeDraft,
  registry: ContentRegistry = contentRegistry,
): readonly string[] {
  const errors: string[] = [];
  validateCommonFields(draft, errors);

  if (draft.kind === 'weapon') {
    if (!EQUIPMENT_FORGE_WEAPON_CATEGORIES.includes(draft.category)) errors.push('Weapon category is invalid.');
    if (!EQUIPMENT_FORGE_WEAPON_MODES.includes(draft.mode)) errors.push('Weapon mode is invalid.');
    if (!validDamage(draft.damage)) errors.push('Weapon damage is malformed.');
    if (!EQUIPMENT_FORGE_DAMAGE_TYPES.includes(draft.damageType)) errors.push('Weapon damage type is invalid.');
    if (!Array.isArray(draft.properties)
      || draft.properties.some((property) => !validWeaponProperty(property))
      || new Set(draft.properties.map((property) => property.type)).size !== draft.properties.length) {
      errors.push('Weapon properties contain a malformed payload.');
    }
    if (!draft.masteryId.trim() || !registry.findMastery(draft.masteryId)) {
      errors.push('Weapon mastery is required and must exist in the content registry.');
    }
    if (!validItemBonus(draft.attackBonus)) errors.push('Attack bonus must be a whole number from 0 through 5.');
    if (!validItemBonus(draft.damageBonus)) errors.push('Damage bonus must be a whole number from 0 through 5.');
  } else if (draft.kind === 'armor') {
    if (!EQUIPMENT_FORGE_ARMOR_CATEGORIES.includes(draft.category)) errors.push('Armor category is invalid.');
    if ((draft.category === 'shield') !== (draft.armorClass.kind === 'shield')) {
      errors.push('Shield category must use the shield Armor Class model, and other categories must use the armor model.');
    }
    if (!validArmorClass(draft.armorClass)) errors.push('Armor Class model is malformed.');
    if (draft.strengthRequirement !== null
      && (!Number.isInteger(draft.strengthRequirement) || draft.strengthRequirement <= 0)) {
      errors.push('Strength requirement must be null or a positive whole number.');
    }
    if (!validItemBonus(draft.armorClassBonus)) errors.push('Armor Class bonus must be a whole number from 0 through 5.');
  } else {
    if (!EQUIPMENT_FORGE_EQUIPMENT_CATEGORIES.includes(draft.category)) errors.push('Equipment category is invalid.');
    if (!draft.description.trim()) errors.push('Description is required for miscellaneous equipment.');
  }

  return [...new Set(errors)];
}
