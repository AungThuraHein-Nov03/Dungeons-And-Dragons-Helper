import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { applyCharacterDamage } from '../services/characterPlayState';
import { createCharacter, getCharacterById } from '../services/characterStorage';
import { fighterInput, LIGHT_CROSSBOW_ID, SCIMITAR_ID } from './fixtures';

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
  const quickStats = within(screen.getByRole('region', { name: 'Combat quick stats' }));
  return within(quickStats.getByLabelText(`${name} resource status`));
}

function featureCard(name: string) {
  const heading = panel('Class Features').getByRole('heading', { name });
  const article = heading.closest('article');
  expect(article).not.toBeNull();
  return within(article!);
}

function hpValue(value: string) {
  const label = panel('Hit Points').getByText('Current');
  expect(within(label.parentElement!).getByText(value)).toBeInTheDocument();
}

describe('Milestone 5 interactive dice flow', () => {
  it('rolls checks, saves, attacks, damage, criticals, Second Wind, and Hit Dice from one sheet', async () => {
    const character = createCharacter(fighterInput({
      name: 'Renethal Dice',
      equipment: { equippedWeaponIds: [SCIMITAR_ID, LIGHT_CROSSBOW_ID] },
      weaponAttackAbilityChoices: { [SCIMITAR_ID]: 'dexterity' },
    }));
    applyCharacterDamage(character.id, 20);

    const randomValues = [
      11 / 20,
      12 / 20,
      6 / 20, 15 / 20,
      13 / 20,
      4 / 6,
      4 / 6, 2 / 6,
      5 / 10,
      6 / 10,
    ];
    let randomIndex = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => randomValues[randomIndex++] ?? 0.5);

    const user = userEvent.setup();
    const first = renderAt(`/characters/${character.id}`);
    hpValue('16');
    await user.click(screen.getByRole('link', { name: 'Character' }));
    randomIndex = 0;

    const perceptionRow = screen.getByText('Perception').closest('article')!;
    await user.click(within(perceptionRow).getByRole('button', { name: 'Roll' }));
    expect(panel('Roll History').getByText('Skill Check — Perception')).toBeInTheDocument();
    expect(panel('Roll History').getByText('Total: 15')).toBeInTheDocument();

    const strengthCard = screen.getByText('Strength').closest('article')!;
    await user.click(within(strengthCard).getByRole('button', { name: 'Save' }));
    expect(panel('Roll History').getByText('Saving Throw — Strength')).toBeInTheDocument();
    expect(panel('Roll History').getByText('Total: 17')).toBeInTheDocument();

    await user.click(within(screen.getByRole('region', { name: 'd20 roll mode' })).getByRole('button', { name: 'Advantage' }));
    await user.click(within(perceptionRow).getByRole('button', { name: 'Roll' }));
    const advantageEntry = panel('Roll History').getByText('Skill Check — Perception · Advantage').closest('article')!;
    expect(within(advantageEntry).getByText('d20: 7, 16')).toBeInTheDocument();
    expect(within(advantageEntry).getByText('Kept: 16')).toBeInTheDocument();
    expect(within(advantageEntry).getByText('Total: 19')).toBeInTheDocument();

    const randomIndexBeforePlayNavigation = randomIndex;
    await user.click(screen.getByRole('link', { name: 'Character Sheet' }));
    randomIndex = randomIndexBeforePlayNavigation;
    const scimitarCard = screen.getByRole('heading', { name: 'Scimitar' }).closest('article')!;
    const scimitarAttackMode = within(within(scimitarCard).getByRole('group', { name: 'Scimitar attack roll mode' }));
    expect(scimitarAttackMode.getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(scimitarCard).getByRole('button', { name: 'Roll Attack (Normal)' }));
    expect(panel('Roll History').getByText('Scimitar Attack')).toBeInTheDocument();
    expect(panel('Roll History').getByText('Total: 20')).toBeInTheDocument();

    await user.click(within(scimitarCard).getByRole('button', { name: 'Roll Damage' }));
    const normalDamage = panel('Roll History').getByText('Scimitar Damage').closest('article')!;
    expect(within(normalDamage).getByText('d6: 5')).toBeInTheDocument();
    expect(within(normalDamage).getByText('Total: 9 Slashing')).toBeInTheDocument();

    await user.click(within(scimitarCard).getByRole('button', { name: 'Critical' }));
    await user.click(within(scimitarCard).getByRole('button', { name: 'Roll Critical Damage' }));
    const criticalDamage = panel('Roll History').getByText('Scimitar Damage — Critical').closest('article')!;
    expect(within(criticalDamage).getByText('d6: 5, 3')).toBeInTheDocument();
    expect(within(criticalDamage).getByText('Modifier: +4')).toBeInTheDocument();
    expect(within(criticalDamage).getByText('Total: 12 Slashing')).toBeInTheDocument();

    await user.click(featureCard('Second Wind').getByRole('button', { name: 'Use Second Wind' }));
    hpValue('26');
    expect(resourceCard('Second Wind').getByText('2')).toBeInTheDocument();
    const secondWindHistory = panel('Roll History').getByText('Second Wind').closest('article')!;
    expect(within(secondWindHistory).getByText('d10: 6')).toBeInTheDocument();
    expect(within(secondWindHistory).getByText('Modifier: +4')).toBeInTheDocument();
    expect(within(secondWindHistory).getByText('HP 16 → 26')).toBeInTheDocument();
    expect(within(secondWindHistory).getByText('Resource 3 → 2')).toBeInTheDocument();

    await user.click(panel('Hit Dice & Rests').getByRole('button', { name: 'Roll & Spend 1d10' }));
    hpValue('35');
    expect(panel('Hit Dice & Rests').getByText('3 / 4 d10')).toBeInTheDocument();
    const hitDieHistory = panel('Roll History').getByText('Hit Die — d10').closest('article')!;
    expect(within(hitDieHistory).getByText('d10: 7')).toBeInTheDocument();
    expect(within(hitDieHistory).getByText('Modifier: +2')).toBeInTheDocument();
    expect(within(hitDieHistory).getByText('HP 26 → 35')).toBeInTheDocument();
    expect(within(hitDieHistory).getByText('Hit Dice 4 → 3')).toBeInTheDocument();

    expect(getCharacterById(character.id)?.playState).toMatchObject({ currentHp: 35, hitDiceRemaining: { 10: 3 } });
    first.unmount();
    renderAt(`/characters/${character.id}`);
    hpValue('35');
    expect(panel('Hit Dice & Rests').getByText('3 / 4 d10')).toBeInTheDocument();
    expect(resourceCard('Second Wind').getByText('2')).toBeInTheDocument();
    expect(panel('Roll History').getByText('Hit Die — d10')).toBeInTheDocument();
  });
});
