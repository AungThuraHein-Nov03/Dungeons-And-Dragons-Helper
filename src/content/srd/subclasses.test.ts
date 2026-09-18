import { describe, expect, it } from 'vitest';
import { SRD_BERSERKER, SRD_CHAMPION, SRD_LIFE_DOMAIN, SRD_SUBCLASSES, SRD_THIEF } from './subclasses';
import { srdId } from './source';

describe('SRD 5.2.1 bundled subclasses', () => {
  it('preserves the four approved M11 subclasses with stable parents inside the expanded set', () => {
    expect(SRD_SUBCLASSES.slice(0, 4).map((entry) => entry.name)).toEqual(['Champion', 'Path of the Berserker', 'Life Domain', 'Thief']);
    expect(SRD_SUBCLASSES.slice(0, 4).map((entry) => entry.id)).toEqual([
      srdId('subclass', 'fighter:champion'),
      srdId('subclass', 'barbarian:path-of-the-berserker'),
      srdId('subclass', 'cleric:life-domain'),
      srdId('subclass', 'rogue:thief'),
    ]);
    expect(SRD_SUBCLASSES.slice(0, 4).map((entry) => entry.parentClassId)).toEqual([
      srdId('class', 'fighter'), srdId('class', 'barbarian'), srdId('class', 'cleric'), srdId('class', 'rogue'),
    ]);
    expect(SRD_SUBCLASSES.every((entry) => entry.acquisitionLevel === 3)).toBe(true);
  });

  it('preserves the Champion progression and its bounded automated mechanics', () => {
    expect(SRD_CHAMPION.progression.map((row) => [row.level, row.features.map((feature) => feature.name)])).toEqual([
      [3, ['Improved Critical', 'Remarkable Athlete']], [7, ['Additional Fighting Style']], [10, ['Heroic Warrior']], [15, ['Superior Critical']], [18, ['Survivor']],
    ]);
    const improved = SRD_CHAMPION.progression[0].features[0];
    const remarkable = SRD_CHAMPION.progression[0].features[1];
    const superior = SRD_CHAMPION.progression.find((row) => row.level === 15)!.features[0];
    expect(improved.effects).toEqual([{ type: 'critical-threshold', attackKind: 'weapon', minimumNatural: 19 }]);
    expect(remarkable.effects).toEqual([{ type: 'skill-check-advantage', skillIds: ['athletics'] }, { type: 'initiative-roll-mode', mode: 'advantage' }]);
    expect(superior.effects).toEqual([{ type: 'critical-threshold', attackKind: 'weapon', minimumNatural: 18 }]);
    expect(SRD_CHAMPION.progression.flatMap((row) => row.features).filter((feature) => feature.effects.length > 0)).toEqual([improved, remarkable, superior]);
  });

  it('uses the authoritative subclass feature levels for the three M11 additions', () => {
    expect(SRD_BERSERKER.progression.map((row) => row.level)).toEqual([3, 6, 10, 14]);
    expect(SRD_LIFE_DOMAIN.progression.map((row) => row.level)).toEqual([3, 6, 17]);
    expect(SRD_THIEF.progression.map((row) => row.level)).toEqual([3, 9, 13, 17]);
  });

  it('grants Preserve Life as a generic gated consumer of the Cleric Channel Divinity resource', () => {
    const preserveLife = SRD_LIFE_DOMAIN.progression[0].features.find((feature) => feature.name === 'Preserve Life');
    expect(preserveLife?.resourceConsumers?.[0]).toMatchObject({
      resourceId: srdId('class-resource', 'cleric:channel-divinity'),
      consumer: { name: 'Preserve Life', effect: { type: 'tracking-only' } },
    });
  });
});
