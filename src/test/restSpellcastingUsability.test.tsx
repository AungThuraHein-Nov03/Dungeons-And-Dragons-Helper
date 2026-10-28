import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { PlaySpellcastingPanel } from '../components/PlaySpellcastingPanel';
import { srdId } from '../content/srd';
import { FIGHTER_ACTION_SURGE_RESOURCE_ID } from '../content/srd/fighter';
import type { SubclassContent, SpellcastingProviderDefinition } from '../models/content';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { deriveSpellcastingProviders, resolveLegalSpellSlotSources, spellBelongsToProviderList } from '../rules/spellcasting';
import { initializeContentCatalog, saveAndPublishHomebrewContent } from '../services/contentCatalog';
import { contentRegistry } from '../services/contentRegistry';
import { CHARACTER_STORAGE_KEY, createCharacter, getCharacterById } from '../services/characterStorage';
import { applyCharacterDamage, expendCharacterResource, setCharacterTemporaryHp } from '../services/characterPlayState';
import { loadPlaySessionState } from '../services/playSessionState';
import { loadRollHistory } from '../services/rollHistory';
import { completeCharacterV10Choices, fighterCharacter, fighterInput } from './fixtures';

const FIGHTER_ID = srdId('class', 'fighter');
const ROGUE_ID = srdId('class', 'rogue');
const WIZARD_ID = srdId('class', 'wizard');
const WIZARD_PROVIDER_ID = srdId('spellcasting-provider', 'wizard:spellcasting');
const ARCANE_GUARD_ID = 'homebrew:test:subclass:arcane-guard';
const ARCANE_PROVIDER_ID = 'homebrew:test:spellcasting-provider:arcane-guard';
const RUNE_PROVIDER_ID = 'homebrew:test:spellcasting-provider:rune-guard';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function panel(name: string) {
  const heading = screen.getByRole('heading', { name, level: 2 });
  const section = heading.closest('section');
  if (!section) throw new Error('Missing panel: ' + name);
  return within(section);
}

function wizardFixture() {
  const wizardSpells = contentRegistry.getAll('spell').filter((spell) => spellBelongsToProviderList(spell, 'wizard'));
  const cantrips = wizardSpells.filter((spell) => spell.level === 0).slice(0, 3);
  const levelOne = wizardSpells.filter((spell) => spell.level === 1);
  const concentration = levelOne.filter((spell) => spell.concentration);
  const ordinary = levelOne.filter((spell) => !spell.concentration);
  if (cantrips.length < 3 || concentration.length < 2 || ordinary.length < 4) throw new Error('Wizard usability fixtures unavailable.');
  const owned = [concentration[0], concentration[1], ...ordinary.slice(0, 4)];
  const prepared = [concentration[0], concentration[1], ordinary[0], ordinary[1]];
  const character = createCharacter(fighterInput({
    name: 'Usability Wizard',
    classId: WIZARD_ID,
    subclassId: undefined,
    level: 1,
    skillProficiencies: ['history', 'insight'],
    abilityScores: { intelligence: 16 },
    spellcastingSelections: [{
      providerId: WIZARD_PROVIDER_ID,
      cantripIds: cantrips.map((spell) => spell.id),
      ownedSpellIds: owned.map((spell) => spell.id),
      preparedSpellIds: prepared.map((spell) => spell.id),
    }],
  }));
  return { character, cantrips, owned, prepared };
}

