import { ABILITY_KEYS, SKILL_IDS, isSkillId } from '../models/character';
import type { ActiveSelfEffectDefinition, ArmorContent, BackgroundContent, CharacterRuleEffect, ClassContent, ClassResourceDefinition, ContentEntry, FeatContent, ResourceTransactionDefinition, SpeciesContent, SpellContent, SpellcastingProviderDefinition, SubclassContent, WeaponContent } from '../models/content';
import { SRD_ID_PREFIX } from '../content/srd/source';

export interface ContentValidationIssue {
  readonly code: string;
  readonly contentId?: string;
  readonly message: string;
}

function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function containsExecutable(value: unknown): boolean {
  if (typeof value === 'function') return true;
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some(containsExecutable);
}

function validateActiveSelfEffect(effect: ActiveSelfEffectDefinition, contentId: string, issues: ContentValidationIssue[]) {
  if (containsExecutable(effect)) issues.push({ code: 'active-self-effect-executable', contentId, message: `Active self effect ${effect.name} cannot contain executable values.` });
  if (!hasOnlyKeys(effect, ['id', 'name', 'description', 'activationTiming', 'activationCost', 'modifiers', 'restrictions', 'eligibility', 'termination', 'clearOnRest', 'referenceText'])) issues.push({ code: 'active-self-effect', contentId, message: `Active self effect ${effect.name} contains unsupported fields.` });
  if (!effect.id?.trim() || !effect.name?.trim() || !effect.description?.trim()) issues.push({ code: 'active-self-effect', contentId, message: 'Active self effects require stable IDs, names, and descriptions.' });
  if (!['bonus-action', 'start-of-turn', 'manual'].includes(effect.activationTiming)) issues.push({ code: 'active-self-effect-timing', contentId, message: `Active self effect ${effect.name} has an unsupported activation timing.` });
  if (effect.activationCost && (!effect.activationCost.resourceId?.trim() || !Number.isInteger(effect.activationCost.amount) || effect.activationCost.amount < 1)) issues.push({ code: 'active-self-effect-resource', contentId, message: `Active self effect ${effect.name} has an invalid activation resource cost.` });

  for (const modifier of effect.modifiers ?? []) {
    if (modifier.type === 'd20-roll-mode') {
      if (!['advantage', 'disadvantage'].includes(modifier.mode)) issues.push({ code: 'active-self-effect-modifier', contentId, message: `Active self effect ${effect.name} has an invalid D20 mode.` });
      const target = modifier.target;
      if (!['ability-check', 'saving-throw', 'weapon-attack', 'spell-attack'].includes(target.kind)) issues.push({ code: 'active-self-effect-target', contentId, message: `Active self effect ${effect.name} has an unsupported D20 target.` });
      else if (target.kind === 'spell-attack') {
        if (target.providerIds.length === 0 || new Set(target.providerIds).size !== target.providerIds.length || target.providerIds.some((id) => !id.trim())) issues.push({ code: 'active-self-effect-target', contentId, message: `Active self effect ${effect.name} has invalid spell-attack provider targets.` });
      } else if (target.abilities.length === 0 || new Set(target.abilities).size !== target.abilities.length || target.abilities.some((ability) => !ABILITY_KEYS.includes(ability))) {
        issues.push({ code: 'active-self-effect-target', contentId, message: `Active self effect ${effect.name} has invalid ability targets.` });
      }
    } else if (modifier.type === 'spell-save-dc-bonus') {
      if (modifier.providerIds.length === 0 || new Set(modifier.providerIds).size !== modifier.providerIds.length || modifier.providerIds.some((id) => !id.trim()) || !Number.isInteger(modifier.amount)) issues.push({ code: 'active-self-effect-modifier', contentId, message: `Active self effect ${effect.name} has an invalid spell save DC modifier.` });
    } else if (modifier.type === 'weapon-damage-bonus') {
      const invalidAbilities = modifier.abilities.length === 0 || new Set(modifier.abilities).size !== modifier.abilities.length || modifier.abilities.some((ability) => !ABILITY_KEYS.includes(ability));
      const amount = modifier.amount;
      const invalidAmount = amount.kind === 'fixed'
        ? !Number.isInteger(amount.amount)
        : amount.kind === 'level-table'
          ? amount.values.length === 0 || amount.values.some((row, index) => !Number.isInteger(row.level) || row.level < 1 || row.level > 20 || !Number.isInteger(row.amount) || (index > 0 && row.level <= amount.values[index - 1].level))
          : true;
      if (invalidAbilities || invalidAmount) issues.push({ code: 'active-self-effect-modifier', contentId, message: `Active self effect ${effect.name} has an invalid weapon damage modifier.` });
    } else {
      issues.push({ code: 'active-self-effect-modifier', contentId, message: `Active self effect ${effect.name} has an unsupported modifier kind.` });
    }
  }

  for (const restriction of effect.restrictions ?? []) {
    if (!((restriction.type === 'concentration' && restriction.mode === 'end-and-block') || (restriction.type === 'spellcasting' && restriction.mode === 'block'))) issues.push({ code: 'active-self-effect-restriction', contentId, message: `Active self effect ${effect.name} has an unsupported restriction.` });
  }
  for (const eligibility of effect.eligibility ?? []) {
    if (eligibility.type !== 'not-wearing-armor-category' || !['light', 'medium', 'heavy'].includes(eligibility.category)) issues.push({ code: 'active-self-effect-eligibility', contentId, message: `Active self effect ${effect.name} has invalid eligibility metadata.` });
  }
  for (const termination of effect.termination ?? []) {
    if (termination.type === 'condition') {
      if (termination.condition !== 'incapacitated') issues.push({ code: 'active-self-effect-termination', contentId, message: `Active self effect ${effect.name} has an unsupported termination condition.` });
    } else if (termination.type === 'wearing-armor-category') {
      if (!['light', 'medium', 'heavy'].includes(termination.category)) issues.push({ code: 'active-self-effect-termination', contentId, message: `Active self effect ${effect.name} has invalid armor termination metadata.` });
    } else {
      issues.push({ code: 'active-self-effect-termination', contentId, message: `Active self effect ${effect.name} has an unsupported termination rule.` });
    }
  }
  if (effect.clearOnRest && !['short-rest', 'long-rest'].includes(effect.clearOnRest)) issues.push({ code: 'active-self-effect-rest', contentId, message: `Active self effect ${effect.name} has an invalid rest-clear policy.` });
}

function validDamage(weapon: WeaponContent): boolean {
  return weapon.damage.kind === 'fixed'
    ? Number.isInteger(weapon.damage.amount) && weapon.damage.amount > 0
    : Number.isInteger(weapon.damage.count) && weapon.damage.count > 0 && [4, 6, 8, 10, 12].includes(weapon.damage.die);
}

function validArmorClass(armor: ArmorContent): boolean {
  if (armor.armorClass.kind === 'shield') {
    return armor.category === 'shield' && armor.armorClass.bonus > 0;
  }
  if (!Number.isInteger(armor.armorClass.base) || armor.armorClass.base <= 0) return false;
  return armor.armorClass.dexterity !== 'capped' || (armor.armorClass.dexterityCap ?? 0) >= 0;
}

function validateSpecies(entry: SpeciesContent, issues: ContentValidationIssue[]) {
  if (!Number.isInteger(entry.speedFeet) || entry.speedFeet <= 0) issues.push({ code: 'species-speed', contentId: entry.id, message: 'Species Speed must be a positive whole number.' });
  if (entry.size.kind === 'choice' && (entry.size.options.length < 2 || new Set(entry.size.options).size !== entry.size.options.length)) issues.push({ code: 'species-size', contentId: entry.id, message: 'Species size choices must be unique and provide multiple options.' });
  if (entry.senses.some((sense) => sense.type !== 'darkvision' || !Number.isInteger(sense.rangeFeet) || sense.rangeFeet <= 0)) issues.push({ code: 'species-sense', contentId: entry.id, message: 'Species senses contain invalid structured data.' });
  if (new Set(entry.choices.map((choice) => choice.id)).size !== entry.choices.length || entry.choices.some((choice) => choice.options.length === 0 || new Set(choice.options.map((option) => option.id)).size !== choice.options.length)) issues.push({ code: 'species-choice', contentId: entry.id, message: 'Species choices and choice options must use unique IDs.' });
  const skillChoice = entry.skillProficiencyChoice;
  if (skillChoice && (skillChoice.choose < 1 || skillChoice.choose > skillChoice.from.length || skillChoice.from.some((skill) => !isSkillId(skill)) || new Set(skillChoice.from).size !== skillChoice.from.length)) issues.push({ code: 'species-skill-choice', contentId: entry.id, message: 'Species skill choice data is invalid.' });
  for (const effect of entry.effects ?? []) validateCharacterRuleEffect(effect, entry.id, issues);
}

