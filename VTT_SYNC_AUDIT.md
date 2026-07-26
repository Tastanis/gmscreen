# VTT Multiplayer Sync Audit

**Date:** 2026-07-26
**Scope:** `dnd/vtt` — everything that could cause content to appear on one person's screen but not another's.
**Status:** Read-only audit. No files changed.

51 findings. All traced in code; the top 8 were independently re-verified by a second pass. Line numbers are as of this date.

- **Findings 1–43** — general sync audit (token placement, map levels, combat tracker, reload/reconnect).
- **Findings 44–51** — follow-up investigation into **why player turn-taking doesn't sync** (Tier 6).
- **REMEDIATION PLAN** at the end, including a recommendation to *replace* rather than patch the combat state layer.

> **Correction to the first draft:** Finding 50 supersedes an earlier claim that the poller's GM-preference rule (`board-state-poller.js:247-253`) was active logic. It is dead code — `metadata` is never persisted server-side. That makes **three** dead safety guards in the sync layer (27, 21, 50).

---

## Architecture recap

Three sync paths, and most bugs live in the seams between them:

1. **Pusher broadcast** — `assets/js/services/pusher-service.js`. Events carry `type: 'ops' | 'ops-overflow' | 'full'`, a monotonic `version`, and `authorId`.
2. **HTTP poller** — `assets/js/services/board-state-poller.js`. 1000 ms when Pusher is down, **30000 ms** safety-net when Pusher is up. Conditional GET with `If-None-Match: W/"v<version>"`.
3. **Inline bootstrap** — `bootstrap.php` injects state into the HTML; `assets/js/bootstrap.js` hydrates it.

The recurring structural problem: **the 30-second safety net is the only backstop, and almost every recovery path into it is blocked.** Findings 1, 2, and 3 are the systemic root causes — most of the individual symptoms below are only *persistent* because of them.

---

# TIER 1 — Systemic root causes

These three turn every other bug from a one-frame glitch into "stuck until reload."

## 1. The post-save resync is guaranteed to be discarded

`board-interactions.js:5474`, `:5488-5491`, `:6036-6057`, `:6421-6459` → `board-state-poller.js:118-135`

When a Pusher `ops` broadcast arrives while a save is in flight, it is dropped and converted into a deferred resync. Recovery fires in the save-success branch:

```js
lastBoardStateSaveCompletedAt = Date.now();          // 5474
...
if (pendingResyncAfterSave) {
  pendingResyncAfterSave = false;                     // cleared BEFORE the poll
  triggerBoardStateResync('post-save-flush');         // 5488
}
```

`triggerBoardStateResync` → `forceImmediatePoll()` → `poll()`, which then calls `getPendingSaveInfo()`. That returns `pending: true` for `SAVE_GRACE_PERIOD_MS = 1500` after `lastBoardStateSaveCompletedAt` — which was just set to `Date.now()` two lines earlier. The poller bails at `poller.js:127-135`. The flag is already cleared, so nothing retries.

Same bug on the combat path at `:12772-12776`.

**Symptom:** another player's token move / drawing / template is missing on your screen for up to 30 seconds, whenever their action happened to coincide with any save of yours. Console shows `Resync deferred until save completes`, then silence. This is the single most likely cause of everyday "it's not showing up on my screen."

## 2. The version-only ETag makes divergence permanent

`api/state.php:181` builds the ETag as `'W/"v' . $currentVersion . '"'` — **version only, no content hash** — and 304s on version equality alone (`:185-190`).

So if a client's `currentBoardStateVersion` ever reaches the server's value *without* the corresponding state having been applied locally, the 30-second poll returns 304 forever and the client never self-heals.

Confirmed ways the version advances without the state being applied:

| Path | Where |
|---|---|
| Partially-applied ops — `appliedCount` is only used in a `console.log` | `board-interactions.js:6152-6189` |
| Grid is deliberately never applied from broadcasts, but version still bumps | `:6310-6315` (commented out) + `:6394-6398` |
| Dragged tokens are skipped in the merge, version still bumps | `:6219-6249` + `:6394` |
| Server accepted the version bump but *discarded the content* (rejected combat payload, ignored player `placement.remove`, lost timestamp race) | `api/state.php:546`, `:1084-1086`, `:685` |
| Pusher self-skip bumps `lastAppliedVersion` | `pusher-service.js:286-288` |

**Symptom:** one client permanently renders a stale grid size / missing token / wrong HP with zero console noise. It only heals if some *unrelated* client saves, pushing the version past this client's.

**Fix direction:** include a content hash in the ETag, or only advance `currentBoardStateVersion` after a fully successful apply.

## 3. Pusher `unavailable` / `failed` never flip `isConnected` — no fallback, no catch-up

`pusher-service.js:81-84` binds `handleDisconnected` only to `'disconnected'`. `handleStateChange` (`:202-221`) explicitly enumerates `disconnected | failed | unavailable | connecting` but **only clears `currentSocketId`** — it never sets `isConnected = false` and never calls `onConnectionStateChangeCallback`. `isConnected` is written `false` in exactly one place: `:172`.

pusher-js emits `'disconnected'` only on an explicit `disconnect()` call. A real network drop goes `connecting → unavailable → failed`. In all of those states this code still reports `isPusherConnected() === true`, so `reconfigure({pusherConnected:false})` never runs and the poller stays at 30 seconds instead of dropping to 1 second.

There is also **no catch-up GET on reconnect at all** — `reconfigure` deliberately skips the immediate poll when going fallback → safety-net (`poller.js:339-342`), and the `connected` handler does nothing else. Recovery depends entirely on the strict `+1` gap detector on the *next* broadcast (`:6126-6136`), which routes into the swallowed resync of Finding 1.

**Symptom:** a Wi-Fi hiccup silently freezes that client for up to 30 seconds while the table moves on, then it jumps.

**Related (Low):** `config/pusher.php:24` `'enabled' => false` is documented as the emergency kill switch, but `templates/layout.php:66-70` hardcodes `window.vttPusherConfig` unconditionally. Using the kill switch stops server broadcasts while clients still connect and report healthy → the whole table degrades to 30-second sync.

---

# TIER 2 — Token placement & deletion

## 4. A player deleting a token: it vanishes locally, is never deleted server-side, and resurrects

`board-interactions.js:6552-6559` (no GM gate on Delete/Backspace), `:8370-8451`, `api/state.php:1078-1086`, `api/state_helpers.php:268-342`

Delete is reachable by any player (and `removeSelectedTokens:8405-8408` explicitly *permits* non-GMs to remove non-hidden tokens). But the `placement.remove` op is only built for GMs:

```js
if (USE_DELTA_SAVES && isGM) { removeOps = removedIds.map(...) }
else { clearDirtyTracking(); }     // 8433-8441
```

So a player's delete goes out as a snapshot. Server-side, `api/state.php:453-476` always routes non-GM placements through `mergeSceneEntriesByTimestamp` — with the comment *"Always use timestamp-based merge for players to prevent token deletion."* That function (`state_helpers.php:268-342`) has no `unset` and no drop path: absence in the incoming array is a no-op. `placement.remove` is separately gated on `$isGm` server-side.

There are **no tombstones anywhere** in the VTT persistence layer (grepped `tombstone`, `_deleted`, `deletedIds` — only unrelated SQL `is_deleted` in `includes/`).

**Symptom:** player selects a token, presses Delete, it disappears — then reappears in the same square 1–30 seconds later. Nobody else ever loses it.

## 5. Any player full-snapshot save makes every GM-hidden token in that scene vanish on all other clients

`board-interactions.js:5806-5809`, `:5894-5907`, `:6227`, `:340-385`, `api/state.php:797`, `:801-803`

`sanitizePlacementsForPersistence(placements, { includeHidden: isGm })` strips every `hidden` placement from a non-GM snapshot (`:5902`). The server broadcasts `updates['placements']` verbatim with `deltaOnly: false`, and receivers treat that as authoritative:

```js
const replaceIncludedSceneArrays = delta.deltaOnly === false;   // 6227
// → mergePusherSceneEntries(..., { replaceScene: true }) → cloneArraySimple(incoming)
```

Every other client replaces its scene placement array with the player's hidden-stripped list.

**Reachable on the exact path from Finding 4** — the non-GM delete branch calls `clearDirtyTracking()` *before* `persistBoardStateSnapshot`, so `hasDirtyState()` is false → `useDelta = false` → full snapshot.

**Symptom:** a player presses Delete on their own token; on the GM's screen **every hidden monster in the scene instantly vanishes**, until the 30-second poll restores them.

