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
| `target` | string — name of a target block. Defaults to most recent target group. |
| `tiers.tier1` / `tier2` / `tier3` | each `{ effects: [...] }`. Tier1 = `≤11`, tier2 = `12-16`, tier3 = `17+`. |

Each `effects[]` entry is an [Effect](#effects) — `damage`, `condition`, `forcedMovement`, `potency`, etc.

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

### `trigger`

Declarative trigger metadata. **This pass: chat reminder only — no auto-detect.**

```json
{
  "type": "trigger",
  "condition": "The target takes damage.",
  "effects": [ { "kind": "damage", "amount": 3, "damageType": "psychic" } ]
}
```

### `persistent`

Persistent zone metadata. **This pass: chat reminder only — no auto-tick yet.**

```json
{
  "type": "persistent",
  "cost": 1,
  "resource": "Wrath",
  "tickAt": "startOfTurn",
  "effects": [ { "kind": "damage", "amount": 3, "damageType": "fire" } ]
}
```

---

## Effects

Each effect is one of the kinds below. They're used inside `powerRoll.tiers.tierN.effects`, `effect.effects`, `trigger.effects`, `persistent.effects`, and as the `onFail` of a `potency` rider or the `effects` of a `spend` rider.

### `damage`

```json
{ "kind": "damage", "amount": 5, "attribute": "M", "damageType": "fire" }
```

| Field | Values |
|---|---|
| `amount` | int (flat amount) |
| `attribute` | optional. Single string `"M"`/`"A"`/`"R"`/`"I"`/`"P"`/`"Strongest"`, OR an array like `["M", "A"]` meaning "highest of these specific attributes" (used for free strikes — highest of Might or Agility only) |
| `damageType` | `"untyped"`, `"acid"`, `"cold"`, `"corruption"`, `"fire"`, `"holy"`, `"lightning"`, `"poison"`, `"psychic"`, `"sonic"` |

`"Strongest"` means highest of all 5 characteristics. Use an array like `["M", "A"]` when the rule is "highest of these specific attributes only" — most often this is the free-strike rule (highest of M or A but never R/I/P).

### `heal`

```json
{ "kind": "heal", "recoveries": 1 }
{ "kind": "heal", "amount": 5 }
```

`recoveries` spends the target's recovery to heal their recovery value. `amount` is a flat number. **Chat-reminder this pass — runtime prints a message; manual application required.**

### `temporaryStamina`

```json
{ "kind": "temporaryStamina", "amount": 5 }
```

Chat-reminder this pass.

### `condition`

```json
{ "kind": "condition", "name": "slowed", "duration": "saveEnds" }
{ "kind": "condition", "name": "other", "duration": "endOfTurn", "text": "can't draw cards" }
```

| Field | Values |
|---|---|
| `name` | `"bleeding"`, `"dazed"`, `"dying"`, `"frightened"`, `"grabbed"`, `"prone"`, `"restrained"`, `"slowed"`, `"taunted"`, `"weakened"`, `"other"` |
| `text` | required when `name === "other"` — describes the homebrew condition |
| `duration` | `"instantaneous"`, `"endOfTurn"`, `"saveEnds"`, `"endOfEncounter"`, `"untilDying"` |

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

Chat-reminder this pass.

### `swap`

```json
{ "kind": "swap" }
```

Caster swaps places with the target. Chat-reminder this pass.

### `resourceGain`

```json
{ "kind": "resourceGain", "resource": "surge", "amount": 1 }
```

Negative `amount` = loss. Chat-reminder this pass.

### `freeStrike`

```json
{ "kind": "freeStrike", "against": "ally", "text": "before taking damage, the target makes a free strike against an ally" }
```

Chat-reminder. Use this for "the target makes a free strike" book text. `against` is the relationship of who gets struck.

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
    { "type": "target", "mode": "token", "predicate": "ally", "count": { "value": 1, "mode": "exact" } },
    {
      "type": "trigger",
      "condition": "The target takes damage.",
      "effects": [ { "kind": "note", "text": "Caster takes the damage instead of the target." } ]
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
