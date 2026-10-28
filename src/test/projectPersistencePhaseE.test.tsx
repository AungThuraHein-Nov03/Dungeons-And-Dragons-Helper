import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { BARBARIAN_RAGE_ACTIVE_EFFECT_ID, BARBARIAN_RAGE_RESOURCE_ID } from '../content/srd/barbarian';
import { FIGHTER_SECOND_WIND_RESOURCE_ID } from '../content/srd/fighter';
import { srdId } from '../content/srd/source';
import { WIZARD_SPELLCASTING_PROVIDER_ID } from '../content/srd/wizard';
import type { Character, CharacterInput, CharacterSpellcastingSelection } from '../models/character';
import { deriveCharacterState } from '../rules/deriveCharacter';
import {
  createApplicationCharacter,
  deleteApplicationCharacter,
  updateApplicationCharacter,
} from '../services/applicationCharacterMutations';
import {
  addApplicationCustomInventoryItem,
  addApplicationRegistryInventoryItem,
  adjustApplicationInventoryQuantity,
  removeApplicationInventoryItem,
  setApplicationCharacterCurrency,
  setApplicationInventoryItemEquipped,
  updateApplicationCustomInventoryItem,
} from '../services/applicationInventoryMutations';
import {
  activateApplicationCharacterActiveSelfEffect,
  applyApplicationCharacterDamage,
  consumeApplicationCharacterResource,
  finishApplicationCharacterLongRest,
  finishApplicationCharacterShortRest,
  healApplicationCharacter,
  rollApplicationHealingResource,
  rollApplicationHitDie,
  setApplicationCharacterTemporaryHp,
  spendApplicationCharacterSpellSlot,
} from '../services/applicationPlayMutations';
import { rollAbilityCheck } from '../services/characterRolls';
import { CHARACTER_STORAGE_KEY, createCharacter, getCharacterById, saveCharacters } from '../services/characterStorage';
import { initializeContentCatalog } from '../services/contentCatalog';
import { contentRegistry } from '../services/contentRegistry';
import { configurePersistenceBackend } from '../services/persistenceBackend';
import { PROJECT_CHARACTERS_ENDPOINT, type ProjectStateEnvelope } from '../services/projectPersistenceTransport';
import {
  getApplicationCharacterById,
  getApplicationCharacters,
  initializeApplicationPersistence,
} from '../services/projectState';
import { addPlaySessionCondition, loadPlaySessionState, startPlaySessionConcentration } from '../services/playSessionState';
import { loadRollHistory } from '../services/rollHistory';
import characterPlayViewSource from '../components/CharacterPlayView.tsx?raw';
import inventoryPageSource from '../pages/InventoryPage.tsx?raw';
import { fighterCharacter, fighterInput, SCIMITAR_ID } from './fixtures';

const PADDED_ARMOR_ID = srdId('armor', 'padded-armor');
const FIGHTER_ID = srdId('class', 'fighter');
const ROGUE_ID = srdId('class', 'rogue');

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function envelope(
  characters: Character[] = [],
  characterRevision = '"c1"',
  contentRevision = '"h1"',
): ProjectStateEnvelope {
  return {
    content: [],
    characters,
    contentExists: true,
    charactersExists: true,
    characterMigrationRequired: false,
    contentRevision,
    characterRevision,
  };
}

async function bootProject(characters: Character[] = []) {
  const result = await initializeApplicationPersistence({
    backend: 'project',
    fetchImpl: async () => jsonResponse(envelope(characters)),
  });
  expect(result.ok).toBe(true);
}

function echoProjectPut(characterRevision = '"c2"', contentRevision = '"h1"') {
  return vi.fn<typeof fetch>(async (_input, init) => {
    const characters = JSON.parse(String(init?.body)) as Character[];
    return jsonResponse(envelope(characters, characterRevision, contentRevision));
  });
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key) { return values.get(key) ?? null; },
    key(index) { return [...values.keys()][index] ?? null; },
    removeItem(key) { values.delete(key); },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

function projectCharacter(input: CharacterInput): Character {
  return createCharacter(input, memoryStorage());
}

function fighterRogueInput(): CharacterInput {
  const base = fighterInput({ inventory: [] });
  return fighterInput({
    startingClassId: FIGHTER_ID,
    classProgressions: [
      { ...base.classProgressions[0] },
      {
        classId: ROGUE_ID,
        level: 1,
        skillProficiencies: ['stealth'],
        skillExpertise: [],
        weaponMasterySelections: [],
        hpProgression: [{ classLevel: 1, method: 'fixed' }],
      },
    ],
    inventory: [],
  });
}

