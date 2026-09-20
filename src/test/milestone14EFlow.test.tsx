import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { srdId } from '../content/srd';
import type { CharacterClassProgression, CharacterInput, CharacterSpellcastingSelection } from '../models/character';
import type { SpellcastingProviderDefinition } from '../models/content';
import type { ContentId } from '../models/contentId';
import { classProgressionSkillChoiceContext } from '../rules/classProficiencies';
import { createFixedHpProgression } from '../rules/health';
import { SKILL_DEFINITIONS } from '../rules/skills';
import {
  maximumSelectableSpellLevel,
  spellBelongsToProviderList,
  spellcastingCountAtLevel,
  spellcastingProviderDefinitionsAtLevel,
  spellcastingSpellGrantsAtLevel,
} from '../rules/spellcasting';
import { CHARACTER_STORAGE_KEY, createCharacter, loadCharacters } from '../services/characterStorage';
import { contentRegistry } from '../services/contentRegistry';
import { fighterInput } from './fixtures';

const FIGHTER_ID = srdId('class', 'fighter');
const CHAMPION_ID = srdId('subclass', 'fighter:champion');
const ROGUE_ID = srdId('class', 'rogue');
const CLERIC_ID = srdId('class', 'cleric');
const LIFE_DOMAIN_ID = srdId('subclass', 'cleric:life-domain');
const WIZARD_ID = srdId('class', 'wizard');
const WARLOCK_ID = srdId('class', 'warlock');
const FIEND_ID = srdId('subclass', 'warlock:fiend-patron');

const CLERIC_PROVIDER_ID = srdId('spellcasting-provider', 'cleric:spellcasting');
const WIZARD_PROVIDER_ID = srdId('spellcasting-provider', 'wizard:spellcasting');
const WARLOCK_PROVIDER_ID = srdId('spellcasting-provider', 'warlock:pact-magic');
const FIREBALL_ID = srdId('spell', 'fireball');
const SACRED_FLAME_ID = srdId('spell', 'sacred-flame');

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function progression(classId: ContentId, level: number, starting: boolean, subclassId?: ContentId): CharacterClassProgression {
  const classContent = contentRegistry.findClass(classId);
  if (!classContent) throw new Error(`Missing class ${classId}`);
  const skillContext = classProgressionSkillChoiceContext(classContent, starting);
  return {
    classId,
    level,
    ...(subclassId ? { subclassId } : {}),
    skillProficiencies: [...skillContext.from.slice(0, skillContext.choose)],
    hpProgression: createFixedHpProgression(level, starting),
  };
}

function providerDefinition(classId: ContentId, level: number, providerId: ContentId, subclassId?: ContentId): SpellcastingProviderDefinition {
  const classContent = contentRegistry.findClass(classId);
  if (!classContent) throw new Error(`Missing class ${classId}`);
  const subclass = subclassId ? contentRegistry.findSubclass(subclassId) : undefined;
  const provider = spellcastingProviderDefinitionsAtLevel(classContent, subclass, level).find((entry) => entry.id === providerId);
  if (!provider) throw new Error(`Missing provider ${providerId}`);
  return provider;
}

function spellsOnList(spellListId: string, predicate: (level: number) => boolean) {
  return contentRegistry.getAll('spell')
    .filter((spell) => spellBelongsToProviderList(spell, spellListId) && predicate(spell.level))
    .sort((left, right) => left.level - right.level || left.name.localeCompare(right.name));
}

function selectionFor(provider: SpellcastingProviderDefinition, ownerLevel: number): CharacterSpellcastingSelection {
  const management = provider.spellManagement;
  if (management.kind === 'granted-only') return { providerId: provider.id, cantripIds: [], ownedSpellIds: [], preparedSpellIds: [] };
  const cantripCount = spellcastingCountAtLevel(management.cantripCount, ownerLevel);
  const cantripIds = spellsOnList(management.spellListId, (level) => level === 0).slice(0, cantripCount).map((spell) => spell.id);
  const maximum = maximumSelectableSpellLevel(provider, ownerLevel);
  const preparedLimit = spellcastingCountAtLevel(management.preparedSpellCount, ownerLevel);
  if (management.kind === 'prepared-from-list') {
    const eligible = spellsOnList(management.spellListId, (level) => level > 0 && level <= maximum);
    return { providerId: provider.id, cantripIds, ownedSpellIds: [], preparedSpellIds: eligible.slice(0, Math.min(1, preparedLimit)).map((spell) => spell.id) };
  }
  const ownedSpellIds = spellsOnList(
    management.spellListId,
    (level) => level === management.initialOwnedSpellLevel && level <= maximum,
  ).slice(0, management.initialOwnedSpellCount).map((spell) => spell.id);
  return { providerId: provider.id, cantripIds, ownedSpellIds, preparedSpellIds: ownedSpellIds.slice(0, Math.min(1, preparedLimit)) };
}

