# Development architecture notes (historical)

This document preserves the project's previous technical README through Milestone 14B. It records milestone-specific implementation decisions and boundaries; older sections are historical snapshots and may describe state superseded by later development. See [the project README](../README.md) for the current user-facing overview.

# D&D 3.0

D&D 3.0 is a standalone local-first character builder and live character-sheet project built with React, TypeScript, and Vite.

## Current foundation

Milestones 1–6.5 established Character CRUD, local persistence, the typed offline SRD registry and Compendium, deterministic derived rules, HP/play state, one reusable Dice Engine, authoritative Inventory/currency, and the CHARACTER / PLAY / INVENTORY workspace. Milestone 7 added first-class Species and Backgrounds. Milestone 8 added first-class Feats and bounded typed Feat mechanics. Milestone 9 added first-class Subclasses and Character v7. Milestone 10 added first-class SpellContent plus provider-scoped Spellcasting and generic slot resources while deliberately keeping Character persistence on v7.

Milestone 11 expanded the Class architecture without introducing multiclassing or a new Character schema, and Milestone 12A expanded SpellContent to the complete authoritative SRD 5.2.1 catalog. Milestone 12B extended the same data-driven Class, resource, and Spellcasting-provider architecture to Bard / College of Lore, Paladin / Oath of Devotion, and Ranger / Hunter. Milestone 12C added Druid / Circle of the Land and Monk / Warrior of the Open Hand plus bounded fixed-point resource expenditure. Milestone 12D added Sorcerer / Draconic Sorcery and Warlock / Fiend Patron. Milestone 12E added Wizard / Evoker and one generic Character v8 provider-scoped spell-selection model for cantrips, owned leveled spells, and prepared owned spells. Milestone 13 established the bounded D20/session/resource/active-effect/spell-roll architecture. Milestone 14A added declarative multiclass content metadata only. Milestone 14B advances persisted Character representation to v9 with explicit starting-class identity, class-owned progression records, derived total Character level, and die-size Hit Dice pools while intentionally keeping runtime derivation single-class and fail-closed for unsupported multiple-progression paths.

Built-in content currently includes:

- exactly 12 SRD Classes: **Fighter, Barbarian, Cleric, Rogue, Bard, Paladin, Ranger, Druid, Monk, Sorcerer, Warlock, Wizard**
- exactly 12 SRD Subclasses: **Champion, Path of the Berserker, Life Domain, Thief, College of Lore, Oath of Devotion, Hunter, Circle of the Land, Warrior of the Open Hand, Draconic Sorcery, Fiend Patron, Evoker**
- 9 SRD Species: Dragonborn, Dwarf, Elf, Gnome, Goliath, Halfling, Human, Orc, Tiefling
- 4 SRD Backgrounds: Acolyte, Criminal, Sage, Soldier
- exactly 17 SRD 5.2.1 Feats
- exactly 339 authoritative SRD 5.2.1 SpellContent entries; the original six M10 spells remain the structured regression anchors and the other 333 entries are explicit reference-only content in M12A
- 38 SRD weapons
- 13 armor/shield entries
- 8 Weapon Mastery properties

## SRD source and attribution

The built-in official dataset and supported play rules are sourced from **Wizards of the Coast, System Reference Document 5.2.1**, published May 1, 2025. Source: https://www.dndbeyond.com/srd

This project includes material from SRD 5.2.1 by Wizards of the Coast LLC and uses that material under the **Creative Commons Attribution 4.0 International (CC BY 4.0)** license: https://creativecommons.org/licenses/by/4.0/

SRD entries use stable IDs such as `srd-5.2.1:class:cleric`, `srd-5.2.1:subclass:rogue:thief`, `srd-5.2.1:spell:fire-bolt`, and `srd-5.2.1:weapon:scimitar`. Built-in SRD content is deep-frozen. Structurally compatible Homebrew content uses the same Content Registry and rules pipeline; mechanics do not branch on Homebrew source, Class display name, or Class ID.

## Character persistence

Current Character storage is **v9** under:

```text
dnd3.characters.v9
```

`dnd3.characters.v8` is the newest explicit legacy source; v1–v8 migration continuity remains supported. The v8 → v9 migration is deterministic and representation-only: old top-level class ownership becomes an explicit `startingClassId` plus exactly one `classProgressions[]` entry, old HP-history `level` becomes progression-local `classLevel`, exact rolled HP results are preserved, and scalar remaining Hit Dice move into the actual Class Hit Die bucket.

Stored class-owned state now lives in `classProgressions[]`: `classId`, class `level`, optional `subclassId`, class skill selections, and progression-local HP history. Total Character level is derived by summing progression levels rather than persisted separately. Species/Background choices, base ability scores, separately acquired `manualFeats`, generic provider-scoped `CharacterSpellcastingSelection[]`, authoritative Inventory/currency, and other established Character fields remain outside that class-owned progression record.

`CharacterSpellcastingSelection` remains provider-scoped build state only. Spell slots and Class-resource uses remain generic `playState.resourceUses`; v8 migration preserves existing spell selections and partially spent resource values rather than rebuilding them.

`CharacterPlayState` still contains exactly `currentHp`, `temporaryHp`, `hitDiceRemaining`, and `resourceUses`, but `hitDiceRemaining` is now a die-size-keyed pool such as `{ 10: 3, 8: 2 }`. No target, encounter, duration, turn, round, summon, or battlefield state is added.

M14-B changes representation, not multiclass runtime semantics. Existing runtime derivation deliberately accepts exactly one class progression; zero or multiple progressions fail closed on paths that have not yet gained multiclass semantics. Multiclass spell-slot combination, Pact/ordinary cross-use, multiple-progression feature/resource/effect aggregation, and multiclass Character editing are not implemented here. M14-C is the next milestone.

## Class and Class-feature architecture

`ClassContent` is first-class registry data. A Class defines:

- Hit Die and fixed HP value
- primary ability metadata using bounded `one-of` or `all-of` modes
- saving throw proficiencies
- weapon proficiency rules
- armor training
- class tool proficiency metadata
- class skill choice count/list
- starting-equipment packages
- ordered levels 1–20
- generic Class resources

Class progression contains bounded `ClassFeatureContent`. Acquired Class features may contribute only explicit supported capabilities:

```text
Class feature
   ├─ CharacterRuleEffect
   ├─ SpellcastingProviderDefinition
   ├─ SpellcastingProviderSpellGrant
   ├─ ResourceConsumerGrant
   └─ reference-only effects
```

Future Class features remain visible on CHARACTER but contribute no mechanics before acquisition.

