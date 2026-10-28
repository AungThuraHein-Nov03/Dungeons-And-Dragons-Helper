# Iron & Ink

![Iron & Ink banner with an amber d20 on a dark ink background](assets/readme-banner.svg)

**Build the adventurer. Play the session. Forge what the rules don't cover.**

Iron & Ink (the **D&D 3.0** project) is a local D&D 2024 character builder and play companion. It brings character creation, a live sheet, dice, a searchable SRD compendium, and reusable homebrew into one workspace.

[See what it does](#inside-iron--ink) · [Run it locally](#quick-start) · [Understand saved data](#where-the-data-goes)

> **Development preview** — This file describes the current local folder. The GitHub `main` branch still contains an earlier version of the app.

---

## Inside Iron & Ink

| Area | At the table |
| :--- | :--- |
| **Character Builder** | Create and level characters with class and subclass progression, species, background, feats, spells, and equipment. The local build supports multiclass progression. |
| **PLAY workspace** | Track HP, Hit Dice, rests, class resources, conditions, concentration, spell slots, and attacks. Roll with the shared dice engine and review the roll history. |
| **Inventory** | Manage carried gear, equipped weapons and armor, and currency in the same character record. |
| **Compendium** | Browse bundled SRD 5.2.1 classes, subclasses, species, backgrounds, feats, spells, weapons, armor, equipment, and weapon masteries. |
| **Creator Forge** | Create reusable homebrew classes, subclasses, feats, spells, weapons, armor, shields, and equipment. Supported mechanics use the same content registry and rules pipeline as built-in entries. |

### Rules you can trust, decisions you still make

The app derives supported statistics and rolls from stored character choices. It shows reference text for effects it cannot resolve. Your table still handles targets, enemy state, turns, positioning, and other rulings outside the app's scope. Iron & Ink is a character companion, not a virtual tabletop.

## Quick start

Use a supported Node.js version (`^20.19.0`, `^22.13.0`, or `>=24.0.0`) and npm. The repository configures npm scripts for **Windows PowerShell**.

From the project folder:

```powershell
npm ci
npm run dev
```

Open the address printed by Vite. To check the project or make a production build:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

The build is written to `dist/`. Run `npm run preview` to inspect that build locally.

## Where the data goes

| Mode | Storage | What to know |
| :--- | :--- | :--- |
| **Development** · `npm run dev` | Project files: `.dnd3/characters/characters.v10.json` and `.dnd3/creator-forge/homebrew-content.v1.json` | Back up these files before migrations or major edits. They may contain private character and campaign material, so review them before committing. |
| **Production** · built app | This browser's local storage | It has no account or cloud sync. A different browser or site address has a separate save, and it does not automatically read the development project files. |

An in-app migration screen handles supported older data through an explicit review and confirmation flow.

## Built with

**React · TypeScript · Vite** for the app, with **Vitest** for automated checks. The dice visuals use **Three.js** and **Rapier**.

| Folder | Responsibility |
| :--- | :--- |
| `src/content/srd/` | Bundled rules reference content |
| `src/rules/` and `src/dice/` | Derived mechanics and rolls |
| `src/services/` | Character storage, content registry, migrations, and mutations |
| `src/components/` and `src/pages/` | Character workspace, compendium, and Creator Forge |
| `dev/` | File-backed persistence for local development |

For the milestone-by-milestone technical record, see the [development history](docs/development-history.md). Older sections are historical snapshots rather than a description of every current behavior.

## Content and licensing

Iron & Ink includes material from the [System Reference Document 5.2.1](https://www.dndbeyond.com/srd/) by Wizards of the Coast LLC. That SRD material is available under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The repository currently has no project-wide license file for its own code.

Iron & Ink is an independent project.
