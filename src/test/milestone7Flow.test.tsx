import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { srdId } from '../content/srd';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { contentRegistry } from '../services/contentRegistry';
import { loadCharacters } from '../services/characterStorage';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

describe('Milestone 7 SRD origin integration', () => {
  it('creates a Wood Elf Soldier with derived origin rules, inventory, currency, reference data, and PLAY Speed', async () => {
    const user = userEvent.setup();
    renderAt('/characters/new');

    await user.type(screen.getByLabelText('Character Name'), 'M7 Origin Test');
    await user.selectOptions(screen.getByLabelText('Species'), srdId('species', 'elf'));
    await user.selectOptions(screen.getByLabelText('Elven Lineage'), 'wood-elf');
    await user.selectOptions(screen.getByLabelText('Species Skill Proficiency'), 'survival');
    await user.selectOptions(screen.getByLabelText('Background'), srdId('background', 'soldier'));
    await user.selectOptions(screen.getByLabelText('+2 Ability'), 'dexterity');
    await user.selectOptions(screen.getByLabelText('+1 Ability'), 'constitution');
    await user.selectOptions(screen.getByLabelText('gaming-set proficiency'), 'dice-set');
    await user.selectOptions(screen.getByLabelText('Level'), '4');
    await user.selectOptions(screen.getByLabelText(/Subclass/), srdId('subclass', 'fighter:champion'));

    for (const [label, score] of Object.entries({ Strength: '14', Dexterity: '18', Constitution: '14', Intelligence: '10', Wisdom: '12', Charisma: '10' })) {
      await user.type(screen.getByLabelText(label), score);
    }
    await user.click(screen.getByLabelText('Athletics'));
    await user.click(screen.getByLabelText('Perception'));
    await user.click(screen.getByRole('button', { name: 'Create Character' }));

    const [saved] = loadCharacters();
    expect(saved).toBeDefined();
    expect(saved.speciesId).toBe(srdId('species', 'elf'));
    expect(saved.backgroundId).toBe(srdId('background', 'soldier'));
    expect(saved.abilityScores.dexterity).toBe(18);
    expect(saved.abilityScores.constitution).toBe(14);
    expect(saved.speciesChoices).toEqual({ 'elven-lineage': 'wood-elf' });
    expect(saved.speciesSkillProficiencies).toEqual(['survival']);
    expect(saved.backgroundAbilityChoice).toEqual({ mode: 'two-one', plusTwo: 'dexterity', plusOne: 'constitution' });
    expect(saved.backgroundToolChoice).toBe('dice-set');
    expect(saved.backgroundEquipmentChoice).toBe('A');
    expect(saved.currency.gp).toBe(18);
    expect(saved.inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'registry', contentId: srdId('weapon', 'spear'), quantity: 1, equipped: false }),
      expect.objectContaining({ kind: 'registry', contentId: srdId('weapon', 'shortbow'), quantity: 1, equipped: false }),
      expect.objectContaining({ kind: 'custom', name: 'Arrow', quantity: 20, category: 'ammunition' }),
      expect.objectContaining({ kind: 'custom', name: 'Dice Set', quantity: 1 }),
    ]));

    const derived = deriveCharacterState(saved, contentRegistry);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.value.abilityScores.dexterity).toBe(20);
    expect(derived.value.abilityScores.constitution).toBe(15);
    expect(derived.value.species).toMatchObject({ name: 'Elf', size: 'medium', speedFeet: 35 });
    expect(derived.value.background).toMatchObject({ name: 'Soldier', toolProficiency: { name: 'Dice Set' }, originFeat: { name: 'Savage Attacker' } });
    expect(derived.value.skills.athletics).toMatchObject({ proficient: true, modifier: 4 });
    expect(derived.value.skills.intimidation.proficient).toBe(true);
    expect(derived.value.skills.survival.proficient).toBe(true);

    const speed = (await screen.findByText('Speed')).closest('article');
    expect(speed).not.toBeNull();
    expect(within(speed!).getByText('35')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Character' }));
    expect(screen.getByRole('heading', { name: 'Species & Background' })).toBeInTheDocument();
    expect(screen.getByText('Wood Elf')).toBeInTheDocument();
    expect(screen.getByText('Dice Set')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Savage Attacker' })).toBeInTheDocument();
    const athletics = screen.getByText('Athletics').closest('article');
    expect(athletics).not.toBeNull();
    expect(within(athletics!).getByText('+4')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Inventory' }));
    expect(screen.getByRole('heading', { name: 'Spear' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Shortbow' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dice Set' })).toBeInTheDocument();
    expect(screen.getByLabelText('GP')).toHaveValue(18);
  });

  it('seeds the cash-only Background option alongside the selected Class package without duplicate equipment state', async () => {
    const user = userEvent.setup();
    renderAt('/characters/new');

    await user.type(screen.getByLabelText('Character Name'), 'M7 Cash Test');
    await user.selectOptions(screen.getByLabelText('Starting Equipment'), 'B');
    for (const [label, score] of Object.entries({ Strength: '14', Dexterity: '14', Constitution: '14', Intelligence: '14', Wisdom: '14', Charisma: '14' })) {
      await user.type(screen.getByLabelText(label), score);
    }
    await user.click(screen.getByLabelText('Athletics'));
    await user.click(screen.getByLabelText('Perception'));
    await user.click(screen.getByRole('button', { name: 'Create Character' }));

    const [saved] = loadCharacters();
    expect(saved.backgroundEquipmentChoice).toBe('B');
    expect(saved.currency).toEqual({ cp: 0, sp: 0, ep: 0, gp: 54, pp: 0 });
    expect(saved.inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'registry', contentId: srdId('armor', 'chain-mail'), quantity: 1, equipped: false }),
      expect.objectContaining({ kind: 'registry', contentId: srdId('weapon', 'greatsword'), quantity: 1, equipped: false }),
      expect.objectContaining({ kind: 'registry', contentId: srdId('weapon', 'flail'), quantity: 1, equipped: false }),
      expect.objectContaining({ kind: 'registry', contentId: srdId('weapon', 'javelin'), quantity: 8, equipped: false }),
    ]));
    expect('equipment' in saved).toBe(false);
  });
});
