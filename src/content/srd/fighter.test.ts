import { describe, expect, it } from 'vitest';
import { FIGHTER_ACTION_SURGE_RESOURCE_ID, FIGHTER_SECOND_WIND_RESOURCE_ID, SRD_FIGHTER } from './fighter';

describe('SRD Fighter', () => {
  it('contains the verified core Fighter traits', () => {
    expect(SRD_FIGHTER.hitDie).toBe(10);
    expect(SRD_FIGHTER.fixedHitPointsPerLevel).toBe(6);
    expect(SRD_FIGHTER.primaryAbility).toEqual({ mode: 'one-of', abilities: ['strength', 'dexterity'] });
    expect(SRD_FIGHTER.savingThrowProficiencies).toEqual(['strength', 'constitution']);
    expect(SRD_FIGHTER.weaponProficiencies).toEqual([{ kind: 'category', category: 'simple' }, { kind: 'category', category: 'martial' }]);
    expect(SRD_FIGHTER.skillChoices.choose).toBe(2);
  });

  it('contains ordered progression for levels 1 through 20', () => {
    expect(SRD_FIGHTER.progression.map((row) => row.level)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  });

  it('matches selected verified progression points', () => {
    expect(SRD_FIGHTER.progression[0]).toMatchObject({ level: 1, proficiencyBonus: 2, weaponMasteryChoices: 3 });
    expect(SRD_FIGHTER.progression[1].features.map((feature) => feature.name)).toEqual(['Action Surge', 'Tactical Mind']);
    expect(SRD_FIGHTER.progression[4].features.map((feature) => feature.name)).toEqual(['Extra Attack', 'Tactical Shift']);
    expect(SRD_FIGHTER.progression[8].features.map((feature) => feature.name)).toEqual(['Indomitable (one use)', 'Tactical Master']);
    expect(SRD_FIGHTER.progression[16]).toMatchObject({ level: 17, proficiencyBonus: 6, weaponMasteryChoices: 6 });
    expect(SRD_FIGHTER.progression[19].features.map((feature) => feature.name)).toEqual(['Three Extra Attacks']);
  });

  it('models Second Wind and Action Surge through generic level tables and feature-gated consumers', () => {
    const secondWind = SRD_FIGHTER.resources.find((resource) => resource.id === FIGHTER_SECOND_WIND_RESOURCE_ID)!;
    expect(secondWind.maximum).toEqual({ kind: 'level-table', values: [{ level: 1, uses: 2 }, { level: 4, uses: 3 }, { level: 10, uses: 4 }] });
    expect(secondWind.recovery).toEqual([
      { trigger: 'short-rest', mode: 'amount', amount: 1 },
      { trigger: 'long-rest', mode: 'all' },
    ]);
    const levelOneGrants = SRD_FIGHTER.progression[0].features.flatMap((feature) => feature.resourceConsumers ?? []);
    expect(levelOneGrants.map((grant) => grant.consumer.name)).toContain('Second Wind');
    const levelTwoGrants = SRD_FIGHTER.progression[1].features.flatMap((feature) => feature.resourceConsumers ?? []);
    expect(levelTwoGrants.map((grant) => grant.consumer.name)).toEqual(['Action Surge', 'Tactical Mind']);

    const actionSurge = SRD_FIGHTER.resources.find((resource) => resource.id === FIGHTER_ACTION_SURGE_RESOURCE_ID)!;
    expect(actionSurge.maximum).toEqual({ kind: 'level-table', values: [{ level: 2, uses: 1 }, { level: 17, uses: 2 }] });
    expect(actionSurge.recovery).toEqual([
      { trigger: 'short-rest', mode: 'all' },
      { trigger: 'long-rest', mode: 'all' },
    ]);
  });
});