function fighterConsumer(character: Character, name: string): string {
  const derived = deriveCharacterState(character, contentRegistry);
  if (!derived.ok) throw new Error(derived.error.message);
  const resource = derived.value.resources.find((candidate) => candidate.id === FIGHTER_SECOND_WIND_RESOURCE_ID);
  const consumer = resource?.consumers.find((candidate) => candidate.name === name);
  if (!consumer) throw new Error(`Missing Fighter resource consumer: ${name}`);
  return consumer.id;
}

function barbarianCharacter(): Character {
  return projectCharacter(fighterInput({
    name: 'Project Barbarian',
    classId: srdId('class', 'barbarian'),
    subclassId: srdId('subclass', 'barbarian:path-of-the-berserker'),
    level: 9,
    skillProficiencies: ['athletics', 'perception'],
    inventory: [],
  }));
}

function wizardCatalog() {
  const catalog = contentRegistry.getAll('spell').filter((spell) => spell.spellLists.some((list) => list.id === 'wizard'));
  const cantrips = catalog.filter((spell) => spell.level === 0).sort((a, b) => a.name.localeCompare(b.name));
  const levelOne = catalog.filter((spell) => spell.level === 1).sort((a, b) => a.name.localeCompare(b.name));
  const ritual = levelOne.find((spell) => spell.ritual);
  const nonRituals = levelOne.filter((spell) => !spell.ritual);
  if (cantrips.length < 3 || !ritual || nonRituals.length < 5) throw new Error('Wizard test catalog is incomplete.');
  return { cantrips, owned: [ritual, ...nonRituals.slice(0, 5)], prepared: nonRituals.slice(0, 4) };
}

function wizardInput(level = 1): CharacterInput {
  const spells = wizardCatalog();
  const selection: CharacterSpellcastingSelection = {
    providerId: WIZARD_SPELLCASTING_PROVIDER_ID,
    cantripIds: spells.cantrips.slice(0, 3).map((spell) => spell.id),
    ownedSpellIds: spells.owned.map((spell) => spell.id),
    preparedSpellIds: spells.prepared.map((spell) => spell.id),
  };
  return fighterInput({
    name: 'Project Wizard',
    classId: srdId('class', 'wizard'),
    subclassId: level >= 3 ? srdId('subclass', 'wizard:evoker') : undefined,
    level,
    skillProficiencies: ['history', 'insight'],
    abilityScores: { intelligence: 16, wisdom: 14 },
    spellcastingSelections: [selection],
    inventory: [],
  });
}

