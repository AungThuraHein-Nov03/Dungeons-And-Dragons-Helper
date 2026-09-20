import type { AbilityKey, AbilityScores, SkillId } from '../models/character';
import type { ContentId } from '../models/contentId';
import type {
  ActiveSelfEffectDefinition,
  ArmorCategory,
  CharacterRuleEffect,
  ClassFeatureReferenceEffect,
  ClassPrimaryAbility,
  ClassToolProficiency,
  ContentSourceMetadata,
  DamageAmount,
  DamageType,
  DieSize,
  FeatCategory,
  FeatEffect,
  FeatReferenceEffect,
  OriginFeatReference,
  ResourceConsumerEffect,
  ResourceRecoveryRule,
  SpeciesSense,
  SpeciesTraitReference,
  SpellContent,
  LeveledSpellLevel,
  MulticlassSlotContribution,
  SubclassReferenceEffect,
  WeaponProficiencyRule,
  WeaponProperty,
} from '../models/content';

export type DerivedAbilityModifiers = Record<AbilityKey, number>;

export interface DerivedSavingThrow { readonly ability: AbilityKey; readonly modifier: number; readonly proficient: boolean; }
export interface DerivedSkill { readonly id: SkillId; readonly ability: AbilityKey; readonly modifier: number; readonly proficient: boolean; }

export interface DerivedDefense {
  readonly armorClass: number;
  readonly armor: { readonly id: ContentId; readonly name: string; readonly category: Exclude<ArmorCategory, 'shield'>; readonly trained: boolean; } | null;
  readonly shield: { readonly id: ContentId; readonly name: string; readonly trained: boolean; readonly bonusApplied: number; } | null;
}

export interface DerivedHealth { readonly maximumHp: number; readonly hitDice: readonly { readonly die: DieSize; readonly maximum: number }[]; }

export type DerivedMechanicalOwner =
  | { readonly kind: 'character'; readonly level: number }
  | { readonly kind: 'class'; readonly level: number; readonly classId: ContentId; readonly className: string }
  | { readonly kind: 'subclass'; readonly level: number; readonly classId: ContentId; readonly className: string; readonly subclassId: ContentId; readonly subclassName: string };

export interface DerivedRuleEffectSource {
  readonly contentId: ContentId;
  readonly name: string;
  readonly effects: readonly CharacterRuleEffect[];
  readonly owner?: DerivedMechanicalOwner;
}

export interface DerivedInitiativeContribution { readonly label: string; readonly amount: number; }
export interface DerivedInitiative {
  readonly baseModifier: number;
  readonly modifier: number;
  readonly proficiency: 'none' | 'half' | 'full';
  readonly contributions: readonly DerivedInitiativeContribution[];
  readonly advantageSources: readonly string[];
  readonly disadvantageSources: readonly string[];
}

export interface DerivedResourceConsumer { readonly id: ContentId; readonly name: string; readonly effect: ResourceConsumerEffect; }
export interface DerivedResource { readonly id: ContentId; readonly name: string; readonly maximumUses: number; readonly source?: ContentSourceMetadata; readonly recovery: readonly ResourceRecoveryRule[]; readonly consumers: readonly DerivedResourceConsumer[]; readonly presentation: 'pips' | 'numeric'; readonly owner?: DerivedMechanicalOwner; }

export type DerivedActiveSelfEffect = ActiveSelfEffectDefinition & {
  readonly grantedBy: { readonly contentId: ContentId; readonly contentName: string };
  readonly owner?: DerivedMechanicalOwner;
};

interface DerivedResourceTransactionBase { readonly id: ContentId; readonly name: string; readonly grantedBy: { readonly contentId: ContentId; readonly contentName: string }; readonly usageResourceId?: ContentId; readonly owner?: DerivedMechanicalOwner; }
export type DerivedResourceTransaction =
  | (DerivedResourceTransactionBase & { readonly kind: 'restore-resource'; readonly targetResource: { readonly id: ContentId; readonly name: string; readonly maximumUses: number }; readonly restore: { readonly kind: 'fixed'; readonly amount: number } | { readonly kind: 'selected'; readonly maximum: number } })
  | (DerivedResourceTransactionBase & { readonly kind: 'restore-spell-slots-with-budget'; readonly providerId: ContentId; readonly providerName: string; readonly budget: number; readonly maximumSpellLevel: number; readonly timing: 'short-rest'; readonly slots: readonly { readonly spellLevel: number; readonly resourceId: ContentId; readonly name: string; readonly maximumUses: number }[] });

export type WeaponUseMode = 'melee' | 'ranged' | 'thrown';
export type WeaponDamageMode = 'standard' | 'one-handed' | 'two-handed';

export interface DerivedWeaponDamage { readonly base: DamageAmount; readonly abilityModifier: number; readonly damageType: DamageType; }
export interface DerivedWeaponDamageConfiguration extends DerivedWeaponDamage { readonly mode: WeaponDamageMode; }

