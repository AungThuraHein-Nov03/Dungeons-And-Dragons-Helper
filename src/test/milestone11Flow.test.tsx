import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { srdId } from '../content/srd';
import type { InventoryEntry } from '../models/character';
import { CHARACTER_STORAGE_KEY, createCharacter, loadCharacters } from '../services/characterStorage';
import { fighterInput } from './fixtures';

function renderAt(path: string) { return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>); }

const rogueId = srdId('class', 'rogue');
const clericId = srdId('class', 'cleric');
const lifeDomainId = srdId('subclass', 'cleric:life-domain');

function keepsakeInventory(): InventoryEntry[] {
  return [{ id: 'test:keepsake', kind: 'custom', name: 'Keepsake', category: 'other', quantity: 1, notes: 'Must survive a class edit.' }];
}

describe('Milestone 11 multi-Class Character integration', () => {
  it('keeps legal skills, clears incompatible subclass state, and surfaces an impossible old HP roll without repairing it', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({
      name: 'Class Switch Validation',
      level: 2,
      hpProgression: [{ classLevel: 2, method: 'rolled', roll: 10 }],
      inventory: keepsakeInventory(),
    }));
    renderAt(`/characters/${character.id}/edit`);

    await user.selectOptions(screen.getByLabelText('Class'), rogueId);
    expect((screen.getByLabelText(/Subclass/) as HTMLSelectElement).value).toBe('');
    expect(screen.getByLabelText('Athletics')).toBeChecked();
    expect(screen.getByLabelText('Perception')).toBeChecked();
    const oldRoll = screen.getByLabelText('d8 result') as HTMLInputElement;
    expect(oldRoll.value).toBe('10');
    expect(oldRoll.max).toBe('8');

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(screen.getByText('Choose exactly 4 Rogue skills.')).toBeInTheDocument();
    expect(screen.getByText('Rolled HP for class level 2 must be a whole number from 1 to 8.')).toBeInTheDocument();
    expect(oldRoll.value).toBe('10');
  });

  it('persists a valid class switch while preserving Inventory and reconciling obsolete Fighter resources away', async () => {
    const user = userEvent.setup();
    const originalInventory = keepsakeInventory();
    const character = createCharacter(fighterInput({ name: 'Class Switch Save', level: 2, inventory: originalInventory }));
    expect(Object.keys(character.playState.resourceUses).length).toBeGreaterThan(0);
    renderAt(`/characters/${character.id}/edit`);

    await user.selectOptions(screen.getByLabelText('Class'), rogueId);
    await user.click(screen.getByLabelText('Investigation'));
    await user.click(screen.getByLabelText('Stealth'));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    const [saved] = loadCharacters();
    const savedProgression = saved.classProgressions.find((entry) => entry.classId === rogueId);
    expect(savedProgression).toBeDefined();
    expect(savedProgression?.subclassId).toBeUndefined();
    expect(savedProgression?.skillProficiencies).toEqual(['athletics', 'perception', 'investigation', 'stealth']);
    expect(saved.inventory).toEqual(originalInventory);
    expect(saved.playState.resourceUses).toEqual({});
  });

  it('shows generic Cleric Class progression and prepared metadata on CHARACTER while PLAY stays structurally unchanged', () => {
    const character = createCharacter(fighterInput({
      name: 'M11 Cleric UI',
      classId: clericId,
      subclassId: lifeDomainId,
      level: 6,
      skillProficiencies: ['insight', 'medicine'],
      abilityScores: { wisdom: 16 },
    }));
    const characterView = renderAt(`/characters/${character.id}/character`);
    const classSection = screen.getByRole('heading', { name: 'Class progression' }).closest('section');
    expect(classSection).not.toBeNull();
    expect(within(classSection!).getByText('Cleric')).toBeInTheDocument();
    expect(within(classSection!).getByRole('heading', { name: 'Spellcasting' })).toBeInTheDocument();
    expect(within(classSection!).getByRole('heading', { name: 'Channel Divinity' })).toBeInTheDocument();
    expect(screen.getByText('Prepared-from-list selections')).toBeInTheDocument();
    expect(screen.getByText(/Cantrips: None selected · limit 4/)).toBeInTheDocument();
    expect(screen.getByText(/Prepared leveled spells: None prepared · limit 10/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Spell Attack' })).not.toBeInTheDocument();
    const subclassSection = screen.getByRole('heading', { name: 'Subclass progression' }).closest('section');
    expect(subclassSection).not.toBeNull();
    expect(within(subclassSection!).getByText('Life Domain')).toBeInTheDocument();
    characterView.unmount();

    renderAt(`/characters/${character.id}`);
    expect(screen.queryByRole('heading', { name: 'Spellcasting' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Attack Rolls' })).toBeInTheDocument();
  });

  it('keeps the M11 non-Wizard boundary under current v8 persistence without class-specific build fields', () => {
    const character = createCharacter(fighterInput({
      name: 'M11 Cleric Persistence',
      classId: clericId,
      subclassId: lifeDomainId,
      level: 3,
      skillProficiencies: ['insight', 'medicine'],
    }));
    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v9');
    const stored = JSON.parse(window.localStorage.getItem(CHARACTER_STORAGE_KEY) ?? '[]') as Array<Record<string, unknown>>;
    expect(stored[0].id).toBe(character.id);
    expect(stored[0]).not.toHaveProperty('preparedSpells');
    expect(stored[0]).not.toHaveProperty('knownSpells');
    expect(stored[0]).not.toHaveProperty('divineOrder');
    expect(stored[0]).not.toHaveProperty('expertise');
    expect(stored[0]).not.toHaveProperty('primalKnowledge');
    expect(stored[0]).not.toHaveProperty('spellcasting');
    expect(stored[0]).toHaveProperty('spellcastingSelections', []);
    expect(stored[0]).toHaveProperty('playState.resourceUses');
  });

  it('preserves the four M11 Classes through the expanded Compendium and generic detail view', () => {
    const list = renderAt('/compendium/classes');
    for (const name of ['Fighter', 'Barbarian', 'Cleric', 'Rogue']) expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Wizard' })).toBeInTheDocument();
    list.unmount();

    renderAt(`/compendium/classes/${encodeURIComponent(clericId)}`);
    expect(screen.getByRole('heading', { name: 'Cleric' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Class providers' })).toBeInTheDocument();
    expect(screen.getByText(/Wisdom · prepared from cleric list · Cleric Spell Slots/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Life Domain' })).toBeInTheDocument();
  });
});
