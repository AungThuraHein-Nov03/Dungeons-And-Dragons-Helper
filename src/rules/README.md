# Rules Engine

Milestone 13C keeps `src/rules/` deterministic and independent from React, browser storage, and random-number generation. Stored Character choices plus immutable Content Registry entries are inputs; derived Character state is output. Mutable tabletop state remains owned by the existing play-state/resource transitions, bounded restoration transactions operate only on already-derived resources, and all randomness remains owned by the existing Dice Engine.

## Character v8 boundary

The current Character storage key is `dnd3.characters.v8`. `dnd3.characters.v7` is the newest legacy migration source. The v7 → v8 migration adds only `spellcastingSelections: []` and preserves valid legacy state without inspecting Class identity, fabricating provider selections, or reseeding equipment.

Stored build state contains one `classId`, optional `subclassId`, Species/Background choices, base ability scores, class skill choices, `manualFeats`, generic provider-scoped `CharacterSpellcastingSelection[]`, authoritative Inventory/currency, HP progression, and mutable play state. Each spellcasting selection stores only provider ID, selected cantrip IDs, owned leveled-spell IDs, and prepared owned-spell IDs. It does not create Wizard-specific fields.

`CharacterPlayState` remains exactly current HP, Temporary HP, Hit Dice remaining, and `resourceUses`. Spell slots and Class-resource uses continue to live in `playState.resourceUses`; spell ownership/preparation never lives in play state. A migrated pre-M9 level-3+ Fighter can retain the deliberate unresolved-subclass sentinel for unrelated edits; normal threshold crossing still requires an explicit valid Subclass.

## Class derivation

`ClassContent` is now mechanically first-class rather than just a progression/reference container.

A Class defines bounded data for:

- Hit Die and fixed HP
- primary abilities using `one-of` or `all-of`
- saving throw proficiencies
- weapon proficiency rules
- armor training
- class tool proficiencies
- class skill choices
- starting-equipment options
- levels 1–20
- generic resources

Each progression row contains bounded `ClassFeatureContent` values. `deriveCharacterClass()` partitions those features into acquired and future state. Only acquired features emit capabilities:

```text
ClassFeatureContent
    ├─ CharacterRuleEffect[]
    ├─ SpellcastingProviderDefinition[]
    ├─ SpellcastingProviderSpellGrant[]
    ├─ feature-owned ClassResourceDefinition[]
    ├─ ResourceConsumerGrant[]
    ├─ ResourceTransactionDefinition[]
    └─ reference-only effects
```

Future features are presentation/reference data only.

The same model is used by bundled and structurally compatible Homebrew Classes. Rules do not branch on Class names, Class IDs, or Homebrew source.

## Class + Subclass aggregation

`deriveCharacterState()` obtains Class and Subclass state independently, then combines acquired grants:

```text
Class acquired features            Subclass acquired features
        │                                   │
        ├──── typed effects ────────────────┤
        ├──── Spellcasting providers ───────┤
        ├──── feature resources ─────────────┤
        ├──── resource-consumer grants ──────┤
        └──── bounded transactions ──────────┘
                            ↓
               shared derived rules
```

This preserves the M9 distinction between selection and acquisition. A selected Subclass contributes no future feature mechanics early.

The bundled M12E Subclasses are exactly:

- Champion → Fighter
- Path of the Berserker → Barbarian
- Life Domain → Cleric
- Thief → Rogue
- College of Lore → Bard
- Oath of Devotion → Paladin
- Hunter → Ranger
- Circle of the Land → Druid
- Warrior of the Open Hand → Monk
- Draconic Sorcery → Sorcerer
- Fiend Patron → Warlock
- Evoker → Wizard

Supported Subclass mechanics reuse the same generic effect/resource/provider pipeline. Life Domain, College of Lore, Circle of the Land, and Warrior of the Open Hand can add acquired consumers to parent Class resources; Oath of Devotion, Draconic Sorcery, and Fiend Patron can attach provider-scoped always-prepared spells. Draconic Resilience also uses bounded generic AC and HP derivation effects. Circle land-choice spell tables, Wholeness of Body, Metamagic/event mutation, Fiend triggers, and other mechanics that depend on targets, conditions, event timing, active combat state, auras, transformations, or unsupported persistent choices remain reference-only.

## Generic resource architecture

`ClassResourceDefinition` supports explicit `level-table` maxima or bounded ability-modifier maxima, plus presentation metadata and level-aware recovery metadata. Resource consumers can spend one use, a validated variable amount, or a validated fixed multi-point amount through the same transition. The generic model contains no Bard-, Paladin-, Ranger-, Druid-, Monk-, Sorcerer-, Warlock-, or Fighter-specific resource fields.

`deriveClassResources()`:

