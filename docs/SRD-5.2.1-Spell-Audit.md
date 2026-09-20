# D&D 3.0 — SRD 5.2.1 Spell Audit

Audit date: 2026-09-20  
Project: `E:\Projects\D&D 3.0`  
Reference: Wizards of the Coast / D&D Beyond, System Reference Document 5.2.1  
Scope: spell-name inventory and current app inclusion only. This file does **not** reproduce SRD spell descriptions.

## Result

**The app currently contains the complete SRD 5.2.1 spell inventory.**

| Check | Result |
|---|---:|
| Latest English SRD version currently published by D&D Beyond | 5.2.1 |
| Authoritative SRD spell manifest entries in app | 339 |
| App `SRD_SPELLS` entries | 339 |
| Missing SRD 5.2.1 spells | **0** |
| Extra spell names relative to the locked SRD manifest | **0** |
| Duplicate spell IDs | **0** |
| Duplicate spell names | **0** |
| Structured M10 anchors | 6 |
| M13F promoted/automated generated spells | 22 |
| Remaining generated reference-only spells | 311 |
| Roll-structured spells | 27 |

The current repository test `src/content/srd/spells.test.ts` explicitly asserts that the manifest, exported spell catalog, and registry each contain exactly 339 spells, that spell IDs and names are unique, and that the exported spell ID/name pairs exactly equal the locked SRD 5.2.1 manifest.

Focused verification run on 2026-09-20:

```text
npm test -- src/content/srd/spells.test.ts

Test Files  1 passed (1)
Tests       5 passed (5)
```

## Latest-version check

D&D Beyond currently lists **SRD v5.2.1** as the latest English SRD. The SRD page was last updated March 2, 2026, and links the English SRD v5.2.1 PDF published May 1, 2025.

SRD 5.2 added 20 spells compared with SRD 5.1:

- Aura of Life
- Charm Monster
- Chromatic Orb
- Dissonant Whispers
- Divine Smite
- Dragon's Breath
- Elementalism
- Ensnaring Strike
- Hex
- Ice Knife
- Mind Spike
- Phantasmal Force
- Power Word Heal
- Ray of Sickness
- Searing Smite
- Sorcerous Burst
- Starry Wisp
- Summon Dragon
- Tsunami
- Vitriolic Sphere

All 20 are present in the app's locked SRD 5.2.1 manifest.

## Important distinction: present vs automated

A spell being **present** means it exists in the app's SRD catalog and can be surfaced as reference content.

That is not the same thing as the spell being fully automated.

Current automation split:

- **6 structured M10 anchors**
  - Fire Bolt
  - Sacred Flame
  - Cure Wounds
  - Guiding Bolt
  - Burning Hands
  - Detect Magic
- **22 M13F promoted spells** with bounded structured mechanics.
- **311 generated spells remain reference-only**.
- Of the six M10 anchors, Detect Magic is structured metadata/reference content but does not expose a roll mechanic.
- The current tests therefore report **27 roll-structured spells** total.

So if the next goal is "add missing SRD spells," there is nothing to add. If the next goal is "make more of the 339 spells mechanically actionable," that is a separate automation milestone.

## Complete SRD 5.2.1 spell checklist

Every item below is present in the current app catalog.

