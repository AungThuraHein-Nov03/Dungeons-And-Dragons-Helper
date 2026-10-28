import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { FIGHTER_ACTION_SURGE_RESOURCE_ID, FIGHTER_SECOND_WIND_RESOURCE_ID } from '../content/srd/fighter';
import type { EquipmentContent } from '../models/content';
import { createContentRegistry, publishContentRegistry } from '../services/contentRegistry';
import { getCharacterById, createCharacter, updateCharacterPlayState } from '../services/characterStorage';
import { fighterInput } from './fixtures';

const TRAVELER_KIT: EquipmentContent = {
  id: 'homebrew:test:equipment:traveler-kit',
  kind: 'equipment',
  name: "Traveler's Kit",
  source: { type: 'homebrew', namespace: 'test' },
  category: 'campaign-item',
  description: 'A compact kit for long roads.',
  referenceEffects: ['Keeps one traveler supplied for three days.'],
  cost: { amount: 2, unit: 'gp' },
  weightPounds: 2.5,
};

afterEach(() => {
  vi.restoreAllMocks();
  publishContentRegistry(createContentRegistry());
});

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function summaryCard(label: string) {
  const card = screen.getByText(label).closest('article');
  expect(card).not.toBeNull();
  return within(card!);
}

function inventoryCard(name: string) {
  const heading = screen.getByRole('heading', { name });
  const card = heading.closest('article');
  expect(card).not.toBeNull();
  return within(card!);
}

async function addRegistryItem(user: ReturnType<typeof userEvent.setup>, name: string) {
  const search = screen.getByLabelText('Search registry items');
  await user.clear(search);
  await user.type(search, name);
  const results = screen.getByRole('region', { name: 'Registry item results' });
  const label = within(results).getByText(name);
  const row = label.closest<HTMLElement>('.inventory-add-row');
  expect(row).not.toBeNull();
  await user.click(within(row!).getByRole('button', { name: 'Add' }));
}