function installArcaneGuardFixture() {
  const wizardSpells = contentRegistry.getAll('spell').filter((spell) => spellBelongsToProviderList(spell, 'wizard'));
  const cantrips = wizardSpells.filter((spell) => spell.level === 0);
  const levelOne = wizardSpells.filter((spell) => spell.level === 1);
  const concentration = levelOne.find((spell) => spell.concentration);
  const damage = levelOne.find((spell) => spell.mechanics.some((mechanic) => mechanic.type === 'damage') && spell.id !== concentration?.id)
    ?? levelOne.find((spell) => spell.mechanics.some((mechanic) => mechanic.type === 'damage'));
  const filler = levelOne.find((spell) => spell.id !== concentration?.id && spell.id !== damage?.id);
  const unselected = levelOne.find((spell) => spell.id !== concentration?.id && spell.id !== damage?.id && spell.id !== filler?.id);
  if (cantrips.length < 3 || !concentration || !damage || !filler || !unselected) throw new Error('Arcane Guard spell fixtures unavailable.');

  const provider: SpellcastingProviderDefinition = {
    id: ARCANE_PROVIDER_ID,
    name: 'Arcane Guard Spellcasting',
    spellcastingAbility: { kind: 'fixed', ability: 'intelligence' },
    multiclassSlotContribution: { kind: 'spellcasting', contribution: 'third', rounding: 'down' },
    spellManagement: {
      kind: 'prepared-from-owned',
      spellListId: 'wizard',
      cantripCount: [{ level: 1, count: 2 }],
      preparedSpellCount: [{ level: 1, count: 2 }],
      replacement: 'class-level-one',
      initialOwnedSpellCount: 3,
      initialOwnedSpellLevel: 1,
    },
    slotPool: {
      id: 'homebrew:test:spell-slot-pool:arcane-guard',
      name: 'Arcane Guard Slots',
      slotLevels: [{ spellLevel: 1, resourceId: 'homebrew:test:spell-slot:arcane-guard:1', name: 'Arcane Guard Level 1 Slots' }],
      progression: [
        { level: 3, slots: [{ spellLevel: 1, maximum: 2 }] },
        { level: 4, slots: [{ spellLevel: 1, maximum: 3 }] },
      ],
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
    ritualCasting: 'none',
  };

  const runeProvider: SpellcastingProviderDefinition = {
    id: RUNE_PROVIDER_ID,
    name: 'Rune Guard Casting',
    spellcastingAbility: { kind: 'fixed', ability: 'intelligence' },
    multiclassSlotContribution: { kind: 'independent' },
    spellManagement: { kind: 'granted-only', spellIds: [cantrips[2].id] },
    ritualCasting: 'none',
  };

  const subclass: SubclassContent = {
    id: ARCANE_GUARD_ID,
    kind: 'subclass',
    name: 'Arcane Guard',
    source: { type: 'homebrew', namespace: 'test' },
    parentClassId: FIGHTER_ID,
    acquisitionLevel: 3,
    description: 'Generic Fighter spellcasting usability fixture.',
    progression: [{
      level: 3,
      features: [{
        id: 'homebrew:test:subclass-feature:arcane-guard-spellcasting',
        name: 'Arcane Guard Spellcasting',
        description: 'Bounded test spellcasting feature.',
        effects: [],
        spellcasting: [provider, runeProvider],
        referenceEffects: [],
      }],
    }],
  };
  const saved = saveAndPublishHomebrewContent([subclass], window.localStorage);
  if (!saved.ok) throw new Error(saved.error.message);

  const selection = {
    providerId: ARCANE_PROVIDER_ID,
    cantripIds: [cantrips[0].id, cantrips[1].id],
    ownedSpellIds: [concentration.id, damage.id, filler.id],
    preparedSpellIds: [concentration.id, damage.id],
  };
  const fighter = fighterInput({ level: 4, subclassId: ARCANE_GUARD_ID, spellcastingSelections: [selection] });
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
    spellcastingSelections: [selection],
  }, contentRegistry);
  const character = createCharacter(input);
  return { character, concentration, damage, filler, unselected, runeCantrip: cantrips[2] };
}