1. resolves the resource maximum at Character level,
2. receives resource-consumer grants from acquired Class/Subclass features,
3. attaches only consumers targeting that resource,
4. rejects duplicate consumer IDs,
5. emits ordinary `DerivedResource` values.

Current bundled resource examples:

- Fighter Second Wind — level-table maximum, Short Rest +1, Long Rest all
- Fighter Action Surge — level-table maximum, Short/Long Rest all
- Barbarian Rage — level-table maximum, Short Rest +1, Long Rest all
- Cleric Channel Divinity — level-table maximum, Short Rest +1, Long Rest all
- Bard Bardic Inspiration — Charisma-derived maximum; Short Rest recovery begins at Bard 5
- Paladin Lay On Hands — numeric level-table pool with bounded variable expenditure
- Paladin Channel Divinity — level-table maximum with shared recovery metadata
- Ranger Favored Enemy — level-table free-cast bookkeeping
- Ranger Tireless / Nature’s Veil — Wisdom-derived maxima with minimum levels
- Druid Wild Shape — level-table uses, Short Rest +1, Long Rest all
- Monk Focus Points — level-table numeric pool equal to Monk level from level 2, Short/Long Rest all
- Monk Superior Defense — M13D active-self-effect activation costs 3 Focus through the existing resource path; Open Hand Quivering Palm remains a fixed 4-Focus expenditure
- Sorcerer Innate Sorcery — level-table uses, Long Rest all
- Sorcerer Sorcery Points — numeric level-table pool equal to Sorcerer level from level 2, Long Rest all
- Warlock Pact Magic slots — provider-owned generic slot resources whose active slot level/count come from provider progression and recover on Short/Long Rest
- Spell slots — provider-derived generic resources

Acquired Class/Subclass consumers attach to existing parent resources; they do not create parallel pools.

Mutable remaining uses remain in `CharacterPlayState.resourceUses`. Existing reconciliation removes no-longer-derived resources, preserves surviving resources within their current maxima, and initializes newly derived resources at their current maximum. M13C feature-use gates are ordinary resources in this same map; no transaction-specific play-state field exists.

### Bounded resource restoration transactions

M13C adds only two generic transaction definitions: `restore-resource` and `restore-spell-slots-with-budget`. `restoreResource()` is the single bounded primitive: it requires a positive whole-number amount, resolves an existing `DerivedResource`, rejects an already-full or unknown resource, and clamps the result to that resource's existing maximum. A transaction can optionally consume one already-derived usage resource after successful restoration.

Weighted spell-slot recovery never creates slots. It resolves the active existing `SpellcastingProviderDefinition` slot pool, considers only already-derived slot resources at or below the transaction's maximum slot level, and validates actual expended capacity. Each restored slot costs its spell level; the supported budget rule is `half-level-round-up`, evaluated as `ceil(Character class level / 2)`. Duplicate selections, non-positive counts, restoration beyond expended capacity, ineligible resources, over-budget combinations, missing provider/resources, and no-op full-resource requests reject before mutation.

For transactions timed at `short-rest`, complete validation happens first. A valid execution then runs the existing `finishShortRest()` transition exactly once, restores only the selected eligible resources, and consumes the ordinary usage resource last. This preserves existing Short-Rest recovery metadata without a rest event engine and ensures rejected/no-op transactions neither process a rest nor consume their feature use.

## Training model

M11 adds only bounded reusable training structures.

### Primary abilities

```text
one-of
all-of
```

These are descriptive Class metadata and do not create a generic choice interpreter.

### Weapon proficiency

A Class can define:

```text
category
category + any-of explicit weapon properties
```

`isWeaponProficient()` evaluates only those typed rules. Rogue uses Simple weapons plus Martial weapons carrying Finesse or Light. There is no Rogue name/ID branch.

### Tool proficiencies

Fixed Class tool proficiency metadata is carried through derived Class state and CHARACTER/Compendium presentation. Rogue exposes Thieves’ Tools. M11 does not add tool-check automation or persistent Class tool choices.

## Bounded Unarmored AC

`CharacterRuleEffect` includes:

```ts
{
  type: 'unarmored-armor-class';
  base: number;
  abilities: AbilityKey[];
  allowShield: boolean;
}
```

Armor derivation evaluates this only when body armor is absent and respects the explicit shield flag. Barbarian Unarmored Defense is therefore data:

```text
10 + DEX modifier + CON modifier; shield allowed
```

This is not a universal effect interpreter and does not switch on Barbarian identity.

## Spellcasting providers

Spellcasting remains outside `CharacterRuleEffect`.

Acquired Class or Subclass features may emit ordinary `SpellcastingProviderDefinition` values. `deriveSpellcastingProviders()` consumes the combined grant list and keeps the M10 rules:

```text
Spell Save DC          = 8 + PB + Spellcasting Ability modifier
Spell Attack Modifier  = PB + Spellcasting Ability modifier
```

