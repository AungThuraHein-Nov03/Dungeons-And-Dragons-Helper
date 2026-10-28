import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { FIGHTER_ACTION_SURGE_RESOURCE_ID, FIGHTER_SECOND_WIND_RESOURCE_ID } from '../content/srd/fighter';
import { srdId } from '../content/srd/source';
import type { Character, CharacterClassProgression, CharacterInput, CharacterSpellcastingSelection } from '../models/character';
import type { SpellcastingProviderDefinition } from '../models/content';
import type { ContentId } from '../models/contentId';
import { classProgressionSkillChoiceContext } from '../rules/classProficiencies';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { createFixedHpProgression } from '../rules/health';
import {
  createLevelUpDraft,
  getLevelUpAdvancementChoiceContext,
  getLevelUpCoreChoiceContext,
  getLevelUpSpellcastingChoiceContext,
  withFixedLevelUpHitPoints,
  withLevelUpAddedClassSkills,
  withLevelUpFeatChoiceValue,
  withLevelUpFeatPath,
  withLevelUpSpellcastingCantrip,
  withLevelUpSubclass,
  withLevelUpTarget,
  type LevelUpDraft,
} from '../rules/levelUp';
import {
  maximumSelectableSpellLevel,
  spellBelongsToProviderList,
  spellcastingCountAtLevel,
  spellcastingProviderDefinitionsAtLevel,
} from '../rules/spellcasting';
import { confirmApplicationLevelUp } from '../services/applicationLevelUpPersistence';
import { createApplicationCharacter, updateApplicationCharacter } from '../services/applicationCharacterMutations';
import { addApplicationRegistryInventoryItem } from '../services/applicationInventoryMutations';
import { applyApplicationCharacterDamage } from '../services/applicationPlayMutations';
import { getCharacterCatalogGeneration, subscribeCharacterCatalog } from '../services/characterCatalog';
import {
  CHARACTER_STORAGE_KEY,
  createCharacter,
  getCharacterById,
} from '../services/characterStorage';
import { initializeContentCatalog } from '../services/contentCatalog';
import { contentRegistry } from '../services/contentRegistry';
import { configurePersistenceBackend } from '../services/persistenceBackend';
import { PROJECT_CHARACTERS_ENDPOINT, type ProjectStateEnvelope } from '../services/projectPersistenceTransport';
import {
  getApplicationCharacterById,
  getApplicationCharacters,
  getApplicationProjectState,
  initializeApplicationPersistence,
} from '../services/projectState';
import { loadPlaySessionState, savePlaySessionState } from '../services/playSessionState';
import { SCIMITAR_ID, completeLevelUpV10Choices, fighterInput } from './fixtures';
import levelUpPageSource from '../pages/LevelUpPage.tsx?raw';

const FIGHTER_ID = srdId('class', 'fighter');
const ROGUE_ID = srdId('class', 'rogue');
const WIZARD_ID = srdId('class', 'wizard');
const CHAMPION_ID = srdId('subclass', 'fighter:champion');
const EVOKER_ID = srdId('subclass', 'wizard:evoker');
const ASI_ID = srdId('feat', 'ability-score-improvement');
const WIZARD_PROVIDER_ID = srdId('spellcasting-provider', 'wizard:spellcasting');

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

function progression(classId: ContentId, level: number, starting: boolean, subclassId?: ContentId): CharacterClassProgression {
  const classContent = contentRegistry.findClass(classId);
  if (!classContent) throw new Error('Missing class ' + classId);
  const skills = classProgressionSkillChoiceContext(classContent, starting);
  return {
    classId,
    level,
    ...(subclassId ? { subclassId } : {}),
    skillProficiencies: [...skills.from.slice(0, skills.choose)],
    skillExpertise: [],
    weaponMasterySelections: [],
    hpProgression: createFixedHpProgression(level, starting),
  };
}

function providerDefinition(
  classId: ContentId,
  ownerLevel: number,
  providerId: ContentId,
  subclassId?: ContentId,
): SpellcastingProviderDefinition {
  const classContent = contentRegistry.findClass(classId);
  if (!classContent) throw new Error('Missing class ' + classId);
  const subclass = subclassId ? contentRegistry.findSubclass(subclassId) : undefined;
  const provider = spellcastingProviderDefinitionsAtLevel(classContent, subclass, ownerLevel)
    .find((candidate) => candidate.id === providerId);
  if (!provider) throw new Error('Missing provider ' + providerId);
  return provider;
}