- [x] Acid Arrow
- [x] Acid Splash
- [x] Aid
- [x] Alarm
- [x] Alter Self
- [x] Animal Friendship
- [x] Animal Messenger
- [x] Animal Shapes
- [x] Animate Dead
- [x] Animate Objects
- [x] Antilife Shell
- [x] Antimagic Field
- [x] Antipathy/Sympathy
- [x] Arcane Eye
- [x] Arcane Hand
- [x] Arcane Lock
- [x] Arcane Sword
- [x] Arcanist's Magic Aura
- [x] Astral Projection
- [x] Augury
- [x] Aura of Life
- [x] Awaken
- [x] Bane
- [x] Banishment
- [x] Barkskin
- [x] Beacon of Hope
- [x] Befuddlement
- [x] Bestow Curse
- [x] Black Tentacles
- [x] Blade Barrier
- [x] Bless
- [x] Blight
- [x] Blindness/Deafness
- [x] Blink
- [x] Blur
- [x] Burning Hands
- [x] Call Lightning
- [x] Calm Emotions
- [x] Chain Lightning
- [x] Charm Monster
- [x] Charm Person
- [x] Chill Touch
- [x] Chromatic Orb
- [x] Circle of Death
- [x] Clairvoyance
- [x] Clone
- [x] Cloudkill
- [x] Color Spray
- [x] Command
- [x] Commune
- [x] Commune with Nature
- [x] Comprehend Languages
- [x] Compulsion
- [x] Cone of Cold
- [x] Confusion
- [x] Conjure Animals
- [x] Conjure Celestial
- [x] Conjure Elemental
- [x] Conjure Fey
- [x] Conjure Minor Elementals
- [x] Conjure Woodland Beings
- [x] Contact Other Plane
- [x] Contagion
- [x] Contingency
- [x] Continual Flame
- [x] Control Water
- [x] Control Weather
- [x] Counterspell
- [x] Create Food and Water
- [x] Create or Destroy Water
- [x] Create Undead
- [x] Creation
- [x] Cure Wounds
- [x] Dancing Lights
- [x] Darkness
- [x] Darkvision
- [x] Daylight
- [x] Death Ward
- [x] Delayed Blast Fireball
- [x] Demiplane
- [x] Detect Evil and Good
- [x] Detect Magic
- [x] Detect Poison and Disease
- [x] Detect Thoughts
- [x] Dimension Door
- [x] Disguise Self
- [x] Disintegrate
- [x] Dispel Evil and Good
- [x] Dispel Magic
- [x] Dissonant Whispers
- [x] Divination
- [x] Divine Favor
- [x] Divine Smite
- [x] Divine Word
- [x] Dominate Beast
- [x] Dominate Monster
- [x] Dominate Person
- [x] Dragon's Breath
- [x] Dream
- [x] Druidcraft
- [x] Earthquake
- [x] Eldritch Blast
- [x] Elementalism
- [x] Enhance Ability
- [x] Enlarge/Reduce
- [x] Ensnaring Strike
- [x] Entangle
- [x] Enthrall
- [x] Etherealness
- [x] Expeditious Retreat
- [x] Eyebite
- [x] Fabricate
- [x] Faerie Fire
- [x] Faithful Hound
- [x] False Life
- [x] Fear
- [x] Feather Fall
- [x] Find Familiar
- [x] Find Steed
- [x] Find the Path
- [x] Find Traps
- [x] Finger of Death
- [x] Fire Bolt
- [x] Fire Shield
- [x] Fire Storm
- [x] Fireball
- [x] Flame Blade
- [x] Flame Strike
- [x] Flaming Sphere
- [x] Flesh to Stone
- [x] Floating Disk
- [x] Fly
- [x] Fog Cloud
- [x] Forbiddance
- [x] Forcecage
- [x] Foresight
- [x] Freedom of Movement
- [x] Freezing Sphere
- [x] Gaseous Form
- [x] Gate
- [x] Geas
- [x] Gentle Repose
- [x] Giant Insect
- [x] Glibness
- [x] Globe of Invulnerability
- [x] Glyph of Warding
- [x] Goodberry
- [x] Grease
- [x] Greater Invisibility
- [x] Greater Restoration
- [x] Guardian of Faith
- [x] Guards and Wards
- [x] Guidance
- [x] Guiding Bolt
- [x] Gust of Wind
- [x] Hallow
- [x] Hallucinatory Terrain
- [x] Harm
- [x] Haste
- [x] Heal
- [x] Healing Word
- [x] Heat Metal
- [x] Hellish Rebuke
- [x] Heroes' Feast
- [x] Heroism
- [x] Hex
- [x] Hideous Laughter
- [x] Hold Monster
- [x] Hold Person
- [x] Holy Aura
- [x] Hunter's Mark
- [x] Hypnotic Pattern
- [x] Ice Knife
- [x] Ice Storm
- [x] Identify
- [x] Illusory Script
- [x] Imprisonment
- [x] Incendiary Cloud
- [x] Inflict Wounds
- [x] Insect Plague
- [x] Instant Summons
- [x] Invisibility
- [x] Irresistible Dance
- [x] Jump
- [x] Knock
- [x] Legend Lore
- [x] Lesser Restoration
- [x] Levitate
- [x] Light
- [x] Lightning Bolt
- [x] Locate Animals or Plants
- [x] Locate Creature
- [x] Locate Object
- [x] Longstrider
- [x] Mage Armor
- [x] Mage Hand
- [x] Magic Circle
- [x] Magic Jar
- [x] Magic Missile
- [x] Magic Mouth
- [x] Magic Weapon
- [x] Magnificent Mansion
- [x] Major Image
- [x] Mass Cure Wounds
- [x] Mass Heal
- [x] Mass Healing Word
- [x] Mass Suggestion
- [x] Maze
- [x] Meld into Stone
- [x] Mending
- [x] Message
- [x] Meteor Swarm
- [x] Mind Blank
- [x] Mind Spike
- [x] Minor Illusion
- [x] Mirage Arcane
- [x] Mirror Image
- [x] Mislead
- [x] Misty Step
- [x] Modify Memory
- [x] Moonbeam
- [x] Move Earth
- [x] Nondetection
- [x] Pass without Trace
- [x] Passwall
- [x] Phantasmal Force
- [x] Phantasmal Killer
- [x] Phantom Steed
- [x] Planar Ally
- [x] Planar Binding
- [x] Plane Shift
- [x] Plant Growth
- [x] Poison Spray
- [x] Polymorph
- [x] Power Word Heal
- [x] Power Word Kill
- [x] Power Word Stun
- [x] Prayer of Healing
- [x] Prestidigitation
- [x] Prismatic Spray
- [x] Prismatic Wall
- [x] Private Sanctum
- [x] Produce Flame
- [x] Programmed Illusion
- [x] Project Image
- [x] Protection from Energy
- [x] Protection from Evil and Good
- [x] Protection from Poison
- [x] Purify Food and Drink
- [x] Raise Dead
- [x] Ray of Enfeeblement
- [x] Ray of Frost
- [x] Ray of Sickness
- [x] Regenerate
- [x] Reincarnate
- [x] Remove Curse
- [x] Resilient Sphere
- [x] Resistance
- [x] Resurrection
- [x] Reverse Gravity
- [x] Revivify
- [x] Rope Trick
- [x] Sacred Flame
- [x] Sanctuary
- [x] Scorching Ray
- [x] Scrying
- [x] Searing Smite
- [x] Secret Chest
- [x] See Invisibility
- [x] Seeming
- [x] Sending
- [x] Sequester
- [x] Shapechange
- [x] Shatter
- [x] Shield
- [x] Shield of Faith
- [x] Shillelagh
- [x] Shining Smite
- [x] Shocking Grasp
- [x] Silence
- [x] Silent Image
- [x] Simulacrum
- [x] Sleep
- [x] Sleet Storm
- [x] Slow
- [x] Sorcerous Burst
- [x] Spare the Dying
- [x] Speak with Animals
- [x] Speak with Dead
- [x] Speak with Plants
- [x] Spider Climb
- [x] Spike Growth
- [x] Spirit Guardians
- [x] Spiritual Weapon
- [x] Starry Wisp
- [x] Stinking Cloud
- [x] Stone Shape
- [x] Stoneskin
- [x] Storm of Vengeance
- [x] Suggestion
- [x] Summon Dragon
- [x] Sunbeam
- [x] Sunburst
- [x] Symbol
- [x] Telekinesis
- [x] Telepathic Bond
- [x] Teleport
- [x] Teleportation Circle
- [x] Thaumaturgy
- [x] Thunderwave
- [x] Time Stop
- [x] Tiny Hut
- [x] Tongues
- [x] Transport via Plants
- [x] Tree Stride
- [x] True Polymorph
- [x] True Resurrection
- [x] True Seeing
- [x] True Strike
- [x] Tsunami
- [x] Unseen Servant
- [x] Vampiric Touch
- [x] Vicious Mockery
- [x] Vitriolic Sphere
- [x] Wall of Fire
- [x] Wall of Force
- [x] Wall of Ice
- [x] Wall of Stone
- [x] Wall of Thorns
- [x] Warding Bond
- [x] Water Breathing
- [x] Water Walk
- [x] Web
- [x] Weird
- [x] Wind Walk
- [x] Wind Wall
- [x] Wish
- [x] Word of Recall
- [x] Zone of Truth