The provider ability uses **final derived ability scores**, after supported Background and Feat changes. Multiple providers remain independent and provider-scoped.

### `granted-only`

The M10 management model remains supported. Explicit spell IDs resolve to actual provider-castable `spells`.

### `prepared-from-list`

The existing bounded provider metadata model remains shared across Cleric, Bard, Paladin, Ranger, Druid, Sorcerer, Warlock, and structurally compatible Homebrew content:

```text
spell-list ID
level-driven cantrip count
level-driven prepared-spell count
replacement policy: long-rest-any | long-rest-one | class-level-one
```

It deliberately does **not** create persisted prepared ownership. `management.catalogSpells` is availability/reference information, and provider-scoped always-prepared grants remain derived rather than copied into Character selections.

### `prepared-from-owned`

M12E adds one generic provider mode for spell collections where ownership and preparation are distinct. `CharacterSpellcastingSelection` is keyed by provider and stores selected cantrips, owned leveled spells, and prepared owned spells. Validation enforces provider list membership, level eligibility, configured counts, and the invariant that a prepared leveled spell must already be owned. Unknown stored IDs remain non-destructively persisted but mechanically inert.

Wizard uses this same generic mode with Intelligence, six explicit initial level-1 owned spells, and the ordinary full-caster slot pool. Higher-level direct creation/editing does not fabricate the two spells normally gained per Wizard level; only explicitly stored ownership exists.

### Ritual policy and fixed grants

`ritualCasting` is a generic provider policy with exactly `none`, `prepared`, and `owned`. `owned` can expose an owned unprepared Ritual without adding it to the normal prepared/castable list; `prepared` retains prepared-only eligibility.

Provider-scoped `SpellcastingProviderSpellGrant` metadata still handles fixed always-prepared spells. Fixed grants remain derived, do not consume the ordinary preparation count, and are never copied into persisted `preparedSpellIds`.

M13C implements Arcane Recovery weighted restoration through the generic bounded transaction path. Memorize Spell timing, Spell Mastery/Signature Spells free-cast state, Pact-specific feature systems such as Magical Cunning, Sorcery Point conversion/Sorcerous Restoration, multiclass slot combination, target state, and spell-effect/duration enforcement remain deferred/reference-only. M13B session bookkeeping remains separate.

## Spell-slot resources

Provider slot pools continue to define stable slot-resource IDs, level-keyed maxima, and normal recovery metadata. They become ordinary `DerivedResource` entries and share `playState.resourceUses` with Class resources.

There is no separate spell-slot persistence model and no spell-specific rest engine.

## Ability scores, Feats, and origins

Stored ability scores remain player-entered base scores. Background ability changes are applied before supported Feat ability-score effects. Final scores feed all ordinary derived calculations, including Class-granted Spellcasting.

Background Origin Feats remain derived from Background and are not copied to `manualFeats`. The bundled Feat count remains exactly 17, and Tough remains absent from the bundled SRD set.

## HP and class changes

Maximum HP is derived from:

```text
selected Class Hit Die/fixed value
+ stored level-by-level HP progression
+ final Constitution modifier
```

Create/Edit Class changes do not rewrite HP history.

- fixed entries remain fixed and resolve against the new Class
- legal rolled entries remain unchanged
- a roll above the destination Class Hit Die becomes an explicit validation error
- rolls are never clamped, rerolled, fabricated, or silently changed to fixed

Existing resource reconciliation handles the destination Class's resource set. Inventory is independent from proficiency and is never deleted merely because Class changes.

## Inventory and weapon/armor derivation

Inventory remains the single authoritative ownership/equipment model.

New Character creation seeds the selected Class starting package and Background starting package once into Inventory/currency. The Class-package selector is form-local and not persisted as a new Character field. Structured starting items begin owned but unequipped; equipment state is managed from Inventory.

Weapon derivation consumes generic proficiency rules. Armor derivation consumes normal armor training, bounded AC effects, and generic unarmored formulas. Neither subsystem branches on Class identity.

## Dice boundary

`src/dice/` remains the only Dice Engine. M11 adds no second evaluator, random source, arbitrary expression parser, or event engine.

Existing ability/save/skill/weapon/spell/resource/Hit Die rolls continue through the existing request/result architecture. Class expansion changes derived inputs; it does not duplicate dice behavior.

## Homebrew Class compatibility

Synthetic conformance coverage verifies the shared Class/Subclass path and every widened M12B–M12E generic capability, including fixed multi-point resource expenditure, static HP-per-class-level effects, Pact-style provider slot progression/recovery, generic prepared-from-owned selection, and owned/prepared Ritual policies:

