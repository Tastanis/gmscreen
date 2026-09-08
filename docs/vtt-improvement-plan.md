# VTT improvement implementation

User authorized implementing the September 7 product audit, updating/running the diagnostic pull, and authenticated website access. Preserve live campaign data. All gameplay QA uses disposable localhost copies. The scope is tracked by the active goal; unfinished boxes are not claims of completed work.

## Safety and testing foundation

- [x] Refresh diagnostic assets using the existing read-only exporter (1,587 files; September 7).
- [x] Add authenticated logical V2 export and restore into a new SQLite world; captured live revision 3594.
- [x] Update double-click launchers and verify a restored current-source GM/player app.
- [x] Add a repeatable synthetic drawing browser fixture and verify logical snapshot restore. Broader journey coverage remains below.

## Broken player workflows

- [ ] Server-validated atomic stairs/falls, including player and alternate movement paths.
  - Core single/group movement now resolves stairs and support on the server; player reload, fall, and selected-token undo browser journeys pass. Flight, whole-group undo, and remaining automation entry-point coverage are still pending.
- [x] Drawing creation/erase/clear/undo persist explicitly through V2, with author/floor scope and hidden-floor projection.
- [x] Owned temporary template edit/remove permissions; persistent structures retain GM authority.
- [x] Exact rejection feedback and pending/accepted state for canonical board commands; other multi-step action recovery remains below.

## Coherent geometry and player association

- [ ] Shared floor/elevation/adjacency model used by suggestions, range, auras, and movement.
  - Shared floor participation now guards flanking, aura membership, Stand Firm, and opportunity-attack adjacency. High Ground requires confirmation. Physical elevation, openings, and range integration remain pending.
- [ ] Hidden/deleted floors, partial support, flight, forced movement, stairs interrupted by reload, and undo tests.
  - Floor edits atomically repair saved viewer floors. Deletion relocates occupants using supported visible lower floors and updates linked views in the same event. Floor-bound content and stair-link cleanup remain pending.
- [ ] Explicit view-versus-token controls and follow/browse/center policy.
  - Viewing labels, Show players this floor, reload-preserved explicit views, and My token's floor are implemented. Camera-follow preferences and configurable primary token association remain pending.
- [ ] Configurable roster and primary token association, preserving shared allied control.

## Faster live play

- [x] Token library and saved scenes first; creation forms collapsed.
- [x] Compact inactive tracker and combat character card.
  - Inactive tracker is a collapsed roster disclosure; the full tracker opens automatically during combat. The character card prioritizes stamina, recoveries, resources, surges, and conditions, with reference material in a disclosure and existing action controls in the ability tray.
- [x] Zoom/fit/center/shortcuts and persistent tool labels.
  - Visible zoom, Fit Map, Center Selected, shortcut guide, and active-tool labels are implemented. Browser checks cover Draw, Measure, stairs, templates, cutout editing, and mode handoffs.
- [ ] Opaque readable panels, practical targets, diagnostics-only memory counter.

## Recovery and preparation

- [ ] Specific-player preview and useful connection status.
  - Server-check-based connection status and manual reconciliation are implemented; specific-player preview remains pending.
- [ ] Named encounter checkpoints, scoped restore, scene duplication/export.
  - GM-only checkpoint capture/download/delete and reviewed atomic position/floor restoration are implemented. Full scene geometry restore, duplication, and export remain pending.
- [ ] Encounter presets, favorites and recent assets.
  - Token favorites and the 20 most recently added board tokens are implemented with search and browser-local persistence. Encounter presets and other asset collections remain pending.
- [ ] Handouts, show-image, and map pins linking existing campaign records.
- [ ] Visible automatic/confirmation/manual action boundaries and interrupted-action recovery.

## Physical terrain

- [ ] Separate movement/sight/line-of-effect barriers; doors and interaction permissions.
- [ ] Difficult/damaging terrain using shared geometry; manual-rule boundaries remain visible.
- [ ] Regressions and documentation across related entry points.

Dynamic lighting, voice/video, marketplaces, and generic compendiums remain deferred as recommended in the audit. External credential rotation and a production GM-plus-two-player soak are external sign-off tasks; no live campaign mutation is authorized for testing.

## Diagnostic operation

`dnd/vtt/tools/sync-diagnostic.py --diagnostic-root "C:/Users/tasta/Desktop/gm screen test repository"` first runs the existing asset downloader, then prompts for the GM password (not saved), reads the authenticated V2 snapshot, records deployed JS hash and local commit/dirty state, and creates a timestamped app under diagnostic `runtime`. No board commands are sent to production. Login and snapshot presence tracking still occur normally.

