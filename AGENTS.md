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
ZoneEntryReceipt captures server-owned walking footprints and combat boundaries
inside accepted movement events, including per-action batch receipts. Never trust
a client receipt. Player projection strips full receipts; normal movement hooks
carry movementOperationId/movementRevision for claim authority. POST zone-entries.php
reserves a pending entry using trusted movement, current geometry and round state.
The SQLite vtt_zone_entry_claims ledger is world-scoped; a repeated claim never
grants execution again. Claims do not execute effects or increment board revisions.
Client integration, completion receipts and interrupted-effect recovery remain pending.
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

- Zone entry claim acknowledgements never execute or replay effects. Uncertain
  entries remain pending/needs_review for inspection; completed/dismissed claims
  cannot be reopened. Recovery lists are claimant-only except for the GM. The
  ledger is separate from canonical board revisions. Normal walking entries use
  durable claims; forced movement, teleports and swaps now pass accepted operation IDs too.
  The GM Scenes recovery panel supports inspection and manual final outcomes.
  Condition callbacks now await accepted persistence; preserve this boundary.
  Unsupported, partial or uncertain zone effects require review, never replay.
  Walking claims must bypass enteredThisRound because its round reset is GM-only.
  Keep granted effects queued per scene/creature to avoid overlapping save races.
  Validate queued effects against the latest received zone before dispatch;
  ended/changed zones require review. Do not claim this cancels in-flight saves.
  Automation swaps must exchange positions and floors in one confirmed batch;
  never use two independent per-token saves or fire walking hooks for the swap.

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

- Movement automation callbacks must await zone entry outcomes. Unresolved effects
  reject continuation while preserving accepted movement. Keep the picker busy
  until those outcomes settle; repeated clicks must not submit another move.

- Preserve fractional floor cutouts through normalizeMapLevelCutout. Map/effect
  masks and editor copies must share that helper; do not truncate saved geometry.
  Look-down edge visibility includes every positively overlapped grid cell.

- Token floor visibility preserves fractional placement bounds. Strict cross-floor
  interaction requires common open area within the occupied footprint across all
  blocking floors; keep the separate look-down border presentation policy.

- Sheet stamina writes use writeSheetStamina with a bounded acknowledgment. Never
  automatically replay a timed-out write; it may already have committed.

- Zone recovery reasons are bounded client reports rendered with textContent.
  Preserve the first report on acknowledgment retries and retain actor privacy.

- Persistent-zone registration callbacks must await their placement save. Never
  report a zone as registered from the optimistic update alone.

- Expire all matching zones on one caster with a combined placement patch;
  independent whole-zone-list saves can restore another just-expired zone.

- Count accepted HTTP outcomes when investigating duplicate writes. The expiration
  regression can show one rejected 409 followed by one successful 200 retry.

- Do not blindly rebase placement patches after 409. Preserve concurrent edits
  to patched fields, especially whole zone/condition lists and stamina records.

- Canonical zone turn stages use runZoneBoundary. Await start expiration before
  ticks/occupants and await end ticks before expiration; stop on scene changes.

- Canonical zone ticks propagate strict save failures. Do not expire a zone
  after a failed final tick or silently continue later boundary stages.

- Zone upkeep spends through the locked narrow resource endpoint using a profile
  ID. Do not save a cached whole sheet or equate network failure with no funds.

- Heroic-resource rules use narrow conditional writes, never cached whole-sheet
  saves. Mark applied resource-rule limits only after confirmed persistence.

- Narrow resource writes use confirmResourceWrite; do not broadcast success or
  replay an uncertain request after its confirmation deadline.

- The recovery-spend hook deducts through locked sync-vitals spendRecoveries.
  Never persist a cached whole character sheet to spend recoveries.

- Resolve sheet-backed token behavior through the saved character profile before
  using display-name aliases; renames must not redirect recovery or surge writes.

- Surge gains require explicit saved-count confirmation. Narrow character writes
  share confirmCharacterWrite; never replay an uncertain delta.

- New movement undo receipts include the accepted operation ID. Future group undo
  must derive membership server-side, validate all members and commit atomically.