```text
Homebrew storage / synthetic content
    ↓
Content Registry + validation
    ↓
Class / Subclass / provider acquisition
    ├─ bounded rule effect
    ├─ ability-derived or level-table resource + consumer
    ├─ level-gated recovery / bounded variable expenditure
    ├─ validated fixed multi-point expenditure
    ├─ static Hit Point bonus per class level
    ├─ provider slot-count / active-slot-level progression + recovery
    ├─ feature-owned usage resource + bounded restoration transaction
    ├─ prepared-from-list replacement policy
    ├─ prepared-from-owned provider-scoped selection
    ├─ Ritual policy: none | prepared | owned
    └─ provider-scoped always-prepared spell grant
    ↓
Derived rules / play-state transitions
    ↓
existing Dice Engine
```

The synthetic fixtures prove the widened resource and Spellcasting vocabulary without relying on bundled Class/Subclass names or content IDs. M12E proves provider-scoped cantrip/owned/prepared persistence, ownership-before-preparation, preparation limits, spell-level eligibility, derived fixed grants, owned and prepared Ritual semantics, unresolved-ID inertness, and malformed metadata rejection. M13C additionally proves feature-owned usage resources plus both generic restoration transaction shapes through unrelated Homebrew content-to-runtime/service/UI paths. No mechanics branch on `source === "homebrew"`, Class/Subclass/feature name, or content ID. No Homebrew Creator UI is added.

## CHARACTER / PLAY / Compendium

### CHARACTER

CHARACTER now shows a generic Class progression section with source/training, acquired features, future features, structured automated effects, and reference-only behavior. Subclass progression remains separate.

When Spellcasting exists, the existing Spellcasting section is reused. Prepared-from-list providers show DC/attack, slots, allowed counts, and catalog coverage without fabricating selections. Prepared-from-owned providers additionally show selected cantrips, owned leveled spells, prepared owned spells, and Ritual eligibility as separate concepts; owned unprepared Rituals are not ordinary prepared cast buttons.

### PLAY

M13A adds only a compact Initiative/Cover context surface to the existing PLAY cockpit. Initiative rolls through the single Dice Engine with its own manual Normal/Advantage/Disadvantage control and derived generic Initiative effects. Cover is in-memory page context: Half and Three-Quarters Cover display contextual AC and feed only Dexterity saving throws; Total Cover is informational and never becomes a numeric AC bonus. Existing Class resources and provider-owned spell slots continue through the same `playState.resourceUses` controls. There is no Initiative order, encounter/turn state, session-state cache, Class-specific runtime page, target tracker, or generic combat-event engine.

### Compendium

The existing Class/Subclass list/detail routes are reused. Class details are content-driven rather than Fighter-specific and show training, starting packages, resources, linked Subclass, 1–20 progression, and Class Spellcasting provider summaries when present.

## Bundled M12E content

Exactly twelve Classes are bundled:

```text
Fighter
Barbarian
Cleric
Rogue
Bard
Paladin
Ranger
Druid
Monk
Sorcerer
Warlock
Wizard
```

Exactly twelve Subclasses are bundled:

```text
Champion
Path of the Berserker
Life Domain
Thief
College of Lore
Oath of Devotion
Hunter
Circle of the Land
Warrior of the Open Hand
Draconic Sorcery
Fiend Patron
Evoker
```

The SpellContent catalog remains exactly 339 SRD 5.2.1 entries, while the Feat catalog remains exactly seventeen.

## Milestone 13A rules boundary

M13A extends the existing Dice Engine with one typed D20 context path for labeled numeric modifiers plus automatic Advantage and Disadvantage sources. Manual roll mode and automatic sources resolve through the same non-stacking cancellation rule, and Roll History retains the manual input, contextual sources/modifiers, and final resolved mode. Initiative is a first-class Dexterity check using this path with generic numeric, full-Proficiency, half-Proficiency, and Advantage/Disadvantage effects. Alert, Jack of All Trades, Champion Remarkable Athlete, and Barbarian Feral Instinct are expressed through those generic effects rather than content-name/ID branches.

Cover is temporary UI/roll context only. Half Cover contributes +2 contextual AC and Dexterity saving throws; Three-Quarters Cover contributes +5; Total Cover is an informational direct-targeting restriction and has no fabricated numeric AC/save bonus. Cover does not mutate base derived defense and is not stored in Character data, `CharacterPlayState`, localStorage, or sessionStorage.

## Milestone 13B rules boundary

M13B adds one bounded Character-side PLAY session-state service. Its effective persisted cache shape is `conditions: CharacterConditionId[]` plus optional `concentration: { spellId; providerId }`. The cache is per Character under `dnd3.play-session.v1:<encoded-character-id>` in `sessionStorage`, is non-authoritative/disposable, rejects malformed or unexpected fields, reconciles stale Concentration references away, and is cleared for that Character on deletion. Character persistence remains v8 with v7 as the newest legacy migration source; `CharacterPlayState` remains exactly `currentHp`, `temporaryHp`, `hitDiceRemaining`, and `resourceUses`.