The Rules Engine combines acquired Class and Subclass grants before deriving AC, resources, attacks, and Spellcasting. It does not switch on `Fighter`, `Barbarian`, `Cleric`, `Rogue`, Class IDs, Subclass names, or Homebrew source.

## Generic training extensions

M11 adds only the bounded training structures required by the approved Classes.

Primary ability metadata supports:

```text
one-of  — e.g. Fighter Strength or Dexterity
all-of  — available for structurally compatible content that requires multiple primary abilities
```

Weapon proficiency supports either:

- a whole weapon category, or
- a category qualified by explicit weapon properties.

Rogue therefore gains Simple weapon proficiency plus Martial weapons with **Finesse or Light** through data rather than Rogue-specific weapon code.

Class tool proficiency metadata is also first-class; bundled Rogue exposes **Thieves’ Tools**. M11 does not add a separate tool-check engine.

## Generic resources and feature-gated consumers

Class resources use stable IDs, source metadata, level-table or ability-modifier maxima, presentation metadata, and level-aware Short/Long Rest recovery. The generic rules layer derives current maxima, merges acquired Class/Subclass consumers, and supports bounded variable or fixed point expenditure through the same resource transition pipeline. M13C adds a deliberately small transaction vocabulary for explicit restoration of already-existing bounded resources: `restore-resource` and `restore-spell-slots-with-budget`. Transactions are content/feature declarations, resolve only existing derived resources/providers, and mutate only the existing `CharacterPlayState.resourceUses`; they do not create a conversion graph, temporary/generated resources, or a second rest/spell-slot model.

### Fighter

- **Second Wind** uses a generic level table: 2 uses at level 1, 3 at level 4, 4 at level 10.
- Short Rest restores one Second Wind use; Long Rest restores all.
- **Tactical Mind** is a level-gated consumer of the same Second Wind pool.
- **Action Surge** uses a generic level table and fully restores on a Short or Long Rest.

No generic progression type contains `secondWindUses` or `actionSurgeUses` fields.

### Barbarian

- **Rage** uses a generic level-table resource.
- Short Rest restores one expended Rage; Long Rest restores all.
- M13D adds bounded active Rage session state through the generic active-self-effect path: explicit activation/deactivation, existing Rage-use spending, Strength check/save Advantage, structured Strength weapon Rage Damage, Heavy-armor eligibility/termination plus Incapacitated termination, Concentration conflict, and supported spellcasting blocking. Duration/maintenance that depends on turns, attacks, or damage and incoming B/P/S resistance remain manual/reference-only because no combat-event, duration, or incoming-damage engine exists.

### Cleric

- **Channel Divinity** uses a generic level-table resource.
- Short Rest restores one use; Long Rest restores all.
- Class-level Divine Spark and Turn Undead are acquired consumers.
- Life Domain **Preserve Life** becomes another consumer of the parent Cleric Channel Divinity pool only after its Subclass feature is acquired.

### Rogue

Rogue does not require a normal low-level mutable Class resource. Its major event/combat mechanics remain reference-only.

### Bard

- **Bardic Inspiration** uses a Charisma-derived generic maximum with a minimum of 1.
- Long Rest restores all uses; Short Rest restoration becomes available at Bard 5 through level-gated recovery metadata.

### Paladin

- **Lay On Hands** is a numeric generic resource equal to 5 × Paladin level and supports bounded variable point expenditure.
- **Channel Divinity** uses the shared recovery pipeline.
- Free Divine Smite and Find Steed casts are tracked as ordinary Long-Rest resources.

### Ranger

- **Favored Enemy** free Hunter’s Mark casts use a level-table resource.
- **Tireless** and **Nature’s Veil** use Wisdom-derived maxima with minimum acquisition levels.
- Hunter’s Mark target state and Concentration enforcement remain deferred.

### Druid

- **Wild Shape** uses the existing generic level-table resource model: 2 uses from level 2, 3 from level 6, and 4 from level 17.
- Short Rest restores one Wild Shape use; Long Rest restores all.
- Wild Companion and Circle of the Land features reuse the same Wild Shape pool through acquired consumers.
- Circle of the Land **Natural Recovery** uses the M13C weighted spell-slot restoration transaction after acquisition: recovery budget `ceil(Druid level / 2)`, only expended Druid slot resources, and no recovered slot above level 5; its one spell-slot-recovery use resets on Long Rest.
- Natural Recovery's separate free prepared Circle-spell cast remains reference-only because the current land choice is not persisted.
- Wild Shape form selection, transformation state, land choice, and cross-resource conversion remain reference-only/deferred.

### Monk

- **Focus Points** use the existing generic level-table resource model and equal Monk level from level 2 onward.
- Short and Long Rests restore the full Focus pool.
- M12C added generic fixed multi-point resource expenditure; M13D moves the level-18 Monk **Superior Defense** activation onto the generic active-self-effect path, where activation spends exactly 3 existing Focus Points. Open Hand **Quivering Palm** remains a 4-Focus fixed expenditure through the shared resource transition.
- Open Hand target/event state and Wholeness of Body use tracking remain reference-only/deferred.

### Sorcerer

- **Innate Sorcery** and **Sorcery Points** use ordinary generic Class resources backed by `playState.resourceUses`; M13D adds bounded active Innate Sorcery session state with Sorcerer spell-attack Advantage and +1 Sorcerer spell save DC while its one-minute duration remains manual.
- Sorcery Points equal Sorcerer level from level 2 onward and recover fully on a Long Rest.
- Sorcery Point/spell-slot conversion, Sorcerous Restoration's limited recovery transaction, Metamagic ownership, and spell-mutation/event automation remain reference-only/deferred.

### Warlock

- **Pact Magic** reuses the existing Spellcasting provider slot-pool model. Each class-level row exposes only the current Pact slot level, with the authoritative slot count for that level.
- Pact Magic slot resources recover through ordinary Short/Long Rest recovery metadata and remain stored only in `playState.resourceUses`.
- Eldritch Invocation ownership, Mystic Arcanum spell ownership, Magical Cunning/Eldritch Master special recovery transactions, and invocation-driven runtime mutation remain reference-only/deferred.

### Wizard

- **Arcane Recovery** uses the same M13C weighted spell-slot restoration transaction as structurally compatible content: recovery budget `ceil(Wizard level / 2)`, only currently expended Wizard slot resources, and no recovered slot above level 5.
- Arcane Recovery has one ordinary feature-owned usage resource. The use is consumed only after a valid transaction and resets through the existing Long Rest recovery metadata.
- The transaction represents the explicit player action taken when finishing the required Short Rest and reuses the existing Short Rest transition; no Wizard-specific rest or recovery engine exists.

## Bounded Unarmored Armor Class

