import { describe, expect, it } from 'vitest';
import { SRD_CONTENT, SRD_FIGHTER, SRD_SUBCLASSES, srdId } from '../content/srd';
import type { ArmorContent, ClassContent, EquipmentContent, SpellContent, SubclassContent, WeaponContent } from '../models/content';
import { ContentRegistry, contentRegistry } from './contentRegistry';
import { validateContentDataset } from './contentValidation';
import { buildHomebrewContentId } from './homebrewContentStorage';

const fighterId = srdId('class', 'fighter');

const relic: EquipmentContent = {
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

function extendedWeapon(token: string, attackBonus: number, damageBonus: number): WeaponContent {
  return {
    id: buildHomebrewContentId('local', 'weapon', token),
    kind: 'weapon',
    name: 'Runed Surveyor Blade',
    source: { type: 'homebrew', namespace: 'local' },
    category: 'martial',
    mode: 'melee',
    damage: { kind: 'dice', count: 1, die: 6 },
    damageType: 'slashing',
    properties: [],
    masteryId: srdId('weapon-mastery', 'sap'),
    cost: { amount: 25, unit: 'gp' },
    weightPounds: 2,
    description: 'A blade etched with measuring marks.',
    referenceEffects: ['Its markings remain visible in dim light.'],
    attackBonus,
    damageBonus,
  };
}

function extendedArmor(token: string, armorClassBonus: number): ArmorContent {
  return {
    id: buildHomebrewContentId('local', 'armor', token),
    kind: 'armor',
    name: 'Surveyor Plate',
    source: { type: 'homebrew', namespace: 'local' },
    category: 'heavy',
    armorClass: { kind: 'armor', base: 18, dexterity: 'none' },
    strengthRequirement: 15,
    stealthDisadvantage: true,
    cost: { amount: 1500, unit: 'gp' },
    weightPounds: 65,
    description: 'Plate armor with precise engraved scales.',
    referenceEffects: ['The engravings can serve as a field ruler.'],
    armorClassBonus,
  };
}

describe('content registry', () => {
  it('gets content by stable id and type', () => {
    expect(contentRegistry.getById(fighterId)?.name).toBe('Fighter');
    expect(contentRegistry.getAll('class')).toHaveLength(12);
    expect(contentRegistry.getAll('subclass')).toHaveLength(12);
    expect(contentRegistry.getAll('species')).toHaveLength(9);
    expect(contentRegistry.getAll('background')).toHaveLength(4);
    expect(contentRegistry.getAll('feat')).toHaveLength(17);
    expect(contentRegistry.getAll('spell')).toHaveLength(339);
    expect(contentRegistry.getAll('weapon')).toHaveLength(38);
    expect(contentRegistry.getAll('armor')).toHaveLength(13);
    expect(contentRegistry.getAll('weaponMastery')).toHaveLength(8);
  });

  it('returns undefined for an unknown id', () => {
    expect(contentRegistry.getById('srd-5.2.1:weapon:not-real')).toBeUndefined();
  });

  it('filters by source', () => {
    expect(contentRegistry.filterBySource('srd')).toHaveLength(SRD_CONTENT.length);
    expect(contentRegistry.filterBySource('homebrew')).toEqual([]);
  });

  it('has unique ids and a valid built-in dataset', () => {
    const ids = SRD_CONTENT.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(validateContentDataset(SRD_CONTENT)).toEqual([]);
  });

  it('keeps built-in SRD snapshots deeply immutable', () => {
    const scimitar = contentRegistry.findWeapon(srdId('weapon', 'scimitar'))!;
    expect(Object.isFrozen(scimitar)).toBe(true);
    expect(Object.isFrozen(scimitar.properties)).toBe(true);
    expect(() => { (scimitar as unknown as { name: string }).name = 'Changed'; }).toThrow();
    expect(contentRegistry.findWeapon(scimitar.id)?.name).toBe('Scimitar');
  });

  it('looks up generic equipment and deeply freezes its descriptive data', () => {
    const registry = new ContentRegistry(SRD_CONTENT, [relic]);
    const found = registry.findEquipment(relic.id);

    expect(found).toEqual(relic);
    expect(Object.isFrozen(found)).toBe(true);
    expect(Object.isFrozen(found?.referenceEffects)).toBe(true);
    expect(() => { (found?.referenceEffects as unknown as string[]).push('Changed'); }).toThrow();
  });

  it('accepts the inclusive zero-to-five bounds for weapon and armor item bonuses', () => {
    const entries = [
      extendedWeapon('zero-five-bonuses', 0, 5),
      extendedWeapon('five-zero-bonuses', 5, 0),
      extendedArmor('zero-bonus', 0),
      extendedArmor('five-bonus', 5),
    ];

    expect(validateContentDataset([...SRD_CONTENT, ...entries])).toEqual([]);
  });

  it.each([-1, 1.5, 6])('rejects weapon item bonuses outside the bounded integer range: %s', (invalidBonus) => {
    expect(() => new ContentRegistry(SRD_CONTENT, [extendedWeapon(`bad-attack-${String(invalidBonus).replace('.', '-')}`, invalidBonus, 0)])).toThrow(/item bonus/i);
    expect(() => new ContentRegistry(SRD_CONTENT, [extendedWeapon(`bad-damage-${String(invalidBonus).replace('.', '-')}`, 0, invalidBonus)])).toThrow(/item bonus/i);
  });

  it.each([-1, 1.5, 6])('rejects armor item bonuses outside the bounded integer range: %s', (invalidBonus) => {
    expect(() => new ContentRegistry(SRD_CONTENT, [extendedArmor(`bad-armor-${String(invalidBonus).replace('.', '-')}`, invalidBonus)])).toThrow(/item bonus/i);
  });

  it('rejects unsupported generic equipment categories', () => {
    const invalid = { ...relic, category: 'weapon' } as unknown as EquipmentContent;
    expect(() => new ContentRegistry(SRD_CONTENT, [invalid])).toThrow(/equipment category/i);
  });

  it('rejects negative item costs and weights', () => {
    expect(() => new ContentRegistry(SRD_CONTENT, [{ ...relic, cost: { amount: -1, unit: 'gp' } }])).toThrow(/cost/i);
    expect(() => new ContentRegistry(SRD_CONTENT, [{ ...relic, weightPounds: -0.5 }])).toThrow(/weight/i);
    expect(() => new ContentRegistry(SRD_CONTENT, [{ ...extendedWeapon('negative-cost', 0, 0), cost: { amount: -1, unit: 'gp' } }])).toThrow(/cost/i);
    expect(() => new ContentRegistry(SRD_CONTENT, [{ ...extendedArmor('negative-weight', 0), weightPounds: -1 }])).toThrow(/weight/i);
  });

  it('rejects blank reference-effect rows on equipment, weapons, and armor', () => {
    expect(() => new ContentRegistry(SRD_CONTENT, [{ ...relic, referenceEffects: [' '] }])).toThrow(/reference effect/i);
    expect(() => new ContentRegistry(SRD_CONTENT, [{ ...extendedWeapon('blank-reference', 0, 0), referenceEffects: [''] }])).toThrow(/reference effect/i);
    expect(() => new ContentRegistry(SRD_CONTENT, [{ ...extendedArmor('blank-reference', 0), referenceEffects: ['\t'] }])).toThrow(/reference effect/i);
  });

  it('rejects a Homebrew id that collides with the reserved SRD namespace', () => {
    const badHomebrew = structuredClone(contentRegistry.findWeapon(srdId('weapon', 'scimitar'))!) as unknown as WeaponContent;
    Object.assign(badHomebrew, { source: { type: 'homebrew', namespace: 'test' } });
    expect(() => new ContentRegistry(SRD_CONTENT, [badHomebrew])).toThrow(/Homebrew ids/);
  });

  it('resolves the Fighter through the typed helper', () => {
    expect(contentRegistry.findClass(fighterId)).toEqual(SRD_FIGHTER);
  });

  it('resolves and filters subclasses through typed registry helpers', () => {
    const champion = SRD_SUBCLASSES[0];
    expect(contentRegistry.findSubclass(champion.id)).toEqual(champion);
    expect(contentRegistry.findSubclassesForClass(fighterId)).toEqual([champion]);
    expect(Object.isFrozen(contentRegistry.findSubclass(champion.id))).toBe(true);
    expect(Object.isFrozen(contentRegistry.findSubclass(champion.id)?.progression)).toBe(true);
  });

  it('rejects malformed subclass parent/progression/effect data', () => {
    const champion = structuredClone(SRD_SUBCLASSES[0]) as unknown as SubclassContent;
    expect(() => new ContentRegistry(SRD_CONTENT.filter((entry) => entry.id !== champion.id), [{ ...champion, parentClassId: 'homebrew:missing:class:void' }])).toThrow(/parent class/i);
    expect(() => new ContentRegistry(SRD_CONTENT.filter((entry) => entry.id !== champion.id), [{ ...champion, progression: [{ ...champion.progression[0], level: 4 }, ...champion.progression.slice(1)] }])).toThrow(/progression/i);
    const badEffect = structuredClone(champion) as unknown as SubclassContent;
    (badEffect.progression[0].features[1].effects as unknown as Array<unknown>)[0] = { type: 'skill-check-advantage', skillIds: ['not-a-skill'] };
    expect(() => new ContentRegistry(SRD_CONTENT.filter((entry) => entry.id !== champion.id), [badEffect])).toThrow(/skill-check Advantage/i);
  });

  it('rejects malformed generic Class training and progression capability data', () => {
    const fighter = structuredClone(SRD_FIGHTER) as unknown as ClassContent;
    const withoutFighter = SRD_CONTENT.filter((entry) => entry.id !== fighter.id);
    const badMode = structuredClone(fighter) as ClassContent;
    (badMode.primaryAbility as unknown as { mode: string }).mode = 'mystery';
    expect(() => new ContentRegistry(withoutFighter, [badMode])).toThrow(/primary ability mode/i);

    const badWeaponRule = structuredClone(fighter) as ClassContent;
    (badWeaponRule.weaponProficiencies as unknown as Array<unknown>)[0] = { kind: 'category-with-property', category: 'martial', anyOfProperties: [] };
    expect(() => new ContentRegistry(withoutFighter, [badWeaponRule])).toThrow(/weapon proficiency/i);

    const badResource = structuredClone(fighter) as ClassContent;
    const badMaximum = badResource.resources[0].maximum;
    if (badMaximum.kind !== 'level-table') throw new Error('Fighter resource fixture should use a level-table maximum.');
    (badMaximum.values as unknown as Array<unknown>)[0] = { level: 0, uses: 2 };
    expect(() => new ContentRegistry(withoutFighter, [badResource])).toThrow(/maximum-use progression/i);
  });

  it('rejects duplicate or unresolved subclass resource-consumer grants', () => {
    const life = structuredClone(SRD_SUBCLASSES.find((entry) => entry.name === 'Life Domain')!) as unknown as SubclassContent;
    const withoutLife = SRD_CONTENT.filter((entry) => entry.id !== life.id);
    const preserveLife = life.progression[0].features.find((feature) => feature.name === 'Preserve Life')!;
    const originalGrant = preserveLife.resourceConsumers?.[0];
    if (!originalGrant) throw new Error('Life Domain Preserve Life resource grant missing.');
    (preserveLife.resourceConsumers as unknown as Array<unknown>).push(structuredClone(originalGrant));
    expect(() => new ContentRegistry(withoutLife, [life])).toThrow(/duplicate resource-consumer/i);

    const missingResource = structuredClone(SRD_SUBCLASSES.find((entry) => entry.name === 'Life Domain')!) as unknown as SubclassContent;
    const missingGrant = missingResource.progression[0].features.find((feature) => feature.name === 'Preserve Life')?.resourceConsumers?.[0];
    if (!missingGrant) throw new Error('Life Domain Preserve Life resource grant missing.');
    (missingGrant as unknown as { resourceId: string }).resourceId = 'homebrew:missing:class-resource:void';
    expect(() => new ContentRegistry(SRD_CONTENT.filter((entry) => entry.id !== missingResource.id), [missingResource])).toThrow(/unknown owner resource/i);
  });

  it('rejects malformed SpellContent level, list, component, and scaling data', () => {
    const fireBolt = structuredClone(contentRegistry.findSpell(srdId('spell', 'fire-bolt'))!) as SpellContent;
    const withoutFireBolt = SRD_CONTENT.filter((entry) => entry.id !== fireBolt.id);
    expect(() => new ContentRegistry(withoutFireBolt, [{ ...fireBolt, level: 10 } as unknown as SpellContent])).toThrow(/Spell level/i);
    expect(() => new ContentRegistry(withoutFireBolt, [{ ...fireBolt, spellLists: [] }])).toThrow(/Spell-list/i);
    expect(() => new ContentRegistry(withoutFireBolt, [{ ...fireBolt, components: { verbal: true, somatic: true, material: true } }])).toThrow(/Material spell components/i);
    const badScaling = structuredClone(fireBolt) as SpellContent;
    const damage = badScaling.mechanics.find((mechanic) => mechanic.type === 'damage');
    if (!damage || damage.type !== 'damage') throw new Error('Fire Bolt fixture missing damage.');
    (damage as unknown as { scaling: unknown }).scaling = { kind: 'character-level-dice', values: [{ level: 5, dice: [{ count: 2, die: 10 }] }] };
    expect(() => new ContentRegistry(withoutFireBolt, [badScaling])).toThrow(/scaling/i);
  });

  it('rejects malformed or unresolved subclass Spellcasting provider data', () => {
    const champion = structuredClone(SRD_SUBCLASSES[0]) as unknown as SubclassContent;
    const feature = champion.progression[0].features[0];
    (feature as unknown as { spellcasting: unknown }).spellcasting = [{
      id: 'srd-5.2.1:spellcasting-provider:test', name: 'Invalid Provider',
      spellcastingAbility: { kind: 'fixed', ability: 'wisdom' },
      spellManagement: { kind: 'granted-only', spellIds: ['srd-5.2.1:spell:not-real'] },
      ritualCasting: 'none',
    }];
    expect(() => new ContentRegistry(SRD_CONTENT.filter((entry) => entry.id !== champion.id), [champion])).toThrow(/spell does not resolve/i);
    const empty = structuredClone(champion) as unknown as SubclassContent;
    const emptyProvider = empty.progression[0].features[0].spellcasting?.[0];
    if (!emptyProvider) throw new Error('Provider fixture missing.');
    (emptyProvider.spellManagement as unknown as { spellIds: string[] }).spellIds = [];
    expect(() => new ContentRegistry(SRD_CONTENT.filter((entry) => entry.id !== empty.id), [empty])).toThrow(/granted spell/i);
  });
});
