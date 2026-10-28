import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { CharacterCard } from '../components/CharacterCard';
import { CharacterPlayView } from '../components/CharacterPlayView';
import { CharacterReferenceView } from '../components/CharacterReferenceView';
import { srdId } from '../content/srd';
import type { Character } from '../models/character';
import type { SpellcastingProviderDefinition } from '../models/content';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { deriveSpellcastingProviders } from '../rules/spellcasting';
import type { DerivedCharacterState } from '../rules/types';
import { initializeContentCatalog } from '../services/contentCatalog';
import { contentRegistry } from '../services/contentRegistry';
import { EMPTY_PLAY_SESSION_STATE } from '../services/playSessionState';
import { CHAMPION_ID, completeCharacterV10Choices, fighterCharacter, fighterInput } from './fixtures';

const FIGHTER_ID = srdId('class', 'fighter');
const ROGUE_ID = srdId('class', 'rogue');
const SLOT_1_ID = 'homebrew:test:spell-slot:presentation:1';
const SLOT_2_ID = 'homebrew:test:spell-slot:presentation:2';
const ZERO_SLOT_ID = 'homebrew:test:spell-slot:presentation:3';

function genericMulticlassCharacter(): Character {
  const fighter = fighterInput({
    name: 'Generic Multiclass',
    level: 4,
    subclassId: CHAMPION_ID,
  });
  const input = completeCharacterV10Choices({
    ...fighter,
    startingClassId: FIGHTER_ID,
    classProgressions: [
      fighter.classProgressions[0],
      {
        classId: ROGUE_ID,
        level: 1,
        skillProficiencies: ['stealth'],
        skillExpertise: [],
        weaponMasterySelections: [],
        hpProgression: [{ classLevel: 1, method: 'fixed' }],
      },
    ],
  }, contentRegistry);

  return {
    ...input,
    id: 'generic-multiclass-presentation',
    playState: {
      currentHp: 1,
      temporaryHp: 0,
      hitDiceRemaining: { 10: 4, 8: 1 },
      resourceUses: {},
    },
    createdAt: '2026-09-22T00:00:00.000Z',
    updatedAt: '2026-09-22T00:00:00.000Z',
  };
}

