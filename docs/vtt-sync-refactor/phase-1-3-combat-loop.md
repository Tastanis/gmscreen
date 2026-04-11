# Phase 1-3 — Fold the Combat State Refresh Loop into the Main Poller

> **Prerequisite reading:** `README.md`, `diagnosis-findings.md` (finding C6), `pre-flight-investigation.md`, Phases 1-1 and 1-2 committed.

## Context

There is a third sync system in addition to Pusher and the board state poller: a separate `setInterval` that refreshes combat state every 5 seconds. It is in `board-interactions.js` around line 2704 in the function `startCombatStateRefreshLoop`. This exists as a "backup fallback" but it runs unconditionally, regardless of whether Pusher is up, regardless of whether the main poller just fetched, and regardless of whether combat is even active.

Combat state is already included in the main board state GET, and Pusher broadcasts combat changes. So this loop is entirely redundant. It is also a source of hidden lag: if a combat event happens and Pusher drops it, users can wait up to 5 seconds for this loop to pick it up, even though the main poller is already running at 1-second fallback speed when Pusher is down.

This fix has two options. **Pick option A unless there's a specific reason not to.**

- **Option A (recommended):** Delete `startCombatStateRefreshLoop` entirely. The main poller and Pusher already cover combat state.
- **Option B:** Keep the loop but only run it when Pusher is disconnected *and* combat is active. This is more conservative and preserves behavior edge cases but adds complexity.

## Prerequisites

- Phases 1-1 and 1-2 committed.
- Tests green before starting.

## Files you will need to load into memory

1. **`dnd/vtt/assets/js/ui/board-interactions.js`** — specifically:
   - `startCombatStateRefreshLoop` function. Search for that name. Around line 2704.
   - Any module-level variables named `combatStateRefreshIntervalId` or similar. Find all references.
   - Every call site of `startCombatStateRefreshLoop`. Should be one, in the init block you edited in Phase 1-1.
2. **Any combat-tracker subdirectory code**: run
   ```
   Glob dnd/vtt/combat-tracker/**/*.js
   ```
   and note what lives there. The diagnosis found a `sync-service.js` that was mostly empty. Confirm it's still empty and not involved.
3. **The main board state service**: read `dnd/vtt/assets/js/services/board-state-service.js` to confirm combat state flows through the same fetch path as everything else.

## Investigation to run before touching anything

1. **Find what the combat refresh loop actually does:**
   ```
   Grep for "combatStateRefresh" in dnd/vtt/assets/js with surrounding context
   ```
   Read the full function body. If it is doing something *more* than just refetching state (for example, kicking off a UI animation, clearing a timer, or sending a heartbeat), **stop and use option B.** Deleting it could remove hidden behavior.

2. **Look at what's inside the loop's tick function.** Open `board-interactions.js` around the `combatStateRefreshIntervalId = window.setInterval(...)` line and read the callback body. Confirm it is only calling a state-fetch path that the main poller also covers. If it's calling a different endpoint (e.g. a `combat.php` instead of `state.php`), then Option A is unsafe — you'd be deleting a real feature.

3. **Check for tests of the combat loop:**
   ```
   Grep for "startCombatStateRefreshLoop" in dnd/vtt/assets/js/**/__tests__
   Grep for "combatStateRefresh" in dnd/vtt/assets/js/**/__tests__
   ```
   If there are tests, read them. They may assert the loop exists; those assertions should be deleted if you go with Option A.

4. **Check if combat has its own Pusher event:**
   ```
   Grep for "combat" in dnd/vtt/api/state.php
   Grep for "combat" in dnd/vtt/assets/js/services/pusher-service.js
   ```
   Confirm that combat state is part of the broadcast payload. It should be, based on the `pusher.php` config (`'combat' => true` in `broadcast_events`).

## Gotchas already discovered

- **Module-level state.** `combatStateRefreshIntervalId` is a module-level `let`. If you delete the loop but leave the variable, nothing bad happens, but clean it up in the same commit.
- **The init block you edited in Phase 1-1** currently reads (after Phase 1-1):
  ```js
  const pusherReady = initializePusherSync();
  Promise.resolve(pusherReady).then(() => {
    startBoardStatePoller();
    startCombatStateRefreshLoop();
  });
  ```
  You need to remove the `startCombatStateRefreshLoop()` call from there too. Do not leave a dangling call to a function that no longer exists.
