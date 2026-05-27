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
| `trigger` | Schema + registration against `AbilityTriggerBus`. PC trigger actions in the Triggers list are always-on once that character token is present in the active VTT scene; opening the character summary is not required. Authored `match` config fires the blue `!` overlay when its event/filter matches; click to resolve manually. No structured `match` -> chat reminder fallback. |
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
| `getAttributeBonus` reads monster stats | fallback | Monsters should use `flatBonus` for authored power rolls. If a monster automation uses `attribute` or damage `attribute`, the runner currently resolves it from the monster's Might/Agility/Reason/Intuition/Presence fields. |
| `getPotencyThreshold` returns 0 | always | Monster JSON should hard-code potency `target` integers. |
| `isWinded()` | always | Derives from `placement.hp <= floor(placement.maxHp / 2)`. |
| Visibility gate | tray/panel open | `window.canViewMonster(placement)` — GM OR `team === 'ally'` OR placement claimed by current user. |

## Effect kinds — `effect.kind` (used inside `tier.effects`, `effect.effects`, `trigger.effects`, `persistent.effects`, `potency.onFail`, `spend.effects`)

| kind | Status | Runtime behavior |
|---|---|---|
| `damage` | Full | Applies via board, supports immunity/vulnerability on PC sheets, monster stat-block weakness/immunity, and temporary `damageWeakness` / `damageImmunity` conditions. Fields: `amount`, optional `amountDice` (`"1d6"`), optional `attribute`, optional `markBonusDice` + `markPredicate`, optional `damageType`. |
| `condition` | Full | Applies via board condition tracker (save-ends durations integrate with token tracker) |
| `forcedMovement` (`push`) | Full | Push works end-to-end (board preview, collisions) |
| `forcedMovement` (`pull`) | Full | Legal cells strictly nearer to caster, monotonic-toward-source path |
| `forcedMovement` (`slide`) | Full | Any cell within Chebyshev distance, no source-distance constraint |
| `forcedMovement` (`vertical*`) | Partial | Falls through to horizontal push/pull/slide. Z-axis not modeled |
| `shift` | Full | Voluntary caster movement. Opens a slide-style picker for the caster, supports `distance: "speed"` and shared `pool` keys so split shifts can spend from one total movement allowance. |
| `potency` | Full | Calls `checkPotency`, runs `onFail` effects on failed targets |
| `spend` | Full | PC runner checks and spends the caster's heroic resource before prompting/running nested effects. Fixed spends skip the prompt if the resource is missing or insufficient. `maxAmount` supports variable spends through a draggable VTT modal with stepper buttons. **Monster behavior:** spending `heroic` or `recovery` resources is skipped with a chat note — monsters have no such pools. |
| `heal` | Full | Flat `amount` heals via board heal path (capped at max). `recoveries` spends the target PC's recoveries, decrements `hero.vitals.currentRecoveries`, and heals by recovery value x N. If the target sheet cannot be resolved, the runtime falls back to a chat reminder. **Monster behavior:** `recoveries`-based heals are skipped with a chat note; flat `amount` heals work fine. |
| `temporaryStamina` | Full | Applies via board heal path with overage allowed (over-max shows as temp) |
| `teleport` | Full | Reuses the slide-shaped destination picker; legal-cell highlight covers any cell within Chebyshev distance. Supports embedded `spend` to increase distance before the picker opens. No stability or size penalty. Clicking an occupied cell still routes through the slide-style collision path — pick an empty cell to follow the rules. |
| `swap` | Full | Atomic transpose of caster ↔ target placements. Best-effort footprint check; non-equal sizes allowed (GM corrects manually). |
| `abilityTest` | Full | Opens the standard 2d10 roll modal for a non-damaging test. Supports `label`, `attribute`, `bonus`, `rollFormula`, and `text`. The table interprets success; pair with `ifPrompt` for follow-up automation. |
| `freeStrike` | Full | "By" entity defaults to the most recent target group's first member (the creature being told to free-strike). PCs roll `2d10 + max(M, A)`. Monsters use their stat-block `free_strike` value when present, otherwise fall back to M/A attributes. Prompts for the "against" target via the standard picker, with the by-entity as source, shows a draggable VTT target prompt, and applies damage through the normal automation damage path. |
| `cascade` | Chat reminder | Posts message; manual. Cascade requires stable cross-ability IDs and an "invoke another ability" entry point that doesn't exist yet — Phase D. |
| `resourceGain` | Full | Mutates the caster's own `hero.resource.value` on their sheet. If the JSON names a specific resource and the caster's resource bar has a different title, falls back to a chat reminder. Floors at 0. |
| `surgeGain` | Full | Mutates `hero.surges` on each PC target's character sheet via VTT surge sync. Surges are separate from heroic resources. Floors at 0. |
| `ifKeyword` | Full | Branches based on ability's `keywords`. `then` runs on match, `else` on miss |
| `ifStrained` | Full | Branches on whether the caster's heroic resource value is below 0. `then` runs when strained, `else` runs when not. |
| `ifPrompt` | Full | Opens a yes-no VTT popup and runs `then` on yes or `else` on no. Supports `question`, optional `yesLabel`/`noLabel`, optional branch `target`, and `{target}` substitution from the current target group. Use when a rules condition cannot be inspected automatically. |
| `ifMark` | Full | Branches on Judgment/mark predicates such as `targetJudgedBySelf`, `targetJudgedByAny`, and `actorIsMyJudgedTarget`. |
| `applyMark` | Full | Applies source-owned `judgment` marks. Recasting transfers the caster's mark; a newer censor judging the same target overwrites the old source. Current monster runner passes this hook through too, but monster authoring should usually prefer `note` unless intentionally using shared mark state. |
| `endMark` | Full | Clears the caster's current mark or a mark on a target. Used for willingly ending Judgment. Current monster runner passes this hook through too, but monster authoring should usually prefer `note` unless intentionally using shared mark state. |
| `ifScopedFlag` | Full | Branches on round/turn/encounter scoped source-target flags. Used for first-time-this-round rules. |
| `setScopedFlag` | Full | Sets a scoped source-target flag. Round flags reset at new round; all flags clear at encounter end. |
| `halveTriggeringDamage` | Full | Use in an `effect` card after a structured `trigger` card matching the `damage` event. When resolving the ready trigger, halves the triggering damage by healing back the difference. `rounding` (`up`/`down`) controls which half the placement takes. No-op without a captured damage payload. |
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

