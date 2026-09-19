import { describe, expect, it } from 'vitest';
import { contentRegistry } from '../../services/contentRegistry';
import { validateContentDataset } from '../../services/contentValidation';
import { SRD_CONTENT } from './index';
import { M13F_PROMOTED_SPELL_IDS } from './spellAutomationM13F';
import { SRD_5_2_1_SPELL_MANIFEST } from './spellManifest';
import { SRD_SPELLS, SRD_STRUCTURED_SPELLS } from './spells';
import { srdId } from './source';

const ANCHOR_SLUGS = ['fire-bolt', 'sacred-flame', 'cure-wounds', 'guiding-bolt', 'burning-hands', 'detect-magic'] as const;
const SCHOOLS = new Set(['abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion', 'necromancy', 'transmutation']);
const CLASS_LISTS = new Set(['bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard']);

function manifestPairs() {
  return SRD_5_2_1_SPELL_MANIFEST.map(({ slug, name }) => [srdId('spell', slug), name] as const).sort((a, b) => a[0].localeCompare(b[0]));
}

describe('Milestone 12A SRD 5.2.1 spell catalog', () => {
  it('bundles exactly the locked 339-spell authoritative manifest under stable unique IDs', () => {
    expect(SRD_5_2_1_SPELL_MANIFEST).toHaveLength(339);
    expect(SRD_SPELLS).toHaveLength(339);
    expect(contentRegistry.getAll('spell')).toHaveLength(339);
    expect(new Set(SRD_SPELLS.map((spell) => spell.id)).size).toBe(339);
    expect(new Set(SRD_SPELLS.map((spell) => spell.name)).size).toBe(339);
    expect(SRD_SPELLS.map((spell) => [spell.id, spell.name] as const).sort((a, b) => a[0].localeCompare(b[0]))).toEqual(manifestPairs());
    expect(SRD_SPELLS.every((spell) => spell.source.type === 'srd' && spell.source.ruleset === '5.2.1')).toBe(true);
  });

  it('validates complete static spell metadata, components, flags, and authoritative class-list identifiers', () => {
    for (const spell of SRD_SPELLS) {
      expect(spell.level).toBeGreaterThanOrEqual(0);
      expect(spell.level).toBeLessThanOrEqual(9);
      expect(SCHOOLS.has(spell.school)).toBe(true);
      expect(spell.castingTime.trim()).not.toBe('');
      expect(spell.range.trim()).not.toBe('');
      expect(spell.duration.trim()).not.toBe('');
      expect(typeof spell.concentration).toBe('boolean');
      expect(typeof spell.ritual).toBe('boolean');
      expect(spell.description.trim()).not.toBe('');
      expect(spell.spellLists.length).toBeGreaterThan(0);
      expect(new Set(spell.spellLists.map((list) => list.id)).size).toBe(spell.spellLists.length);
      expect(spell.spellLists.every((list) => CLASS_LISTS.has(list.id))).toBe(true);
      expect(spell.components.material ? ('materialText' in spell.components && Boolean(spell.components.materialText?.trim())) : !('materialText' in spell.components)).toBe(true);
      expect(spell.concentration).toBe(/^Concentration\b/i.test(spell.duration));
      expect(spell.ritual).toBe(/\bRitual\b/i.test(spell.castingTime));
    }
    expect(validateContentDataset(SRD_CONTENT)).toEqual([]);
  });

  it('preserves the six M10 structured regression anchors without weakening their mechanics', () => {
    expect(SRD_STRUCTURED_SPELLS.map((spell) => spell.id)).toEqual(ANCHOR_SLUGS.map((slug) => srdId('spell', slug)));
    const fireBolt = contentRegistry.findSpell(srdId('spell', 'fire-bolt'))!;
    expect(fireBolt.mechanics).toEqual([
      { type: 'spell-attack', attackType: 'ranged' },
      { type: 'damage', amount: { dice: [{ count: 1, die: 10 }], modifier: 'none' }, damageType: 'fire', scaling: { kind: 'character-level-dice', values: [
        { level: 1, dice: [{ count: 1, die: 10 }] }, { level: 5, dice: [{ count: 2, die: 10 }] }, { level: 11, dice: [{ count: 3, die: 10 }] }, { level: 17, dice: [{ count: 4, die: 10 }] },
      ] } },
    ]);
    const cure = contentRegistry.findSpell(srdId('spell', 'cure-wounds'))!;
    expect(cure.mechanics).toEqual([{ type: 'healing', amount: { dice: [{ count: 2, die: 8 }], modifier: 'spellcasting-ability' }, scaling: { kind: 'slot-level-dice', baseSpellLevel: 1, dicePerLevel: [{ count: 2, die: 8 }] } }]);
    const burning = contentRegistry.findSpell(srdId('spell', 'burning-hands'))!;
    expect(burning.mechanics[0]).toEqual({ type: 'saving-throw', ability: 'dexterity', onSuccess: 'half' });
    expect(contentRegistry.findSpell(srdId('spell', 'detect-magic'))).toMatchObject({ ritual: true, concentration: true, mechanics: [] });
  });

  it('keeps exactly 311 generated spells reference-only after the bounded M13F promotion', () => {
    const anchors = new Set(ANCHOR_SLUGS.map((slug) => srdId('spell', slug)));
    const promoted = new Set(M13F_PROMOTED_SPELL_IDS);
    const generated = SRD_SPELLS.filter((spell) => !anchors.has(spell.id));
    const remainingReferenceOnly = generated.filter((spell) => !promoted.has(spell.id));
    expect(generated).toHaveLength(333);
    expect(promoted.size).toBe(22);
    expect(remainingReferenceOnly).toHaveLength(311);
    expect(remainingReferenceOnly.every((spell) => spell.mechanics.length === 0)).toBe(true);
    expect(remainingReferenceOnly.every((spell) => spell.referenceEffects.some((effect) => effect.id === 'reference-only'))).toBe(true);
    expect(contentRegistry.findSpell(srdId('spell', 'acid-arrow'))?.description).toMatch(/acid/i);
    expect(contentRegistry.findSpell(srdId('spell', 'wish'))?.mechanics).toEqual([]);
  });

  it('resolves every authoritative spell through the registry', () => {
    for (const { slug, name } of SRD_5_2_1_SPELL_MANIFEST) expect(contentRegistry.findSpell(srdId('spell', slug))?.name).toBe(name);
  });
});