## 6. The ops escape hatch is sticky — one overflow permanently disables the delta path

`board-state-service.js:288-297`, `:324-336`, `board-interactions.js:5431-5433`

New ops are inserted into `pendingBoardStateOps` at `:267`/`:274` *before* the threshold check at `:288`, and the `{escape: true}` return happens before `queueSave` at `:322`. So nothing is sent and the buffer only grows. Exhaustive grep of `pendingBoardStateOps` shows the only production drain is inside `savePromise.then` (`:326-335`) — unreachable when we returned early — plus a test-only reset at `:345-348`.

Thresholds: `PHASE_3B_MAX_OPS_PER_FLUSH = 64`, `PHASE_3B_MAX_SCENES_PER_FLUSH = 4`. **The 4-scene limit is the much easier trigger.** Since the buffer is a module-level `Map`, once crossed the delta path is dead for the rest of the page's life.

The code comment at `:293-296` ("the next op-based save will observe an empty or reduced buffer") is wrong.

Worst consequence is on deletion: removed placements are not in `dirtyPlacements`, so when the escape re-enters the snapshot path with any other placement dirty, `useDelta` is true and **the delta snapshot cannot express the removal at all**.

**Symptom:** GM box-selects 70 tokens and deletes them → gone locally, all 70 still present for everyone else, resurrected on the GM's next poll. From then on, every placement save in the session takes the heavier snapshot path.

## 7. Grid size/offset changes never propagate — clients render the same square at different pixels

`assets/js/state/store.js:80`, `utils/merge-helpers.js:174-178`, `board-interactions.js:6310-6315`, `:7412`, `:8082-8109`

`state.grid` drives all coordinate math and rendering, but it is only ever derived inside `initializeState`; `updateState` never re-derives it. Both sync paths refuse incoming grid data *on purpose*:

```js
// merge-helpers.js:176-178  (poll)
if (existingEntry?.grid) { mergedEntry.grid = JSON.parse(JSON.stringify(existingEntry.grid)); }
// board-interactions.js:6313-6315 (Pusher) — the grid apply is commented out
```

`clampPlacementToBounds` (`:8102-8107`) derives max column/row from the local `gridSize` and offsets, so the clamp applied at save time is client-specific too, and the op applier writes the received value with no re-clamp.

**Symptom:** GM changes grid 64 → 50, then drags a token to what is visually B4. Players (still on 64) render that same `column/row` two squares off, and stay wrong **until they reload the page**.

## 8. Server drops placement writes whose client clock is behind, then snaps the token back

`api/state_helpers.php:298-327`, `:390-405`; client stamps at `token-interactions.js:820`/`:841`, `board-interactions.js:7224`, `:8206`/`:8243`

Every non-ops placement save is gated by `if ($incomingTimestamp >= $existingTimestamp)`. `$existingTimestamp` is frequently a **server** stamp (`state.php:1019`, `:1058`, `:1161` use `microtime()`), while `$incomingTimestamp` is a raw browser `Date.now()`. There is no clock normalization anywhere.

**Symptom:** on a machine whose clock is a bit slow, arrow-key moves appear to work and then teleport back a second later — repeatedly, for that one client only. HTTP 200, no error.

## 9. Hidden monster positions and full stat blocks are broadcast to player clients

`api/state.php:746-754`, `:801-803`, `board-interactions.js:9330`, `bootstrap.php:476-495`

The GET path filters for players, but the **Pusher broadcast is unfiltered for both shapes** — ops are forwarded verbatim and full broadcasts forward `$updates['placements']` verbatim, on the shared public channel. Client-side the only thing hiding them is the renderer:

```js
if (!gmViewing && normalized.hidden) { return; }   // 9330
```

`restrictPlacementsToPlayerView` strips enemy monster snapshots from stored state but never filters by `hidden` — documented in its own test at `state/__tests__/player-view-filter.test.mjs:14-40`.

**Symptom:** a player with devtools open can read the grid position, name, HP, and stat block of every hidden monster the GM has staged, the moment the GM drops it.

*Reassuring counterpart:* `state_helpers.php:354-381` (`preserveMonsterSnapshotFields`) re-attaches monster data when a player's stripped entry returns, which is the only reason a player's save doesn't permanently destroy stat blocks. It covers exactly the keys `stripMonsterSnapshot` removes — correct today, but a fragile pairing.

## 10. Concurrent-drag arbitration is dead code on the ops path

`token-interactions.js:774-811`, fed only by `board-interactions.js:367-372`/`:397-400`, bypassed at `:6152-6169`

`commitDragPreview` consults `dragState.deferredUpdates` to yield to remote moves. That map is populated *exclusively* by `deferDraggedPlacementUpdate`, called only from `mergePusherSceneEntries` — i.e. only for `type: 'full'` broadcasts. The ops branch writes straight into the store and never touches `draggedTokenIds`. Since `USE_DELTA_SAVES = true` makes ops the normal path for every move, the intended arbitration never runs.

Both clients do converge here, so this is a correctness-of-intent bug rather than divergence.

## 11. A placement on an unknown level is invisible to *everyone*, including the GM

`token-levels.js:504-524`

```js
if (placementLevelIndex < 0 || viewerLevelIndex < 0) { return { visible: false } }   // 515
if (gmViewing) { return { visible: true } }                                          // 556
```

The unknown-level early return **precedes** the GM bypass. Because `mapLevels` only reaches other clients when a save includes `sceneState` — and placement ops never do — a token moved onto a level the receiving client hasn't learned about yet renders as nothing at all, with no console warning.

---

# TIER 3 — Map levels

## 12. The server strips `levelId` from every template/wall — walls relocate to Level 0 permanently

`api/state.php:3527-3640`, `:360`, `:1878-1880`

`normalizeTemplateEntry` is a **field whitelist** that builds a fresh literal per shape. `levelId` and `_lastModified` appear in none of the three branches (circle `:3547-3557`, rectangle `:3568-3597`, wall `:3623-3636`).

Worse: `state.php:360` runs `$nextState = normalizeBoardState($existing)` — on the **entire already-stored file**, unconditionally, on *every* POST regardless of role or whether the payload touches templates. So even the `template.upsert` op path (which does store `levelId`) has it erased by the next token move by anyone.

Client-side `state/normalize/templates.js:35-37` then silently reassigns `BASE_MAP_LEVEL_ID`, and `templateTool.notifyMapState` (`:24515-24544`) re-hydrates the GM's own shapes from the store, so the authoring GM's walls snap to Level 0 too without a reload.

**Symptom:** GM builds a wall on Level 2. It renders correctly at first, then within a second or two appears on Level 0 for everybody, showing through on the ground floor. Stripping `_lastModified` also degrades the template merge (sees `0`), so incoming template payloads always win.

*Note:* placements are **not** affected — `normalizePlacementsPayload:1897-1913` is a pass-through. Drawings are affected the same way as templates (`:2029-2044` keeps only `id/points/color/strokeWidth/authorId`).

## 13. The Pusher `full` handler ignores `userLevelState` and `claimedTokens`; the poller applies them

`board-interactions.js:6299-6341` applies only `combat`, `mapLevels`, and `fogOfWar`. The poller does the opposite — `mergeSceneStatePreservingGrid` (`merge-helpers.js:145-256`) clones the whole incoming scene entry and only special-cases `grid`/`combat`/`fogOfWar`.

This breaks the level-delete cascade, which `LEVELS_V2_PLAN.md:873` explicitly assumes propagates via snapshot save. `deleteSceneMapLevelCascade` (`scene-manager.js:925-1031`) remaps placements, `userLevelState`, and claims locally — placements propagate, the `userLevelState` remap does not.

**Symptom:** GM deletes Level 2. A player with no claimed token keeps a dangling `userLevelState.levelId`, fails `validLevelIds` in `normalize/map-levels.js:436-447`, and falls back to Level 0 — while the GM and server both say Level 1. Then ~30 seconds later the poll delivers the server value and their view jumps again.

## 14. `clearDirtyTrackingForOps` discards the whole scene's dirty state, silently losing fog reveals

`board-interactions.js:1100-1107`

```js
if (op.type === 'user-level.set' || op.type === 'user-level.activate'
    || op.type === 'claim.set' || op.type === 'claim.clear') {
  dirtySceneState.delete(sceneId);
}
```

The dirty flag is per-scene, not per-field. Fog reveals (`fog-of-war.js:701-706`) and stairs edits (`stairs-tool.js:314-317`) both `_markSceneStateDirty(sceneId)` then queue a delta save. Ops-only saves bypass that queue entirely (`:5550-5552`), so a level-nav click landing in between flushes its op, clears `dirtySceneState`, and the queued fog save then finds `hasDirtyState() === false` and bails at `:5352-5356` with *"Skipping save: no dirty entities."*