The supported Character-side condition set is exactly Blinded, Charmed, Deafened, Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, and Unconscious. Exhaustion is intentionally absent. `conditions.ts` is the single rules mapping for deterministic self-side consequences: supported automatic Advantage/Disadvantage feeds the existing M13A D20 context resolver, while source-, target-, visibility-, opponent-, distance-, movement-, resistance-, battlefield-, and encounter-dependent effects remain informational/manual.

Concentration uses existing structured `SpellContent.concentration` metadata and existing spellcasting-provider derivation; it does not parse spell prose or add a new spell-mechanic vocabulary. Start, replacement, explicit End, browser-session restoration, stale-reference reconciliation, and Incapacitated-family termination are explicit Character-side session operations. Starting or ending Concentration does not mutate spell-slot resources.

Damage-triggered Concentration checks are an explicit helper workflow using the existing Constitution saving throw path, Dice Engine, D20 context resolver, and Roll History. The DC is `min(30, max(10, floor(damage / 2)))`. Success retains Concentration; failure ends it within this explicit workflow only. No global damage listener/event bus or automatic natural-1/natural-20 save rule is added.

M13A Cover remains separate ephemeral UI/roll context. It is not part of `PlaySessionState`, `sessionStorage`, Character persistence, or `CharacterPlayState`; reload resets Cover independently of M13B session Conditions/Concentration.

## Milestone 13C rules boundary

M13C adds an explicit player-initiated bounded resource-transaction layer without changing the Character schema. Content may declare feature-owned ordinary resources and either `restore-resource` or `restore-spell-slots-with-budget` transactions. Derivation resolves those declarations against the same active Class/Subclass resources and Spellcasting providers; execution reuses the same `CharacterPlayState.resourceUses`, `finishShortRest()`, Long Rest recovery metadata, and Character play-state persistence seam.

Arcane Recovery and Circle of the Land Natural Recovery use the same weighted transaction executor. Their recovery budget is `ceil(class level / 2)`; each recovered slot costs its slot level; only actually expended slot resources can be restored; and the bundled definitions cap recovery at spell-slot level 5. Each has one ordinary Long-Rest-reset feature-use resource. Natural Recovery's separate free prepared Circle-spell cast remains reference-only.

The M13C PLAY surface is only a compact renderer over derived transactions. It shows the content-supplied action label, remaining feature uses, budget/remaining budget, eligible expended resources, per-resource selected counts, and weighted selected cost. It does not dispatch on Wizard, Druid, Arcane Recovery, Natural Recovery, SRD IDs, or Homebrew source.

Character remains v8 under `dnd3.characters.v8`, with `dnd3.characters.v7` as the newest legacy source. `CharacterPlayState` remains exactly `currentHp`, `temporaryHp`, `hitDiceRemaining`, and `resourceUses`. M13D extends the same disposable M13B `PlaySessionState` with `activeEffectIds`; M13C transaction execution remains separate from session Conditions/Concentration/active effects and does not persist transaction state there. M13A Cover remains ephemeral page/roll context.

## Milestone 13D active-self-effect boundary

M13D adds one bounded `ActiveSelfEffectDefinition` vocabulary to acquired Class/Subclass features. Definitions may contain a stable ID, name/description, explicit activation timing, optional cost referencing an already-derived resource, bounded D20 roll-mode targets, bounded temporary static modifiers, Concentration/spellcasting restrictions, simple eligibility/termination metadata, optional rest clearing, and reference text. Validation rejects unsupported/executable metadata; no universal effect interpreter, prose parser, feature-name dispatcher, Class-name dispatcher, or Homebrew-source dispatcher is introduced.

`deriveCharacterState()` gathers active-self-effect grants from the same acquired Class/Subclass progression paths and emits `DerivedActiveSelfEffect[]`. The one M13B session store is extended to `conditions`, optional `concentration`, and `activeEffectIds` under the existing `dnd3.play-session.v1:<encoded-character-id>` namespace. Missing `activeEffectIds` in an otherwise valid older M13B record defaults to `[]`; malformed/duplicate IDs reject safely and stale IDs reconcile away without discarding unrelated valid Conditions or compatible Concentration.

Activation/deactivation is explicit player control through one generic service. Activation validates before mutation and spends any cost through the existing authoritative resource transition, so invalid/duplicate/depleted activation is atomic and cannot double-spend. Deactivation removes only the requested active ID and never refunds the cost. M13C restoration transactions remain unchanged and have no session-state fields.

Active D20 modifiers are translated into the existing M13A `D20RollContext` and therefore use the existing non-stacking/cancellation resolver and Roll History provenance. Temporary static modifiers are derived only from the current active IDs and are not persisted as Character or session-derived values. Conditions continue to compose through their existing D20 context mapping. Concentration remains the single M13B state: compatible active effects preserve it; structured conflicts can end it on activation and block the explicit start workflow while active.

