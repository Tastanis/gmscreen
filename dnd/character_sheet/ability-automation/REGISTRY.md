# Ability Automation — Field & Hook Registry

A flat reference of every value the JSON schema accepts, every runtime hook, and every feature with its current implementation status. Update this when you add anything new — the LLM author reads this list to know what exists without having to grep the code.

For *how* to write JSON, see `AUTHORING.md`. This file is `what is supported`.

---

## Block types — `cards[].type`

| type | Implementation |
|---|---|
| `target` | Full |
| `powerRoll` | Full. Supports `flatBonus` (literal roll bonus that bypasses attribute lookup — monster-friendly) and `whenWinded` overrides (see Universal Modifiers). |
| `effect` | Full. Supports `whenWinded` overrides (see Universal Modifiers). |
| `trigger` | Schema + registration against `AbilityTriggerBus`. Authored `match` config fires the blue `!` overlay when its event/filter matches; click to resolve manually. No structured `match` → chat reminder fallback. |
| `persistent` | Schema + registration as a board-side persistent zone. Requires a preceding area `target` block so the zone has a footprint. Ticks at owner's `tickAt` (startOfTurn or endOfTurn): deducts upkeep from owner's heroic resource, applies effects to every creature inside the zone footprint. Auto-ends on combat end or when owner can't pay upkeep. **In-memory only** — page reload wipes zones (Pass 2 will add persistence). |

## Universal modifiers (apply to any actor — PC or monster)

| Modifier | Status | Notes |
|---|---|---|
| `powerRoll.flatBonus` | Full | Integer. When present, runner uses this as the roll bonus and ignores `attribute`-based stat lookup. PCs typically omit (let attribute resolve); monsters typically set it to a literal value. PC paths untouched when omitted. |
| `whenWinded` (on `powerRoll`) | Full | Sub-object with `bonus`, `flatBonus`, `attribute`, `target`, or `tiers` overrides. Shallow-merged over the base block when the actor's current HP/stamina ≤ floor(max/2). |
| `whenWinded` (on `effect`) | Full | Sub-object with `effects` and/or `target` overrides. The override `effects` array fully replaces the base when actor is winded. |

## Monster-specific runtime behavior

The monster ability tray + `window.MonsterAbilityRunner.start()` add the following layer on top of the runner:

| Behavior | When | Effect |
|---|---|---|
| Malice auto-spend | `category` is `villain_action` or `malice` | Reads cost from `ability.resource_cost` (first integer), calls `window.MaliceTracker.spend(cost)`. Confirm dialog if pool is short. |
| Triggered-action confirm | `category` is `triggered_action` | GM-clickable launcher fires a confirm dialog before invoking the runner. |
| `getAttributeBonus` returns 0 | always | Monsters use `flatBonus`; attribute lookups deliberately produce no bonus. |
| `getPotencyThreshold` returns 0 | always | Monster JSON should hard-code potency `target` integers. |
| `isWinded()` | always | Derives from `placement.hp <= floor(placement.maxHp / 2)`. |
| Visibility gate | tray/panel open | `window.canViewMonster(placement)` — GM OR `team === 'ally'` OR placement claimed by current user. |

## Effect kinds — `effect.kind` (used inside `tier.effects`, `effect.effects`, `trigger.effects`, `persistent.effects`, `potency.onFail`, `spend.effects`)