Target blocks support optional `promptTitle` and `promptText` fields. These control the target-picker modal title/instructions and board status text, but they do not affect targeting legality or the effects that run later. When omitted, a target block immediately followed by an effect card that damages the same target group gets a generic damage prompt such as "Pick Enemy to Damage"; the later `damage` effect still controls amount, attribute, dice, and damage type. Token target blocks with custom or inferred prompt text use the board picker as the single visible prompt; optional picks expose `Skip` in that picker.

## Target predicates — `target.predicate`

`creature`, `enemy`, `ally`, `object`, `creatureOrObject`, `self`, `selfOrAlly`, `selfAndAlly`

For effect resolution, `target: "self"` is a special target group resolved directly to the source token. It does not require a preceding target card.

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

`startOfTurn`, `endOfTurn`, `never`

## Tier keys — `powerRoll.tiers`

`tier1` (≤ 11), `tier2` (12–16), `tier3` (17+).

## Count modes — `target.count.mode`

`exact` (must pick all), `upTo` (player can stop early), `all` (every legal token).

---

## Runtime context hooks (provided by the VTT or character sheet)

These are called by `runner.js` and dispatched as `vtt:automation-*` CustomEvents on the page. The board (`board-interactions.js`) handles them.

| Hook | Payload | Returns |
|---|---|---|
| `selectTarget(config)` | target block fields + `{ pickIndex, pickTotal, allowDone }`; may include `promptTitle` / `promptText` for picker wording | `{ id, name, hidden?, placement? }` or `{ skipped }` / `{ done }` / `{ canceled }` |
| `selectAreaTarget(config)` | target block fields + `sourcePlacement` | `{ targets: [...] }` or `{ skipped }` / `{ canceled }` |
| `applyDamage(payload)` | `{ placementId, amount, damageType, abilityName }` | `{ name, amount, current, max, hidden, vulnerability, immunity }` |
| `applyHeal(payload)` | `{ placementId, amount, allowTempHp, abilityName }` | `{ name, change, current, max, hidden, allowTempHp }` |
| `applyCondition(payload)` | `{ placementId, condition: {name, duration}, sourceId }` | `{ ok }` |
| `checkPotency(payload)` | `{ placementId, attribute, threshold, sourceStats }` | `{ passes: bool }` |
| `forceMove(payload)` | `{ movement, verb, verbLabel?, distance, upTo, ignoreStability?, targetId, target, sourcePlacement, sourceTraits, abilityName }` | `{ name, movedDistance, collision?, skipped? }` |
| `cancelTargetSelection()` | none | none |
| `cancelAreaSelection()` | none | none |
| `getAttributeBonus(name)` | string attribute name | int |
| `getStrongestAttribute()` | none | `{ attribute, bonus }` |
| `postChat(entry)` | `{ message, type, payload }` | bool |
| `spendResource(action)` | the action object | `{ canceled? }` or any non-canceled |
| `spendHeroicResource(payload)` | `{ amount, maxAmount?, resource, abilityName, prompt }` | `{ spent, resource, current }`, `{ canceled }`, or `{ skipped, reason }` |
| `applySurgeGain(payload)` | `{ placementId, amount, abilityName }` | `{ applied, current, name }` or `{ skipped, reason }` |
| `registerTrigger(entry)` | `{ casterId, abilityId, abilityName, match: { event, filter }, effects, targetGroup, targetIds, condition, note }` | `{ registered: bool, abilityId, eventType }` |
| `applyResourceGain(payload)` | `{ amount, resource, abilityName }` | `{ applied, delta, resource, current }` or `{ skipped, reason }` |
| `applyTeleport(payload)` | `{ placementId, distance, abilityName, sourcePlacement }` | `{ name, movedDistance }` or `{ skipped, reason }` |
| `applySwap(payload)` | `{ targetId, sourcePlacement, abilityName }` | `{ name, sourceId, targetId }` or `{ skipped, reason }` |
| `runFreeStrike(payload)` | `{ byCandidateIds, againstPredicate, text, abilityName, casterName }` | `{ skipped, byId, againstId, tier, damage, damageResult }` |
| `getRecoveryValueForTarget(payload)` | `{ placementId }` | `{ recoveryValue, currentRecoveries }` - `recoveryValue` is null when unknown |
| `spendRecoveryForTarget(payload)` | `{ placementId, recoveries, abilityName }` | `{ spent, recoveryValue, currentRecoveries, name }` or `{ skipped, reason }`; decrements the target PC sheet before the heal is applied |
| `registerPersistentZone(payload)` | `{ casterId, abilityId, abilityName, area: { template, shape, ... }, upkeep: { cost, resource }, tickAt, effects, attributeBonuses, note }` | `{ registered, zoneId, zoneCount }` or `{ registered: false, reason }` |
| `applyMark(payload)` | `{ markType, sourceId, sourceName, targetId, targetName, abilityId, abilityName, duration, exclusivePerSource, exclusivePerTarget, transfer }` | `{ applied, oldTargetId, oldTargetName, replacedSourceId, replacedSourceName }` |
| `endMark(payload)` | `{ markType, sourceId, targetId, scope, reason }` | `{ cleared, targetName, sourceName }` |
| `checkMark(payload)` | `{ predicate, markType, sourceId, targetId, triggerPayload }` | `{ matched: bool }` |
| `fireTriggerEvent(payload)` | `{ eventType, payload }` | none; fans out through `AbilityTriggerBus.fire()` |
| `checkScopedFlag(payload)` | `{ scope, key, sourceId, targetId }` | `{ set: bool }` |
| `setScopedFlag(payload)` | `{ scope, key, sourceId, targetId }` | `{ set: bool }` |

