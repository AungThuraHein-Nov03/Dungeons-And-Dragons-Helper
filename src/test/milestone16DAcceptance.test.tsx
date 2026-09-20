import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { CharacterReferenceView } from '../components/CharacterReferenceView';
import type { CharacterSpellcastingSelection } from '../models/character';
import type { SpellContent, SpellcastingProviderDefinition } from '../models/content';
import { listConcentrationCandidates } from '../rules/concentration';
import { deriveCharacterState } from '../rules/deriveCharacter';
import {
  deriveSpellRollAmount,
  deriveSpellcastingProviders,
  resolveLegalSpellSlotSources,
} from '../rules/spellcasting';
import type { DerivedCharacterState } from '../rules/types';
import { initializeContentCatalog } from '../services/contentCatalog';
import { contentRegistry } from '../services/contentRegistry';
import { loadHomebrewContent } from '../services/homebrewContentStorage';
import {
  rollSpellAttack,
  rollSpellDamage,
  rollSpellHealing,
} from '../services/spellRolls';
import { fighterCharacter } from './fixtures';

const PROVIDER_ID = 'homebrew:m16-d:spellcasting-provider:acceptance';
const SLOT_POOL_ID = 'homebrew:m16-d:spell-slot-pool:acceptance';
const SLOT_1 = 'homebrew:m16-d:spell-slot:acceptance:1';
const SLOT_2 = 'homebrew:m16-d:spell-slot:acceptance:2';
const SLOT_3 = 'homebrew:m16-d:spell-slot:acceptance:3';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function renderedForgeId(): string {
  const value = screen.getByText(/^homebrew:local:spell:/).textContent;
  if (!value) throw new Error('Expected rendered Spell Forge ID.');
  return value;
}

function providerDefinition(spellListId: string): SpellcastingProviderDefinition {
  return {
    id: PROVIDER_ID,
    name: 'M16-D Acceptance Casting',
    spellcastingAbility: { kind: 'fixed', ability: 'intelligence' },
    multiclassSlotContribution: { kind: 'independent' },
    spellManagement: {
      kind: 'prepared-from-list',
      spellListId,
      cantripCount: [{ level: 1, count: 4 }],
      preparedSpellCount: [{ level: 1, count: 4 }],
      replacement: 'long-rest-any',
    },
    slotPool: {
      id: SLOT_POOL_ID,
      name: 'Acceptance Slots',
      slotLevels: [
        { spellLevel: 1, resourceId: SLOT_1, name: 'Level 1 Acceptance Slots' },
        { spellLevel: 2, resourceId: SLOT_2, name: 'Level 2 Acceptance Slots' },
        { spellLevel: 3, resourceId: SLOT_3, name: 'Level 3 Acceptance Slots' },
      ],
      progression: [{
        level: 1,
        slots: [
          { spellLevel: 1, maximum: 3 },
          { spellLevel: 2, maximum: 2 },
          { spellLevel: 3, maximum: 1 },
        ],
      }],
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
    ritualCasting: 'prepared',
  };
}

function deriveProviderState(
  spellListId: string,
  selection: CharacterSpellcastingSelection,
  level = 11,
): { character: ReturnType<typeof fighterCharacter>; state: DerivedCharacterState } {
  const character = fighterCharacter({
    level,
    playState: {
      currentHp: 50,
      temporaryHp: 0,
      hitDiceRemaining: level,
      resourceUses: {
        [SLOT_1]: 3,
        [SLOT_2]: 2,
        [SLOT_3]: 1,
      },
    },
  });
  const base = deriveCharacterState(character, contentRegistry);
  if (!base.ok) throw new Error(base.error.message);

  const collection = deriveSpellcastingProviders(
    [{
      definition: providerDefinition(spellListId),
      source: { type: 'homebrew', namespace: 'm16-d' },
      grantedBy: { contentId: 'homebrew:m16-d:class-feature:acceptance', contentName: 'Acceptance Casting' },
    }],
    level,
    base.value.abilityModifiers,
    base.value.proficiencyBonus,
    contentRegistry,
    [],
    [selection],
  );
  if (!collection.ok) throw new Error(collection.error.message);

  return {
    character,
    state: {
      ...base.value,
      spellcasting: collection.value.providers,
      resources: [...base.value.resources, ...collection.value.resources],
    },
  };
}

function renderSpellReference(character: ReturnType<typeof fighterCharacter>, state: DerivedCharacterState) {
  return render(
    <CharacterReferenceView
      character={character}
      state={state}
      rollMode="normal"
      onRollModeChange={vi.fn()}
      cover="none"
      onCoverChange={vi.fn()}
      conditions={[]}
      activeEffectIds={[]}
      onRoll={vi.fn()}
      onMutation={vi.fn()}
    />,
  );
}

function savedSpell(id: string): SpellContent {
  const spell = contentRegistry.findSpell(id);
  if (!spell) throw new Error('Expected saved Spell ' + id);
  return spell;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  initializeContentCatalog(window.localStorage);
});