- movement.undoGroup derives members from the anchor's accepted operation, validates
  every current receipt and commits through a world-revision-guarded placement batch.
  No fresh movement/zone-entry receipt is issued for an undo. Keep command responses
  and delivery on the live, player-projected V2 path. Browser integration is verified.

- Group movement receipts carry groupMove for the Undo control. Selecting one
  member still undoes the original whole group. Never semantically retry a stale
  group undo; identical operation-ID transport retry remains safe.

- Character JSON writes use AtomicJsonFile under the existing request-wide lock.
  Keep surge operation receipts and mutations in the same replacement. Never prune
  receipt IDs without a policy that prevents old retries becoming new mutations.
  Surge receipt replay returns the original result, not necessarily current state.

- Resource and recovery-spend operation receipts include insufficient and stale
  outcomes. Preserve these terminal results when balances later change; replay
  must not reevaluate an old attempt as a new spend or conditional assignment.

- Action review checks character receipts through read-only operation-status;
  never turn that lookup into replay or storage initialization. Missing receipts
  are uncertain. Local reminders are per actor/operation and do not prove later
  ability steps completed. Mark reviewed only removes the browser reminder.

- Release checkpoint 1.19.114: feature development is paused at the user request.
  Resume from docs/vtt-release-handoff-2026-09-08.md and retain the full roadmap.
  npm test now runs the checked-in complete VTT/automation suite, including PHP
  authority checks; do not replace it with shell globs that omit nested tests.


## User-requested header cleanup — 1.19.115

Restored the compact left action cluster in both idle and active combat. The combat
tracker stays visible. Removed the map tool strip, Action review dialog, Fit/Center
camera commands and their extra keyboard shortcuts; normal mouse pan/zoom and
actual Measure/Templates/Draw/Undo controls remain. Retained server receipts,
character save protection and tool exclusivity. Connection status is now a small
warning only when attention is needed, as requested by the user.

Compacted scene/floor controls, removed the duplicate GM floor label, shortened
Show players text (full accessible description retained), and placed round/turn on
one row. Local browser validation covers GM/player at 1280 and 1920 widths,
combat/floor controls, connection warning visibility and absence of the tool strip.
The old active-tool-label browser script is historical: its visible label was
intentionally removed; tool coordination remains implemented.


## Token settings cleanup � 1.19.116

A single linked PC already resolves automatically on the server. Hide the explicit
Primary token override unless multiple placements link to the same profile; use a
compact aligned checkbox for that duplicate-token case. Remove movement help prose.
Token menu uses a stable border-box width and scrollable height above action tabs;
recheck after opening and observe menu/action-tab size changes. Internal menu scrolling
no longer triggers the outside-scroll dismissal listener. Browser QA passed at
1280x720 and 1280x500, including lower-menu scrolling, plus five popup unit tests.


- Floor-height work is underway: elevationSquares is vertical grid height, never token footprint height or renderer zIndex. Resolve legacy height defaults before filtering hidden floors for player projection. UI and range integration remain pending; see the improvement roadmap.

- Explicit elevationSquares accepts whole numbers 1..1000000 through levels.set, scene import, and checkpoint layout planning. Missing legacy heights remain supported; share FloorGeometry::validateElevations across height write boundaries.

- Compact floor editor height changes keep IDs/stair links and sort physical zIndex by elevation. View must send an explicit user-level.set operation through V2. Preserve open Edit disclosures when refreshing scene markup.

- Numeric token floor badges use vertical squares, but token visual scaling remains based on floor steps. Do not equate expanded look-down presentation masks with strict cross-floor line of effect.

- Aura reach now combines horizontal radius with canReachFloor vertical radius and exact common openings. Player aura rendering hides out-of-height-range auras; GM overview remains. This is not a general wall/diagonal-ray solver.

- Automatic High ground uses known floor height and target space; flight/uncertain footing remain manual. Adjacent-enemy bane is ranged-strike-only. Preserve short labels and manual overrides; multi-target modifier UI is awaiting approval.


### Power-roll suggestion refresh - 1.19.123

