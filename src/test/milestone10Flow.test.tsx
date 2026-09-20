import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { CharacterReferenceView } from '../components/CharacterReferenceView';
import { srdId } from '../content/srd';
import type { SpellcastingProviderDefinition } from '../models/content';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { deriveSpellcastingProviders } from '../rules/spellcasting';
import { contentRegistry } from '../services/contentRegistry';
import { CHARACTER_STORAGE_KEY, createCharacter } from '../services/characterStorage';
import { fighterCharacter, fighterInput } from './fixtures';

function renderAt(path: string) { return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>); }

function syntheticCastingView() {
  const original = fighterCharacter({ level: 5, name: 'Synthetic Caster' });
  const base = deriveCharacterState(original, contentRegistry);
  if (!base.ok) throw new Error(base.error.message);
  const definition: SpellcastingProviderDefinition = {
    id: 'homebrew:test:spellcasting-provider:reference-view',
    name: 'Starlight Casting',
    spellcastingAbility: { kind: 'fixed', ability: 'wisdom' },
    multiclassSlotContribution: { kind: 'independent' },
    spellManagement: { kind: 'granted-only', spellIds: [srdId('spell', 'fire-bolt'), srdId('spell', 'burning-hands'), srdId('spell', 'cure-wounds'), srdId('spell', 'detect-magic')] },
    slotPool: {
      id: 'homebrew:test:spell-slot-pool:reference-view', name: 'Starlight Slots',
      slotLevels: [{ spellLevel: 1, resourceId: 'homebrew:test:spell-slot:reference-view:1', name: 'Level 1 Spell Slots' }, { spellLevel: 2, resourceId: 'homebrew:test:spell-slot:reference-view:2', name: 'Level 2 Spell Slots' }],
      progression: [{ level: 1, slots: [{ spellLevel: 1, maximum: 3 }, { spellLevel: 2, maximum: 2 }] }],
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
    ritualCasting: 'prepared',
  };
  const casting = deriveSpellcastingProviders([{ definition, source: { type: 'homebrew', namespace: 'test' }, grantedBy: { contentId: 'homebrew:test:subclass-feature:starlight', contentName: 'Starlight Gift' } }], base.value.level, base.value.abilityModifiers, base.value.proficiencyBonus, contentRegistry);
  if (!casting.ok) throw new Error(casting.error.message);
  const character = { ...original, playState: { ...original.playState, resourceUses: { ...original.playState.resourceUses, 'homebrew:test:spell-slot:reference-view:1': 2, 'homebrew:test:spell-slot:reference-view:2': 1 } } };
  const state = { ...base.value, spellcasting: casting.value.providers, resources: [...base.value.resources, ...casting.value.resources] };
  return { character, state };
}

describe('Milestone 10 CHARACTER Spellcasting boundary', () => {
  it('keeps the M10 Fighter boundary under current v9 persistence without class-specific spell fields', () => {
    const character = createCharacter(fighterInput({ level: 5, name: 'M10 Fighter' }));
    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v9');
    const stored = JSON.parse(window.localStorage.getItem(CHARACTER_STORAGE_KEY) ?? '[]') as Array<Record<string, unknown>>;
    expect(stored[0].id).toBe(character.id);
    expect(stored[0]).not.toHaveProperty('spellcasting');
    expect(stored[0]).not.toHaveProperty('knownSpells');
    expect(stored[0]).not.toHaveProperty('preparedSpells');
    expect(stored[0]).toHaveProperty('spellcastingSelections', []);
    expect(stored[0]).toHaveProperty('playState.resourceUses');
  });

  it('does not add Spellcasting to the normal bundled Fighter/Champion CHARACTER or PLAY views', () => {
    const character = createCharacter(fighterInput({ level: 5, name: 'Normal Champion' }));
    const characterRender = renderAt(`/characters/${character.id}/character`);
    expect(screen.queryByRole('heading', { name: 'Spellcasting' })).not.toBeInTheDocument();
    characterRender.unmount();
    renderAt(`/characters/${character.id}`);
    expect(screen.queryByRole('heading', { name: 'Spellcasting' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Attack Rolls' })).toBeInTheDocument();
  });

  it('conditionally presents provider calculations, slots, granted spells, roll actions, save guidance, and metadata on CHARACTER', () => {
    const { character, state } = syntheticCastingView();
    render(<CharacterReferenceView character={character} state={state} rollMode="normal" onRollModeChange={vi.fn()} cover="none" onCoverChange={vi.fn()} conditions={[]} onRoll={vi.fn()} onMutation={vi.fn()} />);
    const section = screen.getByRole('heading', { name: 'Spellcasting' }).closest('section');
    expect(section).not.toBeNull();
    const view = within(section!);
    expect(view.getByRole('heading', { name: 'Starlight Casting' })).toBeInTheDocument();
    expect(view.getByText('Starlight Gift', { exact: false })).toBeInTheDocument();
    expect(view.getByText('Wisdom is the Spellcasting Ability.', { exact: false })).toBeInTheDocument();
    expect(view.getByText('12', { selector: 'dd' })).toBeInTheDocument();
    expect(view.getByText('+4', { selector: 'dd' })).toBeInTheDocument();
    expect(view.getByText(/Level 1: 2\/3 remaining/)).toBeInTheDocument();
    expect(view.getByText(/Level 2: 1\/2 remaining/)).toBeInTheDocument();
    for (const spell of ['Fire Bolt', 'Burning Hands', 'Cure Wounds', 'Detect Magic']) expect(view.getByRole('heading', { name: spell })).toBeInTheDocument();
    expect(view.getAllByRole('button', { name: 'Spell Attack' })).toHaveLength(1);
    expect(view.getAllByRole('button', { name: 'Damage' }).length).toBeGreaterThanOrEqual(2);
    expect(view.getByRole('button', { name: 'Healing' })).toBeInTheDocument();
    expect(view.getByText(/Dexterity vs DC 12/)).toBeInTheDocument();
    expect(view.getByText(/Target save resolution is manual/)).toBeInTheDocument();
    expect(view.getByText('Concentration · Ritual')).toBeInTheDocument();
  });
});
