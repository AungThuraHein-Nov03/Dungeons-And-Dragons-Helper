import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

describe('Milestone 7 Compendium integration', () => {
  it('browses Species and Background list/detail pages through the existing Compendium shell', async () => {
    const user = userEvent.setup();
    renderAt('/compendium');

    const overview = within(screen.getByRole('main'));
    const speciesCard = overview.getByRole('link', { name: /9 entries Species/ });
    const backgroundCard = overview.getByRole('link', { name: /4 entries Backgrounds/ });
    expect(speciesCard).toBeInTheDocument();
    expect(backgroundCard).toBeInTheDocument();

    await user.click(speciesCard);
    expect(screen.getByRole('heading', { name: 'Species' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /Elf/ }));
    expect(screen.getByRole('heading', { name: 'Elf' })).toBeInTheDocument();
    const speciesChoices = screen.getByRole('heading', { name: 'Species selections' }).closest('.detail-card') as HTMLElement | null;
    expect(speciesChoices).not.toBeNull();
    expect(within(speciesChoices!).getByText(/Drow, High Elf, Wood Elf/)).toBeInTheDocument();
    expect(screen.getByText(/Darkvision 60 ft/)).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Backgrounds' }));
    expect(screen.getByRole('heading', { name: 'Backgrounds' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /Soldier/ }));
    expect(screen.getByRole('heading', { name: 'Soldier' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Savage Attacker' })).toBeInTheDocument();
    const training = screen.getByRole('heading', { name: 'Skills & tool' }).closest('.detail-card') as HTMLElement | null;
    expect(training).not.toBeNull();
    expect(within(training!).getByText('Athletics, Intimidation')).toBeInTheDocument();
    expect(screen.getByText(/Option A:/)).toBeInTheDocument();
  });
});
