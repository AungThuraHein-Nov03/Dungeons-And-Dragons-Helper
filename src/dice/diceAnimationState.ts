export type DiceAnimationPhase =
  | 'throwing'
  | 'assisting'
  | 'reconciling'
  | 'readability'
  | 'resting'
  | 'fading'
  | 'complete';

export interface DiceAnimationState {
  readonly phase: DiceAnimationPhase;
  readonly phaseStartedAt: number;
}

export const DICE_ANIMATION_TIMINGS = {
  minimumThrowMs: 1200,
  maximumThrowMs: 2200,
  minimumAssistMs: 220,
  assistMs: 700,
  reconcileMs: 360,
  readabilityBeatMs: 220,
  resultEmphasisMs: 220,
  restMs: 1500,
  fadeMs: 380,
} as const;

export const DICE_SETTLING_THRESHOLDS = {
  maximumLinearSpeed: 2.8,
  maximumAngularSpeed: 7.5,
  finalLinearSpeed: 0.42,
  finalAngularSpeed: 0.95,
  finalAngularErrorRadians: Math.PI / 60,
} as const;

export const DICE_GUIDANCE = {
  earlyStartMs: 420,
  earlyFullStrengthMs: 1100,
  earlyStrength: 0.16,
  finalStrength: 0.36,
  earlyAngularSpeedFraction: 0.12,
  finalAngularSpeedFraction: 0.2,
  earlyMaximumRadiansPerSecond: 1.0,
  finalMaximumRadiansPerSecond: 0.7,
  finalMinimumRadiansPerSecond: 0.12,
} as const;

export function createDiceAnimationState(startedAt: number): DiceAnimationState {
  return { phase: 'throwing', phaseStartedAt: startedAt };
}

export function shouldBeginSettlingAssist(
  elapsedMs: number,
  maximumLinearSpeed: number,
  maximumAngularSpeed: number,
): boolean {
  return elapsedMs >= DICE_ANIMATION_TIMINGS.minimumThrowMs
    && maximumLinearSpeed <= DICE_SETTLING_THRESHOLDS.maximumLinearSpeed
    && maximumAngularSpeed <= DICE_SETTLING_THRESHOLDS.maximumAngularSpeed;
}

export function settlingAssistStrength(progress: number): number {
  const bounded = Math.max(0, Math.min(1, progress));
  return bounded * bounded * (3 - 2 * bounded);
}

export function earlyGuidanceStrength(elapsedMs: number): number {
  if (elapsedMs <= DICE_GUIDANCE.earlyStartMs) return 0;
  const span = Math.max(1, DICE_GUIDANCE.earlyFullStrengthMs - DICE_GUIDANCE.earlyStartMs);
  return DICE_GUIDANCE.earlyStrength * settlingAssistStrength((elapsedMs - DICE_GUIDANCE.earlyStartMs) / span);
}

export function guidanceAngularStep(
  errorRadians: number,
  angularSpeed: number,
  deltaSeconds: number,
  strength: number,
  angularSpeedFraction: number,
  maximumRadiansPerSecond: number,
  minimumRadiansPerSecond = 0,
): number {
  if (errorRadians <= 0 || deltaSeconds <= 0 || strength <= 0) return 0;
  const boundedSpeed = Math.max(0, angularSpeed);
  const rateBudget = Math.min(
    maximumRadiansPerSecond,
    Math.max(minimumRadiansPerSecond, boundedSpeed * angularSpeedFraction),
  );
  return Math.min(
    errorRadians,
    errorRadians * strength,
    rateBudget * deltaSeconds,
  );
}

export function finalGuidanceMaximumRate(progress: number): number {
  const bounded = Math.max(0, Math.min(1, progress));
  return DICE_GUIDANCE.finalMaximumRadiansPerSecond
    + (DICE_GUIDANCE.finalMinimumRadiansPerSecond - DICE_GUIDANCE.finalMaximumRadiansPerSecond) * bounded;
}

export function resultEmphasisProgress(state: DiceAnimationState, now: number): number {
  if (state.phase === 'fading' || state.phase === 'complete') return 1;
  if (state.phase !== 'resting') return 0;
  return settlingAssistStrength(
    (now - state.phaseStartedAt) / DICE_ANIMATION_TIMINGS.resultEmphasisMs,
  );
}

export function advanceDiceAnimation(
  state: DiceAnimationState,
  now: number,
  settleAssistReady: boolean,
  authoritativeOrientationReached = false,
): DiceAnimationState {
  let next = state;
  while (next.phase !== 'complete') {
    if (next.phase === 'throwing') {
      const latest = next.phaseStartedAt + DICE_ANIMATION_TIMINGS.maximumThrowMs;
      if (now >= latest) {
        next = { phase: 'reconciling', phaseStartedAt: latest };
        continue;
      }
      if (!settleAssistReady || now < next.phaseStartedAt + DICE_ANIMATION_TIMINGS.minimumThrowMs) break;
      next = { phase: 'assisting', phaseStartedAt: now };
      continue;
    }

    if (next.phase === 'assisting') {
      const earliestNaturalSettle = next.phaseStartedAt + DICE_ANIMATION_TIMINGS.minimumAssistMs;
      if (authoritativeOrientationReached && now >= earliestNaturalSettle) {
        next = { phase: 'readability', phaseStartedAt: now };
        continue;
      }
      const fallbackAt = next.phaseStartedAt + DICE_ANIMATION_TIMINGS.assistMs;
      if (now < fallbackAt) break;
      next = { phase: 'reconciling', phaseStartedAt: fallbackAt };
      continue;
    }

    if (next.phase === 'reconciling') {
      const transitionAt = next.phaseStartedAt + DICE_ANIMATION_TIMINGS.reconcileMs;
      if (now < transitionAt) break;
      next = { phase: 'readability', phaseStartedAt: transitionAt };
      continue;
    }

    if (next.phase === 'readability') {
      const transitionAt = next.phaseStartedAt + DICE_ANIMATION_TIMINGS.readabilityBeatMs;
      if (now < transitionAt) break;
      next = { phase: 'resting', phaseStartedAt: transitionAt };
      continue;
    }

    if (next.phase === 'resting') {
      const transitionAt = next.phaseStartedAt + DICE_ANIMATION_TIMINGS.restMs;
      if (now < transitionAt) break;
      next = { phase: 'fading', phaseStartedAt: transitionAt };
      continue;
    }

    const transitionAt = next.phaseStartedAt + DICE_ANIMATION_TIMINGS.fadeMs;
    if (now < transitionAt) break;
    next = { phase: 'complete', phaseStartedAt: transitionAt };
  }
  return next;
}

export function createCompletionGate(): () => boolean {
  let completed = false;
  return () => {
    if (completed) return false;
    completed = true;
    return true;
  };
}

export function createSharedInitializer(initializer: () => Promise<void>): () => Promise<void> {
  let initialization: Promise<void> | undefined;
  return () => {
    initialization ??= initializer();
    return initialization;
  };
}

export function runVisualFrameFailOpen(frame: () => void, onFailure: () => void): void {
  try {
    frame();
  } catch {
    onFailure();
  }
}
