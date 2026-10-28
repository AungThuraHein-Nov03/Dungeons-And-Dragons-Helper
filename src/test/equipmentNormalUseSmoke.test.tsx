import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { srdId } from '../content/srd';
import { clearDiceVisualEvent, getDiceVisualEventSnapshot, type DiceVisualEvent } from '../dice/diceVisualEvent';
import type { Character } from '../models/character';
import type { ContentEntry } from '../models/content';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { createApplicationCharacter } from '../services/applicationCharacterMutations';
import { CHARACTER_STORAGE_KEY } from '../services/characterStorage';
import { contentRegistry } from '../services/contentRegistry';
import { HOMEBREW_CONTENT_STORAGE_KEY } from '../services/homebrewContentStorage';
import {
  PROJECT_CHARACTERS_ENDPOINT, PROJECT_CONTENT_ENDPOINT, PROJECT_STATE_ENDPOINT,
  type ProjectStateEnvelope,
} from '../services/projectPersistenceTransport';
import { getApplicationCharacterById, initializeApplicationPersistence } from '../services/projectState';
import { loadRollHistory } from '../services/rollHistory';
import { fighterInput, SCIMITAR_ID } from './fixtures';

// jsdom has no WebGL canvas. Keep the real roll engine, event publisher, and
// overlay host; observe only the final renderer's incoming authoritative data.
const overlayInput = vi.hoisted(() => ({ event: null as DiceVisualEvent | null }));
vi.mock('../components/DiceRollOverlay3D', () => ({
  default: ({ event }: { event: DiceVisualEvent }) => {
    overlayInput.event = event;
    return null;
  },
}));

function isolatedProject() {
  let content: ContentEntry[] = [];
  let characters: Character[] = [];
  let contentVersion = 1;
  let characterVersion = 1;
  const requests: string[] = [];
  const snapshot = (): ProjectStateEnvelope => ({
    content: structuredClone(content), characters: structuredClone(characters),
    contentExists: true, charactersExists: true, characterMigrationRequired: false,
    contentRevision: `"h${contentVersion}"`, characterRevision: `"c${characterVersion}"`,
  });
  const fetchImpl: typeof fetch = async (input, init) => {
    const endpoint = String(input);
    requests.push(`${init?.method} ${endpoint}`);
    const previous = snapshot();
    const headers = new Headers(init?.headers);
    if (init?.method === 'PUT' && endpoint === PROJECT_CONTENT_ENDPOINT) {
      expect(headers.get('If-Match')).toBe(previous.contentRevision);
      expect(headers.get('X-DND3-Characters-If-Match')).toBe(previous.characterRevision);
      content = JSON.parse(String(init.body)) as ContentEntry[];
      contentVersion += 1;
    } else if (init?.method === 'PUT' && endpoint === PROJECT_CHARACTERS_ENDPOINT) {
      expect(headers.get('If-Match')).toBe(previous.characterRevision);
      expect(headers.get('X-DND3-Content-If-Match')).toBe(previous.contentRevision);
      characters = JSON.parse(String(init.body)) as Character[];
      characterVersion += 1;
    } else if (init?.method !== 'GET' || endpoint !== PROJECT_STATE_ENDPOINT) {
      throw new Error(`Unexpected isolated transport request: ${init?.method} ${endpoint}`);
    }
    return new Response(JSON.stringify(snapshot()), { status: 200 });
  };
  return { fetchImpl, snapshot, requests };
}

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

function inventoryCard(name: string) {
  const card = screen.getByRole('heading', { name }).closest('article');
  if (!card) throw new Error(`Missing inventory card: ${name}`);
  return within(card);
}

function attacksPanel() {
  return within(screen.getByRole('heading', { name: 'Attack Rolls' }).closest('section')!);
}

function derivedCharacter(id: string) {
  const character = getApplicationCharacterById(id);
  if (!character) throw new Error('Isolated Character missing');
  const result = deriveCharacterState(character, contentRegistry);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

beforeEach(async () => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  overlayInput.event = null;
  await initializeApplicationPersistence({ backend: 'browser-local' });
});

afterEach(async () => {
  cleanup();
  const event = getDiceVisualEventSnapshot();
  if (event) clearDiceVisualEvent(event.id);
  vi.unstubAllGlobals();
  await initializeApplicationPersistence({ backend: 'browser-local' });
});

