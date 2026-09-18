import { describe, expect, it } from 'vitest';
import { contentRegistry } from '../../services/contentRegistry';
import { validateContentDataset } from '../../services/contentValidation';
import { SRD_CONTENT, SRD_FEATS, srdId } from './index';

const EXPECTED_FEAT_SLUGS = [
  'alert',
  'magic-initiate',
  'savage-attacker',
  'skilled',
  'ability-score-improvement',
  'grappler',
  'archery',
  'defense',
  'great-weapon-fighting',
  'two-weapon-fighting',
  'boon-of-combat-prowess',
  'boon-of-dimensional-travel',
  'boon-of-fate',
  'boon-of-irresistible-offense',
  'boon-of-spell-recall',
  'boon-of-the-night-spirit',
  'boon-of-truesight',
] as const;

describe('SRD 5.2.1 Feat content', () => {
  it('bundles exactly the 17 verified SRD Feats under stable IDs', () => {
    expect(SRD_FEATS).toHaveLength(17);
    expect(SRD_FEATS.map((feat) => feat.id)).toEqual(EXPECTED_FEAT_SLUGS.map((slug) => srdId('feat', slug)));
    expect(new Set(SRD_FEATS.map((feat) => feat.id)).size).toBe(17);
    expect(contentRegistry.getAll('feat')).toHaveLength(17);
  });

  it('contains only SRD 5.2.1 Feats and does not invent Tough', () => {
    expect(SRD_FEATS.every((feat) => feat.source.type === 'srd' && feat.source.ruleset === '5.2.1')).toBe(true);
    expect(SRD_FEATS.some((feat) => feat.name === 'Tough')).toBe(false);
    expect(contentRegistry.findFeat(srdId('feat', 'tough'))).toBeUndefined();
  });

  it('registers the four bounded feat categories and validates the complete dataset', () => {
    expect(validateContentDataset(SRD_CONTENT)).toEqual([]);
    expect(new Set(SRD_FEATS.map((feat) => feat.category))).toEqual(new Set(['origin', 'general', 'fighting-style', 'epic-boon']));
    expect(contentRegistry.findFeat(srdId('feat', 'archery'))?.effects).toEqual([{ type: 'attack-roll-bonus', weaponMode: 'ranged', amount: 2 }]);
    expect(contentRegistry.findFeat(srdId('feat', 'defense'))?.effects).toEqual([{ type: 'armor-class-bonus', armorCategories: ['light', 'medium', 'heavy'], amount: 1 }]);
  });

  it('keeps unsupported feat mechanics explicitly reference-only', () => {
    const alert = contentRegistry.findFeat(srdId('feat', 'alert'))!;
    const savageAttacker = contentRegistry.findFeat(srdId('feat', 'savage-attacker'))!;
    const magicInitiate = contentRegistry.findFeat(srdId('feat', 'magic-initiate'))!;
    expect(alert.effects).toEqual([{ type: 'initiative-proficiency' }]);
    expect(alert.referenceEffects.map((effect) => effect.id)).toEqual(['initiative-swap']);
    expect(savageAttacker.effects).toEqual([]);
    expect(savageAttacker.referenceEffects.map((effect) => effect.id)).toContain('damage-reroll');
    expect(magicInitiate.effects).toEqual([]);
    expect(magicInitiate.choices.every((choice) => choice.support === 'reference-only')).toBe(true);
  });
});