**Symptom:** GM reveals fog on Level 2, then clicks the level arrow. Players never get the reveal, and it's gone from the GM's own screen after reload.

## 15. Client op applier doesn't validate level ids; the server does — changes dropped with HTTP 200

`board-state-op-applier.js:254-296` accepts any non-empty `levelId`. `api/state.php:1490`/`:1531` reject unless `boardStateLevelIdIsValid` matches the scene's **stored** `mapLevels.levels` — and rejection is a silent `return $state` with a 200 and a version bump.

Reachable race: adding a level goes through the serialized snapshot queue, while the level-nav `user-level.set` op **bypasses** that queue (`:5550-5552`).

**Symptom:** GM adds a level and immediately navigates to it. GM's UI shows the new level; the server never records it; players don't move; GM's view reverts on the next full GET or reload. And per Finding 14, the snapshot fallback that would have carried the row never runs.

## 16. Stairs transitions follow whoever dragged the token, not the claimant

`stairs-trigger.js:284-338` sets `placement.levelId` then writes `userLevelState[<mover's own id>]` and emits `user-level.set` for the mover only. It never consults `claimedTokens` — unlike every other level-change path (`board-interactions.js:21292-21301`, `:21501-21507`), which call `applyClaimDrivenUserLevelUpdate`.

**Symptom:** GM drags a player's claimed token up a staircase. The token and the GM's view move to Level 1; the player's `userLevelState` stays on Level 0, so **their own character disappears from their screen.**

Also: the module-level `tokenStairState` map (`:32`) is keyed only by `placementId` and never cleared on scene switch, so a half-completed traversal in scene A can complete against scene B's stairs.

## 17. `resolveTokenLevelId` still uses the scene-global `activeLevelId` as a fallback

`token-levels.js:95-100` falls back to `mapLevelsState.activeLevelId` for a placement with no `levelId`. `normalize/map-levels.js:237-242` explicitly forbids this: *"the user's active level must never be used as a fallback for a token that lacks `levelId` — that would let old tokens 'follow' users between levels."* The old behavior is locked in by a test (`__tests__/token-levels.test.mjs:43`).

Two live effects:
- The GM mutates `activeLevelId` whenever a level is added or a level map uploaded (`scene-manager.js:263`, `:595`), so a legacy token's reported level changes for every client the moment the GM adds a level.
- `levelId === 'level-0'` fails the `levelIds.has(...)` check at `:91` and also falls through. In `getOpposingSameLevelBlockers` (`token-system/token-movement-controller.js:181-203`) that means **an enemy on Level 0 blocks movement for a token on Level 1** at the same square.

## 18. Every map-level UI action forces a full-state snapshot of all scenes

`scene-manager.js:136-150` always passes `forceFullSnapshot: true` — for add-level, upload-map, rename, delete, opacity, hide, display-mode cycle, raise/lower, scene activation, and player-map toggles. That publishes all placements plus **all scenes'** `sceneState`, and receivers get `deltaOnly: false` → placement arrays replaced.

Mitigated by the stale-version 409 guard at `api/state.php:371-383`, which closes the worst window. What remains: a GM mid-`applyStateToBoard`, or one whose `sceneState` was seeded by a partial helper, republishes its whole view of everyone's level state on a routine opacity-slider drag. Related — `ensureSceneStateDraftEntry` (`:23107-23132`) unconditionally overwrites `sceneState[key].mapLevels` with `normalizeMapLevelsState(existing ?? null)`; for a scene entry lacking `mapLevels` this writes an empty `{levels:[]}`, which a `forceFullSnapshot` then publishes as "this scene has no levels."

## 19. Three different level-id generators, all non-deterministic *(latent)*

`normalize/map-levels.js:49-50`/`:138-141`, `scene-manager.js:904-905`/`:1076-1079` (same scheme, separate seed), `api/state.php:2453-2456` (`uniqid`).

Any level entry reaching normalization without a string `id` gets a fresh one (`map-levels.js:98`, `state.php:2400`). Since normalization runs on essentially every read *and* on the whole stored file on every POST, an id-less level would get a different id per call, per client, and per save.

**Honest caveat:** I could not find a path in the current build that emits an id-less level. Reachable only via a hand-edited `board-state.json` or a legacy/foreign import. The `visible` → `hidden` migration (`map-levels.js:128-136`) is one-way and destructive in the same way, but no in-tree build still reads `visible`.

## 20. `map-level-renderer` is never reset on scene switch *(Low)*

`mapLevelRenderer.reset()` has exactly one call site — inside `loadMap()` (`board-interactions.js:8465`), which only runs when the base map URL changes. The scene-change branch (`:7367-7403`) resets the cutout tool and follow tracker but not the renderer, and `sync()` early-returns on an unchanged signature that contains no scene id. In practice level ids differ between scenes so I couldn't build a guaranteed stale-layer repro — flagging as a structural gap.

---

# TIER 4 — Combat tracker

## 21. Server-rejected combat writes are still broadcast, and receivers apply them unconditionally

`api/state.php:591-597`, `:545-548`, `:813-815`; `board-interactions.js:6307-6309`

The server gates combat writes behind `shouldApplyCombatStatePayload`. On the GM path it does `unset($config['combat'])` — but `$config` is a **by-value `foreach` copy** (`:584`, `:586`, no `&`). It correctly keeps the rejected combat out of `$nextState`, and equally correctly leaves `$updates['sceneState']` untouched. Then `:813-815` broadcasts `$broadcastData['sceneState'] = $updates['sceneState']` — the **raw sanitized client payload**, never the merged `$responseState`.

On every receiver:

```js
if (state.combat) {
  draft.boardState.sceneState[sceneId].combat = state.combat;   // 6307-6309
}
```

No version, sequence, `updatedAt`, or encounter-id comparison. Contrast the ops applier at `board-state-op-applier.js:310-315`, which *does* gate — **but that path is dead code in production.** `persistCombatStateOp` (`board-state-service.js:371-398`) is referenced only by its own definition and one unit test; every real combat write goes through `persistCombatState`, i.e. the ungated `:6307` path.

**Symptom:** GM does anything carrying `sceneState` (fog edit, grid, map levels — `board-state-service.js:494-503` always attaches `combat` to a `sceneState` snapshot). Server discards the stale combat; every player's store is overwritten with it. Players and server now disagree about round, whose turn, and the completed list.

## 22. Server-side sequence bumps are invisible to the author, so the author's *next* combat write is silently dropped

`api/state.php:1394-1396`, `advanceAcceptedGmCombatStatePayload:3065-3080`, `:746-754`; `board-interactions.js:12805-12806`

When a `combat.set` is accepted the server may rewrite `sequence = existing+1`. The broadcast carries the **client's original** op, so receivers re-derive the same bump and match the server. The author does not — it sets `combatStateVersion` from its own pre-bump snapshot.

Acceptance with `incoming <= existing` happens via the new-encounter bypass (`:2999-3006`) and the End-Combat bypass (`:1388-1393`) — so **Start Combat and End Combat are exactly the operations that leave the GM's local sequence below the server's.**

**Symptom:** GM presses Start Combat, then starts a turn. That write carries a too-low sequence, is rejected by the server *and* by every receiver, and never recovers (Finding 2).

## 23. An empty tracker render clears whose turn it is on the GM's screen

`combat-renderer.js:156-159`, called from `board-interactions.js:9228` and `:9267`

Verified brace structure: `:83` opens `if (!options?.skipPrune) {`, `:92` closes it, `:94-154` is unguarded work, and then:

```js
const activeCombatantId = getActiveCombatantId();
if (activeCombatantId && !renderedRepresentatives.has(activeCombatantId) && gmViewing) {
  callbacks.setActiveCombatantId?.(null);
}
```

64 lines below the closing brace — unambiguously outside the guard. `skipPrune` is referenced exactly once in the file.

Both call sites pass `updateCombatTracker([], { activeIds: [], skipCache: true, skipPrune: true })` — an empty array — so `renderedRepresentatives` is always empty and the condition is always true. Neither honours `options.skipTracker`.

**Reachability is real and not rare:** `loadMap` sets `viewState.mapLoaded = false` (`:8463`), and the state-apply path calls `loadMap(nextUrl)` at `:7410` then `renderTokens(...)` synchronously at `:7415` — so **every map/scene change takes the empty branch at least once.** Also `:8494` (map URL cleared) and `:8556` (image error).

