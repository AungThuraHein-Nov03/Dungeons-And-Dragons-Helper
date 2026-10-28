import type { ArmorClassModel, ContentSourceMetadata, DamageAmount, Money, WeaponProperty } from '../models/content';
import type { DerivedWeaponDamage } from '../rules/types';

export function formatDamage(damage: DamageAmount): string {
  return damage.kind === 'fixed' ? String(damage.amount) : `${damage.count}d${damage.die}`;
}

export function formatDerivedDamage(damage: DerivedWeaponDamage & { readonly damageBonus?: number }): string {
  const totalModifier = damage.abilityModifier + (damage.damageBonus ?? 0);
  const modifier = totalModifier >= 0 ? `+ ${totalModifier}` : `- ${Math.abs(totalModifier)}`;
  const type = damage.damageType[0].toUpperCase() + damage.damageType.slice(1);
  return `${formatDamage(damage.base)} ${modifier} ${type}`;
}

export function formatMoney(money: Money): string {
  return `${money.amount} ${money.unit.toUpperCase()}`;
}

export function formatSource(source: ContentSourceMetadata): string {
  return source.type === 'srd' ? `SRD ${source.ruleset}` : `Homebrew · ${source.namespace}`;
}

export function formatArmorClass(model: ArmorClassModel): string {
  if (model.kind === 'shield') return `+${model.bonus}`;
  if (model.dexterity === 'full') return `${model.base} + Dex modifier`;
  if (model.dexterity === 'capped') return `${model.base} + Dex modifier (max ${model.dexterityCap ?? 0})`;
  return String(model.base);
}

export function formatWeaponProperty(property: WeaponProperty): string {
  switch (property.type) {
    case 'finesse': return 'Finesse';
    case 'light': return 'Light';
    case 'heavy': return 'Heavy';
    case 'loading': return 'Loading';
    case 'reach': return 'Reach';
    case 'two-handed': return property.condition === 'unless-mounted' ? 'Two-Handed (unless mounted)' : 'Two-Handed';
    case 'thrown': return `Thrown (${property.range.normal}/${property.range.long})`;
    case 'ammunition': return `Ammunition (${property.range.normal}/${property.range.long}; ${property.ammunition})`;
    case 'versatile': return `Versatile (${formatDamage(property.alternateDamage)})`;
  }
}
