import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import App, { AppRoutes } from '../App';
import { srdId } from '../content/srd';
import type { ArmorContent, EquipmentContent, WeaponContent } from '../models/content';
import { initializeContentCatalog, saveAndPublishHomebrewContent } from '../services/contentCatalog';
import { contentRegistry } from '../services/contentRegistry';
import { HOMEBREW_CONTENT_STORAGE_KEY, loadHomebrewContent } from '../services/homebrewContentStorage';

const WEAPON_ID = 'homebrew:local:weapon:forge-ui-weapon';
const ARMOR_ID = 'homebrew:local:armor:forge-ui-armor';
const EQUIPMENT_ID = 'homebrew:local:equipment:forge-ui-kit';

function seededEntries(): [WeaponContent, ArmorContent, EquipmentContent] {
  return [
    {
      id: WEAPON_ID,
      kind: 'weapon',
      name: 'Glass Saber',
      source: { type: 'homebrew', namespace: 'local' },
      category: 'martial',
      mode: 'melee',
      damage: { kind: 'dice', count: 1, die: 8 },
      damageType: 'slashing',
      properties: [{ type: 'finesse' }],
      masteryId: srdId('weapon-mastery', 'vex'),
      attackBonus: 1,
      damageBonus: 2,
      cost: { amount: 80, unit: 'gp' },
      weightPounds: 2,
      referenceEffects: ['Fragile until repaired.'],
    },
    {
      id: ARMOR_ID,
      kind: 'armor',
      name: 'Wayfinder Mail',
      source: { type: 'homebrew', namespace: 'local' },
      category: 'medium',
      armorClass: { kind: 'armor', base: 14, dexterity: 'capped', dexterityCap: 2 },
      strengthRequirement: null,
      stealthDisadvantage: false,
      armorClassBonus: 1,
      cost: { amount: 300, unit: 'gp' },
      weightPounds: 25,
      referenceEffects: [],
    },
    {
      id: EQUIPMENT_ID,
      kind: 'equipment',
      name: 'Surveyor Kit',
      source: { type: 'homebrew', namespace: 'local' },
      category: 'adventuring-gear',
      description: 'Tools for measuring difficult ground.',
      referenceEffects: ['Requires two free hands.'],
      cost: { amount: 15, unit: 'gp' },
      weightPounds: 4,
    },
  ];
}

