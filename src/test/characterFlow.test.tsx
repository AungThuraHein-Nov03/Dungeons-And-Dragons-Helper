import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { srdId } from '../content/srd';
import { AppRoutes } from '../App';
import { loadCharacters } from '../services/characterStorage';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

describe('Milestone 1 character lifecycle compatibility', () => {
  it('creates, reopens, edits, and deletes a persistent Fighter through the current builder', async () => {
    const user = userEvent.setup();
    const firstRender = renderAt('/');
    await user.click(screen.getByRole('link', { name: 'Create Character' }));
    expect(screen.getByRole('heading', { name: 'Create Character' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Character Name'), 'Aric Vale');
    await user.selectOptions(screen.getByLabelText('Level'), '4');
    await user.selectOptions(screen.getByLabelText(/Subclass/), srdId('subclass', 'fighter:champion'));
    const scores: Record<string, string> = { Strength: '14', Dexterity: '18', Constitution: '14', Intelligence: '10', Wisdom: '12', Charisma: '12' };
    for (const [label, score] of Object.entries(scores)) await user.type(screen.getByLabelText(label), score);
    await user.click(screen.getByLabelText('Athletics'));
    await user.click(screen.getByLabelText('Perception'));
    for (const weapon of ['Dagger', 'Light Crossbow', 'Scimitar', 'Shortsword']) {
      await user.click(screen.getByLabelText(`Fighter Weapon Mastery: ${weapon}`));
    }

    await user.click(screen.getByRole('button', { name: 'Create Character' }));
    expect(await screen.findByRole('heading', { name: 'Aric Vale' })).toBeInTheDocument();
    const pbCard = screen.getByText('Proficiency Bonus').closest('article');
    expect(pbCard).not.toBeNull();
    expect(within(pbCard!).getByText('+2')).toBeInTheDocument();

    const [saved] = loadCharacters();
    expect(saved).toBeDefined();
    expect(saved.classProgressions).toHaveLength(1);
    expect(saved.classProgressions[0]).toMatchObject({ classId: srdId('class', 'fighter'), level: 4 });

    firstRender.unmount();
    renderAt(`/characters/${saved.id}`);
    expect(screen.getByRole('heading', { name: 'Aric Vale' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Characters' }));
    expect(screen.getByRole('heading', { name: 'Characters' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Aric Vale' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Edit Aric Vale' }));
    const nameInput = screen.getByLabelText('Character Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Aric Stone');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(await screen.findByRole('heading', { name: 'Aric Stone' })).toBeInTheDocument();
    expect(loadCharacters()[0].id).toBe(saved.id);

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Delete Character' }));
    expect(screen.getByRole('heading', { name: 'Characters' })).toBeInTheDocument();
    expect(screen.getByText('No characters yet')).toBeInTheDocument();
    expect(loadCharacters()).toEqual([]);
  });
});