function validateBackground(entry: BackgroundContent, issues: ContentValidationIssue[]) {
  if (new Set(entry.abilityScores).size !== 3 || entry.abilityScores.some((ability) => !ABILITY_KEYS.includes(ability))) issues.push({ code: 'background-abilities', contentId: entry.id, message: 'Background ability options must contain three unique abilities.' });
  if (new Set(entry.skillProficiencies).size !== 2 || entry.skillProficiencies.some((skill) => !isSkillId(skill))) issues.push({ code: 'background-skills', contentId: entry.id, message: 'Background skill proficiencies must contain two unique standard skills.' });
  if (entry.toolProficiency.kind === 'choice' && (entry.toolProficiency.options.length === 0 || new Set(entry.toolProficiency.options.map((option) => option.id)).size !== entry.toolProficiency.options.length)) issues.push({ code: 'background-tool', contentId: entry.id, message: 'Background tool choices must contain unique options.' });
  if (!entry.originFeat.id || !entry.originFeat.name) issues.push({ code: 'background-origin-feat', contentId: entry.id, message: 'Background Origin Feat references require a stable ID and display name.' });
}

function validAbilityList(abilities: readonly string[]): boolean {
  return abilities.length > 0 && new Set(abilities).size === abilities.length && abilities.every((ability) => ABILITY_KEYS.includes(ability as (typeof ABILITY_KEYS)[number]));
}

function validLevelAmount(amount: { readonly kind: string; readonly amount?: number; readonly values?: readonly { readonly level: number; readonly amount: number }[] }): boolean {
  if (amount.kind === 'fixed') return Number.isInteger(amount.amount);
  if (amount.kind !== 'level-table' || !Array.isArray(amount.values) || amount.values.length === 0) return false;
  return amount.values.every((row, index) =>
    Number.isInteger(row.level)
    && row.level >= 1
    && row.level <= 20
    && Number.isInteger(row.amount)
    && (index === 0 || row.level > amount.values![index - 1].level)
  );
}

function validateCharacterRuleEffect(effect: CharacterRuleEffect, contentId: string, issues: ContentValidationIssue[]) {
  if (containsExecutable(effect)) {
    issues.push({ code: 'rule-effect-executable', contentId, message: 'Character rule effects cannot contain executable values.' });
    return;
  }
  if (effect.type === 'attack-roll-bonus') {
    if (!hasOnlyKeys(effect, ['type', 'weaponMode', 'amount']) || effect.weaponMode !== 'ranged' || !Number.isFinite(effect.amount)) issues.push({ code: 'rule-effect', contentId, message: 'Attack-roll bonus effect is malformed.' });
    return;
  }
  if (effect.type === 'armor-class-bonus') {
    const categories = effect.armorCategories;
    if (!hasOnlyKeys(effect, ['type', 'armorCategories', 'amount']) || !Number.isFinite(effect.amount) || categories.length === 0 || new Set(categories).size !== categories.length || categories.some((category) => !['light', 'medium', 'heavy'].includes(category))) issues.push({ code: 'rule-effect', contentId, message: 'Armor Class bonus effect is malformed.' });
    return;
  }
  if (effect.type === 'skill-check-advantage') {
    if (!hasOnlyKeys(effect, ['type', 'skillIds']) || effect.skillIds.length === 0 || effect.skillIds.some((skill) => !isSkillId(skill)) || new Set(effect.skillIds).size !== effect.skillIds.length) issues.push({ code: 'rule-effect', contentId, message: 'Skill-check Advantage effect must reference unique standard skills.' });
    return;
  }
  if (effect.type === 'saving-throw-roll-mode') {
    if (!hasOnlyKeys(effect, ['type', 'abilities', 'mode']) || !validAbilityList(effect.abilities) || !['advantage', 'disadvantage'].includes(effect.mode)) issues.push({ code: 'rule-effect', contentId, message: 'Saving-throw roll-mode effect is malformed.' });
    return;
  }
  if (effect.type === 'saving-throw-proficiency') {
    if (!hasOnlyKeys(effect, ['type', 'abilities']) || !validAbilityList(effect.abilities)) issues.push({ code: 'rule-effect', contentId, message: 'Saving-throw proficiency effect is malformed.' });
    return;
  }
  if (effect.type === 'initiative-modifier') {
    if (!hasOnlyKeys(effect, ['type', 'amount']) || !Number.isInteger(effect.amount)) issues.push({ code: 'rule-effect', contentId, message: 'Initiative modifier effects require a finite whole-number amount.' });
    return;
  }
  if (effect.type === 'initiative-proficiency' || effect.type === 'initiative-half-proficiency') {
    if (!hasOnlyKeys(effect, ['type'])) issues.push({ code: 'rule-effect', contentId, message: 'Initiative proficiency effect contains unsupported fields.' });
    return;
  }
  if (effect.type === 'initiative-roll-mode') {
    if (!hasOnlyKeys(effect, ['type', 'mode']) || (effect.mode !== 'advantage' && effect.mode !== 'disadvantage')) issues.push({ code: 'rule-effect', contentId, message: 'Initiative roll-mode effects require Advantage or Disadvantage.' });
    return;
  }
  if (effect.type === 'hit-point-bonus-per-class-level') {
    if (!hasOnlyKeys(effect, ['type', 'amount']) || !Number.isInteger(effect.amount) || effect.amount < 1) issues.push({ code: 'rule-effect', contentId, message: 'Hit Point bonus-per-class-level effects require a positive whole-number amount.' });
    return;
  }
  if (effect.type === 'speed-bonus') {
    const categories = effect.disallowedArmorCategories ?? [];
    if (!hasOnlyKeys(effect, ['type', 'amount', 'disallowedArmorCategories', 'requireNoShield']) || !validLevelAmount(effect.amount) || new Set(categories).size !== categories.length || categories.some((category) => !['light', 'medium', 'heavy'].includes(category)) || (effect.requireNoShield !== undefined && typeof effect.requireNoShield !== 'boolean')) issues.push({ code: 'rule-effect', contentId, message: 'Speed bonus effect is malformed.' });
    return;
  }
  if (effect.type === 'critical-threshold') {
    if (!hasOnlyKeys(effect, ['type', 'attackKind', 'minimumNatural']) || effect.attackKind !== 'weapon' || !Number.isInteger(effect.minimumNatural) || effect.minimumNatural < 2 || effect.minimumNatural > 20) issues.push({ code: 'rule-effect', contentId, message: 'Critical-threshold effect is malformed.' });
    return;
  }
  if (effect.type === 'dice-transformation') {
    if (!hasOnlyKeys(effect, ['type', 'id', 'optional', 'target', 'transformation']) || !effect.id?.trim() || typeof effect.optional !== 'boolean' || !effect.target || !effect.transformation) {
      issues.push({ code: 'dice-transformation', contentId, message: 'Dice transformation effect requires a stable ID, bounded target, optional flag, and transformation.' });
      return;
    }
    const target = effect.target;
    let validTarget = false;
    if (target.kind === 'd20-test') validTarget = hasOnlyKeys(target, ['kind']);
    if (target.kind === 'skill-check') validTarget = hasOnlyKeys(target, ['kind', 'requireProficiency']) && typeof target.requireProficiency === 'boolean';
    if (target.kind === 'weapon-damage') validTarget = hasOnlyKeys(target, ['kind', 'weaponMode', 'heldWithTwoHands', 'anyWeaponProperties'])
      && target.weaponMode === 'melee'
      && target.heldWithTwoHands === true
      && target.anyWeaponProperties.length > 0
      && new Set(target.anyWeaponProperties).size === target.anyWeaponProperties.length
      && target.anyWeaponProperties.every((property) => property === 'two-handed' || property === 'versatile');
    if (!validTarget) issues.push({ code: 'dice-transformation-target', contentId, message: 'Dice transformation has an unsupported or malformed roll scope.' });

    const transformation = effect.transformation;
    if (transformation.type === 'reroll-once-use-new') {
      if (!hasOnlyKeys(transformation, ['type', 'die', 'qualifyingFaces']) || transformation.die !== 20 || transformation.qualifyingFaces.length === 0 || new Set(transformation.qualifyingFaces).size !== transformation.qualifyingFaces.length || transformation.qualifyingFaces.some((face) => !Number.isInteger(face) || face < 1 || face > 20)) issues.push({ code: 'dice-transformation', contentId, message: 'Reroll-once/use-new transformation is malformed.' });
      if (target.kind === 'weapon-damage') issues.push({ code: 'dice-transformation-target', contentId, message: 'D20 rerolls cannot target weapon-damage dice.' });
      return;
    }
    if (transformation.type === 'minimum-die-face') {
      if (!hasOnlyKeys(transformation, ['type', 'minimum']) || !Number.isInteger(transformation.minimum) || transformation.minimum < 1 || transformation.minimum > 12) issues.push({ code: 'dice-transformation', contentId, message: 'Minimum-die-face transformation is malformed.' });
      if (target.kind !== 'weapon-damage') issues.push({ code: 'dice-transformation-target', contentId, message: 'Minimum-die-face transformations require the bounded weapon-damage target.' });
      return;
    }
    issues.push({ code: 'dice-transformation', contentId, message: 'Unsupported dice transformation kind.' });
    return;
  }
  if (effect.type === 'unarmored-armor-class') {
    if (!hasOnlyKeys(effect, ['type', 'base', 'abilities', 'allowShield']) || !Number.isInteger(effect.base) || effect.base < 0 || !validAbilityList(effect.abilities) || typeof effect.allowShield !== 'boolean') issues.push({ code: 'rule-effect', contentId, message: 'Unarmored Armor Class effects require a valid base and unique standard abilities.' });
    return;
  }
  issues.push({ code: 'rule-effect', contentId, message: 'Unsupported Character rule effect.' });
}

