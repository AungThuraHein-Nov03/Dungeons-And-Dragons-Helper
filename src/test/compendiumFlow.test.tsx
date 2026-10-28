import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { srdId } from '../content/srd';
import type { ArmorContent, EquipmentContent, WeaponContent } from '../models/content';
import { LEGACY_CHARACTER_STORAGE_KEY } from '../services/characterStorage';
import { contentRegistry, createContentRegistry, publishContentRegistry } from '../services/contentRegistry';

const COMPENDIUM_WEAPON: WeaponContent = {
  ...contentRegistry.findWeapon(srdId('weapon', 'scimitar'))!,
  id: 'homebrew:test:weapon:echo-blade',
  name: 'Echo Blade',
  source: { type: 'homebrew', namespace: 'test' },
  description: 'A blade that hums before danger.',
  referenceEffects: ['Its hum can be heard within 10 feet.'],
  attackBonus: 2,
  damageBonus: 3,
};

const COMPENDIUM_ARMOR: ArmorContent = {
  ...contentRegistry.findArmor(srdId('armor', 'chain-mail'))!,
  id: 'homebrew:test:armor:warded-mail',
  name: 'Warded Mail',
  source: { type: 'homebrew', namespace: 'test' },
  description: 'Runes reinforce every linked ring.',
  referenceEffects: ['The runes glow near planar portals.'],
  armorClassBonus: 1,
};

const COMPENDIUM_EQUIPMENT: EquipmentContent = {
  id: 'homebrew:test:equipment:royal-writ',
  kind: 'equipment',
  name: 'Royal Writ',
  source: { type: 'homebrew', namespace: 'test' },
  category: 'campaign-item',
  description: 'A sealed order bearing the royal crest.',
  referenceEffects: ['Guards loyal to the crown recognize its authority.'],
  cost: { amount: 25, unit: 'gp' },
  weightPounds: null,
};

afterEach(() => publishContentRegistry(createContentRegistry()));

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

describe('Milestone 2 Compendium flow', () => {
  it('navigates content while preserving and migrating an actual Milestone 1 save', async () => {
    window.localStorage.setItem(LEGACY_CHARACTER_STORAGE_KEY, JSON.stringify([{
      id: 'legacy-fighter', name: 'Legacy Fighter', class: 'Fighter', level: 4,
      abilityScores: { strength: 14, dexterity: 18, constitution: 14, intelligence: 10, wisdom: 12, charisma: 12 },
      createdAt: '2026-09-15T06:00:00.000Z', updatedAt: '2026-09-15T07:00:00.000Z',
    }]));
    const user = userEvent.setup();
    renderAt('/');

    await user.click(screen.getByRole('link', { name: 'Compendium' }));
    expect(screen.getByRole('heading', { name: 'Compendium' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Classes' }));
    await user.click(screen.getByRole('link', { name: /Fighter/ }));
    expect(screen.getByRole('heading', { name: 'Fighter progression' })).toBeInTheDocument();
    expect(screen.getByText('Three Extra Attacks')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Weapons' }));
    await user.type(screen.getByLabelText('Search weapons'), 'Scimitar');
    const results = within(screen.getByRole('region', { name: 'Weapons results' }));
    await user.click(results.getByRole('link', { name: /Scimitar/ }));
    expect(screen.getByText('Nick')).toBeInTheDocument();
    expect(screen.getByText(/Finesse, Light/)).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Armor' }));
    expect(screen.getByRole('link', { name: /Chain Mail/ })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Weapon Masteries' }));
    expect(screen.getByRole('link', { name: /Topple/ })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Characters' }));
    expect(screen.getByRole('heading', { name: 'Legacy Fighter' })).toBeInTheDocument();
  });

  it('lists canonical equipment and exposes complete equipment, weapon, and armor reference details', async () => {
    publishContentRegistry(createContentRegistry([COMPENDIUM_WEAPON, COMPENDIUM_ARMOR, COMPENDIUM_EQUIPMENT]));
    const user = userEvent.setup();
    const equipmentView = renderAt('/compendium');

    await user.click(screen.getByRole('link', { name: 'Equipment' }));
    expect(screen.getByRole('heading', { name: 'Equipment' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search equipment'), 'Royal Writ');
    await user.click(screen.getByRole('link', { name: /Royal Writ/ }));
    expect(screen.getByText('Campaign Item')).toBeInTheDocument();
    expect(screen.getByText('25 GP')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(COMPENDIUM_EQUIPMENT.description)).toBeInTheDocument();
    expect(screen.getByText(COMPENDIUM_EQUIPMENT.referenceEffects[0])).toBeInTheDocument();

    equipmentView.unmount();
    const weaponView = renderAt(`/compendium/weapons/${encodeURIComponent(COMPENDIUM_WEAPON.id)}`);
    expect(screen.getByText(COMPENDIUM_WEAPON.description!)).toBeInTheDocument();
    expect(screen.getByText(COMPENDIUM_WEAPON.referenceEffects![0])).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('+3')).toBeInTheDocument();

    weaponView.unmount();
    renderAt(`/compendium/armor/${encodeURIComponent(COMPENDIUM_ARMOR.id)}`);
    expect(screen.getByText(COMPENDIUM_ARMOR.description!)).toBeInTheDocument();
    expect(screen.getByText(COMPENDIUM_ARMOR.referenceEffects![0])).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
  });
});