Bundled M13D mappings are:
- Barbarian **Rage** — Bonus Action activation, existing Rage-use cost, Strength ability-check/save Advantage, level-scaled Strength weapon Rage Damage, Heavy-armor activation/termination plus deterministic Incapacitated termination, Concentration conflict, and supported Character-side spellcasting block. Duration/maintenance and event-driven termination beyond those structured rules, plus incoming B/P/S resistance, stay manual/reference-only.
- Sorcerer **Innate Sorcery** — Bonus Action activation, existing-use cost, Sorcerer spell-attack Advantage, and +1 Sorcerer spell save DC. Its one-minute duration remains manual.
- Monk **Superior Defense** — the verified SRD level-18 Monk feature, not a Champion feature. Activation spends 3 Focus Points and Incapacitated terminates the tracked mode. Duration and incoming resistance remain manual/reference-only. Champion level 18 remains **Survivor** and is not expanded by M13D.

Synthetic Homebrew active effects are validated, acquired, derived, activated/deactivated, persisted/reconciled in session state, applied through the same D20/static/resource paths, and discovered by the generic PLAY UI without source/name/ID branching.

Character remains v8; `CharacterPlayState` remains exactly `currentHp`, `temporaryHp`, `hitDiceRemaining`, and `resourceUses`. Active IDs never enter Character input, Character localStorage, Character migrations, or `CharacterPlayState`. Cover remains ephemeral and outside `PlaySessionState`.

## Milestone 13E rules boundary

M13E adds two and only two generic dice transformations to the existing `src/dice/` engine:

- `reroll-once-use-new`: optional, post-roll, bounded to one application. The selected qualifying die is rerolled exactly once and the replacement must be used. A replacement that is also qualifying does not recurse.
- `minimum-die-face`: automatic during the ordinary roll. Each qualifying die below the configured minimum is replaced by that minimum before the final total is resolved.

`RollRequest.diceTransformations` carries resolved, source-labelled transformation metadata. `RollResult.diceTransformationApplications` records provenance. Reroll provenance stores original → replacement → final; minimum-face provenance stores original → final. Optional transformations are applied by the one Dice Engine helper and the one Roll History service updates the existing history entry in place. No second roll record or transformation-state store is created.

Transformation validation is fail-closed. Unsupported kinds/targets, executable values, duplicate IDs, invalid die sizes/faces/minima, optional minimum-face policies, recursive/unbounded extra policy fields, and malformed persisted application records reject instead of becoming inert scripting metadata.

The generic static Character-rule additions are:

- `saving-throw-roll-mode`
- `saving-throw-proficiency`
- `speed-bonus`
- `critical-threshold` with `attackKind: 'weapon'`

Species, Feat, acquired Class, and acquired Subclass effects are combined by the existing `deriveCharacterState()` pipeline. Saving-throw roll modes flow into the existing M13A `D20RollContext`, including normal same-direction non-stacking and opposing Advantage/Disadvantage cancellation. Later save proficiency augments the ordinary Class save-proficiency set. Concentration remains the existing Constitution-save workflow; Initiative remains the M13A first-class Dexterity check.

`derivePassivePerception()` uses the actual derived Perception modifier and the resolved D20 mode: +5 for Advantage, -5 for Disadvantage, 0 for Normal/cancelled. `DerivedSkill` has no Expertise-selection field, and Character persistence does not authoritatively store which Expertise choices were selected, so M13E does not infer or double Proficiency.

`deriveCharacterSpeed()` begins with the resolved Species walking Speed, adds acquired generic Speed bonuses whose armor/shield conditions pass, and applies -10 feet when equipped armor has a structured Strength requirement the Character does not meet. Meeting the requirement removes the penalty. Speed is derived only; no movement simulation or persisted derived Speed is added.

`deriveWeaponCriticalThreshold()` reduces acquired weapon thresholds from the ordinary 20 floor. The Dice Engine computes `natural` only from actual kept natural 1/20 results and computes attack `critical` separately from the configured threshold. Optional rerolls recompute the kept d20, natural metadata, and critical state after replacement.

### Real M13E integrations