describe('M16-D Forge-authored Spell runtime acceptance', () => {
  it('L/M creates an attack cantrip through Forge UI, discovers it in Compendium/provider UI, and uses existing attack/critical/cantrip-scaling rules', async () => {
    const user = userEvent.setup();
    const forgeRender = renderAt('/creator-forge/spells/new');

    const spellId = renderedForgeId();
    await user.type(screen.getByLabelText('Spell name'), 'Forge Ray');
    await user.type(screen.getByLabelText('Spell description'), 'A force ray created through Spell Forge.');
    await user.click(screen.getByLabelText('Spell list Wizard'));
    await user.click(screen.getByLabelText('Enable Spell Attack'));
    await user.click(screen.getByRole('button', { name: 'Add Damage Mechanic' }));
    await user.selectOptions(screen.getByLabelText('Damage type'), 'force');
    await user.selectOptions(screen.getByLabelText('Damage base dice die size 1'), '8');
    await user.selectOptions(screen.getByLabelText('Damage scaling type'), 'character-level-dice');
    await user.click(screen.getByRole('button', { name: 'Review Spell' }));

    expect(screen.getByText(/ranged spell attack using the owning provider/i)).toBeInTheDocument();
    expect(screen.getByText(/Level 1: 1d8.*Level 5: 2d8.*Level 11: 3d8.*Level 17: 4d8/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save Spell' }));

    expect(loadHomebrewContent(window.localStorage)).toEqual([
      expect.objectContaining({
        id: spellId,
        kind: 'spell',
        name: 'Forge Ray',
        source: { type: 'homebrew', namespace: 'local' },
      }),
    ]);
    forgeRender.unmount();

    const compendium = renderAt('/compendium/spells');
    const link = screen.getByRole('link', { name: /Forge Ray/ });
    expect(link).toHaveAttribute('href', '/compendium/spells/' + encodeURIComponent(spellId));
    await user.click(link);
    expect(screen.getByRole('heading', { name: 'Forge Ray' })).toBeInTheDocument();
    expect(screen.getByText(/Homebrew · local/i)).toBeInTheDocument();
    expect(screen.getByText(/Ranged spell attack/i)).toBeInTheDocument();
    compendium.unmount();

    const { character, state } = deriveProviderState('wizard', {
      providerId: PROVIDER_ID,
      cantripIds: [spellId],
      ownedSpellIds: [],
      preparedSpellIds: [],
    });
    const provider = state.spellcasting[0];
    expect(provider.spells.map((spell) => spell.id)).toContain(spellId);
    expect(provider.management.kind === 'prepared-from-list' && provider.management.catalogSpells.map((spell) => spell.id)).toContain(spellId);

    const reference = renderSpellReference(character, state);
    expect(screen.getByRole('heading', { name: 'Forge Ray' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Spell Attack' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Damage' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Critical Damage' })).toBeInTheDocument();
    reference.unmount();

    const attack = rollSpellAttack(character, state, PROVIDER_ID, spellId, 'normal', { rng: () => 0 });
    expect(attack).toMatchObject({
      ok: true,
      value: {
        roll: {
          modifier: provider.attackModifier,
          request: { source: { spellId, spellcastingProviderId: PROVIDER_ID } },
        },
      },
    });

    const damage = rollSpellDamage(character, state, PROVIDER_ID, spellId, undefined, false, { rng: () => 0 });
    expect(damage).toMatchObject({
      ok: true,
      value: { roll: { dice: [{ die: 8, values: [1, 1, 1] }], total: 3 } },
    });

    const critical = rollSpellDamage(character, state, PROVIDER_ID, spellId, undefined, true, { rng: () => 0 });
    expect(critical).toMatchObject({
      ok: true,
      value: { roll: { dice: [{ die: 8, values: [1, 1, 1, 1, 1, 1] }], total: 6 } },
    });

    const spell = savedSpell(spellId);
    const mechanic = spell.mechanics.find((candidate) => candidate.type === 'damage');
    if (!mechanic || mechanic.type !== 'damage') throw new Error('Expected Forge Ray damage mechanic.');
    expect([1, 5, 11, 17].map((level) => {
      const amount = deriveSpellRollAmount(spell, mechanic, level, undefined, provider.abilityModifier);
      if (!amount.ok) throw new Error(amount.error.message);
      return amount.value.dice[0].count;
    })).toEqual([1, 2, 3, 4]);
  }, 30000);

  it('M creates a leveled save/damage concentration Ritual Spell through Forge and preserves slot legality/upcasting/manual-save boundaries without auto-spending slots', async () => {
    const user = userEvent.setup();
    const forgeRender = renderAt('/creator-forge/spells/new');

    const spellId = renderedForgeId();
    await user.type(screen.getByLabelText('Spell name'), 'Forge Storm');
    await user.type(screen.getByLabelText('Spell description'), 'A leveled saving-throw Spell created through Spell Forge.');
    await user.selectOptions(screen.getByLabelText('Spell level'), '2');
    await user.click(screen.getByLabelText('Spell list Wizard'));
    await user.click(screen.getByLabelText('Concentration Spell'));
    await user.click(screen.getByLabelText('Ritual Spell'));
    await user.type(screen.getByLabelText('Target or area'), 'Creatures in a small burst');
    await user.click(screen.getByLabelText('Enable Saving Throw'));
    await user.selectOptions(screen.getByLabelText('Saving throw ability'), 'dexterity');
    await user.selectOptions(screen.getByLabelText('Saving throw success behavior'), 'half');
    await user.click(screen.getByRole('button', { name: 'Add Damage Mechanic' }));

    const count = screen.getByLabelText('Damage base dice die count 1');
    await user.clear(count);
    await user.type(count, '2');
    await user.selectOptions(screen.getByLabelText('Damage base dice die size 1'), '8');
    await user.selectOptions(screen.getByLabelText('Damage type'), 'lightning');
    await user.selectOptions(screen.getByLabelText('Damage scaling type'), 'slot-level-dice');
    await user.selectOptions(screen.getByLabelText('Damage dice per slot level die size 1'), '8');

    await user.click(screen.getByRole('button', { name: 'Review Spell' }));
    expect(screen.getByText(/Dexterity save.*Target save resolution remains manual/i)).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === 'P' && Boolean(element.textContent?.includes('Target / Area:')) && Boolean(element.textContent?.includes('descriptive metadata only')))).toBeInTheDocument();
    expect(screen.getByText(/Each slot level above 2 adds 1d8/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save Spell' }));
    forgeRender.unmount();

    expect(initializeContentCatalog(window.localStorage).ok).toBe(true);
    expect(contentRegistry.findSpell(spellId)).toMatchObject({ concentration: true, ritual: true });

    const { character, state } = deriveProviderState('wizard', {
      providerId: PROVIDER_ID,
      cantripIds: [],
      ownedSpellIds: [],
      preparedSpellIds: [spellId],
    }, 5);
    const provider = state.spellcasting[0];
    expect(provider.spells.map((spell) => spell.id)).toContain(spellId);
    expect(provider.ritualSpells.map((spell) => spell.id)).toContain(spellId);
    expect(listConcentrationCandidates(state)).toEqual(expect.arrayContaining([
      expect.objectContaining({ providerId: PROVIDER_ID, spellId, spellName: 'Forge Storm' }),
    ]));

    const legalBase = resolveLegalSpellSlotSources(state, PROVIDER_ID, spellId, 2);
    expect(legalBase).toMatchObject({ ok: true, value: [expect.objectContaining({ resourceId: SLOT_2, spellLevel: 2 })] });
    const legalUpcast = resolveLegalSpellSlotSources(state, PROVIDER_ID, spellId, 3);
    expect(legalUpcast).toMatchObject({ ok: true, value: [expect.objectContaining({ resourceId: SLOT_3, spellLevel: 3 })] });
    expect(resolveLegalSpellSlotSources(state, PROVIDER_ID, spellId, 1)).toMatchObject({
      ok: false,
      error: { code: 'invalid-spell-slot' },
    });

    const playStateBefore = structuredClone(character.playState);
    const base = rollSpellDamage(character, state, PROVIDER_ID, spellId, 2, false, { rng: () => 0 });
    expect(base).toMatchObject({
      ok: true,
      value: {
        roll: {
          dice: [{ die: 8, values: [1, 1] }],
          total: 2,
          request: { source: { spellSlotResourceId: SLOT_2 } },
        },
      },
    });
    const upcast = rollSpellDamage(character, state, PROVIDER_ID, spellId, 3, false, { rng: () => 0 });
    expect(upcast).toMatchObject({
      ok: true,
      value: {
        roll: {
          dice: [{ die: 8, values: [1, 1, 1] }],
          total: 3,
          request: { source: { spellSlotResourceId: SLOT_3 } },
        },
      },
    });
    expect(rollSpellDamage(character, state, PROVIDER_ID, spellId, 1, false, { rng: () => 0 })).toMatchObject({
      ok: false,
      error: { code: 'invalid-spell-slot' },
    });
    expect(character.playState).toEqual(playStateBefore);
    expect(character.playState.resourceUses[SLOT_2]).toBe(2);
    expect(character.playState.resourceUses[SLOT_3]).toBe(1);

    const reference = renderSpellReference(character, state);
    expect(screen.getByRole('heading', { name: 'Forge Storm' })).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === 'P' && Boolean(element.textContent?.includes('Saving Throw:')) && Boolean(element.textContent?.includes('Dexterity')) && Boolean(element.textContent?.includes('Target save resolution is manual')))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Damage' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Spell Attack' })).not.toBeInTheDocument();
    reference.unmount();
  });

  it('M creates a bounded healing Spell through Forge and existing healing/slot-scaling rules consume it', async () => {
    const user = userEvent.setup();
    const forgeRender = renderAt('/creator-forge/spells/new');

    const spellId = renderedForgeId();
    await user.type(screen.getByLabelText('Spell name'), 'Forge Mend');
    await user.type(screen.getByLabelText('Spell description'), 'A healing Spell created through Spell Forge.');
    await user.selectOptions(screen.getByLabelText('Spell level'), '1');
    await user.click(screen.getByLabelText('Spell list Cleric'));
    await user.click(screen.getByRole('button', { name: 'Add Healing Mechanic' }));
    await user.selectOptions(screen.getByLabelText('Healing modifier'), 'spellcasting-ability');
    await user.selectOptions(screen.getByLabelText('Healing scaling type'), 'slot-level-dice');
    await user.selectOptions(screen.getByLabelText('Healing dice per slot level die size 1'), '8');

    await user.click(screen.getByRole('button', { name: 'Review Spell' }));
    expect(screen.getByText((_, element) => element?.tagName === 'P' && Boolean(element.textContent?.includes('Healing:')) && Boolean(element.textContent?.includes('Spellcasting Ability modifier')))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save Spell' }));
    forgeRender.unmount();

    const { character, state } = deriveProviderState('cleric', {
      providerId: PROVIDER_ID,
      cantripIds: [],
      ownedSpellIds: [],
      preparedSpellIds: [spellId],
    }, 5);
    const provider = state.spellcasting[0];

    const base = rollSpellHealing(character, state, PROVIDER_ID, spellId, 1, { rng: () => 0 });
    expect(base).toMatchObject({
      ok: true,
      value: {
        roll: {
          dice: [{ die: 8, values: [1] }],
          modifier: provider.abilityModifier,
          total: 1 + provider.abilityModifier,
          request: { source: { spellSlotResourceId: SLOT_1 } },
        },
      },
    });
    const upcast = rollSpellHealing(character, state, PROVIDER_ID, spellId, 2, { rng: () => 0 });
    expect(upcast).toMatchObject({
      ok: true,
      value: {
        roll: {
          dice: [{ die: 8, values: [1, 1] }],
          modifier: provider.abilityModifier,
          total: 2 + provider.abilityModifier,
          request: { source: { spellSlotResourceId: SLOT_2 } },
        },
      },
    });
    expect(character.playState.resourceUses[SLOT_1]).toBe(3);
    expect(character.playState.resourceUses[SLOT_2]).toBe(2);

    const reference = renderSpellReference(character, state);
    expect(screen.getByRole('heading', { name: 'Forge Mend' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Healing' })).toBeInTheDocument();
    reference.unmount();
  });
});
