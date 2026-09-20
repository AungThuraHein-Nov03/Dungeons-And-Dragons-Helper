import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { srdId } from '../content/srd/source';
import type { CharacterClassProgression, CharacterSpellcastingSelection } from '../models/character';
import type { SpellcastingProviderDefinition } from '../models/content';
import type { ContentId } from '../models/contentId';
import { classProgressionSkillChoiceContext } from '../rules/classProficiencies';
import { createFixedHpProgression } from '../rules/health';
import {
  maximumSelectableSpellLevel,
  spellBelongsToProviderList,
  spellcastingCountAtLevel,
  spellcastingProviderDefinitionsAtLevel,
} from '../rules/spellcasting';
import {
  CHARACTER_STORAGE_KEY,
  createCharacter,
  getCharacterById,
} from '../services/characterStorage';
import { contentRegistry } from '../services/contentRegistry';
import { fighterInput } from './fixtures';

const WIZARD_ID = srdId('class', 'wizard');
const WARLOCK_ID = srdId('class', 'warlock');
const BARD_ID = srdId('class', 'bard');

const EVOKER_ID = srdId('subclass', 'wizard:evoker');
const FIEND_ID = srdId('subclass', 'warlock:fiend-patron');

const WIZARD_PROVIDER_ID = srdId('spellcasting-provider', 'wizard:spellcasting');
const WARLOCK_PROVIDER_ID = srdId('spellcasting-provider', 'warlock:pact-magic');
const BARD_PROVIDER_ID = srdId('spellcasting-provider', 'bard:spellcasting');

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function progression(classId: ContentId, level: number, subclassId?: ContentId): CharacterClassProgression {
  const classContent = contentRegistry.findClass(classId);
  if (!classContent) throw new Error(`Missing class ${classId}`);
  const skills = classProgressionSkillChoiceContext(classContent, true);
  return {
    classId,
    level,
    ...(subclassId ? { subclassId } : {}),
    skillProficiencies: [...skills.from.slice(0, skills.choose)],
    hpProgression: createFixedHpProgression(level, true),
  };
}

function providerDefinition(
  classId: ContentId,
  level: number,
  providerId: ContentId,
  subclassId?: ContentId,
): SpellcastingProviderDefinition {
  const classContent = contentRegistry.findClass(classId);
  if (!classContent) throw new Error(`Missing class ${classId}`);
  const subclass = subclassId ? contentRegistry.findSubclass(subclassId) : undefined;
  const provider = spellcastingProviderDefinitionsAtLevel(classContent, subclass, level)
    .find((candidate) => candidate.id === providerId);
  if (!provider) throw new Error(`Missing provider ${providerId}`);
  return provider;
}

function listSpells(spellListId: string, predicate: (level: number) => boolean) {
  return contentRegistry.getAll('spell')
    .filter((spell) => spellBelongsToProviderList(spell, spellListId) && predicate(spell.level))
    .sort((left, right) => left.level - right.level || left.name.localeCompare(right.name));
}

function selectionFor(provider: SpellcastingProviderDefinition, ownerLevel: number): CharacterSpellcastingSelection {
  if (provider.spellManagement.kind === 'granted-only') {
    return { providerId: provider.id, cantripIds: [], ownedSpellIds: [], preparedSpellIds: [] };
  }
  const management = provider.spellManagement;
  const cantripIds = listSpells(management.spellListId, (level) => level === 0)
    .slice(0, spellcastingCountAtLevel(management.cantripCount, ownerLevel))
    .map((spell) => spell.id);
  const maximum = maximumSelectableSpellLevel(provider, ownerLevel);
  if (management.kind === 'prepared-from-list') {
    const prepared = listSpells(management.spellListId, (level) => level > 0 && level <= maximum)[0];
    return { providerId: provider.id, cantripIds, ownedSpellIds: [], preparedSpellIds: prepared ? [prepared.id] : [] };
  }
  const ownedSpellIds = listSpells(
    management.spellListId,
    (level) => level === management.initialOwnedSpellLevel && level <= maximum,
  ).slice(0, management.initialOwnedSpellCount).map((spell) => spell.id);
  return {
    providerId: provider.id,
    cantripIds,
    ownedSpellIds,
    preparedSpellIds: ownedSpellIds.slice(0, 1),
  };
}

function providerSection(name: string) {
  const heading = screen.getByRole('heading', { name });
  const section = heading.closest('section');
  expect(section).not.toBeNull();
  return within(section!);
}