export interface DerivedWeaponAttack {
  readonly weaponId: ContentId;
  readonly inventoryEntryId?: string;
  readonly name: string;
  readonly baseName: string;
  readonly useMode: WeaponUseMode;
  readonly proficient: boolean;
  readonly applicableAttackAbilities: readonly AbilityKey[];
  readonly attackAbility: AbilityKey;
  readonly attackModifier: number;
  readonly damage: DerivedWeaponDamage;
  readonly damageConfigurations: readonly DerivedWeaponDamageConfiguration[];
  readonly properties: readonly WeaponProperty[];
  readonly mastery: { readonly id: ContentId; readonly name: string; readonly canPotentiallyUse: boolean; };
}

export interface DerivedSpeciesState {
  readonly id: ContentId;
  readonly name: string;
  readonly creatureType: 'humanoid';
  readonly size: 'small' | 'medium';
  readonly speedFeet: number;
  readonly senses: readonly SpeciesSense[];
  readonly traits: readonly SpeciesTraitReference[];
  readonly selectedChoices: readonly { readonly id: string; readonly name: string; readonly optionId: string; readonly optionName: string }[];
  readonly skillProficiencies: readonly SkillId[];
  readonly automatedEffects: readonly CharacterRuleEffect[];
}

export interface DerivedBackgroundState {
  readonly id: ContentId;
  readonly name: string;
  readonly abilityScores: readonly AbilityKey[];
  readonly skillProficiencies: readonly SkillId[];
  readonly toolProficiency: { readonly id: string; readonly name: string };
  readonly originFeat: OriginFeatReference;
}

export interface DerivedFeatPrerequisite {
  readonly description: string;
  readonly status: 'met' | 'unmet' | 'not-evaluated';
}

export interface DerivedFeatState {
  readonly id: ContentId;
  readonly name: string;
  readonly category: FeatCategory;
  readonly acquisition:
    | { readonly type: 'background'; readonly backgroundId: ContentId; readonly backgroundName: string }
    | { readonly type: 'manual' };
  readonly variant?: string;
  readonly choices: Readonly<Record<string, readonly string[]>>;
  readonly prerequisites: readonly DerivedFeatPrerequisite[];
  readonly automatedEffects: readonly FeatEffect[];
  readonly referenceEffects: readonly FeatReferenceEffect[];
}

export interface DerivedClassFeatureOwner {
  readonly classId: ContentId;
  readonly className: string;
  readonly classLevel: number;
}

export interface DerivedClassFeature {
  readonly id: ContentId;
  readonly level: number;
  readonly name: string;
  readonly description: string;
  readonly owner: DerivedClassFeatureOwner;
  readonly automatedEffects: readonly CharacterRuleEffect[];
  readonly referenceEffects: readonly ClassFeatureReferenceEffect[];
}

export interface DerivedSubclassFeatureOwner extends DerivedClassFeatureOwner {
  readonly subclassId: ContentId;
  readonly subclassName: string;
}

export interface DerivedSubclassFeature {
  readonly id: ContentId;
  readonly level: number;
  readonly name: string;
  readonly description: string;
  readonly owner: DerivedSubclassFeatureOwner;
  readonly automatedEffects: readonly CharacterRuleEffect[];
  readonly referenceEffects: readonly SubclassReferenceEffect[];
}

export interface DerivedSubclassState {
  readonly id: ContentId;
  readonly name: string;
  readonly source: ContentSourceMetadata;
  readonly parentClassId: ContentId;
  readonly parentClassName: string;
  readonly parentClassLevel: number;
  readonly acquisitionLevel: number;
  readonly acquiredFeatures: readonly DerivedSubclassFeature[];
  readonly futureFeatures: readonly DerivedSubclassFeature[];
}

export interface DerivedClassState {
  readonly id: ContentId;
  readonly name: string;
  readonly source: ContentSourceMetadata;
  readonly classLevel: number;
  readonly isStartingClass: boolean;
  readonly hitDie: DieSize;
  readonly primaryAbility: ClassPrimaryAbility;
  readonly savingThrowProficiencies: readonly AbilityKey[];
  readonly weaponProficiencies: readonly WeaponProficiencyRule[];
  readonly armorTraining: readonly ArmorCategory[];
  readonly toolProficiencies: readonly ClassToolProficiency[];
  readonly acquiredFeatures: readonly DerivedClassFeature[];
  readonly futureFeatures: readonly DerivedClassFeature[];
  readonly subclass?: DerivedSubclassState;
}

export interface DerivedClassProficiencyState {
  readonly savingThrowProficiencies: readonly AbilityKey[];
  readonly skillProficiencies: readonly SkillId[];
  readonly weaponProficiencies: readonly WeaponProficiencyRule[];
  readonly armorTraining: readonly ArmorCategory[];
  readonly toolProficiencies: readonly ClassToolProficiency[];
}

