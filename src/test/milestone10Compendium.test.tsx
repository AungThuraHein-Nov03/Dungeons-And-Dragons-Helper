import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { srdId } from '../content/srd';

function renderAt(path: string) { return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>); }

describe('Milestone 10 Spell Compendium integration', () => {
  it('keeps the six M10 anchors exposed through the expanded M12A Compendium', async () => {
    const user = userEvent.setup();
    renderAt('/compendium');
    const overview = screen.getByRole('link', { name: /339 entries Spells/ });
    expect(overview).toHaveAttribute('href', '/compendium/spells');
    const nav = screen.getByRole('navigation', { name: 'Compendium sections' });
    expect(within(nav).getByRole('link', { name: 'Spells' })).toHaveAttribute('href', '/compendium/spells');
    await user.click(overview);
    const results = screen.getByRole('region', { name: 'Spell results' });
    for (const name of ['Fire Bolt', 'Sacred Flame', 'Cure Wounds', 'Guiding Bolt', 'Burning Hands', 'Detect Magic']) expect(within(results).getByRole('link', { name: new RegExp(`^SRD 5\\.2\\.1 ${name} `) })).toBeInTheDocument();
    await user.click(within(results).getByRole('link', { name: /Detect Magic/ }));
    expect(screen.getByRole('heading', { name: 'Detect Magic' })).toBeInTheDocument();
    expect(screen.getByText('Yes · metadata only')).toBeInTheDocument();
    expect(screen.getByText(/Concentration is metadata only/)).toBeInTheDocument();
  }, 30000);

  it('filters by level, school, spell list, Ritual, and Concentration without changing the registry', async () => {
    const user = userEvent.setup();
    renderAt('/compendium/spells');
    const results = screen.getByRole('region', { name: 'Spell results' });
    await user.selectOptions(screen.getByLabelText('Spell level'), '0');
    expect(within(results).getByRole('link', { name: /Fire Bolt/ })).toBeInTheDocument();
    expect(within(results).getByRole('link', { name: /Sacred Flame/ })).toBeInTheDocument();
    expect(within(results).queryByRole('link', { name: /Cure Wounds/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Spell level'), 'all');
    await user.selectOptions(screen.getByLabelText('School'), 'divination');
    expect(within(results).getByRole('link', { name: /Detect Magic/ })).toBeInTheDocument();
    expect(within(results).queryByRole('link', { name: /Fire Bolt/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('School'), 'all');
    await user.selectOptions(screen.getByLabelText('Spell list'), 'cleric');
    expect(within(results).getByRole('link', { name: /Sacred Flame/ })).toBeInTheDocument();
    expect(within(results).getByRole('link', { name: /Guiding Bolt/ })).toBeInTheDocument();
    expect(within(results).queryByRole('link', { name: /Fire Bolt/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Spell list'), 'all');
    await user.click(screen.getByLabelText('Ritual only'));
    expect(within(results).getAllByRole('link').length).toBeGreaterThan(0);
    expect(within(results).getByRole('link', { name: /Detect Magic/ })).toBeInTheDocument();
    await user.click(screen.getByLabelText('Concentration only'));
    expect(within(results).getByRole('link', { name: /Detect Magic/ })).toBeInTheDocument();
  }, 30000);

  it('renders structured spell mechanics without fabricating target save resolution', () => {
    renderAt(`/compendium/spells/${encodeURIComponent(srdId('spell', 'burning-hands'))}`);
    expect(screen.getByRole('heading', { name: 'Burning Hands' })).toBeInTheDocument();
    expect(screen.getByText(/Dexterity saving throw using the provider Spell Save DC/)).toBeInTheDocument();
    expect(screen.getByText(/Save resolution remains manual/)).toBeInTheDocument();
    expect(screen.getByText(/Upcasting adds 1d6 per slot level above 1/)).toBeInTheDocument();
  });

  it('routes a newly ingested M12A spell to its reference-only detail view', () => {
    renderAt(`/compendium/spells/${encodeURIComponent(srdId('spell', 'acid-arrow'))}`);
    expect(screen.getByRole('heading', { name: 'Acid Arrow' })).toBeInTheDocument();
    expect(screen.getByText(/No executable structured mechanics. This spell is reference-only in M12A/)).toBeInTheDocument();
    expect(screen.getByText(/This spell’s rules are preserved as reference text/)).toBeInTheDocument();
  });
});
