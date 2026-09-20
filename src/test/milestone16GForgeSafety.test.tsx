import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import App, { AppRoutes } from '../App';
import {
  buildClassContentFromDraft,
  createClassFeatureDraft,
  createClassForgeDraft,
  createClassProviderDraft,
  createClassSpellGrantDraft,
} from '../components/classForgeModel';
import { buildFeatContentFromDraft, createFeatForgeDraft } from '../components/featForgeModel';
import { buildSpellContentFromDraft, createSpellForgeDraft } from '../components/spellForgeModel';
import {
  buildSubclassContentFromDraft,
  createSubclassFeatureDraft,
  createSubclassForgeDraft,
  createSubclassProviderDraft,
  createSubclassSpellGrantDraft,
} from '../components/subclassForgeModel';
import type { ClassContent, SpellContent, SubclassContent } from '../models/content';
import {
  deleteAndPublishHomebrewContent,
  initializeContentCatalog,
  saveAndPublishHomebrewContent,
} from '../services/contentCatalog';
import { contentRegistry } from '../services/contentRegistry';
import { CHARACTER_STORAGE_KEY, createCharacter } from '../services/characterStorage';
import { HOMEBREW_CONTENT_STORAGE_KEY, loadHomebrewContent } from '../services/homebrewContentStorage';
import { srdId } from '../content/srd';
import { fighterInput, FIGHTER_ID } from './fixtures';

