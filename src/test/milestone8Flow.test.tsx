import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { FIGHTER_ACTION_SURGE_RESOURCE_ID, FIGHTER_SECOND_WIND_RESOURCE_ID } from '../content/srd/fighter';
import { srdId } from '../content/srd';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { contentRegistry } from '../services/contentRegistry';
import { createCharacter, loadCharacters, updateCharacterPlayState } from '../services/characterStorage';
import { fighterInput } from './fixtures';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function quickStat(label: string) {
  const card = screen.getByText(label).closest('article');
  expect(card).not.toBeNull();
  return within(card!);
}

describe('Milestone 8 bounded end-to-end integration', () => {
  it('combines M7 origin, Background Origin Feat, manual structured Feats, combat derivation, persistence, Inventory, and play-state preservation', async () => {
    const chainMailId = srdId('armor', 'chain-mail');
    const crossbowId = srdId('weapon', 'light-crossbow');
    const character = createCharacter(fighterInput({
      name: 'M8 Integration',
      backgroundId: srdId('background', 'soldier'),
      backgroundAbilityChoice: { mode: 'two-one', plusTwo: 'dexterity', plusOne: 'constitution' },
      backgroundToolChoice: 'dice-set',
      backgroundEquipmentChoice: 'A',
      manualFeats: [
        { featId: srdId('feat', 'ability-score-improvement'), choices: { 'ability-increase': ['constitution', 'constitution'] } },
        { featId: srdId('feat', 'archery'), choices: {} },
        { featId: srdId('feat', 'defense'), choices: {} },
      ],
      inventory: [
        { id: 'm8-chain-mail', kind: 'registry', contentId: chainMailId, category: 'armor', quantity: 1, equipped: true, notes: 'Authoritative Inventory armor.' },
        { id: 'm8-crossbow', kind: 'registry', contentId: crossbowId, category: 'weapon', quantity: 1, equipped: true, notes: 'Authoritative Inventory weapon.' },
        { id: 'm8-token', kind: 'custom', name: 'Campaign Token', category: 'adventuring-gear', quantity: 1, notes: 'Persistence sentinel.' },
      ],
      currency: { gp: 9 },
    }));

    const live = updateCharacterPlayState(character.id, {
      currentHp: 23,
      temporaryHp: 4,
      hitDiceRemaining: 2,
      resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 1, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 0 },
    })!;

    const [reloaded] = loadCharacters();
    expect(reloaded.id).toBe(character.id);
    expect(reloaded.manualFeats).toHaveLength(3);
    expect(reloaded.inventory).toEqual(live.inventory);
    expect(reloaded.currency).toEqual({ cp: 0, sp: 0, ep: 0, gp: 9, pp: 0 });
    expect(reloaded.playState).toEqual(live.playState);
    expect(reloaded.playState).toMatchObject({ currentHp: 23, temporaryHp: 4, hitDiceRemaining: 2 });

    const derived = deriveCharacterState(reloaded, contentRegistry);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(reloaded.abilityScores.constitution).toBe(14);
    expect(derived.value.abilityScores.dexterity).toBe(20);
    expect(derived.value.abilityScores.constitution).toBe(17);
    expect(derived.value.health.maximumHp).toBe(40);
    expect(derived.value.defense.armorClass).toBe(17);
    expect(derived.value.attacks.find((attack) => attack.weaponId === crossbowId)?.attackModifier).toBe(9);
    expect(derived.value.feats.map((feat) => feat.name)).toEqual(['Savage Attacker', 'Ability Score Improvement', 'Archery', 'Defense']);
    expect(reloaded.manualFeats.some((selection) => selection.featId === srdId('feat', 'savage-attacker'))).toBe(false);

    const user = userEvent.setup();
    renderAt(`/characters/${reloaded.id}`);
    expect(quickStat('Armor Class').getByText('17')).toBeInTheDocument();
    const crossbow = screen.getByRole('heading', { name: 'Light Crossbow' }).closest('article');
    expect(crossbow).not.toBeNull();
    expect(within(crossbow!).getByText('+9 to hit')).toBeInTheDocument();
    const hpStatus = within(screen.getByLabelText('Hit Point status'));
    expect(hpStatus.getByText('23')).toBeInTheDocument();
    expect(hpStatus.getByText('40')).toBeInTheDocument();
    expect(hpStatus.getByText('4')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Character' }));
    const featSection = screen.getByRole('heading', { name: 'Features & Feats' }).closest('section');
    expect(featSection).not.toBeNull();
    const featView = within(featSection!);
    expect(featView.getByRole('heading', { name: 'Savage Attacker' })).toBeInTheDocument();
    expect(featView.getByRole('heading', { name: 'Ability Score Improvement' })).toBeInTheDocument();
    expect(featView.getByRole('heading', { name: 'Archery' })).toBeInTheDocument();
    expect(featView.getByRole('heading', { name: 'Defense' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Inventory' }));
    expect(screen.getByRole('heading', { name: 'Chain Mail' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Light Crossbow' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Campaign Token' })).toBeInTheDocument();
    expect(screen.getByLabelText('GP')).toHaveValue(9);
  });
});
