import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CharacterPlayView } from '../components/CharacterPlayView';
import { CharacterReferenceView } from '../components/CharacterReferenceView';
import { CharacterWorkspaceNav, type CharacterWorkspaceView } from '../components/CharacterWorkspaceNav';
import { DiceTray } from '../components/DiceTray';
import { ResourcesPanel } from '../components/ResourcesPanel';
import type { RollMode } from '../dice/types';
import type { Character } from '../models/character';
import { deriveConditionD20Context, type CharacterConditionId } from '../rules/conditions';
import type { CoverLevel } from '../rules/cover';
import { deriveCharacterState } from '../rules/deriveCharacter';
import type { RuleResult } from '../rules/result';
import { consumeCharacterResource, executeCharacterResourceTransaction, finishCharacterLongRest } from '../services/characterPlayState';
import { activateCharacterActiveSelfEffect, deactivateCharacterActiveSelfEffect } from '../services/activeSelfEffects';
import { rollConcentrationSavingThrow, rollHealingResource, type CharacterRollOutcome, type ConcentrationSaveOutcome } from '../services/characterRolls';
import { contentRegistry } from '../services/contentRegistry';
import { deleteCharacter, getCharacterById } from '../services/characterStorage';
import { addPlaySessionCondition, clearPlaySessionState, endPlaySessionConcentration, loadPlaySessionState, reconcilePlaySessionState, removePlaySessionCondition, startPlaySessionConcentration, type PlaySessionState } from '../services/playSessionState';
import { clearRollHistory, loadRollHistory } from '../services/rollHistory';
import { InventoryView } from './InventoryPage';

interface CharacterSheetPageProps {
  view?: CharacterWorkspaceView;
}

function loadReconciledSessionState(characterId: string): PlaySessionState {
  const loaded = loadPlaySessionState(characterId);
  const character = getCharacterById(characterId);
  if (!character) return loaded;
  const derived = deriveCharacterState(character, contentRegistry);
  return derived.ok ? reconcilePlaySessionState(characterId, derived.value) : loaded;
}

