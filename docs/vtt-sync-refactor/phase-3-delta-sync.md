# Phase 3 — Delta Sync (Performance)

> **Prerequisite reading:** `README.md`, `diagnosis-findings.md` (findings C5 and S4 and S6), `pre-flight-investigation.md`. All of Phase 1 and Phase 2 must be committed.

## Context

Phase 3 is a performance improvement project. After Phase 1 and Phase 2, the VTT should feel fast and correct. Phase 3 addresses the remaining inefficiencies:

- Every state change sends the **entire** board (`persistBoardStateSnapshot`) — placements, templates, drawings, pings, scene state, fog, combat. For a busy session this can be hundreds of KB per save.
- Every Pusher broadcast includes the same full state.
- The GET endpoint does heavy work on every poll, even when nothing has changed.
- The polling fallback has no conditional fetch — it always downloads the full state.

Phase 3 is significantly bigger in scope than Phase 1 or 2. It touches the client state flow, the server POST handler, the broadcast payload shape, and adds a new conditional GET path. It is worth doing, but **it is not required for the lag to feel fixed.** If the user is already happy after Phase 1 + 2, stop and ask before starting Phase 3.

Because of the scope, Phase 3 is split into four sub-fixes that should be done in order:

- **3-A:** Add conditional GET with `If-Version-Match`. Low risk, big server win.
- **3-B:** Change save payloads from full-snapshot to delta ops. Medium risk.
- **3-C:** Change Pusher broadcasts from full-state to delta ops. Depends on 3-B.
- **3-D:** GET endpoint caching of the loaded state. Low risk.

Each sub-fix has its own section below. Treat each as a separate commit.

## Prerequisites

- All of Phase 1 and Phase 2 committed.
- Tests green.
- User has confirmed they want to do performance work on top of the already-done correctness fixes.

---

## Phase 3-A — Conditional GET with `If-Version-Match`

### Context

The polling fallback hits `GET /api/state.php` once every 30 seconds (safety net) or once per second (fallback). Every hit loads three JSON files and returns the full state even when nothing has changed. The client could send its known version and the server could return 304 Not Modified when there's no news.

### Files you will need to load into memory

1. `dnd/vtt/api/state.php` — the GET handler, around lines 120-147.
2. `dnd/vtt/assets/js/services/board-state-service.js` — whatever function the poller uses to fetch state.
3. `dnd/vtt/assets/js/ui/board-interactions.js` — the poll handler (around line 300).

### Investigation

1. Find the poll's fetch call:
   ```
   Grep for "fetch(" in dnd/vtt/assets/js/ui/board-interactions.js near the poll function
   ```
2. Confirm `_version` is accessible on the client when the poll fires. It should be after Phase 2-3.
3. Confirm `getVttBoardStateVersion()` is cheap enough to call on every GET. It should be: one small JSON read (or zero reads after Phase 2-2 if the version is embedded in board-state.json).

### Gotchas

- `If-None-Match` is the standard HTTP header, but it expects an ETag string (weak or strong). You can use it: `ETag: "v42"`, `If-None-Match: "v42"`. OR you can invent a custom `X-Board-State-Version` header. Prefer the standard ETag to match web caching conventions.
- 304 Not Modified must have no body. Make sure `respondJson` is not called — just echo the right status code and return.
- The poller must handle the 304 case gracefully. A 304 is a successful no-op, not an error.
- Make sure the ETag is weak-compared or exact — if the client sends `"v42"` and the server returns `"v43"`, the strings differ and full state is returned. Correct.

### The change

**A1.** In the GET handler, before loading any state, check the `If-None-Match` header:

```php
$clientVersion = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
$currentVersion = getVttBoardStateVersion();
$currentEtag = '"v' . $currentVersion . '"';

if ($clientVersion !== '' && $clientVersion === $currentEtag) {
    header('ETag: ' . $currentEtag);
    http_response_code(304);
    exit;
}

// ... existing full-state load and respond ...
header('ETag: ' . $currentEtag);
respondJson(200, [ ... ]);
```

**A2.** In the poll fetch call, include the header if we have a known version:

```js
const headers = { 'Accept': 'application/json' };
const lastVersion = getLastAppliedVersion();
if (typeof lastVersion === 'number' && lastVersion > 0) {
  headers['If-None-Match'] = `"v${lastVersion}"`;
}
const response = await fetchFn(endpoint, { headers });
if (response.status === 304) {
  // Nothing new. Exit early.
  return;
}
// ... existing response processing ...
```

