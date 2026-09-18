import { describe, expect, it } from 'vitest';
import { DRUID_SPELLCASTING_PROVIDER_ID, DRUID_WILD_SHAPE_RESOURCE_ID, SRD_DRUID } from './druid';
import { SRD_CLASSES, SRD_FEATS, SRD_SPELLS } from './index';
import { MONK_FOCUS_RESOURCE_ID, MONK_SUPERIOR_DEFENSE_ACTIVE_EFFECT_ID, SRD_MONK } from './monk';
import { SRD_CIRCLE_OF_THE_LAND, SRD_SUBCLASSES, SRD_WARRIOR_OF_THE_OPEN_HAND } from './subclasses';
import { srdId } from './source';

describe('Milestone 12C SRD class expansion', () => {
  it('preserves the nine M12C Classes and Subclasses without changing spells or Feats', () => {
    expect(SRD_CLASSES.slice(0, 9).map((entry) => entry.name)).toEqual([
      'Fighter', 'Barbarian', 'Cleric', 'Rogue', 'Bard', 'Paladin', 'Ranger', 'Druid', 'Monk',
    ]);
    expect(SRD_SUBCLASSES.slice(0, 9).map((entry) => entry.name)).toEqual([
      'Champion', 'Path of the Berserker', 'Life Domain', 'Thief', 'College of Lore', 'Oath of Devotion', 'Hunter', 'Circle of the Land', 'Warrior of the Open Hand',
    ]);
    expect(new Set(SRD_CLASSES.slice(0, 9).map((entry) => entry.id)).size).toBe(9);
    expect(new Set(SRD_SUBCLASSES.slice(0, 9).map((entry) => entry.id)).size).toBe(9);
    expect(SRD_SPELLS).toHaveLength(339);
    expect(SRD_FEATS).toHaveLength(17);
  });

  it('models Druid Spellcasting and bounded Wild Shape bookkeeping without transformation state', () => {
    const spellcasting = SRD_DRUID.progression[0].features.find((feature) => feature.name === 'Spellcasting')?.spellcasting?.[0];
    expect(spellcasting?.id).toBe(DRUID_SPELLCASTING_PROVIDER_ID);
    expect(spellcasting?.spellcastingAbility).toEqual({ kind: 'fixed', ability: 'wisdom' });
    expect(spellcasting?.spellManagement).toMatchObject({ kind: 'prepared-from-list', spellListId: 'druid', replacement: 'long-rest-any' });
    expect(spellcasting?.slotPool?.recovery).toEqual([{ trigger: 'long-rest', mode: 'all' }]);

    expect(SRD_DRUID.resources).toEqual([expect.objectContaining({
      id: DRUID_WILD_SHAPE_RESOURCE_ID,
      maximum: { kind: 'level-table', values: [{ level: 2, uses: 2 }, { level: 6, uses: 3 }, { level: 17, uses: 4 }] },
      recovery: [{ trigger: 'short-rest', mode: 'amount', amount: 1 }, { trigger: 'long-rest', mode: 'all' }],
    })]);

    const druidic = SRD_DRUID.progression[0].features.find((feature) => feature.name === 'Druidic');
    expect(druidic?.spellGrants).toEqual([{ providerId: DRUID_SPELLCASTING_PROVIDER_ID, spellIds: [srdId('spell', 'speak-with-animals')], status: 'always-prepared' }]);
    expect(SRD_DRUID.progression.flatMap((row) => row.features).some((feature) => feature.referenceEffects.some((effect) => /transformation state/i.test(effect.description)))).toBe(true);
  });

  it('keeps Circle of the Land choice-dependent spells reference-only while sharing the parent Wild Shape pool', () => {
    expect(SRD_CIRCLE_OF_THE_LAND.parentClassId).toBe(srdId('class', 'druid'));
    const features = SRD_CIRCLE_OF_THE_LAND.progression.flatMap((row) => row.features);
    const circleSpells = features.find((feature) => feature.name === 'Circle of the Land Spells');
    expect(circleSpells?.spellGrants).toBeUndefined();
    expect(circleSpells?.referenceEffects.some((effect) => /land choice changes on a Long Rest/i.test(effect.description))).toBe(true);
    expect(features.flatMap((feature) => feature.resourceConsumers ?? []).map((grant) => [grant.resourceId, grant.consumer.name])).toEqual([
      [DRUID_WILD_SHAPE_RESOURCE_ID, 'Land’s Aid'],
      [DRUID_WILD_SHAPE_RESOURCE_ID, 'Nature’s Sanctuary'],
    ]);
    expect(features.every((feature) => feature.effects.length === 0)).toBe(true);
  });

  it('models the Monk Focus pool and bounded fixed Focus expenditures through generic resource consumers', () => {
    const focus = SRD_MONK.resources.find((resource) => resource.id === MONK_FOCUS_RESOURCE_ID);
    expect(focus).toMatchObject({
      presentation: 'numeric',
      recovery: [{ trigger: 'short-rest', mode: 'all' }, { trigger: 'long-rest', mode: 'all' }],
    });
    if (!focus || focus.maximum.kind !== 'level-table') throw new Error('Monk Focus resource missing.');
    expect(focus.maximum.values[0]).toEqual({ level: 2, uses: 2 });
    expect(focus.maximum.values.at(-1)).toEqual({ level: 20, uses: 20 });

    const superiorDefense = SRD_MONK.progression[17].features.find((feature) => feature.name === 'Superior Defense');
    expect(superiorDefense?.resourceConsumers).toBeUndefined();
    expect(superiorDefense?.activeSelfEffects).toEqual([expect.objectContaining({
      id: MONK_SUPERIOR_DEFENSE_ACTIVE_EFFECT_ID,
      activationTiming: 'start-of-turn',
      activationCost: { resourceId: MONK_FOCUS_RESOURCE_ID, amount: 3 },
    })]);
    expect(SRD_MONK.progression[0].features.find((feature) => feature.name === 'Unarmored Defense')?.effects).toEqual([
      { type: 'unarmored-armor-class', base: 10, abilities: ['dexterity', 'wisdom'], allowShield: false },
    ]);
  });

  it('keeps Open Hand event/target mechanics reference-only while Quivering Palm reuses the parent Focus pool', () => {
    expect(SRD_WARRIOR_OF_THE_OPEN_HAND.parentClassId).toBe(srdId('class', 'monk'));
    const features = SRD_WARRIOR_OF_THE_OPEN_HAND.progression.flatMap((row) => row.features);
    const wholeness = features.find((feature) => feature.name === 'Wholeness of Body');
    expect(wholeness?.resourceConsumers).toBeUndefined();
    expect(wholeness?.referenceEffects.some((effect) => /subclass-specific and Wisdom-derived/i.test(effect.description))).toBe(true);

    const quiveringPalm = features.find((feature) => feature.name === 'Quivering Palm');
    expect(quiveringPalm?.resourceConsumers).toEqual([expect.objectContaining({
      resourceId: MONK_FOCUS_RESOURCE_ID,
      consumer: expect.objectContaining({ effect: { type: 'fixed-expend', amount: 4 } }),
    })]);
    expect(quiveringPalm?.referenceEffects.some((effect) => /target\/vibration persistence/i.test(effect.description))).toBe(true);
    expect(features.every((feature) => feature.effects.length === 0)).toBe(true);
  });
});
