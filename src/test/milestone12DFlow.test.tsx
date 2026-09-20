import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { SORCERER_INNATE_SORCERY_RESOURCE_ID, SORCERER_SORCERY_POINTS_RESOURCE_ID } from '../content/srd/sorcerer';
import { srdId } from '../content/srd/source';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { consumeCharacterResource, expendCharacterResource, finishCharacterShortRest } from '../services/characterPlayState';
import { contentRegistry } from '../services/contentRegistry';
import { CHARACTER_STORAGE_KEY, createCharacter, getCharacterById, loadCharacters } from '../services/characterStorage';
import { fighterInput } from './fixtures';

function renderAt(path: string) { return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>); }

const SORCERER_ID = srdId('class', 'sorcerer');
const DRACONIC_ID = srdId('subclass', 'sorcerer:draconic-sorcery');
const WARLOCK_ID = srdId('class', 'warlock');
const FIEND_ID = srdId('subclass', 'warlock:fiend-patron');
const LEVEL3_PACT_SLOT_ID = srdId('spell-slot', 'warlock:pact-magic:3');

describe('Milestone 12D Character and PLAY integration', () => {
  it('creates a Draconic Sorcerer on v7 with generic Sorcery resources and static Draconic derivations only', () => {
    const character = createCharacter(fighterInput({
      name: 'M12D Sorcerer',
      classId: SORCERER_ID,
      subclassId: DRACONIC_ID,
      level: 3,
      skillProficiencies: ['arcana', 'deception'],
      abilityScores: { dexterity: 14, constitution: 14, charisma: 16 },
    }));
    const derived = deriveCharacterState(character, contentRegistry);
    if (!derived.ok) throw new Error(derived.error.message);

    expect(derived.value.health).toEqual({ maximumHp: 23, hitDice: [{ die: 6, maximum: 3 }] });
    expect(derived.value.defense.armorClass).toBe(16);
    expect(derived.value.resources.find((resource) => resource.id === SORCERER_INNATE_SORCERY_RESOURCE_ID)?.maximumUses).toBe(2);
    expect(derived.value.resources.find((resource) => resource.id === SORCERER_SORCERY_POINTS_RESOURCE_ID)?.maximumUses).toBe(3);
    expect(character.playState.resourceUses[SORCERER_INNATE_SORCERY_RESOURCE_ID]).toBe(2);
    expect(character.playState.resourceUses[SORCERER_SORCERY_POINTS_RESOURCE_ID]).toBe(3);

    renderAt(`/characters/${character.id}/character`);
    expect(screen.getByRole('heading', { name: 'Sorcerer Spellcasting' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Alter Self' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "Dragon's Breath" })).toBeInTheDocument();
    expect(screen.getByText('Prepared-from-list selections')).toBeInTheDocument();

    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v9');
    const stored = JSON.parse(window.localStorage.getItem(CHARACTER_STORAGE_KEY) ?? '[]') as Array<Record<string, unknown>>;
    const record = stored.find((entry) => entry.id === character.id);
    for (const field of ['preparedSpells', 'knownSpells', 'sorcererSpells', 'metamagicSelections', 'innateSorceryActive', 'draconicDamageType', 'dragonWingsActive', 'dragonCompanionState']) expect(record).not.toHaveProperty(field);
    expect(record).toHaveProperty('spellcastingSelections', []);
    expect(record).toHaveProperty('playState.resourceUses');
  });

  it('spends Sorcery Points through the existing generic variable consumer without adding conversion or spell-mutation state', () => {
    const character = createCharacter(fighterInput({
      name: 'M12D Sorcery Point Spend',
      classId: SORCERER_ID,
      subclassId: DRACONIC_ID,
      level: 5,
      skillProficiencies: ['arcana', 'deception'],
      abilityScores: { charisma: 16 },
    }));
    const consumerId = srdId('class-resource-consumer', 'sorcerer:manual-sorcery-point-cost');
    const spent = consumeCharacterResource(character.id, SORCERER_SORCERY_POINTS_RESOURCE_ID, consumerId, { expenditureAmount: 2 });
    expect(spent).toMatchObject({ ok: true, value: { playState: { resourceUses: { [SORCERER_SORCERY_POINTS_RESOURCE_ID]: 3 } } } });
    expect(getCharacterById(character.id)?.playState.resourceUses[SORCERER_SORCERY_POINTS_RESOURCE_ID]).toBe(3);

    const stored = JSON.parse(window.localStorage.getItem(CHARACTER_STORAGE_KEY) ?? '[]') as Array<Record<string, unknown>>;
    const record = stored.find((entry) => entry.id === character.id);
    for (const field of ['generatedSpellSlots', 'sorceryPointConversion', 'metamagicState', 'spellMutationState']) expect(record).not.toHaveProperty(field);
  });

  it('creates a Fiend Warlock with Pact Magic in the shared provider/resource path and restores Pact slots on a Short Rest', () => {
    const character = createCharacter(fighterInput({
      name: 'M12D Warlock',
      classId: WARLOCK_ID,
      subclassId: FIEND_ID,
      level: 5,
      skillProficiencies: ['arcana', 'deception'],
      abilityScores: { charisma: 16 },
    }));
    const derived = deriveCharacterState(character, contentRegistry);
    if (!derived.ok) throw new Error(derived.error.message);
    const provider = derived.value.spellcasting.find((entry) => entry.name === 'Warlock Pact Magic');
    expect(provider?.slotPool?.slots).toEqual([{ spellLevel: 3, resourceId: LEVEL3_PACT_SLOT_ID, name: 'Level 3 Pact Magic Slots', maximumUses: 2 }]);
    expect(provider?.slotPool?.recovery).toEqual([{ trigger: 'short-rest', mode: 'all' }, { trigger: 'long-rest', mode: 'all' }]);
    expect(character.playState.resourceUses[LEVEL3_PACT_SLOT_ID]).toBe(2);

    const spent = expendCharacterResource(character.id, LEVEL3_PACT_SLOT_ID);
    expect(spent).toMatchObject({ ok: true, value: { playState: { resourceUses: { [LEVEL3_PACT_SLOT_ID]: 1 } } } });
    const rested = finishCharacterShortRest(character.id);
    expect(rested).toMatchObject({ ok: true, value: { playState: { resourceUses: { [LEVEL3_PACT_SLOT_ID]: 2 } } } });
    expect(getCharacterById(character.id)?.playState.resourceUses[LEVEL3_PACT_SLOT_ID]).toBe(2);

    renderAt(`/characters/${character.id}/character`);
    expect(screen.getByRole('heading', { name: 'Warlock Pact Magic' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Scorching Ray' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Suggestion' })).toBeInTheDocument();

    const stored = JSON.parse(window.localStorage.getItem(CHARACTER_STORAGE_KEY) ?? '[]') as Array<Record<string, unknown>>;
    const record = stored.find((entry) => entry.id === character.id);
    for (const field of ['preparedSpells', 'knownSpells', 'warlockSpells', 'warlockSpellSlots', 'pactMagicSlots', 'invocations', 'fiendishResilienceType', 'hurlThroughHellTarget']) expect(record).not.toHaveProperty(field);
    expect(record).toHaveProperty('playState.resourceUses');
  });

  it('seeds Sorcerer starting equipment only for creation and preserves that Inventory/currency when the existing character is edited to Warlock', async () => {
    const user = userEvent.setup();
    const createView = renderAt('/characters/new');
    await user.type(screen.getByLabelText('Character Name'), 'M12D Equipment Boundary');
    await user.selectOptions(screen.getByLabelText('Class'), SORCERER_ID);
    await user.selectOptions(screen.getByLabelText('Level'), '3');
    await user.selectOptions(screen.getByLabelText('Subclass'), DRACONIC_ID);
    for (const [label, score] of Object.entries({ Strength: '10', Dexterity: '14', Constitution: '14', Intelligence: '12', Wisdom: '10', Charisma: '16' })) await user.type(screen.getByLabelText(label), score);
    await user.click(screen.getByLabelText('Arcana'));
    await user.click(screen.getByLabelText('Deception'));
    expect(screen.getByLabelText('Sorcerer Starting Equipment')).toHaveValue('A');
    await user.click(screen.getByRole('button', { name: 'Create Character' }));

    const [created] = loadCharacters();
    const originalInventory = structuredClone(created.inventory);
    const originalCurrency = { ...created.currency };
    expect(created.classProgressions.find((entry) => entry.classId === SORCERER_ID)).toBeDefined();
    expect(created.inventory.some((entry) => entry.id.startsWith(`class:${SORCERER_ID}:`))).toBe(true);
    expect(created.inventory.some((entry) => entry.kind === 'custom' && entry.name === 'Arcane Focus (crystal)')).toBe(true);
    createView.unmount();

    renderAt(`/characters/${created.id}/edit`);
    expect(screen.queryByLabelText('Sorcerer Starting Equipment')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Managed in Inventory' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Class'), WARLOCK_ID);
    await user.selectOptions(screen.getByLabelText('Subclass'), FIEND_ID);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    const [edited] = loadCharacters();
    const editedProgression = edited.classProgressions.find((entry) => entry.classId === WARLOCK_ID);
    expect(editedProgression).toBeDefined();
    expect(editedProgression?.subclassId).toBe(FIEND_ID);
    expect(edited.inventory).toEqual(originalInventory);
    expect(edited.currency).toEqual(originalCurrency);
    expect(edited.inventory.some((entry) => entry.id.startsWith(`class:${WARLOCK_ID}:`))).toBe(false);
  });
});
