import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { WIZARD_SPELLCASTING_PROVIDER_ID } from '../content/srd/wizard';
import { srdId } from '../content/srd/source';
import type { CharacterInput, CharacterSpellcastingSelection, InventoryEntry } from '../models/character';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { CHARACTER_STORAGE_KEY, createCharacter, loadCharacters } from '../services/characterStorage';
import { contentRegistry } from '../services/contentRegistry';
import { fighterInput } from './fixtures';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

const WIZARD_ID = srdId('class', 'wizard');
const EVOKER_ID = srdId('subclass', 'wizard:evoker');
const FIGHTER_ID = srdId('class', 'fighter');
const LEVEL1_WIZARD_SLOT_ID = srdId('spell-slot', 'wizard:1');

function wizardCatalog() {
  const catalog = contentRegistry.getAll('spell').filter((spell) => spell.spellLists.some((list) => list.id === 'wizard'));
  const cantrips = catalog.filter((spell) => spell.level === 0).sort((left, right) => left.name.localeCompare(right.name));
  const levelOne = catalog.filter((spell) => spell.level === 1).sort((left, right) => left.name.localeCompare(right.name));
  const rituals = levelOne.filter((spell) => spell.ritual);
  const ownedRitual = rituals[0];
  const unownedRitual = rituals[1];
  if (!ownedRitual || !unownedRitual) throw new Error('Wizard ritual fixtures require at least two bundled level-1 Rituals.');
  const nonRituals = levelOne.filter((spell) => !spell.ritual);
  if (cantrips.length < 4 || nonRituals.length < 6) throw new Error('Wizard spell fixtures are incomplete.');
  const owned = [ownedRitual, ...nonRituals.slice(0, 5)];
  const prepared = nonRituals.slice(0, 4);
  const unownedOrdinary = nonRituals[5];
  return { cantrips, levelOne, ownedRitual, unownedRitual, owned, prepared, unownedOrdinary };
}

function selectionForLevel(level: number): CharacterSpellcastingSelection {
  const choices = wizardCatalog();
  return {
    providerId: WIZARD_SPELLCASTING_PROVIDER_ID,
    cantripIds: choices.cantrips.slice(0, level >= 4 ? 4 : 3).map((spell) => spell.id),
    ownedSpellIds: choices.owned.map((spell) => spell.id),
    preparedSpellIds: choices.prepared.map((spell) => spell.id),
  };
}

function wizardInput(level = 1, inventory: InventoryEntry[] = [], currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }): CharacterInput {
  return fighterInput({
    name: 'M12E Wizard ' + level,
    classId: WIZARD_ID,
    subclassId: level >= 3 ? EVOKER_ID : undefined,
    level,
    skillProficiencies: ['history', 'insight'],
    abilityScores: { intelligence: 16, wisdom: 14 },
    spellcastingSelections: [selectionForLevel(level)],
    inventory,
    currency,
  });
}

function spellBlock(name: RegExp) {
  const heading = screen.getByRole('heading', { name });
  const block = heading.closest('.origin-choice-block') as HTMLElement | null;
  if (!block) throw new Error('Missing spell-selection block.');
  return within(block);
}

function ownedLabel(spell: ReturnType<typeof wizardCatalog>['owned'][number]) {
  return 'Level ' + spell.level + ' · ' + spell.name + ' · ' + spell.school + (spell.ritual ? ' · Ritual' : '');
}

function preparedLabel(spell: ReturnType<typeof wizardCatalog>['prepared'][number]) {
  return 'Level ' + spell.level + ' · ' + spell.name;
}

async function fillBaseWizardForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Character Name'), 'M12E Builder Wizard');
  await user.selectOptions(screen.getByLabelText('Class'), WIZARD_ID);
  for (const [label, score] of Object.entries({ Strength: '10', Dexterity: '14', Constitution: '14', Intelligence: '16', Wisdom: '12', Charisma: '10' })) {
    await user.type(screen.getByLabelText(label), score);
  }
  await user.click(screen.getByLabelText('History'));
  await user.click(screen.getByLabelText('Insight'));

  const choices = wizardCatalog();
  const cantripBlock = spellBlock(/^Cantrips/);
  for (const spell of choices.cantrips.slice(0, 3)) await user.click(cantripBlock.getByLabelText(spell.name));

  for (const spell of choices.owned) {
    await user.click(spellBlock(/^Owned leveled spells/).getByLabelText(ownedLabel(spell)));
  }

  for (const spell of choices.prepared) {
    await user.click(spellBlock(/^Prepared leveled spells/).getByLabelText(preparedLabel(spell)));
  }
  return { user, choices };
}