describe('isolated equipment normal-use boundaries', () => {
  it('completes Forge save → Inventory equip → shared rules/rolls → project reload for flows A–D', async () => {
    const project = isolatedProject();
    vi.stubGlobal('fetch', project.fetchImpl);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }));
    expect((await initializeApplicationPersistence({ backend: 'project' })).ok).toBe(true);
    const user = userEvent.setup();
    const ordinaryScimitar = structuredClone(contentRegistry.findWeapon(SCIMITAR_ID));

    async function nameAndSave(name: string) {
      const id = screen.getByText(/^homebrew:local:(weapon|armor|equipment):/).textContent!;
      await user.clear(screen.getByLabelText('Equipment name'));
      await user.type(screen.getByLabelText('Equipment name'), name);
      await user.click(screen.getByRole('button', { name: 'Review Equipment' }));
      expect(screen.getByText(id)).toBeInTheDocument();
      expect(project.snapshot().content.some((entry) => entry.id === id)).toBe(false);
      await user.click(screen.getByRole('button', { name: 'Save Equipment' }));
      expect(await screen.findByRole('heading', { name: 'Custom Equipment' })).toBeInTheDocument();
      expect(project.snapshot().content.find((entry) => entry.id === id)?.name).toBe(name);
      return id;
    }

    // A: copy the ordinary weapon once, then add bounded magical bonuses.
    const forge = renderAt('/creator-forge/equipment/new');
    await user.selectOptions(screen.getByLabelText('Equipment template'), SCIMITAR_ID);
    await user.click(screen.getByRole('button', { name: 'Start From Existing' }));
    await user.selectOptions(screen.getByLabelText('Attack bonus'), '2');
    await user.selectOptions(screen.getByLabelText('Damage bonus'), '3');
    const magicalId = await nameAndSave('Moonlit Scimitar');
    expect(magicalId).not.toBe(SCIMITAR_ID);
    expect(contentRegistry.findWeapon(SCIMITAR_ID)).toEqual(ordinaryScimitar);

    // B: a unique simple finesse weapon created entirely from scratch.
    await user.click(screen.getByRole('link', { name: 'Create Equipment' }));
    await user.click(screen.getByRole('button', { name: 'Create Weapon from Scratch' }));
    await user.selectOptions(screen.getByLabelText('Damage die size'), '8');
    await user.selectOptions(screen.getByLabelText('Damage type'), 'piercing');
    await user.click(screen.getByRole('checkbox', { name: 'Finesse' }));
    await user.selectOptions(screen.getByLabelText('Weapon mastery'), srdId('weapon-mastery', 'vex'));
    const uniqueId = await nameAndSave('Glass Needle');

    // C: custom light armor, 12 + full DEX + bounded item bonus 2.
    await user.click(screen.getByRole('link', { name: 'Create Equipment' }));
    await user.click(screen.getByRole('button', { name: 'Create Armor or Shield from Scratch' }));
    await user.clear(screen.getByLabelText('Base Armor Class'));
    await user.type(screen.getByLabelText('Base Armor Class'), '12');
    await user.selectOptions(screen.getByLabelText('Armor Class bonus'), '2');
    const armorId = await nameAndSave('Wayfinder Leather');

    // D: deliberately mechanical-sounding reference text must remain inert.
    await user.click(screen.getByRole('link', { name: 'Create Equipment' }));
    await user.click(screen.getByRole('button', { name: 'Create Miscellaneous Equipment from Scratch' }));
    await user.selectOptions(screen.getByLabelText('Equipment category'), 'campaign-item');
    await user.type(screen.getByLabelText('Description'), 'The key to the northern observatory.');
    await user.click(screen.getByRole('button', { name: 'Add Reference Effect' }));
    await user.type(screen.getByLabelText('Reference effect 1'), 'Grants +99 attack, damage, and Armor Class while carried; table managed only.');
    const campaignId = await nameAndSave('Observatory Seal');
    const contentIds = [magicalId, uniqueId, armorId, campaignId];
    expect(new Set(contentIds).size).toBe(4);
    forge.unmount();

    const input = fighterInput({
      name: 'Equipment Smoke Rogue', classId: srdId('class', 'rogue'), level: 1,
      skillProficiencies: ['acrobatics', 'investigation', 'sleight-of-hand', 'stealth'],
      inventory: [],
    });
    input.classProgressions[0].weaponMasterySelections = [magicalId, uniqueId];
    const created = await createApplicationCharacter(input);
    if (!created.ok || !created.character) throw new Error(JSON.stringify(created));
    const characterId = created.character.id;
    const view = renderAt(`/characters/${characterId}/inventory`);

    async function add(name: string, equip: boolean) {
      const search = screen.getByLabelText('Search registry items');
      await user.clear(search);
      await user.type(search, name);
      const result = within(screen.getByRole('region', { name: 'Registry item results' }));
      await user.click(result.getByRole('button', { name: 'Add' }));
      await screen.findByRole('heading', { name });
      if (equip) {
        await user.click(inventoryCard(name).getByRole('button', { name: 'Equip' }));
        await waitFor(() => expect(inventoryCard(name).getByRole('button', { name: 'Unequip' })).toBeInTheDocument());
      }
    }
    await add('Moonlit Scimitar', true);
    await add('Glass Needle', true);
    await add('Wayfinder Leather', true);
    const beforeReference = derivedCharacter(characterId);
    await user.selectOptions(screen.getByLabelText('Registry category'), 'campaign-item');
    await add('Observatory Seal', false);
    expect(inventoryCard('Observatory Seal').queryByRole('button', { name: 'Equip' })).not.toBeInTheDocument();
    expect(inventoryCard('Observatory Seal').getByText(/Grants \+99 attack/)).toBeInTheDocument();

    const state = derivedCharacter(characterId);
    expect(state.defense.armorClass).toBe(18);
    expect(state.defense).toEqual(beforeReference.defense);
    expect(state.attacks).toEqual(beforeReference.attacks);
    expect(state.attacks).toHaveLength(2);
    expect(state.attacks.find((attack) => attack.weaponId === magicalId)).toMatchObject({
      attackModifier: 8, attackAbility: 'dexterity', proficient: true,
      mastery: { name: 'Nick', canPotentiallyUse: true },
      damageConfigurations: [{ base: { kind: 'dice', count: 1, die: 6 }, abilityModifier: 4, damageBonus: 3 }],
    });
    expect(state.attacks.find((attack) => attack.weaponId === uniqueId)).toMatchObject({
      attackModifier: 6, attackAbility: 'dexterity', proficient: true,
      mastery: { name: 'Vex', canPotentiallyUse: true },
      damageConfigurations: [{ base: { kind: 'dice', count: 1, die: 8 }, abilityModifier: 4, damageBonus: 0 }],
    });
    const inventory = structuredClone(getApplicationCharacterById(characterId)!.inventory);
    expect(inventory.map((entry) => entry.kind === 'registry' ? entry.contentId : null)).toEqual(contentIds);
    expect(inventory.map((entry) => entry.kind === 'registry' && entry.equipped)).toEqual([true, true, true, false]);
    expect(new Set(inventory.map((entry) => entry.id)).size).toBe(4);

    await user.click(screen.getByRole('link', { name: 'Character' }));
    expect(screen.getByText('Wayfinder Leather · Trained')).toBeInTheDocument();
    expect(derivedCharacter(characterId).defense.armorClass).toBe(18);
    await user.click(screen.getByRole('link', { name: 'Character Sheet' }));
    expect(within(screen.getByRole('article', { name: 'Armor Class' })).getByText('18')).toBeInTheDocument();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    async function assertRoll(label: string, weaponId: string, total: number, modifier: number, dice: number[][]) {
      const history = loadRollHistory();
      const result = history[0].result;
      expect(result.request.label).toBe(label);
      expect(result.request.source).toMatchObject({ characterId, weaponId });
      expect(result.total).toBe(total);
      expect(result.modifier).toBe(modifier);
      expect(result.dice.map((group) => [group.die, ...group.values])).toEqual(dice);
      const historyLabel = within(screen.getByRole('region', { name: 'Roll History' })).getByText(label, { exact: true });
      const historyRow = within(historyLabel.closest('article')!);
      expect(historyRow.getByText(`Modifier: +${modifier}`)).toBeInTheDocument();
      expect(historyRow.getByText(new RegExp(`^Total: ${total}(?: |$)`))).toBeInTheDocument();
      const event = getDiceVisualEventSnapshot();
      expect(event?.title).toBe(label);
      expect(event?.dice.map((die) => [die.sides, die.value])).toEqual(
        result.dice.flatMap((group) => group.values.map((value) => [group.die, value])),
      );
      await waitFor(() => expect(overlayInput.event).toEqual(event));
      expect(loadRollHistory()).toEqual(history); // Rendering cannot reroll or append history.
    }
    const attacks = attacksPanel();
    await user.selectOptions(attacks.getByLabelText('Weapon'), inventory[0].id);
    await user.click(attacks.getByRole('button', { name: 'Roll Attack (Normal)' }));
    await assertRoll('Moonlit Scimitar Attack', magicalId, 19, 8, [[20, 11]]);
    await user.click(attacks.getByRole('button', { name: 'Roll Damage' }));
    await assertRoll('Moonlit Scimitar Damage', magicalId, 11, 7, [[6, 4]]);
    await user.click(attacks.getByRole('checkbox', { name: 'Sneak Attack (+1d6)' }));
    await user.click(attacks.getByRole('button', { name: 'Roll Damage' }));
    await assertRoll('Moonlit Scimitar Damage + Sneak Attack', magicalId, 15, 7, [[6, 4], [6, 4]]);
    await user.selectOptions(attacks.getByLabelText('Weapon'), inventory[1].id);
    await user.click(attacks.getByRole('button', { name: 'Roll Attack (Normal)' }));
    await assertRoll('Glass Needle Attack', uniqueId, 17, 6, [[20, 11]]);
    await user.click(attacks.getByRole('button', { name: 'Roll Damage' }));
    await assertRoll('Glass Needle Damage', uniqueId, 9, 4, [[8, 5]]);
    await user.click(attacks.getByRole('checkbox', { name: 'Sneak Attack (+1d6)' }));
    await user.click(attacks.getByRole('button', { name: 'Roll Damage' }));
    await assertRoll('Glass Needle Damage + Sneak Attack', uniqueId, 13, 4, [[8, 5], [6, 4]]);
    const historyBeforeReload = loadRollHistory();
    expect(historyBeforeReload).toHaveLength(6);
    const persisted = project.snapshot();
    view.unmount();

    // Drop both published catalogs before reloading the isolated project JSON.
    await initializeApplicationPersistence({ backend: 'browser-local' });
    expect(contentRegistry.findWeapon(magicalId)).toBeUndefined();
    expect(getApplicationCharacterById(characterId)).toBeUndefined();
    expect((await initializeApplicationPersistence({ backend: 'project' })).ok).toBe(true);
    expect(project.snapshot()).toEqual(persisted);
    expect(getApplicationCharacterById(characterId)?.inventory).toEqual(inventory);
    for (const entry of persisted.content) expect(contentRegistry.getById(entry.id)).toEqual(entry);
    expect(derivedCharacter(characterId).defense.armorClass).toBe(18);
    expect(derivedCharacter(characterId).attacks).toEqual(state.attacks);
    const reload = renderAt(`/characters/${characterId}/inventory`);
    for (const name of ['Moonlit Scimitar', 'Glass Needle', 'Wayfinder Leather']) {
      expect(inventoryCard(name).getByRole('button', { name: 'Unequip' })).toBeInTheDocument();
    }
    expect(inventoryCard('Observatory Seal').getByText('The key to the northern observatory.')).toBeInTheDocument();
    expect(inventoryCard('Observatory Seal').queryByRole('button', { name: 'Equip' })).not.toBeInTheDocument();
    expect(loadRollHistory()).toEqual(historyBeforeReload);
    await user.click(screen.getByRole('link', { name: 'Character Sheet' }));
    const reloadedHistory = within(screen.getByRole('region', { name: 'Roll History' }));
    // The compact panel shows the latest five of the six persisted results.
    expect(reloadedHistory.getByText('Moonlit Scimitar Damage + Sneak Attack', { exact: true })).toBeInTheDocument();
    expect(reloadedHistory.getByText('Glass Needle Damage + Sneak Attack', { exact: true })).toBeInTheDocument();
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBeNull();
    expect(project.requests.filter((request) => request === `PUT ${PROJECT_CONTENT_ENDPOINT}`)).toHaveLength(4);
    expect(project.requests.filter((request) => request === `PUT ${PROJECT_CHARACTERS_ENDPOINT}`)).toHaveLength(8);
    reload.unmount();
    const event = getDiceVisualEventSnapshot();
    if (event) act(() => clearDiceVisualEvent(event.id));
  }, 30_000);
});
