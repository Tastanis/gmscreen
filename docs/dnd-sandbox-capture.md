# Live D&D data capture and isolated desktop sandbox

This replaces the diagnostic downloader's fixed file list with a recursive,
authenticated D&D capture. It does **not** deploy itself or grant access merely by
being uploaded. The first production file capture passed on October 7, 2026; the signed-in
gameplay comparison remains pending.

## What is included

- New JSON and supported media anywhere under the deployed `public_html/dnd`,
  including character sheets, monster automation, map state, portraits and uploads.
- SQLite databases through the SQLite backup API, including committed WAL data,
  all tables and operation receipts. Never copy a live `.sqlite` file alone.
- SHA-256 fingerprints of deployed PHP, JavaScript, CSS and HTML. Desktop source
  must match before a baseline sandbox is prepared. Source code and credentials
  are not downloaded through this endpoint.
- An explicit list of excluded files and unresolved coverage issues. Unknown
  file types and symbolic links are reported instead of silently ignored.

Archives/backups (including retired `.old` files), logs, sessions (including loose
PHP `sess_*` files), private configuration, tooling and documentation
are excluded. File types are a security boundary, not a per-feature file list.
Additional D&D-only directories can be mounted in the private configuration.
Never mount the whole hosting account, ASL, or its shared database.

The deployed `HexDataManager` can use MySQL or fall back to JSON. **MySQL export
and import are not implemented by this package.** Leave `hex_storage` unreviewed
until the deployed storage is checked. If MySQL is active, capture can collect
the file/SQLite portion, but sandbox preparation is blocked. A scoped MySQL
adapter is then required; do not select JSON just to bypass the check.

Browser-only localStorage/IndexedDB, unsaved edits, third-party hosted media and
unmapped storage outside D&D are not magically recoverable from the server.
The map3d IndexedDB terrain cache in the current source is derived from code;
other browser-only content still needs separate review. Explicit current-state media
references are checked before preparation; external/missing images block it.
Retired V1 board state, event/operation history, checkpoints, and completed scene
imports are retained byte-for-byte; their missing media is listed in
`historical_reference_warnings` instead of blocking the current board. Pending
imports remain blocking. The unused zero-byte legacy `gm-notes.json` placeholder
is likewise preserved and reported; active JSON stores still require valid JSON.
Relative URLs and dynamically constructed references also require browser QA.

## Install on GoDaddy/cPanel

1. Upload the two endpoint files from `dnd-sandbox-capture-upload.zip`, preserving
   their paths beneath `public_html`:
   - `dnd/admin/sandbox-export/index.php`
   - `dnd/admin/sandbox-export/lib.php`
   This does not replace characters, uploads, databases, or existing sync tools.
2. Confirm the site's PHP is at least 8.1 and the **sqlite3** extension is enabled.
   PDO SQLite alone is not enough for the server backup API. The PHP account needs
   read access to D&D storage and a private temporary directory outside the web
   root. It needs space for one temporary database copy. Large manifests may need
   a higher hosting request time limit; a timeout must be treated as a failed capture.
3. Generate a new access key on your desktop, from the repository directory:

   ```powershell
   python dnd/tools/capture-sandbox.py key --output "$env:USERPROFILE\Desktop\DND Capture Private"
   ```

   This creates `capture-token.txt` and `dnd-sandbox-export.php`. Keep the token
   private and local. The server configuration contains only its SHA-256 hash.
   Never commit either file. Keep the folder out of shared/synchronized locations.
4. Review `hex_storage` in that private configuration against the deployed site's
   actual storage. Start with `unreviewed` if unsure; inventory/download still work.
5. Upload **only** `dnd-sandbox-export.php` to the cPanel account home, next to
   `public_html`, **not inside it**. For this account the expected location is
   `/home/rylabsuueil3/dnd-sandbox-export.php`. Set its permissions to `0600`.
   Keep `allow_loopback_http` false. This is the step that enables authenticated
   read access. Removing that file revokes access; rotating it invalidates the old key.
6. An unauthenticated request to
   `https://bharmsasl.com/dnd/admin/sandbox-export/index.php?action=manifest`
   must return **403** after configuration (503 before configuration).

No broad cPanel credentials are needed by the downloader. It sends the dedicated
token in an HTTPS header, never a URL, and refuses redirects. No shared school
database is queried. The endpoint does not initialize application storage,
change player sessions/presence, or submit gameplay commands. SQLite reads can
use SQLite's normal shared-memory coordination; temporary backups are deleted.

## Capture and prepare

Capture while nobody is changing the game, with live VTT tabs closed. Open tabs
update presence even without token movement; those SQLite changes correctly
invalidate this conservative two-pass capture. From the repository directory:

```powershell
python dnd/tools/capture-sandbox.py capture --output "$env:USERPROFILE\Desktop\DND Captures"
```

Paste the private token at the hidden prompt. It is not saved in the capture.
The command prints a new `capture-...` folder. Open its `manifest.json`: review
`issues`, `excluded`, `environment`, and `limitations`. Resolve issues before
preparing. Keep the capture private: it contains campaign/GM data.