| kind | Status | Runtime behavior |
|---|---|---|
| `damage` | Full | Applies via board, supports immunity/vulnerability on PC sheets, monster stat-block weakness/immunity, and temporary `damageWeakness` / `damageImmunity` conditions |
| `condition` | Full | Applies via board condition tracker (save-ends durations integrate with token tracker) |
| `forcedMovement` (`push`) | Full | Push works end-to-end (board preview, collisions) |
| `forcedMovement` (`pull`) | Full | Legal cells strictly nearer to caster, monotonic-toward-source path |
| `forcedMovement` (`slide`) | Full | Any cell within Chebyshev distance, no source-distance constraint |
| `forcedMovement` (`vertical*`) | Partial | Falls through to horizontal push/pull/slide. Z-axis not modeled |
| `potency` | Full | Calls `checkPotency`, runs `onFail` effects on failed targets |
| `spend` | Full | Prompts user contextually, runs nested effects on accept. **Monster behavior:** spending `heroic` or `recovery` resources is skipped with a chat note — monsters have no such pools. |
| `heal` | Full | Flat `amount` heals via board heal path (capped at max). `recoveries` reads target's recovery value from their sheet and heals that × N; recoveries counter on the sheet is NOT auto-decremented (chat reminder so the player updates it). **Monster behavior:** `recoveries`-based heals are skipped with a chat note; flat `amount` heals work fine. |
| `temporaryStamina` | Full | Applies via board heal path with overage allowed (over-max shows as temp) |
| `teleport` | Full | Reuses the slide-shaped destination picker; legal-cell highlight covers any cell within Chebyshev distance. No stability or size penalty. Clicking an occupied cell still routes through the slide-style collision path — pick an empty cell to follow the rules. |
| `swap` | Full | Atomic transpose of caster ↔ target placements. Best-effort footprint check; non-equal sizes allowed (GM corrects manually). |
| `freeStrike` | Full | "By" entity defaults to the most recent target group's first member (the creature being told to free-strike). PCs roll `2d10 + max(M, A)`. Monsters use their stat-block `free_strike` value when present, otherwise fall back to M/A attributes. Prompts for the "against" target via the standard picker, with the by-entity as source, and applies damage through the normal automation damage path. |
| `cascade` | Chat reminder | Posts message; manual. Cascade requires stable cross-ability IDs and an "invoke another ability" entry point that doesn't exist yet — Phase D. |
| `resourceGain` | Full | Mutates the caster's own `hero.resource.value` on their sheet. If the JSON names a specific resource and the caster's resource bar has a different title, falls back to a chat reminder. Floors at 0. |
| `ifKeyword` | Full | Branches based on ability's `keywords`. `then` runs on match, `else` on miss |
| `ifStrained` | Full | Branches on whether the caster's heroic resource value is below 0. `then` runs when strained, `else` runs when not. |
| `ifMark` | Full | Branches on Judgment/mark predicates such as `targetJudgedBySelf`, `targetJudgedByAny`, and `actorIsMyJudgedTarget`. |
| `applyMark` | Full | Applies source-owned `judgment` marks. Recasting transfers the caster's mark; a newer censor judging the same target overwrites the old source. **Monster behavior:** posts chat note only — monsters can't apply marks. |
| `endMark` | Full | Clears the caster's current mark or a mark on a target. Used for willingly ending Judgment. **Monster behavior:** posts chat note only — monsters can't hold marks. |
| `ifScopedFlag` | Full | Branches on round/turn/encounter scoped source-target flags. Used for first-time-this-round rules. |
| `setScopedFlag` | Full | Sets a scoped source-target flag. Round flags reset at new round; all flags clear at encounter end. |
| `halveTriggeringDamage` | Full | Inside a `trigger` block matching the `damage` event: halves the triggering damage by healing back the difference. `rounding` (`up`/`down`) controls which half the placement takes. No-op outside a trigger with a captured damage payload. |
| `note` | Full | Posts text to chat |
| `other` | Chat reminder | Posts text to chat |

## Damage types — `damage.damageType`

`untyped`, `acid`, `cold`, `corruption`, `fire`, `holy`, `lightning`, `poison`, `psychic`, `sonic`

## Conditions — `condition.name`

`bleeding`, `dazed`, `dying`, `frightened`, `grabbed`, `prone`, `restrained`, `slowed`, `taunted`, `weakened`, `damageWeakness`, `damageImmunity`, `other`

When `name === "other"`, supply `text` describing the homebrew condition.

`damageWeakness` and `damageImmunity` carry numeric riders: `amount` (int, required) and `damageType` (string, optional). Stored on the placement; read by `getAutomationDamageAdjustment` when computing adjusted damage. Empty / "untyped" `damageType` matches every type.

## Durations — `condition.duration`

`instantaneous`, `endOfTurn`, `saveEnds`, `endOfEncounter`, `untilDying`

(The token tracker handles save-ends and end-of-turn natively.)

## Forced-movement verbs — `forcedMovement.verb`