- **Test file `board-interactions.test.mjs` may reference `combatStateRefresh`.** Update or delete those assertions.
- **Option A is destructive.** There is no coming back except via `git revert`. Make sure the investigation in step 2 above confirms the loop is purely redundant before you delete it. If you're not sure, go with Option B.

## The change — Option A (delete)

### A1. Remove `startCombatStateRefreshLoop` function and its module-level interval variable

In `board-interactions.js`:
- Delete the entire `startCombatStateRefreshLoop` function.
- Delete the module-level `combatStateRefreshIntervalId` (or whatever it's named) declaration.
- Delete any `clearInterval(combatStateRefreshIntervalId)` teardown code.
- Delete the `COMBAT_STATE_REFRESH_INTERVAL_MS` constant if there is one.

### A2. Remove the call site from the init block

In the post-Phase-1-1 init block, remove `startCombatStateRefreshLoop()`:

```js
const pusherReady = initializePusherSync();
Promise.resolve(pusherReady).then(() => {
  startBoardStatePoller();
  // (combat refresh removed — covered by Pusher + main poller)
});
```

### A3. Update tests

Open `__tests__/board-interactions.test.mjs`, search for `startCombatStateRefreshLoop` and `combatStateRefresh`. For each hit:
- If the test is asserting the loop exists at a specific interval, delete that assertion.
- If the test relies on the loop firing to simulate combat state arriving, replace the simulation with a direct poke at the main poller or at the Pusher `onStateUpdate` callback.

Run the full suite after.

## The change — Option B (guarded)

If investigation found the loop is doing something non-redundant, or if you're not confident Option A is safe, do this instead.

### B1. Make the loop conditional on Pusher being down

Inside the existing `startCombatStateRefreshLoop`, wrap the tick body with a guard:

```js
combatStateRefreshIntervalId = window.setInterval(() => {
  if (pusherConnected) {
    // Pusher is handling combat updates; skip this tick.
    return;
  }
  if (!isCombatActive()) {
    // No combat in progress; no need to refresh.
    return;
  }
  // ... existing combat refresh logic ...
}, COMBAT_STATE_REFRESH_INTERVAL_MS);
```

If `isCombatActive()` doesn't exist, read the store to check: you want to skip the tick when there is no active combat tracker. If you can't easily tell, just use the `pusherConnected` guard alone.

### B2. Optionally increase the interval

Since this is now purely a fallback-of-a-fallback, you can safely increase the interval to 10 seconds. Change `COMBAT_STATE_REFRESH_INTERVAL_MS` from 5000 to 10000.

### B3. Tests

Existing tests should still pass. Add one new test that asserts: when `pusherConnected === true`, calling the tick function does not trigger a fetch.

## Verification

1. Tests pass:
   ```bash
   cd /home/user/gmscreen/dnd/vtt && npm test
   ```

2. Start a combat in the VTT. With Pusher connected:
   - Advance the turn on one tab. Verify the other tab's initiative tracker updates within ~1 second. (That's Pusher doing it.)
   - Open DevTools → Network → XHR. Confirm there are no periodic combat-specific requests if you chose Option A. If Option B, confirm they only fire when Pusher is down.

3. Disable Pusher (set `enabled: false` in `pusher.local.php` or `pusher.php`) and reload:
   - Option A: combat still updates, just via the main poller's 1-second fallback. Confirmed by watching `state.php` fetches.
   - Option B: combat refresh ticks are still firing, at their new guarded rate.

4. Restore config when done.

## Rollback

```bash
git diff HEAD
git checkout HEAD -- dnd/vtt/assets/js/ui/board-interactions.js dnd/vtt/assets/js/ui/__tests__/board-interactions.test.mjs
```

## Commit message (Option A)

```
vtt-sync: phase 1-3 remove redundant combat refresh loop

The combat state refresh loop fetched combat state every 5 seconds
regardless of Pusher or poller activity. Combat state is already part
of the main board state broadcast and the main state endpoint, so the
loop was pure overhead. Deleted the loop, its interval variable, and
the init-block call site.

See docs/vtt-sync-refactor/phase-1-3-combat-loop.md.
```

## Commit message (Option B)

```
vtt-sync: phase 1-3 guard combat refresh loop when Pusher is up

The combat state refresh loop now no-ops when Pusher is connected,
since Pusher already broadcasts combat changes. When Pusher is down
and combat is active, it falls back to a 10-second refresh (up from
5s) as a last-resort safety net.

See docs/vtt-sync-refactor/phase-1-3-combat-loop.md.
```