The existing ability roll window refreshes board suggestions every second before
rolling and immediately before each roll/reroll. Manual suggestion toggles survive
refreshes and temporary absence of that suggestion for the same actor/action/block/
target set. A new roll block or changed actor/targets resets those overrides.
Automatic refresh freezes after rolling and stops when the window closes or is
removed. Unchanged suggestions do not rebuild controls. No new UI or schema fields.
Focused regressions cover overrides, context changes, refresh, frozen rolls and
cleanup. Browser interaction QA remains pending; this is not a full gameplay claim.
Generic dice roller integration, mixed-target handling (UI approval pending),
remaining range consumers and the rest of the active goal are still unfinished.

Full regression suite passed: 773 tests across 102 files.


### Ability-roll browser verification (September 9)

`node dnd/vtt/tools/test-power-roll-suggestions-browser.cjs` passed against a fresh
loopback floor-regression fixture at 1280x720. It opens the real ability window,
uses the production suggestion calculator with controlled token positions, clicks
High ground off, verifies refresh preserves the override, moves the controlled
actor to ground to receive Enemy adjacent, checks modifiers freeze after rolling,
and verifies reroll and close cleanup. No browser page errors. This verifies the
runner/calculator integration, not canonical player movement delivery; that journey
remains in the wider testing scope. No production requests or campaign changes.

The separate generic Dice Roller still lacks combat context. A compact Power roll
mode with attacker/target/strike type was proposed for approval; do not implement
that visible change until the user responds. Multi-target UI approval also remains
pending. Continue height-aware range guides and the rest of the original roadmap.


### Height-aware targeting guides - 1.19.124

Token and area selection range boxes now compare source/viewer floor elevations.
A floor beyond the range shows no range box. Reachable floors retain the full
horizontal range (maximum-axis distance, not a diagonal/hypotenuse calculation).
Unknown floors do not receive a misleading box. These remain advisory guides;
this does not enforce target legality or claim visibility/line of effect.
Both guides refresh from current source placement during existing token rendering,
including floor configuration/view changes. No new broad subscription or writes.
Area range initialization now runs after its overlay is assigned, fixing the
previous missing initial update. Local browser test test-range-height-browser.cjs
passed token/area opening, exact boundary, max-axis width and live height changes.
The browser uses a fresh loopback floor fixture and canonical GM floor edits.
General effect-range consumers and the rest of the active goal remain unfinished.

Full regression suite: 775 passing tests across 102 files.


### Height-aware adjacency effects - 1.19.125

Opportunity-attack and authored move predicates use each recorded endpoint floor,
height and shared openings, rather than filtering on the mover's final floor.
A one-square open vertical gap may be adjacent; a five-square gap or solid floor
is not. Stair/fall transitions inspect endpoints only, without invented floor
paths. The existing same-floor square-step pass-by check remains bounded at 200
steps; fractional final steps now terminate at the destination instead of
oscillating. This is not a new continuous swept-path solver. Move hook endpoint
payloads retain levelId. Stand Firm applies the same vertical/opening reach filter
before its existing ally/footprint checks. No new UI or authored fields.

Full suite passed 780 tests across 103 files, including acknowledged movement
floor retention, ascent/descent, openings, pass-by, fractional movement and Stand
Firm integration. Full browser opportunity-attack gameplay remains to be verified.
The rest of the original goal remains active, including the pending approved-UI
responses, remaining distance consumers and broader gameplay/recovery checks.


### Ability distance integration - 1.19.126

The board getDistanceBetween callback, heroic-resource getSquareDistance environment,
and zone-rule getSquareDistance environment now share placementSquareDistance.
It measures nearest occupied squares and takes max(horizontal, floor elevation
separation); it does not use token centers or a hypotenuse. Missing tokens, invalid
coordinates or unknown floors return null. Distance is separate from visibility
and openings. Normal-move trigger distance also includes endpoint floor height,
while movement budgets and push/pull direction calculations retain their existing
horizontal semantics. No authored JSON or visible controls added.

All 781 tests across 103 files passed. test-ability-distance-browser.cjs passed
against a fresh --floors --distance disposable fixture: actual board callback,
5-square altitude, large-token edge distance, symmetric lookup, missing target,
canonical floor-height edit and reload. No live campaign writes. Broader gameplay
and remaining approved goal scope are still active.


### Inventory save foundation - 1.19.127

