import { describe, expect, it } from 'vitest';
import type { BackgroundContent, EquipmentContent, SpeciesContent, WeaponContent } from '../models/content';
import { buildHomebrewContentId, deleteHomebrewContent, loadHomebrewContent, upsertHomebrewContent } from './homebrewContentStorage';

function homebrewWeapon(name = 'Moonblade Practice Sword'): WeaponContent {
  return {
    id: buildHomebrewContentId('austin', 'weapon', 'practice-sword'),
    kind: 'weapon',
    name,
    source: { type: 'homebrew', namespace: 'austin' },
    category: 'martial',
    mode: 'melee',
    damage: { kind: 'dice', count: 1, die: 6 },
    damageType: 'slashing',
    properties: [],
    masteryId: 'srd-5.2.1:weapon-mastery:sap',
    cost: { amount: 1, unit: 'gp' },
    weightPounds: 2,
  };
}

function homebrewSpecies(): SpeciesContent {
  return {
    id: buildHomebrewContentId('austin', 'species', 'moonfolk'),
    kind: 'species', name: 'Moonfolk', source: { type: 'homebrew', namespace: 'austin' },
    creatureType: 'humanoid', size: { kind: 'fixed', value: 'medium' }, speedFeet: 30, senses: [], traits: [], choices: [],
  };
}

function homebrewBackground(): BackgroundContent {
  return {
    id: buildHomebrewContentId('austin', 'background', 'wanderer'),
    kind: 'background', name: 'Wanderer', source: { type: 'homebrew', namespace: 'austin' },
    abilityScores: ['dexterity', 'wisdom', 'charisma'], skillProficiencies: ['perception', 'survival'],
    toolProficiency: { kind: 'fixed', id: 'herbalism-kit', name: 'Herbalism Kit' },
    originFeat: { id: 'srd-5.2.1:feat:alert', name: 'Alert' },
    startingEquipment: [{ id: 'A', items: [], currency: { amount: 15, unit: 'gp' } }],
    description: 'A small Homebrew Background storage fixture.',
  };
}

function homebrewEquipment(): EquipmentContent {
  return {
    id: buildHomebrewContentId('local', 'equipment', '11111111-1111-4111-8111-111111111111'),
    kind: 'equipment',
    name: 'Surveyor’s Brass Lens',
    source: { type: 'homebrew', namespace: 'local' },
    category: 'campaign-item',
    description: 'A carefully engraved optical tool.',
    referenceEffects: ['Reveals maker marks when examined during downtime.'],
    cost: { amount: 75, unit: 'gp' },
    weightPounds: 0.5,
  };
}

describe('Homebrew content storage foundation', () => {
  it('uses a collision-safe Homebrew namespace', () => {
    expect(buildHomebrewContentId('austin', 'weapon', 'practice-sword')).toBe('homebrew:austin:weapon:practice-sword');
    expect(() => buildHomebrewContentId('bad namespace', 'weapon', 'item')).toThrow();
  });

  it('supports controlled create/edit/delete independently of SRD content', () => {
    const original = homebrewWeapon();
    upsertHomebrewContent(original);
    expect(loadHomebrewContent()).toEqual([original]);
    const edited = homebrewWeapon('Renamed Practice Sword');
    upsertHomebrewContent(edited);
    expect(loadHomebrewContent()).toEqual([edited]);
    expect(deleteHomebrewContent(edited.id)).toBe(true);
    expect(loadHomebrewContent()).toEqual([]);
  });

  it('persists Homebrew Species and Background entries through the same storage contract', () => {
    const species = homebrewSpecies();
    const background = homebrewBackground();
    upsertHomebrewContent(species);
    upsertHomebrewContent(background);
    expect(loadHomebrewContent()).toEqual([species, background]);
    expect(deleteHomebrewContent(species.id)).toBe(true);
    expect(loadHomebrewContent()).toEqual([background]);
  });

  it('persists generic equipment through the canonical storage contract', () => {
    const equipment = homebrewEquipment();
    upsertHomebrewContent(equipment);
    expect(loadHomebrewContent()).toEqual([equipment]);
    expect(deleteHomebrewContent(equipment.id)).toBe(true);
  });
});