function fighterWizardInput(): CharacterInput {
  const wizardProvider = providerDefinition(WIZARD_ID, 2, WIZARD_PROVIDER_ID);
  return fighterInput({
    name: 'M14E Fighter Wizard',
    startingClassId: FIGHTER_ID,
    classProgressions: [
      progression(FIGHTER_ID, 4, true, CHAMPION_ID),
      progression(WIZARD_ID, 2, false),
    ],
    abilityScores: { intelligence: 14 },
    spellcastingSelections: [selectionFor(wizardProvider, 2)],
  });
}

function clericWizardInput(): CharacterInput {
  const clericProvider = providerDefinition(CLERIC_ID, 3, CLERIC_PROVIDER_ID, LIFE_DOMAIN_ID);
  const wizardProvider = providerDefinition(WIZARD_ID, 2, WIZARD_PROVIDER_ID);
  return fighterInput({
    name: 'M14E Cleric Wizard',
    startingClassId: CLERIC_ID,
    classProgressions: [
      progression(CLERIC_ID, 3, true, LIFE_DOMAIN_ID),
      progression(WIZARD_ID, 2, false),
    ],
    abilityScores: { wisdom: 14, intelligence: 14 },
    spellcastingSelections: [selectionFor(clericProvider, 3), selectionFor(wizardProvider, 2)],
  });
}

function warlockInput(): CharacterInput {
  const provider = providerDefinition(WARLOCK_ID, 3, WARLOCK_PROVIDER_ID, FIEND_ID);
  return fighterInput({
    name: 'M14E Fiend Warlock',
    startingClassId: WARLOCK_ID,
    classProgressions: [progression(WARLOCK_ID, 3, true, FIEND_ID)],
    abilityScores: { charisma: 16 },
    spellcastingSelections: [selectionFor(provider, 3)],
  });
}

