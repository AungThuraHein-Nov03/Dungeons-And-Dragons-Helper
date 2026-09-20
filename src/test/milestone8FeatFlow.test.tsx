import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { srdId } from '../content/srd';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { contentRegistry } from '../services/contentRegistry';
import { createCharacter, loadCharacters } from '../services/characterStorage';
import { fighterInput } from './fixtures';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function featCard(name: string) {
  const section = screen.getByRole('heading', { name: 'Features & Feats' }).closest('section');
  expect(section).not.toBeNull();
  const heading = within(section!).getByRole('heading', { name });
  const card = heading.closest('article');
  expect(card).not.toBeNull();
  return within(card!);
}

describe('Milestone 8 Feat ownership UI', () => {
  it('manages separate manual Feats in Edit Character and presents resolved automated/reference data on CHARACTER', async () => {
    const user = userEvent.setup();
    const character = createCharacter(fighterInput({ name: 'M8 Feat Editor' }));
    renderAt(`/characters/${character.id}/edit`);

    expect(screen.getByText(/Origin Feat:/)).toHaveTextContent('Magic Initiate');
    expect(screen.getByText(/not stored in manual Feats/)).toBeInTheDocument();
    const manualSection = screen.getByRole('heading', { name: 'Manual Feat Ownership' }).closest('section');
    expect(manualSection).not.toBeNull();
    expect(within(manualSection!).queryByText('Magic Initiate')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Feat to add'), srdId('feat', 'ability-score-improvement'));
    await user.click(screen.getByRole('button', { name: 'Add Feat' }));
    await user.selectOptions(screen.getByLabelText('Ability Score Increase 1'), 'constitution');
    await user.selectOptions(screen.getByLabelText('Ability Score Increase 2'), 'constitution');

    await user.selectOptions(screen.getByLabelText('Feat to add'), srdId('feat', 'archery'));
    await user.click(screen.getByRole('button', { name: 'Add Feat' }));
    expect(within(manualSection!).getByText(/Fighting Style Feature \(not automatically evaluated\)/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    const [saved] = loadCharacters();
    expect(saved.manualFeats).toEqual([
      { featId: srdId('feat', 'ability-score-improvement'), choices: { 'ability-increase': ['constitution', 'constitution'] } },
      { featId: srdId('feat', 'archery'), choices: {} },
    ]);
    expect(saved.manualFeats.some((selection) => selection.featId === srdId('feat', 'magic-initiate'))).toBe(false);

    const derived = deriveCharacterState(saved, contentRegistry);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.value.abilityScores.constitution).toBe(16);

    await user.click(await screen.findByRole('link', { name: 'Character' }));
    const origin = featCard('Magic Initiate (Cleric)');
    expect(origin.getByText('Background · Acolyte')).toBeInTheDocument();
    expect(origin.getByText(/Magic Initiate Spellcasting/)).toBeInTheDocument();

    const asi = featCard('Ability Score Improvement');
    expect(asi.getByText('Manual')).toBeInTheDocument();
    expect(asi.getByText(/ability-increase: Constitution, Constitution/)).toBeInTheDocument();
    expect(asi.getByText(/Ability score increase · two selections · max 20/)).toBeInTheDocument();

    const archery = featCard('Archery');
    expect(archery.getByText(/Fighting Style Feature · not automatically evaluated/)).toBeInTheDocument();
    expect(archery.getByText(/\+2 to ranged weapon attack rolls/)).toBeInTheDocument();
  });

  it('reconciles a Background change to a new derived Origin Feat without reseeding Inventory or currency', async () => {
    const user = userEvent.setup();
    const original = createCharacter(fighterInput({
      name: 'M8 Background Reconcile',
      manualFeats: [{ featId: srdId('feat', 'archery'), choices: {} }],
      inventory: [{ id: 'keepsake', kind: 'custom', name: 'Keepsake', category: 'adventuring-gear', quantity: 1, notes: 'Must survive Background edits.' }],
      currency: { gp: 7 },
    }));
    const originalInventory = original.inventory;
    const originalCurrency = original.currency;

    renderAt(`/characters/${original.id}/edit`);
    await user.selectOptions(screen.getByLabelText('Background'), srdId('background', 'soldier'));
    expect(screen.getByText(/Origin Feat:/)).toHaveTextContent('Savage Attacker');
    expect(screen.getByText(/Changing Background does not rewrite existing Inventory/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    const [saved] = loadCharacters();
    expect(saved.backgroundId).toBe(srdId('background', 'soldier'));
    expect(saved.manualFeats).toEqual([{ featId: srdId('feat', 'archery'), choices: {} }]);
    expect(saved.inventory).toEqual(originalInventory);
    expect(saved.currency).toEqual(originalCurrency);
    expect(saved.inventory).toHaveLength(1);

    const derived = deriveCharacterState(saved, contentRegistry);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.value.feats.map((feat) => feat.name)).toEqual(['Savage Attacker', 'Archery']);

    await user.click(await screen.findByRole('link', { name: 'Character' }));
    expect(screen.getByRole('heading', { name: 'Savage Attacker' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Archery' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Magic Initiate/ })).not.toBeInTheDocument();
  });
});