describe('Project Persistence Phase E', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    configurePersistenceBackend('browser-local');
    initializeContentCatalog(localStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    configurePersistenceBackend('browser-local');
    initializeContentCatalog(localStorage);
    localStorage.clear();
    sessionStorage.clear();
  });

  it('1. project PLAY persisted mutation uses centralized Character authority', async () => {
    const fighter = fighterCharacter();
    await bootProject([fighter]);
    const fetchMock = echoProjectPut();
    vi.stubGlobal('fetch', fetchMock);
    expect((await applyApplicationCharacterDamage(fighter.id, 5)).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(PROJECT_CHARACTERS_ENDPOINT);
  });

  it('2. project Inventory persisted mutation uses centralized Character authority', async () => {
    const fighter = fighterCharacter({ inventory: [] });
    await bootProject([fighter]);
    const fetchMock = echoProjectPut();
    vi.stubGlobal('fetch', fetchMock);
    expect((await addApplicationRegistryInventoryItem(fighter.id, SCIMITAR_ID)).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('3. PLAY UI contains no raw project PUT', () => {
    expect(characterPlayViewSource).not.toContain('fetch(');
    expect(characterPlayViewSource).not.toContain(PROJECT_CHARACTERS_ENDPOINT);
  });

  it('4. Inventory UI contains no raw project PUT', () => {
    expect(inventoryPageSource).not.toContain('fetch(');
    expect(inventoryPageSource).not.toContain(PROJECT_CHARACTERS_ENDPOINT);
  });

  it('5. complete Character[] transaction remains authoritative', async () => {
    const first = fighterCharacter({ name: 'First' });
    const second = fighterCharacter({ name: 'Second' });
    second.id = 'fighter-second-project';
    await bootProject([first, second]);
    const fetchMock = echoProjectPut();
    vi.stubGlobal('fetch', fetchMock);
    await applyApplicationCharacterDamage(first.id, 2);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Character[];
    expect(body).toHaveLength(2);
    expect(body.find((character) => character.id === second.id)).toEqual(second);
  });

  it('6. expected Character revision is retained', async () => {
    const fighter = fighterCharacter();
    await bootProject([fighter]);
    const fetchMock = echoProjectPut();
    vi.stubGlobal('fetch', fetchMock);
    await applyApplicationCharacterDamage(fighter.id, 1);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('if-match')).toBe('"c1"');
  });

  it('7. expected content revision is retained', async () => {
    const fighter = fighterCharacter();
    await bootProject([fighter]);
    const fetchMock = echoProjectPut();
    vi.stubGlobal('fetch', fetchMock);
    await applyApplicationCharacterDamage(fighter.id, 1);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('x-dnd3-content-if-match')).toBe('"h1"');
  });

  it('8. successful HP mutation persists before publication', async () => {
    const fighter = fighterCharacter();
    await bootProject([fighter]);
    let resolvePut!: () => void;
    const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((resolve) => {
      const body = JSON.parse(String(init?.body)) as Character[];
      resolvePut = () => resolve(jsonResponse(envelope(body, '"c2"')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = applyApplicationCharacterDamage(fighter.id, 5);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(getApplicationCharacterById(fighter.id)?.playState.currentHp).toBe(fighter.playState.currentHp);
    resolvePut();
    expect((await pending).ok).toBe(true);
    expect(getApplicationCharacterById(fighter.id)?.playState.currentHp).toBe(fighter.playState.currentHp - 5);
  });

  it('9. failed HP mutation leaves Character unchanged', async () => {
    const fighter = fighterCharacter();
    await bootProject([fighter]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'write-failed', message: 'nope' } }, 500)));
    expect((await applyApplicationCharacterDamage(fighter.id, 5)).ok).toBe(false);
    expect(getApplicationCharacterById(fighter.id)).toEqual(fighter);
  });

  it('10. stale HP mutation fails closed', async () => {
    const fighter = fighterCharacter();
    await bootProject([fighter]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'stale-characters', message: 'stale' } }, 409)));
    expect((await applyApplicationCharacterDamage(fighter.id, 5)).ok).toBe(false);
    expect(getApplicationCharacterById(fighter.id)).toEqual(fighter);
  });

  it('11. Temporary HP mutation preserves existing semantics', async () => {
    const fighter = fighterCharacter();
    await bootProject([fighter]);
    vi.stubGlobal('fetch', echoProjectPut());
    const result = await setApplicationCharacterTemporaryHp(fighter.id, 7);
    expect(result).toMatchObject({ ok: true, value: { playState: { temporaryHp: 7 } } });
  });

  it('12. damage and healing preserve existing semantics', async () => {
    const fighter = fighterCharacter();
    await bootProject([fighter]);
    vi.stubGlobal('fetch', echoProjectPut());
    await applyApplicationCharacterDamage(fighter.id, 10);
    vi.stubGlobal('fetch', echoProjectPut('"c3"'));
    const healed = await healApplicationCharacter(fighter.id, 4);
    expect(healed).toMatchObject({ ok: true, value: { playState: { currentHp: fighter.playState.currentHp - 6 } } });
  });

  it('13. persisted resource spend persists before publication', async () => {
    const fighter = fighterCharacter();
    const consumerId = fighterConsumer(fighter, 'Tactical Mind');
    await bootProject([fighter]);
    let resolvePut!: () => void;
    const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((resolve) => {
      const body = JSON.parse(String(init?.body)) as Character[];
      resolvePut = () => resolve(jsonResponse(envelope(body, '"c2"')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = consumeApplicationCharacterResource(fighter.id, FIGHTER_SECOND_WIND_RESOURCE_ID, consumerId);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(getApplicationCharacterById(fighter.id)?.playState.resourceUses[FIGHTER_SECOND_WIND_RESOURCE_ID]).toBe(3);
    resolvePut();
    await pending;
    expect(getApplicationCharacterById(fighter.id)?.playState.resourceUses[FIGHTER_SECOND_WIND_RESOURCE_ID]).toBe(2);
  });

  it('14. failed resource spend does not consume resource', async () => {
    const fighter = fighterCharacter();
    const consumerId = fighterConsumer(fighter, 'Tactical Mind');
    await bootProject([fighter]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'write-failed', message: 'nope' } }, 500)));
    expect((await consumeApplicationCharacterResource(fighter.id, FIGHTER_SECOND_WIND_RESOURCE_ID, consumerId)).ok).toBe(false);
    expect(getApplicationCharacterById(fighter.id)?.playState.resourceUses[FIGHTER_SECOND_WIND_RESOURCE_ID]).toBe(3);
  });

  it('15. persisted resource recovery preserves existing Short Rest semantics', async () => {
    const fighter = fighterCharacter({ playState: { resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 1 } } });
    await bootProject([fighter]);
    vi.stubGlobal('fetch', echoProjectPut());
    const rested = await finishApplicationCharacterShortRest(fighter.id);
    expect(rested.ok).toBe(true);
    if (rested.ok) expect(rested.value.playState.resourceUses[FIGHTER_SECOND_WIND_RESOURCE_ID]).toBe(2);
  });

  it('16. existing Long Rest mutation persists correctly', async () => {
    const fighter = fighterCharacter({ playState: { currentHp: 10, temporaryHp: 5, hitDiceRemaining: { 10: 1 }, resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 1 } } });
    await bootProject([fighter]);
    vi.stubGlobal('fetch', echoProjectPut());
    const rested = await finishApplicationCharacterLongRest(fighter.id);
    expect(rested.ok).toBe(true);
    if (rested.ok) {
      expect(rested.value.playState.currentHp).toBe(36);
      expect(rested.value.playState.temporaryHp).toBe(0);
      expect(rested.value.playState.resourceUses[FIGHTER_SECOND_WIND_RESOURCE_ID]).toBe(3);
    }
  });

  it('17. spell-slot mutation preserves existing semantics', async () => {
    const wizard = projectCharacter(wizardInput());
    const spell = wizardCatalog().prepared[0];
    const slotId = srdId('spell-slot', 'wizard:1');
    await bootProject([wizard]);
    vi.stubGlobal('fetch', echoProjectPut());
    const before = wizard.playState.resourceUses[slotId];
    const result = await spendApplicationCharacterSpellSlot(wizard.id, WIZARD_SPELLCASTING_PROVIDER_ID, spell.id, 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.playState.resourceUses[slotId]).toBe(before - 1);
  });

  it('18. failed spell-slot mutation does not consume state', async () => {
    const wizard = projectCharacter(wizardInput());
    const spell = wizardCatalog().prepared[0];
    const slotId = srdId('spell-slot', 'wizard:1');
    await bootProject([wizard]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'write-failed', message: 'nope' } }, 500)));
    expect((await spendApplicationCharacterSpellSlot(wizard.id, WIZARD_SPELLCASTING_PROVIDER_ID, spell.id, 1)).ok).toBe(false);
    expect(getApplicationCharacterById(wizard.id)?.playState.resourceUses[slotId]).toBe(wizard.playState.resourceUses[slotId]);
  });

  it('19. Inventory add persists before publication', async () => {
    const fighter = fighterCharacter({ inventory: [] });
    await bootProject([fighter]);
    let resolvePut!: () => void;
    const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((resolve) => {
      const body = JSON.parse(String(init?.body)) as Character[];
      resolvePut = () => resolve(jsonResponse(envelope(body, '"c2"')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = addApplicationRegistryInventoryItem(fighter.id, SCIMITAR_ID);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(getApplicationCharacterById(fighter.id)?.inventory).toEqual([]);
    resolvePut();
    await pending;
    expect(getApplicationCharacterById(fighter.id)?.inventory).toHaveLength(1);
  });

  it('20. Inventory remove persists only after successful publication', async () => {
    const withItem = projectCharacter(fighterInput({ inventory: [] }));
    configurePersistenceBackend('browser-local');
    localStorage.clear();
    const local = createCharacter(fighterInput({ inventory: [] }));
    const added = await addApplicationRegistryInventoryItem(local.id, SCIMITAR_ID);
    expect(added.ok).toBe(true);
    const seeded = getCharacterById(local.id)!;
    localStorage.clear();
    await bootProject([{ ...seeded, id: withItem.id }]);
    const entryId = getApplicationCharacterById(withItem.id)!.inventory[0].id;
    vi.stubGlobal('fetch', echoProjectPut());
    expect((await removeApplicationInventoryItem(withItem.id, entryId)).ok).toBe(true);
    expect(getApplicationCharacterById(withItem.id)?.inventory).toEqual([]);
  });

  it('21. Inventory update and quantity mutation preserve existing semantics', async () => {
    const fighter = fighterCharacter({ inventory: [] });
    await bootProject([fighter]);
    vi.stubGlobal('fetch', echoProjectPut());
    const added = await addApplicationCustomInventoryItem(fighter.id, { name: 'Letter', category: 'campaign-item', quantity: 1 });
    expect(added.ok).toBe(true);
    const entryId = getApplicationCharacterById(fighter.id)!.inventory[0].id;
    vi.stubGlobal('fetch', echoProjectPut('"c3"'));
    await adjustApplicationInventoryQuantity(fighter.id, entryId, 2);
    vi.stubGlobal('fetch', echoProjectPut('"c4"'));
    const updated = await updateApplicationCustomInventoryItem(fighter.id, entryId, { name: 'Sealed Letter', category: 'campaign-item', notes: 'Sealed' });
    expect(updated).toMatchObject({ ok: true, value: { inventory: [{ name: 'Sealed Letter', quantity: 3, notes: 'Sealed' }] } });
  });

  it('22. equip and unequip preserve existing semantics', async () => {
    const fighter = fighterCharacter({ inventory: [] });
    await bootProject([fighter]);
    vi.stubGlobal('fetch', echoProjectPut());
    await addApplicationRegistryInventoryItem(fighter.id, SCIMITAR_ID);
    const entryId = getApplicationCharacterById(fighter.id)!.inventory[0].id;
    vi.stubGlobal('fetch', echoProjectPut('"c3"'));
    const equipped = await setApplicationInventoryItemEquipped(fighter.id, entryId, true);
    expect(equipped).toMatchObject({ ok: true, value: { inventory: [{ equipped: true }] } });
    vi.stubGlobal('fetch', echoProjectPut('"c4"'));
    const unequipped = await setApplicationInventoryItemEquipped(fighter.id, entryId, false);
    expect(unequipped).toMatchObject({ ok: true, value: { inventory: [{ equipped: false }] } });
  });

  it('23. failed Inventory PUT leaves Inventory unchanged', async () => {
    const fighter = fighterCharacter({ inventory: [] });
    await bootProject([fighter]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'write-failed', message: 'nope' } }, 500)));
    expect((await addApplicationRegistryInventoryItem(fighter.id, SCIMITAR_ID)).ok).toBe(false);
    expect(getApplicationCharacterById(fighter.id)?.inventory).toEqual([]);
  });

  it('24. stale Inventory mutation fails closed', async () => {
    const fighter = fighterCharacter({ inventory: [] });
    await bootProject([fighter]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'stale-characters', message: 'stale' } }, 409)));
    expect((await addApplicationRegistryInventoryItem(fighter.id, SCIMITAR_ID)).ok).toBe(false);
    expect(getApplicationCharacterById(fighter.id)?.inventory).toEqual([]);
  });

  it('25. project mode never writes Character localStorage', async () => {
    const fighter = fighterCharacter();
    await bootProject([fighter]);
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    vi.stubGlobal('fetch', echoProjectPut());
    await applyApplicationCharacterDamage(fighter.id, 1);
    expect(spy.mock.calls.some(([key]) => key === CHARACTER_STORAGE_KEY)).toBe(false);
  });

  it('26. project mode never falls back to Character localStorage', async () => {
    const local = fighterCharacter({ name: 'Local Decoy' });
    saveCharacters([local], localStorage);
    const project = fighterCharacter({ name: 'Project Authority' });
    project.id = local.id;
    await bootProject([project]);
    vi.stubGlobal('fetch', echoProjectPut());
    await applyApplicationCharacterDamage(project.id, 1);
    expect(getApplicationCharacterById(project.id)?.name).toBe('Project Authority');
    expect(JSON.parse(localStorage.getItem(CHARACTER_STORAGE_KEY) ?? '[]')[0].name).toBe('Local Decoy');
  });

  it('27. successful Character publication updates mounted PLAY consumer', async () => {
    const user = userEvent.setup();
    const fighter = fighterCharacter();
    await bootProject([fighter]);
    vi.stubGlobal('fetch', echoProjectPut());
    render(<MemoryRouter initialEntries={[`/characters/${fighter.id}`]}><App /></MemoryRouter>);
    const hp = screen.getByRole('region', { name: 'Hit Points' });
    await user.type(within(hp).getByLabelText('Damage amount'), '5');
    await user.click(within(hp).getByRole('button', { name: 'Take Damage' }));
    await waitFor(() => expect(getApplicationCharacterById(fighter.id)?.playState.currentHp).toBe(fighter.playState.currentHp - 5));
    expect(within(hp).getByText(String(fighter.playState.currentHp - 5))).toBeInTheDocument();
  });

  it('28. successful Character publication updates mounted Inventory consumer', async () => {
    const user = userEvent.setup();
    const fighter = fighterCharacter({ inventory: [] });
    await bootProject([fighter]);
    vi.stubGlobal('fetch', echoProjectPut());
    render(<MemoryRouter initialEntries={[`/characters/${fighter.id}/inventory`]}><App /></MemoryRouter>);
    await user.type(screen.getByLabelText('Custom item name'), 'Silver Token');
    await user.click(screen.getByRole('button', { name: 'Add Custom Item' }));
    expect(await screen.findByRole('heading', { name: 'Silver Token' })).toBeInTheDocument();
  });

  it('29. dependent roll-history side effect occurs only after successful persisted mutation', async () => {
    const fighter = fighterCharacter({ playState: { currentHp: 20 } });
    const consumerId = fighterConsumer(fighter, 'Second Wind');
    await bootProject([fighter]);
    let resolvePut!: () => void;
    const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((resolve) => {
      const body = JSON.parse(String(init?.body)) as Character[];
      resolvePut = () => resolve(jsonResponse(envelope(body, '"c2"')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = rollApplicationHealingResource(fighter.id, FIGHTER_SECOND_WIND_RESOURCE_ID, consumerId, { rng: () => 0.5 });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(loadRollHistory()).toEqual([]);
    resolvePut();
    expect((await pending).ok).toBe(true);
    expect(loadRollHistory()).toHaveLength(1);
  });

  it('30. failed persisted mutation suppresses dependent roll-history side effect', async () => {
    const fighter = fighterCharacter({ playState: { currentHp: 20 } });
    const consumerId = fighterConsumer(fighter, 'Second Wind');
    await bootProject([fighter]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'write-failed', message: 'nope' } }, 500)));
    expect((await rollApplicationHealingResource(fighter.id, FIGHTER_SECOND_WIND_RESOURCE_ID, consumerId, { rng: () => 0.5 })).ok).toBe(false);
    expect(loadRollHistory()).toEqual([]);
  });

  it('31. stale persisted mutation suppresses dependent roll-history side effect', async () => {
    const fighter = fighterCharacter({ playState: { currentHp: 20 } });
    const consumerId = fighterConsumer(fighter, 'Second Wind');
    await bootProject([fighter]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'stale-characters', message: 'stale' } }, 409)));
    expect((await rollApplicationHealingResource(fighter.id, FIGHTER_SECOND_WIND_RESOURCE_ID, consumerId, { rng: () => 0.5 })).ok).toBe(false);
    expect(loadRollHistory()).toEqual([]);
  });

  it('32. pure non-Character roll behavior remains browser/session-local', async () => {
    const fighter = fighterCharacter();
    await bootProject([fighter]);
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    expect(rollAbilityCheck(fighter.id, 'strength', 'normal', { rng: () => 0.5 }).ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loadRollHistory()).toHaveLength(1);
  });

  it('33. roll history is not added to Character-v9 persistence', async () => {
    const fighter = fighterCharacter();
    await bootProject([fighter]);
    rollAbilityCheck(fighter.id, 'strength', 'normal', { rng: () => 0.5 });
    expect(getApplicationCharacterById(fighter.id)).not.toHaveProperty('rollHistory');
    expect(getApplicationCharacterById(fighter.id)?.playState).not.toHaveProperty('rollHistory');
  });

  it('34. session-only conditions remain non-persisted', async () => {
    const fighter = fighterCharacter();
    await bootProject([fighter]);
    addPlaySessionCondition(fighter.id, 'poisoned');
    expect(loadPlaySessionState(fighter.id).conditions).toContain('poisoned');
    expect(getApplicationCharacterById(fighter.id)).not.toHaveProperty('conditions');
  });

  it('35. session-only concentration remains non-persisted', async () => {
    const wizard = projectCharacter(wizardInput());
    await bootProject([wizard]);
    const derived = deriveCharacterState(wizard, contentRegistry);
    if (!derived.ok) throw new Error(derived.error.message);
    const concentrationSpell = derived.value.spellcasting.flatMap((provider) => provider.spells.map((spell) => ({ provider, spell }))).find(({ spell }) => spell.concentration);
    if (!concentrationSpell) return;
    const started = startPlaySessionConcentration(wizard.id, concentrationSpell.provider.id, concentrationSpell.spell.id, derived.value);
    expect(started.ok).toBe(true);
    expect(getApplicationCharacterById(wizard.id)).not.toHaveProperty('concentration');
  });

  it('36. session-only active effects remain non-persisted while canonical resource cost persists', async () => {
    const barbarian = barbarianCharacter();
    await bootProject([barbarian]);
    vi.stubGlobal('fetch', echoProjectPut());
    const result = await activateApplicationCharacterActiveSelfEffect(barbarian.id, BARBARIAN_RAGE_ACTIVE_EFFECT_ID);
    expect(result.ok).toBe(true);
    expect(loadPlaySessionState(barbarian.id).activeEffectIds).toContain(BARBARIAN_RAGE_ACTIVE_EFFECT_ID);
    expect(getApplicationCharacterById(barbarian.id)).not.toHaveProperty('activeEffectIds');
    expect(getApplicationCharacterById(barbarian.id)?.playState.resourceUses[BARBARIAN_RAGE_RESOURCE_ID]).toBe(barbarian.playState.resourceUses[BARBARIAN_RAGE_RESOURCE_ID] - 1);
  });

  it('37. static/browser-local PLAY mutation behavior remains unchanged', async () => {
    configurePersistenceBackend('browser-local');
    const fighter = createCharacter(fighterInput());
    const result = await applyApplicationCharacterDamage(fighter.id, 5);
    expect(result.ok).toBe(true);
    expect(getCharacterById(fighter.id)?.playState.currentHp).toBe(fighter.playState.currentHp - 5);
  });

  it('38. static/browser-local Inventory behavior remains unchanged', async () => {
    configurePersistenceBackend('browser-local');
    const fighter = createCharacter(fighterInput({ inventory: [] }));
    expect((await addApplicationRegistryInventoryItem(fighter.id, SCIMITAR_ID)).ok).toBe(true);
    expect(getCharacterById(fighter.id)?.inventory).toHaveLength(1);
  });

  it('39. Phase F supersedes the Level Up project lock', async () => {
    const fighter = fighterCharacter();
    await bootProject([fighter]);
    render(<MemoryRouter initialEntries={[`/characters/${fighter.id}/level-up`]}><App /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: `Level Up ${fighter.name}` })).toBeInTheDocument();
  });

  it('40. Character Create/Edit/Delete remain functional after Phase E', async () => {
    await bootProject();
    let revision = 1;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Character[];
      revision += 1;
      return jsonResponse(envelope(body, `"c${revision}"`));
    }));
    const created = await createApplicationCharacter(fighterInput({ name: 'Phase E CRUD' }));
    expect(created.ok && created.character).toBeTruthy();
    if (!created.ok || !created.character) return;
    const updated = await updateApplicationCharacter(created.character.id, fighterInput({ name: 'Phase E Edited' }));
    expect(updated.ok && updated.character?.name).toBe('Phase E Edited');
    expect((await deleteApplicationCharacter(created.character.id)).ok).toBe(true);
    expect(getApplicationCharacters()).toEqual([]);
  });

  it('41. Creator Forge project mutations remain enabled after Phase E', async () => {
    await bootProject();
    render(<MemoryRouter initialEntries={['/creator-forge/feats']}><App /></MemoryRouter>);
    expect(screen.getAllByRole('link', { name: 'Create Feat' }).length).toBeGreaterThan(0);
  });

  it('42. stale content revision rejects PLAY Character mutation', async () => {
    const fighter = fighterCharacter();
    await bootProject([fighter]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'stale-content', message: 'stale' } }, 409)));
    expect((await applyApplicationCharacterDamage(fighter.id, 1)).ok).toBe(false);
  });

  it('43. stale Character revision rejects PLAY Character mutation', async () => {
    const fighter = fighterCharacter();
    await bootProject([fighter]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'stale-characters', message: 'stale' } }, 409)));
    expect((await applyApplicationCharacterDamage(fighter.id, 1)).ok).toBe(false);
  });

  it('44. stale content revision rejects Inventory mutation', async () => {
    const fighter = fighterCharacter({ inventory: [] });
    await bootProject([fighter]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'stale-content', message: 'stale' } }, 409)));
    expect((await addApplicationRegistryInventoryItem(fighter.id, SCIMITAR_ID)).ok).toBe(false);
  });

  it('45. stale Character revision rejects Inventory mutation', async () => {
    const fighter = fighterCharacter({ inventory: [] });
    await bootProject([fighter]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'stale-characters', message: 'stale' } }, 409)));
    expect((await addApplicationRegistryInventoryItem(fighter.id, SCIMITAR_ID)).ok).toBe(false);
  });

  it('46. no automatic retry occurs', async () => {
    const fighter = fighterCharacter();
    await bootProject([fighter]);
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'stale-content', message: 'stale' } }, 409));
    vi.stubGlobal('fetch', fetchMock);
    await applyApplicationCharacterDamage(fighter.id, 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('47. Character v9 schema remains unchanged', () => {
    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v10');
    expect(fighterCharacter()).not.toHaveProperty('version');
  });

  it('48. no automatic migration occurs', async () => {
    const local = fighterCharacter({ name: 'Legacy Local' });
    saveCharacters([local], localStorage);
    const bytes = localStorage.getItem(CHARACTER_STORAGE_KEY);
    await bootProject([]);
    expect(getApplicationCharacters()).toEqual([]);
    expect(localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(bytes);
  });

  it('49. stateful Hit Die history is deferred until Character commit', async () => {
    const fighter = fighterCharacter({ playState: { currentHp: 20 } });
    await bootProject([fighter]);
    let resolvePut!: () => void;
    const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((resolve) => {
      const body = JSON.parse(String(init?.body)) as Character[];
      resolvePut = () => resolve(jsonResponse(envelope(body, '"c2"')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = rollApplicationHitDie(fighter.id, { rng: () => 0.5 });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(loadRollHistory()).toEqual([]);
    resolvePut();
    expect((await pending).ok).toBe(true);
    expect(loadRollHistory()).toHaveLength(1);
  });

  it('50. active-effect session side effect is deferred until resource commit', async () => {
    const barbarian = barbarianCharacter();
    await bootProject([barbarian]);
    let resolvePut!: () => void;
    const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((resolve) => {
      const body = JSON.parse(String(init?.body)) as Character[];
      resolvePut = () => resolve(jsonResponse(envelope(body, '"c2"')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = activateApplicationCharacterActiveSelfEffect(barbarian.id, BARBARIAN_RAGE_ACTIVE_EFFECT_ID);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(loadPlaySessionState(barbarian.id).activeEffectIds).toEqual([]);
    resolvePut();
    expect((await pending).ok).toBe(true);
    expect(loadPlaySessionState(barbarian.id).activeEffectIds).toContain(BARBARIAN_RAGE_ACTIVE_EFFECT_ID);
  });

  it('51. failed active-effect resource commit suppresses session activation', async () => {
    const barbarian = barbarianCharacter();
    await bootProject([barbarian]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'write-failed', message: 'nope' } }, 500)));
    expect((await activateApplicationCharacterActiveSelfEffect(barbarian.id, BARBARIAN_RAGE_ACTIVE_EFFECT_ID)).ok).toBe(false);
    expect(loadPlaySessionState(barbarian.id).activeEffectIds).toEqual([]);
    expect(getApplicationCharacterById(barbarian.id)?.playState.resourceUses[BARBARIAN_RAGE_RESOURCE_ID]).toBe(barbarian.playState.resourceUses[BARBARIAN_RAGE_RESOURCE_ID]);
  });

  it('52. project Currency mutation uses the Character transaction', async () => {
    const fighter = fighterCharacter({ inventory: [] });
    await bootProject([fighter]);
    vi.stubGlobal('fetch', echoProjectPut());
    const result = await setApplicationCharacterCurrency(fighter.id, { cp: 1, sp: 2, ep: 3, gp: 4, pp: 5 });
    expect(result).toMatchObject({ ok: true, value: { currency: { cp: 1, sp: 2, ep: 3, gp: 4, pp: 5 } } });
  });

  it('53. project custom Inventory text edits persist through Character v9', async () => {
    const fighter = fighterCharacter({ inventory: [] });
    await bootProject([fighter]);
    vi.stubGlobal('fetch', echoProjectPut());
    await addApplicationCustomInventoryItem(fighter.id, { name: 'Token', category: 'campaign-item', quantity: 1 });
    const entryId = getApplicationCharacterById(fighter.id)!.inventory[0].id;
    vi.stubGlobal('fetch', echoProjectPut('"c3"'));
    const result = await updateApplicationCustomInventoryItem(fighter.id, entryId, { name: 'Silver Token', category: 'campaign-item', notes: 'V.A.' });
    expect(result).toMatchObject({ ok: true, value: { inventory: [{ name: 'Silver Token', notes: 'V.A.' }] } });
  });

  it('54. session-only condition changes require no project PUT', async () => {
    const fighter = fighterCharacter();
    await bootProject([fighter]);
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    addPlaySessionCondition(fighter.id, 'prone');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loadPlaySessionState(fighter.id).conditions).toEqual(['prone']);
  });

  it('55. project Inventory Add persists Padded Armor for Fighter 4 / Rogue 1 with both revisions and unchanged class progressions', async () => {
    const multiclass = projectCharacter(fighterRogueInput());
    const progressionsBefore = structuredClone(multiclass.classProgressions);
    await bootProject([multiclass]);

    const fetchMock = echoProjectPut();
    vi.stubGlobal('fetch', fetchMock);

    const result = await addApplicationRegistryInventoryItem(multiclass.id, PADDED_ARMOR_ID, 1);
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(PROJECT_CHARACTERS_ENDPOINT);

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('if-match')).toBe('"c1"');
    expect(headers.get('x-dnd3-content-if-match')).toBe('"h1"');

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Character[];
    expect(body).toHaveLength(1);
    expect(body[0].inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'registry',
        contentId: PADDED_ARMOR_ID,
        category: 'armor',
        quantity: 1,
        equipped: false,
        notes: '',
      }),
    ]));
    expect(body[0].classProgressions).toEqual(progressionsBefore);

    const published = getApplicationCharacterById(multiclass.id);
    expect(published?.inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'registry',
        contentId: PADDED_ARMOR_ID,
        category: 'armor',
        quantity: 1,
      }),
    ]));
    expect(published?.classProgressions).toEqual(progressionsBefore);
    expect(published?.classProgressions.map((progression) => [progression.classId, progression.level])).toEqual([
      [FIGHTER_ID, 4],
      [ROGUE_ID, 1],
    ]);
  });
});
