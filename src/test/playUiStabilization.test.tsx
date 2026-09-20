import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { srdId } from '../content/srd/source';
import type { CharacterClassProgression } from '../models/character';
import type { ContentId } from '../models/contentId';
import { classProgressionSkillChoiceContext } from '../rules/classProficiencies';
import { createFixedHpProgression } from '../rules/health';
import {
  CHARACTER_STORAGE_KEY,
  createCharacter,
  getCharacterById,
} from '../services/characterStorage';
import { contentRegistry } from '../services/contentRegistry';
import { CHAMPION_ID, FIGHTER_ID, fighterInput } from './fixtures';

const ROGUE_ID = srdId('class', 'rogue');

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function panel(name: string) {
  const heading = screen.getByRole('heading', { name });
  const section = heading.closest('section');
  expect(section).not.toBeNull();
  return within(section!);
}

function expectBefore(first: Element, second: Element) {
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
}

function progression(classId: ContentId, level: number, starting: boolean, subclassId?: ContentId): CharacterClassProgression {
  const classContent = contentRegistry.findClass(classId);
  if (!classContent) throw new Error(`Missing class ${classId}`);
  const skills = classProgressionSkillChoiceContext(classContent, starting);
  return {
    classId,
    level,
    ...(subclassId ? { subclassId } : {}),
    skillProficiencies: [...skills.from.slice(0, skills.choose)],
    hpProgression: createFixedHpProgression(level, starting),
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('PLAY UI stabilization checkpoint', () => {
  it('A/B/C keeps the upper dashboard readable and provides one compact cyclic Character Roll category surface', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({ name: 'Dashboard Ren' }));
    renderAt(`/characters/${character.id}`);

    expect(screen.getByRole('heading', { name: 'Dashboard Ren' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Level Up' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit Character' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Character' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Character Sheet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Character' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inventory' })).toBeInTheDocument();

    const dashboard = screen.getByTestId('play-dashboard');
    const leftDashboard = screen.getByTestId('play-dashboard-left');
    const featuresSurface = within(leftDashboard).getByRole('complementary', { name: 'Class features' });
    const attackRollsSurface = within(leftDashboard).getByRole('heading', { name: 'Attack Rolls' }).closest('section');
    expect(featuresSurface).toBeInTheDocument();
    expect(within(leftDashboard).queryByRole('complementary', { name: 'Class resources' })).not.toBeInTheDocument();
    expect(attackRollsSurface).not.toBeNull();
    expectBefore(featuresSurface, attackRollsSurface!);
    expect(leftDashboard.children[0]).toBe(featuresSurface);
    expect(leftDashboard.children[1]).toBe(attackRollsSurface);
    expect(within(dashboard).getByRole('complementary', { name: 'Dice utility' })).toBeInTheDocument();

    const core = dashboard.querySelector<HTMLElement>('.play-dashboard__core');
    expect(core).not.toBeNull();
    const statsSection = within(core!).getByRole('region', { name: 'Combat quick stats' });
    const hitPointsSection = within(core!).getByRole('heading', { name: 'Hit Points' }).closest('section');
    const initiativeSection = within(core!).getByRole('region', { name: 'Initiative and Cover' });
    const characterRollSection = within(core!).getByRole('heading', { name: 'Ability Checks' }).closest('section');
    const concentrationSection = within(core!).getByRole('heading', { name: 'Concentration' }).closest('section');
    expect(hitPointsSection).not.toBeNull();
    expect(characterRollSection).not.toBeNull();
    expect(concentrationSection).not.toBeNull();
    expectBefore(statsSection, hitPointsSection!);
    expectBefore(hitPointsSection!, initiativeSection);
    expectBefore(initiativeSection, characterRollSection!);
    expectBefore(characterRollSection!, concentrationSection!);

    const lowerContent = screen.getByTestId('play-main-content');
    for (const heading of ['Active Effects', 'Character Conditions', 'Hit Dice & Rests']) {
      expect(lowerContent).toContainElement(screen.getByRole('heading', { name: heading }).closest('section'));
    }
    expect(within(lowerContent).queryByRole('heading', { name: 'Concentration' })).not.toBeInTheDocument();
    expect(within(lowerContent).queryByRole('heading', { name: 'Active Attacks' })).not.toBeInTheDocument();

    const stats = within(statsSection);
    expect(stats.getByText('Initiative')).toBeInTheDocument();
    expect(stats.getByText('Dexterity')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Ability Checks' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Skills' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Saving Throws' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next Character Roll category' }));
    expect(screen.getByRole('heading', { name: 'Skills' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next Character Roll category' }));
    expect(screen.getByRole('heading', { name: 'Saving Throws' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next Character Roll category' }));
    expect(screen.getByRole('heading', { name: 'Ability Checks' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous Character Roll category' }));
    expect(screen.getByRole('heading', { name: 'Saving Throws' })).toBeInTheDocument();
  });

  it('D/E/F renders all authoritative ability, skill, and save modifiers without recalculating them in PLAY', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({ name: 'Modifier Ren' }));
    renderAt(`/characters/${character.id}`);

    const abilities = within(screen.getByRole('group', { name: 'Ability Checks' }));
    const expectedAbilities = [
      ['Strength', '+2'],
      ['Dexterity', '+4'],
      ['Constitution', '+2'],
      ['Intelligence', '+0'],
      ['Wisdom', '+1'],
      ['Charisma', '+2'],
    ];
    for (const [name, modifier] of expectedAbilities) {
      expect(abilities.getByRole('button', { name: new RegExp(`${name}.*\\${modifier}`) })).toBeInTheDocument();
    }

    await user.click(screen.getByRole('button', { name: 'Next Character Roll category' }));
    const skills = within(screen.getByRole('group', { name: 'Skills' }));
    expect(skills.getByRole('button', { name: /Athletics.*\+4/ })).toBeInTheDocument();
    expect(skills.getByRole('button', { name: /Perception.*\+3/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next Character Roll category' }));
    const saves = within(screen.getByRole('group', { name: 'Saving Throws' }));
    expect(saves.getByRole('button', { name: /Strength Save.*\+4/ })).toBeInTheDocument();
    expect(saves.getByRole('button', { name: /Constitution Save.*\+4/ })).toBeInTheDocument();
    expect(saves.getByRole('button', { name: /Dexterity Save.*\+4/ })).toBeInTheDocument();
  });

  it('G preserves Starting-Class-only save proficiency for a multiclass Character', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({
      name: 'Starting Save Ren',
      startingClassId: FIGHTER_ID,
      classProgressions: [
        progression(FIGHTER_ID, 4, true, CHAMPION_ID),
        progression(ROGUE_ID, 2, false),
      ],
    }));
    renderAt(`/characters/${character.id}`);

    await user.click(screen.getByRole('button', { name: 'Previous Character Roll category' }));
    const saves = within(screen.getByRole('group', { name: 'Saving Throws' }));
    const strength = saves.getByRole('button', { name: /Strength Save.*\+5/ });
    const dexterity = saves.getByRole('button', { name: /Dexterity Save.*\+4/ });

    expect(within(strength).getByLabelText('Proficient')).toBeInTheDocument();
    expect(within(dexterity).getByLabelText('Not proficient')).toBeInTheDocument();
  });

  it('H/J/M rolls Athletics with its existing modifier and feeds Latest Result plus Roll History', async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const character = createCharacter(fighterInput({ name: 'Athletics Ren' }));
    const storedBefore = window.localStorage.getItem(CHARACTER_STORAGE_KEY);
    renderAt(`/characters/${character.id}`);

    await user.click(screen.getByRole('button', { name: 'Next Character Roll category' }));
    const skills = within(screen.getByRole('group', { name: 'Skills' }));
    await user.click(skills.getByRole('button', { name: /Athletics.*\+4/ }));
    expect(screen.getByText('Athletics +4')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Roll Athletics' }));

    expect(screen.getByRole('heading', { name: 'Latest: Skill Check — Athletics' })).toBeInTheDocument();
    expect(panel('Roll History').getByText(/^Skill Check — Athletics(?: · Advantage)?$/)).toBeInTheDocument();
    expect(panel('Roll History').getByText('Modifier: +4')).toBeInTheDocument();

    const storedAfter = window.localStorage.getItem(CHARACTER_STORAGE_KEY);
    expect(storedAfter).toBe(storedBefore);
    expect(getCharacterById(character.id)?.playState).toEqual(character.playState);
  });

  it('I/L selects an authoritative saving throw and uses existing disadvantage keep-low behavior', async () => {
    const user = userEvent.setup();
    const values = [0.9, 0.2];
    let index = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => values[index++] ?? 0.5);
    const character = createCharacter(fighterInput({ name: 'Save Ren' }));
    renderAt(`/characters/${character.id}`);

    await user.click(screen.getByRole('button', { name: 'Previous Character Roll category' }));
    const saves = within(screen.getByRole('group', { name: 'Saving Throws' }));
    await user.click(saves.getByRole('button', { name: /Constitution Save.*\+4/ }));

    const mode = within(screen.getByRole('group', { name: 'Character roll mode' }));
    await user.click(mode.getByRole('button', { name: 'Disadvantage' }));
    await user.click(screen.getByRole('button', { name: 'Roll Constitution Save' }));

    const latest = screen.getByRole('heading', { name: 'Latest: Saving Throw — Constitution' }).closest('section');
    expect(latest).not.toBeNull();
    expect(within(latest!).getByText('Kept: 5')).toBeInTheDocument();
    expect(within(latest!).getByText('Modifier: +4')).toBeInTheDocument();
    expect(panel('Roll History').getByText('Saving Throw — Constitution · Disadvantage')).toBeInTheDocument();
  });

  it('K uses existing advantage keep-high behavior for Character Quick Roll', async () => {
    const user = userEvent.setup();
    const values = [0.1, 0.8];
    let index = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => values[index++] ?? 0.5);
    const character = createCharacter(fighterInput({ name: 'Advantage Ren' }));
    renderAt(`/characters/${character.id}`);

    const mode = within(screen.getByRole('group', { name: 'Character roll mode' }));
    await user.click(mode.getByRole('button', { name: 'Advantage' }));
    await user.click(screen.getByRole('button', { name: 'Roll Strength' }));

    const latest = screen.getByRole('heading', { name: 'Latest: Strength Check' }).closest('section');
    expect(latest).not.toBeNull();
    expect(within(latest!).getByText('Kept: 17')).toBeInTheDocument();
    expect(within(latest!).getByText('Modifier: +2')).toBeInTheDocument();
  });

  it('N/O/P/Q keeps generic Dice Tray, Initiative, quick resource status, and M15-B Level Up entry functional', async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const character = createCharacter(fighterInput({ name: 'Utility Ren' }));
    renderAt(`/characters/${character.id}`);

    expect(screen.getByRole('link', { name: 'Level Up' })).toHaveAttribute('href', `/characters/${character.id}/level-up`);

    const featuresRegion = screen.getByRole('complementary', { name: 'Class features' });
    const features = within(featuresRegion);
    expect(featuresRegion.querySelector('.resource-card')).not.toBeInTheDocument();
    expect(featuresRegion.querySelectorAll('.class-feature-row').length).toBeGreaterThan(0);
    const quickStats = within(screen.getByRole('region', { name: 'Combat quick stats' }));
    const actionSurgeFeature = features.getByRole('heading', { name: 'Action Surge' }).closest('article');
    const actionSurgeResource = quickStats.getByLabelText('Action Surge resource status');
    expect(actionSurgeFeature).not.toBeNull();
    expect(actionSurgeResource).toBeInTheDocument();
    await user.click(within(actionSurgeFeature!).getByRole('button', { name: 'Expend Action Surge' }));
    expect(within(actionSurgeResource).getByText('0')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Roll Initiative' }));
    expect(panel('Roll History').getByText(/^Initiative(?: · Advantage)?$/)).toBeInTheDocument();

    const manualModifier = screen.getByLabelText('Modifier');
    await user.clear(manualModifier);
    await user.type(manualModifier, '3');
    await user.click(screen.getByRole('button', { name: 'Roll 1d20' }));
    expect(screen.getByRole('heading', { name: 'Latest: Manual 1d20 + 3' })).toBeInTheDocument();
  });

  it('S leaves Character persistence on v9 shape with no stabilization-specific fields', () => {
    const character = createCharacter(fighterInput({ name: 'Schema Ren' }));
    renderAt(`/characters/${character.id}`);

    const stored = getCharacterById(character.id);
    expect(stored).toBeDefined();
    expect(stored).toHaveProperty('startingClassId');
    expect(stored).toHaveProperty('classProgressions');
    expect(stored).not.toHaveProperty('quickRoll');
    expect(stored).not.toHaveProperty('rollMode');
    expect(stored).not.toHaveProperty('levelUpDraft');
  });
});