Inventory API requests now hold a sibling-file lock across the full read/modify/
save operation, including cleanup. Loads use a shared lock. AtomicJsonFile replaces
the JSON document; failed reads/invalid JSON fail closed instead of starting an
empty inventory that could overwrite campaign items. A scan found the character
inventory handler is the only writer; VTT items.php reads the same document.
This prevents independent concurrent updates from overwriting one another's file
contents. It does not resolve two stale edits to the same effect list or item.

A disposable PHP endpoint test sends 30 concurrent distinct-item field updates and
verifies every saved value and retained note. A corrupt-file test verifies refusal
without replacement. The new inventory test directory is included by npm test.
No live inventory or campaign source was edited. Read-only Eternal-Spire.md confirms
the supplied Fungal Minions progression table; no values were imported or invented.
Compact current-row/Level/Show full table plus paste-and-cell editing was proposed
for approval. Table UI and storage integration remain unfinished. Next inspect
client save failures, same-second refresh detection and stale effect-list edits
while awaiting the visible-layout response; retain all wider goal requirements.

Full regression suite: 783 passing tests across 104 files.


### Inventory refresh protection - 1.19.128

Inventory load returns content_revision hashed from the audience-projected data,
under the existing shared request lock. The client compares this instead of
second-resolution timestamps; legacy last_modified remains in the response.
A load response is ignored if an edit/mutation started after its request or local
saves/drafts remain outstanding. Failed field saves retain a dirty marker so polling
cannot erase the local draft; a later confirmed save of that field clears it.
No automatic write retry is added. Drafts remain page-local, not durable across
navigation. Same-field concurrent save ordering and explicit conflict recovery
are still unfinished; do not claim this solves those cases.

The isolated real-browser test test-inventory-refresh-browser.cjs passed delayed
response versus local input, failed-draft polling retention, and equal-timestamp
changed-content refresh. Responses are controlled with all network blocked.
PHP regression forces equal timestamps and verifies distinct content revisions.
Progression table UI/storage remain pending; retain the full active goal scope.

Full regression suite: 784 passing tests across 104 files.


### Inventory field save ordering - 1.19.129

One field save is in flight per folder/item/field. New values coalesce to the latest
waiting value and dispatch only after successful acknowledgment. Failure clears
that field's pending debounce/queue and retains its dirty marker and visible draft;
no automatic continuation/retry occurs. Unchanged input/change notifications no
longer enqueue duplicate writes, including effect-section and charge controls.
The browser regression test-inventory-save-order-browser.cjs checks real input
controls with delayed responses, latest-value coalescing and failure stop. The
existing refresh/failure browser regression also passes. Tests use blocked network
and controlled responses; no live campaign data is changed.

This protects ordering within one page; two-browser stale edits and recovery from
uncertain writes remain unfinished. Draft persistence across navigation is also
not implemented. Continue the original scope; inventory table and other pending
visible proposals still await responses.

Full regression suite: 784 passing tests across 104 files.


### Inventory progression table parsing - 1.19.130

inventory/effect-table.mjs provides strict plain-text table normalization, Markdown
and tab-separated spreadsheet paste parsing, and quoted TSV export. It preserves
empty cells, quoted newlines/tabs, escaped Markdown pipes and literal markup.
Ragged rows, malformed quotes, invalid selected rows and oversized input reject
instead of silently truncating content. Independent table values use copied rows
and a selectedRow index. Limits: 200 rows, 32 columns, 8000 characters per cell,
200000 pasted characters. This is an internal foundation, not a visible feature:
the current inventory screen does not load it yet and no saved schema is changed.
The future renderer must escape cell text; this parser does not authorize HTML.

Read-only validation of the actual Eternal-Spire.md Fungal Minions and Resurrection
tables preserved all 20 rows each through Markdown parse and TSV round trip. No
campaign file or inventory was changed. Focused tests cover equivalent synthetic
matrices, independent selection/copies, quoting and rejection. UI integration,
server validation/persistence of tables, paste/edit controls and browser journey
remain unfinished pending the layout response. Preserve the whole active goal.

Full regression suite: 788 passing tests across 105 files.


### Inventory table storage - 1.19.131

