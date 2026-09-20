import type { AbilityKey, Character } from '../models/character';
import type { CharacterRuleEffect, ClassContent, WeaponContent, WeaponProperty } from '../models/content';
import type { ContentId } from '../models/contentId';
import type { ContentRegistry } from '../services/contentRegistry';
import { getTotalCharacterLevel } from './characterProgression';
import { deriveProficiencyBonus } from './proficiency';
import { ruleError, ruleOk, type RuleResult } from './result';
import type {
  DerivedAbilityModifiers,
  DerivedWeaponAttack,
  DerivedWeaponDamageConfiguration,
  WeaponDamageMode,
  WeaponUseMode,
} from './types';

function property<T extends WeaponProperty['type']>(weapon: WeaponContent, type: T) {
  return weapon.properties.find((candidate): candidate is Extract<WeaponProperty, { type: T }> => candidate.type === type);
}

export function isWeaponProficient(classContent: ClassContent, weapon: WeaponContent): boolean {
  return classContent.weaponProficiencies.some((rule) => {
    if (rule.category !== weapon.category) return false;
    if (rule.kind === 'category') return true;
    return rule.anyOfProperties.some((required) => weapon.properties.some((candidate) => candidate.type === required));
  });
}

export interface WeaponMasteryOwnerAccess {
  readonly classId: ContentId;
  readonly className: string;
  readonly classLevel: number;
  readonly choices: number;
}

export interface WeaponMasteryAccess {
  readonly totalChoices: number;
  readonly owners: readonly WeaponMasteryOwnerAccess[];
}

export function deriveWeaponMasteryAccess(
  character: Pick<Character, 'classProgressions'>,
  registry: ContentRegistry,
): RuleResult<WeaponMasteryAccess> {
  const owners: WeaponMasteryOwnerAccess[] = [];
  for (const progression of [...character.classProgressions].sort((left, right) => left.classId.localeCompare(right.classId))) {
    const classContent = registry.findClass(progression.classId);
    if (!classContent) return ruleError('missing-class', `Character class could not be resolved: ${progression.classId}`, progression.classId);
    const row = classContent.progression.find((candidate) => candidate.level === progression.level);
    if (!row) return ruleError('invalid-level', `${classContent.name} has no progression row for class level ${progression.level}.`, classContent.id);
    const choices = row.weaponMasteryChoices ?? 0;
    if (choices > 0) owners.push({ classId: classContent.id, className: classContent.name, classLevel: progression.level, choices });
  }
  return ruleOk({
    totalChoices: owners.reduce((total, owner) => total + owner.choices, 0),
    owners,
  });
}

export function getWeaponAttackAbilityOptions(weapon: WeaponContent): readonly AbilityKey[] {
  if (property(weapon, 'finesse')) return ['strength', 'dexterity'];
  return [weapon.mode === 'melee' ? 'strength' : 'dexterity'];
}

export function getWeaponUseModes(weapon: WeaponContent): readonly WeaponUseMode[] {
  const modes: WeaponUseMode[] = [weapon.mode];
  if (property(weapon, 'thrown')) modes.push('thrown');
  return modes;
}

function defaultAttackAbility(options: readonly AbilityKey[], modifiers: DerivedAbilityModifiers): AbilityKey {
  return options.reduce((best, ability) => modifiers[ability] > modifiers[best] ? ability : best, options[0]);
}

function validateUseMode(weapon: WeaponContent, useMode: WeaponUseMode): boolean {
  if (useMode === 'thrown') return Boolean(property(weapon, 'thrown'));
  return weapon.mode === useMode;
}

export interface WeaponAttackOptions {
  readonly useMode?: WeaponUseMode;
  readonly attackAbility?: AbilityKey;
  readonly damageMode?: WeaponDamageMode;
  readonly displayName?: string;
  readonly inventoryEntryId?: string;
}

export function deriveWeaponAttack(
  character: Character,
  classContent: ClassContent,
  registry: ContentRegistry,
  abilityModifiers: DerivedAbilityModifiers,
  weaponId: ContentId,
  options: WeaponAttackOptions = {},
  ruleEffects: readonly CharacterRuleEffect[] = [],
): RuleResult<DerivedWeaponAttack> {
  const weapon = registry.findWeapon(weaponId);
  if (!weapon) return ruleError('missing-weapon', `Weapon could not be resolved: ${weaponId}`, weaponId);
  const masteryAccess = deriveWeaponMasteryAccess(character, registry);
  if (!masteryAccess.ok) return masteryAccess;

  const useMode = options.useMode ?? weapon.mode;
  if (!validateUseMode(weapon, useMode)) return ruleError('invalid-weapon-use', `${weapon.name} cannot be used with attack mode ${useMode}.`, weapon.id);

  const proficiency = deriveProficiencyBonus(getTotalCharacterLevel(character), classContent);
  if (!proficiency.ok) return proficiency;

  const applicableAttackAbilities = getWeaponAttackAbilityOptions(weapon);
  const selectedAbility = options.attackAbility ?? defaultAttackAbility(applicableAttackAbilities, abilityModifiers);
  if (!applicableAttackAbilities.includes(selectedAbility)) return ruleError('invalid-attack-ability', `${selectedAbility} is not a valid attack ability for ${weapon.name}.`, weapon.id);

  const proficient = isWeaponProficient(classContent, weapon);
  const abilityModifier = abilityModifiers[selectedAbility];
  const featAttackBonus = ruleEffects
    .filter((effect): effect is Extract<CharacterRuleEffect, { type: 'attack-roll-bonus' }> => effect.type === 'attack-roll-bonus' && effect.weaponMode === weapon.mode)
    .reduce((total, effect) => total + effect.amount, 0);
  const versatile = property(weapon, 'versatile');
  const damageConfigurations: DerivedWeaponDamageConfiguration[] = [];

  if (versatile && weapon.mode === 'melee' && useMode !== 'thrown') {
    damageConfigurations.push(
      { mode: 'one-handed', base: weapon.damage, abilityModifier, damageType: weapon.damageType },
      { mode: 'two-handed', base: versatile.alternateDamage, abilityModifier, damageType: weapon.damageType },
    );
  } else {
    damageConfigurations.push({ mode: 'standard', base: weapon.damage, abilityModifier, damageType: weapon.damageType });
  }

  const requestedDamageMode = options.damageMode;
  const selectedDamage = requestedDamageMode ? damageConfigurations.find((candidate) => candidate.mode === requestedDamageMode) : damageConfigurations[0];
  if (!selectedDamage) return ruleError('invalid-damage-mode', `${requestedDamageMode} is not a valid damage mode for ${weapon.name}.`, weapon.id);

  const mastery = registry.findMastery(weapon.masteryId);
  if (!mastery) return ruleError('missing-mastery', `Weapon mastery could not be resolved: ${weapon.masteryId}`, weapon.masteryId);

  return ruleOk({
    weaponId: weapon.id,
    ...(options.inventoryEntryId ? { inventoryEntryId: options.inventoryEntryId } : {}),
    name: options.displayName?.trim() || weapon.name,
    baseName: weapon.name,
    useMode,
    proficient,
    applicableAttackAbilities,
    attackAbility: selectedAbility,
    attackModifier: abilityModifier + (proficient ? proficiency.value : 0) + featAttackBonus,
    damage: { base: selectedDamage.base, abilityModifier: selectedDamage.abilityModifier, damageType: selectedDamage.damageType },
    damageConfigurations,
    properties: weapon.properties,
    mastery: { id: mastery.id, name: mastery.name, canPotentiallyUse: masteryAccess.value.totalChoices > 0 },
  });
}
