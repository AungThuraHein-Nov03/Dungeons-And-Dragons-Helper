import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App';
import { ClassFeaturesPanel } from '../components/ClassFeaturesPanel';
import { SRD_CONTENT } from '../content/srd';
import { DRUID_SPELLCASTING_PROVIDER_ID } from '../content/srd/druid';
import { srdId } from '../content/srd/source';
import {
  DRUID_NATURAL_RECOVERY_TRANSACTION_ID,
} from '../content/srd/subclasses';
import {
  SRD_WIZARD,
  WIZARD_SPELLCASTING_PROVIDER_ID,
} from '../content/srd/wizard';
import type { Character, CharacterInput } from '../models/character';
import type { ClassContent, ClassFeatureContent, SpellcastingProviderDefinition } from '../models/content';
import { deriveCharacterState } from '../rules/deriveCharacter';
import {
  executeCharacterResourceTransaction,
  expendCharacterResource,
} from '../services/characterPlayState';
import { ContentRegistry, contentRegistry } from '../services/contentRegistry';
import { createCharacter, getCharacterById } from '../services/characterStorage';
import { fighterInput } from './fixtures';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function countAtLevel(values: readonly { readonly level: number; readonly count: number }[], level: number): number {
  return [...values].filter((row) => row.level <= level).sort((a, b) => b.level - a.level)[0]?.count ?? 0;
}

function wizardProviderDefinition(): SpellcastingProviderDefinition {
  const provider = SRD_WIZARD.progression.flatMap((row) => row.features).flatMap((feature) => feature.spellcasting ?? []).find((candidate) => candidate.id === WIZARD_SPELLCASTING_PROVIDER_ID);
  if (!provider) throw new Error('Wizard provider fixture unavailable.');
  return provider;
}

function wizardInput(level = 11): CharacterInput {
  const provider = wizardProviderDefinition();
  if (provider.spellManagement.kind !== 'prepared-from-owned') throw new Error('Expected Wizard owned-spell management.');
  const management = provider.spellManagement;
  const catalog = contentRegistry.getAll('spell').filter((spell) => spell.spellLists.some((list) => list.id === management.spellListId));
  const cantrips = catalog.filter((spell) => spell.level === 0).slice(0, countAtLevel(management.cantripCount, level));
  const owned = catalog.filter((spell) => spell.level === 1).slice(0, management.initialOwnedSpellCount);
  const prepared = owned.slice(0, Math.min(owned.length, countAtLevel(management.preparedSpellCount, level)));
  return fighterInput({
    name: 'M13C UI Wizard',
    classId: srdId('class', 'wizard'),
    subclassId: srdId('subclass', 'wizard:evoker'),
    level,
    skillProficiencies: ['history', 'insight'],
    abilityScores: { intelligence: 18, wisdom: 14 },
    spellcastingSelections: [{
      providerId: WIZARD_SPELLCASTING_PROVIDER_ID,
      cantripIds: cantrips.map((spell) => spell.id),
      ownedSpellIds: owned.map((spell) => spell.id),
      preparedSpellIds: prepared.map((spell) => spell.id),
    }],
  });
}

function druidInput(): CharacterInput {
  return fighterInput({
    name: 'M13C UI Druid',
    classId: srdId('class', 'druid'),
    subclassId: srdId('subclass', 'druid:circle-of-the-land'),
    level: 6,
    skillProficiencies: ['arcana', 'perception'],
    abilityScores: { wisdom: 18, intelligence: 12 },
    spellcastingSelections: [],
  });
}

function transactionCard(name: string) {
  return within(screen.getByRole('complementary', { name: 'Class features' })).getByRole('article', { name: name + ' class feature' });
}