`--skip-assets` reuses downloaded assets; `--offline-export PATH` restores a prior `vtt-diagnostic.json` without contacting production. Each restore creates a new directory and database. Pusher is disabled, PHP binds to loopback, local sessions are separate, and uploaded media is served read-only from downloaded assets. The old inspector remains available separately.

Canonical V2 state is an atomic world-row read. Separately exported sheets/assets are not a whole-site transactional backup. Deployed source is identified by a file hash; the website's version JSON is private. The app uses the local checkout, including working changes, with that distinction recorded in its manifest.

## Completed drawing slice

Drawings now submit gesture-sized explicit upsert/remove commands directly. Canonical events and startup/recovery refresh the drawing layer; no broad board subscriber is restored. Edits are scoped to author and current floor (GM can manage all on that floor). Undo reverses the last gesture, including erase/clear, while retaining unrelated remote drawings. Saving blocks another drawing gesture until acknowledgment and rejected edits return to canonical state with the server reason. Fragment creation precedes original removal; multi-entity edits remain a sequence of commands, so partial acceptance is displayed honestly rather than described as atomic.

Regression evidence: 671 existing/new JS tests passed before adding the additional drawing PHP authority test; that authority test and the main PHP suite then passed together. Three isolated browsers passed creation, erase, clear, undo, ownership, separate floors, refresh, and simulated rejection rollback. The fresh live-data restore loaded as GM/Cal/Sharon with zero page errors or failed local requests. Pusher/external browser requests were disabled during these tests.

Repeatable drawing QA:

1. `python dnd/vtt/tools/create-drawing-fixture.py --diagnostic-root "C:/Users/tasta/Desktop/gm screen test repository"`
2. `powershell -File dnd/vtt/tools/start-diagnostic.ps1 -DiagnosticRoot .playwright-mcp/drawing-regression -Port 8128`
3. `node dnd/vtt/tools/test-drawing-browser.cjs`

The browser test refuses a non-loopback address or an app without the drawing fixture manifest. `VTT_TEST_ORIGIN` and `VTT_TEST_BROWSER` can override the localhost origin and installed browser executable. These fixtures do not change the user's live-data diagnostic app pointer.

## Completed template slice

Player-owned temporary templates can be moved and removed. Server authentication
assigns the author; other authors' shapes and ownerless legacy shapes remain
GM-managed. Permanent-wall callbacks mark board structures as persistent, keeping
later edit/remove GM-only. Placement-owned persistent-zone controls are separate.
Template edits diff the displayed baseline and submit only changed entity commands;
they no longer dirty every template or overwrite whole scene arrays. Rejected
edits restore canonical shapes and report the server reason. Startup/recovery
explicitly refreshes templates, and hidden-floor payloads are projected out.

Validation: 675 tests passed across 77 VTT/automation files. The template browser
journey created and dragged a template as Cal, reloaded, rejected Delete on a GM
template, and removed Cal's own template, with GM and Sharon observing accepted
results. It asserted that exactly three template commands were submitted, all for
Cal's shape. Run `node dnd/vtt/tools/test-template-browser.cjs` against the same
synthetic drawing fixture. Template number-field labels now identify their inputs.

## Floor movement foundation

Single moves and placement batches resolve floor changes in the same transaction
as position changes. Linked-player view changes share that event; players do not
need permission to submit a separate floor patch. Stair entry progress survives
reload and is invalidated when its stair geometry changes. Forced/teleport command
intent skips stair traversal while still checking destination support. Hidden
floors are disabled geometry. Cutout union coverage supports fractional positions,
adjacent holes, and large tokens with partial support.

The browser fixture (`create-drawing-fixture.py --floors`, localhost port 8129,
then `test-floor-browser.cjs`) exercises three clients, a player stair crossing
interrupted by reload, automatic view following, a hole fall, and refresh. It
asserts three accepted token moves and no separate player view command. The full
suite passed 677 tests; the subsequent movement-intent merge regression and the
three existing runtime tests also passed. This is a foundation, not completion
of the floor/elevation roadmap: flight, undo, feedback, and automation journeys
remain unfinished.

## Movement undo