`CharacterRuleEffect` includes one generic Unarmored AC formula type. Barbarian's Unarmored Defense is represented as:

```text
10 + Dexterity modifier + Constitution modifier
shield allowed
```

The armor rules consume this typed effect only while no body armor is equipped. The formula is generic; there is no Barbarian-name check. It does not introduce a universal effect interpreter.

## Subclasses

`SubclassContent` remains linked to a parent Class through `parentClassId`, with explicit acquisition level and ordered feature progression. Selecting a Subclass and acquiring its features remain separate operations.

The bundled M12E set is exactly:

- Fighter → **Champion** — levels 3, 7, 10, 15, 18
- Barbarian → **Path of the Berserker** — levels 3, 6, 10, 14
- Cleric → **Life Domain** — levels 3, 6, 17
- Rogue → **Thief** — levels 3, 9, 13, 17
- Bard → **College of Lore** — levels 3, 6, 14
- Paladin → **Oath of Devotion** — levels 3, 7, 15, 20
- Ranger → **Hunter** — levels 3, 7, 11, 15
- Druid → **Circle of the Land** — levels 3, 6, 10, 14
- Monk → **Warrior of the Open Hand** — levels 3, 6, 11, 17
- Sorcerer → **Draconic Sorcery** — levels 3, 6, 14, 18
- Warlock → **Fiend Patron** — levels 3, 6, 10, 14
- Wizard → **Evoker** — levels 3, 6, 10, 14

Supported mechanics remain data-driven. Mechanics requiring active combat state, targets, conditions, event timing, persistent choices, auras, or other deferred systems remain explicit reference-only behavior; acquired Subclass consumers and fixed spell grants reuse their parent Class resource/provider architecture.

## SpellContent and class-granted Spellcasting

The bundled SpellContent catalog is exactly 339 authoritative SRD 5.2.1 spells in M12A. The original six M10 entries retain their structured damage/healing/attack/save/scaling metadata; the remaining 333 preserve authoritative static metadata and rules text while unsupported behavior is explicitly reference-only.

Spellcasting remains a provider-scoped capability, not a `CharacterRuleEffect` and not a Wizard-specific subsystem. Acquired Class features and acquired Subclass features can both emit ordinary `SpellcastingProviderDefinition` values. Central derivation aggregates those grants and sends them through the same M10 provider calculations.

Provider calculations use the Character's **final derived ability scores**:

```text
Spell Save DC         = 8 + Proficiency Bonus + Spellcasting Ability modifier
Spell Attack Modifier = Proficiency Bonus + Spellcasting Ability modifier
```

Multiple providers remain independent and provider-scoped.

### Prepared-from-list, prepared-from-owned, and fixed-grant boundary

Cleric, Bard, Paladin, Ranger, Druid, Sorcerer, and Warlock continue to use provider-scoped `prepared-from-list` metadata with level-driven counts, provider-owned slot resources, and explicit replacement policy metadata. These providers still do not persist ordinary prepared selections.

M12E adds the generic `prepared-from-owned` provider mode. A `CharacterSpellcastingSelection` belongs to one provider and keeps selected cantrips, owned leveled spells, and prepared owned spells distinct. Preparation requires ownership; provider-list membership alone does not create ownership or preparation. Unknown stored spell IDs remain persisted but mechanically inert until matching content exists.

Wizard uses this generic mode with Intelligence, its existing full-caster slot pool, six explicit initial level-1 owned spells, and `ritualCasting: 'owned'`. The generic Ritual policy now supports `none`, `prepared`, and `owned`: Wizard can therefore expose an owned unprepared Ritual spell without treating that spell as normally prepared or castable through a spell slot.

Provider-scoped **always-prepared** spell grants remain derived through the same bounded model and are not copied into persisted prepared selections or counted against the ordinary preparation limit. Existing Paladin, Ranger, Druid, Sorcerer, and Warlock grants continue to use that path.

M13C implements Arcane Recovery's bounded weighted multi-slot restoration through the generic resource-transaction path. Memorize Spell timing, Spell Mastery free casts, Signature Spells free-cast state, invocation/Mystic Arcanum ownership, Sorcery Point conversion, Pact special recovery transactions, multiclass slot combination, and spell automation beyond the existing bounded mechanics remain deferred/reference-only.

## Dice Engine

`src/dice/` remains the only Dice Engine. M11 adds no evaluator and no random-number path.

Existing structured rolls continue to cover abilities, saves, skills, weapon attacks/damage, manual Critical damage, provider-scoped spell attacks, spell damage/healing, Second Wind, Hit Dice, and the manual Dice Tray. Class expansion consumes already-derived values/resources and does not duplicate roll logic.

## Create / Edit Character and class changes

Create/Edit uses one data-driven Class selector populated from the Content Registry.

When the selected Class changes:

- an incompatible Subclass is cleared
- currently selected skills that remain legal for the destination Class are retained
- missing destination-Class skill choices must be selected explicitly
- active `prepared-from-owned` providers require explicit valid cantrip/ownership/preparation selections; Wizard creation therefore never invents recommended spell choices
- Wizard → non-Wizard removes the now-inactive Wizard provider selection on save, while non-Wizard → Wizard starts with no fabricated spellbook contents
- Inventory is **not** rewritten on an existing Character
- existing mutable resources are reconciled against the newly derived resource set

HP history follows an explicit non-fabricating policy:

- fixed HP entries remain valid and resolve using the selected Class's fixed value
- rolled entries are preserved when legal for the new Hit Die
- a previously stored roll larger than the destination Hit Die becomes a visible validation error
- invalid rolls are never clamped, rerolled, converted to fixed, or silently repaired

For a **new** Character, the selected Class starting-equipment package and selected Background starting-equipment package are both seeded once into the existing authoritative Inventory/currency model. The package choice is form-local and is not a new Character field. Structured items begin owned but unequipped; equipping remains an Inventory action.

## Character workspace

The workspace still presents one Character through:

- `/characters/:characterId` — **PLAY**
- `/characters/:characterId/character` — **CHARACTER**
- `/characters/:characterId/inventory` — **INVENTORY**

### CHARACTER

CHARACTER now includes a generic **Class progression** section alongside Subclass progression. It shows Class source/training plus acquired and future Class features, with structured automation and reference-only behavior clearly separated.

Spellcasting remains conditional. For `prepared-from-list` providers, CHARACTER shows provider ability/DC/attack, slot resources, allowed cantrip/prepared counts, and bundled catalog coverage without inventing selections. For `prepared-from-owned` providers, CHARACTER shows persisted selected cantrips, owned leveled spells, prepared owned spells, and Ritual-eligible spells separately; owned unprepared Rituals are not exposed as ordinary prepared cast buttons.

