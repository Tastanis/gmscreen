# AI Reference Index

## Common Tasks

| Task | Read these files |
|---|---|
| Make a class ability JSON | `source/rules-v1.01b/classes/<class>.md`, then `../character_sheet/ability-automation/AUTHORING.md`, then `../character_sheet/ability-automation/REGISTRY.md` |
| Make a monster import JSON | `source/monsters/INDEX.md`, one monster chunk, then `../strixhaven/monster-creator/MONSTER_JSON_IMPORT_TEMPLATE.md` |
| Add automation to an existing monster ability | `hooks/monster-automation.md`, then the monster chunk, then `../character_sheet/ability-automation/REGISTRY.md` for exact field shapes |
| Check whether an effect/hook exists | `../character_sheet/ability-automation/REGISTRY.md`, then `hooks/INDEX.md` (monsters: `hooks/monster-automation.md`) |
| Update automation schema/runtime | `UPDATE-GUIDE.md`, `../character_sheet/ability-automation/README.md`, `AUTHORING.md`, and `REGISTRY.md` |
| Add heroic resource automation | `source/rules-v1.01b/classes/<class>.md`, then `../character_sheet/heroic-resource-automation/README.md`, then VTT event hooks in `../vtt/assets/js/ui/board-interactions.js` |
| Work on monster tray/runtime behavior | `hooks/monster-automation.md`, `vtt-json/INDEX.md`, `../vtt/assets/js/ui/monster-ability-tray.js`, `../vtt/assets/js/ui/monster-ability-runner-glue.js` |

## Character Automations

Saved, paste-ready ability + heroic-resource JSON per player character. Convention and file list: `characters/README.md`.

- Cal (Censor / Wrath / Judgment): `characters/cal-automations.md`
- Sharon (Shadow / Black Ash): `characters/sharon-automations.md`
- Indigo, Zepha: not yet built

## Source Text

- Current Heroes v1.01b rules chapter chunks: `source/rules-v1.01b/chapters/`
- Current Heroes v1.01b whole-class chunks: `source/rules-v1.01b/classes/`
- Monster chunk index: `source/monsters/INDEX.md`
- Monster source chunks: `source/monsters/chunks/`

## Canonical Code Docs

- Ability automation authoring: `../character_sheet/ability-automation/AUTHORING.md`
- Supported fields, hooks, and effects: `../character_sheet/ability-automation/REGISTRY.md`
- Heroic resource automation authoring: `../character_sheet/heroic-resource-automation/README.md`
- Automation folder map and invariants: `../character_sheet/ability-automation/README.md`
- Full monster import shape: `../strixhaven/monster-creator/MONSTER_JSON_IMPORT_TEMPLATE.md`

## Example Lookup

For "In All This Confusion":

1. Open `source/rules-v1.01b/classes/shadow.md`.
2. Search for `In All This Confusion`.
3. Confirm it is a Shadow Harlequin Mask triggered action: trigger is taking damage, effect halves the damage and teleports up to 4 squares after the triggering effect resolves.
4. Open `../character_sheet/ability-automation/AUTHORING.md` and search for `trigger`, `halveTriggeringDamage`, and `teleport`.
5. Open `../character_sheet/ability-automation/REGISTRY.md` to confirm the trigger event and hooks are supported.