Effect sections accept an optional plain-text table {headers, rows, selectedRow}.
InventoryEffectTable validates shape, bounds and UTF-16-equivalent cell lengths
before saving. Invalid input fails without a partial write. Selected rows belong
to each effect independently. Omitted tables preserve existing section tables by
ID in field and full-item updates; explicit null removes a table. Duplicate/move
normalization retains supplied tables. Ordinary client normalization and effect
text editing also preserve them. See dnd/character_sheet/inventory/README.md.

Disposable PHP endpoint tests passed independent selections, load, legacy field
and item edits, explicit removal and invalid-input preservation. The real-browser
save-order fixture also verifies ordinary note editing retains the saved table.
No inventory or campaign source data was imported or modified. Display, Level
selector, paste/cell editor and full user journey are still pending the layout
response; storage support does not mean the feature is usable yet. Full goal stays
active, including other visible proposals and reliability/visibility checks.

Full regression suite: 790 passing tests across 105 files.


### GM/two-player height and visibility verification (September 9)

New test-height-multiplayer-browser.cjs passed against a disposable floor fixture:
GM plus separate Cal/Sharon browser sessions, a base token beneath an opening,
5-square badges on all views, live change to 8 squares, one player offline during
the change, reconnect catch-up without reload, then reload of all three clients.
Canonical token state was unchanged by height/view operations. No page errors.
This verifies floor-height delivery/recovery and visible numeric badges, not every
combat or multi-step action journey in the wider goal.

The existing floor-visibility browser regression was updated to open the approved
compact floor Edit disclosure. It then passed on a fresh fixture: hidden-floor
content absent from initial player HTML, hidden tokens/templates absent from both
players, reveal/hide/reveal without reload and unchanged canonical token state.
No production requests or campaign changes. These are local Sync V2 recovery
checks; external Pusher production delivery/secret rotation is not verified here.
Full active goal remains unfinished, including pending visible UI approvals,
table user journey, broader combat/movement checks and inventory conflict handling.


### Movement browser verification (September 9)

Fresh disposable floor fixtures passed the current real-control journeys:
- test-floor-browser.cjs: player stair traversal across reload, one confirmed
  normal movement event carrying start/end floors, linked-view following, fall
  through the opening and GM/second-player recovery.
- test-airborne-browser.cjs default Fly: cross the opening without falling,
  persist through reload, apply Grabbed through token settings, then atomic
  landing and linked-view return visible across three clients.
- The airborne browser script now also accepts VTT_TEST_MOVEMENT_MODE=hover.
  That run passed crossing/reload, Grabbed preserving Hover, another reload,
  explicit Ground causing landing and three-client convergence.
- test-group-undo-browser.cjs: real group drag through stairs, whole-group undo
  after reload, and a later GM edit to one member causing whole-undo rejection
  with no partial restoration (verified canonical state).

No application behavior changed in this verification slice. Each journey used
its own fresh loopback fixture; no live campaign data was modified. These results
cover the listed paths, not all automation movement or opportunity-attack journeys.
Remaining goal requirements and pending UI proposals stay open.


### Opportunity attack across stairs: browser verification (September 9)

New test-opportunity-stairs-browser.cjs passed on a fresh loopback fixture. A real
player drag first enters adjacency on the base floor without creating an
opportunity marker, then leaves that enemy via stairs. Explicit Node-side polling
awaits the saved position/floor and ready marker. The canonical marker includes
readyTriggerSources.__opportunityAttack__ = floor-cal and survives GM reload with
a visible marker. No application changes were needed; a speculative explicit-op
change was reverted before verification. No live campaign writes occurred.

Important testing follow-up: the initial test used asynchronous waitForFunction
callbacks for server reads and inspected state too early. Replacing them with an
explicit awaited polling loop resolved the false missing-source finding. Audit
other waitForFunction(async ...) uses before relying on them as save-completion
gates (range/height/floor editor, floor deletion, primary token, scene import/grid,
and zone browser scripts contain this pattern). Existing final-state assertions
remain evidence of their checked values; do not treat an early predicate as proof
that the requested save completed. The wider goal and pending UI responses remain
open. Next work should strengthen/re-run those gates, not mark the goal complete.


