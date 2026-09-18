import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiceTray } from './DiceTray';
import { srdId } from '../content/srd';
import { fighterInput } from '../test/fixtures';
import { createCharacter } from '../services/characterStorage';
import { rollAbilityCheck, rollWeaponDamage } from '../services/characterRolls';
import { clearRollHistory, loadRollHistory } from '../services/rollHistory';
import type { RollHistoryEntry } from '../dice/types';

const HALFLING_ID = srdId('species', 'halfling');
const GWF_ID = srdId('feat', 'great-weapon-fighting');
const GREAT_SWORD_ID = srdId('weapon', 'greatsword');

function dieValue(value: number, die: number) {
  return () => (value - 1) / die;
}

function HistoryHarness({ characterId }: { characterId: string }) {
  const [history, setHistory] = useState<RollHistoryEntry[]>(() => loadRollHistory());
  return (
    <DiceTray
      characterId={characterId}
      history={history}
      onHistoryChange={() => setHistory(loadRollHistory())}
      onClearHistory={() => {
        clearRollHistory();
        setHistory([]);
      }}
    />
  );
}

function halflingCharacter() {
  return createCharacter(fighterInput({
    speciesId: HALFLING_ID,
    speciesChoices: {},
    speciesSkillProficiencies: [],
  }));
}

function gwfCharacter() {
  return createCharacter(fighterInput({
    manualFeats: [{ featId: GWF_ID, choices: {} }],
    equipment: { equippedWeaponIds: [GREAT_SWORD_ID] },
  }));
}

describe('M13E compact optional-transformation UI', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows a generic source-labelled optional action only when the current roll is eligible and updates the same history entry', async () => {
    const user = userEvent.setup();
    const character = halflingCharacter();
    const rolled = rollAbilityCheck(character.id, 'strength', 'normal', { rng: dieValue(1, 20) });
    expect(rolled.ok).toBe(true);
    const before = loadRollHistory();
    expect(before).toHaveLength(1);
    const entryId = before[0].id;

    vi.spyOn(Math, 'random').mockReturnValue((11 - 1) / 20);
    render(<HistoryHarness characterId={character.id} />);

    expect(screen.getByText(/Halfling:/)).toBeInTheDocument();
    expect(screen.getByText(/the new result must be used/i)).toBeInTheDocument();
    const action = screen.getByRole('button', { name: 'Reroll d20' });
    expect(action).toBeInTheDocument();

    await user.click(action);

    expect(screen.queryByRole('button', { name: 'Reroll d20' })).not.toBeInTheDocument();
    expect(screen.getByText('Total: 13')).toBeInTheDocument();
    expect(screen.getAllByText(/d20: 11/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Halfling: d20 1 → reroll 11; new result 11 used/)).toBeInTheDocument();

    const after = loadRollHistory();
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(entryId);
    expect(after[0].result.keptD20).toBe(11);
  });

  it('consumes the optional transformation even when the mandatory replacement is another qualifying 1', async () => {
    const user = userEvent.setup();
    const character = halflingCharacter();
    const rolled = rollAbilityCheck(character.id, 'strength', 'normal', { rng: dieValue(1, 20) });
    expect(rolled.ok).toBe(true);
    const beforeId = loadRollHistory()[0].id;

    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<HistoryHarness characterId={character.id} />);
    await user.click(screen.getByRole('button', { name: 'Reroll d20' }));

    expect(screen.queryByRole('button', { name: 'Reroll d20' })).not.toBeInTheDocument();
    expect(screen.getByText(/Halfling: d20 1 → reroll 1; new result 1 used/)).toBeInTheDocument();
    const history = loadRollHistory();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(beforeId);
    expect(history[0].result.keptD20).toBe(1);
    expect(history[0].result.natural).toBe('nat1');
  });

  it('shows no optional action for a non-qualifying result', () => {
    const character = halflingCharacter();
    const rolled = rollAbilityCheck(character.id, 'strength', 'normal', { rng: dieValue(5, 20) });
    expect(rolled.ok).toBe(true);

    render(<HistoryHarness characterId={character.id} />);
    expect(screen.queryByRole('button', { name: 'Reroll d20' })).not.toBeInTheDocument();
    expect(screen.queryByText(/the new result must be used/i)).not.toBeInTheDocument();
  });

  it('shows automatic minimum-face provenance without exposing a transformation button', () => {
    const character = gwfCharacter();
    const rolled = rollWeaponDamage(character.id, GREAT_SWORD_ID, undefined, false, { rng: dieValue(1, 6) });
    expect(rolled.ok).toBe(true);

    render(<HistoryHarness characterId={character.id} />);
    expect(screen.getAllByText(/Great Weapon Fighting: d6 1 → 3 \(minimum face\)/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Reroll d6/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/new result must be used/i)).not.toBeInTheDocument();
  });
});