function renderRoutes(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function renderApp(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

function cardByHeading(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { name });
  const card = heading.closest('article');
  if (!card) throw new Error('Missing card for ' + name);
  return card;
}

function simpleFeat(name: string) {
  const draft = createFeatForgeDraft();
  return buildFeatContentFromDraft({ ...draft, name, description: 'M16-G dependency fixture.' });
}

function simpleSpell(name: string): SpellContent {
  const draft = createSpellForgeDraft();
  return buildSpellContentFromDraft({
    ...draft,
    name,
    description: 'M16-G dependency fixture.',
    spellLists: [{ id: 'wizard', name: 'Wizard' }],
  });
}

function simpleClass(name: string): ClassContent {
  const fighter = contentRegistry.findClass(FIGHTER_ID);
  if (!fighter) throw new Error('Missing Fighter.');
  return {
    ...structuredClone(fighter),
    id: 'homebrew:local:class:' + name.toLowerCase().replaceAll(' ', '-'),
    name,
    source: { type: 'homebrew', namespace: 'local' },
  };
}

function spellGrantClass(name: string, spell: SpellContent): ClassContent {
  const base = createClassForgeDraft();
  const providerBase = createClassProviderDraft(1, 'wizard');
  const provider = { ...providerBase, definition: { ...providerBase.definition, name: name + ' Casting' } };
  const feature = {
    ...createClassFeatureDraft(1),
    name: name + ' Core',
    description: 'M16-G Spell dependency.',
    providers: [provider],
    spellGrants: [createClassSpellGrantDraft(provider.definition.id, spell.id, 1)],
  };
  return buildClassContentFromDraft({ ...base, name, features: [feature] });
}

function subclass(
  parentClassId: string,
  name: string,
  grantedSpell?: SpellContent,
): SubclassContent {
  const base = createSubclassForgeDraft(contentRegistry, parentClassId);
  let feature = {
    ...createSubclassFeatureDraft(3),
    name: name + ' Core',
    description: 'M16-G dependency fixture.',
  };
  if (grantedSpell) {
    const providerBase = createSubclassProviderDraft(3, 'wizard');
    const provider = { ...providerBase, definition: { ...providerBase.definition, name: name + ' Casting' } };
    feature = {
      ...feature,
      providers: [provider],
      spellGrants: [createSubclassSpellGrantDraft(provider.definition.id, grantedSpell.id, 3)],
    };
  }
  return buildSubclassContentFromDraft({
    ...base,
    name,
    description: 'M16-G dependency fixture.',
    parentClassId,
    acquisitionLevel: 3,
    features: [feature],
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  initializeContentCatalog(window.localStorage);
});

describe('M16-G routed referential-integrity acceptance', () => {
  it('creates an unused Feat through the real Forge UI, preflights, confirms, and deletes it live', async () => {
    const user = userEvent.setup();
    renderRoutes('/creator-forge/feats/new');

    await user.type(screen.getByLabelText('Feat name'), 'Disposable Feat');
    await user.type(screen.getByLabelText('Feat description'), 'Created and deleted through M16-G UI.');
    await user.click(screen.getByRole('button', { name: 'Review Feat' }));
    await user.click(screen.getByRole('button', { name: 'Save Feat' }));

    expect(await screen.findByRole('heading', { name: 'Custom Feats' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Disposable Feat' })).toBeInTheDocument();
    const id = loadHomebrewContent(window.localStorage)[0]?.id;
    expect(id).toMatch(/^homebrew:local:feat:/);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Delete "Disposable Feat"?' })).toBeInTheDocument();
    expect(screen.getByText(/Safe preflight/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm Delete' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm Delete' }));
    expect(screen.getByRole('heading', { name: 'No custom Feats yet' })).toBeInTheDocument();
    expect(loadHomebrewContent(window.localStorage)).toEqual([]);
    expect(contentRegistry.findFeat(id!)).toBeUndefined();
  }, 30000);

  it('shows useful blockers when a custom Spell is referenced by both a custom Class and Subclass', async () => {
    const target = simpleSpell('Forge Lance');
    const ownerClass = spellGrantClass('Gregorymancer', target);
    expect(saveAndPublishHomebrewContent([target, ownerClass], window.localStorage).ok).toBe(true);
    const ownerSubclass = subclass(FIGHTER_ID, 'Boom Knight', target);
    expect(saveAndPublishHomebrewContent([target, ownerClass, ownerSubclass], window.localStorage).ok).toBe(true);

    const user = userEvent.setup();
    renderRoutes('/creator-forge/spells');
    await user.click(within(cardByHeading('Forge Lance')).getByRole('button', { name: 'Delete' }));

    expect(screen.getByRole('heading', { name: 'Cannot delete "Forge Lance"' })).toBeInTheDocument();
    expect(screen.getByLabelText('Delete blockers')).toHaveTextContent('Gregorymancer');
    expect(screen.getByLabelText('Delete blockers')).toHaveTextContent('Boom Knight');
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
    expect(contentRegistry.findSpell(target.id)).toEqual(target);
  });

  it('blocks deleting a Class while a custom Subclass still points at it', async () => {
    const parent = simpleClass('Referenced Parent');
    expect(saveAndPublishHomebrewContent([parent], window.localStorage).ok).toBe(true);
    const child = subclass(parent.id, 'Dependent Path');
    expect(saveAndPublishHomebrewContent([parent, child], window.localStorage).ok).toBe(true);

    const user = userEvent.setup();
    renderRoutes('/creator-forge/classes');
    await user.click(within(cardByHeading('Referenced Parent')).getByRole('button', { name: 'Delete' }));

    expect(screen.getByRole('heading', { name: 'Cannot delete "Referenced Parent"' })).toBeInTheDocument();
    expect(screen.getByLabelText('Delete blockers')).toHaveTextContent('Dependent Path');
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
  });

  it('protects Character v9 bytes and the live registry when Character-referenced content is deleted', async () => {
    const target = simpleFeat('Character Guard');
    expect(saveAndPublishHomebrewContent([target], window.localStorage).ok).toBe(true);
    createCharacter(fighterInput({
      name: 'Gregory',
      manualFeats: [{ featId: target.id, choices: {} }],
    }), window.localStorage, contentRegistry);

    const beforeCharacters = window.localStorage.getItem(CHARACTER_STORAGE_KEY);
    const beforeContent = window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY);
    const beforeRegistry = contentRegistry;

    const user = userEvent.setup();
    renderRoutes('/creator-forge/feats');
    await user.click(within(cardByHeading('Character Guard')).getByRole('button', { name: 'Delete' }));

    expect(screen.getByRole('heading', { name: 'Cannot delete "Character Guard"' })).toBeInTheDocument();
    expect(screen.getByLabelText('Delete blockers')).toHaveTextContent('Gregory');
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(beforeCharacters);
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBe(beforeContent);
    expect(contentRegistry).toBe(beforeRegistry);
    expect(contentRegistry.findFeat(target.id)).toEqual(target);
  });

  it('allows an unreferenced Subclass parent change through real Forge Edit and blocks the same change when a Character depends on it', async () => {
    const alternateParent = simpleClass('Alternate Parent');
    expect(saveAndPublishHomebrewContent([alternateParent], window.localStorage).ok).toBe(true);

    const safe = subclass(FIGHTER_ID, 'Safe Parent Edit');
    expect(saveAndPublishHomebrewContent([alternateParent, safe], window.localStorage).ok).toBe(true);

    const user = userEvent.setup();
    const safeView = renderRoutes('/creator-forge/subclasses/' + encodeURIComponent(safe.id) + '/edit');
    expect(screen.getByLabelText('Parent Class')).not.toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Parent Class'), alternateParent.id);
    await user.click(screen.getByRole('button', { name: 'Review Subclass' }));
    await user.click(screen.getByRole('button', { name: 'Save Subclass' }));
    expect(contentRegistry.findSubclass(safe.id)?.parentClassId).toBe(alternateParent.id);
    safeView.unmount();

    const blocked = subclass(FIGHTER_ID, 'Referenced Parent Edit');
    expect(saveAndPublishHomebrewContent([alternateParent, contentRegistry.findSubclass(safe.id)!, blocked], window.localStorage).ok).toBe(true);
    createCharacter(fighterInput({
      name: 'Parent Locked Character',
      level: 3,
      subclassId: blocked.id,
    }), window.localStorage, contentRegistry);
    const beforeCharacters = window.localStorage.getItem(CHARACTER_STORAGE_KEY);
    const beforeSubclass = contentRegistry.findSubclass(blocked.id);

    renderRoutes('/creator-forge/subclasses/' + encodeURIComponent(blocked.id) + '/edit');
    await user.selectOptions(screen.getByLabelText('Parent Class'), alternateParent.id);
    await user.click(screen.getByRole('button', { name: 'Review Subclass' }));
    await user.click(screen.getByRole('button', { name: 'Save Subclass' }));

    expect(screen.getByRole('heading', { name: 'Review before Save' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/Parent Locked Character/);
    expect(contentRegistry.findSubclass(blocked.id)).toEqual(beforeSubclass);
    expect(window.localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe(beforeCharacters);
  }, 30000);

  it('removes a deleted custom Class from an already-mounted Character selector without reload', () => {
    const target = simpleClass('Live Delete Class');
    expect(saveAndPublishHomebrewContent([target], window.localStorage).ok).toBe(true);

    renderApp('/characters/new');
    const select = screen.getByLabelText('Class') as HTMLSelectElement;
    expect([...select.options].some((option) => option.value === target.id)).toBe(true);

    act(() => {
      expect(deleteAndPublishHomebrewContent(target.id, window.localStorage).ok).toBe(true);
    });

    expect([...select.options].some((option) => option.value === target.id)).toBe(false);
    expect(contentRegistry.findClass(target.id)).toBeUndefined();
  });

  it('blocks custom-on-custom deletion in dependency order, then allows deletion after a safe parent edit removes the dependency', async () => {
    const originalParent = simpleClass('Dependency Parent');
    const replacementParent = simpleClass('Replacement Parent');
    expect(saveAndPublishHomebrewContent([originalParent, replacementParent], window.localStorage).ok).toBe(true);
    const child = subclass(originalParent.id, 'Movable Child');
    expect(saveAndPublishHomebrewContent([originalParent, replacementParent, child], window.localStorage).ok).toBe(true);

    const user = userEvent.setup();
    const blockedView = renderRoutes('/creator-forge/classes');
    await user.click(within(cardByHeading('Dependency Parent')).getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('heading', { name: 'Cannot delete "Dependency Parent"' })).toBeInTheDocument();
    expect(screen.getByLabelText('Delete blockers')).toHaveTextContent('Movable Child');
    blockedView.unmount();

    const editView = renderRoutes('/creator-forge/subclasses/' + encodeURIComponent(child.id) + '/edit');
    await user.selectOptions(screen.getByLabelText('Parent Class'), replacementParent.id);
    await user.click(screen.getByRole('button', { name: 'Review Subclass' }));
    await user.click(screen.getByRole('button', { name: 'Save Subclass' }));
    expect(contentRegistry.findSubclass(child.id)?.parentClassId).toBe(replacementParent.id);
    editView.unmount();

    renderRoutes('/creator-forge/classes');
    await user.click(within(cardByHeading('Dependency Parent')).getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('heading', { name: 'Delete "Dependency Parent"?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm Delete' }));
    expect(contentRegistry.findClass(originalParent.id)).toBeUndefined();
    expect(contentRegistry.findSubclass(child.id)?.parentClassId).toBe(replacementParent.id);
  }, 30000);

  it.each([
    ['Feat', '/creator-forge/feats/' + encodeURIComponent(srdId('feat', 'alert')) + '/edit'],
    ['Spell', '/creator-forge/spells/' + encodeURIComponent(srdId('spell', 'fireball')) + '/edit'],
    ['Subclass', '/creator-forge/subclasses/' + encodeURIComponent(srdId('subclass', 'fighter:champion')) + '/edit'],
    ['Class', '/creator-forge/classes/' + encodeURIComponent(srdId('class', 'fighter')) + '/edit'],
  ])('protects bundled SRD %s from direct Forge Edit URLs', (_family, route) => {
    const view = renderRoutes(route);
    expect(screen.getByText(/Bundled SRD.*read-only and cannot be edited/i)).toBeInTheDocument();
    view.unmount();
  });
});