`pruneCompletedCombatants` at `:10068-10070` has the same shape.

**Qualification:** `setActiveCombatantId(null)` doesn't itself broadcast. Damage is local until a later `syncCombatStateToStore` picks up the null. In the `:7415` path `applyCombatStateFromBoardState` runs afterwards at `:7421` and may restore it; in the `:8494`/`:8556` paths nothing does.

## 24. Concurrent turn starts are last-write-wins with no notification to the loser

`combat/combat-locks.js:68-120`, `board-interactions.js:13904-13977` (player) and `:10632-10692` (GM), `api/state.php:3008-3022`

The lock lives inside the same synced combat blob, and `acquireTurnLock` only inspects **local** `turnLockState`. Both the GM (`force: isGmUser()`, `:10749-10751`) and any player overriding a confirm dialog bypass it. Two clients in PICK phase both validate (`combat-turns.js:56-59` returns `valid: true` for anyone during PICK), both write with `sequence = N+1`, and the server keeps one. The loser gets no error — its POST returns 200.

**Symptom:** two clients click start-turn within one round-trip. Both screens show *their* combatant as active; the rest of the table sees one of them. Not a skipped turn — a persistent disagreement, made permanent by Finding 2.

## 25. `combatSequence` is a local click counter, not a version of server state

`board-interactions.js:12605-12626`, early return at `:12729-12732`, keepalive at `:5593`

`createCombatStateSnapshot()` calls `buildCombatStateSnapshot` (which does `sequence + 1`, `combat-state.js:90`) and assigns to `combatSequence` at `:12624` **before** anything decides whether to save. `syncCombatStateToStore` then returns early at `:12729` when the serialization is unchanged.

**Consequence:** a client's *stale* combat blob can carry a *higher* sequence than the server's current state — which is exactly what lets the Finding 21 broadcast injection overwrite the visible tracker via `isCombatStateNewer` (`combat-state.js:128-147`).

## 26. `combat.updatedAt` is client `Date.now()` — ties decided by unsynchronized wall clocks

`combat-state.js:84`, `:128-147`; `api/state.php:3012-3020`

Server and client tie-break identically, so they *agree* — but the compared value is the authoring machine's clock. `sequence` dominates when both are `> 0`, so this is **ties only** (not the "permanently rejects a client" scenario one might assume). Ties are common because GM and players both write from the same base.

**Symptom:** in a simultaneous GM-vs-player turn write, the winner is whoever's laptop clock is further ahead. A GM whose clock is a minute behind loses every tie.

## 27. The poller's combat-freshness guard is dead code

`board-state-poller.js:186-200`

```js
const hasNewerCombatUpdate = incomingCombatUpdatedAt > currentCombatUpdatedAt;   // 200
```

Repo-wide grep returns exactly one hit — the declaration. Never read, never exported, no test reference. Its two inputs exist solely to feed it.

**Consequence:** the poller has **no combat-specific protection at all.** A poll response passing the `_version` and `authoredSnapshot` checks writes incoming combat straight into the store regardless of local freshness.

## 28. Tracker ordering — the reshuffle is real, but narrower than it looks

`board-interactions.js:15259-15274`, `:9318-9374`; `combat-renderer.js:23-54`, `:397-440`

Confirmed:
- Order is the **raw placements array order** — `getActiveScenePlacements` returns `boardState.placements[activeSceneId]` verbatim, no sort, no initiative field. No order is ever persisted.
- Three per-viewer filters run before the tracker sees the list: hidden (`:9330`), map-level visibility (`:9353`), fog (`:9360-9372`).
- `originalOrder` (`combat-renderer.js:29-35`) is an index into the **already-filtered** list.
- `prioritizedPcIds` is "first ≤4 entries with a `profileId`" **in that filtered order** (`:399-414`).
- `sortPlayerTrackerEntries` runs **only** when `!gmViewing` (`:48-54`). The GM sees raw placements order with no sort at all; players get the category sort. So GM and players diverge by construction.

**Corrected:** an *unrelated* token entering/leaving fog does **not** reshuffle the PCs. `originalOrder` is monotone in the underlying index, so removing an entry shifts later indices uniformly and preserves every relative comparison. A token with no `profileId` never enters `prioritizedPcIds`.

The reshuffle needs a **PC** token to cross the visibility boundary: if one of the first four profile-bearing entries drops out, the fifth PC is promoted into `prioritizedPcSet`, flipping it from category 1 to category 0 and jumping it above allies. That's a genuine, visible reorder.

The other visible jump: the `replaceScene` branch (`:349-351`) replaces local array order with the broadcast's order wholesale, so a client that has drifted snaps to server order on the next non-delta broadcast — tokens jump position in the tracker.

**Not substantiated:** no unstable comparator. `sortPlayerTrackerEntries:418-439` always falls through to `aIndex - bIndex` and never returns 0 for distinct entries; it is idempotent across re-renders. The instability is in the *input order*, not the sort.

**Also not substantiated:** turn-as-array-index. Whose turn it is is `activeCombatantId` (a string ID) plus `completedCombatantIds` throughout (`combat-state.js:17-22`, `combat-turns.js:141-178`). Reorders and adds/removes cannot desync the turn pointer. Round double-increment: also clean — `advanceCombatRound` is GM-gated with a `pendingRoundConfirmation` latch plus full re-validation after the dialog.

## 29. `pickNextCombatantId` reads a differently-ordered list on players vs the GM *(Medium)*

`combat-renderer.js:66` caches the **post-sort** array (`entries.sort()` at `:418` mutates the array then cached via `setLastCombatTrackerEntries`), so on a player `lastCombatTrackerEntries` is in player-sort order; on the GM it's placement order. `getWaitingCombatantsByTeam` (`board-interactions.js:11988-12002`) feeds that into `selectNextCombatantId`, which returns `pool[0]`.

**Symptom:** after a turn completes, the GM highlights combatant X as "next up" while the player's screen highlights Y. Cosmetic (focus isn't synced), but a real per-screen difference.

## 30. `turnLock` staleness compares the local clock against the remote holder's timestamp *(Medium)*

`combat-locks.js:157-171` — `now() - lock.lockedAt > 600000`, where `lockedAt` was stamped by a different machine. Applied at `board-interactions.js:12416-12423` (`effectiveActiveCombatantId = null`) and `:12832-12851` (`activeCombatantId = null`), and the `finally` at `:12481-12486` can then `syncCombatStateToStore()` — pushing the null out to the table.

**Symptom:** a client whose clock is ≥10 minutes ahead treats every lock as instantly stale, shows "nobody's turn", and can broadcast that clearing to everyone.

## 31. HP/damage snapshot fallback uses client `_lastModified` *(Medium)*

`board-interactions.js:19143`, `:19159`; `api/state_helpers.php:298-327`

Normal HP edits ship as a `placement.update` op and the server re-stamps `_lastModified` with its own `microtime` (`state.php:1161`) — skew-immune. But when non-placement state is also dirty (routine during combat, since damage records a turn effect and marks `turnEffects` dirty at `:12514`) it falls back to the snapshot path, which keeps the client timestamp.

**Symptom:** damage applied from a machine whose clock is behind is silently discarded and reverts to old HP on the next broadcast — a visible flip-flop on the HP overlay. Both directions.

## 32. `combatantTeams` is cleared every render, killing the team fallback *(Medium)*

`combat-renderer.js:37-46` does `combatantTeams.clear()` then sets from `entry.team` only. After any render `combatantTeams.has(id)` is true for every rendered combatant, so `getCombatantTeam` (`board-interactions.js:11955-11986`) returns at `:11960-11962` and never reaches the placement fallback (`:11974`) or the PC fallback (`:11979-11983`).

**Symptom:** a combatant with no explicit team resolves to `null` forever, lands in **neither** `waiting.ally` nor `waiting.enemy` (`combat-turns.js:105-109`), is never suggested as next up, and is never colour-coded. Same on all clients, so not strictly a sync bug — but it silently drops combatants out of turn rotation.

## 33. The combat timer is GM-tab-local, unsynced, and its report is never rendered *(Low)*

`board-interactions.js:653`; every call site is `isGmUser()`-gated. `combat-timer-service.js:79` uses raw `Date.now()`; nothing is written to board state; there is no pause/resume, only `startWaiting`/`stopWaiting`.

