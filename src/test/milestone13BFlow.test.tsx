import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App';
import { SRD_CLASSES, SRD_FEATS, SRD_SPELLS, SRD_SUBCLASSES } from '../content/srd';
import { srdId } from '../content/srd/source';
import { WIZARD_SPELLCASTING_PROVIDER_ID } from '../content/srd/wizard';
import { contentRegistry } from '../services/contentRegistry';
import { CHARACTER_STORAGE_KEY, createCharacter, getCharacterById } from '../services/characterStorage';
import { loadPlaySessionState, playSessionStorageKey } from '../services/playSessionState';
import { fighterInput, SCIMITAR_ID } from './fixtures';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function panel(name: string) {
  const heading = screen.getByRole('heading', { name });
  const section = heading.closest('section');
  if (!section) throw new Error('Missing panel: ' + name);
  return within(section);
}

function wizardInput() {
  const wizardId = srdId('class', 'wizard');
  const wizardSpells = contentRegistry.getAll('spell').filter((spell) => spell.spellLists.some((list) => list.id === 'wizard'));
  const cantrips = wizardSpells.filter((spell) => spell.level === 0).slice(0, 3);
  const levelOne = wizardSpells.filter((spell) => spell.level === 1);
  const concentration = levelOne.filter((spell) => spell.concentration);
  const ordinary = levelOne.filter((spell) => !spell.concentration);
  if (cantrips.length < 3 || concentration.length < 2 || ordinary.length < 4) throw new Error('Wizard M13B spell fixtures unavailable.');
  const owned = [concentration[0], concentration[1], ...ordinary.slice(0, 4)];
  const prepared = [concentration[0], concentration[1], ordinary[0], ordinary[1]];
  return {
    input: fighterInput({
      name: 'M13B Wizard',
      classId: wizardId,
      subclassId: undefined,
      level: 1,
      skillProficiencies: ['history', 'insight'],
      abilityScores: { intelligence: 16, wisdom: 14, constitution: 14 },
      spellcastingSelections: [{
        providerId: WIZARD_SPELLCASTING_PROVIDER_ID,
        cantripIds: cantrips.map((spell) => spell.id),
        ownedSpellIds: owned.map((spell) => spell.id),
        preparedSpellIds: prepared.map((spell) => spell.id),
      }],
    }),
    concentration,
  };
}