`push`, `pull`, `slide`, `verticalPush`, `verticalPull`, `verticalSlide`

Forced-movement highlights account for target stability and size across PCs and monsters. The highlight is advisory only: the GM can still click any destination, including cells outside the legal highlight.

Target and area range visuals are also advisory. Single-target abilities draw the caster's range/reach box, and area abilities draw the placement-within range box when the source and `distance.within` are known. Clicking outside those visuals is allowed.

## Target predicates — `target.predicate`

`creature`, `enemy`, `ally`, `object`, `creatureOrObject`, `self`, `selfOrAlly`, `selfAndAlly`

## Distance forms — `target.distance.form`

`self`, `melee`, `ranged`, `meleeOrRanged`, `burst`, `aura`, `cube`, `line`, `wall`

## Area shapes — `target.shape` (when `mode: "area"`)

`cube`, `rectangle`, `burst`, `aura`, `line`, `wall`

## Attributes — `powerRoll.attribute` and `damage.attribute`

Long form (power roll): `Might`, `Agility`, `Reason`, `Intuition`, `Presence`, `Strongest`

Short form (damage `attribute` and potency `attribute`): `M`, `A`, `R`, `I`, `P`

## Potency levels — `potency.level`

`weak`, `average`, `strong`

(Resolves to caster-specific integer thresholds at runtime.)

## Spend timings — `spend.timing`

`preRoll`, `postResult`

## Persistent tick points — `persistent.tickAt`

`startOfTurn`, `endOfTurn`

## Tier keys — `powerRoll.tiers`

`tier1` (≤ 11), `tier2` (12–16), `tier3` (17+).

## Count modes — `target.count.mode`

`exact` (must pick all), `upTo` (player can stop early), `all` (every legal token).

---

## Runtime context hooks (provided by the VTT or character sheet)

These are called by `runner.js` and dispatched as `vtt:automation-*` CustomEvents on the page. The board (`board-interactions.js`) handles them.

| Hook | Payload | Returns |
|---|---|---|
| `selectTarget(config)` | target block fields + `{ pickIndex, pickTotal, allowDone }` | `{ id, name, hidden?, placement? }` or `{ skipped }` / `{ done }` / `{ canceled }` |
| `selectAreaTarget(config)` | target block fields + `sourcePlacement` | `{ targets: [...] }` or `{ skipped }` / `{ canceled }` |
| `applyDamage(payload)` | `{ placementId, amount, damageType, abilityName }` | `{ name, amount, current, max, hidden, vulnerability, immunity }` |
| `applyHeal(payload)` | `{ placementId, amount, allowTempHp, abilityName }` | `{ name, change, current, max, hidden, allowTempHp }` |
| `applyCondition(payload)` | `{ placementId, condition: {name, duration}, sourceId }` | `{ ok }` |
| `checkPotency(payload)` | `{ placementId, attribute, threshold, sourceStats }` | `{ passes: bool }` |
| `forceMove(payload)` | `{ movement, verb, distance, upTo, targetId, target, sourcePlacement, sourceTraits, abilityName }` | `{ name, movedDistance, collision?, skipped? }` |
| `cancelTargetSelection()` | none | none |
| `cancelAreaSelection()` | none | none |
| `getAttributeBonus(name)` | string attribute name | int |
| `getStrongestAttribute()` | none | `{ attribute, bonus }` |
| `postChat(entry)` | `{ message, type, payload }` | bool |
| `spendResource(action)` | the action object | `{ canceled? }` or any non-canceled |
| `registerTrigger(entry)` | `{ casterId, abilityId, abilityName, match: { event, filter }, effects, targetGroup, targetIds, condition, note }` | `{ registered: bool, abilityId, eventType }` |
| `applyResourceGain(payload)` | `{ amount, resource, abilityName }` | `{ applied, delta, resource, current }` or `{ skipped, reason }` |
| `applyTeleport(payload)` | `{ placementId, distance, abilityName, sourcePlacement }` | `{ name, movedDistance }` or `{ skipped, reason }` |
| `applySwap(payload)` | `{ targetId, sourcePlacement, abilityName }` | `{ name, sourceId, targetId }` or `{ skipped, reason }` |
| `runFreeStrike(payload)` | `{ byCandidateIds, againstPredicate, text, abilityName, casterName }` | `{ skipped, byId, againstId, tier, damage, damageResult }` |
| `getRecoveryValueForTarget(payload)` | `{ placementId }` | `{ recoveryValue, currentRecoveries }` — `recoveryValue` is null when unknown |
| `registerPersistentZone(payload)` | `{ casterId, abilityId, abilityName, area: { template, shape, ... }, upkeep: { cost, resource }, tickAt, effects, attributeBonuses, note }` | `{ registered, zoneId, zoneCount }` or `{ registered: false, reason }` |

