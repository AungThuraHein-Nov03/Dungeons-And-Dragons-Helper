import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { contentRegistry } from '../services/contentRegistry';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

describe('Milestone 8 Feat Compendium integration', () => {
  it('browses all 17 Feats through the existing Compendium list/detail architecture', async () => {
    const user = userEvent.setup();
    renderAt('/compendium');

    const featsOverview = screen.getByRole('link', { name: /17 entries Feats/ });
    expect(featsOverview).toHaveAttribute('href', '/compendium/feats');
    await user.click(featsOverview);

    expect(screen.getByRole('heading', { name: 'Feats' })).toBeInTheDocument();
    const results = within(screen.getByRole('region', { name: 'Feat results' }));
    const links = results.getAllByRole('link');
    expect(links).toHaveLength(17);
    const expectedIds = new Set(contentRegistry.getAll('feat').map((feat) => `/compendium/feats/${encodeURIComponent(feat.id)}`));
    expect(new Set(links.map((link) => link.getAttribute('href')))).toEqual(expectedIds);

    await user.click(results.getByRole('link', { name: /Archery/ }));
    expect(screen.getByRole('heading', { name: 'Archery' })).toBeInTheDocument();
    expect(screen.getByText('fighting-style', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByText(/Fighting Style Feature · reference-only prerequisite/)).toBeInTheDocument();
    expect(screen.getByText(/\+2 to attack rolls with ranged weapons/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unsupported mechanics' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /Back to Feats/ }));
    const featResults = within(screen.getByRole('region', { name: 'Feat results' }));
    await user.click(featResults.getByRole('link', { name: /Magic Initiate/ }));
    expect(screen.getByRole('heading', { name: 'Magic Initiate' })).toBeInTheDocument();
    expect(screen.getAllByText('Reference only').length).toBeGreaterThan(0);
    expect(screen.getByText(/No automated structured effects in Milestone 8/)).toBeInTheDocument();
    expect(screen.getByText(/Magic Initiate Spellcasting/)).toBeInTheDocument();
  });

  it('resolves a Background Origin Feat link through actual FeatContent', async () => {
    const user = userEvent.setup();
    renderAt('/compendium/backgrounds');
    const backgrounds = within(screen.getByRole('region', { name: 'Background results' }));
    await user.click(backgrounds.getByRole('link', { name: /Soldier/ }));

    const originLink = screen.getByRole('link', { name: /Open Savage Attacker feat/ });
    expect(originLink).toHaveAttribute('href', `/compendium/feats/${encodeURIComponent(contentRegistry.findBackground(contentRegistry.getAll('background').find((background) => background.name === 'Soldier')!.id)!.originFeat.id)}`);
    await user.click(originLink);
    expect(screen.getByRole('heading', { name: 'Savage Attacker' })).toBeInTheDocument();
    expect(screen.getByText('origin', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByText(/No automated structured effects in Milestone 8/)).toBeInTheDocument();
    expect(screen.getByText(/Once per turn after hitting with a weapon/)).toBeInTheDocument();
  });
});
