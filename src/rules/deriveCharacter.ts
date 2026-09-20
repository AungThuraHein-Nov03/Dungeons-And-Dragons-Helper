import type { Character, SkillId } from '../models/character';
import type { CharacterRuleEffect, ClassContent } from '../models/content';
import type { ContentRegistry } from '../services/contentRegistry';
import { deriveAbilityModifiers } from './abilities';
import { deriveActiveSelfEffects } from './activeSelfEffects';
import { deriveEffectiveAbilityScores, resolveBackgroundToolProficiency } from './background';
import { deriveDefense } from './armor';
import { deriveClassProficiencyContext, type DerivedClassProficiencyContext } from './classProficiencies';
import { deriveCharacterClass, deriveClassProgressionState } from './classes';
import { getSingleClassProgression, getStartingClassProgression, getTotalCharacterLevel } from './characterProgression';
import { deriveCharacterFeats } from './feats';
import { deriveHealth, deriveMulticlassHealth } from './health';
import { deriveInitiative } from './initiative';
import { getEquippedWeapons } from './inventory';
import { deriveCharacterSpeed, deriveStaticD20Context } from './m13eRules';
import { deriveOwnerAwareMechanics } from './ownerAwareMechanics';
import { deriveProficiencyBonus } from './proficiency';
import { deriveResourceDefinitions } from './resources';
import { deriveResourceTransactions } from './resourceTransactions';
import { ruleError, ruleOk, type RuleResult } from './result';
import { deriveSavingThrows } from './savingThrows';
import { derivePassivePerception, deriveSkills } from './skills';
import { deriveSpecies } from './species';
import { deriveCharacterSubclass, deriveSubclassProgressionState } from './subclasses';
import { deriveMulticlassSpellcastingProviders, deriveSpellcastingProviders } from './spellcasting';
import type {
  DerivedBackgroundState,
  DerivedCharacterState,
  DerivedClassState,
  DerivedMechanicalOwner,
  DerivedResource,
  DerivedRuleEffectSource,
  DerivedSpeciesState,
  DerivedWeaponAttack,
} from './types';
import { deriveWeaponAttack } from './weapons';

function combineResources(...groups: readonly (readonly DerivedResource[])[]): RuleResult<readonly DerivedResource[]> {
  const combined: DerivedResource[] = [];
  const ids = new Set<string>();
  for (const group of groups) {
    for (const resource of group) {
      if (ids.has(resource.id)) return ruleError('duplicate-resource', `Duplicate derived resource id: ${resource.id}`, resource.id);
      ids.add(resource.id);
      combined.push(resource);
    }
  }
  return ruleOk(combined);
}

function characterMechanicalOwner(level: number): Extract<DerivedMechanicalOwner, { kind: 'character' }> {
  return { kind: 'character', level };
}

function classMechanicalOwner(classContent: ClassContent, level: number): Extract<DerivedMechanicalOwner, { kind: 'class' }> {
  return { kind: 'class', level, classId: classContent.id, className: classContent.name };
}

