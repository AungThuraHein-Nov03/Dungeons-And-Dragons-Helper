import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { srdId } from '../content/srd';
import {
  FIGHTER_ACTION_SURGE_RESOURCE_ID,
  FIGHTER_SECOND_WIND_RESOURCE_ID,
} from '../content/srd/fighter';
import type { Character, CharacterInput } from '../models/character';
import type { SubclassContent, SpellContent, SpellcastingProviderDefinition } from '../models/content';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { validateCharacterInput } from '../utils/characterValidation';
import { resolveLegalSpellSlotSources, spellBelongsToProviderList } from '../rules/spellcasting';
import {
  applyApplicationCharacterDamage,
  finishApplicationCharacterShortRest,
  rollApplicationHealingResource,
  rollApplicationHitDie,
  spendApplicationCharacterSpellSlot,
} from '../services/applicationPlayMutations';
import { CHARACTER_STORAGE_KEY, createCharacter, getCharacterById, updateCharacterPlayState } from '../services/characterStorage';
import { initializeContentCatalog, saveAndPublishHomebrewContent } from '../services/contentCatalog';
import { contentRegistry } from '../services/contentRegistry';
import { getDiceVisualEventSnapshot } from '../dice/diceVisualEvent';
import { configurePersistenceBackend } from '../services/persistenceBackend';
import type { ProjectStateEnvelope } from '../services/projectPersistenceTransport';
import {
  getApplicationCharacterById,
  initializeApplicationPersistence,
} from '../services/projectState';
import { loadPlaySessionState } from '../services/playSessionState';
import { loadRollHistory } from '../services/rollHistory';
import {
  completeCharacterV10Choices,
  fighterInput,
  LIGHT_CROSSBOW_ID,
  SCIMITAR_ID,
} from './fixtures';

const FIGHTER_ID = srdId('class', 'fighter');
const ROGUE_ID = srdId('class', 'rogue');
const STUDDED_LEATHER_ID = srdId('armor', 'studded-leather-armor');
const QUARTERSTAFF_ID = srdId('weapon', 'quarterstaff');
const GRAPPLER_ID = srdId('feat', 'grappler');

const EK_SUBCLASS_ID = 'homebrew:test:subclass:final-smoke-ek';
const EK_PROVIDER_ID = 'homebrew:test:spellcasting-provider:final-smoke-ek';

interface SmokeFixture {
  readonly character: Character;
  readonly subclass: SubclassContent;
  readonly attackCantrip: SpellContent;
  readonly concentrationSpell: SpellContent;
  readonly damageSpell: SpellContent;
  readonly unselectedConcentrationSpell: SpellContent;
}

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function panel(name: string) {
  const heading = screen.getByRole('heading', { name, level: 2 });
  const section = heading.closest('section');
  if (!section) throw new Error('Missing panel: ' + name);
  return within(section);
}

function attackPanel() {
  const heading = screen.getByRole('heading', { name: 'Attack Rolls' });
  const section = heading.closest('section');
  if (!section) throw new Error('Missing Attack Rolls panel.');
  return within(section);
}

function inventoryCard(name: string) {
  const heading = screen.getByRole('heading', { name });
  const card = heading.closest('article');
  if (!card) throw new Error('Missing inventory card: ' + name);
  return within(card);
}

function fighterConsumer(character: Character, name: string): string {
  const state = deriveCharacterState(character, contentRegistry);
  if (!state.ok) throw new Error(state.error.message);
  const resource = state.value.resources.find((candidate) => candidate.id === FIGHTER_SECOND_WIND_RESOURCE_ID);
  const consumer = resource?.consumers.find((candidate) => candidate.name === name);
  if (!consumer) throw new Error('Missing Fighter consumer: ' + name);
  return consumer.id;
}