Selected-token movement undo now uses up to 20 server-owned receipts, restoring
position, floor, and interrupted stair progress together. The actor must own the
receipt, its token revision must still match, and floor geometry must be unchanged.
Unrelated token edits deliberately invalidate the receipt rather than silently
overwriting newer work. Receipts survive reload; cloning cannot copy them.
The Undo move button and Ctrl+Z work outside combat, with movement-cost refunds
limited to a matching locally tracked combat move. Undo does not re-fire normal
movement triggers. This reverses movement only, not damage or ability side effects.
Whole-group undo is still pending; the control explicitly acts on one selected token.

## Library-first panels

Token and scene creation use collapsed native disclosures. Monster import remains
directly available and opens the token builder after selection. Saved folders and
token search appear first; search now filters token/folder names, opens matching
groups, and preserves normal folder collapse state when cleared. Player tokens no
longer sit below a large GM-only creation notice. Closed settings panels are inert
to keyboard focus. Shared panel backgrounds are opaque, the close control is larger,
and token Delete buttons no longer overlap long names. Import feedback remains
visible with creation collapsed. Memory diagnostics require `?diagnostics=1`.

The repeatable `test-library-layout-browser.cjs` journey verifies search, no-match
feedback, restored browsing, expandable forms, and library/scene placement at
1280×720. Screenshots are in `.playwright-mcp/library-layout-*.png`. Broader panel,
tracker, navigation, and character-card work remains on the checklist.

## Map navigation

Visible camera controls show the current zoom percentage, zoom around the viewport
center, fit the map, and center the visible selection. The same percentage follows
wheel zoom and initial map fitting. The controls stay above the map at the right,
clear of the character sidebar and bottom ability tray. A shortcut popover documents
pan, zoom, movement undo, and board-focused +/−, F, and C shortcuts. These shortcuts
only run when the board itself has focus, preserving text input elsewhere.

The library-layout browser journey also verifies zoom changes, selected-token
centering, keyboard fit parity, and guide visibility. Visual QA at 1280×720 included
the expanded character sidebar and ability tray. Camera controls do not write
shared board state. `.playwright-mcp/map-navigation.png` records this layout.

## Floor-aware suggestions

`ui/floor-geometry.js` uses the existing ordered level view model, explicitly
placing virtual ground below the first zero-ranked upper floor. Hidden floors
are disabled and deleted floor references remain unknown rather than becoming
ground. Same-floor checks are shared by flanking, aura membership, Stand Firm,
and opportunity-attack adjacency. Cross-floor geometry is still unimplemented;
these checks avoid claiming adjacency through an unmodeled solid floor.

High Ground now defaults off with an explicit confirmation label and explanatory
tooltip. Per the local Draw Steel combat reference, standing/climbing eligibility
and occupied vertical space are required; artwork order is insufficient. Tests
cover the first upper floor, hidden/deleted levels, cross-floor flankers, and
existing same-floor/condition behavior. This does not complete elevation/range
or cross-floor opening support, and those requirements remain unchecked above.
Validation: 680 tests passed across 78 VTT/automation files. These are code-level
checks; cross-floor ability browser journeys remain part of the pending geometry work.

## Inactive tracker

Outside combat, the tracker is a native “No active encounter · Show tokens”
disclosure. Tokens remain available on demand. Starting combat opens the full
tracker automatically; ending combat closes it again. Idle action controls run
horizontally, with scene/floor information on the next row. The existing active
combat layout remains intact. `test-tracker-browser.cjs` verifies reveal/hide and
actual GM Start Combat/confirmed End Combat transitions in the disposable fixture.
The 1280×720 idle view was visually inspected. No production combat was changed.

## Save feedback

Canonical commands now report sending, accepted, rejected, and unconfirmed outcomes
to an operation-specific save-status panel. Permission failures retain their server
reason; 403 no longer incorrectly means an expired session. Unrelated success does
not remove another operation's failure notice. The panel distinguishes its last
accepted action from unresolved issues and offers explicit notice dismissal.
Network failures and accepted-but-unapplied events remain unconfirmed rather than
being described as safely rejected. Notices are tab-local (up to 20); they are not
a durable action-recovery journal or a connection-health monitor.

The player browser test holds a move pending, rejects it with a synthetic 403,
verifies the exact reason, accepts a later move, and checks that the original issue
remains until dismissal. All 681 tests passed across 79 VTT/automation files. The
shortcut and save-status popovers close one another to avoid obscuring each other.

## Connection status

