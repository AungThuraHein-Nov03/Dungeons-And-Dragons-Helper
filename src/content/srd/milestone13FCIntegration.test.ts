import { describe, expect, it } from 'vitest';
import { validateContentDataset } from '../../services/contentValidation';
import { M13F_PROMOTED_SPELL_IDS, M13F_SPELL_AUTOMATION_CONTRACT } from './spellAutomationM13F';
import { SRD_SPELLS, SRD_STRUCTURED_SPELLS } from './spells';
import { SRD_REFERENCE_SPELLS } from './spellsReference.generated';
import { srdId } from './source';

const M10_ANCHOR_IDS = [
  srdId('spell', 'fire-bolt'),
  srdId('spell', 'sacred-flame'),
  srdId('spell', 'cure-wounds'),
  srdId('spell', 'guiding-bolt'),
  srdId('spell', 'burning-hands'),
  srdId('spell', 'detect-magic'),
];

function withoutAutomationFields<T extends { mechanics: unknown; referenceEffects: unknown }>(spell: T) {
  const { mechanics: _mechanics, referenceEffects: _referenceEffects, ...metadata } = spell;
  void _mechanics;
  void _referenceEffects;
  return metadata;
}

describe('Milestone 13F-C curated spell automation integration', () => {
  it('promotes exactly the frozen 22 generated spell IDs and no 23rd spell', () => {
    const promotedIds = new Set(M13F_PROMOTED_SPELL_IDS);
    const promotedGenerated = SRD_REFERENCE_SPELLS.filter((source) => {
      const composed = SRD_SPELLS.find((spell) => spell.id === source.id);
      return composed !== undefined && composed.mechanics.length > 0;
    });

    expect(M13F_PROMOTED_SPELL_IDS).toHaveLength(22);
    expect(promotedGenerated.map((spell) => spell.id)).toEqual(M13F_PROMOTED_SPELL_IDS);
    expect(promotedGenerated.every((spell) => promotedIds.has(spell.id))).toBe(true);
    expect(SRD_REFERENCE_SPELLS.filter((spell) => !promotedIds.has(spell.id) && SRD_SPELLS.find((candidate) => candidate.id === spell.id)!.mechanics.length > 0)).toEqual([]);
  });

  it('composes the exact frozen mechanics and reference-only residue onto all 22 promotions', () => {
    for (const contract of M13F_SPELL_AUTOMATION_CONTRACT) {
      const composed = SRD_SPELLS.find((spell) => spell.id === contract.spellId);
      expect(composed).toBeDefined();
      expect(composed?.mechanics).toEqual(contract.mechanics);
      expect(composed?.referenceEffects).toEqual(contract.referenceEffects);
      expect(composed?.referenceEffects).not.toContainEqual(expect.objectContaining({ id: 'reference-only' }));
    }
  });

  it('preserves every authoritative generated metadata field and leaves source records unchanged', () => {
    for (const contract of M13F_SPELL_AUTOMATION_CONTRACT) {
      const source = SRD_REFERENCE_SPELLS.find((spell) => spell.id === contract.spellId);
      const composed = SRD_SPELLS.find((spell) => spell.id === contract.spellId);
      expect(source).toBeDefined();
      expect(composed).toBeDefined();
      expect(withoutAutomationFields(composed!)).toEqual(withoutAutomationFields(source!));
      expect(source?.mechanics).toEqual([]);
      expect(source?.referenceEffects).toEqual([
        expect.objectContaining({ id: 'reference-only', name: 'Reference Only' }),
      ]);
    }
  });

  it('keeps all six M10 anchors intact and Detect Magic non-roll structured/reference-only', () => {
    expect(SRD_STRUCTURED_SPELLS.map((spell) => spell.id)).toEqual(M10_ANCHOR_IDS);
    for (const anchor of SRD_STRUCTURED_SPELLS) {
      expect(SRD_SPELLS.find((spell) => spell.id === anchor.id)).toBe(anchor);
    }

    const detectMagic = SRD_SPELLS.find((spell) => spell.id === srdId('spell', 'detect-magic'));
    expect(detectMagic).toMatchObject({
      concentration: true,
      ritual: true,
      mechanics: [],
    });
    expect(detectMagic?.referenceEffects).toEqual(SRD_STRUCTURED_SPELLS[5].referenceEffects);
  });

  it('accounts for 6 anchors + 22 promotions + 311 unpromoted generated spells = 339', () => {
    const promotedIds = new Set(M13F_PROMOTED_SPELL_IDS);
    const unpromotedGenerated = SRD_REFERENCE_SPELLS.filter((spell) => !promotedIds.has(spell.id));

    expect(SRD_STRUCTURED_SPELLS).toHaveLength(6);
    expect(M13F_SPELL_AUTOMATION_CONTRACT).toHaveLength(22);
    expect(unpromotedGenerated).toHaveLength(311);
    expect(SRD_SPELLS).toHaveLength(339);

    for (const source of unpromotedGenerated) {
      const composed = SRD_SPELLS.find((spell) => spell.id === source.id);
      expect(composed?.mechanics).toEqual([]);
      expect(composed?.referenceEffects).toEqual(source.referenceEffects);
    }
  });

  it('exposes exactly 27 roll-structured spells from explicit content data', () => {
    const rollStructured = SRD_SPELLS.filter((spell) =>
      spell.mechanics.some((mechanic) => mechanic.type === 'spell-attack' || mechanic.type === 'damage' || mechanic.type === 'healing'));

    expect(rollStructured).toHaveLength(27);
    expect(rollStructured.filter((spell) => M13F_PROMOTED_SPELL_IDS.includes(spell.id))).toHaveLength(22);
    expect(rollStructured.filter((spell) => M10_ANCHOR_IDS.includes(spell.id))).toHaveLength(5);
    expect(rollStructured.some((spell) => spell.id === srdId('spell', 'detect-magic'))).toBe(false);
  });

  it('passes the hardened validator for all 339 composed SRD spells', () => {
    expect(validateContentDataset(SRD_SPELLS)).toEqual([]);
  });
});
