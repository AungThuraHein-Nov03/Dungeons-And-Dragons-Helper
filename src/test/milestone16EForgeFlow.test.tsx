import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App, { AppRoutes } from '../App';
import type { ClassContent, SubclassContent } from '../models/content';
import { initializeContentCatalog, saveAndPublishHomebrewContent } from '../services/contentCatalog';
import { contentRegistry } from '../services/contentRegistry';
import { HOMEBREW_CONTENT_STORAGE_KEY, loadHomebrewContent } from '../services/homebrewContentStorage';

const SEEDED_ID = 'homebrew:local:subclass:m16e-seeded';

function classByName(name: string) {
  const value = contentRegistry.getAll('class').find((entry) => entry.name === name);
  if (!value) throw new Error('Missing Class: ' + name);
  return value;
}

function seededSubclass(name = 'Seeded Subclass'): SubclassContent {
  const fighter = classByName('Fighter');
  return {
    id: SEEDED_ID,
    kind: 'subclass',
    name,
    source: { type: 'homebrew', namespace: 'local' },
    parentClassId: fighter.id,
    acquisitionLevel: 3,
    description: 'Seeded M16-E Subclass.',
    progression: [{
      level: 3,
      features: [{
        id: 'homebrew:local:subclass-feature:m16e-seeded',
        name: 'Seeded Feature',
        description: 'Seeded feature.',
        effects: [{ type: 'initiative-modifier', amount: 1 }],
        resources: [{
          id: 'homebrew:local:class-resource:m16e-seeded',
          name: 'Seeded Charge',
          source: { type: 'homebrew', namespace: 'local' },
          maximum: { kind: 'level-table', values: [{ level: 3, uses: 1 }] },
          recovery: [{ trigger: 'long-rest', mode: 'all' }],
        }],
        referenceEffects: [{
          id: 'homebrew:local:subclass-reference-effect:m16e-seeded',
          name: 'Seeded Note',
          description: 'Manual note.',
        }],
      }],
    }],
  };
}

