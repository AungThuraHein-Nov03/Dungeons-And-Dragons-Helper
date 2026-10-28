import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import {
  CHARACTER_STORAGE_KEY,
  createCharacter,
  getCharacterById,
} from '../services/characterStorage';
import { fighterInput } from './fixtures';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function section(name: string) {
  const heading = screen.getByRole('heading', { name });
  const element = heading.closest('section');
  expect(element).not.toBeNull();
  return within(element!);
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('Milestone 15-C Core Choices Level Up flow', () => {
  it('A/B guides Fighter 2 -> 3 through HP and explicit subclass selection without saving', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({
      name: 'M15-C Champion Draft',
      level: 2,
      subclassId: undefined,
    }));
    const persistedBefore = window.localStorage.getItem(CHARACTER_STORAGE_KEY);

    renderAt(`/characters/${character.id}/level-up`);
    expect(screen.getByRole('heading', { name: 'Level 2' })).toBeInTheDocument();
    expect(screen.getByText(/Resulting Level:/)).toHaveTextContent('3');

    await user.click(screen.getByRole('radio', { name: /Fighter.*Level 2.*Level 3/i }));
    expect(screen.getByRole('heading', { name: 'Advance Fighter by 1 level' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));

    expect(screen.getByRole('heading', { name: 'Hit Points' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Subclass' })).toBeInTheDocument();
    expect(screen.getByText(/Still required:/)).toHaveTextContent('Hit Points');
    expect(screen.getByText(/Still required:/)).toHaveTextContent('Subclass');

    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));
    const subclass = section('Subclass');
    expect(subclass.getByRole('radio', { name: /Champion/i })).not.toBeChecked();
    await user.click(subclass.getByRole('radio', { name: /Champion/i }));

    expect(screen.getByRole('status')).toHaveTextContent('Core choices complete.');
    expect(screen.queryByRole('button', { name: /confirm|save/i })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(persistedBefore);
    expect(getCharacterById(character.id)?.classProgressions).toEqual(character.classProgressions);

    await user.click(screen.getByRole('link', { name: 'Cancel' }));
    expect(screen.getByTestId('character-workspace-play')).toBeInTheDocument();
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(persistedBefore);
  });

  it('D/E handles an added Rogue skill choice and clears Rogue-specific draft state after Back + target switch', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({
      name: 'M15-C Rogue Draft',
      level: 2,
      subclassId: undefined,
      abilityScores: { dexterity: 14 },
    }));
    const persistedBefore = window.localStorage.getItem(CHARACTER_STORAGE_KEY);

    renderAt(`/characters/${character.id}/level-up`);
    await user.click(screen.getByRole('radio', { name: /Rogue.*Add at class level 1/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));

    expect(screen.getByText(/Added Rogue class level 1 uses ordinary added-level HP/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Added-class skills' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));

    const skills = section('Added-class skills');
    expect(skills.getByText('0 / 1 selected.')).toBeInTheDocument();
    await user.click(skills.getByLabelText('Acrobatics'));
    expect(skills.getByText('1 / 1 selected.')).toBeInTheDocument();

    const expertise = section('Rogue Expertise').getAllByRole('checkbox');
    await user.click(expertise[0]);
    await user.click(expertise[1]);

    const rogueMasteries = section('Rogue Weapon Mastery').getAllByRole('checkbox')
      .filter((checkbox) => !checkbox.hasAttribute('disabled'));
    await user.click(rogueMasteries[0]);
    await user.click(rogueMasteries[1]);

    await user.click(section('Additional language').getAllByRole('checkbox')[0]);
    expect(screen.getByRole('status')).toHaveTextContent('Core choices complete.');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('radio', { name: /Rogue.*Add at class level 1/i })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: /Fighter.*Level 2.*Level 3/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));

    expect(screen.getByRole('heading', { name: 'Subclass' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Added-class skills' })).not.toBeInTheDocument();
    expect(screen.getByText(/Still required:/)).toHaveTextContent('Hit Points');
    expect(screen.getByText(/Still required:/)).toHaveTextContent('Subclass');
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(persistedBefore);
  });

  it('G rolls HP once and preserves the displayed draft roll through Back/Next navigation', async () => {
    const user = userEvent.setup();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const character = createCharacter(fighterInput({
      name: 'M15-C Rolled HP',
      level: 1,
      subclassId: undefined,
    }));
    const persistedBefore = window.localStorage.getItem(CHARACTER_STORAGE_KEY);

    renderAt(`/characters/${character.id}/level-up`);
    await user.click(screen.getByRole('radio', { name: /Fighter.*Level 1.*Level 2/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: 'Roll d10' }));

    expect(screen.getByText(/Rolled HP:/)).toHaveTextContent('6');
    expect(random).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));

    expect(screen.getByText(/Rolled HP:/)).toHaveTextContent('6');
    expect(random).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(persistedBefore);
  });

  it('D presents no added-class skill section when the authoritative multiclass package grants none', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({
      name: 'M15-C Wizard Draft',
      abilityScores: { intelligence: 13 },
    }));

    renderAt(`/characters/${character.id}/level-up`);
    await user.click(screen.getByRole('radio', { name: /Wizard.*Add at class level 1/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));

    expect(screen.getByRole('heading', { name: 'Hit Points' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Subclass' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Added-class skills' })).not.toBeInTheDocument();
    expect(screen.getByText(/Added Wizard class level 1 uses ordinary added-level HP/)).toBeInTheDocument();
  });
});