Two concrete consequences:
- `startCombat` is only called from `handleStartCombat` (`:12162`), so **after a GM page reload mid-combat** `state.combatActive` is false and `startTurn`/`startWaiting` return immediately (`:195-197`, `:163-165`) — the timer records nothing for the rest of the encounter and `finishCombat` returns `null`.
- `showCombatTimerReport` (`ui/combat-timer-report.js:326`) has **no callers anywhere in the repo**, and the `finishCombat()` return value is discarded at `:12233` and `:12473`. The feature is computed and thrown away.

*Clean:* the legacy standalone tracker is inert and is **not** a competing state source. `combat-tracker/api/combat.php` returns HTTP 410; `initiative-list.js` is a stub; `sync-service.js` is an unbound pass-through.

---

# TIER 5 — Reload, reconnect, session

## 34. `pageIsUnloading` is never reset — after any bfcache restore, all saves become fire-and-forget beacons

`persistence.js:13-26` sets `pageIsUnloading = true` on `pagehide`/`beforeunload`. There is **no `pageshow` handler anywhere in `dnd/`** (grepped: zero matches). `shouldUseKeepalive()` (`:35-37`) then returns true forever, so `persist()` takes the `sendBeacon` branch (`:161-171`) for every subsequent save and returns `createResult(true)` with **no `data`**.

Back/forward navigation and iOS/Android tab restore fire `pagehide` and restore from bfcache **without re-running `bootstrap()`**. From that moment:
- Every save is a beacon → `result.data` is null → `board-interactions.js:5501-5517` logs `Save response missing _version` and `currentBoardStateVersion` freezes.
- The server keeps bumping, so every save after the first is a stale-version POST → 409 (`api/state.php:371-384`) → **and a beacon cannot read the 409**, so the write is silently dropped.

**Symptom:** a user hits Back then Forward (or restores a mobile tab) and from then on their token moves, HP edits, and fog changes appear only on their own screen and never reach anyone. No error shown.

## 35. Beacon saves on tab-hide desync the version tracker and revert the next edit

`board-interactions.js:5645-5662`, `:5471-5479`, `:5513-5517`; `persistence.js:159-171`

`shouldUseKeepalive` is true whenever `visibilityState === 'hidden'` — **not only on unload.** So an alt-tab triggers `flushBoardStateWithKeepalive()` → beacon → `data: null`. The success branch runs fully (hash updated, dirty tracking cleared, `lastBoardStateSaveCompletedAt` set) but `newVersion` is `undefined`, so the client's version stays at `N` while the server moves to `N+1`. On return, `:5653` checks `hasDirtyState()` — already cleared — so nothing reconciles.

The next real edit POSTs `_version: N` → 409 → the handler at `:5524-5537` calls `clearDirtyTrackingForSave` then `applyBoardStateConflictSnapshot`, overwriting local state.

**Symptom:** alt-tab away and back, move a token → it snaps back and never reaches anyone. Exactly one edit lost per tab-switch.

## 36. `mergeBoardStateSnapshot` drops all four player-view routing fields

`merge-helpers.js:292-307` builds the merged result as an explicit whitelist:

```
{ activeSceneId, mapUrl, placements, sceneState, templates, drawings, pings } (+ metadata)
```

Everything else is **erased from the store** on each applied poll response (`poller.js:258-263`) and each 409 recovery (`board-interactions.js:1291-1294`) — including `playerMapDisabled`, `playerActiveSceneId`, `playerMapUrl`, `playerThumbnailUrl`, `thumbnailUrl`, and `_version`.

For players: after any 200 poll, `playerActiveSceneId` is gone. The next full broadcast carrying only `activeSceneId` (a GM scene activation, `api/state.php:816-818`) sets the player's `activeSceneId` to the **GM's** scene, and the remap at `:6363-6377` computes `hasPlayerMapRoute === false` and skips.

**Symptom:** a player's board jumps to whatever scene the GM is privately working in, **leaking the GM's map.** On the GM side, the "what players see" settings disappear from local state.

## 37. `_version` is stripped from the hydration GET, so the load-time version can't self-correct

The inline `bootstrap.php` snapshot **does** carry `_version` (`api/state.php:85` persists it, `bootstrap.php:154` loads the file whole, `bootstrap.js:43-58` preserves it, `store.js:53-57` spreads it). So `currentBoardStateVersion` is correct at T0.

The bug is on the *refresh* path: `normalizeBoardStateSnapshot` (`bootstrap.js:326-423`) whitelists fields and **never copies `_version`** (nor `_fullSync`). `hydrateFromServer` then spreads `{...draft.boardState, ...normalizedBoard}` (`:143-146`), keeping the *inline* version even though the applied content came from a fresher GET. Nothing in `hydrateFromServer` touches `currentBoardStateVersion`.

Window: T0 until the first 200 poll. The poller doesn't start until `pusherReady` resolves (`:7519-7523`), i.e. up to the **2500 ms timeout** at `pusher-service.js:108-113`.