function choiceBlock(name: string) {
  const heading = screen.getByRole('heading', { name });
  const header = heading.closest('.section-heading');
  const block = header?.parentElement;
  expect(block).not.toBeNull();
  return within(block!);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('Milestone 15-E Spellcasting Choices Level Up flow', () => {
  it('A skips an empty spellcasting step for a non-spellcasting gained level', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({
      name: 'M15-E No Spellcasting',
      level: 1,
      subclassId: undefined,
    }));

    renderAt(`/characters/${character.id}/level-up`);
    await user.click(screen.getByRole('radio', { name: /Fighter.*Level 1.*Level 2/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));

    expect(screen.getByRole('status')).toHaveTextContent('Core choices complete.');
    expect(screen.getByText(/Spellcasting Choices:/).closest('p')).toHaveTextContent('none required for Fighter class level 2');
    expect(screen.queryByRole('button', { name: 'Next: Spellcasting Choices' })).not.toBeInTheDocument();
    expect(screen.queryByText('Step 4 · Spellcasting Choices')).not.toBeInTheDocument();
  });

  it('C/N preserves completed ASI while Wizard 3 -> 4 resolves exactly one new provider-local cantrip, with zero persistence', async () => {
    const user = userEvent.setup();
    const provider = providerDefinition(WIZARD_ID, 3, WIZARD_PROVIDER_ID, EVOKER_ID);
    const character = createCharacter(fighterInput({
      name: 'M15-E Wizard Delta',
      startingClassId: WIZARD_ID,
      classProgressions: [progression(WIZARD_ID, 3, EVOKER_ID)],
      abilityScores: { intelligence: 14 },
      spellcastingSelections: [selectionFor(provider, 3)],
    }));
    const persistedBefore = window.localStorage.getItem(CHARACTER_STORAGE_KEY);

    renderAt(`/characters/${character.id}/level-up`);
    await user.click(screen.getByRole('radio', { name: /Wizard.*Level 3.*Level 4/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Advancement Choices' }));

    await user.click(screen.getByRole('radio', { name: /Ability Score Improvement.*Increase one ability score by 2/i }));
    await user.selectOptions(screen.getByLabelText('Ability Score Increase 1'), 'constitution');
    await user.selectOptions(screen.getByLabelText('Ability Score Increase 2'), 'constitution');
    expect(screen.getByRole('status')).toHaveTextContent('Advancement choices complete.');

    await user.click(screen.getByRole('button', { name: 'Next: Spellcasting Choices' }));
    expect(screen.getByText('Step 4 · Spellcasting Choices')).toBeInTheDocument();
    const wizard = providerSection('Wizard Spellcasting');
    expect(wizard.getByText(/Owner level 3 → 4/)).toBeInTheDocument();
    expect(wizard.getByText(/Ordinary spellcasting provider/)).toBeInTheDocument();
    expect(wizard.getByText(/Shared ordinary slot capacity does not expand/)).toBeInTheDocument();

    const cantrips = wizard.getAllByRole('checkbox');
    expect(cantrips.length).toBeGreaterThan(0);
    await user.click(cantrips[0]);

    expect(screen.getByRole('status')).toHaveTextContent('Spellcasting choices complete.');
    expect(screen.queryByRole('button', { name: /confirm|save/i })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(persistedBefore);

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('radio', { name: /Ability Score Improvement.*Increase one ability score by 2/i })).toBeChecked();
    expect(screen.getByLabelText('Ability Score Increase 1')).toHaveValue('constitution');
    expect(screen.getByLabelText('Ability Score Increase 2')).toHaveValue('constitution');
    await user.click(screen.getByRole('button', { name: 'Next: Spellcasting Choices' }));
    expect(providerSection('Wizard Spellcasting').getAllByRole('checkbox').some((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true);

    await user.click(screen.getByRole('link', { name: 'Cancel' }));
    expect(screen.getByTestId('character-workspace-play')).toBeInTheDocument();
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(persistedBefore);
    expect(getCharacterById(character.id)?.spellcastingSelections).toEqual(character.spellcastingSelections);
    expect(getCharacterById(character.id)?.manualFeats).toEqual(character.manualFeats);
  });

  it('E initializes only the new Wizard level-1 provider when multiclassing, preserving shared-slot/access separation and persistence', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({
      name: 'M15-E New Wizard',
      level: 3,
      abilityScores: { intelligence: 14 },
    }));
    const persistedBefore = window.localStorage.getItem(CHARACTER_STORAGE_KEY);

    renderAt(`/characters/${character.id}/level-up`);
    await user.click(screen.getByRole('radio', { name: /Wizard.*Add at class level 1/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Spellcasting Choices' }));

    const wizard = providerSection('Wizard Spellcasting');
    expect(wizard.getByText(/New provider at owner level 1/)).toBeInTheDocument();
    expect(wizard.getByText(/spells through level/)).toHaveTextContent('1');
    expect(wizard.getByText(/Current cantrips:/).closest('p')).toHaveTextContent('None stored');
    expect(wizard.getByText(/Current owned spells:/).closest('p')).toHaveTextContent('None stored');

    const cantripBlock = choiceBlock('New cantrip selection');
    const cantripChecks = cantripBlock.getAllByRole('checkbox');
    for (const checkbox of cantripChecks.slice(0, 3)) await user.click(checkbox);
    expect(cantripBlock.getByText('3 / 3')).toBeInTheDocument();

    const ownedBlock = choiceBlock('Required owned spells');
    const ownedChecks = ownedBlock.getAllByRole('checkbox');
    for (const checkbox of ownedChecks.slice(0, 6)) await user.click(checkbox);
    expect(ownedBlock.getByText('6 / 6')).toBeInTheDocument();

    expect(screen.getByRole('status')).toHaveTextContent('Spellcasting choices complete.');
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(persistedBefore);
    expect(getCharacterById(character.id)?.classProgressions).toEqual(character.classProgressions);
    expect(getCharacterById(character.id)?.spellcastingSelections).toEqual(character.spellcastingSelections);
  });

  it('G presents Pact Magic as a distinct provider-local spellcasting step', async () => {
    const user = userEvent.setup();
    const provider = providerDefinition(WARLOCK_ID, 3, WARLOCK_PROVIDER_ID, FIEND_ID);
    const character = createCharacter(fighterInput({
      name: 'M15-E Pact Delta',
      startingClassId: WARLOCK_ID,
      classProgressions: [progression(WARLOCK_ID, 3, FIEND_ID)],
      abilityScores: { charisma: 14 },
      spellcastingSelections: [selectionFor(provider, 3)],
    }));

    renderAt(`/characters/${character.id}/level-up`);
    await user.click(screen.getByRole('radio', { name: /Warlock.*Level 3.*Level 4/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Advancement Choices' }));
    await user.click(screen.getByRole('radio', { name: /Ability Score Improvement.*Increase one ability score by 2/i }));
    await user.selectOptions(screen.getByLabelText('Ability Score Increase 1'), 'constitution');
    await user.selectOptions(screen.getByLabelText('Ability Score Increase 2'), 'constitution');
    await user.click(screen.getByRole('button', { name: 'Next: Spellcasting Choices' }));

    const pact = providerSection('Warlock Pact Magic');
    expect(pact.getByText('Pact provider')).toBeInTheDocument();
    expect(pact.getByRole('heading', { name: 'New cantrip selection' })).toBeInTheDocument();
    expect(pact.getByRole('heading', { name: 'Optional class-level replacement' })).toBeInTheDocument();
    expect(screen.queryByText(/multiclass ordinary slot/i)).not.toBeInTheDocument();
  });

  it('K removes stale Wizard spellcasting draft state when the user backs out and changes target', async () => {
    const user = userEvent.setup();
    const provider = providerDefinition(WIZARD_ID, 3, WIZARD_PROVIDER_ID, EVOKER_ID);
    const character = createCharacter(fighterInput({
      name: 'M15-E Target Reset',
      startingClassId: WIZARD_ID,
      classProgressions: [progression(WIZARD_ID, 3, EVOKER_ID)],
      abilityScores: { strength: 14, dexterity: 14, intelligence: 14 },
      spellcastingSelections: [selectionFor(provider, 3)],
    }));
    const persistedBefore = window.localStorage.getItem(CHARACTER_STORAGE_KEY);

    renderAt(`/characters/${character.id}/level-up`);
    await user.click(screen.getByRole('radio', { name: /Wizard.*Level 3.*Level 4/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Advancement Choices' }));
    await user.click(screen.getByRole('radio', { name: /Ability Score Improvement.*Increase one ability score by 2/i }));
    await user.selectOptions(screen.getByLabelText('Ability Score Increase 1'), 'constitution');
    await user.selectOptions(screen.getByLabelText('Ability Score Increase 2'), 'constitution');
    await user.click(screen.getByRole('button', { name: 'Next: Spellcasting Choices' }));
    await user.click(providerSection('Wizard Spellcasting').getAllByRole('checkbox')[0]);

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));

    await user.click(screen.getByRole('radio', { name: /Fighter.*Add at class level 1/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));

    expect(screen.getByText(/Spellcasting Choices:/).closest('p')).toHaveTextContent('none required for Fighter class level 1');
    expect(screen.queryByRole('button', { name: 'Next: Spellcasting Choices' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Wizard Spellcasting' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(persistedBefore);
  });

  it('L presents a class-level-one Bard replacement as optional rather than an incompleteness requirement', async () => {
    const user = userEvent.setup();
    const provider = providerDefinition(BARD_ID, 1, BARD_PROVIDER_ID);
    const character = createCharacter(fighterInput({
      name: 'M15-E Bard Replacement',
      startingClassId: BARD_ID,
      classProgressions: [progression(BARD_ID, 1)],
      abilityScores: { charisma: 14 },
      spellcastingSelections: [selectionFor(provider, 1)],
    }));

    renderAt(`/characters/${character.id}/level-up`);
    await user.click(screen.getByRole('radio', { name: /Bard.*Level 1.*Level 2/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Spellcasting Choices' }));

    expect(screen.getByRole('status')).toHaveTextContent('Spellcasting choices complete.');
    const bard = providerSection('Bard Spellcasting');
    expect(bard.getByRole('heading', { name: 'Optional class-level replacement' })).toBeInTheDocument();
    expect(bard.getByLabelText('Prepared spell to replace')).toHaveValue('');
    expect(bard.getByLabelText('Replacement spell')).toBeDisabled();

    const outgoing = bard.getByLabelText('Prepared spell to replace');
    await user.selectOptions(outgoing, within(outgoing).getAllByRole('option')[1]);
    expect(bard.getByLabelText('Replacement spell')).not.toBeDisabled();
  });
});
