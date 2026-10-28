import { beforeEach, describe, expect, it } from 'vitest';
import { SRD_CONTENT } from '../content/srd';
import type { SpellContent, SpellcastingProviderDefinition } from '../models/content';
import type { CharacterSpellcastingSelection } from '../models/character';
import { ContentRegistry } from '../services/contentRegistry';
import { deriveSpellcastingProviders } from './spellcasting';
import { deriveCharacterState } from './deriveCharacter';
import { calculateConcentrationSaveDc, listConcentrationCandidates, resolveConcentrationCandidate } from './concentration';
import { fighterCharacter } from '../test/fixtures';
import { addPlaySessionCondition, endPlaySessionConcentration, loadPlaySessionState, startPlaySessionConcentration } from '../services/playSessionState';

const source = { type: 'homebrew', namespace: 'm13b-test' } as const;
const focusSpell: SpellContent = {
  id: 'homebrew:m13b-test:spell:focus-light',
  kind: 'spell',
  name: 'Focus Light',
  source,
  level: 1,
  school: 'evocation',
  castingTime: 'Action',
  range: 'Self',
  components: { verbal: true, somatic: false, material: false },
  duration: 'Concentration, up to 1 minute',
  concentration: true,
  ritual: false,
  description: 'Synthetic Concentration fixture.',
  spellLists: [{ id: 'm13b-test', name: 'M13B Test' }],
  mechanics: [],
  referenceEffects: [],
};
const secondFocusSpell: SpellContent = { ...focusSpell, id: 'homebrew:m13b-test:spell:focus-shade', name: 'Focus Shade' };
const ordinarySpell: SpellContent = { ...focusSpell, id: 'homebrew:m13b-test:spell:flash', name: 'Flash', concentration: false, duration: 'Instantaneous' };

export function syntheticConcentrationState() {
  const registry = new ContentRegistry(SRD_CONTENT, [focusSpell, secondFocusSpell, ordinarySpell]);
  const character = fighterCharacter({ level: 4 });
  const base = deriveCharacterState(character, registry);
  if (!base.ok) throw new Error(base.error.message);
  const definition: SpellcastingProviderDefinition = {
    id: 'homebrew:m13b-test:provider:focus',
    name: 'Focus Casting',
    spellcastingAbility: { kind: 'fixed', ability: 'wisdom' },
    multiclassSlotContribution: { kind: 'independent' },
    spellManagement: { kind: 'granted-only', spellIds: [focusSpell.id, secondFocusSpell.id, ordinarySpell.id] },
    ritualCasting: 'none',
  };
  const casting = deriveSpellcastingProviders(
    [{ definition, source, grantedBy: { contentId: 'homebrew:m13b-test:feature:focus', contentName: 'Focus Gift' } }],
    base.value.level,
    base.value.abilityModifiers,
    base.value.proficiencyBonus,
    registry,
  );
  if (!casting.ok) throw new Error(casting.error.message);
  return { registry, character, state: { ...base.value, spellcasting: casting.value.providers } };
}

function syntheticPreparedConcentrationState() {
  const registry = new ContentRegistry(SRD_CONTENT, [focusSpell, secondFocusSpell, ordinarySpell]);
  const character = fighterCharacter({ level: 4 });
  const base = deriveCharacterState(character, registry);
  if (!base.ok) throw new Error(base.error.message);
  const definition: SpellcastingProviderDefinition = {
    id: 'homebrew:m13b-test:provider:prepared-focus',
    name: 'Prepared Focus Casting',
    spellcastingAbility: { kind: 'fixed', ability: 'wisdom' },
    multiclassSlotContribution: { kind: 'independent' },
    spellManagement: {
      kind: 'prepared-from-list',
      spellListId: 'm13b-test',
      cantripCount: [{ level: 1, count: 0 }],
      preparedSpellCount: [{ level: 1, count: 2 }],
      replacement: 'long-rest-any',
    },
    ritualCasting: 'prepared',
  };
  const selection: CharacterSpellcastingSelection = {
    providerId: definition.id,
    cantripIds: [],
    ownedSpellIds: [],
    preparedSpellIds: [focusSpell.id, ordinarySpell.id],
  };
  const casting = deriveSpellcastingProviders(
    [{ definition, source, grantedBy: { contentId: 'homebrew:m13b-test:feature:prepared-focus', contentName: 'Prepared Focus Gift' } }],
    base.value.level,
    base.value.abilityModifiers,
    base.value.proficiencyBonus,
    registry,
    [],
    [selection],
  );
  if (!casting.ok) throw new Error(casting.error.message);
  return { registry, character, state: { ...base.value, spellcasting: casting.value.providers } };
}