function renderRoutes(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function renderApp(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

function renderedEquipmentId(): string {
  const value = screen.getByText(/^homebrew:local:(weapon|armor|equipment):/).textContent;
  if (!value) throw new Error('Equipment Forge ID was not rendered.');
  return value;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  initializeContentCatalog(window.localStorage);
});

describe('Creator Forge equipment routes and manager', () => {
  it('links Equipment from the overview and shared Forge navigation', async () => {
    const user = userEvent.setup();
    renderApp('/creator-forge');

    expect(screen.getByRole('link', { name: 'Equipment' })).toHaveAttribute('href', '/creator-forge/equipment');
    await user.click(screen.getByRole('link', { name: 'Equipment' }));
    expect(screen.getByRole('heading', { name: 'Custom Equipment' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create Equipment' })).toHaveAttribute('href', '/creator-forge/equipment/new');
  });

  it('groups only custom items and opens the shared dependency-aware delete panel', async () => {
    const user = userEvent.setup();
    expect(saveAndPublishHomebrewContent(seededEntries(), window.localStorage).ok).toBe(true);
    renderRoutes('/creator-forge/equipment');

    for (const group of ['Weapons', 'Armor & Shields', 'Miscellaneous Equipment']) {
      expect(screen.getByRole('heading', { name: group })).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: 'Glass Saber' })).toBeInTheDocument();
    expect(screen.getByText(/Martial weapon · \+1 attack · \+2 damage · 1 reference/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Scimitar' })).not.toBeInTheDocument();

    const weaponRow = screen.getByRole('heading', { name: 'Glass Saber' }).closest('article');
    if (!weaponRow) throw new Error('Expected weapon manager row.');
    expect(within(weaponRow).getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/creator-forge/equipment/' + encodeURIComponent(WEAPON_ID) + '/edit',
    );
    expect(within(weaponRow).getByRole('link', { name: 'Start From Existing' })).toHaveAttribute(
      'href',
      '/creator-forge/equipment/new?template=' + encodeURIComponent(WEAPON_ID),
    );
    await user.click(within(weaponRow).getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Delete "Glass Saber"?');
    expect(screen.getByRole('button', { name: 'Confirm Delete' })).toBeInTheDocument();
  });
});

describe('Equipment Forge editor', () => {
  it('copies a homebrew template into a new stable identity and excludes incompatible kinds from the selector', async () => {
    const user = userEvent.setup();
    const originals = seededEntries();
    expect(saveAndPublishHomebrewContent(originals, window.localStorage).ok).toBe(true);
    renderRoutes('/creator-forge/equipment/new');

    const templates = () => within(screen.getByLabelText('Equipment template'));
    expect(templates().getByRole('option', { name: 'Glass Saber · Homebrew' })).toBeInTheDocument();
    expect(templates().queryByRole('option', { name: /Wayfinder Mail|Surveyor Kit/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Template kind'), 'armor');
    expect(templates().getByRole('option', { name: 'Wayfinder Mail · Homebrew' })).toBeInTheDocument();
    expect(templates().queryByRole('option', { name: /Glass Saber|Surveyor Kit|Scimitar/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Template kind'), 'equipment');
    expect(templates().getByRole('option', { name: 'Surveyor Kit · Homebrew' })).toBeInTheDocument();
    expect(templates().queryByRole('option', { name: /Glass Saber|Wayfinder Mail|Scimitar/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Template kind'), 'weapon');
    await user.selectOptions(screen.getByLabelText('Equipment template'), WEAPON_ID);
    await user.click(screen.getByRole('button', { name: 'Start From Existing' }));

    const copiedId = renderedEquipmentId();
    expect(copiedId).not.toBe(WEAPON_ID);
    expect(screen.getByLabelText('Equipment name')).toHaveValue('Glass Saber');
    expect(screen.getByLabelText('Attack bonus')).toHaveValue('1');
    expect(screen.getByLabelText('Reference effect 1')).toHaveValue('Fragile until repaired.');
    await user.clear(screen.getByLabelText('Equipment name'));
    await user.type(screen.getByLabelText('Equipment name'), 'Glass Saber Copy');
    await user.selectOptions(screen.getByLabelText('Damage bonus'), '4');
    await user.click(screen.getByRole('button', { name: 'Review Equipment' }));
    expect(renderedEquipmentId()).toBe(copiedId);
    await user.click(screen.getByRole('button', { name: 'Save Equipment' }));
    expect(await screen.findByRole('heading', { name: 'Custom Equipment' })).toBeInTheDocument();
    expect(contentRegistry.findWeapon(copiedId)).toMatchObject({ name: 'Glass Saber Copy', damageBonus: 4 });
    expect(contentRegistry.findWeapon(WEAPON_ID)).toEqual(originals[0]);
    expect(loadHomebrewContent(window.localStorage)).toHaveLength(4);
  });

  it('offers scratch drafts for all three UI groups and renders finite domains as structured controls', async () => {
    const user = userEvent.setup();
    const view = renderRoutes('/creator-forge/equipment/new');

    expect(screen.getByRole('heading', { name: 'Create Equipment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Weapon from Scratch' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Armor or Shield from Scratch' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Miscellaneous Equipment from Scratch' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create Weapon from Scratch' }));
    for (const label of ['Weapon category', 'Weapon mode', 'Damage type', 'Weapon mastery', 'Attack bonus', 'Damage bonus']) {
      expect(screen.getByRole('combobox', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('group', { name: 'Weapon properties' })).toBeInTheDocument();

    view.unmount();
    const armorView = renderRoutes('/creator-forge/equipment/new');
    await user.click(screen.getByRole('button', { name: 'Create Armor or Shield from Scratch' }));
    expect(screen.getByRole('combobox', { name: 'Armor category' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Dexterity contribution' })).toBeInTheDocument();

    armorView.unmount();
    renderRoutes('/creator-forge/equipment/new');
    await user.click(screen.getByRole('button', { name: 'Create Miscellaneous Equipment from Scratch' }));
    expect(screen.getByRole('combobox', { name: 'Equipment category' })).toBeInTheDocument();
  });

  it('includes the numeric Dexterity cap in capped armor review text', async () => {
    const user = userEvent.setup();
    renderRoutes('/creator-forge/equipment/new');

    await user.click(screen.getByRole('button', { name: 'Create Armor or Shield from Scratch' }));
    await user.type(screen.getByLabelText('Equipment name'), 'Capped Review Mail');
    await user.selectOptions(screen.getByLabelText('Dexterity contribution'), 'capped');
    const cap = screen.getByLabelText('Dexterity modifier cap');
    await user.clear(cap);
    await user.type(cap, '3');
    await user.click(screen.getByRole('button', { name: 'Review Equipment' }));

    expect(screen.getByText(/Base Armor Class 11.*Dexterity modifier.*max 3/i)).toBeInTheDocument();
  });

  it('copies Scimitar once into a stable new ID, reviews distinct effect classes, and saves through the catalog', async () => {
    const user = userEvent.setup();
    renderRoutes('/creator-forge/equipment/new');

    await user.selectOptions(screen.getByLabelText('Template kind'), 'weapon');
    const templateSelect = screen.getByLabelText('Equipment template');
    expect(within(templateSelect).getByRole('option', { name: /Scimitar.*Bundled SRD/i })).toBeInTheDocument();
    await user.selectOptions(templateSelect, srdId('weapon', 'scimitar'));
    await user.click(screen.getByRole('button', { name: 'Start From Existing' }));

    expect(screen.getByLabelText('Equipment name')).toHaveValue('Scimitar');
    const copiedId = renderedEquipmentId();
    expect(copiedId).not.toBe(srdId('weapon', 'scimitar'));
    expect(copiedId).toMatch(/^homebrew:local:weapon:/);

    const name = screen.getByLabelText('Equipment name');
    await user.clear(name);
    await user.type(name, 'Moonlit Scimitar');
    await user.selectOptions(screen.getByLabelText('Attack bonus'), '2');
    await user.selectOptions(screen.getByLabelText('Damage bonus'), '3');
    await user.click(screen.getByRole('button', { name: 'Add Reference Effect' }));
    await user.type(screen.getByLabelText('Reference effect 1'), 'Sheds moonlight while drawn.');
    expect(renderedEquipmentId()).toBe(copiedId);
    expect(window.localStorage.getItem(HOMEBREW_CONTENT_STORAGE_KEY)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Review Equipment' }));
    expect(screen.getByRole('heading', { name: 'Automated Effects' })).toBeInTheDocument();
    expect(screen.getByText(/\+2 weapon attack rolls/i)).toBeInTheDocument();
    expect(screen.getByText(/\+3 weapon damage rolls/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Reference / Manual Effects' })).toBeInTheDocument();
    expect(screen.getByText('Sheds moonlight while drawn.')).toBeInTheDocument();
    expect(renderedEquipmentId()).toBe(copiedId);

    await user.click(screen.getByRole('button', { name: 'Save Equipment' }));
    expect(await screen.findByRole('heading', { name: 'Custom Equipment' })).toBeInTheDocument();
    expect(contentRegistry.findWeapon(copiedId)).toMatchObject({
      id: copiedId,
      name: 'Moonlit Scimitar',
      attackBonus: 2,
      damageBonus: 3,
    });
    expect(loadHomebrewContent(window.localStorage)).toEqual([
      expect.objectContaining({ id: copiedId, kind: 'weapon', name: 'Moonlit Scimitar' }),
    ]);
  });

  it('preserves a custom edit ID and refuses a bundled direct edit', async () => {
    const user = userEvent.setup();
    expect(saveAndPublishHomebrewContent(seededEntries(), window.localStorage).ok).toBe(true);
    const edit = renderRoutes('/creator-forge/equipment/' + encodeURIComponent(EQUIPMENT_ID) + '/edit');

    expect(screen.getByRole('heading', { name: 'Edit Equipment' })).toBeInTheDocument();
    expect(renderedEquipmentId()).toBe(EQUIPMENT_ID);
    const name = screen.getByLabelText('Equipment name');
    await user.clear(name);
    await user.type(name, 'Master Surveyor Kit');
    await user.click(screen.getByRole('button', { name: 'Review Equipment' }));
    expect(renderedEquipmentId()).toBe(EQUIPMENT_ID);
    await user.click(screen.getByRole('button', { name: 'Save Equipment' }));
    expect(contentRegistry.findEquipment(EQUIPMENT_ID)?.name).toBe('Master Surveyor Kit');

    edit.unmount();
    renderRoutes('/creator-forge/equipment/' + encodeURIComponent(srdId('weapon', 'scimitar')) + '/edit');
    expect(screen.getByRole('heading', { name: 'Equipment Forge unavailable' })).toBeInTheDocument();
    expect(screen.getByText(/Bundled SRD equipment is read-only/i)).toBeInTheDocument();
  });
});
