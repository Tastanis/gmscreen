# Phase 1-4 — Thread the Pusher Socket ID Through Saves

> **Prerequisite reading:** `README.md`, `diagnosis-findings.md` (finding C4), `pre-flight-investigation.md`, Phase 1-1 committed.

## Context

When a client saves a state change, the server broadcasts that change via Pusher to every client subscribed to the channel — including the sender. The sender doesn't need its own move echoed back; it already applied the change locally. Echoes cause jitter and redundant work.

Pusher has a built-in mechanism for this: if the server's `trigger()` call includes a `socket_id`, Pusher will exclude the client holding that socket from the broadcast. But it only works if the client tells the server its socket ID when it saves. Right now, the client never does. Instead, it relies on a fragile fallback: comparing the broadcast's `authorId` field to the current user's name. If two users share a name, or if a user's name is missing, dedup fails and they receive their own echoes.

This fix:
1. Exposes Pusher's socket ID from `pusher-service.js`.
2. Has `board-state-service.js` include it in every save payload.
3. Has the PHP `state.php` handler pass it through to `PusherClient::trigger()` as the `socket_id` exclusion parameter.

## Prerequisites

- Phase 1-1 committed (you need a clean init order).
- Tests green.

## Files you will need to load into memory

1. **`dnd/vtt/assets/js/services/pusher-service.js`** — full file.
2. **`dnd/vtt/assets/js/services/board-state-service.js`** — focus on `persistBoardState` and the `_socketId` handling (diagnosis mentioned lines 224-226).
3. **`dnd/vtt/assets/js/ui/board-interactions.js`** — find `persistBoardStateSnapshot` (around lines 2144-2221) and `initializePusherSync`. You need to bridge the socket ID from pusher-service into the save payload.
4. **`dnd/vtt/api/state.php`** — find the POST handler and the `broadcastVttStateUpdate` call (around line 501-502).
5. **`dnd/vtt/lib/PusherClient.php`** — find `trigger()` (around line 198). Confirm it already accepts a `socket_id` exclusion parameter. The diagnosis mentioned `$clientSocketId` being passed at state.php:502, suggesting this is partially wired already — verify.

## Investigation to run before touching anything

1. **Is PHP already threading a socket ID through?**
   ```
   Grep for "socket_id" in dnd/vtt/api/state.php
   Grep for "clientSocketId" in dnd/vtt/api/state.php
   Grep for "socket_id" in dnd/vtt/lib/PusherClient.php
   ```
   If the server side is already set up to read `_socketId` from the request body and pass it to `PusherClient::trigger`, then your job is only on the client side. If not, you need to do both sides.

2. **Does `board-state-service.js` already pass `_socketId` through?**
   ```
   Grep for "_socketId" in dnd/vtt/assets/js/services/board-state-service.js
   ```
   The diagnosis found it accepts the field but nothing sets it. Confirm.

3. **Does `pusher-service.js` expose the socket ID?**
   ```
   Grep for "socket_id" in dnd/vtt/assets/js/services/pusher-service.js
   Grep for "socketId" in dnd/vtt/assets/js/services/pusher-service.js
   Grep for "connection.socket_id" in dnd/vtt/assets/js/services/pusher-service.js
   ```
   If `pusherInstance.connection.socket_id` is already stored in `currentSocketId` (mentioned in the diagnosis), then you just need to expose a getter. Otherwise, add the whole thing.

4. **Find every call site that builds a save payload.**
   ```
   Grep for "persistBoardState" across the whole dnd/vtt/assets/js tree
   Grep for "persistBoardStateSnapshot" in board-interactions.js
   ```
   Each of these may need to pass the socket ID through. It's cleaner to attach it to the payload once at a central point rather than threading it through each call site.

## Gotchas already discovered

- **Socket ID can be null during the first few hundred ms of page load.** If a save happens that early (unlikely but possible), the socket ID field will be missing. This is fine — Pusher will just not exclude anyone, and the client-side self-dedup (the username fallback) still runs as a safety net. **Do not remove the username fallback in this fix.** Keep both layers; the socket ID is the primary, the username is the backup.
- **Socket ID can change on reconnect.** When Pusher drops and reconnects, you get a new socket ID. Make sure you read it fresh each time a save happens — do not cache it at init.
- **`PusherClient::trigger()` in the repo may not accept `socket_id` today.** The diagnosis mentioned `$clientSocketId` being passed at `state.php:501-502`, so it is plausibly already wired. Confirm by reading `PusherClient.php`. If not, you need to add a parameter. Pusher's REST API accepts a top-level `socket_id` field in the trigger POST body that excludes one connection.
- **Client-side `Pusher.connection` may not exist if Pusher failed to initialize.** Guard every access with optional chaining or an early return.
- **Do not send `_socketId` as part of the normalized board state.** It is metadata, not content. Strip it out on the server before saving to JSON. The save handler already strips `_version` in some places — follow the same pattern.
- **There is a subtle trap with `replace_all` when editing:** if you search for a property name that also appears in an unrelated context, your edit will touch the wrong spot. Use enough context in each `old_string` to be unique.

## The change

### A. Expose socket ID from `pusher-service.js`

In `pusher-service.js`, find where `currentSocketId` is tracked. If it's not tracked yet, add it. It should be set in the `connected` and `state_change` handlers:

