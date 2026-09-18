import { beforeEach, describe, expect, it } from 'vitest';
import { contentRegistry } from './contentRegistry';
import { deriveCharacterState } from '../rules/deriveCharacter';
import { fighterCharacter } from '../test/fixtures';
import {
  PLAY_SESSION_STORAGE_PREFIX,
  addPlaySessionCondition,
  clearPlaySessionState,
  endPlaySessionConcentration,
  loadPlaySessionState,
  playSessionStorageKey,
  reconcilePlaySessionState,
  removePlaySessionCondition,
  savePlaySessionState,
} from './playSessionState';

describe('M13B/M13D PLAY session state', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('defaults empty, adds/removes conditions, prevents duplicates, and restores from sessionStorage', () => {
    expect(loadPlaySessionState('a')).toEqual({ conditions: [], activeEffectIds: [] });
    expect(addPlaySessionCondition('a', 'poisoned')).toEqual({ conditions: ['poisoned'], activeEffectIds: [] });
    expect(addPlaySessionCondition('a', 'poisoned')).toEqual({ conditions: ['poisoned'], activeEffectIds: [] });
    expect(loadPlaySessionState('a')).toEqual({ conditions: ['poisoned'], activeEffectIds: [] });
    expect(removePlaySessionCondition('a', 'poisoned')).toEqual({ conditions: [], activeEffectIds: [] });
  });

  it('isolates Conditions, Concentration, and active effects by Character ID without authoritative localStorage writes', () => {
    window.localStorage.setItem('sentinel', 'unchanged');
    savePlaySessionState('a', { conditions: ['poisoned'], concentration: { spellId: 'spell-x', providerId: 'provider-x' }, activeEffectIds: ['effect-a'] });
    savePlaySessionState('b', { conditions: ['blinded'], activeEffectIds: ['effect-b'] });
    expect(loadPlaySessionState('a')).toEqual({ conditions: ['poisoned'], concentration: { spellId: 'spell-x', providerId: 'provider-x' }, activeEffectIds: ['effect-a'] });
    expect(loadPlaySessionState('b')).toEqual({ conditions: ['blinded'], activeEffectIds: ['effect-b'] });
    expect(window.localStorage.getItem('sentinel')).toBe('unchanged');
    expect(window.localStorage.length).toBe(1);
  });

  it('loads old M13B v1 cache safely by defaulting active effects empty', () => {
    const key = playSessionStorageKey('legacy-session');
    window.sessionStorage.setItem(key, JSON.stringify({ conditions: ['prone'], concentration: { spellId: 'spell', providerId: 'provider' } }));
    expect(loadPlaySessionState('legacy-session')).toEqual({
      conditions: ['prone'],
      concentration: { spellId: 'spell', providerId: 'provider' },
      activeEffectIds: [],
    });
  });

  it('fails malformed cache safely and rejects duplicates, unknown conditions, and unexpected fields', () => {
    const key = playSessionStorageKey('broken');
    for (const malformed of [
      '{not-json',
      JSON.stringify({ conditions: 'poisoned' }),
      JSON.stringify({ conditions: ['exhaustion'] }),
      JSON.stringify({ conditions: ['poisoned', 'poisoned'] }),
      JSON.stringify({ conditions: [], activeEffectIds: ['rage', 'rage'] }),
      JSON.stringify({ conditions: [], activeEffectIds: [7] }),
      JSON.stringify({ conditions: [], concentration: { spellId: '', providerId: 'provider' } }),
      JSON.stringify({ conditions: [], concentration: { spellId: 'spell', providerId: 'provider', targetId: 'enemy' } }),
      JSON.stringify({ conditions: [], activeEffectIds: [], targetId: 'enemy' }),
    ]) {
      window.sessionStorage.setItem(key, malformed);
      expect(loadPlaySessionState('broken')).toEqual({ conditions: [], activeEffectIds: [] });
      expect(window.sessionStorage.getItem(key)).toBeNull();
    }
  });

  it('uses the existing versioned per-character session key; active effects persist but Cover does not', () => {
    const state = savePlaySessionState('a/b', { conditions: ['prone'], activeEffectIds: ['effect-a'] });
    const raw = window.sessionStorage.getItem(playSessionStorageKey('a/b'))!;
    expect(playSessionStorageKey('a/b')).toBe(PLAY_SESSION_STORAGE_PREFIX + 'a%2Fb');
    expect(state).toEqual({ conditions: ['prone'], activeEffectIds: ['effect-a'] });
    expect(raw).not.toContain('cover');
    expect(raw).toContain('activeEffectIds');
  });

  it('drops Concentration when an incapacitating condition is explicitly added but leaves unrelated active effects active', () => {
    savePlaySessionState('a', { conditions: [], concentration: { spellId: 'spell-x', providerId: 'provider-x' }, activeEffectIds: ['effect-a'] });
    expect(addPlaySessionCondition('a', 'stunned')).toEqual({ conditions: ['stunned'], activeEffectIds: ['effect-a'] });
  });

  it('clears stale Concentration and active-effect references while preserving valid conditions', () => {
    const character = fighterCharacter();
    const derived = deriveCharacterState(character, contentRegistry);
    if (!derived.ok) throw new Error(derived.error.message);
    savePlaySessionState(character.id, { conditions: ['poisoned'], concentration: { spellId: 'stale-spell', providerId: 'stale-provider' }, activeEffectIds: ['stale-effect'] });
    expect(reconcilePlaySessionState(character.id, derived.value)).toEqual({ conditions: ['poisoned'], activeEffectIds: [] });

    savePlaySessionState(character.id, { conditions: ['poisoned'], concentration: { spellId: 'x', providerId: 'y' }, activeEffectIds: [] });
    expect(endPlaySessionConcentration(character.id)).toEqual({ conditions: ['poisoned'], activeEffectIds: [] });
    clearPlaySessionState(character.id);
    expect(window.sessionStorage.getItem(playSessionStorageKey(character.id))).toBeNull();
  });
});
