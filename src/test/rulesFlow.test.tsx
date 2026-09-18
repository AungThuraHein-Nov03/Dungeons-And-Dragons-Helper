import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { srdId } from '../content/srd';
import { AppRoutes } from '../App';
import { loadCharacters } from '../services/characterStorage';

function renderAt(path: string) { return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>); }
function summaryCard(label: string) { const card = screen.getByText(label).closest('article'); expect(card).not.toBeNull(); return within(card!); }

describe('Milestone 3 rules UI flow', () => {
  it('creates a Fighter with rule choices, persists source state, and recalculates after editing', async () => {
    const user = userEvent.setup();
    const first = renderAt('/characters/new');
    await user.type(screen.getByLabelText('Character Name'), 'Renethal Test');
    await user.selectOptions(screen.getByLabelText('Level'), '4');
    await user.selectOptions(screen.getByLabelText(/Subclass/), srdId('subclass', 'fighter:champion'));
    for (const [label, score] of Object.entries({ Strength: '14', Dexterity: '18', Constitution: '14', Intelligence: '10', Wisdom: '12', Charisma: '12' })) await user.type(screen.getByLabelText(label), score);
    await user.click(screen.getByLabelText('Athletics'));
    await user.click(screen.getByLabelText('Perception'));
    await user.selectOptions(screen.getByLabelText('Fighter Starting Equipment'), 'B');
    await user.click(screen.getByRole('button', { name: 'Create Character' }));

    await user.click(screen.getByRole('link', { name: 'Inventory' }));
    const studded = screen.getByRole('heading', { name: 'Studded Leather Armor' }).closest('article');
    const scimitarInventory = screen.getByRole('heading', { name: 'Scimitar' }).closest('article');
    expect(studded).not.toBeNull();
    expect(scimitarInventory).not.toBeNull();
    await user.click(within(studded!).getByRole('button', { name: 'Equip' }));
    await user.click(within(scimitarInventory!).getByRole('button', { name: 'Equip' }));
    await user.selectOptions(within(scimitarInventory!).getByLabelText('Attack ability'), 'dexterity');
    await user.type(screen.getByLabelText('Search registry items'), 'Light Crossbow');
    const registryResults = screen.getByRole('region', { name: 'Registry item results' });
    const resultRow = within(registryResults).getByText('Light Crossbow').closest('.inventory-add-row') as HTMLElement | null;
    expect(resultRow).not.toBeNull();
    await user.click(within(resultRow!).getByRole('button', { name: 'Add' }));
    const crossbowInventory = screen.getByRole('heading', { name: 'Light Crossbow' }).closest('article');
    expect(crossbowInventory).not.toBeNull();
    await user.click(within(crossbowInventory!).getByRole('button', { name: 'Equip' }));
    await user.click(screen.getByRole('link', { name: 'Character Sheet' }));

    expect(summaryCard('Proficiency Bonus').getByText('+2')).toBeInTheDocument();
    expect(summaryCard('Passive Perception').getByText('13')).toBeInTheDocument();
    expect(summaryCard('Armor Class').getByText('16')).toBeInTheDocument();
    const scimitar = screen.getByRole('heading', { name: 'Scimitar' }).closest('article');
    expect(scimitar).not.toBeNull();
    expect(within(scimitar!).getByText('+6 to hit')).toBeInTheDocument();
    expect(within(scimitar!).getByText('DEX')).toBeInTheDocument();
    expect(within(scimitar!).getByText('1d6 + 4 Slashing')).toBeInTheDocument();
    expect(within(scimitar!).getByText(/Nick/)).toBeInTheDocument();
    const crossbow = screen.getByRole('heading', { name: 'Light Crossbow' }).closest('article');
    expect(crossbow).not.toBeNull();
    expect(within(crossbow!).getByText('+6 to hit')).toBeInTheDocument();
    expect(within(crossbow!).getByText('1d8 + 4 Piercing')).toBeInTheDocument();
    expect(within(crossbow!).getByText(/Slow/)).toBeInTheDocument();

    const [saved] = loadCharacters();
    const savedScimitar = saved.inventory.find((entry) => entry.kind === 'registry' && entry.contentId === srdId('weapon', 'scimitar'));
    expect(savedScimitar?.kind === 'registry' ? savedScimitar.attackAbilityChoice : undefined).toBe('dexterity');
    first.unmount();
    renderAt(`/characters/${saved.id}`);
    expect(summaryCard('Passive Perception').getByText('13')).toBeInTheDocument();
    expect(screen.getByText('1d6 + 4 Slashing')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Edit Character' }));
    const dexterity = screen.getByLabelText('Dexterity');
    await user.clear(dexterity);
    await user.type(dexterity, '16');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(summaryCard('Armor Class').getByText('15')).toBeInTheDocument();
    const updatedScimitar = screen.getByRole('heading', { name: 'Scimitar' }).closest('article');
    expect(within(updatedScimitar!).getByText('+5 to hit')).toBeInTheDocument();
    expect(within(updatedScimitar!).getByText('1d6 + 3 Slashing')).toBeInTheDocument();
  }, 20000);
});
