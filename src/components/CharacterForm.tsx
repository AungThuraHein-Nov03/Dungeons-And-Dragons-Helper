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
  type HpProgressionEntry,
  type InventoryEntry,
  type RegistryInventoryEntry,
  type SkillId,
} from '../models/character';
import type { SpellcastingProviderDefinition } from '../models/content';
import type { ContentId } from '../models/contentId';
import { inventoryCategoryForContent } from '../rules/inventory';
import { SKILL_DEFINITIONS } from '../rules/skills';
import { spellcastingProviderDefinitionsAtLevel } from '../rules/spellcasting';
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

const ABILITY_LABELS: Record<AbilityKey, string> = {
  strength: 'Strength', dexterity: 'Dexterity', constitution: 'Constitution', intelligence: 'Intelligence', wisdom: 'Wisdom', charisma: 'Charisma',
};
const CLASSES = contentRegistry.getAll('class');
const SPECIES = contentRegistry.getAll('species');
const BACKGROUNDS = contentRegistry.getAll('background');
const FEATS = contentRegistry.getAll('feat');

interface HpProgressionFormEntry { level: number; method: 'fixed' | 'rolled'; roll: string; }
interface CharacterFormState {
  name: string;
  speciesId: ContentId;
  backgroundId: ContentId;
  classId: ContentId;
  subclassId: ContentId;
  level: string;
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
  skillProficiencies: SkillId[];
  hpProgression: HpProgressionFormEntry[];
}
interface CharacterFormProps { initialCharacter?: Character; submitLabel: string; onSubmit: (input: CharacterInput) => void; }

function normalizeHpProgression(entries: readonly HpProgressionFormEntry[], level: number): HpProgressionFormEntry[] {
  return Array.from({ length: Math.max(0, level - 1) }, (_, index) => { const entryLevel = index + 2; return entries.find((entry) => entry.level === entryLevel) ?? { level: entryLevel, method: 'fixed', roll: '' }; });
}

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

function countAtLevel(values: readonly { readonly level: number; readonly count: number }[], level: number): number {
  return [...values].filter((row) => row.level <= level).sort((a, b) => b.level - a.level)[0]?.count ?? 0;
}

function maximumSpellLevelAtLevel(provider: SpellcastingProviderDefinition, level: number): number {
  const row = [...(provider.slotPool?.progression ?? [])].filter((candidate) => candidate.level <= level).sort((a, b) => b.level - a.level)[0];
  return Math.max(0, ...(row?.slots.filter((slot) => slot.maximum > 0).map((slot) => slot.spellLevel) ?? []));
}

function ownedSpellcastingProviders(classId: ContentId, subclassId: ContentId, level: number) {
  const classContent = contentRegistry.findClass(classId);
  const subclassContent = subclassId ? contentRegistry.findSubclass(subclassId) : undefined;
  return spellcastingProviderDefinitionsAtLevel(classContent, subclassContent, level).filter((provider) => provider.spellManagement.kind === 'prepared-from-owned');
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
  const speciesId = character?.speciesId ?? (character ? '' : SPECIES[0]?.id ?? '');
  const backgroundId = character?.backgroundId ?? (character ? '' : BACKGROUNDS[0]?.id ?? '');
  const classId = character?.classId ?? CLASSES[0]?.id ?? '';
  const speciesDefaults = initialSpeciesChoices(speciesId);
  const backgroundDefaults = initialBackgroundChoices(backgroundId);
  const existingBackgroundChoice = character?.backgroundAbilityChoice;
  return {
    name: character?.name ?? '', speciesId, backgroundId, classId, subclassId: character?.subclassId ?? '', level: character ? String(character.level) : '1',
    speciesSize: character?.speciesSize ?? speciesDefaults.speciesSize,
    speciesChoices: character ? { ...character.speciesChoices } : speciesDefaults.speciesChoices,
    speciesSkillProficiencies: character ? [...character.speciesSkillProficiencies] : speciesDefaults.speciesSkillProficiencies,
    backgroundAbilityMode: existingBackgroundChoice?.mode ?? backgroundDefaults.backgroundAbilityMode,
    backgroundPlusTwo: existingBackgroundChoice?.mode === 'two-one' ? existingBackgroundChoice.plusTwo : backgroundDefaults.backgroundPlusTwo,
    backgroundPlusOne: existingBackgroundChoice?.mode === 'two-one' ? existingBackgroundChoice.plusOne : backgroundDefaults.backgroundPlusOne,
    backgroundToolChoice: character?.backgroundToolChoice ?? backgroundDefaults.backgroundToolChoice,
    backgroundEquipmentChoice: character?.backgroundEquipmentChoice ?? backgroundDefaults.backgroundEquipmentChoice,
    classEquipmentChoice: contentRegistry.findClass(classId)?.startingEquipment[0]?.id ?? '',
    manualFeats: character?.manualFeats.map(cloneFeatSelection) ?? [],
    spellcastingSelections: character?.spellcastingSelections.map(cloneSpellcastingSelection) ?? [],
    abilityScores: ABILITY_KEYS.reduce((scores, ability) => { scores[ability] = character ? String(character.abilityScores[ability]) : ''; return scores; }, {} as Record<AbilityKey, string>),
    skillProficiencies: [...(character?.skillProficiencies ?? [])],
    hpProgression: character?.hpProgression.map((entry) => ({ level: entry.level, method: entry.method, roll: entry.method === 'rolled' ? String(entry.roll) : '' })) ?? [],
  };
}

