import { useState } from 'react';
import { ActiveEffectsPanel } from './ActiveEffectsPanel';
import { CharacterConditionsPanel } from './CharacterConditionsPanel';
import { ConcentrationPanel, type ConcentrationSaveDisplay } from './ConcentrationPanel';
import { CoverControl } from './CoverControl';
import { HitPointsPanel } from './HitPointsPanel';
import { RestPanel } from './RestPanel';
import { RollModeControl } from './RollModeControl';
import { WeaponRollControls } from './WeaponRollControls';
import type { RollMode } from '../dice/types';
import { ABILITY_KEYS, type Character } from '../models/character';
import { deriveConditionD20Context, type CharacterConditionId } from '../rules/conditions';
import { listConcentrationCandidates } from '../rules/concentration';
import { deriveCoverContext, type CoverLevel } from '../rules/cover';
import type { RuleResult } from '../rules/result';
import type { DerivedCharacterState } from '../rules/types';
import {
  applyCharacterDamage,
  finishCharacterShortRest,
  healCharacter,
  setCharacterTemporaryHp,
} from '../services/characterPlayState';
import {
  rollHitDie,
  rollInitiative,
  rollWeaponAttack,
  rollWeaponDamage,
  type CharacterRollOutcome,
} from '../services/characterRolls';
import type { PlaySessionState } from '../services/playSessionState';
import { formatModifier } from '../utils/ability';
import { formatDerivedDamage, formatWeaponProperty } from '../utils/contentFormat';

const ABILITY_SHORT: Record<(typeof ABILITY_KEYS)[number], string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

interface CharacterPlayViewProps {
  character: Character;
  state: DerivedCharacterState;
  cover: CoverLevel;
  onCoverChange: (cover: CoverLevel) => void;
  sessionState: PlaySessionState;
  onAddCondition: (condition: CharacterConditionId) => void;
  onRemoveCondition: (condition: CharacterConditionId) => void;
  onActivateEffect: (effectId: string) => void;
  onDeactivateEffect: (effectId: string) => void;
  onStartConcentration: (providerId: string, spellId: string) => void;
  onEndConcentration: () => void;
  onConcentrationSave: (damageTaken: number, mode: RollMode) => void;
  lastConcentrationSave?: ConcentrationSaveDisplay;
  onMutation: (result: RuleResult<Character>) => void;
  onRoll: (result: RuleResult<CharacterRollOutcome>) => void;
  onLongRest: () => void;
}

