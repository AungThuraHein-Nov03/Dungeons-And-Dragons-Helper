import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { SRD_CLASSES, SRD_FEATS, SRD_SPELLS, SRD_SUBCLASSES } from '../content/srd';
import { CHARACTER_STORAGE_KEY, createCharacter, getCharacterById } from '../services/characterStorage';
import { fighterInput } from './fixtures';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function panel(name: string) {
  const heading = screen.getByRole('heading', { name });
  const section = heading.closest('section');
  if (!section) throw new Error('Missing panel: ' + name);
  return within(section);
}

function coverControl() {
  return within(screen.getByRole('group', { name: 'Cover' }));
}

describe('Milestone 13A PLAY Initiative and temporary Cover flow', () => {
  it('rolls Initiative from PLAY through manual plus automatic D20 context with transparent history', async () => {
    const character = createCharacter(fighterInput({ name: 'M13A Initiative' }));
    const values = [0.2, 0.8]; let index = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => values[index++] ?? 0.5);
    const user = userEvent.setup();
    renderAt('/characters/' + character.id);

    const quickStats = within(screen.getByRole('region', { name: 'Combat quick stats' }));
    const initiativeStat = quickStats.getByText('Initiative').closest('article')!;
    expect(within(initiativeStat).getByText('+4')).toBeInTheDocument();

    const mode = within(screen.getByRole('group', { name: 'Initiative roll mode' }));
    expect(mode.getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Roll Initiative' }));

    const historyEntry = panel('Roll History').getByText('Initiative · Advantage').closest('article')!;
    expect(within(historyEntry).getByText('d20: 5, 17')).toBeInTheDocument();
    expect(within(historyEntry).getByText('Total: 21')).toBeInTheDocument();
    expect(within(historyEntry).getByText('Manual: Normal · Final: Advantage')).toBeInTheDocument();
    expect(within(historyEntry).getByText('Advantage: Remarkable Athlete')).toBeInTheDocument();
  });

  it('applies Half and Three-Quarters Cover only as temporary contextual AC and Dexterity-save modifiers', async () => {
    const character = createCharacter(fighterInput({ name: 'M13A Cover' }));
    vi.spyOn(Math, 'random').mockReturnValue(0.45);
    const user = userEvent.setup();
    renderAt('/characters/' + character.id);

    const baseStored = localStorage.getItem(CHARACTER_STORAGE_KEY);
    await user.click(coverControl().getByRole('button', { name: 'Half +2' }));

    const quickStats = within(screen.getByRole('region', { name: 'Combat quick stats' }));
    const armor = quickStats.getByLabelText('Armor Class');
    expect(within(armor).getByText('16')).toBeInTheDocument();
    expect(within(armor).getByText('Base 14 · Half Cover +2')).toBeInTheDocument();
    expect(localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(baseStored);

    await user.click(screen.getByRole('link', { name: 'Character' }));
    expect(coverControl().getByRole('button', { name: 'Half +2' })).toHaveAttribute('aria-pressed', 'true');

    const dexterity = screen.getByText('Dexterity').closest('article')!;
    await user.click(within(dexterity).getByRole('button', { name: 'Save' }));
    const dexSave = panel('Roll History').getByText('Saving Throw — Dexterity').closest('article')!;
    expect(within(dexSave).getByText('Modifier: +6')).toBeInTheDocument();
    expect(within(dexSave).getByText('Context: Half Cover +2')).toBeInTheDocument();

    const strength = screen.getByText('Strength').closest('article')!;
    await user.click(within(strength).getByRole('button', { name: 'Save' }));
    const strengthSave = panel('Roll History').getByText('Saving Throw — Strength').closest('article')!;
    expect(within(strengthSave).getByText('Modifier: +4')).toBeInTheDocument();
    expect(within(strengthSave).queryByText(/Cover/)).not.toBeInTheDocument();

    await user.click(coverControl().getByRole('button', { name: '3/4 +5' }));
    await user.click(within(dexterity).getByRole('button', { name: 'Save' }));
    const latestDex = panel('Roll History').getAllByText('Saving Throw — Dexterity')[0].closest('article')!;
    expect(within(latestDex).getByText('Modifier: +9')).toBeInTheDocument();
    expect(within(latestDex).getByText('Context: Three-Quarters Cover +5')).toBeInTheDocument();
  });

  it('keeps Total Cover informational and drops all Cover context on reload without persisted leakage', async () => {
    const character = createCharacter(fighterInput({ name: 'M13A No Persist' }));
    const user = userEvent.setup();
    const first = renderAt('/characters/' + character.id);
    const original = localStorage.getItem(CHARACTER_STORAGE_KEY);

    await user.click(coverControl().getByRole('button', { name: 'Total' }));
    expect(screen.getByText(/Total Cover is a targeting restriction/)).toBeInTheDocument();
    const armor = within(screen.getByRole('region', { name: 'Combat quick stats' })).getByLabelText('Armor Class');
    expect(within(armor).getByText('14')).toBeInTheDocument();
    expect(within(armor).getByText(/Total Cover: direct targeting blocked/)).toBeInTheDocument();
    expect(localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(original);

    first.unmount();
    renderAt('/characters/' + character.id);
    expect(coverControl().getByRole('button', { name: 'None' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('region', { name: 'Combat quick stats' })).getByLabelText('Armor Class')).toHaveTextContent('14');
    expect(localStorage.getItem(CHARACTER_STORAGE_KEY)).not.toContain('cover');

    const stored = getCharacterById(character.id)!;
    expect(Object.keys(stored.playState).sort()).toEqual(['currentHp', 'hitDiceRemaining', 'resourceUses', 'temporaryHp']);
    expect(stored).not.toHaveProperty('cover');
    expect(stored.playState).not.toHaveProperty('cover');
  });

  it('preserves locked bundled counts and Character v8 storage during M13A', () => {
    expect(SRD_CLASSES).toHaveLength(12);
    expect(SRD_SUBCLASSES).toHaveLength(12);
    expect(SRD_SPELLS).toHaveLength(339);
    expect(SRD_FEATS).toHaveLength(17);
    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v8');
  });
});
