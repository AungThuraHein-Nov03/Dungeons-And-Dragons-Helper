import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { createCharacter, getCharacterById } from '../services/characterStorage';
import { fighterInput } from './fixtures';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function panel(name: string) {
  const heading = screen.getByRole('heading', { name });
  const section = heading.closest('section');
  expect(section).not.toBeNull();
  return within(section!);
}

function resourceCard(name: string) {
  const heading = screen.getByRole('heading', { name });
  const article = heading.closest('article');
  expect(article).not.toBeNull();
  return within(article!);
}

function hpValue(label: 'Current' | 'Maximum' | 'Temporary', value: string) {
  const labelElement = panel('Hit Points').getByText(label);
  const container = labelElement.parentElement;
  expect(container).not.toBeNull();
  expect(within(container!).getByText(value)).toBeInTheDocument();
}

describe('Milestone 4 live play-state flow', () => {
  it('persists HP and runs Temp HP, resources, Hit Dice, Short Rest, and Long Rest through the sheet', async () => {
    const character = createCharacter(fighterInput({ name: 'Renethal Play' }));
    const user = userEvent.setup();
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.5).mockReturnValueOnce(0.6);
    const first = renderAt(`/characters/${character.id}`);

    hpValue('Current', '36');
    hpValue('Maximum', '36');
    hpValue('Temporary', '0');
    expect(panel('Hit Dice & Rests').getByText('4 / 4 d10')).toBeInTheDocument();
    expect(resourceCard('Second Wind').getByText('3 / 3')).toBeInTheDocument();
    expect(resourceCard('Second Wind').getByText(/Used by: Second Wind, Tactical Mind/)).toBeInTheDocument();
    expect(resourceCard('Action Surge').getByText('1 / 1')).toBeInTheDocument();

    await user.type(panel('Hit Points').getByLabelText('Damage amount'), '8');
    await user.click(panel('Hit Points').getByRole('button', { name: 'Take Damage' }));
    hpValue('Current', '28');

    first.unmount();
    renderAt(`/characters/${character.id}`);
    hpValue('Current', '28');
    expect(getCharacterById(character.id)?.playState.currentHp).toBe(28);

    await user.type(panel('Hit Points').getByLabelText('Temporary HP amount'), '5');
    await user.click(panel('Hit Points').getByRole('button', { name: 'Set Temp HP' }));
    hpValue('Temporary', '5');

    await user.type(panel('Hit Points').getByLabelText('Damage amount'), '8');
    await user.click(panel('Hit Points').getByRole('button', { name: 'Take Damage' }));
    hpValue('Temporary', '0');
    hpValue('Current', '25');

    await user.type(panel('Hit Points').getByLabelText('Healing amount'), '6');
    await user.click(panel('Hit Points').getByRole('button', { name: 'Heal' }));
    hpValue('Current', '31');

    await user.click(resourceCard('Second Wind').getByRole('button', { name: 'Use Second Wind' }));
    hpValue('Current', '36');
    expect(resourceCard('Second Wind').getByText('2 / 3')).toBeInTheDocument();

    await user.click(resourceCard('Second Wind').getByRole('button', { name: 'Expend for Tactical Mind' }));
    expect(resourceCard('Second Wind').getByText('1 / 3')).toBeInTheDocument();

    await user.click(resourceCard('Action Surge').getByRole('button', { name: 'Expend Action Surge' }));
    expect(resourceCard('Action Surge').getByText('0 / 1')).toBeInTheDocument();

    await user.type(panel('Hit Points').getByLabelText('Damage amount'), '16');
    await user.click(panel('Hit Points').getByRole('button', { name: 'Take Damage' }));
    hpValue('Current', '20');

    await user.click(panel('Hit Dice & Rests').getByRole('button', { name: 'Roll & Spend 1d10' }));
    hpValue('Current', '29');
    expect(panel('Hit Dice & Rests').getByText('3 / 4 d10')).toBeInTheDocument();

    await user.click(panel('Hit Dice & Rests').getByRole('button', { name: 'Finish Short Rest' }));
    expect(resourceCard('Second Wind').getByText('2 / 3')).toBeInTheDocument();
    expect(resourceCard('Action Surge').getByText('1 / 1')).toBeInTheDocument();

    await user.type(panel('Hit Points').getByLabelText('Temporary HP amount'), '4');
    await user.click(panel('Hit Points').getByRole('button', { name: 'Set Temp HP' }));
    hpValue('Temporary', '4');

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(panel('Hit Dice & Rests').getByRole('button', { name: 'Long Rest' }));
    hpValue('Current', '36');
    hpValue('Temporary', '0');
    expect(panel('Hit Dice & Rests').getByText('4 / 4 d10')).toBeInTheDocument();
    expect(resourceCard('Second Wind').getByText('3 / 3')).toBeInTheDocument();
    expect(resourceCard('Action Surge').getByText('1 / 1')).toBeInTheDocument();
  });
});