function smokeSubclassAndSpells() {
  const wizardSpells = contentRegistry.getAll('spell').filter((spell) => spellBelongsToProviderList(spell, 'wizard'));
  const attackCantrip = wizardSpells.find((spell) =>
    spell.level === 0 && spell.mechanics.some((mechanic) => mechanic.type === 'spell-attack')
  );
  const concentrationSpells = wizardSpells.filter((spell) => spell.level === 1 && spell.concentration);
  const damageSpell = wizardSpells.find((spell) =>
    spell.level === 1
    && spell.mechanics.some((mechanic) => mechanic.type === 'damage')
    && !spell.concentration
  ) ?? wizardSpells.find((spell) => spell.level === 1 && spell.mechanics.some((mechanic) => mechanic.type === 'damage'));
  const fillers = wizardSpells.filter((spell) =>
    spell.level === 1
    && spell.id !== concentrationSpells[0]?.id
    && spell.id !== concentrationSpells[1]?.id
    && spell.id !== damageSpell?.id
  ).slice(0, 2);
  const secondCantrip = wizardSpells.find((spell) => spell.level === 0 && spell.id !== attackCantrip?.id);
  if (!attackCantrip || concentrationSpells.length < 2 || !damageSpell || fillers.length < 2 || !secondCantrip) {
    throw new Error('Required Wizard spell fixtures are unavailable.');
  }

  const provider: SpellcastingProviderDefinition = {
    id: EK_PROVIDER_ID,
    name: 'Eldritch Knight Smoke Spellcasting',
    spellcastingAbility: { kind: 'fixed', ability: 'intelligence' },
    multiclassSlotContribution: { kind: 'spellcasting', contribution: 'third', rounding: 'down' },
    spellManagement: {
      kind: 'prepared-from-list',
      spellListId: 'wizard',
      cantripCount: [{ level: 3, count: 2 }],
      preparedSpellCount: [{ level: 3, count: 3 }, { level: 4, count: 4 }],
      replacement: 'class-level-one',
    },
    slotPool: {
      id: 'homebrew:test:spell-slot-pool:final-smoke-ek',
      name: 'Eldritch Knight Smoke Slots',
      slotLevels: [{
        spellLevel: 1,
        resourceId: 'homebrew:test:spell-slot:final-smoke-ek:1',
        name: 'Level 1 Eldritch Knight Smoke Slots',
      }],
      progression: [
        { level: 3, slots: [{ spellLevel: 1, maximum: 2 }] },
        { level: 4, slots: [{ spellLevel: 1, maximum: 3 }] },
      ],
      recovery: [{ trigger: 'long-rest', mode: 'all' }],
    },
    ritualCasting: 'prepared',
  };

  const subclass: SubclassContent = {
    id: EK_SUBCLASS_ID,
    kind: 'subclass',
    name: 'Eldritch Knight Smoke Fixture',
    source: { type: 'homebrew', namespace: 'test' },
    parentClassId: FIGHTER_ID,
    acquisitionLevel: 3,
    description: 'Isolated Eldritch Knight-shaped smoke fixture; never written to live project data.',
    progression: [{
      level: 3,
      features: [{
        id: 'homebrew:test:subclass-feature:final-smoke-ek-spellcasting',
        name: 'Spellcasting',
        description: 'Wizard-list spellcasting owned by the Fighter subclass.',
        effects: [],
        spellcasting: [provider],
        referenceEffects: [],
      }],
    }],
  };

  return {
    subclass,
    attackCantrip,
    concentrationSpell: concentrationSpells[0],
    unselectedConcentrationSpell: concentrationSpells[1],
    damageSpell,
    fillers,
    secondCantrip,
  };
}