### Browser save-wait audit completed (September 9)

The installed Playwright frames.js tests predicate() truthiness before awaiting
its return value. An async predicate returns a truthy Promise, so false results
can prematurely finish waitForFunction instead of polling again. Replaced all 15
such calls in nine VTT browser scripts with waitForBrowserState: explicitly await
each page evaluation, poll false results, bound stalled reads and propagate errors.
Three helper regressions pass (async false/false/true, false/stalled deadlines,
read failure). Run them with node --test dnd/vtt/tools/wait-for-browser-state.test.cjs;
they are tool tests, separate from the application npm test suite.

All nine affected journeys passed on fresh disposable loopback fixtures: floor
editor, range height, GM/two-player height/reconnect, floor deletion, primary token
following/privacy, canonical grid, zone entry/recovery, zone floor/preview and
scene import. Floor deletion's script now opens the compact Edit disclosure
before clicking Delete; its initial hidden-button timeout was a stale test step.
No application behavior changed and no live campaign data was modified. No version
bump is needed for this verification-only slice. Prior application suite remains
790 passing tests across 105 files; it was not rerun for test-only edits.

The save-wait audit follow-up above is resolved. The wider goal remains active;
inventory table UI, generic roller/mixed-target UI proposals and other outstanding
roadmap work are not completed by these checks. Preserve pending user approvals.


### Multiplayer swap and forced-effect verification (September 9)

Expanded test-swap-browser.cjs with independent Cal and Sharon sessions. The
existing held-write, atomic two-token/floor swap and rejected-swap checks remain.
Both player stores receive both positions/floors; Sharon starts offline and catches
up without reload. GM and both players reload with the accepted result retained.
The test passed on a fresh loopback floor fixture. Store convergence is explicit;
this does not claim every cross-floor token is on-screen through fog/geometry.

Re-ran test-forced-zone-browser.cjs on separate fresh fixtures with ordinary
rejection and VTT_TEST_STALL_SHEET=1. Both passed: teleport ignores crossed zones
but applies destination entry, forced movement applies crossed entries, movement
completion awaits effects, repeated picker clicks cannot resubmit, completed
entry claims survive reload, and failed/stalled sheet stamina synchronization
requires review without replaying the write. Accepted board damage may differ
from the sheet in that uncertain case; automatic reconciliation is not proven or
implemented by these tests. Preserve this limitation in the remaining goal audit.

Verification-only slice; no application version bump or live campaign writes.
The full original goal remains active, including unresolved inventory/roller UI
proposals, sheet reconciliation and remaining gameplay gates.


### Stamina operation receipt foundation - 1.19.132

sync-stamina POST accepts the existing character operationId contract. Its receipt
and stamina values are saved in the same locked AtomicJsonFile replacement.
Identical retries return the original outcome without rewriting a later edit;
reusing the ID with different values fails. Read-only operation-status can inspect
the saved result. Calls without an ID retain existing behavior. No automation JSON
fields, visible panels or automatic retries were added.

The disposable test-stamina-receipt-browser.cjs passed against the real endpoint:
receipt/value persistence, preserved maximum when omitted, newer edit retained by
old replay, changed payload rejected, read-only receipt lookup and reload.
Client writeSheetStamina does not yet issue these IDs: connect and verify that
next, preserving its timeout/no-replay boundary. This foundation does not resolve
board/sheet mismatch, guarantee cross-store atomicity or authorize automatic effect
replay. Keep the full original goal and pending UI approvals open.

Validation: PHP syntax check and full npm test pass (790 tests, 105 files).


### Client stamina receipts - 1.19.133

writeSheetStamina now assigns one operation ID, records the attempt in the existing
per-actor character journal before sending, and requires the same receipt ID in a
successful response. Confirmation clears that record; failures/timeouts retain it
and expose error.operationId. Late success after the deadline cannot clear it.
No write is replayed and no Action review UI was restored. The receipt describes
only the character stamina write, never completion of subsequent ability steps.

Real localhost browser checks passed for a normal client write and a server-
committed write whose response was withheld: exactly one send, canonical saved
value, read-only receipt confirmation and unconfirmed journal retention across
reload. Forced/teleport zone damage and rejected sheet synchronization also pass.
Full npm test: 791 tests across 105 files, zero failures. Unit coverage includes
mismatched receipts and late response retention. No live campaign writes.

