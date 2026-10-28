import type { RollDieSize, RollResult } from './types';

export type VisualDieSides = Exclude<RollDieSize, 100>;
export type VisualDieEmphasis = 'normal' | 'kept' | 'discarded';
export type VisualDieLabelMode = 'standard' | 'percentile-tens' | 'percentile-ones';

export interface VisualDie {
  readonly id: string;
  readonly sides: VisualDieSides;
  readonly value: number;
  readonly emphasis: VisualDieEmphasis;
  readonly labelMode: VisualDieLabelMode;
}

export interface DiceVisualEvent {
  readonly id: string;
  readonly title: string;
  readonly dice: readonly VisualDie[];
}

type DiceVisualEventListener = () => void;

let currentEvent: DiceVisualEvent | null = null;
const listeners = new Set<DiceVisualEventListener>();

function createEventId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `dice-visual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isValidValue(sides: RollDieSize, value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= sides;
}

function d20Emphasis(result: RollResult, value: number): VisualDieEmphasis {
  if (result.resolvedMode !== 'advantage' && result.resolvedMode !== 'disadvantage') return 'normal';
  if (result.keptD20 === undefined) return 'normal';
  const d20Values = result.dice.flatMap((group) => group.die === 20 ? group.values : []);
  if (d20Values.filter((candidate) => candidate === result.keptD20).length !== 1) return 'normal';
  return value === result.keptD20 ? 'kept' : 'discarded';
}

export function createDiceVisualEvent(result: RollResult, id = createEventId()): DiceVisualEvent | null {
  if (result.dice.some((group) => group.values.some((value) => !isValidValue(group.die, value)))) return null;

  const dice: VisualDie[] = [];
  function append(sides: VisualDieSides, value: number, labelMode: VisualDieLabelMode, emphasis: VisualDieEmphasis = 'normal') {
    dice.push({ id: `${id}:${dice.length}`, sides, value, emphasis, labelMode });
  }

  for (const group of result.dice) {
    for (const value of group.values) {
      if (group.die === 100) {
        const percentileValue = value === 100 ? 0 : value;
        const tensDigit = Math.floor(percentileValue / 10);
        const onesDigit = percentileValue % 10;
        append(10, tensDigit === 0 ? 10 : tensDigit, 'percentile-tens');
        append(10, onesDigit === 0 ? 10 : onesDigit, 'percentile-ones');
      } else {
        append(group.die, value, 'standard', group.die === 20 ? d20Emphasis(result, value) : 'normal');
      }
    }
  }

  return dice.length > 0 ? { id, title: result.request.label, dice } : null;
}

function notifyListeners(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // The visual channel is fail-open by contract; one consumer cannot block another.
    }
  }
}

export function publishDiceVisualResult(result: RollResult, id?: string): DiceVisualEvent | null {
  const event = createDiceVisualEvent(result, id);
  if (!event) return null;
  currentEvent = event;
  notifyListeners();
  return event;
}

export function subscribeDiceVisualEvents(listener: DiceVisualEventListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDiceVisualEventSnapshot(): DiceVisualEvent | null {
  return currentEvent;
}

export function clearDiceVisualEvent(id: string): void {
  if (currentEvent?.id !== id) return;
  currentEvent = null;
  notifyListeners();
}