describe('Milestone 6 Inventory flow', () => {
  it('discovers canonical combat gear and miscellaneous equipment while keeping equip actions kind-safe', async () => {
    publishContentRegistry(createContentRegistry([TRAVELER_KIT]));
    const character = createCharacter(fighterInput({
      name: 'Renethal Gear',
      inventory: [],
    }));
    const user = userEvent.setup();

    renderAt(`/characters/${character.id}/inventory`);

    await addRegistryItem(user, 'Scimitar');
    await addRegistryItem(user, 'Chain Mail');
    await user.selectOptions(screen.getByLabelText('Registry category'), 'campaign-item');
    await user.clear(screen.getByLabelText('Search registry items'));
    const results = within(screen.getByRole('region', { name: 'Registry item results' }));
    expect(results.getByText(TRAVELER_KIT.name)).toBeInTheDocument();
    expect(results.queryByText('Scimitar')).not.toBeInTheDocument();
    expect(results.queryByText('Chain Mail')).not.toBeInTheDocument();
    await addRegistryItem(user, TRAVELER_KIT.name);

    expect(inventoryCard('Scimitar').getByRole('button', { name: 'Equip' })).toBeInTheDocument();
    expect(inventoryCard('Chain Mail').getByRole('button', { name: 'Equip' })).toBeInTheDocument();
    const kit = inventoryCard(TRAVELER_KIT.name);
    expect(kit.getByText('Type')).toBeInTheDocument();
    expect(kit.getAllByText('Campaign Item')).toHaveLength(2);
    expect(kit.getByText('2.5 lb.')).toBeInTheDocument();
    expect(kit.getByText(TRAVELER_KIT.description)).toBeInTheDocument();
    expect(kit.getByText(TRAVELER_KIT.referenceEffects[0])).toBeInTheDocument();
    expect(kit.queryByRole('button', { name: 'Equip' })).not.toBeInTheDocument();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(kit.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByRole('heading', { name: TRAVELER_KIT.name })).not.toBeInTheDocument();
  });

  it('drives armor, shield, weapon, notes, dice, persistence, and play-state preservation from Inventory', async () => {
    const character = createCharacter(fighterInput({ name: 'Renethal Inventory', inventory: [] }));
    updateCharacterPlayState(character.id, {
      ...character.playState,
      currentHp: 20,
      hitDiceRemaining: { 10: 3 },
      resourceUses: {
        [FIGHTER_SECOND_WIND_RESOURCE_ID]: 2,
        [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 0,
      },
    });
    vi.spyOn(Math, 'random').mockReturnValue(13 / 20);
    const user = userEvent.setup();
    const first = renderAt(`/characters/${character.id}/inventory`);

    await addRegistryItem(user, 'Chain Mail');
    await user.click(inventoryCard('Chain Mail').getByRole('button', { name: 'Equip' }));
    await user.click(screen.getByRole('link', { name: 'Character Sheet' }));
    expect(summaryCard('Armor Class').getByText('16')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Inventory' }));
    await addRegistryItem(user, 'Shield');
    await user.click(inventoryCard('Shield').getByRole('button', { name: 'Equip' }));
    await user.click(screen.getByRole('link', { name: 'Character Sheet' }));
    expect(summaryCard('Armor Class').getByText('18')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Inventory' }));
    await addRegistryItem(user, 'Scimitar');
    await addRegistryItem(user, 'Light Crossbow');
    await user.click(inventoryCard('Scimitar').getByRole('button', { name: 'Equip' }));
    await user.click(screen.getByRole('link', { name: 'Character Sheet' }));
    const scimitar = screen.getByRole('heading', { name: 'Scimitar' }).closest('article');
    expect(scimitar).not.toBeNull();
    expect(within(scimitar!).getByText('+6 to hit')).toBeInTheDocument();
    await user.click(within(scimitar!).getByRole('button', { name: 'Roll Attack (Normal)' }));
    expect(screen.getByText('Scimitar Attack')).toBeInTheDocument();
    expect(screen.getByText('Total: 20')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Inventory' }));
    await user.click(inventoryCard('Scimitar').getByRole('button', { name: 'Unequip' }));
    await user.click(inventoryCard('Light Crossbow').getByRole('button', { name: 'Equip' }));

    const chainMail = inventoryCard('Chain Mail');
    const notes = chainMail.getByLabelText('Notes');
    await user.type(notes, 'Left shoulder badly scratched.');
    await user.click(chainMail.getByRole('button', { name: 'Save Notes' }));

    await user.click(screen.getByRole('link', { name: 'Character Sheet' }));
    expect(screen.queryByRole('heading', { name: 'Scimitar' })).not.toBeInTheDocument();
    const crossbow = screen.getByRole('heading', { name: 'Light Crossbow' }).closest('article');
    expect(crossbow).not.toBeNull();
    expect(within(crossbow!).getByText('+6 to hit')).toBeInTheDocument();
    expect(screen.getByText('Scimitar Attack')).toBeInTheDocument();

    const saved = getCharacterById(character.id)!;
    expect(saved.playState).toMatchObject({
      currentHp: 20,
      hitDiceRemaining: { 10: 3 },
      resourceUses: {
        [FIGHTER_SECOND_WIND_RESOURCE_ID]: 2,
        [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 0,
      },
    });

    first.unmount();
    renderAt(`/characters/${character.id}/inventory`);
    const refreshedChain = inventoryCard('Chain Mail');
    expect(refreshedChain.getByLabelText('Notes')).toHaveValue('Left shoulder badly scratched.');
    expect(refreshedChain.getByRole('button', { name: 'Unequip' })).toBeInTheDocument();
    expect(inventoryCard('Shield').getByRole('button', { name: 'Unequip' })).toBeInTheDocument();
    expect(inventoryCard('Light Crossbow').getByRole('button', { name: 'Unequip' })).toBeInTheDocument();
    expect(inventoryCard('Scimitar').getByRole('button', { name: 'Equip' })).toBeInTheDocument();
    expect(getCharacterById(character.id)?.playState.currentHp).toBe(20);
  }, 15_000);
});
