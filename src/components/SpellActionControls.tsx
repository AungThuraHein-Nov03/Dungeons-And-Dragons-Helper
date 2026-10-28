import { useState } from 'react';
import type { RollMode } from '../dice/types';
import type { Character } from '../models/character';
import type { LeveledSpellLevel, SpellContent } from '../models/content';
import type { CharacterConditionId } from '../rules/conditions';
import { deriveConditionD20Context } from '../rules/conditions';
import { activeSelfEffectsBlockSpellcasting } from '../rules/activeSelfEffects';
import { resolveLegalSpellSlotSources } from '../rules/spellcasting';
import type { RuleResult } from '../rules/result';
import type { DerivedCharacterState, DerivedSpellcastingProvider, DerivedSpellSlotSource } from '../rules/types';
import { spendApplicationCharacterSpellSlot } from '../services/applicationPlayMutations';
import type { CharacterRollOutcome } from '../services/characterRolls';
import { rollSpellAttack, rollSpellDamage, rollSpellHealing } from '../services/spellRolls';

interface SpellActionControlsProps {
  character: Character;
  state: DerivedCharacterState;
  provider: DerivedSpellcastingProvider;
  spell: SpellContent;
  rollMode: RollMode;
  conditions: readonly CharacterConditionId[];
  activeEffectIds?: readonly string[];
  onRoll: (result: RuleResult<CharacterRollOutcome> | Promise<RuleResult<CharacterRollOutcome>>) => void;
  onMutation: (result: RuleResult<Character> | Promise<RuleResult<Character>>) => void;
  compact?: boolean;
}

function sourceKey(source: DerivedSpellSlotSource): string {
  return `${source.slotPoolId}::${source.resourceId}::${source.spellLevel}`;
}

function sourceLabel(source: DerivedSpellSlotSource, state: DerivedCharacterState): string {
  const resource = state.resources.find((candidate) => candidate.id === source.resourceId);
  return resource?.name ?? `${source.kind} slot · Level ${source.spellLevel}`;
}

export function SpellActionControls({
  character,
  state,
  provider,
  spell,
  rollMode,
  conditions,
  activeEffectIds = [],
  onRoll,
  onMutation,
  compact = false,
}: SpellActionControlsProps) {
  const legal = resolveLegalSpellSlotSources(state, provider.id, spell.id);
  const legalSources = legal.ok ? legal.value : [];
  const levels = [...new Set(legalSources.map((source) => source.spellLevel))].sort((left, right) => left - right);
  const [requestedLevel, setRequestedLevel] = useState<LeveledSpellLevel | undefined>(spell.level > 0 ? levels[0] ?? spell.level : undefined);
  const [requestedSourceKey, setRequestedSourceKey] = useState('');
  const selectedLevel = spell.level > 0 ? (levels.includes(requestedLevel as LeveledSpellLevel) ? requestedLevel : levels[0] ?? requestedLevel) : undefined;
  const selectedLevelSources = selectedLevel === undefined ? [] : legalSources.filter((source) => source.spellLevel === selectedLevel);
  const selectedSource = selectedLevelSources.find((source) => sourceKey(source) === requestedSourceKey) ?? selectedLevelSources[0];
  const selectedRemaining = selectedSource ? character.playState.resourceUses[selectedSource.resourceId] ?? 0 : undefined;
  const spellcastingBlocked = activeSelfEffectsBlockSpellcasting(state, activeEffectIds);
  const attack = spell.mechanics.some((mechanic) => mechanic.type === 'spell-attack');
  const damage = spell.mechanics.some((mechanic) => mechanic.type === 'damage');
  const healing = spell.mechanics.some((mechanic) => mechanic.type === 'healing');
  const canCast = !spellcastingBlocked && (spell.level === 0 || Boolean(selectedSource && selectedRemaining && selectedRemaining > 0));
  const rollOptions = selectedSource ? { slotSource: selectedSource } : {};

  return (
    <div className={compact ? 'spell-action-controls spell-action-controls--compact' : 'spell-action-controls'}>
      {spell.level > 0 && levels.length > 1 && (
        <label className="field compact-field">
          <span>Cast Level</span>
          <select value={selectedLevel} onChange={(event) => setRequestedLevel(Number(event.target.value) as LeveledSpellLevel)}>
            {levels.map((level) => <option key={level} value={level}>Level {level}</option>)}
          </select>
        </label>
      )}
      {spell.level > 0 && selectedLevelSources.length > 1 && (
        <label className="field compact-field">
          <span>Slot Source</span>
          <select value={sourceKey(selectedSource)} onChange={(event) => setRequestedSourceKey(event.target.value)}>
            {selectedLevelSources.map((source) => (
              <option key={sourceKey(source)} value={sourceKey(source)}>
                {sourceLabel(source, state)} · {character.playState.resourceUses[source.resourceId] ?? 0} remaining
              </option>
            ))}
          </select>
        </label>
      )}
      {spell.level > 0 && selectedSource && (
        <small>{sourceLabel(selectedSource, state)} · {selectedRemaining ?? 0} remaining</small>
      )}
      {spell.level > 0 && legalSources.length === 0 && <small>No legal spell slot is currently available.</small>}
      <div className="form-actions spell-action-controls__buttons">
        <button
          className="button button--primary"
          type="button"
          disabled={!canCast}
          onClick={() => onMutation(spendApplicationCharacterSpellSlot(character.id, provider.id, spell.id, selectedLevel, selectedSource))}
        >
          Cast Spell
        </button>
        {attack && (
          <button
            className="button button--secondary"
            type="button"
            disabled={spellcastingBlocked}
            onClick={() => onRoll(rollSpellAttack(character, state, provider.id, spell.id, rollMode, {
              d20Context: deriveConditionD20Context(conditions, { kind: 'attack' }),
              activeEffectIds,
            }))}
          >
            Spell Attack
          </button>
        )}
        {damage && (
          <button className="button button--secondary" type="button" onClick={() => onRoll(rollSpellDamage(character, state, provider.id, spell.id, selectedLevel, false, rollOptions))}>
            Damage
          </button>
        )}
        {attack && damage && (
          <button className="button button--secondary" type="button" onClick={() => onRoll(rollSpellDamage(character, state, provider.id, spell.id, selectedLevel, true, rollOptions))}>
            Critical Damage
          </button>
        )}
        {healing && (
          <button className="button button--secondary" type="button" onClick={() => onRoll(rollSpellHealing(character, state, provider.id, spell.id, selectedLevel, rollOptions))}>
            Healing
          </button>
        )}
      </div>
    </div>
  );
}
