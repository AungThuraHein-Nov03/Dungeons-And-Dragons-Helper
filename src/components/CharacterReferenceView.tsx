import { useState } from 'react';
import { mergeD20RollContexts } from '../dice/diceEngine';
import { AbilityScoreCard } from './AbilityScoreCard';
import { CoverControl } from './CoverControl';
import { RollModeControl } from './RollModeControl';
import type { RollMode } from '../dice/types';
import { ABILITY_KEYS, SKILL_IDS, type AbilityKey, type Character } from '../models/character';
import type { CharacterRuleEffect, FeatEffect, LeveledSpellLevel, SpellContent, WeaponProficiencyRule } from '../models/content';
import { activeSelfEffectsBlockSpellcasting, deriveActiveSelfEffectSpellSaveDc } from '../rules/activeSelfEffects';
import { deriveConditionD20Context, type CharacterConditionId } from '../rules/conditions';
import { coverSavingThrowContext, deriveCoverContext, type CoverLevel } from '../rules/cover';
import type { DerivedCharacterState, DerivedSpellcastingProvider } from '../rules/types';
import type { RuleResult } from '../rules/result';
import { SKILL_DEFINITIONS } from '../rules/skills';
import {
  rollAbilityCheck,
  rollSavingThrow,
  rollSkillCheck,
  type CharacterRollOutcome,
} from '../services/characterRolls';
import { spendApplicationCharacterSpellSlot } from '../services/applicationPlayMutations';
import { rollSpellAttack, rollSpellDamage, rollSpellHealing } from '../services/spellRolls';
import { formatModifier } from '../utils/ability';

const ABILITY_SHORT: Record<(typeof ABILITY_KEYS)[number], string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

const ABILITY_NAMES: Record<(typeof ABILITY_KEYS)[number], string> = {
  strength: 'Strength', dexterity: 'Dexterity', constitution: 'Constitution', intelligence: 'Intelligence', wisdom: 'Wisdom', charisma: 'Charisma',
};

function formatRuleEffect(effect: CharacterRuleEffect): string {
  if (effect.type === 'attack-roll-bonus') return `+${effect.amount} to ${effect.weaponMode} weapon attack rolls`;
  if (effect.type === 'armor-class-bonus') return `+${effect.amount} AC while wearing ${effect.armorCategories.join(', ')} armor`;
  if (effect.type === 'skill-check-advantage') return `Advantage on ${effect.skillIds.map((skillId) => SKILL_DEFINITIONS[skillId].name).join(', ')} checks`;
  if (effect.type === 'saving-throw-roll-mode') return `${effect.mode === 'advantage' ? 'Advantage' : 'Disadvantage'} on ${effect.abilities.map((ability) => ABILITY_SHORT[ability]).join(', ')} saves`;
  if (effect.type === 'saving-throw-proficiency') return `Saving throw proficiency: ${effect.abilities.map((ability) => ABILITY_SHORT[ability]).join(', ')}`;
  if (effect.type === 'initiative-modifier') return `${formatModifier(effect.amount)} to Initiative`;
  if (effect.type === 'initiative-proficiency') return 'Add Proficiency Bonus to Initiative';
  if (effect.type === 'initiative-half-proficiency') return 'Add half Proficiency Bonus to Initiative when not already proficient';
  if (effect.type === 'initiative-roll-mode') return `${effect.mode === 'advantage' ? 'Advantage' : 'Disadvantage'} on Initiative`;
  if (effect.type === 'hit-point-bonus-per-class-level') return `+${effect.amount} maximum HP per class level`;
  if (effect.type === 'speed-bonus') return 'Conditional Speed bonus';
  if (effect.type === 'critical-threshold') return `Weapon Critical Hit threshold: ${effect.minimumNatural}–20`;
  if (effect.type === 'dice-transformation') return effect.transformation.type === 'reroll-once-use-new'
    ? `Reroll qualifying d${effect.transformation.die} results once; use the new roll`
    : `Treat qualifying weapon damage dice below ${effect.transformation.minimum} as ${effect.transformation.minimum}`;
  return `Unarmored AC ${effect.base} + ${effect.abilities.map((ability) => ABILITY_SHORT[ability]).join(' + ')}${effect.allowShield ? ' · shield allowed' : ''}`;
}

