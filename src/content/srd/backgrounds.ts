import type { BackgroundContent, StartingEquipmentItem } from '../../models/content';
import { SRD_5_2_1_SOURCE, srdId } from './source';

const backgroundId = (slug: string) => srdId('background', slug);
const featId = (slug: string) => srdId('feat', slug);
const weapon = (slug: string) => srdId('weapon', slug);
const gear = (label: string, quantity = 1, inventoryCategory: StartingEquipmentItem['inventoryCategory'] = 'adventuring-gear'): StartingEquipmentItem => ({ label, quantity, inventoryCategory });
const toolGear = (label: string): StartingEquipmentItem => ({ label, inventoryCategory: 'adventuring-gear', selection: { kind: 'background-tool' } });
const gp = (amount: number) => ({ amount, unit: 'gp' as const });
const cashOption = { id: 'B', items: [], currency: gp(50) } as const;

const calligraphersSupplies = { kind: 'fixed', id: 'calligraphers-supplies', name: 'Calligrapher’s Supplies' } as const;
const thievesTools = { kind: 'fixed', id: 'thieves-tools', name: 'Thieves’ Tools' } as const;
const gamingSets = {
  kind: 'choice', category: 'gaming-set', options: [
    { id: 'dice-set', name: 'Dice Set' },
    { id: 'dragonchess-set', name: 'Dragonchess Set' },
    { id: 'playing-card-set', name: 'Playing Card Set' },
    { id: 'three-dragon-ante-set', name: 'Three-Dragon Ante Set' },
  ],
} as const;

export const SRD_ACOLYTE = {
  id: backgroundId('acolyte'), kind: 'background', name: 'Acolyte', source: SRD_5_2_1_SOURCE,
  abilityScores: ['intelligence', 'wisdom', 'charisma'],
  skillProficiencies: ['insight', 'religion'],
  toolProficiency: calligraphersSupplies,
  originFeat: { id: featId('magic-initiate'), name: 'Magic Initiate', variant: 'Cleric' },
  startingEquipment: [
    { id: 'A', items: [toolGear('Calligrapher’s Supplies'), gear('Book (prayers)'), gear('Holy Symbol'), gear('Parchment', 10), gear('Robe')], currency: gp(8) },
    cashOption,
  ],
  description: 'A religious or temple-centered background with Insight, Religion, calligrapher training, and a Cleric-oriented Magic Initiate reference.',
} as const satisfies BackgroundContent;

export const SRD_CRIMINAL = {
  id: backgroundId('criminal'), kind: 'background', name: 'Criminal', source: SRD_5_2_1_SOURCE,
  abilityScores: ['dexterity', 'constitution', 'intelligence'],
  skillProficiencies: ['sleight-of-hand', 'stealth'],
  toolProficiency: thievesTools,
  originFeat: { id: featId('alert'), name: 'Alert' },
  startingEquipment: [
    { id: 'A', items: [
      { label: 'Dagger', quantity: 2, contentId: weapon('dagger') }, toolGear('Thieves’ Tools'), gear('Crowbar'), gear('Pouch', 2), gear('Traveler’s Clothes'),
    ], currency: gp(16) },
    cashOption,
  ],
  description: 'A covert background with Sleight of Hand, Stealth, thieves’ tools, and an Alert feat reference.',
} as const satisfies BackgroundContent;

export const SRD_SAGE = {
  id: backgroundId('sage'), kind: 'background', name: 'Sage', source: SRD_5_2_1_SOURCE,
  abilityScores: ['constitution', 'intelligence', 'wisdom'],
  skillProficiencies: ['arcana', 'history'],
  toolProficiency: calligraphersSupplies,
  originFeat: { id: featId('magic-initiate'), name: 'Magic Initiate', variant: 'Wizard' },
  startingEquipment: [
    { id: 'A', items: [
      { label: 'Quarterstaff', contentId: weapon('quarterstaff') }, toolGear('Calligrapher’s Supplies'), gear('Book (history)'), gear('Parchment', 8), gear('Robe'),
    ], currency: gp(8) },
    cashOption,
  ],
  description: 'A scholarly background with Arcana, History, calligrapher training, and a Wizard-oriented Magic Initiate reference.',
} as const satisfies BackgroundContent;

export const SRD_SOLDIER = {
  id: backgroundId('soldier'), kind: 'background', name: 'Soldier', source: SRD_5_2_1_SOURCE,
  abilityScores: ['strength', 'dexterity', 'constitution'],
  skillProficiencies: ['athletics', 'intimidation'],
  toolProficiency: gamingSets,
  originFeat: { id: featId('savage-attacker'), name: 'Savage Attacker' },
  startingEquipment: [
    { id: 'A', items: [
      { label: 'Spear', contentId: weapon('spear') },
      { label: 'Shortbow', contentId: weapon('shortbow') },
      gear('Arrow', 20, 'ammunition'),
      toolGear('Gaming Set'),
      gear('Healer’s Kit'),
      gear('Quiver'),
      gear('Traveler’s Clothes'),
    ], currency: gp(14) },
    cashOption,
  ],
  description: 'A martial background with Athletics, Intimidation, a chosen gaming set, and a Savage Attacker feat reference.',
} as const satisfies BackgroundContent;

export const SRD_BACKGROUNDS = [SRD_ACOLYTE, SRD_CRIMINAL, SRD_SAGE, SRD_SOLDIER] as const satisfies readonly BackgroundContent[];
