## Current map runtime authority — September 27, 2026

The deployable source is now checked in under `dnd/vtt/assets/js/ui/`, the Sync V2
API and `dnd/vtt/lib/`. Older references below to ignored prototype modules are
historical. Never copy those prototype modules over the repository version.
Read `docs/vtt-map-runtime-release.md` for packaging, migration and verification.
Read `docs/dungeon-alchemist-map-import.md` before map work. Preserve native files,
exported images and existing sandbox data; code updates never require scene setup.
The campaign vault's AGENTS.md and .claude/CLAUDE.md already point to that same guide.

# Claude Code Development Notes

## Dungeon Alchemist layered maps

Before creating, exporting, importing, or repairing Dungeon Alchemist maps,
read `docs/dungeon-alchemist-map-import.md` and the current `AGENTS.md`.
Follow the guide's source lookup, preservation rules, and validation passes.
Its prototype artifacts are local and Git-ignored; recover missing inputs rather
than inventing them. Never run rebuild/setup scripts as routine sandbox refreshes.
The campaign vault entry point is `Guides/Dungeon-Alchemist-Map-Import.md` under
`C:/Users/tasta/Desktop/Claude Work/Claude DND/Obsidian DND/Claude dnd`.
Keep technical instructions in the gmscreen guide; vault instructions link to it.

## Host load: repeated reads (November 24, 2026 incident)

The site is on shared hosting with a limit of 65 processes. During play the account hit that limit
again and again and the host answered 522. Anything a page asks for on a timer must follow these rules:

- **A read only reads.** A GET (or `chat_fetch`, `chat_test_state`, inventory `load`) never rewrites a
  data file. Clean-up of expired entries happens on the next real change (see `ping-api.php`).
- **A read lets go of the session.** PHP keeps the session file locked until the request ends, so one
  slow request queues every other request from that player. Repeated reads call `session_write_close()`
  as soon as they know who is asking: `vttSyncV2AuthContext()` for every `api/v2` GET, and the same
  line in `chat_handler.php`, `character_sheet/handler.php`, `inventory_handler.php` and the two campus
  map APIs. Requests that change something keep the session to their end; do not release it for those
  unless the change is guarded by its own file lock (the campus map APIs are).
- **A change is one locked read, alter, write.** `withPingLock(true, ...)`, `withOverlayLock(...)`.
- **One read out at a time per feed, with back-off.** Campus map: `sharedFeed` in `map3d/index.php`.
  Table: `pollRead` in `table-apps.js`. Board: `recovery-polling.js`. A bare `setInterval(fetch)` is not
  allowed for a new feed.
- **"Seen here" is written once a second at most** (`SyncV2Store::touchPresence`). Who is here is still
  anyone seen in the last five seconds; do not raise `PRESENCE_REFRESH_MS` without re-checking that.

Tests: `dnd/vtt/api/v2/tests/hosting-load.test.php` and `dnd/strixhaven/map3d/tests/shared-feeds.test.mjs`.

## Table fixes after the November 24, 2026 session (Build 651)

Brandon's list of sixteen. Where each one lives, for whoever touches it next:

- **Pings show in the dark.** A ping's beam is drawn in the board's signal pass (`scene-view.mjs` `signalScene`),
  after vision has blacked out what the heroes cannot see. Anything else that must show through vision goes there.
  Alt + click on a token pings the token's own square (`bridge.pingToken`; 3D tokens are not inside the map surface).
- **A body.** `placement.dead` (Director only, token settings "Dead or unconscious"): a skull on the token
  (`paintDeadMark`) and a red ring at its base (`layers/token-footprints.mjs`, `TOKEN_LOOKS.body`).
- **Universal actions.** One file, `dnd/character_sheet/ability-automation/universal-actions.json`, added to every
  hero's tray and (those marked for monsters) every monster's by `assets/js/ui/universal-actions.js`. Nothing is
  written into sheets or stat blocks. Anything that spends a Recovery is `"for": ["heroes"]`.
- **Chat.** Every line the board writes goes through `sendBoardChat` and is shown under "Table"
  (`speaker` in `chat_handler.php`); `user` still records whose page sent it. Do not call
  `window.dashboardChat.sendMessage` from `board-interactions.js`.