| Content | Acquisition | M13E structured behavior | Reference-only remainder |
| --- | --- | --- | --- |
| Dwarf — Dwarven Toughness | Species | +1 maximum HP per Character level | Dwarven Resilience poison resistance/purpose-specific save handling and Stonecunning activation |
| Gnome — Gnomish Cunning | Species | Advantage on Intelligence, Wisdom, and Charisma saves | lineage spell/device benefits |
| Halfling — Luck | Species | optional one-use-new reroll of a qualifying d20 result of 1 | Brave, Nimbleness, Naturally Stealthy |
| Great Weapon Fighting | Fighting Style Feat; no level prerequisite, requires Fighting Style Feature | automatic minimum face 3 using the actual qualifying weapon damage die | conditional mounted-state weapon context such as Lance handling |
| Barbarian — Fast Movement | level 5 | +10 walking Speed while not in Heavy armor | movement simulation |
| Monk — Unarmored Movement | level 2 | +10/+15/+20/+25/+30 at levels 2/6/10/14/18 while unarmored and without Shield | terrain/special-movement behavior |
| Monk — Disciplined Survivor | level 14 | proficiency in all six saves | one-Focus failed-save reroll; external failure is not authoritatively known |
| Ranger — Roving | level 6 | +10 walking Speed while not in Heavy armor | Climb/Swim Speed equal to Speed; current sheet exposes only primary walking Speed |
| Rogue — Slippery Mind | level 15 | Wisdom and Charisma save proficiency | none for the structured proficiency portion |
| Champion — Improved Critical | level 3 | weapon critical threshold 19 | Unarmed Strike threshold; no authoritative derived Unarmed Strike attack entry |
| Champion — Superior Critical | level 15 | weapon critical threshold 18 | Unarmed Strike threshold for the same reason |

Champion **Survivor** is acquired at level 18 but remains reference-only. Its bundled definition contains Defy Death and Heroic Rally reference effects: faithful automation needs Death Saving Throw processing and/or Bloodied turn-start healing. M13E adds no `onTurnStart`, Death Save event hook, automatic healing event, or combat timeline.

Rogue **Reliable Talent** is acquired at level 7 and remains reference-only. Its rule is an optional low-d20 replacement on proficient skill/tool checks. Faithful Advantage/Disadvantage behavior requires selecting/replacing the relevant post-roll die rather than applying a blanket automatic minimum, and generic tool checks are not part of the Character roll model. It is therefore not misrepresented as `minimum-die-face`.

Weapon Mastery execution remains deferred. The catalog has mastery properties and Classes have mastery-choice counts, but Character persistence has no authoritative selected mastered-weapon list. Equipped weapons are not treated as mastered by inference and M13E does not add Character v9.

Expertise remains reference-only wherever a Class feature grants selected Expertise. `DerivedSkill` contains `id`, `ability`, `modifier`, and `proficient` only. The selected Expertise skills are not authoritative in Character storage, so M13E does not infer them from Class or ordinary proficiency.

### Complete bundled Species matrix

| Species | Before M13E: real derived/automated data | M13E automation | Still reference-only and why |
| --- | --- | --- | --- |
| Dragonborn | Medium; Speed 30; Darkvision 60; Draconic Ancestry choice | None | Breath Weapon needs attack/area/save/damage resolution; Damage Resistance needs incoming-damage resistance; Draconic Flight needs temporary movement-mode state |
| Dwarf | Medium; Speed 30; Darkvision 120 | Dwarven Toughness HP +1/level | Dwarven Resilience and Stonecunning need purpose-specific poison/resistance/sense activation behavior |
| Elf | Medium; base Speed 30/Darkvision 60; Drow Darkvision 120; Wood Elf Speed 35; lineage and Keen Senses skill choices | None | lineage spells, Fey Ancestry charm handling, and Trance rest/sleep behavior are outside the bounded model |
| Gnome | Small; Speed 30; Darkvision 60; lineage choice | Gnomish Cunning save Advantage | Forest/Rock lineage spell/device behavior remains outside the bounded model |
| Goliath | Medium; Speed 35; Giant Ancestry choice | None | ancestry combat riders, Large Form, and Powerful Build require target/damage/transformation/encumbrance/grapple systems |
| Halfling | Small; Speed 30 | Luck optional d20 reroll | Brave needs frightened-specific handling; Nimbleness needs creature-space movement; Naturally Stealthy needs hiding context |
| Human | Small/Medium choice; Speed 30; Skillful skill choice | None | Resourceful needs Heroic Inspiration tracking; Versatile Origin-Feat choice ownership is not stored by the Species choice model |
| Orc | Medium; Speed 30; Darkvision 120 | None | Adrenaline Rush needs action/resource/temporary-HP orchestration; Relentless Endurance needs a zero-HP event hook |
| Tiefling | Small/Medium choice; Speed 30; Darkvision 60; Fiendish Legacy choice | None | lineage resistance/spells and Otherworldly Presence need resistance and lineage-casting automation |

Displayed trait prose is not counted as automation. Structured size, Speed, senses, and Species choices are ordinary derived Character data.

### Complete bundled Feat matrix

The registry contains exactly **17** Feats. **Tough is absent**.