function deriveSingleClassCharacterState(character: Character, registry: ContentRegistry): RuleResult<DerivedCharacterState> {
  const single = getSingleClassProgression(character);
  if (!single.ok) return single;
  const progression = single.value;
  const totalLevel = getTotalCharacterLevel(character);
  const classContent = registry.findClass(progression.classId);
  if (!classContent) return ruleError('missing-class', `Character class could not be resolved: ${progression.classId}`, progression.classId);

  let species: DerivedSpeciesState | undefined;
  if (character.speciesId) {
    const speciesContent = registry.findSpecies(character.speciesId);
    if (!speciesContent) return ruleError('missing-species', `Character Species could not be resolved: ${character.speciesId}`, character.speciesId);
    const derivedSpecies = deriveSpecies(speciesContent, character);
    if (!derivedSpecies.ok) return derivedSpecies;
    species = derivedSpecies.value;
  }

  let background: DerivedBackgroundState | undefined;
  let backgroundSkills: readonly SkillId[] = [];
  if (character.backgroundId) {
    const backgroundContent = registry.findBackground(character.backgroundId);
    if (!backgroundContent) return ruleError('missing-background', `Character Background could not be resolved: ${character.backgroundId}`, character.backgroundId);
    const tool = resolveBackgroundToolProficiency(backgroundContent, character.backgroundToolChoice);
    if (!tool.ok) return tool;
    backgroundSkills = backgroundContent.skillProficiencies;
    background = {
      id: backgroundContent.id,
      name: backgroundContent.name,
      abilityScores: backgroundContent.abilityScores,
      skillProficiencies: backgroundContent.skillProficiencies,
      toolProficiency: tool.value,
      originFeat: backgroundContent.originFeat,
    };
  }

  const backgroundScores = deriveEffectiveAbilityScores(character, registry);
  if (!backgroundScores.ok) return backgroundScores;
  const featState = deriveCharacterFeats(character, registry, backgroundScores.value);
  if (!featState.ok) return featState;
  const classState = deriveCharacterClass(character, registry);
  if (!classState.ok) return classState;
  const subclassState = deriveCharacterSubclass(character, registry);
  if (!subclassState.ok) return subclassState;
  const effectiveScores = featState.value.abilityScores;
  const effectiveCharacter = { ...character, abilityScores: effectiveScores };
  const featRuleEffects = featState.value.effects.filter((effect): effect is CharacterRuleEffect => effect.type !== 'ability-score-increase');
  const speciesRuleEffects = species?.automatedEffects ?? [];
  const characterOwner = characterMechanicalOwner(totalLevel);
  const classOwner = classMechanicalOwner(classContent, progression.level);
  const subclassOwner: Extract<DerivedMechanicalOwner, { kind: 'subclass' }> | undefined = subclassState.value.subclass ? {
    kind: 'subclass',
    level: progression.level,
    classId: classContent.id,
    className: classContent.name,
    subclassId: subclassState.value.subclass.id,
    subclassName: subclassState.value.subclass.name,
  } : undefined;
  const ruleEffects = [...speciesRuleEffects, ...featRuleEffects, ...classState.value.effects, ...subclassState.value.effects];
  const ruleEffectSources: DerivedRuleEffectSource[] = [
    ...(species && species.automatedEffects.length > 0 ? [{ contentId: species.id, name: species.name, effects: species.automatedEffects, owner: characterOwner }] : []),
    ...featState.value.feats.map((feat) => ({
      contentId: feat.id,
      name: feat.name,
      effects: feat.automatedEffects.filter((effect): effect is CharacterRuleEffect => effect.type !== 'ability-score-increase'),
      owner: characterOwner,
    })),
    ...classState.value.classState.acquiredFeatures.map((feature) => ({ contentId: feature.id, name: feature.name, effects: feature.automatedEffects, owner: classOwner })),
    ...(subclassState.value.subclass?.acquiredFeatures.map((feature) => ({
      contentId: feature.id,
      name: feature.name,
      effects: feature.automatedEffects,
      ...(subclassOwner ? { owner: subclassOwner } : {}),
    })) ?? []),
  ].filter((source) => source.effects.length > 0);

  const proficiency = deriveProficiencyBonus(totalLevel, classContent);
  if (!proficiency.ok) return proficiency;
  const health = deriveHealth(effectiveCharacter, classContent, ruleEffects);
  if (!health.ok) return health;
  const abilityModifiers = deriveAbilityModifiers(effectiveScores);
  const initiative = deriveInitiative(abilityModifiers.dexterity, proficiency.value, ruleEffectSources);
  const resourceConsumers = [...classState.value.resourceConsumers, ...subclassState.value.resourceConsumers];
  const classResources = deriveResourceDefinitions(
    progression.level,
    [...classContent.resources, ...classState.value.resources],
    resourceConsumers,
    abilityModifiers,
    classOwner,
  );
  if (!classResources.ok) return classResources;
  const subclassResources = subclassOwner
    ? deriveResourceDefinitions(progression.level, subclassState.value.resources, resourceConsumers, abilityModifiers, subclassOwner)
    : ruleOk([]);
  if (!subclassResources.ok) return subclassResources;

  const spellcasting = deriveSpellcastingProviders(
    [
      ...classState.value.spellcastingProviders.map((grant) => ({ ...grant, owner: classOwner })),
      ...subclassState.value.spellcastingProviders.map((grant) => ({ ...grant, ...(subclassOwner ? { owner: subclassOwner } : {}) })),
    ],
    progression.level,
    abilityModifiers,
    proficiency.value,
    registry,
    [...classState.value.spellGrants, ...subclassState.value.spellGrants],
    character.spellcastingSelections,
  );
  if (!spellcasting.ok) return spellcasting;
  const resources = combineResources(classResources.value, subclassResources.value, spellcasting.value.resources);
  if (!resources.ok) return resources;
  const resourceTransactions = deriveResourceTransactions(
    progression.level,
    [
      ...classState.value.resourceTransactions.map((grant) => ({ ...grant, owner: classOwner })),
      ...subclassState.value.resourceTransactions.map((grant) => ({ ...grant, ...(subclassOwner ? { owner: subclassOwner } : {}) })),
    ],
    resources.value,
    spellcasting.value.providers,
  );
  if (!resourceTransactions.ok) return resourceTransactions;
  const activeSelfEffects = deriveActiveSelfEffects([
    ...classState.value.activeSelfEffects.map((grant) => ({ ...grant, owner: classOwner })),
    ...subclassState.value.activeSelfEffects.map((grant) => ({ ...grant, ...(subclassOwner ? { owner: subclassOwner } : {}) })),
  ]);
  if (!activeSelfEffects.ok) return activeSelfEffects;
  const savingThrows = deriveSavingThrows(abilityModifiers, proficiency.value, classContent, ruleEffects);
  const skillProficiencies = [...new Set([...progression.skillProficiencies, ...backgroundSkills, ...(species?.skillProficiencies ?? [])])];
  const skills = deriveSkills(abilityModifiers, proficiency.value, skillProficiencies);
  if (species) {
    const speed = deriveCharacterSpeed(species.speedFeet, effectiveCharacter, registry, ruleEffectSources);
    species = { ...species, speedFeet: speed.speedFeet };
  }
  const defense = deriveDefense(effectiveCharacter, classContent, registry, abilityModifiers, ruleEffects);
  if (!defense.ok) return defense;

  const attacks: DerivedWeaponAttack[] = [];
  for (const { entry, content } of getEquippedWeapons(character, registry)) {
    const attack = deriveWeaponAttack(effectiveCharacter, classContent, registry, abilityModifiers, content.id, {
      attackAbility: entry.attackAbilityChoice,
      displayName: entry.displayName,
      inventoryEntryId: entry.id,
    }, ruleEffects);
    if (!attack.ok) return attack;
    attacks.push(attack.value);
  }

  const ownedClassState: DerivedClassState = {
    ...classState.value.classState,
    ...(subclassState.value.subclass ? { subclass: subclassState.value.subclass } : {}),
  };

  return ruleOk({
    characterId: character.id,
    startingClassId: classContent.id,
    startingClassName: classContent.name,
    classProgressions: [ownedClassState],
    classProficiencies: {
      savingThrowProficiencies: classContent.savingThrowProficiencies,
      skillProficiencies: progression.skillProficiencies,
      weaponProficiencies: classContent.weaponProficiencies,
      armorTraining: classContent.armorTraining,
      toolProficiencies: classContent.toolProficiencies,
    },
    classId: classContent.id,
    className: classContent.name,
    classState: ownedClassState,
    ...(subclassState.value.subclass ? { subclass: subclassState.value.subclass } : {}),
    ...(species ? { species } : {}),
    ...(background ? { background } : {}),
    feats: featState.value.feats,
    spellcasting: spellcasting.value.providers,
    ruleEffects,
    ruleEffectSources,
    initiative,
    level: totalLevel,
    abilityScores: effectiveScores,
    abilityModifiers,
    proficiencyBonus: proficiency.value,
    savingThrows,
    skills,
    passivePerception: derivePassivePerception(skills, deriveStaticD20Context(ruleEffectSources, { kind: 'skill-check', skillId: 'perception' })),
    defense: defense.value,
    health: health.value,
    resources: resources.value,
    resourceTransactions: resourceTransactions.value,
    activeSelfEffects: activeSelfEffects.value,
    attacks,
  });
}