- **Measure tool (hold M).** Right click drops a corner; Z + wheel drops a corner and raises the end a square a
  notch (`drag-ruler.js` `addMeasureToolNode`, `nudgeMeasureHeight`). Z + wheel also lifts a held token.
- **Turn buttons** follow `--vtt-free-right` (`board-free-area.js` fires `vtt:free-area`). **Turn indicator**:
  `data-turn-side` on `[data-turn-indicator]`, green for the heroes.
- **A creature in plain view stayed hidden.** Three causes closed: a dropped token takes the floor it was dropped on;
  the players' Height cut goes by where a creature on foot stands (`standingLevel`); the sight check's kept answers
  name the wall model, and with vision on it is looked at again every 3 seconds.
- **An area's time is up.** Asked of whoever runs the turn's hero: `endDue.askUserId` (`zoneEndAsker`), the
  Director after 25 seconds unanswered.
- **Pushing.** A player may force-move (Ctrl) a creature that is not theirs and nothing else
  (`mayMoveAs`, `SyncV2Store::playerMayPushPlacement`). The ruler says the squares really moved and the damage.
- **Move counter**: a page label beside the held token (`placeRouteLabel`), not a sprite under it.
- **Ability tray**: a failed re-read of the hero already shown leaves the tray up.
- **Weakness**: the larger of the same type counts and both stay listed. That was already so; `"stacks": true`
  on an effect is the only thing that adds.

Tests: `assets/js/ui/__tests__/table-fixes-2026-11-25.test.mjs`, `api/v2/tests/table-fixes-2026-11-25.test.php`,
`character_sheet/ability-automation/__tests__/universal-actions.test.mjs`.

## Version System

### Overview
A centralized version tracking system has been implemented to help track changes and ensure browser cache updates.

### Files
- `/dnd/version.php` - Core version management system
- Version display appears in bottom-right corner of all pages that include it

### Usage

#### Including Version System
```php
// Include at top of PHP files
define('VERSION_SYSTEM_INTERNAL', true);
require_once '../version.php';

// Display version in HTML
<div class="version-footer">
    <span class="version-info"><?php echo Version::displayVersion(); ?></span>
    <span class="version-updated">Updated: <?php echo Version::getLastUpdated(); ?></span>
</div>
```

#### Version Management
```php
// Get current version
$version = Version::get();

// Increment version
Version::increment('patch');  // 1.0.0 -> 1.0.1
Version::increment('minor');  // 1.0.1 -> 1.1.0
Version::increment('major');  // 1.1.0 -> 2.0.0

// Get build number
$build = Version::getBuildNumber();
```

### Auto-Increment
The system automatically increments the patch version whenever the version.php file is included (unless called from within the version system itself).

### Developer Guidelines
- **Always update version after making changes** - The system will auto-increment, but manually increment for major/minor changes
- **Test with hard refresh** - After changes, use Ctrl+F5 to bypass browser cache
- **Check version display** - Verify version number updates in bottom-right corner

## Import Button Troubleshooting

### Issue Resolution Steps
1. **Check Debug Info** - Look for the debug info box that shows:
   - User status
   - GM status
   - Session information
   - Button visibility logic

2. **Browser Developer Tools**:
   - Open F12 console
   - Look for "Import button clicked!" message when clicking
   - Check Elements tab for button styling
   - Verify no CSS conflicts

3. **Common Issues**:
   - Not logged in as GM (password: 'harms')
   - Browser cache (use Ctrl+F5)
   - CSS conflicts with button styles
   - JavaScript errors preventing display

### Testing Commands
```javascript
// In browser console
console.log('Is GM:', window.isGM);
console.log('Button element:', document.getElementById('import-character-btn'));
```

## Development Workflow

### After Making Changes
1. Check version number updated in bottom-right corner
2. Test functionality with hard refresh (Ctrl+F5)
3. Verify changes work as expected
4. Document significant changes in this file

### Debugging
- Enable debug info boxes for troubleshooting
- Use console.log statements for JavaScript debugging
- Check browser Network tab for failed requests
- Verify file paths and permissions

## Notes
- Version system tracks: version number, build number, last updated timestamp
- Debug info should be removed before production
- Import button requires GM login (user: 'GM', password: 'harms')
