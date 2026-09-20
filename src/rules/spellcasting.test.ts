import { describe, expect, it } from 'vitest';
import { srdId } from '../content/srd';
import type { SpellcastingProviderDefinition } from '../models/content';
import { contentRegistry } from '../services/contentRegistry';
import { finishLongRest, initializePlayState, reconcilePlayState, expendResource } from './playState';
import { deriveSpellRollAmount, deriveSpellcastingProviders, type SpellcastingProviderGrant, type SpellcastingSpellGrant } from './spellcasting';
import type { DerivedAbilityModifiers } from './types';

const MODIFIERS: DerivedAbilityModifiers = { strength: 2, dexterity: 4, constitution: 2, intelligence: 0, wisdom: 3, charisma: 1 };
const SOURCE = { type: 'homebrew', namespace: 'test' } as const;

function provider(id: string, ability: 'intelligence' | 'wisdom' | 'charisma' = 'wisdom'): SpellcastingProviderDefinition {
  return {
    id: `homebrew:test:spellcasting-provider:${id}`,
    name: `${id} Casting`,
    spellcastingAbility: { kind: 'fixed', ability },
    multiclassSlotContribution: { kind: 'independent' },
    spellManagement: { kind: 'granted-only', spellIds: [srdId('spell', 'fire-bolt'), srdId('spell', 'cure-wounds')] },
    slotPool: {
      id: `homebrew:test:spell-slot-pool:${id}`,
      name: `${id} Slots`,
      slotLevels: [
        { spellLevel: 1, resourceId: `homebrew:test:spell-slot:${id}:1`, name: 'Level 1 Spell Slots' },
        { spellLevel: 2, resourceId: `homebrew:test:spell-slot:${id}:2`, name: 'Level 2 Spell Slots' },
      ],
      progression: [
        { level: 1, slots: [{ spellLevel: 1, maximum: 2 }, { spellLevel: 2, maximum: 0 }] },
        { level: 5, slots: [{ spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 2 }] },
      ],
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
    ritualCasting: 'none',
  };
}

function grant(definition: SpellcastingProviderDefinition): SpellcastingProviderGrant {
  return { definition, source: SOURCE, grantedBy: { contentId: 'homebrew:test:subclass-feature:arcane-gift', contentName: 'Arcane Gift' } };
}

describe('generic Spellcasting provider derivation', () => {
  it('derives provider-specific save DC and spell attack modifier without assuming Intelligence', () => {
    const wisdom = deriveSpellcastingProviders([grant(provider('wisdom', 'wisdom'))], 5, MODIFIERS, 3, contentRegistry);
    expect(wisdom).toMatchObject({ ok: true, value: { providers: [{ ability: 'wisdom', abilityModifier: 3, saveDc: 14, attackModifier: 6 }] } });

    const charisma = deriveSpellcastingProviders([grant(provider('charisma', 'charisma'))], 5, MODIFIERS, 3, contentRegistry);
    expect(charisma).toMatchObject({ ok: true, value: { providers: [{ ability: 'charisma', abilityModifier: 1, saveDc: 12, attackModifier: 4 }] } });
  });

  it('derives provider-owned spell slot resources from progression', () => {
    const result = deriveSpellcastingProviders([grant(provider('arcane'))], 5, MODIFIERS, 3, contentRegistry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.providers[0].slotPool?.slots).toEqual([
      { spellLevel: 1, resourceId: 'homebrew:test:spell-slot:arcane:1', name: 'Level 1 Spell Slots', maximumUses: 4 },
      { spellLevel: 2, resourceId: 'homebrew:test:spell-slot:arcane:2', name: 'Level 2 Spell Slots', maximumUses: 2 },
    ]);
    expect(result.value.resources.map((resource) => [resource.id, resource.maximumUses])).toEqual([
      ['homebrew:test:spell-slot:arcane:1', 4],
      ['homebrew:test:spell-slot:arcane:2', 2],
    ]);
  });

  it('preserves the same spell as separate casting contexts for multiple providers', () => {
    const result = deriveSpellcastingProviders([grant(provider('sage', 'wisdom')), grant(provider('innate', 'charisma'))], 5, MODIFIERS, 3, contentRegistry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.providers).toHaveLength(2);
    expect(result.value.providers.map((entry) => ({ id: entry.id, ability: entry.ability, fireBolt: entry.spells[0].id }))).toEqual([
      { id: 'homebrew:test:spellcasting-provider:sage', ability: 'wisdom', fireBolt: srdId('spell', 'fire-bolt') },
      { id: 'homebrew:test:spellcasting-provider:innate', ability: 'charisma', fireBolt: srdId('spell', 'fire-bolt') },
    ]);
  });

  it('reuses generic play-state resources for expenditure, long-rest restoration, and newly introduced pools', () => {
    const level1 = deriveSpellcastingProviders([grant(provider('arcane'))], 1, MODIFIERS, 2, contentRegistry);
    const level5 = deriveSpellcastingProviders([grant(provider('arcane'))], 5, MODIFIERS, 3, contentRegistry);
    if (!level1.ok || !level5.ok) throw new Error('fixture derivation failed');
    const baseContext = { health: { maximumHp: 20, hitDice: [{ die: 10 as const, maximum: 5 }] }, resources: level1.value.resources };
    const nextContext = { ...baseContext, resources: level5.value.resources };
    const initial = initializePlayState(baseContext);
    const spent = expendResource(initial, 'homebrew:test:spell-slot:arcane:1', baseContext.resources);
    expect(spent).toMatchObject({ ok: true, value: { resourceUses: { 'homebrew:test:spell-slot:arcane:1': 1 } } });
    if (!spent.ok) return;
    const reconciled = reconcilePlayState(spent.value, baseContext, nextContext);
    expect(reconciled.resourceUses).toEqual({ 'homebrew:test:spell-slot:arcane:1': 1, 'homebrew:test:spell-slot:arcane:2': 2 });
    const rested = finishLongRest(reconciled, nextContext);
    expect(rested).toMatchObject({ ok: true, value: { resourceUses: { 'homebrew:test:spell-slot:arcane:1': 4, 'homebrew:test:spell-slot:arcane:2': 2 } } });
  });

  it('attaches fixed always-prepared spell grants to one provider without creating a second registry or ownership store', () => {
    const definition = provider('fixed-grant', 'charisma');
    const fixed: SpellcastingSpellGrant[] = [{
      definition: { providerId: definition.id, spellIds: [srdId('spell', 'divine-smite'), srdId('spell', 'find-steed')], status: 'always-prepared' },
      grantedBy: { contentId: 'homebrew:test:subclass-feature:oath-spells', contentName: 'Oath Spells' },
    }];
    const result = deriveSpellcastingProviders([grant(definition)], 5, MODIFIERS, 3, contentRegistry, fixed);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.providers[0].spellGrants.map((entry) => [entry.spell.name, entry.status, entry.grantedBy.contentName])).toEqual([
      ['Divine Smite', 'always-prepared', 'Oath Spells'],
      ['Find Steed', 'always-prepared', 'Oath Spells'],
    ]);
    expect(result.value.providers[0].spells.map((spell) => spell.name)).toEqual(['Fire Bolt', 'Cure Wounds', 'Divine Smite', 'Find Steed']);
  });
});