function spellsOnList(spellListId: string, predicate: (level: number) => boolean) {
  return contentRegistry.getAll('spell')
    .filter((spell) => spellBelongsToProviderList(spell, spellListId) && predicate(spell.level))
    .sort((left, right) => left.level - right.level || left.name.localeCompare(right.name));
}

function wizardSelection(ownerLevel: number): CharacterSpellcastingSelection {
  const provider = providerDefinition(WIZARD_ID, ownerLevel, WIZARD_PROVIDER_ID, ownerLevel >= 3 ? EVOKER_ID : undefined);
  if (provider.spellManagement.kind !== 'prepared-from-owned') throw new Error('Expected Wizard spell management.');
  const management = provider.spellManagement;
  const cantripIds = spellsOnList(management.spellListId, (level) => level === 0)
    .slice(0, spellcastingCountAtLevel(management.cantripCount, ownerLevel))
    .map((spell) => spell.id);
  const maximum = maximumSelectableSpellLevel(provider, ownerLevel);
  const ownedSpellIds = spellsOnList(
    management.spellListId,
    (level) => level === management.initialOwnedSpellLevel && level <= maximum,
  ).slice(0, management.initialOwnedSpellCount).map((spell) => spell.id);
  return {
    providerId: provider.id,
    cantripIds,
    ownedSpellIds,
    preparedSpellIds: [ownedSpellIds[0]],
  };
}

function wizardInput(level: number): CharacterInput {
  return fighterInput({
    name: 'Phase F Wizard',
    startingClassId: WIZARD_ID,
    classProgressions: [progression(WIZARD_ID, level, true, level >= 3 ? EVOKER_ID : undefined)],
    abilityScores: { intelligence: 14 },
    spellcastingSelections: [wizardSelection(level)],
  });
}

function existingFixedDraft(character: Character, classId: ContentId): LevelUpDraft {
  return completeLevelUpV10Choices(character, withFixedLevelUpHitPoints(
    withLevelUpTarget(createLevelUpDraft(character), { kind: 'existing-class', classId }),
  ));
}

function fighterAsiDraft(character: Character): LevelUpDraft {
  let draft = existingFixedDraft(character, FIGHTER_ID);
  const context = getLevelUpAdvancementChoiceContext(character, draft, contentRegistry);
  if (!context.ok || !context.value.featGrant) throw new Error('Expected Fighter feat grant.');
  draft = withLevelUpFeatPath(draft, context.value.featGrant.id, 'ability-score-improvement', ASI_ID);
  draft = withLevelUpFeatChoiceValue(draft, context.value.featGrant.id, 'ability-increase', 0, 'constitution');
  draft = withLevelUpFeatChoiceValue(draft, context.value.featGrant.id, 'ability-increase', 1, 'constitution');
  return draft;
}

function wizardThreeToFourDraft(character: Character): LevelUpDraft {
  let draft = existingFixedDraft(character, WIZARD_ID);
  const advancement = getLevelUpAdvancementChoiceContext(character, draft, contentRegistry);
  if (!advancement.ok || !advancement.value.featGrant) throw new Error('Expected Wizard feat grant.');
  draft = withLevelUpFeatPath(draft, advancement.value.featGrant.id, 'ability-score-improvement', ASI_ID);
  draft = withLevelUpFeatChoiceValue(draft, advancement.value.featGrant.id, 'ability-increase', 0, 'constitution');
  draft = withLevelUpFeatChoiceValue(draft, advancement.value.featGrant.id, 'ability-increase', 1, 'constitution');
  const spellcasting = getLevelUpSpellcastingChoiceContext(character, draft, contentRegistry);
  if (!spellcasting.ok || spellcasting.value.providers.length !== 1) throw new Error('Expected Wizard spellcasting delta.');
  const provider = spellcasting.value.providers[0];
  return withLevelUpSpellcastingCantrip(draft, provider.providerId, provider.legalCantrips[0].id, true);
}

function totalLevel(character: Character): number {
  return character.classProgressions.reduce((sum, entry) => sum + entry.level, 0);
}

