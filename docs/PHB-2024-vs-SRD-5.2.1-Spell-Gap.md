# D&D 3.0 — Player's Handbook 2024 vs SRD 5.2.1 Spell Gap

Audit date: 2026-09-20  
Purpose: identify spells published in the **2024 Player's Handbook** that are **not included in SRD 5.2.1**, for possible later support in D&D 3.0.

## Executive result

- Player's Handbook (2024): **391 spells**
- SRD 5.2.1: **339 spells**
- PHB-only spell gap: **52 spells**
- This list treats SRD legally renamed equivalents as the **same spell**, so branded-name differences do not inflate the missing count.
- The current D&D 3.0 SRD manifest contains none of the 52 PHB-only names below.

> Important licensing note: SRD 5.2.1 is released under CC BY 4.0. The 52 additional PHB spells are not part of that SRD grant. This document therefore records **names and organizational metadata only**, not proprietary spell descriptions or rules text.

## PHB-only spells by level

### Cantrips — 7

- [ ] Blade Ward
- [ ] Friends
- [ ] Mind Sliver
- [ ] Thorn Whip
- [ ] Thunderclap
- [ ] Toll the Dead
- [ ] Word of Radiance

### Level 1 — 7

- [ ] Armor of Agathys
- [ ] Arms of Hadar
- [ ] Compelled Duel
- [ ] Hail of Thorns
- [ ] Thunderous Smite
- [ ] Witch Bolt
- [ ] Wrathful Smite

### Level 2 — 6

- [ ] Arcane Vigor
- [ ] Beast Sense
- [ ] Cloud of Daggers
- [ ] Cordon of Arrows
- [ ] Crown of Madness
- [ ] Summon Beast

### Level 3 — 10

- [ ] Aura of Vitality
- [ ] Blinding Smite
- [ ] Conjure Barrage
- [ ] Crusader's Mantle
- [ ] Elemental Weapon
- [ ] Feign Death
- [ ] Hunger of Hadar
- [ ] Lightning Arrow
- [ ] Summon Fey
- [ ] Summon Undead

### Level 4 — 7

- [ ] Aura of Purity
- [ ] Fount of Moonlight
- [ ] Grasping Vine
- [ ] Staggering Smite
- [ ] Summon Aberration
- [ ] Summon Construct
- [ ] Summon Elemental

### Level 5 — 10

- [ ] Banishing Smite
- [ ] Circle of Power
- [ ] Conjure Volley
- [ ] Destructive Wave
- [ ] Jallarzi's Storm of Radiance
- [ ] Steel Wind Strike
- [ ] Summon Celestial
- [ ] Swift Quiver
- [ ] Synaptic Static
- [ ] Yolande's Regal Presence

### Level 6 — 3

- [ ] Arcane Gate
- [ ] Summon Fiend
- [ ] Tasha's Bubbling Cauldron

### Level 7 — 1

- [ ] Power Word Fortify

### Level 8 — 1

- [ ] Telepathy

### Level 9 — 0

No PHB-only level 9 spells in this comparison.

## Count check

| Level | PHB-only |
|---|---:|
| Cantrip | 7 |
| 1 | 7 |
| 2 | 6 |
| 3 | 10 |
| 4 | 7 |
| 5 | 10 |
| 6 | 3 |
| 7 | 1 |
| 8 | 1 |
| 9 | 0 |
| **Total** | **52** |

## Do NOT count these as missing: PHB names with SRD-safe renamed equivalents

The 2024 PHB uses several branded character names that SRD 5.2.1 replaces with generic names. These are not additional spells for catalog purposes.

| Player's Handbook 2024 name | SRD 5.2.1 name |
|---|---|
| Bigby's Hand | Arcane Hand |
| Drawmij's Instant Summons | Instant Summons |
| Evard's Black Tentacles | Black Tentacles |
| Leomund's Secret Chest | Secret Chest |
| Leomund's Tiny Hut | Tiny Hut |
| Melf's Acid Arrow | Acid Arrow |
| Mordenkainen's Faithful Hound | Faithful Hound |
| Mordenkainen's Magnificent Mansion | Magnificent Mansion |
| Mordenkainen's Private Sanctum | Private Sanctum |
| Mordenkainen's Sword | Arcane Sword |
| Nystul's Magic Aura | Arcanist's Magic Aura |
| Otiluke's Freezing Sphere | Freezing Sphere |
| Otiluke's Resilient Sphere | Resilient Sphere |
| Otto's Irresistible Dance | Irresistible Dance |
| Rary's Telepathic Bond | Telepathic Bond |
| Tasha's Hideous Laughter | Hideous Laughter |
| Tenser's Floating Disk | Floating Disk |

These aliases matter if D&D 3.0 later supports PHB source labeling. A PHB-facing UI could display the PHB name while retaining an internal relationship to the corresponding SRD spell instead of creating duplicate mechanical records.

## Verification against the current D&D 3.0 SRD manifest

The 52 names above were searched directly against:

`src/content/srd/spellManifest.ts`

All 52 exact-name searches returned **no match**, which is expected because the project's SRD manifest is intentionally limited to the 339 SRD 5.2.1 spell identities.

This check only confirms that these names are absent from the current SRD catalog. It does not authorize copying their proprietary PHB descriptions into the application.

## Sources / evidence used for the comparison

- Wizards of the Coast / D&D Beyond — **SRD 5.2.1**, the current English SRD.
- D&D Beyond — **Player's Handbook (2024)** source and spell lists.
- A 2024 PHB spell index reporting **391** PHB spells.
- Independent implementation evidence reporting **339 SRD 5.2.1 spells + 52 Player's Handbook 2024 name-only references**.

## Suggested app treatment

If these are added later, keep them separate from the SRD content source.

A safe data model would distinguish at least:

- `source.type = 'srd'` for the 339 CC-licensed SRD spells.
- a separate PHB/reference source for the 52 non-SRD names.
- no copied PHB rules text unless you have a separate lawful basis to distribute it.
- optional original summaries written in your own words if the app is strictly personal/private, while still keeping source boundaries explicit.
- alias metadata for the 17 renamed SRD equivalents above so they do not become duplicate spells.

## Practical takeaway

For **spell-count parity with the 2024 Player's Handbook**, the catalog gap is **52 spells**.

For **open-source / distributable SRD-only support**, the existing target remains **339 spells**.

Those are two different completeness goals and should stay explicitly separated in D&D 3.0.
