import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App, { AppRoutes } from '../App';
import type { SpellContent } from '../models/content';
import { initializeContentCatalog, saveAndPublishHomebrewContent } from '../services/contentCatalog';
import { contentRegistry } from '../services/contentRegistry';
import {
  HOMEBREW_CONTENT_STORAGE_KEY,
  loadHomebrewContent,
} from '../services/homebrewContentStorage';

const SEEDED_ID = 'homebrew:local:spell:m16d-seeded';

function seededSpell(name = 'Seeded Spell'): SpellContent {
  return {
    id: SEEDED_ID,
    kind: 'spell',
    name,
    source: { type: 'homebrew', namespace: 'local' },
    level: 1,
    school: 'evocation',
    castingTime: 'Action',
    range: '60 feet',
    components: { verbal: true, somatic: true, material: false },
    duration: 'Instantaneous',
    concentration: false,
    ritual: false,
    description: 'Seeded M16-D custom Spell.',
    spellLists: [{ id: 'wizard', name: 'Wizard' }],
    mechanics: [
      { type: 'spell-attack', attackType: 'ranged' },
      { type: 'damage', amount: { dice: [{ count: 1, die: 8 }], modifier: 'none' }, damageType: 'force' },
    ],
    referenceEffects: [],
  };
}

function renderRoutes(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function renderApp(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

function forgeId(): string {
  const value = screen.getByText(/^homebrew:local:spell:/).textContent;
  if (!value) throw new Error('Spell Forge ID was not rendered.');
  return value;
}

async function fillMinimumValidSpell(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(screen.getByLabelText('Spell name'), name);
  await user.type(screen.getByLabelText('Spell description'), 'Synthetic M16-D Spell Forge draft.');
  await user.click(screen.getByLabelText('Spell list Wizard'));
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  initializeContentCatalog(window.localStorage);
});

describe('M16-D Creator Forge shell and Spell Forge UI', () => {
  it('A preserves Spells and Feats while later Forge families follow the current shell', async () => {
    const user = userEvent.setup();
    renderApp('/creator-forge');

    expect(screen.getByRole('link', { name: 'Creator Forge' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Feats' })).toHaveAttribute('href', '/creator-forge/feats');
    expect(screen.getByRole('link', { name: 'Spells' })).toHaveAttribute('href', '/creator-forge/spells');
    expect(screen.getByRole('link', { name: 'Subclasses' })).toHaveAttribute('href', '/creator-forge/subclasses');

    expect(screen.getByRole('link', { name: 'Classes' })).toHaveAttribute('href', '/creator-forge/classes');

    await user.click(screen.getByRole('link', { name: 'Spells' }));
    expect(screen.getByRole('heading', { name: 'Custom Spells' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('link', { name: 'Create Spell' })[0]);
    expect(screen.getByRole('heading', { name: 'Create Spell' })).toBeInTheDocument();
  });

  it('B lists only manageable custom Spells with bounded M16-G Delete', () => {
    expect(saveAndPublishHomebrewContent([seededSpell()], window.localStorage).ok).toBe(true);
    renderRoutes('/creator-forge/spells');

    expect(screen.getByRole('heading', { name: 'Seeded Spell' })).toBeInTheDocument();
    expect(screen.getByText(/Level 1 · Evocation · Wizard/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/creator-forge/spells/' + encodeURIComponent(SEEDED_ID) + '/edit',
    );
    expect(screen.getByRole('link', { name: 'Duplicate' })).toHaveAttribute(
      'href',
      '/creator-forge/spells/new?duplicate=' + encodeURIComponent(SEEDED_ID),
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Fireball' })).not.toBeInTheDocument();
  });

  it('B empty state clearly offers Create Spell', () => {
    renderRoutes('/creator-forge/spells');
    expect(screen.getByRole('heading', { name: 'No custom Spells yet' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Create Spell' }).length).toBeGreaterThan(0);
  });

  it('C-I creates full bounded canonical Spell semantics, reviews without persistence, saves, publishes, and reloads the same ID', async () => {
    const user = userEvent.setup();
    renderRoutes('/creator-forge/spells/new');

    const id = forgeId();
    expect(id).toMatch(/^homebrew:local:spell:/);
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBeNull();

    await user.type(screen.getByLabelText('Spell name'), 'Forge Tempest');
    await user.type(screen.getByLabelText('Spell description'), 'A bounded custom Spell authored through Creator Forge.');
    await user.selectOptions(screen.getByLabelText('Spell level'), '2');
    await user.selectOptions(screen.getByLabelText('Spell school'), 'evocation');

    const castingTime = screen.getByLabelText('Casting time');
    await user.clear(castingTime);
    await user.type(castingTime, 'Bonus Action');
    const range = screen.getByLabelText('Spell range');
    await user.clear(range);
    await user.type(range, '90 feet');
    const duration = screen.getByLabelText('Spell duration');
    await user.clear(duration);
    await user.type(duration, 'Concentration, up to 1 minute');
    await user.type(screen.getByLabelText('Target or area'), 'One creature within range');
    await user.type(screen.getByLabelText('Higher-level description'), 'Damage and healing use their structured slot scaling.');

    await user.click(screen.getByLabelText('Material component'));
    await user.type(screen.getByLabelText('Material component description'), 'a copper wire');
    await user.click(screen.getByLabelText('Concentration Spell'));
    await user.click(screen.getByLabelText('Ritual Spell'));
    await user.click(screen.getByLabelText('Spell list Wizard'));

    await user.click(screen.getByLabelText('Enable Spell Attack'));
    await user.selectOptions(screen.getByLabelText('Spell attack type'), 'ranged');
    await user.click(screen.getByLabelText('Enable Saving Throw'));
    await user.selectOptions(screen.getByLabelText('Saving throw ability'), 'wisdom');
    await user.selectOptions(screen.getByLabelText('Saving throw success behavior'), 'half');
    expect(screen.getByText(/MANUAL \/ REFERENCE.*does not roll target saves/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add Damage Mechanic' }));
    await user.selectOptions(screen.getByLabelText('Damage type'), 'lightning');
    const damageCount = screen.getByLabelText('Damage base dice die count 1');
    await user.clear(damageCount);
    await user.type(damageCount, '2');
    await user.selectOptions(screen.getByLabelText('Damage base dice die size 1'), '8');
    await user.selectOptions(screen.getByLabelText('Damage scaling type'), 'slot-level-dice');
    await user.selectOptions(screen.getByLabelText('Damage dice per slot level die size 1'), '8');

    await user.click(screen.getByRole('button', { name: 'Add Healing Mechanic' }));
    await user.selectOptions(screen.getByLabelText('Healing modifier'), 'spellcasting-ability');
    await user.selectOptions(screen.getByLabelText('Healing scaling type'), 'slot-level-dice');

    await user.click(screen.getByRole('button', { name: 'Add Reference-only Effect' }));
    await user.type(screen.getByLabelText('Spell reference effect name'), 'Push Rider');
    await user.type(screen.getByLabelText('Spell reference effect description'), 'Pushing the target remains table-managed.');

    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Review Spell' }));

    expect(screen.getByRole('heading', { name: 'Review before Save' })).toBeInTheDocument();
    expect(screen.getByText('Forge Tempest')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Existing Spell rules' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Table-managed behavior' })).toBeInTheDocument();
    expect(screen.getByText(/ranged spell attack using the owning provider/i)).toBeInTheDocument();
    expect(screen.getByText(/2d8 lightning/i)).toBeInTheDocument();
    expect(screen.getByText(/Spellcasting Ability modifier/i)).toBeInTheDocument();
    expect(screen.getByText(/Wisdom save.*Target save resolution remains manual/i)).toBeInTheDocument();
    expect(screen.getByText(/descriptive metadata only; no battlefield targeting/i)).toBeInTheDocument();
    expect(screen.getByText('Push Rider')).toBeInTheDocument();
    expect(screen.getByText(/existing concentration candidate/i)).toBeInTheDocument();
    expect(screen.getByText(/existing provider ritual policy/i)).toBeInTheDocument();
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Back to Edit' }));
    expect(screen.getByLabelText('Spell name')).toHaveValue('Forge Tempest');
    expect(screen.getByLabelText('Spell reference effect name')).toHaveValue('Push Rider');
    expect(forgeId()).toBe(id);

    await user.click(screen.getByRole('button', { name: 'Review Spell' }));
    await user.click(screen.getByRole('button', { name: 'Save Spell' }));

    expect(await screen.findByRole('heading', { name: 'Custom Spells' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Forge Tempest' })).toBeInTheDocument();

    const stored = loadHomebrewContent(window.localStorage);
    expect(stored).toHaveLength(1);
    const spell = stored[0];
    expect(spell).toMatchObject({
      id,
      kind: 'spell',
      name: 'Forge Tempest',
      source: { type: 'homebrew', namespace: 'local' },
      level: 2,
      school: 'evocation',
      castingTime: 'Bonus Action',
      range: '90 feet',
      duration: 'Concentration, up to 1 minute',
      concentration: true,
      ritual: true,
      target: 'One creature within range',
      components: {
        verbal: true,
        somatic: true,
        material: true,
        materialText: 'a copper wire',
      },
      spellLists: [{ id: 'wizard', name: 'Wizard' }],
    });
    expect(spell.kind === 'spell' && spell.mechanics).toEqual([
      { type: 'spell-attack', attackType: 'ranged' },
      { type: 'saving-throw', ability: 'wisdom', onSuccess: 'half' },
      {
        type: 'damage',
        amount: { dice: [{ count: 2, die: 8 }], modifier: 'none' },
        damageType: 'lightning',
        scaling: { kind: 'slot-level-dice', baseSpellLevel: 2, dicePerLevel: [{ count: 1, die: 8 }] },
      },
      {
        type: 'healing',
        amount: { dice: [{ count: 1, die: 8 }], modifier: 'spellcasting-ability' },
        scaling: { kind: 'slot-level-dice', baseSpellLevel: 2, dicePerLevel: [{ count: 1, die: 8 }] },
      },
    ]);
    expect(contentRegistry.findSpell(id)?.name).toBe('Forge Tempest');

    expect(initializeContentCatalog(window.localStorage).ok).toBe(true);
    expect(contentRegistry.findSpell(id)?.id).toBe(id);
    expect(contentRegistry.findSpell(id)?.name).toBe('Forge Tempest');
  }, 30000);

  it('C/K Edit preserves ContentId/source/kind while rename publishes through the existing authority', async () => {
    const user = userEvent.setup();
    expect(saveAndPublishHomebrewContent([seededSpell()], window.localStorage).ok).toBe(true);
    renderRoutes('/creator-forge/spells/' + encodeURIComponent(SEEDED_ID) + '/edit');

    expect(screen.getByRole('heading', { name: 'Edit Spell' })).toBeInTheDocument();
    expect(forgeId()).toBe(SEEDED_ID);
    expect(screen.getByText('Homebrew · local')).toBeInTheDocument();

    const name = screen.getByLabelText('Spell name');
    await user.clear(name);
    await user.type(name, 'Renamed Seeded Spell');
    await user.click(screen.getByRole('button', { name: 'Review Spell' }));
    expect(forgeId()).toBe(SEEDED_ID);
    await user.click(screen.getByRole('button', { name: 'Save Spell' }));
    expect(await screen.findByRole('heading', { name: 'Custom Spells' })).toBeInTheDocument();

    expect(loadHomebrewContent(window.localStorage)).toEqual([
      expect.objectContaining({
        id: SEEDED_ID,
        kind: 'spell',
        name: 'Renamed Seeded Spell',
        source: { type: 'homebrew', namespace: 'local' },
      }),
    ]);
    expect(contentRegistry.findSpell(SEEDED_ID)?.name).toBe('Renamed Seeded Spell');
  });

  it('C/K Duplicate gets a new Spell ID and fresh nested reference IDs while the original remains untouched', async () => {
    const user = userEvent.setup();
    const original: SpellContent = {
      ...seededSpell(),
      referenceEffects: [{
        id: 'homebrew:local:spell-reference-effect:seeded-rider',
        name: 'Seeded Rider',
        description: 'Manual rider.',
      }],
    };
    expect(saveAndPublishHomebrewContent([original], window.localStorage).ok).toBe(true);

    renderRoutes('/creator-forge/spells/new?duplicate=' + encodeURIComponent(SEEDED_ID));
    const duplicateId = forgeId();
    expect(duplicateId).not.toBe(SEEDED_ID);
    expect(screen.getByLabelText('Spell name')).toHaveValue('Seeded Spell Copy');
    expect(loadHomebrewContent(window.localStorage)).toEqual([original]);

    await user.click(screen.getByRole('button', { name: 'Review Spell' }));
    await user.click(screen.getByRole('button', { name: 'Save Spell' }));

    const stored = loadHomebrewContent(window.localStorage);
    expect(stored).toHaveLength(2);
    expect(stored.find((entry) => entry.id === SEEDED_ID)).toEqual(original);
    const copy = stored.find((entry) => entry.id === duplicateId);
    expect(copy).toMatchObject({
      id: duplicateId,
      kind: 'spell',
      name: 'Seeded Spell Copy',
      source: { type: 'homebrew', namespace: 'local' },
    });
    if (!copy || copy.kind !== 'spell') throw new Error('Expected duplicated Spell.');
    expect(copy.referenceEffects[0].id).not.toBe(original.referenceEffects[0].id);
  });

  it('K Cancel Create persists nothing and Cancel Edit leaves the original unchanged', async () => {
    const user = userEvent.setup();
    const createRender = renderRoutes('/creator-forge/spells/new');
    await user.type(screen.getByLabelText('Spell name'), 'Discard Spell');
    await user.click(screen.getAllByRole('link', { name: 'Cancel' })[0]);
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBeNull();
    createRender.unmount();

    const original = seededSpell();
    expect(saveAndPublishHomebrewContent([original], window.localStorage).ok).toBe(true);
    renderRoutes('/creator-forge/spells/' + encodeURIComponent(SEEDED_ID) + '/edit');
    const name = screen.getByLabelText('Spell name');
    await user.clear(name);
    await user.type(name, 'Unsaved Rename');
    await user.click(screen.getAllByRole('link', { name: 'Cancel' })[0]);
    expect(loadHomebrewContent(window.localStorage)).toEqual([original]);
    expect(contentRegistry.findSpell(SEEDED_ID)?.name).toBe('Seeded Spell');
  });

  it('J canonical whole-dataset rejection keeps Review draft and leaves persistence/publication unchanged', async () => {
    const uuidValues: `${string}-${string}-${string}-${string}-${string}`[] = [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '11111111-1111-4111-8111-111111111111',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '11111111-1111-4111-8111-111111111111',
    ];
    let uuidIndex = 0;
    const uuid = vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => uuidValues[Math.min(uuidIndex++, uuidValues.length - 1)]);
    const user = userEvent.setup();
    try {
      renderRoutes('/creator-forge/spells/new');
      await fillMinimumValidSpell(user, 'Duplicate Rider IDs');
      await user.click(screen.getByRole('button', { name: 'Add Reference-only Effect' }));
      await user.click(screen.getByRole('button', { name: 'Add Reference-only Effect' }));

      const names = screen.getAllByLabelText('Spell reference effect name');
      const descriptions = screen.getAllByLabelText('Spell reference effect description');
      await user.type(names[0], 'First Rider');
      await user.type(descriptions[0], 'First manual rider.');
      await user.type(names[1], 'Second Rider');
      await user.type(descriptions[1], 'Second manual rider.');

      const id = forgeId();
      const beforeRegistry = contentRegistry;
      const beforeRaw = window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY);

      await user.click(screen.getByRole('button', { name: 'Review Spell' }));
      expect(screen.getByRole('heading', { name: 'Review before Save' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Save Spell' }));

      expect(screen.getByRole('heading', { name: 'Review before Save' })).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(/valid canonical dataset|reference effect|duplicate/i);
      expect(contentRegistry).toBe(beforeRegistry);
      expect(contentRegistry.findSpell(id)).toBeUndefined();
      expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBe(beforeRaw);

      await user.click(screen.getByRole('button', { name: 'Back to Edit' }));
      expect(screen.getByLabelText('Spell name')).toHaveValue('Duplicate Rider IDs');
      expect(forgeId()).toBe(id);
    } finally {
      uuid.mockRestore();
    }
  });

  it('J storage failure keeps the Review draft and does not publish or persist the candidate', async () => {
    const user = userEvent.setup();
    renderRoutes('/creator-forge/spells/new');
    await fillMinimumValidSpell(user, 'Quota Spell');
    const id = forgeId();

    await user.click(screen.getByRole('button', { name: 'Review Spell' }));
    const beforeRegistry = contentRegistry;
    const beforeRaw = window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota denied');
    });
    try {
      await user.click(screen.getByRole('button', { name: 'Save Spell' }));
    } finally {
      spy.mockRestore();
    }

    expect(screen.getByRole('heading', { name: 'Review before Save' })).toBeInTheDocument();
    expect(screen.getByText('Quota Spell')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/quota denied|could not be persisted/i);
    expect(contentRegistry).toBe(beforeRegistry);
    expect(contentRegistry.findSpell(id)).toBeUndefined();
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBe(beforeRaw);

    await user.click(screen.getByRole('button', { name: 'Back to Edit' }));
    expect(screen.getByLabelText('Spell name')).toHaveValue('Quota Spell');
    expect(forgeId()).toBe(id);
  });

  it('C fails closed when direct Edit targets a bundled SRD Spell', () => {
    const fireball = contentRegistry.getAll('spell').find((spell) => spell.name === 'Fireball');
    if (!fireball) throw new Error('Expected bundled Fireball.');
    renderRoutes('/creator-forge/spells/' + encodeURIComponent(fireball.id) + '/edit');
    expect(screen.getByRole('heading', { name: 'Spell Forge unavailable' })).toBeInTheDocument();
    expect(screen.getByText(/Bundled SRD Spells are read-only/i)).toBeInTheDocument();
  });
});
