import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { createCharacter, getCharacterById } from '../services/characterStorage';
import { fighterInput, SCIMITAR_ID } from './fixtures';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function inventoryCard(name: string) {
  const heading = screen.getByRole('heading', { name });
  const article = heading.closest('article');
  expect(article).not.toBeNull();
  return within(article!);
}

async function addRegistryItem(user: ReturnType<typeof userEvent.setup>, name: string) {
  const search = screen.getByLabelText('Search registry items');
  await user.clear(search);
  await user.type(search, name);
  const results = screen.getByRole('region', { name: 'Registry item results' });
  const row = within(results).getByText(name).closest<HTMLElement>('.inventory-add-row');
  expect(row).not.toBeNull();
  await user.click(within(row!).getByRole('button', { name: 'Add' }));
}

describe('Milestone 6.5 Character workspace', () => {
  it('defaults to PLAY and keeps CHARACTER, PLAY, and INVENTORY on one Character record', async () => {
    const character = createCharacter(fighterInput({ name: 'Workspace Ren', inventory: [] }));
    const user = userEvent.setup();
    renderAt(`/characters/${character.id}`);

    expect(screen.getByTestId('character-workspace-play')).toBeInTheDocument();
    expect(screen.getByText('PLAY view')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hit Points' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Character' }));
    expect(screen.getByTestId('character-workspace-character')).toBeInTheDocument();
    expect(screen.getByText('CHARACTER view')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Abilities & Saving Throws' })).toBeInTheDocument();
    expect(screen.getByText('Perception')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Features & Feats' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Inventory' }));
    expect(screen.getByTestId('character-workspace-inventory')).toBeInTheDocument();
    await addRegistryItem(user, 'Chain Mail');
    await user.click(inventoryCard('Chain Mail').getByRole('button', { name: 'Equip' }));
    await addRegistryItem(user, 'Scimitar');
    await user.click(inventoryCard('Scimitar').getByRole('button', { name: 'Equip' }));

    await user.click(screen.getByRole('link', { name: 'Character Sheet' }));
    expect(screen.getByTestId('character-workspace-play')).toBeInTheDocument();
    expect(screen.getByLabelText('Armor Class')).toHaveTextContent('16');
    expect(screen.getByRole('heading', { name: 'Scimitar' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Inventory' }));
    await user.click(inventoryCard('Scimitar').getByRole('button', { name: 'Unequip' }));
    await user.click(screen.getByRole('link', { name: 'Character Sheet' }));
    expect(screen.queryByRole('heading', { name: 'Scimitar' })).not.toBeInTheDocument();
    expect(getCharacterById(character.id)?.inventory).toHaveLength(2);
  });

  it('exposes a collapsible responsive Dice Tray and mixes manual and contextual rolls in the same history', async () => {
    const character = createCharacter(fighterInput({ name: 'Tray Ren', equipment: { equippedWeaponIds: [SCIMITAR_ID] }, weaponAttackAbilityChoices: { [SCIMITAR_ID]: 'dexterity' } }));
    const user = userEvent.setup();
    renderAt(`/characters/${character.id}`);

    const trayLabel = screen.getByText('Dice Tray');
    const tray = trayLabel.closest('details');
    expect(tray).not.toBeNull();
    expect(tray).toHaveClass('dice-tray');

    await user.click(screen.getByRole('button', { name: 'd6' }));
    const quantity = screen.getByLabelText('Quantity');
    await user.clear(quantity);
    await user.type(quantity, '2');
    const modifier = screen.getByLabelText('Modifier');
    await user.clear(modifier);
    await user.type(modifier, '3');
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    await user.click(screen.getByRole('button', { name: 'Roll 2d6' }));

    const history = screen.getByRole('heading', { name: 'Roll History' }).closest('section');
    expect(history).not.toBeNull();
    expect(within(history!).getByText('Manual 2d6 + 3')).toBeInTheDocument();

    const scimitar = screen.getByRole('heading', { name: 'Scimitar' }).closest('article');
    expect(scimitar).not.toBeNull();
    await user.click(within(scimitar!).getByRole('button', { name: 'Roll Attack (Normal)' }));
    expect(within(history!).getByText('Scimitar Attack')).toBeInTheDocument();
    expect(within(history!).getByText('Manual 2d6 + 3')).toBeInTheDocument();
  });
});
