# Ability Automation — Field & Hook Registry

A flat reference of every value the JSON schema accepts, every runtime hook, and every feature with its current implementation status. Update this when you add anything new — the LLM author reads this list to know what exists without having to grep the code.

For *how* to write JSON, see `AUTHORING.md`. This file is `what is supported`.

---

## Block types — `cards[].type`

| type | Implementation |
|---|---|
| `target` | Full |
| `powerRoll` | Full |
| `effect` | Full |
| `trigger` | Schema + chat reminder (no auto-detect this pass) |
| `persistent` | Schema + chat reminder (no auto-tick this pass) |

## Effect kinds — `effect.kind` (used inside `tier.effects`, `effect.effects`, `trigger.effects`, `persistent.effects`, `potency.onFail`, `spend.effects`)

| kind | Status | Runtime behavior |
|---|---|---|
| `damage` | Full | Applies via board, supports immunity/vulnerability on PC sheets |
| `condition` | Full | Applies via board condition tracker (save-ends durations integrate with token tracker) |
| `forcedMovement` (`push`) | Full | Push works end-to-end (board preview, collisions) |
| `forcedMovement` (`pull`) | Full | Legal cells strictly nearer to caster, monotonic-toward-source path |
| `forcedMovement` (`slide`) | Full | Any cell within Chebyshev distance, no source-distance constraint |
| `forcedMovement` (`vertical*`) | Partial | Falls through to horizontal push/pull/slide. Z-axis not modeled |
| `potency` | Full | Calls `checkPotency`, runs `onFail` effects on failed targets |
| `spend` | Full | Prompts user contextually, runs nested effects on accept |
| `heal` | Full | Applies via board heal path. Capped at max stamina |
| `temporaryStamina` | Full | Applies via board heal path with overage allowed (over-max shows as temp) |
| `teleport` | Chat reminder | Posts message; manual |
| `swap` | Chat reminder | Posts message; manual |
| `freeStrike` | Chat reminder | Posts message; manual |
| `cascade` | Chat reminder | Posts message; manual |
| `resourceGain` | Chat reminder | Posts message; manual |
| `note` | Full | Posts text to chat |
| `other` | Chat reminder | Posts text to chat |

## Damage types — `damage.damageType`

`untyped`, `acid`, `cold`, `corruption`, `fire`, `holy`, `lightning`, `poison`, `psychic`, `sonic`

## Conditions — `condition.name`

`bleeding`, `dazed`, `dying`, `frightened`, `grabbed`, `prone`, `restrained`, `slowed`, `taunted`, `weakened`, `other`

When `name === "other"`, supply `text` describing the homebrew condition.

## Durations — `condition.duration`

`instantaneous`, `endOfTurn`, `saveEnds`, `endOfEncounter`, `untilDying`

(The token tracker handles save-ends and end-of-turn natively.)

## Forced-movement verbs — `forcedMovement.verb`

`push`, `pull`, `slide`, `verticalPush`, `verticalPull`, `verticalSlide`

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

---

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