Remaining: read-only recovery integration and explicit board/sheet reconciliation,
not automatic replay of damage or whole abilities. Preserve all other original
goal requirements and pending UI proposals.


### Read-only stamina response recovery - 1.19.134

After an unconfirmed stamina response, writeSheetStamina performs one bounded
GET operation-status lookup (up to three seconds). It requires the same operation
ID, stamina action, successful receipt and requested saved values. A matching
receipt confirms this write and clears its local reminder; no POST is replayed.
Missing, mismatched, failed or stalled reads retain uncertainty and reject the
original action. This check happens inside the still-pending stamina callback,
not after the ability has already been abandoned or reloaded. It does not replay
later ability steps, reconcile newer conflicting values, or scan old reminders.

Browser verification passed for an accepted save with its response withheld:
only one write, receipt-based completion and no stale reminder after reload.
Unit checks cover missing/mismatched receipts, wrong saved value, late original
response and stalled read deadlines. Full suite passed 792 tests/105 files before
one additional focused rejection/deadline test, which also passed. No live writes.
The broader goal, mismatch reconciliation and pending UI decisions remain open.

Fresh forced-zone browser check also passed with VTT_TEST_STALL_SHEET=1: a missing receipt keeps the action unconfirmed, with one write and no replay.


### Lost stamina response during real zone damage (September 9)

Added VTT_TEST_LOSE_SHEET_RESPONSE=1 to test-forced-zone-browser.cjs. The route
forwards the actual stamina POST to the disposable server, confirms it committed,
then aborts its browser response. The actual forced-movement/zone-damage chain
recovers through receipt inspection and resolves. Asserted one sheet POST, matching
sheet/token stamina, completed entry claims, then reload and crossing again without
repeat damage. The fresh loopback journey passed. Stalled and lost-response modes
are mutually exclusive; existing rejection/stall coverage remains available.

Verification-only checkpoint, no version change or live campaign writes. This
proves recovery of this still-pending ability effect when its sheet write committed;
it does not prove repair of genuinely rejected writes, recovery of all multi-step
abilities after closing the page, or cross-store atomicity. Continue the full goal.


### Aura ability save confirmation - 1.19.135

handleAutomationSetAuraRequest now requests and awaits the canonical placement
save before resolving applied:true. Failed persistence rejects its callback;
optimistic aura state is not proof of completion. Existing aura identities and
payload shapes are unchanged. No visible UI additions.

New test-aura-registration-browser.cjs first reproduced the old behavior: its
callback resolved while the write was held. After the fix it passes held-save
pending state, accepted canonical record, rejected save and reload persistence
on a fresh loopback fixture. Actual cross-height aura effect membership remains
an independent unfinished journey; do not substitute this registration test.

Current requirement/evidence navigation is docs/vtt-active-goal-status.md. The old
roadmap checklist is retained as history, with an explicit current-status link.
Pending UI proposals and all remaining original scope stay open.

Full npm test passes: 793 tests across 105 files; no live campaign writes.


### Actual aura height/effect journey (September 9)

New test-aura-height-effects-browser.cjs exercises saved aura automation, actionUsed
trigger dispatch and actual damage. Radius three excludes a target five squares
above; at height three it affects that target through the floor cutout; moving
owner/target under solid floor blocks it again. A same-floor enemy takes damage
in every case, proving the trigger actually ran. The test waits for the aura's
post-effect announcement before inspecting canonical stamina. Each floor/position
change is followed by reload, verifying saved aura/height hydration. It passed on
a fresh loopback fixture. Canonical stamina can be numeric text and is compared
numerically. No application change/version bump or live campaign writes.

This verifies the specified aura distance/opening behavior, not every aura trigger,
large-token geometry or all turn-boundary effects. Continue remaining full scope.


### Inventory stale-field protection - 1.19.136

