import type { InventoryCategory, InventoryEntry, RegistryInventoryEntry } from '../models/character';
import type { ArmorContent, ContentEntry, EquipmentContent, WeaponContent } from '../models/content';
import type { ContentRegistry } from '../services/contentRegistry';

export function inventoryCategoryForContent(content: ContentEntry): InventoryCategory | undefined {
  if (content.kind === 'weapon') return 'weapon';
  if (content.kind === 'armor') return content.category === 'shield' ? 'shield' : 'armor';
  if (content.kind === 'equipment') return content.category;
  return undefined;
}

export function resolveRegistryInventoryEntry(entry: RegistryInventoryEntry, registry: ContentRegistry): WeaponContent | ArmorContent | EquipmentContent | undefined {
  const content = registry.getById(entry.contentId);
  return content?.kind === 'weapon' || content?.kind === 'armor' || content?.kind === 'equipment' ? content : undefined;
}

export function getEquippedBodyArmor(character: { inventory: readonly InventoryEntry[] }, registry: ContentRegistry) {
  for (const entry of character.inventory) {
    if (entry.kind !== 'registry' || !entry.equipped || entry.category !== 'armor') continue;
    const content = registry.findArmor(entry.contentId);
    if (content && content.category !== 'shield') return { entry, content };
  }
  return undefined;
}

export function getEquippedShield(character: { inventory: readonly InventoryEntry[] }, registry: ContentRegistry) {
  for (const entry of character.inventory) {
    if (entry.kind !== 'registry' || !entry.equipped || entry.category !== 'shield') continue;
    const content = registry.findArmor(entry.contentId);
    if (content?.category === 'shield') return { entry, content };
  }
  return undefined;
}

export function getEquippedWeapons(character: { inventory: readonly InventoryEntry[] }, registry: ContentRegistry) {
  return character.inventory.flatMap((entry) => {
    if (entry.kind !== 'registry' || !entry.equipped || entry.category !== 'weapon') return [];
    const content = registry.findWeapon(entry.contentId);
    return content ? [{ entry, content }] : [];
  });
}

export interface InventoryWeightSummary {
  readonly knownWeightPounds: number;
  readonly unknownQuantity: number;
}

export function calculateInventoryWeight(entries: readonly InventoryEntry[], registry: ContentRegistry): InventoryWeightSummary {
  let knownWeightPounds = 0;
  let unknownQuantity = 0;
  for (const entry of entries) {
    if (entry.kind === 'custom') {
      if (entry.weightPounds === undefined) unknownQuantity += entry.quantity;
      else knownWeightPounds += entry.weightPounds * entry.quantity;
      continue;
    }
    const content = resolveRegistryInventoryEntry(entry, registry);
    if (!content || content.weightPounds === null) unknownQuantity += entry.quantity;
    else knownWeightPounds += content.weightPounds * entry.quantity;
  }
  return { knownWeightPounds, unknownQuantity };
}
