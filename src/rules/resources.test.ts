import { describe, expect, it } from 'vitest';
import { BARD_BARDIC_INSPIRATION_RESOURCE_ID, SRD_BARD } from '../content/srd/bard';
import { FIGHTER_ACTION_SURGE_RESOURCE_ID, FIGHTER_SECOND_WIND_RESOURCE_ID, SRD_FIGHTER } from '../content/srd/fighter';
import { RANGER_TIRELESS_RESOURCE_ID, SRD_RANGER } from '../content/srd/ranger';
import type { ClassContent, ResourceConsumerGrant } from '../models/content';
import { deriveClassResources } from './resources';

function fighterGrants(level: number): ResourceConsumerGrant[] {
  return SRD_FIGHTER.progression
    .filter((row) => row.level <= level)
    .flatMap((row) => row.features)
    .flatMap((feature) => feature.resourceConsumers ?? []);
}

describe('class resources', () => {
  it('respects feature availability and progression by level', () => {
    const level1 = deriveClassResources(1, SRD_FIGHTER, fighterGrants(1));
    expect(level1.ok).toBe(true);
    if (!level1.ok) return;
    expect(level1.value).toHaveLength(1);
    expect(level1.value[0]).toMatchObject({ id: FIGHTER_SECOND_WIND_RESOURCE_ID, maximumUses: 2 });
    expect(level1.value[0].consumers.map((consumer) => consumer.name)).toEqual(['Second Wind']);

    const level2 = deriveClassResources(2, SRD_FIGHTER, fighterGrants(2));
    expect(level2.ok).toBe(true);
    if (!level2.ok) return;
    const secondWind = level2.value.find((resource) => resource.id === FIGHTER_SECOND_WIND_RESOURCE_ID)!;
    const actionSurge = level2.value.find((resource) => resource.id === FIGHTER_ACTION_SURGE_RESOURCE_ID)!;
    expect(secondWind.consumers.map((consumer) => consumer.name)).toEqual(['Second Wind', 'Tactical Mind']);
    expect(actionSurge.consumers.map((consumer) => consumer.name)).toEqual(['Action Surge']);
    expect(actionSurge.maximumUses).toBe(1);
  });

  it('derives Fighter 4 and Fighter 17 maximum uses from generic level tables', () => {
    const level4 = deriveClassResources(4, SRD_FIGHTER, fighterGrants(4));
    expect(level4.ok).toBe(true);
    if (!level4.ok) return;
    expect(level4.value.find((resource) => resource.id === FIGHTER_SECOND_WIND_RESOURCE_ID)?.maximumUses).toBe(3);
    expect(level4.value.find((resource) => resource.id === FIGHTER_ACTION_SURGE_RESOURCE_ID)?.maximumUses).toBe(1);

    const level17 = deriveClassResources(17, SRD_FIGHTER, fighterGrants(17));
    expect(level17.ok).toBe(true);
    if (!level17.ok) return;
    expect(level17.value.find((resource) => resource.id === FIGHTER_ACTION_SURGE_RESOURCE_ID)?.maximumUses).toBe(2);
  });

  it('supports a structurally valid Homebrew resource through the same level-table engine', () => {
    const homebrewClass: ClassContent = {
      ...SRD_FIGHTER,
      id: 'homebrew:test:class:warden',
      name: 'Warden',
      source: { type: 'homebrew', namespace: 'test' },
      resources: [{
        id: 'homebrew:test:class-resource:resolve',
        name: 'Resolve',
        source: { type: 'homebrew', namespace: 'test' },
        maximum: { kind: 'level-table', values: [{ level: 1, uses: 1 }, { level: 5, uses: 3 }] },
        recovery: [{ trigger: 'short-rest', mode: 'amount', amount: 1 }, { trigger: 'long-rest', mode: 'all' }],
      }],
    };
    const grants: ResourceConsumerGrant[] = [{
      resourceId: 'homebrew:test:class-resource:resolve',
      consumer: { id: 'homebrew:test:class-feature:resolve', name: 'Resolve', effect: { type: 'expend-only' } },
    }];
    const result = deriveClassResources(5, homebrewClass, grants);
    expect(result).toMatchObject({ ok: true, value: [{ id: 'homebrew:test:class-resource:resolve', maximumUses: 3, consumers: [{ name: 'Resolve' }] }] });
  });

  it('derives ability-modifier maxima, minimum levels, and progressive recovery without class-specific branches', () => {
    const modifiers = { strength: 1, dexterity: 2, constitution: 2, intelligence: 0, wisdom: 3, charisma: 4 } as const;
    const bardGrants = SRD_BARD.progression.slice(0, 5).flatMap((row) => row.features).flatMap((feature) => feature.resourceConsumers ?? []);
    const bard4 = deriveClassResources(4, SRD_BARD, bardGrants, modifiers);
    const bard5 = deriveClassResources(5, SRD_BARD, bardGrants, modifiers);
    expect(bard4).toMatchObject({ ok: true, value: [{ id: BARD_BARDIC_INSPIRATION_RESOURCE_ID, maximumUses: 4, recovery: [{ trigger: 'long-rest', mode: 'all' }] }] });
    expect(bard5).toMatchObject({ ok: true, value: [{ id: BARD_BARDIC_INSPIRATION_RESOURCE_ID, maximumUses: 4, recovery: [{ trigger: 'long-rest', mode: 'all' }, { trigger: 'short-rest', mode: 'all', minimumLevel: 5 }] }] });

    const ranger9 = deriveClassResources(9, SRD_RANGER, [], modifiers);
    const ranger10 = deriveClassResources(10, SRD_RANGER, [], modifiers);
    expect(ranger9.ok && ranger9.value.some((resource) => resource.id === RANGER_TIRELESS_RESOURCE_ID)).toBe(false);
    expect(ranger10.ok && ranger10.value.find((resource) => resource.id === RANGER_TIRELESS_RESOURCE_ID)?.maximumUses).toBe(3);
  });
});
