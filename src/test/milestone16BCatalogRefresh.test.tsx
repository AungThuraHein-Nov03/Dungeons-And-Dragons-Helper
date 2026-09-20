import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import type { ClassContent } from '../models/content';
import { initializeContentCatalog, saveAndPublishHomebrewContent } from '../services/contentCatalog';
import { contentRegistry } from '../services/contentRegistry';

const CLASS_ID = 'homebrew:local:class:77777777-7777-4777-8777-777777777777';

function runtimeClass(): ClassContent {
  return {
    id: CLASS_ID,
    kind: 'class',
    name: 'Runtime Wayfarer',
    source: { type: 'homebrew', namespace: 'local' },
    hitDie: 8,
    fixedHitPointsPerLevel: 5,
    primaryAbility: { mode: 'one-of', abilities: ['dexterity'] },
    multiclassProficiencies: { weaponProficiencies: [], armorTraining: [], toolProficiencies: [] },
    savingThrowProficiencies: ['dexterity', 'intelligence'],
    weaponProficiencies: [{ kind: 'category', category: 'simple' }],
    armorTraining: ['light'],
    toolProficiencies: [],
    skillChoices: { choose: 2, from: ['arcana', 'athletics', 'perception'] },
    startingEquipment: [{ id: 'A', items: [], currency: { amount: 10, unit: 'gp' } }],
    progression: Array.from({ length: 20 }, (_, index) => ({
      level: index + 1,
      proficiencyBonus: index + 1 >= 17 ? 6 : index + 1 >= 13 ? 5 : index + 1 >= 9 ? 4 : index + 1 >= 5 ? 3 : 2,
      features: [],
    })),
    resources: [],
  };
}

describe('M16-B runtime catalog refresh', () => {
  beforeEach(() => {
    window.localStorage.clear();
    initializeContentCatalog(window.localStorage);
  });

  it('refreshes a mounted Character Builder from the published effective registry without reload', () => {
    render(
      <MemoryRouter initialEntries={['/characters/new']}>
        <App />
      </MemoryRouter>,
    );

    const classSelect = screen.getByLabelText('Class') as HTMLSelectElement;
    expect([...classSelect.options].some((option) => option.text === 'Runtime Wayfarer')).toBe(false);
    expect(contentRegistry.findClass(CLASS_ID)).toBeUndefined();

    act(() => {
      const result = saveAndPublishHomebrewContent([runtimeClass()], window.localStorage);
      expect(result.ok).toBe(true);
    });

    expect(contentRegistry.findClass(CLASS_ID)?.name).toBe('Runtime Wayfarer');
    expect([...classSelect.options].some((option) => option.text === 'Runtime Wayfarer')).toBe(true);
    expect(contentRegistry.getAll('class').some((entry) => entry.name === 'Fighter')).toBe(true);
  });
});