The map toolbar reports connection state from successful bootstrap/recovery checks,
browser offline events, and recovery errors. It distinguishes connecting, connected,
offline, reconnecting, a check older than 15 seconds, expired authentication (401),
and denied access (403). Its tooltip reports the age of the last successful check.
Clicking checks/reconciles again without resubmitting rejected changes. Recovery
errors no longer masquerade as failed token movements in save notices. Repeated
successful checks do not rewrite the live-region label unless its state changes.

The localhost browser journey verifies real browser offline/online transitions,
synthetic session rejection, separate save feedback, and manual recovery. All 682
tests passed across 80 VTT/automation files. This is tab-to-server status, not proof
that every remote player is connected or that external Pusher delivery was tested.

## Active tool labels

Tool modules publish their actual activation state to a persistent map-toolbar
label: selection, drawing, measurement, stairs editing/placement, cutout editing,
and template placement. Multiple active modes remain visible rather than one label
concealing another. The browser journey verifies Draw/Measure toggles, stairs
editing and placement, panel closure, template placement, and Escape cancellation.
It caught a preexisting focus problem: choosing a template left keyboard focus
outside the board, preventing its Escape handler from running. Placement now
focuses the board without scrolling. Cutout mode is wired but its browser label
journey remains pending; broader tool exclusivity is not claimed complete here.

Draw and Measure now explicitly deactivate one another so one pointer gesture
cannot be consumed by both. Eraser mode has its own active-tool label. The drawing
journey now waits for a connected, visible map before testing gestures, and covers
switching modes before its three-client save/erase/clear/undo/floor/reload/rejection
checks. An initial replay timeout was not reproducible in a fresh fixture; the
readiness condition and subsequent full journey passed. Template creation, drag,
ownership and deletion also passed with the combined current UI. Other mode pairs
(stairs, cutouts, targeting) still need exclusivity review.

Validation: 678 tests passed across 77 files. Expanded PHP checks then passed for
forged/cloned receipts and changed floor geometry. Three-browser floor QA includes
Undo move after reload (restoring a fall) and Ctrl+Z (restoring the previous stair
entry and linked view). No live gameplay writes or deployment were performed.

## Movement authority under concurrent changes

Removed the old movement fallback that could reconstruct a deleted placement
from a pretransaction API read. Movement now requires an existing canonical token
and checks current player/team and hidden-floor permissions inside its write
transaction. Regression cases cover deletion, team changes, and a move to a
hidden floor without advancing the world revision on rejection.

Validation: all 682 tests passed across 80 files. A fresh disposable fixture also
passed the three-browser stairs, fall, reload, linked-view, and movement-undo
journey. Live campaign state was not changed.

## Tool ownership and cancellation

Draw, Measure, stairs, cutout editing, and template placement now hand control to
one another through a shared cancellation registry. Label refreshes do not acquire
control. Switching modes closes the prior editor or cancels its pending placement;
cutout drafts follow the existing Close behavior (only Apply saves them). Closing
stairs ends a live corner drag and persists its existing edits before releasing
control. Escape now exits Measure, stairs, and cutout editing. Automation wall
placement uses the same handoff and focuses the board for keyboard cancellation.

The browser journey covers both directions of Draw/stairs handoff, Draw to
template to Measure, cutout activation/Escape, and cutout to Draw, verifying the
old panels and pressed states actually clear. All 682 regression tests passed.
Targeting and other specialized interaction modes still need a separate review.

## Movement hook intent

Floor changes previously replaced the movement payload and lost the distinction
between walking and undo. The confirmed-movement adapter also mislabeled forced
movement as normal. Structural floor events now retain movement intent, and the
adapter emits normal-movement hooks only for acknowledged walking commands.
Source/destination footprints preserve floor IDs. Generic placement edits and
remote replay do not run those hooks.

Validation: 683 tests passed across 81 files. The expanded three-browser floor
journey asserts one walking hook for stairs, no normal hooks for floor undo after
reload, and no duplicate hooks in either observing browser. Physical elevation
and cross-floor ability geometry remain pending.

## Compact character card

The character panel now shows stamina/recoveries, heroic resources, surges, and
conditions first. Statistics, resource rules, skills, languages, and feats remain
available in a native Character details disclosure. Existing action controls stay
in the ability tray. The panel fits its content up to the available viewport height
instead of covering the map down to the bottom edge. Expanded content scrolls.

Same-character selection refreshes retain the current card while revalidating the
sheet, preserving disclosure and scroll state. Previously these refreshes replaced
the card with a loading screen, losing local UI state. Tucked panels are inert so
hidden controls cannot receive keyboard focus.