Inventory load/item responses include response-only _fieldRevisions. Current field
edits send expected_revision and compare it under the existing request-wide lock
before mutation. Conflicts preserve the saved file and use the existing error line;
the unsaved local draft remains dirty/visible. Successful responses update only
related field revisions, so an unrelated edit cannot silently rebase a stale name.
Charges/hasCharges and effect/effectSections share dependency fingerprints and
serialize together in the client. Failed groups discard queued/debounced automatic
continuations. Metadata is never persisted into item records.

New PHP regression proves stale rejection with unchanged file bytes, independent
fields, sequential accepted revisions and charge-field dependencies. Real two-editor
browser regression proves stale name rejection, retained text and an independent
description save. Existing refresh/save-order browser checks pass; save-order now
asserts each outgoing expected revision. No live inventory was changed.

Boundary: legacy callers omitting expected_revision remain compatible; save_item,
image upload, deletion and moves are not made revision-guarded by this slice.
Unconfirmed-save recovery and inventory table UI remain unfinished. Do not claim
all inventory mutation paths or old already-open client versions are protected.

Full npm test passes: 794 tests across 105 files.


### Reviewed inventory deletion and moves - 1.19.137

Current delete/share/take controls send expected_item_fields from their last known
field revisions. The locked server compares every field before removal/move;
stale requests leave the original inventory unchanged. Take checks visibility
before revision comparison. Legacy callers omitting the guard remain compatible.
The UI never rebases unseen fields merely because another field save succeeded.

PHP tests cover stale delete/move file preservation and freshly reviewed successful
move/delete. Two real browser editors now exercise rejected Delete and Move buttons
in addition to stale field editing. All use disposable localhost data. Whole-item
save/image upload guards, pending-unsaved-edit behavior during move, and unknown
write outcomes remain unfinished; do not claim all mutation paths are protected.

Full npm test: 795 passing tests across 105 files.


### Inventory item actions await edits - 1.19.138

Delete/share/take capture the source folder and flush that item's debounced fields,
then await its in-flight/queued field group saves before confirmation/submission.
A failed field or 15-second wait deadline stops the action; no automatic move or
retry is sent later. Accepted field revisions are used for the reviewed operation.
Other items' edits are not flushed or waited on. Existing status text reports
unsaved edits without adding UI panels. Image upload/full-item requests are not
part of this field-save barrier.

New browser test proves Move remains pending without opening confirmation while
an edit is held, then uses its accepted revision; rejected edits retain typed text
and submit no Move. Existing save-order and stale-refresh browser tests also pass.
The shared helper is used by Delete/Take too; their pending-save journeys were not
separately exercised. No live campaign writes. Full original scope stays open.

Full npm test passes: 795 tests across 105 files.


### Inventory copy/image/whole-item protection - 1.19.139

Copy waits for pending item edits and sends its reviewed fields. Whole-item saves
accept that same reviewed guard; a missing reviewed item cannot be recreated.
Legacy callers without guards remain compatible. Image uploads compare the image
field revision before moving the uploaded file; accepted uploads return that field's
new revision. Unique random filenames prevent same-second replacements from sharing
a path. Client uploads participate in the item's pending/failed-save tracking and
advance edit generation, so stale refreshes and item actions cannot race the upload.

Real two-editor browser checks pass for stale image replacement rejection and two
accepted replacements with different paths. Copy/Move held-save and failed-save
browser cases pass. PHP tests reject stale copy and whole-item saves unchanged.
No live data writes. Unknown-outcome recovery and table UI remain unfinished; the
optional guards do not protect old clients that omit them.

Full npm test passes: 795 tests across 105 files.


### Bounded inventory requests - 1.19.140

Inventory JSON requests and image uploads share a 15-second deadline covering both
fetch and response JSON parsing. Timeout aborts the request and follows the existing
unconfirmed/failure path; no replay or automatic queued continuation is introduced.
Late success cannot clear failed fields or release item actions. Local drafts stay
visible; a deadline is not evidence that the server did not commit.

New browser cases pass stalled request and stalled body, aborted signal, ignored
late success, retained draft and no subsequent move/confirmation. Existing field
ordering, pending Move/Copy and refresh regressions pass. No live campaign writes.
Durable inventory operation receipts and post-reload outcome recovery remain open;
this timeout is not a backup or proof that an interrupted write failed to save.

Full npm test passes: 795 tests across 105 files.