function deriveMulticlassFeatureProgressions(
  character: Character,
  registry: ContentRegistry,
): RuleResult<readonly DerivedClassState[]> {
  const states: DerivedClassState[] = [];
  const orderedProgressions = [...character.classProgressions].sort((left, right) => left.classId.localeCompare(right.classId));

  for (const progression of orderedProgressions) {
    const classState = deriveClassProgressionState(progression, progression.classId === character.startingClassId, registry);
    if (!classState.ok) return classState;
    const subclassState = deriveSubclassProgressionState(progression, registry);
    if (!subclassState.ok) return subclassState;

    states.push({
      ...classState.value,
      ...(subclassState.value ? { subclass: subclassState.value } : {}),
    });
  }

  return ruleOk(states);
}

function deriveMulticlassC4CharacterState(
  character: Character,
  registry: ContentRegistry,
  proficiencyContext: DerivedClassProficiencyContext,
): RuleResult<DerivedCharacterState> {
  const classProgressions = deriveMulticlassFeatureProgressions(character, registry);
  if (!classProgressions.ok) return classProgressions;

  let species: DerivedSpeciesState | undefined;
  if (character.speciesId) {
    const speciesContent = registry.findSpecies(character.speciesId);
    if (!speciesContent) return ruleError('missing-species', `Character Species could not be resolved: ${character.speciesId}`, character.speciesId);
    const derivedSpecies = deriveSpecies(speciesContent, character);
    if (!derivedSpecies.ok) return derivedSpecies;
    species = derivedSpecies.value;
  }

  let background: DerivedBackgroundState | undefined;
  let backgroundSkills: readonly SkillId[] = [];
  if (character.backgroundId) {
    const backgroundContent = registry.findBackground(character.backgroundId);
    if (!backgroundContent) return ruleError('missing-background', `Character Background could not be resolved: ${character.backgroundId}`, character.backgroundId);
    const tool = resolveBackgroundToolProficiency(backgroundContent, character.backgroundToolChoice);
    if (!tool.ok) return tool;
    backgroundSkills = backgroundContent.skillProficiencies;
    background = {
      id: backgroundContent.id,
      name: backgroundContent.name,
      abilityScores: backgroundContent.abilityScores,
      skillProficiencies: backgroundContent.skillProficiencies,
      toolProficiency: tool.value,
      originFeat: backgroundContent.originFeat,
    };
  }

  const backgroundScores = deriveEffectiveAbilityScores(character, registry);
  if (!backgroundScores.ok) return backgroundScores;
  const featState = deriveCharacterFeats(character, registry, backgroundScores.value);
  if (!featState.ok) return featState;
  const effectiveScores = featState.value.abilityScores;
  const effectiveCharacter = { ...character, abilityScores: effectiveScores };
  const totalLevel = getTotalCharacterLevel(character);
  const characterOwner = characterMechanicalOwner(totalLevel);
  const abilityModifiers = deriveAbilityModifiers(effectiveScores);
  const proficiency = deriveProficiencyBonus(totalLevel, proficiencyContext.startingClass);
  if (!proficiency.ok) return proficiency;
  const spellcasting = deriveMulticlassSpellcastingProviders(
    classProgressions.value,
    abilityModifiers,
    proficiency.value,
    registry,
    character.spellcastingSelections,
  );
  if (!spellcasting.ok) return spellcasting;
  const ownerMechanics = deriveOwnerAwareMechanics(
    classProgressions.value,
    registry,
    abilityModifiers,
    totalLevel,
    spellcasting.value.providers,
  );
  if (!ownerMechanics.ok) return ownerMechanics;

  const featRuleEffects = featState.value.effects.filter((effect): effect is CharacterRuleEffect => effect.type !== 'ability-score-increase');
  const speciesRuleEffects = species?.automatedEffects ?? [];
  const characterRuleEffectSources: DerivedRuleEffectSource[] = [
    ...(species && species.automatedEffects.length > 0 ? [{
      contentId: species.id,
      name: species.name,
      effects: species.automatedEffects,
      owner: characterOwner,
    }] : []),
    ...featState.value.feats.map((feat) => ({
      contentId: feat.id,
      name: feat.name,
      effects: feat.automatedEffects.filter((effect): effect is CharacterRuleEffect => effect.type !== 'ability-score-increase'),
      owner: characterOwner,
    })),
  ].filter((source) => source.effects.length > 0);
  const ruleEffectSources = [...characterRuleEffectSources, ...ownerMechanics.value.ruleEffectSources];
  const ruleEffects = [
    ...speciesRuleEffects,
    ...featRuleEffects,
    ...ownerMechanics.value.ruleEffectSources.flatMap((source) => source.effects),
  ];

  const initiative = deriveInitiative(abilityModifiers.dexterity, proficiency.value, ruleEffectSources);

  const proficiencyClassContent: ClassContent = {
    ...proficiencyContext.startingClass,
    savingThrowProficiencies: proficiencyContext.savingThrowProficiencies,
    weaponProficiencies: proficiencyContext.weaponProficiencies,
    armorTraining: proficiencyContext.armorTraining,
    toolProficiencies: proficiencyContext.toolProficiencies,
  };
  const savingThrows = deriveSavingThrows(abilityModifiers, proficiency.value, proficiencyClassContent, ruleEffects);
  const skillProficiencies = [...new Set([
    ...proficiencyContext.skillProficiencies,
    ...backgroundSkills,
    ...(species?.skillProficiencies ?? []),
  ])];
  const skills = deriveSkills(abilityModifiers, proficiency.value, skillProficiencies);

  if (species) {
    const speed = deriveCharacterSpeed(species.speedFeet, effectiveCharacter, registry, ruleEffectSources);
    species = { ...species, speedFeet: speed.speedFeet };
  }
  const defense = deriveDefense(effectiveCharacter, proficiencyClassContent, registry, abilityModifiers, ruleEffects);
  if (!defense.ok) return defense;

  const health = deriveMulticlassHealth(effectiveCharacter, registry, ruleEffectSources);
  if (!health.ok) return health;
  const resources = combineResources(ownerMechanics.value.resources, spellcasting.value.resources);
  if (!resources.ok) return resources;

  const attacks: DerivedWeaponAttack[] = [];
  for (const { entry, content } of getEquippedWeapons(character, registry)) {
    const attack = deriveWeaponAttack(effectiveCharacter, proficiencyClassContent, registry, abilityModifiers, content.id, {
      attackAbility: entry.attackAbilityChoice,
      displayName: entry.displayName,
      inventoryEntryId: entry.id,
    }, ruleEffects);
    if (!attack.ok) return attack;
    attacks.push(attack.value);
  }

  return ruleOk({
    characterId: character.id,
    startingClassId: proficiencyContext.startingClass.id,
    startingClassName: proficiencyContext.startingClass.name,
    classProgressions: classProgressions.value,
    classProficiencies: {
      savingThrowProficiencies: proficiencyContext.savingThrowProficiencies,
      skillProficiencies: proficiencyContext.skillProficiencies,
      weaponProficiencies: proficiencyContext.weaponProficiencies,
      armorTraining: proficiencyContext.armorTraining,
      toolProficiencies: proficiencyContext.toolProficiencies,
    },
    ...(species ? { species } : {}),
    ...(background ? { background } : {}),
    feats: featState.value.feats,
    spellcasting: spellcasting.value.providers,
    ...(spellcasting.value.ordinaryMulticlassCasterLevel !== undefined
      ? { ordinaryMulticlassCasterLevel: spellcasting.value.ordinaryMulticlassCasterLevel }
      : {}),
    ...(spellcasting.value.ordinaryMulticlassSlotPool
      ? { ordinaryMulticlassSlotPool: spellcasting.value.ordinaryMulticlassSlotPool }
      : {}),
    ruleEffects,
    ruleEffectSources,
    initiative,
    level: totalLevel,
    abilityScores: effectiveScores,
    abilityModifiers,
    proficiencyBonus: proficiency.value,
    savingThrows,
    skills,
    passivePerception: derivePassivePerception(skills, deriveStaticD20Context(ruleEffectSources, { kind: 'skill-check', skillId: 'perception' })),
    defense: defense.value,
    health: health.value,
    resources: resources.value,
    resourceTransactions: ownerMechanics.value.resourceTransactions,
    activeSelfEffects: ownerMechanics.value.activeSelfEffects,
    attacks,
  });
}

export function deriveCharacterState(character: Character, registry: ContentRegistry): RuleResult<DerivedCharacterState> {
  if (character.classProgressions.length === 1) {
    const starting = getStartingClassProgression(character);
    if (!starting.ok) return starting;
    return deriveSingleClassCharacterState(character, registry);
  }

  const proficiencyContext = deriveClassProficiencyContext(character, registry);
  if (!proficiencyContext.ok) return proficiencyContext;
  return deriveMulticlassC4CharacterState(character, registry, proficiencyContext.value);
}
