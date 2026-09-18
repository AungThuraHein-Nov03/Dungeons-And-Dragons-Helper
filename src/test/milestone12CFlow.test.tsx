import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { DRUID_WILD_SHAPE_RESOURCE_ID } from '../content/srd/druid';
import { MONK_FOCUS_RESOURCE_ID } from '../content/srd/monk';
import { srdId } from '../content/srd/source';
import { CHARACTER_STORAGE_KEY, createCharacter, getCharacterById } from '../services/characterStorage';
import { fighterInput } from './fixtures';

function renderAt(path: string) { return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>); }

describe('Milestone 12C Character and PLAY integration', () => {
  it('shows Druid Spellcasting and shared Wild Shape bookkeeping without adding transformation or land-choice state', () => {
    const character = createCharacter(fighterInput({
      name: 'M12C Druid',
      classId: srdId('class', 'druid'),
      subclassId: srdId('subclass', 'druid:circle-of-the-land'),
      level: 3,
      skillProficiencies: ['arcana', 'perception'],
      abilityScores: { wisdom: 18 },
    }));

    const referenceView = renderAt(`/characters/${character.id}/character`);
    expect(screen.getByRole('heading', { name: 'Druid Spellcasting' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Speak with Animals' })).toBeInTheDocument();
    expect(screen.getByText(/This provider does not persist or infer its prepared selections/)).toBeInTheDocument();
    referenceView.unmount();

    renderAt(`/characters/${character.id}`);
    const resources = screen.getByRole('complementary', { name: 'Class resources' });
    const wildShapeCard = within(resources).getByRole('heading', { name: 'Wild Shape' }).closest('article');
    expect(wildShapeCard).not.toBeNull();
    expect(within(wildShapeCard!).getByText('2 / 2')).toBeInTheDocument();
    expect(within(resources).getByRole('button', { name: 'Expend Wild Shape' })).toBeInTheDocument();
    expect(within(resources).getByRole('button', { name: 'Expend for Wild Companion (Wild Shape use)' })).toBeInTheDocument();
    expect(within(resources).getByRole('button', { name: 'Expend for Land’s Aid' })).toBeInTheDocument();
    expect(character.playState.resourceUses[DRUID_WILD_SHAPE_RESOURCE_ID]).toBe(2);

    const stored = JSON.parse(window.localStorage.getItem(CHARACTER_STORAGE_KEY) ?? '[]') as Array<Record<string, unknown>>;
    const record = stored.find((entry) => entry.id === character.id);
    for (const field of ['wildShapeForm', 'wildShapeState', 'landChoice', 'circleLand', 'preparedSpells', 'knownSpells']) expect(record).not.toHaveProperty(field);
  });

  it('renders fixed Focus costs and the bounded Superior Defense mode while persisting only the shared v8 resource counter', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({
      name: 'M12C Monk',
      classId: srdId('class', 'monk'),
      subclassId: srdId('subclass', 'monk:warrior-of-the-open-hand'),
      level: 18,
      skillProficiencies: ['acrobatics', 'stealth'],
      abilityScores: { dexterity: 18, wisdom: 18 },
    }));

    renderAt(`/characters/${character.id}`);
    const resources = screen.getByRole('complementary', { name: 'Class resources' });
    expect(within(resources).getByRole('heading', { name: 'Focus Points' })).toBeInTheDocument();
    expect(within(resources).getByText('18 / 18')).toBeInTheDocument();
    expect(within(resources).queryByRole('button', { name: 'Expend 3 for Superior Defense' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activate Superior Defense' })).toBeInTheDocument();
    const quiveringPalm = within(resources).getByRole('button', { name: 'Expend 4 for Quivering Palm' });
    await user.click(quiveringPalm);
    expect(within(resources).getByText('14 / 18')).toBeInTheDocument();
    expect(getCharacterById(character.id)?.playState.resourceUses[MONK_FOCUS_RESOURCE_ID]).toBe(14);

    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v8');
    const stored = JSON.parse(window.localStorage.getItem(CHARACTER_STORAGE_KEY) ?? '[]') as Array<Record<string, unknown>>;
    const record = stored.find((entry) => entry.id === character.id);
    for (const field of ['focusPoints', 'quiveringPalmTarget', 'quiveringPalmState', 'wholenessOfBodyUses', 'openHandTechnique', 'combatantState', 'targetState']) expect(record).not.toHaveProperty(field);
    expect(record).toHaveProperty('playState.resourceUses');
  });
});
