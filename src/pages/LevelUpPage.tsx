import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ABILITY_KEYS, type AbilityKey, type SkillId } from '../models/character';
import type { ContentId } from '../models/contentId';
import {
  buildLevelUpCandidate,
  buildLevelUpReview,
  createLevelUpDraft,
  deriveLevelUpCandidateAbilityScores,
  getLevelUpAdvancementChoiceContext,
  getConfirmableLevelUpCandidate,
  getLevelUpCoreChoiceContext,
  getLevelUpSpellcastingChoiceContext,
  listLevelUpOptions,
  rollLevelUpHitPoints,
  withFixedLevelUpHitPoints,
  withLevelUpAddedClassSkills,
  withLevelUpFeatChoiceValue,
  withLevelUpFeatPath,
  withLevelUpFeatSelection,
  withLevelUpSpellcastingCantrip,
  withLevelUpSpellcastingOwnedSpell,
  withLevelUpSpellcastingReplacement,
  withLevelUpSubclass,
  withLevelUpTarget,
  withRolledLevelUpHitPoints,
  type LevelUpDraft,
  type LevelUpIncompleteChoice,
  type LevelUpTarget,
} from '../rules/levelUp';
import { SKILL_DEFINITIONS } from '../rules/skills';
import { getApplicationCharacterById } from '../services/projectState';
import { contentRegistry } from '../services/contentRegistry';
import { confirmApplicationLevelUp } from '../services/applicationLevelUpPersistence';

type LevelUpStep = 'target' | 'core' | 'advancement' | 'spellcasting' | 'review';

function targetKey(target: LevelUpTarget): string {
  return `${target.kind}:${target.classId}`;
}

function incompleteChoiceLabel(kind: LevelUpIncompleteChoice['kind']): string {
  if (kind === 'hit-points') return 'Hit Points';
  if (kind === 'subclass') return 'Subclass';
  if (kind === 'added-class-skills') return 'Added-class skills';
  if (kind === 'advancement-feat') return 'Advancement feat';
  return 'Spellcasting selection';
}

const ABILITY_LABELS: Record<AbilityKey, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma',
};