describe('Milestone 13B Character-side Conditions and Concentration flow', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('persists Poisoned only in session state, keeps Cover ephemeral, and resolves Champion automatic Advantage against condition Disadvantage', async () => {
    const character = createCharacter(fighterInput({
      name: 'M13B Champion',
      equipment: { equippedWeaponIds: [SCIMITAR_ID] },
      weaponAttackAbilityChoices: { [SCIMITAR_ID]: 'dexterity' },
    }));
    const originalCharacterStorage = localStorage.getItem(CHARACTER_STORAGE_KEY);
    const user = userEvent.setup();
    const first = renderAt('/characters/' + character.id);

    const conditions = panel('Character Conditions');
    await user.selectOptions(conditions.getByLabelText('Add condition'), 'poisoned');
    await user.click(conditions.getByRole('button', { name: 'Add' }));
    expect(conditions.getByRole('heading', { name: 'Poisoned' })).toBeInTheDocument();

    const cover = within(screen.getByRole('group', { name: 'Cover' }));
    await user.click(cover.getByRole('button', { name: 'Half +2' }));
    const rawSession = sessionStorage.getItem(playSessionStorageKey(character.id))!;
    expect(rawSession).toContain('poisoned');
    expect(rawSession).not.toContain('cover');
    expect(JSON.parse(rawSession).activeEffectIds).toEqual([]);
    expect(localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(originalCharacterStorage);

    first.unmount();
    renderAt('/characters/' + character.id);
    expect(panel('Character Conditions').getByRole('heading', { name: 'Poisoned' })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Cover' })).getByRole('button', { name: 'None' })).toHaveAttribute('aria-pressed', 'true');

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const scimitar = screen.getByRole('heading', { name: 'Scimitar' }).closest('article')!;
    const attackMode = within(scimitar).getByRole('group', { name: 'Scimitar attack roll mode' });
    await user.click(within(attackMode).getByRole('button', { name: 'Advantage' }));
    await user.click(within(scimitar).getByRole('button', { name: /Roll Attack/ }));
    const attackHistory = panel('Roll History').getByText('Scimitar Attack').closest('article')!;
    expect(within(attackHistory).getByText('Manual: Advantage · Final: Normal')).toBeInTheDocument();
    expect(within(attackHistory).getByText('Disadvantage: Poisoned')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Character' }));
    const athletics = screen.getByText('Athletics').closest('article')!;
    await user.click(within(athletics).getByRole('button', { name: 'Roll' }));
    const athleticsHistory = panel('Roll History').getByText('Skill Check — Athletics').closest('article')!;
    expect(within(athleticsHistory).getByText('Manual: Normal · Final: Normal')).toBeInTheDocument();
    expect(within(athleticsHistory).getByText('Advantage: Remarkable Athlete')).toBeInTheDocument();
    expect(within(athleticsHistory).getByText('Disadvantage: Poisoned')).toBeInTheDocument();

    const constitution = screen.getByText('Constitution').closest('article')!;
    await user.click(within(constitution).getByRole('button', { name: 'Save' }));
    const saveHistory = panel('Roll History').getByText('Saving Throw — Constitution').closest('article')!;
    expect(within(saveHistory).queryByText(/Poisoned/)).not.toBeInTheDocument();

    const stored = getCharacterById(character.id)!;
    expect(Object.keys(stored.playState).sort()).toEqual(['currentHp', 'hitDiceRemaining', 'resourceUses', 'temporaryHp']);
    expect(stored).not.toHaveProperty('conditions');
    expect(stored).not.toHaveProperty('concentration');
  });

  it('starts, replaces, reloads, saves, ends, and breaks bundled Wizard Concentration without modifying Character persistence', async () => {
    const fixture = wizardInput();
    const character = createCharacter(fixture.input);
    const originalCharacterStorage = localStorage.getItem(CHARACTER_STORAGE_KEY);
    const originalSlots = { ...getCharacterById(character.id)!.playState.resourceUses };
    const user = userEvent.setup();
    const first = renderAt('/characters/' + character.id);
    const concentration = panel('Concentration');

    const firstSpell = fixture.concentration[0];
    const secondSpell = fixture.concentration[1];
    await user.selectOptions(concentration.getByLabelText('Concentration spell'), WIZARD_SPELLCASTING_PROVIDER_ID + '::' + firstSpell.id);
    await user.click(concentration.getByRole('button', { name: 'Start Concentration' }));
    expect(concentration.getByText(firstSpell.name + ' · Wizard Spellcasting', { selector: 'strong' })).toBeInTheDocument();

    await user.selectOptions(concentration.getByLabelText('Concentration spell'), WIZARD_SPELLCASTING_PROVIDER_ID + '::' + secondSpell.id);
    await user.click(concentration.getByRole('button', { name: 'Replace Concentration' }));
    expect(concentration.getByText(secondSpell.name + ' · Wizard Spellcasting', { selector: 'strong' })).toBeInTheDocument();
    expect(loadPlaySessionState(character.id).concentration?.spellId).toBe(secondSpell.id);

    first.unmount();
    renderAt('/characters/' + character.id);
    expect(panel('Concentration').getByText(secondSpell.name + ' · Wizard Spellcasting', { selector: 'strong' })).toBeInTheDocument();

    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    const concentrationAfterReload = panel('Concentration');
    await user.type(concentrationAfterReload.getByLabelText('Damage taken'), '22');
    await user.click(concentrationAfterReload.getByRole('button', { name: 'Roll Concentration Save' }));
    expect(concentrationAfterReload.getByText('Failure:').closest('p')).toHaveTextContent('vs DC 11');
    expect(concentrationAfterReload.getByText('None')).toBeInTheDocument();
    expect(panel('Roll History').getByText('Concentration Save · DC 11')).toBeInTheDocument();

    vi.restoreAllMocks();
    await user.selectOptions(concentrationAfterReload.getByLabelText('Concentration spell'), WIZARD_SPELLCASTING_PROVIDER_ID + '::' + firstSpell.id);
    await user.click(concentrationAfterReload.getByRole('button', { name: 'Start Concentration' }));
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    await user.clear(concentrationAfterReload.getByLabelText('Damage taken'));
    await user.type(concentrationAfterReload.getByLabelText('Damage taken'), '1');
    await user.click(concentrationAfterReload.getByRole('button', { name: 'Roll Concentration Save' }));
    expect(concentrationAfterReload.getByText('Success:').closest('p')).toHaveTextContent('vs DC 10');
    expect(concentrationAfterReload.getByText(firstSpell.name + ' · Wizard Spellcasting', { selector: 'strong' })).toBeInTheDocument();

    const conditions = panel('Character Conditions');
    await user.selectOptions(conditions.getByLabelText('Add condition'), 'stunned');
    await user.click(conditions.getByRole('button', { name: 'Add' }));
    expect(conditions.getByRole('heading', { name: 'Stunned' })).toBeInTheDocument();
    expect(panel('Concentration').getByText('None')).toBeInTheDocument();

    await user.click(conditions.getByRole('button', { name: 'Remove' }));
    await user.selectOptions(panel('Concentration').getByLabelText('Concentration spell'), WIZARD_SPELLCASTING_PROVIDER_ID + '::' + firstSpell.id);
    await user.click(panel('Concentration').getByRole('button', { name: 'Start Concentration' }));
    await user.click(panel('Concentration').getByRole('button', { name: 'End Concentration' }));
    expect(panel('Concentration').getByText('None')).toBeInTheDocument();

    expect(localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(originalCharacterStorage);
    expect(getCharacterById(character.id)!.playState.resourceUses).toEqual(originalSlots);
  });

  it('keeps session state isolated, clears it on Character deletion, and preserves locked M13A/M12E boundaries', async () => {
    const first = createCharacter(fighterInput({ name: 'Session A' }));
    const second = createCharacter(fighterInput({ name: 'Session B' }));
    const user = userEvent.setup();
    const firstRender = renderAt('/characters/' + first.id);

    await user.selectOptions(panel('Character Conditions').getByLabelText('Add condition'), 'blinded');
    await user.click(panel('Character Conditions').getByRole('button', { name: 'Add' }));
    expect(loadPlaySessionState(first.id).conditions).toEqual(['blinded']);
    expect(loadPlaySessionState(second.id)).toEqual({ conditions: [], activeEffectIds: [] });
    firstRender.unmount();

    const secondRender = renderAt('/characters/' + second.id);
    expect(panel('Character Conditions').queryByRole('heading', { name: 'Blinded' })).not.toBeInTheDocument();
    secondRender.unmount();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAt('/characters/' + first.id);
    await user.click(screen.getByRole('button', { name: 'Delete Character' }));
    expect(sessionStorage.getItem(playSessionStorageKey(first.id))).toBeNull();

    expect(SRD_CLASSES).toHaveLength(12);
    expect(SRD_SUBCLASSES).toHaveLength(12);
    expect(SRD_SPELLS).toHaveLength(339);
    expect(SRD_FEATS).toHaveLength(17);
    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v10');
  });
});
