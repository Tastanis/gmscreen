# Phase 1-2 — Make the Poller React to Pusher Connection Changes

> **Prerequisite reading:** `README.md`, `diagnosis-findings.md` (finding C2), `pre-flight-investigation.md`, and the commit message for `phase-1-1-init-order.md` must already be in git log.

## Context

After Phase 1-1, the poller picks the right interval on startup. But the poller is still only configured **once**, when `start()` runs. If Pusher drops mid-session (network blip, laptop lid close), the poller is stuck at whatever interval it chose at boot. Conversely, if Pusher reconnects after being down for a while, the poller keeps polling aggressively even though it should stand down.

This fix makes the poller reconfigurable. When `handlePusherConnectionChange` fires, it tells the poller to switch modes. There are only two modes:

- **Safety-net mode** (Pusher is up): poll every 30 seconds, purely to catch anything Pusher might have missed during a reconnect.
- **Fallback mode** (Pusher is down): poll every 1 second, full active fallback.

## Prerequisites

- Phase 1-1 committed to `claude/app-communication-architecture-y5g1l`. Confirm with:
  ```bash
  git log --oneline -20 | grep "phase 1-1"
  ```
- Tests green before starting.

## Files you will need to load into memory

1. **`dnd/vtt/assets/js/ui/board-interactions.js`** — focus on:
   - The board state poller definition. Search for `createBoardStatePoller` or the function that returns `{ start, stop }` and reads `BOARD_STATE_POLL_INTERVAL_MS`.
   - `startBoardStatePoller` — the wrapper that calls `.start()`.
   - `handlePusherConnectionChange` around line 2987. You will edit this.
2. **`dnd/vtt/assets/js/ui/__tests__/board-state-poller.test.mjs`** — full file. You will add tests here.

## Investigation to run before touching anything

1. **Find the poller's interval logic:**
   ```
   Grep for "BOARD_STATE_POLL_INTERVAL_MS" in board-interactions.js
   ```
   Read ~40 lines of context around each hit. After Phase 1-1 this is still a `const` inside `start()`; you need to convert it to something mutable that can be swapped at runtime.

2. **Find how the poller instance is stored:**
   ```
   Grep for "startBoardStatePoller" in board-interactions.js
   ```
   Confirm whether the handle returned by `.start()` (the `{ stop }` object) is captured in a module-level variable, or just called and discarded. You need a handle to call `reconfigure` on later. If there is no handle, you will need to save one.

