import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { srdId } from '../content/srd';
import type { Character, CharacterClassProgression, CharacterSpellcastingSelection } from '../models/character';
import type { ClassContent, SpellContent, SpellcastingProviderDefinition } from '../models/content';
import type { ContentId } from '../models/contentId';
import { deriveActiveSelfEffectD20Context } from '../rules/activeSelfEffects';
import { classProgressionSkillChoiceContext } from '../rules/classProficiencies';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { createFixedHpProgression } from '../rules/health';
import {
  createLevelUpDraft,
  getLevelUpAdvancementChoiceContext,
  withLevelUpTarget,
} from '../rules/levelUp';
import { meetsMulticlassPrimaryAbilityRequirement } from '../rules/multiclass';
import {
  MULTICLASS_ORDINARY_SLOT_POOL_ID,
  maximumSelectableSpellLevel,
  resolveSpellcastingProviderSpell,
  spellBelongsToProviderList,
  spellcastingCountAtLevel,
} from '../rules/spellcasting';
import {
  createClassForgeDraft,
  createClassFeatureDraft,
  createClassProviderDraft,
  buildClassContentFromDraft,
  replaceProviderContribution,
} from '../components/classForgeModel';
import {
  initializeContentCatalog,
  saveAndPublishHomebrewContent,
} from '../services/contentCatalog';
import {
  CHARACTER_STORAGE_KEY,
  createCharacter,
  getCharacterById,
  loadCharacters,
} from '../services/characterStorage';
import { contentRegistry } from '../services/contentRegistry';
import { loadHomebrewContent } from '../services/homebrewContentStorage';
import { loadPlaySessionState } from '../services/playSessionState';
import { rollSpellAttack, rollSpellDamage } from '../services/spellRolls';
import { fighterInput, type FighterInputPatch } from './fixtures';
import { validateCharacterInput } from '../utils/characterValidation';