function derive(character: Character): DerivedCharacterState {
  const result = deriveCharacterState(character, contentRegistry);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function renderReference(character: Character, state: DerivedCharacterState) {
  return render(
    <MemoryRouter>
      <CharacterReferenceView
        character={character}
        state={state}
        rollMode="normal"
        cover="none"
        conditions={[]}
        activeEffectIds={[]}
        onRoll={() => undefined}
        onMutation={() => undefined}
      />
    </MemoryRouter>,
  );
}

function renderPlay(character: Character, state: DerivedCharacterState) {
  return render(
    <CharacterPlayView
      character={character}
      state={state}
      cover="none"
      onCoverChange={() => undefined}
      sessionState={EMPTY_PLAY_SESSION_STATE}
      onAddCondition={() => undefined}
      onRemoveCondition={() => undefined}
      onDeactivateEffect={() => undefined}
      onStartConcentration={() => undefined}
      onEndConcentration={() => undefined}
      onConcentrationSave={() => undefined}
      rollMode="normal"
      onRollModeChange={() => undefined}
      featuresPanel={<div>Feature controls</div>}
      diceUtility={<div>Dice utility</div>}
      onMutation={() => undefined}
      onRoll={() => undefined}
      onLongRest={() => undefined}
    />,
  );
}

function withDerivedSpellSlots(character: Character, state: DerivedCharacterState) {
  const definition: SpellcastingProviderDefinition = {
    id: 'homebrew:test:spellcasting-provider:presentation',
    name: 'Generic Multiclass Casting',
    spellcastingAbility: { kind: 'fixed', ability: 'intelligence' },
    multiclassSlotContribution: { kind: 'independent' },
    spellManagement: { kind: 'granted-only', spellIds: [] },
    slotPool: {
      id: 'homebrew:test:spell-slot-pool:presentation',
      name: 'Presentation Spell Slots',
      slotLevels: [
        { spellLevel: 1, resourceId: SLOT_1_ID, name: 'Level 1 Presentation Slots' },
        { spellLevel: 2, resourceId: SLOT_2_ID, name: 'Level 2 Presentation Slots' },
      ],
      progression: [{
        level: 5,
        slots: [
          { spellLevel: 1, maximum: 3 },
          { spellLevel: 2, maximum: 2 },
        ],
      }],
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
    ritualCasting: 'none',
  };
  const casting = deriveSpellcastingProviders(
    [{
      definition,
      source: { type: 'homebrew', namespace: 'test' },
      grantedBy: { contentId: 'homebrew:test:feature:presentation-casting', contentName: 'Presentation Casting' },
    }],
    state.level,
    state.abilityModifiers,
    state.proficiencyBonus,
    contentRegistry,
  );
  if (!casting.ok) throw new Error(casting.error.message);
  const provider = casting.value.providers[0];
  if (!provider?.slotPool) throw new Error('Expected derived slot pool.');

  const providerWithDefensiveZero = {
    ...provider,
    slotPool: {
      ...provider.slotPool,
      slots: [
        ...provider.slotPool.slots,
        { spellLevel: 3 as const, resourceId: ZERO_SLOT_ID, name: 'Zero Slot Level', maximumUses: 0 },
      ],
    },
  };

  return {
    character: {
      ...character,
      playState: {
        ...character.playState,
        resourceUses: {
          ...character.playState.resourceUses,
          [SLOT_1_ID]: 2,
          [SLOT_2_ID]: 1,
          [ZERO_SLOT_ID]: 0,
        },
      },
    },
    state: {
      ...state,
      spellcasting: [providerWithDefensiveZero],
      resources: [...state.resources, ...casting.value.resources],
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  initializeContentCatalog(window.localStorage);
});

describe('bounded multiclass presentation and PLAY spell-slot visibility', () => {
  it('keeps the single-class Character card presentation intact', () => {
    const character = fighterCharacter({ name: 'Single Class Card', level: 4 });
    render(<MemoryRouter><CharacterCard character={character} onDelete={() => undefined} /></MemoryRouter>);

    expect(screen.getByText('Fighter 4 · Level 4')).toBeInTheDocument();
  });

  it('renders every authoritative multiclass progression on the Character card in stored order', () => {
    const character = genericMulticlassCharacter();
    render(<MemoryRouter><CharacterCard character={character} onDelete={() => undefined} /></MemoryRouter>);

    expect(screen.getByText('Fighter 4 / Rogue 1 · Level 5')).toBeInTheDocument();
  });

  it('renders independent collapsed class/subclass disclosures and preserves owning-level acquired/future content when expanded', async () => {
    const user = userEvent.setup();
    const character = genericMulticlassCharacter();
    const state = derive(character);
    const fighterState = state.classProgressions.find((entry) => entry.id === FIGHTER_ID);
    const rogueState = state.classProgressions.find((entry) => entry.id === ROGUE_ID);
    if (!fighterState || !rogueState || !fighterState.subclass) throw new Error('Expected generic multiclass derived owners.');

    renderReference(character, state);

    const fighterDetails = screen.getByLabelText('Fighter level 4 class progression') as HTMLDetailsElement;
    const rogueDetails = screen.getByLabelText('Rogue level 1 class progression') as HTMLDetailsElement;
    expect(fighterDetails.open).toBe(false);
    expect(rogueDetails.open).toBe(false);
    expect(within(fighterDetails).getByRole('heading', { name: 'Fighter', level: 3 })).toBeInTheDocument();
    expect(within(fighterDetails).getByText('Level 4', { selector: 'small' })).toBeInTheDocument();
    expect(within(rogueDetails).getByRole('heading', { name: 'Rogue', level: 3 })).toBeInTheDocument();
    expect(within(rogueDetails).getByText('Level 1', { selector: 'small' })).toBeInTheDocument();

    await user.click(fighterDetails.querySelector('summary')!);
    expect(fighterDetails.open).toBe(true);
    expect(rogueDetails.open).toBe(false);
    expect(within(fighterDetails).getByText(/Level 4 · SRD 5\.2\.1 · d10 Hit Die/)).toBeInTheDocument();

    await user.click(rogueDetails.querySelector('summary')!);
    expect(fighterDetails.open).toBe(true);
    expect(rogueDetails.open).toBe(true);

    const rogueAcquired = rogueState.acquiredFeatures.find((feature) => !rogueState.futureFeatures.some((future) => future.name === feature.name));
    const rogueFuture = rogueState.futureFeatures.find((feature) => !rogueState.acquiredFeatures.some((acquired) => acquired.name === feature.name));
    if (!rogueAcquired || !rogueFuture) throw new Error('Expected acquired and future Rogue features.');
    expect(within(within(rogueDetails).getByRole('heading', { name: rogueAcquired.name }).closest('article')!).getByText(`Acquired · Level ${rogueAcquired.level}`)).toBeInTheDocument();
    expect(within(within(rogueDetails).getByRole('heading', { name: rogueFuture.name }).closest('article')!).getByText(`Future · Level ${rogueFuture.level}`)).toBeInTheDocument();

    const subclass = fighterState.subclass;
    const subclassDetails = screen.getByLabelText(`${subclass.name} subclass progression for Fighter level 4`) as HTMLDetailsElement;
    expect(subclassDetails.open).toBe(false);
    expect(within(subclassDetails).getByRole('heading', { name: subclass.name, level: 3 })).toBeInTheDocument();
    expect(within(subclassDetails).getByText('Fighter', { selector: 'small' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/subclass progression for Rogue level 1/)).not.toBeInTheDocument();

    await user.click(subclassDetails.querySelector('summary')!);
    expect(subclassDetails.open).toBe(true);
    expect(within(subclassDetails).getByText('Fighter · Level 4')).toBeInTheDocument();

    const subclassAcquired = subclass.acquiredFeatures.find((feature) => feature.level <= fighterState.classLevel);
    const subclassFuture = subclass.futureFeatures.find((feature) => feature.level > fighterState.classLevel);
    if (!subclassAcquired || !subclassFuture) throw new Error('Expected acquired and future subclass features.');
    expect(within(within(subclassDetails).getByRole('heading', { name: subclassAcquired.name }).closest('article')!).getByText(`Acquired · Level ${subclassAcquired.level}`)).toBeInTheDocument();
    expect(within(within(subclassDetails).getByRole('heading', { name: subclassFuture.name }).closest('article')!).getByText(`Future · Level ${subclassFuture.level}`)).toBeInTheDocument();
  });

  it('moves authoritative spell slots into the cockpit, renders all nonzero levels compactly, and removes the old left-column panel', () => {
    const baseCharacter = genericMulticlassCharacter();
    const baseState = derive(baseCharacter);
    const fixture = withDerivedSpellSlots(baseCharacter, baseState);

    renderPlay(fixture.character, fixture.state);

    const quickStats = within(screen.getByRole('region', { name: 'Combat quick stats' }));
    const slots = quickStats.getByLabelText('Spell Slots cockpit resource');
    expect(within(slots).getByLabelText('1st level spell slots')).toHaveTextContent('2 / 3');
    expect(within(slots).getByLabelText('2nd level spell slots')).toHaveTextContent('1 / 2');
    expect(within(slots).queryByLabelText('3rd level spell slots')).not.toBeInTheDocument();

    const leftColumn = within(screen.getByTestId('play-dashboard-left'));
    expect(leftColumn.queryByLabelText('Spell Slots cockpit resource')).not.toBeInTheDocument();
    expect(leftColumn.getByRole('heading', { name: 'Attack Rolls' })).toBeInTheDocument();
  });

  it('keeps a one-level slot pool compact while reading the same authoritative current/max values', () => {
    const baseCharacter = genericMulticlassCharacter();
    const baseState = derive(baseCharacter);
    const fixture = withDerivedSpellSlots(baseCharacter, baseState);
    const provider = fixture.state.spellcasting[0];
    if (!provider?.slotPool) throw new Error('Expected presentation slot pool.');

    const oneLevelState = {
      ...fixture.state,
      spellcasting: [{
        ...provider,
        slotPool: {
          ...provider.slotPool,
          slots: provider.slotPool.slots.filter((slot) => slot.spellLevel === 1),
        },
      }],
    };

    renderPlay(fixture.character, oneLevelState);

    const slots = within(screen.getByRole('region', { name: 'Combat quick stats' })).getByLabelText('Spell Slots cockpit resource');
    expect(within(slots).getByLabelText('1st level spell slots')).toHaveTextContent('2 / 3');
    expect(within(slots).queryByLabelText('2nd level spell slots')).not.toBeInTheDocument();
  });

  it('deduplicates a shared pool by authoritative pool id and labels multiple distinct pools clearly', () => {
    const baseCharacter = genericMulticlassCharacter();
    const baseState = derive(baseCharacter);
    const fixture = withDerivedSpellSlots(baseCharacter, baseState);
    const primary = fixture.state.spellcasting[0];
    if (!primary?.slotPool) throw new Error('Expected presentation slot pool.');

    const distinctResourceId = 'homebrew:test:spell-slot:distinct:1';
    const duplicateShared = {
      ...primary,
      id: 'homebrew:test:spellcasting-provider:presentation-shared-duplicate',
      name: 'Shared Pool Duplicate Provider',
    };
    const distinctProvider = {
      ...primary,
      id: 'homebrew:test:spellcasting-provider:presentation-distinct',
      name: 'Distinct Pool Provider',
      multiclassSlotContribution: { kind: 'independent' as const },
      slotPool: {
        id: 'homebrew:test:spell-slot-pool:distinct',
        name: 'Distinct Slot Pool',
        recovery: [{ trigger: 'long-rest' as const, mode: 'all' as const }],
        slots: [{
          spellLevel: 1 as const,
          resourceId: distinctResourceId,
          name: 'Distinct Level 1 Slots',
          maximumUses: 1,
        }],
      },
    };
    const character = {
      ...fixture.character,
      playState: {
        ...fixture.character.playState,
        resourceUses: {
          ...fixture.character.playState.resourceUses,
          [distinctResourceId]: 1,
        },
      },
    };
    const state = {
      ...fixture.state,
      spellcasting: [primary, duplicateShared, distinctProvider],
    };

    renderPlay(character, state);

    const slots = within(screen.getByRole('region', { name: 'Combat quick stats' })).getByLabelText('Spell Slots cockpit resource');
    expect(within(slots).getAllByLabelText('Presentation Spell Slots spell slot pool')).toHaveLength(1);
    expect(within(slots).getByText('Presentation Spell Slots')).toBeInTheDocument();
    expect(within(slots).getByText('Distinct Slot Pool')).toBeInTheDocument();
    expect(within(slots).getByLabelText('1st level spell slots in Presentation Spell Slots')).toHaveTextContent('2 / 3');
    expect(within(slots).getByLabelText('1st level spell slots in Distinct Slot Pool')).toHaveTextContent('1 / 1');
  });

  it('does not render a Spell Slots cockpit resource for a character without slot pools', () => {
    const character = fighterCharacter({ name: 'No Slot Character', level: 4, subclassId: undefined });
    const state = derive(character);

    renderPlay(character, state);

    const quickStats = within(screen.getByRole('region', { name: 'Combat quick stats' }));
    expect(quickStats.queryByLabelText('Spell Slots cockpit resource')).not.toBeInTheDocument();
  });
});