---

## Trigger event bus (window.AbilityTriggerBus)

Lightweight event-driven registry for triggered abilities. JSON-authored `trigger` blocks register against the bus; built-in triggers (e.g. opportunity attack — coming next pass) also use it.

| Method | Signature | Notes |
|---|---|---|
| `register(entry)` | `entry = { tokenId, eventType, predicate, abilityId? }` | `predicate(payload, entry) → bool`. Returning true marks the trigger ready. |
| `unregisterByToken(tokenId)` | string | Removes all triggers for a token (call on token destroy / scene leave). |
| `fire(eventType, payload)` | string, object | Dispatches the event; ready triggers update their token state. |
| `markReady(placementId, abilityId?)` | string, string \| null | Sets `placement.hasReadyTrigger = true`, adds to `readyTriggerAbilities`. Surfaces blue `!` overlay on token + TRIGGER button. |
| `clearReady(placementId, abilityId?)` | string, string \| null | Clears specific ability or all triggers on a token. |

### Built-in event types

| eventType | Payload shape | Status |
|---|---|---|
| `move` | `{ placementId, sourceId, from: {column,row,width,height}, to: {...}, kind: "normal", sceneId, perWatcher }` | Fires once per `vtt:token-moved` (normal movement only). `perWatcher` is a `Map<watcherId, { leaves, enters }>` so a predicate's adjacency filter can resolve relative to its own watcher. |
| `damage` | `{ placementId, targetId, sourceId, amount, originalAmount, damageType, abilityName }` | Fires from `handleAutomationDamageRequest` after the stamina mutation. Manual / non-automation damage paths do NOT fire this yet — Phase B work. |
| `staminaChange` | `{ placementId, before, after, delta, kind }` | Fires from both `handleAutomationDamageRequest` and `handleAutomationHealRequest`. `kind` ∈ {`damage`, `heal`, `temporaryStamina`}. |
| `turnStart` | `{ placementId, team }` | Fires from `transitionToActiveTurn` whenever a token becomes the active combatant. |
| `turnEnd` | `{ placementId, team }` | Fires from `completeActiveCombatant` immediately before the save-ends UI opens. |
| `vtt:token-moved` (DOM event) | Underlying DOM event the `move` fan-out subscribes to. Still also used by the hard-coded opportunity-attack auto-detect. |

### Authored trigger `match` shape

Trigger blocks may carry a structured `match` alongside the free-text `condition` label. The runner forwards it via the host's `registerTrigger` callback; the board converts it into a bus listener with a generated predicate.

```json
{
  "type": "trigger",
  "condition": "When the target takes fire damage",
  "match": {
    "event": "damage",
    "filter": { "whose": "target", "damageType": ["fire"], "minAmount": 1 }
  },
  "effects": [ ... ]
}
```

| Event | Filter fields |
|---|---|
| `damage` | `whose` (`self`/`ally`/`enemy`/`target`/`any`), `minAmount` int, `damageType` string\|string[] |
| `staminaChange` | `whose`, `direction` (`up`/`down`/`either`) |
| `turnStart`, `turnEnd` | `whose` |
| `move` | `whose`, `leavesAdjacency` bool, `entersAdjacency` bool |

`whose` resolves against:
- `self` → the caster's own placement id
- `target` → ids in the target group named by `block.target` (or just the most recent group)
- `ally`/`enemy` → team comparison against the caster's combat team
- `any` (default) → no filter

If `match` is omitted, the runner falls back to a chat reminder so the GM at least sees what should happen.

