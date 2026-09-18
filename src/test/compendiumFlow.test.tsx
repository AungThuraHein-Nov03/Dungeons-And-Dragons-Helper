import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { LEGACY_CHARACTER_STORAGE_KEY } from '../services/characterStorage';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

describe('Milestone 2 Compendium flow', () => {
  it('navigates content while preserving and migrating an actual Milestone 1 save', async () => {
    window.localStorage.setItem(LEGACY_CHARACTER_STORAGE_KEY, JSON.stringify([{
      id: 'legacy-fighter', name: 'Legacy Fighter', class: 'Fighter', level: 4,
      abilityScores: { strength: 14, dexterity: 18, constitution: 14, intelligence: 10, wisdom: 12, charisma: 12 },
      createdAt: '2026-09-15T06:00:00.000Z', updatedAt: '2026-09-15T07:00:00.000Z',
    }]));
    const user = userEvent.setup();
    renderAt('/');

    await user.click(screen.getByRole('link', { name: 'Compendium' }));
    expect(screen.getByRole('heading', { name: 'Compendium' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Classes' }));
    await user.click(screen.getByRole('link', { name: /Fighter/ }));
    expect(screen.getByRole('heading', { name: 'Fighter progression' })).toBeInTheDocument();
    expect(screen.getByText('Three Extra Attacks')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Weapons' }));
    await user.type(screen.getByLabelText('Search weapons'), 'Scimitar');
    const results = within(screen.getByRole('region', { name: 'Weapons results' }));
    await user.click(results.getByRole('link', { name: /Scimitar/ }));
    expect(screen.getByText('Nick')).toBeInTheDocument();
    expect(screen.getByText(/Finesse, Light/)).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Armor' }));
    expect(screen.getByRole('link', { name: /Chain Mail/ })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Weapon Masteries' }));
    expect(screen.getByRole('link', { name: /Topple/ })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Characters' }));
    expect(screen.getByRole('heading', { name: 'Legacy Fighter' })).toBeInTheDocument();
  });
});