function buildSmokeInput(): { input: CharacterInput; subclass: SubclassContent; attackCantrip: SpellContent; concentrationSpell: SpellContent; damageSpell: SpellContent; unselectedConcentrationSpell: SpellContent } {
  const spells = smokeSubclassAndSpells();
  const published = saveAndPublishHomebrewContent([spells.subclass], window.localStorage);
  if (!published.ok) throw new Error(published.error.message);

  const selection = {
    providerId: EK_PROVIDER_ID,
    cantripIds: [spells.attackCantrip.id, spells.secondCantrip.id],
    ownedSpellIds: [],
    preparedSpellIds: [
      spells.concentrationSpell.id,
      spells.damageSpell.id,
      ...spells.fillers.map((spell) => spell.id),
    ],
  };

  const fighter = fighterInput({
    name: 'Final Multiclass Smoke',
    level: 4,
    subclassId: EK_SUBCLASS_ID,
    abilityScores: {
      strength: 14,
      dexterity: 18,
      constitution: 14,
      intelligence: 14,
      wisdom: 12,
      charisma: 10,
    },
    manualFeats: [{
      featId: GRAPPLER_ID,
      choices: { 'ability-increase': ['dexterity'] },
    }],
    spellcastingSelections: [selection],
    equipment: {
      equippedArmorId: STUDDED_LEATHER_ID,
      equippedWeaponIds: [SCIMITAR_ID, LIGHT_CROSSBOW_ID, QUARTERSTAFF_ID],
    },
    weaponAttackAbilityChoices: { [SCIMITAR_ID]: 'dexterity' },
  });

  const completed = completeCharacterV10Choices({
    ...fighter,
    startingClassId: FIGHTER_ID,
    classProgressions: [
      fighter.classProgressions[0],
      {
        classId: ROGUE_ID,
        level: 1,
        skillProficiencies: ['stealth'],
        skillExpertise: [],
        weaponMasterySelections: [],
        hpProgression: [{ classLevel: 1, method: 'fixed' }],
      },
    ],
    spellcastingSelections: [selection],
  }, contentRegistry);

  const rogueProgression = completed.classProgressions.find((entry) => entry.classId === ROGUE_ID);
  if (!rogueProgression) throw new Error('Smoke fixture Rogue progression missing.');
  rogueProgression.skillExpertise = ['stealth', 'perception'];

  const validation = validateCharacterInput(completed, {}, contentRegistry);
  if (Object.keys(validation).length > 0) throw new Error(`Smoke fixture invalid: ${JSON.stringify(validation)}`);

  return {
    input: completed,
    subclass: spells.subclass,
    attackCantrip: spells.attackCantrip,
    concentrationSpell: spells.concentrationSpell,
    damageSpell: spells.damageSpell,
    unselectedConcentrationSpell: spells.unselectedConcentrationSpell,
  };
}

