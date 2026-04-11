# Phase 2-3 — Guard the Client Against Stale Save Responses

> **Prerequisite reading:** `README.md`, `diagnosis-findings.md` (findings C3 and C4 for context), `pre-flight-investigation.md`, Phase 2-1 committed.

## Context

The client already has version guards for Pusher-delivered updates (`pusher-service.js:197-201`) and for polling responses (`board-interactions.js:246-271`). They both skip applying state if the incoming version is not greater than `lastAppliedVersion`. Good.

But there's a third path that is **not** guarded: the response from the client's own save. When the client POSTs a state change, the server returns the new state with a version number. The client currently applies this response directly to `currentBoardStateVersion` without checking if it's actually newer than what the client already has. If Pusher delivered `_version: 10` half a second ago, and the save response arrives with `_version: 9` (because the save was computed before that Pusher event), the client will happily go backwards.

This fix adds a version guard on the save response path. It's small but essential for correctness after Phase 2-1/2-2.

## Prerequisites

- Phase 2-1 committed (version is now reliably monotonic on the server).
- Tests green.

## Files you will need to load into memory

1. **`dnd/vtt/assets/js/services/board-state-service.js`** — the persist flow. Look for where the save response is applied to state.
2. **`dnd/vtt/assets/js/services/pusher-service.js`** — the existing version guard at lines 197-201 is the pattern to copy.
3. **`dnd/vtt/assets/js/ui/board-interactions.js`** — find where `persistBoardStateSnapshot` processes the save response. Look for any update to `currentBoardStateVersion` or `lastAppliedVersion` that happens inside the save path.
4. **`dnd/vtt/assets/js/state/store.js`** — confirm how `_version` flows through the store. Is it stored at the top level of the state object? In a dedicated field? Grep for `_version` and `lastAppliedVersion`.

## Investigation to run before touching anything

1. **Find the save response handler:**
   ```
   Grep for "persistBoardState(" in dnd/vtt/assets/js
   Grep for ".then(" around persistBoardState calls
   Grep for "data.data" in board-interactions.js (save responses wrap in { success, data })
   Grep for "applyStateToBoard" call sites (some save responses may go through here)
   ```
   You're looking for the line that applies the server's returned state object back into the client's store.

2. **Find where `lastAppliedVersion` is tracked:**
   ```
   Grep for "lastAppliedVersion" in dnd/vtt/assets/js
   Grep for "currentBoardStateVersion" in dnd/vtt/assets/js
   ```
   There may be more than one variable with this role. Identify the canonical one.

3. **Confirm the Pusher guard logic exists as expected:**
   ```
   Read dnd/vtt/assets/js/services/pusher-service.js lines 190-220
   ```
   Copy the pattern exactly so the save path and Pusher path use the same rule.

4. **Check the poller's version guard:**
   ```
   Read dnd/vtt/assets/js/ui/board-interactions.js around the board state poll handler (search for "lastAppliedVersion" and "poll")
   ```

## Gotchas already discovered

- **The save response is not just metadata — it's the merged state.** The server merges the client's delta with the on-disk state and returns the result. Sometimes that result really *is* the canonical state the client should adopt. The guard should only drop the response if the version is *strictly less* than what the client already has, not if it's equal (equal might mean "no-op save, already current").
- **The save response is trusted in other ways.** For example, after a successful save the client might reset a "dirty" flag or show a confirmation. Those side effects should still happen even if the state update is skipped. Don't short-circuit the whole response handler — only the state-apply part.
- **There's a chance the save response arrives out of order with its own Pusher broadcast.** If Pusher delivers the *same* change before the save response does (unlikely but possible after Phase 1-5), the Pusher update will set `lastAppliedVersion` to the new value. Then the save response arrives with the same version. This case is `version === lastAppliedVersion`. Safe to apply (or safe to skip). Pick "skip" so it matches the Pusher guard's behavior (which is `<=`, not `<`).
- **If `_version` is missing from the save response**, treat it as a failure. Log a warning and skip the state apply. This shouldn't happen after Phase 2-1, but you want defense in depth.

## The change

### A. Add a shared version guard helper

In `board-state-service.js` or a new file `state/version-guard.js`, export a small helper:

```js
/**
 * Decide whether an incoming state update should be applied.
 * Returns true if the incoming version is newer than the last applied.
 * Skips equal and older versions to match the Pusher guard's behavior.
 */
export function shouldApplyIncomingVersion(incomingVersion, lastAppliedVersion) {
  if (typeof incomingVersion !== 'number') {
    return false;
  }
  if (typeof lastAppliedVersion !== 'number') {
    return true;
  }
  return incomingVersion > lastAppliedVersion;
}
```

Test this helper in isolation — add a `__tests__/version-guard.test.mjs` with cases: newer, older, equal, missing, wrong type.

