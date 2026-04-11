# Phase 2-2 — Consolidate Version Into board-state.json

> **Prerequisite reading:** `README.md`, `diagnosis-findings.md` (findings S1 and S2), `pre-flight-investigation.md`, Phase 2-1 committed.

## Context

After Phase 2-1, the version race is fixed. But the version is still stored in a separate file (`board-state-version.json`), which is structurally redundant and slightly confusing — the version conceptually belongs to the state. This fix moves the version field *inside* `board-state.json` itself, so there is literally one file to read and write, and the version cannot drift from the state it describes.

This fix is optional. Phase 2-1 already achieves correctness. This is a cleanness fix. Skip it if you're short on time.

## Prerequisites

- Phase 2-1 committed.
- Tests green.

## Files you will need to load into memory

1. **`dnd/vtt/api/state.php`** — `getVttBoardStateVersion`, `incrementVttBoardStateVersion`, and all reads of `$data['_version']` or the version file.
2. **`dnd/vtt/bootstrap.php`** — `withVttBoardStateLock` and `loadVttJson` / `saveVttJson`.
3. **`dnd/vtt/data/board-state.json`** — the current shape. Is `_version` already in there, or is it only in the separate file?
4. **Any migration scripts in the repo.** Search:
   ```
   Glob dnd/vtt/**/migrate*
   Glob dnd/vtt/**/migration*
   ```
5. **Every PHP call site that reads the version:**
   ```
   Grep for "getVttBoardStateVersion" in dnd/vtt
   ```

## Investigation to run before touching anything

1. **What's the current on-disk shape?** Read `dnd/vtt/data/board-state.json` and the current `dnd/vtt/data/board-state-version.json` (if they exist). If you're working on a dev environment with example files, there's `dnd/vtt/data/vtt_tokens.json.example` and similar — check what state files are expected to look like.

2. **Does the client already read `_version` from the GET response?** Grep:
   ```
   Grep for "_version" in dnd/vtt/assets/js
   ```
   The diagnosis says yes — the client uses `_version` for staleness guards in the poller (`board-interactions.js:246-271`) and Pusher receiver (`pusher-service.js:197-201`). Confirm the field name is exactly `_version` with the underscore. Your fix must keep that shape.

3. **Find any code that reads `VTT_VERSION_FILE` besides `state.php`.** If nothing else touches it, you can delete the constant and the file itself (after migration). If other code reads it (e.g. an admin tool, a test fixture), you cannot delete.

## Gotchas already discovered

- **Migration.** If there's an existing `board-state-version.json` in production, you need a migration path. Options:
  - Lazy migration: on first write after the fix, if `_version` is missing from `board-state.json`, read it from the old version file, inject it, and save. Then delete the old version file.
  - Eager migration: a one-shot script that reads the old file and writes the new shape, run before deploy.
  - No migration, just start from 0 or from `getVttBoardStateVersion()` on the first load.
  Pick **lazy migration** — it's the safest and requires no separate run.
- **The version file should be deleted after successful lazy migration**, but only after the migrated file is confirmed saved. Race: if you delete first and the save fails, you've lost the version. Save first, then delete the old file.
- **Existing tests may open `board-state.json` as a fixture.** Search `__tests__` for `board-state.json` string matches. If any test fixture has `_version` in a specific place, make sure your code reads it from that place.
- **`getVttBoardStateVersion()` is called from other places.** Even after this fix, keep the function — just have it read from `board-state.json` instead of the separate file. The caller shouldn't care.
- **The version must still increment monotonically across the transition.** Do not reset to 0 on migration; read the current value from the old file and continue from there.

## The change

### A. Change `getVttBoardStateVersion()` to read from `board-state.json`

