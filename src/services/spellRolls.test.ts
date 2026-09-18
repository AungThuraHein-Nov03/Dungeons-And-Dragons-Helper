import { describe, expect, it } from 'vitest';
import { srdId } from '../content/srd';
import type { SpellcastingProviderDefinition } from '../models/content';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { deriveSpellcastingProviders } from '../rules/spellcasting';
import type { DerivedCharacterState } from '../rules/types';
import { fighterCharacter } from '../test/fixtures';
import { contentRegistry } from './contentRegistry';
import { loadRollHistory } from './rollHistory';
import { rollSpellAttack, rollSpellDamage, rollSpellHealing } from './spellRolls';

function dieValue(value: number, die: number) { return () => (value - 1) / die; }

function spellState(level = 5): { character: ReturnType<typeof fighterCharacter>; state: DerivedCharacterState; providerId: string } {
  const character = fighterCharacter({ level });
  const base = deriveCharacterState(character, contentRegistry);
  if (!base.ok) throw new Error(base.error.message);
  const definition: SpellcastingProviderDefinition = {
    id: 'homebrew:test:spellcasting-provider:spell-rolls',
    name: 'Test Casting',
    spellcastingAbility: { kind: 'fixed', ability: 'wisdom' },
    spellManagement: { kind: 'granted-only', spellIds: [
      srdId('spell', 'fire-bolt'), srdId('spell', 'sacred-flame'), srdId('spell', 'cure-wounds'), srdId('spell', 'guiding-bolt'), srdId('spell', 'burning-hands'),
    ] },
    slotPool: {
      id: 'homebrew:test:spell-slot-pool:spell-rolls',
      name: 'Test Slots',
      slotLevels: [
        { spellLevel: 1, resourceId: 'homebrew:test:spell-slot:spell-rolls:1', name: 'Level 1 Spell Slots' },
        { spellLevel: 2, resourceId: 'homebrew:test:spell-slot:spell-rolls:2', name: 'Level 2 Spell Slots' },
        { spellLevel: 3, resourceId: 'homebrew:test:spell-slot:spell-rolls:3', name: 'Level 3 Spell Slots' },
      ],
      progression: [{ level: 1, slots: [{ spellLevel: 1, maximum: 4 }, { spellLevel: 2, maximum: 3 }, { spellLevel: 3, maximum: 2 }] }],
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
    ritualCasting: 'none',
  };
  const casting = deriveSpellcastingProviders([{ definition, source: { type: 'homebrew', namespace: 'test' }, grantedBy: { contentId: 'homebrew:test:subclass-feature:casting', contentName: 'Casting' } }], level, base.value.abilityModifiers, base.value.proficiencyBonus, contentRegistry);
  if (!casting.ok) throw new Error(casting.error.message);
  return { character, state: { ...base.value, spellcasting: casting.value.providers, resources: [...base.value.resources, ...casting.value.resources] }, providerId: definition.id };
}

describe('spell rolls through the existing Dice Engine', () => {
  it('rolls provider-specific spell attacks with normal d20 mode metadata', () => {
    const { character, state, providerId } = spellState();
    const result = rollSpellAttack(character, state, providerId, srdId('spell', 'fire-bolt'), 'normal', { rng: dieValue(14, 20) });
    expect(result).toMatchObject({ ok: true, value: { roll: { request: { type: 'attack', source: { spellId: srdId('spell', 'fire-bolt'), spellcastingProviderId: providerId } }, keptD20: 14, modifier: state.spellcasting[0].attackModifier } } });
  });

  it('uses the existing Advantage/Disadvantage engine for spell attacks', () => {
    const { character, state, providerId } = spellState();
    const values = [0.2, 0.8]; let index = 0;
    const result = rollSpellAttack(character, state, providerId, srdId('spell', 'guiding-bolt'), 'advantage', { rng: () => values[index++] });
    expect(result).toMatchObject({ ok: true, value: { roll: { request: { mode: 'advantage' }, dice: [{ values: [5, 17] }], keptD20: 17 } } });
  });

  it('rolls cantrip damage at character-level scaling and reuses manual critical dice doubling', () => {
    const { character, state, providerId } = spellState(5);
    const result = rollSpellDamage(character, state, providerId, srdId('spell', 'fire-bolt'), undefined, true, { rng: dieValue(5, 10) });
    expect(result).toMatchObject({ ok: true, value: { roll: { request: { label: 'Fire Bolt — Damage — Critical', outcome: { damageType: 'fire' } }, dice: [{ die: 10, values: [5, 5, 5, 5] }], modifier: 0, total: 20 } } });
  });

  it('rolls explicit upcast damage and healing without applying target state', () => {
    const { character, state, providerId } = spellState();
    const damage = rollSpellDamage(character, state, providerId, srdId('spell', 'guiding-bolt'), 3, false, { rng: dieValue(4, 6) });
    expect(damage).toMatchObject({ ok: true, value: { roll: { dice: [{ die: 6, values: [4, 4, 4, 4, 4, 4] }], total: 24, request: { source: { spellSlotResourceId: 'homebrew:test:spell-slot:spell-rolls:3' } } } } });
    const healing = rollSpellHealing(character, state, providerId, srdId('spell', 'cure-wounds'), 2, { rng: dieValue(5, 8) });
    expect(healing).toMatchObject({ ok: true, value: { roll: { dice: [{ die: 8, values: [5, 5, 5, 5] }], modifier: state.spellcasting[0].abilityModifier, request: { outcome: { kind: 'healing' } } } } });
  });

  it('rolls saving-throw spell damage but leaves save adjudication manual and records provider identity in history', () => {
    const { character, state, providerId } = spellState();
    const result = rollSpellDamage(character, state, providerId, srdId('spell', 'burning-hands'), 1, false, { rng: dieValue(3, 6) });
    expect(result).toMatchObject({ ok: true, value: { roll: { request: { outcome: { kind: 'damage', damageType: 'fire' } }, dice: [{ values: [3, 3, 3] }] } } });
    const history = loadRollHistory();
    expect(history[0].result.request.source).toMatchObject({ spellId: srdId('spell', 'burning-hands'), spellcastingProviderId: providerId });
    expect(state.spellcasting[0].spells.find((spell) => spell.id === srdId('spell', 'burning-hands'))?.mechanics[0]).toEqual({ type: 'saving-throw', ability: 'dexterity', onSuccess: 'half' });
  });
});