| Feat | Automated before M13E | M13E addition | Remaining reference-only reason |
| --- | --- | --- | --- |
| Alert | Initiative proficiency | None | Initiative Swap needs ally Initiative/turn state |
| Magic Initiate | None | None | feat spell-list/ability/spell ownership, free cast, and spell changes need persistent feat casting selections/policy |
| Savage Attacker | None | None | once-per-turn hit-trigger plus two damage results and a player choice needs hit/turn event state |
| Skilled | None | None | three skill/tool choices need generic tool proficiency ownership |
| Ability Score Improvement | ability-score increase to max 20 | None | no additional behavior |
| Grappler | Strength/Dexterity +1 to max 20 | None | grapple target/action/movement state is not modeled |
| Archery | +2 ranged weapon attack rolls | None | no additional structured behavior |
| Defense | +1 AC in Light/Medium/Heavy armor | None | no additional structured behavior |
| Great Weapon Fighting | None | minimum-die-face 3 on qualifying actual weapon damage dice | conditional mounted-state weapon context remains table-managed |
| Two-Weapon Fighting | None | None | Light extra-attack timing/damage needs attack-action orchestration |
| Boon of Combat Prowess | +1 ability to max 30 | None | miss→hit conversion needs hit/miss and turn state |
| Boon of Dimensional Travel | +1 ability to max 30 | None | post-action teleport needs action and position state |
| Boon of Fate | +1 ability to max 30 | None | reaction/event/recharge handling around another D20 Test |
| Boon of Irresistible Offense | Strength/Dexterity +1 to max 30 | None | resistance bypass and natural-20 extra damage need resistance/attack-event handling |
| Boon of Spell Recall | Int/Wis/Cha +1 to max 30 | None | conditional level 1–4 free casting needs cast/slot event handling |
| Boon of the Night Spirit | +1 ability to max 30 | None | lighting-driven Invisible/resistance behavior needs lighting/condition/incoming-damage systems |
| Boon of Truesight | +1 ability to max 30 | None | general Truesight world/sense semantics are not modeled beyond structured Species senses |

### M13E Homebrew genericity

Synthetic unrelated Homebrew acceptance proves the six new capabilities without real SRD names or IDs:

```text
content definition
    ↓
strict content validation
    ↓
custom ContentRegistry
    ↓
feature acquisition
    ↓
deriveCharacterState
    ↓
Character roll service
    ↓
existing Dice Engine
    ↓
RollResult + Roll History
    ↓
optional player action when applicable
    ↓
same-entry final result
```

There is no runtime `source === "homebrew"` branch and no Species/Feat/Class/Subclass name dispatcher for M13E behavior.

### M13E persistence boundary

Character persistence remains unchanged:

```text
Character schema: v8
current key: dnd3.characters.v8
newest legacy source: dnd3.characters.v7
```

There is no Character v9 and no v8 → v9 migration.

`CharacterPlayState` remains exactly:

```text
currentHp
temporaryHp
hitDiceRemaining
resourceUses
```

`PlaySessionState` remains exactly:

```text
conditions
optional concentration { spellId, providerId }
activeEffectIds
```

M13E adds no persistent dice-transformation state and no persistent static-derived state. Roll transformation provenance belongs to Roll Result / Roll History. Cover remains separate ephemeral M13A page/roll context and is absent from Character persistence and `PlaySessionState`.

### Explicit post-M13E exclusions

M13E still intentionally excludes:

- Character v9 or a v8 → v9 migration
- new `CharacterPlayState` or `PlaySessionState` fields
- persistent transformation, Speed, Passive Perception, save-proficiency, or critical-threshold state
- multiclassing or multiclass spell-slot combination
- Level Up or fabricated historical advancement choices
- persistent Expertise-selection ownership
- Weapon Mastery selected-weapon ownership or execution inferred from equipment
- Reliable Talent runtime replacement
- Champion Survivor Death Save or Bloodied/turn-start healing automation
- Champion Unarmed Strike critical-threshold automation
- Ranger Roving Climb/Swim Speed automation
- Disciplined Survivor failed-save Focus reroll automation
- target IDs/state, enemy/ally state, spell target tracking, Hunter’s Mark target state, or area/ally state
- encounter/combat tracker, Initiative order, NPC Initiative, turns, rounds, movement simulation, action economy, or duration engine
- battlefield geometry or aura engine
- incoming-damage interception/resistance engine
- `EventBus`, generic trigger dispatcher, or `onTurnStart` architecture
- automatic target saving throws or Death Save event architecture
- Rage maintenance engine
- Sorcery Point ↔ spell-slot conversion or generated temporary spell slots
- Wild Shape beast-form transformation/state
- M13F bounded spell-automation expansion
- arbitrary executable effects, scripting, or prose-to-mechanics parsing
- a universal cast/save/damage/effect interpreter
- Class/Subclass/Feat/spell/feature name-or-ID mechanical branching
- Homebrew-source mechanical branching
- duplicate resource, rest, spell-slot, Spellcasting, Character play-state, Dice, Roll History, Character-derivation, or Inventory systems
- Homebrew Creator/Creator Forge UI, import/export, deployment work, or unrelated performance restructuring