describe('Milestone 13C PLAY resource transactions', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('renders and executes real Wizard Arcane Recovery generically with weighted budget enforcement', async () => {
    const user = userEvent.setup();
    const character = createCharacter(wizardInput());
    const slot2 = srdId('spell-slot', 'wizard:2');
    const slot5 = srdId('spell-slot', 'wizard:5');
    const slot6 = srdId('spell-slot', 'wizard:6');
    expect(expendCharacterResource(character.id, slot2).ok).toBe(true);
    expect(expendCharacterResource(character.id, slot5).ok).toBe(true);
    expect(expendCharacterResource(character.id, slot6).ok).toBe(true);

    renderAt('/characters/' + character.id);
    const card = within(transactionCard('Arcane Recovery'));
    expect(card.getByText(/Recovery budget: 6 slot levels · Maximum slot level 5/)).toBeInTheDocument();
    expect(card.getByText('Remaining budget: 6')).toBeInTheDocument();
    expect(card.getByLabelText('Arcane Recovery Level 5 Spell Slots recovery count')).toHaveAttribute('max', '1');
    expect(card.getByLabelText('Arcane Recovery Level 2 Spell Slots recovery count')).toHaveAttribute('max', '1');
    expect(card.queryByLabelText('Arcane Recovery Level 6 Spell Slots recovery count')).not.toBeInTheDocument();

    await user.clear(card.getByLabelText('Arcane Recovery Level 5 Spell Slots recovery count'));
    await user.type(card.getByLabelText('Arcane Recovery Level 5 Spell Slots recovery count'), '1');
    await user.clear(card.getByLabelText('Arcane Recovery Level 2 Spell Slots recovery count'));
    await user.type(card.getByLabelText('Arcane Recovery Level 2 Spell Slots recovery count'), '1');
    expect(card.getByText(/Selected weighted cost: 7/)).toBeInTheDocument();
    expect(card.getByRole('status')).toHaveTextContent('exceeds the recovery budget');
    expect(card.getByRole('button', { name: 'Use Arcane Recovery' })).toBeDisabled();

    await user.clear(card.getByLabelText('Arcane Recovery Level 2 Spell Slots recovery count'));
    await user.type(card.getByLabelText('Arcane Recovery Level 2 Spell Slots recovery count'), '0');
    expect(card.getByText(/Selected weighted cost: 5/)).toBeInTheDocument();
    expect(card.getByText('Remaining budget: 1')).toBeInTheDocument();
    await user.click(card.getByRole('button', { name: 'Use Arcane Recovery' }));

    const quickStats = within(screen.getByRole('region', { name: 'Combat quick stats' }));
    expect(quickStats.queryByLabelText('Level 5 Spell Slots resource status')).not.toBeInTheDocument();
    expect(quickStats.queryByLabelText('Level 6 Spell Slots resource status')).not.toBeInTheDocument();
    const arcaneRecoveryStatus = quickStats.getByLabelText('Arcane Recovery resource status');
    expect(within(arcaneRecoveryStatus).getByText('0')).toBeInTheDocument();

    const updatedTransaction = within(transactionCard('Arcane Recovery'));
    expect(updatedTransaction.getByText('0 / 1 use remaining')).toBeInTheDocument();
    expect(updatedTransaction.getByRole('button', { name: 'Use Arcane Recovery' })).toBeDisabled();
    expect(getCharacterById(character.id)?.playState.resourceUses[slot5]).toBe(2);
    expect(getCharacterById(character.id)?.playState.resourceUses[slot6]).toBe(0);
  });

  it('renders and executes real Druid Natural Recovery through the same weighted transaction UI', async () => {
    const user = userEvent.setup();
    const character = createCharacter(druidInput());
    const slot3 = srdId('spell-slot', 'druid:3');
    const wildShape = srdId('class-resource', 'druid:wild-shape');
    expect(expendCharacterResource(character.id, slot3).ok).toBe(true);
    expect(expendCharacterResource(character.id, wildShape).ok).toBe(true);
    expect(expendCharacterResource(character.id, wildShape).ok).toBe(true);

    renderAt('/characters/' + character.id);
    const card = within(transactionCard('Natural Recovery'));
    expect(card.getByText(/Recovery budget: 3 slot levels · Maximum slot level 5/)).toBeInTheDocument();
    expect(card.getByLabelText('Natural Recovery Level 3 Spell Slots recovery count')).toHaveAttribute('max', '1');
    await user.clear(card.getByLabelText('Natural Recovery Level 3 Spell Slots recovery count'));
    await user.type(card.getByLabelText('Natural Recovery Level 3 Spell Slots recovery count'), '1');
    await user.click(card.getByRole('button', { name: 'Use Natural Recovery' }));

    const quickStats = within(screen.getByRole('region', { name: 'Combat quick stats' }));
    expect(quickStats.queryByLabelText('Level 3 Spell Slots resource status')).not.toBeInTheDocument();
    const wildShapeStatus = quickStats.getByLabelText('Wild Shape resource status');
    expect(within(wildShapeStatus).getByText('2')).toBeInTheDocument();
    const naturalRecoveryStatus = quickStats.getByLabelText('Natural Recovery (Spell Slots) resource status');
    expect(within(naturalRecoveryStatus).getByText('0')).toBeInTheDocument();
    const updatedTransaction = within(transactionCard('Natural Recovery'));
    expect(updatedTransaction.getByText('0 / 1 use remaining')).toBeInTheDocument();
    expect(updatedTransaction.getByRole('button', { name: 'Use Natural Recovery' })).toBeDisabled();
    expect(getCharacterById(character.id)?.playState.resourceUses[slot3]).toBe(3);

    const derived = deriveCharacterState(getCharacterById(character.id)!, contentRegistry);
    expect(derived.ok && derived.value.resourceTransactions.some((transaction) => transaction.id === DRUID_NATURAL_RECOVERY_TRANSACTION_ID && transaction.kind === 'restore-spell-slots-with-budget' && transaction.providerId === DRUID_SPELLCASTING_PROVIDER_ID)).toBe(true);
  });

  it('communicates a clean no-op state when no eligible expended slots exist', () => {
    const character = createCharacter(wizardInput());
    renderAt('/characters/' + character.id);
    const card = within(transactionCard('Arcane Recovery'));
    expect(card.getByText('No eligible expended spell slots to recover.')).toBeInTheDocument();
    expect(card.getByRole('button', { name: 'Use Arcane Recovery' })).toBeDisabled();
  });
});

