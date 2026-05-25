# VTT JSON Reference

This project has two related JSON surfaces:

- Ability automation JSON: stored on `action.automation` or monster ability `automation`.
- Full monster import JSON: imported by the Strixhaven Monster Creator.

## Canonical Files

| Surface | Canonical docs/code |
|---|---|
| Ability automation schema | `../../character_sheet/ability-automation/AUTHORING.md` |
| Supported fields, effects, hooks, statuses | `../../character_sheet/ability-automation/REGISTRY.md` |
| Enum source of truth | `../../character_sheet/ability-automation/primitives.js` |
| Normalization and validation | `../../character_sheet/ability-automation/schema.js` |
| Runtime execution | `../../character_sheet/ability-automation/runner.js` |
| Monster import template | `../../strixhaven/monster-creator/MONSTER_JSON_IMPORT_TEMPLATE.md` |
| Monster import normalizer | `../../strixhaven/monster-creator/js/monster-builder.js` |
| VTT monster normalizer | `../../vtt/api/monster_helpers.php` |

## Current Monster Ability Categories

Use only these category keys:

- `passive`
- `maneuver`
- `action`
- `triggered_action`
- `villain_action`
- `malice`

## Authoring Rules

- Monster automation reuses `ability-automation/v3`.
- Monster power rolls should use literal `flatBonus`.
- Monster damage should use static numbers, not PC-style formulas like `7 + M`.
- Use `surgeGain` for Draw Steel surges; do not model surges as heroic resources.
- Use nested `spend` for optional heroic-resource riders, and embedded `teleport.spend` when the spend changes teleport range before the destination picker opens.
- Full monster imports should use `immunities` and `weaknesses` arrays of `{ "type", "value" }`.
- Per-ability automation belongs on the individual ability object as `automation`.
- If a mechanic is unsupported, use `note` or `other`, not invented fields.