### Verification

- Watch Network tab. Safety-net polls should return 304 when nothing has changed. Payload size should be near zero.
- Move a token, wait for the next poll — it should return 200 with fresh state.
- JS tests still pass.

### Commit message

```
vtt-sync: phase 3-A conditional GET for polling fallback

The polling fallback GET now sends If-None-Match with the client's
known version, and the server returns 304 when the version hasn't
moved. Safety-net polls (every 30s when Pusher is up) are now
effectively free on the server - no disk reads, no filtering, no
serialization when nothing has changed.
```

---

## Phase 3-B — Save Delta Ops Instead of Full Snapshots

### Context

The client's `persistBoardStateSnapshot` builds a full board state and POSTs it on every change. This is wasteful and creates race windows. Replace it with an "ops" format: `{ ops: [ { type: 'move', sceneId, placementId, x, y }, ... ] }`. The server applies ops atomically inside the lock.

### Files you will need to load into memory

1. `dnd/vtt/assets/js/ui/board-interactions.js` — every call site of `persistBoardStateSnapshot`. Search the file.
2. `dnd/vtt/assets/js/services/board-state-service.js` — `persistBoardState` and the save queue.
3. `dnd/vtt/api/state.php` — the POST handler merge logic.

### Investigation

1. List every type of state change that currently triggers a save. Start from:
   ```
   Grep for "persistBoardStateSnapshot" in dnd/vtt/assets/js
   Grep for "persistBoardState(" in dnd/vtt/assets/js
   ```
   Record each distinct change type. Categories probably include: token move, token add, token remove, token stamina change, template add/move/remove, drawing add/remove, ping, scene switch, fog edit, combat state change.

2. For each category, decide the op shape. Example:
   ```
   { type: 'placement.move', sceneId, placementId, x, y }
   { type: 'placement.add', sceneId, placement: { ... } }
   { type: 'placement.remove', sceneId, placementId }
   { type: 'template.upsert', sceneId, template: { ... } }
   { type: 'fog.edit', sceneId, region: { ... } }
   { type: 'combat.setTurn', turnIndex }
   ```

3. Check the store.js normalizers. Each op will be applied by mirroring one of them.

### Gotchas

- **This is the biggest change in the plan.** It touches every write path. Do it under a feature flag:
  ```js
  const USE_DELTA_SAVES = true;
  ```
  So you can flip back to the old snapshot path if something breaks.
- **Keep the snapshot path as a fallback** for operations that don't easily map to ops (e.g. bulk fog edits). Mixed mode is fine.
- **The server must still return the full resolved state** (or the delta applied) for the client to reconcile. Keep the response shape the same as today so existing client code works.
- **Tests.** The `board-interactions.test.mjs` probably has many tests that indirectly exercise save paths. They may break. Expect to update 5-20 tests.
- **Add a new test file** `__tests__/save-ops.test.mjs` that tests each op type in isolation.
- **Do this incrementally.** Start with just `placement.move` (the most common op), verify it works end to end, then add the other types one at a time. Do not try to do all op types in one commit.

### The change (high level)

**Client:**
- Introduce a `queueOp(op)` function that adds an op to a per-save-tick buffer.
- On debounced flush, POST `{ ops: [...] }` instead of a full snapshot.
- Keep an escape hatch: if the op list gets larger than N items or spans more than M scenes, fall back to a full snapshot.

**Server:**
- Detect `$payload['ops']` vs `$payload['placements']` (etc).
- If ops: apply each op to the state inside the lock.
- If snapshot: the existing path.

This is a large change. The sub-fix doc intentionally stops at this outline — when you actually do it, expect to spend real time reading the current POST handler in detail and writing a small op-dispatcher.

### Commit granularity

- **Commit 1:** server accepts ops (but client still sends snapshots). Verify nothing breaks.
- **Commit 2:** client sends ops for `placement.move` only. Everything else still snapshots.
- **Commit 3:** client sends ops for all placement operations.
- **Commit 4:** templates.
- **Commit 5:** drawings.
- **Commit 6:** remove the snapshot fallback for anything that's now op-based. Leave it only for edge cases.

### Commit message (first commit)

