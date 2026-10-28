import { Component, lazy, Suspense, useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  clearDiceVisualEvent,
  getDiceVisualEventSnapshot,
  subscribeDiceVisualEvents,
  type DiceVisualEvent,
  type VisualDie,
} from '../dice/diceVisualEvent';

const LazyDiceRollOverlay = lazy(() => import('./DiceRollOverlay3D'));

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const query = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return undefined;
    const update = () => setReduced(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

function reducedMotionLabel(die: VisualDie): string {
  if (die.labelMode === 'percentile-tens') return die.value === 10 ? '00' : String(die.value * 10);
  if (die.labelMode === 'percentile-ones') return die.value === 10 ? '0' : String(die.value);
  return String(die.value);
}

function ReducedMotionDice({ event, onComplete }: { readonly event: DiceVisualEvent; readonly onComplete: () => void }) {
  useEffect(() => {
    const timeout = window.setTimeout(onComplete, 1200);
    return () => window.clearTimeout(timeout);
  }, [event.id, onComplete]);
  return (
    <div className="dice-roll-overlay__reduced" aria-label={`Visual dice result: ${event.title}`}>
      {event.dice.map((die) => (
        <span key={die.id} className={`dice-roll-overlay__reduced-die dice-roll-overlay__reduced-die--${die.emphasis}`}>
          {reducedMotionLabel(die)}
        </span>
      ))}
    </div>
  );
}

interface DiceOverlayErrorBoundaryProps {
  readonly children: ReactNode;
  readonly onFailure: () => void;
}

class DiceOverlayErrorBoundary extends Component<DiceOverlayErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFailure();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function DiceRollOverlayHost() {
  const event = useSyncExternalStore(subscribeDiceVisualEvents, getDiceVisualEventSnapshot, getDiceVisualEventSnapshot);
  const reducedMotion = useReducedMotion();
  const complete = useCallback(() => {
    if (event) clearDiceVisualEvent(event.id);
  }, [event]);
  if (!event) return null;

  return (
    <div
      className="dice-roll-overlay"
      data-roll-event-id={event.id}
      data-testid="dice-roll-overlay"
      aria-hidden="true"
      style={{ pointerEvents: 'none' }}
    >
      {reducedMotion ? (
        <ReducedMotionDice event={event} onComplete={complete} />
      ) : (
        <DiceOverlayErrorBoundary key={event.id} onFailure={complete}>
          <Suspense fallback={null}>
            <LazyDiceRollOverlay key={event.id} event={event} onComplete={complete} />
          </Suspense>
        </DiceOverlayErrorBoundary>
      )}
    </div>
  );
}
