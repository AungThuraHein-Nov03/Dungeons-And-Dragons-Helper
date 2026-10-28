import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { buildSpellContentFromDraft, createSpellForgeDraft } from '../components/spellForgeModel';
import { srdId } from '../content/srd';
import type { CharacterClassProgression, CharacterInput } from '../models/character';
import { deriveActiveSelfEffectD20Context } from '../rules/activeSelfEffects';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { createFixedHpProgression } from '../rules/health';
import {
  buildLevelUpReview,
  createLevelUpDraft,
  getLevelUpCoreChoiceContext,
  getConfirmableLevelUpCandidate,
  withFixedLevelUpHitPoints,
  withLevelUpSubclass,
  withLevelUpTarget,
} from '../rules/levelUp';
import { MULTICLASS_ORDINARY_SLOT_POOL_ID, maximumSelectableSpellLevel } from '../rules/spellcasting';
import { activateCharacterActiveSelfEffect } from '../services/activeSelfEffects';
import { initializeContentCatalog, saveAndPublishHomebrewContent } from '../services/contentCatalog';
import {
  CHARACTER_STORAGE_KEY,
  createCharacter,
  getCharacterById,
} from '../services/characterStorage';
import {
  consumeCharacterResource,
  executeCharacterResourceTransaction,
} from '../services/characterPlayState';
import { contentRegistry } from '../services/contentRegistry';
import { confirmLevelUp } from '../services/levelUpPersistence';
import { loadPlaySessionState } from '../services/playSessionState';
import { rollSpellAttack } from '../services/spellRolls';
import { fighterInput } from './fixtures';

const FIGHTER_ID = srdId('class', 'fighter');
const BARBARIAN_ID = srdId('class', 'barbarian');
const BERSERKER_ID = srdId('subclass', 'barbarian:path-of-the-berserker');

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function featureCard(name: string | RegExp = /Unnamed feature|Runtime Core/i): HTMLElement {
  const heading = screen.getByRole('heading', { name });
  const card = heading.closest('article');
  if (!card) throw new Error('Subclass feature card unavailable.');
  return card;
}

function currentForgeId(): string {
  const text = screen.getByText(/^homebrew:local:subclass:/).textContent;
  if (!text) throw new Error('Subclass Forge ID unavailable.');
  return text;
}

async function forgeSimpleFighterSubclass(user: ReturnType<typeof userEvent.setup>, name: string) {
  const view = renderAt('/creator-forge/subclasses/new');
  await user.selectOptions(screen.getByLabelText('Parent Class'), FIGHTER_ID);
  await user.type(screen.getByLabelText('Subclass name'), name);
  await user.type(screen.getByLabelText('Subclass description'), 'Runtime acceptance subclass.');
  await user.click(screen.getByRole('button', { name: 'Add Subclass Feature' }));
  const card = featureCard();
  await user.type(within(card).getByLabelText('Feature name'), 'Runtime Core');
  await user.type(within(card).getByLabelText('Description'), 'Runtime feature.');
  await user.selectOptions(within(card).getByLabelText('Static effect'), 'initiative-modifier');
  await user.click(within(card).getByRole('button', { name: 'Add Static Effect' }));
  const id = currentForgeId();
  await user.click(screen.getByRole('button', { name: 'Review Subclass' }));
  await user.click(screen.getByRole('button', { name: 'Save Subclass' }));
  expect(contentRegistry.findSubclass(id)?.name).toBe(name);
  view.unmount();
  return contentRegistry.findSubclass(id)!;
}

function progression(
  classId: string,
  level: number,
  starting: boolean,
  subclassId?: string,
): CharacterClassProgression {
  const classContent = contentRegistry.findClass(classId);
  if (!classContent) throw new Error('Missing class ' + classId);
  const skills = starting
    ? [...classContent.skillChoices.from.slice(0, classContent.skillChoices.choose)]
    : [];
  return {
    classId,
    level,
    ...(subclassId ? { subclassId } : {}),
    skillProficiencies: skills,
    skillExpertise: [],
    weaponMasterySelections: [],
    hpProgression: createFixedHpProgression(level, starting),
  };
}

