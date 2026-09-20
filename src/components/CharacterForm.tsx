import { useState, type FormEvent } from 'react';
import {
  ABILITY_KEYS,
  EMPTY_CURRENCY,
  type AbilityKey,
  type AbilityScores,
  type BackgroundAbilityChoice,
  type Character,
  type CharacterFeatSelection,
  type CharacterInput,
  type CharacterSpellcastingSelection,
  type InventoryEntry,
  type RegistryInventoryEntry,
  type SkillId,
} from '../models/character';
import type { ContentId } from '../models/contentId';
import { classProgressionSkillChoiceContext } from '../rules/classProficiencies';
import { inventoryCategoryForContent } from '../rules/inventory';
import { SKILL_DEFINITIONS } from '../rules/skills';
import {
  maximumSelectableSpellLevel,
  spellBelongsToProviderList,
  spellcastingCountAtLevel,
} from '../rules/spellcasting';
import { contentRegistry } from '../services/contentRegistry';
import {
  MAX_ABILITY_SCORE,
  MAX_CHARACTER_LEVEL,
  MIN_ABILITY_SCORE,
  MIN_CHARACTER_LEVEL,
  hasValidationErrors,
  validateCharacterInput,
  type CharacterValidationErrors,
} from '../utils/characterValidation';
import {
  activeEditorSpellcastingProviders,
  canAddClass,
  canRemoveClass,
  createProgressionDraft,
  hydrateClassProgressionDrafts,
  progressionDraftToInput,
  reconcileSpellcastingSelections,
  setDraftStartingClass,
  totalDraftLevel,
  updateProgressionClass,
  updateProgressionLevel,
  type ClassProgressionDraft,
} from './characterEditorModel';

const ABILITY_LABELS: Record<AbilityKey, string> = {
  strength: 'Strength', dexterity: 'Dexterity', constitution: 'Constitution', intelligence: 'Intelligence', wisdom: 'Wisdom', charisma: 'Charisma',
};
interface CharacterFormState {
  name: string;
  speciesId: ContentId;
  backgroundId: ContentId;
  startingClassId: ContentId;
  classProgressions: ClassProgressionDraft[];
  speciesSize: '' | 'small' | 'medium';
  speciesChoices: Record<string, string>;
  speciesSkillProficiencies: SkillId[];
  backgroundAbilityMode: BackgroundAbilityChoice['mode'];
  backgroundPlusTwo: AbilityKey;
  backgroundPlusOne: AbilityKey;
  backgroundToolChoice: string;
  backgroundEquipmentChoice: string;
  classEquipmentChoice: string;
  manualFeats: CharacterFeatSelection[];
  spellcastingSelections: CharacterSpellcastingSelection[];
  abilityScores: Record<AbilityKey, string>;
}
interface CharacterFormProps { initialCharacter?: Character; submitLabel: string; onSubmit: (input: CharacterInput) => void; }

function initialSpeciesChoices(speciesId: ContentId): Pick<CharacterFormState, 'speciesSize' | 'speciesChoices' | 'speciesSkillProficiencies'> {
  const species = contentRegistry.findSpecies(speciesId);
  return {
    speciesSize: species?.size.kind === 'choice' ? species.size.options[0] ?? '' : '',
    speciesChoices: Object.fromEntries((species?.choices ?? []).map((choice) => [choice.id, choice.options[0]?.id ?? ''])),
    speciesSkillProficiencies: species?.skillProficiencyChoice ? [species.skillProficiencyChoice.from[0]] : [],
  };
}

function initialBackgroundChoices(backgroundId: ContentId): Pick<CharacterFormState, 'backgroundAbilityMode' | 'backgroundPlusTwo' | 'backgroundPlusOne' | 'backgroundToolChoice' | 'backgroundEquipmentChoice'> {
  const background = contentRegistry.findBackground(backgroundId);
  return {
    backgroundAbilityMode: 'two-one',
    backgroundPlusTwo: background?.abilityScores[0] ?? 'strength',
    backgroundPlusOne: background?.abilityScores[1] ?? 'dexterity',
    backgroundToolChoice: background?.toolProficiency.kind === 'choice' ? background.toolProficiency.options[0]?.id ?? '' : '',
    backgroundEquipmentChoice: background?.startingEquipment[0]?.id ?? '',
  };
}

function cloneFeatSelection(selection: CharacterFeatSelection): CharacterFeatSelection {
  return { featId: selection.featId, choices: Object.fromEntries(Object.entries(selection.choices).map(([choiceId, values]) => [choiceId, [...values]])) };
}

function cloneSpellcastingSelection(selection: CharacterSpellcastingSelection): CharacterSpellcastingSelection {
  return { providerId: selection.providerId, cantripIds: [...selection.cantripIds], ownedSpellIds: [...selection.ownedSpellIds], preparedSpellIds: [...selection.preparedSpellIds] };
}

function initialFeatSelection(featId: ContentId): CharacterFeatSelection {
  const feat = contentRegistry.findFeat(featId);
  const choices: Record<string, string[]> = {};
  for (const effect of feat?.effects ?? []) {
    if (effect.type !== 'ability-score-increase') continue;
    choices[effect.choiceId] = Array.from({ length: effect.selections }, (_, index) => effect.allowedAbilities[effect.allowDuplicateSelection ? 0 : index] ?? effect.allowedAbilities[0]);
  }
  return { featId, choices };
}

function formatFeatPrerequisite(featId: ContentId): string {
  const feat = contentRegistry.findFeat(featId);
  if (!feat || feat.prerequisites.length === 0) return 'No prerequisite.';
  return feat.prerequisites.map((prerequisite) => {
    if (prerequisite.type === 'level') return `Level ${prerequisite.minimum}+`;
    if (prerequisite.type === 'ability-minimum') return `${prerequisite.abilities.map((ability) => ABILITY_LABELS[ability]).join(' or ')} ${prerequisite.minimum}+`;
    return `${prerequisite.name} (not automatically evaluated)`;
  }).join(' · ');
}

