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

  it('keeps migrated unresolved level-3+ Fighter explicit and blocks unrelated save until v10 choices are reconciled', async () => {
    const user = userEvent.setup();
    const current = fighterCharacter({ name: 'Legacy M8 Fighter', level: 4 });
    const progression = current.classProgressions.find((entry) => entry.classId === srdId('class', 'fighter'));
    if (!progression) throw new Error('Expected Fighter progression fixture.');
    const legacy = {
      id: current.id,
      name: current.name,
      classId: progression.classId,
      ...(current.speciesId ? { speciesId: current.speciesId } : {}),
      ...(current.backgroundId ? { backgroundId: current.backgroundId } : {}),
      ...(current.speciesSize ? { speciesSize: current.speciesSize } : {}),
      speciesChoices: { ...current.speciesChoices },
      speciesSkillProficiencies: [...current.speciesSkillProficiencies],
      ...(current.backgroundAbilityChoice ? { backgroundAbilityChoice: { ...current.backgroundAbilityChoice } } : {}),
      ...(current.backgroundToolChoice ? { backgroundToolChoice: current.backgroundToolChoice } : {}),
      ...(current.backgroundEquipmentChoice ? { backgroundEquipmentChoice: current.backgroundEquipmentChoice } : {}),
      manualFeats: current.manualFeats.map((selection) => ({ ...selection, choices: structuredClone(selection.choices) })),
      level: progression.level,
      abilityScores: { ...current.abilityScores },
      skillProficiencies: [...progression.skillProficiencies],
      inventory: current.inventory.map((entry) => ({ ...entry })),
      currency: { ...current.currency },
      hpProgression: progression.hpProgression.map((entry) => entry.method === 'fixed'
        ? { level: entry.classLevel, method: 'fixed' as const }
        : { level: entry.classLevel, method: 'rolled' as const, roll: entry.roll }),
      playState: {
        currentHp: current.playState.currentHp,
        temporaryHp: current.playState.temporaryHp,
        hitDiceRemaining: current.playState.hitDiceRemaining[10] ?? 0,
        resourceUses: { ...current.playState.resourceUses },
      },
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
    };
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
    expect(screen.getByText('Choose exactly 4 Fighter Weapon Masteries.')).toBeInTheDocument();
    const [saved] = loadCharacters();
    expect(saved.name).toBe('Legacy M8 Fighter');
    expect(saved.classProgressions.find((entry) => entry.classId === legacy.classId)?.subclassId).toBeUndefined();
  });
});