function derived(character: ReturnType<typeof createCharacter>) {
  const result = deriveCharacterState(character, contentRegistry);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function createCustomSpell() {
  const base = createSpellForgeDraft();
  const spell = buildSpellContentFromDraft({
    ...base,
    name: 'Forge Lance',
    description: 'A focused lance of force from the Creator Forge acceptance fixture.',
    level: 1,
    spellLists: [{ id: 'wizard', name: 'Wizard' }],
    attack: { type: 'spell-attack', attackType: 'ranged' },
    damage: {
      amount: { dice: [{ count: 1, die: 8 }], modifier: 'none' },
      damageType: 'force',
    },
  });
  const saved = saveAndPublishHomebrewContent([spell], window.localStorage);
  expect(saved.ok).toBe(true);
  expect(contentRegistry.findSpell(spell.id)?.name).toBe('Forge Lance');
  return spell;
}

async function forgeComplexFighterSubclass(
  user: ReturnType<typeof userEvent.setup>,
  customSpellId: string,
) {
  const view = renderAt('/creator-forge/subclasses/new');
  await user.selectOptions(screen.getByLabelText('Parent Class'), FIGHTER_ID);
  await user.type(screen.getByLabelText('Subclass name'), 'Runtime Vanguard');
  await user.type(screen.getByLabelText('Subclass description'), 'Mechanics-heavy M16-E runtime acceptance subclass.');
  await user.click(screen.getByRole('button', { name: 'Add Subclass Feature' }));
  const card = featureCard();
  await user.type(within(card).getByLabelText('Feature name'), 'Runtime Core');
  await user.type(within(card).getByLabelText('Description'), 'Bounded runtime mechanics.');

  await user.click(within(card).getByText('AUTOMATED — Resources and actions'));
  await user.click(within(card).getByRole('button', { name: 'Add Resource' }));
  const resourceArticle = within(card).getByText('Automated Resource').closest('article');
  if (!resourceArticle) throw new Error('Resource editor unavailable.');
  await user.type(within(resourceArticle).getByLabelText('Resource name'), 'Forge Reserve');
  const resourceId = within(resourceArticle).getByText(/^homebrew:local:class-resource:/).textContent;
  if (!resourceId) throw new Error('Forge Reserve identity unavailable.');
  await user.click(within(resourceArticle).getByRole('button', { name: 'Add capacity row' }));
  const ownerLevels = within(resourceArticle).getAllByLabelText('Owner level');
  const maximumUses = within(resourceArticle).getAllByLabelText('Maximum uses');
  await user.clear(ownerLevels[1]);
  await user.type(ownerLevels[1], '5');
  await user.clear(maximumUses[1]);
  await user.type(maximumUses[1], '2');

  await user.click(within(card).getByRole('button', { name: 'Add Consumer' }));
  const consumerArticle = within(card).getByText('Automated Action').closest('article');
  if (!consumerArticle) throw new Error('Consumer editor unavailable.');
  await user.type(within(consumerArticle).getByLabelText('Action name'), 'Forge Burst');
  await user.selectOptions(within(consumerArticle).getByLabelText('Resource'), resourceId);

  await user.click(within(card).getByRole('button', { name: 'Add Transaction' }));
  const transactionArticle = within(card).getByText('Automated Transaction').closest('article');
  if (!transactionArticle) throw new Error('Transaction editor unavailable.');
  await user.type(within(transactionArticle).getByLabelText('Name'), 'Forge Renewal');
  await user.selectOptions(within(transactionArticle).getByLabelText('Target resource'), resourceId);

  await user.click(within(card).getByRole('button', { name: 'Add Active Self Effect' }));
  const activeArticle = within(card).getByText('Automated Self Effect').closest('article');
  if (!activeArticle) throw new Error('Active-effect editor unavailable.');
  await user.type(within(activeArticle).getByLabelText('Name'), 'Forge Stance');
  await user.type(within(activeArticle).getByLabelText('Description'), 'Advantage on Strength ability checks while active.');
  await user.selectOptions(within(activeArticle).getByLabelText('Activation resource'), resourceId);

  await user.click(within(card).getByText('AUTOMATED — Subclass Spellcasting'));
  await user.click(within(card).getByRole('button', { name: 'Add Spellcasting Provider' }));
  await user.type(within(card).getByLabelText('Provider name'), 'Forge Casting');
  await user.selectOptions(within(card).getByLabelText('Spellcasting ability'), 'intelligence');
  await user.selectOptions(within(card).getByLabelText('Multiclass slot contribution'), 'full');
  await user.selectOptions(within(card).getByLabelText('Spell list'), 'wizard');

  await user.click(within(card).getByRole('button', { name: 'Add Granted Spells' }));
  const grantedSpells = within(card).getByLabelText('Granted Spells') as HTMLSelectElement;
  const initiallySelected = [...grantedSpells.selectedOptions].map((option) => option.value);
  if (initiallySelected.length > 0) await user.deselectOptions(grantedSpells, initiallySelected);
  await user.selectOptions(grantedSpells, customSpellId);

  const id = currentForgeId();
  await user.click(screen.getByRole('button', { name: 'Review Subclass' }));
  await user.click(screen.getByRole('button', { name: 'Save Subclass' }));
  const subclass = contentRegistry.findSubclass(id);
  expect(subclass?.name).toBe('Runtime Vanguard');
  view.unmount();
  if (!subclass) throw new Error('Published Runtime Vanguard missing.');
  return subclass;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  initializeContentCatalog(window.localStorage);
});

