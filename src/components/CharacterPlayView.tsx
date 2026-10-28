import { useState, type ReactNode } from 'react';
import { ActiveEffectsPanel } from './ActiveEffectsPanel';
import { AttackRollsPanel } from './AttackRollsPanel';
import { CharacterQuickRoll } from './CharacterQuickRoll';
import { CharacterConditionsPanel } from './CharacterConditionsPanel';
import { ConcentrationPanel, type ConcentrationSaveDisplay } from './ConcentrationPanel';
import { CoverControl } from './CoverControl';
import { HitPointsPanel } from './HitPointsPanel';
import { RestPanel } from './RestPanel';
import { RollModeControl } from './RollModeControl';
import { PlaySpellcastingPanel } from './PlaySpellcastingPanel';
import type { RollMode } from '../dice/types';
import type { Character } from '../models/character';
import { deriveConditionD20Context, type CharacterConditionId } from '../rules/conditions';
import { listConcentrationCandidates } from '../rules/concentration';
import { deriveCoverContext, type CoverLevel } from '../rules/cover';
import type { RuleResult } from '../rules/result';
import type { DerivedCharacterState } from '../rules/types';
import { deriveSneakAttackDice } from '../rules/sneakAttack';
import {
  applyApplicationCharacterDamage,
  finishApplicationCharacterShortRest,
  healApplicationCharacter,
  rollApplicationHitDie,
  setApplicationCharacterTemporaryHp,
} from '../services/applicationPlayMutations';
import {
  rollInitiative,
  rollWeaponAttack,
  rollWeaponDamage,
  type CharacterRollOutcome,
} from '../services/characterRolls';
import type { PlaySessionState } from '../services/playSessionState';
import { formatModifier } from '../utils/ability';

function spellLevelLabel(level: number): string {
  if (level === 1) return '1st';
  if (level === 2) return '2nd';
  if (level === 3) return '3rd';
  return `${level}th`;
}

interface CharacterPlayViewProps {
  character: Character;
  state: DerivedCharacterState;
  cover: CoverLevel;
  onCoverChange: (cover: CoverLevel) => void;
  sessionState: PlaySessionState;
  onAddCondition: (condition: CharacterConditionId) => void;
  onRemoveCondition: (condition: CharacterConditionId) => void;
  onDeactivateEffect: (effectId: string) => void;
  onStartConcentration: (providerId: string, spellId: string) => void;
  onEndConcentration: () => void;
  onConcentrationSave: (damageTaken: number, mode: RollMode) => void;
  lastConcentrationSave?: ConcentrationSaveDisplay;
  rollMode: RollMode;
  onRollModeChange: (mode: RollMode) => void;
  featuresPanel: ReactNode;
  diceUtility: ReactNode;
  onMutation: (result: RuleResult<Character> | Promise<RuleResult<Character>>) => void;
  onRoll: (result: RuleResult<CharacterRollOutcome> | Promise<RuleResult<CharacterRollOutcome>>) => void;
  onLongRest: () => void;
}

