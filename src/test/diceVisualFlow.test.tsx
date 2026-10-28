import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { clearDiceVisualEvent, getDiceVisualEventSnapshot } from '../dice/diceVisualEvent';
import { createCharacter } from '../services/characterStorage';
import { fighterInput, SCIMITAR_ID } from './fixtures';

vi.mock('../components/DiceRollOverlay3D', () => ({
  default: ({ event }: { readonly event: { readonly title: string; readonly dice: readonly unknown[] } }) => (
    <div aria-label={`Visual dice animation: ${event.title}`} data-dice-count={event.dice.length} />
  ),
}));

afterEach(() => {
  const current = getDiceVisualEventSnapshot();
  if (current) act(() => clearDiceVisualEvent(current.id));
  vi.unstubAllGlobals();
});

describe('existing roll flows trigger the shared visual overlay', () => {
  it('renders the authoritative result directly for reduced-motion users without invoking the physics overlay', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const character = createCharacter(fighterInput({ name: 'Reduced Motion Dice' }));
    const user = userEvent.setup();
    const { container } = render(<MemoryRouter initialEntries={[`/characters/${character.id}`]}><App /></MemoryRouter>);

    const diceUtility = within(screen.getByRole('complementary', { name: 'Dice utility' }));
    await user.click(diceUtility.getByRole('button', { name: 'Roll 1d20' }));

    await waitFor(() => expect(container.querySelector('.dice-roll-overlay__reduced-die')).not.toBeNull());
    const event = getDiceVisualEventSnapshot();
    const reduced = container.querySelector('.dice-roll-overlay__reduced-die');
    expect(event?.dice).toHaveLength(1);
    expect(reduced?.textContent).toBe(String(event?.dice[0]?.value));
    expect(container.querySelector('[aria-label^="Visual dice animation:"]')).toBeNull();
  });

  it('routes Dice Tray and weapon rolls through the same mounted overlay host', async () => {
    const character = createCharacter(fighterInput({
      name: 'Visual Dice Flow',
      equipment: { equippedWeaponIds: [SCIMITAR_ID] },
      weaponAttackAbilityChoices: { [SCIMITAR_ID]: 'dexterity' },
    }));
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={[`/characters/${character.id}`]}><App /></MemoryRouter>);

    const diceUtility = within(screen.getByRole('complementary', { name: 'Dice utility' }));
    await user.click(diceUtility.getByRole('button', { name: 'Roll 1d20' }));
    expect(await screen.findByLabelText('Visual dice animation: Manual 1d20')).toHaveAttribute('data-dice-count', '1');

    const attacksHeading = screen.getByRole('heading', { name: 'Attack Rolls' });
    const attacksPanel = within(attacksHeading.closest('section')!);
    await user.click(attacksPanel.getByRole('button', { name: 'Roll Damage' }));
    expect(await screen.findByLabelText('Visual dice animation: Scimitar Damage')).toHaveAttribute('data-dice-count', '1');
  });
});
