import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CharacterReferenceView } from '../components/CharacterReferenceView';
import { srdId } from '../content/srd';
import type { SpellcastingProviderDefinition } from '../models/content';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { deriveSpellcastingProviders } from '../rules/spellcasting';
import { contentRegistry } from '../services/contentRegistry';
import { fighterCharacter } from './fixtures';

const PROVIDER_ID = 'homebrew:m13f-e:spellcasting-provider:ui';
const SLOT_PREFIX = 'homebrew:m13f-e:spell-slot';
const RAY_OF_FROST = srdId('spell', 'ray-of-frost');
const FIREBALL = srdId('spell', 'fireball');
const HEALING_WORD = srdId('spell', 'healing-word');
const ACID_SPLASH = srdId('spell', 'acid-splash');

async function spellCard(name: string, user: ReturnType<typeof userEvent.setup>) {
  const label = screen.getByText(name, { selector: 'strong' });
  const entry = label.closest('details');
  if (!entry) throw new Error(`Missing spell entry: ${name}`);
  if (!(entry as HTMLDetailsElement).open) await user.click(label);
  return within(entry);
}

function uiState() {
  const original = fighterCharacter({ level: 11, name: 'M13F UI Caster' });
  const base = deriveCharacterState(original, contentRegistry);
  if (!base.ok) throw new Error(base.error.message);

  const definition: SpellcastingProviderDefinition = {
    id: PROVIDER_ID,
    name: 'M13F Test Casting',
    spellcastingAbility: { kind: 'fixed', ability: 'wisdom' },
    multiclassSlotContribution: { kind: 'independent' },
    spellManagement: {
      kind: 'granted-only',
      spellIds: [RAY_OF_FROST, FIREBALL, HEALING_WORD, ACID_SPLASH],
    },
    slotPool: {
      id: 'homebrew:m13f-e:spell-slot-pool:ui',
      name: 'M13F Test Slots',
      slotLevels: [
        { spellLevel: 1, resourceId: `${SLOT_PREFIX}:1`, name: 'Level 1 Spell Slots' },
        { spellLevel: 2, resourceId: `${SLOT_PREFIX}:2`, name: 'Level 2 Spell Slots' },
        { spellLevel: 3, resourceId: `${SLOT_PREFIX}:3`, name: 'Level 3 Spell Slots' },
        { spellLevel: 4, resourceId: `${SLOT_PREFIX}:4`, name: 'Level 4 Spell Slots' },
        { spellLevel: 5, resourceId: `${SLOT_PREFIX}:5`, name: 'Level 5 Spell Slots' },
      ],
      progression: [{
        level: 1,
        slots: [
          { spellLevel: 1, maximum: 4 },
          { spellLevel: 2, maximum: 3 },
          { spellLevel: 3, maximum: 3 },
          { spellLevel: 4, maximum: 2 },
          { spellLevel: 5, maximum: 2 },
        ],
      }],
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
    ritualCasting: 'none',
  };

  const casting = deriveSpellcastingProviders([
    {
      definition,
      source: { type: 'homebrew', namespace: 'm13f-e' },
      grantedBy: { contentId: 'homebrew:m13f-e:feature:casting', contentName: 'M13F UI Acceptance' },
    },
  ], base.value.level, base.value.abilityModifiers, base.value.proficiencyBonus, contentRegistry);
  if (!casting.ok) throw new Error(casting.error.message);

  const character = {
    ...original,
    playState: {
      ...original.playState,
      resourceUses: {
        ...original.playState.resourceUses,
        [`${SLOT_PREFIX}:1`]: 4,
        [`${SLOT_PREFIX}:2`]: 3,
        [`${SLOT_PREFIX}:3`]: 3,
        [`${SLOT_PREFIX}:4`]: 2,
        [`${SLOT_PREFIX}:5`]: 2,
      },
    },
  };
  const state = {
    ...base.value,
    spellcasting: casting.value.providers,
    resources: [...base.value.resources, ...casting.value.resources],
  };
  return { character, state };
}

describe('Milestone 13F-E bounded spell UI acceptance', () => {
  it('renders promoted mechanics and precise reference-only riders through the existing generic spell UI', async () => {
    const user = userEvent.setup();
    const { character, state } = uiState();
    render(
      <CharacterReferenceView
        character={character}
        state={state}
        rollMode="normal"
        onRollModeChange={vi.fn()}
        cover="none"
        onCoverChange={vi.fn()}
        conditions={[]}
        onRoll={vi.fn()}
        onMutation={vi.fn()}
      />,
    );

    const spellcasting = screen.getByRole('heading', { name: 'Spellcasting' }).closest('section');
    expect(spellcasting).not.toBeNull();
    const view = within(spellcasting!);
    expect(view.getByText('Wisdom is the Spellcasting Ability.', { exact: false })).toBeInTheDocument();
    expect(view.getByText('13', { selector: 'dd' })).toBeInTheDocument();
    expect(view.getByText('+5', { selector: 'dd' })).toBeInTheDocument();

    const ray = await spellCard('Ray of Frost', user);
    expect(ray.getByRole('button', { name: 'Spell Attack' })).toBeInTheDocument();
    expect(ray.getByRole('button', { name: 'Damage' })).toBeInTheDocument();
    expect(ray.getByRole('button', { name: 'Critical Damage' })).toBeInTheDocument();
    expect(ray.getByText(/Speed Reduction:/)).toBeInTheDocument();
    expect(ray.getByText(/Reducing the hit target's Speed by 10 feet/)).toBeInTheDocument();

    const fireball = await spellCard('Fireball', user);
    expect(fireball.getByText(/Dexterity vs DC 13; half damage on success/)).toBeInTheDocument();
    expect(fireball.getByText(/Target save resolution is manual/)).toBeInTheDocument();
    expect(fireball.getByRole('button', { name: 'Damage' })).toBeInTheDocument();
    expect(fireball.getByText(/Area Targeting:/)).toBeInTheDocument();
    expect(fireball.getByText(/Flammable Objects:/)).toBeInTheDocument();

    const healing = await spellCard('Healing Word', user);
    expect(healing.getByRole('button', { name: 'Healing' })).toBeInTheDocument();
    expect(healing.getByText(/Target Application:/)).toBeInTheDocument();

    const acid = await spellCard('Acid Splash', user);
    expect(acid.getByText(/Dexterity vs DC 13; no damage on success/)).toBeInTheDocument();
    expect(acid.getByText(/Area Targeting:/)).toBeInTheDocument();
  });

  it('uses existing slot selection and roll callbacks without turning rolls into implicit cast transactions', async () => {
    const user = userEvent.setup();
    const { character, state } = uiState();
    const onRoll = vi.fn();
    const onMutation = vi.fn();

    render(
      <CharacterReferenceView
        character={character}
        state={state}
        rollMode="normal"
        onRollModeChange={vi.fn()}
        cover="none"
        onCoverChange={vi.fn()}
        conditions={[]}
        onRoll={onRoll}
        onMutation={onMutation}
      />,
    );

    const fireball = await spellCard('Fireball', user);
    await user.selectOptions(fireball.getByLabelText('Cast Level'), '5');
    await user.click(fireball.getByRole('button', { name: 'Damage' }));

    expect(onMutation).not.toHaveBeenCalled();
    expect(onRoll).toHaveBeenCalledTimes(1);
    const fireballResult = onRoll.mock.calls[0][0];
    expect(fireballResult).toMatchObject({
      ok: true,
      value: {
        roll: {
          request: {
            type: 'damage',
            label: 'Fireball — Damage · Level 5',
            source: {
              spellId: FIREBALL,
              spellcastingProviderId: PROVIDER_ID,
              spellSlotResourceId: `${SLOT_PREFIX}:5`,
            },
          },
          dice: [{ die: 6 }],
          modifier: 0,
          effects: [],
        },
      },
    });
    expect(fireballResult.value.roll.dice[0].values).toHaveLength(10);

    const healing = await spellCard('Healing Word', user);
    await user.selectOptions(healing.getByLabelText('Cast Level'), '3');
    await user.click(healing.getByRole('button', { name: 'Healing' }));

    expect(onMutation).not.toHaveBeenCalled();
    expect(onRoll).toHaveBeenCalledTimes(2);
    const healingResult = onRoll.mock.calls[1][0];
    expect(healingResult).toMatchObject({
      ok: true,
      value: {
        roll: {
          request: {
            type: 'healing',
            label: 'Healing Word — Healing · Level 3',
            source: {
              spellId: HEALING_WORD,
              spellcastingProviderId: PROVIDER_ID,
              spellSlotResourceId: `${SLOT_PREFIX}:3`,
            },
          },
          dice: [{ die: 4 }],
          modifier: 1,
          effects: [],
        },
      },
    });
    expect(healingResult.value.roll.dice[0].values).toHaveLength(6);

    expect(character.playState.resourceUses[`${SLOT_PREFIX}:5`]).toBe(2);
    expect(character.playState.resourceUses[`${SLOT_PREFIX}:3`]).toBe(3);
    expect(Object.keys(character.playState).sort()).toEqual(['currentHp', 'hitDiceRemaining', 'resourceUses', 'temporaryHp']);
  });
});