```php
function getVttBoardStateVersion(): int
{
    $state = loadVttJson('board-state.json');
    if (is_array($state) && isset($state['_version'])) {
        return max(0, (int) $state['_version']);
    }

    // Legacy fallback: read from the old version file. Used during the
    // migration window. Safe to remove after all deployments have done
    // at least one write.
    $legacyPath = VTT_VERSION_FILE;
    if (is_file($legacyPath)) {
        $data = json_decode((string) file_get_contents($legacyPath), true);
        if (is_array($data) && isset($data['version'])) {
            return max(0, (int) $data['version']);
        }
    }

    return 0;
}
```

### B. Change `incrementVttBoardStateVersion()` to update `board-state.json` in place

This function now only makes sense when called from inside the board state lock with the in-memory state object in scope. It becomes a helper that operates on a state array, not on disk.

Rename it and change the signature:

```php
/**
 * Bump the _version field on an in-memory board state array.
 * Must be called with the board state lock held.
 */
function bumpVttBoardStateVersion(array &$state): int
{
    $current = isset($state['_version']) ? max(0, (int) $state['_version']) : 0;
    $next = $current + 1;
    $state['_version'] = $next;
    return $next;
}
```

Update the call site in the POST handler:

```php
$lockResult = withVttBoardStateLock(function () use (...) {
    // ... existing merge logic ...
    $newVersion = bumpVttBoardStateVersion($nextState);
    if (!saveVttJson('board-state.json', $nextState)) {
        respondJson(500, [...]);
    }
    return [
        'state' => $nextState,
        'version' => $newVersion,
    ];
});
```

Keep the old `incrementVttBoardStateVersion()` as a compatibility wrapper that reads, bumps, writes — for any code path that still calls it outside the POST handler. Mark it deprecated in a comment. If no such call sites exist, delete it.

### C. Lazy migration of the old file

Inside the POST handler's lock closure, before the merge:

```php
// Lazy migration from the old separate version file. If the state on
// disk doesn't have a _version but the legacy file does, copy it over.
if (!isset($existingState['_version']) && is_file(VTT_VERSION_FILE)) {
    $legacy = json_decode((string) file_get_contents(VTT_VERSION_FILE), true);
    if (is_array($legacy) && isset($legacy['version'])) {
        $existingState['_version'] = max(0, (int) $legacy['version']);
    }
}
```

Then after the successful save (still inside the lock closure, or immediately after it while still holding the lock if possible):

```php
// Migration done — remove the legacy file. Best effort.
if (is_file(VTT_VERSION_FILE)) {
    @unlink(VTT_VERSION_FILE);
}
```

Only unlink after `saveVttJson('board-state.json', $nextState)` has returned true.

### D. Remove any remaining references to the legacy constant

Grep for `VTT_VERSION_FILE` one more time. If the only remaining references are inside the compatibility code above, you can leave them. If nothing reads them anymore after the fix, delete the constant define and related code.

## Verification

1. **Fresh install:** delete `board-state.json` (or start with an empty state). Make a POST to the API. Confirm `board-state.json` is created with a `_version: 1` field. The old version file should not exist.

2. **Migration:** create a state file without `_version` and a legacy version file with `{"version": 42}`. Make one POST. Confirm the resulting `board-state.json` has `_version: 43` (legacy 42 + 1). Confirm the legacy file has been deleted.

3. **GETs:** fetch the state via the API, confirm `_version` is in the response body.

4. **Phase 2-1 concurrency test:** repeat the parallel POST test from Phase 2-1. Version should still increment monotonically without collisions.

5. **Client regressions:** open the VTT in a browser, move tokens, confirm nothing is broken. The client uses `_version` from the response; that field name hasn't changed.

## Rollback

```bash
git diff HEAD
git checkout HEAD -- dnd/vtt/api/state.php
# If you deleted the legacy version file during testing, restore it from git or accept the loss (it will be regenerated on next write).
```

## Commit message

```
vtt-sync: phase 2-2 store _version inside board-state.json

The version counter used to live in a separate board-state-version.json
file. Now it is a field on board-state.json itself, so there is one file
to lock and no possibility of the version drifting from the state it
describes. Lazy migration on first write copies the legacy file's value
and deletes it.

See docs/vtt-sync-refactor/phase-2-2-consolidate-version.md.
```