---

## Trigger event bus (window.AbilityTriggerBus)

Lightweight event-driven registry for triggered abilities. JSON-authored `trigger` blocks register against the bus as passive listeners; built-in triggers also use it. Players do not click triggered actions to start listening.

| Method | Signature | Notes |
|---|---|---|
| `register(entry)` | `entry = { tokenId, eventType, predicate, abilityId? }` | Adds or refreshes a passive listener. `predicate(payload, entry) -> bool`. Returning true marks the trigger ready. |
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

Additional accepted events:

| eventType | Payload / status |
|---|---|
| `damageDealt` | Same live payload and source as `damage`; useful for wording like "when you deal damage." Predicates resolve `whose` from `sourceId`; the damaged token is still `placementId`/`targetId`. |
| `staminaZero` | Fires when automated damage drops a target from above 0 stamina to 0 or lower. |
| `markApplied` | Fires when automation applies or transfers a mark. Supports `markType` and `source` filters. |
| `actionUsed` | Fires at the start of a normal ability automation run when the host exposes `fireTriggerEvent`. Payload: `{ actorId, actionId, actionName, actionKind, keywords }`. |

### Authored trigger `match` shape

Trigger blocks may carry a structured `match` alongside the free-text `condition` label. The board auto-registers PC trigger actions from active-scene character sheets and converts each `match` into a bus listener with a generated predicate. The runner can still forward the same match via the host's `registerTrigger` callback as a fallback/debug path.

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
| `damage` | `whose` (`self`/`ally`/`enemy`/`target`/`judgedTarget`/`markSource`/`any`), `minAmount` int, `damageType` string\|string[] |
| `staminaChange` | `whose`, `direction` (`up`/`down`/`either`) |
| `turnStart`, `turnEnd` | `whose` |
| `move` | `whose`, `leavesAdjacency` bool, `entersAdjacency` bool |
| `damageDealt` | same fields as `damage`; `whose` resolves against `sourceId` |
| `staminaZero` | same as `staminaChange` |
| `actionUsed` | `whose`, `actionKind`, `keywordsAny`; `lineOfEffectTo` is accepted by the schema but not evaluated yet |
| `markApplied` | `whose`, `markType`, `source` |