describe('Milestone 12E Wizard Character workflow', () => {
  it('creates a Wizard through the Builder with explicit spell choices, v9 persistence, and creation-only starting equipment', async () => {
    renderAt('/characters/new');
    const { user, choices } = await fillBaseWizardForm();

    expect(screen.getByLabelText('Wizard Starting Equipment')).toHaveValue('A');
    expect(spellBlock(/^Cantrips/).getByRole('heading', { name: 'Cantrips · 3/3' })).toBeInTheDocument();
    expect(spellBlock(/^Owned leveled spells/).getByRole('heading', { name: 'Owned leveled spells · 6 stored' })).toBeInTheDocument();
    expect(spellBlock(/^Prepared leveled spells/).getByRole('heading', { name: 'Prepared leveled spells · 4/4' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create Character' }));

    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v10');
    const [saved] = loadCharacters();
    expect(saved.classProgressions.find((entry) => entry.classId === WIZARD_ID)).toBeDefined();
    expect(saved.spellcastingSelections).toEqual([{
      providerId: WIZARD_SPELLCASTING_PROVIDER_ID,
      cantripIds: choices.cantrips.slice(0, 3).map((spell) => spell.id),
      ownedSpellIds: choices.owned.map((spell) => spell.id),
      preparedSpellIds: choices.prepared.map((spell) => spell.id),
    }]);
    expect(saved.inventory.some((entry) => entry.kind === 'custom' && entry.name === 'Spellbook')).toBe(true);
    expect(saved.inventory.some((entry) => entry.id.startsWith('class:' + WIZARD_ID + ':'))).toBe(true);
    expect(saved.playState.resourceUses[LEVEL1_WIZARD_SLOT_ID]).toBe(2);
    expect(Object.keys(saved.playState).sort()).toEqual(['currentHp', 'hitDiceRemaining', 'resourceUses', 'temporaryHp']);
    expect(saved.playState).not.toHaveProperty('spellbook');
    expect(saved.playState).not.toHaveProperty('preparedSpells');
    expect(saved.playState).not.toHaveProperty('cantripIds');

    const derived = deriveCharacterState(saved, contentRegistry);
    if (!derived.ok) throw new Error(derived.error.message);
    const provider = derived.value.spellcasting.find((entry) => entry.id === WIZARD_SPELLCASTING_PROVIDER_ID);
    if (!provider || provider.management.kind !== 'prepared-from-owned') throw new Error('Wizard provider missing after reload.');
    expect(provider.management.ownedSpells.map((spell) => spell.id)).toEqual(choices.owned.map((spell) => spell.id));
    expect(provider.management.preparedSpells.map((spell) => spell.id)).toEqual(choices.prepared.map((spell) => spell.id));
    expect(provider.ritualSpells.map((spell) => spell.id)).toContain(choices.ownedRitual.id);
    expect(provider.ritualSpells.map((spell) => spell.id)).not.toContain(choices.unownedRitual.id);
    expect(provider.spells.map((spell) => spell.id)).not.toContain(choices.ownedRitual.id);
    expect(provider.spells.map((spell) => spell.id)).not.toContain(choices.unownedOrdinary.id);
  });

  it('shows owned, prepared, and owned-Ritual state on CHARACTER while PLAY remains structurally unchanged', () => {
    const choices = wizardCatalog();
    const character = createCharacter(wizardInput());
    const characterView = renderAt('/characters/' + character.id + '/character');

    expect(screen.getByRole('heading', { name: 'Wizard Spellcasting' })).toBeInTheDocument();
    expect(screen.getByText((text) => text.includes('Owned leveled spells:') && text.includes(choices.ownedRitual.name))).toBeInTheDocument();
    expect(screen.getByText((text) => text.includes('Prepared leveled spells:') && choices.prepared.every((spell) => text.includes(spell.name)))).toBeInTheDocument();
    expect(screen.getByText((text) => text.includes('Ritual eligible:') && text.includes(choices.ownedRitual.name) && !text.includes(choices.unownedRitual.name))).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: choices.ownedRitual.name })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: choices.unownedOrdinary.name })).not.toBeInTheDocument();
    for (const spell of choices.prepared) expect(screen.getByRole('heading', { name: spell.name })).toBeInTheDocument();
    characterView.unmount();

    renderAt('/characters/' + character.id);
    expect(screen.getByRole('heading', { name: 'Spellcasting' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Attack Rolls' })).toBeInTheDocument();
  });

  it('preserves Wizard selections across Wizard edits and removes preparation when an owned spell is removed', async () => {
    const user = userEvent.setup();
    const choices = wizardCatalog();
    const character = createCharacter(wizardInput());

    let view = renderAt('/characters/' + character.id + '/edit');
    expect(spellBlock(/^Cantrips/).getByLabelText(choices.cantrips[0].name)).toBeChecked();
    expect(spellBlock(/^Owned leveled spells/).getByLabelText(ownedLabel(choices.prepared[0]))).toBeChecked();
    expect(spellBlock(/^Prepared leveled spells/).getByLabelText(preparedLabel(choices.prepared[0]))).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(loadCharacters()[0].spellcastingSelections).toEqual([selectionForLevel(1)]);

    view.unmount();
    view = renderAt('/characters/' + character.id + '/edit');
    await user.click(spellBlock(/^Owned leveled spells/).getByLabelText(ownedLabel(choices.prepared[0])));
    expect(spellBlock(/^Prepared leveled spells/).queryByLabelText(preparedLabel(choices.prepared[0]))).not.toBeInTheDocument();
    await user.click(spellBlock(/^Owned leveled spells/).getByLabelText(ownedLabel(choices.unownedOrdinary)));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    const [edited] = loadCharacters();
    expect(edited.spellcastingSelections[0].ownedSpellIds).not.toContain(choices.prepared[0].id);
    expect(edited.spellcastingSelections[0].ownedSpellIds).toContain(choices.unownedOrdinary.id);
    expect(edited.spellcastingSelections[0].preparedSpellIds).not.toContain(choices.prepared[0].id);
    expect(edited.spellcastingSelections[0].cantripIds).toEqual(selectionForLevel(1).cantripIds);
    view.unmount();
  });

  it('drops inactive Wizard selections on Wizard-to-Fighter save while preserving Inventory/currency and never reseeding Fighter equipment', async () => {
    const user = userEvent.setup();
    const inventory: InventoryEntry[] = [
      { id: 'persisted:spellbook', kind: 'custom', name: 'Spellbook', category: 'adventuring-gear', quantity: 1, notes: 'Keep me.' },
      { id: 'persisted:keepsake', kind: 'custom', name: 'Keepsake', category: 'other', quantity: 1, notes: 'Also keep me.' },
    ];
    const currency = { cp: 3, sp: 4, ep: 0, gp: 27, pp: 1 };
    const character = createCharacter(wizardInput(1, inventory, currency));
    const originalInventory = structuredClone(character.inventory);
    const originalCurrency = { ...character.currency };

    renderAt('/characters/' + character.id + '/edit');
    expect(screen.queryByLabelText('Wizard Starting Equipment')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Class'), FIGHTER_ID);
    expect(screen.queryByRole('heading', { name: 'Persistent spell selections' })).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Fighter Weapon Mastery: Dagger'));
    await user.click(screen.getByLabelText('Fighter Weapon Mastery: Light Crossbow'));
    await user.click(screen.getByLabelText('Fighter Weapon Mastery: Scimitar'));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    const [edited] = loadCharacters();
    expect(edited.classProgressions.find((entry) => entry.classId === FIGHTER_ID)).toBeDefined();
    expect(edited.spellcastingSelections).toEqual([]);
    expect(edited.inventory).toEqual(originalInventory);
    expect(edited.currency).toEqual(originalCurrency);
    expect(edited.inventory.some((entry) => entry.id.startsWith('class:' + FIGHTER_ID + ':'))).toBe(false);
  });

  it('does not fabricate initial spellbook choices when editing a non-Wizard into Wizard', async () => {
    const user = userEvent.setup();
    const fighter = createCharacter(fighterInput({ name: 'No Fabricated Spellbook', level: 1, subclassId: undefined }));
    renderAt('/characters/' + fighter.id + '/edit');

    await user.selectOptions(screen.getByLabelText('Class'), WIZARD_ID);
    await user.click(screen.getByLabelText('History'));
    await user.click(screen.getByLabelText('Insight'));
    expect(spellBlock(/^Owned leveled spells/).getByRole('heading', { name: 'Owned leveled spells · 0 stored' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(screen.getByText('Choose spellcasting selections for Wizard Spellcasting.')).toBeInTheDocument();
    const [unchanged] = loadCharacters();
    expect(unchanged.classProgressions.find((entry) => entry.classId === FIGHTER_ID)).toBeDefined();
    expect(unchanged.spellcastingSelections).toEqual([]);
  });

  it('allows bounded higher-level direct creation without fabricating historical two-spells-per-level ownership', () => {
    const character = createCharacter(wizardInput(5));
    const progression = character.classProgressions.find((entry) => entry.classId === WIZARD_ID);
    expect(progression).toBeDefined();
    expect(progression?.subclassId).toBe(EVOKER_ID);
    expect(character.spellcastingSelections[0].ownedSpellIds).toHaveLength(6);
    expect(character.spellcastingSelections[0].cantripIds).toHaveLength(4);
    expect(character.spellcastingSelections[0].preparedSpellIds).toHaveLength(4);
    expect(character.playState.resourceUses[srdId('spell-slot', 'wizard:1')]).toBe(4);
    expect(character.playState.resourceUses[srdId('spell-slot', 'wizard:2')]).toBe(3);
    expect(character.playState.resourceUses[srdId('spell-slot', 'wizard:3')]).toBe(2);
  });
});