function validateResourceConsumerEffects(entry: ClassContent | SubclassContent, issues: ContentValidationIssue[]) {
  for (const feature of entry.progression.flatMap((row) => row.features)) {
    for (const grant of feature.resourceConsumers ?? []) {
      const effect = grant.consumer.effect;
      if (effect.type === 'fixed-expend' && (!Number.isInteger(effect.amount) || effect.amount < 1)) {
        issues.push({ code: 'resource-consumer-effect', contentId: entry.id, message: `Resource consumer ${grant.consumer.name} requires a positive whole-number fixed expenditure.` });
      }
    }
  }
}

function validateResourceDefinition(resource: ClassResourceDefinition, contentId: string, issues: ContentValidationIssue[]) {
  if (!resource.id.trim() || !resource.name.trim()) issues.push({ code: 'invalid-resource-definition', contentId, message: 'Resource definitions require stable IDs and names.' });
  if (resource.recovery.some((rule) =>
    !['short-rest', 'long-rest'].includes(rule.trigger) ||
    !['all', 'amount'].includes(rule.mode) ||
    (rule.mode === 'amount' && (!Number.isInteger(rule.amount) || rule.amount < 1)) ||
    (rule.minimumLevel !== undefined && (!Number.isInteger(rule.minimumLevel) || rule.minimumLevel < 1 || rule.minimumLevel > 20))
  )) issues.push({ code: 'invalid-resource-recovery', contentId, message: `Resource ${resource.name} has invalid recovery metadata.` });
  if (new Set(resource.recovery.map((rule) => `${rule.trigger}:${rule.minimumLevel ?? 1}`)).size !== resource.recovery.length) issues.push({ code: 'duplicate-resource-recovery', contentId, message: `Resource ${resource.name} defines duplicate recovery rules at the same trigger and level.` });
  if (resource.maximum.kind === 'level-table') {
    const values = resource.maximum.values;
    if (values.length === 0 || values.some((row, index) => !Number.isInteger(row.level) || row.level < 1 || row.level > 20 || !Number.isInteger(row.uses) || row.uses < 0 || (index > 0 && row.level <= values[index - 1].level))) issues.push({ code: 'invalid-resource-maximum', contentId, message: `Resource ${resource.name} has invalid ordered maximum-use progression.` });
  } else if (!ABILITY_KEYS.includes(resource.maximum.ability) || !Number.isInteger(resource.maximum.minimum) || resource.maximum.minimum < 0 || (resource.maximum.minimumLevel !== undefined && (!Number.isInteger(resource.maximum.minimumLevel) || resource.maximum.minimumLevel < 1 || resource.maximum.minimumLevel > 20))) {
    issues.push({ code: 'invalid-resource-maximum', contentId, message: `Resource ${resource.name} has invalid ability-derived maximum metadata.` });
  }
  if (resource.presentation !== undefined && !['pips', 'numeric'].includes(resource.presentation)) issues.push({ code: 'invalid-resource-presentation', contentId, message: `Resource ${resource.name} has invalid presentation metadata.` });
}

function validateResourceTransaction(definition: ResourceTransactionDefinition, contentId: string, issues: ContentValidationIssue[]) {
  const rawKind = (definition as { kind?: unknown }).kind;
  if (!definition.id?.trim() || !definition.name?.trim()) issues.push({ code: 'resource-transaction', contentId, message: 'Resource transactions require stable IDs and names.' });
  if (rawKind === 'restore-resource') {
    const typed = definition as Extract<ResourceTransactionDefinition, { kind: 'restore-resource' }>;
    const restore = typed.restore as { kind?: unknown; amount?: unknown; maximum?: unknown };
    if (!typed.targetResourceId?.trim()) issues.push({ code: 'resource-transaction', contentId, message: `${typed.name} requires a target resource.` });
    if (typed.usageResourceId !== undefined && !typed.usageResourceId.trim()) issues.push({ code: 'resource-transaction', contentId, message: `${typed.name} has an invalid usage-resource reference.` });
    if (restore.kind === 'fixed') {
      if (!Number.isInteger(restore.amount) || Number(restore.amount) <= 0) issues.push({ code: 'resource-transaction', contentId, message: `${typed.name} fixed restoration must be a positive whole number.` });
    } else if (restore.kind === 'selected') {
      if (!Number.isInteger(restore.maximum) || Number(restore.maximum) <= 0) issues.push({ code: 'resource-transaction', contentId, message: `${typed.name} selected restoration limit must be a positive whole number.` });
    } else issues.push({ code: 'resource-transaction', contentId, message: `${typed.name} uses an unsupported restoration policy.` });
    return;
  }
  if (rawKind === 'restore-spell-slots-with-budget') {
    const typed = definition as Extract<ResourceTransactionDefinition, { kind: 'restore-spell-slots-with-budget' }>;
    if (!typed.providerId?.trim() || !typed.usageResourceId?.trim()) issues.push({ code: 'resource-transaction', contentId, message: `${typed.name} requires provider and usage-resource references.` });
    if (typed.budget?.kind !== 'half-level-round-up') issues.push({ code: 'resource-transaction', contentId, message: `${typed.name} uses an unsupported recovery budget formula.` });
    if (!Number.isInteger(typed.maximumSpellLevel) || typed.maximumSpellLevel < 1 || typed.maximumSpellLevel > 9) issues.push({ code: 'resource-transaction', contentId, message: `${typed.name} requires a valid maximum spell-slot level.` });
    if (typed.timing !== 'short-rest') issues.push({ code: 'resource-transaction', contentId, message: `${typed.name} uses an unsupported transaction timing policy.` });
    return;
  }
  issues.push({ code: 'resource-transaction', contentId, message: 'Unsupported resource transaction kind.' });
}

