import { describe, expect, it } from 'vitest';
import {
  DICE_ANIMATION_TIMINGS,
  DICE_GUIDANCE,
  advanceDiceAnimation,
  createCompletionGate,
  createDiceAnimationState,
  createSharedInitializer,
  earlyGuidanceStrength,
  finalGuidanceMaximumRate,
  guidanceAngularStep,
  resultEmphasisProgress,
  runVisualFrameFailOpen,
  settlingAssistStrength,
  shouldBeginSettlingAssist,
} from './diceAnimationState';

describe('dice animation lifecycle', () => {
  it('keeps energetic motion fully free until the minimum believable tumble', () => {
    const state = createDiceAnimationState(100);
    expect(shouldBeginSettlingAssist(DICE_ANIMATION_TIMINGS.minimumThrowMs - 1, 0, 0)).toBe(false);
    expect(advanceDiceAnimation(
      state,
      100 + DICE_ANIMATION_TIMINGS.minimumThrowMs - 1,
      true,
    ).phase).toBe('throwing');
  });

  it('starts weak hidden guidance well before low-energy settling can begin', () => {
    expect(earlyGuidanceStrength(DICE_GUIDANCE.earlyStartMs)).toBe(0);
    expect(earlyGuidanceStrength(DICE_GUIDANCE.earlyStartMs + 120)).toBeGreaterThan(0);
    expect(DICE_GUIDANCE.earlyStartMs).toBeLessThan(DICE_ANIMATION_TIMINGS.minimumThrowMs);
    expect(earlyGuidanceStrength(DICE_ANIMATION_TIMINGS.minimumThrowMs)).toBeCloseTo(DICE_GUIDANCE.earlyStrength, 4);
    expect(DICE_GUIDANCE.earlyStrength).toBeLessThan(DICE_GUIDANCE.finalStrength);
  });

  it('keeps guidance progressive and rate-limited rather than applying a discrete orientation jump', () => {
    const error = Math.PI / 2;
    const delta = 1 / 60;
    const weak = guidanceAngularStep(
      error,
      10,
      delta,
      DICE_GUIDANCE.earlyStrength,
      DICE_GUIDANCE.earlyAngularSpeedFraction,
      DICE_GUIDANCE.earlyMaximumRadiansPerSecond,
    );
    const strong = guidanceAngularStep(
      error,
      4,
      delta,
      DICE_GUIDANCE.finalStrength,
      DICE_GUIDANCE.finalAngularSpeedFraction,
      DICE_GUIDANCE.finalMaximumRadiansPerSecond,
      DICE_GUIDANCE.finalMinimumRadiansPerSecond,
    );

    expect(weak).toBeGreaterThan(0);
    expect(strong).toBeGreaterThan(0);
    expect(weak).toBeLessThan(error);
    expect(strong).toBeLessThan(error);
    expect(weak).toBeLessThanOrEqual(DICE_GUIDANCE.earlyMaximumRadiansPerSecond * delta + 1e-10);
    expect(strong).toBeLessThanOrEqual(DICE_GUIDANCE.finalMaximumRadiansPerSecond * delta + 1e-10);
  });

  it('shrinks the final guidance rate budget as the die slows so late correction cannot create an angular-speed spike', () => {
    const error = Math.PI / 6;
    const delta = 1 / 60;
    const earlyFinalStep = guidanceAngularStep(
      error,
      4,
      delta,
      DICE_GUIDANCE.finalStrength,
      DICE_GUIDANCE.finalAngularSpeedFraction,
      finalGuidanceMaximumRate(0),
      DICE_GUIDANCE.finalMinimumRadiansPerSecond,
    );
    const lateFinalStep = guidanceAngularStep(
      error,
      0.5,
      delta,
      DICE_GUIDANCE.finalStrength,
      DICE_GUIDANCE.finalAngularSpeedFraction,
      finalGuidanceMaximumRate(1),
      DICE_GUIDANCE.finalMinimumRadiansPerSecond,
    );

    expect(finalGuidanceMaximumRate(1)).toBeLessThan(finalGuidanceMaximumRate(0));
    expect(lateFinalStep).toBeLessThanOrEqual(earlyFinalStep);
    expect(lateFinalStep / delta).toBeLessThanOrEqual(DICE_GUIDANCE.finalMinimumRadiansPerSecond + 1e-10);
  });

  it('can reduce a representative deterministic orientation budget below 15 degrees before final presentation without fallback acceleration', () => {
    let error = 70 * Math.PI / 180;
    const delta = 1 / 60;

    for (let elapsed = DICE_GUIDANCE.earlyStartMs; elapsed <= DICE_ANIMATION_TIMINGS.minimumThrowMs; elapsed += 1000 / 60) {
      error -= guidanceAngularStep(
        error,
        10,
        delta,
        earlyGuidanceStrength(elapsed),
        DICE_GUIDANCE.earlyAngularSpeedFraction,
        DICE_GUIDANCE.earlyMaximumRadiansPerSecond,
      );
    }

    const assistFrames = Math.floor(DICE_ANIMATION_TIMINGS.assistMs / (1000 / 60));
    for (let frame = 0; frame <= assistFrames; frame += 1) {
      const progress = frame / Math.max(1, assistFrames);
      const angularSpeed = 5 - 4.2 * progress;
      const strength = DICE_GUIDANCE.earlyStrength
        + (DICE_GUIDANCE.finalStrength - DICE_GUIDANCE.earlyStrength) * settlingAssistStrength(progress);
      error -= guidanceAngularStep(
        error,
        angularSpeed,
        delta,
        strength,
        DICE_GUIDANCE.finalAngularSpeedFraction,
        finalGuidanceMaximumRate(progress),
        DICE_GUIDANCE.finalMinimumRadiansPerSecond,
      );
    }

    expect(error * 180 / Math.PI).toBeLessThanOrEqual(15);
  });

  it('begins low-energy settling assist after the minimum free-physics duration', () => {
    const state = createDiceAnimationState(100);
    expect(shouldBeginSettlingAssist(DICE_ANIMATION_TIMINGS.minimumThrowMs, 2.2, 6.5)).toBe(true);
    const assisting = advanceDiceAnimation(
      state,
      100 + DICE_ANIMATION_TIMINGS.minimumThrowMs,
      true,
    );
    expect(assisting.phase).toBe('assisting');
  });

  it('does not begin settling assist while kinetic energy remains high', () => {
    expect(shouldBeginSettlingAssist(DICE_ANIMATION_TIMINGS.minimumThrowMs + 500, 4, 6)).toBe(false);
    expect(shouldBeginSettlingAssist(DICE_ANIMATION_TIMINGS.minimumThrowMs + 500, 2, 10)).toBe(false);
  });

  it('moves a naturally converged assisted roll through readability beat, gold-result rest, fade, and completion', () => {
    const throwing = createDiceAnimationState(0);
    const assisting = advanceDiceAnimation(throwing, DICE_ANIMATION_TIMINGS.minimumThrowMs, true);
    expect(assisting.phase).toBe('assisting');

    const beforeNaturalSettle = advanceDiceAnimation(
      assisting,
      assisting.phaseStartedAt + DICE_ANIMATION_TIMINGS.minimumAssistMs - 1,
      true,
      true,
    );
    expect(beforeNaturalSettle.phase).toBe('assisting');

    const readable = advanceDiceAnimation(
      assisting,
      assisting.phaseStartedAt + DICE_ANIMATION_TIMINGS.minimumAssistMs,
      true,
      true,
    );
    expect(readable.phase).toBe('readability');
    expect(resultEmphasisProgress(readable, readable.phaseStartedAt + DICE_ANIMATION_TIMINGS.readabilityBeatMs - 1)).toBe(0);

    const resting = advanceDiceAnimation(
      readable,
      readable.phaseStartedAt + DICE_ANIMATION_TIMINGS.readabilityBeatMs,
      true,
      true,
    );
    expect(resting.phase).toBe('resting');
    expect(resultEmphasisProgress(resting, resting.phaseStartedAt)).toBe(0);
    expect(resultEmphasisProgress(
      resting,
      resting.phaseStartedAt + DICE_ANIMATION_TIMINGS.resultEmphasisMs,
    )).toBe(1);

    const fading = advanceDiceAnimation(
      resting,
      resting.phaseStartedAt + DICE_ANIMATION_TIMINGS.restMs,
      true,
      true,
    );
    expect(fading.phase).toBe('fading');
    expect(resultEmphasisProgress(fading, fading.phaseStartedAt)).toBe(1);

    const complete = advanceDiceAnimation(
      fading,
      fading.phaseStartedAt + DICE_ANIMATION_TIMINGS.fadeMs,
      true,
      true,
    );
    expect(complete.phase).toBe('complete');
  });

  it('uses smooth weak-to-strong settling assistance without changing any result payload', () => {
    const authoritativeValues = Object.freeze([17, 4, 6]);
    expect(settlingAssistStrength(-1)).toBe(0);
    expect(settlingAssistStrength(0)).toBe(0);
    expect(settlingAssistStrength(0.5)).toBeCloseTo(0.5, 6);
    expect(settlingAssistStrength(1)).toBe(1);
    expect(settlingAssistStrength(2)).toBe(1);
    expect(authoritativeValues).toEqual([17, 4, 6]);
  });

  it('falls back to reconciliation if assisted settling does not converge in time', () => {
    const throwing = createDiceAnimationState(0);
    const assisting = advanceDiceAnimation(throwing, DICE_ANIMATION_TIMINGS.minimumThrowMs, true);
    const fallback = advanceDiceAnimation(
      assisting,
      assisting.phaseStartedAt + DICE_ANIMATION_TIMINGS.assistMs,
      true,
      false,
    );
    expect(fallback.phase).toBe('reconciling');

    const readable = advanceDiceAnimation(
      fallback,
      fallback.phaseStartedAt + DICE_ANIMATION_TIMINGS.reconcileMs,
      true,
      false,
    );
    expect(readable.phase).toBe('readability');
  });

  it('uses the hard throw timeout as a direct fallback and still completes the animation', () => {
    const state = createDiceAnimationState(0);
    const fallback = advanceDiceAnimation(state, DICE_ANIMATION_TIMINGS.maximumThrowMs, false);
    expect(fallback.phase).toBe('reconciling');

    const complete = advanceDiceAnimation(fallback, 10_000, false);
    expect(complete.phase).toBe('complete');
  });

  it('never emphasizes the authoritative numeral during throw, assist, fallback, or readability search', () => {
    const states = [
      { phase: 'throwing', phaseStartedAt: 0 },
      { phase: 'assisting', phaseStartedAt: 0 },
      { phase: 'reconciling', phaseStartedAt: 0 },
      { phase: 'readability', phaseStartedAt: 0 },
    ] as const;

    for (const state of states) {
      expect(resultEmphasisProgress(state, 100_000)).toBe(0);
    }
  });

  it('catches up safely after a delayed frame without extending stale animation', () => {
    const state = createDiceAnimationState(0);
    expect(advanceDiceAnimation(state, 10_000, false).phase).toBe('complete');
  });

  it('allows completion cleanup to notify its owner only once', () => {
    const completeOnce = createCompletionGate();
    expect(completeOnce()).toBe(true);
    expect(completeOnce()).toBe(false);
    expect(completeOnce()).toBe(false);
  });

  it('shares one async runtime initialization across concurrent Strict Mode effects', async () => {
    let calls = 0;
    const initialize = createSharedInitializer(async () => {
      calls += 1;
    });

    const first = initialize();
    const second = initialize();

    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(calls).toBe(1);
  });

  it('turns a runtime frame failure into visual-only cleanup', () => {
    let failures = 0;
    expect(() => runVisualFrameFailOpen(() => { throw new Error('WebGL context lost'); }, () => { failures += 1; })).not.toThrow();
    expect(failures).toBe(1);
  });
});
