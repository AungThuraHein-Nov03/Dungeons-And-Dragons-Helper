import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import {
  CHARACTER_STORAGE_KEY,
  createCharacter,
  getCharacterById,
} from '../services/characterStorage';
import { fighterInput } from './fixtures';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('Milestone 15-B Level Up PLAY flow', () => {
  it('L/M opens from PLAY, changes targets only in ephemeral UI state, and Cancel performs zero persistence', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({
      name: 'M15-B Draft Ren',
      abilityScores: { intelligence: 12 },
    }));
    const persistedBefore = window.localStorage.getItem(CHARACTER_STORAGE_KEY);

    renderAt(`/characters/${character.id}`);
    const levelUpLink = screen.getByRole('link', { name: 'Level Up' });
    expect(levelUpLink).toHaveAttribute('href', `/characters/${character.id}/level-up`);

    await user.click(levelUpLink);
    expect(screen.getByRole('heading', { name: 'Level Up M15-B Draft Ren' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Level 4' })).toBeInTheDocument();
    expect(screen.getByText(/Starting Class:/)).toHaveTextContent('Fighter');
    expect(screen.queryByRole('button', { name: /confirm|save/i })).not.toBeInTheDocument();

    const fighterTarget = screen.getByRole('radio', { name: /Fighter.*Level 4.*Level 5/i });
    await user.click(fighterTarget);
    expect(fighterTarget).toBeChecked();
    expect(screen.getByRole('heading', { name: 'Advance Fighter by 1 level' })).toBeInTheDocument();
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(persistedBefore);

    const rogueTarget = screen.getByRole('radio', { name: /Rogue.*Add at class level 1/i });
    await user.click(rogueTarget);
    expect(rogueTarget).toBeChecked();
    expect(fighterTarget).not.toBeChecked();
    expect(screen.getByRole('heading', { name: 'Add Rogue at level 1' })).toBeInTheDocument();
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(persistedBefore);

    await user.click(screen.getByRole('link', { name: 'Cancel' }));
    expect(screen.getByTestId('character-workspace-play')).toBeInTheDocument();
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(persistedBefore);
    expect(getCharacterById(character.id)?.classProgressions).toEqual(character.classProgressions);
  });

  it('D/E shows unrepresented ineligible multiclass options disabled with authoritative reasons and never duplicates an existing class in Add Class', () => {
    const character = createCharacter(fighterInput({
      name: 'M15-B Ineligible Wizard',
      abilityScores: { intelligence: 10 },
    }));

    renderAt(`/characters/${character.id}/level-up`);

    const addClassHeading = screen.getByRole('heading', { name: 'Begin a new class at level 1' });
    const addClassSection = addClassHeading.closest('section');
    expect(addClassSection).not.toBeNull();
    const addClass = within(addClassSection!);

    const wizardTarget = addClass.getByRole('radio', { name: /Wizard.*Unavailable/i });
    expect(wizardTarget).toBeDisabled();
    expect(addClass.getByText(/Wizard requires Intelligence 13 or higher for multiclassing/i)).toBeInTheDocument();
    expect(addClass.queryByText(/^Fighter$/)).not.toBeInTheDocument();
  });

  it('J exposes a clear Level 20 boundary from PLAY and does not provide a Level Up navigation link', () => {
    const character = createCharacter(fighterInput({
      name: 'M15-B Max Level',
      level: 20,
    }));

    renderAt(`/characters/${character.id}`);

    expect(screen.queryByRole('link', { name: 'Level Up' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Level Up' })).toBeDisabled();
    expect(screen.getByText('Level 20 maximum reached.')).toBeInTheDocument();
  });
});
