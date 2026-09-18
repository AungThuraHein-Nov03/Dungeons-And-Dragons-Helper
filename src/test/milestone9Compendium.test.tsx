import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { srdId } from '../content/srd';

function renderAt(path: string) { return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>); }

describe('Milestone 9 Subclass Compendium integration', () => {
  it('browses Champion through the expanded bundled Subclass overview, list, and detail routes', async () => {
    const user = userEvent.setup();
    renderAt('/compendium');
    const overview = screen.getByRole('link', { name: /12 entries Subclasses/ });
    expect(overview).toHaveAttribute('href', '/compendium/subclasses');
    await user.click(overview);
    expect(screen.getByRole('heading', { name: 'Subclasses' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Champion/ })).toHaveAttribute('href', `/compendium/subclasses/${encodeURIComponent(srdId('subclass', 'fighter:champion'))}`);
    await user.click(screen.getByRole('link', { name: /Champion/ }));
    expect(screen.getByRole('heading', { name: 'Champion' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fighter' })).toHaveAttribute('href', `/compendium/classes/${encodeURIComponent(srdId('class', 'fighter'))}`);
    expect(screen.getByText('Level 3', { selector: 'dd' })).toBeInTheDocument();
    for (const feature of ['Improved Critical', 'Remarkable Athlete', 'Additional Fighting Style', 'Heroic Warrior', 'Superior Critical', 'Survivor']) expect(screen.getByRole('heading', { name: feature })).toBeInTheDocument();
    expect(screen.getByText(/Advantage on Athletics checks/)).toBeInTheDocument();
    expect(screen.getByText(/Weapon Critical Hit threshold: 19–20/)).toBeInTheDocument();
    expect(screen.getByText(/Weapon Critical Hit threshold: 18–20/)).toBeInTheDocument();
    expect(screen.getAllByText(/Unarmed Strike critical range remains reference-only/)).toHaveLength(2);
    expect(screen.getByText(/Subclass-granted feat-choice ownership is not implemented/)).toBeInTheDocument();
  });

  it('exposes Subclasses in the existing Compendium navigation', () => {
    renderAt('/compendium/classes');
    const nav = screen.getByRole('navigation', { name: 'Compendium sections' });
    expect(within(nav).getByRole('link', { name: 'Subclasses' })).toHaveAttribute('href', '/compendium/subclasses');
  });
});
