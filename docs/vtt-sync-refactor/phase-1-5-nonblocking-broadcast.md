# Phase 1-5 — Stop Blocking the Client's Save on the Pusher Broadcast

> **Prerequisite reading:** `README.md`, `diagnosis-findings.md` (findings S3 and S5), `pre-flight-investigation.md`.

## Context

When a client saves a state change, `dnd/vtt/api/state.php` does this sequence:

1. Acquire the file lock.
2. Read + merge + save `board-state.json`.
3. Release the lock.
4. Increment the version (Phase 2-1 fixes this).
5. **Call `broadcastVttStateUpdate()` which makes a synchronous cURL request to Pusher with a 5-second timeout.**
6. Only now, `respondJson(200, ...)` sends the response back to the client.

Step 5 blocks the client's save response by however long Pusher takes to acknowledge. In good conditions that's ~100 ms. In bad conditions (rate limit, slow network, Pusher hiccup) it can be up to the full 5-second timeout. For the person who moved the token, every move feels sluggish. Everyone else sees the move quickly (once Pusher delivers), but the sender's own UI is locked.

The fix is to respond to the client first, then broadcast. There are two techniques. Pick whichever your PHP host supports.

## Prerequisites

- Tests green.
- No client-side changes needed. This is server-side only.
- **Confirm which PHP SAPI the host uses.** PHP-FPM supports `fastcgi_finish_request()`. Apache mod_php does not (or only sort of — it works unreliably). If you don't know, assume PHP-FPM and try Option A; fall back to Option B if it doesn't work.

## Files you will need to load into memory

1. **`dnd/vtt/api/state.php`** — the POST handler around lines 196-502. You will restructure the response + broadcast ordering.
2. **`dnd/vtt/lib/PusherClient.php`** — just skim, you need to understand its `trigger()` method's blocking behavior.
3. **`dnd/vtt/bootstrap.php`** — check if it does any output-buffering tricks you could accidentally break.

## Investigation to run before touching anything

1. **Find the SAPI:**
   ```bash
   php -r 'echo PHP_SAPI;'
   ```
   If it returns `fpm-fcgi`, you have PHP-FPM and `fastcgi_finish_request()` is available. If it returns `apache2handler`, you do not. If it returns `cli`, this is the wrong command — you need to find the actual production SAPI. Ask the user if unclear.

2. **Confirm `fastcgi_finish_request` is callable:**
   ```bash
   php -r 'var_dump(function_exists("fastcgi_finish_request"));'
   ```
   If `true`, Option A will work. If `false`, use Option B.

3. **Grep for existing uses of output buffering or flush:**
   ```
   Grep for "ob_" in dnd/vtt
   Grep for "flush(" in dnd/vtt
   ```
   If the bootstrap or handlers do anything interesting with output buffers, your fix must not conflict with that.

4. **Check if `respondJson` in `state.php` does its own cleanup after sending.** Read the function body. You need to know whether it calls `exit()` or returns. If it exits, Option A below must happen *before* the exit, which means restructuring the function. If it returns, you can add code after the call.

## Gotchas already discovered