function createInitialState(character?: Character): CharacterFormState {
  const species = contentRegistry.getAll('species');
  const backgrounds = contentRegistry.getAll('background');
  const classes = contentRegistry.getAll('class');
  const speciesId = character?.speciesId ?? (character ? '' : species[0]?.id ?? '');
  const backgroundId = character?.backgroundId ?? (character ? '' : backgrounds[0]?.id ?? '');
  const defaultClassId = classes[0]?.id ?? '';
  const startingClassId = character?.startingClassId ?? defaultClassId;
  const classProgressions = character
    ? hydrateClassProgressionDrafts(character)
    : [createProgressionDraft(defaultClassId, true)];
  const speciesDefaults = initialSpeciesChoices(speciesId);
  const backgroundDefaults = initialBackgroundChoices(backgroundId);
  const existingBackgroundChoice = character?.backgroundAbilityChoice;
  return {
    name: character?.name ?? '',
    speciesId,
    backgroundId,
    startingClassId,
    classProgressions,
    speciesSize: character?.speciesSize ?? speciesDefaults.speciesSize,
    speciesChoices: character ? { ...character.speciesChoices } : speciesDefaults.speciesChoices,
    speciesSkillProficiencies: character ? [...character.speciesSkillProficiencies] : speciesDefaults.speciesSkillProficiencies,
    backgroundAbilityMode: existingBackgroundChoice?.mode ?? backgroundDefaults.backgroundAbilityMode,
    backgroundPlusTwo: existingBackgroundChoice?.mode === 'two-one' ? existingBackgroundChoice.plusTwo : backgroundDefaults.backgroundPlusTwo,
    backgroundPlusOne: existingBackgroundChoice?.mode === 'two-one' ? existingBackgroundChoice.plusOne : backgroundDefaults.backgroundPlusOne,
    backgroundToolChoice: character?.backgroundToolChoice ?? backgroundDefaults.backgroundToolChoice,
    backgroundEquipmentChoice: character?.backgroundEquipmentChoice ?? backgroundDefaults.backgroundEquipmentChoice,
    classEquipmentChoice: contentRegistry.findClass(startingClassId)?.startingEquipment[0]?.id ?? '',
    manualFeats: character?.manualFeats.map(cloneFeatSelection) ?? [],
    spellcastingSelections: character?.spellcastingSelections.map(cloneSpellcastingSelection) ?? [],
    abilityScores: ABILITY_KEYS.reduce((scores, ability) => { scores[ability] = character ? String(character.abilityScores[ability]) : ''; return scores; }, {} as Record<AbilityKey, string>),
  };
}

function seedClassStartingState(form: CharacterFormState) {
  const classContent = contentRegistry.findClass(form.startingClassId);
  const option = classContent?.startingEquipment.find((candidate) => candidate.id === form.classEquipmentChoice);
  const inventory: InventoryEntry[] = [];
  const currency = { ...EMPTY_CURRENCY };
  if (!classContent || !option) return { inventory, currency };
  if (option.currency) currency[option.currency.unit] += option.currency.amount;
  option.items.forEach((item, index) => {
    const quantity = item.quantity ?? 1;
    if (item.contentId) {
      const content = contentRegistry.getById(item.contentId);
      const category = content ? inventoryCategoryForContent(content) : undefined;
      if (!category) return;
      inventory.push({ id: `class:${classContent.id}:${item.contentId}`, kind: 'registry', contentId: item.contentId, category, quantity, equipped: false, notes: 'Starting equipment from Class.' });
      return;
    }
    inventory.push({ id: `class:${classContent.id}:${index}`, kind: 'custom', name: item.label, category: item.inventoryCategory ?? 'adventuring-gear', quantity, notes: 'Starting equipment from Class.' });
  });
  return { inventory, currency };
}

function seedBackgroundStartingState(form: CharacterFormState, inventory: InventoryEntry[], startingCurrency = EMPTY_CURRENCY) {
  const background = contentRegistry.findBackground(form.backgroundId);
  const option = background?.startingEquipment.find((candidate) => candidate.id === form.backgroundEquipmentChoice);
  const currency = { ...startingCurrency };
  if (!background || !option) return { inventory, currency };
  if (option.currency) currency[option.currency.unit] += option.currency.amount;
  const resolvedTool = background.toolProficiency.kind === 'fixed'
    ? background.toolProficiency
    : background.toolProficiency.options.find((candidate) => candidate.id === form.backgroundToolChoice);
  option.items.forEach((item, index) => {
    const quantity = item.quantity ?? 1;
    if (item.contentId) {
      const content = contentRegistry.getById(item.contentId);
      const category = content ? inventoryCategoryForContent(content) : undefined;
      if (!category) return;
      const existing = inventory.find((entry): entry is RegistryInventoryEntry => entry.kind === 'registry' && entry.contentId === item.contentId);
      if (existing) existing.quantity += quantity;
      else inventory.push({ id: `background:${background.id}:${item.contentId}`, kind: 'registry', contentId: item.contentId, category, quantity, equipped: false, notes: '' });
      return;
    }
    const name = item.selection?.kind === 'background-tool' && resolvedTool ? resolvedTool.name : item.label;
    const category = item.inventoryCategory ?? 'adventuring-gear';
    const existing = inventory.find((entry) => entry.kind === 'custom' && entry.name === name && entry.category === category);
    if (existing?.kind === 'custom') existing.quantity += quantity;
    else inventory.push({ id: `background:${background.id}:${index}`, kind: 'custom', name, category, quantity, notes: 'Starting equipment from Background.' });
  });
  return { inventory, currency };
}

function toCharacterInput(form: CharacterFormState, initialCharacter?: Character): CharacterInput {
  const abilityScores = ABILITY_KEYS.reduce((scores, ability) => { scores[ability] = Number(form.abilityScores[ability]); return scores; }, {} as AbilityScores);
  const backgroundAbilityChoice: BackgroundAbilityChoice = form.backgroundAbilityMode === 'three-ones'
    ? { mode: 'three-ones' }
    : { mode: 'two-one', plusTwo: form.backgroundPlusTwo, plusOne: form.backgroundPlusOne };
  const classSeed = initialCharacter ? undefined : seedClassStartingState(form);
  const seeded = initialCharacter
    ? { inventory: initialCharacter.inventory.map((entry) => ({ ...entry })), currency: { ...initialCharacter.currency } }
    : seedBackgroundStartingState(form, classSeed?.inventory ?? [], classSeed?.currency ?? EMPTY_CURRENCY);
  return {
    name: form.name,
    startingClassId: form.startingClassId,
    classProgressions: form.classProgressions.map(progressionDraftToInput),
    ...(form.speciesId ? { speciesId: form.speciesId } : {}),
    ...(form.backgroundId ? { backgroundId: form.backgroundId } : {}),
    ...(form.speciesSize ? { speciesSize: form.speciesSize } : {}),
    speciesChoices: { ...form.speciesChoices },
    speciesSkillProficiencies: [...form.speciesSkillProficiencies],
    ...(form.backgroundId ? { backgroundAbilityChoice, backgroundEquipmentChoice: form.backgroundEquipmentChoice } : {}),
    ...(form.backgroundToolChoice ? { backgroundToolChoice: form.backgroundToolChoice } : {}),
    manualFeats: form.manualFeats.map(cloneFeatSelection),
    spellcastingSelections: reconcileSpellcastingSelections(form.spellcastingSelections, form.classProgressions),
    abilityScores,
    inventory: seeded.inventory,
    currency: seeded.currency,
  };
}

