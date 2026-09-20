import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App, { AppRoutes } from '../App';
import {
  buildClassContentFromDraft,
  createClassFeatureDraft,
  createClassForgeDraft,
} from '../components/classForgeModel';
import { initializeContentCatalog, saveAndPublishHomebrewContent } from '../services/contentCatalog';
import { contentRegistry } from '../services/contentRegistry';
import { HOMEBREW_CONTENT_STORAGE_KEY, loadHomebrewContent } from '../services/homebrewContentStorage';

function renderRoutes(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function renderApp(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

function forgeId(): string {
  const values = screen.getAllByText(/^homebrew:local:class:/);
  const value = values[0]?.textContent;
  if (!value) throw new Error('Class Forge ID unavailable.');
  return value;
}

function featureCard(name: string | RegExp = /Unnamed feature|Forge Training/i): HTMLElement {
  const heading = screen.getByRole('heading', { name });
  const card = heading.closest('article');
  if (!card) throw new Error('Class feature card unavailable.');
  return card;
}

function seededClass(name = 'Seeded Class') {
  const base = createClassForgeDraft();
  const feature = {
    ...createClassFeatureDraft(1),
    name: 'Seeded Feature',
    description: 'Seeded Class feature.',
  };
  return buildClassContentFromDraft({ ...base, name, features: [feature] });
}

async function fillMinimumClass(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(screen.getByLabelText('Class name'), name);
  const levelOne = screen.getByRole('article', { name: 'Class level 1' });
  await user.click(within(levelOne).getByRole('button', { name: 'Add Feature' }));
  const card = featureCard();
  await user.type(within(card).getByLabelText('Feature name'), 'Forge Training');
  await user.type(within(card).getByLabelText('Description'), 'Synthetic Class Forge feature.');
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  initializeContentCatalog(window.localStorage);
});

describe('M16-F Creator Forge shell and Class Forge UI', () => {
  it('A activates all four Creator Forge families and routes Classes through the real shell', async () => {
    const user = userEvent.setup();
    renderApp('/creator-forge');

    expect(screen.getByRole('link', { name: 'Feats' })).toHaveAttribute('href', '/creator-forge/feats');
    expect(screen.getByRole('link', { name: 'Spells' })).toHaveAttribute('href', '/creator-forge/spells');
    expect(screen.getByRole('link', { name: 'Subclasses' })).toHaveAttribute('href', '/creator-forge/subclasses');
    expect(screen.getByRole('link', { name: 'Classes' })).toHaveAttribute('href', '/creator-forge/classes');
    expect(screen.queryByText(/Coming later/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Classes' }));
    expect(screen.getByRole('heading', { name: 'Custom Classes' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('link', { name: 'Create Class' })[0]);
    expect(screen.getByRole('heading', { name: 'Create Class' })).toBeInTheDocument();
  });

  it('B lists only custom Classes with useful summary and never exposes unrestricted Delete', () => {
    const custom = seededClass();
    expect(saveAndPublishHomebrewContent([custom], window.localStorage).ok).toBe(true);
    renderRoutes('/creator-forge/classes');

    expect(screen.getByRole('heading', { name: 'Seeded Class' })).toBeInTheDocument();
    expect(screen.getByText(/d8 Hit Die/i)).toBeInTheDocument();
    expect(screen.getByText(/1 feature/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/creator-forge/classes/' + encodeURIComponent(custom.id) + '/edit');
    expect(screen.getByRole('link', { name: 'Duplicate' })).toHaveAttribute('href', '/creator-forge/classes/new?duplicate=' + encodeURIComponent(custom.id));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Fighter' })).not.toBeInTheDocument();
  });

  it('C authors core/proficiency/progression/resource/advancement semantics, reviews without persistence, then saves canonical ClassContent', async () => {
    const user = userEvent.setup();
    renderRoutes('/creator-forge/classes/new');
    const id = forgeId();

    await user.type(screen.getByLabelText('Class name'), 'Forge Adept');
    await user.selectOptions(screen.getByLabelText('Hit Die'), '10');
    await user.clear(screen.getByLabelText('Fixed HP per level'));
    await user.type(screen.getByLabelText('Fixed HP per level'), '6');
    await user.selectOptions(screen.getByLabelText('Multiclass skill choice kind'), 'class-skill-list');
    await user.clear(screen.getByLabelText('Level 1 Weapon Mastery capacity'));
    await user.type(screen.getByLabelText('Level 1 Weapon Mastery capacity'), '2');

    const levelOne = screen.getByRole('article', { name: 'Class level 1' });
    await user.click(within(levelOne).getByRole('button', { name: 'Add Feature' }));
    const card = featureCard();
    await user.type(within(card).getByLabelText('Feature name'), 'Forge Training');
    await user.type(within(card).getByLabelText('Description'), 'Core training.');
    await user.click(within(card).getByText('AUTOMATED — Resources and actions'));
    await user.click(within(card).getByRole('button', { name: 'Add Resource' }));
    await user.type(within(card).getByLabelText('Resource name'), 'Forge Reserve');

    const levelThree = screen.getByRole('article', { name: 'Class level 3' });
    await user.click(within(levelThree).getByRole('button', { name: 'Add Subclass Marker' }));
    const levelFour = screen.getByRole('article', { name: 'Class level 4' });
    await user.click(within(levelFour).getByRole('button', { name: 'Add ASI' }));
    const levelNineteen = screen.getByRole('article', { name: 'Class level 19' });
    await user.click(within(levelNineteen).getByRole('button', { name: 'Add Epic Boon' }));

    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Review Class' }));

    expect(screen.getByRole('heading', { name: 'Review before Save' })).toBeInTheDocument();
    expect(screen.getByText(/20 canonical rows/i)).toBeInTheDocument();
    expect(screen.getByText(/Starting level 1 uses full d10/i)).toBeInTheDocument();
    expect(screen.getByText(/Weapon Mastery capacity is authored as capacity only/i)).toBeInTheDocument();
    expect(screen.getAllByText(/SubclassContent/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/later Wizard-style spellbook gains/i)).toBeInTheDocument();
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Back to Edit' }));
    expect(screen.getByLabelText('Class name')).toHaveValue('Forge Adept');
    expect(forgeId()).toBe(id);

    await user.click(screen.getByRole('button', { name: 'Review Class' }));
    await user.click(screen.getByRole('button', { name: 'Save Class' }));

    expect(await screen.findByRole('heading', { name: 'Custom Classes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Forge Adept' })).toBeInTheDocument();
    const stored = loadHomebrewContent(window.localStorage);
    expect(stored).toHaveLength(1);
    const classContent = stored[0];
    expect(classContent).toMatchObject({
      id,
      kind: 'class',
      name: 'Forge Adept',
      hitDie: 10,
      fixedHitPointsPerLevel: 6,
      source: { type: 'homebrew', namespace: 'local' },
    });
    if (classContent.kind !== 'class') throw new Error('Expected saved Class.');
    expect(classContent.progression).toHaveLength(20);
    expect(classContent.progression[0].weaponMasteryChoices).toBe(2);
    expect(classContent.progression[0].features[0].resources?.[0].name).toBe('Forge Reserve');
    expect(classContent.progression[2].features[0].referenceEffects[0].name).toBe('Subclass Acquisition');
    expect(classContent.progression[3].features[0]).toMatchObject({ name: 'Ability Score Improvement', referenceEffects: [expect.objectContaining({ id: 'feat-acquisition' })] });
    expect(classContent.progression[18].features[0]).toMatchObject({ name: 'Epic Boon', referenceEffects: [expect.objectContaining({ id: 'feat-acquisition' })] });
    expect(contentRegistry.findClass(id)?.name).toBe('Forge Adept');
  }, 30000);

  it('D Edit preserves Class/nested identity and fail-closes structural Character-facing contracts', async () => {
    const original = seededClass();
    expect(saveAndPublishHomebrewContent([original], window.localStorage).ok).toBe(true);
    const user = userEvent.setup();
    renderRoutes('/creator-forge/classes/' + encodeURIComponent(original.id) + '/edit');

    expect(screen.getByLabelText('Hit Die')).toBeDisabled();
    expect(screen.getByLabelText('Primary ability mode')).toBeDisabled();
    expect(screen.getByLabelText('Level 1 Weapon Mastery capacity')).toBeDisabled();
    const card = featureCard('Seeded Feature');
    expect(within(card).getByLabelText('Parent Class level')).toBeDisabled();
    expect(within(card).getByRole('button', { name: 'Identity locked on Edit' })).toBeDisabled();

    const name = screen.getByLabelText('Class name');
    await user.clear(name);
    await user.type(name, 'Renamed Seeded Class');
    await user.click(screen.getByRole('button', { name: 'Review Class' }));
    await user.click(screen.getByRole('button', { name: 'Save Class' }));

    const updated = loadHomebrewContent(window.localStorage).find((entry) => entry.id === original.id);
    expect(updated).toMatchObject({ id: original.id, kind: 'class', name: 'Renamed Seeded Class' });
    if (updated?.kind !== 'class') throw new Error('Expected Class.');
    expect(updated.progression[0].features[0].id).toBe(original.progression[0].features[0].id);
    expect(updated.hitDie).toBe(original.hitDie);
  });

  it('D Duplicate allocates a fresh Class/private feature graph while original remains unchanged until Save', async () => {
    const original = seededClass();
    expect(saveAndPublishHomebrewContent([original], window.localStorage).ok).toBe(true);
    const user = userEvent.setup();
    renderRoutes('/creator-forge/classes/new?duplicate=' + encodeURIComponent(original.id));

    const duplicateId = forgeId();
    expect(duplicateId).not.toBe(original.id);
    expect(screen.getByLabelText('Class name')).toHaveValue('Seeded Class Copy');
    expect(screen.getByLabelText('Hit Die')).not.toBeDisabled();
    expect(loadHomebrewContent(window.localStorage)).toEqual([original]);

    const duplicateFeatureId = within(featureCard('Seeded Feature')).getByText(/^homebrew:local:class-feature:/).textContent;
    expect(duplicateFeatureId).not.toBe(original.progression[0].features[0].id);

    await user.click(screen.getByRole('button', { name: 'Review Class' }));
    await user.click(screen.getByRole('button', { name: 'Save Class' }));
    const stored = loadHomebrewContent(window.localStorage);
    expect(stored).toHaveLength(2);
    expect(stored.find((entry) => entry.id === original.id)).toEqual(original);
    expect(stored.find((entry) => entry.id === duplicateId)).toMatchObject({ kind: 'class', name: 'Seeded Class Copy' });
  });

  it('E Cancel and storage failure preserve persistence, draft state, and the live registry', async () => {
    const user = userEvent.setup();
    const create = renderRoutes('/creator-forge/classes/new');
    await user.type(screen.getByLabelText('Class name'), 'Discard Me');
    await user.click(screen.getAllByRole('link', { name: 'Cancel' })[0]);
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBeNull();
    create.unmount();

    renderRoutes('/creator-forge/classes/new');
    await fillMinimumClass(user, 'Quota Class');
    const id = forgeId();
    await user.click(screen.getByRole('button', { name: 'Review Class' }));
    const beforeRaw = window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota denied');
    });
    try {
      await user.click(screen.getByRole('button', { name: 'Save Class' }));
    } finally {
      spy.mockRestore();
    }

    expect(screen.getByRole('heading', { name: 'Review before Save' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/quota denied|could not be persisted/i);
    expect(contentRegistry.findClass(id)).toBeUndefined();
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBe(beforeRaw);
    await user.click(screen.getByRole('button', { name: 'Back to Edit' }));
    expect(screen.getByLabelText('Class name')).toHaveValue('Quota Class');
    expect(forgeId()).toBe(id);
  }, 30000);
});
