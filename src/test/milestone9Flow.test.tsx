import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { srdId } from '../content/srd';
import { createCharacter, LEGACY_CHARACTER_STORAGE_V6_KEY, loadCharacters } from '../services/characterStorage';
import { fighterCharacter, fighterInput } from './fixtures';

function renderAt(path: string) { return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>); }

describe('Milestone 9 subclass Character integration', () => {
  it('requires an explicit subclass after the Fighter threshold and never defaults Champion', async () => {
    const user = userEvent.setup();
    renderAt('/characters/new');
    const subclass = screen.getByLabelText(/Subclass/) as HTMLSelectElement;
    expect(subclass).toBeDisabled();
    expect(subclass.value).toBe('');
    await user.selectOptions(screen.getByLabelText('Level'), '3');
    expect(subclass).toBeEnabled();
    expect(subclass.value).toBe('');
    expect(within(subclass).getByRole('option', { name: 'Choose a subclass' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create Character' }));
    expect(screen.getByText('Choose a subclass.')).toBeInTheDocument();
    await user.selectOptions(subclass, srdId('subclass', 'fighter:champion'));
    expect(subclass.value).toBe(srdId('subclass', 'fighter:champion'));
  });

  it('clears Champion if level falls below acquisition and keeps it explicit when eligible', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({ level: 4 }));
    renderAt(`/characters/${character.id}/edit`);
    const subclass = screen.getByLabelText(/Subclass/) as HTMLSelectElement;
    expect(subclass.value).toBe(srdId('subclass', 'fighter:champion'));
    await user.selectOptions(screen.getByLabelText('Level'), '2');
    expect(subclass.value).toBe('');
    expect(subclass).toBeDisabled();
  });

  it('renders acquired and future Champion progression distinctly on CHARACTER', () => {
    const character = createCharacter(fighterInput({ level: 6, name: 'Champion Reference' }));
    renderAt(`/characters/${character.id}/character`);
    const section = screen.getByRole('heading', { name: 'Subclass progression' }).closest('section');
    expect(section).not.toBeNull();
    const view = within(section!);
    expect(view.getByText('Champion')).toBeInTheDocument();
    expect(view.getByText(/SRD 5\.2\.1/)).toBeInTheDocument();
    expect(view.getByText('Fighter')).toBeInTheDocument();
    expect(view.getByRole('heading', { name: 'Improved Critical' })).toBeInTheDocument();
    expect(view.getByRole('heading', { name: 'Remarkable Athlete' })).toBeInTheDocument();
    expect(view.getByText(/Advantage on Athletics checks/)).toBeInTheDocument();
    expect(view.getByText(/Weapon Critical Hit threshold: 19–20/)).toBeInTheDocument();
    expect(view.getByText(/Unarmed Strike critical range remains reference-only/)).toBeInTheDocument();
    const future = view.getByRole('heading', { name: 'Additional Fighting Style' }).closest('article');
    expect(future).not.toBeNull();
    expect(within(future!).getByText(/Future · Level 7/)).toBeInTheDocument();
    expect(within(future!).getByText(/Reference only until acquired/)).toBeInTheDocument();
  });

  it('keeps migrated unresolved level-3+ Fighter explicitly legacy-unselected through unrelated edits', async () => {
    const user = userEvent.setup();
    const { subclassId, ...legacy } = fighterCharacter({ name: 'Legacy M8 Fighter', level: 4 });
    void subclassId;
    window.localStorage.setItem(LEGACY_CHARACTER_STORAGE_V6_KEY, JSON.stringify([legacy]));
    renderAt(`/characters/${legacy.id}/edit`);
    const subclass = screen.getByLabelText(/Subclass/) as HTMLSelectElement;
    expect(subclass.value).toBe('');
    expect(within(subclass).getByRole('option', { name: 'Unselected (legacy)' })).toBeInTheDocument();
    expect(screen.getByText(/predates subclass selection/)).toBeInTheDocument();
    const name = screen.getByLabelText('Character Name');
    await user.clear(name);
    await user.type(name, 'Legacy M8 Edited');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    const [saved] = loadCharacters();
    expect(saved.name).toBe('Legacy M8 Edited');
    expect(saved.subclassId).toBeUndefined();
  });
});
