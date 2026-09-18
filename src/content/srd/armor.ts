import type { ArmorContent, Money } from '../../models/content';
import { SRD_5_2_1_SOURCE, srdId } from './source';

const cost = (amount: number, unit: Money['unit'] = 'gp'): Money => ({ amount, unit });
const armor = (slug: string) => srdId('armor', slug);

export const SRD_ARMOR = [
  { id: armor('padded-armor'), kind: 'armor', name: 'Padded Armor', source: SRD_5_2_1_SOURCE, category: 'light', armorClass: { kind: 'armor', base: 11, dexterity: 'full' }, strengthRequirement: null, stealthDisadvantage: true, weightPounds: 8, cost: cost(5) },
  { id: armor('leather-armor'), kind: 'armor', name: 'Leather Armor', source: SRD_5_2_1_SOURCE, category: 'light', armorClass: { kind: 'armor', base: 11, dexterity: 'full' }, strengthRequirement: null, stealthDisadvantage: false, weightPounds: 10, cost: cost(10) },
  { id: armor('studded-leather-armor'), kind: 'armor', name: 'Studded Leather Armor', source: SRD_5_2_1_SOURCE, category: 'light', armorClass: { kind: 'armor', base: 12, dexterity: 'full' }, strengthRequirement: null, stealthDisadvantage: false, weightPounds: 13, cost: cost(45) },
  { id: armor('hide-armor'), kind: 'armor', name: 'Hide Armor', source: SRD_5_2_1_SOURCE, category: 'medium', armorClass: { kind: 'armor', base: 12, dexterity: 'capped', dexterityCap: 2 }, strengthRequirement: null, stealthDisadvantage: false, weightPounds: 12, cost: cost(10) },
  { id: armor('chain-shirt'), kind: 'armor', name: 'Chain Shirt', source: SRD_5_2_1_SOURCE, category: 'medium', armorClass: { kind: 'armor', base: 13, dexterity: 'capped', dexterityCap: 2 }, strengthRequirement: null, stealthDisadvantage: false, weightPounds: 20, cost: cost(50) },
  { id: armor('scale-mail'), kind: 'armor', name: 'Scale Mail', source: SRD_5_2_1_SOURCE, category: 'medium', armorClass: { kind: 'armor', base: 14, dexterity: 'capped', dexterityCap: 2 }, strengthRequirement: null, stealthDisadvantage: true, weightPounds: 45, cost: cost(50) },
  { id: armor('breastplate'), kind: 'armor', name: 'Breastplate', source: SRD_5_2_1_SOURCE, category: 'medium', armorClass: { kind: 'armor', base: 14, dexterity: 'capped', dexterityCap: 2 }, strengthRequirement: null, stealthDisadvantage: false, weightPounds: 20, cost: cost(400) },
  { id: armor('half-plate-armor'), kind: 'armor', name: 'Half Plate Armor', source: SRD_5_2_1_SOURCE, category: 'medium', armorClass: { kind: 'armor', base: 15, dexterity: 'capped', dexterityCap: 2 }, strengthRequirement: null, stealthDisadvantage: true, weightPounds: 40, cost: cost(750) },
  { id: armor('ring-mail'), kind: 'armor', name: 'Ring Mail', source: SRD_5_2_1_SOURCE, category: 'heavy', armorClass: { kind: 'armor', base: 14, dexterity: 'none' }, strengthRequirement: null, stealthDisadvantage: true, weightPounds: 40, cost: cost(30) },
  { id: armor('chain-mail'), kind: 'armor', name: 'Chain Mail', source: SRD_5_2_1_SOURCE, category: 'heavy', armorClass: { kind: 'armor', base: 16, dexterity: 'none' }, strengthRequirement: 13, stealthDisadvantage: true, weightPounds: 55, cost: cost(75) },
  { id: armor('splint-armor'), kind: 'armor', name: 'Splint Armor', source: SRD_5_2_1_SOURCE, category: 'heavy', armorClass: { kind: 'armor', base: 17, dexterity: 'none' }, strengthRequirement: 15, stealthDisadvantage: true, weightPounds: 60, cost: cost(200) },
  { id: armor('plate-armor'), kind: 'armor', name: 'Plate Armor', source: SRD_5_2_1_SOURCE, category: 'heavy', armorClass: { kind: 'armor', base: 18, dexterity: 'none' }, strengthRequirement: 15, stealthDisadvantage: true, weightPounds: 65, cost: cost(1500) },
  { id: armor('shield'), kind: 'armor', name: 'Shield', source: SRD_5_2_1_SOURCE, category: 'shield', armorClass: { kind: 'shield', bonus: 2 }, strengthRequirement: null, stealthDisadvantage: false, weightPounds: 6, cost: cost(10) },
] as const satisfies readonly ArmorContent[];