### PLAY

PLAY receives **no structural redesign in M12E**. Its existing generic resource panel automatically displays derived Class resources and provider-owned spell slots, including Wizard slots through the same `playState.resourceUses` path. Spellbook ownership and preparation remain Character build state; Class-specific runtime trackers and prepared-spell PLAY panels remain out of scope.

### INVENTORY

Inventory remains the single ownership/equipment source of truth. Class changes never delete carried equipment merely because the new Class lacks proficiency.

## Compendium

Existing Class and Subclass routes are reused:

```text
/compendium/classes
/compendium/classes/:contentId
/compendium/subclasses
/compendium/subclasses/:contentId
```

Class list/detail pages are data-driven across all twelve bundled Classes. Class details show training, starting packages, resources, linked bundled Subclass, level 1–20 feature progression, and Class-granted Spellcasting provider summaries where present. Fighter-specific progression columns are not used.

The existing Species, Background, Feat, Spell, weapon, armor, and Weapon Mastery Compendium routes remain intact.

## Homebrew Class compatibility

Synthetic conformance coverage proves structurally compatible Homebrew content through the same registry and rules pipeline, including ability-derived resource maxima, level-gated recovery, bounded variable/fixed resource expenditure, M13C feature-owned usage resources and both bounded restoration transaction shapes, `prepared-from-list`, generic `prepared-from-owned` ownership/preparation, all three Ritual policies, provider-scoped always-prepared grants, static Hit Point bonus-per-class-level effects, and Pact-style slot-count/slot-level progression with Short/Long Rest recovery.

```text
Homebrew storage / synthetic content
    ↓
Content Registry + validation
    ↓
Class / Subclass / provider acquisition
    ├─ typed Character effect
    ├─ generic resource + consumer
    ├─ feature-owned usage resource + bounded transaction
    ├─ Spellcasting provider
    └─ provider-scoped fixed spell grant
    ↓
Rules Engine
    ↓
existing Dice Engine / play-state transitions
```

There is no `source === "homebrew"`, Class/Subclass-name, or content-ID-specific mechanical branch. M12E Homebrew conformance proves owned/prepared/Ritual behavior through unrelated names and IDs. M12E does not add a Homebrew Creator UI.

## HP, Hit Dice, and rests

Maximum HP derives from the selected Class Hit Die/fixed value, stored HP progression, final Constitution modifier, and any acquired bounded static HP effects such as the generic `hit-point-bonus-per-class-level` effect used by Draconic Resilience. Hit Dice use the selected Class Hit Die. Current HP reconciliation remains non-healing unless an actual healing/rest transition occurs.

Short/Long Rest logic remains generic and recovery-metadata driven. Fighter resources, Barbarian Rage, Cleric Channel Divinity, Pact Magic, Focus, Bardic Inspiration, Wild Shape, and spell slots all use the existing resource pipeline. M13C weighted recovery validates the full selection first, then reuses the existing Short Rest transition exactly once, restores only the selected eligible existing slot resources, and finally consumes the ordinary feature-use resource; failed/no-op selections perform no mutation.

## Architecture

```text
Character v8 choices + Inventory + ContentRegistry
                         ↓
              Class / Subclass acquisition
                  ├─ typed effects
                  ├─ resource consumers
                  ├─ bounded resource transactions
                  └─ Spellcasting providers
                         ↓
                  src/rules/ derivation
                         ↓
              DerivedCharacterState
                         ↓
                   RollRequest
                         ↓
                 src/dice/ engine
                         ↓
                    RollResult
                         ↓
           optional validated mutation
                         ↓
          Character persistence / history
```

React controls call services; they do not directly calculate dice formulas or mutate persisted resource/HP counters.