async function openSimpleConfirm(user: ReturnType<typeof userEvent.setup>, character: Character) {
  render(<MemoryRouter initialEntries={[`/characters/${character.id}/level-up`]}><App /></MemoryRouter>);
  await user.click(screen.getByRole('radio', { name: /Fighter/ }));
  await user.click(screen.getByRole('button', { name: 'Next: Core Choices' }));
  await user.click(screen.getByRole('button', { name: /Fixed HP/ }));
  await user.click(screen.getByRole('button', { name: 'Next: Review' }));
  return screen.getByRole('button', { name: 'Confirm Level Up' });
}

describe('Project Persistence Phase F', () => {
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

  it('1. project Level Up uses centralized Character transaction authority', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    const fetchMock = echoProjectPut();
    vi.stubGlobal('fetch', fetchMock);
    expect((await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID))).ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(PROJECT_CHARACTERS_ENDPOINT);
  });

  it('2. LevelUpPage contains no raw project PUT', () => {
    expect(levelUpPageSource).not.toContain('fetch(');
    expect(levelUpPageSource).not.toContain(PROJECT_CHARACTERS_ENDPOINT);
  });

  it('3. complete Character[] remains the persistence unit', async () => {
    const first = projectCharacter(fighterInput({ level: 1, subclassId: undefined, name: 'First' }));
    const second = projectCharacter(fighterInput({ level: 1, subclassId: undefined, name: 'Second' }));
    second.id = 'phase-f-second';
    await bootProject([first, second]);
    const fetchMock = echoProjectPut();
    vi.stubGlobal('fetch', fetchMock);
    await confirmApplicationLevelUp(existingFixedDraft(first, FIGHTER_ID));
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Character[];
    expect(body).toHaveLength(2);
    expect(body.find((candidate) => candidate.id === second.id)).toEqual(second);
  });

  it('4. expected Character revision is sent', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    const fetchMock = echoProjectPut();
    vi.stubGlobal('fetch', fetchMock);
    await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID));
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('if-match')).toBe('"c1"');
  });

  it('5. expected content revision is sent', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    const fetchMock = echoProjectPut();
    vi.stubGlobal('fetch', fetchMock);
    await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID));
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('x-dnd3-content-if-match')).toBe('"h1"');
  });

  it('6. project Level Up uses authoritative project Character snapshot', async () => {
    const project = projectCharacter(fighterInput({ level: 1, subclassId: undefined, name: 'Project' }));
    const local = { ...project, name: 'Local Decoy' };
    localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify([local]));
    await bootProject([project]);
    vi.stubGlobal('fetch', echoProjectPut());
    const result = await confirmApplicationLevelUp(existingFixedDraft(project, FIGHTER_ID));
    expect(result.ok).toBe(true);
    expect(getApplicationCharacterById(project.id)?.name).toBe('Project');
  });

  it('7. existing Level-Up computation semantics are reused', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    vi.stubGlobal('fetch', echoProjectPut());
    const result = await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID));
    expect(result.ok).toBe(true);
    if (result.ok) expect(totalLevel(result.value.character)).toBe(2);
  });

  it('8. existing stale updatedAt guard remains effective', async () => {
    const original = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    const draft = existingFixedDraft(original, FIGHTER_ID);
    const changed = { ...original, name: 'Changed', updatedAt: new Date(Date.parse(original.updatedAt) + 1000).toISOString() };
    await bootProject([changed]);
    const fetchMock = echoProjectPut();
    vi.stubGlobal('fetch', fetchMock);
    const result = await confirmApplicationLevelUp(draft);
    expect(result).toMatchObject({ ok: false, error: { code: 'stale-source' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('9. stale draft rejects before successful project publication', async () => {
    const original = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    const draft = existingFixedDraft(original, FIGHTER_ID);
    const changed = { ...original, updatedAt: new Date(Date.parse(original.updatedAt) + 1000).toISOString() };
    await bootProject([changed]);
    const before = getCharacterCatalogGeneration();
    const result = await confirmApplicationLevelUp(draft);
    expect(result.ok).toBe(false);
    expect(getCharacterCatalogGeneration()).toBe(before);
  });

  it('10. successful Confirm persists before Character catalog publication', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    let resolvePut!: () => void;
    const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((resolve) => {
      const body = JSON.parse(String(init?.body)) as Character[];
      resolvePut = () => resolve(jsonResponse(envelope(body, '"c2"')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(totalLevel(getApplicationCharacterById(character.id)!)).toBe(1);
    resolvePut();
    expect((await pending).ok).toBe(true);
    expect(totalLevel(getApplicationCharacterById(character.id)!)).toBe(2);
  });

  it('11. successful Confirm publishes accepted Character state', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    vi.stubGlobal('fetch', echoProjectPut());
    await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID));
    expect(totalLevel(getApplicationCharacterById(character.id)!)).toBe(2);
  });

  it('12. successful Confirm advances Character revision', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    vi.stubGlobal('fetch', echoProjectPut('"c2"'));
    await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID));
    expect(getApplicationProjectState().characterRevision).toBe('"c2"');
  });

  it('13. content revision handling follows server response contract', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    vi.stubGlobal('fetch', echoProjectPut('"c2"', '"h2"'));
    await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID));
    expect(getApplicationProjectState().contentRevision).toBe('"h2"');
  });

  it('14. failed Character PUT leaves original Character published', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'write-failed', message: 'nope' } }, 500)));
    expect((await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID))).ok).toBe(false);
    expect(getApplicationCharacterById(character.id)).toEqual(character);
  });

  it('15. stale Character revision fails closed', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'stale-characters', message: 'stale' } }, 409)));
    expect((await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID))).ok).toBe(false);
    expect(totalLevel(getApplicationCharacterById(character.id)!)).toBe(1);
  });

  it('16. stale content revision fails closed', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'stale-content', message: 'stale' } }, 409)));
    expect((await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID))).ok).toBe(false);
    expect(totalLevel(getApplicationCharacterById(character.id)!)).toBe(1);
  });

  it('17. stale project mutation is not automatically retried', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'stale-content', message: 'stale' } }, 409));
    vi.stubGlobal('fetch', fetchMock);
    await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('18. network failure fails closed', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => { throw new Error('offline'); }));
    expect((await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID))).ok).toBe(false);
    expect(totalLevel(getApplicationCharacterById(character.id)!)).toBe(1);
  });

  it('19. malformed successful response fails closed', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ nope: true })));
    expect((await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID))).ok).toBe(false);
  });

  it('20. Character validation rejection fails closed', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'invalid-characters', message: 'invalid' } }, 422)));
    expect((await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID))).ok).toBe(false);
  });

  it('21. content compatibility rejection fails closed', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'incompatible-characters', message: 'incompatible' } }, 422)));
    expect((await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID))).ok).toBe(false);
  });

  it('22. failed Confirm does not write Character localStorage', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'write-failed', message: 'nope' } }, 500)));
    await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID));
    expect(spy.mock.calls.some(([key]) => key === CHARACTER_STORAGE_KEY)).toBe(false);
  });

  it('23. failed Confirm does not navigate as success', async () => {
    const user = userEvent.setup();
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'write-failed', message: 'nope' } }, 500)));
    const confirm = await openSimpleConfirm(user, character);
    await user.click(confirm);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: `Level Up ${character.name}` })).toBeInTheDocument();
  });

  it('24. successful project Level Up changes level exactly once', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    vi.stubGlobal('fetch', echoProjectPut());
    await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID));
    expect(totalLevel(getApplicationCharacterById(character.id)!)).toBe(2);
  });

  it('25. duplicate unresolved Confirm is prevented', async () => {
    const user = userEvent.setup();
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    let resolvePut!: () => void;
    const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((resolve) => {
      const body = JSON.parse(String(init?.body)) as Character[];
      resolvePut = () => resolve(jsonResponse(envelope(body, '"c2"')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const confirm = await openSimpleConfirm(user, character);
    await user.click(confirm);
    const pendingButton = await screen.findByRole('button', { name: 'Confirming…' });
    expect(pendingButton).toBeDisabled();
    await user.click(pendingButton);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolvePut();
    await screen.findByRole('heading', { name: character.name });
  });

  it('26. HP increase semantics remain unchanged', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    const before = deriveCharacterState(character, contentRegistry);
    if (!before.ok) throw new Error(before.error.message);
    await bootProject([character]);
    vi.stubGlobal('fetch', echoProjectPut());
    const result = await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = deriveCharacterState(result.value.character, contentRegistry);
    if (!after.ok) throw new Error(after.error.message);
    expect(after.value.health.maximumHp).toBeGreaterThan(before.value.health.maximumHp);
  });

  it('27. multiclass level progression remains unchanged', async () => {
    const character = projectCharacter(fighterInput({ level: 2, subclassId: undefined, abilityScores: { dexterity: 14 } }));
    let draft = withFixedLevelUpHitPoints(withLevelUpTarget(createLevelUpDraft(character), { kind: 'new-class', classId: ROGUE_ID }));
    const core = getLevelUpCoreChoiceContext(character, draft, contentRegistry);
    if (!core.ok) throw new Error(core.error.message);
    draft = withLevelUpAddedClassSkills(draft, [core.value.addedClassSkills.from[0]]);
    draft = completeLevelUpV10Choices(character, draft);
    await bootProject([character]);
    vi.stubGlobal('fetch', echoProjectPut());
    const result = await confirmApplicationLevelUp(draft);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.character.classProgressions.find((entry) => entry.classId === ROGUE_ID)?.level).toBe(1);
  });

  it('28. subclass acquisition semantics remain unchanged', async () => {
    const character = projectCharacter(fighterInput({ level: 2, subclassId: undefined }));
    let draft = existingFixedDraft(character, FIGHTER_ID);
    draft = withLevelUpSubclass(draft, CHAMPION_ID);
    await bootProject([character]);
    vi.stubGlobal('fetch', echoProjectPut());
    const result = await confirmApplicationLevelUp(draft);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.character.classProgressions[0].subclassId).toBe(CHAMPION_ID);
  });

  it('29. ASI semantics remain unchanged', async () => {
    const character = projectCharacter(fighterInput({ level: 3, subclassId: CHAMPION_ID, abilityScores: { constitution: 14 } }));
    await bootProject([character]);
    vi.stubGlobal('fetch', echoProjectPut());
    const result = await confirmApplicationLevelUp(fighterAsiDraft(character));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const derived = deriveCharacterState(result.value.character, contentRegistry);
      if (!derived.ok) throw new Error(derived.error.message);
      expect(derived.value.abilityScores.constitution).toBe(16);
    }
  });

  it('30. spellcasting progression remains unchanged', async () => {
    const character = projectCharacter(wizardInput(3));
    const before = character.spellcastingSelections[0].cantripIds.length;
    await bootProject([character]);
    vi.stubGlobal('fetch', echoProjectPut());
    const result = await confirmApplicationLevelUp(wizardThreeToFourDraft(character));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.character.spellcastingSelections[0].cantripIds).toHaveLength(before + 1);
  });

  it('31. resource progression remains unchanged', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    const withSpent = { ...character, playState: { ...character.playState, resourceUses: { ...character.playState.resourceUses, [FIGHTER_SECOND_WIND_RESOURCE_ID]: 0 } } };
    const draft = existingFixedDraft(withSpent, FIGHTER_ID);
    await bootProject([withSpent]);
    vi.stubGlobal('fetch', echoProjectPut());
    const result = await confirmApplicationLevelUp(draft);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.character.playState.resourceUses[FIGHTER_SECOND_WIND_RESOURCE_ID]).toBe(0);
      expect(result.value.character.playState.resourceUses[FIGHTER_ACTION_SURGE_RESOURCE_ID]).toBe(1);
    }
  });

  it('32. existing Character ID remains unchanged', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    vi.stubGlobal('fetch', echoProjectPut());
    const result = await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID));
    expect(result.ok && result.value.character.id).toBe(character.id);
  });

  it('33. existing createdAt remains unchanged', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    vi.stubGlobal('fetch', echoProjectPut());
    const result = await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID));
    expect(result.ok && result.value.character.createdAt).toBe(character.createdAt);
  });

  it('34. updatedAt behavior remains consistent with existing Level-Up semantics', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    vi.stubGlobal('fetch', echoProjectPut());
    const result = await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.character.updatedAt).not.toBe(character.updatedAt);
  });

  it('35. Character catalog subscribers/generation update after successful Confirm', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    const before = getCharacterCatalogGeneration();
    const listener = vi.fn();
    const unsubscribe = subscribeCharacterCatalog(listener);
    vi.stubGlobal('fetch', echoProjectPut());
    await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID));
    unsubscribe();
    expect(getCharacterCatalogGeneration()).toBeGreaterThan(before);
    expect(listener).toHaveBeenCalled();
  });

  it('36. project read facade immediately exposes leveled Character after success', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    vi.stubGlobal('fetch', echoProjectPut());
    await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID));
    expect(totalLevel(getApplicationCharacterById(character.id)!)).toBe(2);
  });

  it('37. project mode does not fall back to Character localStorage', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify([{ ...character, name: 'Local Decoy' }]));
    const before = localStorage.getItem(CHARACTER_STORAGE_KEY);
    await bootProject([character]);
    vi.stubGlobal('fetch', echoProjectPut());
    await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID));
    expect(localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(before);
  });

  it('38. static/browser-local Level Up remains unchanged', async () => {
    configurePersistenceBackend('browser-local');
    const character = createCharacter(fighterInput({ level: 1, subclassId: undefined }));
    const result = await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID));
    expect(result.ok).toBe(true);
    expect(totalLevel(getCharacterById(character.id)!)).toBe(2);
  });

  it('39. Character Create/Edit remain functional after Phase F', async () => {
    await bootProject();
    let revision = 1;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Character[];
      revision += 1;
      return jsonResponse(envelope(body, `"c${revision}"`));
    }));
    const created = await createApplicationCharacter(fighterInput({ name: 'Phase F CRUD' }));
    expect(created.ok && created.character).toBeTruthy();
    if (!created.ok || !created.character) return;
    const updated = await updateApplicationCharacter(created.character.id, fighterInput({ name: 'Phase F Edited' }));
    expect(updated.ok && updated.character?.name).toBe('Phase F Edited');
  });

  it('40. PLAY project mutations remain functional after Phase F', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    vi.stubGlobal('fetch', echoProjectPut());
    expect((await applyApplicationCharacterDamage(character.id, 1)).ok).toBe(true);
  });

  it('41. Inventory project mutations remain functional after Phase F', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined, inventory: [] }));
    await bootProject([character]);
    vi.stubGlobal('fetch', echoProjectPut());
    expect((await addApplicationRegistryInventoryItem(character.id, SCIMITAR_ID)).ok).toBe(true);
  });

  it('42. Creator Forge project mutations remain functional after Phase F', async () => {
    await bootProject();
    render(<MemoryRouter initialEntries={['/creator-forge/feats']}><App /></MemoryRouter>);
    expect(screen.getAllByRole('link', { name: 'Create Feat' }).length).toBeGreaterThan(0);
  });

  it('43. no roll/session state is moved into Character persistence', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    savePlaySessionState(character.id, { conditions: ['prone'], activeEffectIds: [] });
    await bootProject([character]);
    vi.stubGlobal('fetch', echoProjectPut());
    await confirmApplicationLevelUp(existingFixedDraft(character, FIGHTER_ID));
    expect(getApplicationCharacterById(character.id)).not.toHaveProperty('conditions');
    expect(loadPlaySessionState(character.id).conditions).toContain('prone');
  });

  it('44. Character v9 schema/version remains unchanged', () => {
    expect(CHARACTER_STORAGE_KEY).toBe('dnd3.characters.v10');
    expect(projectCharacter(fighterInput())).not.toHaveProperty('version');
  });

  it('45. no automatic migration occurs', async () => {
    const local = projectCharacter(fighterInput({ name: 'Local Legacy' }));
    localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify([local]));
    const before = localStorage.getItem(CHARACTER_STORAGE_KEY);
    await bootProject([]);
    expect(getApplicationCharacters()).toEqual([]);
    expect(localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(before);
  });

  it('46. Level-Up route is enabled in project mode', async () => {
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    render(<MemoryRouter initialEntries={[`/characters/${character.id}/level-up`]}><App /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: `Level Up ${character.name}` })).toBeInTheDocument();
  });

  it('47. project Level-Up error state is bounded', async () => {
    const user = userEvent.setup();
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: 'stale-content', message: 'stale' } }, 409)));
    const confirm = await openSimpleConfirm(user, character);
    await user.click(confirm);
    expect(await screen.findByRole('alert')).toHaveTextContent(/changed|refresh|reload/i);
    expect(screen.getByRole('button', { name: 'Confirm Level Up' })).toBeEnabled();
  });

  it('48. project Level-Up pending state prevents duplicate commit', async () => {
    const user = userEvent.setup();
    const character = projectCharacter(fighterInput({ level: 1, subclassId: undefined }));
    await bootProject([character]);
    let resolvePut!: () => void;
    const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((resolve) => {
      const body = JSON.parse(String(init?.body)) as Character[];
      resolvePut = () => resolve(jsonResponse(envelope(body, '"c2"')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const confirm = await openSimpleConfirm(user, character);
    await user.click(confirm);
    expect(await screen.findByRole('button', { name: 'Confirming…' })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolvePut();
    await screen.findByRole('heading', { name: character.name });
  });
});
