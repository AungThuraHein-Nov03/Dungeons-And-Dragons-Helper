import { describe, expect, it } from 'vitest';
import { FIGHTER_ACTION_SURGE_RESOURCE_ID, FIGHTER_SECOND_WIND_RESOURCE_ID } from '../content/srd/fighter';
import type { DerivedResource } from './types';
import { fighterCharacter, fullFighter4PlayState } from '../test/fixtures';
import { contentRegistry } from '../services/contentRegistry';
import { deriveCharacterState } from './deriveCharacter';
import {
  applyDamage,
  applyHealing,
  expendResource,
  finishLongRest,
  finishShortRest,
  reconcilePlayState,
  setTemporaryHp,
  spendHitDie,
} from './playState';

function fighterContext() {
  const character = fighterCharacter();
  const derived = deriveCharacterState(character, contentRegistry);
  if (!derived.ok) throw new Error(derived.error.message);
  return { character, derived: derived.value, context: { health: derived.value.health, resources: derived.value.resources } };
}

describe('play-state transitions', () => {
  it('applies damage to Temporary HP first and floors normal HP at zero', () => {
    const withTemp = fullFighter4PlayState({ currentHp: 30, temporaryHp: 5 });
    expect(applyDamage(withTemp, 8)).toMatchObject({ ok: true, value: { temporaryHp: 0, currentHp: 27 } });
    expect(applyDamage(fullFighter4PlayState({ currentHp: 3 }), 99)).toMatchObject({ ok: true, value: { currentHp: 0 } });
    expect(applyDamage(withTemp, -1)).toMatchObject({ ok: false, error: { code: 'invalid-amount' } });
    expect(applyDamage(withTemp, Number.NaN)).toMatchObject({ ok: false, error: { code: 'invalid-amount' } });
    expect(applyDamage(withTemp, 0)).toMatchObject({ ok: false, error: { code: 'invalid-amount' } });
  });

  it('caps healing at maximum HP without changing Temporary HP', () => {
    expect(applyHealing(fullFighter4PlayState({ currentHp: 33, temporaryHp: 4 }), 10, 36)).toMatchObject({ ok: true, value: { currentHp: 36, temporaryHp: 4 } });
    expect(applyHealing(fullFighter4PlayState(), -2, 36)).toMatchObject({ ok: false, error: { code: 'invalid-amount' } });
  });

  it('supports the SRD choice to keep existing or replace Temporary HP', () => {
    const state = fullFighter4PlayState({ temporaryHp: 8 });
    expect(setTemporaryHp(state, 5, 'keep')).toMatchObject({ ok: true, value: { temporaryHp: 8 } });
    expect(setTemporaryHp(state, 5, 'replace')).toMatchObject({ ok: true, value: { temporaryHp: 5 } });
    expect(setTemporaryHp(state, -1)).toMatchObject({ ok: false, error: { code: 'invalid-amount' } });
  });

  it('spends one Hit Die, validates the manual result, adds Constitution, and caps healing', () => {
    const { derived } = fighterContext();
    const damaged = fullFighter4PlayState({ currentHp: 20, hitDiceRemaining: 4 });
    expect(spendHitDie(damaged, 10, 7, derived.abilityModifiers.constitution, derived.health)).toMatchObject({ ok: true, value: { currentHp: 29, hitDiceRemaining: { 10: 3 } } });
    expect(spendHitDie(fullFighter4PlayState({ currentHp: 35 }), 10, 10, 2, derived.health)).toMatchObject({ ok: true, value: { currentHp: 36, hitDiceRemaining: { 10: 3 } } });
    expect(spendHitDie(damaged, 10, 11, 2, derived.health)).toMatchObject({ ok: false, error: { code: 'invalid-hit-die-roll' } });
    expect(spendHitDie(fullFighter4PlayState({ hitDiceRemaining: 0 }), 10, 5, 2, derived.health)).toMatchObject({ ok: false, error: { code: 'unavailable-hit-die' } });
  });

  it('prevents rests and Hit Dice spending at 0 HP', () => {
    const { context, derived } = fighterContext();
    const zero = fullFighter4PlayState({ currentHp: 0 });
    expect(spendHitDie(zero, 10, 5, 2, derived.health)).toMatchObject({ ok: false, error: { code: 'rest-unavailable' } });
    expect(finishShortRest(zero, derived.resources)).toMatchObject({ ok: false, error: { code: 'rest-unavailable' } });
    expect(finishLongRest(zero, context)).toMatchObject({ ok: false, error: { code: 'rest-unavailable' } });
  });

  it('recovers resources according to metadata on a Short Rest', () => {
    const { derived } = fighterContext();
    const spent = fullFighter4PlayState({ resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 0, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 0 } });
    const result = finishShortRest(spent, derived.resources);
    expect(result).toMatchObject({ ok: true, value: { resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 1, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 1 } } });
  });

  it('restores full supported play state on a Long Rest', () => {
    const { context } = fighterContext();
    const spent = fullFighter4PlayState({
      currentHp: 11,
      temporaryHp: 7,
      hitDiceRemaining: 1,
      resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 0, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 0 },
    });
    expect(finishLongRest(spent, context)).toMatchObject({
      ok: true,
      value: {
        currentHp: 36,
        temporaryHp: 0,
        hitDiceRemaining: { 10: 4 },
        resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 3, [FIGHTER_ACTION_SURGE_RESOURCE_ID]: 1 },
      },
    });
  });

  it('cannot overspend or resolve an unknown resource, including variable numeric expenditure', () => {
    const { derived } = fighterContext();
    expect(expendResource(fullFighter4PlayState({ resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 0 } }), FIGHTER_SECOND_WIND_RESOURCE_ID, derived.resources)).toMatchObject({ ok: false, error: { code: 'resource-depleted' } });
    expect(expendResource(fullFighter4PlayState(), FIGHTER_SECOND_WIND_RESOURCE_ID, derived.resources, 2)).toMatchObject({ ok: true, value: { resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 1 } } });
    expect(expendResource(fullFighter4PlayState(), FIGHTER_SECOND_WIND_RESOURCE_ID, derived.resources, 4)).toMatchObject({ ok: false, error: { code: 'resource-depleted' } });
    expect(expendResource(fullFighter4PlayState(), FIGHTER_SECOND_WIND_RESOURCE_ID, derived.resources, 0)).toMatchObject({ ok: false, error: { code: 'invalid-amount' } });
    expect(expendResource(fullFighter4PlayState(), 'homebrew:missing:resource:none', derived.resources)).toMatchObject({ ok: false, error: { code: 'unknown-resource' } });
  });

  it('runs a Homebrew resource through the same generic recovery engine', () => {
    const custom: DerivedResource = {
      id: 'homebrew:test:resource:focus',
      name: 'Focus',
      maximumUses: 3,
      source: { type: 'homebrew', namespace: 'test' },
      recovery: [{ trigger: 'short-rest', mode: 'amount', amount: 2 }, { trigger: 'long-rest', mode: 'all' }],
      consumers: [],
      presentation: 'pips',
    };
    const state = { currentHp: 10, temporaryHp: 0, hitDiceRemaining: { 8: 1 }, resourceUses: { [custom.id]: 0 } };
    expect(finishShortRest(state, [custom])).toMatchObject({ ok: true, value: { resourceUses: { [custom.id]: 2 } } });
  });

  it('reconciles changed maxima without silently healing or refilling existing resources', () => {
    const { character, context } = fighterContext();
    const damaged = { ...character, playState: fullFighter4PlayState({ currentHp: 20, hitDiceRemaining: 2, resourceUses: { [FIGHTER_SECOND_WIND_RESOURCE_ID]: 1 } }) };
    const nextCharacter = fighterCharacter({ level: 5, abilityScores: { constitution: 16 } });
    const nextDerived = deriveCharacterState(nextCharacter, contentRegistry);
    if (!nextDerived.ok) throw new Error(nextDerived.error.message);
    const next = reconcilePlayState(damaged.playState, context, { health: nextDerived.value.health, resources: nextDerived.value.resources });
    expect(next.currentHp).toBe(20);
    expect(next.hitDiceRemaining).toEqual({ 10: 3 });
    expect(next.resourceUses[FIGHTER_SECOND_WIND_RESOURCE_ID]).toBe(1);
  });
});
