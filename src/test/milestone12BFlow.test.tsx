import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { PALADIN_LAY_ON_HANDS_RESOURCE_ID } from '../content/srd/paladin';
import { srdId } from '../content/srd/source';
import { CHARACTER_STORAGE_KEY, createCharacter } from '../services/characterStorage';
import { fighterInput } from './fixtures';

function renderAt(path: string) { return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>); }

describe('Milestone 12B Character integration', () => {
  it('shows Paladin provider-scoped fixed spells on CHARACTER and a bounded numeric Lay On Hands pool on PLAY', () => {
    const character = createCharacter(fighterInput({
      name: 'M12B Paladin',
      classId: srdId('class', 'paladin'),
      subclassId: srdId('subclass', 'paladin:oath-of-devotion'),
      level: 5,
      skillProficiencies: ['athletics', 'medicine'],
      abilityScores: { charisma: 16 },
    }));

    const characterView = renderAt(`/characters/${character.id}/character`);
    expect(screen.getByRole('heading', { name: 'Paladin Spellcasting' })).toBeInTheDocument();
    for (const spell of ['Divine Smite', 'Find Steed', 'Protection from Evil and Good', 'Shield of Faith', 'Aid', 'Zone of Truth']) {
      expect(screen.getByRole('heading', { name: spell })).toBeInTheDocument();
    }
    expect(screen.getAllByText(/Always prepared:/)).toHaveLength(6);
    expect(screen.getByText(/After a Long Rest, one prepared spell may be replaced/)).toBeInTheDocument();
    expect(screen.getByText('Prepared-from-list selections')).toBeInTheDocument();
    characterView.unmount();

    renderAt(`/characters/${character.id}`);
    const features = within(screen.getByRole('complementary', { name: 'Class features' }));
    const quickStats = within(screen.getByRole('region', { name: 'Combat quick stats' }));
    expect(features.getByRole('heading', { name: 'Lay On Hands' })).toBeInTheDocument();
    expect(features.getByLabelText('Lay On Hands amount')).toHaveValue(1);
    expect(quickStats.getByLabelText('Lay On Hands resource status')).toHaveTextContent('25');
    expect(quickStats.getByLabelText('Lay On Hands resource status')).toHaveTextContent('remaining');
    expect(character.playState.resourceUses[PALADIN_LAY_ON_HANDS_RESOURCE_ID]).toBe(25);
    expect(screen.queryByText(/Sacred Weapon target/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hunter.?s Mark target/i)).not.toBeInTheDocument();
  });

  it('keeps M12B persistence on Character v7 with no prepared/known spell or class-specific state fields', () => {
    const character = createCharacter(fighterInput({
      name: 'M12B Ranger',
      classId: srdId('class', 'ranger'),
      subclassId: srdId('subclass', 'ranger:hunter'),
      level: 14,
      skillProficiencies: ['athletics', 'perception', 'stealth'],
      abilityScores: { wisdom: 18 },
    }));
    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v10');
    const stored = JSON.parse(window.localStorage.getItem(CHARACTER_STORAGE_KEY) ?? '[]') as Array<Record<string, unknown>>;
    const record = stored.find((entry) => entry.id === character.id);
    expect(record).toBeDefined();
    for (const field of ['preparedSpells', 'knownSpells', 'spellbook', 'hunterMarkTarget', 'concentration', 'sacredWeapon', 'auraState', 'expertise']) {
      expect(record).not.toHaveProperty(field);
    }
    expect(record).toHaveProperty('spellcastingSelections', []);
    expect(record).toHaveProperty('playState.resourceUses');
  });
});