function syntheticMultiLevelSpellState() {
  const original = fighterCharacter({ level: 5, name: 'Synthetic Play Caster' });
  const base = deriveCharacterState(original, contentRegistry);
  if (!base.ok) throw new Error(base.error.message);
  const burningHands = contentRegistry.findSpell(srdId('spell', 'burning-hands'));
  const cureWounds = contentRegistry.findSpell(srdId('spell', 'cure-wounds'));
  if (!burningHands || !cureWounds) throw new Error('Synthetic spell actions unavailable.');
  const definition: SpellcastingProviderDefinition = {
    id: 'homebrew:test:spellcasting-provider:play-usability',
    name: 'Play Usability Casting',
    spellcastingAbility: { kind: 'fixed', ability: 'wisdom' },
    multiclassSlotContribution: { kind: 'independent' },
    spellManagement: { kind: 'granted-only', spellIds: [burningHands.id, cureWounds.id] },
    slotPool: {
      id: 'homebrew:test:spell-slot-pool:play-usability',
      name: 'Play Usability Slots',
      slotLevels: [
        { spellLevel: 1, resourceId: 'homebrew:test:spell-slot:play-usability:1', name: 'Level 1 Spell Slots' },
        { spellLevel: 2, resourceId: 'homebrew:test:spell-slot:play-usability:2', name: 'Level 2 Spell Slots' },
      ],
      progression: [{ level: 1, slots: [{ spellLevel: 1, maximum: 3 }, { spellLevel: 2, maximum: 2 }] }],
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
    ritualCasting: 'none',
  };
  const casting = deriveSpellcastingProviders(
    [{ definition, source: { type: 'homebrew', namespace: 'test' }, grantedBy: { contentId: 'homebrew:test:feature:play-usability', contentName: 'Play Usability Gift' } }],
    base.value.level,
    base.value.abilityModifiers,
    base.value.proficiencyBonus,
    contentRegistry,
  );
  if (!casting.ok) throw new Error(casting.error.message);
  const character = {
    ...original,
    playState: {
      ...original.playState,
      resourceUses: {
        ...original.playState.resourceUses,
        'homebrew:test:spell-slot:play-usability:1': 3,
        'homebrew:test:spell-slot:play-usability:2': 2,
      },
    },
  };
  return {
    character,
    state: { ...base.value, spellcasting: casting.value.providers, resources: [...base.value.resources, ...casting.value.resources] },
    burningHands,
    cureWounds,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  initializeContentCatalog(window.localStorage);
});

afterEach(() => vi.restoreAllMocks());

describe('bounded Character/PLAY rest and spellcasting usability', () => {
  it('replaces Character-page global combat strips with authoritative Rest & Recovery while PLAY combat controls remain', async () => {
    const character = createCharacter(fighterInput({ name: 'Rest Usability Fighter', level: 4 }));
    expect(expendCharacterResource(character.id, FIGHTER_ACTION_SURGE_RESOURCE_ID).ok).toBe(true);
    expect(applyCharacterDamage(character.id, 10).ok).toBe(true);
    expect(setCharacterTemporaryHp(character.id, 4).ok).toBe(true);

    const user = userEvent.setup();
    const characterView = renderAt(`/characters/${character.id}/character`);
    const workspace = within(screen.getByTestId('character-workspace-character'));
    expect(workspace.queryByLabelText('d20 roll mode')).not.toBeInTheDocument();
    expect(workspace.queryByRole('group', { name: 'Cover' })).not.toBeInTheDocument();

    const rest = panel('Rest & Recovery');
    expect(rest.getByText('26 / 36')).toBeInTheDocument();
    expect(rest.getByRole('button', { name: 'Short Rest' })).toBeInTheDocument();
    expect(rest.getByRole('button', { name: 'Long Rest' })).toBeInTheDocument();

    await user.click(rest.getByRole('button', { name: 'Short Rest' }));
    await waitFor(() => expect(getCharacterById(character.id)?.playState.resourceUses[FIGHTER_ACTION_SURGE_RESOURCE_ID]).toBe(1));
    expect(panel('Rest & Recovery').getByText('26 / 36')).toBeInTheDocument();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(panel('Rest & Recovery').getByRole('button', { name: 'Long Rest' }));
    await waitFor(() => expect(getCharacterById(character.id)?.playState.currentHp).toBe(36));
    expect(getCharacterById(character.id)?.playState.temporaryHp).toBe(0);
    expect(panel('Rest & Recovery').getByText('36 / 36')).toBeInTheDocument();

    characterView.unmount();
    renderAt(`/characters/${character.id}`);
    expect(screen.getByRole('group', { name: 'Initiative roll mode' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Cover' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Character roll mode' })).toBeInTheDocument();
  });

  it('keeps Character spells compact, collapsed by default, expandable, and transient', async () => {
    const { character, prepared } = wizardFixture();
    const storedBefore = window.localStorage.getItem(CHARACTER_STORAGE_KEY);
    const user = userEvent.setup();
    renderAt(`/characters/${character.id}/character`);

    const spellcasting = panel('Spellcasting');
    const spell = prepared[0];
    const summaryText = spellcasting.getByText(spell.name);
    const details = summaryText.closest('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
    expect(within(details!).getByText(spell.description)).not.toBeVisible();

    await user.click(summaryText);
    expect(details).toHaveAttribute('open');
    expect(within(details!).getByText(spell.description)).toBeVisible();
    expect(within(details!).getByRole('button', { name: 'Cast Spell' })).toBeVisible();

    await user.click(summaryText);
    expect(details).not.toHaveAttribute('open');
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(storedBefore);
    expect(getCharacterById(character.id)?.spellcastingSelections).toEqual(character.spellcastingSelections);
  });

  it('shows compact PLAY Spellcasting only for real provider spells and casts through the existing slot mutation path on Fighter 4 / Rogue 1', async () => {
    const { character, concentration, damage, filler, unselected, runeCantrip } = installArcaneGuardFixture();
    const derived = deriveCharacterState(character, contentRegistry);
    if (!derived.ok) throw new Error(derived.error.message);
    const arcane = derived.value.spellcasting.find((provider) => provider.id === ARCANE_PROVIDER_ID);
    if (!arcane) throw new Error('Arcane Guard provider missing.');
    expect(arcane.owner).toMatchObject({ kind: 'subclass', classId: FIGHTER_ID, subclassId: ARCANE_GUARD_ID, level: 4 });
    expect(derived.value.classProgressions.map((progression) => [progression.id, progression.classLevel])).toEqual([
      [FIGHTER_ID, 4],
      [ROGUE_ID, 1],
    ]);

    const source = resolveLegalSpellSlotSources(derived.value, ARCANE_PROVIDER_ID, damage.id, 1);
    if (!source.ok || !source.value[0]) throw new Error('Expected legal Arcane Guard level-1 slot.');
    const slotResourceId = source.value[0].resourceId;
    const initialSlots = character.playState.resourceUses[slotResourceId];
    expect(initialSlots).toBeGreaterThan(0);

    const user = userEvent.setup();
    renderAt(`/characters/${character.id}`);
    const spellcasting = panel('Spellcasting');
    const select = spellcasting.getByLabelText('Spell') as HTMLSelectElement;
    const optionValues = [...select.options].map((option) => option.value);

    for (const spell of arcane.spells) expect(optionValues).toContain(`${ARCANE_PROVIDER_ID}::${spell.id}`);
    expect(optionValues).toContain(`${RUNE_PROVIDER_ID}::${runeCantrip.id}`);
    expect(optionValues).not.toContain(`${ARCANE_PROVIDER_ID}::${filler.id}`);
    expect(optionValues).not.toContain(`${ARCANE_PROVIDER_ID}::${unselected.id}`);

    await user.selectOptions(select, `${RUNE_PROVIDER_ID}::${runeCantrip.id}`);
    expect(spellcasting.getByText('Rune Guard Casting')).toBeInTheDocument();
    expect(spellcasting.getByText(runeCantrip.name, { selector: 'strong' })).toBeInTheDocument();

    await user.selectOptions(select, `${ARCANE_PROVIDER_ID}::${damage.id}`);
    expect(spellcasting.getByText('Arcane Guard Spellcasting')).toBeInTheDocument();
    expect(spellcasting.getByText((content, element) => element?.tagName === 'SMALL' && content.startsWith(`${damage.castingTime} · ${damage.range} ·`))).toBeInTheDocument();
    expect(spellcasting.queryByLabelText('Cast Level')).not.toBeInTheDocument();

    await user.click(spellcasting.getByRole('button', { name: 'Cast Spell' }));
    await waitFor(() => expect(getCharacterById(character.id)?.playState.resourceUses[slotResourceId]).toBe((initialSlots ?? 0) - 1));

    if (damage.mechanics.some((mechanic) => mechanic.type === 'damage')) {
      await user.click(spellcasting.getByRole('button', { name: 'Damage' }));
      expect(loadRollHistory()[0]?.result.request.label).toContain(damage.name);
    }

    await user.selectOptions(select, `${ARCANE_PROVIDER_ID}::${concentration.id}`);
    await user.click(spellcasting.getByRole('button', { name: 'Cast Spell' }));
    const concentrationPanel = panel('Concentration');
    await user.selectOptions(concentrationPanel.getByLabelText('Concentration spell'), `${ARCANE_PROVIDER_ID}::${concentration.id}`);
    await user.click(concentrationPanel.getByRole('button', { name: 'Start Concentration' }));
    expect(loadPlaySessionState(character.id).concentration).toEqual({ providerId: ARCANE_PROVIDER_ID, spellId: concentration.id });
  });

  it('omits PLAY Spellcasting for a non-spellcaster and exposes authoritative multi-level cast choices plus existing damage/healing actions when supported', async () => {
    const nonCaster = createCharacter(fighterInput({ name: 'No Spells' }));
    const noSpells = renderAt(`/characters/${nonCaster.id}`);
    expect(screen.queryByRole('heading', { name: 'Spellcasting' })).not.toBeInTheDocument();
    noSpells.unmount();

    const user = userEvent.setup();
    const { character, state, burningHands, cureWounds } = syntheticMultiLevelSpellState();
    const onRoll = vi.fn();
    render(<PlaySpellcastingPanel character={character} state={state} rollMode="normal" conditions={[]} onRoll={onRoll} onMutation={vi.fn()} />);

    const spellcasting = panel('Spellcasting');
    const select = spellcasting.getByLabelText('Spell');
    await user.selectOptions(select, `homebrew:test:spellcasting-provider:play-usability::${burningHands.id}`);
    const level = spellcasting.getByLabelText('Cast Level') as HTMLSelectElement;
    expect([...level.options].map((option) => option.text)).toEqual(['Level 1', 'Level 2']);
    await user.click(spellcasting.getByRole('button', { name: 'Damage' }));
    expect(onRoll).toHaveBeenLastCalledWith(expect.objectContaining({ ok: true }));

    await user.selectOptions(select, `homebrew:test:spellcasting-provider:play-usability::${cureWounds.id}`);
    await user.click(spellcasting.getByRole('button', { name: 'Healing' }));
    expect(onRoll).toHaveBeenLastCalledWith(expect.objectContaining({ ok: true }));
  });
});
