# Codex Development Notes

Player preview uses the GM-only read-only `api/v2/player-preview.php?user=...`
endpoint and the same snapshot projection as the actual player. Never impersonate
the player session or touch their presence. GM Scenes has read-only Player view
details and a map/grid/floor/cutout/fog/token/drawing dialog with local zoom/Fit.
Combat group colors use independent group maps built from projected combat state.
Never borrow the GM tracker's mutable group maps. Never label server-visible
token data as on-screen visibility without applying the client geometry and fog.
`renderFogSurface` paints an independent canvas with explicit scene/floor/viewer
inputs. Use it for passive preview rather than remounting the singleton fog tool,
which owns GM interaction state. The ordinary board uses the same painter.
Map preview uses `createMapLevelRenderer({rootId:null})` for an independent root;
never let it move the main board's globally identified map stack into the dialog.
Token floor/fog visibility, transforms, stacking and direction badges are shared in
`token-presentation.js`. Render geometry preserves fractional canonical positions;
do not use the legacy integer placement normalizer for passive preview coordinates.
Preview tokens use data-preview-placement-id inside an inert surface, never the
active board's data-placement-id interaction hooks. Map padding must match the
normal backdrop so maps, fog and token coordinates share the same origin.
Stamina bars use token-hit-points.js with explicit isGm; passive player previews
must pass false even in a GM session. Enemy numeric values remain hidden. Trigger
readiness uses the shared indicator with its clear-action hook removed in preview.
Condition normalization lives in token-conditions.js; preserve durations, distinct
sources, numeric riders and execution identities through display hydration.
token-status-presentation.js paints team/squad, conditions and judgment marks.
Only the interactive board enables removal hooks and condition tooltip callbacks.
Token render hydration lives in token-render-normalize.js; use it for legacy
overlay aliases, readiness and hidden flags as well as fractional coordinates.
token-aura-renderer.js takes explicit placements, floor context and fog checker.
Preview uses private aura placement IDs. Player aura footprints also use the shared
floor-cutout mask with explicit pixel bounds, independent of CSS transforms.
Clear old masks on same-floor or GM repaint. GM aura overview remains unmasked.
Persistent zones store the selected area's levelId at registration. Legacy records
without floor data resolve to level-0; never attach an existing zone to a moving
caster's current floor. Occupancy/entry checks use persistent-zone-geometry.js,
including fractional wall-square overlap. Movement snapshots must retain levelId.
Zone rendering uses persistent-zone-renderer.js with explicit floors and view
metrics. Players get floor filtering/cutout masks; GM overview remains unmasked.
Preview has private zone/caster IDs and no End controls. Floor deletion removes
zones on deleted floors from every owning placement in the same transaction,
advancing each owner once. Zone-only mutations must not change linked player views.
Repaint zones after map-image loading so recovery cannot leave retained zones hidden.
Zone onEnter uses swept footprint intersections for confirmed straight movement,
so a long drag ending beyond a zone still enters it. Do not infer an intermediate
floor path across a stairs/fall transition. A real player drag/damage journey is
covered; reload-safe canonical per-round deduplication remains unfinished.
Passive drawings call renderDrawings with an explicit drawingLayer and floor;
never mount or replace the active drawing tool's shared state for preview.
Template floor visibility and SVG cutout masks live in template-presentation.js.
They take explicit shape bounds, view metrics and floor context; reuse them for
passive rendering. Selection cleanup remains in the interactive template tool.
Circle/rectangle CSS geometry and anchor placement use paintTemplateArea in
template-area-renderer.js. Normalization, snapping and bounds use independent
createTemplateGeometry contexts with explicit view getters. Preview areas use
these same functions. Wall tiles, diagonal joins and labels use paintWallTemplate
in template-wall-renderer.js; editing remains in the interactive template tool.
Hydration resets fallback palette order so templates without explicit colors
remain deterministic across canonical refreshes and player preview.

