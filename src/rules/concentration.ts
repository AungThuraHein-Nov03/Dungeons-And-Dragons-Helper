import type { ContentId } from '../models/contentId';
import type { DerivedCharacterState, DerivedSpellcastingProvider } from './types';
import { ruleError, ruleOk, type RuleResult } from './result';

export interface ConcentrationCandidate {
  readonly providerId: ContentId;
  readonly providerName: string;
  readonly spellId: ContentId;
  readonly spellName: string;
}

function providerConcentrationSpells(provider: DerivedSpellcastingProvider) {
  const candidates = [...provider.spells, ...provider.ritualSpells];
  return candidates.filter(
    (spell, index, list) => spell.concentration && list.findIndex((candidate) => candidate.id === spell.id) === index,
  );
}

export function listConcentrationCandidates(state: DerivedCharacterState): ConcentrationCandidate[] {
  return state.spellcasting.flatMap((provider) => providerConcentrationSpells(provider).map((spell) => ({
    providerId: provider.id,
    providerName: provider.name,
    spellId: spell.id,
    spellName: spell.name,
  })));
}

export function resolveConcentrationCandidate(
  state: DerivedCharacterState,
  providerId: ContentId,
  spellId: ContentId,
): RuleResult<ConcentrationCandidate> {
  const provider = state.spellcasting.find((candidate) => candidate.id === providerId);
  if (!provider) return ruleError('missing-spellcasting-provider', `Spellcasting provider could not be resolved: ${providerId}`, providerId);
  const spell = providerConcentrationSpells(provider).find((candidate) => candidate.id === spellId);
  if (!spell) return ruleError('invalid-concentration', `${provider.name} cannot start Concentration on this spell: ${spellId}`, spellId);
  return ruleOk({ providerId: provider.id, providerName: provider.name, spellId: spell.id, spellName: spell.name });
}

export function calculateConcentrationSaveDc(damageTaken: number): RuleResult<number> {
  if (!Number.isInteger(damageTaken) || damageTaken <= 0) {
    return ruleError('invalid-amount', 'Concentration damage must be a positive whole number.');
  }
  return ruleOk(Math.min(30, Math.max(10, Math.floor(damageTaken / 2))));
}