### Built-in opportunity attack

Auto-detected on every normal movement during combat:

- Listens for `vtt:token-moved` with `kind === "normal"`
- For each opposing-team token that *was* adjacent (Chebyshev gap = 1, footprint-aware) to the moving token's `from` and is *not* adjacent to its `to`, calls `markReady(watcherId, "__opportunityAttack__")`
- Skipped when `combatActive === false`
- Skipped for forced movement (push/pull/slide) and teleport because those don't fire `vtt:token-moved`
- Cleared at the start of each combat round via `resetTriggeredActionsForActiveScene`

The watcher token gets the blue pulsing `!` overlay on the board and the `!` badge on their TRIGGER ability tab when they're selected. Clicking either clears it (manual resolution this pass; auto-clear on free-strike-used in a future pass once free strikes are first-class abilities).

## Ability keywords

Standard set (case-insensitive normalization to canonical casing):

`Melee, Ranged, Strike, Weapon, Magic, Psionic, Area, Charge, Persistent, Resistance, Routine, Free, FreeStrike, FreeTriggered`

Custom strings are accepted. JSON authoring puts them in `automation.keywords` at the top level. Runtime falls back to `action.keywords` and then `action.tags` from the character sheet if `automation.keywords` is absent.

Used by:
- `ifKeyword` effect (conditional gating of effects)
- Feature-modifier `match.keywordsAll` / `keywordsAny` / `keywordsNone`

## Feature modifiers

Top-level `automation.modifiers[]` on a feature's automation JSON. Each modifier has:

| Field | Shape |
|---|---|
| `label` | string — shown in chat + inspector when this modifier applies |
| `match.keywordsAll` | string[] — ability needs all of these keywords |
| `match.keywordsAny` | string[] — ability needs any of these |
| `match.keywordsNone` | string[] — ability needs none of these |
| `match.damageType` | string — at least one damage effect must use this type |
| `match.attribute` | string — power-roll attribute must match |
| `apply.damageBonus` | int — added to every `damage.amount` |
| `apply.rangeBonus` | int — added to every `target.distance.value` |
| `apply.forcedMovementBonus` | int — added to every `forcedMovement.distance` |
| `apply.damageType` | string — overrides damage type on every damage effect |
| `apply.note` | string — free-text shown in inspector |

Applied at the start of `runner.open()`, before any rendering. The tier preview, dice modal, and chat output all see post-modifier values. The saved ability JSON is never mutated.

Stacking is additive. Multiple matching modifiers all apply. Per-encounter / spend-based / replace-effect modifiers are deferred.

## Schema versioning

| Version | Status |
|---|---|
| `ability-automation/v2` | Discarded on load — paste a v3 JSON |
| `ability-automation/v3` | Current |

---

## Files in this folder

| File | Role |
|---|---|
| `primitives.js` | Registry of enums + normalizers (single source of truth for vocabulary) |
| `schema.js` | Normalize JSON, validate, summarize blocks, describe runtime steps |
| `catalog.js` | Shorthand parser used only for LLM-import tooling (not the runtime) |
| `runner.js` | Walks `automation.cards` at runtime |
| `paste.js` | Paste-JSON dialog (replaces the v2 builder) |
| `inspector.js` | Read-only inspector modal for an ability |
| `automation.css` | Styles for runner, paste, inspector |
| `AUTHORING.md` | Format spec — paste alongside an ability for LLM authoring |
| `REGISTRY.md` | This file — implementation status of every concept |
| `README.md` | Folder map + invariants for code contributors |

## Things that DO NOT exist (don't invent in JSON)

- Any effect kind not in the table above (use `other` or `note`)
- Targeting predicates beyond the 8 listed (no `dead`, `willing`, `hero`, `monster`)
- Damage modifier types like `weakness 10` / `immunity equal to your level` — these are character-side, not ability-side
- Marks (`judged by you`, `marked by you`, `bonded`) — not implemented yet; use `note` for now
- Real persistence tracking — `persistent` blocks fire a chat reminder only this pass
- Real trigger auto-detection — `trigger` blocks fire a chat reminder only this pass
- Free-text expressions (e.g. `"5 + Might"`) — always use structured fields
