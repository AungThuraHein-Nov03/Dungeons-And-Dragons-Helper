import { describe, expect, it } from 'vitest';
import { SRD_CLASSES, SRD_FEATS, SRD_SPELLS } from './index';
import { SORCERER_INNATE_SORCERY_RESOURCE_ID, SORCERER_SORCERY_POINTS_RESOURCE_ID, SORCERER_SPELLCASTING_PROVIDER_ID, SRD_SORCERER } from './sorcerer';
import { SRD_DRACONIC_SORCERY, SRD_FIEND_PATRON, SRD_SUBCLASSES } from './subclasses';
import { WARLOCK_CONTACT_PATRON_FREE_CAST_RESOURCE_ID, WARLOCK_SPELLCASTING_PROVIDER_ID, SRD_WARLOCK } from './warlock';
import { srdId } from './source';

describe('Milestone 12D SRD class expansion', () => {
  it('preserves the eleven M12D Classes and Subclasses without changing spells or Feats', () => {
    expect(SRD_CLASSES.slice(0, 11).map((entry) => entry.name)).toEqual([
      'Fighter', 'Barbarian', 'Cleric', 'Rogue', 'Bard', 'Paladin', 'Ranger', 'Druid', 'Monk', 'Sorcerer', 'Warlock',
    ]);
    expect(SRD_SUBCLASSES.slice(0, 11).map((entry) => entry.name)).toEqual([
      'Champion', 'Path of the Berserker', 'Life Domain', 'Thief', 'College of Lore', 'Oath of Devotion', 'Hunter', 'Circle of the Land', 'Warrior of the Open Hand', 'Draconic Sorcery', 'Fiend Patron',
    ]);
    expect(new Set(SRD_CLASSES.slice(0, 11).map((entry) => entry.id)).size).toBe(11);
    expect(new Set(SRD_SUBCLASSES.slice(0, 11).map((entry) => entry.id)).size).toBe(11);
    expect(SRD_SPELLS).toHaveLength(339);
    expect(SRD_FEATS).toHaveLength(17);
  });

  it('models Sorcerer Spellcasting, Innate Sorcery, and Sorcery Points through existing generic vocabulary', () => {
    expect(SRD_SORCERER.progression).toHaveLength(20);
    const spellcasting = SRD_SORCERER.progression[0].features.find((feature) => feature.name === 'Spellcasting')?.spellcasting?.[0];
    expect(spellcasting?.id).toBe(SORCERER_SPELLCASTING_PROVIDER_ID);
    expect(spellcasting?.spellcastingAbility).toEqual({ kind: 'fixed', ability: 'charisma' });
    expect(spellcasting?.spellManagement).toMatchObject({ kind: 'prepared-from-list', spellListId: 'sorcerer', replacement: 'class-level-one' });
    if (!spellcasting || spellcasting.spellManagement.kind !== 'prepared-from-list') throw new Error('Sorcerer prepared provider missing.');
    expect(spellcasting.spellManagement.cantripCount.find((row) => row.level === 1)?.count).toBe(4);
    expect(spellcasting.spellManagement.preparedSpellCount.find((row) => row.level === 10)?.count).toBe(15);
    expect(spellcasting.slotPool?.recovery).toEqual([{ trigger: 'long-rest', mode: 'all' }]);

    expect(SRD_SORCERER.resources.find((resource) => resource.id === SORCERER_INNATE_SORCERY_RESOURCE_ID)).toMatchObject({
      maximum: { kind: 'level-table', values: [{ level: 1, uses: 2 }] },
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    });
    const points = SRD_SORCERER.resources.find((resource) => resource.id === SORCERER_SORCERY_POINTS_RESOURCE_ID);
    expect(points).toMatchObject({ presentation: 'numeric', recovery: [{ trigger: 'long-rest', mode: 'all' }] });
    if (!points || points.maximum.kind !== 'level-table') throw new Error('Sorcery Point resource missing.');
    expect(points.maximum.values[0]).toEqual({ level: 2, uses: 2 });
    expect(points.maximum.values.at(-1)).toEqual({ level: 20, uses: 20 });
    expect(SRD_SORCERER.progression.flatMap((row) => row.features).some((feature) => feature.referenceEffects.some((effect) => /conversion remain reference-only/i.test(effect.description)))).toBe(true);
  });

  it('models Draconic Sorcery static HP/AC derivation and provider-scoped spells while leaving runtime mutation reference-only', () => {
    expect(SRD_DRACONIC_SORCERY.parentClassId).toBe(srdId('class', 'sorcerer'));
    expect(SRD_DRACONIC_SORCERY.progression.map((row) => row.level)).toEqual([3, 6, 14, 18]);
    const resilience = SRD_DRACONIC_SORCERY.progression[0].features.find((feature) => feature.name === 'Draconic Resilience');
    expect(resilience?.effects).toEqual([
      { type: 'hit-point-bonus-per-class-level', amount: 1 },
      { type: 'unarmored-armor-class', base: 10, abilities: ['dexterity', 'charisma'], allowShield: true },
    ]);
    const spells = SRD_DRACONIC_SORCERY.progression[0].features.find((feature) => feature.name === 'Draconic Spells');
    expect(spells?.spellGrants?.map((grant) => [grant.providerId, grant.minimumLevel, grant.spellIds.length])).toEqual([
      [SORCERER_SPELLCASTING_PROVIDER_ID, 3, 4], [SORCERER_SPELLCASTING_PROVIDER_ID, 5, 2], [SORCERER_SPELLCASTING_PROVIDER_ID, 7, 2], [SORCERER_SPELLCASTING_PROVIDER_ID, 9, 2],
    ]);
    expect(SRD_DRACONIC_SORCERY.progression.flatMap((row) => row.features).slice(2).every((feature) => feature.effects.length === 0)).toBe(true);
    expect(SRD_DRACONIC_SORCERY.progression.flatMap((row) => row.features).some((feature) => feature.referenceEffects.some((effect) => /reference-only/i.test(effect.description)))).toBe(true);
  });

  it('models Warlock Pact Magic with one active slot level per class level and generic Short/Long Rest recovery', () => {
    expect(SRD_WARLOCK.progression).toHaveLength(20);
    const pact = SRD_WARLOCK.progression[0].features.find((feature) => feature.name === 'Pact Magic')?.spellcasting?.[0];
    expect(pact?.id).toBe(WARLOCK_SPELLCASTING_PROVIDER_ID);
    expect(pact?.spellManagement).toMatchObject({ kind: 'prepared-from-list', spellListId: 'warlock', replacement: 'class-level-one' });
    expect(pact?.slotPool?.recovery).toEqual([{ trigger: 'short-rest', mode: 'all' }, { trigger: 'long-rest', mode: 'all' }]);
    expect(pact?.slotPool?.progression[0]).toEqual({ level: 1, slots: [{ spellLevel: 1, maximum: 1 }] });
    expect(pact?.slotPool?.progression[4]).toEqual({ level: 5, slots: [{ spellLevel: 3, maximum: 2 }] });
    expect(pact?.slotPool?.progression[10]).toEqual({ level: 11, slots: [{ spellLevel: 5, maximum: 3 }] });
    expect(pact?.slotPool?.progression[16]).toEqual({ level: 17, slots: [{ spellLevel: 5, maximum: 4 }] });
    expect(SRD_WARLOCK.resources).toEqual([expect.objectContaining({
      id: WARLOCK_CONTACT_PATRON_FREE_CAST_RESOURCE_ID,
      maximum: { kind: 'level-table', values: [{ level: 9, uses: 1 }] },
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    })]);
    const contact = SRD_WARLOCK.progression[8].features.find((feature) => feature.name === 'Contact Patron');
    expect(contact?.spellGrants).toEqual([{ providerId: WARLOCK_SPELLCASTING_PROVIDER_ID, spellIds: [srdId('spell', 'contact-other-plane')], status: 'always-prepared' }]);
  });

  it('attaches Fiend Patron spells to the existing Warlock provider and keeps trigger/target mechanics reference-only', () => {
    expect(SRD_FIEND_PATRON.parentClassId).toBe(srdId('class', 'warlock'));
    expect(SRD_FIEND_PATRON.progression.map((row) => row.level)).toEqual([3, 6, 10, 14]);
    const spells = SRD_FIEND_PATRON.progression[0].features.find((feature) => feature.name === 'Fiend Spells');
    expect(spells?.spellGrants?.map((grant) => [grant.providerId, grant.minimumLevel, grant.spellIds.length])).toEqual([
      [WARLOCK_SPELLCASTING_PROVIDER_ID, 3, 4], [WARLOCK_SPELLCASTING_PROVIDER_ID, 5, 2], [WARLOCK_SPELLCASTING_PROVIDER_ID, 7, 2], [WARLOCK_SPELLCASTING_PROVIDER_ID, 9, 2],
    ]);
    const features = SRD_FIEND_PATRON.progression.flatMap((row) => row.features);
    expect(features.filter((feature) => feature.name !== 'Fiend Spells').every((feature) => feature.effects.length === 0 && !feature.resourceConsumers)).toBe(true);
    expect(features.some((feature) => feature.referenceEffects.some((effect) => /death|target|event|reference-only/i.test(effect.description)))).toBe(true);
  });
});