export function LevelUpPage() {
  const { characterId = '' } = useParams();
  const navigate = useNavigate();
  const character = getApplicationCharacterById(characterId);
  const [draftSnapshot, setDraftSnapshot] = useState<{ characterId: string; draft: LevelUpDraft } | null>(() => (
    character ? { characterId: character.id, draft: createLevelUpDraft(character) } : null
  ));
  const [stepSnapshot, setStepSnapshot] = useState<{ characterId: string; step: LevelUpStep } | null>(() => (
    character ? { characterId: character.id, step: 'target' } : null
  ));
  const [confirmError, setConfirmError] = useState<{ characterId: string; message: string } | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);

  if (!character) {
    return (
      <section className="empty-state panel">
        <h1>Character not found</h1>
        <p>The saved character may have been deleted or the link is invalid.</p>
        <Link className="button button--secondary" to="/characters">Back to Characters</Link>
      </section>
    );
  }

  const draft = draftSnapshot?.characterId === character.id
    ? draftSnapshot.draft
    : createLevelUpDraft(character);
  const step = stepSnapshot?.characterId === character.id ? stepSnapshot.step : 'target';
  const options = listLevelUpOptions(character, contentRegistry);
  const coreContext = draft.target ? getLevelUpCoreChoiceContext(character, draft, contentRegistry) : undefined;
  const advancementContext = draft.target ? getLevelUpAdvancementChoiceContext(character, draft, contentRegistry) : undefined;
  const spellcastingContext = draft.target ? getLevelUpSpellcastingChoiceContext(character, draft, contentRegistry) : undefined;
  const candidate = draft.target ? buildLevelUpCandidate(character, draft, contentRegistry) : undefined;
  const confirmable = draft.target ? getConfirmableLevelUpCandidate(character, draft, contentRegistry) : undefined;
  const review = draft.target ? buildLevelUpReview(character, draft, contentRegistry) : undefined;
  const selectedKey = draft.target ? targetKey(draft.target) : '';
  const unresolvedKinds = new Set(candidate?.ok ? candidate.value.incompleteChoices.map((choice) => choice.kind) : []);
  const coreIncompleteChoices = candidate?.ok
    ? candidate.value.incompleteChoices.filter((choice) => (
        choice.kind === 'hit-points' || choice.kind === 'subclass' || choice.kind === 'added-class-skills'
      ))
    : [];
  const advancementIncomplete = candidate?.ok
    ? candidate.value.incompleteChoices.some((choice) => choice.kind === 'advancement-feat')
    : false;
  const spellcastingIncomplete = candidate?.ok
    ? candidate.value.incompleteChoices.some((choice) => choice.kind === 'spellcasting-provider')
    : false;
  const advancementGrant = advancementContext?.ok ? advancementContext.value.featGrant : undefined;
  const spellcastingProviders = spellcastingContext?.ok ? spellcastingContext.value.providers : [];
  const asiOption = advancementGrant?.options.find((option) => option.isAbilityScoreImprovement);
  const featOptions = advancementGrant?.options.filter((option) => !option.isAbilityScoreImprovement) ?? [];
  const selectedFeatOption = advancementGrant?.options.find((option) => option.id === draft.advancementFeat?.selection?.featId);
  const resultingAbilityScores = candidate?.ok && !advancementIncomplete
    ? deriveLevelUpCandidateAbilityScores(candidate.value.input, contentRegistry)
    : undefined;

  function setDraft(nextDraft: LevelUpDraft) {
    setDraftSnapshot({ characterId: character!.id, draft: nextDraft });
  }

  function selectTarget(target: LevelUpTarget) {
    setDraft(withLevelUpTarget(draft, target));
  }

  function className(classId: ContentId): string {
    return contentRegistry.findClass(classId)?.name ?? classId;
  }

  function chooseFixedHp() {
    setDraft(withFixedLevelUpHitPoints(draft));
  }

  function rollHp() {
    const result = rollLevelUpHitPoints(character!, draft, contentRegistry);
    if (!result.ok) return;
    setDraft(withRolledLevelUpHitPoints(draft, result.value));
  }

  function toggleAddedClassSkill(skill: SkillId, checked: boolean) {
    const selected = draft.addedClassSkillProficiencies ?? [];
    const next = checked
      ? [...selected, skill]
      : selected.filter((candidateSkill) => candidateSkill !== skill);
    setDraft(withLevelUpAddedClassSkills(draft, next));
  }

  function chooseAdvancementPath(path: 'ability-score-improvement' | 'feat') {
    if (!advancementGrant) return;
    setDraft(withLevelUpFeatPath(
      draft,
      advancementGrant.id,
      path,
      path === 'ability-score-improvement' ? asiOption?.id : undefined,
    ));
  }

  function chooseAdvancementFeat(featId: ContentId) {
    if (!advancementGrant) return;
    setDraft(withLevelUpFeatSelection(draft, advancementGrant.id, featId));
  }

  function updateFeatAbilityChoice(choiceId: string, choiceIndex: number, value: string) {
    if (!advancementGrant) return;
    setDraft(withLevelUpFeatChoiceValue(draft, advancementGrant.id, choiceId, choiceIndex, value));
  }

  function canChooseFeatAbility(
    choiceId: string,
    choiceIndex: number,
    ability: AbilityKey,
    maximum: 20 | 30,
    allowDuplicateSelection: boolean,
  ): boolean {
    if (!advancementContext?.ok) return false;
    const selected = [...(draft.advancementFeat?.selection?.choices[choiceId] ?? [])];
    selected[choiceIndex] = ability;
    const chosen = selected.filter((value): value is AbilityKey => ABILITY_KEYS.includes(value as AbilityKey));
    if (!allowDuplicateSelection && new Set(chosen).size !== chosen.length) return false;
    const increments = new Map<AbilityKey, number>();
    for (const chosenAbility of chosen) increments.set(chosenAbility, (increments.get(chosenAbility) ?? 0) + 1);
    return [...increments].every(([chosenAbility, amount]) => advancementContext.value.currentAbilityScores[chosenAbility] + amount <= maximum);
  }

  function toggleSpellcastingCantrip(providerId: ContentId, spellId: ContentId, selected: boolean) {
    setDraft(withLevelUpSpellcastingCantrip(draft, providerId, spellId, selected));
  }

  function toggleSpellcastingOwnedSpell(providerId: ContentId, spellId: ContentId, selected: boolean) {
    setDraft(withLevelUpSpellcastingOwnedSpell(draft, providerId, spellId, selected));
  }

  function updateSpellcastingReplacement(
    providerId: ContentId,
    field: 'outgoingSpellId' | 'incomingSpellId',
    value: string,
  ) {
    const providerChoice = draft.spellcastingChoices?.find((choice) => choice.providerId === providerId);
    const replacement = {
      ...(providerChoice?.replacement ?? {}),
      [field]: value || undefined,
    };
    const next = replacement.outgoingSpellId || replacement.incomingSpellId ? replacement : undefined;
    setDraft(withLevelUpSpellcastingReplacement(draft, providerId, next));
  }

  function spellName(spellId: ContentId): string {
    return contentRegistry.findSpell(spellId)?.name ?? spellId;
  }

  function contributionLabel(kind: 'spellcasting' | 'pact-magic' | 'independent'): string {
    if (kind === 'pact-magic') return 'Pact provider';
    if (kind === 'independent') return 'Independent provider';
    return 'Ordinary spellcasting provider';
  }

  function previousReviewStep(): LevelUpStep {
    if (spellcastingProviders.length > 0) return 'spellcasting';
    if (advancementGrant) return 'advancement';
    return 'core';
  }

  function goToReview() {
    if (!confirmable?.ok) return;
    setConfirmError(null);
    setStepSnapshot({ characterId: character!.id, step: 'review' });
  }

  async function handleConfirmLevelUp() {
    if (confirmPending) return;
    setConfirmPending(true);
    const result = await confirmApplicationLevelUp(draft);
    if (!result.ok) {
      setConfirmError({ characterId: character!.id, message: result.error.message });
      setConfirmPending(false);
      return;
    }
    setConfirmError(null);
    navigate(`/characters/${result.value.character.id}`, { replace: true });
  }

  const visibleConfirmError = confirmError?.characterId === character.id ? confirmError.message : null;
  const targetClassName = coreContext?.ok ? coreContext.value.className : draft.target ? className(draft.target.classId) : '';
  const existingSubclass = coreContext?.ok && coreContext.value.existingSubclassId
    ? contentRegistry.findSubclass(coreContext.value.existingSubclassId)
    : undefined;

  return (
    <div className="stack-page stack-page--narrow">
      <header className="page-heading">
        <span className="eyebrow">Character Advancement</span>
        <h1>Level Up {character.name}</h1>
        <p>This Level Up draft is temporary. Review the complete advancement before Confirm Level Up persists anything.</p>
      </header>

      <section className="panel form-section" aria-labelledby="level-up-current-heading">
        <div className="section-heading section-heading--split">
          <div>
            <span className="eyebrow">Current Character</span>
            <h2 id="level-up-current-heading">Level {options.totalLevel}</h2>
          </div>
          <p>Resulting Level: <strong>{options.totalLevel + (options.atLevelCap ? 0 : 1)}</strong> · Starting Class: <strong>{className(character.startingClassId)}</strong></p>
        </div>
        <div className="feat-editor__list">
          {character.classProgressions.map((progression) => (
            <article className="feat-editor__card" key={progression.classId}>
              <div className="feat-editor__header">
                <div>
                  <span className="eyebrow">{progression.classId === character.startingClassId ? 'Starting Class' : 'Added Class'}</span>
                  <h3>{className(progression.classId)}</h3>
                </div>
                <strong>Level {progression.level}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>

      {options.atLevelCap && (
        <div className="form-alert" role="status">
          Level 20 is the maximum Character level. No Level Up target is available.
        </div>
      )}

      {step === 'target' && (
        <>
          <section className="panel form-section" aria-labelledby="level-up-existing-heading">
            <div className="section-heading">
              <span className="eyebrow">Step 1 · Choose Level</span>
              <h2 id="level-up-existing-heading">Advance an existing class</h2>
            </div>
            <div className="choice-grid">
              {options.existingClasses.map((option) => {
                const key = targetKey(option.target);
                return (
                  <label className="choice-card" key={key}>
                    <input
                      type="radio"
                      name="level-up-target"
                      value={key}
                      checked={selectedKey === key}
                      disabled={!option.eligible}
                      onChange={() => selectTarget(option.target)}
                    />
                    <span>
                      <strong>{option.className}</strong>
                      <small>Level {option.currentLevel} → Level {option.nextLevel}</small>
                      {option.reason && <small>{option.reason}</small>}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="panel form-section" aria-labelledby="level-up-new-class-heading">
            <div className="section-heading">
              <span className="eyebrow">Step 1 · Choose Level</span>
              <h2 id="level-up-new-class-heading">Begin a new class at level 1</h2>
              <p>Only unrepresented classes are shown. Multiclass prerequisites use the Character's authoritative effective ability scores.</p>
            </div>
            <div className="choice-grid">
              {options.newClasses.map((option) => {
                const key = targetKey(option.target);
                return (
                  <label className="choice-card" key={key}>
                    <input
                      type="radio"
                      name="level-up-target"
                      value={key}
                      checked={selectedKey === key}
                      disabled={!option.eligible}
                      onChange={() => selectTarget(option.target)}
                    />
                    <span>
                      <strong>{option.className}</strong>
                      <small>{option.eligible ? 'Add at class level 1' : `Unavailable — ${option.reason ?? 'requirements not met'}`}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          {coreContext?.ok && (
            <section className="panel form-section" aria-labelledby="level-up-selection-heading">
              <div className="section-heading">
                <span className="eyebrow">Selected Advancement</span>
                <h2 id="level-up-selection-heading">
                  {coreContext.value.addedClass
                    ? `Add ${targetClassName} at level 1`
                    : `Advance ${targetClassName} by 1 level`}
                </h2>
                <p>
                  {coreContext.value.addedClass
                    ? `New ${targetClassName} progression: 0 → 1.`
                    : `${targetClassName}: Level ${coreContext.value.currentClassLevel} → Level ${coreContext.value.nextClassLevel}.`}
                </p>
              </div>
              <button
                className="button button--primary"
                type="button"
                onClick={() => setStepSnapshot({ characterId: character.id, step: 'core' })}
              >
                Next: Core Choices
              </button>
            </section>
          )}
        </>
      )}

      {step === 'core' && coreContext?.ok && candidate?.ok && (
        <>
          <section className="panel form-section" aria-labelledby="level-up-core-heading">
            <div className="section-heading section-heading--split">
              <div>
                <span className="eyebrow">Step 2 · Core Choices</span>
                <h2 id="level-up-core-heading">{targetClassName}</h2>
                <p>
                  {coreContext.value.addedClass
                    ? `Begin ${targetClassName} at class level 1.`
                    : `Class level ${coreContext.value.currentClassLevel} → ${coreContext.value.nextClassLevel}.`}
                </p>
              </div>
              <strong>Character Level {options.totalLevel} → {options.totalLevel + 1}</strong>
            </div>
            {existingSubclass && <p className="field-hint">Existing subclass preserved: <strong>{existingSubclass.name}</strong>.</p>}
            {coreIncompleteChoices.length > 0
              ? <p className="field-hint">Still required: {coreIncompleteChoices.map((choice) => incompleteChoiceLabel(choice.kind)).join(' · ')}.</p>
              : <p className="form-success" role="status"><strong>Core choices complete.</strong> No Character data has been saved.</p>}
            {coreIncompleteChoices.length === 0 && advancementContext?.ok && !advancementContext.value.featGrant && (
              <p className="field-hint"><strong>Advancement Choices:</strong> none required for {targetClassName} class level {advancementContext.value.nextClassLevel}.</p>
            )}
            {coreIncompleteChoices.length === 0 && !advancementGrant && spellcastingContext?.ok && spellcastingProviders.length === 0 && (
              <p className="field-hint"><strong>Spellcasting Choices:</strong> none required for {targetClassName} class level {spellcastingContext.value.nextClassLevel}.</p>
            )}
          </section>

          <section className="panel form-section" aria-labelledby="level-up-hp-heading">
            <div className="section-heading section-heading--split">
              <div>
                <span className="eyebrow">Required Core Choice</span>
                <h2 id="level-up-hp-heading">Hit Points</h2>
                <p>
                  {coreContext.value.addedClass
                    ? `Added ${targetClassName} class level 1 uses ordinary added-level HP; it does not receive a starting-character maximum Hit Die.`
                    : `Record HP advancement for ${targetClassName} class level ${coreContext.value.nextClassLevel}.`}
                </p>
              </div>
              <span className="source-badge">{unresolvedKinds.has('hit-points') ? 'REQUIRED' : 'COMPLETE'}</span>
            </div>
            <div className="form-actions">
              <button
                className={`button ${draft.hitPoints?.method === 'fixed' ? 'button--primary' : 'button--secondary'}`}
                type="button"
                aria-pressed={draft.hitPoints?.method === 'fixed'}
                onClick={chooseFixedHp}
              >
                Fixed HP ({coreContext.value.fixedHitPointsPerLevel})
              </button>
              <button
                className={`button ${draft.hitPoints?.method === 'rolled' ? 'button--primary' : 'button--secondary'}`}
                type="button"
                aria-pressed={draft.hitPoints?.method === 'rolled'}
                onClick={rollHp}
              >
                {draft.hitPoints?.method === 'rolled' ? `Reroll d${coreContext.value.hitDie}` : `Roll d${coreContext.value.hitDie}`}
              </button>
            </div>
            {draft.hitPoints?.method === 'fixed' && <p className="field-hint">Fixed progression entry selected. Constitution contribution remains part of authoritative health derivation.</p>}
            {draft.hitPoints?.method === 'rolled' && <p className="field-hint">Rolled HP: <strong>{draft.hitPoints.roll}</strong> on d{coreContext.value.hitDie}. This result remains in the current draft until you explicitly choose another HP method or reroll.</p>}
          </section>

          {coreContext.value.subclassRequired && (
            <section className="panel form-section" aria-labelledby="level-up-subclass-heading">
              <div className="section-heading section-heading--split">
                <div>
                  <span className="eyebrow">Required Core Choice</span>
                  <h2 id="level-up-subclass-heading">Subclass</h2>
                  <p>{targetClassName} class level {coreContext.value.nextClassLevel} requires an explicit subclass choice.</p>
                </div>
                <span className="source-badge">{unresolvedKinds.has('subclass') ? 'REQUIRED' : 'COMPLETE'}</span>
              </div>
              <div className="choice-grid">
                {coreContext.value.subclasses.map((subclass) => (
                  <label className="choice-card" key={subclass.id}>
                    <input
                      type="radio"
                      name="level-up-subclass"
                      value={subclass.id}
                      checked={draft.subclassId === subclass.id}
                      onChange={() => setDraft(withLevelUpSubclass(draft, subclass.id))}
                    />
                    <span><strong>{subclass.name}</strong><small>{subclass.description}</small></span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {coreContext.value.addedClass && coreContext.value.addedClassSkills.choose > 0 && (
            <section className="panel form-section" aria-labelledby="level-up-skills-heading">
              <div className="section-heading section-heading--split">
                <div>
                  <span className="eyebrow">Required Core Choice</span>
                  <h2 id="level-up-skills-heading">Added-class skills</h2>
                  <p>Choose exactly {coreContext.value.addedClassSkills.choose} {targetClassName} multiclass skill{coreContext.value.addedClassSkills.choose === 1 ? '' : 's'}.</p>
                </div>
                <span className="source-badge">{unresolvedKinds.has('added-class-skills') ? 'REQUIRED' : 'COMPLETE'}</span>
              </div>
              <div className="choice-grid">
                {coreContext.value.addedClassSkills.from.map((skillId) => {
                  const selected = draft.addedClassSkillProficiencies ?? [];
                  const checked = selected.includes(skillId);
                  return (
                    <label className="choice-card" key={skillId}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && selected.length >= coreContext.value.addedClassSkills.choose}
                        onChange={(event) => toggleAddedClassSkill(skillId, event.target.checked)}
                      />
                      <span>{SKILL_DEFINITIONS[skillId].name}</span>
                    </label>
                  );
                })}
              </div>
              <p className="field-hint">{(draft.addedClassSkillProficiencies ?? []).length} / {coreContext.value.addedClassSkills.choose} selected.</p>
            </section>
          )}

          <div className="form-actions">
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setStepSnapshot({ characterId: character.id, step: 'target' })}
            >
              Back
            </button>
            {coreIncompleteChoices.length === 0 && advancementGrant && (
              <button
                className="button button--primary"
                type="button"
                onClick={() => setStepSnapshot({ characterId: character.id, step: 'advancement' })}
              >
                Next: Advancement Choices
              </button>
            )}
            {coreIncompleteChoices.length === 0 && !advancementGrant && spellcastingProviders.length > 0 && (
              <button
                className="button button--primary"
                type="button"
                onClick={() => setStepSnapshot({ characterId: character.id, step: 'spellcasting' })}
              >
                Next: Spellcasting Choices
              </button>
            )}
            {coreIncompleteChoices.length === 0 && !advancementGrant && spellcastingProviders.length === 0 && confirmable?.ok && (
              <button className="button button--primary" type="button" onClick={goToReview}>
                Next: Review
              </button>
            )}
            <Link className="button button--secondary" to={`/characters/${character.id}`}>Cancel</Link>
          </div>
        </>
      )}

      {step === 'advancement' && coreContext?.ok && advancementContext?.ok && advancementGrant && (
        <>
          <section className="panel form-section" aria-labelledby="level-up-advancement-heading">
            <div className="section-heading section-heading--split">
              <div>
                <span className="eyebrow">Step 3 · Advancement Choices</span>
                <h2 id="level-up-advancement-heading">{advancementGrant.name}</h2>
                <p>{targetClassName} class level {advancementContext.value.currentClassLevel} → {advancementContext.value.nextClassLevel} grants this feat decision.</p>
              </div>
              <span className="source-badge">{advancementIncomplete ? 'REQUIRED' : 'COMPLETE'}</span>
            </div>
            {candidate?.ok && !advancementIncomplete
              ? <p className="form-success" role="status"><strong>Advancement choices complete.</strong> No Character data has been saved.</p>
              : <p className="field-hint">Choose one valid advancement option and complete its structured choices.</p>}
            {!advancementIncomplete && spellcastingContext?.ok && spellcastingProviders.length === 0 && (
              <p className="field-hint"><strong>Spellcasting Choices:</strong> none required for {targetClassName} class level {spellcastingContext.value.nextClassLevel}.</p>
            )}
          </section>

          <section className="panel form-section" aria-labelledby="level-up-feat-path-heading">
            <div className="section-heading">
              <span className="eyebrow">Feat Acquisition</span>
              <h2 id="level-up-feat-path-heading">Choose advancement type</h2>
              <p>Only mechanically eligible feats with fully supported persisted choices are shown.</p>
            </div>
            <div className="choice-grid">
              {asiOption && (
                <label className="choice-card">
                  <input
                    type="radio"
                    name="level-up-feat-path"
                    checked={draft.advancementFeat?.path === 'ability-score-improvement'}
                    onChange={() => chooseAdvancementPath('ability-score-improvement')}
                  />
                  <span><strong>Ability Score Improvement</strong><small>{asiOption.description}</small></span>
                </label>
              )}
              {featOptions.length > 0 && (
                <label className="choice-card">
                  <input
                    type="radio"
                    name="level-up-feat-path"
                    checked={draft.advancementFeat?.path === 'feat'}
                    onChange={() => chooseAdvancementPath('feat')}
                  />
                  <span><strong>Feat</strong><small>Choose another mechanically eligible {advancementGrant.kind === 'epic-boon' ? 'General or Epic Boon' : 'General'} feat.</small></span>
                </label>
              )}
            </div>

            {draft.advancementFeat?.path === 'feat' && (
              <label className="field" htmlFor="level-up-feat-selection">
                <span>Feat selection</span>
                <select
                  id="level-up-feat-selection"
                  value={draft.advancementFeat.selection?.featId ?? ''}
                  onChange={(event) => event.target.value && chooseAdvancementFeat(event.target.value)}
                >
                  <option value="">Choose a feat</option>
                  {featOptions.map((option) => <option key={option.id} value={option.id}>{option.name} · {option.category}</option>)}
                </select>
              </label>
            )}
          </section>

          {selectedFeatOption && (
            <section className="panel form-section" aria-labelledby="level-up-feat-choice-heading">
              <div className="section-heading">
                <span className="eyebrow">{selectedFeatOption.category}</span>
                <h2 id="level-up-feat-choice-heading">{selectedFeatOption.name}</h2>
                <p>{selectedFeatOption.description}</p>
              </div>

              {selectedFeatOption.abilityChoices.map((choice) => (
                <div className="field-grid field-grid--two" key={choice.choiceId}>
                  {Array.from({ length: choice.selections }, (_, choiceIndex) => (
                    <label className="field" key={choiceIndex} htmlFor={`level-up-feat-${choice.choiceId}-${choiceIndex}`}>
                      <span>{choice.selections === 1 ? 'Ability Score Increase' : `Ability Score Increase ${choiceIndex + 1}`}</span>
                      <select
                        id={`level-up-feat-${choice.choiceId}-${choiceIndex}`}
                        value={draft.advancementFeat?.selection?.choices[choice.choiceId]?.[choiceIndex] ?? ''}
                        onChange={(event) => updateFeatAbilityChoice(choice.choiceId, choiceIndex, event.target.value)}
                      >
                        <option value="">Choose an ability</option>
                        {choice.allowedAbilities
                          .filter((ability) => canChooseFeatAbility(choice.choiceId, choiceIndex, ability, choice.maximum, choice.allowDuplicateSelection))
                          .map((ability) => (
                            <option key={ability} value={ability}>{ABILITY_LABELS[ability]}</option>
                          ))}
                      </select>
                    </label>
                  ))}
                </div>
              ))}

              <details className="play-reference-details">
                <summary>Details</summary>
                <div className="play-reference-details__body">
                  <p>{selectedFeatOption.description}</p>
                  <small>Eligibility and ability-score limits are validated by the existing Feat rules engine against the ephemeral Level Up candidate.</small>
                </div>
              </details>
            </section>
          )}

          <section className="panel form-section" aria-labelledby="level-up-ability-preview-heading">
            <div className="section-heading">
              <span className="eyebrow">Candidate Preview</span>
              <h2 id="level-up-ability-preview-heading">Ability Scores</h2>
              <p>These are derived values only. Base Character ability scores are not being rewritten.</p>
            </div>
            <div className="choice-grid">
              {ABILITY_KEYS.map((ability) => {
                const current = advancementContext.value.currentAbilityScores[ability];
                const resulting = resultingAbilityScores?.ok ? resultingAbilityScores.value[ability] : current;
                return (
                  <article className="choice-card" key={ability} aria-label={`${ABILITY_LABELS[ability]} candidate ability score`}>
                    <span><strong>{ABILITY_LABELS[ability]}</strong><small>{current === resulting ? String(current) : `${current} → ${resulting}`}</small></span>
                  </article>
                );
              })}
            </div>
          </section>

          <div className="form-actions">
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setStepSnapshot({ characterId: character.id, step: 'core' })}
            >
              Back
            </button>
            {!advancementIncomplete && spellcastingProviders.length > 0 && (
              <button
                className="button button--primary"
                type="button"
                onClick={() => setStepSnapshot({ characterId: character.id, step: 'spellcasting' })}
              >
                Next: Spellcasting Choices
              </button>
            )}
            {!advancementIncomplete && spellcastingProviders.length === 0 && confirmable?.ok && (
              <button className="button button--primary" type="button" onClick={goToReview}>
                Next: Review
              </button>
            )}
            <Link className="button button--secondary" to={`/characters/${character.id}`}>Cancel</Link>
          </div>
        </>
      )}

      {step === 'spellcasting' && coreContext?.ok && spellcastingContext?.ok && spellcastingProviders.length > 0 && (
        <>
          <section className="panel form-section" aria-labelledby="level-up-spellcasting-heading">
            <div className="section-heading section-heading--split">
              <div>
                <span className="eyebrow">Step 4 · Spellcasting Choices</span>
                <h2 id="level-up-spellcasting-heading">{targetClassName}</h2>
                <p>Resolve only provider-local persisted selections created by this exact owner-level transition.</p>
              </div>
              <span className="source-badge">{spellcastingIncomplete ? 'REQUIRED' : 'COMPLETE'}</span>
            </div>
            {candidate?.ok && !spellcastingIncomplete
              ? <p className="form-success" role="status"><strong>Spellcasting choices complete.</strong> No Character data has been saved.</p>
              : <p className="field-hint">Complete each provider's required selection delta. Optional class-level replacement choices may be left unchanged.</p>}
          </section>

          {spellcastingProviders.map((provider) => {
            const providerChoice = draft.spellcastingChoices?.find((choice) => choice.providerId === provider.providerId);
            const addedCantrips = providerChoice?.addedCantripIds ?? [];
            const addedOwnedSpells = providerChoice?.addedOwnedSpellIds ?? [];
            const replacementChoice = providerChoice?.replacement;
            const ownerLabel = provider.owner.kind === 'subclass'
              ? `${provider.owner.className} · ${provider.owner.subclassName}`
              : provider.owner.className;
            const ownerTransition = provider.previousOwnerLevel === undefined
              ? `New provider at owner level ${provider.nextOwnerLevel}`
              : `Owner level ${provider.previousOwnerLevel} → ${provider.nextOwnerLevel}`;
            const incomingReplacementOptions = provider.replacement?.legalIncomingSpells.filter((spell) => (
              !provider.currentSelection.preparedSpellIds.includes(spell.id)
            )) ?? [];

            return (
              <section className="panel form-section" key={provider.providerId} aria-labelledby={`level-up-provider-${provider.providerId}`}>
                <div className="section-heading section-heading--split">
                  <div>
                    <span className="eyebrow">{ownerLabel}</span>
                    <h2 id={`level-up-provider-${provider.providerId}`}>{provider.providerName}</h2>
                    <p>{ownerTransition} · {provider.managementKind === 'prepared-from-owned' ? 'Owned spellbook + preparation' : 'Prepared from provider list'}.</p>
                  </div>
                  <span className="source-badge">{contributionLabel(provider.contributionKind)}</span>
                </div>

                <p className="field-hint">
                  Provider spell access: cantrips and leveled spells through level <strong>{provider.maximumSpellLevel}</strong>.
                  Shared ordinary slot capacity does not expand this provider's selectable spell access.
                </p>

                <div className="feat-editor__list">
                  <p><strong>Current cantrips:</strong> {provider.currentSelection.cantripIds.length > 0 ? provider.currentSelection.cantripIds.map(spellName).join(', ') : 'None stored'}</p>
                  {provider.managementKind === 'prepared-from-owned' && (
                    <p><strong>Current owned spells:</strong> {provider.currentSelection.ownedSpellIds.length > 0 ? provider.currentSelection.ownedSpellIds.map(spellName).join(', ') : 'None stored'}</p>
                  )}
                  <p><strong>Current prepared spells:</strong> {provider.currentSelection.preparedSpellIds.length > 0 ? provider.currentSelection.preparedSpellIds.map(spellName).join(', ') : 'None stored'}</p>
                </div>

                {provider.requiredCantripAdditions > 0 && (
                  <div>
                    <div className="section-heading section-heading--split">
                      <div>
                        <h3>New cantrip selection</h3>
                        <p>Choose exactly {provider.requiredCantripAdditions} additional provider-local cantrip{provider.requiredCantripAdditions === 1 ? '' : 's'}.</p>
                      </div>
                      <span className="source-badge">{addedCantrips.length} / {provider.requiredCantripAdditions}</span>
                    </div>
                    <div className="choice-grid">
                      {provider.legalCantrips.map((spell) => {
                        const checked = addedCantrips.includes(spell.id);
                        return (
                          <label className="choice-card" key={spell.id}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!checked && addedCantrips.length >= provider.requiredCantripAdditions}
                              onChange={(event) => toggleSpellcastingCantrip(provider.providerId, spell.id, event.target.checked)}
                            />
                            <span><strong>{spell.name}</strong><small>Cantrip · {spell.school}</small></span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {provider.requiredOwnedSpellAdditions > 0 && (
                  <div>
                    <div className="section-heading section-heading--split">
                      <div>
                        <h3>Required owned spells</h3>
                        <p>
                          Choose exactly {provider.requiredOwnedSpellAdditions} additional level {provider.ownedSpellRequiredLevel} owned spell{provider.requiredOwnedSpellAdditions === 1 ? '' : 's'}.
                        </p>
                      </div>
                      <span className="source-badge">{addedOwnedSpells.length} / {provider.requiredOwnedSpellAdditions}</span>
                    </div>
                    <div className="choice-grid">
                      {provider.legalOwnedSpells.map((spell) => {
                        const checked = addedOwnedSpells.includes(spell.id);
                        return (
                          <label className="choice-card" key={spell.id}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!checked && addedOwnedSpells.length >= provider.requiredOwnedSpellAdditions}
                              onChange={(event) => toggleSpellcastingOwnedSpell(provider.providerId, spell.id, event.target.checked)}
                            />
                            <span><strong>{spell.name}</strong><small>Level {spell.level} · {spell.school}</small></span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {provider.replacement && (
                  <div>
                    <div className="section-heading">
                      <h3>Optional class-level replacement</h3>
                      <p>This provider structurally permits one prepared-spell replacement at this class level. Leaving both fields blank preserves the current preparation.</p>
                    </div>
                    <div className="field-grid field-grid--two">
                      <label className="field" htmlFor={`level-up-replacement-out-${provider.providerId}`}>
                        <span>Prepared spell to replace</span>
                        <select
                          id={`level-up-replacement-out-${provider.providerId}`}
                          value={replacementChoice?.outgoingSpellId ?? ''}
                          onChange={(event) => updateSpellcastingReplacement(provider.providerId, 'outgoingSpellId', event.target.value)}
                        >
                          <option value="">No replacement</option>
                          {provider.replacement.currentPreparedSpells.map((spell) => (
                            <option key={spell.id} value={spell.id}>{spell.name} · Level {spell.level}</option>
                          ))}
                        </select>
                      </label>
                      <label className="field" htmlFor={`level-up-replacement-in-${provider.providerId}`}>
                        <span>Replacement spell</span>
                        <select
                          id={`level-up-replacement-in-${provider.providerId}`}
                          value={replacementChoice?.incomingSpellId ?? ''}
                          disabled={!replacementChoice?.outgoingSpellId}
                          onChange={(event) => updateSpellcastingReplacement(provider.providerId, 'incomingSpellId', event.target.value)}
                        >
                          <option value="">Choose replacement</option>
                          {incomingReplacementOptions.map((spell) => (
                            <option key={spell.id} value={spell.id}>{spell.name} · Level {spell.level}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                )}
              </section>
            );
          })}

          <div className="form-actions">
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setStepSnapshot({ characterId: character.id, step: advancementGrant ? 'advancement' : 'core' })}
            >
              Back
            </button>
            {!spellcastingIncomplete && confirmable?.ok && (
              <button className="button button--primary" type="button" onClick={goToReview}>
                Next: Review
              </button>
            )}
            <Link className="button button--secondary" to={`/characters/${character.id}`}>Cancel</Link>
          </div>
        </>
      )}


      {step === 'review' && review?.ok && (
        <>
          <section className="panel form-section" aria-labelledby="level-up-review-heading">
            <div className="section-heading section-heading--split">
              <div>
                <span className="eyebrow">Final Step · Review</span>
                <h2 id="level-up-review-heading">Review Level Up</h2>
                <p>Read-only summary of the exact candidate that will be persisted.</p>
              </div>
              <span className="source-badge">NOT SAVED</span>
            </div>
          </section>

          <section className="panel form-section" aria-labelledby="level-up-review-summary-heading">
            <div className="section-heading">
              <h2 id="level-up-review-summary-heading">Advancement summary</h2>
            </div>

            <div className="feat-editor__list">
              <article className="feat-editor__card">
                <div className="feat-editor__header">
                  <div><span className="eyebrow">Character Level</span><h3>Total Level</h3></div>
                  <strong>{review.value.totalLevel.before} → {review.value.totalLevel.after}</strong>
                </div>
              </article>

              <article className="feat-editor__card">
                <div className="feat-editor__header">
                  <div>
                    <span className="eyebrow">{review.value.classAdvancement.kind === 'new-class' ? 'New Multiclass' : 'Advanced Class'}</span>
                    <h3>{review.value.classAdvancement.className}</h3>
                  </div>
                  <strong>
                    {review.value.classAdvancement.kind === 'new-class'
                      ? 'Added at Level 1'
                      : <>{review.value.classAdvancement.beforeLevel} → {review.value.classAdvancement.afterLevel}</>}
                  </strong>
                </div>
              </article>

              <article className="feat-editor__card">
                <div className="feat-editor__header">
                  <div>
                    <span className="eyebrow">Hit Points · {review.value.hitPoints.method === 'fixed' ? 'Fixed' : 'Rolled'}</span>
                    <h3>Maximum HP</h3>
                    <small>
                      {review.value.hitPoints.method === 'fixed'
                        ? <>Fixed HP {review.value.hitPoints.fixedValue}</>
                        : <>Hit Die roll {review.value.hitPoints.roll}</>}
                    </small>
                  </div>
                  <strong>{review.value.hitPoints.maximumBefore} → {review.value.hitPoints.maximumAfter}</strong>
                </div>
              </article>

              {review.value.subclass && (
                <article className="feat-editor__card">
                  <div className="feat-editor__header">
                    <div><span className="eyebrow">Subclass Gained</span><h3>{review.value.subclass.name}</h3></div>
                  </div>
                </article>
              )}

              {review.value.addedClassSkills.length > 0 && (
                <article className="feat-editor__card">
                  <div className="feat-editor__header">
                    <div>
                      <span className="eyebrow">Added-Class Proficiency</span>
                      <h3>Skills</h3>
                      <small>{review.value.addedClassSkills.map((skill) => SKILL_DEFINITIONS[skill].name).join(', ')}</small>
                    </div>
                  </div>
                </article>
              )}

              {review.value.feat && (
                <article className="feat-editor__card">
                  <div className="feat-editor__header">
                    <div>
                      <span className="eyebrow">{review.value.feat.path === 'ability-score-improvement' ? 'Ability Score Improvement' : 'Feat Gained'}</span>
                      <h3>{review.value.feat.name}</h3>
                      {review.value.feat.abilityChoices.length > 0 && (
                        <small>Ability choices: {review.value.feat.abilityChoices.map((ability) => ABILITY_LABELS[ability]).join(', ')}</small>
                      )}
                    </div>
                  </div>
                </article>
              )}

              {review.value.spellcasting.map((provider) => (
                <article className="feat-editor__card" key={provider.providerId}>
                  <div className="feat-editor__header">
                    <div>
                      <span className="eyebrow">Spellcasting · {provider.ownerLabel}</span>
                      <h3>{provider.providerName}</h3>
                      {provider.addedCantrips.length > 0 && <small>Added cantrips: {provider.addedCantrips.map((spell) => spell.name).join(', ')}</small>}
                      {provider.addedOwnedSpells.length > 0 && <small>Added owned spells: {provider.addedOwnedSpells.map((spell) => spell.name).join(', ')}</small>}
                      {provider.replacement && <small>Replacement: {provider.replacement.outgoing.name} → {provider.replacement.incoming.name}</small>}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className="form-actions">
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setStepSnapshot({ characterId: character.id, step: previousReviewStep() })}
            >
              Back
            </button>
            <button
              className="button button--primary"
              type="button"
              disabled={!confirmable?.ok || confirmPending}
              onClick={handleConfirmLevelUp}
            >
              {confirmPending ? 'Confirming…' : 'Confirm Level Up'}
            </button>
            <Link className="button button--secondary" to={'/characters/' + character.id}>Cancel</Link>
          </div>
        </>
      )}

      {visibleConfirmError && <div className="form-alert" role="alert">{visibleConfirmError}</div>}

      {step !== 'target' && candidate?.ok && candidate.value.incompleteChoices.length === 0 && confirmable && !confirmable.ok && !visibleConfirmError && (
        <div className="form-alert" role="alert">{confirmable.error.message}</div>
      )}

      {!visibleConfirmError && ((coreContext && !coreContext.ok) || (advancementContext && !advancementContext.ok) || (spellcastingContext && !spellcastingContext.ok) || (candidate && !candidate.ok)) && (
        <div className="form-alert" role="alert">
          {!coreContext?.ok
            ? coreContext?.error.message
            : !advancementContext?.ok
              ? advancementContext?.error.message
              : !spellcastingContext?.ok
                ? spellcastingContext?.error.message
                : !candidate?.ok
                  ? candidate?.error.message
                  : ''}
        </div>
      )}

      {step === 'target' && (
        <div className="form-actions">
          <Link className="button button--secondary" to={`/characters/${character.id}`}>Cancel</Link>
        </div>
      )}
    </div>
  );
}