function renderRoutes(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function renderApp(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

function forgeId(): string {
  const value = screen.getByText(/^homebrew:local:subclass:/).textContent;
  if (!value) throw new Error('Subclass Forge ID was not rendered.');
  return value;
}

function featureCard(name: string | RegExp = /Unnamed feature|Forge Core|Seeded Feature/i): HTMLElement {
  const heading = screen.getByRole('heading', { name });
  const card = heading.closest('article');
  if (!card) throw new Error('Subclass feature card unavailable.');
  return card;
}

async function fillMinimumSubclass(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.selectOptions(screen.getByLabelText('Parent Class'), classByName('Fighter').id);
  await user.type(screen.getByLabelText('Subclass name'), name);
  await user.type(screen.getByLabelText('Subclass description'), 'Synthetic Subclass Forge draft.');
  await user.click(screen.getByRole('button', { name: 'Add Subclass Feature' }));
  const card = featureCard();
  await user.type(within(card).getByLabelText('Feature name'), 'Forge Core');
  await user.type(within(card).getByLabelText('Description'), 'Synthetic feature.');
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  initializeContentCatalog(window.localStorage);
});

describe('M16-E Creator Forge shell and Subclass Forge UI', () => {
  it('A preserves Subclasses while all four Creator Forge families are active after M16-F', async () => {
    const user = userEvent.setup();
    renderApp('/creator-forge');

    expect(screen.getByRole('link', { name: 'Feats' })).toHaveAttribute('href', '/creator-forge/feats');
    expect(screen.getByRole('link', { name: 'Spells' })).toHaveAttribute('href', '/creator-forge/spells');
    expect(screen.getByRole('link', { name: 'Subclasses' })).toHaveAttribute('href', '/creator-forge/subclasses');

    expect(screen.getByRole('link', { name: 'Classes' })).toHaveAttribute('href', '/creator-forge/classes');

    await user.click(screen.getByRole('link', { name: 'Subclasses' }));
    expect(screen.getByRole('heading', { name: 'Custom Subclasses' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('link', { name: 'Create Subclass' })[0]);
    expect(screen.getByRole('heading', { name: 'Create Subclass' })).toBeInTheDocument();
  });

  it('B lists only custom Subclasses with parent/acquisition/count and bounded M16-G Delete', () => {
    expect(saveAndPublishHomebrewContent([seededSubclass()], window.localStorage).ok).toBe(true);
    renderRoutes('/creator-forge/subclasses');

    expect(screen.getByRole('heading', { name: 'Seeded Subclass' })).toBeInTheDocument();
    expect(screen.getByText(/Fighter · Class level 3 · 1 feature/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/creator-forge/subclasses/' + encodeURIComponent(SEEDED_ID) + '/edit');
    expect(screen.getByRole('link', { name: 'Duplicate' })).toHaveAttribute('href', '/creator-forge/subclasses/new?duplicate=' + encodeURIComponent(SEEDED_ID));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Champion' })).not.toBeInTheDocument();
  });

  it('B empty state clearly offers Create Subclass', () => {
    renderRoutes('/creator-forge/subclasses');
    expect(screen.getByRole('heading', { name: 'No custom Subclasses yet' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Create Subclass' }).length).toBeGreaterThan(0);
  });

  it('C-N authors bounded feature mechanics through the UI, reviews semantically without persistence, then saves canonical SubclassContent', async () => {
    const user = userEvent.setup();
    renderRoutes('/creator-forge/subclasses/new');
    const id = forgeId();

    await fillMinimumSubclass(user, 'Forge Vanguard');
    const card = featureCard('Forge Core');

    await user.selectOptions(within(card).getByLabelText('Static effect'), 'initiative-modifier');
    await user.click(within(card).getByRole('button', { name: 'Add Static Effect' }));
    await user.selectOptions(within(card).getByLabelText('Dice transformation'), 'reroll-once-use-new');
    await user.click(within(card).getByRole('button', { name: 'Add Dice Transformation' }));

    await user.click(within(card).getByText('AUTOMATED — Resources and actions'));
    await user.click(within(card).getByRole('button', { name: 'Add Resource' }));
    await user.type(within(card).getByLabelText('Resource name'), 'Forge Charge');

    await user.click(within(card).getByRole('button', { name: 'Add Consumer' }));
    await user.type(within(card).getByLabelText('Action name'), 'Forge Burst');

    await user.click(within(card).getByRole('button', { name: 'Add Transaction' }));
    const transactionName = within(card).getAllByLabelText('Name').find((input) => input.closest('article')?.textContent?.includes('Automated Transaction'));
    if (!transactionName) throw new Error('Transaction name input unavailable.');
    await user.type(transactionName, 'Forge Renewal');

    await user.click(within(card).getByRole('button', { name: 'Add Active Self Effect' }));
    const selfEffectArticle = within(card).getByText('Automated Self Effect').closest('article');
    if (!selfEffectArticle) throw new Error('Active self effect editor unavailable.');
    await user.type(within(selfEffectArticle).getByLabelText('Name'), 'Forge Stance');
    await user.type(within(selfEffectArticle).getByLabelText('Description'), 'Advantage while the stance is active.');

    await user.click(within(card).getByText('AUTOMATED — Subclass Spellcasting'));
    await user.click(within(card).getByRole('button', { name: 'Add Spellcasting Provider' }));
    await user.type(within(card).getByLabelText('Provider name'), 'Forge Casting');
    await user.selectOptions(within(card).getByLabelText('Spellcasting ability'), 'intelligence');
    await user.selectOptions(within(card).getByLabelText('Multiclass slot contribution'), 'third-down');

    await user.click(within(card).getByRole('button', { name: 'Add Granted Spells' }));
    const grantSelect = within(card).getByLabelText('Granted Spells');
    const grantOption = [...(grantSelect as HTMLSelectElement).options].find((option) => option.text.includes('Magic Missile'))
      ?? (grantSelect as HTMLSelectElement).options[0];
    await user.selectOptions(grantSelect, grantOption.value);

    await user.click(within(card).getByText('MANUAL / REFERENCE'));
    await user.click(within(card).getByRole('button', { name: 'Add Manual / Reference Effect' }));
    const manualArticle = within(card).getByText('Manual / Reference', { selector: '.source-badge' }).closest('article');
    if (!manualArticle) throw new Error('Reference editor unavailable.');
    await user.type(within(manualArticle).getByLabelText('Name'), 'Manual Rider');
    await user.type(within(manualArticle).getByLabelText('Description'), 'Table-managed rider only.');

    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Review Subclass' }));

    expect(screen.getByRole('heading', { name: 'Review before Save' })).toBeInTheDocument();
    expect(screen.getByText('Forge Vanguard')).toBeInTheDocument();
    expect(screen.getByText(/Feature owner level is the parent Class progression level/i)).toBeInTheDocument();
    expect(screen.getAllByText('AUTOMATED').length).toBeGreaterThan(0);
    expect(screen.getAllByText('MANUAL / REFERENCE').length).toBeGreaterThan(0);
    expect(screen.getByText(/Resource: Forge Charge/i)).toBeInTheDocument();
    expect(screen.getByText(/Action: Forge Burst/i)).toBeInTheDocument();
    expect(screen.getByText(/Provider: Forge Casting/i)).toBeInTheDocument();
    expect(screen.getByText('Manual Rider')).toBeInTheDocument();
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Back to Edit' }));
    expect(screen.getByLabelText('Subclass name')).toHaveValue('Forge Vanguard');
    expect(forgeId()).toBe(id);

    await user.click(screen.getByRole('button', { name: 'Review Subclass' }));
    await user.click(screen.getByRole('button', { name: 'Save Subclass' }));

    expect(screen.getByRole('heading', { name: 'Custom Subclasses' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Forge Vanguard' })).toBeInTheDocument();
    const stored = loadHomebrewContent(window.localStorage);
    expect(stored).toHaveLength(1);
    const subclass = stored[0];
    expect(subclass).toMatchObject({
      id,
      kind: 'subclass',
      name: 'Forge Vanguard',
      source: { type: 'homebrew', namespace: 'local' },
      parentClassId: classByName('Fighter').id,
      acquisitionLevel: 3,
    });
    if (subclass.kind !== 'subclass') throw new Error('Expected saved Subclass.');
    const feature = subclass.progression[0].features[0];
    expect(feature.effects.map((effect) => effect.type)).toEqual(['initiative-modifier', 'dice-transformation']);
    expect(feature.resources?.[0].name).toBe('Forge Charge');
    expect(feature.resourceConsumers?.[0].consumer.name).toBe('Forge Burst');
    expect(feature.resourceTransactions?.[0].name).toBe('Forge Renewal');
    expect(feature.activeSelfEffects?.[0].name).toBe('Forge Stance');
    expect(feature.spellcasting?.[0].name).toBe('Forge Casting');
    expect(feature.spellGrants?.[0].spellIds.length).toBeGreaterThan(0);
    expect(feature.referenceEffects[0].name).toBe('Manual Rider');
    expect(contentRegistry.findSubclass(id)?.name).toBe('Forge Vanguard');
  }, 30000);

  it('D supports an effective custom parent Class selector while M16-G unlocks parent Edit but preserves nested identity locks', async () => {
    const fighter = classByName('Fighter');
    const customParent: ClassContent = {
      ...structuredClone(fighter),
      id: 'homebrew:local:class:m16e-custom-parent',
      name: 'Custom Parent',
      source: { type: 'homebrew', namespace: 'local' },
    };
    expect(saveAndPublishHomebrewContent([customParent], window.localStorage).ok).toBe(true);

    const user = userEvent.setup();
    const create = renderRoutes('/creator-forge/subclasses/new');
    const parent = screen.getByLabelText('Parent Class') as HTMLSelectElement;
    expect([...parent.options].some((option) => option.value === customParent.id && option.text.includes('Custom Parent'))).toBe(true);
    create.unmount();

    const seeded = seededSubclass();
    expect(saveAndPublishHomebrewContent([customParent, seeded], window.localStorage).ok).toBe(true);
    renderRoutes('/creator-forge/subclasses/' + encodeURIComponent(SEEDED_ID) + '/edit');

    expect(screen.getByLabelText('Parent Class')).not.toBeDisabled();
    expect(screen.getByLabelText('Subclass acquisition level')).toBeDisabled();
    const card = featureCard('Seeded Feature');
    expect(within(card).getByLabelText('Parent Class level')).toBeDisabled();
    expect(within(card).getAllByRole('button', { name: 'Identity locked on Edit' }).every((button) => button.hasAttribute('disabled'))).toBe(true);

    const original = loadHomebrewContent(window.localStorage).find((entry) => entry.id === SEEDED_ID);
    const name = screen.getByLabelText('Subclass name');
    await user.clear(name);
    await user.type(name, 'Renamed Seeded Subclass');
    await user.click(screen.getByRole('button', { name: 'Review Subclass' }));
    await user.click(screen.getByRole('button', { name: 'Save Subclass' }));
    const updated = loadHomebrewContent(window.localStorage).find((entry) => entry.id === SEEDED_ID);
    expect(updated).toMatchObject({
      id: SEEDED_ID,
      kind: 'subclass',
      name: 'Renamed Seeded Subclass',
      parentClassId: fighter.id,
      acquisitionLevel: 3,
    });
    if (original?.kind !== 'subclass' || updated?.kind !== 'subclass') throw new Error('Expected Subclass fixtures.');
    expect(updated.progression[0].features[0].id).toBe(original.progression[0].features[0].id);
    expect(updated.progression[0].features[0].resources?.[0].id).toBe(original.progression[0].features[0].resources?.[0].id);
  });

  it('D fail-closes persisted Spell-grant provider/spell references during Edit', () => {
    const spellId = contentRegistry.getAll('spell')[0]?.id;
    if (!spellId) throw new Error('Expected a Spell fixture.');
    const providerId = 'homebrew:local:spellcasting-provider:m16e-seeded';
    const base = seededSubclass('Seeded Casting Subclass');
    const subclass: SubclassContent = {
      ...base,
      progression: base.progression.map((row) => ({
        ...row,
        features: row.features.map((feature) => ({
          ...feature,
          spellcasting: [{
            id: providerId,
            name: 'Seeded Casting',
            spellcastingAbility: { kind: 'fixed', ability: 'intelligence' },
            multiclassSlotContribution: { kind: 'independent' },
            spellManagement: { kind: 'granted-only', spellIds: [spellId] },
            ritualCasting: 'none',
          }],
          spellGrants: [{
            providerId,
            spellIds: [spellId],
            status: 'always-prepared',
            minimumLevel: 3,
          }],
        })),
      })),
    };
    expect(saveAndPublishHomebrewContent([subclass], window.localStorage).ok).toBe(true);

    renderRoutes('/creator-forge/subclasses/' + encodeURIComponent(SEEDED_ID) + '/edit');

    expect(screen.getByRole('button', { name: 'Grant references locked on Edit' })).toBeDisabled();
    expect(screen.getByLabelText('Provider')).toBeDisabled();
    expect(screen.getByLabelText('Minimum owner level')).toBeDisabled();
    expect(screen.getByLabelText('Granted Spells')).toBeDisabled();
    expect(screen.getByLabelText('Multiclass slot contribution')).toBeDisabled();
    expect(screen.getByLabelText('Spell management')).toBeDisabled();
  });

  it('C duplicate allocates a new Subclass/nested feature identity and leaves the original unchanged until Save', async () => {
    const original = seededSubclass();
    expect(saveAndPublishHomebrewContent([original], window.localStorage).ok).toBe(true);
    const user = userEvent.setup();
    renderRoutes('/creator-forge/subclasses/new?duplicate=' + encodeURIComponent(SEEDED_ID));

    const duplicateId = forgeId();
    expect(duplicateId).not.toBe(SEEDED_ID);
    expect(screen.getByLabelText('Subclass name')).toHaveValue('Seeded Subclass Copy');
    expect(screen.getByLabelText('Parent Class')).toBeDisabled();
    expect(loadHomebrewContent(window.localStorage)).toEqual([original]);

    const duplicatedFeatureId = within(featureCard('Seeded Feature')).getByText(/^homebrew:local:subclass-feature:/).textContent;
    expect(duplicatedFeatureId).not.toBe(original.progression[0].features[0].id);

    await user.click(screen.getByRole('button', { name: 'Review Subclass' }));
    await user.click(screen.getByRole('button', { name: 'Save Subclass' }));
    const stored = loadHomebrewContent(window.localStorage);
    expect(stored).toHaveLength(2);
    expect(stored.find((entry) => entry.id === SEEDED_ID)).toEqual(original);
    expect(stored.find((entry) => entry.id === duplicateId)).toMatchObject({ name: 'Seeded Subclass Copy' });
  });

  it('O Cancel Create/Edit and storage failure preserve persistence and the live registry', async () => {
    const user = userEvent.setup();
    const create = renderRoutes('/creator-forge/subclasses/new');
    await user.type(screen.getByLabelText('Subclass name'), 'Discard Me');
    await user.click(screen.getAllByRole('link', { name: 'Cancel' })[0]);
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBeNull();
    create.unmount();

    const original = seededSubclass();
    expect(saveAndPublishHomebrewContent([original], window.localStorage).ok).toBe(true);
    const edit = renderRoutes('/creator-forge/subclasses/' + encodeURIComponent(SEEDED_ID) + '/edit');
    const name = screen.getByLabelText('Subclass name');
    await user.clear(name);
    await user.type(name, 'Unsaved Rename');
    await user.click(screen.getAllByRole('link', { name: 'Cancel' })[0]);
    expect(loadHomebrewContent(window.localStorage)).toEqual([original]);
    edit.unmount();

    renderRoutes('/creator-forge/subclasses/new');
    await fillMinimumSubclass(user, 'Quota Subclass');
    const id = forgeId();
    await user.click(screen.getByRole('button', { name: 'Review Subclass' }));
    const beforeRegistry = contentRegistry;
    const beforeRaw = window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota denied');
    });
    try {
      await user.click(screen.getByRole('button', { name: 'Save Subclass' }));
    } finally {
      spy.mockRestore();
    }
    expect(screen.getByRole('heading', { name: 'Review before Save' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/quota denied|could not be persisted/i);
    expect(contentRegistry).toBe(beforeRegistry);
    expect(contentRegistry.findSubclass(id)).toBeUndefined();
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBe(beforeRaw);
    await user.click(screen.getByRole('button', { name: 'Back to Edit' }));
    expect(screen.getByLabelText('Subclass name')).toHaveValue('Quota Subclass');
    expect(forgeId()).toBe(id);
  });

  it('O canonical rejection preserves the Review draft without publication', async () => {
    const values = [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      '11111111-1111-4111-8111-111111111111',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      '11111111-1111-4111-8111-111111111111',
    ];
    let index = 0;
    const uuid = vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => values[Math.min(index++, values.length - 1)] as ReturnType<typeof globalThis.crypto.randomUUID>);
    const user = userEvent.setup();
    try {
      renderRoutes('/creator-forge/subclasses/new');
      await fillMinimumSubclass(user, 'Duplicate References');
      const card = featureCard('Forge Core');
      await user.click(within(card).getByText('MANUAL / REFERENCE'));
      await user.click(within(card).getByRole('button', { name: 'Add Manual / Reference Effect' }));
      await user.click(within(card).getByRole('button', { name: 'Add Manual / Reference Effect' }));

      const manualArticles = within(card).getAllByText('Manual / Reference', { selector: '.source-badge' }).map((badge) => badge.closest('article')).filter((article): article is HTMLElement => Boolean(article));
      expect(manualArticles).toHaveLength(2);
      await user.type(within(manualArticles[0]).getByLabelText('Name'), 'First');
      await user.type(within(manualArticles[0]).getByLabelText('Description'), 'First manual.');
      await user.type(within(manualArticles[1]).getByLabelText('Name'), 'Second');
      await user.type(within(manualArticles[1]).getByLabelText('Description'), 'Second manual.');

      const id = forgeId();
      const beforeRegistry = contentRegistry;
      await user.click(screen.getByRole('button', { name: 'Review Subclass' }));
      await user.click(screen.getByRole('button', { name: 'Save Subclass' }));
      expect(screen.getByRole('heading', { name: 'Review before Save' })).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(/valid canonical dataset|duplicate|reference/i);
      expect(contentRegistry).toBe(beforeRegistry);
      expect(contentRegistry.findSubclass(id)).toBeUndefined();
      await user.click(screen.getByRole('button', { name: 'Back to Edit' }));
      expect(screen.getByLabelText('Subclass name')).toHaveValue('Duplicate References');
    } finally {
      uuid.mockRestore();
    }
  });
});