describe('M16-E runtime acceptance through existing Character, Level Up, PLAY, and spellcasting paths', () => {
  it('publishes an actual Forge-authored Subclass into Character discovery, validation, derivation, and M15 Level Up confirmation', async () => {
    const user = userEvent.setup();
    const subclass = await forgeSimpleFighterSubclass(user, 'Runtime Duelist');

    const editor = renderAt('/characters/new');
    await user.selectOptions(screen.getByLabelText('Class'), FIGHTER_ID);
    await user.selectOptions(screen.getByLabelText('Level'), '3');
    const fighterSubclass = screen.getByLabelText('Subclass') as HTMLSelectElement;
    expect([...fighterSubclass.options].some((option) => option.value === subclass.id && option.text === 'Runtime Duelist')).toBe(true);

    await user.selectOptions(screen.getByLabelText('Class'), BARBARIAN_ID);
    await user.selectOptions(screen.getByLabelText('Level'), '3');
    const barbarianSubclass = screen.getByLabelText('Subclass') as HTMLSelectElement;
    expect([...barbarianSubclass.options].some((option) => option.value === subclass.id)).toBe(false);
    editor.unmount();

    const stored = createCharacter(fighterInput({
      name: 'Runtime Duelist Character',
      level: 3,
      subclassId: subclass.id,
    }));
    expect(getCharacterById(stored.id)?.classProgressions[0].subclassId).toBe(subclass.id);
    const state = derived(stored);
    expect(state.subclass?.id).toBe(subclass.id);
    expect(state.subclass?.acquiredFeatures[0]?.automatedEffects).toContainEqual(expect.objectContaining({ type: 'initiative-modifier' }));

    window.localStorage.clear();
    initializeContentCatalog(window.localStorage);
    expect(saveAndPublishHomebrewContent([subclass], window.localStorage).ok).toBe(true);
    const levelTwo = createCharacter(fighterInput({
      name: 'Runtime Level Up',
      level: 2,
      subclassId: undefined,
    }));
    let draft = withLevelUpTarget(createLevelUpDraft(levelTwo), { kind: 'existing-class', classId: FIGHTER_ID });
    draft = withFixedLevelUpHitPoints(draft);
    const core = getLevelUpCoreChoiceContext(levelTwo, draft, contentRegistry);
    expect(core).toMatchObject({
      ok: true,
      value: {
        classId: FIGHTER_ID,
        nextClassLevel: 3,
        subclassRequired: true,
      },
    });
    if (!core.ok) throw new Error(core.error.message);
    expect(core.value.subclasses.map((entry) => entry.id)).toContain(subclass.id);
    expect(core.value.subclasses.every((entry) => contentRegistry.findSubclass(entry.id)?.parentClassId === FIGHTER_ID)).toBe(true);

    draft = withLevelUpSubclass(draft, subclass.id);
    expect(getConfirmableLevelUpCandidate(levelTwo, draft, contentRegistry)).toMatchObject({ ok: true });
    expect(buildLevelUpReview(levelTwo, draft, contentRegistry)).toMatchObject({
      ok: true,
      value: { subclass: { id: subclass.id, name: 'Runtime Duelist' } },
    });
    expect(confirmLevelUp(draft)).toMatchObject({ ok: true });
    const advanced = getCharacterById(levelTwo.id)!;
    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v10');
    expect(advanced.startingClassId).toBe(FIGHTER_ID);
    expect(advanced.classProgressions[0]).toMatchObject({ classId: FIGHTER_ID, level: 3, subclassId: subclass.id });
  }, 30000);

  it('consumes a mechanics-heavy Forge Subclass through owner-aware multiclass, generic PLAY, active effects, ordinary provider rules, and a custom Spell grant', async () => {
    const user = userEvent.setup();
    const customSpell = createCustomSpell();
    const subclass = await forgeComplexFighterSubclass(user, customSpell.id);
    const feature = subclass.progression[0].features[0];
    const resource = feature.resources?.[0];
    const consumer = feature.resourceConsumers?.[0];
    const transaction = feature.resourceTransactions?.[0];
    const activeEffect = feature.activeSelfEffects?.[0];
    const providerDefinition = feature.spellcasting?.[0];
    if (!resource || !consumer || !transaction || !activeEffect || !providerDefinition) {
      throw new Error('Forge Subclass did not persist expected bounded mechanics.');
    }

    expect(maximumSelectableSpellLevel(providerDefinition, 5)).toBe(3);
    expect(providerDefinition.multiclassSlotContribution).toEqual({ kind: 'spellcasting', contribution: 'full' });
    expect(providerDefinition.slotPool?.progression.some((row) => row.level === 5 && row.slots.some((slot) => slot.spellLevel === 3))).toBe(true);
    expect(feature.spellGrants?.[0].spellIds).toEqual([customSpell.id]);

    const input: CharacterInput = fighterInput({
      name: 'Runtime Multiclass Vanguard',
      startingClassId: FIGHTER_ID,
      classProgressions: [
        progression(FIGHTER_ID, 5, true, subclass.id),
        progression(BARBARIAN_ID, 4, false, BERSERKER_ID),
      ],
      abilityScores: { strength: 14, dexterity: 14, constitution: 14, intelligence: 14, wisdom: 12, charisma: 12 },
      spellcastingSelections: [],
      inventory: [],
    });
    const character = createCharacter(input);
    const state = derived(character);
    const fighterState = state.classProgressions.find((entry) => entry.id === FIGHTER_ID);
    const provider = state.spellcasting.find((entry) => entry.id === providerDefinition.id);
    expect(state.level).toBe(9);
    expect(state.proficiencyBonus).toBe(4);
    expect(state.startingClassId).toBe(FIGHTER_ID);
    expect(fighterState?.subclass).toMatchObject({
      id: subclass.id,
      parentClassLevel: 5,
    });
    expect(state.resources.find((entry) => entry.id === resource.id)).toMatchObject({
      maximumUses: 2,
      owner: { kind: 'subclass', classId: FIGHTER_ID, subclassId: subclass.id, level: 5 },
    });
    expect(state.resourceTransactions.find((entry) => entry.id === transaction.id)?.owner).toMatchObject({
      kind: 'subclass',
      classId: FIGHTER_ID,
      subclassId: subclass.id,
      level: 5,
    });
    expect(state.activeSelfEffects.find((entry) => entry.id === activeEffect.id)?.owner).toMatchObject({
      kind: 'subclass',
      classId: FIGHTER_ID,
      subclassId: subclass.id,
      level: 5,
    });
    expect(provider).toMatchObject({
      owner: { kind: 'subclass', classId: FIGHTER_ID, subclassId: subclass.id, level: 5 },
      ability: 'intelligence',
      abilityModifier: 2,
      attackModifier: 6,
      saveDc: 14,
      slotPool: { id: MULTICLASS_ORDINARY_SLOT_POOL_ID },
    });
    expect(state.ordinaryMulticlassCasterLevel).toBe(5);
    expect(provider?.management.kind).toBe('prepared-from-list');
    if (provider?.management.kind === 'prepared-from-list') {
      expect(provider.management.catalogSpells.some((spell) => spell.id === customSpell.id)).toBe(true);
      expect(provider.management.preparedSpellCount).toBe(3);
    }
    expect(provider?.spells.some((spell) => spell.id === customSpell.id)).toBe(true);
    expect(provider?.spellGrants.find((grant) => grant.spell.id === customSpell.id)?.status).toBe('always-prepared');

    const persisted = getCharacterById(character.id)!;
    expect(Object.keys(persisted).sort()).not.toContain('ordinaryMulticlassCasterLevel');
    expect(Object.keys(persisted).sort()).not.toContain('spellcasting');
    expect(persisted.spellcastingSelections).toEqual([]);

    const play = renderAt('/characters/' + character.id);
    const quickStats = within(screen.getByRole('region', { name: 'Combat quick stats' }));
    expect(quickStats.getByLabelText('Forge Reserve resource status')).toHaveTextContent('2');

    const burstRow = screen.getByRole('article', { name: 'Forge Burst class feature' });
    await user.click(within(burstRow).getByRole('button', { name: 'Expend Forge Burst' }));
    expect(getCharacterById(character.id)?.playState.resourceUses[resource.id]).toBe(1);

    const renewalRow = screen.getByRole('article', { name: 'Forge Renewal class feature' });
    await user.click(within(renewalRow).getByRole('button', { name: 'Use Forge Renewal' }));
    expect(getCharacterById(character.id)?.playState.resourceUses[resource.id]).toBe(2);

    const stanceRow = screen.getByRole('article', { name: 'Forge Stance class feature' });
    await user.click(within(stanceRow).getByRole('button', { name: 'Activate Forge Stance' }));
    expect(getCharacterById(character.id)?.playState.resourceUses[resource.id]).toBe(1);
    expect(loadPlaySessionState(character.id).activeEffectIds).toContain(activeEffect.id);
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(deriveActiveSelfEffectD20Context(
      state,
      [activeEffect.id],
      { kind: 'ability-check', ability: 'strength' },
    )).toEqual({ advantageSources: ['Forge Stance'] });

    await user.click(screen.getByRole('link', { name: 'Character' }));
    expect(screen.getByRole('heading', { name: 'Forge Casting' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Forge Lance' })).toBeInTheDocument();
    expect(screen.getByText(/Always prepared:/)).toBeInTheDocument();

    const attack = rollSpellAttack(character, state, providerDefinition.id, customSpell.id, 'normal', { rng: () => 0.5 });
    expect(attack).toMatchObject({
      ok: true,
      value: {
        roll: {
          request: {
            expression: { modifier: 6 },
            source: { spellId: customSpell.id, spellcastingProviderId: providerDefinition.id },
          },
        },
      },
    });

    const spent = consumeCharacterResource(character.id, resource.id, consumer.consumer.id);
    expect(spent).toMatchObject({ ok: true, value: { playState: { resourceUses: { [resource.id]: 0 } } } });
    const restored = executeCharacterResourceTransaction(character.id, transaction.id, { kind: 'restore-resource' });
    expect(restored).toMatchObject({ ok: true, value: { playState: { resourceUses: { [resource.id]: 1 } } } });
    play.unmount();

    const activated = activateCharacterActiveSelfEffect(
      character.id,
      activeEffect.id,
      window.localStorage,
      window.sessionStorage,
      contentRegistry,
    );
    expect(activated).toMatchObject({ ok: false, error: { code: 'active-self-effect-already-active' } });
  }, 45000);
});