Scene package copying uses `ScenePackage::prepareForNewScene` for explicit board
ID remapping. Never recursively rewrite all IDs: token-library, sheet and embedded
ability identities must be preserved. Preparation is pure and does not authorize
installing unvalidated package fields or bypassing Sync V2 command authority.
Mirrored stairs share one ID across their two linked floors. Copy preparation must
preserve that relationship: stair editor corner/color updates and deletion find
the mirror by ID. Verify prepared packages through `stairs-mutations.js`, not just
by checking that every generated ID is different.
Scene imports use a Sync V2 transaction plus `vtt_scene_imports` catalog outbox.
Hold the shared catalog lock before installation/recovery; acknowledge only after
the catalog save. Never replay the source package to recover catalog metadata.
Deletion cancels pending catalog recovery. `api/v2/scene-import.php` is GM-only,
validates packages at the store boundary and requires explicit player-browsing
acknowledgment. Imported scenes are browsable without activating them. Do not label
this operation as a private encounter draft. Retain the same operation ID on retries.
The Duplicate scene control exports directly into the same import preview. Keep
the submitted request body immutable through retries; renaming is allowed before
the first request, not after an uncertain accepted response.
Import completion calls the existing Sync V2 recovery path and checks all four
new scene domains before refreshing local catalog metadata or offering Open copy
for GM. Do not expose an empty local scene before canonical recovery finishes.
Shared panel opacity, floor-control targets and keyboard focus styles live in
`dnd/vtt/assets/css/readability.css`, after the theme skins. Preserve palette
variables and verify settled GM/player panels at 1280×720 in light/dark/Diablo.
Checkpoint layout restore has a reviewed-revision transaction and pure
plan in `SceneCheckpointRestore::planLayout`. It preserves current token resources,
conditions and newer tokens, with explicit unsupported/missing-floor relocations.
GM checkpoint rows expose Preview layout and an explicit scoped confirmation.
Stale previews require a fresh preview. GM plus two-player restore/reload and
canonical grid behavior on scene reopening are browser-verified. This is scene
layout recovery, not a character-sheet backup.
Existing scene grids come from Sync V2 sceneConfig; catalog grid is only a fallback
for scenes without canonical configuration. Recovery and grid/routing events must
synchronize the active grid used by rendering, including other clients.

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

### Site URLs
- Production D&D site: `https://bharmsasl.com/dnd/`
- Local development URL, when the PHP server is running from the repo root with `php -S localhost:8000 -t .`: `http://localhost:8000/dnd/`
- The VTT uses absolute `/dnd/...` API and asset paths. Serving with `-t dnd` makes those requests resolve under `dnd/dnd/...` and produces false 404 sync failures.

### After Making Changes
1. Check version number updated in bottom-right corner
2. Test functionality with hard refresh (Ctrl+F5)
3. Verify changes work as expected
4. Document significant changes in this file

### Draw Steel AI Reference Maintenance
- Before authoring or changing Draw Steel abilities, monsters, monster JSON imports, ability automation JSON, or VTT automation hooks, consult `/dnd/ai-reference/INDEX.md`.
- If code changes touch ability automation fields, effect kinds, trigger events, hook payloads, monster import fields, monster ability categories, malice behavior, or monster runtime behavior, update the matching docs listed in `/dnd/ai-reference/UPDATE-GUIDE.md`.
- Do not invent automation JSON fields or hook names. If the current code does not support a mechanic, represent it with `note` or `other` and document the limitation where appropriate.

### VTT Sync V2 Migration
- Before changing VTT persistence, Pusher delivery, board-state merging, combat authority, store subscriptions, or broad board rendering, read `/docs/vtt-sync-v2/README.md`.
- That document is the canonical implementation and AI-handoff plan. Update its phase checklist and decisions as work lands.
- Never allow V1 and V2 to write the same shared-state domain at the same time. Migrate and delete by domain using the documented gates.
- Current map, scene, fog, drawing, template, combat, and board-placement runtime state may be reset during the migration. Preserve token-library metadata and token images when practical. This does not authorize deletion of character, monster, automation, chat, Strixhaven, or other campaign data.

### Debugging
- Enable debug info boxes for troubleshooting
- Use console.log statements for JavaScript debugging
- Check browser Network tab for failed requests
- Verify file paths and permissions

## Notes
- Version system tracks: version number, build number, last updated timestamp
- Debug info should be removed before production
- Import button requires GM login (user: 'GM', password: 'harms')

## VTT Sync V2 Final Boundary

### Diagnostic and drawing regression workflow (September 2026)

