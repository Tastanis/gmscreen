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
- Target cards can set `promptTitle` and `promptText` to explain exactly why the player is picking a token. If omitted, a target card immediately followed by a damage effect on that target group gets a generic "Pick Enemy to Damage" style prompt. Token target cards with custom or inferred prompt text use one compact board picker prompt; optional picks show `Skip` there. The popup wording does not control damage; `damage.amount`, `damage.attribute`, `damage.amountDice`, and either scalar `damage.damageType` or the canonical `damage.damageTypeOptions` choice array on the later effect still do.
- Target `distance` automatically supplies a non-enforcing range overlay during token/area selection. Optional `selectionGuide: { range, form }` and legacy numeric `range` normalize to that same UI-only guide; never claim the VTT rejects out-of-range clicks.
- A normal condition can carry persistent `riders[]` for bounded `turnStart`/`turnEnd` effects while that exact condition instance remains present. Use the documented `{ id, when, target, effects }` shape; do not reuse singular `rider`, which is reserved for `hiddenEffect` roll modifiers.
- PC heroic-resource spend prompts are in-app VTT modals. `maxAmount` enables a variable-spend stepper; use it for "spend 1+" text instead of inventing custom fields.
- Recovery-style heals use `{ "kind": "heal", "recoveries": N }`. In the VTT, matched PC targets decrement `hero.vitals.currentRecoveries` automatically before the stamina heal; unresolved targets fall back to chat/no-op behavior.
- `freeStrike` opens a VTT target prompt, rolls the free strike, and applies damage automatically. Use `text` to tell the player which target the rules require if the current schema cannot enforce that exact source.
- Full monster imports should use `immunities` and `weaknesses` arrays of `{ "type", "value" }`.
- Per-ability automation belongs on the individual ability object as `automation`.
- If a mechanic is unsupported, use `note` or `other`, not invented fields.

## Range-guide recipe

Put range guidance on the `target` card that opens the picker. Prefer the normal
`distance` field:

```json
{
  "type": "target",
  "id": "pick-primary",
  "name": "primary",
  "mode": "token",
  "predicate": "enemy",
  "count": { "value": 1, "mode": "exact" },
  "distance": { "form": "ranged", "value": 5 }
}
```

That displays a 5-square box around the source while the target question is
open. It is visual guidance only. It does not reject a click outside the box.

Use `selectionGuide` only when the displayed guide intentionally differs from
the ability's rules distance:

```json
"selectionGuide": { "range": 8, "form": "ranged" }
```

Do not add `enforce`, `maximumDistance`, or other invented legality fields.
For areas, author the placement distance normally, for example:

```json
{
  "type": "target",
  "name": "blast",
  "mode": "area",
  "shape": "cube",
  "size": 3,
  "distance": { "form": "cube", "value": 3, "within": 10 }
}
```

This shows the area template and its 10-square placement guide.

## Persistent condition-rider recipe

Put a timed rider on the same `condition` effect that creates the condition:

```json
{
  "kind": "condition",
  "name": "grabbed",
  "duration": "saveEnds",
  "riders": [{
    "id": "crushing-grab",
    "when": "turnStart",
    "target": "bearer",
    "effects": [
      { "kind": "damage", "amount": 5, "damageType": "fire" }
    ]
  }]
}
```

- `id` must be stable and unique within that condition.
- `when` is `turnStart` or `turnEnd`.
- `target` is `bearer` (default) or `source`.
- Supported rider effects are `damage`, `heal`, `temporaryStamina`,
  `surgeGain`, `condition`, `floatingText`, `note`, and `other`.
- Damage/healing can use flat or dice amounts. Riders cannot prompt for a
  damage type and cannot use attributes, recoveries, or captured trigger
  values.
- The rider repeats at each matching boundary only while that exact condition
  remains. Removing or saving out of the condition removes the rider.
- Do not write `instanceId` or `riderExecutions`; the VTT creates and maintains
  those persistence fields.
- Singular `rider` is reserved for `hiddenEffect` roll modifiers. Timed
  ordinary-condition effects always use `riders` as an array.

The PC and monster sidebars display the source ability/creature, rider effect,
amount and damage type, timing, and condition duration.
