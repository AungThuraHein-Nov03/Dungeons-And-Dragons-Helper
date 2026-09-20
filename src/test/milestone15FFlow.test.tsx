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
  updateCharacter,
} from '../services/characterStorage';
import { contentRegistry } from '../services/contentRegistry';
import { fighterInput } from './fixtures';

const FIGHTER_ID = srdId('class', 'fighter');
const ROGUE_ID = srdId('class', 'rogue');
const WIZARD_ID = srdId('class', 'wizard');
const EVOKER_ID = srdId('subclass', 'wizard:evoker');
const WIZARD_PROVIDER_ID = srdId('spellcasting-provider', 'wizard:spellcasting');

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function progression(classId: ContentId, level: number, starting: boolean, subclassId?: ContentId): CharacterClassProgression {
  const classContent = contentRegistry.findClass(classId);
  if (!classContent) throw new Error('Missing class ' + classId);
  const skills = classProgressionSkillChoiceContext(classContent, starting);
  return {
    classId,
    level,
    ...(subclassId ? { subclassId } : {}),
    skillProficiencies: [...skills.from.slice(0, skills.choose)],
    hpProgression: createFixedHpProgression(level, starting),
  };
}

function providerDefinition(
  classId: ContentId,
  level: number,
  providerId: ContentId,
  subclassId?: ContentId,
): SpellcastingProviderDefinition {
  const classContent = contentRegistry.findClass(classId);
  if (!classContent) throw new Error('Missing class ' + classId);
  const subclass = subclassId ? contentRegistry.findSubclass(subclassId) : undefined;
  const provider = spellcastingProviderDefinitionsAtLevel(classContent, subclass, level)
    .find((candidate) => candidate.id === providerId);
  if (!provider) throw new Error('Missing provider ' + providerId);
  return provider;
}

function listSpells(spellListId: string, predicate: (level: number) => boolean) {
  return contentRegistry.getAll('spell')
    .filter((spell) => spellBelongsToProviderList(spell, spellListId) && predicate(spell.level))
    .sort((left, right) => left.level - right.level || left.name.localeCompare(right.name));
}