function validateFeat(entry: FeatContent, issues: ContentValidationIssue[]) {
  if (!['origin', 'general', 'fighting-style', 'epic-boon'].includes(entry.category)) issues.push({ code: 'feat-category', contentId: entry.id, message: 'Feat category is invalid.' });
  if (new Set(entry.choices.map((choice) => choice.id)).size !== entry.choices.length) issues.push({ code: 'feat-choice', contentId: entry.id, message: 'Feat choice IDs must be unique.' });
  for (const prerequisite of entry.prerequisites) {
    if (prerequisite.type === 'level' && (!Number.isInteger(prerequisite.minimum) || prerequisite.minimum < 1 || prerequisite.minimum > 20)) issues.push({ code: 'feat-prerequisite', contentId: entry.id, message: 'Feat level prerequisite is invalid.' });
    if (prerequisite.type === 'ability-minimum' && (prerequisite.abilities.length === 0 || prerequisite.abilities.some((ability) => !ABILITY_KEYS.includes(ability)) || !Number.isInteger(prerequisite.minimum))) issues.push({ code: 'feat-prerequisite', contentId: entry.id, message: 'Feat ability prerequisite is invalid.' });
  }
  for (const effect of entry.effects) {
    if (effect.type === 'ability-score-increase' && (!entry.choices.some((choice) => choice.id === effect.choiceId && choice.support === 'structured') || effect.allowedAbilities.some((ability) => !ABILITY_KEYS.includes(ability)))) issues.push({ code: 'feat-effect', contentId: entry.id, message: 'Feat ability-score effect references invalid structured choice data.' });
    if (effect.type !== 'ability-score-increase') validateCharacterRuleEffect(effect, entry.id, issues);
  }
}