function weaponProficiencyLabel(classId: ContentId): string {
  const classContent = contentRegistry.findClass(classId);
  if (!classContent) return 'None';
  return classContent.multiclassProficiencies.weaponProficiencies.map((rule) => (
    rule.kind === 'category' ? rule.category : `${rule.category} (${rule.anyOfProperties.join(' / ')})`
  )).join(', ') || 'None';
}

export function CharacterForm({ initialCharacter, submitLabel, onSubmit }: CharacterFormProps) {
  const classes = contentRegistry.getAll('class');
  const species = contentRegistry.getAll('species');
  const backgrounds = contentRegistry.getAll('background');
  const feats = contentRegistry.getAll('feat');
  const initialSingleProgression = initialCharacter?.classProgressions.length === 1 ? initialCharacter.classProgressions[0] : undefined;
  const [form, setForm] = useState<CharacterFormState>(() => createInitialState(initialCharacter));
  const [errors, setErrors] = useState<CharacterValidationErrors>({});
  const [featToAdd, setFeatToAdd] = useState<ContentId>(() => feats[0]?.id ?? '');
  const [classToAdd, setClassToAdd] = useState<ContentId>(() => classes.find((entry) => entry.id !== form.startingClassId)?.id ?? '');
  const speciesContent = contentRegistry.findSpecies(form.speciesId);
  const backgroundContent = contentRegistry.findBackground(form.backgroundId);
  const startingClassContent = contentRegistry.findClass(form.startingClassId);
  const totalLevel = totalDraftLevel(form.classProgressions);
  const activeSpellcastingProviders = activeEditorSpellcastingProviders(form.classProgressions);
  const legacySkillGap = Boolean(initialSingleProgression && initialSingleProgression.skillProficiencies.length === 0);
  const legacyOriginGap = Boolean(initialCharacter && (!initialCharacter.speciesId || !initialCharacter.backgroundId));
  const legacySubclassGap = Boolean(
    initialSingleProgression
    && !initialSingleProgression.subclassId
    && contentRegistry.findSubclassesForClass(initialSingleProgression.classId).some((subclass) => initialSingleProgression.level >= subclass.acquisitionLevel),
  );
  const availableClassesToAdd = classes.filter((entry) => !form.classProgressions.some((progression) => progression.classId === entry.id));

  function replaceProgressions(current: CharacterFormState, progressions: ClassProgressionDraft[], startingClassId = current.startingClassId): CharacterFormState {
    return {
      ...current,
      startingClassId,
      classProgressions: progressions,
      spellcastingSelections: reconcileSpellcastingSelections(current.spellcastingSelections, progressions),
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = toCharacterInput(form, initialCharacter);
    const inputStarting = input.classProgressions.find((progression) => progression.classId === input.startingClassId);
    const allowLegacyEmptySkills = Boolean(legacySkillGap && input.classProgressions.length === 1 && inputStarting?.skillProficiencies.length === 0);
    const allowIncompleteOrigin = legacyOriginGap && (!input.speciesId || !input.backgroundId);
    const allowIncompleteSubclass = Boolean(
      legacySubclassGap
      && input.classProgressions.length === 1
      && !inputStarting?.subclassId
      && inputStarting?.classId === initialSingleProgression?.classId,
    );
    const nextErrors = validateCharacterInput(input, { allowLegacyEmptySkills, allowIncompleteOrigin, allowIncompleteSubclass });
    setErrors(nextErrors);
    if (!hasValidationErrors(nextErrors)) onSubmit({ ...input, name: input.name.trim() });
  }

  function setSpellcastingSelectionValue(providerId: ContentId, field: 'cantripIds' | 'ownedSpellIds' | 'preparedSpellIds', spellId: ContentId, checked: boolean) {
    setForm((current) => {
      const existing = current.spellcastingSelections.find((selection) => selection.providerId === providerId)
        ?? { providerId, cantripIds: [], ownedSpellIds: [], preparedSpellIds: [] };
      const currentValues = existing[field];
      const values = checked
        ? (currentValues.includes(spellId) ? currentValues : [...currentValues, spellId])
        : currentValues.filter((candidate) => candidate !== spellId);
      const next: CharacterSpellcastingSelection = { ...existing, [field]: values };
      if (field === 'ownedSpellIds' && !checked) next.preparedSpellIds = next.preparedSpellIds.filter((candidate) => candidate !== spellId);
      return { ...current, spellcastingSelections: [...current.spellcastingSelections.filter((selection) => selection.providerId !== providerId), next] };
    });
  }

  function handleClassChange(index: number, classId: ContentId) {
    setForm((current) => {
      if (current.classProgressions.some((progression, candidateIndex) => candidateIndex !== index && progression.classId === classId)) return current;
      const previous = current.classProgressions[index];
      if (!previous) return current;
      const wasStarting = previous.classId === current.startingClassId;
      const updated = updateProgressionClass(previous, classId, wasStarting);
      const nextStartingClassId = wasStarting ? classId : current.startingClassId;
      const replaced = current.classProgressions.map((progression, candidateIndex) => candidateIndex === index ? updated : progression);
      const progressions = setDraftStartingClass(replaced, nextStartingClassId);
      const nextClass = contentRegistry.findClass(nextStartingClassId);
      return {
        ...replaceProgressions(current, progressions, nextStartingClassId),
        ...(wasStarting && !initialCharacter ? { classEquipmentChoice: nextClass?.startingEquipment[0]?.id ?? '' } : {}),
      };
    });
  }

  function handleLevelChange(index: number, level: number) {
    setForm((current) => {
      const progression = current.classProgressions[index];
      if (!progression) return current;
      const starting = progression.classId === current.startingClassId;
      const progressions = current.classProgressions.map((candidate, candidateIndex) => (
        candidateIndex === index ? updateProgressionLevel(candidate, level, starting) : candidate
      ));
      return replaceProgressions(current, progressions);
    });
  }

  function handleSubclassChange(index: number, subclassId: ContentId) {
    setForm((current) => {
      const progressions = current.classProgressions.map((progression, candidateIndex) => (
        candidateIndex === index ? { ...progression, subclassId } : progression
      ));
      return replaceProgressions(current, progressions);
    });
  }

  function toggleProgressionSkill(index: number, skill: SkillId, checked: boolean) {
    setForm((current) => {
      const progressions = current.classProgressions.map((progression, candidateIndex) => candidateIndex !== index ? progression : {
        ...progression,
        skillProficiencies: checked
          ? [...progression.skillProficiencies, skill]
          : progression.skillProficiencies.filter((candidate) => candidate !== skill),
      });
      return { ...current, classProgressions: progressions };
    });
  }

  function handleHpMethod(index: number, entryLevel: number, method: 'fixed' | 'rolled') {
    setForm((current) => ({
      ...current,
      classProgressions: current.classProgressions.map((progression, candidateIndex) => candidateIndex !== index ? progression : {
        ...progression,
        hpProgression: progression.hpProgression.map((entry) => entry.level === entryLevel
          ? { ...entry, method, roll: method === 'fixed' ? '' : entry.roll }
          : entry),
      }),
    }));
  }

  function handleHpRoll(index: number, entryLevel: number, roll: string) {
    setForm((current) => ({
      ...current,
      classProgressions: current.classProgressions.map((progression, candidateIndex) => candidateIndex !== index ? progression : {
        ...progression,
        hpProgression: progression.hpProgression.map((entry) => entry.level === entryLevel ? { ...entry, roll } : entry),
      }),
    }));
  }

  function makeStartingClass(classId: ContentId) {
    setForm((current) => {
      if (!current.classProgressions.some((progression) => progression.classId === classId)) return current;
      const progressions = setDraftStartingClass(current.classProgressions, classId);
      const classContent = contentRegistry.findClass(classId);
      return {
        ...replaceProgressions(current, progressions, classId),
        ...(!initialCharacter ? { classEquipmentChoice: classContent?.startingEquipment[0]?.id ?? '' } : {}),
      };
    });
  }

  function addClass() {
    if (!canAddClass(form.classProgressions, classToAdd)) return;
    setForm((current) => {
      if (!canAddClass(current.classProgressions, classToAdd)) return current;
      return replaceProgressions(current, [...current.classProgressions, createProgressionDraft(classToAdd, false)]);
    });
    const remaining = availableClassesToAdd.find((entry) => entry.id !== classToAdd);
    setClassToAdd(remaining?.id ?? '');
  }

  function removeClass(classId: ContentId) {
    setForm((current) => {
      if (!canRemoveClass(current.classProgressions, classId, current.startingClassId)) return current;
      const progressions = current.classProgressions.filter((progression) => progression.classId !== classId);
      return replaceProgressions(current, progressions);
    });
  }

  function addManualFeat() {
    if (!featToAdd) return;
    setForm((current) => ({ ...current, manualFeats: [...current.manualFeats, initialFeatSelection(featToAdd)] }));
  }
  function removeManualFeat(index: number) {
    setForm((current) => ({ ...current, manualFeats: current.manualFeats.filter((_, candidateIndex) => candidateIndex !== index) }));
  }
  function updateManualFeatChoice(selectionIndex: number, choiceId: string, choiceIndex: number, value: string) {
    setForm((current) => ({
      ...current,
      manualFeats: current.manualFeats.map((selection, index) => {
        if (index !== selectionIndex) return selection;
        const values = [...(selection.choices[choiceId] ?? [])];
        values[choiceIndex] = value;
        return { ...selection, choices: { ...selection.choices, [choiceId]: values } };
      }),
    }));
  }

  return <form className="character-form" onSubmit={handleSubmit} noValidate>
    {hasValidationErrors(errors) && <div className="form-alert" role="alert">Check the highlighted fields before saving the character.</div>}

    <section className="form-section panel">
      <div className="section-heading"><span className="eyebrow">Identity</span><h2>Who are you building?</h2></div>
      <label className="field field--wide" htmlFor="character-name"><span>Character Name</span><input id="character-name" name="name" type="text" autoComplete="off" value={form.name} aria-invalid={Boolean(errors.name)} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />{errors.name && <small className="field-error">{errors.name}</small>}</label>
    </section>

    <section className="form-section panel">
      <div className="section-heading"><span className="eyebrow">Foundation</span><h2>Species and Background</h2></div>
      {legacyOriginGap && (!form.speciesId || !form.backgroundId) && <div className="legacy-note">This migrated character predates Species and Background selection. You may keep the unresolved origin while editing other fields, or complete it now.</div>}
      <div className="field-grid field-grid--two">
        <label className="field" htmlFor="character-species"><span>Species</span><select id="character-species" value={form.speciesId} onChange={(event) => { const speciesId = event.target.value; const defaults = initialSpeciesChoices(speciesId); setForm((current) => ({ ...current, speciesId, ...defaults })); }}>{legacyOriginGap && <option value="">Unselected (legacy)</option>}{species.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>{errors.speciesId && <small className="field-error">{errors.speciesId}</small>}</label>
        <label className="field" htmlFor="character-background"><span>Background</span><select id="character-background" value={form.backgroundId} onChange={(event) => { const backgroundId = event.target.value; const defaults = initialBackgroundChoices(backgroundId); setForm((current) => ({ ...current, backgroundId, ...defaults })); }}>{legacyOriginGap && <option value="">Unselected (legacy)</option>}{backgrounds.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>{errors.backgroundId && <small className="field-error">{errors.backgroundId}</small>}</label>
      </div>
      {speciesContent && <div className="origin-choice-block">
        <h3>Species Choices</h3>
        {speciesContent.size.kind === 'choice' && <label className="field" htmlFor="species-size"><span>Size</span><select id="species-size" value={form.speciesSize} onChange={(event) => setForm((current) => ({ ...current, speciesSize: event.target.value as 'small' | 'medium' }))}>{speciesContent.size.options.map((size) => <option key={size} value={size}>{size[0].toUpperCase() + size.slice(1)}</option>)}</select></label>}
        {speciesContent.choices.map((choice) => <label className="field" htmlFor={`species-choice-${choice.id}`} key={choice.id}><span>{choice.name}</span><select id={`species-choice-${choice.id}`} value={form.speciesChoices[choice.id] ?? ''} onChange={(event) => setForm((current) => ({ ...current, speciesChoices: { ...current.speciesChoices, [choice.id]: event.target.value } }))}>{choice.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>)}
        {speciesContent.skillProficiencyChoice && <label className="field" htmlFor="species-skill-choice"><span>Species Skill Proficiency</span><select id="species-skill-choice" value={form.speciesSkillProficiencies[0] ?? ''} onChange={(event) => setForm((current) => ({ ...current, speciesSkillProficiencies: [event.target.value as SkillId] }))}>{speciesContent.skillProficiencyChoice.from.map((skill) => <option key={skill} value={skill}>{SKILL_DEFINITIONS[skill].name}</option>)}</select></label>}
        {(errors.speciesChoices || errors.speciesSkillProficiencies || errors.speciesSize) && <small className="field-error section-error">{errors.speciesChoices ?? errors.speciesSkillProficiencies ?? errors.speciesSize}</small>}
      </div>}
      {backgroundContent && <div className="origin-choice-block"><h3>Background Choices</h3><p className="field-hint">Origin Feat: <strong>{backgroundContent.originFeat.name}{backgroundContent.originFeat.variant ? ` (${backgroundContent.originFeat.variant})` : ''}</strong>. Resolved through the Feat registry from this Background; it is not stored in manual Feats.</p><label className="field" htmlFor="background-ability-mode"><span>Ability Score Increases</span><select id="background-ability-mode" value={form.backgroundAbilityMode} onChange={(event) => setForm((current) => ({ ...current, backgroundAbilityMode: event.target.value as BackgroundAbilityChoice['mode'] }))}><option value="two-one">+2 to one, +1 to another</option><option value="three-ones">+1 to all three</option></select></label>{form.backgroundAbilityMode === 'two-one' && <div className="field-grid field-grid--two"><label className="field" htmlFor="background-plus-two"><span>+2 Ability</span><select id="background-plus-two" value={form.backgroundPlusTwo} onChange={(event) => setForm((current) => ({ ...current, backgroundPlusTwo: event.target.value as AbilityKey }))}>{backgroundContent.abilityScores.map((ability) => <option key={ability} value={ability}>{ABILITY_LABELS[ability]}</option>)}</select></label><label className="field" htmlFor="background-plus-one"><span>+1 Ability</span><select id="background-plus-one" value={form.backgroundPlusOne} onChange={(event) => setForm((current) => ({ ...current, backgroundPlusOne: event.target.value as AbilityKey }))}>{backgroundContent.abilityScores.map((ability) => <option key={ability} value={ability}>{ABILITY_LABELS[ability]}</option>)}</select></label></div>}{backgroundContent.toolProficiency.kind === 'choice' && <label className="field" htmlFor="background-tool"><span>{backgroundContent.toolProficiency.category} proficiency</span><select id="background-tool" value={form.backgroundToolChoice} onChange={(event) => setForm((current) => ({ ...current, backgroundToolChoice: event.target.value }))}>{backgroundContent.toolProficiency.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>}<label className="field" htmlFor="background-equipment"><span>Starting Equipment</span><select id="background-equipment" value={form.backgroundEquipmentChoice} onChange={(event) => setForm((current) => ({ ...current, backgroundEquipmentChoice: event.target.value }))}>{backgroundContent.startingEquipment.map((option) => <option key={option.id} value={option.id}>Option {option.id}{option.currency ? ` · ${option.currency.amount} ${option.currency.unit.toUpperCase()}` : ''}</option>)}</select></label>{initialCharacter && <p className="field-hint">Changing Background does not rewrite existing Inventory; starting equipment is seeded only when a new character is created.</p>}{(errors.backgroundAbilityChoice || errors.backgroundToolChoice || errors.backgroundEquipmentChoice) && <small className="field-error section-error">{errors.backgroundAbilityChoice ?? errors.backgroundToolChoice ?? errors.backgroundEquipmentChoice}</small>}</div>}
    </section>

    <section className="form-section panel" aria-labelledby="classes-heading">
      <div className="section-heading section-heading--split"><div><span className="eyebrow">Classes</span><h2 id="classes-heading">Class progressions</h2><p>Edit the Character’s current class structure directly. This is not a Level Up workflow.</p></div><p><strong>Character Level:</strong> {totalLevel}</p></div>
      <div className="feat-editor__list">
        {form.classProgressions.map((progression, index) => {
          const classContent = contentRegistry.findClass(progression.classId);
          const isStarting = progression.classId === form.startingClassId;
          const level = Number(progression.level);
          const allSubclasses = contentRegistry.findSubclassesForClass(progression.classId);
          const eligibleSubclasses = allSubclasses.filter((subclass) => level >= subclass.acquisitionLevel);
          const nextSubclassLevel = allSubclasses.length ? Math.min(...allSubclasses.map((subclass) => subclass.acquisitionLevel)) : undefined;
          const skillContext = classContent ? classProgressionSkillChoiceContext(classContent, isStarting) : { choose: 0, from: [] as readonly SkillId[], kind: isStarting ? 'starting' as const : 'multiclass' as const };
          const representedElsewhere = new Set(form.classProgressions.filter((_, candidateIndex) => candidateIndex !== index).map((candidate) => candidate.classId));
          const legacySubclass = Boolean(legacySubclassGap && initialSingleProgression?.classId === progression.classId);
          return <article className="feat-editor__card" key={`${progression.classId}:${index}`}>
            <div className="feat-editor__header">
              <div><span className="eyebrow">{isStarting ? 'Starting Class' : 'Added Class'}</span><h3>{classContent?.name ?? progression.classId}</h3></div>
              <div className="form-actions">
                {!isStarting && <button className="button button--secondary" type="button" onClick={() => makeStartingClass(progression.classId)}>Make Starting Class</button>}
                <button className="button button--danger" type="button" disabled={!canRemoveClass(form.classProgressions, progression.classId, form.startingClassId)} onClick={() => removeClass(progression.classId)}>Remove Class</button>
              </div>
            </div>
            {isStarting && form.classProgressions.length > 1 && <p className="field-hint">Starting Class is explicit; array/card order does not change saving throws or first-level HP semantics. Choose another card as Starting Class before removing this one.</p>}
            <div className="field-grid field-grid--two">
              <label className="field" htmlFor={`character-class-${index}`}><span>{isStarting ? 'Class' : 'Added Class'}</span><select id={`character-class-${index}`} value={progression.classId} onChange={(event) => handleClassChange(index, event.target.value)}>{classes.filter((entry) => entry.id === progression.classId || !representedElsewhere.has(entry.id)).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
              <label className="field" htmlFor={`character-level-${index}`}><span>{isStarting ? 'Level' : `${classContent?.name ?? 'Added Class'} Level`}</span><select id={`character-level-${index}`} value={progression.level} onChange={(event) => handleLevelChange(index, Number(event.target.value))}>{Array.from({ length: MAX_CHARACTER_LEVEL }, (_, levelIndex) => levelIndex + MIN_CHARACTER_LEVEL).map((candidateLevel) => <option key={candidateLevel} value={candidateLevel}>Level {candidateLevel}</option>)}</select></label>
              <label className="field" htmlFor={`character-subclass-${index}`}><span>{isStarting ? 'Subclass' : `${classContent?.name ?? 'Added Class'} Subclass`}</span><select id={`character-subclass-${index}`} value={progression.subclassId} disabled={eligibleSubclasses.length === 0} onChange={(event) => handleSubclassChange(index, event.target.value)}>{legacySubclass && !initialSingleProgression?.subclassId && <option value="">Unselected (legacy)</option>}{!legacySubclass && <option value="">Choose a subclass</option>}{eligibleSubclasses.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>{eligibleSubclasses.length === 0 && <small className="field-hint">{nextSubclassLevel ? `Subclass selection becomes available at ${classContent?.name ?? 'class'} level ${nextSubclassLevel}.` : 'No subclasses are available for this class.'}</small>}</label>
            </div>
            {legacySubclass && !progression.subclassId && <div className="legacy-note">This migrated character predates subclass selection. You may keep the unresolved subclass while making unrelated edits, or choose an eligible subclass now.</div>}
            {classContent && <div className="origin-choice-block">
              <h3>{isStarting ? 'Starting-class proficiencies' : 'Multiclass proficiency package'}</h3>
              {isStarting ? <p className="field-hint">Saving throws: {classContent.savingThrowProficiencies.map((ability) => ABILITY_LABELS[ability]).join(', ')}. Full armor, weapon, tool, and skill choices come from this starting class.</p> : <>
                <p className="field-hint">Armor: {classContent.multiclassProficiencies.armorTraining.join(', ') || 'None'} · Weapons: {weaponProficiencyLabel(classContent.id)} · Fixed tools: {classContent.multiclassProficiencies.toolProficiencies.map((tool) => tool.name).join(', ') || 'None'}.</p>
                {(classContent.multiclassProficiencies.toolChoices ?? []).map((choice) => <p className="field-hint" key={choice.id}><strong>{choice.name}:</strong> choose {choice.choose}. Character v9 has no persisted multiclass tool-choice field, so this content remains reference-only rather than being guessed.</p>)}
              </>}
              <h3>{skillContext.kind === 'starting' ? `Choose ${skillContext.choose} ${classContent.name} class skills` : skillContext.choose > 0 ? `Choose ${skillContext.choose} ${classContent.name} multiclass skill${skillContext.choose === 1 ? '' : 's'}` : 'No added-class skill choice'}</h3>
              {legacySkillGap && isStarting && progression.skillProficiencies.length === 0 && <div className="legacy-note">This migrated character predates skill selection. You may keep it unchanged or choose the normal class skills now.</div>}
              {skillContext.from.length > 0 ? <div className="choice-grid">{skillContext.from.map((skillId) => { const checked = progression.skillProficiencies.includes(skillId); return <label className="choice-card" key={skillId}><input type="checkbox" checked={checked} disabled={!checked && progression.skillProficiencies.length >= skillContext.choose} onChange={(event) => toggleProgressionSkill(index, skillId, event.target.checked)} /><span>{SKILL_DEFINITIONS[skillId].name}</span></label>; })}</div> : <p className="field-hint">This added class grants no selectable skill proficiency under its multiclass contract.</p>}
            </div>}
            <div className="origin-choice-block">
              <h3>{classContent?.name ?? 'Class'} HP progression</h3>
              <p className="field-hint">{isStarting ? 'Character level 1 uses this starting class’s Hit Die maximum. Recorded entries begin at class level 2.' : 'This is an added class, so class level 1 is a recorded fixed/rolled HP entry; it does not receive another first-Character-level maximum.'}</p>
              {progression.hpProgression.length === 0 ? <p className="field-hint">No recorded HP entries are required at this class level.</p> : <div className="hp-progression-grid">{progression.hpProgression.map((entry) => <div className="hp-progression-row" key={entry.level}><strong>Class Level {entry.level}</strong><label className="field" htmlFor={`hp-method-${index}-${entry.level}`}><span>Method</span><select id={`hp-method-${index}-${entry.level}`} value={entry.method} onChange={(event) => handleHpMethod(index, entry.level, event.target.value as 'fixed' | 'rolled')}><option value="fixed">Fixed ({classContent?.fixedHitPointsPerLevel ?? '—'})</option><option value="rolled">Rolled</option></select></label>{entry.method === 'rolled' ? <label className="field" htmlFor={`hp-roll-${index}-${entry.level}`}><span>d{classContent?.hitDie ?? '?'} result</span><input id={`hp-roll-${index}-${entry.level}`} type="number" min="1" max={classContent?.hitDie} value={entry.roll} onChange={(event) => handleHpRoll(index, entry.level, event.target.value)} /></label> : <span className="hp-progression-fixed">{classContent?.fixedHitPointsPerLevel ?? '—'} + CON modifier</span>}</div>)}</div>}
            </div>
          </article>;
        })}
      </div>
      {availableClassesToAdd.length > 0 && <div className="feat-editor__add">
        <label className="field" htmlFor="multiclass-add"><span>Class to add</span><select id="multiclass-add" value={classToAdd} onChange={(event) => setClassToAdd(event.target.value)}>{availableClassesToAdd.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
        <button className="button button--secondary" type="button" onClick={addClass} disabled={!canAddClass(form.classProgressions, classToAdd)}>+ Add Class</button>
      </div>}
      {[errors.startingClassId, errors.classId, errors.classProgressions, errors.level, errors.subclassId, errors.skillProficiencies, errors.hpProgression]
        .filter((message): message is string => Boolean(message))
        .filter((message, index, messages) => messages.indexOf(message) === index)
        .map((message) => <small className="field-error section-error" key={message}>{message}</small>)}
    </section>

    <section className="form-section panel"><div className="section-heading section-heading--split"><div><span className="eyebrow">Ability Scores</span><h2>Enter base scores</h2></div><p>Background increases are applied by the Rules Engine. Enter whole-number scores from {MIN_ABILITY_SCORE} to {MAX_ABILITY_SCORE}.</p></div><div className="ability-input-grid">{ABILITY_KEYS.map((ability) => <label className="field ability-field" htmlFor={`ability-${ability}`} key={ability}><span>{ABILITY_LABELS[ability]}</span><input id={`ability-${ability}`} type="number" min={MIN_ABILITY_SCORE} max={MAX_ABILITY_SCORE} step="1" value={form.abilityScores[ability]} onChange={(event) => setForm((current) => ({ ...current, abilityScores: { ...current.abilityScores, [ability]: event.target.value } }))} />{errors[ability] && <small className="field-error">{errors[ability]}</small>}</label>)}</div></section>

    {initialCharacter && <section className="form-section panel feat-editor" aria-labelledby="manual-feats-heading">
      <div className="section-heading"><span className="eyebrow">Feats</span><h2 id="manual-feats-heading">Manual Feat Ownership</h2><p>Background Origin Feats are derived from the selected Background and are not stored here. This editor is only for separately acquired Feats; it is not a Level Up workflow.</p></div>
      <div className="feat-editor__add"><label className="field" htmlFor="manual-feat-add"><span>Feat to add</span><select id="manual-feat-add" value={featToAdd} onChange={(event) => setFeatToAdd(event.target.value)}>{feats.map((feat) => <option key={feat.id} value={feat.id}>{feat.name} · {feat.category}</option>)}</select></label><button className="button button--secondary" type="button" onClick={addManualFeat}>Add Feat</button></div>
      {form.manualFeats.length === 0 ? <p className="field-hint">No separately acquired Feats are stored on this character.</p> : <div className="feat-editor__list">{form.manualFeats.map((selection, selectionIndex) => {
        const feat = contentRegistry.findFeat(selection.featId);
        if (!feat) return <article className="feat-editor__card" key={`${selection.featId}-${selectionIndex}`}><div className="feat-editor__header"><div><span className="eyebrow">Unresolved</span><h3>{selection.featId}</h3></div><button className="button button--danger" type="button" onClick={() => removeManualFeat(selectionIndex)}>Remove</button></div></article>;
        const abilityEffects = feat.effects.filter((effect) => effect.type === 'ability-score-increase');
        const referenceChoices = feat.choices.filter((choice) => choice.support === 'reference-only');
        return <article className="feat-editor__card" key={`${selection.featId}-${selectionIndex}`}><div className="feat-editor__header"><div><span className="eyebrow">{feat.category}</span><h3>{feat.name}</h3></div><button className="button button--danger" type="button" onClick={() => removeManualFeat(selectionIndex)}>Remove</button></div><p className="field-hint"><strong>Prerequisites:</strong> {formatFeatPrerequisite(feat.id)}</p>{feat.repeatabilityNote && <p className="field-hint"><strong>Repeatability:</strong> {feat.repeatabilityNote}</p>}{abilityEffects.map((effect) => <div className="field-grid field-grid--two" key={effect.choiceId}>{Array.from({ length: effect.selections }, (_, choiceIndex) => <label className="field" htmlFor={`manual-feat-${selectionIndex}-${effect.choiceId}-${choiceIndex}`} key={choiceIndex}><span>{effect.selections === 1 ? 'Ability Score Increase' : `Ability Score Increase ${choiceIndex + 1}`}</span><select id={`manual-feat-${selectionIndex}-${effect.choiceId}-${choiceIndex}`} value={selection.choices[effect.choiceId]?.[choiceIndex] ?? effect.allowedAbilities[0]} onChange={(event) => updateManualFeatChoice(selectionIndex, effect.choiceId, choiceIndex, event.target.value)}>{effect.allowedAbilities.map((ability) => <option key={ability} value={ability}>{ABILITY_LABELS[ability]}</option>)}</select></label>)}</div>)}{referenceChoices.map((choice) => <p className="field-hint" key={choice.id}><strong>{choice.name}:</strong> {choice.description} This choice is reference-only in Milestone 8 and is not guessed here.</p>)}</article>;
      })}</div>}
      {errors.manualFeats && <small className="field-error section-error">{errors.manualFeats}</small>}
    </section>}

    {activeSpellcastingProviders.length > 0 && <section className="form-section panel" aria-labelledby="owned-spellcasting-heading">
      <div className="section-heading"><span className="eyebrow">Spellcasting</span><h2 id="owned-spellcasting-heading">Persistent spell selections</h2><p>Selections are stored under stable provider IDs. Cantrips, owned spells, and prepared spells never merge across providers.</p></div>
      <div className="feat-editor__list">{activeSpellcastingProviders.map((context) => {
        const provider = context.provider;
        const management = provider.spellManagement;
        const selection = form.spellcastingSelections.find((candidate) => candidate.providerId === provider.id) ?? { providerId: provider.id, cantripIds: [], ownedSpellIds: [], preparedSpellIds: [] };
        const grantedIds = new Set<ContentId>([
          ...context.grantedSpellIds,
          ...(management.kind === 'granted-only' ? management.spellIds : []),
        ]);
        const grantedSpells = [...grantedIds].flatMap((id) => { const spell = contentRegistry.findSpell(id); return spell ? [spell] : []; }).sort((left, right) => left.level - right.level || left.name.localeCompare(right.name));
        const unresolvedIds = [...new Set([...selection.cantripIds, ...selection.ownedSpellIds, ...selection.preparedSpellIds].filter((spellId) => !contentRegistry.findSpell(spellId)))];
        if (management.kind === 'granted-only') return <article className="feat-editor__card" key={provider.id}><div className="feat-editor__header"><div><span className="eyebrow">{context.subclassName ? `${context.className} · ${context.subclassName}` : context.className}</span><h3>{provider.name}</h3></div><span className="source-badge">Owner level {context.ownerLevel}</span></div><p className="field-hint">This provider is granted-only and stores no manual spell selections.</p>{grantedSpells.length > 0 && <p className="field-hint"><strong>Granted spells:</strong> {grantedSpells.map((spell) => spell.name).join(', ')}. These do not consume manual capacity or get duplicated into persisted selections.</p>}</article>;

        const cantripLimit = spellcastingCountAtLevel(management.cantripCount, context.ownerLevel);
        const preparedLimit = spellcastingCountAtLevel(management.preparedSpellCount, context.ownerLevel);
        const maximumSpellLevel = maximumSelectableSpellLevel(provider, context.ownerLevel);
        const catalog = contentRegistry.getAll('spell').filter((spell) => spellBelongsToProviderList(spell, management.spellListId));
        const cantrips = catalog.filter((spell) => spell.level === 0 && !grantedIds.has(spell.id)).sort((left, right) => left.name.localeCompare(right.name));
        const leveledCandidates = catalog.filter((spell) => spell.level > 0 && spell.level <= maximumSpellLevel && !grantedIds.has(spell.id)).sort((left, right) => left.level - right.level || left.name.localeCompare(right.name));
        const preparedCandidates = management.kind === 'prepared-from-owned'
          ? leveledCandidates.filter((spell) => selection.ownedSpellIds.includes(spell.id))
          : leveledCandidates;
        return <article className="feat-editor__card" key={provider.id}>
          <div className="feat-editor__header"><div><span className="eyebrow">{context.subclassName ? `${context.className} · ${context.subclassName}` : context.className}</span><h3>{provider.name}</h3></div><span className="source-badge">Owner level {context.ownerLevel}</span></div>
          {management.kind === 'prepared-from-owned'
            ? <p className="field-hint">Choose exactly {cantripLimit} cantrips. Keep at least {management.initialOwnedSpellCount} level {management.initialOwnedSpellLevel} starting spells in this provider’s owned collection. Prepare up to {preparedLimit} eligible owned leveled spells. Additional owned spells may be recorded without fabricating Level Up history.</p>
            : <p className="field-hint">Choose exactly {cantripLimit} cantrips when storing selections for this provider and prepare up to {preparedLimit} eligible spells from its own list at owner level {context.ownerLevel}.</p>}
          {grantedSpells.length > 0 && <p className="field-hint"><strong>Always prepared / granted:</strong> {grantedSpells.map((spell) => spell.name).join(', ')}. These remain provider-associated and do not consume manual capacity.</p>}
          {unresolvedIds.length > 0 && <p className="legacy-note">Unresolved stored spell IDs remain non-mechanical until their content returns or you remove them: {unresolvedIds.join(', ')}</p>}
          <div className="origin-choice-block"><h3>Cantrips · {selection.cantripIds.length}/{cantripLimit}</h3><div className="choice-grid">{cantrips.map((spell) => { const checked = selection.cantripIds.includes(spell.id); return <label className="choice-card" key={spell.id}><input type="checkbox" checked={checked} disabled={!checked && selection.cantripIds.length >= cantripLimit} onChange={(event) => setSpellcastingSelectionValue(provider.id, 'cantripIds', spell.id, event.target.checked)} /><span>{spell.name}</span></label>; })}</div></div>
          {management.kind === 'prepared-from-owned' && <div className="origin-choice-block"><h3>Owned leveled spells · {selection.ownedSpellIds.length} stored</h3><p className="field-hint">Eligible catalog at this provider level: spell levels 1–{maximumSpellLevel}. The editor does not invent historical spell gains.</p><div className="choice-grid">{leveledCandidates.map((spell) => <label className="choice-card" key={spell.id}><input type="checkbox" checked={selection.ownedSpellIds.includes(spell.id)} onChange={(event) => setSpellcastingSelectionValue(provider.id, 'ownedSpellIds', spell.id, event.target.checked)} /><span>Level {spell.level} · {spell.name} · {spell.school}{spell.ritual ? ' · Ritual' : ''}</span></label>)}</div></div>}
          <div className="origin-choice-block"><h3>Prepared leveled spells · {selection.preparedSpellIds.length}/{preparedLimit}</h3>{preparedCandidates.length === 0 ? <p className="field-hint">{management.kind === 'prepared-from-owned' ? 'Add eligible leveled spells to this provider’s owned collection before preparing them.' : 'No eligible leveled spells are available for this provider at its owner level.'}</p> : <div className="choice-grid">{preparedCandidates.map((spell) => { const checked = selection.preparedSpellIds.includes(spell.id); return <label className="choice-card" key={spell.id}><input type="checkbox" checked={checked} disabled={!checked && selection.preparedSpellIds.length >= preparedLimit} onChange={(event) => setSpellcastingSelectionValue(provider.id, 'preparedSpellIds', spell.id, event.target.checked)} /><span>Level {spell.level} · {spell.name}</span></label>; })}</div>}</div>
          {provider.ritualCasting === 'owned' && <p className="field-hint">Ritual eligibility comes from this provider’s owned spell content rather than its prepared set. Ritual execution remains manual/reference-only.</p>}
        </article>;
      })}</div>
      {errors.spellcastingSelections && <small className="field-error section-error">{errors.spellcastingSelections}</small>}
    </section>}

    {!initialCharacter ? <section className="form-section panel"><div className="section-heading"><span className="eyebrow">Starting Equipment</span><h2>Choose the Starting Class package</h2><p>Only the explicit Starting Class and Background seed Inventory/currency at creation. Added classes never reseed equipment.</p></div><label className="field" htmlFor="class-equipment"><span>{startingClassContent?.name ?? 'Class'} Starting Equipment</span><select id="class-equipment" value={form.classEquipmentChoice} onChange={(event) => setForm((current) => ({ ...current, classEquipmentChoice: event.target.value }))}>{(startingClassContent?.startingEquipment ?? []).map((option) => <option key={option.id} value={option.id}>Option {option.id}{option.currency ? ` · ${option.currency.amount} ${option.currency.unit.toUpperCase()}` : ''}</option>)}</select></label>{errors.inventory && <small className="field-error section-error">{errors.inventory}</small>}</section> : <section className="form-section panel"><div className="section-heading"><span className="eyebrow">Equipment</span><h2>Managed in Inventory</h2><p>Changing class progressions does not rewrite existing Inventory. Use the Character Inventory page to change ownership, notes, quantities, and equipped state.</p></div></section>}

    <div className="form-actions"><button className="button button--primary" type="submit">{submitLabel}</button></div>
  </form>;
}