function renderRoutes(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function sectionByHeading(name: string | RegExp): HTMLElement {
  const heading = screen.getByRole('heading', { name });
  const section = heading.closest('section');
  if (!section) throw new Error('Missing section for ' + String(name));
  return section;
}

function cardByHeading(name: string | RegExp): HTMLElement {
  const heading = screen.getByRole('heading', { name });
  const card = heading.closest('article');
  if (!card) throw new Error('Missing card for ' + String(name));
  return card;
}

function currentForgeId(kind: 'class' | 'spell' | 'subclass'): ContentId {
  const matches = screen.getAllByText(new RegExp('^homebrew:local:' + kind + ':'));
  const value = matches[0]?.textContent;
  if (!value) throw new Error('Missing Forge id for ' + kind);
  return value;
}

async function addClassFeature(
  user: ReturnType<typeof userEvent.setup>,
  level: number,
  name: string,
  description: string,
): Promise<HTMLElement> {
  const levelCard = screen.getByRole('article', { name: 'Class level ' + level });
  await user.click(within(levelCard).getByRole('button', { name: 'Add Feature' }));
  const unnamed = screen.getAllByRole('heading', { name: 'Unnamed feature' }).at(-1);
  if (!unnamed) throw new Error('Missing new Class feature card.');
  const card = unnamed.closest('article');
  if (!card) throw new Error('Missing new Class feature article.');
  await user.type(within(card).getByLabelText('Feature name'), name);
  await user.type(within(card).getByLabelText('Description'), description);
  return cardByHeading(name);
}

interface ForgeMartialClassOptions {
  readonly asiAt4?: boolean;
  readonly epicBoonAt19?: boolean;
  readonly subclassMarkerAt2?: boolean;
}

async function forgeMartialClassThroughUi(
  user: ReturnType<typeof userEvent.setup>,
  name = 'Forge Sentinel',
  options: ForgeMartialClassOptions = {},
): Promise<ClassContent> {
  const view = renderRoutes('/creator-forge/classes/new');
  const id = currentForgeId('class');

  await user.type(screen.getByLabelText('Class name'), name);
  await user.selectOptions(screen.getByLabelText('Hit Die'), '12');
  await user.clear(screen.getByLabelText('Fixed HP per level'));
  await user.type(screen.getByLabelText('Fixed HP per level'), '7');

  const starting = sectionByHeading('Saves, skills, weapons, armor, and tools');
  await user.click(within(starting).getByLabelText('Strength'));
  await user.click(within(starting).getByLabelText('Constitution'));
  await user.click(within(starting).getByLabelText('Wisdom'));
  await user.click(within(starting).getByLabelText('Charisma'));
  await user.click(within(starting).getByLabelText('Martial'));
  await user.click(within(starting).getByLabelText('Medium'));

  const multiclass = sectionByHeading('Multiclass proficiency package');
  await user.click(within(multiclass).getByLabelText('Simple'));
  await user.click(within(multiclass).getByLabelText('Light'));
  await user.selectOptions(within(multiclass).getByLabelText('Multiclass skill choice kind'), 'class-skill-list');

  const mastery = screen.getByLabelText('Level 1 Weapon Mastery capacity');
  await user.clear(mastery);
  await user.type(mastery, '1');
  const levelTwoMastery = screen.getByLabelText('Level 2 Weapon Mastery capacity');
  await user.clear(levelTwoMastery);
  await user.type(levelTwoMastery, '1');

  const feature = await addClassFeature(user, 1, 'Forge Training', 'A bounded Class feature used by runtime acceptance.');
  await user.click(within(feature).getByText('AUTOMATED — Resources and actions'));

  await user.click(within(feature).getByRole('button', { name: 'Add Resource' }));
  const resourceCard = cardByHeading('Unnamed resource');
  await user.type(within(resourceCard).getByLabelText('Resource name'), 'Forge Reserve');
  const namedResourceCard = cardByHeading('Forge Reserve');
  await user.click(within(namedResourceCard).getByRole('button', { name: 'Add capacity row' }));
  const useInputs = within(namedResourceCard).getAllByLabelText('Maximum uses');
  await user.clear(useInputs[1]);
  await user.type(useInputs[1], '2');

  const featureAfterResource = cardByHeading('Forge Training');
  await user.click(within(featureAfterResource).getByRole('button', { name: 'Add Consumer' }));
  const consumerCard = cardByHeading('Unnamed consumer');
  await user.type(within(consumerCard).getByLabelText('Action name'), 'Forge Burst');

  const featureAfterConsumer = cardByHeading('Forge Training');
  await user.click(within(featureAfterConsumer).getByRole('button', { name: 'Add Transaction' }));
  const transactionCard = cardByHeading('Unnamed transaction');
  await user.type(within(transactionCard).getByLabelText('Name'), 'Forge Renewal');

  const featureAfterTransaction = cardByHeading('Forge Training');
  await user.click(within(featureAfterTransaction).getByRole('button', { name: 'Add Active Self Effect' }));
  const effectCard = cardByHeading('Unnamed self effect');
  await user.type(within(effectCard).getByLabelText('Name'), 'Forge Stance');
  await user.type(within(effectCard).getByLabelText('Description'), 'Gain advantage on Strength checks while active.');

  await addClassFeature(user, 2, 'Veteran Spark', 'A level-2 feature used to prove ordinary Level Up acquisition.');

  if (options.subclassMarkerAt2) {
    const levelTwo = screen.getByRole('article', { name: 'Class level 2' });
    await user.click(within(levelTwo).getByRole('button', { name: 'Add Subclass Marker' }));
  }
  if (options.asiAt4) {
    await addClassFeature(user, 4, 'Ascendant Spark', 'A level-4 feature gained alongside the existing ASI convention.');
    const levelFour = screen.getByRole('article', { name: 'Class level 4' });
    await user.click(within(levelFour).getByRole('button', { name: 'Add ASI' }));
  }
  if (options.epicBoonAt19) {
    const levelNineteen = screen.getByRole('article', { name: 'Class level 19' });
    await user.click(within(levelNineteen).getByRole('button', { name: 'Add Epic Boon' }));
  }

  await user.click(screen.getByRole('button', { name: 'Review Class' }));
  await user.click(screen.getByRole('button', { name: 'Save Class' }));

  const stored = contentRegistry.findClass(id);
  if (!stored) throw new Error('Forge-saved Class missing from live registry.');
  view.unmount();
  return stored;
}

async function forgeSubclassThroughUi(
  user: ReturnType<typeof userEvent.setup>,
  parentClassId: ContentId,
  name = 'Forge Vanguard',
): Promise<ContentId> {
  const view = renderRoutes('/creator-forge/subclasses/new');
  const id = currentForgeId('subclass');
  await user.type(screen.getByLabelText('Subclass name'), name);
  await user.selectOptions(screen.getByLabelText('Parent Class'), parentClassId);
  await user.type(screen.getByLabelText('Subclass description'), 'Custom subclass for M16-F cross-family acceptance.');
  const acquisition = screen.getByLabelText('Subclass acquisition level');
  await user.clear(acquisition);
  await user.type(acquisition, '2');
  await user.click(screen.getByRole('button', { name: 'Add Subclass Feature' }));
  const card = cardByHeading('Unnamed feature');
  await user.type(within(card).getByLabelText('Feature name'), 'Vanguard Edge');
  await user.type(within(card).getByLabelText('Description'), 'A bounded custom subclass feature.');
  await user.click(screen.getByRole('button', { name: 'Review Subclass' }));
  await user.click(screen.getByRole('button', { name: 'Save Subclass' }));
  if (!contentRegistry.findSubclass(id)) throw new Error('Forge-saved Subclass missing from live registry.');
  view.unmount();
  return id;
}

async function forgeSpellThroughUi(
  user: ReturnType<typeof userEvent.setup>,
  name = 'Forge Bolt',
): Promise<SpellContent> {
  const view = renderRoutes('/creator-forge/spells/new');
  const id = currentForgeId('spell');
  await user.type(screen.getByLabelText('Spell name'), name);
  await user.selectOptions(screen.getByLabelText('Spell level'), '1');
  await user.type(screen.getByLabelText('Spell description'), 'A stable custom Spell referenced by a custom Class provider.');
  await user.click(screen.getByLabelText('Spell list Wizard'));
  await user.click(screen.getByLabelText('Enable Spell Attack'));
  await user.click(screen.getByRole('button', { name: 'Add Damage Mechanic' }));
  await user.click(screen.getByRole('button', { name: 'Review Spell' }));
  await user.click(screen.getByRole('button', { name: 'Save Spell' }));
  const spell = contentRegistry.findSpell(id);
  if (!spell) throw new Error('Forge-saved Spell missing from live registry.');
  view.unmount();
  return spell;
}

async function forgeSpellcastingClassThroughUi(
  user: ReturnType<typeof userEvent.setup>,
  customSpellId: ContentId,
  name = 'Forge Arcanist',
): Promise<ClassContent> {
  const view = renderRoutes('/creator-forge/classes/new');
  const id = currentForgeId('class');
  await user.type(screen.getByLabelText('Class name'), name);

  const core = sectionByHeading('Hit Die, HP, and primary ability');
  await user.click(within(core).getByLabelText('Strength'));
  await user.click(within(core).getByLabelText('Intelligence'));

  const feature = await addClassFeature(user, 1, 'Forge Spellcasting', 'A bounded ordinary Spellcasting provider.');
  await user.click(within(feature).getByText('AUTOMATED — Class Spellcasting'));
  const spellcasting = cardByHeading('Forge Spellcasting');
  await user.click(within(spellcasting).getByRole('button', { name: 'Add Spellcasting Provider' }));
  const providerCard = cardByHeading('Unnamed provider');
  await user.type(within(providerCard).getByLabelText('Provider name'), 'Forge Casting');
  await user.selectOptions(within(providerCard).getByLabelText('Spellcasting ability'), 'intelligence');
  await user.selectOptions(within(providerCard).getByLabelText('Multiclass slot contribution'), 'full');
  await user.selectOptions(within(providerCard).getByLabelText('Spell list'), 'wizard');

  const spellcastingAfterProvider = cardByHeading('Forge Spellcasting');
  await user.click(within(spellcastingAfterProvider).getByRole('button', { name: 'Add Granted Spells' }));
  const grantedSpells = screen.getByLabelText('Granted Spells') as HTMLSelectElement;
  const seededGrantIds = [...grantedSpells.selectedOptions].map((option) => option.value);
  if (seededGrantIds.length > 0) await user.deselectOptions(grantedSpells, seededGrantIds);
  await user.selectOptions(grantedSpells, [customSpellId]);

  await user.click(screen.getByRole('button', { name: 'Review Class' }));
  await user.click(screen.getByRole('button', { name: 'Save Class' }));
  const classContent = contentRegistry.findClass(id);
  if (!classContent) throw new Error('Forge-saved spellcasting Class missing from registry.');
  view.unmount();
  return classContent;
}

function progression(
  classContent: ClassContent,
  level: number,
  starting: boolean,
  skills?: readonly string[],
  subclassId?: ContentId,
): CharacterClassProgression {
  const context = classProgressionSkillChoiceContext(classContent, starting);
  return {
    classId: classContent.id,
    level,
    ...(subclassId ? { subclassId } : {}),
    skillProficiencies: [...((skills as CharacterClassProgression['skillProficiencies'] | undefined) ?? context.from.slice(0, context.choose))],
    skillExpertise: [],
    weaponMasterySelections: [],
    hpProgression: createFixedHpProgression(level, starting),
  };
}

function customClassInput(
  classContent: ClassContent,
  level = 1,
  patch: FighterInputPatch = {},
): ReturnType<typeof fighterInput> {
  return fighterInput({
    name: 'Forge Runtime Character',
    startingClassId: classContent.id,
    classId: classContent.id,
    level,
    subclassId: undefined,
    skillProficiencies: [...classContent.skillChoices.from.slice(0, classContent.skillChoices.choose)],
    hpProgression: createFixedHpProgression(level, true),
    abilityScores: { strength: 14, dexterity: 14, constitution: 14, intelligence: 14, wisdom: 14, charisma: 14 },
    ...patch,
  });
}

function providerDefinition(classContent: ClassContent): SpellcastingProviderDefinition {
  const provider = classContent.progression.flatMap((row) => row.features).flatMap((feature) => feature.spellcasting ?? [])[0];
  if (!provider) throw new Error('Expected Forge spellcasting provider.');
  return provider;
}

function providerSelection(provider: SpellcastingProviderDefinition, ownerLevel: number): CharacterSpellcastingSelection {
  const management = provider.spellManagement;
  if (management.kind === 'granted-only') {
    return { providerId: provider.id, cantripIds: [], ownedSpellIds: [], preparedSpellIds: [] };
  }
  const spells = contentRegistry.getAll('spell').filter((spell) => spellBelongsToProviderList(spell, management.spellListId));
  const cantripCount = spellcastingCountAtLevel(management.cantripCount, ownerLevel);
  const preparedCount = spellcastingCountAtLevel(management.preparedSpellCount, ownerLevel);
  const cantripIds = spells.filter((spell) => spell.level === 0).slice(0, cantripCount).map((spell) => spell.id);
  const maxLevel = maximumSelectableSpellLevel(provider, ownerLevel);
  const leveled = spells.filter((spell) => spell.level > 0 && spell.level <= maxLevel);
  if (management.kind === 'prepared-from-owned') {
    const ownedSpellIds = leveled.filter((spell) => spell.level === management.initialOwnedSpellLevel).slice(0, management.initialOwnedSpellCount).map((spell) => spell.id);
    return { providerId: provider.id, cantripIds, ownedSpellIds, preparedSpellIds: ownedSpellIds.slice(0, preparedCount) };
  }
  return { providerId: provider.id, cantripIds, ownedSpellIds: [], preparedSpellIds: leveled.slice(0, preparedCount).map((spell) => spell.id) };
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  initializeContentCatalog(window.localStorage);
});

