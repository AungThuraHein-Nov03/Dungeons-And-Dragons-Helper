import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { srdId } from '../content/srd/source';
import {
  CHARACTER_STORAGE_KEY,
  createCharacter,
  getCharacterById,
} from '../services/characterStorage';
import { fighterInput } from './fixtures';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

async function completeFighterLevel4Mastery(user: ReturnType<typeof userEvent.setup>) {
  const nextMastery = screen.getAllByRole('checkbox', { name: /^Fighter Weapon Mastery:/i })
    .find((checkbox) => !(checkbox as HTMLInputElement).checked && !checkbox.hasAttribute('disabled'));
  if (!nextMastery) throw new Error('Expected one available fourth Fighter Weapon Mastery choice.');
  await user.click(nextMastery);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('Milestone 15-D Advancement Choices Level Up flow', () => {
  it('A skips an empty Advancement Choices step when the gained owner level has no M15-D requirement', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({
      name: 'M15-D No Choice',
      level: 1,
      subclassId: undefined,
    }));

    renderAt(`/characters/${character.id}/level-up`);
    await user.click(screen.getByRole('radio', { name: /Fighter.*Level 1.*Level 2/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));

    expect(screen.getByRole('status')).toHaveTextContent('Core choices complete.');
    expect(screen.getByText(/Advancement Choices:/).closest('p')).toHaveTextContent('none required for Fighter class level 2');
    expect(screen.queryByRole('button', { name: 'Next: Advancement Choices' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Choose advancement type' })).not.toBeInTheDocument();
  });

  it('B/C/D guides Fighter 3 -> 4 through explicit ASI +2 and keeps the saved Character byte-for-byte unchanged', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({
      name: 'M15-D ASI Draft',
      level: 3,
    }));
    const persistedBefore = window.localStorage.getItem(CHARACTER_STORAGE_KEY);

    renderAt(`/characters/${character.id}/level-up`);
    await user.click(screen.getByRole('radio', { name: /Fighter.*Level 3.*Level 4/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));
    await completeFighterLevel4Mastery(user);
    expect(screen.getByRole('status')).toHaveTextContent('Core choices complete.');

    await user.click(screen.getByRole('button', { name: 'Next: Advancement Choices' }));
    expect(screen.getByText('Step 3 · Advancement Choices')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ability Score Improvement' })).toBeInTheDocument();
    expect(screen.getByText(/Fighter class level 3 → 4 grants this feat decision/)).toBeInTheDocument();

    const pathChoice = screen.getByRole('radio', { name: /Ability Score Improvement.*Increase one ability score by 2/i });
    await user.click(pathChoice);
    await user.selectOptions(screen.getByLabelText('Ability Score Increase 1'), 'constitution');
    await user.selectOptions(screen.getByLabelText('Ability Score Increase 2'), 'constitution');

    expect(screen.getByRole('status')).toHaveTextContent('Advancement choices complete.');
    expect(screen.getByLabelText('Constitution candidate ability score')).toHaveTextContent('14 → 16');
    expect(screen.queryByRole('button', { name: /confirm|save/i })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(persistedBefore);
    expect(getCharacterById(character.id)?.manualFeats).toEqual(character.manualFeats);
    expect(getCharacterById(character.id)?.abilityScores).toEqual(character.abilityScores);

    await user.click(screen.getByRole('link', { name: 'Cancel' }));
    expect(screen.getByTestId('character-workspace-play')).toBeInTheDocument();
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(persistedBefore);
  });

  it('D shows valid +1/+1 resulting candidate scores', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({
      name: 'M15-D Split ASI',
      level: 3,
    }));

    renderAt(`/characters/${character.id}/level-up`);
    await user.click(screen.getByRole('radio', { name: /Fighter.*Level 3.*Level 4/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));
    await completeFighterLevel4Mastery(user);
    await user.click(screen.getByRole('button', { name: 'Next: Advancement Choices' }));
    await user.click(screen.getByRole('radio', { name: /Ability Score Improvement.*Increase one ability score by 2/i }));

    await user.selectOptions(screen.getByLabelText('Ability Score Increase 1'), 'constitution');
    await user.selectOptions(screen.getByLabelText('Ability Score Increase 2'), 'wisdom');

    expect(screen.getByLabelText('Constitution candidate ability score')).toHaveTextContent('14 → 15');
    expect(screen.getByLabelText('Wisdom candidate ability score')).toHaveTextContent('12 → 13');
    expect(screen.getByRole('status')).toHaveTextContent('Advancement choices complete.');
  });

  it('E exposes only safe feat options and resolves Grappler through its structured ability choice', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({
      name: 'M15-D Feat Draft',
      level: 3,
    }));
    const persistedBefore = window.localStorage.getItem(CHARACTER_STORAGE_KEY);

    renderAt(`/characters/${character.id}/level-up`);
    await user.click(screen.getByRole('radio', { name: /Fighter.*Level 3.*Level 4/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));
    await completeFighterLevel4Mastery(user);
    await user.click(screen.getByRole('button', { name: 'Next: Advancement Choices' }));

    await user.click(screen.getByRole('radio', { name: /^FeatChoose another mechanically eligible General feat/i }));
    const select = screen.getByLabelText('Feat selection');
    expect(within(select).getByRole('option', { name: /Grappler/ })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: /Archery/ })).not.toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: /Magic Initiate/ })).not.toBeInTheDocument();

    await user.selectOptions(select, srdId('feat', 'grappler'));
    expect(screen.getByRole('heading', { name: 'Grappler' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Ability Score Increase'), 'strength');

    expect(screen.getByRole('status')).toHaveTextContent('Advancement choices complete.');
    expect(screen.getByLabelText('Strength candidate ability score')).toHaveTextContent('14 → 15');
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(persistedBefore);
  });

  it('H/I preserves Back but clears stale M15-D state after a target switch and Cancel remains zero-persistence', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({
      name: 'M15-D Target Switch',
      level: 3,
      abilityScores: { intelligence: 12 },
    }));
    const persistedBefore = window.localStorage.getItem(CHARACTER_STORAGE_KEY);

    renderAt(`/characters/${character.id}/level-up`);
    await user.click(screen.getByRole('radio', { name: /Fighter.*Level 3.*Level 4/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));
    await completeFighterLevel4Mastery(user);
    await user.click(screen.getByRole('button', { name: 'Next: Advancement Choices' }));
    await user.click(screen.getByRole('radio', { name: /Ability Score Improvement.*Increase one ability score by 2/i }));
    await user.selectOptions(screen.getByLabelText('Ability Score Increase 1'), 'constitution');
    await user.selectOptions(screen.getByLabelText('Ability Score Increase 2'), 'constitution');
    expect(screen.getByLabelText('Constitution candidate ability score')).toHaveTextContent('14 → 16');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Next: Advancement Choices' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));

    await user.click(screen.getByRole('radio', { name: /Wizard.*Add at class level 1/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));

    expect(screen.getByText(/Advancement Choices:/).closest('p')).toHaveTextContent('none required for Wizard class level 1');
    expect(screen.queryByRole('button', { name: 'Next: Advancement Choices' })).not.toBeInTheDocument();
    expect(screen.queryByText('14 → 16')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(persistedBefore);

    await user.click(screen.getByRole('link', { name: 'Cancel' }));
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(persistedBefore);
  });
});