function createSmokeCharacter(): SmokeFixture {
  const built = buildSmokeInput();
  const character = createCharacter(built.input);
  const derived = deriveCharacterState(character, contentRegistry);
  if (!derived.ok) throw new Error(derived.error.message);

  const reduced = updateCharacterPlayState(character.id, {
    ...character.playState,
    currentHp: Math.max(1, derived.value.health.maximumHp - 12),
    hitDiceRemaining: { 10: 3, 8: 1 },
    resourceUses: {
      ...character.playState.resourceUses,
      [FIGHTER_SECOND_WIND_RESOURCE_ID]: 1,
      [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 0,
    },
  });
  if (!reduced) throw new Error('Failed to seed smoke play state.');

  return {
    character: reduced,
    subclass: built.subclass,
    attackCantrip: built.attackCantrip,
    concentrationSpell: built.concentrationSpell,
    damageSpell: built.damageSpell,
    unselectedConcentrationSpell: built.unselectedConcentrationSpell,
  };
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function envelope(content: SubclassContent[], characters: Character[], revision = '"c1"'): ProjectStateEnvelope {
  return {
    content,
    characters,
    contentExists: true,
    charactersExists: true,
    characterMigrationRequired: false,
    contentRevision: '"h1"',
    characterRevision: revision,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  configurePersistenceBackend('browser-local');
  initializeContentCatalog(window.localStorage);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  configurePersistenceBackend('browser-local');
});

describe('FINAL normal-use multiclass smoke', () => {
  it('drives one Fighter 4 / Rogue 1 Eldritch-Knight-shaped character through Character, Inventory, PLAY, rolls, resources, rests, spellcasting, concentration, and Level Up/Edit entry', async () => {
    const user = userEvent.setup();
    const fixture = createSmokeCharacter();
    let character = fixture.character;
    let state = deriveCharacterState(character, contentRegistry);
    if (!state.ok) throw new Error(state.error.message);

    // Phase 1: Character/load/derivation.
    expect(state.value.level).toBe(5);
    expect(state.value.proficiencyBonus).toBe(3);
    expect(state.value.classProgressions.map((entry) => [entry.id, entry.classLevel])).toEqual([
      [FIGHTER_ID, 4],
      [ROGUE_ID, 1],
    ]);
    expect(character.classProgressions[0].subclassId).toBe(EK_SUBCLASS_ID);
    expect(state.value.abilityModifiers.dexterity).toBe(4); // 18 base + Grappler +1 => 19 => +4
    expect(state.value.defense.armorClass).toBe(16); // Studded Leather 12 + DEX 4
    expect(state.value.skills.stealth.expertise).toBe(true);
    expect(state.value.skills.stealth.modifier).toBe(10); // DEX +4 + doubled PB +6
    expect(character.manualFeats).toEqual(expect.arrayContaining([
      expect.objectContaining({ featId: GRAPPLER_ID }),
    ]));
    expect(character.languageChoices.length).toBeGreaterThan(0);
    expect(character.inventory.filter((entry) => entry.kind === 'registry' && entry.equipped)).toHaveLength(4);
    expect(character.classProgressions.every((entry) => entry.weaponMasterySelections.length > 0)).toBe(true);
    for (const attack of state.value.attacks) {
      const selected = character.classProgressions.some((progression) => progression.weaponMasterySelections.includes(attack.weaponId));
      expect(attack.mastery.canPotentiallyUse).toBe(selected);
    }
    const provider = state.value.spellcasting.find((entry) => entry.id === EK_PROVIDER_ID);
    if (!provider) throw new Error('Missing smoke Eldritch Knight provider.');
    expect(provider.owner).toMatchObject({ kind: 'subclass', classId: FIGHTER_ID, subclassId: EK_SUBCLASS_ID, level: 4 });
    expect(provider.spells.map((spell) => spell.id)).toContain(fixture.concentrationSpell.id);
    expect(provider.spells.map((spell) => spell.id)).not.toContain(fixture.unselectedConcentrationSpell.id);

    const view = renderAt(`/characters/${character.id}/character`);
    expect(screen.getByRole('heading', { name: character.name })).toBeInTheDocument();
    expect(screen.getByText(/Level 5/, { selector: '.sheet-hero__meta' })).toBeInTheDocument();
    expect(screen.getByLabelText('Fighter level 4 class progression')).toBeInTheDocument();
    expect(screen.getByLabelText('Rogue level 1 class progression')).toBeInTheDocument();
    expect(screen.getByLabelText('Eldritch Knight Smoke Fixture subclass progression for Fighter level 4')).toBeInTheDocument();
    expect(screen.queryByText(/Multiclass class-feature presentation remains deferred/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Multiclass subclass-feature presentation remains deferred/)).not.toBeInTheDocument();
    expect(screen.getByText('Grappler')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Expertise').length).toBeGreaterThan(0);
    const characterSpellcasting = panel('Spellcasting');
    expect(characterSpellcasting.getByRole('heading', { name: 'Eldritch Knight Smoke Spellcasting' })).toBeInTheDocument();
    expect(characterSpellcasting.getByText(fixture.concentrationSpell.name)).toBeInTheDocument();

    // Phase 2: inventory/equipment.
    await user.click(screen.getByRole('link', { name: 'Inventory' }));
    expect(screen.getByTestId('character-workspace-inventory')).toBeInTheDocument();
    expect(inventoryCard('Studded Leather Armor').getByRole('button', { name: 'Unequip' })).toBeInTheDocument();
    expect(inventoryCard('Scimitar').getByRole('button', { name: 'Unequip' })).toBeInTheDocument();
    await user.click(inventoryCard('Light Crossbow').getByRole('button', { name: 'Unequip' }));
    await waitFor(() => expect(inventoryCard('Light Crossbow').getByRole('button', { name: 'Equip' })).toBeInTheDocument());
    await user.click(inventoryCard('Light Crossbow').getByRole('button', { name: 'Equip' }));
    await waitFor(() => expect(inventoryCard('Light Crossbow').getByRole('button', { name: 'Unequip' })).toBeInTheDocument());

    // Phase 3: PLAY.
    await user.click(screen.getByRole('link', { name: 'Character Sheet' }));
    expect(screen.getByTestId('character-workspace-play')).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Armor Class' })).getByText('16')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Initiative roll mode' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Cover' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Character roll mode' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'd20 roll mode' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Second Wind resource status')).toHaveTextContent('1');
    const playSpellcasting = panel('Spellcasting');
    const playSpellSelect = playSpellcasting.getByLabelText('Spell') as HTMLSelectElement;
    const spellOptions = [...playSpellSelect.options].map((option) => option.value);
    expect(spellOptions).toContain(`${EK_PROVIDER_ID}::${fixture.concentrationSpell.id}`);
    expect(spellOptions).not.toContain(`${EK_PROVIDER_ID}::${fixture.unselectedConcentrationSpell.id}`);

    // Phase 4: basic rolls + authoritative visual boundary.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const diceUtility = within(screen.getByRole('complementary', { name: 'Dice utility' }));
    await user.click(diceUtility.getByRole('button', { name: 'Roll 1d20' }));
    expect(loadRollHistory()[0]?.result.request.label).toBe('Manual 1d20');
    expect(getDiceVisualEventSnapshot()?.dice[0]?.value).toBe(loadRollHistory()[0]?.result.dice[0]?.values[0]);

    const characterRoll = panel('Ability Checks');
    await user.click(characterRoll.getByRole('button', { name: 'Roll Strength' }));
    expect(loadRollHistory()[0]?.result.request.label).toBe('Strength Check');

    await user.click(screen.getByRole('button', { name: 'Roll Initiative' }));
    expect(loadRollHistory()[0]?.result.request.label).toBe('Initiative');

    const attacks = attackPanel();
    await user.selectOptions(attacks.getByLabelText('Weapon'), `test:${SCIMITAR_ID}`);
    await user.click(attacks.getByRole('button', { name: 'Roll Attack (Normal)' }));
    expect(loadRollHistory()[0]?.result.request.label).toBe('Scimitar Attack');
    await user.click(attacks.getByRole('button', { name: 'Roll Damage' }));
    expect(loadRollHistory()[0]?.result.request.label).toBe('Scimitar Damage');

    // Phase 5: Sneak Attack.
    const sneakAttack = attacks.getByRole('checkbox', { name: 'Sneak Attack (+1d6)' });
    expect(sneakAttack).not.toBeChecked();
    const ordinaryDamage = loadRollHistory()[0]!.result;
    await user.click(sneakAttack);
    await user.click(attacks.getByRole('button', { name: 'Roll Damage' }));
    const sneakDamage = loadRollHistory()[0]!.result;
    expect(sneakDamage.request.label).toBe('Scimitar Damage + Sneak Attack');
    expect(sneakDamage.dice.map((group) => [group.die, group.values.length])).toEqual(expect.arrayContaining([[6, 1], [6, 1]]));
    expect(sneakDamage.total).toBeGreaterThan(ordinaryDamage.total);
    expect(attacks.getByRole('checkbox', { name: 'Sneak Attack (+1d6)' })).not.toBeChecked();

    await user.click(within(attacks.getByLabelText('Scimitar damage mode')).getByRole('button', { name: 'Critical' }));
    await user.click(attacks.getByRole('checkbox', { name: 'Sneak Attack (+1d6)' }));
    await user.click(attacks.getByRole('button', { name: 'Roll Critical Damage' }));
    const criticalSneak = loadRollHistory()[0]!.result;
    expect(criticalSneak.request.label).toBe('Scimitar Damage + Sneak Attack — Critical');
    expect(criticalSneak.modifier).toBe(4);
    expect(criticalSneak.dice.reduce((total, group) => total + group.values.length, 0)).toBe(4);

    await user.selectOptions(attacks.getByLabelText('Weapon'), `test:${QUARTERSTAFF_ID}`);
    expect(attacks.queryByRole('checkbox', { name: /Sneak Attack/ })).not.toBeInTheDocument();

    // Phase 6: Fighter-owned Second Wind.
    character = getCharacterById(character.id)!;
    const beforeSecondWind = character.playState.currentHp;
    const beforeSecondWindUses = character.playState.resourceUses[FIGHTER_SECOND_WIND_RESOURCE_ID];
    const secondWindResult = await rollApplicationHealingResource(
      character.id,
      FIGHTER_SECOND_WIND_RESOURCE_ID,
      fighterConsumer(character, 'Second Wind'),
      { rng: () => 0.5 },
    );
    expect(secondWindResult.ok).toBe(true);
    if (!secondWindResult.ok) throw new Error(secondWindResult.error.message);
    const secondWindCharacter = secondWindResult.value.character;
    if (!secondWindCharacter) throw new Error('Second Wind did not return the updated Character.');
    expect(secondWindResult.value.roll.modifier).toBe(4);
    expect(secondWindCharacter.playState.currentHp).toBeGreaterThan(beforeSecondWind);
    expect(secondWindCharacter.playState.resourceUses[FIGHTER_SECOND_WIND_RESOURCE_ID]).toBe((beforeSecondWindUses ?? 0) - 1);
    expect(loadRollHistory()[0]?.result.request.label).toContain('Second Wind');
    expect(getDiceVisualEventSnapshot()?.dice[0]?.value).toBe(secondWindResult.value.roll.dice[0]?.values[0]);

    // Phase 7: damage / Hit Die / Short Rest / Long Rest.
    const damaged = await applyApplicationCharacterDamage(character.id, 8);
    expect(damaged.ok).toBe(true);
    const beforeHitDice = getCharacterById(character.id)!.playState.hitDiceRemaining[10];
    const hitDie = await rollApplicationHitDie(character.id, 10, { rng: () => 0.5 });
    expect(hitDie.ok).toBe(true);
    expect(getCharacterById(character.id)!.playState.hitDiceRemaining[10]).toBe((beforeHitDice ?? 0) - 1);

    const beforeShortSecondWind = getCharacterById(character.id)!.playState.resourceUses[FIGHTER_SECOND_WIND_RESOURCE_ID];
    const beforeShortActionSurge = getCharacterById(character.id)!.playState.resourceUses[FIGHTER_ACTION_SURGE_RESOURCE_ID];
    const shortRest = await finishApplicationCharacterShortRest(character.id);
    expect(shortRest.ok).toBe(true);
    if (!shortRest.ok) throw new Error(shortRest.error.message);
    expect(shortRest.value.playState.resourceUses[FIGHTER_SECOND_WIND_RESOURCE_ID]).toBeGreaterThanOrEqual(beforeShortSecondWind ?? 0);
    expect(shortRest.value.playState.resourceUses[FIGHTER_ACTION_SURGE_RESOURCE_ID]).toBeGreaterThanOrEqual(beforeShortActionSurge ?? 0);

    // Phase 8: PLAY spellcasting + real slot expenditure.
    state = deriveCharacterState(getCharacterById(character.id)!, contentRegistry);
    if (!state.ok) throw new Error(state.error.message);
    const legal = resolveLegalSpellSlotSources(state.value, EK_PROVIDER_ID, fixture.damageSpell.id, 1);
    if (!legal.ok || !legal.value[0]) throw new Error('Missing legal EK slot source.');
    const slotResourceId = legal.value[0].resourceId;
    const beforeSlots = getCharacterById(character.id)!.playState.resourceUses[slotResourceId];
    await user.selectOptions(playSpellSelect, `${EK_PROVIDER_ID}::${fixture.damageSpell.id}`);
    await user.click(playSpellcasting.getByRole('button', { name: 'Cast Spell' }));
    await waitFor(() => expect(getCharacterById(character.id)!.playState.resourceUses[slotResourceId]).toBe((beforeSlots ?? 0) - 1));
    if (fixture.damageSpell.mechanics.some((mechanic) => mechanic.type === 'damage')) {
      await user.click(playSpellcasting.getByRole('button', { name: 'Damage' }));
      expect(loadRollHistory()[0]?.result.request.label).toContain(fixture.damageSpell.name);
    }
    await user.selectOptions(playSpellSelect, `${EK_PROVIDER_ID}::${fixture.attackCantrip.id}`);
    if (fixture.attackCantrip.mechanics.some((mechanic) => mechanic.type === 'spell-attack')) {
      await user.click(playSpellcasting.getByRole('button', { name: 'Spell Attack' }));
      expect(loadRollHistory()[0]?.result.request.label).toContain(fixture.attackCantrip.name);
    }

    // Phase 9: concentration candidate identity.
    await user.selectOptions(playSpellSelect, `${EK_PROVIDER_ID}::${fixture.concentrationSpell.id}`);
    const concentration = panel('Concentration');
    const concentrationSelect = concentration.getByLabelText('Concentration spell') as HTMLSelectElement;
    const concentrationOptions = [...concentrationSelect.options].map((option) => option.value);
    expect(concentrationOptions).toContain(`${EK_PROVIDER_ID}::${fixture.concentrationSpell.id}`);
    expect(concentrationOptions).not.toContain(`${EK_PROVIDER_ID}::${fixture.unselectedConcentrationSpell.id}`);
    await user.selectOptions(concentrationSelect, `${EK_PROVIDER_ID}::${fixture.concentrationSpell.id}`);
    await user.click(concentration.getByRole('button', { name: 'Start Concentration' }));
    expect(loadPlaySessionState(character.id).concentration).toEqual({ providerId: EK_PROVIDER_ID, spellId: fixture.concentrationSpell.id });

    // Long Rest through the real UI confirmation.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const rest = panel('Hit Dice & Rests');
    await user.click(rest.getByRole('button', { name: 'Long Rest' }));
    await waitFor(() => {
      const latest = getCharacterById(character.id)!;
      const latestState = deriveCharacterState(latest, contentRegistry);
      expect(latestState.ok).toBe(true);
      if (latestState.ok) expect(latest.playState.currentHp).toBe(latestState.value.health.maximumHp);
    });
    const longRested = getCharacterById(character.id)!;
    expect(longRested.playState.hitDiceRemaining[10]).toBe(4);
    expect(longRested.playState.hitDiceRemaining[8]).toBe(1);
    expect(longRested.playState.resourceUses[FIGHTER_SECOND_WIND_RESOURCE_ID]).toBeGreaterThan(0);
    expect(longRested.playState.resourceUses[slotResourceId]).toBeGreaterThan(0);

    // Phase 10 browser-local reload + transient-state boundary.
    const persistedBeforeReload = window.localStorage.getItem(CHARACTER_STORAGE_KEY);
    const durable = getCharacterById(character.id)!;
    view.unmount();
    renderAt(`/characters/${character.id}`);
    const reloaded = getCharacterById(character.id)!;
    expect(reloaded.classProgressions).toEqual(durable.classProgressions);
    expect(reloaded.manualFeats).toEqual(durable.manualFeats);
    expect(reloaded.inventory).toEqual(durable.inventory);
    expect(reloaded.spellcastingSelections).toEqual(durable.spellcastingSelections);
    expect(reloaded.playState).toEqual(durable.playState);
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(persistedBeforeReload);
    expect(reloaded).not.toHaveProperty('sneakAttack');
    expect(reloaded).not.toHaveProperty('diceVisualEvent');
    expect(reloaded).not.toHaveProperty('expandedSpellDetails');

    // Phase 11: safe Level Up and Edit entry, no commit.
    const persistedBeforeDrafts = window.localStorage.getItem(CHARACTER_STORAGE_KEY);
    await user.click(screen.getByRole('link', { name: 'Level Up' }));
    expect(screen.getByRole('heading', { name: `Level Up ${character.name}` })).toBeInTheDocument();
    expect(screen.getByText(/Starting Class:/)).toHaveTextContent('Fighter');
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(persistedBeforeDrafts);
    await user.click(screen.getByRole('link', { name: 'Cancel' }));
    await user.click(screen.getByRole('link', { name: 'Edit Character' }));
    expect(screen.getByRole('heading', { name: 'Class progressions' })).toBeInTheDocument();
    expect(screen.getByText((_content, element) => element?.tagName === 'P' && element.textContent === 'Character Level: 5')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Eldritch Knight Smoke Fixture')).toBeInTheDocument();
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(persistedBeforeDrafts);
  }, 30_000);

  it('round-trips the same multiclass durable state through isolated project-backed persistence without persisting transient UI/combat declarations', async () => {
    const built = buildSmokeInput();
    const isolated = memoryStorage();
    const character = createCharacter(built.input, isolated);
    const derived = deriveCharacterState(character, contentRegistry);
    if (!derived.ok) throw new Error(derived.error.message);
    const seeded = {
      ...character,
      playState: {
        ...character.playState,
        currentHp: derived.value.health.maximumHp - 7,
      },
    };

    let persisted = [seeded];
    let revision = 1;
    const result = await initializeApplicationPersistence({
      backend: 'project',
      fetchImpl: async () => jsonResponse(envelope([built.subclass], persisted, `"c${revision}"`)),
    });
    expect(result.ok).toBe(true);

    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (_input, init) => {
      persisted = JSON.parse(String(init?.body)) as Character[];
      revision += 1;
      return jsonResponse(envelope([built.subclass], persisted, `"c${revision}"`));
    }));

    const loaded = getApplicationCharacterById(character.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.classProgressions.map((entry) => [entry.classId, entry.level])).toEqual([[FIGHTER_ID, 4], [ROGUE_ID, 1]]);
    expect(loaded?.classProgressions[0].subclassId).toBe(EK_SUBCLASS_ID);

    const damaged = await applyApplicationCharacterDamage(character.id, 4);
    expect(damaged.ok).toBe(true);

    const current = getApplicationCharacterById(character.id)!;
    const currentState = deriveCharacterState(current, contentRegistry);
    if (!currentState.ok) throw new Error(currentState.error.message);
    const provider = currentState.value.spellcasting.find((entry) => entry.id === EK_PROVIDER_ID);
    if (!provider) throw new Error('Missing project EK provider.');
    const spell = provider.spells.find((entry) => entry.level === 1);
    if (!spell) throw new Error('Missing project leveled EK spell.');
    const legal = resolveLegalSpellSlotSources(currentState.value, EK_PROVIDER_ID, spell.id, 1);
    if (!legal.ok || !legal.value[0]) throw new Error('Missing project slot source.');
    const slot = legal.value[0].resourceId;
    const beforeSlot = current.playState.resourceUses[slot];
    const spent = await spendApplicationCharacterSpellSlot(character.id, EK_PROVIDER_ID, spell.id, 1, legal.value[0]);
    expect(spent.ok).toBe(true);
    if (spent.ok) expect(spent.value.playState.resourceUses[slot]).toBe((beforeSlot ?? 0) - 1);

    const short = await finishApplicationCharacterShortRest(character.id);
    expect(short.ok).toBe(true);

    const durableBeforeReload = getApplicationCharacterById(character.id)!;
    const reload = await initializeApplicationPersistence({
      backend: 'project',
      fetchImpl: async () => jsonResponse(envelope([built.subclass], persisted, `"c${revision}"`)),
    });
    expect(reload.ok).toBe(true);
    const durableAfterReload = getApplicationCharacterById(character.id)!;

    expect(durableAfterReload.classProgressions).toEqual(durableBeforeReload.classProgressions);
    expect(durableAfterReload.manualFeats).toEqual(durableBeforeReload.manualFeats);
    expect(durableAfterReload.languageChoices).toEqual(durableBeforeReload.languageChoices);
    expect(durableAfterReload.inventory).toEqual(durableBeforeReload.inventory);
    expect(durableAfterReload.spellcastingSelections).toEqual(durableBeforeReload.spellcastingSelections);
    expect(durableAfterReload.playState).toEqual(durableBeforeReload.playState);
    expect(durableAfterReload).not.toHaveProperty('concentration');
    expect(durableAfterReload).not.toHaveProperty('sneakAttack');
    expect(durableAfterReload).not.toHaveProperty('diceVisualEvent');
    expect(durableAfterReload).not.toHaveProperty('expandedSpellDetails');
  });
});
