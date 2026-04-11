# Phase 0 — Rotate & Hide the Pusher Secret

> **Prerequisite reading:** `README.md`, `diagnosis-findings.md` (finding S8), `pre-flight-investigation.md`.

## Context

The Pusher `secret` is committed to this repository in plain text at `dnd/vtt/config/pusher.php`. The public `key` is fine to commit (Pusher designs it to be public), but the secret grants anyone who has it the ability to publish messages to the channel, impersonating the server. Since this repo is hosted on GitHub at `Tastanis/gmscreen`, the secret is effectively public.

This fix does two things:

1. **Coordinates with the user to rotate the secret in the Pusher dashboard.** You cannot do this step. The user must log into `dash.pusher.com` and click Reset.
2. **Moves the new secret out of version control** into a gitignored local file, and updates the config loader to read from that file.

## Prerequisites

- Be on branch `claude/app-communication-architecture-y5g1l`.
- Tests green before starting.
- **The user must have already rotated the secret in the Pusher dashboard.** If they have not, stop and ask them to do that first. Do not proceed with an un-rotated secret — whatever you commit will just expose the new secret the same way.

## Files you will need to load into memory

Read these before editing:

- `dnd/vtt/config/pusher.php` — current secret location.
- `dnd/vtt/bootstrap.php` — look for how `pusher.php` is loaded (around line 180).
- `dnd/vtt/api/state.php` — also loads pusher config (around line 58).
- `dnd/vtt/lib/PusherClient.php` — the consumer of the config.
- `.gitignore` at the repo root.

## Investigation to run before touching anything

1. Confirm the secret really is still in the file:
   ```
   Grep for 'secret' in dnd/vtt/config/pusher.php
   ```
2. Find every place the config is loaded:
   ```
   Grep for "config/pusher.php" across the repo (glob: "**/*.php")
   ```
   Record every hit. Each of those call sites will need to still work after the change.

3. Check `.gitignore`:
   ```
   Read /home/user/gmscreen/.gitignore
   ```
   Confirm there is not already a `pusher.local.php` pattern in it. If there is, that's fine; just reuse it.

4. Ask the user to confirm the secret has been rotated and to paste the **new** secret so you have the value to put in the local file. Do not proceed without this.

## Gotchas already discovered

- **The `key` must stay in the committed config** because `layout.php` echoes it directly into the HTML (`dnd/vtt/templates/layout.php:42-46`) so the JS client can connect. Only remove the secret, not the key.
- **There are two PHP files that load `config/pusher.php`**: `bootstrap.php` and `api/state.php`. Both must be updated consistently.
- **`app_id` is semi-sensitive.** It's not a credential, but combined with the secret it identifies the Pusher app. Treat it with the same care as the secret — move it to the local file too.
- **Git history still contains the old secret** even after you commit the fix. That is why step 1 (rotating the secret in the dashboard) is the actually-important part. If the user hasn't done it, the commit does nothing. Confirm again.

## The change

You will create two files and modify three.

### A. Create `dnd/vtt/config/pusher.local.php` (new, gitignored)

This file holds the real secrets. Its shape:

```php
<?php
declare(strict_types=1);

return [
    'app_id' => '2106273',
    'secret' => 'THE_NEW_ROTATED_SECRET_FROM_USER',
];
```

Use whatever `app_id` is currently in `pusher.php` (it should still be `2106273` unless Pusher rotated it) and the new secret the user provided.

### B. Modify `dnd/vtt/config/pusher.php`

Remove the `app_id` and `secret` fields. Leave everything else. At the end of the returned array, merge in the local file if it exists:

```php
<?php
declare(strict_types=1);

$baseConfig = [
    // NOTE: app_id and secret live in pusher.local.php (gitignored).
    // Do not put them back into this file.
    'key' => 'c32516844b741a8b1772',
    'cluster' => 'us3',
    'enabled' => true,
    'channel' => 'vtt-board',
    'timeout' => 5,
    'broadcast_events' => [
        'placements' => true,
        'templates' => true,
        'drawings' => true,
        'pings' => true,
        'combat' => true,
        'scene' => true,
        'overlay' => true,
    ],
];

$localPath = __DIR__ . '/pusher.local.php';
if (is_file($localPath)) {
    $local = require $localPath;
    if (is_array($local)) {
        $baseConfig = array_merge($baseConfig, $local);
    }
}

return $baseConfig;
```

Note: the `key` currently in the committed file (`c32516844b741a8b1772`) stays — that is the public key and is safe. If the user has also rotated the key (they don't need to, but some people do), use the new value.

### C. Create `dnd/vtt/config/pusher.local.php.example`

A template file that IS committed, showing the shape of the local file, but with blank values:

```php
<?php
declare(strict_types=1);

// Copy this file to pusher.local.php and fill in real values.
// pusher.local.php is gitignored.

return [
    'app_id' => '',
    'secret' => '',
];
```

### D. Update `.gitignore`

Add at the end of the file:

```
# VTT Pusher secrets — never commit pusher.local.php
dnd/vtt/config/pusher.local.php
```

### E. Verify `bootstrap.php` and `api/state.php` still work

Because `config/pusher.php` now returns the merged array, the call sites in `bootstrap.php:180-186` and `api/state.php:58-88` will continue to work unchanged — they already `require` the config file and read its fields. **Do not modify those call sites.** Just confirm they are reading the same field names (`key`, `cluster`, `channel`, `app_id`, `secret`, `enabled`).

## Verification

1. Confirm the git status:
   ```bash
   git status
   ```
   Expected: `pusher.php` and `.gitignore` modified, `pusher.local.php.example` added. `pusher.local.php` should NOT appear (it's gitignored). If `pusher.local.php` shows up in `git status`, the gitignore entry is wrong.

2. Confirm `pusher.local.php` is actually ignored:
   ```bash
   git check-ignore dnd/vtt/config/pusher.local.php
   ```
   Expected: the file path is echoed back.

3. Open the VTT in a browser and verify it still connects to Pusher:
   - Watch the JS console for `[VTT Pusher]` connection logs.
   - Network tab, WS filter — should show a connection to `ws-us3.pusher.com`.
   - Move a token as GM. Another player's client should still receive it.

4. Search the committed files to confirm no secret remains:
   ```
   Grep for 'eefd4c24' across the entire repo (the first 8 chars of the old secret).
   ```
   If the old secret still appears anywhere, fix those hits too. The git history will still contain it (which is why rotation matters), but no *current* committed file should have it.

## Rollback

If anything breaks:

```bash
git diff HEAD  # see what changed
git checkout HEAD -- dnd/vtt/config/pusher.php .gitignore
rm dnd/vtt/config/pusher.local.php.example
```

Note: the user's `pusher.local.php` stays — it is gitignored. That is fine.

## Commit message

```
vtt-sync: phase 0 move Pusher secret out of version control

Rotate the Pusher secret (done manually in the Pusher dashboard by the
user) and load app_id + secret from a gitignored pusher.local.php. The
committed pusher.php now contains only public config (key, cluster,
channel). Git history still contains the old secret, but the old secret
has been invalidated by the dashboard rotation.
```

## After this fix

Tell the user:

1. Confirm they also rotated the secret in the Pusher dashboard (they should have done this before you started, but double-check).
2. The new secret is in `dnd/vtt/config/pusher.local.php` which is gitignored and stays on their machine. If they redeploy to a new server, they need to manually create that file there.
3. The old secret is still visible in the git history of this repo. That is acceptable because it is no longer valid. Do not try to rewrite git history to remove it unless the user explicitly asks — rewriting history on a shared branch causes more problems than it solves.