## Commands

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
```

## Milestone 13A — D20 context, Initiative, and Cover

M13A keeps the bundled content exactly at twelve Classes, twelve Subclasses, 339 SRD 5.2.1 SpellContent entries, and 17 Feats. Character persistence remains v8 (`dnd3.characters.v8`) with v7 as the newest legacy migration source, and `CharacterPlayState` remains exactly `currentHp`, `temporaryHp`, `hitDiceRemaining`, and `resourceUses`.

The single Dice Engine now accepts optional typed D20 context: labeled numeric modifiers plus automatic Advantage and Disadvantage sources. Manual Normal/Advantage/Disadvantage remains player input and participates in the same non-stacking resolver; opposing manual/automatic sources cancel to Normal. Roll history preserves the manual mode, automatic sources, contextual modifiers, and final resolved mode when context exists.

Initiative is a first-class Dexterity check through that same Dice Engine. Generic rule effects support numeric Initiative modifiers, full or half Proficiency contributions, and Initiative Advantage/Disadvantage. Bundled integrations are Alert, Bard Jack of All Trades, Champion Remarkable Athlete, and Barbarian Feral Instinct; no runtime branch depends on those names or SRD IDs.

Cover is immediate UI/roll context only: Half Cover contributes +2 contextual AC and Dexterity saves, Three-Quarters Cover contributes +5, and Total Cover is surfaced as a direct-targeting restriction rather than a fabricated numeric bonus. Cover never mutates derived base AC and is not written to Character data, `CharacterPlayState`, localStorage, or sessionStorage; a reload returns to None.

M13A deliberately does **not** add an Initiative order/tracker, encounter state, combatants, turns/rounds, Surprise state, conditions, Concentration state, active Rage/Innate Sorcery state, a PLAY session-state cache, resource-restoration transactions, Arcane/Natural/Sorcerous/Magical Cunning recovery automation, dice-floor/reroll automation, spell automation expansion, Weapon Mastery execution/ownership, target/combatant or battlefield state, multiclassing, Level Up, Creator Forge, import/export, visual redesign, deployment work, or bundle-size remediation. M13B and later packages remain deferred.

## Milestone 13B — Character-side Conditions and Concentration

M13B keeps the bundled catalog unchanged at twelve Classes, twelve Subclasses, 339 SRD 5.2.1 Spells, and 17 Feats. Character persistence remains v8 (`dnd3.characters.v8`) with v7 as the newest legacy migration source. `CharacterPlayState` is unchanged and remains exactly `currentHp`, `temporaryHp`, `hitDiceRemaining`, and `resourceUses`.

Character-side Conditions and Concentration are temporary PLAY session state, not authoritative Character data. The bounded per-Character `PlaySessionState` contains only a list of supported condition IDs and, when present, one Concentration reference containing `spellId` plus `providerId`. It is cached under the versioned `sessionStorage` namespace `dnd3.play-session.v1:<encoded-character-id>`; malformed cache data is discarded safely, stale Concentration references are reconciled away, and deleting a Character clears only that Character's session cache. This session state is disposable and separate from Character localStorage/migrations.

The supported condition set is exactly Blinded, Charmed, Deafened, Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, and Unconscious. Exhaustion is not represented in M13B. Automation is intentionally limited to deterministic Character-side consequences that fit the existing architecture, such as Poisoned attack/check Disadvantage, Blinded/Prone/Restrained own-attack penalties, Restrained Dexterity-save Disadvantage, Invisible Initiative Advantage, and approved Incapacitated-family Initiative/Concentration consequences. Source-, target-, visibility-, opponent-, distance-, movement-, resistance-, battlefield-, and encounter-dependent effects remain manual/reference-only.

Automatic Advantage/Disadvantage continues to flow through the single M13A D20 context resolver, so same-direction sources do not stack and opposing manual/automatic sources cancel generically. No condition-specific Dice Engine or saving-throw engine was added.

Concentration is explicit player-controlled session state driven only by existing structured spell `concentration` metadata. PLAY supports Start, replacement by another valid Concentration spell, explicit End, same-browser-session restoration, and safe stale-reference cleanup. Applying an approved incapacitating condition ends Concentration, and Concentration cannot start while such a condition is active. Starting or ending Concentration does not spend or refund spell slots.

The explicit damage Concentration-save helper reuses the existing Constitution saving throw, Dice Engine, M13A D20 context resolver, and Roll History. Its SRD damage DC is `min(30, max(10, floor(damage / 2)))`; success retains Concentration and failure ends it only inside this explicit helper workflow. M13B does not add global damage interception, automatic natural-1/natural-20 save rules, an event bus, or an encounter manager.

M13A Cover remains ordinary ephemeral PLAY/UI state. It is deliberately not part of `PlaySessionState`, `sessionStorage`, Character data, or `CharacterPlayState`; reload resets Cover while M13B Conditions/Concentration can survive within the browser session.

M13B deliberately does **not** add active Rage/Innate Sorcery/Superior Defense state, generic `activeEffectIds`, resource-restoration transactions, Arcane/Natural/Sorcerous/Magical Cunning automation, Sorcery Point conversion, Wild Shape transformations, Weapon Mastery execution, M13E dice transformations, M13F broad spell automation, enemy/ally condition tracking, target IDs, battlefield geometry, movement/duration/round engines, an Initiative tracker, VTT/event-bus architecture, multiclassing, Level Up, Creator Forge, or any M13C+ milestone implementation.

## Milestone 13C — Bounded Resource Restoration Transactions

M13C adds one explicit player-initiated transaction layer over the **existing** derived resources and Character play-state mutation seam. The generic vocabulary is intentionally limited to `restore-resource` and `restore-spell-slots-with-budget`; restoration can only increase an already-derived bounded resource toward its existing maximum. A transaction may be gated by an ordinary feature-owned usage resource, whose remaining use is stored only in `CharacterPlayState.resourceUses` and restored through existing recovery metadata. Transaction IDs, selections, budgets, and pending state are never persisted.

`restoreResource()` is the shared primitive for positive whole-number restoration. It resolves an existing derived resource, rejects unknown or already-full resources, and clamps restoration to the resource's existing maximum. Weighted spell-slot restoration resolves the already-existing provider slot resources, validates actual expended capacity, rejects duplicate/non-positive/ineligible selections, weights each selected slot by its spell level, and rejects any total above the derived budget before mutation. The supported budget formula is `ceil(class level / 2)` and the bundled Arcane Recovery/Natural Recovery transactions cap recoverable slots at level 5.

**Arcane Recovery** uses the Wizard provider and one Long-Rest-reset generic usage resource. **Circle of the Land Natural Recovery** uses the Druid provider and the same generic transaction executor; its separate free prepared Circle-spell cast remains reference-only. Successful weighted recovery represents finishing the required Short Rest: the implementation first validates the complete request, then runs the existing Short Rest transition exactly once, restores only the selected eligible slot resources, and consumes the feature use. Invalid or no-op requests perform no rest processing, no slot restoration, and no usage consumption.

PLAY exposes these transactions through the existing Resources surface. The UI is driven only by derived transaction metadata: weighted actions show remaining feature uses, total/remaining recovery budget, eligible expended slot resources, per-resource recovery counts, and weighted selected cost; bounded single-resource restoration exposes only the required fixed/selected control. There are no Wizard-, Druid-, feature-name-, content-ID-, or Homebrew-source transaction branches.

M13C does **not** change Character schema/storage: Character remains v8 under `dnd3.characters.v8`, with `dnd3.characters.v7` as the newest legacy source, and `CharacterPlayState` remains exactly `currentHp`, `temporaryHp`, `hitDiceRemaining`, and `resourceUses`. M13D later extends the existing disposable `PlaySessionState`; M13C transaction state itself still does not enter that cache. M13A Cover remains ephemeral PLAY/UI context. M13C does not add a second slot/rest/resource engine, resource conversion graphs, Sorcery Point ↔ spell-slot conversion, generated temporary spell slots, Magical Cunning/Sorcerous Restoration automation, an event bus, target/combatant state, multiclassing, Level Up, or Creator Forge.

## Milestone 13D — Active Self Effects

M13D adds one bounded, data-driven active-self-effect vocabulary for temporary **self-only** feature modes. Acquired Class/Subclass features may declare a stable effect ID, label/description, activation timing, optional activation cost that references an already-derived resource, bounded D20 modifiers, bounded temporary static modifiers, Concentration/spellcasting restrictions, simple eligibility/termination metadata, optional rest clearing, and reference text. Content remains inert data: validation rejects malformed or executable effect metadata, and runtime behavior does not branch on feature/Class names, content IDs, or Homebrew source.

The existing M13B per-Character disposable session cache is extended in place. The final `PlaySessionState` shape is `conditions: CharacterConditionId[]`, optional `concentration: { spellId; providerId }`, and `activeEffectIds: ContentId[]`. It remains under `dnd3.play-session.v1:<encoded-character-id>` in `sessionStorage`; no Character migration is required. Old valid M13B records that omit `activeEffectIds` remain readable and default that field to `[]`. Malformed or duplicate active-effect IDs are rejected by the session parser, stale/no-longer-owned IDs reconcile away, valid Conditions remain intact, and compatible valid Concentration is preserved.

Activation and deactivation are explicit player actions. Activation validates ownership, eligibility, duplicate state, resource existence/capacity, and structured conflicts before mutation; any cost is then spent exactly once through the existing authoritative resource/play-state transition. Invalid activation spends nothing. Deactivation removes only that effect and never refunds its cost. M13C restoration transactions are unchanged and no transaction selection/budget/pending state is added to `PlaySessionState`.

Active D20 modifiers compose through the existing M13A `D20RollContext` resolver and Roll History, including normal non-stacking and Advantage/Disadvantage cancellation. Temporary static modifiers are derived contextually from the active IDs and are never written back into Character input, `CharacterPlayState`, localStorage, or sessionStorage as derived values. M13B Conditions continue to feed the same D20 context path. M13B Concentration remains the only Concentration state; compatible modes leave it alone, while a structured conflict may end current Concentration during activation and prevent the explicit Start Concentration workflow while the conflicting mode remains active. M13A Cover remains ephemeral UI/roll context and is still not part of any session or Character persistence.

Bundled integrations are intentionally narrow:

- **Barbarian Rage:** explicit Bonus Action activation/deactivation, existing Rage-use spending, Strength ability-check and Strength saving-throw Advantage, level-scaled Strength weapon Rage Damage (+2 at levels 1–8, +3 at 9–15, +4 at 16–20), Heavy-armor activation/termination restrictions, deterministic Incapacitated termination, Concentration end/block, and blocking of the supported Character-side spellcasting workflow. Rage duration countdown, turn/attack/damage-event maintenance and event-driven maintenance/termination beyond the structured Heavy-armor/Incapacitated rules, Unarmed Strike Rage Damage, and incoming Bludgeoning/Piercing/Slashing resistance application remain manual/reference-only.
- **Sorcerer Innate Sorcery:** explicit Bonus Action activation/deactivation, existing Innate Sorcery-use spending, Advantage on Sorcerer spell attack rolls, and +1 Sorcerer spell save DC through temporary generic derivation. Its one-minute duration remains explicit/manual.
- **Monk Superior Defense:** SRD 5.2.1 places **Superior Defense at Monk level 18**. It is not a Champion feature; Champion level 18 remains **Survivor**, and M13D does not automate Survivor. Superior Defense is discovered through the same generic active-effect path, spends exactly 3 existing Focus Points, supports explicit ending, and terminates deterministically on Incapacitated. Its one-minute duration and incoming damage resistance remain manual/reference-only because no duration or incoming-damage engine exists.

PLAY exposes these modes through one generic Active Effects / Feature Modes surface driven by derived content. Structurally compatible synthetic Homebrew content uses the same validation, acquisition, derivation, activation/resource, session persistence, D20/static modifier, reconciliation, deactivation, and PLAY UI paths.

Character persistence remains **v8** at `dnd3.characters.v8`, with `dnd3.characters.v7` as the newest legacy migration source. `CharacterPlayState` remains exactly `currentHp`, `temporaryHp`, `hitDiceRemaining`, and `resourceUses`. M13D adds no Character v9, no second resource/D20/Concentration/session/Character-derivation engine, no event bus or trigger dispatcher, no turn/round/duration engine, no action-economy/encounter/target/battlefield architecture, no incoming-damage interception, no generated spell-slot/Sorcery Point conversion, no Wild Shape transformation, or Weapon Mastery execution.

## Milestone 13E — Bounded Dice Transformations and Static Rules

M13E extends the existing rules and Dice paths rather than creating parallel rollers or state. The final dice-transformation vocabulary is exactly:

- `reroll-once-use-new` — an **optional** post-roll transformation. A qualifying die can be rerolled exactly once; the replacement must be used even when it is another qualifying value. Reapplying the same transformation is rejected.
- `minimum-die-face` — an **automatic** ordinary-roll transformation. Each qualifying die below the configured minimum is raised to that minimum before the final total is resolved.

Both transformations are validated structured data. Unsupported targets, unsupported kinds, executable metadata, duplicate transformation IDs, invalid dice/faces, recursive/unbounded policy fields, and malformed persisted transformation applications reject safely. `RollResult.diceTransformationApplications` records source plus original/replacement/final provenance. Optional transformations update the existing Roll Result inside the **same Roll History entry**; they do not create a second unrelated roll.

**Halfling Luck** is the real optional integration. A qualifying d20 result of 1 exposes a generic source-labelled action. Applying it rerolls that die once, recomputes the legally kept d20 under Normal/Advantage/Disadvantage, recomputes natural-1/natural-20 metadata and attack critical status, and then consumes the transformation. A replacement 1 is final and cannot recursively reroll.

**Great Weapon Fighting** is the real automatic integration. It uses the actual qualifying melee weapon damage die while the weapon is deterministically held with two hands and has the required Two-Handed/Versatile property context. It is not hardcoded to d12; acceptance covers qualifying d6, d8, d10, and d12 weapon damage, including doubled critical weapon dice. Ability modifiers and unrelated/non-qualifying dice are unaffected.

The M13E static rule vocabulary adds:

- `saving-throw-roll-mode` for bounded save Advantage/Disadvantage sources;
- `saving-throw-proficiency` for later acquired save proficiencies;
- `speed-bonus` with fixed or level-table amounts plus bounded armor/shield restrictions;
- `critical-threshold` for derived **weapon** attack critical ranges.

These effects join Species, Feat, acquired Class, and acquired Subclass rule effects in one derivation pipeline. Saving throws continue through the existing D20 context resolver, so manual and automatic Advantage/Disadvantage cancel normally. Concentration checks still call the same Constitution saving-throw path. Initiative remains the M13A path and merely receives any generally applicable d20 transformation metadata.

Passive Perception is derived as `10 + derived Perception modifier`, then applies +5 for resolved Advantage, -5 for resolved Disadvantage, or 0 after opposing sources cancel. It is not persisted. The current `DerivedSkill` contains only skill ID, ability, modifier, and proficiency; it does **not** authoritatively identify selected Expertise choices, so M13E does not guess an Expertise multiplier.

Speed starts from the resolved Species walking Speed, then composes acquired `speed-bonus` effects. Equipped armor with an unmet structured Strength requirement contributes the existing deterministic **-10 feet** penalty; meeting the requirement removes it. This is derived only and is never written back to Character input.

Weapon attack critical status is derived from the generic acquired threshold after the final kept d20 is known. The ordinary threshold is 20; Champion Improved Critical lowers supported weapon attacks to 19; Superior Critical lowers them to 18. `natural` remains independent metadata for actual natural 1/20 results.

### M13E Class / Subclass / Feat integrations

| Integration | Acquisition | Automated in M13E | Remaining boundary |
| --- | --- | --- | --- |
| Great Weapon Fighting | Fighting Style Feat; no level prerequisite, requires the Fighting Style Feature | Generic automatic minimum-3 transformation on qualifying actual weapon damage dice | Conditional mounted-state handling such as Lance context remains table-managed |
| Barbarian Fast Movement | Barbarian 5 | +10 walking Speed while not wearing Heavy armor | No movement simulation |
| Monk Unarmored Movement | Monk 2 | +10 at 2, +15 at 6, +20 at 10, +25 at 14, +30 at 18 while unarmored and without Shield | Special movement/terrain behavior remains separate reference text |
| Monk Disciplined Survivor | Monk 14 | Proficiency in all six saving throws | One-Focus failed-save reroll remains explicit/reference-only because external save failure is not authoritatively known |
| Ranger Roving | Ranger 6 | +10 walking Speed while not wearing Heavy armor | Setting Climb/Swim Speed equal to Speed remains reference-only; the sheet models only primary walking Speed |
| Rogue Slippery Mind | Rogue 15 | Wisdom and Charisma saving-throw proficiency | None for the structured proficiency portion |
| Champion Improved Critical | Fighter/Champion 3 | Weapon critical threshold 19 | Unarmed Strike threshold remains reference-only; no authoritative derived Unarmed Strike attack entry exists |
| Champion Superior Critical | Fighter/Champion 15 | Weapon critical threshold 18 | Unarmed Strike threshold remains reference-only for the same reason |

Champion **Survivor** remains reference-only at level 18. Its bundled definition explicitly calls out Death Saving Throw behavior and Bloodied/turn-start healing, which would require event/timeline behavior M13E does not introduce. Rogue **Reliable Talent** remains reference-only at level 7: faithful optional post-roll replacement under Advantage/Disadvantage requires a specific post-roll die choice not represented by the two approved transformations, and generic tool checks are outside the current Character roll model. It is **not** encoded as `minimum-die-face`.

Weapon Mastery execution remains deferred. Classes expose mastery-choice counts and weapons expose mastery metadata, but authoritative selected mastered-weapon ownership is not persisted in Character state. M13E does not infer mastery ownership from equipped weapons and does not add Character v9.

### Complete 9-Species audit

“Derived before M13E” below means existing structured Character data/choice derivation; it is not a claim that reference prose was mechanically enforced.

| Species | Derived / automated before M13E | Newly automated in M13E | Still reference-only / deferred |
| --- | --- | --- | --- |
| Dragonborn | Medium, 30-ft Speed, 60-ft Darkvision, Draconic Ancestry choice | None | Breath Weapon attack/save/damage, ancestry Damage Resistance, Draconic Flight; require attack/target/damage/resistance/temporary-flight systems |
| Dwarf | Medium, 30-ft Speed, 120-ft Darkvision | **Dwarven Toughness:** +1 maximum HP per Character level | Dwarven Resilience poison resistance/purpose-specific save handling and Stonecunning activation; incoming resistance and sense activation are not modeled |
| Elf | Medium, base 30-ft Speed/60-ft Darkvision; Drow 120-ft Darkvision, Wood Elf 35-ft Speed, lineage choice, Keen Senses skill choice | None | lineage spell benefits, Fey Ancestry charm-specific handling, Trance rest/sleep behavior |
| Gnome | Small, 30-ft Speed, 60-ft Darkvision, lineage choice | **Gnomish Cunning:** Advantage on Intelligence/Wisdom/Charisma saves | Forest/Rock lineage spells/devices; spell/device behavior remains outside this feature vocabulary |
| Goliath | Medium, 35-ft Speed, Giant Ancestry choice | None | ancestry combat benefits, Large Form, Powerful Build; need target/damage/transformation/encumbrance/grapple systems |
| Halfling | Small, 30-ft Speed | **Luck:** optional one-use-new reroll of qualifying d20 1 | Brave frightened-specific handling, Nimbleness movement-through-creatures, Naturally Stealthy hiding context |
| Human | Small/Medium choice, 30-ft Speed, Skillful skill-proficiency choice | None | Resourceful Heroic Inspiration tracking and Versatile Origin-Feat choice ownership are not persisted by the current Species choice model |
| Orc | Medium, 30-ft Speed, 120-ft Darkvision | None | Adrenaline Rush action/resource/temporary-HP package and Relentless Endurance zero-HP event behavior |
| Tiefling | Small/Medium choice, 30-ft Speed, 60-ft Darkvision, Fiendish Legacy choice | None | legacy resistances/spells and Otherworldly Presence cantrip behavior; resistance and lineage spell automation are deferred |

### Complete 17-Feat audit

The authoritative bundled Feat registry remains exactly **17** entries. **Tough is absent**; it is not added or synthesized.

| Feat | Automated before M13E | Newly automated in M13E | Still reference-only / deferred |
| --- | --- | --- | --- |
| Alert | Initiative proficiency through the existing generic Initiative effect | None | Initiative Swap needs ally Initiative/turn state |
| Magic Initiate | None | None | spell-list/ability/spell ownership, free-cast, and spell-change behavior need persisted feat spell selections/casting policy |
| Savage Attacker | None | None | once-per-turn hit-triggered double damage-roll choice needs hit/turn event state and player result choice |
| Skilled | None | None | three skill/tool ownership choices require generic tool proficiency persistence |
| Ability Score Improvement | Structured ability-score increase to max 20 | None | No additional behavior |
| Grappler | Structured Strength/Dexterity +1 to max 20 | None | Punch and Grab, Grappled-target Advantage, and Fast Wrestler need target/grapple/action/movement state |
| Archery | Generic +2 ranged weapon attack-roll bonus | None | No additional structured behavior |
| Defense | Generic +1 AC while wearing Light/Medium/Heavy armor | None | No additional structured behavior |
| Great Weapon Fighting | None | **Generic automatic minimum-die-face 3** on qualifying actual weapon damage dice | conditional mounted-state weapon context remains table-managed |
| Two-Weapon Fighting | None | None | Light-property extra-attack timing/damage needs attack-action orchestration |
| Boon of Combat Prowess | Structured +1 ability score to max 30 | None | turning a miss into a hit needs hit/miss and turn state |
| Boon of Dimensional Travel | Structured +1 ability score to max 30 | None | post-action teleport needs action and position/movement state |
| Boon of Fate | Structured +1 ability score to max 30 | None | reaction/event/recharge handling around another D20 Test is not modeled |
| Boon of Irresistible Offense | Structured Strength/Dexterity +1 to max 30 | None | resistance bypass and natural-20 extra damage require incoming/outgoing damage and attack-event context |
| Boon of Spell Recall | Structured Int/Wis/Cha +1 to max 30 | None | conditional free casting after a d4 requires cast/slot event automation |
| Boon of the Night Spirit | Structured +1 ability score to max 30 | None | lighting-driven Invisible state and broad resistance need lighting/condition/incoming-damage systems |
| Boon of Truesight | Structured +1 ability score to max 30 | None | general Truesight world/sense behavior is not modeled beyond existing structured Species senses |

### M13E persistence and architecture boundary

M13E does not change persistence:

- Character schema stays **v8**.
- Current Character storage stays `dnd3.characters.v8`.
- Newest legacy source stays `dnd3.characters.v7`; there is no v8 → v9 migration.
- `CharacterPlayState` remains exactly `currentHp`, `temporaryHp`, `hitDiceRemaining`, and `resourceUses`.
- `PlaySessionState` remains exactly `conditions`, optional `concentration`, and `activeEffectIds`.
- Dice transformation consumption/provenance lives in Roll Result / Roll History only; no transformation state is added to Character or session persistence.
- Derived save proficiency, Speed, Passive Perception, and critical thresholds are not persisted.
- Cover remains M13A ephemeral page/roll context and is absent from Character and `PlaySessionState`.

Structurally compatible synthetic Homebrew content uses the same validation, registry, acquisition, Character derivation, Character roll, Dice Engine, Roll Result, Roll History, and optional-action paths. Runtime behavior does not dispatch on Homebrew source, Species/Feat/Class/Subclass names, or individual SRD IDs.

M13E introduces no target IDs/state, enemy/ally state, encounter manager, Initiative tracker, battlefield geometry, movement simulation, action-economy tracker, duration/round engine, incoming-damage interceptor, event bus/trigger dispatcher, `onTurnStart`, Death Save event engine, Survivor auto-healing, Rage maintenance engine, Sorcery Point conversion, generated spell slots, Wild Shape transformation, inferred Weapon Mastery ownership/execution, multiclassing, Level Up, Creator Forge, import/export, deployment work, or M13F spell-automation expansion.

## Milestone 13F bounded spell automation

M13F expands the existing M10 spell-roll model without introducing a second spell engine. The spell catalog remains exactly **339** entries:

- **6 M10 structured anchors** remain intact.
- **22 M13F promotions** are composed onto generated SRD reference records through `src/content/srd/spellAutomationM13F.ts`.
- **27 spells total** now have executable roll mechanics: the 5 roll-bearing M10 anchors plus the 22 M13F promotions.
- **Detect Magic** remains the sixth M10 structured anchor but is intentionally non-roll/reference-only.
- **311 generated spells** remain unpromoted/reference-only.

The 22 M13F promotions are Acid Splash, Blight, Chain Lightning, Chill Touch, Circle of Death, Cone of Cold, Dissonant Whispers, Fire Storm, Fireball, Healing Word, Inflict Wounds, Lightning Bolt, Mass Cure Wounds, Mass Healing Word, Poison Spray, Ray of Frost, Ray of Sickness, Shatter, Shocking Grasp, Starry Wisp, Thunderwave, and Vicious Mockery.

`SpellMechanic` remains a declarative, fail-closed four-kind vocabulary only:

- `spell-attack`
- `saving-throw`
- `damage`
- `healing`

M13F does not parse spell prose or dispatch on spell names/IDs. The generated spell catalog remains authoritative for name, level, school, lists, casting metadata, duration/Concentration metadata, description, target text, and stable IDs. The curated overlay supplies only the approved structured mechanics plus exact reference-only residue. The generated source file is not hand-edited.

The existing CHARACTER Spellcasting UI is reused unchanged. It already exposes provider Spell Attack and Spell Save DC values, save guidance, explicit slot selection, Spell Attack/Damage/Critical Damage/Healing roll controls, and reference-only riders. Partial automation remains explicit: for example, Fireball rolls save/damage mathematics but does not determine area targets or ignite objects; Ray of Frost rolls attack/damage but does not apply Speed reduction; Healing Word calculates healing but does not choose or mutate a target.

Rolling remains separate from casting/resource mutation. Damage, Healing, and Spell Attack controls create Dice Engine requests and Roll History entries only. `Cast · Spend Slot` remains the explicit slot-resource transaction. Concentration remains the existing explicit PLAY session workflow; rolling a spell never starts, replaces, or ends Concentration.

M13F introduces no target HP/state, target condition application, target IDs, persistent spell-effect state, duration/turn/round engine, summon/persistent-creature system, encounter tracker, battlefield/range model, movement simulation, or VTT architecture.

### Final Milestone 13 coverage and boundary matrix

| Area | Implemented bounded scope | Intentionally manual/reference-only or deferred |
| --- | --- | --- |
| M13A — D20 Context, Initiative & Cover | one D20 context resolver; first-class Initiative; ephemeral Cover context | target-side Cover adjudication, Initiative order, encounter/turn management |
| M13B — Conditions & Concentration | bounded Character-side Conditions; explicit Concentration session workflow | target conditions, automatic spell Concentration mutation, external save/target state |
| M13C — Resource Transactions | generic bounded resource restoration/spending transactions including spell-slot restoration | Sorcery Point conversion, generated temporary slots, universal action/resource engine |
| M13D — Active Self Effects | explicit acquired Class/Subclass self-effect activation, existing-resource costs, D20/static modifiers, bounded restrictions | duration timers, incoming resistance, event-driven upkeep/termination, external targets |
| M13E — Dice/Static Rules | reroll-once-use-new, minimum-die-face, save modes/proficiency, Speed bonuses, weapon crit thresholds, Passive Perception integration | Expertise ownership, Weapon Mastery selection/execution, Survivor events, failed-save event rerolls, movement modes |
| M13F — Spell Automation | generic spell attacks, save guidance, damage/healing rolls, cantrip/slot scaling, provider modifiers, critical spell damage, Roll History | target selection/application, target HP/conditions, areas/geometry, forced movement, summons, persistent spell durations, DM adjudication |

### Final Milestone 13 persistence/content lock

Milestone 13 closes without a persistence migration:

- Character schema remains **v8** under `dnd3.characters.v8`; newest legacy source remains `dnd3.characters.v7`.
- `CharacterPlayState` remains exactly `currentHp`, `temporaryHp`, `hitDiceRemaining`, and `resourceUses`.
- `PlaySessionState` remains exactly `conditions`, optional `concentration`, and `activeEffectIds`.
- Cover remains ephemeral.
- Spell rolls and dice-transformation provenance live in Roll Result / Roll History rather than Character/session state.
- No Character v9 or hidden spell/session persistence exists.

Final bundled content remains **9 Species, 12 Classes, 12 Subclasses, 339 Spells, and 17 Feats**. Tough remains absent. Remaining gaps are deliberate boundaries: they require target/world/encounter state, persisted player choices not currently authoritative, future milestone architecture, or are expressly prohibited from Milestone 13.

