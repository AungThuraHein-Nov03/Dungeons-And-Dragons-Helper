import type { AbilityKey, InventoryCategory, LanguageId, SkillId } from './character';
import type { ContentId } from './contentId';

export const CONTENT_KINDS = ['class', 'subclass', 'species', 'background', 'feat', 'spell', 'weapon', 'armor', 'equipment', 'weaponMastery'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export interface SrdSourceMetadata {
  readonly type: 'srd';
  readonly ruleset: '5.2.1';
  readonly documentTitle: 'System Reference Document 5.2.1';
  readonly license: 'CC-BY-4.0';
  readonly published: '2025-05-01';
  readonly url: string;
}

export interface HomebrewSourceMetadata {
  readonly type: 'homebrew';
  readonly namespace: string;
}

export type ContentSourceMetadata = SrdSourceMetadata | HomebrewSourceMetadata;

export interface BaseContent<K extends ContentKind> {
  readonly id: ContentId;
  readonly kind: K;
  readonly name: string;
  readonly source: ContentSourceMetadata;
}

export type CurrencyUnit = 'cp' | 'sp' | 'gp';
export interface Money {
  readonly amount: number;
  readonly unit: CurrencyUnit;
}

export type DieSize = 4 | 6 | 8 | 10 | 12;
export type DamageAmount =
  | { readonly kind: 'dice'; readonly count: number; readonly die: DieSize }
  | { readonly kind: 'fixed'; readonly amount: number };

export type DamageType =
  | 'acid'
  | 'bludgeoning'
  | 'cold'
  | 'fire'
  | 'force'
  | 'lightning'
  | 'necrotic'
  | 'piercing'
  | 'poison'
  | 'psychic'
  | 'radiant'
  | 'slashing'
  | 'thunder';
export type WeaponCategory = 'simple' | 'martial';
export type WeaponMode = 'melee' | 'ranged';

export interface WeaponRange {
  readonly normal: number;
  readonly long: number;
}

export type WeaponProperty =
  | { readonly type: 'finesse' }
  | { readonly type: 'light' }
  | { readonly type: 'heavy' }
  | { readonly type: 'loading' }
  | { readonly type: 'reach' }
  | { readonly type: 'two-handed'; readonly condition?: 'unless-mounted' }
  | { readonly type: 'thrown'; readonly range: WeaponRange }
  | { readonly type: 'ammunition'; readonly range: WeaponRange; readonly ammunition: 'arrow' | 'bolt' | 'bullet' | 'needle' }
  | { readonly type: 'versatile'; readonly alternateDamage: DamageAmount };

export interface WeaponContent extends BaseContent<'weapon'> {
  readonly category: WeaponCategory;
  readonly mode: WeaponMode;
  readonly damage: DamageAmount;
  readonly damageType: DamageType;
  readonly properties: readonly WeaponProperty[];
  readonly masteryId: ContentId;
  readonly cost: Money;
  readonly weightPounds: number | null;
  readonly description?: string;
  readonly referenceEffects?: readonly string[];
  readonly attackBonus?: number;
  readonly damageBonus?: number;
}

export type ArmorCategory = 'light' | 'medium' | 'heavy' | 'shield';
export type ArmorClassModel =
  | {
      readonly kind: 'armor';
      readonly base: number;
      readonly dexterity: 'full' | 'capped' | 'none';
      readonly dexterityCap?: number;
    }
  | { readonly kind: 'shield'; readonly bonus: number };

export interface ArmorContent extends BaseContent<'armor'> {
  readonly category: ArmorCategory;
  readonly armorClass: ArmorClassModel;
  readonly strengthRequirement: number | null;
  readonly stealthDisadvantage: boolean;
  readonly cost: Money;
  readonly weightPounds: number;
  readonly description?: string;
  readonly referenceEffects?: readonly string[];
  readonly armorClassBonus?: number;
}

export type EquipmentCategory = Extract<InventoryCategory,
  'ammunition' | 'consumable' | 'adventuring-gear' | 'campaign-item' | 'other'>;

export interface EquipmentContent extends BaseContent<'equipment'> {
  readonly category: EquipmentCategory;
  readonly description: string;
  readonly referenceEffects: readonly string[];
  readonly cost: Money;
  readonly weightPounds: number | null;
}

export type MasteryEffectTag =
  | 'extra-attack'
  | 'damage-on-miss'
  | 'light-attack-timing'
  | 'forced-movement'
  | 'attack-disadvantage'
  | 'speed-reduction'
  | 'prone-save'
  | 'next-attack-advantage';

export interface WeaponMasteryContent extends BaseContent<'weaponMastery'> {
  readonly description: string;
  readonly effectTag: MasteryEffectTag;
}

export interface ClassFeatureReferenceEffect {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface StartingEquipmentItem {
  readonly label: string;
  readonly quantity?: number;
  readonly contentId?: ContentId;
  readonly inventoryCategory?: InventoryCategory;
  readonly selection?: { readonly kind: 'background-tool' };
}

export interface StartingEquipmentOption {
  readonly id: string;
  readonly items: readonly StartingEquipmentItem[];
  readonly currency?: Money;
}

export type ClassPrimaryAbility =
  | { readonly mode: 'one-of'; readonly abilities: readonly AbilityKey[] }
  | { readonly mode: 'all-of'; readonly abilities: readonly AbilityKey[] };

export type MulticlassSkillProficiencyChoice =
  | { readonly kind: 'any-skill'; readonly choose: number }
  | { readonly kind: 'class-skill-list'; readonly choose: number }
  | { readonly kind: 'options'; readonly choose: number; readonly from: readonly SkillId[] };

export type WeaponProficiencyRule =
  | { readonly kind: 'category'; readonly category: WeaponCategory }
  | { readonly kind: 'category-with-property'; readonly category: WeaponCategory; readonly anyOfProperties: readonly WeaponProperty['type'][] };

export interface ClassToolProficiency {
  readonly id: string;
  readonly name: string;
}

export type MulticlassToolProficiencyChoice =
  | {
      readonly kind: 'category';
      readonly id: string;
      readonly name: string;
      readonly choose: number;
      readonly category: 'musical-instrument';
    }
  | {
      readonly kind: 'options';
      readonly id: string;
      readonly name: string;
      readonly choose: number;
      readonly options: readonly ClassToolProficiency[];
    };

export interface MulticlassProficiencyGrants {
  readonly weaponProficiencies: readonly WeaponProficiencyRule[];
  readonly armorTraining: readonly ArmorCategory[];
  readonly skillChoices?: MulticlassSkillProficiencyChoice;
  readonly toolProficiencies: readonly ClassToolProficiency[];
  readonly toolChoices?: readonly MulticlassToolProficiencyChoice[];
}

export type ResourceRecoveryTrigger = 'short-rest' | 'long-rest';
export type ResourceRecoveryRule =
  | { readonly trigger: ResourceRecoveryTrigger; readonly mode: 'all'; readonly minimumLevel?: number }
  | { readonly trigger: ResourceRecoveryTrigger; readonly mode: 'amount'; readonly amount: number; readonly minimumLevel?: number };

export type ResourceMaximumRule =
  | { readonly kind: 'level-table'; readonly values: readonly { readonly level: number; readonly uses: number }[] }
  | { readonly kind: 'ability-modifier'; readonly ability: AbilityKey; readonly minimum: number; readonly minimumLevel?: number };

export type ResourceConsumerEffect =
  | { readonly type: 'manual-healing'; readonly die: DieSize; readonly bonus: 'class-level' }
  | { readonly type: 'tracking-only' }
  | { readonly type: 'fixed-expend'; readonly amount: number }
  | { readonly type: 'variable-expend' }
  | { readonly type: 'expend-only' };

export interface ClassResourceConsumer {
  readonly id: ContentId;
  readonly name: string;
  readonly effect: ResourceConsumerEffect;
}

export interface ResourceConsumerGrant {
  readonly resourceId: ContentId;
  readonly consumer: ClassResourceConsumer;
}

export type ResourceTransactionBudgetRule = { readonly kind: 'half-level-round-up' };

export type ResourceTransactionDefinition =
  | {
      readonly id: ContentId;
      readonly name: string;
      readonly kind: 'restore-resource';
      readonly targetResourceId: ContentId;
      readonly usageResourceId?: ContentId;
      readonly restore:
        | { readonly kind: 'fixed'; readonly amount: number }
        | { readonly kind: 'selected'; readonly maximum: number };
    }
  | {
      readonly id: ContentId;
      readonly name: string;
      readonly kind: 'restore-spell-slots-with-budget';
      readonly providerId: ContentId;
      readonly usageResourceId: ContentId;
      readonly budget: ResourceTransactionBudgetRule;
      readonly maximumSpellLevel: LeveledSpellLevel;
      readonly timing: 'short-rest';
    };

export type ActiveSelfEffectAmount =
  | { readonly kind: 'fixed'; readonly amount: number }
  | { readonly kind: 'level-table'; readonly values: readonly { readonly level: number; readonly amount: number }[] };

export type ActiveSelfEffectD20Target =
  | { readonly kind: 'ability-check'; readonly abilities: readonly AbilityKey[] }
  | { readonly kind: 'saving-throw'; readonly abilities: readonly AbilityKey[] }
  | { readonly kind: 'weapon-attack'; readonly abilities: readonly AbilityKey[] }
  | { readonly kind: 'spell-attack'; readonly providerIds: readonly ContentId[] };

export type ActiveSelfEffectModifier =
  | {
      readonly type: 'd20-roll-mode';
      readonly mode: 'advantage' | 'disadvantage';
      readonly target: ActiveSelfEffectD20Target;
    }
  | {
      readonly type: 'spell-save-dc-bonus';
      readonly providerIds: readonly ContentId[];
      readonly amount: number;
    }
  | {
      readonly type: 'weapon-damage-bonus';
      readonly abilities: readonly AbilityKey[];
      readonly amount: ActiveSelfEffectAmount;
    };

export type ActiveSelfEffectRestriction =
  | { readonly type: 'concentration'; readonly mode: 'end-and-block' }
  | { readonly type: 'spellcasting'; readonly mode: 'block' };

export type ActiveSelfEffectEligibility =
  | { readonly type: 'not-wearing-armor-category'; readonly category: Exclude<ArmorCategory, 'shield'> };

export type ActiveSelfEffectTermination =
  | { readonly type: 'condition'; readonly condition: 'incapacitated' }
  | { readonly type: 'wearing-armor-category'; readonly category: Exclude<ArmorCategory, 'shield'> };

export interface ActiveSelfEffectDefinition {
  readonly id: ContentId;
  readonly name: string;
  readonly description: string;
  readonly activationTiming: 'bonus-action' | 'start-of-turn' | 'manual';
  readonly activationCost?: { readonly resourceId: ContentId; readonly amount: number };
  readonly modifiers?: readonly ActiveSelfEffectModifier[];
  readonly restrictions?: readonly ActiveSelfEffectRestriction[];
  readonly eligibility?: readonly ActiveSelfEffectEligibility[];
  readonly termination?: readonly ActiveSelfEffectTermination[];
  readonly clearOnRest?: ResourceRecoveryTrigger;
  readonly referenceText?: string;
}

export interface ClassFeatureContent {
  readonly id: ContentId;
  readonly name: string;
  readonly description: string;
  readonly effects: readonly CharacterRuleEffect[];
  readonly spellcasting?: readonly SpellcastingProviderDefinition[];
  readonly spellGrants?: readonly SpellcastingProviderSpellGrant[];
  readonly resources?: readonly ClassResourceDefinition[];
  readonly resourceConsumers?: readonly ResourceConsumerGrant[];
  readonly resourceTransactions?: readonly ResourceTransactionDefinition[];
  readonly activeSelfEffects?: readonly ActiveSelfEffectDefinition[];
  readonly referenceEffects: readonly ClassFeatureReferenceEffect[];
}

export interface ClassLevelProgression {
  readonly level: number;
  readonly proficiencyBonus: number;
  readonly features: readonly ClassFeatureContent[];
  readonly weaponMasteryChoices?: number;
}

export interface ClassResourceDefinition {
  readonly id: ContentId;
  readonly name: string;
  readonly source: ContentSourceMetadata;
  readonly maximum: ResourceMaximumRule;
  readonly recovery: readonly ResourceRecoveryRule[];
  readonly presentation?: 'pips' | 'numeric';
}

export interface ClassContent extends BaseContent<'class'> {
  readonly hitDie: DieSize;
  readonly fixedHitPointsPerLevel: number;
  readonly primaryAbility: ClassPrimaryAbility;
  readonly multiclassProficiencies: MulticlassProficiencyGrants;
  readonly savingThrowProficiencies: readonly AbilityKey[];
  readonly weaponProficiencies: readonly WeaponProficiencyRule[];
  readonly armorTraining: readonly ArmorCategory[];
  readonly toolProficiencies: readonly ClassToolProficiency[];
  readonly skillChoices: {
    readonly choose: number;
    readonly from: readonly SkillId[];
  };
  readonly startingEquipment: readonly StartingEquipmentOption[];
  readonly progression: readonly ClassLevelProgression[];
  readonly resources: readonly ClassResourceDefinition[];
}

export type DiceTransformationTarget =
  | { readonly kind: 'd20-test' }
  | { readonly kind: 'skill-check'; readonly requireProficiency: boolean }
  | {
      readonly kind: 'weapon-damage';
      readonly weaponMode: 'melee';
      readonly heldWithTwoHands: true;
      readonly anyWeaponProperties: readonly ('two-handed' | 'versatile')[];
    };

export type DiceTransformationDefinition =
  | {
      readonly type: 'reroll-once-use-new';
      readonly die: 20;
      readonly qualifyingFaces: readonly number[];
    }
  | {
      readonly type: 'minimum-die-face';
      readonly minimum: number;
    };

export type CharacterRuleEffect =
  | { readonly type: 'attack-roll-bonus'; readonly weaponMode: 'ranged'; readonly amount: number }
  | { readonly type: 'skill-expertise-choice'; readonly choose: number; readonly eligibility: 'proficient-skills' | 'proficient-class-skills' }
  | { readonly type: 'language-choice'; readonly choose: number }
  | { readonly type: 'language-grant'; readonly languageId: LanguageId }
  | { readonly type: 'armor-class-bonus'; readonly armorCategories: readonly Exclude<ArmorCategory, 'shield'>[]; readonly amount: number }
  | { readonly type: 'skill-check-advantage'; readonly skillIds: readonly SkillId[] }
  | { readonly type: 'saving-throw-roll-mode'; readonly abilities: readonly AbilityKey[]; readonly mode: 'advantage' | 'disadvantage' }
  | { readonly type: 'saving-throw-proficiency'; readonly abilities: readonly AbilityKey[] }
  | { readonly type: 'initiative-modifier'; readonly amount: number }
  | { readonly type: 'initiative-proficiency' }
  | { readonly type: 'initiative-half-proficiency' }
  | { readonly type: 'initiative-roll-mode'; readonly mode: 'advantage' | 'disadvantage' }
  | { readonly type: 'hit-point-bonus-per-class-level'; readonly amount: number }
  | {
      readonly type: 'speed-bonus';
      readonly amount: ActiveSelfEffectAmount;
      readonly disallowedArmorCategories?: readonly Exclude<ArmorCategory, 'shield'>[];
      readonly requireNoShield?: boolean;
    }
  | { readonly type: 'critical-threshold'; readonly attackKind: 'weapon'; readonly minimumNatural: number }
  | {
      readonly type: 'dice-transformation';
      readonly id: ContentId;
      readonly optional: boolean;
      readonly target: DiceTransformationTarget;
      readonly transformation: DiceTransformationDefinition;
    }
  | { readonly type: 'unarmored-armor-class'; readonly base: number; readonly abilities: readonly AbilityKey[]; readonly allowShield: boolean };

export type SpellLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type LeveledSpellLevel = Exclude<SpellLevel, 0>;
export type SpellSchool = 'abjuration' | 'conjuration' | 'divination' | 'enchantment' | 'evocation' | 'illusion' | 'necromancy' | 'transmutation';

export interface SpellListReference {
  readonly id: string;
  readonly name: string;
}

export interface SpellDieTerm {
  readonly count: number;
  readonly die: DieSize;
}

export interface SpellRollAmount {
  readonly dice: readonly SpellDieTerm[];
  readonly modifier: 'none' | 'spellcasting-ability';
}

export type SpellScaling =
  | {
      readonly kind: 'character-level-dice';
      readonly values: readonly { readonly level: number; readonly dice: readonly SpellDieTerm[] }[];
    }
  | {
      readonly kind: 'slot-level-dice';
      readonly baseSpellLevel: LeveledSpellLevel;
      readonly dicePerLevel: readonly SpellDieTerm[];
    };

export type SpellMechanic =
  | { readonly type: 'spell-attack'; readonly attackType: 'melee' | 'ranged' }
  | { readonly type: 'saving-throw'; readonly ability: AbilityKey; readonly onSuccess: 'none' | 'half' }
  | { readonly type: 'damage'; readonly amount: SpellRollAmount; readonly damageType: DamageType; readonly scaling?: SpellScaling }
  | { readonly type: 'healing'; readonly amount: SpellRollAmount; readonly scaling?: SpellScaling };

export interface SpellReferenceEffect {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface SpellContent extends BaseContent<'spell'> {
  readonly level: SpellLevel;
  readonly school: SpellSchool;
  readonly castingTime: string;
  readonly range: string;
  readonly components: {
    readonly verbal: boolean;
    readonly somatic: boolean;
    readonly material: boolean;
    readonly materialText?: string;
  };
  readonly duration: string;
  readonly concentration: boolean;
  readonly ritual: boolean;
  readonly target?: string;
  readonly description: string;
  readonly higherLevelDescription?: string;
  readonly spellLists: readonly SpellListReference[];
  readonly mechanics: readonly SpellMechanic[];
  readonly referenceEffects: readonly SpellReferenceEffect[];
}

export interface SpellSlotLevelDefinition {
  readonly spellLevel: LeveledSpellLevel;
  readonly resourceId: ContentId;
  readonly name: string;
}

export interface SpellSlotProgressionEntry {
  readonly level: number;
  readonly slots: readonly { readonly spellLevel: LeveledSpellLevel; readonly maximum: number }[];
}

export interface SpellSlotPoolDefinition {
  readonly id: ContentId;
  readonly name: string;
  readonly slotLevels: readonly SpellSlotLevelDefinition[];
  readonly progression: readonly SpellSlotProgressionEntry[];
  readonly recovery: readonly ResourceRecoveryRule[];
}

export interface LevelCountEntry {
  readonly level: number;
  readonly count: number;
}

export type SpellManagementDefinition =
  | { readonly kind: 'granted-only'; readonly spellIds: readonly ContentId[] }
  | {
      readonly kind: 'prepared-from-list';
      readonly spellListId: string;
      readonly cantripCount: readonly LevelCountEntry[];
      readonly preparedSpellCount: readonly LevelCountEntry[];
      readonly replacement: 'long-rest-any' | 'long-rest-one' | 'class-level-one';
    }
  | {
      readonly kind: 'prepared-from-owned';
      readonly spellListId: string;
      readonly cantripCount: readonly LevelCountEntry[];
      readonly preparedSpellCount: readonly LevelCountEntry[];
      readonly replacement: 'long-rest-any' | 'long-rest-one' | 'class-level-one';
      readonly initialOwnedSpellCount: number;
      readonly initialOwnedSpellLevel: LeveledSpellLevel;
    };

export interface SpellcastingProviderSpellGrant {
  readonly providerId: ContentId;
  readonly spellIds: readonly ContentId[];
  readonly status: 'always-prepared';
  readonly minimumLevel?: number;
}

export type MulticlassSlotContribution =
  | { readonly kind: 'spellcasting'; readonly contribution: 'full' }
  | { readonly kind: 'spellcasting'; readonly contribution: 'half'; readonly rounding: 'up' }
  | { readonly kind: 'spellcasting'; readonly contribution: 'third'; readonly rounding: 'down' }
  | { readonly kind: 'pact-magic' }
  | { readonly kind: 'independent' };

export interface SpellcastingProviderDefinition {
  readonly id: ContentId;
  readonly name: string;
  readonly spellcastingAbility: { readonly kind: 'fixed'; readonly ability: AbilityKey };
  readonly multiclassSlotContribution: MulticlassSlotContribution;
  readonly spellManagement: SpellManagementDefinition;
  readonly slotPool?: SpellSlotPoolDefinition;
  readonly ritualCasting: 'none' | 'prepared' | 'owned';
}

export interface SubclassReferenceEffect {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface SubclassFeatureContent {
  readonly id: ContentId;
  readonly name: string;
  readonly description: string;
  readonly effects: readonly CharacterRuleEffect[];
  readonly spellcasting?: readonly SpellcastingProviderDefinition[];
  readonly spellGrants?: readonly SpellcastingProviderSpellGrant[];
  readonly resources?: readonly ClassResourceDefinition[];
  readonly resourceConsumers?: readonly ResourceConsumerGrant[];
  readonly resourceTransactions?: readonly ResourceTransactionDefinition[];
  readonly activeSelfEffects?: readonly ActiveSelfEffectDefinition[];
  readonly referenceEffects: readonly SubclassReferenceEffect[];
}

export interface SubclassLevelProgression {
  readonly level: number;
  readonly features: readonly SubclassFeatureContent[];
}

export interface SubclassContent extends BaseContent<'subclass'> {
  readonly parentClassId: ContentId;
  readonly acquisitionLevel: number;
  readonly progression: readonly SubclassLevelProgression[];
  readonly description: string;
}

export type CharacterSize = 'small' | 'medium';

export type SpeciesSize =
  | { readonly kind: 'fixed'; readonly value: CharacterSize }
  | { readonly kind: 'choice'; readonly options: readonly CharacterSize[] };

export interface SpeciesSense {
  readonly type: 'darkvision';
  readonly rangeFeet: number;
}

export interface SpeciesTraitReference {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly support: 'structured' | 'reference-only';
}

export interface SpeciesChoiceOption {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly speedFeet?: number;
  readonly darkvisionFeet?: number;
}

export interface SpeciesChoiceDefinition {
  readonly id: string;
  readonly name: string;
  readonly options: readonly SpeciesChoiceOption[];
}

export interface SpeciesSkillProficiencyChoice {
  readonly id: string;
  readonly choose: number;
  readonly from: readonly SkillId[];
}

export interface SpeciesContent extends BaseContent<'species'> {
  readonly creatureType: 'humanoid';
  readonly size: SpeciesSize;
  readonly speedFeet: number;
  readonly senses: readonly SpeciesSense[];
  readonly traits: readonly SpeciesTraitReference[];
  readonly choices: readonly SpeciesChoiceDefinition[];
  readonly skillProficiencyChoice?: SpeciesSkillProficiencyChoice;
  readonly effects?: readonly CharacterRuleEffect[];
}

export type BackgroundToolProficiency =
  | { readonly kind: 'fixed'; readonly id: string; readonly name: string }
  | { readonly kind: 'choice'; readonly category: string; readonly options: readonly { readonly id: string; readonly name: string }[] };

export interface OriginFeatReference {
  readonly id: ContentId;
  readonly name: string;
  readonly variant?: string;
}

export type FeatCategory = 'origin' | 'general' | 'fighting-style' | 'epic-boon';

export type FeatPrerequisite =
  | { readonly type: 'level'; readonly minimum: number }
  | { readonly type: 'ability-minimum'; readonly abilities: readonly AbilityKey[]; readonly minimum: number }
  | { readonly type: 'feature'; readonly name: string; readonly support: 'reference-only' };

export type FeatEffect =
  | {
      readonly type: 'ability-score-increase';
      readonly choiceId: string;
      readonly allowedAbilities: readonly AbilityKey[];
      readonly selections: 1 | 2;
      readonly amountPerSelection: 1;
      readonly maximum: 20 | 30;
      readonly allowDuplicateSelection: boolean;
    }
  | CharacterRuleEffect;

export interface FeatChoiceDefinition {
  readonly id: string;
  readonly name: string;
  readonly support: 'structured' | 'reference-only';
  readonly description: string;
  readonly options?: readonly { readonly id: string; readonly name: string }[];
}

export interface FeatReferenceEffect {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface FeatContent extends BaseContent<'feat'> {
  readonly category: FeatCategory;
  readonly prerequisites: readonly FeatPrerequisite[];
  readonly repeatable: boolean;
  readonly repeatabilityNote?: string;
  readonly choices: readonly FeatChoiceDefinition[];
  readonly effects: readonly FeatEffect[];
  readonly referenceEffects: readonly FeatReferenceEffect[];
  readonly description: string;
}

export interface BackgroundContent extends BaseContent<'background'> {
  readonly abilityScores: readonly [AbilityKey, AbilityKey, AbilityKey];
  readonly skillProficiencies: readonly [SkillId, SkillId];
  readonly toolProficiency: BackgroundToolProficiency;
  readonly originFeat: OriginFeatReference;
  readonly startingEquipment: readonly StartingEquipmentOption[];
  readonly description: string;
}

export type ContentEntry = ClassContent | SubclassContent | SpeciesContent | BackgroundContent | FeatContent | SpellContent | WeaponContent | ArmorContent | EquipmentContent | WeaponMasteryContent;
export type ContentOfKind<K extends ContentKind> = Extract<ContentEntry, { kind: K }>;

export interface ContentByKind {
  class: ClassContent;
  subclass: SubclassContent;
  species: SpeciesContent;
  background: BackgroundContent;
  feat: FeatContent;
  spell: SpellContent;
  weapon: WeaponContent;
  armor: ArmorContent;
  equipment: EquipmentContent;
  weaponMastery: WeaponMasteryContent;
}
