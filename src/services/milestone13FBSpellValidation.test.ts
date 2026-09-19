import { describe, expect, it } from 'vitest';
import { M13F_SPELL_AUTOMATION_CONTRACT } from '../content/srd/spellAutomationM13F';
import { SRD_STRUCTURED_SPELLS } from '../content/srd/spells';
import { SRD_REFERENCE_SPELLS } from '../content/srd/spellsReference.generated';
import type { SpellContent, SpellMechanic } from '../models/content';
import { validateContentDataset } from './contentValidation';

const HOME_SOURCE = { type: 'homebrew', namespace: 'm13f-b' } as const;
let nextSpell = 0;

function syntheticSpell(mechanics: readonly unknown[], level: 0 | 1 | 2 | 3 = 1): SpellContent {
  nextSpell += 1;
  return {
    id: `homebrew:m13f-b:spell:validator-${nextSpell}`,
    kind: 'spell',
    name: `Validator Spell ${nextSpell}`,
    source: HOME_SOURCE,
    level,
    school: 'evocation',
    castingTime: 'Action',
    range: '60 feet',
    components: { verbal: true, somatic: true, material: false },
    duration: 'Instantaneous',
    concentration: false,
    ritual: false,
    description: 'Synthetic M13F-B validation fixture.',
    spellLists: [{ id: 'validator', name: 'Validator' }],
    mechanics: mechanics as readonly SpellMechanic[],
    referenceEffects: [],
  };
}

function issuesFor(mechanics: readonly unknown[], level: 0 | 1 | 2 | 3 = 1) {
  return validateContentDataset([syntheticSpell(mechanics, level)]);
}

function expectIssue(mechanics: readonly unknown[], code: string, level: 0 | 1 | 2 | 3 = 1) {
  expect(issuesFor(mechanics, level)).toContainEqual(expect.objectContaining({ code }));
}

const D6_DAMAGE = { type: 'damage', amount: { dice: [{ count: 1, die: 6 }], modifier: 'none' }, damageType: 'fire' } as const;
const D8_HEALING = { type: 'healing', amount: { dice: [{ count: 1, die: 8 }], modifier: 'spellcasting-ability' } } as const;