function formatFeatEffect(effect: FeatEffect): string {
  if (effect.type === 'ability-score-increase') return `Ability score increase · ${effect.selections === 2 ? 'two selections' : 'one selection'} · max ${effect.maximum}`;
  return formatRuleEffect(effect);
}

function formatFeatChoiceValue(value: string): string {
  return ABILITY_KEYS.includes(value as AbilityKey) ? ABILITY_NAMES[value as AbilityKey] : value;
}

function primaryAbilityLabel(mode: 'one-of' | 'all-of', abilities: readonly AbilityKey[]): string {
  return abilities.map((ability) => ABILITY_NAMES[ability]).join(mode === 'one-of' ? ' or ' : ' and ');
}

function weaponProficiencyLabel(rule: WeaponProficiencyRule): string {
  if (rule.kind === 'category') return `${rule.category} weapons`;
  return `${rule.category} weapons with ${rule.anyOfProperties.join(' or ')}`;
}

function spellLevelLabel(spell: SpellContent): string {
  return spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`;
}

function componentLabel(spell: SpellContent): string {
  const components = [spell.components.verbal ? 'V' : '', spell.components.somatic ? 'S' : '', spell.components.material ? 'M' : ''].filter(Boolean);
  return `${components.join(', ') || 'None'}${spell.components.materialText ? ` · ${spell.components.materialText}` : ''}`;
}

function replacementLabel(replacement: 'long-rest-any' | 'long-rest-one' | 'class-level-one'): string {
  if (replacement === 'long-rest-any') return 'After a Long Rest, any prepared spells may be replaced within the provider rules.';
  if (replacement === 'long-rest-one') return 'After a Long Rest, one prepared spell may be replaced within the provider rules.';
  return 'When you gain a level in this class, one prepared spell may be replaced within the provider rules.';
}

interface SpellcastingReferenceProps {
  character: Character;
  state: DerivedCharacterState;
  rollMode: RollMode;
  conditions: readonly CharacterConditionId[];
  activeEffectIds?: readonly string[];
  onRoll: (result: RuleResult<CharacterRollOutcome> | Promise<RuleResult<CharacterRollOutcome>>) => void;
  onMutation: (result: RuleResult<Character> | Promise<RuleResult<Character>>) => void;
}

function SpellcastingReference({ character, state, rollMode, conditions, activeEffectIds = [], onRoll, onMutation }: SpellcastingReferenceProps) {
  const spellcastingBlocked = activeSelfEffectsBlockSpellcasting(state, activeEffectIds);
  const [slotSelections, setSlotSelections] = useState<Record<string, LeveledSpellLevel>>({});
  return (
    <section className="sheet-section panel" aria-labelledby="spellcasting-reference-heading">
      <div className="section-heading"><span className="eyebrow">Spellcasting</span><h2 id="spellcasting-reference-heading">Spellcasting</h2><p>Provider-owned casting values and granted spells. Concentration bookkeeping is managed explicitly on PLAY; unsupported target, save, duration, and rider behavior remains manual/reference-only.</p></div>
      <div className="feat-reference-grid">
        {state.spellcasting.map((provider: DerivedSpellcastingProvider) => (
          <article className="feat-reference-card" key={provider.id}>
            {spellcastingBlocked && <p className="muted">Spellcasting is unavailable while the current active feature mode blocks casting.</p>}
            <div className="feat-reference-card__header"><div><span className="eyebrow">Provider</span><h3>{provider.name}</h3></div><span className="source-badge">{provider.source.type === 'srd' ? `SRD ${provider.source.ruleset}` : `Homebrew · ${provider.source.namespace}`}</span></div>
            <p>Granted by {provider.grantedBy.contentName}. {ABILITY_NAMES[provider.ability]} is the Spellcasting Ability.</p>
            <dl className="detail-list feat-reference-card__details"><div><dt>Spell Save DC</dt><dd>{deriveActiveSelfEffectSpellSaveDc(provider, state, activeEffectIds)}</dd></div><div><dt>Spell Attack</dt><dd>{formatModifier(provider.attackModifier)}</dd></div><div><dt>Ritual Casting</dt><dd>{provider.ritualCasting === 'none' ? 'Not granted by provider' : provider.ritualCasting === 'owned' ? 'Eligible owned ritual spells' : 'Eligible prepared ritual spells'}</dd></div></dl>
            {provider.management.kind === 'prepared-from-list' && <div className="feat-reference-card__effects"><strong>Prepared-from-list selections</strong><small>Cantrips: {provider.management.selectedCantrips.map((spell) => spell.name).join(', ') || 'None selected'} · limit {provider.management.cantripCount}.</small><small>Prepared leveled spells: {provider.management.preparedSpells.map((spell) => spell.name).join(', ') || 'None prepared'} · limit {provider.management.preparedSpellCount}.</small><small>{replacementLabel(provider.management.replacement)}</small><small>Catalog coverage: {provider.management.catalogSpells.map((spell) => spell.name).join(', ') || 'No bundled matching spells'}.</small></div>}
            {provider.management.kind === 'prepared-from-owned' && <div className="feat-reference-card__effects"><strong>Provider-owned spell selections</strong><small>Cantrips: {provider.management.selectedCantrips.map((spell) => spell.name).join(', ') || 'None selected'}.</small><small>Owned leveled spells: {provider.management.ownedSpells.map((spell) => spell.name).join(', ') || 'None resolved'}.</small><small>Prepared leveled spells: {provider.management.preparedSpells.map((spell) => spell.name).join(', ') || 'None prepared'} · limit {provider.management.preparedSpellCount}.</small><small>{replacementLabel(provider.management.replacement)}</small>{provider.ritualCasting !== 'none' && <small>Ritual eligible: {provider.ritualSpells.map((spell) => spell.name).join(', ') || 'None'}.</small>}</div>}
            {provider.slotPool && <div className="feat-reference-card__effects"><strong>{provider.slotPool.name}</strong>{provider.slotPool.slots.length ? provider.slotPool.slots.map((slot) => <small key={slot.resourceId}>Level {slot.spellLevel}: {character.playState.resourceUses[slot.resourceId] ?? 0}/{slot.maximumUses} remaining</small>) : <small>No slots available at this level.</small>}</div>}
            <div className="feat-reference-grid">
              {provider.spells.map((spell) => {
                const key = `${provider.id}:${spell.id}`;
                const slotOptions = provider.slotPool?.slots.filter((slot) => spell.level > 0 && slot.spellLevel >= spell.level) ?? [];
                const selectedSlot = slotSelections[key] ?? slotOptions[0]?.spellLevel;
                const selectedResource = selectedSlot ? slotOptions.find((slot) => slot.spellLevel === selectedSlot) : undefined;
                const attack = spell.mechanics.some((mechanic) => mechanic.type === 'spell-attack');
                const damage = spell.mechanics.find((mechanic) => mechanic.type === 'damage');
                const healing = spell.mechanics.some((mechanic) => mechanic.type === 'healing');
                const savingThrow = spell.mechanics.find((mechanic) => mechanic.type === 'saving-throw');
                const fixedGrant = provider.spellGrants.find((grant) => grant.spell.id === spell.id);
                return <article className="feat-reference-card" key={spell.id}>
                  <div className="feat-reference-card__header"><div><span className="eyebrow">{spellLevelLabel(spell)} · {spell.school}</span><h3>{spell.name}</h3></div><span className="source-badge">{[spell.concentration ? 'Concentration' : '', spell.ritual ? 'Ritual' : ''].filter(Boolean).join(' · ') || 'Spell'}</span></div>
                  <p>{spell.description}</p>
                  {fixedGrant && <p className="field-hint"><strong>Always prepared:</strong> granted by {fixedGrant.grantedBy.contentName}; this does not consume or create persisted prepared-spell ownership.</p>}
                  <dl className="detail-list feat-reference-card__details"><div><dt>Casting Time</dt><dd>{spell.castingTime}</dd></div><div><dt>Range</dt><dd>{spell.range}</dd></div><div><dt>Components</dt><dd>{componentLabel(spell)}</dd></div><div><dt>Duration</dt><dd>{spell.duration}</dd></div>{spell.target && <div><dt>Target / Area</dt><dd>{spell.target}</dd></div>}</dl>
                  {savingThrow && <p className="field-hint"><strong>Saving Throw:</strong> {ABILITY_NAMES[savingThrow.ability]} vs DC {deriveActiveSelfEffectSpellSaveDc(provider, state, activeEffectIds)}; {savingThrow.onSuccess === 'half' ? 'half damage on success' : 'no damage on success'}. Target save resolution is manual.</p>}
                  {spell.level > 0 && slotOptions.length > 0 && <label className="field compact-field"><span>Cast at slot level</span><select value={selectedSlot} onChange={(event) => setSlotSelections((current) => ({ ...current, [key]: Number(event.target.value) as LeveledSpellLevel }))}>{slotOptions.map((slot) => <option key={slot.spellLevel} value={slot.spellLevel}>Level {slot.spellLevel}</option>)}</select></label>}
                  <div className="form-actions">
                    {spell.level > 0 && selectedResource && <button className="button button--secondary" type="button" disabled={spellcastingBlocked || (character.playState.resourceUses[selectedResource.resourceId] ?? 0) <= 0} onClick={() => onMutation(spendApplicationCharacterSpellSlot(character.id, provider.id, spell.id, selectedSlot))}>Cast · Spend Slot</button>}
                    {attack && <button className="button button--secondary" type="button" disabled={spellcastingBlocked} onClick={() => onRoll(rollSpellAttack(character, state, provider.id, spell.id, rollMode, { d20Context: deriveConditionD20Context(conditions, { kind: 'attack' }), activeEffectIds }))}>Spell Attack</button>}
                    {damage && <button className="button button--secondary" type="button" onClick={() => onRoll(rollSpellDamage(character, state, provider.id, spell.id, selectedSlot))}>Damage</button>}
                    {attack && damage && <button className="button button--secondary" type="button" onClick={() => onRoll(rollSpellDamage(character, state, provider.id, spell.id, selectedSlot, true))}>Critical Damage</button>}
                    {healing && <button className="button button--secondary" type="button" onClick={() => onRoll(rollSpellHealing(character, state, provider.id, spell.id, selectedSlot))}>Healing</button>}
                  </div>
                  <div className="feat-reference-card__effects"><strong>Reference-only effects</strong>{spell.referenceEffects.length ? spell.referenceEffects.map((effect) => <small key={effect.id}><b>{effect.name}:</b> {effect.description}</small>) : <small>None beyond displayed manual metadata.</small>}</div>
                </article>;
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

interface CharacterReferenceViewProps {
  character: Character;
  state: DerivedCharacterState;
  rollMode: RollMode;
  onRollModeChange: (mode: RollMode) => void;
  cover: CoverLevel;
  onCoverChange: (cover: CoverLevel) => void;
  conditions: readonly CharacterConditionId[];
  activeEffectIds?: readonly string[];
  onRoll: (result: RuleResult<CharacterRollOutcome> | Promise<RuleResult<CharacterRollOutcome>>) => void;
  onMutation: (result: RuleResult<Character> | Promise<RuleResult<Character>>) => void;
}

export function CharacterReferenceView({ character, state, rollMode, onRollModeChange, cover, onCoverChange, conditions, activeEffectIds = [], onRoll, onMutation }: CharacterReferenceViewProps) {
  const coverContext = deriveCoverContext(cover);
  const proficientSaves = ABILITY_KEYS.filter((ability) => state.savingThrows[ability].proficient).map((ability) => ABILITY_NAMES[ability]);
  const proficientSkills = SKILL_IDS.filter((skillId) => state.skills[skillId].proficient).map((skillId) => SKILL_DEFINITIONS[skillId].name);

  return (
    <div className="workspace-view workspace-view--character" data-testid="character-workspace-character">
      <RollModeControl mode={rollMode} onChange={onRollModeChange} />
      <section className="play-roll-context panel" aria-label="Cover context">
        <div className="play-roll-context__row">
          <CoverControl cover={cover} onChange={onCoverChange} compact />
          <small>{coverContext.blocksDirectTargeting ? 'Total Cover blocks direct targeting through the Cover; no numeric save bonus is invented.' : coverContext.dexteritySaveBonus ? `${coverContext.label}: +${coverContext.dexteritySaveBonus} to Dexterity saving throws.` : 'No Cover bonus is applied.'}</small>
        </div>
      </section>

      <section className="sheet-summary-grid sheet-summary-grid--reference" aria-label="Character reference statistics">
        <article className="summary-card panel"><span>Proficiency Bonus</span><strong>{formatModifier(state.proficiencyBonus)}</strong></article>
        <article className="summary-card panel"><span>Passive Perception</span><strong>{state.passivePerception}</strong></article>
      </section>

      <section className="sheet-section panel origin-reference" aria-labelledby="origin-reference-heading">
        <div className="section-heading"><span className="eyebrow">Origin</span><h2 id="origin-reference-heading">Species & Background</h2></div>
        {!state.species && !state.background ? (
          <p className="legacy-note">This migrated character predates Species and Background selection. Existing mechanics remain unchanged until the origin is completed in Edit Character.</p>
        ) : (
          <div className="reference-training-grid">
            {state.species && <div className="reference-training-card"><span>Species</span><strong>{state.species.name}</strong><small>{state.species.size[0].toUpperCase() + state.species.size.slice(1)} · Speed {state.species.speedFeet} ft.</small></div>}
            {state.species && <div className="reference-training-card"><span>Species Choices</span><strong>{state.species.selectedChoices.map((choice) => choice.optionName).join(', ') || 'None'}</strong><small>{state.species.senses.length ? state.species.senses.map((sense) => `Darkvision ${sense.rangeFeet} ft.`).join(', ') : 'No structured senses'}</small></div>}
            {state.background && <div className="reference-training-card"><span>Background</span><strong>{state.background.name}</strong><small>Skills: {state.background.skillProficiencies.map((skill) => SKILL_DEFINITIONS[skill].name).join(', ')}</small></div>}
            {state.background && <div className="reference-training-card"><span>Tool & Origin Feat</span><strong>{state.background.toolProficiency.name}</strong><small>{state.background.originFeat.name}{state.background.originFeat.variant ? ` (${state.background.originFeat.variant})` : ''} · reference only</small></div>}
          </div>
        )}
      </section>

      <section className="sheet-section panel" aria-labelledby="class-reference-heading">
        <div className="section-heading"><span className="eyebrow">Class</span><h2 id="class-reference-heading">Class progression</h2><p>Only acquired Class features contribute bounded mechanics. Future features remain reference-visible until their level is reached.</p></div>
        {!state.classState ? <p className="legacy-note">Multiclass class-feature presentation remains deferred; this reference surface does not collapse multiple owners into one class.</p> : <>
          <div className="reference-training-grid">
            <div className="reference-training-card"><span>Class</span><strong>{state.classState.name}</strong><small>{state.classState.source.type === 'srd' ? `SRD ${state.classState.source.ruleset}` : `Homebrew · ${state.classState.source.namespace}`} · d{state.classState.hitDie} Hit Die</small></div>
            <div className="reference-training-card"><span>Primary {state.classState.primaryAbility.abilities.length > 1 ? 'Abilities' : 'Ability'}</span><strong>{primaryAbilityLabel(state.classState.primaryAbility.mode, state.classState.primaryAbility.abilities)}</strong></div>
            <div className="reference-training-card"><span>Weapon Training</span><strong>{state.classState.weaponProficiencies.map(weaponProficiencyLabel).join('; ') || 'None'}</strong></div>
            <div className="reference-training-card"><span>Armor & Tools</span><strong>{state.classState.armorTraining.join(', ') || 'No armor training'}</strong><small>{state.classState.toolProficiencies.map((tool) => tool.name).join(', ') || 'No class tool proficiencies'}</small></div>
          </div>
          <div className="feat-reference-grid">{state.classState.acquiredFeatures.map((feature) => <article className="feat-reference-card" key={`${feature.id}:${feature.level}`}><div className="feat-reference-card__header"><div><span className="eyebrow">Acquired · Level {feature.level}</span><h3>{feature.name}</h3></div></div><p>{feature.description}</p><div className="feat-reference-card__effects"><strong>Automated structured effects</strong>{feature.automatedEffects.length ? feature.automatedEffects.map((effect, index) => <small key={index}>{formatRuleEffect(effect)}</small>) : <small>None</small>}</div><div className="feat-reference-card__effects"><strong>Reference-only effects</strong>{feature.referenceEffects.length ? feature.referenceEffects.map((effect) => <small key={effect.id}><b>{effect.name}:</b> {effect.description}</small>) : <small>None</small>}</div></article>)}</div>
          {state.classState.futureFeatures.length > 0 && <div className="feat-reference-grid">{state.classState.futureFeatures.map((feature) => <article className="feat-reference-card" key={`${feature.id}:${feature.level}`}><div className="feat-reference-card__header"><div><span className="eyebrow">Future · Level {feature.level}</span><h3>{feature.name}</h3></div><span className="source-badge">Reference only until acquired</span></div><p>{feature.description}</p></article>)}</div>}
        </>}
      </section>

      <section className="sheet-section panel" aria-labelledby="subclass-reference-heading">
        <div className="section-heading"><span className="eyebrow">Subclass</span><h2 id="subclass-reference-heading">Subclass progression</h2><p>Only acquired subclass features contribute structured mechanics. Future features remain reference-visible only.</p></div>
        {state.classProgressions.length > 1 ? <p className="legacy-note">Multiclass subclass-feature presentation remains deferred; subclass ownership stays attached to each derived class progression.</p> : !state.subclass ? <p className="legacy-note">No subclass is selected. For a migrated character already beyond its subclass acquisition level, this is the deliberate unresolved legacy state; no subclass mechanics are inferred.</p> : <>
          <div className="reference-training-grid"><div className="reference-training-card"><span>Subclass</span><strong>{state.subclass.name}</strong><small>{state.subclass.source.type === 'srd' ? `SRD ${state.subclass.source.ruleset}` : `Homebrew · ${state.subclass.source.namespace}`}</small></div><div className="reference-training-card"><span>Parent Class</span><strong>{state.subclass.parentClassName}</strong><small>Acquired at level {state.subclass.acquisitionLevel}</small></div></div>
          <div className="feat-reference-grid">{state.subclass.acquiredFeatures.map((feature) => <article className="feat-reference-card" key={feature.id}><div className="feat-reference-card__header"><div><span className="eyebrow">Acquired · Level {feature.level}</span><h3>{feature.name}</h3></div></div><p>{feature.description}</p><div className="feat-reference-card__effects"><strong>Automated structured effects</strong>{feature.automatedEffects.length ? feature.automatedEffects.map((effect, index) => <small key={index}>{formatRuleEffect(effect)}</small>) : <small>None</small>}</div><div className="feat-reference-card__effects"><strong>Reference-only effects</strong>{feature.referenceEffects.length ? feature.referenceEffects.map((effect) => <small key={effect.id}><b>{effect.name}:</b> {effect.description}</small>) : <small>None</small>}</div></article>)}</div>
          {state.subclass.futureFeatures.length > 0 && <div className="feat-reference-grid">{state.subclass.futureFeatures.map((feature) => <article className="feat-reference-card" key={feature.id}><div className="feat-reference-card__header"><div><span className="eyebrow">Future · Level {feature.level}</span><h3>{feature.name}</h3></div><span className="source-badge">Reference only until acquired</span></div><p>{feature.description}</p></article>)}</div>}
        </>}
      </section>

      {state.spellcasting.length > 0 && <SpellcastingReference character={character} state={state} rollMode={rollMode} conditions={conditions} activeEffectIds={activeEffectIds} onRoll={onRoll} onMutation={onMutation} />}

      <section className="sheet-section panel">
        <div className="section-heading"><span className="eyebrow">Core Statistics</span><h2>Abilities & Saving Throws</h2></div>
        <div className="ability-card-grid">
          {ABILITY_KEYS.map((ability) => (
            <AbilityScoreCard
              key={ability}
              ability={ability}
              score={state.abilityScores[ability]}
              modifier={state.abilityModifiers[ability]}
              saveModifier={state.savingThrows[ability].modifier}
              saveProficient={state.savingThrows[ability].proficient}
              onRollCheck={() => onRoll(rollAbilityCheck(character.id, ability, rollMode, { d20Context: deriveConditionD20Context(conditions, { kind: 'ability-check' }), activeEffectIds }))}
              onRollSave={() => onRoll(rollSavingThrow(character.id, ability, rollMode, { d20Context: mergeD20RollContexts(coverSavingThrowContext(cover, ability), deriveConditionD20Context(conditions, { kind: 'saving-throw', ability })), activeEffectIds }))}
            />
          ))}
        </div>
      </section>

      <section className="sheet-section panel">
        <div className="section-heading"><span className="eyebrow">Checks</span><h2>Skills</h2></div>
        <div className="skill-grid">
          {SKILL_IDS.map((skillId) => {
            const skill = state.skills[skillId];
            const definition = SKILL_DEFINITIONS[skillId];
            return (
              <article className="skill-row" key={skillId}>
                <span className="proficiency-dot" aria-label={skill.proficient ? 'Proficient' : 'Not proficient'}>{skill.proficient ? '●' : '○'}</span>
                <strong>{definition.name}</strong>
                <span>{ABILITY_SHORT[definition.ability]}</span>
                <b>{formatModifier(skill.modifier)}</b>
                <button className="mini-roll-button" type="button" onClick={() => onRoll(rollSkillCheck(character.id, skillId, rollMode, { d20Context: deriveConditionD20Context(conditions, { kind: 'skill-check' }), activeEffectIds }))}>Roll</button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="sheet-section panel">
        <div className="section-heading"><span className="eyebrow">Training</span><h2>Proficiencies</h2></div>
        <div className="reference-training-grid">
          <div className="reference-training-card"><span>Saving Throws</span><strong>{proficientSaves.join(', ') || 'None'}</strong></div>
          <div className="reference-training-card"><span>Skills</span><strong>{proficientSkills.join(', ') || 'None'}</strong></div>
          <div className="reference-training-card"><span>Armor</span><strong>{state.defense.armor ? `${state.defense.armor.name} · ${state.defense.armor.trained ? 'Trained' : 'Not trained'}` : 'Unarmored'}</strong></div>
          <div className="reference-training-card"><span>Shield</span><strong>{state.defense.shield ? `${state.defense.shield.name} · ${state.defense.shield.trained ? 'Trained' : 'Not trained'}` : 'None equipped'}</strong></div>
        </div>
      </section>

      <section className="sheet-section panel" aria-labelledby="features-feats-heading">
        <div className="section-heading"><span className="eyebrow">Character Options</span><h2 id="features-feats-heading">Features & Feats</h2><p>Feat ownership resolves through the Content Registry. Only the bounded structured effects listed as automated are applied by the Rules Engine; all other feat text remains reference-only.</p></div>
        {state.feats.length === 0 ? <p>No resolved Feats.</p> : <div className="feat-reference-grid">{state.feats.map((feat, index) => <article className="feat-reference-card" key={`${feat.id}-${index}`}>
          <div className="feat-reference-card__header"><div><span className="eyebrow">{feat.category}</span><h3>{feat.name}{feat.variant ? ` (${feat.variant})` : ''}</h3></div><span className="source-badge">{feat.acquisition.type === 'background' ? `Background · ${feat.acquisition.backgroundName}` : 'Manual'}</span></div>
          <dl className="detail-list feat-reference-card__details">
            <div><dt>Prerequisites</dt><dd>{feat.prerequisites.length ? feat.prerequisites.map((prerequisite) => `${prerequisite.description} · ${prerequisite.status === 'not-evaluated' ? 'not automatically evaluated' : prerequisite.status}`).join('; ') : 'None'}</dd></div>
            <div><dt>Choices</dt><dd>{Object.keys(feat.choices).length ? Object.entries(feat.choices).map(([choiceId, values]) => `${choiceId}: ${values.map(formatFeatChoiceValue).join(', ')}`).join('; ') : 'None stored'}</dd></div>
          </dl>
          <div className="feat-reference-card__effects"><strong>Automated structured effects</strong>{feat.automatedEffects.length ? feat.automatedEffects.map((effect, effectIndex) => <small key={effectIndex}>{formatFeatEffect(effect)}</small>) : <small>None</small>}</div>
          <div className="feat-reference-card__effects"><strong>Reference-only effects</strong>{feat.referenceEffects.length ? feat.referenceEffects.map((effect) => <small key={effect.id}><b>{effect.name}:</b> {effect.description}</small>) : <small>None</small>}</div>
        </article>)}</div>}
      </section>
    </div>
  );
}