- The updated diagnostic pull is `dnd/vtt/tools/sync-diagnostic.py`; it reads the
  authenticated V2 snapshot and creates a fresh loopback-only app. Credentials
  are prompted/ephemeral; never put them in exports. See
  `docs/vtt-improvement-plan.md` for the separate test repository launchers.
- Drawing gestures now send explicit V2 entity commands. Keep author/floor
  scope and focused startup/recovery rendering. Run the drawing browser fixture
  and PHP ownership/projection tests when changing this lifecycle.

- Phase 8 is complete. Sync V2 is the only shared-board writer, delivery, and
  recovery system. The final operating boundary is in
  `/docs/vtt-sync-v2/README.md`.
- Do not restore `api/state.php`, the public board Pusher channel, legacy
  snapshot/op services, the V1 poller, timestamp/version arbitration, or a
  broad `applyStateToBoard` store subscriber.
- The historical `_persistBoardState` feature-module name is a V2 command
  adapter. It must never serialize or send a whole board.
- Checkpoint position restores use a GM-only canonical command and an atomic
  reviewed-world-revision guard. Never retry a stale preview against newer state
  or replace the world row with an archived snapshot. See the checkpoint scope
  in `docs/vtt-sync-v2/README.md` and its disposable browser regression.
- Floor configuration events also carry canonical viewer cleanup. Preserve the
  player projection and atomic reducer handling when changing `levels.replaced`.
  Floor deletion also carries occupant relocation in that event; use `level.delete`
  for the UI and never restore separate placement/view saves for deletion.
  Bound drawing/template/fog removal and incoming stair disconnection belong in
  the same transaction, with scene scope and hidden-content projection preserved.
- Initial player HTML and V2 recovery use the same audience projection. Preserve
  that boundary and the focused layer refresh when changing floor visibility.
- VTT player profile IDs come from `dnd/vtt/config/player-roster.json` (or the
  server-only `VTT_PLAYER_ROSTER_PATH` override). Bootstrap configures the client
  before mounting. Roster membership is association, not authentication or token
  ownership; preserve shared allied movement permissions.
  The GM editor writes that file through `api/v2/player-roster.php`, using a
  separate lock, atomic replacement, and a reviewed content revision. Never
  overwrite a stale draft automatically. Roster changes require open VTT reloads.
  `primaryPc` selects a GM-managed primary placement per linked profile and scene.
  Switch old/new flags in one placement batch; server uniqueness validation and
  profile-field permissions must remain atomic. Player movement remains shared.
  Removing a roster profile must not strand unrelated placement commands because
  of its historical primary flag. Validate new/relinked assignments explicitly.
  Player projection supplies `pcTokenAssociations` (visible IDs or null). Preserve
  it through bootstrap, recovery, and placement/floor events; never infer a new
  primary from a filtered token list when the association is explicitly unavailable.
  Per-scene `userLevelState[userId].followToken=false` means Browse. Preserve it
  through one-time floor returns, GM Show players, reload, and floor cleanup.
  Automatic token/view mutations must skip browsing users; explicit GM Show still
  changes their floor without changing the preference.
- GM scene JSON export uses `ScenePackage` and one V2 snapshot plus the separately
  read scene catalog. Packages contain image references, not downloaded media or
  character sheets. Preserve the read-only scope and explicit format version.
  Scene/folder creation, scene metadata edits, and deletion share the existing
  board-state lock around the entire catalog read/modify/write sequence. Future
  import/duplication must respect that boundary, not lock only the final save.
  Scene import preview is read-only. Its structural/reference checks do not
  authorize direct snapshot installation; the pending installer still needs
  canonical validation, new IDs, reference remapping, and transactional recovery.
- Character-card temporary stamina currently reflects the saved stamina above
  maximum convention. Capped healing and recovery must preserve existing overflow.
- Ground/Fly/Hover is explicit token runtime state, not ability-authoring JSON.
  Mode changes and Prone/Grabbed/Restrained/Unconscious interruption resolve support through canonical placement
  commands. Preserve the manual limits documented in the automation registry.
- The legacy checked-in Pusher secret still requires rotation in the external
  Pusher dashboard. Put the replacement in the server-only
  `VTT_PUSHER_SECRET` environment variable, then perform the documented GM plus
  two-player production soak test.