export function CharacterSheetPage({ view = 'play' }: CharacterSheetPageProps) {
  const { characterId = '' } = useParams();
  const navigate = useNavigate();
  const [characterSnapshot, setCharacterSnapshot] = useState<{ id: string; character: Character } | null>(null);
  const [playError, setPlayError] = useState<{ id: string; message: string } | null>(null);
  const [rollMode, setRollMode] = useState<RollMode>('normal');
  const [cover, setCover] = useState<CoverLevel>('none');
  const [history, setHistory] = useState(() => loadRollHistory());
  const [sessionSnapshot, setSessionSnapshot] = useState<{ id: string; state: PlaySessionState }>(() => ({ id: characterId, state: characterId ? loadReconciledSessionState(characterId) : { conditions: [], activeEffectIds: [] } }));
  const [lastConcentrationSave, setLastConcentrationSave] = useState<{ id: string; result: Pick<ConcentrationSaveOutcome, 'dc' | 'success'> & { total: number } } | null>(null);
  const character = characterSnapshot?.id === characterId ? characterSnapshot.character : getCharacterById(characterId);
  const visiblePlayError = playError?.id === characterId ? playError.message : null;
  const sessionState = sessionSnapshot.id === characterId ? sessionSnapshot.state : loadReconciledSessionState(characterId);
  const visibleConcentrationSave = lastConcentrationSave?.id === characterId ? lastConcentrationSave.result : undefined;

  if (!character) {
    return <section className="empty-state panel"><h1>Character not found</h1><p>The saved character may have been deleted or the link is invalid.</p><Link className="button button--secondary" to="/characters">Back to Characters</Link></section>;
  }

  const derived = deriveCharacterState(character, contentRegistry);
  if (!derived.ok) {
    return <div className="stack-page"><section className="empty-state panel"><h1>Rules data unavailable</h1><p>{derived.error.message}</p><Link className="button button--secondary" to={`/characters/${character.id}/edit`}>Edit Character</Link></section><Link className="text-link" to="/characters">← Back to Characters</Link></div>;
  }

  const state = derived.value;
  const characterIdToMutate = character.id;
  const characterName = character.name;

  function applyMutation(result: RuleResult<Character>) {
    if (!result.ok) {
      setPlayError({ id: characterIdToMutate, message: result.error.message });
      return;
    }
    setPlayError(null);
    setCharacterSnapshot({ id: characterIdToMutate, character: result.value });
  }

  function applyRoll(result: RuleResult<CharacterRollOutcome>) {
    if (!result.ok) {
      setPlayError({ id: characterIdToMutate, message: result.error.message });
      return;
    }
    setPlayError(null);
    if (result.value.character) setCharacterSnapshot({ id: characterIdToMutate, character: result.value.character });
    setHistory(loadRollHistory());
  }

  function handleAddCondition(condition: CharacterConditionId) {
    setSessionSnapshot({ id: characterIdToMutate, state: addPlaySessionCondition(characterIdToMutate, condition, window.sessionStorage, state) });
    setLastConcentrationSave(null);
  }

  function handleRemoveCondition(condition: CharacterConditionId) {
    setSessionSnapshot({ id: characterIdToMutate, state: removePlaySessionCondition(characterIdToMutate, condition) });
  }

  function handleActivateEffect(effectId: string) {
    const result = activateCharacterActiveSelfEffect(characterIdToMutate, effectId);
    if (!result.ok) {
      setPlayError({ id: characterIdToMutate, message: result.error.message });
      return;
    }
    setPlayError(null);
    setCharacterSnapshot({ id: characterIdToMutate, character: result.value.character });
    setSessionSnapshot({ id: characterIdToMutate, state: result.value.sessionState });
    setLastConcentrationSave(null);
  }

  function handleDeactivateEffect(effectId: string) {
    const result = deactivateCharacterActiveSelfEffect(characterIdToMutate, effectId);
    if (!result.ok) {
      setPlayError({ id: characterIdToMutate, message: result.error.message });
      return;
    }
    setPlayError(null);
    setCharacterSnapshot({ id: characterIdToMutate, character: result.value.character });
    setSessionSnapshot({ id: characterIdToMutate, state: result.value.sessionState });
  }

  function handleStartConcentration(providerId: string, spellId: string) {
    const result = startPlaySessionConcentration(characterIdToMutate, providerId, spellId, state);
    if (!result.ok) {
      setPlayError({ id: characterIdToMutate, message: result.error.message });
      return;
    }
    setPlayError(null);
    setLastConcentrationSave(null);
    setSessionSnapshot({ id: characterIdToMutate, state: result.value });
  }

  function handleEndConcentration() {
    setLastConcentrationSave(null);
    setSessionSnapshot({ id: characterIdToMutate, state: endPlaySessionConcentration(characterIdToMutate) });
  }

  function handleConcentrationSave(damageTaken: number, mode: RollMode) {
    const conditionContext = deriveConditionD20Context(sessionState.conditions, { kind: 'saving-throw', ability: 'constitution' });
    const result = rollConcentrationSavingThrow(characterIdToMutate, damageTaken, mode, { d20Context: conditionContext, activeEffectIds: sessionState.activeEffectIds });
    if (!result.ok) {
      setPlayError({ id: characterIdToMutate, message: result.error.message });
      return;
    }
    setPlayError(null);
    setHistory(loadRollHistory());
    const nextState = result.value.success ? sessionState : endPlaySessionConcentration(characterIdToMutate);
    setSessionSnapshot({ id: characterIdToMutate, state: nextState });
    setLastConcentrationSave({ id: characterIdToMutate, result: { dc: result.value.dc, total: result.value.roll.total, success: result.value.success } });
  }

  function handleDelete() {
    if (!window.confirm(`Delete ${characterName}? This cannot be undone.`)) return;
    if (deleteCharacter(characterIdToMutate)) clearPlaySessionState(characterIdToMutate);
    navigate('/characters');
  }

  function handleLongRest() {
    if (!window.confirm('Finish a Long Rest? This restores HP, spent Hit Dice, and Long-Rest resources, and removes Temporary HP.')) return;
    applyMutation(finishCharacterLongRest(characterIdToMutate));
  }

  function handleClearHistory() {
    clearRollHistory();
    setHistory([]);
  }

  return (
    <div className={`sheet-page character-workspace-page${view === 'play' ? ' character-workspace-page--play' : ''}`}>
      <header className="sheet-hero panel character-workspace-hero">
        <div>
          <span className="eyebrow">Character Workspace</span>
          <h1>{character.name}</h1>
          <p className="sheet-hero__meta">{state.className} <span aria-hidden="true">·</span> Level {character.level}</p>
        </div>
        <div className="sheet-hero__actions">
          <Link className="button button--secondary" to={`/characters/${character.id}/edit`}>Edit Character</Link>
          <button className="button button--danger" type="button" onClick={handleDelete}>Delete Character</button>
        </div>
      </header>

      <CharacterWorkspaceNav characterId={character.id} currentView={view} />
      {visiblePlayError && <div className="form-alert play-error" role="alert">{visiblePlayError}</div>}

      <div className={`character-workspace-layout${view === 'play' ? ' character-workspace-layout--play' : ''}`}>
        {view === 'play' && (
          <aside className="character-workspace-resources" aria-label="Class resources">
            <ResourcesPanel
              resources={state.resources}
              transactions={state.resourceTransactions}
              playState={character.playState}
              compact
              onRollHealing={(resourceId, consumerId) => applyRoll(rollHealingResource(character.id, resourceId, consumerId))}
              onUse={(resourceId, consumerId, amount) => applyMutation(consumeCharacterResource(character.id, resourceId, consumerId, amount === undefined ? undefined : { expenditureAmount: amount }))}
              onTransaction={(transactionId, request) => applyMutation(executeCharacterResourceTransaction(character.id, transactionId, request))}
            />
          </aside>
        )}

        <main className={`character-workspace-main${view === 'play' ? ' character-workspace-main--play' : ''}`}>
          {view === 'character' && (
            <CharacterReferenceView
              character={character}
              state={state}
              rollMode={rollMode}
              onRollModeChange={setRollMode}
              cover={cover}
              onCoverChange={setCover}
              conditions={sessionState.conditions}
              activeEffectIds={sessionState.activeEffectIds}
              onRoll={applyRoll}
              onMutation={applyMutation}
            />
          )}
          {view === 'play' && (
            <CharacterPlayView
              character={character}
              state={state}
              cover={cover}
              onCoverChange={setCover}
              sessionState={sessionState}
              onAddCondition={handleAddCondition}
              onRemoveCondition={handleRemoveCondition}
              onActivateEffect={handleActivateEffect}
              onDeactivateEffect={handleDeactivateEffect}
              onStartConcentration={handleStartConcentration}
              onEndConcentration={handleEndConcentration}
              onConcentrationSave={handleConcentrationSave}
              lastConcentrationSave={visibleConcentrationSave}
              onMutation={applyMutation}
              onRoll={applyRoll}
              onLongRest={handleLongRest}
            />
          )}
          {view === 'inventory' && (
            <InventoryView
              characterId={character.id}
              onCharacterChange={(updated) => setCharacterSnapshot({ id: character.id, character: updated })}
            />
          )}
        </main>

        <aside className="character-workspace-sidebar" aria-label="Dice utility">
          <DiceTray
            characterId={character.id}
            history={history}
            onHistoryChange={() => setHistory(loadRollHistory())}
            onClearHistory={handleClearHistory}
          />
        </aside>
      </div>

      <div className="sheet-footer-actions"><Link className="text-link" to="/characters">← Back to Characters</Link></div>
    </div>
  );
}