**Symptom:** an action taken in the first couple of seconds after page load is silently undone by a 409. (Corroborated by the repo's own `LEVELS_V2_PLAN.md:889` note about 409s and hard-refresh as the workaround.)

## 38. `api/state.php` GET has no auth check — an expired session silently demotes a GM to player view

The GET branch (`:170-273`) calls `getVttUserContext()` at `:215` and uses it only to choose filtering at `:231-233`. Unlike POST (`:277-283`), there is **no `isLoggedIn` gate and no 401.**

With an expired session `$auth['isGM']` is false, so the response runs through `filterPlacementsForPlayerView`, which rewrites `activeSceneId`/`mapUrl`/`thumbnailUrl` to the *player* values (`bootstrap.php:439-458`) and strips `monster`/`monsterId` from placements (`:476-496`). The GM's poller gets a 200 and merges it.

**Symptom:** the GM's board silently switches to the players' scene mid-session and monster stat blocks vanish from their tokens, with no error anywhere.

## 39. Save failures are console-only — the client keeps rendering as if nothing is wrong

Grepped `assets/js` for `401`, `Authentication required`, `session expired`: **zero matches.** `persistence.js:223-227` `console.error`s and throws; after `retryLimit` (3) the result is `{success:false}`. `board-interactions.js:5518-5538` only handles version-conflict results; every other failure just nulls `pendingBoardStateSave` and returns. No toast, no banner, no reconnect prompt.

Reads keep working (Finding 38 — GET never 401s), so the poller reports healthy, and `pollErrorLogged` (`poller.js:62`, `:283-286`) suppresses even the one warning after the first.

**Symptom:** a player whose PHP session lapsed keeps playing normally on their own screen; none of their moves reach anyone; their tokens snap back whenever a full poll lands. Nobody, including them, gets any indication.

## 40. `applyGmActiveLevelOverride` / `applyPcTokenLevelOverride` mutate level state locally without persisting *(Medium)*

`bootstrap.js:223-322` write `sceneEntry.userLevelState[userKey] = {levelId, ...}` into the hydrated snapshot on every page load, but nothing marks the scene dirty. Because `mergeSceneStatePreservingGrid` starts from a deep clone of the *incoming* entry and only special-cases `grid`/`combat`/`fogOfWar`, the next applied poll overwrites `userLevelState` with the server's older value.

**Symptom:** after reload you're on the level the loader picked, then silently jump to a different level on the next 200 poll. Fog edits made before the jump land on the level the renderer *thought* was active — the code comment at `:266-271` documents exactly this failure class.

## 41. Hidden dirty placements are silently dropped from a player's delta save *(Medium)*

`board-interactions.js:5827-5848`, filter at `:5839` — `if (!includeHidden && isPlacementHiddenForPersistence(placement)) return false;` with `includeHidden = isGm`. Any player-side mutation to a hidden placement (automation/aura/stamina paths that call `markPlacementDirty` for a token the player can't see, e.g. `:19229-19232`, `:4056`) is dropped from the payload. `clearDirtyEntriesFromSnapshot` only clears ids that were *in* the snapshot (`:1111-1124`), so it leaks as a permanently-dirty entry.

## 42. `assetsVersion` is `time()`, so the cache-buster carries no version meaning *(Low)*

`bootstrap.php:236` `'assetsVersion' => time()`, consumed at `templates/layout.php:6`. Every page load gets a unique query string — no caching benefit, and no cross-client meaning. `dnd/version.php` / `Version::` is **not referenced anywhere under `dnd/vtt`** (grepped: zero matches), contrary to the workflow described in `CLAUDE.md`. `../css/style.css` (`layout.php:32`) has no `?v=` at all.

## 43. `_version` is absent from the pre-poll window, bypassing the server's stale-save guard *(Medium)*

Related to 37. While `currentBoardStateVersion` is 0, `snapshot._version` is omitted (`:5393-5395`), so `api/state.php:371-376`'s conflict check is **skipped entirely.** For a GM, a full snapshot in that window hits `$nextState[$key] = $value` (`:678`) — a wholesale replacement of `placements`.

**Symptom:** GM reloads mid-session; within the first ~3 s a full snapshot fires; any token another client added between page render and that save is deleted server-side with no 409.

---

# TIER 6 — Player turn-taking (added in follow-up investigation)

Investigated separately: **why a player clicking "Start Turn" doesn't reach other clients.**

Four of the obvious hypotheses were **wrong**, and they're recorded here so nobody re-chases them:

- There is **no** `isGmUser()` gate blocking the player's persist. `beginCombatantTurn:10784` calls `syncCombatStateToStore()` unconditionally, and that falls through to `persistCombatState` for non-GMs. All the `isGmUser()` checks in the chain (`:10564`, `:10548`, `:11748`, `:10750`, `:10764`, `:12392`, `:12451`) guard the correct direction.
- The player's payload **does** include the combat blob (`board-state-service.js:592-609`, `:494`, `:501-503`).
- The server's non-GM branch **does** handle combat — it's the *first* thing it does (`api/state.php:415-419`, `:433`, `:533-550`). No whitelist drops it.
- **The non-GM branch does broadcast.** This was my strongest suspicion and it's false: the `return` at `api/state.php:578` exits the `withVttBoardStateLock` closure (`bootstrap.php:135`), not the request handler, so control reaches the shared broadcast block at `:707-873`. Players are not limited to the 30 s poll.

The real cause is narrower: **players have no write-acknowledgement and no retry path. The GM has both.**

## 44. `buildCombatPayload` omits `_version`, so players can never receive a 409 or retry — CRITICAL

`board-state-service.js:592-609` returns only `{sceneId, sceneState}` — no `_version`, no `_socketId`, no `_deltaOnly`.

That single omission cascades:

- `api/state.php:371-384` — the stale-snapshot conflict check requires `$clientVersion !== null && > 0`. Players skip it entirely, so **a player can never receive a 409.**
- Therefore `board-interactions.js:5524-5537` → `applyBoardStateConflictSnapshot` (`:1314`) → `maybeReassertCombatIntent` (`:1358-1400`, with `MAX_COMBAT_CONFLICT_RETRY_ATTEMPTS`) is **structurally unreachable for players.** The entire re-assert machinery is GM-only by accident, not by design.
- `rememberGmCombatIntent` (`:1338-1342`) hard-returns `null` for non-GMs, so players get no local-intent protection either.
- Missing `_socketId` also means `api/state.php:872` calls `broadcastVttStateUpdate($broadcastData, null)` — the author isn't excluded at the Pusher layer. Caught by the second line of defence (`pusher-service.js:283-290` authorId match), so wasteful rather than incorrect.

## 45. A rejected player turn returns HTTP 200 and the client commits the fiction — CRITICAL

`api/state.php:533-550` — the player branch:

```php
$existingCombat = ...;
if (shouldApplyCombatStatePayload($combatState, $existingCombat)) { /* store */ }
// no else. no error. no flag in the response.
```

`:560` bumps `_version`, `:562` saves, `:852` responds `200 {success: true}` — whether or not the combat was applied.

`shouldApplyCombatStatePayload` (`:2981-3023`): with both sequences `> 0` and unequal, it returns `incoming > existing`; on equality it tiebreaks on `updatedAt`, which is each client's own `Date.now()` (`combat-state.js:84-90`; note `updatedAt` isn't passed in, so it defaults to local wall clock). **The client whose clock is behind loses every tie.**

Client side, `board-interactions.js:12794-12807` does the following on `success !== false`:

- `clearDirtyCombatFields(...)` — **discards the dirty-field protection** that was keeping `activeCombatantId` from being clobbered by `prepareCombatSnapshotForSync` on the next sync
- sets `combatStateVersion` / `combatSequence` / `lastCombatStateSnapshot` **unconditionally**

And the server's 200 body *already contains the authoritative combat* (`$playerView` at `:576-581`, echoed at `:852-855`) — the client throws it away.

**Symptom:** player clicks Start Turn. Their screen shows the turn started. The server never stored it. Nothing retries. The turn is gone with no trace on any layer.

## 46. The rejection fires *routinely* because player combat saves never read `_version` back — CRITICAL

`board-interactions.js:12762-12791` has no equivalent of the snapshot path's `:5501-5506`. Nothing feeds `result.data._version` back after a combat save.

So the player's `currentBoardStateVersion` falls **one behind after each of their own turns**. The next GM ops broadcast then fails the strict `+1` gap check at `:6126-6136` → `triggerBoardStateResync('version-gap')` → **the ops payload is discarded** → the player's `combatSequence` falls further behind the server's → their next Start Turn is rejected by Finding 45.

**This is the feeder that makes Finding 45 fire every time rather than occasionally.** It is self-reinforcing: each rejected turn widens the gap that causes the next rejection.

## 47. `beginCombatantTurn` mutates local state, then bails before syncing on a foreign lock — HIGH

`board-interactions.js:10701-10703` calls `setActiveCombatantId(representativeId)` **first**. Then `:10749-10751`:

```js
acquireTurnLock(..., { force: isGmUser() || options.forceTurnLock === true })
```

On failure → **bare `return`** at `:10756`, skipping both `markCombatTurnStateDirty()` (`:10763`) and `syncCombatStateToStore()` (`:10784`).

`combat-locks.js:93-99` fails acquisition when `existingHolder && existingHolder !== normalizedId && !force`. For a player, `force` is only true when `switchingActiveTurn` (`:13951`, `:13975`) — i.e. only when `activeCombatantId` is already set to a *different* combatant.

So: **foreign turn lock held + `activeCombatantId === null`** ⇒ the player's UI shows the turn started and **nothing is ever sent over the wire at all.**

Aggravating: `handlePlayerInitiatedTurn:13923-13932` prompts *"End that turn and start yours instead?"* but then calls `validateTurnStart(combatantId)` at `:13919` with **no `override` option**, and never forwards the confirmation into the lock acquisition. **The user's "yes" is discarded.**

Recovery is poor: a player cannot release a foreign lock (`completeActiveCombatant` uses `releaseTurnLock(getCurrentUserId())` at `:10924`), and `clearStaleTurnLock` only helps after **10 minutes**. Partially self-healing via `applyCombatStateFromBoardState:12424-12427`, which clears the local lock when an incoming snapshot has `activeCombatantId === null`.

## 48. Player combat writes go to a scene key the GM may not be reading — HIGH (config-dependent)

`syncCombatStateToStore:12649-12653` keys the combat write off `state.boardState.activeSceneId` and **returns early if it's null.**

But a non-GM's `activeSceneId` is rewritten to `playerActiveSceneId` (`bootstrap.php:439-444`, `board-interactions.js:6363-6376`), or set to `null` when `playerMapDisabled`.

- If the GM's active scene ≠ the scene pushed to players: the player writes `sceneState[B].combat` while the GM reads `sceneState[A].combat`.
- If `playerMapDisabled` is set: the player's Start Turn produces **no write at all.**

**Worth checking against the live `board-state.json` before doing anything else** — if this is the active configuration it explains the symptom on its own.

## 49. The GM's receive path silently drops the player's turn — mirror of Finding 45

`board-interactions.js:12331-12345` `shouldProtectLocalCombatIntent`, then `:12366-12372` `shouldApplyRemoteCombatState` → `combat-sync.js:120-142` → `isCombatStateNewer` (`combat-state.js:128-147`).

Same sequence comparison as the server, applied on receive. A player's state whose `sequence` isn't strictly greater than the GM's `combatStateVersion` is discarded on arrival.

*Cleared:* there is **no** "GM-authored-wins" rule for combat. `applyCombatStateFromBoardState:12320-12491` and the Pusher `full` branch `:6193-6403` contain zero `authorRole` / `authorIsGm` checks. `shouldProtectLocalCombatIntent` (`combat-sync.js:144-192`) is the only GM-favouring rule; it's armed only by `rememberGmCombatIntent` (non-GM hard-return), expires after 10 s, and only wins when the GM has a save in flight.

## 50. A third dead guard: the poller's GM-preference rule cannot fire

`board-state-poller.js:247-253` — "reject stale player snapshots when current state has newer GM data" — requires `snapshotUpdatedAt > 0`, read from `incoming.metadata` (`:137-157`).

`api/state.php` contains **no handling of `metadata` anywhere** (grep returns only a comment at `:25`), and `sanitizeBoardStateUpdates:1666-1790` has no `metadata` key, so it's dropped from `$updates` and never persisted. `incoming.metadata` is always null.

*This corrects the original report*, which treated this as active logic. It joins `hasNewerCombatUpdate` (Finding 27) and the ops-path combat gate (Finding 21) as **the third dead safety guard in the sync layer.** Three of the protections this code appears to have do not exist.

## 51. `combat.set` op is GM-only server-side but broadcast unconditionally — LATENT

`api/state.php:1370-1372` drops a non-GM `combat.set` op. But the broadcast at `:746-754` uses the raw `$ops`, so it'd be relayed anyway and applied by every receiver's `board-state-op-applier.js:298-319` → permanent server/client divergence.

Not reached today: `syncCombatStateToStore:12754` routes ops only when `latest?.user?.isGM`, and `persistCombatStateOp` is dead code. **Flagged because moving players onto the ops path — which is exactly what the plan below recommends — silently breaks combat unless this is fixed first.**

## Where the click actually dies

| # | Layer | Code | Result |
|---|---|---|---|
| 1 | Button render | `updatePlayerTurnStartButton:11743-11793` | OK |
| 2 | Candidate resolution | `getCurrentPlayerTurnCombatantId:11834-11896` (requires login ∈ `PLAYER_CHARACTER_USER_IDS`) | OK |
| 3 | Click → role fork | `:11780-11784` → `activateCombatTrackerTarget:10543-10561` | OK |
| 4 | Validation | `handlePlayerInitiatedTurn:13904` → `validateTurnStart:10425` → `combat-turns.js:56-59` | OK |
| 5 | **Turn lock** | `beginCombatantTurn:10749-10756` | **DIES (47)** on foreign lock — nothing sent |
| 6 | Dirty marking | `markCombatTurnStateDirty:10763` → `:1677-1685` | OK |
| 7 | Sync entry | `syncCombatStateToStore:10784` → `:12632` | OK — no role gate |
| 8 | Scene key | `:12649-12653` | **DIES (48)** if `playerMapDisabled` or scene mismatch |
| 9 | Snapshot | `createCombatStateSnapshot:12605-12626`, `prepareCombatSnapshotForSync` | OK |
| 10 | Payload | `buildCombatPayload:592-609` | **`_version` missing (44)** |
| 11 | Server accept | `api/state.php:545-548` | **DIES (45)** on sequence/clock loss |
| 12 | Respond | `:852` — `200 success:true` regardless | **no signal (45)** |
| 13 | Broadcast | `:813-815` — broadcasts **submitted**, not applied | flicker/divergence (21) |
| 14 | Client bookkeeping | `:12796-12807` | **commits a fiction (45)**, no `_version` read (46) |
| 15 | GM receive | `:12366-12372` → `isCombatStateNewer` | **DIES (49)** on sequence loss |

---

# Checked and CLEAN

Worth recording so these don't get re-investigated:

- **Nested ES-module cache-busting.** `assets/js/.htaccess:13-17` sets `no-cache, must-revalidate, max-age=0` on all `.js` under `assets/js` — exactly the set reachable via bare `import` specifiers. No other `.htaccess` overrides it. *Caveat:* wrapped in `<IfModule mod_headers.c>` with no fallback.
- **HTML document caching.** `index.php:4` → `bootstrap.php:30-35` `session_start()` emits `no-store, no-cache, must-revalidate` via the default `session.cache_limiter`. Stale-inline-snapshot-from-cache isn't reachable — though only incidentally.
- **`api/state.php` cache headers.** `no-store` on both 304 (`:187`) and 200 (`:265`); poller and hydration both use `cache: 'no-store'`. The APCu memo (`:218-228`) is correctly keyed by `(version, user)`.
- **localStorage / sessionStorage.** Only three uses in the whole tree: `layout.php:22` + `theme-settings.js:10,18` (`vtt.theme`), and `character-summary-panel.js:2217-2238` (one panel flag). **No** active scene, level, tool, zoom, or filter state is persisted client-side. The per-client divergence risk lives in server-side `userLevelState` instead (Finding 40).
- **Poller 304 handling.** `:93-99` correctly skips `.json()`, doesn't touch `lastHash`, resets `pollErrorLogged`. Tested at `board-state-poller.test.mjs:1119-1167`.
- **Poller pending-save bail-out doesn't poison `lastHash`.** Deliberate at `:127-135`; tested at `board-state-poller.test.mjs:77-153`.
- **Poller mode switching.** `reconfigure` is a correct no-op when unchanged, clears the old interval, fires an immediate poll only when entering fallback. Fully tested (`:834-1002`). The bug is that it's never *called* on network loss (Finding 3).
- **Server version monotonicity.** `bumpVttBoardStateVersion` (`api/state.php:81-87`) runs inside `withVttBoardStateLock` (`bootstrap.php:117-140`, `flock(LOCK_EX)`) on both branches. Two POSTs cannot share a version.
- **Placement identity.** `createPlacementId` (`board-interactions.js:27168-27175`) prefers `crypto.randomUUID()`. No index-based keys. `dedupePlacementsById` keeps the last occurrence and grafts monster data forward. No realistic collision path.
- **`placement.move` preserves `levelId`.** Both appliers mutate column/row in place only; `normalizePlacementsPayload` is a pass-through. The template-stripping bug (Finding 12) does **not** apply to tokens.
- **Fog is keyed correctly per level.** `fogOfWar.byLevel[levelId]` consistently keyed by resolved level id; PC auto-reveal is level-gated; the legacy shape migrates to `level-0` in both `bootstrap.php:168-183` and `api/state.php:3448-3456`, so bootstrap and GET/POST agree. Cross-level mixing is only reachable indirectly via Findings 13/15/40.
- **Player-view level filtering can't be persisted back.** All level filtering is presentation-only (early `return` in `renderTokens`, `root.hidden` in `applyTemplateLevelVisibility`). `commitShapes` serializes the in-memory array, not the DOM.
- **Grid clamp formulas agree** between keyboard and drag movement on a given client (`:8190-8232` vs `:8102-8103` are equivalent for integer widths).
- **Save responses aren't echoed into state** (only `_version` is read), so there's no server-echo snapback on the success path.
- **Double-init.** `mountBoardInteractions`, `initializePusher`, and `startBoardStatePoller` each have exactly one call site. Neither is idempotent (would leak the old interval / overwrite `pusherInstance` without disconnecting), but no path reaches them twice today. Latent only.
- **`ops-overflow` dispatch itself** is correct on both ends, and correctly declines to bump the version before resyncing. The failure is purely that the resync is swallowed (Finding 1).

---

# REMEDIATION PLAN

## The honest architectural assessment

Most of this codebase is fine. The op-based delta sync, the server file lock, the placement identity scheme, the fog-per-level keying — those are sound designs, and they should not be touched.

**But the combat state layer should be replaced, not patched.** Here's why, stated plainly:

The VTT has **three overlapping authority schemes running at once:**

| Scheme | Where | Authority | Ordering |
|---|---|---|---|
| `_version` | `api/state.php:81-87` | **Server**, inside `flock(LOCK_EX)` | Monotonic, correct |
| `combat.sequence` + `combat.updatedAt` | `combat-state.js:84-90` | **Client** | Client-derived, clock tiebreak |
| `_lastModified` per placement | `token-interactions.js:820` | **Client** | Wall clock, unnormalized |

Scheme 1 is already correct and already serializes every write. Schemes 2 and 3 are weaker, client-authoritative reinventions of it — and every single combat sync bug in this report traces to scheme 2.

To make scheme 2 work, the codebase has accumulated **six pieces of reconciliation machinery**:

`shouldApplyCombatStatePayload` (server) · `isCombatStateNewer` · `shouldApplyRemoteCombatState` · `shouldProtectLocalCombatIntent` · `rememberGmCombatIntent` · `maybeReassertCombatIntent`

…plus an advisory `turnLock` stored *inside the synced state it's meant to protect*. That's a distributed-consensus problem being solved with wall clocks and hope. **Three of the guards in this layer are already dead code** (Findings 27, 21, 50) — nobody noticed, because a guard that never fires is indistinguishable from one that always passes.

**The replacement is simpler than what's there now, and most of it already exists as dead code.**

### Recommended target: server-authoritative intent ops for combat

Instead of clients computing next-state and racing to publish it, clients submit **intent** and the server — already holding an exclusive lock — decides:

```
POST { ops: [{ type: 'turn.start', combatantId: 'x', expectedVersion: N }] }
  → server, inside withVttBoardStateLock:
      validate against CURRENT state (is combat active? is x waiting? is someone else's turn open?)
      apply or reject with a REASON
      bump _version
  → respond { applied: true|false, reason, combat: <authoritative state>, _version }
  → broadcast the APPLIED state, excluding the author socket
```

What this **deletes**:

- `combat.sequence` and `combat.updatedAt` entirely — `_version` already orders everything, server-side, under a lock
- All six reconciliation functions above
- `turnLock` as synced state — the server rejects a conflicting `turn.start` outright; no advisory lock, no 10-minute staleness timer, no clock comparison (kills Findings 30, 47)
- The client/server sequence-arithmetic drift that causes Findings 22, 25, 45, 46, 49

What it **fixes for free**: 21, 22, 24, 25, 26, 30, 44, 45, 46, 47, 49, 51 — twelve findings, including every Tier 6 item.

**Why this is low-risk rather than a rewrite:** the infrastructure is already built and already used for placements.

- `withVttBoardStateLock` — exists, works (`bootstrap.php:117-140`)
- The op dispatcher — exists (`api/state.php:1078+`)
- `board-state-op-applier.js` — exists, and its combat branch at `:310-315` **already has the correct freshness gate** (Finding 21)
- `persistCombatStateOp` (`board-state-service.js:371-398`) — **already written**, currently dead code referenced only by its own test

The work is mostly *deleting* the reconciliation layer and wiring up code that's already present. Estimate: **1–2 days**, versus roughly a day of whack-a-mole patching the six functions individually and still having clock-dependent behaviour.

### What NOT to rewrite

- **Placements.** The op path works. Fix the specific bugs (4, 5, 6, 8) individually.
- **The poller.** Well-tested, correct in isolation. Its bugs are dead code (27, 50) and callers that never fire (3).
- **Map levels.** Design is sound; Findings 12–20 are individual bugs, not a schema problem.
- **`_lastModified` (scheme 3).** Don't remove it — just have the server stamp it on every write path, as it already does for ops (`state.php:1161`). That's a one-line-per-path change, not a redesign.

---

## Phase 0 — Make the system tell the truth *(half a day, do this first)*

Nothing else is debuggable until failures are visible. Right now the server discards writes and returns 200.

1. **`api/state.php:545-548`, `:591-597`** — when `shouldApplyCombatStatePayload` rejects, return `combatApplied: false` with a reason. Same for the silently-ignored `placement.remove` (`:1084`) and rejected `user-level.set` (`:1490`, `:1531`).
2. **`api/state.php:813-815`** — broadcast the **applied** state (`$responseState`), not the submitted `$updates`. Fixes 21 and the Finding 45 flicker. *One-line change, high value.*
3. **`board-interactions.js:12794-12807`** — stop treating `success: true` as "stored." Read `result.data` (it already contains the authoritative combat) and don't clear dirty flags on a rejected write.
4. **Delete the three dead guards** (27, 50, and the unreachable branch in 21) rather than leaving them to imply protection that doesn't exist.
5. **Surface save failures in the UI** (39). A player whose session lapsed currently has no indication.

## Phase 1 — Minor fixes, no architecture change *(1 day, highest value per line)*

These are genuinely small and independently shippable:

| Fix | Where | Size |
|---|---|---|
| **F1** — exempt forced resyncs from the grace-period bail, or move the `pendingResyncAfterSave` block before `lastBoardStateSaveCompletedAt = Date.now()` | `board-interactions.js:5474-5491` | ~6 lines |
| **F3** — set `isConnected = false` for `unavailable`/`failed`/`connecting` in `handleStateChange`; add a catch-up GET on reconnect | `pusher-service.js:202-221` | ~10 lines |
| **F34** — add a `pageshow` handler resetting `pageIsUnloading` | `persistence.js:13-26` | 1 line |
| **F35** — only use `sendBeacon` on actual unload, not on `visibilityState === 'hidden'` | `persistence.js:35-37` | 1 line |
| **F44** — send `_version` and `_socketId` in `buildCombatPayload` | `board-state-service.js:592-609` | ~4 lines |
| **F23** — move the `setActiveCombatantId(null)` block inside the `!skipPrune` guard | `combat-renderer.js:156-159` | brace move |
| **F12** — add `levelId` + `_lastModified` to the template/wall whitelist | `api/state.php:3547-3636` | ~6 lines |
| **F36** — add the four `player*` fields + `thumbnailUrl` + `_version` to the merge whitelist | `merge-helpers.js:292-307` | ~6 lines |
| **F37** — copy `_version` through `normalizeBoardStateSnapshot` | `bootstrap.js:326-423` | 1 line |
| **F38** — add an `isLoggedIn` gate + 401 to the GET branch | `api/state.php:170-273` | ~4 lines |
| **F27/F6** — delete `hasNewerCombatUpdate` and its two dead inputs | `board-state-poller.js:186-200` | deletion |
| **F32** — don't `clear()` `combatantTeams` every render, or fall through when the value is null | `combat-renderer.js:37-46` | ~3 lines |

**F48 is a config check, not a code fix** — inspect the live `board-state.json` for `playerMapDisabled` / a `playerActiveSceneId` that differs from `activeSceneId`. If either is set, that alone explains the turn symptom and costs nothing to verify.

## Phase 2 — Replace the combat authority layer *(1–2 days, the recommended rewrite)*

Order matters here:

1. **Fix Finding 51 first.** `api/state.php:1370-1372` drops non-GM `combat.set` ops but `:746-754` broadcasts them anyway. Moving players onto the ops path without fixing this creates permanent divergence. Non-negotiable prerequisite.
2. **Add intent ops** server-side: `turn.start`, `turn.complete`, `round.advance`, `combat.start`, `combat.end`. Validate each against current state inside the existing lock. Return an explicit accept/reject with reason.
3. **Route `syncCombatStateToStore` through `persistCombatStateOp`** for both roles (remove the `latest?.user?.isGM` gate at `:12754`). The function already exists.
4. **Delete** `combat.sequence` / `combat.updatedAt` and the six reconciliation functions. Let `_version` be the only ordering.
5. **Delete `turnLock`** as synced state. Server rejection replaces it. Thread the existing "End that turn and start yours instead?" confirmation (`:13923-13932`) into an explicit `force: true` on the op — that's where the user's "yes" should have been going all along (Finding 47).
6. **Move `setActiveCombatantId` after** acquisition/acknowledgement in `beginCombatantTurn` (`:10701` → after `:10751`) so local state never leads the server.

## Phase 3 — Remaining correctness work *(1–2 days)*

1. **F2** — add a content hash to the ETag, or stop advancing `currentBoardStateVersion` on partial applies (`:6152-6189`). Without this, any residual divergence is still permanent.
2. **F4 + F5** — the player-delete path. Either give players a real delete (tombstones or a server-validated `placement.remove` that accepts non-GM for non-hidden tokens), or remove the keybinding for players. Currently it fails *and* nukes hidden tokens for everyone (`:5902`).
3. **F6** — clear or trim `pendingBoardStateOps` on escape (`board-state-service.js:288-297`), and raise `PHASE_3B_MAX_SCENES_PER_FLUSH` from 4 — that's the easy trigger.
4. **F7** — apply incoming grid state, or make coordinates resolution-independent. Currently both sync paths refuse grid data *on purpose* and clients render the same square at different pixels.
5. **F8, F26, F31** — have the server stamp `_lastModified` / `updatedAt` on every write path (it already does for ops at `:1161`). Removes all clock-skew dependence.
6. **F9** — filter the Pusher broadcast for hidden placements, or move to per-role channels. Hidden monster stat blocks are currently readable by any player with devtools.
7. **F13–F18** — map-level fixes: apply `userLevelState`/`claimedTokens` in the Pusher handler (13), make `dirtySceneState` per-field (14), route level ops through the snapshot queue (15), consult `claimedTokens` in stairs (16), remove the `activeLevelId` fallback (17).

## Sequencing rationale

Phase 0 before everything, because a system that silently discards writes and reports success cannot be debugged — you'll fix things and not be able to tell.

Phase 1 next, because Findings 1 and 3 restore the 30-second safety net. Right now that net is unreachable, which is why every other bug feels permanent instead of transient. With it working, the remaining bugs become *glitches* rather than *stuck state* — a much better position to work from, and it may be enough to make sessions playable while Phase 2 lands.

Phase 2 before Phase 3, because twelve findings evaporate rather than needing individual fixes.

**If you only do one thing:** Phase 0 item 2 (broadcast applied state) plus Phase 1 items F1 and F44. That's about 20 lines and addresses the turn-sync symptom directly.
