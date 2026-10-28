# Iron & Ink

![Iron & Ink: an amber d20 on a dark ink background](assets/readme-banner.svg)

**D&D 3.0** is a local character builder and play companion for the 2024 rules. Build an adventurer, browse the bundled SRD 5.2.1 compendium, track a session, and create homebrew content that uses the same character and rules systems.

**Status:** Active development. The local project contains work beyond the current GitHub `main` branch.

[Explore features](#what-you-can-do) · [Run locally](#run-locally) · [Understand saves](#where-your-data-lives) · [Development history](docs/development-history.md)

## What you can do

| Create | Play | Forge |
| --- | --- | --- |
| Build and level characters with class, subclass, species, background, feats, equipment, and spell choices. The current local build includes multiclass progression. | Use the CHARACTER / PLAY / INVENTORY workspace for HP, Hit Dice, rests, resources, conditions, concentration, attacks, spellcasting controls, and dice rolls with history. | Make reusable homebrew classes, subclasses, feats, spells, weapons, armor, shields, and equipment in Creator Forge. |
| Browse a local compendium of SRD classes, spells, feats, weapons, armor, and other reference entries. | Derived rules calculate supported bonuses and rolls from character choices and acquired features. Unsupported effects stay visible for table adjudication. | Custom entries enter the same content registry used by character creation, rules derivation, and play. |

The app supports bounded rule automation. It does not track enemies, turns, a battlefield, target HP, or every effect described in rules text. Some spell and feature effects still require the player or DM to adjudicate the outcome.

## Run locally

**Requirements:** Node.js `^20.19.0`, `^22.13.0`, or `>=24.0.0`; npm. The repository's `.npmrc` and build script use **Windows PowerShell**, so the documented build workflow is Windows-oriented.

Open PowerShell in the project folder and run:

```powershell
npm ci
npm run dev
```

Open the local URL printed by Vite. For the available checks:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

`npm run build` creates `dist/`; `npm run preview` serves that production build locally.

## Where your data lives

The **development server** uses project files. It reads and writes character records in `.dnd3/characters/characters.v10.json` and Creator Forge content in `.dnd3/creator-forge/homebrew-content.v1.json`. The app has an explicit migration screen for supported older project and browser data. Keep copies of those files before a migration or major change, and review them before committing: they can contain personal characters and homebrew.

A **production build** uses browser-local storage instead. Its data is separate from the development project files and from storage at other browser origins. There is no account or cloud sync. Moving between those modes does not automatically move your characters.

## How it is organized

- `src/content/srd/` contains the bundled SRD reference catalog.
- `src/rules/` derives supported character mechanics from choices and content.
- `src/dice/` handles rolls and visual dice behavior.
- `src/services/` handles storage, migration, content validation, and application mutations.
- `src/components/` and `src/pages/` provide the character workspace, compendium, and Creator Forge.
- `dev/` provides the development project's file-backed persistence.
- `src/test/` and colocated `*.test.*` files cover rules, persistence, UI, and flows.

The previous technical README is preserved as [development history](docs/development-history.md). Its older milestone sections are historical snapshots, so use the source and current tests when checking present behavior.

## SRD attribution and licensing

This project includes material from the [System Reference Document 5.2.1](https://www.dndbeyond.com/srd/) by Wizards of the Coast LLC. That SRD material is available under the [Creative Commons Attribution 4.0 International license](https://creativecommons.org/licenses/by/4.0/). The repository does not currently contain a project-wide license file for its own code.

D&D 3.0 / Iron & Ink is an independent project.