export interface DerivedSpellSlot {
  readonly spellLevel: LeveledSpellLevel;
  readonly resourceId: ContentId;
  readonly name: string;
  readonly maximumUses: number;
}

export interface DerivedSpellSlotPool {
  readonly id: ContentId;
  readonly name: string;
  readonly recovery: readonly ResourceRecoveryRule[];
  readonly slots: readonly DerivedSpellSlot[];
}

export interface DerivedSpellSlotSource {
  readonly kind: 'ordinary' | 'pact' | 'independent';
  readonly slotPoolId: ContentId;
  readonly resourceId: ContentId;
  readonly spellLevel: LeveledSpellLevel;
}

export type DerivedSpellManagement =
  | { readonly kind: 'granted-only' }
  | {
      readonly kind: 'prepared-from-list';
      readonly spellListId: string;
      readonly cantripCount: number;
      readonly preparedSpellCount: number;
      readonly replacement: 'long-rest-any' | 'long-rest-one' | 'class-level-one';
      readonly catalogSpells: readonly SpellContent[];
      readonly selectedCantrips: readonly SpellContent[];
      readonly preparedSpells: readonly SpellContent[];
    }
  | {
      readonly kind: 'prepared-from-owned';
      readonly spellListId: string;
      readonly cantripCount: number;
      readonly preparedSpellCount: number;
      readonly replacement: 'long-rest-any' | 'long-rest-one' | 'class-level-one';
      readonly initialOwnedSpellCount: number;
      readonly initialOwnedSpellLevel: LeveledSpellLevel;
      readonly catalogSpells: readonly SpellContent[];
      readonly selectedCantrips: readonly SpellContent[];
      readonly ownedSpells: readonly SpellContent[];
      readonly preparedSpells: readonly SpellContent[];
    };

export interface DerivedSpellGrant {
  readonly spell: SpellContent;
  readonly status: 'always-prepared';
  readonly grantedBy: { readonly contentId: ContentId; readonly contentName: string };
}

export interface DerivedSpellcastingProvider {
  readonly id: ContentId;
  readonly name: string;
  readonly source: ContentSourceMetadata;
  readonly grantedBy: { readonly contentId: ContentId; readonly contentName: string };
  readonly owner?: DerivedMechanicalOwner;
  readonly multiclassSlotContribution: MulticlassSlotContribution;
  readonly ability: AbilityKey;
  readonly abilityModifier: number;
  readonly saveDc: number;
  readonly attackModifier: number;
  readonly ritualCasting: 'none' | 'prepared' | 'owned';
  readonly ritualSpells: readonly SpellContent[];
  readonly management: DerivedSpellManagement;
  readonly spells: readonly SpellContent[];
  readonly spellGrants: readonly DerivedSpellGrant[];
  readonly slotPool?: DerivedSpellSlotPool;
}

export interface DerivedCharacterState {
  readonly characterId: string;
  readonly startingClassId: ContentId;
  readonly startingClassName: string;
  readonly classProgressions: readonly DerivedClassState[];
  readonly classProficiencies: DerivedClassProficiencyState;
  /** Single-class compatibility only. Omitted for multiclass Characters. */
  readonly classId?: ContentId;
  /** Single-class compatibility only. Omitted for multiclass Characters. */
  readonly className?: string;
  /** Single-class compatibility only. Omitted for multiclass Characters. */
  readonly classState?: DerivedClassState;
  /** Single-class compatibility only. Omitted for multiclass Characters. */
  readonly subclass?: DerivedSubclassState;
  readonly species?: DerivedSpeciesState;
  readonly background?: DerivedBackgroundState;
  readonly feats: readonly DerivedFeatState[];
  readonly spellcasting: readonly DerivedSpellcastingProvider[];
  readonly ordinaryMulticlassCasterLevel?: number;
  readonly ordinaryMulticlassSlotPool?: DerivedSpellSlotPool;
  readonly ruleEffects: readonly CharacterRuleEffect[];
  readonly ruleEffectSources: readonly DerivedRuleEffectSource[];
  readonly initiative: DerivedInitiative;
  readonly level: number;
  readonly abilityScores: AbilityScores;
  readonly abilityModifiers: DerivedAbilityModifiers;
  readonly proficiencyBonus: number;
  readonly savingThrows: Record<AbilityKey, DerivedSavingThrow>;
  readonly skills: Record<SkillId, DerivedSkill>;
  readonly passivePerception: number;
  readonly defense: DerivedDefense;
  readonly health: DerivedHealth;
  readonly resources: readonly DerivedResource[];
  readonly resourceTransactions: readonly DerivedResourceTransaction[];
  readonly activeSelfEffects: readonly DerivedActiveSelfEffect[];
  readonly attacks: readonly DerivedWeaponAttack[];
}
