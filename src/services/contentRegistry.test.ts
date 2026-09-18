import { describe, expect, it } from 'vitest';
import { SRD_CONTENT, SRD_FIGHTER, SRD_SUBCLASSES, srdId } from '../content/srd';
import type { ClassContent, SpellContent, SubclassContent, WeaponContent } from '../models/content';
import { ContentRegistry, contentRegistry } from './contentRegistry';
import { validateContentDataset } from './contentValidation';

const fighterId = srdId('class', 'fighter');

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
