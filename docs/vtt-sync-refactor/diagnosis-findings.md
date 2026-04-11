# Diagnosis Findings (Authoritative)

**This is the permanent record of the diagnosis that produced this refactor plan. Treat it as the ground truth.** It was produced by three parallel investigation agents that read the client JS, the server PHP, and the file structure separately. If something in a fix doc contradicts this file, this file wins.

Line numbers in this file were accurate as of the diagnosis date. They may drift as fixes are applied. Always verify line references by reading the actual file before acting on them.

---

## The three fights

At a high level, the VTT has three sync systems running simultaneously that are not coordinated with each other:

1. **Pusher Channels** — hosted WebSocket service. Set up in `dnd/vtt/assets/js/services/pusher-service.js`. Subscribes to channel `vtt-board` on cluster `us3`. This is the intended primary transport.
2. **Board state poller** — a `setInterval` in `dnd/vtt/assets/js/ui/board-interactions.js` that GETs `dnd/vtt/api/state.php` at a fixed interval. Intended as a fallback, but in practice it runs at 1-second speed continuously because of a startup bug.
3. **Combat state refresh loop** — a separate `setInterval` in the same file that refreshes combat state every 5 seconds. Redundant with both Pusher and the main poller.

They race each other. Pusher delivers an update. The poller then fetches the same state from PHP but gets a stale or equal version. The combat refresh independently re-fetches. State bounces.

---

## Client-side findings

### C1 — CRITICAL: Poller starts *before* Pusher is initialized

**Location:** `dnd/vtt/assets/js/ui/board-interactions.js` around lines 3871-3874.

**What the code does:**
```js
applyStateToBoard(boardApi.getState?.() ?? {});
startBoardStatePoller();           // ← starts first
startCombatStateRefreshLoop();     // ← second
initializePusherSync();            // ← Pusher only starts after the pollers
```

**Why it's broken:** Inside the poller's `start()` function (around line 319), the interval is picked based on `isPusherConnected()`:

```js
const BOARD_STATE_POLL_INTERVAL_MS = isPusherConnected()
  ? 10000   // 10 seconds if Pusher is up
  : 1000;   // 1 second otherwise
```

This is a `const` computed **once**, at the moment `start()` runs. Because Pusher hasn't been initialized yet at that point, `isPusherConnected()` returns false, and the interval is frozen at **1 second for the rest of the page's life**, even after Pusher connects a fraction of a second later.

**Impact:** Every player is hitting the server once per second for the entire session, regardless of whether Pusher is working. This is the biggest contributor to the "laggy, constantly updating" feel.

### C2 — CRITICAL: Pusher connection changes don't reconfigure the poller

**Location:** `dnd/vtt/assets/js/ui/board-interactions.js` around lines 2987-2996, inside `handlePusherConnectionChange`.

**What the code does:** The handler receives connection state events from Pusher but only logs them. The body contains a comment literally admitting the fix hasn't been done:

```js
function handlePusherConnectionChange(state) {
  pusherConnected = state.connected;
  console.log('[VTT Pusher] Connection state:', ...);
  if (state.connected) {
    // The poller will naturally fetch fresh state on its next tick
    // We could also trigger an immediate fetch here if needed
  }
}
```

**Impact:** Even if you fix C1, when Pusher drops and reconnects during a session, the poller will never adapt. It needs a reconfigure path.

### C3 — HIGH: The poller and Pusher are not coordinated