- **`fastcgi_finish_request` works on PHP-FPM only.** Do not assume it's everywhere. If it doesn't exist on the user's host, Option B is a functional but uglier fallback.
- **After `fastcgi_finish_request`, the script keeps running** but the client has already received the response. Any `echo` or `print` after this point is lost (that's the point). You must have already printed everything you want the client to see before calling it.
- **PHP session locks.** Sessions opened with `session_start()` hold a file lock on the session file until the script ends or you call `session_write_close()`. If you don't release the session before the long Pusher call, other requests from the same user will be serialized. Call `session_write_close()` before the broadcast.
- **`respondJson()` may call `exit`.** Check. If it does, you need to remove the exit, add the finish + broadcast + explicit exit, or wrap the whole thing differently.
- **Errors during the broadcast are still logged.** Do not swallow exceptions silently. The diagnosis called out S5 (silent failures). Make sure `error_log` is still called on failure. You do not need to surface the error to the client anymore, since the client has already moved on.
- **If you choose Option B (background script),** you are trusting `popen` / `proc_open` not to block. Test it. Some hosts misconfigure `popen` to inherit the stdout pipe, which blocks the parent until the child closes stdout. The safe pattern is to double-fork or redirect the child's stdout/stderr to `/dev/null`.
- **There is no test coverage on the server side.** Verify manually with a fake slow Pusher. See Verification.

## The change — Option A (PHP-FPM with `fastcgi_finish_request`)

### A1. Restructure the POST handler response flow

Find the POST handler in `state.php`. After Phase 0 the relevant block is around line 196-502. The last ~30 lines of the handler look approximately like:

```php
$responseState['_version'] = $newVersion;

// Broadcast update via Pusher (non-blocking, fails silently)
$broadcastData = [ ... ];
broadcastVttStateUpdate($broadcastData, $clientSocketId);

respondJson(200, [
    'success' => true,
    'data' => $responseState,
]);
```

Change to:

```php
$responseState['_version'] = $newVersion;

$broadcastData = [
    // ... build broadcast payload as before ...
];

// Send the response to the client first.
respondJson(200, [
    'success' => true,
    'data' => $responseState,
]);

// Release the session lock so other requests from the same user
// are not serialized behind this one's remaining work.
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

// Flush PHP-FPM's response so the client is already unblocked.
if (function_exists('fastcgi_finish_request')) {
    fastcgi_finish_request();
}

// Now do the Pusher broadcast — the client is no longer waiting.
broadcastVttStateUpdate($broadcastData, $clientSocketId);
```

**Important:** `respondJson` may call `exit`. Read it and confirm. If it does, you must make it return instead (remove the exit) because your new logic needs to run after it. If `respondJson` is used from other endpoints that rely on the exit, wrap the exit behind a parameter like `respondJson(200, $body, ['exit' => false])` and pass false from this call site only.

### A2. Do not remove the error logging

Inside `broadcastVttStateUpdate` and `PusherClient::trigger`, all existing `error_log` calls stay. They'll still fire if Pusher fails. The only difference is that failures no longer block the client.

## The change — Option B (background script, no FPM)

### B1. Write a small broadcast worker script

Create `dnd/vtt/lib/broadcast-worker.php`:

```php
<?php
declare(strict_types=1);

/**
 * Background broadcast worker. Reads a JSON payload from stdin and calls
 * broadcastVttStateUpdate() without blocking anyone. Invoked from state.php
 * via a non-blocking popen on hosts where fastcgi_finish_request() is not
 * available.
 */

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/PusherClient.php';
// Whatever includes broadcastVttStateUpdate() in state.php need to be
// factored so this script can also call it. See step B2.

$input = stream_get_contents(STDIN);
if ($input === false || $input === '') {
    exit(0);
}
$decoded = json_decode($input, true);
if (!is_array($decoded)) {
    exit(0);
}

$broadcastData = $decoded['broadcastData'] ?? null;
$socketId = $decoded['socketId'] ?? null;
if (!is_array($broadcastData)) {
    exit(0);
}

try {
    broadcastVttStateUpdate($broadcastData, is_string($socketId) ? $socketId : null);
} catch (Throwable $e) {
    error_log('[VTT broadcast-worker] ' . $e->getMessage());
}
```

### B2. Factor `broadcastVttStateUpdate` into a shared file

If `broadcastVttStateUpdate` currently lives inside `state.php`, move it into a new file `dnd/vtt/lib/pusher-broadcast.php` and have both `state.php` and `broadcast-worker.php` `require_once` it.

### B3. Kick off the worker from `state.php`

Replace the blocking broadcast call:

```php
$broadcastJson = json_encode([
    'broadcastData' => $broadcastData,
    'socketId' => $clientSocketId,
], JSON_UNESCAPED_SLASHES);

// Non-blocking: write to the worker's stdin and close it.
$cmd = escapeshellcmd(PHP_BINARY) . ' '
     . escapeshellarg(__DIR__ . '/../lib/broadcast-worker.php')
     . ' > /dev/null 2>&1';
$proc = proc_open($cmd, [
    0 => ['pipe', 'r'], // stdin: we write the payload here
    1 => ['file', '/dev/null', 'w'],
    2 => ['file', '/dev/null', 'w'],
], $pipes);

if (is_resource($proc)) {
    fwrite($pipes[0], $broadcastJson);
    fclose($pipes[0]);
    // Do NOT call proc_close here — it would block waiting for the child.
    // Let the child finish on its own. OS will reap it.
}

respondJson(200, [
    'success' => true,
    'data' => $responseState,
]);
```

**Gotcha:** closing the child's stdin (`fclose($pipes[0])`) is what tells the worker to stop reading and start broadcasting. Without it, the worker sits waiting for input forever. Do not skip this line.

## Verification

1. Move a token. In DevTools → Network → XHR, find the POST to `state.php`. Its total time should now be **under 100 ms**, instead of hundreds of ms. Before the fix, in bad network conditions it could be up to 5 seconds.

2. Simulate a slow Pusher: in `pusher-service.js` or server-side, temporarily point the Pusher host at `10.255.255.1:443` (a black hole) to force a timeout. Or uninstall Pusher enabled flag. With the fix in, the client's save should still return immediately and the broadcast will silently fail (logged to error_log). Without the fix, the save would hang for 5 seconds.

3. Check the PHP `error_log` after a simulated failure. You should see a `[Pusher] cURL error` or similar line, confirming the error logging still works.

4. Open two tabs. Move a token in tab 1 (the sender). The send should feel instant. Tab 2 should still receive the move (via the Pusher broadcast, which still happens, just after the sender has already moved on).

5. Run a stress test: click rapidly on the board to place many pings or do many quick moves. The UI should stay responsive.

## Rollback

```bash
git diff HEAD
git checkout HEAD -- dnd/vtt/api/state.php
# Option A: nothing else to revert.
# Option B: also revert the worker script and the factored broadcast file.
git checkout HEAD -- dnd/vtt/lib/pusher-broadcast.php dnd/vtt/lib/broadcast-worker.php 2>/dev/null || true
rm -f dnd/vtt/lib/pusher-broadcast.php dnd/vtt/lib/broadcast-worker.php
```

## Commit message (Option A)

```
vtt-sync: phase 1-5 return state save response before broadcasting

The POST handler used to call broadcastVttStateUpdate() synchronously
before responding to the client, so every save blocked for up to 5s
if Pusher was slow. Now the response is sent first, the session lock
is released, fastcgi_finish_request() flushes the response, and the
broadcast runs after the client is already unblocked. Pusher failures
still log to error_log.

See docs/vtt-sync-refactor/phase-1-5-nonblocking-broadcast.md.
```

## Commit message (Option B)

```
vtt-sync: phase 1-5 broadcast via background worker instead of blocking

Extract broadcastVttStateUpdate() to lib/pusher-broadcast.php so it
can be shared. state.php POST now writes the broadcast payload to a
background broadcast-worker.php via proc_open and returns immediately,
instead of blocking on the Pusher cURL call. Errors in the worker
still log to error_log.

See docs/vtt-sync-refactor/phase-1-5-nonblocking-broadcast.md.
```