describe('M16-F runtime acceptance', () => {
  it('A/G/H/M saves through real Class Forge, creates a starting Character immediately, and uses generic PLAY/resource/effect surfaces', async () => {
    const user = userEvent.setup();
    const customClass = await forgeMartialClassThroughUi(user, 'Forge Sentinel');

    expect(loadHomebrewContent(window.localStorage).find((entry) => entry.id === customClass.id)).toEqual(customClass);
    expect(contentRegistry.findClass(customClass.id)).toEqual(customClass);
    expect(customClass.progression[0].weaponMasteryChoices).toBe(1);

    const characterView = renderRoutes('/characters/new');
    await user.type(screen.getByLabelText('Character Name'), 'Kael Forge');
    await user.selectOptions(screen.getByLabelText('Class'), customClass.id);
    const classCard = cardByHeading('Forge Sentinel');
    await user.click(within(classCard).getByLabelText('Athletics'));
    await user.click(within(classCard).getByLabelText('Perception'));

    for (const [label, value] of Object.entries({
      Strength: '14',
      Dexterity: '14',
      Constitution: '14',
      Intelligence: '14',
      Wisdom: '14',
      Charisma: '14',
    })) await user.type(screen.getByLabelText(label), value);

    await user.click(screen.getByLabelText('Forge Sentinel Weapon Mastery: Club'));

    await user.click(screen.getByRole('button', { name: 'Create Character' }));
    const [saved] = loadCharacters();
    expect(saved.startingClassId).toBe(customClass.id);
    expect(saved.classProgressions).toEqual([expect.objectContaining({
      classId: customClass.id,
      level: 1,
      skillProficiencies: ['athletics', 'perception'],
      hpProgression: [],
    })]);
    expect((saved as Character & { classContent?: unknown }).classContent).toBeUndefined();
    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v10');

    const derived = deriveCharacterState(saved, contentRegistry);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.value.startingClassId).toBe(customClass.id);
    expect(derived.value.classProficiencies.savingThrowProficiencies).toEqual(['wisdom', 'charisma']);
    expect(derived.value.classProficiencies.armorTraining).toContain('medium');
    expect(derived.value.classProficiencies.weaponProficiencies).toEqual(expect.arrayContaining([
      { kind: 'category', category: 'simple' },
      { kind: 'category', category: 'martial' },
    ]));
    expect(derived.value.health.maximumHp).toBe(customClass.hitDie + derived.value.abilityModifiers.constitution);
    expect(derived.value.health.hitDice).toEqual([{ die: 12, maximum: 1 }]);
    expect(derived.value.proficiencyBonus).toBe(2);

    const reserve = derived.value.resources.find((resource) => resource.name === 'Forge Reserve');
    const transaction = derived.value.resourceTransactions.find((entry) => entry.name === 'Forge Renewal');
    const effect = derived.value.activeSelfEffects.find((entry) => entry.name === 'Forge Stance');
    expect(reserve).toMatchObject({ maximumUses: 1, owner: { kind: 'class', level: 1, classId: customClass.id } });
    expect(transaction).toBeDefined();
    expect(effect).toMatchObject({ owner: { kind: 'class', level: 1, classId: customClass.id } });
    if (!reserve || !transaction || !effect) throw new Error('Missing Forge runtime mechanics.');

    expect((await screen.findAllByText('Forge Reserve')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Expend Forge Burst' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use Forge Renewal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activate Forge Stance' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expend Forge Burst' }));
    expect(getCharacterById(saved.id)?.playState.resourceUses[reserve.id]).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Use Forge Renewal' }));
    expect(getCharacterById(saved.id)?.playState.resourceUses[reserve.id]).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Activate Forge Stance' }));
    expect(getCharacterById(saved.id)?.playState.resourceUses[reserve.id]).toBe(0);
    const session = loadPlaySessionState(saved.id);
    expect(session.activeEffectIds).toContain(effect.id);
    expect(screen.getAllByText('Forge Stance').length).toBeGreaterThan(0);
    expect(deriveActiveSelfEffectD20Context(derived.value, session.activeEffectIds, { kind: 'ability-check', ability: 'strength' }))
      .toEqual({ advantageSources: ['Forge Stance'] });

    expect('weaponMasterySelections' in saved).toBe(false);
    characterView.unmount();
  }, 60000);

  it('B/C levels an existing Forge Class through unchanged M15, acquires its level-4 feature and exact ASI convention, and confirms Character v9', async () => {
    const user = userEvent.setup();
    const customClass = await forgeMartialClassThroughUi(user, 'Forge Ascendant', { asiAt4: true, epicBoonAt19: true });
    const character = createCharacter(customClassInput(customClass, 3));

    const beforeHp = deriveCharacterState(character, contentRegistry);
    if (!beforeHp.ok) throw new Error(beforeHp.error.message);

    const view = renderRoutes('/characters/' + character.id + '/level-up');
    await user.click(screen.getByRole('radio', { name: /Forge Ascendant.*Level 3.*Level 4/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Advancement Choices' }));

    expect(screen.getByRole('heading', { name: 'Ability Score Improvement' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Ability Score Improvement.*Increase one ability score by 2/i }));
    await user.selectOptions(screen.getByLabelText('Ability Score Increase 1'), 'constitution');
    await user.selectOptions(screen.getByLabelText('Ability Score Increase 2'), 'constitution');
    await user.click(screen.getByRole('button', { name: 'Next: Review' }));

    expect(screen.getByRole('heading', { name: 'Review Level Up' })).toBeInTheDocument();
    expect(screen.getAllByText(/Forge Ascendant/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Confirm Level Up' }));

    const updated = getCharacterById(character.id);
    expect(updated?.classProgressions[0]).toMatchObject({
      classId: customClass.id,
      level: 4,
      hpProgression: [
        { classLevel: 2, method: 'fixed' },
        { classLevel: 3, method: 'fixed' },
        { classLevel: 4, method: 'fixed' },
      ],
    });
    expect(updated?.abilityScores.constitution).toBe(14);
    expect(updated?.manualFeats).toEqual(expect.arrayContaining([
      expect.objectContaining({ choices: expect.objectContaining({ 'ability-increase': ['constitution', 'constitution'] }) }),
    ]));
    if (!updated) throw new Error('Missing confirmed Character.');
    const after = deriveCharacterState(updated, contentRegistry);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.value.abilityScores.constitution).toBe(16);
    expect(after.value.health.hitDice).toEqual([{ die: 12, maximum: 4 }]);
    expect(after.value.health.maximumHp).toBeGreaterThan(beforeHp.value.health.maximumHp);
    expect(after.value.classProgressions[0].acquiredFeatures.map((feature) => feature.name)).toContain('Ascendant Spark');
    expect(after.value.resources.find((resource) => resource.name === 'Forge Reserve')).toMatchObject({
      maximumUses: 2,
      owner: { kind: 'class', level: 4, classId: customClass.id },
    });
    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v10');

    const level18 = createCharacter(customClassInput(customClass, 18, {
      name: 'Forge Epic Candidate',
      hpProgression: createFixedHpProgression(18, true),
    }));
    const epicContext = getLevelUpAdvancementChoiceContext(
      level18,
      withLevelUpTarget(createLevelUpDraft(level18), { kind: 'existing-class', classId: customClass.id }),
      contentRegistry,
    );
    expect(epicContext).toMatchObject({
      ok: true,
      value: { currentClassLevel: 18, nextClassLevel: 19, featGrant: { kind: 'epic-boon' } },
    });
    view.unmount();
  }, 60000);

  it('D multiclasses into a Forge Class through M15 using authored prerequisite/package and added-Class HP semantics', async () => {
    const user = userEvent.setup();
    const customClass = await forgeMartialClassThroughUi(user, 'Forge Multiclass');
    expect(meetsMulticlassPrimaryAbilityRequirement(customClass.primaryAbility, {
      strength: 13, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10,
    })).toBe(true);
    expect(meetsMulticlassPrimaryAbilityRequirement(customClass.primaryAbility, {
      strength: 12, dexterity: 20, constitution: 20, intelligence: 20, wisdom: 20, charisma: 20,
    })).toBe(false);

    const wizard = contentRegistry.findClass(srdId('class', 'wizard'));
    if (!wizard) throw new Error('Missing Wizard.');
    const character = createCharacter(fighterInput({
      name: 'Wizard Into Forge',
      startingClassId: wizard.id,
      classId: wizard.id,
      level: 1,
      subclassId: undefined,
      skillProficiencies: [...wizard.skillChoices.from.slice(0, wizard.skillChoices.choose)],
      hpProgression: [],
      abilityScores: { strength: 14, intelligence: 14 },
      spellcastingSelections: [providerSelection(providerDefinition(wizard), 1)],
    }));

    const view = renderRoutes('/characters/' + character.id + '/level-up');
    await user.click(screen.getByRole('radio', { name: /Forge Multiclass.*Add at class level 1/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    expect(screen.getByText(/ordinary added-level HP/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));
    const skillsSection = sectionByHeading('Added-class skills');
    await user.click(within(skillsSection).getByLabelText('Athletics'));
    await user.click(screen.getByLabelText('Forge Multiclass Weapon Mastery: Club'));
    await user.click(screen.getByRole('button', { name: 'Next: Review' }));
    await user.click(screen.getByRole('button', { name: 'Confirm Level Up' }));

    const updated = getCharacterById(character.id);
    if (!updated) throw new Error('Missing multiclass Character.');
    expect(updated.startingClassId).toBe(wizard.id);
    const forgeProgression = updated.classProgressions.find((entry) => entry.classId === customClass.id);
    expect(forgeProgression).toMatchObject({
      level: 1,
      skillProficiencies: ['athletics'],
      hpProgression: [{ classLevel: 1, method: 'fixed' }],
    });
    const derived = deriveCharacterState(updated, contentRegistry);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.value.classProficiencies.savingThrowProficiencies).toEqual(wizard.savingThrowProficiencies);
    expect(derived.value.classProficiencies.savingThrowProficiencies).not.toContain('charisma');
    expect(derived.value.classProficiencies.armorTraining).toContain('light');
    expect(derived.value.classProficiencies.armorTraining).not.toContain('medium');
    expect(derived.value.health.hitDice).toEqual(expect.arrayContaining([{ die: 6, maximum: 1 }, { die: 12, maximum: 1 }]));
    expect(derived.value.proficiencyBonus).toBe(2);
    expect(derived.value.resources.find((resource) => resource.name === 'Forge Reserve')).toMatchObject({
      maximumUses: 1,
      owner: { kind: 'class', level: 1, classId: customClass.id },
    });
    view.unmount();
  }, 30000);

  it('E multiclasses out of a Forge starting Class and preserves starting saves/proficiencies/owner mechanics', async () => {
    const user = userEvent.setup();
    const customClass = await forgeMartialClassThroughUi(user, 'Forge Origin');
    const character = createCharacter(customClassInput(customClass, 1, {
      name: 'Forge Into Rogue',
      abilityScores: { dexterity: 14, strength: 14 },
    }));
    const rogue = contentRegistry.findClass(srdId('class', 'rogue'));
    if (!rogue) throw new Error('Missing Rogue.');

    const view = renderRoutes('/characters/' + character.id + '/level-up');
    await user.click(screen.getByRole('radio', { name: /Rogue.*Add at class level 1/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));
    const skillSection = sectionByHeading('Added-class skills');
    const firstAllowed = classProgressionSkillChoiceContext(rogue, false).from[0];
    const label = firstAllowed[0].toUpperCase() + firstAllowed.slice(1);
    const skillInput = within(skillSection).queryByLabelText(label) ?? within(skillSection).getAllByRole('checkbox')[0];
    await user.click(skillInput);
    const expertiseSection = sectionByHeading('Rogue Expertise');
    await user.click(within(expertiseSection).getByLabelText('Athletics'));
    await user.click(within(expertiseSection).getByLabelText('Perception'));
    await user.click(screen.getByLabelText('Rogue Weapon Mastery: Dagger'));
    await user.click(screen.getByLabelText('Rogue Weapon Mastery: Light Crossbow'));
    await user.click(screen.getByLabelText('Level Up language: Elvish'));
    await user.click(screen.getByRole('button', { name: 'Next: Review' }));
    await user.click(screen.getByRole('button', { name: 'Confirm Level Up' }));

    const updated = getCharacterById(character.id);
    if (!updated) throw new Error('Missing reverse multiclass Character.');
    expect(updated.startingClassId).toBe(customClass.id);
    const derived = deriveCharacterState(updated, contentRegistry);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.value.classProficiencies.savingThrowProficiencies).toEqual(['wisdom', 'charisma']);
    expect(derived.value.classProficiencies.armorTraining).toContain('medium');
    expect(derived.value.classProficiencies.weaponProficiencies).toContainEqual({ kind: 'category', category: 'martial' });
    expect(derived.value.health.hitDice).toEqual(expect.arrayContaining([{ die: 8, maximum: 1 }, { die: 12, maximum: 1 }]));
    expect(derived.value.proficiencyBonus).toBe(2);
    expect(derived.value.resources.find((resource) => resource.name === 'Forge Reserve')?.owner).toMatchObject({
      kind: 'class', level: 1, classId: customClass.id,
    });
    view.unmount();
  }, 30000);

  it('F uses real Subclass Forge with a custom parent and lets unchanged Level Up acquire it at the custom parent level', async () => {
    const user = userEvent.setup();
    const customClass = await forgeMartialClassThroughUi(user, 'Forge Parent', { subclassMarkerAt2: true });
    const subclassId = await forgeSubclassThroughUi(user, customClass.id, 'Forge Vanguard');
    expect(contentRegistry.findSubclassesForClass(customClass.id).map((entry) => entry.id)).toContain(subclassId);
    expect(contentRegistry.findSubclassesForClass(srdId('class', 'fighter')).map((entry) => entry.id)).not.toContain(subclassId);

    const character = createCharacter(customClassInput(customClass, 1));
    const view = renderRoutes('/characters/' + character.id + '/level-up');
    await user.click(screen.getByRole('radio', { name: /Forge Parent.*Level 1.*Level 2/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
    await user.click(screen.getByRole('button', { name: /Fixed HP/i }));
    expect(screen.getByRole('heading', { name: 'Subclass' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Forge Vanguard/i }));
    await user.click(screen.getByRole('button', { name: 'Next: Review' }));
    await user.click(screen.getByRole('button', { name: 'Confirm Level Up' }));

    const updated = getCharacterById(character.id);
    expect(updated?.classProgressions[0].subclassId).toBe(subclassId);
    if (!updated) throw new Error('Missing subclass-confirmed Character.');
    const derived = deriveCharacterState(updated, contentRegistry);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    const classState = derived.value.classProgressions.find((entry) => entry.id === customClass.id);
    expect(classState?.subclass).toMatchObject({
      id: subclassId,
      parentClassId: customClass.id,
      parentClassLevel: 2,
      acquisitionLevel: 2,
    });
    expect(classState?.subclass?.acquiredFeatures.map((feature) => feature.name)).toContain('Vanguard Edge');
    view.unmount();
  }, 60000);

  it('I/J saves a real M16-D Spell, references it from real Class Forge Spellcasting, and uses normal provider/UI/roll rules', async () => {
    const user = userEvent.setup();
    const customSpell = await forgeSpellThroughUi(user, 'Forge Bolt');
    const customClass = await forgeSpellcastingClassThroughUi(user, customSpell.id, 'Forge Arcanist');
    const provider = providerDefinition(customClass);
    expect(provider.multiclassSlotContribution).toEqual({ kind: 'spellcasting', contribution: 'full' });
    expect(maximumSelectableSpellLevel(provider, 3)).toBe(2);

    const selection = providerSelection(provider, 3);
    expect(provider.spellManagement.kind).not.toBe('granted-only');
    expect(selection.cantripIds).toHaveLength(2);
    const input = customClassInput(customClass, 3, {
      name: 'Forge Arcanist Character',
      hpProgression: createFixedHpProgression(3, true),
      spellcastingSelections: [selection],
      abilityScores: { intelligence: 16, strength: 14 },
    });
    expect(validateCharacterInput(input, {}, contentRegistry)).toEqual({});
    const character = createCharacter(input);
    const derived = deriveCharacterState(character, contentRegistry);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    const runtimeProvider = derived.value.spellcasting.find((entry) => entry.id === provider.id);
    expect(runtimeProvider).toMatchObject({
      id: provider.id,
      owner: { kind: 'class', level: 3, classId: customClass.id },
      ability: 'intelligence',
    });
    if (!runtimeProvider) throw new Error('Missing runtime custom provider.');
    expect(runtimeProvider.attackModifier).toBe(derived.value.abilityModifiers.intelligence + derived.value.proficiencyBonus);
    expect(runtimeProvider.saveDc).toBe(8 + derived.value.abilityModifiers.intelligence + derived.value.proficiencyBonus);
    expect(runtimeProvider.spellGrants.map((grant) => grant.spell.id)).toContain(customSpell.id);
    expect(resolveSpellcastingProviderSpell(derived.value, provider.id, customSpell.id)).toMatchObject({ ok: true });
    expect(character.spellcastingSelections).toHaveLength(1);
    expect((character as Character & { derivedSpellcasting?: unknown }).derivedSpellcasting).toBeUndefined();

    const editView = renderRoutes('/characters/' + character.id + '/edit');
    expect(screen.getByRole('heading', { name: 'Forge Casting' })).toBeInTheDocument();
    expect(screen.getByText(/Forge Bolt/)).toBeInTheDocument();
    editView.unmount();

    const attack = rollSpellAttack(character, derived.value, provider.id, customSpell.id, 'normal', { rng: () => 0.5 });
    expect(attack.ok).toBe(true);
    const damage = rollSpellDamage(character, derived.value, provider.id, customSpell.id, 1, false, { rng: () => 0.5 });
    expect(damage.ok).toBe(true);
    expect(contentRegistry.findSpell(customSpell.id)).toEqual(customSpell);
    expect(customClass.progression.flatMap((row) => row.features).flatMap((feature) => feature.spellGrants ?? [])[0]?.spellIds).toContain(customSpell.id);
  }, 30000);

  it('K combines ordinary slots for a Forge full caster + Wizard while keeping provider-local Spell access separate', async () => {
    const user = userEvent.setup();
    const customSpell = await forgeSpellThroughUi(user, 'Forge Ray');
    const customClass = await forgeSpellcastingClassThroughUi(user, customSpell.id, 'Forge Full Caster');
    const customProvider = providerDefinition(customClass);
    const wizard = contentRegistry.findClass(srdId('class', 'wizard'));
    if (!wizard) throw new Error('Missing Wizard.');
    const wizardProvider = providerDefinition(wizard);

    const input = fighterInput({
      name: 'Forge Multiclass Caster',
      startingClassId: customClass.id,
      classProgressions: [
        progression(customClass, 2, true),
        progression(wizard, 2, false),
      ],
      abilityScores: { strength: 14, intelligence: 16 },
      spellcastingSelections: [
        providerSelection(customProvider, 2),
        providerSelection(wizardProvider, 2),
      ],
    });
    expect(validateCharacterInput(input, {}, contentRegistry)).toEqual({});
    const character = createCharacter(input);
    const derived = deriveCharacterState(character, contentRegistry);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;

    expect(derived.value.ordinaryMulticlassCasterLevel).toBe(4);
    expect(derived.value.ordinaryMulticlassSlotPool).toMatchObject({
      id: MULTICLASS_ORDINARY_SLOT_POOL_ID,
      slots: [
        { spellLevel: 1, maximumUses: 4 },
        { spellLevel: 2, maximumUses: 3 },
      ],
    });
    expect(derived.value.spellcasting).toHaveLength(2);
    expect(derived.value.spellcasting.find((entry) => entry.id === customProvider.id)?.owner).toMatchObject({ kind: 'class', level: 2, classId: customClass.id });
    expect(derived.value.spellcasting.find((entry) => entry.id === wizardProvider.id)?.owner).toMatchObject({ kind: 'class', level: 2, classId: wizard.id });
    expect(resolveSpellcastingProviderSpell(derived.value, customProvider.id, customSpell.id)).toMatchObject({ ok: true });
    expect(resolveSpellcastingProviderSpell(derived.value, wizardProvider.id, customSpell.id)).toMatchObject({ ok: false });
    expect(derived.value.proficiencyBonus).toBe(2);
  }, 30000);

  it('L preserves Forge Pact/independent canonical provider modes without changing existing pool semantics', () => {
    for (const [mode, expectedKind] of [['pact', 'pact-magic'], ['independent', 'independent']] as const) {
      const draft = createClassForgeDraft();
      const provider = replaceProviderContribution(createClassProviderDraft(1, 'wizard'), mode, 1);
      const feature = {
        ...createClassFeatureDraft(1),
        name: mode === 'pact' ? 'Forge Pact' : 'Forge Independent',
        description: 'Focused provider preservation fixture.',
        providers: [{ ...provider, definition: { ...provider.definition, name: mode === 'pact' ? 'Pact Forge' : 'Independent Forge' } }],
      };
      const classContent = buildClassContentFromDraft({ ...draft, name: mode === 'pact' ? 'Forge Pact Class' : 'Forge Independent Class', features: [feature] });
      expect(saveAndPublishHomebrewContent([classContent], window.localStorage).ok).toBe(true);
      const published = contentRegistry.findClass(classContent.id);
      expect(published).toBeDefined();
      const definition = published?.progression[0].features[0].spellcasting?.[0];
      expect(definition?.multiclassSlotContribution.kind).toBe(expectedKind);
      expect(definition?.slotPool).toBeDefined();
      expect(definition?.slotPool?.recovery[0]?.trigger).toBe(mode === 'pact' ? 'short-rest' : 'long-rest');
    }
  });
});
