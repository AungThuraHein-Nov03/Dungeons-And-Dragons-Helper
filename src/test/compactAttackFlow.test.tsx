import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { srdId } from '../content/srd';
import type { RegistryInventoryEntry } from '../models/character';
import {
  CHARACTER_STORAGE_KEY,
  createCharacter,
  getCharacterById,
} from '../services/characterStorage';
import { fighterInput, LIGHT_CROSSBOW_ID, SCIMITAR_ID } from './fixtures';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function attackRolls() {
  const heading = screen.getByRole('heading', { name: 'Attack Rolls' });
  const section = heading.closest('section');
  expect(section).not.toBeNull();
  return within(section!);
}

function rollHistory() {
  const heading = screen.getByRole('heading', { name: 'Roll History' });
  const section = heading.closest('section');
  expect(section).not.toBeNull();
  return within(section!);
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('PLAY dashboard Attack Rolls', () => {
  it('D keeps one equipped weapon compact while preserving authoritative attack/damage reference and Details', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({
      name: 'Compact Ren',
      level: 2,
      subclassId: undefined,
      equipment: { equippedWeaponIds: [SCIMITAR_ID] },
      weaponAttackAbilityChoices: { [SCIMITAR_ID]: 'dexterity' },
    }));
    renderAt(`/characters/${character.id}`);

    const attacks = attackRolls();
    expect(attacks.queryByLabelText('Weapon')).not.toBeInTheDocument();
    expect(attacks.getByRole('heading', { name: 'Scimitar' })).toBeInTheDocument();
    expect(attacks.getByText('+6 to hit')).toBeInTheDocument();
    expect(attacks.getByText('1d6 + 4 Slashing')).toBeInTheDocument();
    expect(attacks.getByText('DEX')).toBeInTheDocument();
    expect(attacks.getByText('Nick')).toBeInTheDocument();

    const attackMode = within(attacks.getByRole('group', { name: 'Scimitar attack roll mode' }));
    expect(attackMode.getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'true');
    expect(attackMode.getByRole('button', { name: 'Advantage' })).toBeInTheDocument();
    expect(attackMode.getByRole('button', { name: 'Disadvantage' })).toBeInTheDocument();
    expect(attacks.getByRole('button', { name: 'Roll Attack (Normal)' })).toBeInTheDocument();

    const damageMode = within(attacks.getByLabelText('Scimitar damage mode'));
    expect(damageMode.getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'true');
    expect(damageMode.getByRole('button', { name: 'Critical' })).toBeInTheDocument();
    expect(attacks.getByRole('button', { name: 'Roll Damage' })).toBeInTheDocument();

    const detailsSummary = attacks.getByText('Details');
    const details = detailsSummary.closest('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
    await user.click(detailsSummary);
    expect(details).toHaveAttribute('open');
    expect(attacks.getByText('Proficient')).toBeInTheDocument();
    expect(attacks.getByText('Finesse, Light')).toBeInTheDocument();
    expect(attacks.getByText('Mastery Availability')).toBeInTheDocument();
    expect(attacks.getByText('Available to class progression')).toBeInTheDocument();
  });

  it('E/F/G shows one compact selector for multiple weapons, switches authoritative data, and never persists selection', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({
      name: 'Selector Ren',
      level: 2,
      subclassId: undefined,
      equipment: { equippedWeaponIds: [SCIMITAR_ID, LIGHT_CROSSBOW_ID] },
      weaponAttackAbilityChoices: { [SCIMITAR_ID]: 'dexterity' },
    }));
    const storedBefore = window.localStorage.getItem(CHARACTER_STORAGE_KEY);
    renderAt(`/characters/${character.id}`);

    const attacks = attackRolls();
    const selector = attacks.getByLabelText('Weapon');
    expect(selector).toHaveValue(`test:${SCIMITAR_ID}`);
    expect(within(selector).getAllByRole('option')).toHaveLength(2);
    expect(attacks.getAllByRole('article')).toHaveLength(1);
    expect(attacks.getByRole('heading', { name: 'Scimitar' })).toBeInTheDocument();
    expect(attacks.getByText('1d6 + 4 Slashing')).toBeInTheDocument();

    await user.selectOptions(selector, `test:${LIGHT_CROSSBOW_ID}`);
    expect(attacks.queryByRole('heading', { name: 'Scimitar' })).not.toBeInTheDocument();
    expect(attacks.getByRole('heading', { name: 'Light Crossbow' })).toBeInTheDocument();
    expect(attacks.getByText('+6 to hit')).toBeInTheDocument();
    expect(attacks.getByText('1d8 + 4 Piercing')).toBeInTheDocument();
    expect(attacks.getByText('DEX')).toBeInTheDocument();
    expect(attacks.getByText('Slow')).toBeInTheDocument();
    expect(attacks.getByRole('group', { name: 'Light Crossbow attack roll mode' })).toBeInTheDocument();
    expect(attacks.getByLabelText('Light Crossbow damage mode')).toBeInTheDocument();

    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(storedBefore);
    expect(getCharacterById(character.id)).not.toHaveProperty('selectedAttackId');
    expect(getCharacterById(character.id)).not.toHaveProperty('activeWeaponId');
  });

  it('distinguishes duplicate equipped weapon names in the transient selector without persisting an identity choice', () => {
    const duplicate = (id: string): RegistryInventoryEntry => ({
      id,
      kind: 'registry',
      contentId: SCIMITAR_ID,
      category: 'weapon',
      quantity: 1,
      equipped: true,
      notes: '',
      attackAbilityChoice: 'dexterity',
    });
    const character = createCharacter(fighterInput({
      name: 'Duplicate Ren',
      level: 2,
      subclassId: undefined,
      inventory: [duplicate('duplicate:scimitar:1'), duplicate('duplicate:scimitar:2')],
    }));
    renderAt(`/characters/${character.id}`);

    const selector = attackRolls().getByLabelText('Weapon');
    expect(within(selector).getByRole('option', { name: 'Scimitar (1)' })).toBeInTheDocument();
    expect(within(selector).getByRole('option', { name: 'Scimitar (2)' })).toBeInTheDocument();
    expect(getCharacterById(character.id)).not.toHaveProperty('equippedAttackSelection');
  });

  it('H/I/J reuses normal, advantage, and disadvantage weapon attack execution with Latest Result and Roll History', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({
      name: 'Attack Mode Ren',
      level: 2,
      subclassId: undefined,
      equipment: { equippedWeaponIds: [SCIMITAR_ID] },
      weaponAttackAbilityChoices: { [SCIMITAR_ID]: 'dexterity' },
    }));
    renderAt(`/characters/${character.id}`);
    const attacks = attackRolls();
    const attackMode = within(attacks.getByRole('group', { name: 'Scimitar attack roll mode' }));

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    await user.click(attacks.getByRole('button', { name: 'Roll Attack (Normal)' }));
    expect(screen.getByRole('heading', { name: 'Latest: Scimitar Attack' })).toBeInTheDocument();
    expect(rollHistory().getByText('Scimitar Attack')).toBeInTheDocument();

    vi.restoreAllMocks();
    const advantageValues = [0.1, 0.8];
    let advantageIndex = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => advantageValues[advantageIndex++] ?? 0.5);
    await user.click(attackMode.getByRole('button', { name: 'Advantage' }));
    await user.click(attacks.getByRole('button', { name: 'Roll Attack (Adv)' }));
    let latest = screen.getByRole('heading', { name: 'Latest: Scimitar Attack' }).closest('section');
    expect(latest).not.toBeNull();
    expect(within(latest!).getByText('Kept: 17')).toBeInTheDocument();
    expect(rollHistory().getByText('Scimitar Attack · Advantage')).toBeInTheDocument();

    vi.restoreAllMocks();
    const disadvantageValues = [0.9, 0.2];
    let disadvantageIndex = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => disadvantageValues[disadvantageIndex++] ?? 0.5);
    await user.click(attackMode.getByRole('button', { name: 'Disadvantage' }));
    await user.click(attacks.getByRole('button', { name: 'Roll Attack (Dis)' }));
    latest = screen.getByRole('heading', { name: 'Latest: Scimitar Attack' }).closest('section');
    expect(latest).not.toBeNull();
    expect(within(latest!).getByText('Kept: 5')).toBeInTheDocument();
    expect(rollHistory().getByText('Scimitar Attack · Disadvantage')).toBeInTheDocument();
  });

  it('K/L/M/N reuses normal and critical weapon damage execution with Latest Result and Roll History', async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const character = createCharacter(fighterInput({
      name: 'Damage Ren',
      level: 2,
      subclassId: undefined,
      equipment: { equippedWeaponIds: [SCIMITAR_ID] },
      weaponAttackAbilityChoices: { [SCIMITAR_ID]: 'dexterity' },
    }));
    renderAt(`/characters/${character.id}`);
    const attacks = attackRolls();

    await user.click(attacks.getByRole('button', { name: 'Roll Damage' }));
    let latest = screen.getByRole('heading', { name: 'Latest: Scimitar Damage' }).closest('section');
    expect(latest).not.toBeNull();
    expect(within(latest!).getByText('8')).toBeInTheDocument();
    let historyEntry = rollHistory().getByText('Scimitar Damage').closest('article');
    expect(historyEntry).not.toBeNull();
    expect(within(historyEntry!).getByText('Total: 8 Slashing')).toBeInTheDocument();

    await user.click(within(attacks.getByLabelText('Scimitar damage mode')).getByRole('button', { name: 'Critical' }));
    await user.click(attacks.getByRole('button', { name: 'Roll Critical Damage' }));
    latest = screen.getByRole('heading', { name: 'Latest: Scimitar Damage — Critical' }).closest('section');
    expect(latest).not.toBeNull();
    expect(within(latest!).getByText('12')).toBeInTheDocument();
    historyEntry = rollHistory().getByText('Scimitar Damage — Critical').closest('article');
    expect(historyEntry).not.toBeNull();
    expect(within(historyEntry!).getByText('Total: 12 Slashing')).toBeInTheDocument();
  });

  it('preserves the existing Versatile damage choice and expandable alternate-damage reference for the selected weapon', async () => {
    const quarterstaffId = srdId('weapon', 'quarterstaff');
    const character = createCharacter(fighterInput({
      name: 'Versatile Ren',
      level: 2,
      subclassId: undefined,
      equipment: { equippedWeaponIds: [quarterstaffId] },
    }));
    const user = userEvent.setup();
    renderAt(`/characters/${character.id}`);

    const attacks = attackRolls();
    const configuration = attacks.getByLabelText('Damage configuration');
    expect(configuration).toHaveValue('one-handed');
    await user.selectOptions(configuration, 'two-handed');
    expect(configuration).toHaveValue('two-handed');

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    await user.click(attacks.getByRole('button', { name: 'Roll Damage' }));
    const historyEntry = rollHistory().getByText('Quarterstaff Damage').closest('article');
    expect(historyEntry).not.toBeNull();
    expect(within(historyEntry!).getByText('d8: 5')).toBeInTheDocument();
    expect(within(historyEntry!).getByText('Modifier: +2')).toBeInTheDocument();
    expect(within(historyEntry!).getByText('Total: 7 Bludgeoning')).toBeInTheDocument();

    await user.click(attacks.getByText('Details'));
    expect(attacks.getByText(/one-handed: 1d6 \+ 2 Bludgeoning/)).toBeInTheDocument();
    expect(attacks.getByText(/two-handed: 1d8 \+ 2 Bludgeoning/)).toBeInTheDocument();
  });

  it('O renders a safe compact empty state without attack controls when no weapon is equipped', () => {
    const character = createCharacter(fighterInput({ name: 'Unarmed Dashboard Ren' }));
    renderAt(`/characters/${character.id}`);

    const attacks = attackRolls();
    expect(attacks.getByText('No equipped weapon. Open Inventory to equip one.')).toBeInTheDocument();
    expect(attacks.queryByLabelText('Weapon')).not.toBeInTheDocument();
    expect(attacks.queryByRole('button', { name: /Roll Attack/i })).not.toBeInTheDocument();
    expect(attacks.queryByRole('button', { name: /Roll.*Damage/i })).not.toBeInTheDocument();
  });
});