Validation: 683 regression tests passed. The disposable player-browser journey
verifies the 1280×720 core controls fit, details expand, surge add/spend controls
still update, open details survive refreshes, and tuck/reveal sets keyboard access
correctly. The compact view was visually inspected. No live sheet was changed.

## Character resource save feedback

Stamina, recovery, surge, heroic-resource, and victory saves now show pending,
saved, and unconfirmed outcomes in the character card. Resource controls are
disabled during a save, with handler guards preventing overlapping submissions.
Same-character refreshes cannot overwrite a pending resource edit. Save broadcasts
retain the originating character even if selection changes during the request.
Dialog actions stop if selection changes before confirmation.

Rejected or interrupted saves retain the error reason and reload current saved
values; a failed reload is reported separately. Resource rolls no longer show a
success message after a failed save. This covers the card's resource controls;
hero-token, condition, and multi-step ability recovery remain separate work.

Validation: 683 regression tests passed. The disposable player browser holds a
surge save pending, checks disabled controls, rejects it with a specific 403,
verifies the reason and reconciled value, then completes normal add/spend saves
while preserving the open details section. No live sheet was changed.

## Token favorites and recent additions

Each library card has a favorite toggle. The collection selector switches between
All tokens, Favorites, and Recently added to board; search narrows the current
collection. Favorites and the latest 20 distinct additions are stored per username
in this browser, with graceful fallback when storage is unavailable. Tokens remain
subject to the normal player-visible library filter. Deleted/unavailable IDs do not
produce phantom cards.

Recent entries come from explicit canonical placement additions observed by the
tab, including other users' additions, not canceled drags or ordinary token edits.
Recent ordering preserves the source folder metadata used by character tokens.
An empty collection explains how to populate it. Favorite actions have accessible
names, pressed state, keyboard focus, and a separate target from deletion.

Validation: 685 regression tests passed across 82 files. Browser QA verified
favorite persistence, collection search, a real drag onto the isolated board,
recent history after reload, and unchanged folder metadata. The laptop layout was
visually inspected. No live tokens were added or changed.

## Confirmation refresh safety

Damage/healing, recovery, and victory handlers now reacquire the active sheet
after their dialogs resolve. A polling or selection refresh during confirmation
previously left the handler mutating a detached sheet object while saving a
different one. Overflow healing also recomputes from the current stamina/max after
its second dialog. Recovery rechecks that a recovery remains before spending it.

The disposable browser test opens a recovery confirmation, changes and reloads
the saved stamina/recovery counts while it remains open, confirms, and verifies
the current saved values receive the heal and deduction. It restores the fixture
values afterward. These are client refresh guards; server-wide concurrent sheet
resource updates still use the existing sheet endpoint's authority.

## Explicit floor views

The indicator now says Viewing, the Director's Activate button says Show players
this floor, and the navigation targets are larger. Players have a My token's floor
button. Browsing and showing floors change viewer state without moving tokens.
An explicit manual/Director-shown view is preserved on reload; startup no longer
overrides it with the linked token's floor. Players can return explicitly, and the
existing automatic following on token floor transitions remains in effect.

Three-browser QA verifies private Director browsing, showing a floor to both
players, player reload on that floor, individual return, and byte-equivalent token
state throughout those actions. The 1280×720 Director layout was inspected.

Explicit floor-view commands now validate current destination existence and
visibility on the server. A removed floor cannot be selected through stale input,
and hidden floors cannot be assigned to player views, including by group show.
GM-only inspection of a hidden floor remains allowed. PHP regression cases verify
all rejection paths preserve world revision and GM inspection succeeds; all 685
tests passed across 82 files. Automatic cleanup when floors are deleted or hidden
still belongs to the remaining floor lifecycle work.

## Checkpoint archive foundation

Scene checkpoints now have immutable named storage independent of event/snapshot
retention. Captures preserve a coherent revision and scene placements, configuration,
drawings, and templates. They are scoped by world and scene, bounded to 100 entries
per world and 16 MB each, and never auto-overwrite or auto-prune earlier captures.
The GM-only API supports capture, listing metadata, reading a full capture, and
explicit archive deletion. No restore path or user-facing UI is exposed yet.

PHP tests cover immutable retries, scene/world isolation, reopening SQLite, and
deletion that preserves canonical state. The disposable HTTP journey verifies
anonymous 401, player 403 for read/write/delete, GM operations and retry behavior,
and identical canonical snapshots before/after archive operations. Checkpoints do
not include character-sheet files, chat, combat, other campaign stores, or embedded
media backups. Scoped restore must remain explicit about those boundaries.

