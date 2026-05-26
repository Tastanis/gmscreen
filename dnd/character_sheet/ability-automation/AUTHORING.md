# Ability Automation — Authoring Format

This document is the format specification for **ability automation JSON**, paste-ready for the character-sheet automation button. An LLM reading **only this file** plus an ability's book text should be able to produce correct JSON.

The runtime is lenient: unknown fields are preserved but ignored, missing fields default. Warnings are surfaced in the inspector. JSON parse errors block the save.

---

**Two flavors of automation:**

- **Ability automation** — `cards[]` describes what happens when the ability fires. Attached to an ability.
- **Feature automation** — `modifiers[]` describes how the feature changes other abilities. Attached to a feature. See [Feature modifiers](#feature-modifiers) at the bottom.

---

## Top-level shape

```json
{
  "schema": "ability-automation/v3",
  "keywords": ["Melee", "Strike", "Weapon"],
  "cards": [
    { "type": "target",     "...": "..." },
    { "type": "powerRoll",  "...": "..." },
    { "type": "effect",     "...": "..." },
    { "type": "trigger",    "...": "..." },
    { "type": "persistent", "...": "..." }
  ]
}
```

- `schema` — must be `"ability-automation/v3"`.
- `keywords` — optional array of strings describing the ability. Used by `ifKeyword` predicates and feature-modifier matching. Standard set (case-insensitive): `Melee, Ranged, Strike, Weapon, Magic, Psionic, Area, Charge, Persistent, Resistance, Routine, Free, FreeStrike, FreeTriggered`. Custom strings allowed.
- `cards` — ordered list of blocks. The runtime executes them top-to-bottom.

The `name` and `description` of the ability live on the character sheet — do **not** copy them into the JSON.

---

## Combined paste format (fields + automation)

The automation popup accepts either the bare automation shape above, or a wrapper that fills the visible ability-card fields and saves automation in one paste:

```json
{
  "fields": {
    "name": "Driving Assault",
    "actionLabel": "Main Action",
    "keywords": "Melee, Strike, Weapon",
    "range": "Melee 1",
    "target": "One creature or object",
    "cost": "1 Wrath",
    "description": "You strike the target and drive them backward.",
    "testLabel": "Power Roll + Might",
    "testRollMod": "Might",
    "tier1Damage": "3 + M",
    "tier1Notes": "push 1",
    "tier2Damage": "6 + M",
    "tier2Notes": "push 2",
    "tier3Damage": "9 + M",
    "tier3Notes": "push 4"
  },
  "automation": {
    "schema": "ability-automation/v3",
    "keywords": ["Melee", "Strike", "Weapon"],
    "cards": [
      {
        "type": "target",
        "name": "primary",
        "mode": "token",
        "predicate": "creatureOrObject",
        "count": { "value": 1, "mode": "exact" },
        "distance": { "form": "melee", "value": 1 }
      },
      {
        "type": "powerRoll",
        "attribute": "Might",
        "target": "primary",
        "tiers": {
          "tier1": { "effects": [ { "kind": "damage", "amount": 3, "attribute": "M" }, { "kind": "forcedMovement", "verb": "push", "distance": 1 } ] },
          "tier2": { "effects": [ { "kind": "damage", "amount": 6, "attribute": "M" }, { "kind": "forcedMovement", "verb": "push", "distance": 2 } ] },
          "tier3": { "effects": [ { "kind": "damage", "amount": 9, "attribute": "M" }, { "kind": "forcedMovement", "verb": "push", "distance": 4 } ] }
        }
      }
    ]
  }
}
```

### `fields.*` keys

Use only these keys in `fields`. Omit unknown or not-applicable fields.

| Key | Description | Example |
|---|---|---|
| `name` | Ability name. | `"Driving Assault"` |
| `useWhen` | Short reminder for when to use the ability. | `"Use when an enemy is adjacent."` |
| `actionLabel` | Displayed action type label. | `"Main Action"` |
| `keywords` | Comma-separated ability keywords. | `"Melee, Strike, Weapon"` |
| `range` | Range or distance line shown on the card. | `"Melee 1"` |
| `target` | Target line shown on the card. | `"One enemy"` |
| `trigger` | Trigger line for triggered actions. | `"The target takes damage."` |
| `cost` | Resource or heroic resource cost. | `"1 Wrath"` |
| `description` | Main rules/effect text. | `"You deal holy damage to the target."` |
| `testLabel` | Label for the first power test. | `"Power Roll + Might"` |
| `testRollMod` | Roll modifier for the first power test. | `"Might"` |
| `testBeforeEffect` | Effects text before the first power test. | `"Shift 1 before the strike."` |
| `testAdditionalEffect` | Effects text after the first power test. | `"You can shift 1 after the strike."` |
| `tier1Damage` | First test tier 1 damage field. | `"3 + M"` |
| `tier1DamageType` | First test tier 1 damage type. | `"holy"` |
| `tier1Notes` | First test tier 1 other info. | `"push 1"` |
| `tier1Attribute` | First test tier 1 attribute-check attribute. | `"Agility"` |
| `tier1Threshold` | First test tier 1 attribute-check threshold. | `"11"` |
| `tier1AttributeEffect` | First test tier 1 attribute-check effect. | `"prone"` |
| `tier2Damage` | First test tier 2 damage field. | `"6 + M"` |
| `tier2DamageType` | First test tier 2 damage type. | `"holy"` |
| `tier2Notes` | First test tier 2 other info. | `"push 2"` |
| `tier2Attribute` | First test tier 2 attribute-check attribute. | `"Agility"` |
| `tier2Threshold` | First test tier 2 attribute-check threshold. | `"14"` |
| `tier2AttributeEffect` | First test tier 2 attribute-check effect. | `"prone"` |
| `tier3Damage` | First test tier 3 damage field. | `"9 + M"` |
| `tier3DamageType` | First test tier 3 damage type. | `"holy"` |
| `tier3Notes` | First test tier 3 other info. | `"push 4"` |
| `tier3Attribute` | First test tier 3 attribute-check attribute. | `"Agility"` |
| `tier3Threshold` | First test tier 3 attribute-check threshold. | `"17"` |
| `tier3AttributeEffect` | First test tier 3 attribute-check effect. | `"prone and can't stand"` |

Aliases accepted by the paste UI: `title` -> `name`; `whenToUse` -> `useWhen`; `actionType`/`type` -> `actionLabel`; `tags` -> `keywords`; `distance` -> `range`; `targets` -> `target`; `effect`/`effects`/`notes`/`rulesText` -> `description`; `rollMod` -> `testRollMod`; `beforeEffect` -> `testBeforeEffect`; `additionalEffect`/`afterEffect` -> `testAdditionalEffect`; `tier1Effect`/`tier2Effect`/`tier3Effect` -> the matching tier notes.

### Prompt template for LLMs

Output exactly one JSON object with two top-level keys: `fields` and `automation`.
Use only keys from the `fields.*` table in AUTHORING.md for `fields`.
For `automation`, follow the existing REGISTRY.md schema exactly.
Never wrap the output in markdown code fences.
If a field is unknown or N/A, omit the key; do not write `null` or `""`.
Preserve the ability's rules text in `fields.description` when useful, but put only automatable behavior in `automation`.
Here is the ability text:

[PASTE ABILITY RULES TEXT HERE]

### Backward compatibility

Bare automation JSON still works. If the pasted object does not have both top-level keys `fields` and `automation`, the paste UI treats the whole object as the automation JSON.

---

## Block types

### `target`

Asks the player to pick a token (or place an area template) on the VTT board.

```json
{
  "type": "target",
  "name": "primary",
  "mode": "token",
  "predicate": "enemy",
  "count": { "value": 1, "mode": "exact" },
  "optional": false,
  "distance": { "form": "melee", "value": 1 }
}
```

| Field | Values | Notes |
|---|---|---|
| `name` | string | Optional. Used by later blocks to reference this group (e.g. `"target": "primary"`). Defaults to `"primary"`. |
| `mode` | `"token"` \| `"area"` | Required. Token = pick tokens. Area = place template. |
| `predicate` | `"creature"`, `"enemy"`, `"ally"`, `"object"`, `"creatureOrObject"`, `"self"`, `"selfOrAlly"`, `"selfAndAlly"` | Who's a legal target. |
| `count` | `{ value, mode }` | `mode`: `"exact"` (must pick all) or `"upTo"` (player can stop early). Token mode only. |
| `optional` | bool | If true, runtime shows a "Skip" button. The automation continues with an empty target group. |
| `distance` | `{ form, value, secondary?, within? }` | See distance forms below. |

For self-only resolution effects after a trigger, an `effect` card can use `"target": "self"` directly. The runner resolves that to the source token; do not add a separate target card that asks the player to pick themselves unless the ability genuinely needs a manual pick.

For `mode: "area"` add:

| Field | Values |
|---|---|
| `shape` | `"cube"` \| `"rectangle"` \| `"burst"` \| `"aura"` \| `"line"` \| `"wall"` |
| `size` | int — primary dimension in squares |
| `width`, `height` | ints — for `rectangle` |
| `length` | int — for `line`, `wall` |

**Distance forms:**

| `form` | Use for | Example |
|---|---|---|
| `"self"` | Caster only | `{ "form": "self" }` |
| `"melee"` | Reach in squares | `{ "form": "melee", "value": 1 }` |
| `"ranged"` | Distance in squares | `{ "form": "ranged", "value": 5 }` |
| `"meleeOrRanged"` | Either | `{ "form": "meleeOrRanged", "value": 1, "secondary": 5 }` |
| `"burst"` | Self-radius | `{ "form": "burst", "value": 3 }` |
| `"aura"` | Self-aura | `{ "form": "aura", "value": 3 }` |
| `"cube"` | Cube placed within range | `{ "form": "cube", "value": 2, "within": 5 }` |
| `"line"` | Line | `{ "form": "line", "value": 10, "secondary": 2, "within": 5 }` |
| `"wall"` | Wall | `{ "form": "wall", "value": 4, "within": 10 }` |

### `powerRoll`

Rolls 2d10 + attribute, picks a tier, applies that tier's effects to the target group.

```json
{
  "type": "powerRoll",
  "attribute": "Might",
  "bonus": 0,
  "target": "primary",
  "tiers": {
    "tier1": { "effects": [ { "kind": "damage", "amount": 3, "attribute": "M" }, { "kind": "forcedMovement", "verb": "push", "distance": 1 } ] },
    "tier2": { "effects": [ { "kind": "damage", "amount": 6, "attribute": "M" }, { "kind": "forcedMovement", "verb": "push", "distance": 2 } ] },
    "tier3": { "effects": [ { "kind": "damage", "amount": 9, "attribute": "M" }, { "kind": "forcedMovement", "verb": "push", "distance": 4 } ] }
  }
}
```

| Field | Values |
|---|---|
| `attribute` | `"Might"`, `"Agility"`, `"Reason"`, `"Intuition"`, `"Presence"`, or `"Strongest"` (highest of all 5). Also accepts an array like `["M", "A"]` meaning "highest of these specific attributes" — used for free strikes (highest of M or A only). |
| `bonus` | int (added to the roll). |
| `flatBonus` | int — **monster-friendly literal roll bonus**. When set, the runner uses this *instead of* resolving `attribute` via the actor's stats. PC authoring should leave this unset; monster authoring should set this and treat `attribute` as informational. Example: `"flatBonus": 6`. |
| `target` | string — name of a target block. Defaults to most recent target group. |
| `tiers.tier1` / `tier2` / `tier3` | each `{ effects: [...] }`. Tier1 = `≤11`, tier2 = `12-16`, tier3 = `17+`. |
| `whenWinded` | optional sub-object with override values applied when the actor is winded (HP ≤ floor(maxHP/2)). Supported keys: `bonus`, `flatBonus`, `attribute`, `target`, `tiers`. Shallow-merged over the base block. Universal — both PCs and monsters can use it. |

Each `effects[]` entry is an [Effect](#effects) — `damage`, `condition`, `forcedMovement`, `potency`, etc.

**Winded example** (monster gains an edge while winded — modeled as +2 flat bonus):

```json
{
  "type": "powerRoll",
  "flatBonus": 4,
  "attribute": "Might",
  "tiers": { "tier1": { "effects": [{ "kind": "damage", "amount": 3 }] } },
  "whenWinded": { "flatBonus": 6 }
}
```

### `effect`

A non-roll effect block. Apply to target group.

```json
{
  "type": "effect",
  "target": "primary",
  "effects": [ { "kind": "heal", "recoveries": 1 } ]
}
```

Place these before or after the power roll for "effects that apply regardless of tier" (book "Effect:" line).

Supports an optional `whenWinded` sub-object (same as `powerRoll`). On `effect` blocks, allowed override keys are `effects` and `target`. The override `effects` array fully replaces the base when actor is winded.

### `trigger`

A reactive ability listener. Carries a free-text `condition` label plus an optional structured `match` config.

For PC triggered actions, this is **always-on** once the character token is present in the active VTT scene. The player should not click the ability to start listening, and opening the character summary is not required. The VTT auto-registers structured trigger blocks from abilities in the character sheet's Triggers list. When the matching event later fires, the caster's token lights up with the blue `!` overlay and the player resolves the ability manually (same flow as built-in opportunity attacks). Without `match`, the trigger cannot be passively detected and falls back to a chat reminder when clicked.

```json
{
  "type": "trigger",
  "condition": "The target takes damage.",
  "match": {
    "event": "damage",
    "filter": { "whose": "target", "minAmount": 1 }
  },
  "effects": [ { "kind": "damage", "amount": 3, "damageType": "psychic" } ]
}
```

**Recognized events** (use the lowercase name in `match.event`):

| event | When it fires | Useful filter fields |
|---|---|---|
| `damage` | A token takes damage from an automated ability | `whose`, `minAmount`, `damageType` (single or array) |
| `staminaChange` | A token's stamina changed via automation (damage or heal) | `whose`, `direction` (`down`/`up`/`either`) |
| `turnStart` | A token becomes the active combatant | `whose` |
| `turnEnd` | The active combatant's turn ends | `whose` |
| `move` | A token moves via normal player movement | `whose`, `leavesAdjacency`, `entersAdjacency` |
| `damageDealt` | Automated damage dealt by the caster | same as `damage`; predicates resolve `whose` from `sourceId` |
| `staminaZero` | Automated damage drops a token from above 0 stamina to 0 or lower | same as `staminaChange` |
| `actionUsed` | A normal ability automation starts | `whose`, `actionKind`, `keywordsAny` |
| `markApplied` | Automation applies/transfers a mark | `whose`, `markType`, `source` |

**`whose` values** — resolved relative to the **caster** (the character who has the triggered ability) and the target group named by the trigger's `target` field (or the most recent target group if `target` is omitted):

| whose | Matches |
|---|---|
| `self` | The caster's own placement |
| `target` | A placement in the named target group |
| `judgedTarget` | The caster's current `judgment` target |
| `markSource` | A token marked by the caster |
| `ally` | Same combat team as the caster |
| `enemy` | Opposing combat team |
| `any` *(default)* | No filter |

Triggers stay registered until the encounter ends, the caster leaves the scene, or the round-tick stale-out (two phase boundaries) clears them.

Triggered abilities use an always-listening/resolve flow when the first card is a structured `trigger` with `match`:

1. In the VTT, structured trigger actions in the character's Triggers list are registered automatically for PC tokens in the active scene. Do not write rules text that asks the player to "arm", "activate", "set", or "start watching" normal triggered actions.
2. When the matching event later fires, the caster's token lights up with the blue `!` overlay. Clicking the ready trigger resolves the same automation with the captured event payload; the runner skips the `trigger` card and continues through the later cards.

Put trigger-resolution effects such as `halveTriggeringDamage`, teleport, optional `spend` riders, and reminders in an `effect` card after the `trigger` card. Do not rely on `trigger.effects` for effects that should run when the player clicks the ready trigger; the trigger card describes the passive listener.

Clicking a structured trigger ability directly with no captured trigger payload registers only the trigger listener and then stops. Treat this as a fallback/debug path, not the default gameplay flow.

Triggered abilities do not auto-resolve. The player or GM clicks the ready trigger and resolves the ability manually with the captured event payload.

Resolving a non-free triggered action consumes the character's triggered action for the round (`triggeredActionReady = false`), which prevents other non-free triggered actions from becoming ready until the next round reset. Free triggered actions do not consume that round-limited trigger.

### `persistent`

A zone that lingers across rounds, ticks at the owner's turn boundary, and applies effects to creatures inside it. Requires a **preceding area `target` block** so the zone has a footprint — without it, falls back to a chat-only reminder.

```json
{
  "type": "persistent",
  "cost": 1,
  "resource": "Wrath",
  "tickAt": "startOfTurn",
  "effects": [ { "kind": "damage", "amount": 3, "damageType": "fire" } ]
}
```

| Field | Values |
|---|---|
| `cost` | int — heroic resource spent per tick. 0 = no upkeep. |
| `resource` | string — the resource name (must match the caster's bar title, e.g. "Wrath"). Empty = use caster's resource without name check. |
| `tickAt` | `"startOfTurn"` \| `"endOfTurn"` \| `"never"` — which boundary of the OWNER's turn hits everyone currently inside. Use `"never"` for "no owner tick — only the per-creature `triggers` fire." |
| `triggers` | array — extra per-creature triggers. See below. |
| `effects` | array — tick / trigger effects. `damage` and `condition` are auto-applied; other kinds skipped. |
| `target` | optional string — name of an earlier target block to reuse as the zone footprint. Default = most recent area placed. |

**`triggers` values** (combine freely with each other AND `tickAt`):

| value | When it fires | Targets |
|---|---|---|
| `"onEnter"` | A creature enters the zone footprint via normal movement, the first time per combat round. | Just the mover. |
| `"onOccupantTurnStart"` | A creature inside the zone starts their own turn. | Just that creature. |

**Behavior**:
- At the owner's `tickAt`, the runtime deducts `cost` from the owner's resource (or auto-ends the zone if unaffordable), then applies tick effects to every creature inside the zone footprint.
- `onEnter` deduplicates per round — round-start clears the "already entered" set. Creatures already standing in the zone when it's cast are pre-seeded as "already entered" so they don't take entry damage from the cast itself.
- `onOccupantTurnStart` fires once at each occupant's own turn start.
- Zone is visible on the board as a pulsing orange dashed outline with an "End" button.
- Auto-ends on encounter end.
- **In-memory only this pass** — a page reload while combat is active will wipe zones. Cast again to re-arm.

**Example — Incinerate's column of fire** ("Each enemy who enters the area for the first time in a combat round or starts their turn there takes 2 fire damage"):

```json
{
  "type": "persistent",
  "cost": 0,
  "tickAt": "never",
  "triggers": ["onEnter", "onOccupantTurnStart"],
  "effects": [ { "kind": "damage", "amount": 2, "damageType": "fire" } ]
}
```

---

## Effects

Each effect is one of the kinds below. They're used inside `powerRoll.tiers.tierN.effects`, `effect.effects`, `trigger.effects`, `persistent.effects`, and as the `onFail` of a `potency` rider or the `effects` of a `spend` rider.

### `damage`

```json
{ "kind": "damage", "amount": 5, "attribute": "M", "damageType": "fire" }
{ "kind": "damage", "amount": 0, "amountDice": "1d6", "damageType": "fire" }
```

| Field | Values |
|---|---|
| `amount` | int (flat amount) |
| `amountDice` | optional dice string like `"1d6"` or `"2d8"`. Added to `amount` at runtime. |
| `attribute` | optional. Single string `"M"`/`"A"`/`"R"`/`"I"`/`"P"`/`"Strongest"`, OR an array like `["M", "A"]` meaning "highest of these specific attributes" (used for free strikes — highest of Might or Agility only) |
| `damageType` | `"untyped"`, `"acid"`, `"cold"`, `"corruption"`, `"fire"`, `"holy"`, `"lightning"`, `"poison"`, `"psychic"`, `"sonic"` |
| `markBonusDice` | optional dice string like `"1d6"`. Rolls and adds only when `markPredicate` matches. |
| `markPredicate` | optional mark predicate for `markBonusDice`. Defaults to `"targetJudgedBySelf"`. |

`"Strongest"` means highest of all 5 characteristics. Use an array like `["M", "A"]` when the rule is "highest of these specific attributes only" — most often this is the free-strike rule (highest of M or A but never R/I/P).

### `heal`

```json
{ "kind": "heal", "recoveries": 1 }
{ "kind": "heal", "amount": 5 }
```

`recoveries` spends N of the target's recoveries to heal `N × recoveryValue`. `amount` is a flat number; both can combine. The runtime reads the target's `hero.vitals.recoveryValue` from their character sheet; if unknown, it posts a chat reminder so the GM can apply manually. **The target's `currentRecoveries` is NOT auto-decremented yet — the chat output reminds the player to update their sheet.**

### `temporaryStamina`

```json
{ "kind": "temporaryStamina", "amount": 5 }
```

Applies via the same heal path but allows the new total to exceed max stamina (the overage displays as "temp").

### `condition`

```json
{ "kind": "condition", "name": "slowed", "duration": "saveEnds" }
{ "kind": "condition", "name": "other", "duration": "endOfTurn", "text": "can't draw cards" }
```

| Field | Values |
|---|---|
| `name` | `"bleeding"`, `"dazed"`, `"dying"`, `"frightened"`, `"grabbed"`, `"prone"`, `"restrained"`, `"slowed"`, `"taunted"`, `"weakened"`, `"damageWeakness"`, `"damageImmunity"`, `"other"` |
| `text` | required when `name === "other"` — describes the homebrew condition |
| `duration` | `"instantaneous"`, `"endOfTurn"`, `"saveEnds"`, `"endOfEncounter"`, `"untilDying"` |
| `amount` | int — required for `"damageWeakness"` / `"damageImmunity"`. How much extra damage is taken (weakness) / soaked (immunity). |
| `damageType` | string — optional for `"damageWeakness"` / `"damageImmunity"`. Restricts to one type. Omit / `"untyped"` = applies to all types. |

`damageWeakness` and `damageImmunity` are numeric riders. The VTT damage handler stacks `amount` on top of the sheet's own immunity/vulnerability lists when applying damage to the affected target. Example: `{ "kind": "condition", "name": "damageWeakness", "amount": 5, "damageType": "fire", "duration": "saveEnds" }` makes the target take +5 damage from every fire effect until they save out.

### `forcedMovement`

```json
{ "kind": "forcedMovement", "verb": "push", "distance": 3 }
{ "kind": "forcedMovement", "verb": "slide", "distance": 5, "upTo": true }
```

| Field | Values |
|---|---|
| `verb` | `"push"`, `"pull"`, `"slide"`, `"verticalPush"`, `"verticalPull"`, `"verticalSlide"` |
| `distance` | int squares |
| `upTo` | bool — `true` if the player can move 0..N |

### `teleport`

```json
{ "kind": "teleport", "distance": 5 }
```

Opens a destination picker showing every cell within `distance` (Chebyshev). Click an empty cell to land there. No stability reduction, no size penalty. Clicking an occupied cell will route through the slide-style collision path (technically wrong for teleport — pick an empty cell).

Optional heroic-resource spend can increase the picker distance before the picker opens:

```json
{
  "kind": "teleport",
  "distance": 4,
  "spend": {
    "resource": "Insight",
    "amount": 1,
    "maxAmount": "available",
    "perAmount": 1,
    "prompt": "Spend Insight to teleport 1 additional square per Insight spent?"
  }
}
```

### `swap`

```json
{ "kind": "swap" }
```

Caster and target atomically transpose their (column, row). Best-effort footprint check.

### `resourceGain`

```json
{ "kind": "resourceGain", "resource": "wrath", "amount": 1 }
```

Modifies the caster's heroic resource. Negative `amount` = loss. If the named `resource` doesn't match the caster's resource bar title, posts a chat reminder for manual adjust. Floors at 0.

### `surgeGain`

```json
{ "kind": "surgeGain", "amount": 1 }
```

Adds or removes surges from each target's character sheet. Surges are separate from heroic resources such as Insight, Wrath, Focus, Drama, or Clarity. Negative `amount` removes surges and floors at 0.

### `freeStrike`

```json
{ "kind": "freeStrike", "against": "ally", "text": "the target makes a free strike against an ally" }
```

The "by" entity (who's striking) defaults to the **most recent target group** — i.e. the parent ability's target, which is the typical pattern: "the target makes a free strike against ...". The runtime reads the by-entity's M and A from their sheet (falls back to 0 if no sheet), rolls 2d10 + highest, opens a target picker for the "against" creature with the by-entity as the new source, then applies tier damage (`2/5/7 + max(M, A)`) through the normal damage path. The dice math and tier outcome are posted to chat.

### `cascade`

```json
{ "kind": "cascade", "ability": "Strike", "by": "ally", "text": "an ally within 10 squares uses a strike as a free triggered action" }
```

Cascade = "another ability fires off this one". Chat-reminder this pass.

### `note`

```json
{ "kind": "note", "text": "remember to mark the target judged" }
```

Posts the text to chat as a reminder. Use sparingly.

### `potency` (rider)

Wraps a list of effects gated by a potency check on the target.

```json
{
  "kind": "potency",
  "attribute": "M",
  "level": "weak",
  "onFail": [
    { "kind": "condition", "name": "prone", "duration": "instantaneous" }
  ]
}
```

| Field | Values |
|---|---|
| `attribute` | `"M"`, `"A"`, `"R"`, `"I"`, `"P"` (the target's attribute compared against caster's potency threshold) |
| `level` | `"weak"`, `"average"`, `"strong"` (book reads `M<w`, `M<v`, `M<s`) |
| `onFail` | list of effects that fire when the target's attribute is below the threshold |

The runtime resolves `level` to a number using the caster's character data at run time.

### `spend` (rider)

Optional resource spend that, if accepted by the user, triggers extra effects.

```json
{
  "kind": "spend",
  "resource": "Wrath",
  "amount": 1,
  "timing": "postResult",
  "effects": [
    { "kind": "condition", "name": "dying", "duration": "instantaneous" }
  ]
}
```

| Field | Values |
|---|---|
| `resource` | string — the heroic resource name |
| `amount` | int — cost |
| `timing` | `"preRoll"` (must be decided before the roll) or `"postResult"` (after the tier is known) |
| `effects` | list of effects to apply on accept |

Runtime prompts the user contextually: "Spend N <resource> for: <effects>?".

For PC abilities, nested `spend` checks the caster's current heroic resource. If the resource doesn't match or the caster has fewer than `amount`, the prompt is skipped and nested effects do not run. `maxAmount` can be a number or `"available"` to let the player choose how much to spend. In the VTT, these prompts use a draggable in-app modal; variable spends show stepper buttons and should be preferred for "spend 1+" riders.

### `ifKeyword` (rider)

Branches based on the ability's `keywords`. Effects in `then` run when the predicate matches; effects in `else` run when it doesn't. Either branch can be empty.

```json
{
  "kind": "ifKeyword",
  "all": ["Strike"],
  "any": ["Melee", "Ranged"],
  "none": ["Magic"],
  "then": [ { "kind": "damage", "amount": 1 } ],
  "else": []
}
```

| Field | Values |
|---|---|
| `all` | array of keywords — predicate requires ALL of these on the ability |
| `any` | array of keywords — predicate requires AT LEAST ONE of these |
| `none` | array of keywords — predicate requires NONE of these |
| `then` | effects to apply when predicate matches |
| `else` | effects to apply when predicate fails |

Predicate matching reads the ability's `keywords` field (or `tags` as a legacy fallback). All comparisons are case-insensitive.

### `ifStrained` (rider)

Branches based on whether the caster is currently strained — defined as the caster's heroic resource value being below 0. The Talent class is the primary user (Clarity below 0 = strained), but anything that lets a resource go negative will trip this.

```json
{
  "kind": "ifStrained",
  "then": [ { "kind": "damage", "amount": 2, "damageType": "psychic" } ],
  "else": []
}
```

| Field | Values |
|---|---|
| `then` | effects applied when the caster is strained (resource < 0) |
| `else` | effects applied when the caster is NOT strained |

Both branches optional; an empty branch silently does nothing. Use this for Talent abilities with "Strained:" riders — drop the rider into `then` and the runtime auto-applies it when applicable.

### `ifMark` (rider)

Branches based on whether a target is marked/judged.

```json
{
  "kind": "ifMark",
  "predicate": "targetJudgedBySelf",
  "markType": "judgment",
  "target": "primary",
  "then": [ { "kind": "damage", "amount": 2 } ],
  "else": []
}
```

| Field | Values |
|---|---|
| `predicate` | `"targetJudgedBySelf"`, `"targetJudgedByAny"`, `"actorIsMyJudgedTarget"`, `"sourceIsJudgingTarget"`, `"targetInPersistentZoneJudgedByZoneCaster"` |
| `markType` | string. Defaults to `"judgment"`. |
| `target` | optional target-group name. Defaults to the current target group. |
| `then` | effects applied when the predicate matches |
| `else` | effects applied when it does not match |

### `applyMark`

Applies or transfers a source-owned mark to the target. The main implemented mark type is `judgment`.

```json
{ "kind": "applyMark", "markType": "judgment", "target": "primary" }
```

| Field | Values |
|---|---|
| `markType` | string. Defaults to `"judgment"`. |
| `target` | optional target-group name. Defaults to the current target group. |
| `duration` | currently `"endOfEncounter"` |
| `exclusivePerSource` | bool. Default `true`; the source can have only one mark of this type. |
| `exclusivePerTarget` | bool. Default `true`; a new source replaces an old source on the same target. |
| `transfer` | bool. Default `true`; recasting moves the source's mark. |

### `endMark`

Ends the caster's current mark or a mark on a named target group.

```json
{ "kind": "endMark", "markType": "judgment", "scope": "selfOwned" }
{ "kind": "endMark", "markType": "judgment", "scope": "target", "target": "primary" }
```

| Field | Values |
|---|---|
| `markType` | string. Defaults to `"judgment"`. |
| `scope` | `"selfOwned"` clears the caster's mark; `"target"` clears a mark from `target`. |
| `target` | optional target-group name, used with `scope: "target"`. |

### `ifScopedFlag` and `setScopedFlag` (riders)

Use these together for "first time this round/turn/encounter" rules. A scoped flag is keyed by source, target, scope, and a custom `key`.

```json
{
  "kind": "ifScopedFlag",
  "scope": "round",
  "key": "first-fire-hit",
  "source": "self",
  "target": "target",
  "mode": "notSet",
  "then": [
    { "kind": "damage", "amount": 2, "damageType": "fire" },
    { "kind": "setScopedFlag", "scope": "round", "key": "first-fire-hit" }
  ],
  "else": []
}
```

| Field | Values |
|---|---|
| `scope` | `"round"`, `"turn"`, or `"encounter"` |
| `key` | string; choose a stable unique key for the ability/rider |
| `source` | `"self"` or `"eventSource"` |
| `target` | `"target"`, `"judgedTarget"`, or `"eventTarget"` |
| `mode` | `"notSet"` (default) or `"set"` for `ifScopedFlag` |
| `then` / `else` | branches for `ifScopedFlag` |

Round flags reset at new round. Turn flags are tied to the active combatant. Encounter flags clear at encounter end.

### `halveTriggeringDamage` (rider - trigger blocks only)

Soaks half of the damage that fired the trigger. The board has already applied the full damage by the time the trigger resolves; this effect heals back the difference so the net damage on the placement equals the rounded half.

```json
{ "kind": "halveTriggeringDamage", "rounding": "up" }
```

| Field | Values |
|---|---|
| `rounding` | `"up"` (default — player takes the larger half, e.g. 7 of 13) or `"down"` (player takes the smaller half, e.g. 6 of 13) |

Requires a `trigger` block with `match.event: "damage"` so the runtime can read the original damage payload. Without that match, the effect posts a chat reminder instead of healing.

Use this for "you take half damage instead" triggered actions like Resist the Unnatural, Unearthly Reflexes, and Feedback Loop (when paired with a re-damage effect targeting the source).

### `other`

```json
{ "kind": "other", "text": "the target is forced to use an ability of your choice" }
```

Use **only** when nothing else fits. Runtime prints the text to chat as a reminder. The GM applies it manually.

---

## Worked examples

### 1. Brutal Slam (single-target strike with damage + push, scaling)

> Power Roll + Might:
> ◆ 3 + M damage; push 1   ◆ 6 + M damage; push 2   ◆ 9 + M damage; push 4

```json
{
  "schema": "ability-automation/v3",
  "cards": [
    { "type": "target", "mode": "token", "predicate": "creatureOrObject", "count": { "value": 1, "mode": "exact" }, "distance": { "form": "melee", "value": 1 } },
    {
      "type": "powerRoll",
      "attribute": "Might",
      "tiers": {
        "tier1": { "effects": [ { "kind": "damage", "amount": 3, "attribute": "M" }, { "kind": "forcedMovement", "verb": "push", "distance": 1 } ] },
        "tier2": { "effects": [ { "kind": "damage", "amount": 6, "attribute": "M" }, { "kind": "forcedMovement", "verb": "push", "distance": 2 } ] },
        "tier3": { "effects": [ { "kind": "damage", "amount": 9, "attribute": "M" }, { "kind": "forcedMovement", "verb": "push", "distance": 4 } ] }
      }
    }
  ]
}
```

### 2. Holy Mace (damage + potency-gated condition)

> Power Roll + Intuition:
> ◆ 3 + I holy damage; a<w, prone   ◆ 6 + I holy damage; a<v, prone   ◆ 9 + I holy damage; a<s, prone and can't stand (save ends)

```json
{
  "schema": "ability-automation/v3",
  "cards": [
    { "type": "target", "mode": "token", "predicate": "enemy", "count": { "value": 1, "mode": "exact" }, "distance": { "form": "melee", "value": 1 } },
    {
      "type": "powerRoll",
      "attribute": "Intuition",
      "tiers": {
        "tier1": { "effects": [
          { "kind": "damage", "amount": 3, "attribute": "I", "damageType": "holy" },
          { "kind": "potency", "attribute": "A", "level": "weak", "onFail": [ { "kind": "condition", "name": "prone" } ] }
        ] },
        "tier2": { "effects": [
          { "kind": "damage", "amount": 6, "attribute": "I", "damageType": "holy" },
          { "kind": "potency", "attribute": "A", "level": "average", "onFail": [ { "kind": "condition", "name": "prone" } ] }
        ] },
        "tier3": { "effects": [
          { "kind": "damage", "amount": 9, "attribute": "I", "damageType": "holy" },
          { "kind": "potency", "attribute": "A", "level": "strong", "onFail": [ { "kind": "condition", "name": "prone", "duration": "saveEnds", "text": "and can't stand" } ] }
        ] }
      }
    }
  ]
}
```

### 3. Wellspring of Grace (no-roll, area, ally heal)

> Effect: You spend a Recovery and each ally in the area regains Stamina equal to your recovery value.

```json
{
  "schema": "ability-automation/v3",
  "cards": [
    { "type": "target", "name": "allies", "mode": "area", "shape": "burst", "size": 3, "predicate": "ally" },
    { "type": "effect", "target": "allies", "effects": [ { "kind": "heal", "recoveries": 1 } ] }
  ]
}
```

### 4. Out of the Way! (slide multiple targets)

> Power Roll + Agility:
> ◆ 4 + A damage; slide 2   ◆ 5 + A damage; slide 3   ◆ 6 + A damage; slide 5

```json
{
  "schema": "ability-automation/v3",
  "cards": [
    { "type": "target", "mode": "token", "predicate": "creature", "count": { "value": 3, "mode": "upTo" }, "distance": { "form": "ranged", "value": 5 } },
    {
      "type": "powerRoll",
      "attribute": "Agility",
      "tiers": {
        "tier1": { "effects": [ { "kind": "damage", "amount": 4, "attribute": "A" }, { "kind": "forcedMovement", "verb": "slide", "distance": 2 } ] },
        "tier2": { "effects": [ { "kind": "damage", "amount": 5, "attribute": "A" }, { "kind": "forcedMovement", "verb": "slide", "distance": 3 } ] },
        "tier3": { "effects": [ { "kind": "damage", "amount": 6, "attribute": "A" }, { "kind": "forcedMovement", "verb": "slide", "distance": 5 } ] }
      }
    }
  ]
}
```

### 5. Driving Assault (powerRoll + spend rider for extra effect)

> Spend 1 Wrath: You can end one effect on the target ended by a saving throw or end of turn.

```json
{
  "schema": "ability-automation/v3",
  "cards": [
    { "type": "target", "mode": "token", "predicate": "enemy", "count": { "value": 1, "mode": "exact" }, "distance": { "form": "melee", "value": 1 } },
    {
      "type": "powerRoll",
      "attribute": "Might",
      "tiers": {
        "tier1": { "effects": [ { "kind": "damage", "amount": 3, "attribute": "M" } ] },
        "tier2": { "effects": [ { "kind": "damage", "amount": 6, "attribute": "M" } ] },
        "tier3": { "effects": [ { "kind": "damage", "amount": 9, "attribute": "M" } ] }
      }
    },
    {
      "type": "effect",
      "effects": [
        {
          "kind": "spend",
          "resource": "Wrath",
          "amount": 1,
          "timing": "postResult",
          "effects": [ { "kind": "note", "text": "End one effect ended by a saving throw or end of turn." } ]
        }
      ]
    }
  ]
}
```

### 6. Wall of Fire (persistent zone)

> Effect: You create a wall. Each enemy who enters the area or starts their turn there takes fire damage equal to your Reason score.
> Persistent 1: The wall lasts until the start of your next turn.

```json
{
  "schema": "ability-automation/v3",
  "cards": [
    { "type": "target", "name": "wall", "mode": "area", "shape": "wall", "length": 10, "distance": { "form": "wall", "value": 10, "within": 10 }, "predicate": "creatureOrObject" },
    {
      "type": "persistent",
      "cost": 1,
      "resource": "Essence",
      "tickAt": "startOfTurn",
      "effects": [ { "kind": "damage", "amount": 0, "attribute": "R", "damageType": "fire" } ]
    },
    { "type": "effect", "effects": [ { "kind": "note", "text": "Wall persists. Each enemy entering or starting their turn there takes Reason fire damage." } ] }
  ]
}
```

### 7. My Life for Yours (triggered ability)

> Trigger: The target takes damage.
> Effect: You take the damage instead.

```json
{
  "schema": "ability-automation/v3",
  "cards": [
    { "type": "target", "name": "protectee", "mode": "token", "predicate": "ally", "count": { "value": 1, "mode": "exact" } },
    {
      "type": "trigger",
      "target": "protectee",
      "condition": "The target takes damage.",
      "match": { "event": "damage", "filter": { "whose": "target", "minAmount": 1 } },
      "effects": [ { "kind": "note", "text": "Caster takes the damage instead of the target." } ]
    }
  ]
}
```

### 7b. End-of-turn auto-reminder (timing trigger)

> Effect: At the end of your next turn, lose 1d6 fire damage.

```json
{
  "schema": "ability-automation/v3",
  "cards": [
    { "type": "target", "mode": "token", "predicate": "enemy", "count": { "value": 1, "mode": "exact" } },
    {
      "type": "trigger",
      "condition": "At the end of the target's next turn.",
      "match": { "event": "turnEnd", "filter": { "whose": "target" } },
      "effects": [ { "kind": "note", "text": "Roll 1d6 fire damage on the marked target." } ]
    }
  ]
}
```

### 7c. Opportunity-attack-style authored trigger (move filter)

> Trigger: An adjacent enemy leaves your reach.

```json
{
  "schema": "ability-automation/v3",
  "cards": [
    {
      "type": "trigger",
      "condition": "An adjacent enemy leaves your reach.",
      "match": { "event": "move", "filter": { "whose": "enemy", "leavesAdjacency": true } },
      "effects": [ { "kind": "freeStrike", "against": "enemy", "text": "Take a melee free strike against the mover." } ]
    }
  ]
}
```

### 8. Wellspring + flat condition (homebrew "other")

```json
{
  "schema": "ability-automation/v3",
  "cards": [
    { "type": "target", "mode": "token", "predicate": "enemy", "count": { "value": 1, "mode": "exact" } },
    {
      "type": "effect",
      "effects": [
        { "kind": "condition", "name": "other", "duration": "endOfTurn", "text": "ink-marked: cannot use signature abilities" }
      ]
    }
  ]
}
```

---

## Authoring rules of thumb

1. **One target block per pool.** If the ability hits "the primary target and each ally in the area", make two target blocks with distinct `name`s and reference them from later effects via `target: "..."`.

2. **Tier text uses semicolons in the book** — every chunk separated by `;` becomes a separate effect inside the tier's `effects` array.

3. **Damage `+ M`** in the book means `attribute: "M"` (single letter) — not `Might`. The runtime resolves the bonus.

4. **Potency lowercase `<w>`, `<v>`, `<s>`** map to `level: "weak" | "average" | "strong"`.

5. **Save-ends `(save ends)`** → `duration: "saveEnds"`. **End-of-turn `(EoT)`** → `duration: "endOfTurn"`. No suffix → `duration: "instantaneous"`.

6. **Tier-1 with no rider** is fine — many abilities only apply riders at tier 2+. Just put `{ "effects": [ damage-only ] }` in tier1.

7. **The book's flat `Effect:` line** = a separate `{ "type": "effect" }` block. Place it before the power roll if it's a precondition, after if it's a consequence.

8. **Don't invent kinds.** If the book says something the registry doesn't support, use `{ "kind": "other", "text": "…" }` or `{ "kind": "note", "text": "…" }` so the GM applies it manually.

9. **Don't include the ability name or description** — those live on the character sheet.

10. **`schema` field is required** — set it to `"ability-automation/v3"`.

---

## Feature modifiers

Some character traits and kits change how abilities work without being abilities themselves — e.g. "+1 damage on weapon strikes," "+1 range on ranged attacks," "all your damage is fire instead." That's what **feature modifiers** are for.

Feature JSON lives on a feature (paste it via the Automate button on the feature card, edit mode). The shape is:

```json
{
  "schema": "ability-automation/v3",
  "modifiers": [
    {
      "label": "Sword Mastery",
      "match": { "keywordsAll": ["Strike", "Weapon"] },
      "apply": { "damageBonus": 1 }
    }
  ]
}
```

A feature can carry multiple modifier rules. Each has two parts:

### Match (when does this rule apply?)

| Field | Meaning |
|---|---|
| `keywordsAll` | Ability must have **every** keyword in this list |
| `keywordsAny` | Ability must have **at least one** keyword in this list |
| `keywordsNone` | Ability must have **none** of these keywords |
| `damageType` | At least one damage effect in the ability uses this type |
| `attribute` | The ability's power roll uses this attribute (`Might`, `Agility`, etc.) |

An empty match (`{}`) matches every ability.

### Apply (what does this rule do?)

| Field | Effect |
|---|---|
| `damageBonus` | int — added to every `damage.amount` in the ability |
| `rangeBonus` | int — added to every target block's `distance.value` |
| `forcedMovementBonus` | int — added to every `forcedMovement.distance` |
| `damageType` | string — overrides the damage type on every damage effect |
| `note` | string — free-text reminder shown in the inspector |

### How it runs

When you click an ability:

1. Before the dice modal renders, the runtime walks your features.
2. For each modifier that matches THIS ability, the bonuses are folded into an **in-memory copy** of the ability's automation.
3. The tier preview, power-roll modal, and chat output all show the **post-modifier** numbers.
4. The saved JSON on the ability never changes — swap the kit and the modifier stops applying.

A chat message names which modifiers kicked in so the table can see "Sword Mastery applied" etc.

### Worked examples

**Sword Mastery kit — +1 damage on weapon strikes:**

```json
{
  "schema": "ability-automation/v3",
  "modifiers": [
    {
      "label": "Sword Mastery",
      "match": { "keywordsAll": ["Strike", "Weapon"] },
      "apply": { "damageBonus": 1 }
    }
  ]
}
```

**Sniper kit — +1 range on all ranged attacks:**

```json
{
  "schema": "ability-automation/v3",
  "modifiers": [
    {
      "label": "Sniper",
      "match": { "keywordsAny": ["Ranged"] },
      "apply": { "rangeBonus": 1 }
    }
  ]
}
```

**Brutal kit — +1 push/pull/slide distance on all forced movement:**

```json
{
  "schema": "ability-automation/v3",
  "modifiers": [
    {
      "label": "Brutal",
      "match": {},
      "apply": { "forcedMovementBonus": 1 }
    }
  ]
}
```

**Elemental Affinity (fire) — all your weapon damage becomes fire:**

```json
{
  "schema": "ability-automation/v3",
  "modifiers": [
    {
      "label": "Fire Affinity",
      "match": { "keywordsAll": ["Weapon"] },
      "apply": { "damageType": "fire" }
    }
  ]
}
```

**Combined feature with multiple rules:**

```json
{
  "schema": "ability-automation/v3",
  "modifiers": [
    {
      "label": "Marksman — Range",
      "match": { "keywordsAll": ["Ranged"] },
      "apply": { "rangeBonus": 2 }
    },
    {
      "label": "Marksman — Damage on Strikes",
      "match": { "keywordsAll": ["Ranged", "Strike"] },
      "apply": { "damageBonus": 1 }
    }
  ]
}
```

### Authoring rules of thumb for modifiers

1. **Match generously, apply minimally.** A `match: {}` is fine for "applies to all my abilities" features. Don't over-narrow if you don't have to.
2. **No nested effects yet.** `apply` is a set of bonus fields, not a list of effects. To insert a new effect (e.g. "after damage, also apply slowed"), that's a phase-2 feature — flag in your notes as a TODO.
3. **Stacking is additive.** If two of your features both add `+1 damage`, the ability gets `+2`. No cap right now.
4. **No "once per combat" tracking.** All modifier rules are always-on while the feature exists. Per-encounter / spend-based modifiers are phase-2.
5. **Ally features don't apply to your abilities.** Only the running character's own features are checked. Aura/buff effects from allies are phase-2.

### What modifier fields DO NOT exist (don't invent)

- `actionTypeRequired` (e.g. "only for main actions") — not yet
- `replaceEffect` (e.g. "use new damage table") — not yet
- `insertEffectAfter` (e.g. "after damage, also push") — not yet
- `cost` / `perEncounter` / `perRound` — not yet

---

## Monster abilities

Monster automation reuses the same v3 schema PCs use, with a few practical differences. Author per-ability JSON in the monster creator (`Automate` button next to each ability row); the JSON is stored on the ability and the VTT monster ability tray launches it from the same runner.

To create a complete monster at once, use the Monster Creator **Import JSON** button. The full-monster schema and copyable template live at:

`dnd/strixhaven/monster-creator/MONSTER_JSON_IMPORT_TEMPLATE.md`

### Rules of thumb

- **Use static numbers.** Damage and potency in monster JSON are literals, not formulas. Write `"amount": 12` and `"target": 13`, never `"amount": "7+M"`.
- **Use `flatBonus` on `powerRoll`.** Set the literal roll bonus directly:
  ```json
  { "type": "powerRoll", "flatBonus": 6, "tiers": { ... } }
  ```
  Monster attributes are available as a fallback, but `flatBonus` is clearer and avoids relying on stat lookup.
- **`whenWinded` works the same as PCs.** A monster token is winded at HP ≤ floor(maxHP/2). Use the modifier to swap power-roll values or effects when the monster is bloodied.
- **Heroic resource and recoveries are skipped.** Monsters have neither. If automation tries to `spend` heroic or call a recoveries-based heal, the runner posts a chat note and continues — the effect is no-op for monsters.
- **Marks are shared board state.** The current monster runner passes mark hooks through, so `applyMark`, `endMark`, and `ifMark` can affect marks. For most monster abilities, prefer a `note` unless you intentionally want the monster to participate in the same mark system PCs use.
- **Villain/malice abilities auto-deduct from the malice pool.** Put the cost in the ability's `resource_cost` field (e.g. `"3"`, `"3 points"`, `"3 Malice"` — the runner parses the first integer). When fired, the monster runner reads `window.MaliceTracker.get()`, prompts if there's a deficit, and calls `window.MaliceTracker.spend(cost)`.
- **Triggered actions fire on confirm.** When the GM clicks a triggered-action launcher in the monster tray, a confirm modal appears before the runner kicks in. No auto-detection from game state.
- **Summons / spawns post a chat note.** Use a `note`-kind effect describing what to place — the GM grabs and places the new token manually. (v1: no auto-token-placement from automation.)

### Example monster JSON — Fire Elemental "Burning Slam" (Action, 2 Malice variant)

```json
{
  "schema": "ability-automation/v3",
  "version": 3,
  "cards": [
    { "type": "target", "mode": "token", "predicate": "enemy", "count": 1, "distance": { "form": "melee", "value": 1 } },
    {
      "type": "powerRoll",
      "flatBonus": 5,
      "attribute": "Might",
      "tiers": {
        "tier1": { "effects": [{ "kind": "damage", "amount": 4, "damageType": "fire" }] },
        "tier2": { "effects": [{ "kind": "damage", "amount": 8, "damageType": "fire" }, { "kind": "condition", "name": "slowed", "duration": "endOfTurn" }] },
        "tier3": { "effects": [{ "kind": "damage", "amount": 12, "damageType": "fire" }, { "kind": "condition", "name": "slowed", "duration": "saveEnds" }, { "kind": "forcedMovement", "verb": "push", "distance": 2 }] }
      },
      "whenWinded": { "flatBonus": 7 }
    }
  ]
}
```

When this monster is winded the roll bonus rises from +5 to +7, modeling "enraged when bloodied" mechanics without needing two ability cards.

### Full monster import JSON

The Monster Creator can import one complete monster from a JSON file. Use the template at `dnd/strixhaven/monster-creator/MONSTER_JSON_IMPORT_TEMPLATE.md` when asking an LLM to generate the whole monster, including stats, traits, ability text, and per-ability automation.

Monster `immunities` and `weaknesses` (each an array of `{ "type", "value" }` entries) are applied by VTT automated damage when an entry's `type` matches the incoming `damageType`. Multiple matching entries stack additively. The legacy single-field form (`immunity_type` / `immunity_value` / `weakness_type` / `weakness_value`) is still accepted for back-compat; it's auto-promoted to a one-entry list on import. Temporary automation-applied riders still use `damageImmunity` and `damageWeakness` conditions.