const HOME_SOURCE = { type: 'homebrew', namespace: 'm13c-ui' } as const;
const HOME_CLASS_ID = 'homebrew:m13c-ui:class:wayfinder';
const HOME_USE_ID = 'homebrew:m13c-ui:resource:echo-use';
const HOME_TARGET_ID = 'homebrew:m13c-ui:resource:echo-pool';
const HOME_TRANSACTION_ID = 'homebrew:m13c-ui:resource-transaction:restore-echo';

const HOME_FEATURE: ClassFeatureContent = {
  id: 'homebrew:m13c-ui:class-feature:echo-renewal',
  name: 'Echo Renewal',
  description: 'Restore a bounded amount of an existing resource.',
  effects: [],
  resources: [
    { id: HOME_USE_ID, name: 'Echo Renewal Use', source: HOME_SOURCE, maximum: { kind: 'level-table', values: [{ level: 1, uses: 1 }] }, recovery: [{ trigger: 'long-rest', mode: 'all' }] },
    { id: HOME_TARGET_ID, name: 'Echo Pool', source: HOME_SOURCE, maximum: { kind: 'level-table', values: [{ level: 1, uses: 5 }] }, recovery: [{ trigger: 'long-rest', mode: 'all' }] },
  ],
  resourceTransactions: [{
    id: HOME_TRANSACTION_ID,
    name: 'Renew Echoes',
    kind: 'restore-resource',
    targetResourceId: HOME_TARGET_ID,
    usageResourceId: HOME_USE_ID,
    restore: { kind: 'selected', maximum: 2 },
  }],
  referenceEffects: [],
};

