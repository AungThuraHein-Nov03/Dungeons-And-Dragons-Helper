import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App, { AppRoutes } from '../App';
import type { FeatContent } from '../models/content';
import { initializeContentCatalog, saveAndPublishHomebrewContent } from '../services/contentCatalog';
import { contentRegistry } from '../services/contentRegistry';
import {
  HOMEBREW_CONTENT_STORAGE_KEY,
  loadHomebrewContent,
} from '../services/homebrewContentStorage';

const SEEDED_ID = 'homebrew:local:feat:m16c-seeded';

function seededFeat(name = 'Seeded Feat'): FeatContent {
  return {
    id: SEEDED_ID,
    kind: 'feat',
    name,
    source: { type: 'homebrew', namespace: 'local' },
    category: 'general',
    prerequisites: [{ type: 'level', minimum: 4 }],
    repeatable: false,
    choices: [],
    effects: [{ type: 'initiative-modifier', amount: 1 }],
    referenceEffects: [],
    description: 'Seeded M16-C custom Feat.',
  };
}

function renderRoutes(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function renderApp(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

function forgeId(): string {
  const value = screen.getByText(/^homebrew:local:feat:/).textContent;
  if (!value) throw new Error('Feat Forge ID was not rendered.');
  return value;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  initializeContentCatalog(window.localStorage);
});

describe('M16-C Creator Forge shell and Feat Forge UI', () => {
  it('A routes Creator Forge through the real shell with Feats preserved while later families follow the current Forge shell', async () => {
    const user = userEvent.setup();
    renderApp('/creator-forge');

    expect(screen.getByRole('link', { name: 'Creator Forge' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Custom Content' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Feats' })).toHaveAttribute('href', '/creator-forge/feats');
    expect(screen.getByRole('link', { name: 'Spells' })).toHaveAttribute('href', '/creator-forge/spells');
    expect(screen.getByRole('link', { name: 'Subclasses' })).toHaveAttribute('href', '/creator-forge/subclasses');

    expect(screen.getByRole('link', { name: 'Classes' })).toHaveAttribute('href', '/creator-forge/classes');

    await user.click(screen.getByRole('link', { name: 'Feats' }));
    expect(screen.getByRole('heading', { name: 'Custom Feats' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('link', { name: 'Create Feat' })[0]);
    expect(screen.getByRole('heading', { name: 'Create Feat' })).toBeInTheDocument();
  });

  it('B lists only custom Feats with Create/Edit/Duplicate and exposes no unrestricted Delete', () => {
    expect(saveAndPublishHomebrewContent([seededFeat()], window.localStorage).ok).toBe(true);
    renderRoutes('/creator-forge/feats');

    expect(screen.getByRole('heading', { name: 'Seeded Feat' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/creator-forge/feats/' + encodeURIComponent(SEEDED_ID) + '/edit',
    );
    expect(screen.getByRole('link', { name: 'Duplicate' })).toHaveAttribute(
      'href',
      '/creator-forge/feats/new?duplicate=' + encodeURIComponent(SEEDED_ID),
    );
    expect(screen.getByRole('link', { name: 'Create Feat' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Alert' })).not.toBeInTheDocument();
  });

  it('B empty state clearly offers Create Feat', () => {
    renderRoutes('/creator-forge/feats');
    expect(screen.getByRole('heading', { name: 'No custom Feats yet' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Create Feat' }).length).toBeGreaterThan(0);
  });

  it('C/D/E creates a canonical Feat through the UI, reviews semantics without persistence, then saves and reloads the same identity', async () => {
    const user = userEvent.setup();
    renderRoutes('/creator-forge/feats/new');

    const id = forgeId();
    expect(id).toMatch(/^homebrew:local:feat:/);
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBeNull();

    await user.type(screen.getByLabelText('Feat name'), 'Forge Marksman');
    await user.type(screen.getByLabelText('Feat description'), 'A bounded custom Feat authored through Creator Forge.');
    await user.selectOptions(screen.getByLabelText('Feat category'), 'general');
    await user.click(screen.getByLabelText('Repeatable'));
    await user.type(screen.getByLabelText('Repeatability note'), 'May be selected repeatedly for testing.');

    await user.click(screen.getByRole('button', { name: 'Add Level Prerequisite' }));
    await user.click(screen.getByRole('button', { name: 'Add Ability Prerequisite' }));
    await user.click(screen.getByLabelText('Dexterity'));
    await user.click(screen.getByRole('button', { name: 'Add Reference-only Feature Prerequisite' }));
    await user.type(screen.getByLabelText('Reference-only feature prerequisite'), 'Combat Training');

    await user.click(screen.getByLabelText('Enable structured Ability Score Increase'));
    await user.selectOptions(screen.getByLabelText('ASI selections'), '2');
    await user.click(screen.getByLabelText('Allow selecting the same ability twice'));

    await user.selectOptions(screen.getByLabelText('New automated effect type'), 'attack-roll-bonus');
    await user.click(screen.getByRole('button', { name: 'Add Automated Effect' }));

    await user.selectOptions(screen.getByLabelText('New dice transformation type'), 'reroll-once-use-new');
    await user.click(screen.getByRole('button', { name: 'Add Dice Transformation' }));

    await user.click(screen.getByRole('button', { name: 'Add Reference-only Effect' }));
    await user.type(screen.getByLabelText('Reference effect name'), 'Called Shot');
    await user.type(screen.getByLabelText('Reference effect description'), 'A table-managed rider with no automatic target state.');

    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Review Feat' }));

    expect(screen.getByRole('heading', { name: 'Review before Save' })).toBeInTheDocument();
    expect(screen.getByText('Forge Marksman')).toBeInTheDocument();
    expect(screen.getByText(/Combat Training.*reference only.*not automatically evaluated/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Existing rules engine' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Table-managed mechanics' })).toBeInTheDocument();
    expect(screen.getByText(/Ranged Attack Roll Bonus/i)).toBeInTheDocument();
    expect(screen.getByText(/Reroll D20 Once/i)).toBeInTheDocument();
    expect(screen.getByText('Called Shot')).toBeInTheDocument();
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Back to Edit' }));
    expect(screen.getByLabelText('Feat name')).toHaveValue('Forge Marksman');
    expect(screen.getByLabelText('Reference effect name')).toHaveValue('Called Shot');
    expect(forgeId()).toBe(id);

    await user.click(screen.getByRole('button', { name: 'Review Feat' }));
    await user.click(screen.getByRole('button', { name: 'Save Feat' }));

    expect(await screen.findByRole('heading', { name: 'Custom Feats' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Forge Marksman' })).toBeInTheDocument();

    const stored = loadHomebrewContent(window.localStorage);
    expect(stored).toHaveLength(1);
    const feat = stored[0];
    expect(feat).toMatchObject({
      id,
      kind: 'feat',
      name: 'Forge Marksman',
      source: { type: 'homebrew', namespace: 'local' },
      category: 'general',
      repeatable: true,
    });
    expect(feat.kind === 'feat' && feat.prerequisites).toEqual([
      { type: 'level', minimum: 4 },
      { type: 'ability-minimum', abilities: ['strength', 'dexterity'], minimum: 13 },
      { type: 'feature', name: 'Combat Training', support: 'reference-only' },
    ]);
    expect(feat.kind === 'feat' && feat.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'ability-score-increase', selections: 2, allowDuplicateSelection: true }),
      { type: 'attack-roll-bonus', weaponMode: 'ranged', amount: 1 },
      expect.objectContaining({ type: 'dice-transformation', transformation: expect.objectContaining({ type: 'reroll-once-use-new' }) }),
    ]));
    expect(contentRegistry.findFeat(id)?.name).toBe('Forge Marksman');

    expect(initializeContentCatalog(window.localStorage).ok).toBe(true);
    expect(contentRegistry.findFeat(id)?.id).toBe(id);
    expect(contentRegistry.findFeat(id)?.name).toBe('Forge Marksman');
  });

  it('F Edit preserves ContentId/source/kind while rename publishes through the existing authority', async () => {
    const user = userEvent.setup();
    expect(saveAndPublishHomebrewContent([seededFeat()], window.localStorage).ok).toBe(true);
    renderRoutes('/creator-forge/feats/' + encodeURIComponent(SEEDED_ID) + '/edit');

    expect(screen.getByRole('heading', { name: 'Edit Feat' })).toBeInTheDocument();
    expect(forgeId()).toBe(SEEDED_ID);
    expect(screen.getByText('Homebrew · local')).toBeInTheDocument();

    const name = screen.getByLabelText('Feat name');
    await user.clear(name);
    await user.type(name, 'Renamed Seeded Feat');
    await user.click(screen.getByRole('button', { name: 'Review Feat' }));
    expect(forgeId()).toBe(SEEDED_ID);
    await user.click(screen.getByRole('button', { name: 'Save Feat' }));

    const stored = loadHomebrewContent(window.localStorage);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id: SEEDED_ID,
      kind: 'feat',
      name: 'Renamed Seeded Feat',
      source: { type: 'homebrew', namespace: 'local' },
    });
    expect(contentRegistry.findFeat(SEEDED_ID)?.name).toBe('Renamed Seeded Feat');
  });

  it('G Duplicate receives a new ContentId, leaves the original unchanged, and both coexist after Save', async () => {
    const user = userEvent.setup();
    const original = seededFeat();
    expect(saveAndPublishHomebrewContent([original], window.localStorage).ok).toBe(true);

    renderRoutes('/creator-forge/feats/new?duplicate=' + encodeURIComponent(SEEDED_ID));
    expect(screen.getByRole('heading', { name: 'Duplicate Feat' })).toBeInTheDocument();
    const duplicateId = forgeId();
    expect(duplicateId).not.toBe(SEEDED_ID);
    expect(screen.getByLabelText('Feat name')).toHaveValue('Seeded Feat Copy');
    expect(loadHomebrewContent(window.localStorage)).toEqual([original]);

    await user.click(screen.getByRole('button', { name: 'Review Feat' }));
    await user.click(screen.getByRole('button', { name: 'Save Feat' }));

    const stored = loadHomebrewContent(window.localStorage);
    expect(stored).toHaveLength(2);
    expect(stored.find((entry) => entry.id === SEEDED_ID)).toEqual(original);
    expect(stored.find((entry) => entry.id === duplicateId)).toMatchObject({
      id: duplicateId,
      kind: 'feat',
      name: 'Seeded Feat Copy',
      source: { type: 'homebrew', namespace: 'local' },
    });
  });

  it('J Cancel Create persists nothing and Cancel Edit does not modify the original', async () => {
    const user = userEvent.setup();
    const createRender = renderRoutes('/creator-forge/feats/new');
    await user.type(screen.getByLabelText('Feat name'), 'Discard Me');
    await user.type(screen.getByLabelText('Feat description'), 'This draft must remain ephemeral.');
    await user.click(screen.getAllByRole('link', { name: 'Cancel' })[0]);
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBeNull();
    createRender.unmount();

    const original = seededFeat();
    expect(saveAndPublishHomebrewContent([original], window.localStorage).ok).toBe(true);
    renderRoutes('/creator-forge/feats/' + encodeURIComponent(SEEDED_ID) + '/edit');
    const name = screen.getByLabelText('Feat name');
    await user.clear(name);
    await user.type(name, 'Unsaved Rename');
    await user.click(screen.getAllByRole('link', { name: 'Cancel' })[0]);
    expect(loadHomebrewContent(window.localStorage)).toEqual([original]);
    expect(contentRegistry.findFeat(SEEDED_ID)?.name).toBe('Seeded Feat');
  });

  it('E canonical whole-dataset rejection keeps the Review draft and leaves persistence/publication unchanged', async () => {
    const user = userEvent.setup();
    renderRoutes('/creator-forge/feats/new');

    await user.type(screen.getByLabelText('Feat name'), 'Invalid Speed');
    await user.type(screen.getByLabelText('Feat description'), 'Local UX reaches Review, canonical validation remains Save authority.');
    await user.selectOptions(screen.getByLabelText('New automated effect type'), 'speed-bonus');
    await user.click(screen.getByRole('button', { name: 'Add Automated Effect' }));
    const speed = screen.getByLabelText('Speed bonus (feet)');
    await user.clear(speed);
    await user.type(speed, '1.5');

    const id = forgeId();
    const beforeRegistry = contentRegistry;
    const beforeRaw = window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY);
    await user.click(screen.getByRole('button', { name: 'Review Feat' }));
    expect(screen.getByRole('heading', { name: 'Review before Save' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save Feat' }));

    expect(screen.getByRole('heading', { name: 'Review before Save' })).toBeInTheDocument();
    expect(screen.getByText('Invalid Speed')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/valid canonical dataset|speed bonus|homebrew content/i);
    expect(contentRegistry).toBe(beforeRegistry);
    expect(contentRegistry.findFeat(id)).toBeUndefined();
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBe(beforeRaw);

    await user.click(screen.getByRole('button', { name: 'Back to Edit' }));
    expect(screen.getByLabelText('Feat name')).toHaveValue('Invalid Speed');
    expect(screen.getByLabelText('Speed bonus (feet)')).toHaveValue(1.5);
    expect(forgeId()).toBe(id);
  });

  it('E/J storage failure keeps the Review draft and does not publish or persist the candidate', async () => {
    const user = userEvent.setup();
    renderRoutes('/creator-forge/feats/new');

    await user.type(screen.getByLabelText('Feat name'), 'Quota Survivor');
    await user.type(screen.getByLabelText('Feat description'), 'Draft survives a storage failure.');
    const id = forgeId();
    await user.click(screen.getByRole('button', { name: 'Review Feat' }));

    const beforeRegistry = contentRegistry;
    const beforeRaw = window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota denied');
    });
    try {
      await user.click(screen.getByRole('button', { name: 'Save Feat' }));
    } finally {
      spy.mockRestore();
    }

    expect(screen.getByRole('heading', { name: 'Review before Save' })).toBeInTheDocument();
    expect(screen.getByText('Quota Survivor')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be persisted|quota denied/i);
    expect(contentRegistry).toBe(beforeRegistry);
    expect(contentRegistry.findFeat(id)).toBeUndefined();
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBe(beforeRaw);

    await user.click(screen.getByRole('button', { name: 'Back to Edit' }));
    expect(screen.getByLabelText('Feat name')).toHaveValue('Quota Survivor');
    expect(forgeId()).toBe(id);
  });
});