The Saved scenes panel now includes a Scene checkpoints disclosure for the active
scene. It offers named capture, revision/date listings, JSON download, refresh,
and confirmed archive deletion. Capture retries retain their ID after an uncertain
response; controls block overlapping archive operations. Scene changes invalidate
stale list requests. Scope limitations are shown beside the controls. Names allow
up to 80 characters consistently in the UI and server.

The disposable GM browser journey created a checkpoint, inspected its downloaded
JSON, reloaded the page, and deleted the archive entry through confirmation. The
laptop layout was inspected. Scoped restore is not yet exposed or marked complete.

Checkpoint rows now offer a read-only position/floor restore preview. It lists
proposed destinations, unchanged tokens, explicit skips for deleted tokens or
missing floors, and newer tokens preserved. A warning identifies changed grid or
floor layout. This scope excludes stamina, conditions, turns, and scene geometry.
Applying the preview is still pending; no restoration is claimed complete.

Validation: all 686 tests passed. PHP tests cover scope restrictions and missing
entities/floors; authenticated API and GM browser journeys exercise previewing
without altering canonical state, alongside capture/download/delete regression.


### Atomic checkpoint position restoration

The reviewed position/floor scope can now be applied through one GM-only canonical
command. The server recomputes the plan and checks the reviewed world revision
inside its write transaction. Stale previews require fresh review; they never
automatically overwrite newer play. Current stamina, conditions, turns, geometry,
and newer tokens are preserved. Missing tokens/floors remain explicit skips.
The accepted event also updates linked player floor views. Network retries use
the original operation ID; no walking automation fires for restoration.

Validation: 687 tests passed. SQLite coverage includes a 101-token atomic restore,
current resource preservation, GM authority, stale preview rejection, idempotency
after checkpoint deletion, and database reopening. The disposable browser journey
uses GM plus Cal and Sharon, consecutive actual stair drags without a midway reload, stale
preview rejection, confirmed restore, rendered position convergence, player floor
return, and zero walking hooks. Capture/download/reload/delete still pass.

The apparent second-drag failure was a browser harness timing issue: after
switching tabs, it measured an animating token and subsequently sent pointerdown
to the map backdrop. A locator hover now waits for a stable token before the raw
mouse drag. The previously failing GM/player tab-switching journey passed three
consecutive runs without a midway reload; a separate single-player consecutive
drag trace also passed. No gesture-state workaround was added to the application.
Full scene geometry restoration and duplication/export remain pending.


### Hidden and deleted floor view cleanup

Floor configuration changes now repair saved viewer references in the same
canonical transaction. Invalid player views fall back to the nearest surviving
visible lower floor or base. GM views can stay on an existing hidden floor, but
deleted floors are invalid for everyone. Valid views and placement data remain
unchanged; fallback views drop stale token associations and persist as manual
views. The floor event carries cleaned views through player projection, event
replay, and the focused renderer.

Validation: 689 tests passed. PHP coverage checks hiding, deleting the full stack,
GM versus player visibility, disconnected users, unchanged tokens, retries, and
database reopening. The reducer test verifies projection cannot retain a stale
hidden GM view. A GM/Cal/Sharon browser journey hides a floor while Cal is online
and Sharon is offline, verifies Cal's event-driven return and Sharon's reload,
and confirms token state is unchanged. Atomic token relocation and related
floor-bound content cleanup during deletion remain pending.


### Atomic occupant relocation when deleting floors

The GM Delete control now submits a single level.delete command. The server
removes the current floor, relocates its occupants to supported visible lower
floors, and updates linked player views within one transaction. Levels.set uses
the same relocation logic for removed floors. Hidden floors and fully unsupported
footprints are skipped; partial support catches large tokens. Resources and
coordinates remain current, while traversal and movement undo receipts are
cleared. The canonical event projects and renders token changes and refreshes
the scene list. It does not trigger walking automation.

Validation: all 690 regression tests passed. Authority tests cover full-stack
deletion, hidden intermediate floors, one-square holes, large-token partial
support, linked landing views, permissions, and retries. The three-browser
journey climbs stairs, deletes the occupied balcony through confirmation, verifies
exactly one command and world revision, checks token/view convergence and scene
list removal, then reloads an offline observer. Floor-bound drawings/templates/fog
and links to deleted stairs still need explicit cleanup.