export function CharacterPlayView({ character, state, cover, onCoverChange, sessionState, onAddCondition, onRemoveCondition, onDeactivateEffect, onStartConcentration, onEndConcentration, onConcentrationSave, lastConcentrationSave, rollMode, onRollModeChange, featuresPanel, diceUtility, onMutation, onRoll, onLongRest }: CharacterPlayViewProps) {
  const [initiativeMode, setInitiativeMode] = useState<RollMode>('normal');
  const coverContext = deriveCoverContext(cover);
  const concentrationCandidates = listConcentrationCandidates(state);
  const initiativeConditionContext = deriveConditionD20Context(sessionState.conditions, { kind: 'initiative' });
  const attackConditionContext = deriveConditionD20Context(sessionState.conditions, { kind: 'attack' });
  const contextualArmorClass = coverContext.armorClassBonus === null ? state.defense.armorClass : state.defense.armorClass + coverContext.armorClassBonus;
  const armorDetail = `${state.defense.armor?.name ?? 'Unarmored'}${state.defense.shield ? ` · ${state.defense.shield.name}` : ''}`;
  const hitDice = state.health.hitDice.map((pool) => ({
    die: pool.die,
    remaining: character.playState.hitDiceRemaining[pool.die] ?? 0,
    maximum: pool.maximum,
  }));
  const sneakAttackDice = deriveSneakAttackDice(state);
  const quickResourceIds = new Set([
    ...state.resources.filter((resource) => resource.consumers.length > 0).map((resource) => resource.id),
    ...state.activeSelfEffects.flatMap((effect) => effect.activationCost ? [effect.activationCost.resourceId] : []),
    ...state.resourceTransactions.flatMap((transaction) => transaction.usageResourceId ? [transaction.usageResourceId] : []),
  ]);
  const quickResources = state.resources.filter((resource) => quickResourceIds.has(resource.id));
  const spellSlotPools = [...new Map(
    state.spellcasting
      .flatMap((provider) => provider.slotPool ? [provider.slotPool] : [])
      .filter((pool) => pool.slots.some((slot) => slot.maximumUses > 0))
      .map((pool) => [pool.id, pool] as const),
  ).values()];

  return (
    <div className="workspace-view workspace-view--play" data-testid="character-workspace-play">
      <div className="play-dashboard" data-testid="play-dashboard">
        <div className="play-dashboard__resources" data-testid="play-dashboard-left">
          <aside aria-label="Class features">
            {featuresPanel}
          </aside>
          <AttackRollsPanel
            attacks={state.attacks}
            sneakAttackDice={sneakAttackDice}
            onAttack={(attack, mode) => onRoll(rollWeaponAttack(character.id, attack.weaponId, mode, { d20Context: attackConditionContext, activeEffectIds: sessionState.activeEffectIds }))}
            onDamage={(attack, damageMode, critical, sneakAttack) => onRoll(rollWeaponDamage(character.id, attack.weaponId, damageMode, critical, { activeEffectIds: sessionState.activeEffectIds, sneakAttack }))}
          />
        </div>

        <div className="play-dashboard__core">
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
            {quickResources.map((resource) => {
              const current = character.playState.resourceUses[resource.id] ?? 0;
              const unit = resource.presentation === 'numeric' ? 'remaining' : current === 1 ? 'charge' : 'charges';
              return (
                <article
                  className="play-quick-stat"
                  key={resource.id}
                  aria-label={`${resource.name} resource status`}
                  title={`${current} of ${resource.maximumUses} remaining`}
                >
                  <span>{resource.name}</span>
                  <strong>{current}</strong>
                  <small>{unit}</small>
                </article>
              );
            })}
            {spellSlotPools.length > 0 && (
              <article className="play-quick-stat play-quick-stat--spell-slots" aria-label="Spell Slots cockpit resource">
                <span>Spell Slots</span>
                <div className="play-spell-slot-pools">
                  {spellSlotPools.map((pool) => (
                    <div className="play-spell-slot-pool" key={pool.id} aria-label={`${pool.name} spell slot pool`}>
                      {spellSlotPools.length > 1 && <small className="play-spell-slot-pool__name">{pool.name}</small>}
                      <div className="play-spell-slot-levels">
                        {pool.slots.filter((slot) => slot.maximumUses > 0).map((slot) => (
                          <div
                            className="play-spell-slot-level"
                            key={slot.resourceId}
                            aria-label={`${spellLevelLabel(slot.spellLevel)} level spell slots${spellSlotPools.length > 1 ? ` in ${pool.name}` : ''}`}
                          >
                            <b>{spellLevelLabel(slot.spellLevel)}</b>
                            <strong>{character.playState.resourceUses[slot.resourceId] ?? 0} / {slot.maximumUses}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            )}
          </section>

          <HitPointsPanel
            currentHp={character.playState.currentHp}
            maximumHp={state.health.maximumHp}
            temporaryHp={character.playState.temporaryHp}
            onDamage={(amount) => onMutation(applyApplicationCharacterDamage(character.id, amount))}
            onHeal={(amount) => onMutation(healApplicationCharacter(character.id, amount))}
            onSetTemporaryHp={(amount, decision) => onMutation(setApplicationCharacterTemporaryHp(character.id, amount, decision))}
          />

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

          <CharacterQuickRoll
            character={character}
            state={state}
            cover={cover}
            conditions={sessionState.conditions}
            activeEffectIds={sessionState.activeEffectIds}
            rollMode={rollMode}
            onRollModeChange={onRollModeChange}
            onRoll={onRoll}
          />

          <PlaySpellcastingPanel
            character={character}
            state={state}
            rollMode={rollMode}
            conditions={sessionState.conditions}
            activeEffectIds={sessionState.activeEffectIds}
            onRoll={onRoll}
            onMutation={onMutation}
          />

          <ConcentrationPanel
            candidates={concentrationCandidates}
            concentration={sessionState.concentration}
            onStart={onStartConcentration}
            onEnd={onEndConcentration}
            onSave={onConcentrationSave}
            lastSave={lastConcentrationSave}
            compactCockpit
          />
        </div>

        <aside className="play-dashboard__dice" aria-label="Dice utility">
          {diceUtility}
        </aside>
      </div>

      <div className="play-main-content" data-testid="play-main-content">
        <ActiveEffectsPanel state={state} sessionState={sessionState} onDeactivate={onDeactivateEffect} />
      <CharacterConditionsPanel conditions={sessionState.conditions} onAdd={onAddCondition} onRemove={onRemoveCondition} />

      {hitDice.length > 0 && <RestPanel
        hitDice={hitDice}
        onSpendHitDie={(die) => onRoll(rollApplicationHitDie(character.id, die))}
        onShortRest={() => onMutation(finishApplicationCharacterShortRest(character.id))}
        onLongRest={onLongRest}
      />}
      </div>
    </div>
  );
}
