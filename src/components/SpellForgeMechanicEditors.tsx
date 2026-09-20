import type { SpellDieTerm, SpellLevel, SpellRollAmount, SpellScaling } from '../models/content';
import {
  SPELL_FORGE_DAMAGE_TYPES,
  SPELL_FORGE_DICE,
  addDiceTerm,
  createCharacterLevelScaling,
  createSlotLevelScaling,
  removeDiceTerm,
  updateDiceTerm,
  type SpellForgeDamageDraft,
  type SpellForgeHealingDraft,
} from './spellForgeModel';

function DiceTermsEditor({
  label,
  terms,
  onChange,
}: {
  label: string;
  terms: readonly SpellDieTerm[];
  onChange: (terms: SpellDieTerm[]) => void;
}) {
  return (
    <div className="spell-forge-dice">
      <strong>{label}</strong>
      <div className="forge-editor-list">
        {terms.map((term, index) => (
          <div className="spell-forge-die-row" key={index}>
            <label className="field">
              <span>Count</span>
              <input
                aria-label={label + ' die count ' + (index + 1)}
                min="1"
                type="number"
                step="1"
                value={term.count}
                onChange={(event) => onChange(updateDiceTerm(terms, index, { ...term, count: Number(event.target.value) }))}
              />
            </label>
            <label className="field">
              <span>Die</span>
              <select
                aria-label={label + ' die size ' + (index + 1)}
                value={term.die}
                onChange={(event) => onChange(updateDiceTerm(terms, index, { ...term, die: Number(event.target.value) as SpellDieTerm['die'] }))}
              >
                {SPELL_FORGE_DICE.map((die) => <option key={die} value={die}>d{die}</option>)}
              </select>
            </label>
            <button className="button button--secondary" type="button" onClick={() => onChange(removeDiceTerm(terms, index))}>Remove die</button>
          </div>
        ))}
      </div>
      <button className="button button--secondary" type="button" onClick={() => onChange(addDiceTerm(terms))}>Add die term</button>
    </div>
  );
}

function ScalingEditor({
  label,
  spellLevel,
  amount,
  scaling,
  onChange,
}: {
  label: string;
  spellLevel: SpellLevel;
  amount: SpellRollAmount;
  scaling: SpellScaling | undefined;
  onChange: (scaling: SpellScaling | undefined) => void;
}) {
  const scalingKind = scaling?.kind ?? 'none';
  return (
    <div className="forge-subsection">
      <label className="field forge-field-small">
        <span>Scaling</span>
        <select
          aria-label={label + ' scaling type'}
          value={scalingKind}
          onChange={(event) => {
            const kind = event.target.value;
            if (kind === 'none') onChange(undefined);
            else if (kind === 'character-level-dice') onChange(createCharacterLevelScaling(amount));
            else if (spellLevel > 0) onChange(createSlotLevelScaling(spellLevel as Exclude<SpellLevel, 0>));
          }}
        >
          <option value="none">No machine-readable scaling</option>
          {spellLevel === 0
            ? <option value="character-level-dice">Character-level dice scaling</option>
            : <option value="slot-level-dice">Slot-level dice scaling</option>}
        </select>
      </label>

      {scaling?.kind === 'character-level-dice' && (
        <div className="forge-level-table">
          {scaling.values.map((row, index) => (
            <article className="forge-editor-row" key={index}>
              <label className="field forge-field-small">
                <span>Character level threshold</span>
                <input
                  aria-label={label + ' scaling level ' + (index + 1)}
                  min="1"
                  max="20"
                  type="number"
                  step="1"
                  value={row.level}
                  onChange={(event) => onChange({
                    kind: 'character-level-dice',
                    values: scaling.values.map((candidate, candidateIndex) => candidateIndex === index
                      ? { ...candidate, level: Number(event.target.value) }
                      : candidate),
                  })}
                />
              </label>
              <DiceTermsEditor
                label={label + ' scaling row ' + (index + 1)}
                terms={row.dice}
                onChange={(dice) => onChange({
                  kind: 'character-level-dice',
                  values: scaling.values.map((candidate, candidateIndex) => candidateIndex === index
                    ? { ...candidate, dice }
                    : candidate),
                })}
              />
              <button
                className="button button--secondary"
                type="button"
                onClick={() => onChange({
                  kind: 'character-level-dice',
                  values: scaling.values.filter((_, candidateIndex) => candidateIndex !== index),
                })}
              >
                Remove scaling row
              </button>
            </article>
          ))}
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              const lastLevel = scaling.values.at(-1)?.level ?? 0;
              onChange({
                kind: 'character-level-dice',
                values: [...scaling.values, {
                  level: Math.min(20, lastLevel + 1),
                  dice: amount.dice.map((term) => ({ ...term })),
                }],
              });
            }}
          >
            Add scaling row
          </button>
        </div>
      )}

      {scaling?.kind === 'slot-level-dice' && (
        <div className="forge-subsection">
          <dl className="detail-list">
            <div><dt>Base Spell level</dt><dd>{scaling.baseSpellLevel}</dd></div>
          </dl>
          <DiceTermsEditor
            label={label + ' dice per slot level'}
            terms={scaling.dicePerLevel}
            onChange={(dicePerLevel) => onChange({ ...scaling, dicePerLevel })}
          />
        </div>
      )}
    </div>
  );
}