const SPELL_SCHOOLS = new Set(['abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion', 'necromancy', 'transmutation']);
const SPELL_DICE = new Set([4, 6, 8, 10, 12]);
const SPELL_DAMAGE_TYPES = new Set(['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder']);
const SPELL_MECHANIC_TYPES = ['spell-attack', 'saving-throw', 'damage', 'healing'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validSpellDice(terms: unknown): boolean {
  return Array.isArray(terms)
    && terms.length > 0
    && terms.every((term) => isRecord(term)
      && hasOnlyKeys(term, ['count', 'die'])
      && typeof term.count === 'number'
      && Number.isInteger(term.count)
      && term.count > 0
      && typeof term.die === 'number'
      && SPELL_DICE.has(term.die));
}

function validSpellAmount(amount: unknown): boolean {
  return isRecord(amount)
    && hasOnlyKeys(amount, ['dice', 'modifier'])
    && validSpellDice(amount.dice)
    && (amount.modifier === 'none' || amount.modifier === 'spellcasting-ability');
}

function validSpellScaling(scaling: unknown, spellLevel: number): boolean {
  if (!isRecord(scaling) || typeof scaling.kind !== 'string') return false;

  if (scaling.kind === 'character-level-dice') {
    if (!hasOnlyKeys(scaling, ['kind', 'values']) || spellLevel !== 0 || !Array.isArray(scaling.values) || scaling.values.length === 0) return false;
    const values = scaling.values;
    return values.every((row, index) => {
      if (!isRecord(row) || !hasOnlyKeys(row, ['level', 'dice']) || typeof row.level !== 'number' || !Number.isInteger(row.level) || row.level < 1 || row.level > 20 || !validSpellDice(row.dice)) return false;
      if (index === 0) return row.level === 1;
      const previous = values[index - 1];
      return isRecord(previous) && typeof previous.level === 'number' && row.level > previous.level;
    });
  }

  if (scaling.kind === 'slot-level-dice') {
    return hasOnlyKeys(scaling, ['kind', 'baseSpellLevel', 'dicePerLevel'])
      && spellLevel > 0
      && typeof scaling.baseSpellLevel === 'number'
      && Number.isInteger(scaling.baseSpellLevel)
      && scaling.baseSpellLevel >= 1
      && scaling.baseSpellLevel <= 9
      && scaling.baseSpellLevel === spellLevel
      && validSpellDice(scaling.dicePerLevel);
  }

  return false;
}

function validateSpellMechanic(mechanic: unknown, spellLevel: number, contentId: string, issues: ContentValidationIssue[]): void {
  if (containsExecutable(mechanic)) {
    issues.push({ code: 'spell-mechanic-executable', contentId, message: 'Spell mechanics cannot contain executable values.' });
    return;
  }

  if (!isRecord(mechanic) || typeof mechanic.type !== 'string') {
    issues.push({ code: 'spell-mechanic', contentId, message: 'Spell mechanic must be a declarative object with a supported mechanic type.' });
    return;
  }

  if (mechanic.type === 'spell-attack') {
    if (!hasOnlyKeys(mechanic, ['type', 'attackType']) || (mechanic.attackType !== 'melee' && mechanic.attackType !== 'ranged')) {
      issues.push({ code: 'spell-mechanic', contentId, message: 'Spell-attack mechanics require exactly a supported melee or ranged attack type.' });
    }
    return;
  }

  if (mechanic.type === 'saving-throw') {
    if (!hasOnlyKeys(mechanic, ['type', 'ability', 'onSuccess'])
      || typeof mechanic.ability !== 'string'
      || !ABILITY_KEYS.includes(mechanic.ability as (typeof ABILITY_KEYS)[number])
      || (mechanic.onSuccess !== 'none' && mechanic.onSuccess !== 'half')) {
      issues.push({ code: 'spell-mechanic', contentId, message: 'Saving-throw mechanics require exactly a standard ability and supported success behavior.' });
    }
    return;
  }

  if (mechanic.type === 'damage') {
    if (!hasOnlyKeys(mechanic, ['type', 'amount', 'damageType', 'scaling'])
      || !validSpellAmount(mechanic.amount)
      || typeof mechanic.damageType !== 'string'
      || !SPELL_DAMAGE_TYPES.has(mechanic.damageType)) {
      issues.push({ code: 'spell-mechanic', contentId, message: 'Damage mechanics require exactly a valid roll amount, supported damage type, and optional supported scaling.' });
    }
    if (mechanic.scaling !== undefined && !validSpellScaling(mechanic.scaling, spellLevel)) {
      issues.push({ code: 'spell-scaling', contentId, message: 'Spell damage scaling is malformed or incompatible with the spell level.' });
    }
    return;
  }

  if (mechanic.type === 'healing') {
    if (!hasOnlyKeys(mechanic, ['type', 'amount', 'scaling']) || !validSpellAmount(mechanic.amount)) {
      issues.push({ code: 'spell-mechanic', contentId, message: 'Healing mechanics require exactly a valid roll amount and optional supported scaling.' });
    }
    if (mechanic.scaling !== undefined && !validSpellScaling(mechanic.scaling, spellLevel)) {
      issues.push({ code: 'spell-scaling', contentId, message: 'Spell healing scaling is malformed or incompatible with the spell level.' });
    }
    return;
  }

  issues.push({ code: 'spell-mechanic', contentId, message: `Unsupported spell mechanic kind: ${mechanic.type}` });
}

function validateSpell(entry: SpellContent, issues: ContentValidationIssue[]) {
  if (!Number.isInteger(entry.level) || entry.level < 0 || entry.level > 9) issues.push({ code: 'spell-level', contentId: entry.id, message: 'Spell level must be a whole number from 0 through 9.' });
  if (!SPELL_SCHOOLS.has(entry.school)) issues.push({ code: 'spell-school', contentId: entry.id, message: 'Spell school is invalid.' });
  if (!entry.castingTime.trim() || !entry.range.trim() || !entry.duration.trim() || !entry.description.trim()) issues.push({ code: 'spell-reference-data', contentId: entry.id, message: 'Spell casting time, range, duration, and description are required.' });
  if (entry.components.material && !entry.components.materialText?.trim()) issues.push({ code: 'spell-components', contentId: entry.id, message: 'Material spell components require reference text.' });
  if (!entry.components.material && entry.components.materialText !== undefined) issues.push({ code: 'spell-components', contentId: entry.id, message: 'Material component text requires the Material component flag.' });
  if (entry.spellLists.length === 0 || new Set(entry.spellLists.map((list) => list.id)).size !== entry.spellLists.length || entry.spellLists.some((list) => !list.id.trim() || !list.name.trim())) issues.push({ code: 'spell-list', contentId: entry.id, message: 'Spell-list references must be present, named, and unique.' });
  if (new Set(entry.referenceEffects.map((effect) => effect.id)).size !== entry.referenceEffects.length) issues.push({ code: 'spell-reference-effect', contentId: entry.id, message: 'Spell reference-only effect IDs must be unique.' });

  if (!Array.isArray(entry.mechanics)) {
    issues.push({ code: 'spell-mechanic', contentId: entry.id, message: 'Spell mechanics must be a declarative array.' });
    return;
  }

  for (const mechanic of entry.mechanics as readonly unknown[]) validateSpellMechanic(mechanic, entry.level, entry.id, issues);

  for (const type of SPELL_MECHANIC_TYPES) {
    const count = (entry.mechanics as readonly unknown[]).filter((mechanic) => isRecord(mechanic) && mechanic.type === type).length;
    if (count > 1) {
      issues.push({ code: 'spell-mechanic-combination', contentId: entry.id, message: `Spell mechanics cannot contain multiple ${type} entries because the current spell resolver supports only one of each kind.` });
    }
  }
}

const WEAPON_CATEGORIES = new Set(['simple', 'martial']);
const WEAPON_PROPERTY_TYPES = new Set(['finesse', 'light', 'heavy', 'loading', 'reach', 'two-handed', 'thrown', 'ammunition', 'versatile']);
const ARMOR_CATEGORIES = new Set(['light', 'medium', 'heavy', 'shield']);

function validMulticlassWeaponProficiencyRule(rule: unknown): boolean {
  if (!isRecord(rule) || typeof rule.kind !== 'string') return false;
  if (rule.kind === 'category') {
    return hasOnlyKeys(rule, ['kind', 'category']) && typeof rule.category === 'string' && WEAPON_CATEGORIES.has(rule.category);
  }
  if (rule.kind === 'category-with-property') {
    return hasOnlyKeys(rule, ['kind', 'category', 'anyOfProperties'])
      && typeof rule.category === 'string'
      && WEAPON_CATEGORIES.has(rule.category)
      && Array.isArray(rule.anyOfProperties)
      && rule.anyOfProperties.length > 0
      && new Set(rule.anyOfProperties).size === rule.anyOfProperties.length
      && rule.anyOfProperties.every((property) => typeof property === 'string' && WEAPON_PROPERTY_TYPES.has(property));
  }
  return false;
}

function validMulticlassTool(tool: unknown): boolean {
  return isRecord(tool)
    && hasOnlyKeys(tool, ['id', 'name'])
    && typeof tool.id === 'string'
    && tool.id.trim().length > 0
    && typeof tool.name === 'string'
    && tool.name.trim().length > 0;
}

function validMulticlassSkillChoice(choice: unknown, classSkillIds: readonly string[]): boolean {
  if (!isRecord(choice) || typeof choice.kind !== 'string') return false;
  if (choice.kind === 'any-skill') {
    return hasOnlyKeys(choice, ['kind', 'choose'])
      && typeof choice.choose === 'number'
      && Number.isInteger(choice.choose)
      && choice.choose >= 1
      && choice.choose <= SKILL_IDS.length;
  }
  if (choice.kind === 'class-skill-list') {
    return hasOnlyKeys(choice, ['kind', 'choose'])
      && typeof choice.choose === 'number'
      && Number.isInteger(choice.choose)
      && choice.choose >= 1
      && choice.choose <= classSkillIds.length;
  }
  if (choice.kind === 'options') {
    return hasOnlyKeys(choice, ['kind', 'choose', 'from'])
      && typeof choice.choose === 'number'
      && Number.isInteger(choice.choose)
      && Array.isArray(choice.from)
      && choice.from.length > 0
      && new Set(choice.from).size === choice.from.length
      && choice.from.every((skill) => typeof skill === 'string' && isSkillId(skill))
      && choice.choose >= 1
      && choice.choose <= choice.from.length;
  }
  return false;
}

function validMulticlassToolChoice(choice: unknown): boolean {
  if (!isRecord(choice) || typeof choice.kind !== 'string') return false;
  const validIdentity = typeof choice.id === 'string' && choice.id.trim().length > 0
    && typeof choice.name === 'string' && choice.name.trim().length > 0
    && typeof choice.choose === 'number' && Number.isInteger(choice.choose) && choice.choose >= 1;
  if (!validIdentity) return false;
  if (choice.kind === 'category') {
    return hasOnlyKeys(choice, ['kind', 'id', 'name', 'choose', 'category'])
      && choice.category === 'musical-instrument';
  }
  if (choice.kind === 'options') {
    if (typeof choice.choose !== 'number' || !Array.isArray(choice.options)) return false;
    return hasOnlyKeys(choice, ['kind', 'id', 'name', 'choose', 'options'])
      && choice.options.length > 0
      && choice.options.every(validMulticlassTool)
      && new Set(choice.options.map((tool) => isRecord(tool) ? tool.id : undefined)).size === choice.options.length
      && choice.choose <= choice.options.length;
  }
  return false;
}

function validateMulticlassProficiencies(value: unknown, entry: ClassContent, issues: ContentValidationIssue[]) {
  if (containsExecutable(value)) {
    issues.push({ code: 'multiclass-proficiency-executable', contentId: entry.id, message: 'Multiclass proficiency metadata cannot contain executable values.' });
  }
  if (!isRecord(value) || !hasOnlyKeys(value, ['weaponProficiencies', 'armorTraining', 'skillChoices', 'toolProficiencies', 'toolChoices'])) {
    issues.push({ code: 'multiclass-proficiency', contentId: entry.id, message: 'Multiclass proficiency metadata must use only the supported declarative fields.' });
    return;
  }

  const weaponsValid = Array.isArray(value.weaponProficiencies) && value.weaponProficiencies.every(validMulticlassWeaponProficiencyRule);
  const armorValid = Array.isArray(value.armorTraining)
    && new Set(value.armorTraining).size === value.armorTraining.length
    && value.armorTraining.every((category) => typeof category === 'string' && ARMOR_CATEGORIES.has(category));
  const toolsValid = Array.isArray(value.toolProficiencies)
    && value.toolProficiencies.every(validMulticlassTool)
    && new Set(value.toolProficiencies.map((tool) => isRecord(tool) ? tool.id : undefined)).size === value.toolProficiencies.length;
  const skillValid = value.skillChoices === undefined || validMulticlassSkillChoice(value.skillChoices, entry.skillChoices.from);
  const toolChoicesValid = value.toolChoices === undefined || (
    Array.isArray(value.toolChoices)
    && value.toolChoices.length > 0
    && value.toolChoices.every(validMulticlassToolChoice)
    && new Set(value.toolChoices.map((choice) => isRecord(choice) ? choice.id : undefined)).size === value.toolChoices.length
  );

  if (!weaponsValid || !armorValid || !toolsValid || !skillValid || !toolChoicesValid) {
    issues.push({ code: 'multiclass-proficiency', contentId: entry.id, message: 'Multiclass proficiency metadata contains an unsupported or malformed grant/choice.' });
  }
}

function validateMulticlassSlotContribution(value: unknown, contentId: string, issues: ContentValidationIssue[]) {
  if (containsExecutable(value)) {
    issues.push({ code: 'multiclass-slot-contribution-executable', contentId, message: 'Multiclass slot-contribution metadata cannot contain executable values.' });
  }
  if (!isRecord(value) || typeof value.kind !== 'string') {
    issues.push({ code: 'multiclass-slot-contribution', contentId, message: 'Spellcasting providers require declarative multiclass slot-contribution metadata.' });
    return;
  }

  let valid = false;
  if (value.kind === 'spellcasting') {
    if (value.contribution === 'full') {
      valid = hasOnlyKeys(value, ['kind', 'contribution']);
    } else if (value.contribution === 'half') {
      valid = hasOnlyKeys(value, ['kind', 'contribution', 'rounding']) && value.rounding === 'up';
    } else if (value.contribution === 'third') {
      valid = hasOnlyKeys(value, ['kind', 'contribution', 'rounding']) && value.rounding === 'down';
    }
  } else if (value.kind === 'pact-magic' || value.kind === 'independent') {
    valid = hasOnlyKeys(value, ['kind']);
  }

  if (!valid) {
    issues.push({ code: 'multiclass-slot-contribution', contentId, message: 'Spellcasting provider multiclass slot-contribution metadata is malformed or unsupported.' });
  }
}

function validLevelCountTable(values: readonly { readonly level: number; readonly count: number }[]): boolean {
  return values.length > 0 && values.every((row, index) => Number.isInteger(row.level) && row.level >= 1 && row.level <= 20 && Number.isInteger(row.count) && row.count >= 0 && (index === 0 || row.level > values[index - 1].level));
}

function validateSpellcastingProvider(provider: SpellcastingProviderDefinition, contentId: string, issues: ContentValidationIssue[]) {
  if (!provider.id.trim() || !provider.name.trim()) issues.push({ code: 'spellcasting-provider', contentId, message: 'Spellcasting providers require stable IDs and names.' });
  if (provider.spellcastingAbility.kind !== 'fixed' || !ABILITY_KEYS.includes(provider.spellcastingAbility.ability)) issues.push({ code: 'spellcasting-ability', contentId, message: 'Spellcasting providers require a fixed standard spellcasting ability.' });
  validateMulticlassSlotContribution(provider.multiclassSlotContribution, contentId, issues);
  if (provider.spellManagement.kind === 'granted-only') {
    if (provider.spellManagement.spellIds.length === 0 || new Set(provider.spellManagement.spellIds).size !== provider.spellManagement.spellIds.length) issues.push({ code: 'spell-management', contentId, message: 'Granted-only Spellcasting providers require unique granted spell IDs.' });
  } else if (
    !provider.spellManagement.spellListId.trim() ||
    !validLevelCountTable(provider.spellManagement.cantripCount) ||
    !validLevelCountTable(provider.spellManagement.preparedSpellCount) ||
    !['long-rest-any', 'long-rest-one', 'class-level-one'].includes(provider.spellManagement.replacement)
  ) {
    issues.push({ code: 'spell-management', contentId, message: 'Prepared Spellcasting providers require a spell-list ID, valid level-count tables, and a supported replacement policy.' });
  }
  if (provider.spellManagement.kind === 'prepared-from-owned' && (!Number.isInteger(provider.spellManagement.initialOwnedSpellCount) || provider.spellManagement.initialOwnedSpellCount < 1 || provider.spellManagement.initialOwnedSpellLevel < 1 || provider.spellManagement.initialOwnedSpellLevel > 9)) issues.push({ code: 'spell-management', contentId, message: 'Prepared-from-owned Spellcasting providers require a positive initial owned-spell count and a valid starting spell level.' });
  if (!['none', 'prepared', 'owned'].includes(provider.ritualCasting)) issues.push({ code: 'spell-management', contentId, message: 'Spellcasting providers require a supported ritual-casting policy.' });
  if (provider.ritualCasting === 'owned' && provider.spellManagement.kind !== 'prepared-from-owned') issues.push({ code: 'spell-management', contentId, message: 'Owned-content ritual casting requires a prepared-from-owned Spellcasting provider.' });
  const pool = provider.slotPool;
  if (!pool) return;
  if (!pool.id.trim() || !pool.name.trim()) issues.push({ code: 'spell-slot-pool', contentId, message: 'Spell-slot pools require stable IDs and names.' });
  const slotLevels = pool.slotLevels.map((slot) => slot.spellLevel);
  if (pool.slotLevels.length === 0 || new Set(slotLevels).size !== slotLevels.length || new Set(pool.slotLevels.map((slot) => slot.resourceId)).size !== pool.slotLevels.length || pool.slotLevels.some((slot) => slot.spellLevel < 1 || slot.spellLevel > 9 || !slot.resourceId.trim() || !slot.name.trim())) issues.push({ code: 'spell-slot-level', contentId, message: 'Spell-slot level definitions must use unique levels and stable resource IDs.' });
  const progressionLevels = pool.progression.map((row) => row.level);
  if (pool.progression.length === 0 || progressionLevels.some((level, index) => !Number.isInteger(level) || level < 1 || level > 20 || (index > 0 && level <= progressionLevels[index - 1]))) issues.push({ code: 'spell-slot-progression', contentId, message: 'Spell-slot progression must use ordered unique character levels from 1 through 20.' });
  for (const row of pool.progression) {
    if (new Set(row.slots.map((slot) => slot.spellLevel)).size !== row.slots.length || row.slots.some((slot) => !slotLevels.includes(slot.spellLevel) || !Number.isInteger(slot.maximum) || slot.maximum < 0)) issues.push({ code: 'spell-slot-progression', contentId, message: 'Spell-slot progression rows must reference defined slot levels with non-negative maxima.' });
  }
  if (new Set(pool.recovery.map((rule) => rule.trigger)).size !== pool.recovery.length || pool.recovery.some((rule) => rule.mode === 'amount' && (!Number.isInteger(rule.amount) || rule.amount < 1))) issues.push({ code: 'spell-slot-recovery', contentId, message: 'Spell-slot recovery metadata is invalid.' });
}

function validateSubclass(entry: SubclassContent, issues: ContentValidationIssue[]) {
  if (!Number.isInteger(entry.acquisitionLevel) || entry.acquisitionLevel < 1 || entry.acquisitionLevel > 20) {
    issues.push({ code: 'subclass-acquisition-level', contentId: entry.id, message: 'Subclass acquisition level must be a whole number from 1 through 20.' });
  }
  const levels = entry.progression.map((row) => row.level);
  if (levels.length === 0 || levels[0] !== entry.acquisitionLevel || levels.some((level, index) => !Number.isInteger(level) || level < entry.acquisitionLevel || level > 20 || (index > 0 && level <= levels[index - 1]))) {
    issues.push({ code: 'subclass-progression', contentId: entry.id, message: 'Subclass progression must be ordered, unique, begin at the acquisition level, and stay within levels 1 through 20.' });
  }
  const featureIds = entry.progression.flatMap((row) => row.features.map((feature) => feature.id));
  if (new Set(featureIds).size !== featureIds.length) issues.push({ code: 'subclass-feature-id', contentId: entry.id, message: 'Subclass feature IDs must be unique.' });
  const resourceIds = new Set<string>();
  const transactionIds = new Set<string>();
  const activeEffectIds = new Set<string>();
  for (const row of entry.progression) {
    for (const feature of row.features) {
      if (!feature.id || !feature.name || !feature.description) issues.push({ code: 'subclass-feature', contentId: entry.id, message: 'Subclass features require stable IDs, names, and descriptions.' });
      if (new Set(feature.referenceEffects.map((effect) => effect.id)).size !== feature.referenceEffects.length) issues.push({ code: 'subclass-reference-effect', contentId: entry.id, message: `Subclass feature ${feature.name} has duplicate reference-only effect IDs.` });
      feature.effects.forEach((effect) => validateCharacterRuleEffect(effect, entry.id, issues));
      if (feature.spellcasting && new Set(feature.spellcasting.map((provider) => provider.id)).size !== feature.spellcasting.length) issues.push({ code: 'spellcasting-provider', contentId: entry.id, message: `Subclass feature ${feature.name} has duplicate Spellcasting provider IDs.` });
      feature.spellcasting?.forEach((provider) => validateSpellcastingProvider(provider, entry.id, issues));
      if (feature.spellGrants && new Set(feature.spellGrants.map((grant) => `${grant.providerId}:${grant.minimumLevel ?? row.level}`)).size !== feature.spellGrants.length) issues.push({ code: 'spell-grant', contentId: entry.id, message: `Subclass feature ${feature.name} has duplicate provider-scoped spell grants at the same level.` });
      if (feature.spellGrants?.some((grant) => grant.status !== 'always-prepared' || grant.spellIds.length === 0 || new Set(grant.spellIds).size !== grant.spellIds.length || (grant.minimumLevel !== undefined && (!Number.isInteger(grant.minimumLevel) || grant.minimumLevel < row.level || grant.minimumLevel > 20)))) issues.push({ code: 'spell-grant', contentId: entry.id, message: `Subclass feature ${feature.name} has invalid fixed spell-grant metadata.` });
      for (const resource of feature.resources ?? []) {
        if (resourceIds.has(resource.id)) issues.push({ code: 'duplicate-class-resource', contentId: entry.id, message: `Duplicate subclass feature resource id: ${resource.id}` });
        resourceIds.add(resource.id);
        validateResourceDefinition(resource, entry.id, issues);
      }
      if (feature.resourceConsumers && new Set(feature.resourceConsumers.map((grant) => `${grant.resourceId}:${grant.consumer.id}`)).size !== feature.resourceConsumers.length) issues.push({ code: 'resource-consumer-grant', contentId: entry.id, message: `Subclass feature ${feature.name} has duplicate resource-consumer grants.` });
      if (feature.resourceConsumers?.some((grant) => grant.consumer.effect.type === 'fixed-expend' && (!Number.isInteger(grant.consumer.effect.amount) || grant.consumer.effect.amount < 1))) issues.push({ code: 'resource-consumer-effect', contentId: entry.id, message: `Subclass feature ${feature.name} has an invalid fixed resource expenditure amount.` });
      for (const transaction of feature.resourceTransactions ?? []) {
        if (transactionIds.has(transaction.id)) issues.push({ code: 'resource-transaction', contentId: entry.id, message: `Duplicate resource transaction id: ${transaction.id}` });
        transactionIds.add(transaction.id);
        validateResourceTransaction(transaction, entry.id, issues);
      }
      for (const effect of feature.activeSelfEffects ?? []) {
        if (activeEffectIds.has(effect.id)) issues.push({ code: 'active-self-effect-id', contentId: entry.id, message: `Duplicate active self-effect id: ${effect.id}` });
        activeEffectIds.add(effect.id);
        validateActiveSelfEffect(effect, entry.id, issues);
      }
    }
  }
}

function validateClassProgression(entry: ClassContent, issues: ContentValidationIssue[]) {
  const levels = entry.progression.map((row) => row.level);
  if (levels.length !== 20 || levels.some((level, index) => level !== index + 1)) {
    issues.push({ code: 'class-progression', contentId: entry.id, message: 'Class progression must contain ordered levels 1 through 20.' });
  }
  if (!['one-of', 'all-of'].includes(entry.primaryAbility.mode) || entry.primaryAbility.abilities.length === 0 || entry.primaryAbility.abilities.some((ability) => !ABILITY_KEYS.includes(ability)) || new Set(entry.primaryAbility.abilities).size !== entry.primaryAbility.abilities.length) {
    issues.push({ code: 'class-primary-ability', contentId: entry.id, message: 'Class primary ability mode and abilities must use the supported one-of/all-of model with unique standard abilities.' });
  }
  validateMulticlassProficiencies(entry.multiclassProficiencies, entry, issues);
  if (entry.skillChoices.choose < 0 || entry.skillChoices.choose > entry.skillChoices.from.length || entry.skillChoices.from.some((skill) => !isSkillId(skill) || new Set(entry.skillChoices.from).size !== entry.skillChoices.from.length)) {
    issues.push({ code: 'class-skill-choices', contentId: entry.id, message: 'Class skill choices must reference unique standard skill ids with a valid selection count.' });
  }
  if (!Number.isInteger(entry.fixedHitPointsPerLevel) || entry.fixedHitPointsPerLevel < 1 || entry.fixedHitPointsPerLevel > entry.hitDie) {
    issues.push({ code: 'class-fixed-hp', contentId: entry.id, message: 'Class fixed Hit Points per level must be a valid positive value for its Hit Die.' });
  }
  if (new Set(entry.toolProficiencies.map((tool) => tool.id)).size !== entry.toolProficiencies.length || entry.toolProficiencies.some((tool) => !tool.id.trim() || !tool.name.trim())) {
    issues.push({ code: 'class-tool-proficiency', contentId: entry.id, message: 'Class tool proficiencies require unique IDs and names.' });
  }
  for (const rule of entry.weaponProficiencies) {
    if (rule.kind === 'category-with-property' && (rule.anyOfProperties.length === 0 || new Set(rule.anyOfProperties).size !== rule.anyOfProperties.length)) {
      issues.push({ code: 'class-weapon-proficiency', contentId: entry.id, message: 'Property-qualified weapon proficiency rules require unique weapon properties.' });
    }
  }

  for (const row of entry.progression) {
    if (new Set(row.features.map((feature) => feature.id)).size !== row.features.length) issues.push({ code: 'class-feature-id', contentId: entry.id, message: `Class feature IDs must be unique within level ${row.level}.` });
  }

  const resourceIds = new Set<string>();
  for (const resource of entry.resources) {
    if (resourceIds.has(resource.id)) issues.push({ code: 'duplicate-class-resource', contentId: entry.id, message: `Duplicate class resource id: ${resource.id}` });
    resourceIds.add(resource.id);
    validateResourceDefinition(resource, entry.id, issues);
  }

  const transactionIds = new Set<string>();
  const activeEffectIds = new Set<string>();
  const features = entry.progression.flatMap((row) => row.features);
  for (const feature of features) {
    if (!feature.id || !feature.name || !feature.description) issues.push({ code: 'class-feature', contentId: entry.id, message: 'Class features require stable IDs, names, and descriptions.' });
    if (new Set(feature.referenceEffects.map((effect) => effect.id)).size !== feature.referenceEffects.length) issues.push({ code: 'class-reference-effect', contentId: entry.id, message: `Class feature ${feature.name} has duplicate reference-only effect IDs.` });
    feature.effects.forEach((effect) => validateCharacterRuleEffect(effect, entry.id, issues));
    if (feature.spellcasting && new Set(feature.spellcasting.map((provider) => provider.id)).size !== feature.spellcasting.length) issues.push({ code: 'spellcasting-provider', contentId: entry.id, message: `Class feature ${feature.name} has duplicate Spellcasting provider IDs.` });
    feature.spellcasting?.forEach((provider) => validateSpellcastingProvider(provider, entry.id, issues));
    if (feature.spellGrants && new Set(feature.spellGrants.map((grant) => `${grant.providerId}:${grant.minimumLevel ?? 1}`)).size !== feature.spellGrants.length) issues.push({ code: 'spell-grant', contentId: entry.id, message: `Class feature ${feature.name} has duplicate provider-scoped spell grants at the same level.` });
    if (feature.spellGrants?.some((grant) => grant.status !== 'always-prepared' || grant.spellIds.length === 0 || new Set(grant.spellIds).size !== grant.spellIds.length || (grant.minimumLevel !== undefined && (!Number.isInteger(grant.minimumLevel) || grant.minimumLevel < 1 || grant.minimumLevel > 20)))) issues.push({ code: 'spell-grant', contentId: entry.id, message: `Class feature ${feature.name} has invalid fixed spell-grant metadata.` });
    for (const resource of feature.resources ?? []) {
      if (resourceIds.has(resource.id)) issues.push({ code: 'duplicate-class-resource', contentId: entry.id, message: `Duplicate class resource id: ${resource.id}` });
      resourceIds.add(resource.id);
      validateResourceDefinition(resource, entry.id, issues);
    }
    if (feature.resourceConsumers && new Set(feature.resourceConsumers.map((grant) => `${grant.resourceId}:${grant.consumer.id}`)).size !== feature.resourceConsumers.length) issues.push({ code: 'resource-consumer-grant', contentId: entry.id, message: `Class feature ${feature.name} has duplicate resource-consumer grants.` });
    for (const transaction of feature.resourceTransactions ?? []) {
      if (transactionIds.has(transaction.id)) issues.push({ code: 'resource-transaction', contentId: entry.id, message: `Duplicate resource transaction id: ${transaction.id}` });
      transactionIds.add(transaction.id);
      validateResourceTransaction(transaction, entry.id, issues);
    }
    for (const effect of feature.activeSelfEffects ?? []) {
      if (activeEffectIds.has(effect.id)) issues.push({ code: 'active-self-effect-id', contentId: entry.id, message: `Duplicate active self-effect id: ${effect.id}` });
      activeEffectIds.add(effect.id);
      validateActiveSelfEffect(effect, entry.id, issues);
    }
  }
  validateResourceConsumerEffects(entry, issues);
}

function characterRuleEffectsForEntry(entry: ContentEntry): readonly CharacterRuleEffect[] {
  if (entry.kind === 'species') return entry.effects ?? [];
  if (entry.kind === 'feat') return entry.effects.filter((effect): effect is CharacterRuleEffect => effect.type !== 'ability-score-increase');
  if (entry.kind === 'class' || entry.kind === 'subclass') return entry.progression.flatMap((row) => row.features.flatMap((feature) => feature.effects));
  return [];
}

export function validateContentDataset(entries: readonly ContentEntry[]): ContentValidationIssue[] {
  const issues: ContentValidationIssue[] = [];
  const byId = new Map<string, ContentEntry>();

  const diceTransformationIds = new Set<string>();
  for (const entry of entries) {
    if (byId.has(entry.id)) issues.push({ code: 'duplicate-id', contentId: entry.id, message: `Duplicate content id: ${entry.id}` });
    else byId.set(entry.id, entry);

    for (const effect of characterRuleEffectsForEntry(entry)) {
      if (effect.type !== 'dice-transformation') continue;
      if (diceTransformationIds.has(effect.id)) issues.push({ code: 'duplicate-dice-transformation', contentId: entry.id, message: `Duplicate dice transformation id: ${effect.id}` });
      else diceTransformationIds.add(effect.id);
    }

    if (!entry.source || !entry.source.type) issues.push({ code: 'missing-source', contentId: entry.id, message: 'Content source metadata is required.' });

    if (entry.source.type === 'srd') {
      if (!entry.id.startsWith(SRD_ID_PREFIX) || entry.source.ruleset !== '5.2.1') {
        issues.push({ code: 'invalid-srd-id', contentId: entry.id, message: 'SRD entries must use the reserved SRD 5.2.1 namespace.' });
      }
    } else {
      const expectedPrefix = `homebrew:${entry.source.namespace}:`;
      if (entry.id.startsWith(SRD_ID_PREFIX) || !entry.id.startsWith(expectedPrefix)) {
        issues.push({ code: 'invalid-homebrew-id', contentId: entry.id, message: `Homebrew ids must start with ${expectedPrefix}.` });
      }
    }

    if (entry.kind === 'weapon' && !validDamage(entry)) issues.push({ code: 'invalid-weapon-damage', contentId: entry.id, message: 'Weapon damage structure is invalid.' });
    if (entry.kind === 'armor' && !validArmorClass(entry)) issues.push({ code: 'invalid-armor-ac', contentId: entry.id, message: 'Armor AC structure is invalid.' });
    if (entry.kind === 'class') validateClassProgression(entry, issues);
    if (entry.kind === 'subclass') validateSubclass(entry, issues);
    if (entry.kind === 'species') validateSpecies(entry, issues);
    if (entry.kind === 'background') validateBackground(entry, issues);
    if (entry.kind === 'feat') validateFeat(entry, issues);
    if (entry.kind === 'spell') validateSpell(entry, issues);
  }

  const providerIds = new Set<string>();
  const declaredProviderIds = new Set(entries
    .filter((entry): entry is ClassContent | SubclassContent => entry.kind === 'class' || entry.kind === 'subclass')
    .flatMap((entry) => entry.progression.flatMap((row) => row.features.flatMap((feature) => (feature.spellcasting ?? []).map((provider) => provider.id)))));
  for (const entry of entries) {
    let featureOwnerClass: ClassContent | undefined;
    if (entry.kind === 'class') featureOwnerClass = entry;
    if (entry.kind === 'subclass') {
      const parentClass = byId.get(entry.parentClassId);
      if (!parentClass || parentClass.kind !== 'class') issues.push({ code: 'missing-parent-class', contentId: entry.id, message: `Subclass parent class does not resolve: ${entry.parentClassId}` });
      else featureOwnerClass = parentClass;
    }
    if (entry.kind === 'class' || entry.kind === 'subclass') {
      const ownerResources = new Set<string>();
      const ownerProviders = new Map<string, SpellcastingProviderDefinition>();
      const collectOwnerFeatureData = (owner: ClassContent | SubclassContent) => {
        for (const feature of owner.progression.flatMap((row) => row.features)) {
          for (const resource of feature.resources ?? []) ownerResources.add(resource.id);
          for (const provider of feature.spellcasting ?? []) {
            ownerProviders.set(provider.id, provider);
            for (const slot of provider.slotPool?.slotLevels ?? []) ownerResources.add(slot.resourceId);
          }
        }
      };
      if (featureOwnerClass) {
        for (const resource of featureOwnerClass.resources) ownerResources.add(resource.id);
        collectOwnerFeatureData(featureOwnerClass);
      }
      if (entry.kind === 'subclass') collectOwnerFeatureData(entry);

      for (const feature of entry.progression.flatMap((row) => row.features)) {
        for (const provider of feature.spellcasting ?? []) {
          if (providerIds.has(provider.id)) issues.push({ code: 'duplicate-spellcasting-provider', contentId: entry.id, message: `Duplicate Spellcasting provider id: ${provider.id}` });
          providerIds.add(provider.id);
          if (provider.spellManagement.kind === 'granted-only') {
            for (const spellId of provider.spellManagement.spellIds) {
              const spell = byId.get(spellId);
              if (!spell || spell.kind !== 'spell') issues.push({ code: 'missing-spell', contentId: entry.id, message: `Spellcasting provider spell does not resolve: ${spellId}` });
            }
          }
        }
        for (const grant of feature.spellGrants ?? []) {
          if (!declaredProviderIds.has(grant.providerId)) issues.push({ code: 'missing-spellcasting-provider', contentId: entry.id, message: `Spell grant references an unknown Spellcasting provider: ${grant.providerId}` });
          for (const spellId of grant.spellIds) {
            const spell = byId.get(spellId);
            if (!spell || spell.kind !== 'spell') issues.push({ code: 'missing-spell', contentId: entry.id, message: `Provider-scoped spell grant does not resolve: ${spellId}` });
          }
        }
        for (const grant of feature.resourceConsumers ?? []) {
          if (!ownerResources.has(grant.resourceId)) issues.push({ code: 'missing-class-resource', contentId: entry.id, message: `Resource consumer ${grant.consumer.name} references an unknown owner resource: ${grant.resourceId}` });
        }
        for (const transaction of feature.resourceTransactions ?? []) {
          if (transaction.usageResourceId && !ownerResources.has(transaction.usageResourceId)) issues.push({ code: 'resource-transaction-reference', contentId: entry.id, message: `Resource transaction ${transaction.name} references an unknown usage resource: ${transaction.usageResourceId}` });
          if (transaction.kind === 'restore-resource' && !ownerResources.has(transaction.targetResourceId)) issues.push({ code: 'resource-transaction-reference', contentId: entry.id, message: `Resource transaction ${transaction.name} references an unknown target resource: ${transaction.targetResourceId}` });
          if (transaction.kind === 'restore-spell-slots-with-budget') {
            const provider = ownerProviders.get(transaction.providerId);
            if (!provider) issues.push({ code: 'resource-transaction-reference', contentId: entry.id, message: `Resource transaction ${transaction.name} references an unknown owner Spellcasting provider: ${transaction.providerId}` });
            else if (!provider.slotPool?.slotLevels.some((slot) => slot.spellLevel <= transaction.maximumSpellLevel)) issues.push({ code: 'resource-transaction-reference', contentId: entry.id, message: `Resource transaction ${transaction.name} has no eligible spell-slot levels in its provider.` });
          }
        }
        for (const effect of feature.activeSelfEffects ?? []) {
          if (effect.activationCost && !ownerResources.has(effect.activationCost.resourceId)) issues.push({ code: 'active-self-effect-reference', contentId: entry.id, message: `Active self effect ${effect.name} references an unknown activation resource: ${effect.activationCost.resourceId}` });
          for (const modifier of effect.modifiers ?? []) {
            if (modifier.type === 'spell-save-dc-bonus') {
              for (const providerId of modifier.providerIds) if (!ownerProviders.has(providerId)) issues.push({ code: 'active-self-effect-reference', contentId: entry.id, message: `Active self effect ${effect.name} references an unknown Spellcasting provider: ${providerId}` });
            }
            if (modifier.type === 'd20-roll-mode' && modifier.target.kind === 'spell-attack') {
              for (const providerId of modifier.target.providerIds) if (!ownerProviders.has(providerId)) issues.push({ code: 'active-self-effect-reference', contentId: entry.id, message: `Active self effect ${effect.name} references an unknown Spellcasting provider: ${providerId}` });
            }
          }
        }
      }
    }
    if (entry.kind === 'weapon') {
      const mastery = byId.get(entry.masteryId);
      if (!mastery || mastery.kind !== 'weaponMastery') {
        issues.push({ code: 'missing-mastery', contentId: entry.id, message: `Weapon mastery reference does not resolve: ${entry.masteryId}` });
      }
    }
    if (entry.kind === 'background') {
      const feat = byId.get(entry.originFeat.id);
      if (!feat || feat.kind !== 'feat') issues.push({ code: 'missing-origin-feat', contentId: entry.id, message: `Background Origin Feat reference does not resolve: ${entry.originFeat.id}` });
    }
    if (entry.kind === 'class' || entry.kind === 'background') {
      for (const option of entry.startingEquipment) {
        for (const item of option.items) {
          if (item.contentId && !byId.has(item.contentId)) {
            issues.push({ code: 'missing-content-ref', contentId: entry.id, message: `Starting equipment reference does not resolve: ${item.contentId}` });
          }
        }
      }
    }
  }

  return issues;
}

export function assertValidContentDataset(entries: readonly ContentEntry[]): void {
  const issues = validateContentDataset(entries);
  if (issues.length) throw new Error(`Invalid content dataset:\n${issues.map((issue) => `- ${issue.message}`).join('\n')}`);
}