describe('M13B Concentration rules', () => {
  beforeEach(() => window.sessionStorage.clear());
  it.each([
    [1, 10], [19, 10], [20, 10], [21, 10], [22, 11], [59, 29], [60, 30], [100, 30],
  ])('calculates the SRD damage Concentration DC for %i damage as %i', (damage, expected) => {
    expect(calculateConcentrationSaveDc(damage)).toEqual({ ok: true, value: expected });
  });

  it('rejects invalid damage amounts', () => {
    expect(calculateConcentrationSaveDc(0)).toMatchObject({ ok: false, error: { code: 'invalid-amount' } });
    expect(calculateConcentrationSaveDc(2.5)).toMatchObject({ ok: false, error: { code: 'invalid-amount' } });
  });

  it('discovers unrelated Homebrew Concentration spells from actually available provider spells', () => {
    const { state } = syntheticConcentrationState();
    expect(listConcentrationCandidates(state).map((entry) => entry.spellName)).toEqual(['Focus Light', 'Focus Shade']);
    expect(resolveConcentrationCandidate(state, 'homebrew:m13b-test:provider:focus', focusSpell.id)).toMatchObject({ ok: true, value: { spellName: 'Focus Light' } });
  });

  it('excludes unselected prepared-from-list Concentration spells and owned non-Concentration spells', () => {
    const { state } = syntheticPreparedConcentrationState();
    const provider = state.spellcasting[0];
    expect(provider.management).toMatchObject({ kind: 'prepared-from-list' });
    if (provider.management.kind !== 'prepared-from-list') throw new Error('Expected prepared-from-list provider.');

    expect(provider.management.catalogSpells.map((spell) => spell.id)).toEqual(expect.arrayContaining([
      focusSpell.id,
      secondFocusSpell.id,
      ordinarySpell.id,
    ]));
    expect(provider.management.preparedSpells.map((spell) => spell.id)).toEqual([focusSpell.id, ordinarySpell.id]);

    const candidates = listConcentrationCandidates(state);
    expect(candidates).toEqual([
      {
        providerId: provider.id,
        providerName: provider.name,
        spellId: focusSpell.id,
        spellName: focusSpell.name,
      },
    ]);
    expect(candidates.some((candidate) => candidate.spellId === secondFocusSpell.id)).toBe(false);
    expect(candidates.some((candidate) => candidate.spellId === ordinarySpell.id)).toBe(false);
    expect(resolveConcentrationCandidate(state, provider.id, secondFocusSpell.id)).toMatchObject({
      ok: false,
      error: { code: 'invalid-concentration' },
    });
  });

  it('returns no candidates for a Character with no spellcasting providers', () => {
    const registry = new ContentRegistry(SRD_CONTENT);
    const character = fighterCharacter({ level: 4 });
    const state = deriveCharacterState(character, registry);
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    expect(state.value.spellcasting).toEqual([]);
    expect(listConcentrationCandidates(state.value)).toEqual([]);
  });

  it('preserves provider-scoped identity across multiple legitimate providers', () => {
    const prepared = syntheticPreparedConcentrationState();
    const granted = syntheticConcentrationState();
    const state = {
      ...prepared.state,
      spellcasting: [...prepared.state.spellcasting, ...granted.state.spellcasting],
    };

    const candidates = listConcentrationCandidates(state);
    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerId: 'homebrew:m13b-test:provider:prepared-focus',
        spellId: focusSpell.id,
      }),
      expect.objectContaining({
        providerId: 'homebrew:m13b-test:provider:focus',
        spellId: focusSpell.id,
      }),
      expect.objectContaining({
        providerId: 'homebrew:m13b-test:provider:focus',
        spellId: secondFocusSpell.id,
      }),
    ]));
    expect(candidates.some((candidate) =>
      candidate.providerId === 'homebrew:m13b-test:provider:prepared-focus'
      && candidate.spellId === secondFocusSpell.id
    )).toBe(false);
  });

  it('rejects non-Concentration and unresolved provider/spell references without prose parsing', () => {
    const { state } = syntheticConcentrationState();
    expect(resolveConcentrationCandidate(state, 'homebrew:m13b-test:provider:focus', ordinarySpell.id)).toMatchObject({ ok: false, error: { code: 'invalid-concentration' } });
    expect(resolveConcentrationCandidate(state, 'missing-provider', focusSpell.id)).toMatchObject({ ok: false, error: { code: 'missing-spellcasting-provider' } });
  });

  it('starts, replaces, reloads, and explicitly ends unrelated Homebrew Concentration generically', () => {
    const { character, state } = syntheticConcentrationState();
    const providerId = 'homebrew:m13b-test:provider:focus';
    expect(startPlaySessionConcentration(character.id, providerId, focusSpell.id, state)).toMatchObject({ ok: true, value: { concentration: { providerId, spellId: focusSpell.id } } });
    expect(loadPlaySessionState(character.id).concentration?.spellId).toBe(focusSpell.id);
    expect(startPlaySessionConcentration(character.id, providerId, secondFocusSpell.id, state)).toMatchObject({ ok: true, value: { concentration: { providerId, spellId: secondFocusSpell.id } } });
    expect(endPlaySessionConcentration(character.id)).toEqual({ conditions: [], activeEffectIds: [] });
  });

  it('will not start Concentration while an active incapacitating condition makes it impossible', () => {
    const { character, state } = syntheticConcentrationState();
    addPlaySessionCondition(character.id, 'incapacitated');
    expect(startPlaySessionConcentration(character.id, 'homebrew:m13b-test:provider:focus', focusSpell.id, state)).toMatchObject({ ok: false, error: { code: 'invalid-concentration' } });
  });
});