function RollAmountEditor({
  label,
  spellLevel,
  amount,
  scaling,
  onAmountChange,
  onScalingChange,
}: {
  label: string;
  spellLevel: SpellLevel;
  amount: SpellRollAmount;
  scaling: SpellScaling | undefined;
  onAmountChange: (amount: SpellRollAmount) => void;
  onScalingChange: (scaling: SpellScaling | undefined) => void;
}) {
  return (
    <>
      <DiceTermsEditor
        label={label + ' base dice'}
        terms={amount.dice}
        onChange={(dice) => onAmountChange({ ...amount, dice })}
      />
      <label className="field forge-field-small">
        <span>Modifier</span>
        <select
          aria-label={label + ' modifier'}
          value={amount.modifier}
          onChange={(event) => onAmountChange({
            ...amount,
            modifier: event.target.value as SpellRollAmount['modifier'],
          })}
        >
          <option value="none">No modifier</option>
          <option value="spellcasting-ability">Spellcasting Ability modifier</option>
        </select>
      </label>
      <ScalingEditor
        label={label}
        spellLevel={spellLevel}
        amount={amount}
        scaling={scaling}
        onChange={onScalingChange}
      />
    </>
  );
}

export function SpellForgeDamageEditor({
  spellLevel,
  damage,
  onChange,
  onRemove,
}: {
  spellLevel: SpellLevel;
  damage: SpellForgeDamageDraft;
  onChange: (damage: SpellForgeDamageDraft) => void;
  onRemove: () => void;
}) {
  return (
    <article className="forge-editor-row">
      <div className="forge-editor-row__header">
        <div>
          <span className="eyebrow">Automated</span>
          <h3>Damage roll</h3>
        </div>
        <button className="button button--secondary" type="button" onClick={onRemove}>Remove damage</button>
      </div>
      <label className="field forge-field-small">
        <span>Damage type</span>
        <select
          aria-label="Damage type"
          value={damage.damageType}
          onChange={(event) => onChange({ ...damage, damageType: event.target.value as SpellForgeDamageDraft['damageType'] })}
        >
          {SPELL_FORGE_DAMAGE_TYPES.map((type) => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}
        </select>
      </label>
      <RollAmountEditor
        label="Damage"
        spellLevel={spellLevel}
        amount={damage.amount}
        scaling={damage.scaling}
        onAmountChange={(amount) => onChange({ ...damage, amount })}
        onScalingChange={(scaling) => onChange({ ...damage, scaling })}
      />
      <p className="field-hint">This is one canonical damage mechanic. Target selection, target HP, conditions, persistent zones, and secondary damage remain manual/reference-only.</p>
    </article>
  );
}

export function SpellForgeHealingEditor({
  spellLevel,
  healing,
  onChange,
  onRemove,
}: {
  spellLevel: SpellLevel;
  healing: SpellForgeHealingDraft;
  onChange: (healing: SpellForgeHealingDraft) => void;
  onRemove: () => void;
}) {
  return (
    <article className="forge-editor-row">
      <div className="forge-editor-row__header">
        <div>
          <span className="eyebrow">Automated</span>
          <h3>Healing roll</h3>
        </div>
        <button className="button button--secondary" type="button" onClick={onRemove}>Remove healing</button>
      </div>
      <RollAmountEditor
        label="Healing"
        spellLevel={spellLevel}
        amount={healing.amount}
        scaling={healing.scaling}
        onAmountChange={(amount) => onChange({ ...healing, amount })}
        onScalingChange={(scaling) => onChange({ ...healing, scaling })}
      />
      <p className="field-hint">This rolls healing through the existing Dice Engine only. Choosing a target and mutating target HP remain manual.</p>
    </article>
  );
}