`whose` resolves against:
- `self` -> the caster's own placement id
- `target` -> ids in the target group named by `block.target` (or just the most recent group)
- `judgedTarget` -> the caster's current `judgment` target
- `markSource` -> a token marked by the caster
- `ally`/`enemy` -> team comparison against the caster's combat team
- `any` (default) -> no filter

If `match` is omitted, the runner falls back to a chat reminder so the GM at least sees what should happen.

### Built-in opportunity attack

Auto-detected on every normal movement during combat:

- Listens for `vtt:token-moved` with `kind === "normal"`
- For each opposing-team token that *was* adjacent (Chebyshev gap = 1, footprint-aware) to the moving token's `from` and is *not* adjacent to its `to`, calls `markReady(watcherId, "__opportunityAttack__")`
- Skipped when `combatActive === false`
- Skipped for forced movement (push/pull/slide) and teleport because those don't fire `vtt:token-moved`
- Cleared at the start of each combat round via `resetTriggeredActionsForActiveScene`

The watcher token gets the blue pulsing `!` overlay on the board, and the tray's existing trigger/ability icons pulse blue when they're selected. Ready authored triggers are matched back to the specific triggered ability id when possible; clicking that row clears the ready flag and passes the firing payload into the runner. The built-in opportunity-attack sentinel injects a free strike row when a matching PC free strike exists.

When a ready PC trigger resolves and the action label is non-free triggered, the runner consumes the token's triggered action for the round. While `triggeredActionReady === false` or `triggeredActionUsedThisRound === true`, authored non-free trigger predicates do not mark ready. Free triggered actions are exempt. The VTT's triggered-action tray dot can manually override this state: toggling a spent triggered action back to ready also clears `triggeredActionUsedThisRound`, allowing authored non-free triggers to arm again before the next round reset.

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

## Current limits (don't invent in JSON)

- Any effect kind not in the table above. Use `other` or `note` for manual effects.
- Targeting predicates beyond the 8 listed. Do not write `dead`, `willing`, `hero`, or `monster`.
- Free-text math such as `"5 + Might"` in numeric fields. Use structured fields: `amount: 5`, `attribute: "M"`, or `amountDice: "1d6"`.
- Auto-running another named ability. `cascade` is a chat reminder only.
- Auto-placing summoned/spawned tokens. Use `note` with placement instructions.
- Persistent zone disk persistence. Zones are real in memory, but page reload clears them.
- Trigger auto-resolution. Authored triggers passively listen and light the blue `!`; the player/GM still clicks to resolve.
- Manual/non-automation damage events do not currently fire `damage`, `damageDealt`, or `staminaZero` trigger events.
- Monster-side PC-only state: heroic resource spends and recovery spends degrade to chat/no-op behavior for monsters. Mark hooks are currently shared board state; use them intentionally.