3. **Find every place `pusherConnected` is set:**
   ```
   Grep for "pusherConnected" in board-interactions.js
   ```
   Confirm `handlePusherConnectionChange` is the only mutator. If there are others (there shouldn't be), they need to trigger reconfigure too.

4. **Run the existing poller tests:**
   ```
   Read dnd/vtt/assets/js/ui/__tests__/board-state-poller.test.mjs
   ```
   Note how the tests mock `setInterval` and what assertions they make about re-configuration. Some tests may already assume a static interval; you may need to update them.

## Gotchas already discovered

- **`setInterval` cannot be reconfigured in place.** You have to `clearInterval` the old one and `setInterval` a new one. Do this inside a `reconfigure(newInterval)` method on the poller, not by leaking state outside.
- **Don't fire a poll immediately on every reconfigure.** When Pusher drops from connected → disconnected, you want to start polling aggressively ASAP (a fresh poll right away is fine). When Pusher goes from disconnected → connected, you do NOT want to fire a poll immediately — the reconnect event itself means Pusher has fresh state coming. An immediate poll would just waste a request. Only fire an immediate poll on the "entered fallback mode" transition, not the "exited fallback mode" transition.
- **The existing poll function has internal state** (`isPolling`, `pollErrorLogged`, etc.). Reconfiguring must not reset those. Keep them at module scope or closure scope; just swap the interval ID.
- **`createNullInterface()` / no-op poller**: if the poller is created in an environment without `setInterval` (like the test harness), `reconfigure` must also be a no-op. Handle this symmetrically to `.stop()`.
- **There is a SAFETY_NET_INTERVAL_MS and a FALLBACK_INTERVAL_MS.** Name them as module-level constants at the top of the poller, not as magic numbers in the middle of functions.
- **Don't regress Phase 1-1.** After this fix, the startup flow is: init Pusher, wait for ready, start poller with initial interval based on `isPusherConnected()`. Then if connection state changes later, reconfigure. Verify Phase 1-1 tests still pass.
- **The combat state refresh loop is NOT affected by this fix.** That is Phase 1-3. Do not touch `startCombatStateRefreshLoop` here. It has its own independent interval.

## The change

### A. Define the two interval constants at module scope

Near the top of `board-interactions.js` (or inside the poller factory, if that's where `BOARD_STATE_POLL_INTERVAL_MS` lives now), add:

```js
const POLL_FALLBACK_INTERVAL_MS = 1000;     // Pusher is down: poll fast
const POLL_SAFETY_NET_INTERVAL_MS = 30000;  // Pusher is up: poll rarely
```

### B. Convert the poller's `start()` to support reconfigure

The poller currently looks approximately like this (after Phase 1-1):

```js
function start() {
  if (!endpoint || typeof windowRef?.setInterval !== 'function' || typeof fetchFn !== 'function') {
    return { stop() {} };
  }
  const BOARD_STATE_POLL_INTERVAL_MS = isPusherConnected()
    ? 10000
    : 1000;
  poll();
  const intervalId = windowRef.setInterval(poll, BOARD_STATE_POLL_INTERVAL_MS);
  return {
    stop() { windowRef.clearInterval(intervalId); },
  };
}
```

Change it to:

```js
function start() {
  if (!endpoint || typeof windowRef?.setInterval !== 'function' || typeof fetchFn !== 'function') {
    return { stop() {}, reconfigure() {} };
  }

  let currentIntervalMs = isPusherConnected()
    ? POLL_SAFETY_NET_INTERVAL_MS
    : POLL_FALLBACK_INTERVAL_MS;
  let intervalId = null;

  function schedule(intervalMs) {
    if (intervalId !== null) {
      windowRef.clearInterval(intervalId);
    }
    currentIntervalMs = intervalMs;
    intervalId = windowRef.setInterval(poll, currentIntervalMs);
  }

  // Initial poll, then start the interval.
  poll();
  schedule(currentIntervalMs);

  return {
    stop() {
      if (intervalId !== null) {
        windowRef.clearInterval(intervalId);
        intervalId = null;
      }
    },
    reconfigure({ pusherConnected }) {
      const nextIntervalMs = pusherConnected
        ? POLL_SAFETY_NET_INTERVAL_MS
        : POLL_FALLBACK_INTERVAL_MS;
      if (nextIntervalMs === currentIntervalMs) {
        return; // no change
      }
      const enteringFallback = !pusherConnected;
      schedule(nextIntervalMs);
      if (enteringFallback) {
        // Pusher just dropped. Fire one poll immediately.
        poll();
      }
    },
  };
}
```

### C. Capture the poller handle at module scope

Find `startBoardStatePoller` (the outer wrapper that calls `start()`). It currently probably does something like:

```js
function startBoardStatePoller() {
  const handle = createBoardStatePoller({ ... }).start();
  // maybe stores handle.stop somewhere, maybe not
}
```

Change it so the handle is stored in a module-level variable:

```js
let boardStatePollerHandle = null;

function startBoardStatePoller() {
  boardStatePollerHandle = createBoardStatePoller({ ... }).start();
}
```

If there is already a variable like `pollerStop` or similar, reuse it — keep the module's existing naming conventions if possible.

### D. Reconfigure from `handlePusherConnectionChange`

Replace the empty comment block in `handlePusherConnectionChange`:

```js
function handlePusherConnectionChange(state) {
  pusherConnected = state.connected;
  console.log('[VTT Pusher] Connection state:', state.connected ? 'connected' : 'disconnected');
  if (boardStatePollerHandle?.reconfigure) {
    boardStatePollerHandle.reconfigure({ pusherConnected: state.connected });
  }
}
```

### E. Add tests

In `board-state-poller.test.mjs`, add cases that:

1. Create a poller with `isPusherConnected: () => false`, start it, assert the interval passed to the mocked `setInterval` is `1000`.
2. Call `reconfigure({ pusherConnected: true })`, assert the mocked `clearInterval` was called and `setInterval` was called again with `30000`.
3. Call `reconfigure({ pusherConnected: false })` again, assert it went back to `1000` and an immediate `poll` was fired (check via the `fetchFn` mock call count or a spy on `poll`).
4. Call `reconfigure` with the same state twice in a row, assert `clearInterval` is NOT called the second time (no-op when state unchanged).

Follow the existing test file's style. If the existing tests use a `windowRef` mock, reuse that.

Also update `board-interactions.test.mjs` if any test there asserts on the poller's interval or on `handlePusherConnectionChange`. Search for those strings.

## Verification

1. Run tests:
   ```bash
   cd /home/user/gmscreen/dnd/vtt && npm test
   ```
   All existing tests plus your new ones must pass.

2. Browser verification:
   - Open VTT, let it fully load. Open DevTools → Network → XHR filter.
   - Note how often `state.php` is being fetched. Should be once every **30 seconds**, not once every second. If it's still 1 second, the fix did not take effect — check that `handlePusherConnectionChange` is actually being called and that `boardStatePollerHandle` is the same object that was returned from `.start()`.
   - Simulate a Pusher drop: in DevTools → Network, right-click the Pusher WebSocket and block it, or use "Offline" mode briefly. Watch the Console for `[VTT Pusher] Connection state: disconnected`. Watch the state.php request rate — it should jump to once per second.
   - Restore the network. Connection should recover. state.php rate should drop back to every 30 seconds.

3. Make sure moves still sync in both modes:
   - While Pusher is up, move a token on one tab → verify it shows up on another tab quickly (via Pusher).
   - While Pusher is disabled (set `enabled` to false in `pusher.php` for a test), reload, move a token → verify it shows up on the other tab within ~1 second (via the polling fallback).
   - Restore the config when done.

## Rollback

```bash
git diff HEAD
git checkout HEAD -- dnd/vtt/assets/js/ui/board-interactions.js dnd/vtt/assets/js/ui/__tests__/board-state-poller.test.mjs
# If you touched board-interactions.test.mjs:
git checkout HEAD -- dnd/vtt/assets/js/ui/__tests__/board-interactions.test.mjs
```

## Commit message

```
vtt-sync: phase 1-2 make the poller react to Pusher state changes

Give the board state poller a reconfigure() method that swaps its
interval between a 30s safety-net mode (Pusher up) and a 1s fallback
mode (Pusher down). handlePusherConnectionChange now calls it on every
connection event.

When entering fallback mode (Pusher just dropped), fire one immediate
poll so the user doesn't wait up to a second for the first fetch.
When entering safety-net mode (Pusher just connected), do not fire an
immediate poll - Pusher itself is about to deliver fresh state.

See docs/vtt-sync-refactor/phase-1-2-dynamic-poller.md.
```

## After this fix

Combined with Phase 1-1, the user should see a dramatic reduction in baseline server requests — from ~5/second (5 players at 1s each) to about 5/30s during normal play. This is the first point at which it is worth telling the user "try it now and see if it feels better" before continuing.

The next fix, `phase-1-3-combat-loop.md`, removes the redundant combat refresh loop.
