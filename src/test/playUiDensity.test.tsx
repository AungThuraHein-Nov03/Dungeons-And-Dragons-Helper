import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { srdId } from '../content/srd/source';
import { BARBARIAN_RAGE_RESOURCE_ID } from '../content/srd/barbarian';
import {
  CHARACTER_STORAGE_KEY,
  createCharacter,
  getCharacterById,
} from '../services/characterStorage';
import { fighterInput } from './fixtures';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function panel(name: string) {
  const heading = screen.getByRole('heading', { name });
  const section = heading.closest('section');
  expect(section).not.toBeNull();
  return within(section!);
}

function barbarianInput() {
  return fighterInput({
    name: 'Density Barbarian',
    classId: srdId('class', 'barbarian'),
    subclassId: undefined,
    level: 2,
    skillProficiencies: ['athletics', 'survival'],
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('PLAY lower-content density and disclosure', () => {
  it('A-F separates Rage feature action, resource status, and active-effect state while keeping Details non-persistent', async () => {
    const user = userEvent.setup();
    const character = createCharacter(barbarianInput());
    const storedBeforeDisclosure = window.localStorage.getItem(CHARACTER_STORAGE_KEY);
    renderAt(`/characters/${character.id}`);

    const features = panel('Class Features');
    const quickStats = within(screen.getByRole('region', { name: 'Combat quick stats' }));
    const effects = panel('Active Effects');

    const rageFeatureHeading = features.getByRole('heading', { name: 'Rage' });
    const rageFeatureCard = rageFeatureHeading.closest('article');
    expect(rageFeatureCard).not.toBeNull();
    expect(rageFeatureCard).toHaveClass('class-feature-row');
    expect(rageFeatureCard).not.toHaveClass('resource-card');
    const rageFeature = within(rageFeatureCard!);

    const rageResourceCard = quickStats.getByLabelText('Rage resource status');
    const rageResource = within(rageResourceCard);

    expect(rageFeature.getByText('Bonus Action')).toBeVisible();
    expect(rageFeature.getByRole('button', { name: 'Activate Rage' })).toBeVisible();
    expect(rageResource.getByText('2')).toBeVisible();
    expect(rageResource.getByText('charges')).toBeVisible();
    expect(effects.getByText('No active effects.')).toBeVisible();
    expect(effects.queryByRole('heading', { name: 'Rage' })).not.toBeInTheDocument();

    const description = rageFeature.getByText('Enter Rage as a Bonus Action while not wearing Heavy armor.');
    const reference = rageFeature.getByText('Rage duration and turn-by-turn extension/event maintenance remain manual. Heavy armor and Incapacitated termination are structured. Bludgeoning, Piercing, and Slashing resistance is reference-only because incoming damage is not intercepted.');
    const detailsSummary = rageFeature.getByText('Details');
    const details = detailsSummary.closest('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
    expect(description).not.toBeVisible();
    expect(reference).not.toBeVisible();

    await user.click(detailsSummary);
    expect(details).toHaveAttribute('open');
    expect(description).toBeVisible();
    expect(reference).toBeVisible();
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(storedBeforeDisclosure);

    await user.click(detailsSummary);
    expect(details).not.toHaveAttribute('open');
    expect(description).not.toBeVisible();
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(storedBeforeDisclosure);

    await user.click(rageFeature.getByRole('button', { name: 'Activate Rage' }));
    expect(getCharacterById(character.id)?.playState.resourceUses[BARBARIAN_RAGE_RESOURCE_ID]).toBe(1);
    expect(rageResource.getByText('1')).toBeVisible();
    expect(rageResource.getByText('charge')).toBeVisible();

    const activeRageHeading = effects.getByRole('heading', { name: 'Rage' });
    const activeRageCard = activeRageHeading.closest('article');
    expect(activeRageCard).not.toBeNull();
    const activeRage = within(activeRageCard!);
    expect(activeRage.getByText('Active · Bonus Action')).toBeVisible();
    expect(activeRage.getByText('ACTIVE')).toBeVisible();
    expect(activeRage.getByRole('button', { name: 'End Rage' })).toBeVisible();
  });

  it('G-I keeps condition controls and active condition state visible while condition/reference prose is disclosed on demand', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({ name: 'Density Conditions' }));
    renderAt(`/characters/${character.id}`);

    const conditions = panel('Character Conditions');
    expect(conditions.getByLabelText('Add condition')).toBeVisible();
    expect(conditions.getByRole('button', { name: 'Add' })).toBeVisible();
    expect(conditions.getByText('No active Character conditions.')).toBeVisible();

    const sectionReference = conditions.getByText('Player-managed Character-side conditions only. Table-dependent targets, sources, duration, and opponent effects remain manual.');
    const exhaustionNote = conditions.getByText('Exhaustion is intentionally not represented in M13B session state.');
    expect(sectionReference).not.toBeVisible();
    expect(exhaustionNote).not.toBeVisible();

    const sectionDetails = conditions.getAllByText('Details')[0];
    await user.click(sectionDetails);
    expect(sectionReference).toBeVisible();
    expect(exhaustionNote).toBeVisible();

    await user.selectOptions(conditions.getByLabelText('Add condition'), 'poisoned');
    await user.click(conditions.getByRole('button', { name: 'Add' }));
    const poisonedHeading = conditions.getByRole('heading', { name: 'Poisoned' });
    const poisonedCard = poisonedHeading.closest('article');
    expect(poisonedCard).not.toBeNull();
    const poisoned = within(poisonedCard!);
    expect(poisonedHeading).toBeVisible();
    expect(poisoned.getByRole('button', { name: 'Remove' })).toBeVisible();

    const summary = poisoned.getByText('Your attack rolls and ability checks have Disadvantage.');
    const conditionDetails = poisoned.getByText('Details');
    expect(summary).not.toBeVisible();
    await user.click(conditionDetails);
    expect(summary).toBeVisible();
  });

  it('J-K keeps Concentration current state and controls immediate while reference guidance defaults collapsed', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({ name: 'Density Concentration' }));
    renderAt(`/characters/${character.id}`);

    const concentration = panel('Concentration');
    expect(concentration.getByText('Current')).toBeVisible();
    expect(concentration.getByText('None')).toBeVisible();
    expect(concentration.getByLabelText('Concentration spell')).toBeVisible();
    expect(concentration.getByRole('button', { name: 'Start Concentration' })).toBeVisible();

    const tableManaged = concentration.getByText('One Character-side Concentration effect at a time. Targets, duration, areas, and spell effects remain table-managed.');
    const dcText = concentration.getByText('Damage DC: 10 or half the damage taken (round down), whichever is higher, maximum DC 30.');
    expect(tableManaged).not.toBeVisible();
    expect(dcText).not.toBeVisible();

    await user.click(concentration.getByText('Details'));
    expect(tableManaged).toBeVisible();
    expect(dcText).toBeVisible();
  });

  it('L-M keeps Hit Dice/rest actions immediate while recovery explanation defaults collapsed and remains accessible', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({ name: 'Density Rest' }));
    renderAt(`/characters/${character.id}`);

    const rest = panel('Hit Dice & Rests');
    expect(rest.getByText('4 / 4 d10')).toBeVisible();
    expect(rest.getByRole('button', { name: 'Roll & Spend 1d10' })).toBeVisible();
    expect(rest.getByRole('button', { name: 'Finish Short Rest' })).toBeVisible();
    expect(rest.getByRole('button', { name: 'Long Rest' })).toBeVisible();

    const hitDieReference = rest.getByText('The Dice Engine rolls the Hit Die, adds the existing Constitution modifier, heals, consumes one die, and records the result.');
    const shortRestReference = rest.getByText('Finish Short Rest recovers only resources whose rules recharge on a Short Rest.');
    const longRestReference = rest.getByText('Long Rest requires confirmation. It restores HP, all spent Hit Dice, Long-Rest resources, and removes Temporary HP.');
    expect(hitDieReference).not.toBeVisible();
    expect(shortRestReference).not.toBeVisible();
    expect(longRestReference).not.toBeVisible();

    await user.click(rest.getByText('Details'));
    expect(hitDieReference).toBeVisible();
    expect(shortRestReference).toBeVisible();
    expect(longRestReference).toBeVisible();
  });

  it('N-Q leaves the frozen cockpit/Attack Rolls structure and Character v9 persistence boundary intact', () => {
    const character = createCharacter(fighterInput({ name: 'Density Freeze' }));
    renderAt(`/characters/${character.id}`);

    const dashboard = screen.getByTestId('play-dashboard');
    expect(within(dashboard).getByRole('heading', { name: 'Attack Rolls' })).toBeInTheDocument();
    expect(within(screen.getByTestId('play-main-content')).queryByRole('heading', { name: 'Active Attacks' })).not.toBeInTheDocument();

    const core = dashboard.querySelector<HTMLElement>('.play-dashboard__core');
    expect(core).not.toBeNull();
    const coreHeadings = within(core!).getAllByRole('heading').map((heading) => heading.textContent);
    expect(coreHeadings).toEqual(expect.arrayContaining(['Hit Points', 'Ability Checks']));
    expect(within(core!).getByRole('region', { name: 'Combat quick stats' })).toBeInTheDocument();
    expect(within(core!).getByRole('region', { name: 'Initiative and Cover' })).toBeInTheDocument();

    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v9');
    expect(getCharacterById(character.id)).not.toHaveProperty('disclosureState');
  });
});