**Location:** `dnd/vtt/assets/js/ui/board-interactions.js` around lines 145-162 (the poll handler's pending-save check).

**What the code does:** The poller checks `hasPendingSave` before applying its own fetched state, and if there's an outstanding save it skips that tick. But **Pusher updates are always applied** (subject only to the version check in `pusher-service.js:197-201`). There is no coordination between "I just received a Pusher update" and "the next poll should not apply older data."

**Impact:** This is the mechanism that causes snap-back. Sequence:
1. GM drags token. Client POSTs save.
2. Server saves, broadcasts via Pusher.
3. Other players' Pusher receives the new state and applies it.
4. One of those clients' poller fires. It fetches from `state.php`. If the version race (S1) gave this fetch an equal or older version, or if timing is just unlucky, the poller can apply state that looks "current" but is actually behind the Pusher update.
5. Token snaps back.

### C4 — HIGH: No socket ID sent with saves (self-dedup is username-based)

**Location:** `dnd/vtt/assets/js/services/pusher-service.js:203-214` and `dnd/vtt/assets/js/services/board-state-service.js:224-226`.

**What the code does:** Self-dedup (not receiving your own broadcasts back) is done by comparing the Pusher event's `authorId` to the current user's ID:

```js
const currentUserId = normalizeUserId(getCurrentUserIdFn());
const updateAuthorId = normalizeUserId(authorId);
if (currentUserId && updateAuthorId && currentUserId === updateAuthorId) {
  // skip own update
}
```

`board-state-service.js` accepts an optional `_socketId` in the payload but the client never actually sets one.

**Impact:** If two users share a name, or a user's ID is missing, they will receive their own broadcasts back and see jitter. The correct solution is to thread Pusher's own `socketId` through every save and let the server pass it to Pusher's `exclude` parameter.

### C5 — MEDIUM: Every change sends the entire board

**Location:** `dnd/vtt/assets/js/services/board-state-service.js:39-52` and the `persistBoardStateSnapshot` function in `board-interactions.js` around lines 2144-2221.

**What the code does:** On every token move, the client builds a snapshot of the full board state — placements, templates, drawings, pings, scene state, everything — and POSTs it as one payload. There is no "diff" format.

**Impact:** Large HTTP payloads, slower round trips, more time in flight for race conditions. Makes snap-back more likely because the window where stale data can be applied is wider.

### C6 — MEDIUM: Third polling loop (combat state, 5 seconds)

**Location:** `dnd/vtt/assets/js/ui/board-interactions.js` around lines 2704-2729.

**What the code does:** A separate `setInterval` fires every 5 seconds to refresh combat state via its own code path. Runs alongside the main poller and Pusher.

**Impact:** Combat updates can lag by up to 5 seconds even when everything else is working. The loop is labeled "backup fallback" in a comment but runs unconditionally.

### C7 — MEDIUM: Grace period after saves is 1.5 seconds, poller is 1 second

**Location:** `board-interactions.js:1531` defines `SAVE_GRACE_PERIOD_MS = 1500`. The poller runs at 1 second.

**Impact:** A single poll can sneak in near the end of the grace window. The math is supposed to block 1.5 polls but jitter can let the second poll through.

### C8 — MEDIUM: Overlay state rebuilt from scratch on every state notify

**Location:** `dnd/vtt/assets/js/state/store.js:1026-1057` and the rebuild logic in lines 794-862.

**What the code does:** `syncBoardOverlayState()` is called inside `notify()` and rebuilds overlay masks from scratch. Every state update — including every Pusher tick — triggers this.

**Impact:** Performance tax proportional to overlay complexity, applied on every sync tick.

### C9 — LOW: Stamina sync logic is scattered

**Location:** `board-interactions.js:32-74` (BroadcastChannel posting) and `token-library.js:7-40, 109-127` (cache and prefetch).

**Impact:** Two halves of one feature in two files. Editing stamina behavior requires finding both halves. Refactor candidate, not a correctness bug.

---

## Server-side findings

### S1 — CRITICAL: Version number is incremented *outside* the state lock

**Location:** `dnd/vtt/api/state.php` around lines 196 (start of `withVttBoardStateLock` block), 458 (end of the lock closure), 461 (increment call).

**What the code does:**
```php
$responseState = withVttBoardStateLock(function () use (...) {
    // ... merge and write board-state.json, all under flock() ...
    return $nextState;
});                                            // ← lock released here

// Race window: any other request can now acquire the lock
$newVersion = incrementVttBoardStateVersion(); // ← OUTSIDE the lock
```

**Why it's broken:** Two simultaneous POSTs can both release the lock, then both call `incrementVttBoardStateVersion`, and depending on interleaving they can read the same "current" version and both return the same "new" version.

### S2 — CRITICAL: The version file itself has no lock

**Location:** `dnd/vtt/api/state.php:28-36`.

```php
function incrementVttBoardStateVersion(): int {
    $current = getVttBoardStateVersion();   // ← read
    $next = $current + 1;                    // ← race window
    saveVttJson(VTT_VERSION_FILE, [...]);    // ← write
    return $next;
}
```

Classic read-modify-write with no `flock()`. Even fixing S1 by moving this inside the board state lock wouldn't fully solve the underlying "separate file, separate race" design — the real fix is consolidating the version into `board-state.json` itself so there's only one thing to lock.

### S3 — HIGH: Pusher broadcast is synchronous and blocks the client's response

**Location:** `dnd/vtt/api/state.php:501-502` and `dnd/vtt/lib/PusherClient.php:188, 198`.

```php
// state.php
broadcastVttStateUpdate($broadcastData, $clientSocketId); // BLOCKING
respondJson(200, [...]);
```

`PusherClient.php:188` sets a 5-second cURL timeout and line 198 does a blocking `curl_exec`. If Pusher is slow or rate-limited, every save blocks the client for up to 5 seconds before returning 200.

**Impact:** The player who moved the token sees their own UI freeze until the Pusher broadcast completes. Everyone else sees the move instantly (once Pusher delivers), so the *sender* experiences more lag than the *receivers*.

### S4 — HIGH: Expensive GET endpoint hit by the polling fallback

**Location:** `dnd/vtt/api/state.php:120-147` for the GET handler, `dnd/vtt/bootstrap.php:143-202` for `getVttBootstrapConfig`.

**What the code does:** Every GET to `state.php` does:
- `session_start()`
- Load `scenes.json`
- Load `tokens.json`
- Load `board-state.json`
- Normalize fog of war
- Filter tokens and placements for the player's view
- Load chat participants
- Return the full state as one JSON blob

**Impact:** With five players polling once per second (because of C1), that's five full-board reads per second. Disk I/O, CPU, session I/O, all burned continuously even when nothing is happening. There is no "give me changes since version X" endpoint.

### S5 — HIGH: Pusher failures are invisible to the client

**Location:** `dnd/vtt/api/state.php:502` and `PusherClient.php:203-210`.

```php
broadcastVttStateUpdate($broadcastData, $clientSocketId); // return value ignored
respondJson(200, [...]);                                    // always 200
```

If Pusher's HTTP call fails (timeout, rate limit, wrong secret, network), the server logs to `error_log` and returns 200 OK to the client. The client has no way to know the broadcast did not go out and therefore does not retry or fall back.

### S6 — MEDIUM: Whole-state broadcast instead of deltas

**Location:** `dnd/vtt/api/state.php:467-500`.

The broadcast payload includes the full placements array, full templates array, full drawings array, full scene state, and so on, on every save. For a campaign with many tokens or large drawings, this can approach Pusher's 10 KB message size limit.

### S7 — MEDIUM: `session_start()` on every request

**Location:** `dnd/vtt/bootstrap.php:40`, called from `state.php:122` and `:150`.

Every GET and POST calls `ensureVttSession()`, which calls `session_start()`. With file-based sessions this is disk I/O on every request. Compounded by the 1-second polling, this is measurable.

### S8 — HIGH (CLASSIFIED ELSEWHERE): Pusher secret committed to the repository

**Location:** `dnd/vtt/config/pusher.php:18`.

The Pusher `secret` is a plain string in a committed file. The public `key` is fine to commit, but the secret grants publish rights to the channel and must be rotated and moved out of version control. See `phase-0-security.md`.

---

## File structure findings

### F1 — `board-interactions.js` is 19,969 lines

It has at least 15 distinct responsibilities, many of them large enough to be their own file:

| Responsibility | Approximate line range |
|---|---|
| Stamina sync (BroadcastChannel) | 32-74 |
| Board state poller | 76-370 |
| Array/section merge utilities | 574-823 |
| Board mount + DOM setup | 872-1000 |
| Condition tooltips | 1210-1490 |
| Indigo rotation animation | 1686-1761 |
| Token drag and selection | 3917-4495 |
| Map pings | 4620-4960 |
| Movement queue processing | 4989-5135 |
| Grid calibration and view transform | 6133-6188 |
| Overlay tool (factory function) | ~16005 onward |
| Template tool (factory function) | ~17244 onward |

The file has **global mutable variables at module scope** (examples: `isApplyingState`, `overlayLayerSeed`, `pusherConnected`, `combatStateRefreshIntervalId`) that many functions read and write. This is the mechanism by which edits in one area silently break behavior in another area.

It does have a large test file at `dnd/vtt/assets/js/ui/__tests__/board-interactions.test.mjs` (~156 KB), which is good news for refactoring — there is a safety net.

### F2 — Other oversized files

| File | Lines | Notes |
|---|---|---|
| `dnd/vtt/assets/css/board.css` | 4,553 | Should split by concern (grid, tokens, overlay, effects). |
| `dnd/vtt/assets/js/state/store.js` | 2,128 | Mixes public state API with 40+ normalization helpers. |
| `dnd/vtt/assets/js/ui/token-library.js` | 1,985 | UI + stamina cache + context menus tangled. No direct tests. |
| `dnd/vtt/api/state.php` | 1,844 | Controller + sanitization + Pusher broadcast + normalizers. No tests. |
| `dnd/vtt/assets/js/ui/scene-manager.js` | 1,487 | Scene UI + overlay upload widget tangled. |
| `dnd/vtt/assets/css/settings.css` | 1,266 | Large. |

### F3 — Duplicated normalization between PHP and JS

Both `dnd/vtt/assets/js/state/store.js` and `dnd/vtt/api/state.php` implement their own `normalizeOverlay`, `normalizeTemplate`, `normalizeCombat`, `normalizeGrid`, etc. There is no shared schema. When the two drift, sync breaks in subtle ways. Addressed by `phase-6-normalization-unification.md` (long term).

### F4 — No tests for `token-library.js` or `api/state.php`

Any refactor touching these needs to proceed extra carefully. Either write tests first, or make changes behavioral-equivalent and verify manually.

---

## Top-5 root cause ranking

If you could only fix five things, these are the five that matter most, in order:

1. **C1 — Poller init order / locked interval.** This alone is probably half the lag.
2. **S1 + S2 — Version race.** This alone causes the snap-back symptom.
3. **S3 — Synchronous Pusher broadcast blocking saves.** Felt most by whoever is moving tokens.
4. **C3 — Poller and Pusher not coordinated.** Amplifies snap-back.
5. **S4 — Expensive GET endpoint hit once per second per player.** Server CPU and disk tax.

All five are in Phase 1 and Phase 2 of the refactor plan.
