import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { deriveCharacterState } from '../rules/deriveCharacter';
import {
  createLevelUpDraft,
  getLevelUpAdvancementChoiceContext,
  withFixedLevelUpHitPoints,
  withLevelUpTarget,
} from '../rules/levelUp';
import { initializeContentCatalog } from '../services/contentCatalog';
import { contentRegistry } from '../services/contentRegistry';
import { createCharacter, getCharacterById } from '../services/characterStorage';
import { loadHomebrewContent } from '../services/homebrewContentStorage';
import {
  CHAMPION_ID,
  FIGHTER_ID,
  LIGHT_CROSSBOW_ID,
  fighterCharacter,
  fighterInput,
} from './fixtures';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

function renderedForgeId(): string {
  const id = screen.getByText(/^homebrew:local:feat:/).textContent;
  if (!id) throw new Error('Expected rendered Forge Feat ID.');
  return id;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  initializeContentCatalog(window.localStorage);
});

describe('M16-C Forge-authored Feat Character and Level Up acceptance', () => {
  it('creates a Feat through Forge UI, assigns it through existing Character edit UI, and consumes it through generic rules and M15-D eligibility', async () => {
    const user = userEvent.setup();
    const forgeRender = renderAt('/creator-forge/feats/new');

    const featId = renderedForgeId();
    await user.type(screen.getByLabelText('Feat name'), 'Forge Marksman');
    await user.type(screen.getByLabelText('Feat description'), 'Gain +1 on ranged weapon attack rolls.');
    await user.click(screen.getByRole('button', { name: 'Add Level Prerequisite' }));
    await user.selectOptions(screen.getByLabelText('New automated effect type'), 'attack-roll-bonus');
    await user.click(screen.getByRole('button', { name: 'Add Automated Effect' }));
    await user.click(screen.getByRole('button', { name: 'Review Feat' }));
    await user.click(screen.getByRole('button', { name: 'Save Feat' }));

    expect(loadHomebrewContent(window.localStorage)).toEqual([
      expect.objectContaining({
        id: featId,
        kind: 'feat',
        name: 'Forge Marksman',
        source: { type: 'homebrew', namespace: 'local' },
        category: 'general',
        effects: [{ type: 'attack-roll-bonus', weaponMode: 'ranged', amount: 1 }],
      }),
    ]);
    expect(contentRegistry.findFeat(featId)?.name).toBe('Forge Marksman');
    forgeRender.unmount();

    const character = createCharacter(fighterInput({
      name: 'M16-C Marksman',
      level: 4,
      subclassId: CHAMPION_ID,
      inventory: [{
        id: 'm16c-crossbow',
        kind: 'registry',
        contentId: LIGHT_CROSSBOW_ID,
        category: 'weapon',
        quantity: 1,
        equipped: true,
        notes: '',
      }],
    }));

    const before = deriveCharacterState(character, contentRegistry);
    expect(before).toMatchObject({ ok: true });
    if (!before.ok) throw new Error(before.error.message);
    expect(before.value.attacks.find((attack) => attack.weaponId === LIGHT_CROSSBOW_ID)?.attackModifier).toBe(6);

    const editRender = renderAt('/characters/' + character.id + '/edit');
    const featSelect = screen.getByLabelText('Feat to add') as HTMLSelectElement;
    expect([...featSelect.options].some((option) => option.value === featId && option.text.includes('Forge Marksman'))).toBe(true);
    await user.selectOptions(featSelect, featId);
    await user.click(screen.getByRole('button', { name: 'Add Feat' }));
    expect(screen.getByRole('heading', { name: 'Forge Marksman' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    const updated = getCharacterById(character.id);
    expect(updated).toBeDefined();
    expect(updated?.manualFeats).toEqual(expect.arrayContaining([{ featId, choices: {} }]));

    const after = deriveCharacterState(updated!, contentRegistry);
    expect(after).toMatchObject({ ok: true });
    if (!after.ok) throw new Error(after.error.message);
    expect(after.value.feats).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: featId, name: 'Forge Marksman', acquisition: { type: 'manual' } }),
    ]));
    expect(after.value.attacks.find((attack) => attack.weaponId === LIGHT_CROSSBOW_ID)?.attackModifier).toBe(7);
    editRender.unmount();

    const levelThree = fighterCharacter({ level: 3, subclassId: CHAMPION_ID });
    const draft = withFixedLevelUpHitPoints(
      withLevelUpTarget(createLevelUpDraft(levelThree), { kind: 'existing-class', classId: FIGHTER_ID }),
    );
    const advancement = getLevelUpAdvancementChoiceContext(levelThree, draft, contentRegistry);
    expect(advancement).toMatchObject({
      ok: true,
      value: {
        currentClassLevel: 3,
        nextClassLevel: 4,
        featGrant: { kind: 'general' },
      },
    });
    if (!advancement.ok || !advancement.value.featGrant) throw new Error('Expected Fighter level-4 Feat grant.');
    expect(advancement.value.featGrant.options).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: featId,
        name: 'Forge Marksman',
        category: 'general',
        abilityChoices: [],
      }),
    ]));
  });
});