const HOME_CLASS: ClassContent = {
  id: HOME_CLASS_ID,
  kind: 'class',
  name: 'Wayfinder',
  source: HOME_SOURCE,
  hitDie: 8,
  fixedHitPointsPerLevel: 5,
  primaryAbility: { mode: 'one-of', abilities: ['wisdom'] },
  multiclassProficiencies: { weaponProficiencies: [], armorTraining: [], toolProficiencies: [] },
  savingThrowProficiencies: ['wisdom', 'charisma'],
  weaponProficiencies: [],
  armorTraining: [],
  toolProficiencies: [],
  skillChoices: { choose: 2, from: ['insight', 'perception', 'survival'] },
  startingEquipment: [{ id: 'A', items: [], currency: { amount: 0, unit: 'gp' } }],
  progression: Array.from({ length: 20 }, (_, index) => ({
    level: index + 1,
    proficiencyBonus: index + 1 >= 17 ? 6 : index + 1 >= 13 ? 5 : index + 1 >= 9 ? 4 : index + 1 >= 5 ? 3 : 2,
    features: index === 0 ? [HOME_FEATURE] : [],
  })),
  resources: [],
};

function homeInput(): CharacterInput {
  return fighterInput({
    name: 'M13C UI Wayfinder',
    classId: HOME_CLASS_ID,
    subclassId: undefined,
    level: 4,
    skillProficiencies: ['insight', 'perception'],
    abilityScores: { wisdom: 18, charisma: 14 },
    spellcastingSelections: [],
  });
}

function HomebrewResourceHarness({ registry, initial }: { registry: ContentRegistry; initial: Character }) {
  const [character, setCharacter] = useState(initial);
  const result = deriveCharacterState(character, registry);
  if (!result.ok) return <p>{result.error.message}</p>;
  return (
    <ClassFeaturesPanel
      character={character}
      state={result.value}
      sessionState={{ conditions: [], activeEffectIds: [] }}
      onActivateEffect={() => undefined}
      onRollHealing={() => undefined}
      onUse={() => undefined}
      onTransaction={(transactionId, request) => {
        const executed = executeCharacterResourceTransaction(character.id, transactionId, request, window.localStorage, registry);
        if (executed.ok) setCharacter(executed.value);
      }}
    />
  );
}

describe('M13C generic Homebrew PLAY transaction UI', () => {
  beforeEach(() => window.localStorage.clear());

  it('discovers and executes an unrelated selected restore-resource transaction with no source/name special case', async () => {
    const user = userEvent.setup();
    const registry = new ContentRegistry(SRD_CONTENT, [HOME_CLASS]);
    const character = createCharacter(homeInput(), window.localStorage, registry);
    expect(expendCharacterResource(character.id, HOME_TARGET_ID, window.localStorage, registry).ok).toBe(true);
    expect(expendCharacterResource(character.id, HOME_TARGET_ID, window.localStorage, registry).ok).toBe(true);
    const current = getCharacterById(character.id, window.localStorage, registry)!;

    render(<HomebrewResourceHarness registry={registry} initial={current} />);
    const card = within(screen.getByRole('article', { name: 'Renew Echoes class feature' }));
    expect(card.getByText('Echo Pool: 3 / 5')).toBeInTheDocument();
    expect(card.getByText('1 / 1 use remaining')).toBeInTheDocument();
    expect(card.getByLabelText('Renew Echoes restoration amount')).toHaveAttribute('max', '2');

    await user.clear(card.getByLabelText('Renew Echoes restoration amount'));
    await user.type(card.getByLabelText('Renew Echoes restoration amount'), '2');
    await user.click(card.getByRole('button', { name: 'Use Renew Echoes' }));

    const updated = within(screen.getByRole('article', { name: 'Renew Echoes class feature' }));
    expect(updated.getByText('Echo Pool: 5 / 5')).toBeInTheDocument();
    expect(updated.getByText('0 / 1 use remaining')).toBeInTheDocument();
    expect(updated.getByText('Echo Pool is already full.')).toBeInTheDocument();
    expect(updated.getByRole('button', { name: 'Use Renew Echoes' })).toBeDisabled();
    expect(getCharacterById(character.id, window.localStorage, registry)?.playState.resourceUses[HOME_TARGET_ID]).toBe(5);
    expect(getCharacterById(character.id, window.localStorage, registry)?.playState.resourceUses[HOME_USE_ID]).toBe(0);
  });
});