function seedClassStartingState(form: CharacterFormState) {
  const classContent = contentRegistry.findClass(form.classId);
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
  const level = Number(form.level);
  const activeOwnedProviderIds = new Set(ownedSpellcastingProviders(form.classId, form.subclassId, level).map((provider) => provider.id));
  const abilityScores = ABILITY_KEYS.reduce((scores, ability) => { scores[ability] = Number(form.abilityScores[ability]); return scores; }, {} as AbilityScores);
  const hpProgression: HpProgressionEntry[] = form.hpProgression.map((entry) => entry.method === 'fixed' ? { level: entry.level, method: 'fixed' } : { level: entry.level, method: 'rolled', roll: Number(entry.roll) });
  const backgroundAbilityChoice: BackgroundAbilityChoice = form.backgroundAbilityMode === 'three-ones'
    ? { mode: 'three-ones' }
    : { mode: 'two-one', plusTwo: form.backgroundPlusTwo, plusOne: form.backgroundPlusOne };
  const classSeed = initialCharacter ? undefined : seedClassStartingState(form);
  const seeded = initialCharacter
    ? { inventory: initialCharacter.inventory.map((entry) => ({ ...entry })), currency: { ...initialCharacter.currency } }
    : seedBackgroundStartingState(form, classSeed?.inventory ?? [], classSeed?.currency ?? EMPTY_CURRENCY);
  return {
    name: form.name,
    classId: form.classId,
    ...(form.subclassId ? { subclassId: form.subclassId } : {}),
    ...(form.speciesId ? { speciesId: form.speciesId } : {}),
    ...(form.backgroundId ? { backgroundId: form.backgroundId } : {}),
    ...(form.speciesSize ? { speciesSize: form.speciesSize } : {}),
    speciesChoices: { ...form.speciesChoices },
    speciesSkillProficiencies: [...form.speciesSkillProficiencies],
    ...(form.backgroundId ? { backgroundAbilityChoice, backgroundEquipmentChoice: form.backgroundEquipmentChoice } : {}),
    ...(form.backgroundToolChoice ? { backgroundToolChoice: form.backgroundToolChoice } : {}),
    manualFeats: form.manualFeats.map(cloneFeatSelection),
    spellcastingSelections: form.spellcastingSelections.filter((selection) => activeOwnedProviderIds.has(selection.providerId)).map(cloneSpellcastingSelection),
    level,
    abilityScores,
    skillProficiencies: [...form.skillProficiencies],
    inventory: seeded.inventory,
    currency: seeded.currency,
    hpProgression,
  };
}

