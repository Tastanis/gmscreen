# Phase 2-1 — Move Version Increment Inside the State Lock

> **Prerequisite reading:** `README.md`, `diagnosis-findings.md` (findings S1 and S2), `pre-flight-investigation.md`.

## Context

`dnd/vtt/api/state.php` has a classic race condition. It acquires a file lock on `board-state.json`, does the merge and save under the lock, releases the lock, and **then** calls `incrementVttBoardStateVersion()`. That function itself reads the current version from a separate file, increments it, and writes it back — also without any lock of its own.

Two users saving at the same time can both end up stamped with the same version number. Since the client uses version numbers to decide whether an incoming update is newer or older than what it has, duplicate versions break dedup and cause the "snap-back" symptom.

This fix is the minimal correctness fix: move the version increment inside the existing board state lock. Phase 2-2 goes further by consolidating the version into `board-state.json` itself (eliminating the separate version file entirely), but 2-1 gets you correctness with a much smaller diff and is a reasonable stopping point on its own.

## Prerequisites

- Tests green.
- No dependency on Phase 1 fixes, but if you're doing both phases, **do Phase 1 first** — it's bigger bang for buck and Phase 2-1 can wait behind it without issue.

## Files you will need to load into memory

1. **`dnd/vtt/api/state.php`** — focus on:
   - `incrementVttBoardStateVersion()` (lines ~28-36).
   - `getVttBoardStateVersion()` (nearby).
   - The POST handler, specifically the `withVttBoardStateLock` block (around lines 196-461).
2. **`dnd/vtt/bootstrap.php`** — `withVttBoardStateLock()` is defined here around line 115. Read the whole function. You need to understand what it locks, how, and whether the lock is reentrant (it probably is not).
3. **`dnd/vtt/data/`** — check what `VTT_VERSION_FILE` is set to. It's probably something like `board-state-version.json` in the data directory.

## Investigation to run before touching anything

1. **Find `VTT_VERSION_FILE`:**
   ```
   Grep for "VTT_VERSION_FILE" in dnd/vtt
   ```
   Confirm where it is defined and what path it points to.

2. **Read `withVttBoardStateLock`** in `bootstrap.php`:
   ```
   Read dnd/vtt/bootstrap.php lines 110-150
   ```
   Confirm that it:
   - Opens `board-state.json` for read/write.
   - Calls `flock($handle, LOCK_EX)`.
   - Calls the closure.
   - Releases the lock.
   - **Crucially: confirm whether the closure can also call functions that themselves try to open `board-state.json`.** If `saveVttJson('board-state.json', ...)` is called inside the closure, does it try to acquire a second lock? If yes, you may already have a latent bug. Read `saveVttJson()` too.

3. **Confirm there's no other writer of `VTT_VERSION_FILE`:**
   ```
   Grep for "VTT_VERSION_FILE" across dnd/vtt
   Grep for "board-state-version" across dnd/vtt
   ```
   If some other file writes to the version file, you need to lock it consistently everywhere. But the diagnosis suggests only `state.php` touches it.

4. **Read the closure body** inside `withVttBoardStateLock` in `state.php` around lines 196-458. Confirm what `$nextState` is and how `$responseState` is populated.

## Gotchas already discovered

- **Re-entrancy risk.** If `withVttBoardStateLock` is not reentrant, you cannot call `incrementVttBoardStateVersion` from inside the closure if that function also tries to acquire the same lock. Since `incrementVttBoardStateVersion` currently only writes to `VTT_VERSION_FILE` (a *different* file), this isn't a problem for Phase 2-1. But it would become one if you tried to merge it with reads of `board-state.json` — Phase 2-2 handles that.
- **`saveVttJson()` uses atomic rename.** Writing to the version file is atomic, but the read-then-write sequence is not. Even inside the closure, you need to be careful that the read+write of the version is a single step.
- **The version file may not exist on first run.** `getVttBoardStateVersion` probably handles that by returning 0. Verify.
- **The closure currently returns `$nextState`.** The caller then does `$responseState['_version'] = $newVersion;` outside. After this fix, the closure should return both. Choose a clean shape — either `return [$nextState, $newVersion]` or `$responseState['_version'] = $newVersion` inside the closure.
- **Do not change the broadcast logic in this fix.** Phase 1-5 handles that.

## The change

### A. Make `incrementVttBoardStateVersion` take an optional "skip lock" flag OR be safe under the board state lock