function wizardSelection(ownerLevel: number): CharacterSpellcastingSelection {
  const provider = providerDefinition(WIZARD_ID, ownerLevel, WIZARD_PROVIDER_ID, EVOKER_ID);
  if (provider.spellManagement.kind !== 'prepared-from-owned') throw new Error('Expected Wizard provider.');
  const management = provider.spellManagement;
  const cantripIds = listSpells(management.spellListId, (level) => level === 0)
    .slice(0, spellcastingCountAtLevel(management.cantripCount, ownerLevel))
    .map((spell) => spell.id);
  const maximum = maximumSelectableSpellLevel(provider, ownerLevel);
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

function panel(name: string) {
  const heading = screen.getByRole('heading', { name });
  const section = heading.closest('section');
  expect(section).not.toBeNull();
  return within(section!);
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('Milestone 15-F Review / Confirm UI flow', () => {
  it('A1/A3/B1/B3 shows read-only simple review, persists nothing before Confirm, then commits one +1 and returns to PLAY', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({ name: 'M15-F Review', level: 1, subclassId: undefined }));
    const rawBefore = window.localStorage.getItem(CHARACTER_STORAGE_KEY);

    renderAt('/characters/' + character.id + '/level-up');
    await user.click(screen.getByRole('radio', { name: /Fighter.*Level 1.*Level 2/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));

    expect(screen.getByRole('button', { name: 'Next: Review' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm Level Up' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next: Review' }));

    expect(screen.getByRole('heading', { name: 'Review Level Up' })).toBeInTheDocument();
    expect(screen.getByText('NOT SAVED')).toBeInTheDocument();
    const summary = panel('Advancement summary');
    const totalLevelCard = summary.getByRole('heading', { name: 'Total Level' }).closest('article');
    expect(totalLevelCard).not.toBeNull();
    expect(within(totalLevelCard!).getByText('1 → 2')).toBeInTheDocument();
    expect(summary.getByRole('heading', { name: 'Fighter' })).toBeInTheDocument();
    expect(panel('Advancement summary').getByText('Fixed HP 6')).toBeInTheDocument();
    expect(screen.queryByText(/Subclass Gained/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Feat Gained/)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(rawBefore);

    await user.click(screen.getByRole('button', { name: 'Confirm Level Up' }));
    expect(await screen.findByTestId('character-workspace-play')).toBeInTheDocument();
    const persisted = getCharacterById(character.id)!;
    expect(persisted.classProgressions.find((entry) => entry.classId === FIGHTER_ID)?.level).toBe(2);
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).not.toContain('sourceUpdatedAt');
  });

  it('A5/A9 Back from Review preserves subclass and HP choices', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({ name: 'M15-F Back', level: 2, subclassId: undefined }));

    renderAt('/characters/' + character.id + '/level-up');
    await user.click(screen.getByRole('radio', { name: /Fighter.*Level 2.*Level 3/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));
    await user.click(screen.getByRole('radio', { name: /Champion/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Review' }));

    expect(panel('Advancement summary').getByText('Subclass Gained')).toBeInTheDocument();
    expect(panel('Advancement summary').getByRole('heading', { name: 'Champion' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: /Fixed HP/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('radio', { name: /Champion/i })).toBeChecked();
  });

  it('A2/D2 reviews and confirms a new Rogue multiclass while preserving Fighter as Starting Class', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({
      name: 'M15-F Multiclass',
      level: 2,
      subclassId: undefined,
      abilityScores: { dexterity: 14 },
    }));

    renderAt('/characters/' + character.id + '/level-up');
    await user.click(screen.getByRole('radio', { name: /Rogue.*Add at class level 1/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));
    const skill = screen.getAllByRole('checkbox')[0];
    const skillLabel = skill.closest('label')?.textContent ?? '';
    await user.click(skill);
    await user.click(screen.getByRole('button', { name: 'Next: Review' }));

    const summary = panel('Advancement summary');
    expect(summary.getByText('New Multiclass')).toBeInTheDocument();
    expect(summary.getByRole('heading', { name: 'Rogue' })).toBeInTheDocument();
    expect(summary.getByText('Added at Level 1')).toBeInTheDocument();
    expect(summary.getByText(skillLabel, { exact: false })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm Level Up' }));
    const persisted = getCharacterById(character.id)!;
    expect(persisted.startingClassId).toBe(FIGHTER_ID);
    expect(persisted.classProgressions.find((entry) => entry.classId === ROGUE_ID)?.level).toBe(1);
  });

  it('A6/A7/E reviews completed ASI + Wizard spellcasting delta and persists the provider-local cantrip only after Confirm', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({
      name: 'M15-F Wizard Review',
      startingClassId: WIZARD_ID,
      classProgressions: [progression(WIZARD_ID, 3, true, EVOKER_ID)],
      abilityScores: { intelligence: 14 },
      spellcastingSelections: [wizardSelection(3)],
    }));
    const ownedBefore = character.spellcastingSelections[0].ownedSpellIds;
    const rawBefore = window.localStorage.getItem(CHARACTER_STORAGE_KEY);

    renderAt('/characters/' + character.id + '/level-up');
    await user.click(screen.getByRole('radio', { name: /Wizard.*Level 3.*Level 4/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Advancement Choices' }));
    await user.click(screen.getByRole('radio', { name: /Ability Score Improvement.*Increase one ability score by 2/i }));
    await user.selectOptions(screen.getByLabelText('Ability Score Increase 1'), 'constitution');
    await user.selectOptions(screen.getByLabelText('Ability Score Increase 2'), 'constitution');
    await user.click(screen.getByRole('button', { name: 'Next: Spellcasting Choices' }));

    const wizard = panel('Wizard Spellcasting');
    const newCantrip = wizard.getAllByRole('checkbox')[0];
    const cantripName = newCantrip.closest('label')?.querySelector('strong')?.textContent ?? '';
    await user.click(newCantrip);
    await user.click(screen.getByRole('button', { name: 'Next: Review' }));

    const summary = panel('Advancement summary');
    expect(summary.getByRole('heading', { name: 'Ability Score Improvement', level: 3 })).toBeInTheDocument();
    expect(summary.getByText(/Constitution, Constitution/)).toBeInTheDocument();
    expect(summary.getByRole('heading', { name: 'Wizard Spellcasting' })).toBeInTheDocument();
    expect(summary.getByText('Added cantrips: ' + cantripName)).toBeInTheDocument();
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(rawBefore);

    await user.click(screen.getByRole('button', { name: 'Confirm Level Up' }));
    const persisted = getCharacterById(character.id)!;
    const selection = persisted.spellcastingSelections.find((entry) => entry.providerId === WIZARD_PROVIDER_ID)!;
    expect(selection.cantripIds).toHaveLength(4);
    expect(selection.ownedSpellIds).toEqual(ownedBefore);
  });

  it('B4/F7 Cancel from Review remains zero-persistence', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({ name: 'M15-F Cancel', level: 1, subclassId: undefined }));
    const rawBefore = window.localStorage.getItem(CHARACTER_STORAGE_KEY);

    renderAt('/characters/' + character.id + '/level-up');
    await user.click(screen.getByRole('radio', { name: /Fighter.*Level 1.*Level 2/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Review' }));
    await user.click(screen.getByRole('link', { name: 'Cancel' }));

    expect(screen.getByTestId('character-workspace-play')).toBeInTheDocument();
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(rawBefore);
    expect(getCharacterById(character.id)?.classProgressions[0].level).toBe(1);
  });

  it('B8 stale source conflict fails closed in the UI and instructs restart from current Character state', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({ name: 'M15-F Stale', level: 1, subclassId: undefined }));

    renderAt('/characters/' + character.id + '/level-up');
    await user.click(screen.getByRole('radio', { name: /Fighter.*Level 1.*Level 2/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Review' }));

    const changed = updateCharacter(character.id, { ...fighterInput({ level: 1, subclassId: undefined }), name: 'Updated Elsewhere' })!;
    await user.click(screen.getByRole('button', { name: 'Confirm Level Up' }));

    expect(screen.getByRole('alert')).toHaveTextContent('changed while Level Up was open');
    expect(screen.getByRole('alert')).toHaveTextContent('Restart Level Up');
    const persisted = getCharacterById(character.id)!;
    expect(persisted.name).toBe('Updated Elsewhere');
    expect(persisted.updatedAt).toBe(changed.updatedAt);
    expect(persisted.classProgressions[0].level).toBe(1);
  });
});