### B. Apply the guard to the save response path

Find the save-response handler. It's probably in `board-interactions.js` inside or near `persistBoardStateSnapshot`, or in `board-state-service.js` inside `persistBoardState`. It will look something like:

```js
persistBoardState(routes.state, snapshot, options)
  .then((response) => {
    if (response?.data) {
      boardApi.setState(response.data);  // or applyStateToBoard
      // ... any other side effects ...
    }
  });
```

Wrap the `setState`/`applyStateToBoard` call with the guard:

```js
persistBoardState(routes.state, snapshot, options)
  .then((response) => {
    if (!response?.data) return;

    const incomingVersion = response.data._version;
    const lastApplied = getLastAppliedVersion();
    if (!shouldApplyIncomingVersion(incomingVersion, lastApplied)) {
      console.log(
        '[VTT] Skipping stale save response',
        'version:', incomingVersion,
        'current:', lastApplied
      );
      return;
    }

    boardApi.setState(response.data);
    setLastAppliedVersion(incomingVersion);
    // ... any other side effects (keep these) ...
  });
```

`getLastAppliedVersion()` / `setLastAppliedVersion()` may not exist as named functions yet — they're a placeholder for whatever module-level variable is currently tracking it. If the tracker is called `currentBoardStateVersion` and is updated inline, read and write it directly. Just make sure all three paths (save response, Pusher, poller) use the **same** variable, not three different ones.

### C. Unify all three guards if they drift

Grep for all three call sites that mutate the "last applied version" tracker:

```
Grep for "lastAppliedVersion =" in dnd/vtt/assets/js
Grep for "currentBoardStateVersion =" in dnd/vtt/assets/js
```

Confirm they all use the same rule: only update if the new value is greater than the old. If any one of them just assigns unconditionally, that's a regression risk — fix it to match.

### D. Make sure side effects still run on stale-skipped responses

If the existing handler was also, say, resetting a dirty flag or dismissing a save indicator, those side effects should **still run** even if the state apply is skipped. Restructure so that the "mark save as complete" logic happens before or outside the version guard:

```js
.then((response) => {
  markSaveComplete();  // always, regardless of version
  if (!response?.data) return;
  // ... version guard and state apply ...
});
```

Read the existing handler carefully to identify what needs to run unconditionally.

## Verification

1. Run the JS test suite, including the new `version-guard.test.mjs`:
   ```bash
   cd /home/user/gmscreen/dnd/vtt && npm test
   ```

2. **Simulate a stale save response.** This is the hardest to test manually. Options:
   - In the DevTools Console, temporarily override `fetch` to return a mock response with `_version: 1` after the real state has already reached version 100:
     ```js
     const realFetch = window.fetch;
     window.fetch = async (...args) => {
       if (args[0]?.includes('state.php')) {
         return new Response(JSON.stringify({
           success: true,
           data: { _version: 1, placements: {} },
         }), { headers: { 'Content-Type': 'application/json' } });
       }
       return realFetch(...args);
     };
     ```
     Trigger a token move. Watch the console for `Skipping stale save response`. Confirm the token does NOT jump back to match the stale payload. Restore `fetch` when done.

3. **Live test.** Two browser tabs. Rapidly move tokens in both, creating concurrent saves. Watch for any snap-back. There should be none.

4. **Log sanity.** During normal play, the "skipping stale" log should essentially never fire. If it fires every few seconds, something is wrong — probably the tracker variable isn't being shared across all three paths.

## Rollback

```bash
git diff HEAD
git checkout HEAD -- dnd/vtt/assets/js/services/board-state-service.js \
  dnd/vtt/assets/js/ui/board-interactions.js
# If you created version-guard.js and its test:
rm -f dnd/vtt/assets/js/state/version-guard.js \
  dnd/vtt/assets/js/state/__tests__/version-guard.test.mjs
```

## Commit message

```
vtt-sync: phase 2-3 guard save responses against stale versions

The save response handler used to apply the server's returned state
unconditionally, even if Pusher had already delivered a newer update.
With Phase 2-1 making server-side versions reliable, the client can
and should drop save responses whose _version is not strictly greater
than lastAppliedVersion - matching how Pusher-delivered updates and
poll responses are already filtered.

Shared shouldApplyIncomingVersion() helper with unit tests, applied
to save responses in persistBoardState. Side effects that must run
regardless (dirty flag reset, save indicator) are kept outside the
guard.

See docs/vtt-sync-refactor/phase-2-3-client-version-guard.md.
```

## After this fix

Phase 2 is complete. You now have:
- No version race (2-1).
- Single source of version truth (2-2, optional).
- Client never goes backwards on a stale response (2-3).

The remaining snap-back risk is essentially zero in normal play. Phase 3 is a performance project — not a correctness project — so it's safe to stop here and evaluate the result with the user before investing more time.