## Missing spells

**None.**

There are currently no spell-name gaps between the app's locked SRD 5.2.1 inventory and its exported spell catalog.

## Extra spells

**None relative to the locked SRD manifest.**

The spell catalog test compares the exact sorted `[id, name]` pairs of `SRD_SPELLS` against `SRD_5_2_1_SPELL_MANIFEST`, so an added non-SRD spell inside that catalog would fail the current invariant.

## Files involved

- `src/content/srd/spellManifest.ts` — locked 339-name SRD 5.2.1 inventory.
- `src/content/srd/spellsReference.generated.ts` — generated authoritative reference records.
- `src/content/srd/spells.ts` — six original structured anchors plus generated spell composition.
- `src/content/srd/spellAutomationM13F.ts` — 22 bounded promoted spell automation records.
- `src/content/srd/spells.test.ts` — exact 339-spell catalog and metadata assertions.
- `src/content/srd/milestone13FCIntegration.test.ts` — 6 + 22 + 311 accounting and 27 roll-structured assertion.
- `src/services/contentRegistry.ts` — registry used by the app.

## What this audit does not prove

This audit proves **catalog completeness by spell identity** for the app's current locked SRD 5.2.1 manifest and verifies that the focused catalog tests pass on the current working tree.

It does **not** independently re-audit every one of the 339 spell descriptions word-for-word against the SRD PDF, nor does it claim that all 339 spells are fully automated. The current architecture intentionally leaves 311 generated spells reference-only.

## Suggested next review

If you want to expand spell functionality rather than spell count, the useful next audit is to classify the 311 reference-only spells into safe automation buckets such as:

1. straightforward attack-roll damage,
2. straightforward saving-throw damage,
3. healing,
4. simple self/target buffs,
5. concentration state,
6. conditions,
7. movement/forced movement,
8. areas and persistent zones,
9. summons/transformation,
10. spells that should remain reference-only because they require open-ended adjudication.

That would give us a clean roadmap for future spell automation without pretending the missing problem is catalog coverage.
