# Phase 1-1 — Fix Pusher / Poller Initialization Order

> **Status:** ✅ Done. Committed as `a1e2549` on `claude/app-communication-architecture-y5g1l`, PR [#662](https://github.com/Tastanis/gmscreen/pull/662).

> **Prerequisite reading:** `README.md`, `diagnosis-findings.md` (findings C1 and C2), `pre-flight-investigation.md`.

## Context

This is the single biggest source of lag in the VTT. The board state poller is started **before** Pusher is initialized. Inside the poller, the poll interval is computed once using `isPusherConnected()`, which returns false because Pusher hasn't started yet. The interval freezes at 1 second for the entire session. Every player then hammers the server once per second forever, even after Pusher comes up.

This fix changes the init order so Pusher starts first, and adds a short wait so the poller sees the real connection state before deciding on an interval. It is the foundation Phase 1-2 builds on; **do not skip this and jump straight to 1-2.**

## Prerequisites

- On branch `claude/app-communication-architecture-y5g1l`.
- Pre-flight investigation (`pre-flight-investigation.md`) done.
- Tests green before starting.
- No prerequisite fixes. This is the first code change.

## Files you will need to load into memory

Read these in order. Do not skim. You need to understand how init works to not break it.

1. **`dnd/vtt/assets/js/ui/board-interactions.js`** — the big one. You do not need to read all 20,000 lines. Read:
   - The `start()` function of the board state poller. Find it by searching for `BOARD_STATE_POLL_INTERVAL_MS`. It is around line 319.
   - The `handlePusherConnectionChange` function. Find by searching for `handlePusherConnectionChange`. Around line 2987.
   - The init block that calls `startBoardStatePoller`, `startCombatStateRefreshLoop`, and `initializePusherSync`. Around line 3871. **This is the block you will edit.**
2. **`dnd/vtt/assets/js/services/pusher-service.js`** — full file, it's only 326 lines. Read `initializePusher` and understand what it returns. Specifically you need to know whether it exposes a "wait until connected" promise or event, or only synchronous state queries.
3. **`dnd/vtt/assets/js/ui/__tests__/board-state-poller.test.mjs`** — the existing tests for the poller. Understand how they mock `isPusherConnected` and `setInterval` so you can write a test that matches their style.

## Investigation to run before touching anything

Use Grep and Read to answer these questions. Write the answers down in your working memory before editing:

1. **How is `isPusherConnected` defined?** Search for `function isPusherConnected` and `let pusherConnected` in `board-interactions.js`. It should be a module-level variable flipped by `handlePusherConnectionChange`. Confirm.
2. **Does `pusher-service.js` expose a promise that resolves on first connect?** Search `pusher-service.js` for `Promise`, `resolve`, `connected`. If there's an existing "connection promise" pattern, use it. If not, you will add one in this fix.
3. **What does `initializePusherSync` in `board-interactions.js` actually do?** Search for `function initializePusherSync`. It probably wraps `initializePusher` from `pusher-service.js` and wires up the callbacks. Confirm its signature and what it returns.
4. **Is the poller passed `isPusherConnected` by reference or by value?** Look at how `startBoardStatePoller` is defined. If the poller constructor reads `isPusherConnected()` via a passed-in function, the fix is simple. If it reads a module variable directly, you'll need to pass it explicitly.
5. **Run the existing poller tests and read them:**
   ```
   Read dnd/vtt/assets/js/ui/__tests__/board-state-poller.test.mjs
   ```
   Confirm they set up `windowRef`, `setInterval`, and `fetchFn`. Your fix must not break these tests.

## Gotchas already discovered

- **The poller's `BOARD_STATE_POLL_INTERVAL_MS` is a `const` inside `start()`.** (See `diagnosis-findings.md` C1.) Making it dynamic is Phase 1-2. In **this** fix, all you're doing is ensuring Pusher is connected (or at least its state is known) before `start()` runs. Do not try to do both fixes in one commit — they have separate test concerns.
- **`initializePusherSync()` is not async today.** You will need to either make it return a Promise, or emit an event the caller can await. Pick one and be consistent. Recommended: return a Promise that resolves when Pusher fires its first `connected` event, with a timeout so the poller does not block forever if Pusher can't connect.
- **Timeout must be short.** If Pusher takes forever, we still need the poller to start eventually (in its old "1 second" mode, since Pusher is genuinely down). A reasonable timeout is 2500 ms. Do not make it longer — users should not stare at a white screen waiting for Pusher.
- **`applyStateToBoard` must still run before both** the poller and Pusher. It seeds the initial UI. Do not move it.
- **`startListeningForSheetSync()` comes right after `initializePusherSync()` today.** Make sure you do not accidentally reorder it out of its spot — it does not depend on Pusher but it does depend on the board being mounted, so leave it after the board wiring is done.
- **There is a test at `__tests__/board-interactions.test.mjs` that tests this init sequence.** It is ~156 KB. Search it for `startBoardStatePoller` and `initializePusherSync` to find existing assertions. If any test currently asserts "poller starts synchronously at mount time," you will need to update it to match the new async init. **Do not skip or delete those tests** — rewrite them to match the new order.

## The change

You are making edits in **two files**: `pusher-service.js` (add a ready-promise) and `board-interactions.js` (await it in init).

### A. Add a "ready" promise to `pusher-service.js`

Find `initializePusher` in `pusher-service.js`. Inside it, after `pusherInstance = new window.Pusher(key, ...)` and the existing connection-state bindings, add:

```js
let readyResolver;
let readyTimeout;
const readyPromise = new Promise((resolve) => {
  readyResolver = resolve;
});

// Resolve as soon as Pusher fires its first 'connected' state.
pusherInstance.connection.bind('connected', () => {
  if (readyResolver) {
    readyResolver({ connected: true });
    readyResolver = null;
    if (readyTimeout) {
      clearTimeout(readyTimeout);
      readyTimeout = null;
    }
  }
});

// Safety net: resolve with connected=false after 2500ms so callers
// don't block forever if Pusher can't connect.
readyTimeout = setTimeout(() => {
  if (readyResolver) {
    readyResolver({ connected: false, reason: 'timeout' });
    readyResolver = null;
  }
}, 2500);
```

Then add `ready: readyPromise` to the interface object that `initializePusher` returns. If the return is currently `return { ... }`, add a field:

```js
return {
  // ...existing fields...
  ready: readyPromise,
};
```

If `createNullInterface()` (the fallback when Pusher isn't available) also returns an interface object, give it an already-resolved ready promise so callers don't hang:

```js
function createNullInterface() {
  return {
    // ...existing fields...
    ready: Promise.resolve({ connected: false, reason: 'unavailable' }),
  };
}
```

### B. Make `initializePusherSync` in `board-interactions.js` return the ready promise

Find `initializePusherSync` in `board-interactions.js`. It currently probably looks something like:

```js
function initializePusherSync() {
  const pusherInterface = initializePusher({ ... });
  // ... wires up handlers ...
}
```

Change it to return the ready promise:

```js
function initializePusherSync() {
  const pusherInterface = initializePusher({ ... });
  // ... wires up handlers ...
  return pusherInterface?.ready ?? Promise.resolve({ connected: false });
}
```

If `initializePusherSync` currently returns something else (an object with methods, etc.), preserve those by returning an object that also exposes a `ready` field. Choose the shape that minimizes churn at the call site. **Read the function first before deciding.**

### C. Reorder the init block

Find the block around line 3871 (verify by content, not by line number):

```js
applyStateToBoard(boardApi.getState?.() ?? {});
startBoardStatePoller();
startCombatStateRefreshLoop();
initializePusherSync();
startListeningForSheetSync();
```

Change to:

```js
applyStateToBoard(boardApi.getState?.() ?? {});

// Start Pusher first, then start the poller only after Pusher has either
// connected or timed out. This prevents the poller from locking its
// interval at "1 second fallback mode" while Pusher is still handshaking.
const pusherReady = initializePusherSync();
Promise.resolve(pusherReady).then(() => {
  startBoardStatePoller();
  startCombatStateRefreshLoop();
});

startListeningForSheetSync();
```

Notes:
- `Promise.resolve(pusherReady)` tolerates `pusherReady` being either a Promise or a plain object, so if `initializePusherSync` returns something wonky on some code path, it won't throw.
- `startListeningForSheetSync()` stays outside the `.then` — it is unrelated to Pusher and should start immediately.
- Do **not** `await` here — the surrounding function is probably synchronous and you don't want to mark it async just for this. Using `.then` avoids that.

### D. Update tests

Open `dnd/vtt/assets/js/ui/__tests__/board-interactions.test.mjs` and search for any test that:
- Asserts the poller starts synchronously at mount.
- Asserts the order `startBoardStatePoller` is called before `initializePusher`.

For any such test, update it to:
- Await a microtask (or a `Promise.resolve().then(...)`) before asserting the poller started.
- Assert the new order: Pusher first, then poller after ready.

If you cannot easily find or fix such tests, run the suite and see what fails. Fix whatever broke in a way that matches the new behavior. **Do not weaken assertions**; if a test was checking something useful, keep checking it, just in the new order.

## Verification

1. Run the JS test suite. All tests must pass:
   ```bash
   cd /home/user/gmscreen/dnd/vtt && npm test
   ```
2. Open the VTT in a browser. Hard-refresh (Ctrl+F5).
3. Open DevTools before the page loads. In the Console tab, watch for:
   - `[VTT Pusher]` initialization logs.
   - `[VTT Pusher] Connection state: connected` (or similar).
4. In the Console tab, run these checks after the page loads:
   ```js
   // Should be true once connected.
   window.isPusherConnected?.() ?? 'not exposed'
   ```
5. In the Network tab, filter by "state" and watch the request timing. Before the fix, you'd see a GET to `state.php` within 1 second of page load. After the fix, you should see the first GET arrive **after** Pusher has connected (a small delay, usually a few hundred ms), not sooner.
6. Move a token as GM. Verify the change shows up on a second browser tab within ~1 second. It should come in as a Pusher push, not a poll.
7. Open the Network tab's WS filter. Confirm there is one persistent WebSocket connection to `ws-us3.pusher.com`. If you see it open, close, and reopen multiple times, the ready-timeout may be too short.

## Rollback

If the fix breaks something:

```bash
git diff HEAD
git checkout HEAD -- dnd/vtt/assets/js/ui/board-interactions.js dnd/vtt/assets/js/services/pusher-service.js
# If you updated tests:
git checkout HEAD -- dnd/vtt/assets/js/ui/__tests__/board-interactions.test.mjs
```

## Commit message

```
vtt-sync: phase 1-1 start Pusher before the poller

The board state poller used to start before initializePusherSync(), so
its first call to isPusherConnected() always returned false and the
poll interval locked at 1 second for the whole session. Now the poller
waits for Pusher to either connect or time out (2.5s) before it starts,
so it picks the correct interval the first time.

Exposes a ready promise from pusher-service.js and threads it through
initializePusherSync(). The poller and combat refresh loop are started
inside the .then() of that promise.

See docs/vtt-sync-refactor/phase-1-1-init-order.md.
```

## After this fix

Phase 1-2 (`phase-1-2-dynamic-poller.md`) is the natural next step. It makes the poller *also* react to connection changes after startup, which is the other half of the C1/C2 fix. Phase 1-1 alone is a big improvement but not the complete fix — make sure the user knows that before they stop.