function cardByHeading(name: string) {
  const card = screen.getByRole('heading', { name, level: 3 }).closest('.feat-editor__card') as HTMLElement | null;
  if (!card) throw new Error(`Missing editor card for ${name}`);
  return within(card);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('Milestone 14-E bounded multiclass Character editor acceptance', () => {
  it('A/E creates a canonical multiclass Character directly through the existing creation workflow', async () => {
    const user = userEvent.setup();
    renderAt('/characters/new');

    await user.type(screen.getByLabelText('Character Name'), 'M14E Created Multiclass');
    await user.selectOptions(screen.getByLabelText('Level'), '4');
    await user.selectOptions(screen.getByLabelText('Subclass'), CHAMPION_ID);
    const scores: Record<string, string> = { Strength: '14', Dexterity: '14', Constitution: '14', Intelligence: '12', Wisdom: '12', Charisma: '12' };
    for (const [label, score] of Object.entries(scores)) await user.type(screen.getByLabelText(label), score);
    await user.click(screen.getByLabelText('Athletics'));
    await user.click(screen.getByLabelText('Perception'));

    await user.selectOptions(screen.getByLabelText('Class to add'), ROGUE_ID);
    await user.click(screen.getByRole('button', { name: '+ Add Class' }));
    const rogue = contentRegistry.findClass(ROGUE_ID);
    if (!rogue) throw new Error('Missing Rogue');
    const addedChoice = classProgressionSkillChoiceContext(rogue, false);
    await user.click(cardByHeading('Rogue').getByLabelText(SKILL_DEFINITIONS[addedChoice.from[0]].name));

    await user.click(screen.getByRole('button', { name: 'Create Character' }));

    const [saved] = loadCharacters();
    expect(saved.startingClassId).toBe(FIGHTER_ID);
    expect(saved.classProgressions.map((entry) => [entry.classId, entry.level])).toEqual([[FIGHTER_ID, 4], [ROGUE_ID, 1]]);
    expect(saved.classProgressions[1].hpProgression).toEqual([{ classLevel: 1, method: 'fixed' }]);
  });

  it('E/H/J/M adds a valid second class with multiclass choices, derived total level, and added-class HP semantics', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({ name: 'M14E Add Rogue', level: 4, subclassId: CHAMPION_ID }));
    renderAt(`/characters/${character.id}/edit`);

    await user.selectOptions(screen.getByLabelText('Class to add'), ROGUE_ID);
    await user.click(screen.getByRole('button', { name: '+ Add Class' }));

    expect(screen.getByText('Character Level:')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    const rogueCard = cardByHeading('Rogue');
    expect(rogueCard.getByText(/Choose 1 Rogue multiclass skill/)).toBeInTheDocument();
    expect(rogueCard.getByText(/class level 1 is a recorded fixed\/rolled HP entry/i)).toBeInTheDocument();

    const rogue = contentRegistry.findClass(ROGUE_ID);
    if (!rogue) throw new Error('Missing Rogue');
    const choice = classProgressionSkillChoiceContext(rogue, false);
    await user.click(rogueCard.getByLabelText(SKILL_DEFINITIONS[choice.from[0]].name));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    const [saved] = loadCharacters();
    const added = saved.classProgressions.find((entry) => entry.classId === ROGUE_ID);
    expect(saved.startingClassId).toBe(FIGHTER_ID);
    expect(added).toMatchObject({ classId: ROGUE_ID, level: 1, hpProgression: [{ classLevel: 1, method: 'fixed' }] });
    expect(added?.skillProficiencies).toEqual([choice.from[0]]);
  });

  it('G surfaces multiclass prerequisite failure and leaves persisted Character unchanged', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({ name: 'M14E Invalid Wizard', abilityScores: { intelligence: 8 } }));
    renderAt(`/characters/${character.id}/edit`);

    await user.selectOptions(screen.getByLabelText('Class to add'), WIZARD_ID);
    await user.click(screen.getByRole('button', { name: '+ Add Class' }));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(screen.getByText(/Wizard multiclassing requires its primary ability requirement/i)).toBeInTheDocument();
    expect(loadCharacters()[0].classProgressions).toHaveLength(1);
  });

  it('N/O/P renders Cleric and Wizard as separate provider-scoped editors with isolated lists and owner-level access', () => {
    const character = createCharacter(clericWizardInput());
    renderAt(`/characters/${character.id}/edit`);

    const clericCard = cardByHeading('Cleric Spellcasting');
    const wizardCard = cardByHeading('Wizard Spellcasting');
    expect(clericCard.getByRole('heading', { name: /Cantrips/ })).toBeInTheDocument();
    expect(clericCard.getByRole('heading', { name: /Prepared leveled spells/ })).toBeInTheDocument();
    expect(clericCard.queryByRole('heading', { name: /Owned leveled spells/ })).not.toBeInTheDocument();

    expect(wizardCard.getByRole('heading', { name: /Owned leveled spells/ })).toBeInTheDocument();
    expect(wizardCard.getByRole('heading', { name: /Prepared leveled spells/ })).toBeInTheDocument();

    const sacredFlame = contentRegistry.findSpell(SACRED_FLAME_ID);
    if (!sacredFlame) throw new Error('Missing Sacred Flame');
    expect(clericCard.getByLabelText(sacredFlame.name)).toBeInTheDocument();
    expect(wizardCard.queryByLabelText(sacredFlame.name)).not.toBeInTheDocument();

    const fireball = contentRegistry.findSpell(FIREBALL_ID);
    if (!fireball) throw new Error('Missing Fireball');
    expect(wizardCard.queryByText(new RegExp(fireball.name, 'i'))).not.toBeInTheDocument();
  });

  it('Q exposes Wizard preparation only from that provider owned collection', async () => {
    const user = userEvent.setup();
    const input = fighterWizardInput();
    const character = createCharacter(input);
    renderAt(`/characters/${character.id}/edit`);

    const wizardCard = cardByHeading('Wizard Spellcasting');
    const selection = input.spellcastingSelections.find((entry) => entry.providerId === WIZARD_PROVIDER_ID);
    if (!selection) throw new Error('Missing Wizard selection');
    const unowned = spellsOnList('wizard', (level) => level === 1).find((spell) => !selection.ownedSpellIds.includes(spell.id));
    if (!unowned) throw new Error('Need an unowned Wizard spell');

    expect(wizardCard.queryByLabelText(`Level 1 · ${unowned.name}`)).not.toBeInTheDocument();
    await user.click(wizardCard.getByLabelText(`Level 1 · ${unowned.name} · ${unowned.school}${unowned.ritual ? ' · Ritual' : ''}`));
    expect(wizardCard.getByLabelText(`Level 1 · ${unowned.name}`)).toBeInTheDocument();
  });

  it('R persists prepared-from-list Cleric selections under the Cleric provider ID', async () => {
    const user = userEvent.setup();
    const input = clericWizardInput();
    const clericSelection = input.spellcastingSelections.find((entry) => entry.providerId === CLERIC_PROVIDER_ID);
    if (!clericSelection?.preparedSpellIds[0]) throw new Error('Missing Cleric prepared fixture');
    const prepared = contentRegistry.findSpell(clericSelection.preparedSpellIds[0]);
    if (!prepared) throw new Error('Missing prepared Cleric spell');
    const character = createCharacter(input);
    renderAt(`/characters/${character.id}/edit`);

    expect(cardByHeading('Cleric Spellcasting').getByLabelText(`Level ${prepared.level} · ${prepared.name}`)).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    const [saved] = loadCharacters();
    expect(saved.spellcastingSelections.find((entry) => entry.providerId === CLERIC_PROVIDER_ID)?.preparedSpellIds).toContain(prepared.id);
    expect(saved.spellcastingSelections.find((entry) => entry.providerId === WIZARD_PROVIDER_ID)).toBeDefined();
  });

  it('S presents subclass-granted spells separately and never duplicates them into manual persisted selections', async () => {
    const user = userEvent.setup();
    const input = warlockInput();
    const character = createCharacter(input);
    const warlockClass = contentRegistry.findClass(WARLOCK_ID);
    const fiend = contentRegistry.findSubclass(FIEND_ID);
    const grantIds = spellcastingSpellGrantsAtLevel(warlockClass, fiend, 3).flatMap((grant) => grant.spellIds);
    const grantNames = grantIds.flatMap((id) => { const spell = contentRegistry.findSpell(id); return spell ? [spell.name] : []; });
    expect(grantNames.length).toBeGreaterThan(0);

    renderAt(`/characters/${character.id}/edit`);
    const card = cardByHeading('Warlock Pact Magic');
    expect(card.getByText((_, element) => element?.tagName === 'P' && Boolean(element.textContent?.includes('Always prepared / granted:')) && grantNames.every((name) => element.textContent?.includes(name)))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    const selection = loadCharacters()[0].spellcastingSelections.find((entry) => entry.providerId === WARLOCK_PROVIDER_ID);
    expect(selection).toBeDefined();
    for (const grantId of grantIds) {
      expect(selection?.cantripIds).not.toContain(grantId);
      expect(selection?.ownedSpellIds).not.toContain(grantId);
      expect(selection?.preparedSpellIds).not.toContain(grantId);
    }
  });

  it('V removes a non-starting class and removes its provider-scoped selections before save', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterWizardInput());
    renderAt(`/characters/${character.id}/edit`);

    await user.click(cardByHeading('Wizard').getByRole('button', { name: 'Remove Class' }));
    expect(screen.queryByRole('heading', { name: 'Wizard Spellcasting', level: 3 })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    const [saved] = loadCharacters();
    expect(saved.classProgressions.map((entry) => entry.classId)).toEqual([FIGHTER_ID]);
    expect(saved.spellcastingSelections).toEqual([]);
  });

  it('W never silently removes/redefines the starting class', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterWizardInput());
    renderAt(`/characters/${character.id}/edit`);

    const fighterCard = cardByHeading('Fighter');
    expect(fighterCard.getByRole('button', { name: 'Remove Class' })).toBeDisabled();
    expect(fighterCard.getByText(/Choose another card as Starting Class before removing this one/)).toBeInTheDocument();

    await user.click(cardByHeading('Wizard').getByRole('button', { name: 'Make Starting Class' }));
    expect(cardByHeading('Wizard').getByText('Starting Class')).toBeInTheDocument();
    expect(cardByHeading('Fighter').getByRole('button', { name: 'Remove Class' })).not.toBeDisabled();
  });

  it('X keeps edit changes non-destructive until Save', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({ name: 'M14E Cancel', level: 4, subclassId: CHAMPION_ID }));
    const view = renderAt(`/characters/${character.id}/edit`);

    await user.selectOptions(screen.getByLabelText('Level'), '3');
    view.unmount();

    const [unchanged] = loadCharacters();
    expect(unchanged.classProgressions[0].level).toBe(4);
  });

  it('Y round-trips a valid multiclass Character through v9 edit/save/reload', async () => {
    const user = userEvent.setup();
    const input = fighterWizardInput();
    const character = createCharacter(input);
    renderAt(`/characters/${character.id}/edit`);

    expect(screen.getByText(/Character Level:/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v9');
    const [saved] = loadCharacters();
    expect(saved.startingClassId).toBe(FIGHTER_ID);
    expect(saved.classProgressions.map((entry) => [entry.classId, entry.level])).toEqual([[FIGHTER_ID, 4], [WIZARD_ID, 2]]);
    expect(saved.spellcastingSelections.find((entry) => entry.providerId === WIZARD_PROVIDER_ID)).toEqual(input.spellcastingSelections[0]);
    expect(saved).not.toHaveProperty('level');
    expect(saved).not.toHaveProperty('combinedCasterLevel');
    expect(saved).not.toHaveProperty('slotSource');
  });

  it('Z keeps representative single-class creation/editing straightforward', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({ name: 'M14E Single', level: 4, subclassId: CHAMPION_ID }));
    renderAt(`/characters/${character.id}/edit`);

    expect(screen.getAllByText('Starting Class').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Class')).toHaveValue(FIGHTER_ID);
    expect(screen.getByLabelText('Level')).toHaveValue('4');
    expect(screen.getByLabelText('Subclass')).toHaveValue(CHAMPION_ID);
    expect(screen.getByRole('button', { name: 'Remove Class' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(loadCharacters()[0].classProgressions).toHaveLength(1);
  });
});
