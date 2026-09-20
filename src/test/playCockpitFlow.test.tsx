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

function panel(name: string) {
  const heading = screen.getByRole('heading', { name });
  const section = heading.closest('section');
  expect(section).not.toBeNull();
  return within(section!);
}

function hpValue(label: 'Current' | 'Maximum' | 'Temporary', value: string) {
  const labelElement = panel('Hit Points').getByText(label);
  expect(within(labelElement.parentElement!).getByText(value)).toBeInTheDocument();
}

describe('Post-Milestone 6.5 compact PLAY cockpit', () => {
  it('uses compact quick stats and HP controls without the standalone PLAY d20 panel', async () => {
    const character = createCharacter(fighterInput({
      name: 'Cockpit Ren',
      equipment: { equippedWeaponIds: [SCIMITAR_ID] },
      weaponAttackAbilityChoices: { [SCIMITAR_ID]: 'dexterity' },
    }));
    const user = userEvent.setup();
    renderAt(`/characters/${character.id}`);

    const playWorkspace = screen.getByTestId('character-workspace-play');
    const playDashboard = within(playWorkspace).getByTestId('play-dashboard');
    expect(within(playDashboard).queryByRole('complementary', { name: 'Class resources' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Class Resources' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Dice Tray')).toHaveLength(1);

    expect(screen.queryByRole('region', { name: 'd20 roll mode' })).not.toBeInTheDocument();

    const quickStats = within(screen.getByRole('region', { name: 'Combat quick stats' }));
    expect(quickStats.getByText('Armor Class')).toBeInTheDocument();
    expect(quickStats.getByText('14')).toBeInTheDocument();
    expect(quickStats.getByText('Proficiency Bonus')).toBeInTheDocument();
    expect(quickStats.getByText('+2')).toBeInTheDocument();
    expect(quickStats.getByText('Passive Perception')).toBeInTheDocument();
    expect(quickStats.getByText('13')).toBeInTheDocument();
    expect(quickStats.getByLabelText('Second Wind resource status')).toHaveTextContent('Second Wind');
    expect(quickStats.getByLabelText('Second Wind resource status')).toHaveTextContent('3');
    expect(quickStats.getByLabelText('Second Wind resource status')).toHaveTextContent('charges');
    expect(quickStats.getByLabelText('Action Surge resource status')).toBeInTheDocument();

    hpValue('Current', '36');
    hpValue('Maximum', '36');
    hpValue('Temporary', '0');

    await user.type(panel('Hit Points').getByLabelText('Damage amount'), '8');
    await user.click(panel('Hit Points').getByRole('button', { name: 'Take Damage' }));
    hpValue('Current', '28');

    await user.type(panel('Hit Points').getByLabelText('Healing amount'), '3');
    await user.click(panel('Hit Points').getByRole('button', { name: 'Heal' }));
    hpValue('Current', '31');

    await user.type(panel('Hit Points').getByLabelText('Temporary HP amount'), '5');
    await user.click(panel('Hit Points').getByRole('button', { name: 'Set Temp HP' }));
    hpValue('Temporary', '5');
    expect(getCharacterById(character.id)?.playState).toMatchObject({ currentHp: 31, temporaryHp: 5 });

    const manualMode = within(screen.getByRole('group', { name: 'Manual d20 roll mode' }));
    expect(manualMode.getByRole('button', { name: 'Normal' })).toBeInTheDocument();
    expect(manualMode.getByRole('button', { name: 'Advantage' })).toBeInTheDocument();
    expect(manualMode.getByRole('button', { name: 'Disadvantage' })).toBeInTheDocument();
    await user.click(manualMode.getByRole('button', { name: 'Disadvantage' }));
    expect(manualMode.getByRole('button', { name: 'Disadvantage' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps contextual d20 modes for weapons, abilities, skills, and saves while damage mode stays independent', async () => {
    const character = createCharacter(fighterInput({
      name: 'Context Ren',
      equipment: { equippedWeaponIds: [SCIMITAR_ID] },
      weaponAttackAbilityChoices: { [SCIMITAR_ID]: 'dexterity' },
    }));
    const user = userEvent.setup();
    const randomValues = [0.2, 0.8, 0.7, 0.1, 0.4, 0.9, 0.3, 0.6, 0.25, 0.75];
    let randomIndex = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => randomValues[randomIndex++] ?? 0.5);
    renderAt(`/characters/${character.id}`);

    const scimitar = within(screen.getByRole('heading', { name: 'Scimitar' }).closest('article')!);
    const attackMode = within(scimitar.getByRole('group', { name: 'Scimitar attack roll mode' }));
    const damageMode = within(scimitar.getByLabelText('Scimitar damage mode'));

    await user.click(attackMode.getByRole('button', { name: 'Advantage' }));
    expect(damageMode.getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(scimitar.getByRole('button', { name: 'Roll Attack (Adv)' }));
    expect(panel('Roll History').getByText('Scimitar Attack · Advantage')).toBeInTheDocument();

    await user.click(attackMode.getByRole('button', { name: 'Disadvantage' }));
    await user.click(scimitar.getByRole('button', { name: 'Roll Attack (Dis)' }));
    expect(panel('Roll History').getByText('Scimitar Attack · Disadvantage')).toBeInTheDocument();

    await user.click(damageMode.getByRole('button', { name: 'Critical' }));
    expect(attackMode.getByRole('button', { name: 'Disadvantage' })).toHaveAttribute('aria-pressed', 'true');
    expect(scimitar.getByRole('button', { name: 'Roll Critical Damage' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Character' }));
    const contextualMode = within(screen.getByRole('region', { name: 'd20 roll mode' }));
    await user.click(contextualMode.getByRole('button', { name: 'Advantage' }));

    const strength = screen.getByText('Strength').closest('article')!;
    await user.click(within(strength).getByRole('button', { name: 'Check' }));
    expect(panel('Roll History').getByText('Strength Check · Advantage')).toBeInTheDocument();

    await user.click(within(strength).getByRole('button', { name: 'Save' }));
    expect(panel('Roll History').getByText('Saving Throw — Strength · Advantage')).toBeInTheDocument();

    const perception = screen.getByText('Perception').closest('article')!;
    await user.click(within(perception).getByRole('button', { name: 'Roll' }));
    expect(panel('Roll History').getByText('Skill Check — Perception · Advantage')).toBeInTheDocument();
  });
});
