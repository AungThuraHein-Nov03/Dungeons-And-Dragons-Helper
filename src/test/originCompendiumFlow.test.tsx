import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

describe('Milestone 7 origin Compendium browsing', () => {
  it('browses Species and Background registry entries with structured and reference-only data', async () => {
    const user = userEvent.setup();
    renderAt('/compendium/species');

    const speciesResults = within(screen.getByRole('region', { name: 'Species results' }));
    expect(speciesResults.getAllByRole('link')).toHaveLength(9);
    await user.click(speciesResults.getByRole('link', { name: /Elf/ }));
    expect(screen.getByRole('heading', { name: 'Elf' })).toBeInTheDocument();
    expect(screen.getByText(/Drow, High Elf, Wood Elf/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Species traits' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Backgrounds' }));
    const backgroundResults = within(screen.getByRole('region', { name: 'Background results' }));
    expect(backgroundResults.getAllByRole('link')).toHaveLength(4);
    await user.click(backgroundResults.getByRole('link', { name: /Soldier/ }));
    expect(screen.getByRole('heading', { name: 'Soldier' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Savage Attacker' })).toBeInTheDocument();
    expect(screen.getByText(/Dragonchess Set/)).toBeInTheDocument();
    expect(screen.getByText(/Only supported structured effects are automated/)).toBeInTheDocument();
  });
});