```
vtt-sync: phase 3-B server accepts delta ops in state POST

The POST handler now recognizes a payload.ops array of typed operations
and applies them inside the state lock instead of treating the payload
as a full snapshot. Supported op types initially: placement.move. Full
snapshot behavior is unchanged for any payload that does not include
ops. No client code uses this yet - that lands in the next commit.
```

---

## Phase 3-C — Broadcast Delta Ops via Pusher

### Context

After 3-B, the server is applying ops internally. Now have it broadcast the ops to everyone else instead of the full state. Payload drops from hundreds of KB to a few hundred bytes.

### Gotchas

- **Pusher payload size limit is 10 KB** per message. You were getting close to it with full broadcasts; with ops you'll be comfortably under.
- **The Pusher subscriber on the client must know how to apply ops.** Mirror the server's op dispatcher on the client. Share the code if possible (requires Phase 6 normalization unification, which is far away — for now, duplicate it knowingly).
- **The version guard (Phase 2-3) still applies.** If a delta arrives out of order, the client should skip it. With ops, "skip" means the client's state is now inconsistent with the server. Fix: on any skipped op, trigger a full state re-fetch to recover.
- **Do not remove the existing full-state broadcast fallback.** Keep both paths. For op-based saves, broadcast ops. For snapshot saves (the fallback), broadcast a full state.

### The change (high level)

- Server: when a POST carries ops, broadcast `{ type: 'ops', version, ops: [...] }`. When it's a snapshot, broadcast the full state as before.
- Client: Pusher subscriber inspects `type`. If `ops`, apply each op. If full state, replace as before.
- If an op application fails or a version gap is detected, trigger a re-fetch from `state.php` to reset.

### Commit message

```
vtt-sync: phase 3-C broadcast ops over Pusher instead of full state

When a POST carries payload.ops, the server broadcasts a compact
{ type: 'ops', version, ops } message over Pusher instead of the full
board state. Subscribers apply the ops locally in the same order as
the server. Full-state broadcasts remain as the fallback path.

If a subscriber detects a version gap (e.g. dropped a message during
reconnect), it triggers a fresh GET from state.php to resync.
```

---

## Phase 3-D — GET Endpoint Caching

### Context

The GET endpoint loads three JSON files (`scenes.json`, `tokens.json`, `board-state.json`) on every hit. For the safety-net poller (30s) this is fine. But if a new player joins mid-session, they issue a burst of GETs. APCu can cache the result for a fraction of a second to serialize burst reads.

### Files

1. `dnd/vtt/api/state.php` — GET handler.
2. `dnd/vtt/bootstrap.php` — the load functions.

### Gotchas

- **APCu may not be enabled on the user's host.** Check with `apcu_enabled()` and fall back to uncached if not.
- **Cache invalidation must be bulletproof.** When any POST succeeds, invalidate the cache immediately (inside the lock, before releasing). Otherwise a GET right after a POST could return stale data.
- **Player-view filtering** depends on the requesting user, so the cache key must include the user ID and the version. Example key: `vtt:state:{version}:{userId}`.

### The change (high level)

- In the GET handler, after computing `currentVersion`, look up `apcu_fetch("vtt:state:$version:$userId")`. If hit, return it. If miss, load the state as normal, cache it for ~2 seconds, return.
- In the POST handler after a successful save, `apcu_clear_cache()` or at minimum `apcu_delete` for the invalidated keys (use a prefix-based delete if you can).

### Commit message

```
vtt-sync: phase 3-D cache loaded state in APCu per version+user

GET /state.php now caches the loaded+filtered state in APCu keyed by
(version, user_id). POST invalidates the cache. On hosts without APCu,
falls back to uncached loads.
```

---

## Verification for all of Phase 3

After each sub-fix, measure:

1. **Average payload size**. DevTools → Network → click a `state.php` request → Size column. Should shrink dramatically with 3-B/3-C.
2. **Server CPU per poll**. If you have access to `top`/`htop` on the host during a session, CPU usage should drop with 3-A and 3-D.
3. **Subjective feel.** The user should notice that chaotic moments — multiple players dragging tokens at once, combat turn changes, etc — no longer feel laggy.
4. **Regression.** All of Phase 1 and Phase 2's gains must be preserved. Run through the browser tests from those phases' Verification sections again.

## Rollback per sub-fix

Each sub-fix commits separately and can be reverted independently with `git revert <commit>`. Do not squash Phase 3 into one commit.