export function CharacterPlayView({ character, state, cover, onCoverChange, sessionState, onAddCondition, onRemoveCondition, onActivateEffect, onDeactivateEffect, onStartConcentration, onEndConcentration, onConcentrationSave, lastConcentrationSave, onMutation, onRoll, onLongRest }: CharacterPlayViewProps) {
  const [initiativeMode, setInitiativeMode] = useState<RollMode>('normal');
  const coverContext = deriveCoverContext(cover);
  const concentrationCandidates = listConcentrationCandidates(state);
  const initiativeConditionContext = deriveConditionD20Context(sessionState.conditions, { kind: 'initiative' });
  const attackConditionContext = deriveConditionD20Context(sessionState.conditions, { kind: 'attack' });
  const contextualArmorClass = coverContext.armorClassBonus === null ? state.defense.armorClass : state.defense.armorClass + coverContext.armorClassBonus;
  const armorDetail = `${state.defense.armor?.name ?? 'Unarmored'}${state.defense.shield ? ` · ${state.defense.shield.name}` : ''}`;

  return (
    <div className="workspace-view workspace-view--play" data-testid="character-workspace-play">
      <section className="play-quick-stats panel" aria-label="Combat quick stats">
        <article className="play-quick-stat" aria-label="Armor Class">
          <span>{coverContext.armorClassBonus && coverContext.armorClassBonus > 0 ? 'Contextual AC' : 'Armor Class'}</span>
          <strong>{contextualArmorClass}</strong>
          <small>{coverContext.armorClassBonus && coverContext.armorClassBonus > 0 ? `Base ${state.defense.armorClass} · ${coverContext.label} +${coverContext.armorClassBonus}` : coverContext.blocksDirectTargeting ? `${armorDetail} · Total Cover: direct targeting blocked` : armorDetail}</small>
        </article>
        <article className="play-quick-stat"><span>Initiative</span><strong>{formatModifier(state.initiative.modifier)}</strong><small>{state.initiative.contributions.map((entry) => `${entry.label} ${formatModifier(entry.amount)}`).join(' · ') || 'Dexterity'}</small></article>
        <article className="play-quick-stat"><span>Proficiency Bonus</span><strong>{formatModifier(state.proficiencyBonus)}</strong></article>
        <article className="play-quick-stat"><span>Passive Perception</span><strong>{state.passivePerception}</strong></article>
        {state.species && <article className="play-quick-stat"><span>Speed</span><strong>{state.species.speedFeet}</strong><small>ft.</small></article>}
      </section>

      <section className="play-roll-context panel" aria-label="Initiative and Cover">
        <div className="play-roll-context__row">
          <div><span className="eyebrow">Initiative</span><strong>{formatModifier(state.initiative.modifier)}</strong></div>
          <RollModeControl compact ariaLabel="Initiative roll mode" mode={initiativeMode} onChange={setInitiativeMode} />
          <button className="button button--primary" type="button" onClick={() => onRoll(rollInitiative(character.id, initiativeMode, { d20Context: initiativeConditionContext, activeEffectIds: sessionState.activeEffectIds }))}>Roll Initiative</button>
        </div>
        <div className="play-roll-context__row">
          <CoverControl cover={cover} onChange={onCoverChange} compact />
          <small>{coverContext.blocksDirectTargeting ? 'Total Cover is a targeting restriction; no numeric AC or Dexterity-save bonus is invented.' : coverContext.armorClassBonus ? `${coverContext.label}: +${coverContext.armorClassBonus} contextual AC and Dexterity saves.` : 'Cover is temporary table context and does not change base AC.'}</small>
        </div>
      </section>

      <HitPointsPanel
        currentHp={character.playState.currentHp}
        maximumHp={state.health.maximumHp}
        temporaryHp={character.playState.temporaryHp}
        onDamage={(amount) => onMutation(applyCharacterDamage(character.id, amount))}
        onHeal={(amount) => onMutation(healCharacter(character.id, amount))}
        onSetTemporaryHp={(amount, decision) => onMutation(setCharacterTemporaryHp(character.id, amount, decision))}
      />

      <ActiveEffectsPanel character={character} state={state} sessionState={sessionState} onActivate={onActivateEffect} onDeactivate={onDeactivateEffect} />
      <CharacterConditionsPanel conditions={sessionState.conditions} onAdd={onAddCondition} onRemove={onRemoveCondition} />
      <ConcentrationPanel candidates={concentrationCandidates} concentration={sessionState.concentration} onStart={onStartConcentration} onEnd={onEndConcentration} onSave={onConcentrationSave} lastSave={lastConcentrationSave} />

      <section className="sheet-section panel play-attacks" aria-labelledby="active-attacks-heading">
        <div className="section-heading"><span className="eyebrow">Equipped Weapons</span><h2 id="active-attacks-heading">Active Attacks</h2></div>
        {state.attacks.length === 0 ? (
          <p>No equipped weapons. Open INVENTORY to equip an owned weapon for active attacks.</p>
        ) : (
          <div className="attack-grid">
            {state.attacks.map((attack) => (
              <article className="attack-card attack-card--compact" key={attack.inventoryEntryId ?? attack.weaponId}>
                <div className="attack-card__header">
                  <h3>{attack.name}</h3>
                  <strong>{formatModifier(attack.attackModifier)} to hit</strong>
                </div>

                <div className="attack-card__quick-meta" aria-label={`${attack.name} quick attack reference`}>
                  <strong>{formatDerivedDamage(attack.damage)}</strong>
                  <span aria-hidden="true">•</span>
                  <span>{ABILITY_SHORT[attack.attackAbility]}</span>
                  <span aria-hidden="true">•</span>
                  <span>{attack.mastery.name}</span>
                </div>

                <WeaponRollControls
                  attack={attack}
                  onAttack={(mode) => onRoll(rollWeaponAttack(character.id, attack.weaponId, mode, { d20Context: attackConditionContext, activeEffectIds: sessionState.activeEffectIds }))}
                  onDamage={(damageMode, critical) => onRoll(rollWeaponDamage(character.id, attack.weaponId, damageMode, critical, { activeEffectIds: sessionState.activeEffectIds }))}
                />

                <details className="attack-card__details">
                  <summary>Details</summary>
                  <dl className="detail-list attack-card__detail-list">
                    <div><dt>Proficiency</dt><dd>{attack.proficient ? 'Proficient' : 'Not Proficient'}</dd></div>
                    <div><dt>Properties</dt><dd>{attack.properties.length ? attack.properties.map(formatWeaponProperty).join(', ') : 'None'}</dd></div>
                    <div><dt>Mastery Availability</dt><dd>{attack.mastery.canPotentiallyUse ? 'Available to class progression' : 'Not unlocked by known class data'}</dd></div>
                    <div><dt>Use Mode</dt><dd>{attack.useMode[0].toUpperCase() + attack.useMode.slice(1)}</dd></div>
                  </dl>
                  {attack.damageConfigurations.length > 1 && (
                    <div className="alternate-damage">
                      <span>Valid damage configurations</span>
                      {attack.damageConfigurations.map((damage) => <small key={damage.mode}>{damage.mode}: {formatDerivedDamage(damage)}</small>)}
                    </div>
                  )}
                </details>
              </article>
            ))}
          </div>
        )}
      </section>

      <RestPanel
        hitDie={state.health.hitDie}
        remainingHitDice={character.playState.hitDiceRemaining}
        maximumHitDice={state.health.maximumHitDice}
        onSpendHitDie={() => onRoll(rollHitDie(character.id))}
        onShortRest={() => onMutation(finishCharacterShortRest(character.id))}
        onLongRest={onLongRest}
      />
    </div>
  );
}
