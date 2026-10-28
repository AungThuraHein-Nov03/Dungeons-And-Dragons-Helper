import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RollResult } from '../dice/types';
import { clearDiceVisualEvent, getDiceVisualEventSnapshot, publishDiceVisualResult } from '../dice/diceVisualEvent';
import { DiceRollOverlayHost } from './DiceRollOverlayHost';

vi.mock('./DiceRollOverlay3D', () => ({
  default: ({ event }: { readonly event: { readonly title: string } }) => (
    <div aria-label={`Visual dice animation: ${event.title}`} />
  ),
}));

function roll(label: string, die: 6 | 20, value: number): RollResult {
  return {
    request: {
      type: die === 20 ? 'attack' : 'damage',
      label,
      expression: { kind: 'dice', dice: [{ quantity: 1, die }], modifier: 3 },
      mode: 'normal',
      source: { characterId: 'character-1' },
      outcome: { kind: die === 20 ? 'attack' : 'damage' },
    },
    dice: [{ die, values: [value] }],
    modifier: 3,
    total: value + 3,
    effects: [],
  };
}

function setReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
}

afterEach(() => {
  const current = getDiceVisualEventSnapshot();
  if (current) clearDiceVisualEvent(current.id);
  vi.unstubAllGlobals();
});

describe('DiceRollOverlayHost', () => {
  it('does not occupy the document while no roll is active', () => {
    setReducedMotion(false);
    render(<DiceRollOverlayHost />);
    expect(screen.queryByTestId('dice-roll-overlay')).not.toBeInTheDocument();
  });

  it('lazy-renders a non-interactive aria-hidden overlay for an authoritative roll', async () => {
    setReducedMotion(false);
    publishDiceVisualResult(roll('Scimitar Damage', 6, 5), 'first-roll');
    render(<DiceRollOverlayHost />);

    const overlay = screen.getByTestId('dice-roll-overlay');
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    expect(overlay).toHaveAttribute('data-roll-event-id', 'first-roll');
    expect(overlay).toHaveStyle({ pointerEvents: 'none' });
    expect(await screen.findByLabelText('Visual dice animation: Scimitar Damage')).toBeInTheDocument();
  });

  it('replaces an active visual roll with the newest event', async () => {
    setReducedMotion(false);
    publishDiceVisualResult(roll('First Roll', 6, 2), 'first');
    render(<DiceRollOverlayHost />);
    await screen.findByLabelText('Visual dice animation: First Roll');

    act(() => publishDiceVisualResult(roll('Newest Roll', 20, 18), 'newest'));

    await waitFor(() => expect(screen.getByTestId('dice-roll-overlay')).toHaveAttribute('data-roll-event-id', 'newest'));
    expect(await screen.findByLabelText('Visual dice animation: Newest Roll')).toBeInTheDocument();
  });

  it('uses a brief non-WebGL result and dismisses it when reduced motion is requested', () => {
    vi.useFakeTimers();
    setReducedMotion(true);
    publishDiceVisualResult(roll('Reduced Roll', 20, 16), 'reduced');
    render(<DiceRollOverlayHost />);

    expect(screen.getByText('16')).toBeInTheDocument();
    expect(document.querySelector('canvas')).not.toBeInTheDocument();

    // The reduced-motion result remains readable for the host's current 1.2 s.
    act(() => vi.advanceTimersByTime(1199));
    expect(screen.getByTestId('dice-roll-overlay')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByTestId('dice-roll-overlay')).not.toBeInTheDocument();
  });
});