```js
pusherInstance.connection.bind('connected', () => {
  currentSocketId = pusherInstance.connection.socket_id || null;
  // ... existing connected handling ...
});

pusherInstance.connection.bind('state_change', (states) => {
  if (states.current === 'connected') {
    currentSocketId = pusherInstance.connection.socket_id || null;
  } else if (states.current === 'disconnected' || states.current === 'failed') {
    currentSocketId = null;
  }
  // ... existing state_change handling ...
});
```

Then add to the returned interface:

```js
return {
  // ...existing fields including ready from Phase 1-1...
  getSocketId() { return currentSocketId; },
};
```

### B. Expose socket ID from `initializePusherSync` in `board-interactions.js`

Find `initializePusherSync` and store a reference to the interface so other code can query it:

```js
let pusherInterface = null;

function initializePusherSync() {
  pusherInterface = initializePusher({ ... });
  // ... existing handlers ...
  return pusherInterface?.ready ?? Promise.resolve({ connected: false });
}

function getCurrentPusherSocketId() {
  return pusherInterface?.getSocketId?.() ?? null;
}
```

If `pusherInterface` is already stored somewhere under a different name, reuse that.

### C. Include the socket ID in save payloads

Find `persistBoardStateSnapshot` in `board-interactions.js`. Find the place where the snapshot object is built. Add the socket ID to it:

```js
const snapshot = {
  // ... existing fields ...
};
const socketId = getCurrentPusherSocketId();
if (socketId) {
  snapshot._socketId = socketId;
}
```

If the snapshot is passed to `persistBoardState` in `board-state-service.js`, which the diagnosis says already reads `_socketId` at lines 224-226, no other client-side changes are needed.

### D. Pass the socket ID through on the server side

Read `dnd/vtt/api/state.php` around line 501 where `broadcastVttStateUpdate` is called. Look for `$clientSocketId`. It may already be extracted from `$payload['_socketId']` — confirm. If not, add:

```php
$clientSocketId = isset($payload['_socketId']) && is_string($payload['_socketId'])
    ? trim($payload['_socketId'])
    : null;
if ($clientSocketId === '') {
    $clientSocketId = null;
}
```

before the broadcast call, and make sure the call is:

```php
broadcastVttStateUpdate($broadcastData, $clientSocketId);
```

### E. Strip `_socketId` before saving to the JSON file

Find the code that builds `$nextState` and writes it to `board-state.json`. Make sure `_socketId` is not persisted. If the state merge is using `$payload` directly, unset the field:

```php
unset($payload['_socketId']);
```

right after you've extracted it into `$clientSocketId`. It is metadata for the broadcast, not part of the saved state.

### F. Verify `PusherClient::trigger()` honors `socket_id`

Open `dnd/vtt/lib/PusherClient.php` and find `trigger()`. It should build a POST body that includes `socket_id` when one is provided. Pusher's REST API accepts a top-level `socket_id` field that excludes the specified connection from the broadcast. If the method already accepts a `$excludeSocketId` parameter and puts it in the body, you're done. If not, add it:

```php
public function trigger(string $channel, string $event, array $data, ?string $excludeSocketId = null): bool
{
    $body = [
        'name' => $event,
        'channel' => $channel,
        'data' => json_encode($data, JSON_UNESCAPED_SLASHES),
    ];
    if ($excludeSocketId !== null && $excludeSocketId !== '') {
        $body['socket_id'] = $excludeSocketId;
    }
    // ... existing HMAC signing and curl_exec ...
}
```

### G. Keep the username-based fallback in place

Do **not** touch the existing self-dedup logic in `pusher-service.js` (around lines 203-214 in the diagnosis). That's the backup for cases where the socket ID is missing. Leaving it in place is belt and suspenders.

## Verification

1. JS tests pass (the username fallback is tested; don't break those tests):
   ```bash
   cd /home/user/gmscreen/dnd/vtt && npm test
   ```

2. Browser verification: open two separate browser tabs logged in as different users.
   - In the DevTools Console of tab 1, run:
     ```js
     window.Pusher.instances[0]?.connection.socket_id
     ```
     Note the socket ID value.
   - Drag a token in tab 1.
   - In the DevTools Console of tab 1, filter logs for `[VTT Pusher]`. You should NOT see `Skipping own update` based on author ID — you should see it based on socket ID exclusion (i.e., the event does not arrive at all). Pusher's own tracing shows broadcasts with an `excluded` field visible in the Pusher dashboard.
   - In tab 2, confirm the move arrives normally.

3. Inspect a POST request:
   - DevTools → Network → filter by `state.php`.
   - Trigger a token move.
   - Click the request, look at the Payload tab. You should see `_socketId` as a field in the JSON body.

4. Check the Pusher dashboard's Debug Console (dash.pusher.com → your app → Debug Console) during a move. The broadcast event should show "excluded: 1 client" or similar.

## Rollback

```bash
git diff HEAD
git checkout HEAD -- dnd/vtt/assets/js/services/pusher-service.js \
  dnd/vtt/assets/js/services/board-state-service.js \
  dnd/vtt/assets/js/ui/board-interactions.js \
  dnd/vtt/api/state.php \
  dnd/vtt/lib/PusherClient.php
```

## Commit message

```
vtt-sync: phase 1-4 thread Pusher socket ID through saves

Clients now include their Pusher socket_id in every state save. The
server passes it to PusherClient::trigger() as the exclusion parameter,
so Pusher no longer echoes the broadcast back to the sender. The
username-based self-dedup in pusher-service.js is kept as a fallback
for the case where the socket ID is missing (e.g. early-page-load
saves before Pusher has connected).

See docs/vtt-sync-refactor/phase-1-4-socket-id.md.
```