Simplest: leave `incrementVttBoardStateVersion` alone (it's still a read-then-write on the version file), and call it from inside the `withVttBoardStateLock` closure. The board state lock is a per-file flock on `board-state.json`, so it does not conflict with the version file. But because the whole POST handler only ever increments the version while holding the board-state lock, the sequence "read current → compute next → write next" is now atomic **with respect to other POSTs**, because all other POSTs are serialized by the board-state lock.

That is enough to fix the race **for POSTs**. There is still a tiny race with concurrent **reads** of the version file, but since reads happen independently and clients use version comparisons to detect staleness, that's survivable.

### B. Move the call site

Find in `state.php` (approximately line 458-461):

```php
            return $nextState;
        });  // withVttBoardStateLock closure ends here, lock released

        // Increment version after successful save
        $newVersion = incrementVttBoardStateVersion();

        // Add version to response state
        $responseState['_version'] = $newVersion;
```

Change to:

```php
            // Version is bumped inside the lock, so all POSTs are serialized
            // through here and no two writes can ever share a version number.
            $newVersion = incrementVttBoardStateVersion();
            $nextState['_version'] = $newVersion;
            return [
                'state' => $nextState,
                'version' => $newVersion,
            ];
        });

        $responseState = $lockResult['state'];
        $newVersion = $lockResult['version'];
```

And update the surrounding code to use `$responseState` and `$newVersion` as before. If the surrounding code was already expecting `$responseState` to be returned directly from `withVttBoardStateLock`, you will need to rename the variable on the way out — e.g. `$lockResult = withVttBoardStateLock(...)` then `$responseState = $lockResult['state']`.

### C. Strengthen the version file read

In `getVttBoardStateVersion`, wrap the file read with an exclusive flock just while reading, to avoid the case where a concurrent writer's rename-mid-read returns an empty string:

```php
function getVttBoardStateVersion(): int
{
    $path = VTT_VERSION_FILE;
    if (!is_file($path)) {
        return 0;
    }
    $handle = @fopen($path, 'rb');
    if (!$handle) {
        return 0;
    }
    try {
        @flock($handle, LOCK_SH);
        $content = stream_get_contents($handle);
    } finally {
        @flock($handle, LOCK_UN);
        @fclose($handle);
    }
    if (!is_string($content) || $content === '') {
        return 0;
    }
    $data = json_decode($content, true);
    if (!is_array($data) || !isset($data['version'])) {
        return 0;
    }
    return max(0, (int) $data['version']);
}
```

And mirror the same for the write:

```php
function incrementVttBoardStateVersion(): int
{
    $path = VTT_VERSION_FILE;
    $handle = @fopen($path, 'c+b');
    if (!$handle) {
        // Fall back to the unlocked path. Should not happen in practice
        // because we always hold board-state.json's lock, but be safe.
        $next = getVttBoardStateVersion() + 1;
        saveVttJson(VTT_VERSION_FILE, [
            'version' => $next,
            'updatedAt' => time(),
        ]);
        return $next;
    }
    try {
        @flock($handle, LOCK_EX);
        $content = stream_get_contents($handle);
        $current = 0;
        if (is_string($content) && $content !== '') {
            $decoded = json_decode($content, true);
            if (is_array($decoded) && isset($decoded['version'])) {
                $current = max(0, (int) $decoded['version']);
            }
        }
        $next = $current + 1;
        $encoded = json_encode([
            'version' => $next,
            'updatedAt' => time(),
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        rewind($handle);
        ftruncate($handle, 0);
        fwrite($handle, (string) $encoded);
        fflush($handle);
        return $next;
    } finally {
        @flock($handle, LOCK_UN);
        @fclose($handle);
    }
}
```

This is belt-and-suspenders: even though the board-state lock already serializes writers, the version file itself is now independently lockable. If some future code path increments the version without holding the board-state lock, it still won't race.

## Verification

1. **Concurrency test.** Open a terminal and hammer the POST endpoint from two parallel processes. Use `ab` (ApacheBench), `curl` in a loop, or a small PHP script. Goal: send ~100 simultaneous saves from two clients. After the storm, inspect `board-state-version.json` and confirm the version is exactly **sum of all successful writes**, not less. If two writes collided, the version will be off by one or more.

   A simple parallel test using shell:
   ```bash
   for i in $(seq 1 50); do
     curl -s -X POST -d '{"_socketId":"test","placements":{}}' \
       http://localhost/dnd/vtt/api/state.php -H 'Content-Type: application/json' &
   done
   wait
   cat /home/user/gmscreen/dnd/vtt/data/board-state-version.json
   ```
   Version should increment by exactly the number of successful responses.

2. **Browser test.** Open two tabs as different users. Both drag tokens simultaneously for 10 seconds. Stop. Refresh both. Both should see the same final state, and the `_version` returned by a subsequent GET should be greater than or equal to the number of moves made. No snap-back, no stuck tokens.

3. **Regression check.** The existing single-user flow still works. Move a token, refresh, token is where you left it.

4. **JS tests still pass** (none of this is client-side, but run them for paranoia):
   ```bash
   cd /home/user/gmscreen/dnd/vtt && npm test
   ```

## Rollback

```bash
git diff HEAD
git checkout HEAD -- dnd/vtt/api/state.php
```

## Commit message

```
vtt-sync: phase 2-1 bump state version inside the file lock

incrementVttBoardStateVersion() used to run outside withVttBoardStateLock(),
so two concurrent POSTs could read the same current version and both
return the same new version. Clients then had no reliable way to tell
which update was newer, causing snap-back of tokens.

Move the increment call inside the lock closure so every POST is
serialized through the version bump. Also wrap the version file's
read and write in their own flock for defense in depth, in case any
future code path increments without holding the board-state lock.

See docs/vtt-sync-refactor/phase-2-1-version-in-lock.md.
```

## After this fix

Phase 2-2 consolidates the version into `board-state.json` itself, so there's only one file to lock. That is a cleanness fix more than a correctness fix — after Phase 2-1, correctness is already solid. Phase 2-2 is optional. Phase 2-3 is the client-side half of the correctness story: make sure the client actually rejects stale save responses. Do 2-3 before moving on to Phase 3.