describe('Milestone 13F-B hardened SpellMechanic validation', () => {
  it('accepts each existing mechanic kind and unrelated Homebrew combinations without SRD name/id branches', () => {
    expect(issuesFor([{ type: 'spell-attack', attackType: 'ranged' }], 0)).toEqual([]);
    expect(issuesFor([{ type: 'saving-throw', ability: 'wisdom', onSuccess: 'none' }], 0)).toEqual([]);
    expect(issuesFor([{
      ...D6_DAMAGE,
      scaling: { kind: 'slot-level-dice', baseSpellLevel: 1, dicePerLevel: [{ count: 1, die: 6 }] },
    }], 1)).toEqual([]);
    expect(issuesFor([{
      ...D8_HEALING,
      scaling: { kind: 'character-level-dice', values: [{ level: 1, dice: [{ count: 1, die: 8 }] }, { level: 11, dice: [{ count: 3, die: 8 }] }] },
    }], 0)).toEqual([]);
    expect(issuesFor([
      { type: 'spell-attack', attackType: 'melee' },
      { type: 'saving-throw', ability: 'charisma', onSuccess: 'half' },
      D6_DAMAGE,
      D8_HEALING,
    ], 1)).toEqual([]);
  });

  it('keeps all six existing M10 structured anchors valid', () => {
    expect(SRD_STRUCTURED_SPELLS).toHaveLength(6);
    expect(validateContentDataset(SRD_STRUCTURED_SPELLS)).toEqual([]);
  });

  it('validates all 22 frozen M13F-A contracts before runtime integration', () => {
    const promoted = M13F_SPELL_AUTOMATION_CONTRACT.map((contract) => {
      const source = SRD_REFERENCE_SPELLS.find((spell) => spell.id === contract.spellId);
      if (!source) throw new Error(`Missing generated source spell: ${contract.spellId}`);
      return { ...source, mechanics: contract.mechanics, referenceEffects: contract.referenceEffects } satisfies SpellContent;
    });

    expect(promoted).toHaveLength(22);
    expect(validateContentDataset(promoted)).toEqual([]);
  });

  it('rejects unsupported mechanic kinds, non-object mechanics, and executable metadata', () => {
    expectIssue([{ type: 'teleport', distance: 30 }], 'spell-mechanic');
    expectIssue([null], 'spell-mechanic');
    expectIssue([{
      type: 'damage',
      amount: { dice: [{ count: 1, die: 6 }], modifier: 'none' },
      damageType: 'fire',
      runtime: () => 6,
    }], 'spell-mechanic-executable');
    expectIssue([{
      type: 'damage',
      amount: { dice: [{ count: 1, die: 6 }], modifier: 'none' },
      damageType: 'fire',
      scaling: { kind: 'slot-level-dice', baseSpellLevel: 1, dicePerLevel: [{ count: 1, die: 6, resolver: () => 1 }] },
    }], 'spell-mechanic-executable');
  });

  it('rejects malformed spell-attack mechanics including invalid attack types and unexpected fields', () => {
    for (const mechanic of [
      { type: 'spell-attack', attackType: 'touch' },
      { type: 'spell-attack' },
      { type: 'spell-attack', attackType: 'ranged', bonus: 2 },
    ]) expectIssue([mechanic], 'spell-mechanic');
  });

  it('rejects malformed saving-throw mechanics including invalid ability, success behavior, and unexpected fields', () => {
    for (const mechanic of [
      { type: 'saving-throw', ability: 'luck', onSuccess: 'half' },
      { type: 'saving-throw', ability: 'dexterity', onSuccess: 'quarter' },
      { type: 'saving-throw', ability: 'dexterity' },
      { type: 'saving-throw', ability: 'dexterity', onSuccess: 'none', dc: 15 },
    ]) expectIssue([mechanic], 'spell-mechanic');
  });

  it('rejects malformed damage amounts, damage types, dice terms, and unexpected fields', () => {
    for (const mechanic of [
      { ...D6_DAMAGE, amount: { dice: [{ count: 1, die: 6 }], modifier: 'ability' } },
      { ...D6_DAMAGE, amount: { dice: [{ count: 1, die: 20 }], modifier: 'none' } },
      { ...D6_DAMAGE, amount: { dice: [{ count: 0, die: 6 }], modifier: 'none' } },
      { ...D6_DAMAGE, amount: { dice: [{ count: 1, die: 6, explode: true }], modifier: 'none' } },
      { ...D6_DAMAGE, amount: { dice: [{ count: 1, die: 6 }], modifier: 'none', flat: 4 } },
      { ...D6_DAMAGE, damageType: 'holy' },
      { ...D6_DAMAGE, target: 'enemy' },
    ]) expectIssue([mechanic], 'spell-mechanic');
  });

  it('rejects malformed healing amounts, unsupported dice, and unexpected fields', () => {
    for (const mechanic of [
      { ...D8_HEALING, amount: { dice: [{ count: 1, die: 8 }], modifier: 'wisdom' } },
      { ...D8_HEALING, amount: { dice: [{ count: 1, die: 20 }], modifier: 'spellcasting-ability' } },
      { ...D8_HEALING, amount: { dice: [], modifier: 'spellcasting-ability' } },
      { ...D8_HEALING, amount: { dice: [{ count: 1, die: 8 }], modifier: 'spellcasting-ability', maximum: 10 } },
      { ...D8_HEALING, target: 'ally' },
    ]) expectIssue([mechanic], 'spell-mechanic');
  });

  it('rejects malformed character-level scaling shapes and values', () => {
    const base = { ...D6_DAMAGE };
    for (const scaling of [
      { kind: 'character-level-dice' },
      { kind: 'character-level-dice', values: [] },
      { kind: 'character-level-dice', values: [{ level: 5, dice: [{ count: 2, die: 6 }] }] },
      { kind: 'character-level-dice', values: [{ level: 1, dice: [{ count: 1, die: 6 }] }, { level: 1, dice: [{ count: 2, die: 6 }] }] },
      { kind: 'character-level-dice', values: [{ level: 1, dice: [{ count: 1, die: 20 }] }] },
      { kind: 'character-level-dice', values: [{ level: 1, dice: [{ count: 1, die: 6 }], note: 'extra' }] },
      { kind: 'character-level-dice', values: [{ level: 1, dice: [{ count: 1, die: 6 }] }], baseSpellLevel: 0 },
    ]) expectIssue([{ ...base, scaling }], 'spell-scaling', 0);

    expectIssue([{
      ...base,
      scaling: { kind: 'character-level-dice', values: [{ level: 1, dice: [{ count: 1, die: 6 }] }] },
    }], 'spell-scaling', 1);
  });

  it('rejects malformed slot-level scaling shapes, values, and incompatible spell levels', () => {
    const base = { ...D6_DAMAGE };
    for (const scaling of [
      { kind: 'slot-level-dice', baseSpellLevel: 1 },
      { kind: 'slot-level-dice', baseSpellLevel: 0, dicePerLevel: [{ count: 1, die: 6 }] },
      { kind: 'slot-level-dice', baseSpellLevel: 2, dicePerLevel: [{ count: 1, die: 6 }] },
      { kind: 'slot-level-dice', baseSpellLevel: 1, dicePerLevel: [{ count: 1, die: 20 }] },
      { kind: 'slot-level-dice', baseSpellLevel: 1, dicePerLevel: [{ count: 1, die: 6 }], values: [] },
      { kind: 'mystery-scaling', baseSpellLevel: 1, dicePerLevel: [{ count: 1, die: 6 }] },
    ]) expectIssue([{ ...base, scaling }], 'spell-scaling', 1);

    expectIssue([{
      ...base,
      scaling: { kind: 'slot-level-dice', baseSpellLevel: 1, dicePerLevel: [{ count: 1, die: 6 }] },
    }], 'spell-scaling', 0);
  });

  it('rejects duplicate mechanic kinds that current find/boolean resolution cannot distinguish', () => {
    expectIssue([D6_DAMAGE, { ...D6_DAMAGE, damageType: 'cold' }], 'spell-mechanic-combination');
    expectIssue([D8_HEALING, { ...D8_HEALING }], 'spell-mechanic-combination');
    expectIssue([
      { type: 'saving-throw', ability: 'dexterity', onSuccess: 'half' },
      { type: 'saving-throw', ability: 'constitution', onSuccess: 'none' },
    ], 'spell-mechanic-combination');
    expectIssue([
      { type: 'spell-attack', attackType: 'melee' },
      { type: 'spell-attack', attackType: 'ranged' },
    ], 'spell-mechanic-combination');
  });
});