describe('bounded spell roll derivation', () => {
  it.each([[1, 1], [5, 2], [11, 3], [17, 4]])('scales Fire Bolt at character level %i to %id10', (level, count) => {
    const spell = contentRegistry.findSpell(srdId('spell', 'fire-bolt'))!;
    const mechanic = spell.mechanics.find((entry) => entry.type === 'damage');
    if (!mechanic || mechanic.type !== 'damage') throw new Error('fixture missing damage');
    expect(deriveSpellRollAmount(spell, mechanic, level, undefined, 3)).toEqual({ ok: true, value: { dice: [{ count, die: 10 }], modifier: 0 } });
  });

  it('upcasts Cure Wounds and includes the provider spellcasting ability modifier', () => {
    const spell = contentRegistry.findSpell(srdId('spell', 'cure-wounds'))!;
    const mechanic = spell.mechanics.find((entry) => entry.type === 'healing');
    if (!mechanic || mechanic.type !== 'healing') throw new Error('fixture missing healing');
    expect(deriveSpellRollAmount(spell, mechanic, 5, 1, 3)).toEqual({ ok: true, value: { dice: [{ count: 2, die: 8 }], modifier: 3 } });
    expect(deriveSpellRollAmount(spell, mechanic, 5, 3, 3)).toEqual({ ok: true, value: { dice: [{ count: 6, die: 8 }], modifier: 3 } });
  });

  it('rejects spell-slot misuse instead of inventing casting semantics', () => {
    const cantrip = contentRegistry.findSpell(srdId('spell', 'fire-bolt'))!;
    const cantripDamage = cantrip.mechanics.find((entry) => entry.type === 'damage');
    const cure = contentRegistry.findSpell(srdId('spell', 'cure-wounds'))!;
    const healing = cure.mechanics.find((entry) => entry.type === 'healing');
    if (!cantripDamage || cantripDamage.type !== 'damage' || !healing || healing.type !== 'healing') throw new Error('fixture missing mechanic');
    expect(deriveSpellRollAmount(cantrip, cantripDamage, 5, 1, 0)).toMatchObject({ ok: false, error: { code: 'invalid-spell-slot' } });
    expect(deriveSpellRollAmount(cure, healing, 5, undefined, 3)).toMatchObject({ ok: false, error: { code: 'invalid-spell-slot' } });
  });
});
