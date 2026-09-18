import { describe, expect, it } from 'vitest';
import { SRD_BARD, BARD_BARDIC_INSPIRATION_RESOURCE_ID, BARD_SPELLCASTING_PROVIDER_ID } from './bard';
import { SRD_CLASSES, SRD_FEATS, SRD_SPELLS } from './index';
import { PALADIN_CHANNEL_DIVINITY_RESOURCE_ID, PALADIN_LAY_ON_HANDS_RESOURCE_ID, PALADIN_SPELLCASTING_PROVIDER_ID, SRD_PALADIN } from './paladin';
import { RANGER_FAVORED_ENEMY_RESOURCE_ID, RANGER_NATURES_VEIL_RESOURCE_ID, RANGER_SPELLCASTING_PROVIDER_ID, RANGER_TIRELESS_RESOURCE_ID, SRD_RANGER } from './ranger';
import { SRD_COLLEGE_OF_LORE, SRD_HUNTER, SRD_OATH_OF_DEVOTION, SRD_SUBCLASSES } from './subclasses';
import { srdId } from './source';

describe('Milestone 12B SRD class expansion', () => {
  it('preserves the seven M12B Classes and Subclasses without changing spells or Feats', () => {
    expect(SRD_CLASSES.slice(0, 7).map((entry) => entry.name)).toEqual(['Fighter', 'Barbarian', 'Cleric', 'Rogue', 'Bard', 'Paladin', 'Ranger']);
    expect(SRD_SUBCLASSES.slice(0, 7).map((entry) => entry.name)).toEqual(['Champion', 'Path of the Berserker', 'Life Domain', 'Thief', 'College of Lore', 'Oath of Devotion', 'Hunter']);
    expect(new Set(SRD_CLASSES.slice(0, 7).map((entry) => entry.id)).size).toBe(7);
    expect(new Set(SRD_SUBCLASSES.slice(0, 7).map((entry) => entry.id)).size).toBe(7);
    expect(SRD_SPELLS).toHaveLength(339);
    expect(SRD_FEATS).toHaveLength(17);
  });

  it('models Bard Spellcasting, replacement cadence, Bardic Inspiration maximum/recovery, and Lore consumers generically', () => {
    const spellcasting = SRD_BARD.progression[0].features.find((feature) => feature.name === 'Spellcasting')?.spellcasting?.[0];
    expect(spellcasting?.id).toBe(BARD_SPELLCASTING_PROVIDER_ID);
    expect(spellcasting?.spellcastingAbility).toEqual({ kind: 'fixed', ability: 'charisma' });
    expect(spellcasting?.spellManagement).toMatchObject({ kind: 'prepared-from-list', spellListId: 'bard', replacement: 'class-level-one' });
    expect(SRD_BARD.resources.find((resource) => resource.id === BARD_BARDIC_INSPIRATION_RESOURCE_ID)).toMatchObject({
      maximum: { kind: 'ability-modifier', ability: 'charisma', minimum: 1 },
      recovery: [{ trigger: 'long-rest', mode: 'all' }, { trigger: 'short-rest', mode: 'all', minimumLevel: 5 }],
    });
    const loreConsumers = SRD_COLLEGE_OF_LORE.progression.flatMap((row) => row.features).flatMap((feature) => feature.resourceConsumers ?? []);
    expect(loreConsumers.map((grant) => [grant.resourceId, grant.consumer.name])).toEqual([
      [BARD_BARDIC_INSPIRATION_RESOURCE_ID, 'Cutting Words'],
      [BARD_BARDIC_INSPIRATION_RESOURCE_ID, 'Peerless Skill'],
    ]);
  });

  it('models Paladin numeric Lay On Hands, Channel Divinity, long-rest-one preparation, and fixed provider-scoped spells', () => {
    const spellcasting = SRD_PALADIN.progression[0].features.find((feature) => feature.name === 'Spellcasting')?.spellcasting?.[0];
    expect(spellcasting?.id).toBe(PALADIN_SPELLCASTING_PROVIDER_ID);
    expect(spellcasting?.spellManagement).toMatchObject({ kind: 'prepared-from-list', spellListId: 'paladin', replacement: 'long-rest-one' });
    const layOnHands = SRD_PALADIN.resources.find((resource) => resource.id === PALADIN_LAY_ON_HANDS_RESOURCE_ID);
    expect(layOnHands).toMatchObject({ presentation: 'numeric', maximum: { kind: 'level-table' }, recovery: [{ trigger: 'long-rest', mode: 'all' }] });
    if (!layOnHands || layOnHands.maximum.kind !== 'level-table') throw new Error('Lay On Hands resource missing.');
    expect(layOnHands.maximum.values[0]).toEqual({ level: 1, uses: 5 });
    expect(layOnHands.maximum.values[19]).toEqual({ level: 20, uses: 100 });
    expect(SRD_PALADIN.resources.find((resource) => resource.id === PALADIN_CHANNEL_DIVINITY_RESOURCE_ID)).toMatchObject({ maximum: { kind: 'level-table', values: [{ level: 3, uses: 2 }, { level: 11, uses: 3 }] } });
    const oathSpells = SRD_OATH_OF_DEVOTION.progression[0].features.find((feature) => feature.name === 'Oath of Devotion Spells')?.spellGrants;
    expect(oathSpells?.map((grant) => [grant.minimumLevel, grant.providerId, grant.spellIds])).toEqual([
      [3, PALADIN_SPELLCASTING_PROVIDER_ID, [srdId('spell', 'protection-from-evil-and-good'), srdId('spell', 'shield-of-faith')]],
      [5, PALADIN_SPELLCASTING_PROVIDER_ID, [srdId('spell', 'aid'), srdId('spell', 'zone-of-truth')]],
      [9, PALADIN_SPELLCASTING_PROVIDER_ID, [srdId('spell', 'beacon-of-hope'), srdId('spell', 'dispel-magic')]],
      [13, PALADIN_SPELLCASTING_PROVIDER_ID, [srdId('spell', 'freedom-of-movement'), srdId('spell', 'guardian-of-faith')]],
      [17, PALADIN_SPELLCASTING_PROVIDER_ID, [srdId('spell', 'commune'), srdId('spell', 'flame-strike')]],
    ]);
  });

  it('models Ranger Hunter’s Mark bookkeeping, long-rest-one preparation, Wisdom-derived resources, and Hunter progression without target state', () => {
    const spellcasting = SRD_RANGER.progression[0].features.find((feature) => feature.name === 'Spellcasting')?.spellcasting?.[0];
    expect(spellcasting?.id).toBe(RANGER_SPELLCASTING_PROVIDER_ID);
    expect(spellcasting?.spellManagement).toMatchObject({ kind: 'prepared-from-list', spellListId: 'ranger', replacement: 'long-rest-one' });
    const favored = SRD_RANGER.resources.find((resource) => resource.id === RANGER_FAVORED_ENEMY_RESOURCE_ID);
    expect(favored?.maximum).toEqual({ kind: 'level-table', values: [{ level: 1, uses: 2 }, { level: 5, uses: 3 }, { level: 9, uses: 4 }, { level: 13, uses: 5 }, { level: 17, uses: 6 }] });
    expect(SRD_RANGER.resources.find((resource) => resource.id === RANGER_TIRELESS_RESOURCE_ID)?.maximum).toEqual({ kind: 'ability-modifier', ability: 'wisdom', minimum: 1, minimumLevel: 10 });
    expect(SRD_RANGER.resources.find((resource) => resource.id === RANGER_NATURES_VEIL_RESOURCE_ID)?.maximum).toEqual({ kind: 'ability-modifier', ability: 'wisdom', minimum: 1, minimumLevel: 14 });
    const favoredEnemy = SRD_RANGER.progression[0].features.find((feature) => feature.name === 'Favored Enemy');
    expect(favoredEnemy?.spellGrants).toEqual([{ providerId: RANGER_SPELLCASTING_PROVIDER_ID, spellIds: [srdId('spell', 'hunter-s-mark')], status: 'always-prepared' }]);
    expect(SRD_HUNTER.progression.map((row) => [row.level, row.features.map((feature) => feature.name)])).toEqual([
      [3, ['Hunter’s Lore', 'Hunter’s Prey']], [7, ['Defensive Tactics']], [11, ['Superior Hunter’s Prey']], [15, ['Superior Hunter’s Defense']],
    ]);
    expect(SRD_HUNTER.progression.flatMap((row) => row.features).every((feature) => feature.effects.length === 0 && !feature.resourceConsumers?.length && !feature.spellGrants?.length)).toBe(true);
  });
});
