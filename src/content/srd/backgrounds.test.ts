import { describe, expect, it } from 'vitest';
import { contentRegistry } from '../../services/contentRegistry';
import { validateContentDataset } from '../../services/contentValidation';
import { SRD_CONTENT } from './index';
import { SRD_BACKGROUNDS } from './backgrounds';
import { srdId } from './source';

const EXPECTED_BACKGROUNDS = ['acolyte', 'criminal', 'sage', 'soldier'] as const;

describe('SRD 5.2.1 Background content', () => {
  it('bundles exactly the four supported Backgrounds under stable SRD ids', () => {
    expect(SRD_BACKGROUNDS).toHaveLength(4);
    expect(SRD_BACKGROUNDS.map((entry) => entry.id)).toEqual(EXPECTED_BACKGROUNDS.map((slug) => srdId('background', slug)));
    expect(new Set(SRD_BACKGROUNDS.map((entry) => entry.id)).size).toBe(4);
  });

  it('registers ability options, skills, tools, Origin Feat references, and equipment metadata', () => {
    expect(validateContentDataset(SRD_CONTENT)).toEqual([]);
    expect(contentRegistry.getAll('background')).toHaveLength(4);
    const soldier = contentRegistry.findBackground(srdId('background', 'soldier'))!;
    expect(soldier.abilityScores).toEqual(['strength', 'dexterity', 'constitution']);
    expect(soldier.skillProficiencies).toEqual(['athletics', 'intimidation']);
    expect(soldier.toolProficiency.kind).toBe('choice');
    expect(soldier.originFeat).toEqual({ id: srdId('feat', 'savage-attacker'), name: 'Savage Attacker' });
    expect(soldier.startingEquipment.map((option) => option.id)).toEqual(['A', 'B']);
  });

  it('resolves each Background Origin Feat through a first-class Feat registry entry', () => {
    for (const background of SRD_BACKGROUNDS) {
      expect(background.originFeat.id).toMatch(/^srd-5\.2\.1:feat:/);
      const feat = contentRegistry.findFeat(background.originFeat.id);
      expect(feat).toBeDefined();
      expect(feat?.category).toBe('origin');
      expect(feat?.name).toBe(background.originFeat.name);
    }
  });
});
