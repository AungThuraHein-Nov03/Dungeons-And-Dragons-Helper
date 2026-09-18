import { describe, expect, it } from 'vitest';
import { contentRegistry } from '../../services/contentRegistry';
import { validateContentDataset } from '../../services/contentValidation';
import { SRD_SPECIES } from './species';
import { srdId } from './source';

const EXPECTED_SPECIES = [
  'dragonborn', 'dwarf', 'elf', 'gnome', 'goliath', 'halfling', 'human', 'orc', 'tiefling',
] as const;

describe('SRD 5.2.1 Species content', () => {
  it('bundles exactly the nine supported Species under stable SRD ids', () => {
    expect(SRD_SPECIES).toHaveLength(9);
    expect(SRD_SPECIES.map((entry) => entry.id)).toEqual(EXPECTED_SPECIES.map((slug) => srdId('species', slug)));
    expect(new Set(SRD_SPECIES.map((entry) => entry.id)).size).toBe(9);
  });

  it('registers typed Species data with valid structured choices', () => {
    expect(validateContentDataset(SRD_SPECIES)).toEqual([]);
    expect(contentRegistry.getAll('species')).toHaveLength(9);
    expect(contentRegistry.findSpecies(srdId('species', 'human'))?.size).toEqual({ kind: 'choice', options: ['small', 'medium'] });
    expect(contentRegistry.findSpecies(srdId('species', 'goliath'))?.speedFeet).toBe(35);
    expect(contentRegistry.findSpecies(srdId('species', 'elf'))?.choices.find((choice) => choice.id === 'elven-lineage')?.options.map((option) => option.id)).toEqual(['drow', 'high-elf', 'wood-elf']);
  });

  it('distinguishes M13E structured Species mechanics from still-reference-only behavior', () => {
    const dwarf = contentRegistry.findSpecies(srdId('species', 'dwarf'))!;
    expect(dwarf.traits.find((trait) => trait.id === 'dwarven-toughness')?.support).toBe('structured');
    expect(dwarf.effects).toEqual([{ type: 'hit-point-bonus-per-class-level', amount: 1 }]);
    const dragonborn = contentRegistry.findSpecies(srdId('species', 'dragonborn'))!;
    expect(dragonborn.traits.find((trait) => trait.id === 'breath-weapon')?.support).toBe('reference-only');
  });
});
