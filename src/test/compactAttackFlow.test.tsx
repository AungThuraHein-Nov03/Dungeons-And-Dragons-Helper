import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { srdId } from '../content/srd';
import { createCharacter } from '../services/characterStorage';
import { fighterInput, LIGHT_CROSSBOW_ID, SCIMITAR_ID } from './fixtures';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function attackCard(name: string) {
  const heading = screen.getByRole('heading', { name });
  const card = heading.closest('article');
  expect(card).not.toBeNull();
  return within(card!);
}

describe('Post-Milestone 6.5 compact Active Attacks', () => {
  it('keeps ordinary equipped attacks compact while preserving rolling and expandable reference details', async () => {
    const character = createCharacter(fighterInput({
      name: 'Compact Ren',
      equipment: { equippedWeaponIds: [SCIMITAR_ID, LIGHT_CROSSBOW_ID] },
      weaponAttackAbilityChoices: { [SCIMITAR_ID]: 'dexterity' },
    }));
    const user = userEvent.setup();
    renderAt(`/characters/${character.id}`);

    const scimitar = attackCard('Scimitar');
    expect(scimitar.getByText('+6 to hit')).toBeInTheDocument();
    expect(scimitar.getByText('1d6 + 4 Slashing')).toBeInTheDocument();
    expect(scimitar.getByText('DEX')).toBeInTheDocument();
    expect(scimitar.getByText('Nick')).toBeInTheDocument();
    const attackMode = within(scimitar.getByRole('group', { name: 'Scimitar attack roll mode' }));
    expect(attackMode.getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'true');
    expect(attackMode.getByRole('button', { name: 'Advantage' })).toBeInTheDocument();
    expect(attackMode.getByRole('button', { name: 'Disadvantage' })).toBeInTheDocument();
    expect(scimitar.getByRole('button', { name: 'Roll Attack (Normal)' })).toBeInTheDocument();
    expect(within(scimitar.getByLabelText('Scimitar damage mode')).getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'true');
    expect(scimitar.getByRole('button', { name: 'Critical' })).toBeInTheDocument();
    expect(scimitar.getByRole('button', { name: 'Roll Damage' })).toBeInTheDocument();

    const crossbow = attackCard('Light Crossbow');
    expect(crossbow.getByText('+6 to hit')).toBeInTheDocument();
    expect(crossbow.getByText('1d8 + 4 Piercing')).toBeInTheDocument();
    expect(crossbow.getByText('DEX')).toBeInTheDocument();
    expect(crossbow.getByText('Slow')).toBeInTheDocument();

    const detailsSummary = scimitar.getByText('Details');
    const details = detailsSummary.closest('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
    await user.click(detailsSummary);
    expect(details).toHaveAttribute('open');
    expect(scimitar.getByText('Proficient')).toBeInTheDocument();
    expect(scimitar.getByText('Finesse, Light')).toBeInTheDocument();
    expect(scimitar.getByText('Mastery Availability')).toBeInTheDocument();
    expect(scimitar.getByText('Available to class progression')).toBeInTheDocument();

    vi.spyOn(Math, 'random').mockReturnValue(13 / 20);
    await user.click(scimitar.getByRole('button', { name: 'Roll Attack (Normal)' }));
    expect(screen.getByText('Scimitar Attack')).toBeInTheDocument();
    expect(screen.getByText('Total: 20')).toBeInTheDocument();
  });

  it('keeps the existing Versatile damage choice immediately accessible and lists alternate damage in Details', async () => {
    const quarterstaffId = srdId('weapon', 'quarterstaff');
    const character = createCharacter(fighterInput({
      name: 'Versatile Ren',
      equipment: { equippedWeaponIds: [quarterstaffId] },
    }));
    const user = userEvent.setup();
    renderAt(`/characters/${character.id}`);

    const quarterstaff = attackCard('Quarterstaff');
    const configuration = quarterstaff.getByLabelText('Damage configuration');
    expect(configuration).toBeInTheDocument();
    expect(configuration).toHaveValue('one-handed');
    await user.selectOptions(configuration, 'two-handed');
    expect(configuration).toHaveValue('two-handed');

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    await user.click(quarterstaff.getByRole('button', { name: 'Roll Damage' }));
    const historyEntry = screen.getByText('Quarterstaff Damage').closest('article');
    expect(historyEntry).not.toBeNull();
    expect(within(historyEntry!).getByText('d8: 5')).toBeInTheDocument();
    expect(within(historyEntry!).getByText('Modifier: +2')).toBeInTheDocument();
    expect(within(historyEntry!).getByText('Total: 7 Bludgeoning')).toBeInTheDocument();

    await user.click(quarterstaff.getByText('Details'));
    expect(quarterstaff.getByText(/one-handed: 1d6 \+ 2 Bludgeoning/)).toBeInTheDocument();
    expect(quarterstaff.getByText(/two-handed: 1d8 \+ 2 Bludgeoning/)).toBeInTheDocument();
  });
});