```powershell
python dnd/tools/capture-sandbox.py prepare --capture "C:\path\to\capture-..." --output "$env:USERPROFILE\Desktop\DND Sandboxes"
```

Preparation compares all captured source hashes with this repository. Windows
Git line-ending conversion is accepted only when restoring LF or CRLF produces
the **exact deployed hash**; the sandbox receives those matching bytes. If it
stops, read `mismatches.json`; obtain the matching deployed source or explicitly
reconcile deployment first. Do not overlay a different repository revision and
call it a production match. Missing/remote media is listed in `reference-issues.json`.

The printed sandbox folder contains a baseline copy and `sandbox-report.json`.
It uses only downloaded data; stale local JSON is never overlaid. It disables
Pusher, replaces the MySQL connection with an explicit JSON-mode failure, uses
separate sessions, and keeps storage separate from production and the capture.
Only the copied Pusher/database configurations and local serving behavior differ
intentionally from the verified baseline; these are documented in the report.

```powershell
python dnd/tools/capture-sandbox.py serve --app "C:\path\to\sandbox-..."
```

Open `http://127.0.0.1:18790/dnd/` and sign in normally. The launcher requires PHP
with sqlite3 and pdo_sqlite. It binds only to loopback, disables PHP URL fetching,
mail and common outbound/process functions, clears inherited VTT overrides, and
sets a browser policy blocking production connections and form submissions.
Same-site D&D media URLs are localized in HTTP responses; captured data bytes
stay unchanged. Listed third-party library/font CDNs remain available. This is
application-level isolation for trusted project code, not a security VM for
untrusted code. Use this launcher, not a generic `php -S` command.

Stop with Ctrl+C. Changes made in the sandbox stay there. To refresh, capture and
prepare again. Every run gets a new folder; previous captures and sandbox work
remain intact. A failed capture does not replace `latest-capture.json`.

## What verification means

Each downloaded file must match its declared length and SHA-256. SQLite copies
must pass integrity checks. A second complete manifest must match the first;
changes, deletions, additions and code changes during the transfer fail the run.
This detects observed drift but is **not a globally atomic whole-site backup**:
the application has no single transaction/lock covering every store. Keep the
game idle for the capture. An A-to-B-to-A edit or a change between independent
store observations is not mathematically ruled out by double checking hashes.

Local regression command:

```powershell
python dnd/tools/test_capture_sandbox.py
```

Disposable loopback fixtures cover authentication and traversal boundaries,
forbidden code/private reads, SQLite WAL/receipts, source preservation, stale
hashes, new/deleted files, failed-refresh pointer preservation, mismatched code,
unknown/missing stores, missing/remote media, redirects, HTTPS enforcement in the
client, local launcher isolation and sandbox-only database writes.

After installation, the remaining acceptance checks are:

1. Review the real manifest and resolve every coverage issue, including MySQL,
   external roster overrides, symlinks and any outside-folder dependency.
2. Compare a real PC's wealth/resources and automation, a monster's complete JSON,
   portraits, a loaded scene's terrain/floors/tokens and the Strixhaven map.
3. Inspect local browser requests for missing assets/errors and production calls.
4. Change resources and move tokens **locally**, reload, and verify persistence.
   Re-read production to confirm those values did not change.
5. After a user-made live change, capture again and verify that change arrives.
   Compare a real deletion if one is naturally available; do not delete campaign
   data just to manufacture a test.

Until these pass, call it a verified file capture or a prepared sandbox, not an
exact production-equivalent game. PHP versions, extensions, operating systems,
Apache rules and multiplayer delivery can also differ from the hosted environment.

## Desktop launcher wiring

The user's test checkout uses `tools/capture-live.py` behind **Run Diagnostic Sync**
and **Start Local VTT**. It keeps captures under ignored
`runtime/test-data/full-capture`, reads the dedicated key from the private Desktop
folder, and advances the sandbox pointer only after successful preparation.
Unchanged files can be reused only after matching the fresh manifest's length and
SHA-256; the two-manifest consistency check still applies. Deployed code can be
recovered from local Git history only when its bytes match the deployed hash.
The main working checkout is not modified to match an older deployment.

### October 7, 2026 installation verification

The endpoint is installed in cPanel with its enabling configuration outside the
public root (0600). PHP 8.3 and sqlite3 are available. The deployed local database
configuration names `dnd_gmscreen`; the hosting account lists only `asl_users` and
`dnd_characters`, so the documented JSON fallback applies. No ASL database was read.
The authenticated capture verified 2,023 data/media files (about 3.17 GB) and 510
source fingerprints, recovering 57 exact deployed versions from local Git history.
Coverage issues were zero after explicit session/retired-file exclusions. Historical
media warnings remain recorded without deleting or rewriting the original records.
The prepared sandbox passes SQLite integrity and serves a local login page with
self-only connection/form restrictions. Signed-in gameplay verification still
requires the user's current login; the old documented GM credentials were rejected.
