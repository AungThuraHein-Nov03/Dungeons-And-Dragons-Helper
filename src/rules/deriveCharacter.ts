import type { Character } from '../models/character';
import type { CharacterRuleEffect } from '../models/content';
import type { ContentRegistry } from '../services/contentRegistry';
import { deriveAbilityModifiers } from './abilities';
import { deriveActiveSelfEffects } from './activeSelfEffects';
import { deriveEffectiveAbilityScores, resolveBackgroundToolProficiency } from './background';
import { deriveDefense } from './armor';
import { deriveCharacterClass } from './classes';
import { deriveCharacterFeats } from './feats';
import { deriveHealth } from './health';
import { deriveInitiative } from './initiative';
import { getEquippedWeapons } from './inventory';
import { deriveCharacterSpeed, deriveStaticD20Context } from './m13eRules';
import { deriveProficiencyBonus } from './proficiency';
import { deriveResourceDefinitions } from './resources';
import { deriveResourceTransactions } from './resourceTransactions';
import { ruleError, ruleOk, type RuleResult } from './result';
import { deriveSavingThrows } from './savingThrows';
import { derivePassivePerception, deriveSkills } from './skills';
import { deriveSpecies } from './species';
import { deriveCharacterSubclass } from './subclasses';
import { deriveSpellcastingProviders } from './spellcasting';
import type { DerivedBackgroundState, DerivedCharacterState, DerivedResource, DerivedRuleEffectSource, DerivedSpeciesState, DerivedWeaponAttack } from './types';
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

export function deriveCharacterState(character: Character, registry: ContentRegistry): RuleResult<DerivedCharacterState> {
  const classContent = registry.findClass(character.classId);
  if (!classContent) return ruleError('missing-class', `Character class could not be resolved: ${character.classId}`, character.classId);

  let species: DerivedSpeciesState | undefined;
  if (character.speciesId) {
    const speciesContent = registry.findSpecies(character.speciesId);
    if (!speciesContent) return ruleError('missing-species', `Character Species could not be resolved: ${character.speciesId}`, character.speciesId);
    const derivedSpecies = deriveSpecies(speciesContent, character);
    if (!derivedSpecies.ok) return derivedSpecies;
    species = derivedSpecies.value;
  }

  let background: DerivedBackgroundState | undefined;
  let backgroundSkills: readonly typeof character.skillProficiencies[number][] = [];
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
  const ruleEffects = [...speciesRuleEffects, ...featRuleEffects, ...classState.value.effects, ...subclassState.value.effects];
  const ruleEffectSources: DerivedRuleEffectSource[] = [
    ...(species && species.automatedEffects.length > 0 ? [{ contentId: species.id, name: species.name, effects: species.automatedEffects }] : []),
    ...featState.value.feats.map((feat) => ({
      contentId: feat.id,
      name: feat.name,
      effects: feat.automatedEffects.filter((effect): effect is CharacterRuleEffect => effect.type !== 'ability-score-increase'),
    })),
    ...classState.value.classState.acquiredFeatures.map((feature) => ({ contentId: feature.id, name: feature.name, effects: feature.automatedEffects })),
    ...(subclassState.value.subclass?.acquiredFeatures.map((feature) => ({ contentId: feature.id, name: feature.name, effects: feature.automatedEffects })) ?? []),
  ].filter((source) => source.effects.length > 0);

  const proficiency = deriveProficiencyBonus(character.level, classContent);
  if (!proficiency.ok) return proficiency;
  const health = deriveHealth(effectiveCharacter, classContent, ruleEffects);
  if (!health.ok) return health;
  const abilityModifiers = deriveAbilityModifiers(effectiveScores);
  const initiative = deriveInitiative(abilityModifiers.dexterity, proficiency.value, ruleEffectSources);
  const classResources = deriveResourceDefinitions(character.level, [...classContent.resources, ...classState.value.resources, ...subclassState.value.resources], [...classState.value.resourceConsumers, ...subclassState.value.resourceConsumers], abilityModifiers);
  if (!classResources.ok) return classResources;

  const spellcasting = deriveSpellcastingProviders([...classState.value.spellcastingProviders, ...subclassState.value.spellcastingProviders], character.level, abilityModifiers, proficiency.value, registry, [...classState.value.spellGrants, ...subclassState.value.spellGrants], character.spellcastingSelections);
  if (!spellcasting.ok) return spellcasting;
  const resources = combineResources(classResources.value, spellcasting.value.resources);
  if (!resources.ok) return resources;
  const resourceTransactions = deriveResourceTransactions(character.level, [...classState.value.resourceTransactions, ...subclassState.value.resourceTransactions], resources.value, spellcasting.value.providers);
  if (!resourceTransactions.ok) return resourceTransactions;
  const activeSelfEffects = deriveActiveSelfEffects([...classState.value.activeSelfEffects, ...subclassState.value.activeSelfEffects]);
  if (!activeSelfEffects.ok) return activeSelfEffects;
  const savingThrows = deriveSavingThrows(abilityModifiers, proficiency.value, classContent, ruleEffects);
  const skillProficiencies = [...new Set([...character.skillProficiencies, ...backgroundSkills, ...(species?.skillProficiencies ?? [])])];
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

  return ruleOk({
    characterId: character.id,
    classId: classContent.id,
    className: classContent.name,
    classState: classState.value.classState,
    ...(subclassState.value.subclass ? { subclass: subclassState.value.subclass } : {}),
    ...(species ? { species } : {}),
    ...(background ? { background } : {}),
    feats: featState.value.feats,
    spellcasting: spellcasting.value.providers,
    ruleEffects,
    ruleEffectSources,
    initiative,
    level: character.level,
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
