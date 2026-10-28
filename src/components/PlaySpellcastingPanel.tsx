import { useMemo, useState } from 'react';
import type { RollMode } from '../dice/types';
import type { Character } from '../models/character';
import type { SpellContent } from '../models/content';
import type { CharacterConditionId } from '../rules/conditions';
import type { RuleResult } from '../rules/result';
import type { DerivedCharacterState } from '../rules/types';
import type { CharacterRollOutcome } from '../services/characterRolls';
import { SpellActionControls } from './SpellActionControls';

interface PlaySpellcastingPanelProps {
  character: Character;
  state: DerivedCharacterState;
  rollMode: RollMode;
  conditions: readonly CharacterConditionId[];
  activeEffectIds?: readonly string[];
  onRoll: (result: RuleResult<CharacterRollOutcome> | Promise<RuleResult<CharacterRollOutcome>>) => void;
  onMutation: (result: RuleResult<Character> | Promise<RuleResult<Character>>) => void;
}

function spellKey(providerId: string, spellId: string): string {
  return `${providerId}::${spellId}`;
}

function spellLevelLabel(spell: SpellContent): string {
  return spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`;
}

function componentLabel(spell: SpellContent): string {
  return [
    spell.components.verbal ? 'V' : '',
    spell.components.somatic ? 'S' : '',
    spell.components.material ? 'M' : '',
  ].filter(Boolean).join(', ') || 'None';
}

export function PlaySpellcastingPanel({
  character,
  state,
  rollMode,
  conditions,
  activeEffectIds = [],
  onRoll,
  onMutation,
}: PlaySpellcastingPanelProps) {
  const entries = useMemo(
    () => state.spellcasting.flatMap((provider) => provider.spells.map((spell) => ({ provider, spell }))),
    [state.spellcasting],
  );
  const [requestedKey, setRequestedKey] = useState(() => entries[0] ? spellKey(entries[0].provider.id, entries[0].spell.id) : '');
  if (entries.length === 0) return null;

  const selected = entries.find(({ provider, spell }) => spellKey(provider.id, spell.id) === requestedKey) ?? entries[0];
  const { provider, spell } = selected;

  return (
    <section className="play-spellcasting panel play-panel play-panel--compact" aria-labelledby="play-spellcasting-heading">
      <div className="section-heading">
        <span className="eyebrow">Actions</span>
        <h2 id="play-spellcasting-heading">Spellcasting</h2>
        <p>{provider.name}</p>
      </div>

      <label className="field compact-field">
        <span>Spell</span>
        <select value={spellKey(provider.id, spell.id)} onChange={(event) => setRequestedKey(event.target.value)}>
          {state.spellcasting.map((candidateProvider) => (
            <optgroup key={candidateProvider.id} label={candidateProvider.name}>
              {candidateProvider.spells.map((candidateSpell) => (
                <option key={spellKey(candidateProvider.id, candidateSpell.id)} value={spellKey(candidateProvider.id, candidateSpell.id)}>
                  {candidateSpell.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <div className="play-spellcasting__summary">
        <div>
          <strong>{spell.name}</strong>
          <small>{spellLevelLabel(spell)} · {spell.school}{spell.concentration ? ' · Concentration' : ''}</small>
        </div>
        <small>{spell.castingTime} · {spell.range} · {componentLabel(spell)}</small>
      </div>

      <SpellActionControls
        key={spellKey(provider.id, spell.id)}
        character={character}
        state={state}
        provider={provider}
        spell={spell}
        rollMode={rollMode}
        conditions={conditions}
        activeEffectIds={activeEffectIds}
        onRoll={onRoll}
        onMutation={onMutation}
        compact
      />

      <details className="play-reference-details">
        <summary>Details</summary>
        <div className="play-reference-details__body">
          <small>{spell.description}</small>
          <small>Duration: {spell.duration}</small>
          {spell.target && <small>Target / Area: {spell.target}</small>}
        </div>
      </details>
    </section>
  );
}