export function CharacterForm({ initialCharacter, submitLabel, onSubmit }: CharacterFormProps) {
  const [form, setForm] = useState<CharacterFormState>(() => createInitialState(initialCharacter));
  const [errors, setErrors] = useState<CharacterValidationErrors>({});
  const [featToAdd, setFeatToAdd] = useState<ContentId>(FEATS[0]?.id ?? '');
  const classContent = contentRegistry.findClass(form.classId);
  const speciesContent = contentRegistry.findSpecies(form.speciesId);
  const backgroundContent = contentRegistry.findBackground(form.backgroundId);
  const classSubclasses = contentRegistry.findSubclassesForClass(form.classId);
  const levelNumber = Number(form.level);
  const activeOwnedSpellcastingProviders = ownedSpellcastingProviders(form.classId, form.subclassId, levelNumber);
  const eligibleSubclasses = classSubclasses.filter((subclass) => levelNumber >= subclass.acquisitionLevel);
  const nextSubclassLevel = classSubclasses.length ? Math.min(...classSubclasses.map((subclass) => subclass.acquisitionLevel)) : undefined;
  const legacySkillGap = Boolean(initialCharacter && initialCharacter.skillProficiencies.length === 0);
  const legacyOriginGap = Boolean(initialCharacter && (!initialCharacter.speciesId || !initialCharacter.backgroundId));
  const legacySubclassGap = Boolean(initialCharacter && !initialCharacter.subclassId && contentRegistry.findSubclassesForClass(initialCharacter.classId).some((subclass) => initialCharacter.level >= subclass.acquisitionLevel));
  function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const input = toCharacterInput(form, initialCharacter); const allowLegacyEmptySkills = legacySkillGap && input.skillProficiencies.length === 0; const allowIncompleteOrigin = legacyOriginGap && (!input.speciesId || !input.backgroundId); const allowIncompleteSubclass = legacySubclassGap && !input.subclassId && input.classId === initialCharacter?.classId; const nextErrors = validateCharacterInput(input, { allowLegacyEmptySkills, allowIncompleteOrigin, allowIncompleteSubclass }); setErrors(nextErrors); if (!hasValidationErrors(nextErrors)) onSubmit({ ...input, name: input.name.trim() }); }
  function toggleSkill(skill: SkillId, checked: boolean) { setForm((current) => ({ ...current, skillProficiencies: checked ? [...current.skillProficiencies, skill] : current.skillProficiencies.filter((candidate) => candidate !== skill) })); }
  function setSpellcastingSelectionValue(providerId: ContentId, field: 'cantripIds' | 'ownedSpellIds' | 'preparedSpellIds', spellId: ContentId, checked: boolean) {
    setForm((current) => {
      const existing = current.spellcastingSelections.find((selection) => selection.providerId === providerId) ?? { providerId, cantripIds: [], ownedSpellIds: [], preparedSpellIds: [] };
      const currentValues = existing[field];
      const values = checked ? (currentValues.includes(spellId) ? currentValues : [...currentValues, spellId]) : currentValues.filter((candidate) => candidate !== spellId);
      const next: CharacterSpellcastingSelection = { ...existing, [field]: values };
      if (field === 'ownedSpellIds' && !checked) next.preparedSpellIds = next.preparedSpellIds.filter((candidate) => candidate !== spellId);
      return { ...current, spellcastingSelections: [...current.spellcastingSelections.filter((selection) => selection.providerId !== providerId), next] };
    });
  }
  function addManualFeat() { if (!featToAdd) return; setForm((current) => ({ ...current, manualFeats: [...current.manualFeats, initialFeatSelection(featToAdd)] })); }
  function removeManualFeat(index: number) { setForm((current) => ({ ...current, manualFeats: current.manualFeats.filter((_, candidateIndex) => candidateIndex !== index) })); }
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
    <section className="form-section panel"><div className="section-heading"><span className="eyebrow">Identity</span><h2>Who are you building?</h2></div><label className="field field--wide" htmlFor="character-name"><span>Character Name</span><input id="character-name" name="name" type="text" autoComplete="off" value={form.name} aria-invalid={Boolean(errors.name)} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />{errors.name && <small className="field-error">{errors.name}</small>}</label></section>
    <section className="form-section panel">
      <div className="section-heading"><span className="eyebrow">Foundation</span><h2>Species, Background, class, subclass, and level</h2></div>
      {legacyOriginGap && (!form.speciesId || !form.backgroundId) && <div className="legacy-note">This migrated character predates Species and Background selection. You may keep the unresolved origin while editing other fields, or complete it now.</div>}
      <div className="field-grid field-grid--two">
        <label className="field" htmlFor="character-species"><span>Species</span><select id="character-species" value={form.speciesId} onChange={(event) => { const speciesId = event.target.value; const defaults = initialSpeciesChoices(speciesId); setForm((current) => ({ ...current, speciesId, ...defaults })); }}>{legacyOriginGap && <option value="">Unselected (legacy)</option>}{SPECIES.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>{errors.speciesId && <small className="field-error">{errors.speciesId}</small>}</label>
        <label className="field" htmlFor="character-background"><span>Background</span><select id="character-background" value={form.backgroundId} onChange={(event) => { const backgroundId = event.target.value; const defaults = initialBackgroundChoices(backgroundId); setForm((current) => ({ ...current, backgroundId, ...defaults })); }}>{legacyOriginGap && <option value="">Unselected (legacy)</option>}{BACKGROUNDS.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>{errors.backgroundId && <small className="field-error">{errors.backgroundId}</small>}</label>
        <label className="field" htmlFor="character-class"><span>Class</span><select id="character-class" value={form.classId} onChange={(event) => { const classId = event.target.value; const nextClass = contentRegistry.findClass(classId); setForm((current) => ({ ...current, classId, subclassId: contentRegistry.findSubclass(current.subclassId)?.parentClassId === classId ? current.subclassId : '', skillProficiencies: nextClass ? current.skillProficiencies.filter((skill) => nextClass.skillChoices.from.includes(skill)) : [], classEquipmentChoice: nextClass?.startingEquipment[0]?.id ?? '' })); }}>{CLASSES.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>{errors.classId && <small className="field-error">{errors.classId}</small>}</label>
        <label className="field" htmlFor="character-level"><span>Level</span><select id="character-level" value={form.level} onChange={(event) => { const level = Number(event.target.value); setForm((current) => { const selectedSubclass = contentRegistry.findSubclass(current.subclassId); return { ...current, level: event.target.value, subclassId: selectedSubclass && level >= selectedSubclass.acquisitionLevel ? current.subclassId : '', hpProgression: normalizeHpProgression(current.hpProgression, level) }; }); }}>{Array.from({ length: MAX_CHARACTER_LEVEL }, (_, index) => index + MIN_CHARACTER_LEVEL).map((level) => <option key={level} value={level}>Level {level}</option>)}</select>{errors.level && <small className="field-error">{errors.level}</small>}</label>
        <label className="field" htmlFor="character-subclass"><span>Subclass</span><select id="character-subclass" value={form.subclassId} disabled={eligibleSubclasses.length === 0} aria-invalid={Boolean(errors.subclassId)} onChange={(event) => setForm((current) => ({ ...current, subclassId: event.target.value }))}>{legacySubclassGap && !initialCharacter?.subclassId && <option value="">Unselected (legacy)</option>} {!legacySubclassGap && <option value="">Choose a subclass</option>}{eligibleSubclasses.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>{eligibleSubclasses.length === 0 && <small className="field-hint">{nextSubclassLevel ? `Subclass selection becomes available at level ${nextSubclassLevel}.` : 'No subclasses are available for this class.'}</small>}{legacySubclassGap && !form.subclassId && <small className="field-hint">This migrated character predates subclass selection. You may keep this unresolved while making unrelated edits, or choose a subclass now.</small>}{errors.subclassId && <small className="field-error">{errors.subclassId}</small>}</label>
      </div>
      {speciesContent && (
        <div className="origin-choice-block">
          <h3>Species Choices</h3>
          {speciesContent.size.kind === 'choice' && (
            <label className="field" htmlFor="species-size"><span>Size</span><select id="species-size" value={form.speciesSize} onChange={(event) => setForm((current) => ({ ...current, speciesSize: event.target.value as 'small' | 'medium' }))}>{speciesContent.size.options.map((size) => <option key={size} value={size}>{size[0].toUpperCase() + size.slice(1)}</option>)}</select></label>
          )}
          {speciesContent.choices.map((choice) => (
            <label className="field" htmlFor={`species-choice-${choice.id}`} key={choice.id}><span>{choice.name}</span><select id={`species-choice-${choice.id}`} value={form.speciesChoices[choice.id] ?? ''} onChange={(event) => setForm((current) => ({ ...current, speciesChoices: { ...current.speciesChoices, [choice.id]: event.target.value } }))}>{choice.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
          ))}
          {speciesContent.skillProficiencyChoice && (
            <label className="field" htmlFor="species-skill-choice"><span>Species Skill Proficiency</span><select id="species-skill-choice" value={form.speciesSkillProficiencies[0] ?? ''} onChange={(event) => setForm((current) => ({ ...current, speciesSkillProficiencies: [event.target.value as SkillId] }))}>{speciesContent.skillProficiencyChoice.from.map((skill) => <option key={skill} value={skill}>{SKILL_DEFINITIONS[skill].name}</option>)}</select></label>
          )}
          {(errors.speciesChoices || errors.speciesSkillProficiencies || errors.speciesSize) && <small className="field-error section-error">{errors.speciesChoices ?? errors.speciesSkillProficiencies ?? errors.speciesSize}</small>}
        </div>
      )}
      {backgroundContent && <div className="origin-choice-block"><h3>Background Choices</h3><p className="field-hint">Origin Feat: <strong>{backgroundContent.originFeat.name}{backgroundContent.originFeat.variant ? ` (${backgroundContent.originFeat.variant})` : ''}</strong>. Resolved through the Feat registry from this Background; it is not stored in manual Feats.</p><label className="field" htmlFor="background-ability-mode"><span>Ability Score Increases</span><select id="background-ability-mode" value={form.backgroundAbilityMode} onChange={(event) => setForm((current) => ({ ...current, backgroundAbilityMode: event.target.value as BackgroundAbilityChoice['mode'] }))}><option value="two-one">+2 to one, +1 to another</option><option value="three-ones">+1 to all three</option></select></label>{form.backgroundAbilityMode === 'two-one' && <div className="field-grid field-grid--two"><label className="field" htmlFor="background-plus-two"><span>+2 Ability</span><select id="background-plus-two" value={form.backgroundPlusTwo} onChange={(event) => setForm((current) => ({ ...current, backgroundPlusTwo: event.target.value as AbilityKey }))}>{backgroundContent.abilityScores.map((ability) => <option key={ability} value={ability}>{ABILITY_LABELS[ability]}</option>)}</select></label><label className="field" htmlFor="background-plus-one"><span>+1 Ability</span><select id="background-plus-one" value={form.backgroundPlusOne} onChange={(event) => setForm((current) => ({ ...current, backgroundPlusOne: event.target.value as AbilityKey }))}>{backgroundContent.abilityScores.map((ability) => <option key={ability} value={ability}>{ABILITY_LABELS[ability]}</option>)}</select></label></div>}{backgroundContent.toolProficiency.kind === 'choice' && <label className="field" htmlFor="background-tool"><span>{backgroundContent.toolProficiency.category} proficiency</span><select id="background-tool" value={form.backgroundToolChoice} onChange={(event) => setForm((current) => ({ ...current, backgroundToolChoice: event.target.value }))}>{backgroundContent.toolProficiency.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>}<label className="field" htmlFor="background-equipment"><span>Starting Equipment</span><select id="background-equipment" value={form.backgroundEquipmentChoice} onChange={(event) => setForm((current) => ({ ...current, backgroundEquipmentChoice: event.target.value }))}>{backgroundContent.startingEquipment.map((option) => <option key={option.id} value={option.id}>Option {option.id}{option.currency ? ` · ${option.currency.amount} ${option.currency.unit.toUpperCase()}` : ''}</option>)}</select></label>{initialCharacter && <p className="field-hint">Changing Background does not rewrite existing Inventory; starting equipment is seeded only when a new character is created.</p>}{(errors.backgroundAbilityChoice || errors.backgroundToolChoice || errors.backgroundEquipmentChoice) && <small className="field-error section-error">{errors.backgroundAbilityChoice ?? errors.backgroundToolChoice ?? errors.backgroundEquipmentChoice}</small>}</div>}
    </section>
    <section className="form-section panel"><div className="section-heading section-heading--split"><div><span className="eyebrow">Ability Scores</span><h2>Enter base scores</h2></div><p>Background increases are applied by the Rules Engine. Enter whole-number scores from {MIN_ABILITY_SCORE} to {MAX_ABILITY_SCORE}.</p></div><div className="ability-input-grid">{ABILITY_KEYS.map((ability) => <label className="field ability-field" htmlFor={`ability-${ability}`} key={ability}><span>{ABILITY_LABELS[ability]}</span><input id={`ability-${ability}`} type="number" min={MIN_ABILITY_SCORE} max={MAX_ABILITY_SCORE} step="1" value={form.abilityScores[ability]} onChange={(event) => setForm((current) => ({ ...current, abilityScores: { ...current.abilityScores, [ability]: event.target.value } }))} />{errors[ability] && <small className="field-error">{errors[ability]}</small>}</label>)}</div></section>
    {initialCharacter && (
      <section className="form-section panel feat-editor" aria-labelledby="manual-feats-heading">
        <div className="section-heading"><span className="eyebrow">Feats</span><h2 id="manual-feats-heading">Manual Feat Ownership</h2><p>Background Origin Feats are derived from the selected Background and are not stored here. This editor is only for separately acquired Feats; it is not a Level Up workflow.</p></div>
        <div className="feat-editor__add">
          <label className="field" htmlFor="manual-feat-add"><span>Feat to add</span><select id="manual-feat-add" value={featToAdd} onChange={(event) => setFeatToAdd(event.target.value)}>{FEATS.map((feat) => <option key={feat.id} value={feat.id}>{feat.name} · {feat.category}</option>)}</select></label>
          <button className="button button--secondary" type="button" onClick={addManualFeat}>Add Feat</button>
        </div>
        {form.manualFeats.length === 0 ? <p className="field-hint">No separately acquired Feats are stored on this character.</p> : (
          <div className="feat-editor__list">
            {form.manualFeats.map((selection, selectionIndex) => {
              const feat = contentRegistry.findFeat(selection.featId);
              if (!feat) return <article className="feat-editor__card" key={`${selection.featId}-${selectionIndex}`}><div className="feat-editor__header"><div><span className="eyebrow">Unresolved</span><h3>{selection.featId}</h3></div><button className="button button--danger" type="button" onClick={() => removeManualFeat(selectionIndex)}>Remove</button></div></article>;
              const abilityEffects = feat.effects.filter((effect) => effect.type === 'ability-score-increase');
              const referenceChoices = feat.choices.filter((choice) => choice.support === 'reference-only');
              return (
                <article className="feat-editor__card" key={`${selection.featId}-${selectionIndex}`}>
                  <div className="feat-editor__header"><div><span className="eyebrow">{feat.category}</span><h3>{feat.name}</h3></div><button className="button button--danger" type="button" onClick={() => removeManualFeat(selectionIndex)}>Remove</button></div>
                  <p className="field-hint"><strong>Prerequisites:</strong> {formatFeatPrerequisite(feat.id)}</p>
                  {feat.repeatabilityNote && <p className="field-hint"><strong>Repeatability:</strong> {feat.repeatabilityNote}</p>}
                  {abilityEffects.map((effect) => <div className="field-grid field-grid--two" key={effect.choiceId}>{Array.from({ length: effect.selections }, (_, choiceIndex) => <label className="field" htmlFor={`manual-feat-${selectionIndex}-${effect.choiceId}-${choiceIndex}`} key={choiceIndex}><span>{effect.selections === 1 ? 'Ability Score Increase' : `Ability Score Increase ${choiceIndex + 1}`}</span><select id={`manual-feat-${selectionIndex}-${effect.choiceId}-${choiceIndex}`} value={selection.choices[effect.choiceId]?.[choiceIndex] ?? effect.allowedAbilities[0]} onChange={(event) => updateManualFeatChoice(selectionIndex, effect.choiceId, choiceIndex, event.target.value)}>{effect.allowedAbilities.map((ability) => <option key={ability} value={ability}>{ABILITY_LABELS[ability]}</option>)}</select></label>)}</div>)}
                  {referenceChoices.map((choice) => <p className="field-hint" key={choice.id}><strong>{choice.name}:</strong> {choice.description} This choice is reference-only in Milestone 8 and is not guessed here.</p>)}
                </article>
              );
            })}
          </div>
        )}
        {errors.manualFeats && <small className="field-error section-error">{errors.manualFeats}</small>}
      </section>
    )}
    {activeOwnedSpellcastingProviders.length > 0 && (
      <section className="form-section panel" aria-labelledby="owned-spellcasting-heading">
        <div className="section-heading"><span className="eyebrow">Spellcasting</span><h2 id="owned-spellcasting-heading">Persistent spell selections</h2><p>These selections belong to the active Spellcasting provider. Global spell-list membership, owned leveled spells, and currently prepared spells remain distinct.</p></div>
        {activeOwnedSpellcastingProviders.map((provider) => {
          if (provider.spellManagement.kind !== 'prepared-from-owned') return null;
          const management = provider.spellManagement;
          const selection = form.spellcastingSelections.find((candidate) => candidate.providerId === provider.id) ?? { providerId: provider.id, cantripIds: [], ownedSpellIds: [], preparedSpellIds: [] };
          const cantripLimit = countAtLevel(management.cantripCount, levelNumber);
          const preparedLimit = countAtLevel(management.preparedSpellCount, levelNumber);
          const maximumSpellLevel = maximumSpellLevelAtLevel(provider, levelNumber);
          const catalog = contentRegistry.getAll('spell').filter((spell) => spell.spellLists.some((list) => list.id === management.spellListId));
          const cantrips = catalog.filter((spell) => spell.level === 0).sort((left, right) => left.name.localeCompare(right.name));
          const ownedCandidates = catalog.filter((spell) => spell.level > 0 && spell.level <= maximumSpellLevel).sort((left, right) => left.level - right.level || left.name.localeCompare(right.name));
          const preparedCandidates = ownedCandidates.filter((spell) => selection.ownedSpellIds.includes(spell.id));
          const unresolvedIds = [...new Set([...selection.cantripIds, ...selection.ownedSpellIds, ...selection.preparedSpellIds].filter((spellId) => !contentRegistry.findSpell(spellId)))];
          return <article className="feat-editor__card" key={provider.id}>
            <div className="feat-editor__header"><div><span className="eyebrow">Provider</span><h3>{provider.name}</h3></div><span className="source-badge">Level {levelNumber}</span></div>
            <p className="field-hint">Choose exactly {cantripLimit} cantrips. Keep at least {management.initialOwnedSpellCount} level {management.initialOwnedSpellLevel} starting spells in this provider’s owned collection. Prepare up to {preparedLimit} eligible owned leveled spells. Additional owned spells may be recorded without fabricating Level Up history.</p>
            {unresolvedIds.length > 0 && <p className="legacy-note">Unresolved stored spell IDs remain non-mechanical until their content returns or you remove them: {unresolvedIds.join(', ')}</p>}
            <div className="origin-choice-block">
              <h3>Cantrips · {selection.cantripIds.length}/{cantripLimit}</h3>
              <div className="choice-grid">{cantrips.map((spell) => { const checked = selection.cantripIds.includes(spell.id); return <label className="choice-card" key={spell.id}><input type="checkbox" checked={checked} disabled={!checked && selection.cantripIds.length >= cantripLimit} onChange={(event) => setSpellcastingSelectionValue(provider.id, 'cantripIds', spell.id, event.target.checked)} /><span>{spell.name}</span></label>; })}</div>
            </div>
            <div className="origin-choice-block">
              <h3>Owned leveled spells · {selection.ownedSpellIds.length} stored</h3>
              <p className="field-hint">Eligible catalog at this level: spell levels 1–{maximumSpellLevel}. The app does not invent the two spells normally gained on later Wizard levels or subclass-granted spellbook choices.</p>
              <div className="choice-grid">{ownedCandidates.map((spell) => <label className="choice-card" key={spell.id}><input type="checkbox" checked={selection.ownedSpellIds.includes(spell.id)} onChange={(event) => setSpellcastingSelectionValue(provider.id, 'ownedSpellIds', spell.id, event.target.checked)} /><span>Level {spell.level} · {spell.name} · {spell.school}{spell.ritual ? ' · Ritual' : ''}</span></label>)}</div>
            </div>
            <div className="origin-choice-block">
              <h3>Prepared leveled spells · {selection.preparedSpellIds.length}/{preparedLimit}</h3>
              {preparedCandidates.length === 0 ? <p className="field-hint">Add eligible leveled spells to the owned collection before preparing them.</p> : <div className="choice-grid">{preparedCandidates.map((spell) => { const checked = selection.preparedSpellIds.includes(spell.id); return <label className="choice-card" key={spell.id}><input type="checkbox" checked={checked} disabled={!checked && selection.preparedSpellIds.length >= preparedLimit} onChange={(event) => setSpellcastingSelectionValue(provider.id, 'preparedSpellIds', spell.id, event.target.checked)} /><span>Level {spell.level} · {spell.name}</span></label>; })}</div>}
            </div>
            {provider.ritualCasting === 'owned' && <p className="field-hint">Ritual eligibility comes from owned spell content rather than the prepared set. Ritual execution itself remains manual/reference-only.</p>}
          </article>;
        })}
        {errors.spellcastingSelections && <small className="field-error section-error">{errors.spellcastingSelections}</small>}
      </section>
    )}
    <section className="form-section panel"><div className="section-heading"><span className="eyebrow">Hit Point Progression</span><h2>Reproducible HP history</h2><p>Level 1 uses the class Hit Die maximum. Higher levels may use the SRD fixed value or a recorded manual roll.</p></div>{form.hpProgression.length === 0 ? <p className="field-hint">Level 1 needs no additional HP history.</p> : <div className="hp-progression-grid">{form.hpProgression.map((entry) => <div className="hp-progression-row" key={entry.level}><strong>Level {entry.level}</strong><label className="field" htmlFor={`hp-method-${entry.level}`}><span>Method</span><select id={`hp-method-${entry.level}`} value={entry.method} onChange={(event) => setForm((current) => ({ ...current, hpProgression: current.hpProgression.map((candidate) => candidate.level === entry.level ? { ...candidate, method: event.target.value as 'fixed' | 'rolled', roll: event.target.value === 'fixed' ? '' : candidate.roll } : candidate) }))}><option value="fixed">Fixed ({classContent?.fixedHitPointsPerLevel ?? '—'})</option><option value="rolled">Rolled</option></select></label>{entry.method === 'rolled' ? <label className="field" htmlFor={`hp-roll-${entry.level}`}><span>d{classContent?.hitDie ?? '?'} result</span><input id={`hp-roll-${entry.level}`} type="number" min="1" max={classContent?.hitDie} value={entry.roll} onChange={(event) => setForm((current) => ({ ...current, hpProgression: current.hpProgression.map((candidate) => candidate.level === entry.level ? { ...candidate, roll: event.target.value } : candidate) }))} /></label> : <span className="hp-progression-fixed">{classContent?.fixedHitPointsPerLevel ?? '—'} + CON modifier</span>}</div>)}</div>}{errors.hpProgression && <small className="field-error section-error">{errors.hpProgression}</small>}</section>
    <section className="form-section panel"><div className="section-heading"><span className="eyebrow">Skill Proficiencies</span><h2>Choose {classContent?.skillChoices.choose ?? 0} class skills</h2></div>{legacySkillGap && form.skillProficiencies.length === 0 && <div className="legacy-note">This migrated character predates skill selection. You may keep it unchanged or choose the normal class skills now.</div>}<div className="choice-grid">{(classContent?.skillChoices.from ?? []).map((skillId) => <label className="choice-card" key={skillId}><input type="checkbox" checked={form.skillProficiencies.includes(skillId)} onChange={(event) => toggleSkill(skillId, event.target.checked)} /><span>{SKILL_DEFINITIONS[skillId].name}</span></label>)}</div>{errors.skillProficiencies && <small className="field-error section-error">{errors.skillProficiencies}</small>}</section>
    {!initialCharacter ? <section className="form-section panel"><div className="section-heading"><span className="eyebrow">Starting Equipment</span><h2>Choose the Class package</h2><p>The selected Class and Background packages seed owned Inventory and currency once. Equip and edit items afterward from Inventory.</p></div><label className="field" htmlFor="class-equipment"><span>{classContent?.name ?? 'Class'} Starting Equipment</span><select id="class-equipment" value={form.classEquipmentChoice} onChange={(event) => setForm((current) => ({ ...current, classEquipmentChoice: event.target.value }))}>{(classContent?.startingEquipment ?? []).map((option) => <option key={option.id} value={option.id}>Option {option.id}{option.currency ? ` · ${option.currency.amount} ${option.currency.unit.toUpperCase()}` : ''}</option>)}</select></label>{errors.inventory && <small className="field-error section-error">{errors.inventory}</small>}</section> : <section className="form-section panel"><div className="section-heading"><span className="eyebrow">Equipment</span><h2>Managed in Inventory</h2><p>Changing Class does not rewrite existing Inventory. Use the Character Inventory page to change ownership, notes, quantities, and equipped state.</p></div></section>}
    <div className="form-actions"><button className="button button--primary" type="submit">{submitLabel}</button></div>
  </form>;
}
