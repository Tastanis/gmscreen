# VTT improvement implementation

User authorized implementing the September 7 product audit, updating/running the diagnostic pull, and authenticated website access. Preserve live campaign data. All gameplay QA uses disposable localhost copies. The scope is tracked by the active goal; unfinished boxes are not claims of completed work.

## Safety and testing foundation

- [x] Refresh diagnostic assets using the existing read-only exporter (1,587 files; September 7).
- [x] Add authenticated logical V2 export and restore into a new SQLite world; captured live revision 3594.
- [x] Update double-click launchers and verify a restored current-source GM/player app.
- [x] Add a repeatable synthetic drawing browser fixture and verify logical snapshot restore. Broader journey coverage remains below.

## Broken player workflows

- [ ] Server-validated atomic stairs/falls, including player and alternate movement paths.
  - Core single/group movement resolves stairs/support on the server. Manual Fly/Hover modes, standard condition interruption, and landing are implemented. Flight eligibility/height/other speed-zero automation, whole-group undo, and remaining automation entry-point coverage are pending.
- [x] Drawing creation/erase/clear/undo persist explicitly through V2, with author/floor scope and hidden-floor projection.
- [x] Owned temporary template edit/remove permissions; persistent structures retain GM authority.
- [x] Exact rejection feedback and pending/accepted state for canonical board commands; other multi-step action recovery remains below.

## Coherent geometry and player association

- [ ] Shared floor/elevation/adjacency model used by suggestions, range, auras, and movement.
  - Shared floor participation now guards flanking, aura membership, Stand Firm, and opportunity-attack adjacency. High Ground requires confirmation. Physical elevation, openings, and range integration remain pending.
- [ ] Hidden/deleted floors, partial support, flight, forced movement, stairs interrupted by reload, and undo tests.
  - Floor edits repair saved viewer floors. Deletion atomically relocates occupants, updates linked views, removes bound drawings/templates/fog, and disconnects incoming stairs. Flight and remaining movement edge cases are still pending.
- [ ] Explicit view-versus-token controls and follow/browse/center policy.
  - Viewing labels, Show players this floor, primary-token association, and My token's floor are implemented. Players now choose persistent per-scene Follow or Browse; one-time returns preserve Browse. Camera pan/zoom policy remains pending.
- [x] Configurable roster and primary token association, preserving shared allied control.
  - GM Tokens panel edits the shared roster of existing profile IDs; reload open VTT tabs after saving. GM token settings select an explicit primary among duplicate PCs, including hidden/unavailable projection. Camera preferences remain in their separate item above.

## Faster live play

- [x] Token library and saved scenes first; creation forms collapsed.
- [x] Compact inactive tracker and combat character card.
  - Inactive tracker is a collapsed roster disclosure; the full tracker opens automatically during combat. The character card prioritizes stamina, recoveries, resources, surges, and conditions, with reference material in a disclosure and existing action controls in the ability tray.
- [x] Zoom/fit/center/shortcuts and persistent tool labels.
  - Visible zoom, Fit Map, Center Selected, shortcut guide, and active-tool labels are implemented. Browser checks cover Draw, Measure, stairs, templates, cutout editing, and mode handoffs.
- [x] Opaque readable panels, practical targets, diagnostics-only memory counter.
  - Main settings/character/monster/chat and token/drawing reading surfaces have opaque bases. Floor controls use 40px targets and readable single-line player controls; settings controls use 36px minimums. Keyboard focus remains visible. Dark/light/Diablo laptop layouts and diagnostics-only memory gating are browser-verified.

## Recovery and preparation

- [x] Specific-player preview and useful connection status.
  - Server-check-based connection status and manual reconciliation are implemented. GM Scenes exposes player diagnostics and an independent map/grid/floor/cutout/fog/token/drawing/circle/rectangle preview with local zoom/Fit. Token status overlays and wall template previews remain pending.
- [x] Named encounter checkpoints, scoped restore, scene duplication/export.
  - GM-only checkpoints expose reviewed atomic position or layout restoration. Layout restores floors, grid, fog, drawings/templates and existing-token positions while preserving current resources and newer tokens. Scene JSON export/import and duplication preserve board geometry and links, survive retries, and open without reload. Character sheets and base-map/catalog metadata are outside checkpoint restore scope.
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


### Deleted-floor content and stair cleanup

Floor deletion now removes its drawings, templates, and by-level fog in the same
transaction as occupant relocation. Surviving stairs keep their geometry but
disconnect destinations that no longer exist. The event carries explicit content
removals and cleaned fog through focused rendering; other floors and scenes stay
intact. Hidden-floor content IDs are omitted from player deletion events. The
confirmation explains content removal and stair disconnection.

Validation: 691 tests passed, followed by the expanded PHP audience checks. Tests
cover scene/floor scope, surviving links, private deletion events, idempotent
client removal of unseen entities, and fog replay. The three-browser deletion
journey seeds upper/base drawings and templates plus fog, deletes the occupied
balcony through the UI, checks that its rendered template disappears, verifies
base content survives and stairs disconnect, and reloads the offline observer.

Remaining floor work includes flight/hover/jumping, physical elevation and range,
whole-group undo, and live hide/unhide content reconciliation without a reload.


### Live floor visibility and startup projection

Hiding/unhiding a floor now reconciles its tokens, drawings, templates, and fog
through the canonical event without changing entity revisions. Revealed tokens
are not treated as new library usage or movement. Player events omit the raw
visibility payload and sanitize revealed tokens. Initial player HTML now uses
the same audience projection as V2 snapshot recovery, fixing a transient leak
of hidden-floor entities before the first client recovery.

The live browser test also exposed that changing the viewed floor updated the map
and label without refreshing token/template/fog layers. Those focused layers now
refresh on canonical floor-view changes. No whole-board subscriber was restored.

Validation: 692 regression tests passed. The new GM/Cal/Sharon browser journey
checks initial HTML excludes hidden token/template/drawing IDs, then performs
reveal/show/hide/reveal without player reloads and verifies rendered tokens and
templates plus unchanged canonical token data. The existing stairs/fall/reload/undo
three-client journey also passes after the layer refresh.


### Manual airborne movement modes

Token settings now offer Ground, Fly, and Hover with visible manual-rule limits.
Fly/Hover bypass stair traversal and holes during horizontal movement, including
forced movement and teleport destination support. Ground resolves landing through
canonical support geometry. Applying prone ends ordinary flight and resolves the
fall atomically, while hover remains airborne. Mode changes clear stale traversal
and undo receipts, persist across reload, and use existing shared allied control
permissions; players cannot change enemy or hidden-floor token modes.

Validation: 693 tests passed, followed by expanded permission checks. PHP coverage
includes hole crossing, reload, prone/hover differences, landing, linked views,
alternate movement, invalid modes, and permissions. A three-browser journey uses
the player's actual mode control, flies across the upper-floor hole, reloads,
selects Hover and Ground, and verifies synchronized landing. The source rules were
checked in chapter-10-combat.md (Fly and Hover).

This is the explicit airborne geometry state, not complete flight automation.
Flight eligibility, height, other speed-zero effects, fall damage, vertical movement and
targeting, jumping, and automatic ability grants still need their later roadmap
work. The control and automation registry state these limits.

### Standard conditions interrupt ordinary flight

Prone, Grabbed, Restrained, and Unconscious now end Fly and resolve support and
linked viewer floors in the same canonical transaction. Hover persists. Takeoff
with an interrupting condition is rejected; removing the condition does not
automatically restart flight. Slowed alone preserves flight. Custom effective-speed
modifiers remain manual. Rules checked in local source chapters 5 and 10.

Validation: all 693 tests across 82 files pass. The PHP integration checks all
three speed-zero conditions, string/object forms, case normalization, one-revision
landing, linked views, takeoff rejection, condition removal, hover, and Slowed.
A three-client browser test applies Grabbed through the player's actual condition
menu after flying across a hole and reloading, then verifies synchronized landing.

### Character-card temporary stamina

The compact card now displays saved stamina above maximum instead of a hardcoded
zero, with a tooltip explaining the current storage convention. Capped healing
and recovery preserve existing temporary stamina instead of reducing the total to
maximum. This does not introduce a separate temporary-stamina resource model.

The disposable player browser test covers healing overflow, reload, capped healing,
recovery, and damage both within and beyond the temporary amount. It also retains
the concurrent-sheet-refresh recovery test. All 693 tests across 82 files pass.

### Shared configured player roster

Server and client now use `config/player-roster.json` for profile eligibility,
floor following, and Show players. A server environment path can override the
file. The list contains public existing profile IDs only; authentication and team
permissions are independent. New account/sheet creation is not part of this change.
Primary-token selection and a GM roster editor remain pending.

Validation: 695 tests across 82 files pass. PHP verifies custom-profile following
when another player moves the token; JS verifies custom profile/name resolution,
duplicate ambiguity, validation, and viewer lists. A disposable custom roster
(`cal`, `sharon`, `rowan`) passed the three-client floor-view browser journey,
including persisted Show players state for offline Rowan, reload, own-token
return, and hidden-floor cleanup. No live configuration or campaign data changed.

### Explicit primary PC among duplicates

GM token settings now include a primary-PC checkbox for linked profiles. Switching
the primary clears the old flag and sets the new one in one canonical transaction.
The selected copy controls future floor following and My token's floor resolution;
ordinary allied movement permissions remain shared. Profile/owner/controller fields
and primary assignment are now GM-only. Ambiguous duplicates still have no implicit
primary, and server uniqueness validation rejects competing selections atomically.

Validation: the 695-test suite passed after implementation, followed by expanded
PHP/JS checks for duplicate resolution, switching, permissions, and database reload.
A three-client browser journey selects and switches actual GM checkboxes, reloads,
confirms the player cannot see that control, moves the selected duplicate through
stairs across a reload, and checks the linked player's floor and observer rendering.
Hidden-primary projection and broader camera policy remain pending.

### Roster removal preserves usable scenes

Removed roster profiles no longer cause their historical primary flags to reject
unrelated placement batches. Fresh primary choices and association edits still
require a configured profile; clear-and-relink is supported atomically. Expanded
PHP integration coverage reopens the database after replacing the test roster,
changes conditions and position, rejects invalid reassignment without mutation,
and clears/relinks/reassigns the obsolete token. All nine PHP integration groups
pass. This fixes a server validation edge case; hidden-primary projection remains
the next association gap.

### Hidden primary projection

Player snapshots/bootstrap and shared placement/floor events now carry a derived
association map containing visible IDs or explicit null. Clients do not choose a
visible duplicate when the true primary is unavailable. Hidden primary IDs are
removed from saved viewer references, and hidden-token movement does not pull its
player's view. Revealing the primary restores My token's floor through live events.
The unavailable control reports that the GM should check the association.

Validation: 697 tests across 82 files pass, followed by the expanded PHP hidden-move
guard. Projection tests cover hidden tokens, hidden floors, saved viewer references,
and user-independent shared stream delivery. Reducer tests verify no canonical
revision rewrite or repeated layer refresh for unchanged associations. The extended
three-browser primary journey checks hide, no duplicate fallback, reload HTML
privacy, live reveal, and restored token-floor return.

### GM roster editor

Tokens now includes a collapsed Player roster editor with existing profile IDs,
Save roster, Load current roster, and a reload action after saving. The GM-only API
validates IDs and saves with a file lock, atomic replacement, and a content-revision
guard. Conflicts and validation errors retain the draft. The editor explicitly
distinguishes association from creating accounts/sheets and instructs open VTT tabs
to reload after changes. Canonical board state is untouched.

Validation: 697 tests across 82 files pass. PHP checks atomic save, unchanged save,
and stale revision rejection. The browser journey covers anonymous/player denial,
two GM drafts, preserved stale/invalid drafts, persisted reload, and identical board
snapshots before/after. The expanded editor was visually checked at 1280×720.

### Player Follow and Browse modes

The floor header now lets players choose Follow my token's floor or Browse floors
per scene. The canonical preference survives reload, one-time returns, GM Show
players, and floor deletion/visibility cleanup. Automatic token floor changes leave
browsing users where they are; selecting Follow returns to an available primary
and resumes following. The GM's explicit Show players remains effective without
resetting the player's preference.

Validation: 698 tests across 82 files pass. PHP covers shared movement/falls,
database reopening, one-time return, GM show, deletion cleanup, invalid values,
and another-player permission rejection. The three-browser primary journey now
covers Browse across reload/stairs, one-time return retaining Browse, resumed
Follow tracking the next fall, and existing hidden-primary privacy checks. The
player control was visually checked at 1280×720. Camera pan/zoom remains separate.

### GM scene JSON export

Each scene now offers Export scene JSON. The versioned package includes catalog
and folder metadata, base-map reference, placements, floors/stairs/cutouts, fog,
drawings, templates, and image references. It preserves placed token values while
omitting viewer preferences, projected associations, entity revisions, undo, and
interrupted stair receipts. The UI and file state that image files and character
sheets are not bundled. Import and duplication remain pending.

Validation: 699 tests across 82 files pass. Package checks cover metadata, domains,
geometry, references, excluded data, unused scenes, and source immutability. The
browser journey downloads the real file, parses it, compares it to the canonical
snapshot, checks anonymous/player denial and missing scenes, and confirms identical
board state before and after export.

### Scene catalog concurrency prerequisite

While tracing import/duplication, found that scene/folder creation and grid/visibility
edits could race deletion or each other: only deletion held the catalog's existing
lock. All mutations now hold that lock across read, modification, and atomic file
replacement. No V1 board writer was added.

The disposable concurrency test launches 18 actual PHP processes (eight scene
creates, eight folder creates, grid edit, and visibility edit). It proves every
writer waits behind the deletion lock, the file remains unchanged while blocked,
and every new entry and both independent edits survive release. Import/duplication
implementation remains pending; this closes a necessary lost-update hazard first.
The full regression suite also passes: 699 tests across 82 files.

### Read-only scene import preview

Scenes now includes Preview scene JSON. A GM can choose an exported package and
review its name, token/floor/drawing/template counts, image references, and scope.
Malformed domains, mismatched IDs, missing floor/stair/fog references, excessive
counts/size, and unsupported image URL schemes are rejected. File text is rendered
as text, never as HTML. Previewing does not change any scene.

The browser journey exports a real fixture, uploads it through the preview control,
checks player denial, verifies malformed-floor feedback and safe text rendering,
and compares unchanged canonical snapshots. PHP tests cover valid export previews
and malformed package cases. Scene installation and ID/reference remapping remain
pending; preview validation is not a substitute for canonical write validation.
All 699 tests across 82 files pass after this change.

### Scene copy ID preparation

`ScenePackage::prepareForNewScene` prepares a separate scene without writes.
It derives repeatable new board IDs from a reserved destination scene ID, remaps
floors, stairs, cutouts, fog, occupants, drawings and templates, and preserves
library/profile/embedded ability identities. Conditions and marks follow copied
placements; references outside the package reject preparation. Execution receipts
and viewer preferences are omitted. Tests cover linked geometry, duplicate stair
names on different floors, stable retries, separate copies and source immutability.
This is not an installer or complete write validator: canonical field validation,
catalog/world recovery and player visibility still gate the import action.

The initial copy preparation incorrectly separated mirrored stair IDs. It now
derives one new ID from the original ID and the unordered linked floor pair.
That preserves mirror editing while separating unrelated pairs that reuse an ID.
Duplicate IDs within a floor reject preparation. A PHP-to-JavaScript regression
prepares a package and exercises the actual stair editor's corner, edge-color and
mirror deletion functions, checking unrelated stairs and source data remain intact.
All 701 tests across 83 files pass after the correction.

### Atomic scene installation and catalog recovery

The internal GM installer saves placements, floors/fog, drawings and templates in
one Sync V2 revision with a durable catalog outbox receipt. Source scene, other
scenes and routing remain unchanged. Accepted retries return the original event;
changed requests cannot reuse the operation ID. Scene deletion cancels pending
catalog recovery and an old retry cannot resurrect it.

Opening the GM scene list now recovers pending catalog entries under the existing
shared lock. It acknowledges only after saving and preserves a saved import's later
metadata edits. Fault-injection tests cover SQLite event failure, process reopening,
catalog save failure and interruption after saving but before acknowledgment.
The server event is replayed through the actual browser reducer and checked against
the canonical snapshot; player delivery omits hidden tokens, floors and content.
File-install HTTP/UI controls remain pending, along with complete write validation
and explicit visibility wording. This internal operation creates a browsable scene
and never activates it; it must not be presented as a private encounter draft.
All 702 tests across 83 files pass after this change.

### Scene-file import workflow

GM Scenes → Import scene JSON now previews an exported file and offers Import as
new scene after explicit acknowledgment that players may browse it. No current
scene routing changes. The result provides Reload VTT to expose the saved copy in
the scene list; the success message stays visible at 1280×720.

The store validates map references, supported geometry, numeric bounds, drawing
points, templates, floor lists, stairs, primary-token uniqueness and dangerous object
properties before writing. Embedded image data is rejected; image URLs and character
sheet references remain external. Invalid packages can still be previewed where
their basic structure is readable, with the reason installation is unavailable.
The UI keeps one operation ID through response loss and retry. Deleted prior imports
cannot be resurrected by retrying; the user chooses the file again for a new copy.

Browser tests exercise GM/player access, invalid file rejection, explicit browsing
acknowledgment, simulated loss after server acceptance, one-copy retry, fresh IDs,
unchanged source/routing, catalog entry, opening and reload. Existing export/preview
browser tests still pass. All 702 regression tests pass. Scene duplication shortcuts,
private encounter preparation and reload-free catalog integration remain follow-ups.

### Duplicate scene and name copies

Each saved scene now has Duplicate scene. It obtains the canonical export directly
and opens the existing import preview with a `Copy of …` name, avoiding file download
and upload. Both paths expose New scene name before installation. Once submitted,
the request body and name are frozen for retries so a lost accepted response cannot
produce a second differently named copy. A busy preview/import cannot be replaced
by another duplicate request.

The browser regression runs in both file-import and Duplicate scene modes, renames
the copy, loses the first accepted response, retries, verifies one catalog entry and
fresh IDs, checks unchanged source/routing, then opens and reloads the copy. Both
journeys and export/preview pass. All 13 focused scene-manager/copied-stair tests pass.
Private encounter preparation and reload-free catalog integration remain pending.

### Open imported scenes without reloading

Import/duplication now waits for the existing Sync V2 runtime to confirm all four
new scene domains, refreshes catalog metadata, and offers Open copy for GM directly.
This reuses the scene manager's existing activation action. It does not switch the
scene during import or introduce a board snapshot writer/subscriber. Failed recovery
or catalog refresh retains the same submitted request for safe retry.

Browser tests in both duplication and file-import modes lose the accepted response,
fail the first catalog refresh, retry to one copy, open the copied token without
navigating/reloading, then verify a later reload. They preserve original scene data
and initial routing. The success UI is visually checked at 1280×720. Private encounter
preparation remains pending.
All 702 tests across 83 files pass after this integration.

### Laptop readability and controls

A final shared CSS layer preserves each theme's palette/gradients while supplying
opaque bases beneath sheets, chat, settings and token/drawing menus. Floor arrows,
Show players this floor, Follow/Browse and My token's floor use 40px targets and
larger text. Player return labels stay on one line; idle floor controls retain a
compact header. Settings controls have 36px minimum targets and visible keyboard
focus. The existing memory widget remains available only with `?diagnostics=1`.

The readability browser check measures GM/player targets and bounds at 1280×720,
checks panel opacity, verifies ordinary/diagnostic memory visibility, and captures
settled dark/light/Diablo panels for visual inspection. The floor-view browser
regression also passes private GM browsing, player Show/reload, token-floor return,
offline hidden-floor cleanup and unchanged token positions. No gameplay logic changed.

### Internal checkpoint layout restore

The new layout plan describes floor/grid/fog changes, drawing/template additions,
removals and updates, existing-token destinations, newer-token fallbacks and saved
viewer-floor changes. The transaction recomputes that plan against the reviewed
world revision and applies it once. Current token resources/conditions and newer
tokens survive; geometry-invalid undo/traversal receipts are cleared. Resource
files, combat turns, routing, base-map/catalog metadata and other scenes are outside
this scope. Missing/deleted checkpoint tokens are not resurrected.

SQLite tests cover stale previews, player denial, lost content, newer tokens on
removed floors, resource preservation, linked/Browse views, hidden-floor projection,
injected event-write failure, and accepted retries after checkpoint deletion. The
actual JS reducer reproduces the committed state. The HTTP/UI preview/apply workflow
and canonical grid persistence on scene reopening remain to be completed.
All 703 tests across 83 files pass after this change.

### Canonical grid display and reopening

Scene activation previously copied the catalog grid over the canonical scene grid;
remote grid updates also left the active rendering grid stale. Existing scenes now
use their Sync V2 grid, with catalog metadata only as a fallback. Snapshot recovery
and grid/routing events refresh the active grid before rendering floor content.

The browser regression deliberately leaves the catalog grid stale, changes the
canonical grid, checks the displayed size in GM/Cal/Sharon, reloads all three,
switches the GM to another scene and back, and verifies the size and original token
coordinates. This closes the grid persistence gate for checkpoint layout restore.
The checkpoint layout HTTP/UI workflow remains pending.
All 703 tests across 83 files pass after the grid correction.

### Checkpoint layout restore in the GM interface

Checkpoint rows now offer Preview layout beside Preview positions. The layout
preview lists geometry/content changes, token destinations, newer-token relocations
and affected saved views. Confirmation states the restore scope and possible
removal of newer drawings/templates. Both preview and apply are GM-only; stale
world revisions require a fresh preview. The normal V2 runtime delivers the one
atomic layout event to clients without synthesizing walking triggers.

`test-checkpoint-layout-browser.cjs` exercises real capture/preview/confirmation,
player denial, a stale preview, deleted/restored floors and content, a newer token
on a removed floor, current conditions/stamina preservation, GM plus two-player
convergence and reload. The 1280×720 preview was visually inspected. All 703 tests
across 83 files passed for the HTTP/UI integration. Live campaign data was untouched.

### Specific-player preview server foundation

The GM-only GET player-preview endpoint accepts a configured roster ID and returns
the same projected snapshot that player's real session receives. No impersonation,
presence update or canonical write occurs. Hidden floors/tokens and primary-token
associations use the existing projection rather than a separate preview sanitizer.
The visual preview interface is still pending.

PHP tests cover exact projection, hidden content, invalid identities and unchanged
session/canonical state. The disposable HTTP regression checks anonymous/player
denial, non-GET denial, malformed/unknown player IDs, exact Cal/Sharon snapshot
parity and retained GM identity. All 15 server regressions pass.
Full regression suite: 704 tests across 83 files passed.

### Player view details controls

GM Scenes now includes a player selector and refreshable scene, saved floor,
Follow/Browse and primary-token diagnostics. Requests use the read-only projected
snapshot endpoint and current roster. A monotonically increasing request sequence
prevents late responses from replacing a newer selection or a closed disclosure.
Unavailable canonical primary associations never fall back to another token copy.
This panel explicitly does not claim to show graphical fog or cutout visibility;
that renderer integration remains outstanding.

The browser journey selects Sharon and refreshes, checks the displayed floor,
asserts no V2 commands, unchanged canonical state and no page errors. The settled
panel screenshot was inspected. Model tests cover Browse, unavailable primary,
deleted-floor fallback and a closed player map.
Full regression suite: 705 tests across 84 files passed.

### Passive fog rendering for graphical preview

The ordinary board now delegates canvas painting to renderFogSurface, which accepts
an explicit canvas, scene, floor, view geometry and GM/player opacity. It reuses
existing per-floor reveals and PC-cell reveal behavior, without mounting handlers
or replacing the active board's singleton context. The fog checker also accepts
an explicit viewer override for passive player evaluation inside the GM page.

Unit tests cover independent canvases, separate floor reveals, opaque player fog,
translucent GM fog, grid borders, unchanged source state and clearing a closed scene.
The isolated browser test enables real canonical fog, then compares passive canvas
output byte-for-byte with the mounted GM/player canvases. Both match; drawing the
opposite viewer opacity leaves the mounted canvas unchanged. Graphical preview
assembly with map/cutout/token/content layers remains outstanding.
Full regression suite: 706 tests across 85 files passed.

### Independent map and fog dialog

Player view details now opens a modal map/grid/floor/cutout/fog snapshot at the
selected player's saved floor. The shared map renderer accepts rootId:null to
create a private stack instead of relocating the active board's global stack.
The shared fog surface receives normalized player placements, filtered library
metadata and explicit player opacity. Cutout and grid origins remain aligned.
Closing invalidates late image loads and discards the surface. No gameplay tool,
store subscription or board command is mounted by this preview.

Browser QA covers opening/closing the base preview, retained GM map stack identity,
no board writes, then an upper floor with shifted grid origins, exact cutout-mask
comparison, a revealed cell and opaque unrevealed cells. Screenshots were inspected.
The 706-test regression suite passed before the final PC-team normalization fix;
the two focused player-preview tests passed afterward, including alias-based PC
fog reveals and unchanged snapshot inputs. Tokens, drawings and templates are
explicitly omitted in the dialog and remain required preview work.

### Token preview and canonical render geometry

Preview tokens and the actual board share floor/fog visibility, stack order,
transforms and direction badges through token-presentation.js. The passive surface
is inert and uses separate preview placement identifiers. It does not mount drag,
selection, combat or automation handlers. Status overlays, drawings and templates
are still explicit preview omissions.

Browser comparison exposed missing preview backdrop padding and integer truncation
in the live token render normalizer. Preview now measures the same backdrop CSS;
render geometry preserves canonical fractional coordinates in both surfaces.
The fog painter recognizes canonical ally/team aliases directly, so preview no
longer needs the integer legacy placement normalizer for PC reveal membership.

The browser journey seeds visible-through-cutout, blocked-by-floor, hidden,
fully-fogged and partially-revealed large tokens. Preview and real player token
IDs, dimensions, fractional transforms, images, stacking and direction badges match.
The same geometry survives player reload. No preview board commands or canonical
changes occur; the screenshot was inspected. A fresh three-client stairs/fall/
reload/undo regression also passes. All 708 tests across 86 files pass.

### Drawing preview and local inspection zoom

The passive SVG layer calls the existing drawing renderer with explicit layer,
selected floor and captured drawings. It preserves the exact path/color/width
rules without mounting drawing tools or touching their shared state. Preview paths
use separate identifiers. Native scrolling, zoom in/out and Fit make small tokens
inspectable; zoom retains the viewport center and is local to the modal.

The browser journey compares real player and preview path data, color and stroke
width, verifies that a drawing on the other floor is absent, exercises zoom in/out
and Fit, and rechecks unchanged canonical state and zero preview commands. Token
parity and player reload checks pass in the same journey. The resulting dialog was
visually inspected. Templates and token status overlays remain required work.

### Shared template floor clipping

Template floor presentation and independent SVG cutout-mask application now live
in template-presentation.js. The ordinary interactive renderer imports the same
functions that passive preview will use. Interactive selection cleanup remains
inside the existing tool; the shared functions do not mount handlers or write state.
Template shape painting/hydration into the preview remains pending.

Unit tests cover same-floor, above-floor and hidden templates, stacked cutout
intersection, shifted grid origins, nonblocking floors, unchanged shape inputs
and mask clearing. The isolated GM/player browser journey verifies unmasked
same-floor shapes, hidden above-floor shapes, clipped lower-floor shapes, and
preserved rendering/canonical state after player reload.
Full regression suite: 711 tests across 87 files passed.

### Shared circle and rectangle painting

The ordinary template tool now delegates normalized circle/rectangle CSS geometry,
labels and anchor-node placement to paintTemplateArea. It preserves the existing
rotation math and grid offsets without mounting handlers or changing shape data.
The interactive wrapper retains map visibility, wall rendering and selection logic.
Preview hydration and wall painting remain outstanding.

Tests verify circle bounds, shifted origins, rotated rectangle bounds, explicit
anchors, default outside controls and unchanged shape data. The GM/player browser
journey checks circle floor clipping plus a 90-degree rectangle's size, label and
rotation, including after player reload, with unchanged canonical state.
Full regression suite: 714 tests across 88 files passed.

### Hydrated circle and rectangle previews

Template normalization and geometry now run in independent createTemplateGeometry
contexts with explicit view getters. The live editor and passive preview share
snapping, bounds, rotation and anchor adjustment without sharing editing state.
Circle and rectangle previews use the existing area painter and floor masks.
Preview DOM uses separate template identifiers inside the inert surface.

Templates without explicit colors previously inherited changing palette offsets
across hydration. Palette order now resets on hydration, producing stable fallback
colors in the live board and preview. Explicit colors are preserved.

Tests cover independent map bounds, immutable source data, rectangle snapping and
anchor shifts. Browser QA compares all circle/rectangle bounds, rotation, labels,
colors and masks directly with the player board, then verifies reload parity and
zero preview commands or canonical changes. The preview was visually inspected.
Wall template painting and token status overlays remain outstanding.
Full regression suite: 716 tests across 89 files passed.

### Wall template previews

The normal board and passive preview now share wall tile, diagonal connector and
label painting. Diagonal connector rules have their own module while retaining
the existing board module exports. Preview walls use private identifiers and the
same floor visibility and cutout masks; no editing handlers are mounted.

Browser QA compares circle, rectangle and wall bounds, colors, labels, masks and
every wall tile/connector style against the actual player board. Both diagonal
directions and a lower-floor wall are covered, with reload parity, no preview
commands and unchanged canonical state. The preview screenshot was inspected.
Token status overlays remain outstanding. Full suite: 716 tests in 89 files passed.

### Stamina and trigger readiness in player preview

The board and preview share token-hit-points.js for normalization, bar geometry,
temporary stamina and numeric display. Viewer authority is explicit: the preview
passes isGm:false, so enemy numbers remain hidden inside a GM session. The existing
trigger-readiness painter supplies its badge; preview removes the clear-action
hook and misleading click instruction while retaining the inert surface.

Isolated browser QA compares actual player and preview stamina DOM and readiness,
covering negative enemy stamina and allied overflow. Repainting a temporary DOM
node from GM to player removes stale numeric labels, and disabling showHp removes
the bar. Reload, local zoom/Fit and canonical no-write checks pass. Full regression
suite: 716 tests across 89 files passed. Condition labels and judgment marks remain
pending; this is not yet the complete player preview.

### Condition labels and judgment marks in player preview

Shared token-conditions normalization preserves the existing duration, deduplication,
numeric rider and persistent execution-identity behavior. The normal board and
preview use token-status-presentation for condition labels, hidden-effect badges,
judgment marks and team/squad affiliation. Passive rendering enables no removal
hooks or condition tooltip handlers; the preview surface remains inert.

Browser QA compares these overlays against an actual player, including duplicate
condition hydration, after reload and with unchanged canonical state. Preview
marks have no removal hooks or misleading click instructions. The full existing
suite passed (716 tests/89 files), plus two new normalization tests preserve
source distinctions, typed weaknesses, immutability and rider execution markers.
Auras, persistent zones and combat group colors remain before preview completion.

### Auras and shared legacy token hydration

Manual and automation aura record handling and painting are shared with player
preview. Explicit placement, viewer-floor and fog inputs avoid GM authority leaks;
preview aura DOM uses private placement identifiers. Token render normalization is
also shared so older stamina/condition overlay aliases, ready ability lists and
hidden flags behave consistently while preserving fractional positions.

Browser QA compares manual and automated aura dimensions, colors, transforms and
visibility against the actual player board, including disabled auras, hidden/fogged
owners, a lower-floor owner and reload. Canonical state remains unchanged during
preview. Regression suite: 718 tests/90 files passed, plus a new legacy hydration
check. Persistent zones and combat group colors remain before preview completion.

Remaining geometry defect found during this work: aura rendering filters owner
visibility but does not clip the aura footprint through floor cutouts. Persistent
zone overlays also need a floor-visibility review. Preview parity does not establish
correctness of those existing board behaviors; keep both in the floor roadmap.

### Aura footprint clipping through floors

Player auras previously became fully visible whenever their owner could be seen
through a floor opening. Their footprint now intersects the cutouts of every
intervening blocking floor, using the same visibility helper as templates and
explicit pixel bounds for transformed aura nodes. Owner visibility/fog filtering
still applies. Same-floor and GM overview rendering clear stale masks.

Browser QA verifies the exact 2 by 2 balcony opening, live-player/preview parity,
reload, and mask cleanup on reused nodes after floor/GM changes. A unit case covers
translated bounds, stacked openings and a closed intervening floor. Full suite:
720 tests across 91 files passed. This is display geometry only; range/effect
semantics and fractional cutout normalization remain separate roadmap concerns.

### Persistent-zone floor ownership and overlap

Persistent zones previously stored only coordinates, allowing overlap checks to
match creatures on unrelated floors. Registration now captures the selected area
floor in zone.levelId; both rectangular and wall area results supply that floor.
Legacy records without floor data resolve to level-0 rather than following a
caster who may have moved. Automation movement snapshots and zone-entry footprints
retain levelId. Occupancy and entry share one floor-aware geometry helper.

Wall-square overlap now tests rectangle intersection, including partial overlaps
from fractional token coordinates; merely touching edges does not count. Browser
QA exercises the registration hook, canonical save, player projection and GM
reload with an upper-floor zone owned by a base-floor caster. Unit tests cover
cross-floor exclusion and fractional wall overlap. Full suite: 722 tests/92 files
passed. The browser check did not exercise a damage tick or drag-triggered entry.
Zone rendering/preview, deleted-floor lifecycle and full trigger journeys remain.

### Persistent-zone display and player preview

The normal board and preview share persistent-zone-renderer.js. Player zones above
the viewer floor are omitted; lower-floor rectangles/wall tiles clip through each
blocking floor's cutouts. Wall labels anchor on the first visible tile. GM overview
remains unmasked. Passive preview uses private zone/caster identifiers and never
creates End controls. Text labels use textContent rather than interpolated HTML.

Isolated browser QA covers zone floor registration, upper-zone exclusion, floor
switch, lower wall clipping, first visible label, actual player/preview parity,
reload and unchanged canonical state during preview. The actual player's End
control was clicked and canonical removal verified. The preview screenshot was
inspected. Full suite: 722 tests/92 files passed. Combat group colors remain before
preview completion; zone deleted-floor lifecycle and full trigger journeys remain.

### Captured player-board preview complete

Preview state now includes projected combat data. Group colors reuse the normal
combat-group normalization and palette functions with independent maps, preserving
player projection when a representative is hidden. The UI now says Open player
preview and clearly describes the captured snapshot and explicit refresh.

The completed passive surface includes map/grid/floors/cutouts/fog, token geometry,
status overlays, group colors, drawings, circle/rectangle/wall templates, auras and
persistent zones. Its camera is local; it has no gameplay handlers or End controls.
Transient player selections, hover UI and in-progress gestures are not remote
streamed state. Connection diagnostics were completed in earlier milestones.

Fresh browser checks pass for endpoint authorization/identity, exact player
projection, refresh, map/fog isolation, group colors with a hidden representative,
all token/template layers, local camera, no preview commands and canonical reload
parity. Persistent-zone controls/parity were separately exercised in the prior
milestone; its test uses the renamed button. Full suite: 722 tests/92 files passed.
The broader roadmap remains active, including zone deletion/trigger recovery,
preparation tools, terrain and physical-height rules.

### Atomic zone cleanup when deleting floors

Floor deletion and levels.set removal now end zones on deleted floors regardless
of their caster's current floor. Zone cleanup merges with token relocation into
one placement mutation and one revision increment per affected owner, inside the
existing floor transaction. Surviving-floor and legacy base-floor zones remain.
Zone-only mutations do not manufacture or change linked player views. The delete
confirmation explicitly explains that floor zones end.

Server tests cover remote casters, legacy zones, combined relocation/cleanup,
unchanged linked views and idempotent retries. The GM/two-player browser journey
covers stairs, confirmed deletion, one command/revision, zone removal, retained
base-zone visibility, disconnected-player recovery and no new walking hooks.
A stronger recovery assertion exposed zones staying hidden when their first render
preceded image loading; the map-load callback now repaints them. Browser QA passed
after that fix. Full suite before the focused map-load fix: 722 tests/92 files
passed; the final browser journey verifies the added map-load path.

### Zone entry when a drag passes through the footprint

Zone onEnter previously checked only the movement endpoints, missing a long drag
that crossed the zone and ended outside. The geometry helper now tests the moving
footprint against each zone rectangle along the confirmed straight segment.
Positive overlap counts; tangent/corner-only contact, an already-inside start and
unrelated floors do not. Different-floor moves check destination entry without
inventing an intermediate floor path.

A real player drag through an isolated damaging zone now applies one canonical
stamina reduction and stops beyond the zone. The reverse crossing in the same
client/round does not repeat it. Unit tests cover crossings, direction reversal,
edge/corner contact, floor boundaries and existing occupants. Full suite: 724
tests/92 files passed. Per-round entry bookkeeping is still client-local: this
milestone does not establish reload-safe or multi-client deduplication. Canonical
entry claims/recovery remain the next reliability task.

### Trusted movement evidence for pending zone-entry claims

Accepted token.move walking events now capture server-owned source/destination
footprints and the canonical encounter/round boundary in zoneEntryReceipt. Walking
placement-batch actions capture zoneEntryReceipts; forced actions do not. The
stored operation retains this evidence through retries and database reopening.
Player event projection strips full receipts to avoid exposing hidden batch tokens.
Normal movement hooks carry the accepted movementOperationId and movementRevision.

Tests verify forged client evidence is ignored, floor/footprint evidence survives
retry/reopen, mixed batches exclude forced moves, and player responses omit receipt
metadata. Full suite: 724 tests/92 files passed. This is a prerequisite for the
claim authority, not a completed deduplication fix: server claims, effect receipts,
interrupted-effect recovery and client integration remain pending.

### Durable zone-entry claim authority

POST api/v2/zone-entries.php validates the accepted movement actor and trusted
receipt, current combat boundary, current token footprint and permissions, existing
visible floors, current zone and swept entry geometry. It never trusts a supplied
round or source footprint. A world-scoped SQLite ledger reserves one pending claim
per scene/zone/creature/boundary and retains the zone/receipt evidence. Retry or a
new client crossing in the same round cannot receive a second execution grant.
Reservations do not execute effects, modify token resources or advance board state.

Server tests cover database reopening, cross-client duplicate claims, new combat
boundaries, stale movement/round rejection, forced movement, missing zones, actor
validation and unchanged board state. The HTTP browser journey uses a real player
drag and checks wrong-actor rejection, pending status, repeat identity and no claim
side effects. Full suite: 725 tests/92 files passed. Client integration, completion
receipts and interrupted-effect recovery remain; gameplay still uses the previous
local entry path until that lifecycle is wired and verified.

### Zone-entry outcomes and recovery API

The claim endpoint now lists up to 200 oldest unresolved entries. Players receive
only their own claims; the GM can inspect all. Stored zone effects and accepted
movement evidence survive reload for review. Claimants or the GM can acknowledge
completed/needs_review outcomes; only the GM may dismiss. Repeated acknowledgements
are idempotent, and final outcomes cannot be reopened or grant execution again.
These acknowledgements do not prove effect execution, replay effects, change token
resources, or advance the board revision.

Server checks cover actor isolation, reload, uncertain outcomes, invalid requests,
GM dismissal, terminal-state protection and unchanged gameplay state. The isolated
GM/player HTTP browser journey verifies listing, review, completion and retries
after a real zone crossing. Full suite: 725 tests/92 files passed; the focused
16-test server suite also passed after the final acknowledgement adjustment.
Gameplay integration and the visible recovery panel remain pending. Until they
are wired, this is recovery infrastructure, not a reload-safe gameplay claim.

### Visible zone recovery and client execution coordinator

Scenes now includes a GM-only Zone entry recovery disclosure. It loads the oldest
unresolved records, shows saved effects/movement, and offers Mark resolved or
Dismiss without replay. Outcome failures keep the row available and ask the GM to
refresh before retrying. Text rendering treats stored names/evidence as text.

The client coordinator executes only after a fresh grant. Duplicate claims never
execute, and lost claim/completion/review responses never cause an automatic effect
retry. Five focused tests cover success, all duplicate statuses, partial execution,
lost responses and transport timeout. Full suite: 730 tests/93 files passed. The
isolated browser test reloads the GM, opens recovery, inspects recorded damage,
marks it resolved and verifies the queue clears without changing the board; players
have no recovery controls.

The gameplay hook is not yet connected. Inspection found that condition application
currently resolves its callback before canonical persistence completes. Fix and
verify that acknowledgement first, then wire claimed walking entries with strict
effect failure handling and test reload/concurrent-client deduplication. Forced
movement remains a separate receipt/integration requirement.

### Confirmed conditions and claimed walking entries

Condition automation now waits for its placement save before returning success;
rejected saves reject the callback and refresh the token display. The isolated
browser test holds a condition command to prove the callback stays pending,
releases it to prove acceptance, then rejects a second condition and verifies only
the accepted condition survives reload.

Normal walking entries now reserve by accepted movement operation before executing
damage/conditions. Unsupported effects are rejected before execution. Scene changes,
failed callbacks and 30-second acknowledgement timeouts leave the entry for review.
The coordinator never retries effects; accepted partial effects remain for the GM
to inspect. A dispatched effect may finish after a timeout, so review must check
actual resources and conditions.

The real player-drag test verifies completed-entry deduplication after reload,
damage followed by a rejected condition, the durable review record, GM resolution
without board mutation, and no replay after another player reload. Failure injection
matches normalized condition names case-insensitively and outcome polling reads the
HTTP API directly. Forced/swap receipt integration, simultaneous clients, new-round
behavior and other interruption variants remain on the roadmap.
Full regression suite: 730 tests/93 files passed with the integrated runtime.

### Player round boundaries and overlapping zone effects

Walking entry claims no longer consult the legacy enteredThisRound gate. That set
is reset by GM-only timing hooks and could suppress player entries in later rounds.
The server claim boundary now determines walking eligibility on every client;
the set remains only for the pending forced/swap path.

Granted effects for the same scene/creature execute sequentially within a client.
Reservations remain independent, failed effects do not poison the queue, and queue
entries are removed when finished. A competing GM/player drag test initially left
one overlapping zone in review after a save conflict; sequential execution passed
the same scenario with both effects applied exactly once.

The browser journey verifies two overlapping damaging zones, same-round reentry,
round two in the same player client without reload, and competing GM/player drags
in round three. This is a controlled concurrency case, not a proof of all network
failure permutations. Forced movement, queued-zone cancellation and additional
interruption cases remain pending.
Full regression suite: 731 tests/93 files passed, including the execution-order
and failed-queue recovery test.

### Queued effects respect ended or changed zones

Before each claimed effect dispatch, the runtime checks the latest projected zone
record. An ended zone, changed owner/floor, or changed effects/geometry/target filter
stops undispatched effects and leaves the claim for review. Fresh wrappers, local
entry caches and cosmetic label changes do not invalidate it.

The isolated browser test pauses the first of two overlapping zone effects, ends
the other zone through the GM's End control, waits for its removal on the player,
and releases the first effect. Only the surviving zone damages the creature; the
ended-zone claim remains visible after reload. Unit checks also cover changed
floors, owners, effects and geometry. This is a pre-dispatch check against received
state, not a transaction that cancels an already dispatched effect or eliminates
the network interval before another client's update arrives.
Full regression suite: 733 tests/94 files passed; the queued-zone cancellation
browser journey passed against the disposable fixture.

### Atomic, confirmed cross-floor swaps

The swap hook previously issued two independent saves and then read `.updated`
from boolean results, reporting failure after mutating tokens. It now requires
actual scene placements and submits one batch exchanging both columns/rows and
floor IDs. It awaits canonical acceptance before success and zone callbacks;
rejection refreshes the board and rejects the callback. Token sizes are preserved.

The isolated browser test holds the batch and verifies neither canonical token
has moved while the callback is pending. Acceptance produces exactly one revision
with both floors exchanged; a rejected reverse swap moves neither token. Reload
preserves the accepted result, and no normal walking hooks fire. Durable zone-entry
receipts for forced movement and swaps remain the next integration task.
Full regression suite: 733 tests/94 files passed, plus the held/rejected swap
browser journey.

### Forced movement, teleport and swap claims

Server-owned receipts now retain movementKind for walking, forced and teleport
commands/batches (never undo). Forced entry uses swept geometry; teleport/swap
checks destination only. The pickers and swap hook pass accepted operation IDs
into the same durable claim workflow. The picker also rejects scene changes.

Immediate reload testing exposed a pending sheet-stamina write restoring old HP.
Claimed zone damage now flushes and awaits that queued write before completion.
Dispatch is idempotent, ordered after existing in-flight writes, and old completions
cannot delete newer entries. Rejected writes, including HTTP-200 application errors,
leave needs_review rather than false completion.

Validation: 734 tests/94 files passed. Browser tests cover teleport crossing versus
arrival, forced crossing, immediate reload without replay or lost completed damage,
rejected sheet updates, atomic swaps, and character recovery/temporary stamina.
Board and sheet writes remain separate stores: interruption while pending, broader
sheet-authority reconciliation, enemy-movement permissions and multi-step automation
sequencing still need work.

### Movement callbacks wait for zone resolution

Forced movement, teleport and swap callbacks now await all their entry checks.
Completed/dismissed claims allow continuation; pending, uncertain or failed outcomes
reject with a message that the movement was saved and needs GM review. This prevents
a subsequent ability step from overtaking entry damage/condition/resource saves.
Accepted movement is preserved rather than rolled back when its effects need review.

The movement picker ignores repeat clicks during commit/effect resolution and
refuses a replacement picker until the active request settles. Canceling an already
committed request rejects its caller but retains the in-flight request until it
finishes, preventing a late completion from clearing a newer picker.

The browser test holds a zone effect, verifies the move is already canonical while
its callback stays pending, checks a second click submits nothing, then releases
it. Rejected stamina synchronization now rejects the movement callback. Atomic swap
regressions also pass. Full suite: 735 tests/94 files passed. Broader ability-level
resume/cancel behavior and authoritative board/sheet reconciliation remain pending.

### Shared fractional cutout normalization

Fractional cutout positions/dimensions were preserved by server geometry but truncated
by client normalization, map holes, effect clipping and editor copies. They now share
normalizeMapLevelCutout. It preserves finite fractions, legacy aliases and IDs while
retaining nonnegative coordinates and the existing one-square minimum dimensions.
Token look-down edge visibility expands every positively overlapped cell using
floor/ceil bounds, rather than dropping partial cells through integer truncation.

Tests compare a fractional opening through state normalization, map SVG and effect
mask geometry, and verify edge-cell token visibility. The actual player/GM-preview
browser journey saves an additional fractional hole and verifies its exact pixel
path on both surfaces, alongside existing token/aura/fog/drawing/reload parity and
no preview writes. Full suite: 737 tests/95 files passed. Broader physical height,
range and legacy cell-based fall-preview helpers remain separate geometry work.

### Fractional token footprints and stacked openings

Active client visibility no longer truncates token positions or dimensions. Partial
edge cells participate in look-down visibility and supplied-cell filtering. Strict
cross-floor visibility/interaction carries rectangle intersections through every
blocking floor, restricted to the actual occupied footprint. Openings elsewhere in
the same cell, or disjoint openings across floors, no longer admit interaction.
The existing expanded-cell look-down border remains a presentation policy.

Focused regressions cover fractional edge cells, overlapping stacked openings,
disjoint openings and holes outside the occupied part of a cell. Full suite: 739
tests/95 files passed; actual player and GM-preview browser parity/reload passed
on an isolated fixture. Physical height/range and broader resource reconciliation
remain pending. The legacy client fall processor is bypassed in current Sync V2.

### Bounded character-stamina confirmation

Character-stamina writes require an explicit success acknowledgment and have a
15-second deadline covering HTTP and JSON-body completion. Timeout aborts the
request and rejects confirmation without retrying an uncertain write. Claimed zone
effects therefore enter GM review instead of holding movement callbacks forever.
This does not make board/sheet writes atomic or prove that an aborted server write
did not commit; inspect both values before resolving an uncertain outcome.

The stamina endpoint now returns success: true alongside saved values. Tests cover
explicit failure, malformed acknowledgments, stalled requests and stalled JSON
bodies, including abort and no retry. The isolated forced-zone browser journey
can hold its sheet request with VTT_TEST_STALL_SHEET=1 and verifies accepted board
damage, rejected movement continuation, needs_review and exactly one sheet write.
Full suite: 742 tests/95 files passed. Authoritative reconciliation after reload
and ordinary failed-save recovery remain broader outstanding work.

### Actionable zone recovery reports

Zone claim outcome acknowledgments now retain reporting actor, server timestamp
and a bounded reason in private ledger evidence. The client sends up to 500
characters; the server validates string type and a 2000-byte maximum. The first
acknowledgment survives idempotent retries; original movement/effect evidence and
terminal-outcome restrictions remain intact. Recovery renders the report as text
and identifies its author, with a missing-details fallback for older/pending rows.
These are client reports, not server proof of which effects committed.

Server regressions verify reason validation and persistence across retry/reopen;
client tests verify the effect failure message reaches the acknowledgment. The
GM/player zone-entry browser test checks the original condition-failure report
after retry and GM reload, then resolves it through the recovery controls. Full
suite: 742 tests/95 files passed. The forced-zone script also gained report checks,
but its earlier held-effect setup intermittently timed out during this milestone;
that separate reproducibility issue remains to investigate.
General resource reconciliation and recovery of entire interrupted abilities remain
outstanding.

### Confirmed persistent-zone registration

The intermittent forced-zone failure was reproduced with diagnostics: teleport
reached the intended square but only the first of two registered zones survived
in canonical placement state. Registration returned success before persistence,
letting consecutive registrations race and lose one zone.

Persistent-zone registration reports registered: true only after its placement
save is acknowledged. Rejection calls the supplied reject callback, or returns
registered: false with save-unconfirmed for resolve-only callers. Sequential
registrations therefore read the previously accepted zone list instead of racing
optimistic arrays. Concurrent callers still use normal revision conflict handling;
there is no blind retry or alternate shared-state writer.

The forced-zone browser workflow now asserts both registrations are canonical
before movement and passes. A dedicated registration browser test holds a write,
verifies the callback remains pending, releases it, rejects a second write and
checks reload retains only accepted zones. Full suite: 742 tests/95 files passed.

### Batch matching zone expirations

All zones for one caster expiring at the same boundary are removed with one
combined placement patch, preserving nonmatching zones. Manual single-zone End
uses the same helper. Local zone bookkeeping is cleared only after accepted
persistence. The observed second transport request is a confirmed-conflict retry,
as established by the follow-up investigation below. Tick/expiration ordering
and interrupted boundary recovery remain separate work.

The isolated browser test starts an ally turn with two start-of-turn expiration
zones and one indefinite zone. Every expiration patch removes both matching IDs
together; the indefinite zone remains after reload. It records two identical
transport requests, so this does not establish exactly-once boundary delivery.
Full suite: 742 tests/95 files passed. A speculative no-op update change did not
remove the duplicate and was reverted; investigate queued dirty-state derivation
and boundary delivery next rather than treating the duplicate as resolved.

### Expiration transport investigation: one accepted write

Runtime-only call-stack instrumentation showed exactly one expiration-helper
invocation and no dirty-state fallback invocation. HTTP capture then established
that the two requests return 409 and 200: the first is rejected for a revision
conflict and the existing bounded retry succeeds. This supersedes the earlier
suggestion that a duplicate accepted expiration or no-op fallback was occurring.
No production runtime change was needed for that observation.

The browser regression now asserts one accepted expiration, at most one conflict,
no other response statuses, removal of both matching zones in every attempted
patch, preservation of the indefinite zone and correct state after reload. It
passes against a fresh uninstrumented fixture. This proves this controlled
expiration workflow, not general exactly-once turn automation or safe rebasing of
every placement field after concurrent edits; those broader requirements remain.

### Preserve same-field concurrent placement edits

Placement-batch conflict retries compare each edited field with its pre-submit
confirmed value. Retry is allowed only if the conflict snapshot retains that
value or already contains the desired value. Same-field concurrent changes reject
after applying the authoritative snapshot, preserving the other edit. Adds retry
only when the ID remains absent; removals require an unchanged entity revision.
The existing one-retry limit remains. This guard covers placement batches; walking
movement and other domain command policies remain separate.

The runtime regression contrasts a concurrent zone addition with an unrelated HP
change. A browser holds a new zone registration, accepts another zone-list edit,
then releases the stale request: registration rejects, no blind retry is sent,
and the other GM zone survives reload. The expiration browser still passes its
409-then-200 unrelated-change workflow. Full suite: 743 tests/95 files passed.
General semantic merging, interrupted action recovery and board/sheet authority
remain outstanding; this guard favors an explicit conflict over lost data.

### Order canonical zone turn stages

Canonical turn zone processing is ordered: at start, await owner expiration,
then owner ticks, then occupant triggers; at end, await owner ticks before
expiration. Failed expiration or a scene change stops subsequent zone stages and
reports that review is needed. This ordering does not serialize all other turn
automation, add durable boundary-effect outcomes, or change legacy tick handlers
that currently tolerate individual effect failures. Those remain limitations.

Unit tests hold each first stage to verify order and cover failed expiration and
scene changes. The browser holds the expiration command for two zones while a
third remains: no tick damage occurs while held, and after acknowledgment only
the retained zone damages its occupant. Full suite: 745 tests/96 files passed.
Durable tick/upkeep claims, whole-turn interruption recovery and legacy effect
failure propagation remain outstanding.

### Stop canonical zone stages after failed tick effects

Canonical owner ticks and occupant-turn-start effects now use strict effect
acknowledgments, active-zone checks and confirmed character-stamina synchronization.
Failures propagate to the ordered boundary stages instead of being swallowed. A
failed final tick prevents expiration and leaves the zone for review; failed
removal after unpaid upkeep also stops subsequent work. Already committed effects
are retained. Review is currently a status message: durable boundary-effect
recovery records and transactional upkeep still remain to implement.

A browser test applies final-tick damage then rejects the following condition
save. It verifies the review status, retained zone, matching saved character
stamina, and reload without replaying damage. The boundary unit test verifies
failed ticks never call expiration. Full suite: 746 tests/96 files passed.
This does not provide a durable GM recovery item for turn ticks or automatically
undo their partial effects; those remain part of the broader recovery roadmap.

### Confirmed narrow upkeep spending

The previous upkeep code saved a cached whole sheet using caster placement ID and
reported paid even when persistence failed. It now uses a server-side narrow spend.

Zone upkeep now calls sync-resource with spend and optional resourceName using
the linked character profile. Under the existing character-sheet write lock, the
server validates a positive integer cost (maximum 1000000), checks the current
resource name/balance and deducts only that field. Confirmed insufficient funds
return paid: false without writing; malformed/mismatched requests or failed saves
reject. The client requires an explicit paid result, bounds HTTP/body waiting to
15 seconds and never retries uncertain payment. Missing linked resources require
manual review; they no longer grant free upkeep. Failed payment preserves the
zone and stops its effects; only confirmed insufficient funds trigger removal.

Browser tests verify two cost-2 zones sharing a balance of 3: only one pays/ticks,
the unaffordable zone ends, and the balance becomes 1. Injected save rejection
leaves both zones, resource 3 and unchanged stamina, with no repeated write. Tests
also verify profile routing, absence of full-sheet payloads and reload outcomes.
Full suite: 748 tests/97 files passed. The fixture waits for its combat-start
resource automation before setting the balance. Other full-sheet automation writes,
durable payment receipts and interrupted-boundary recovery remain outstanding.

### Narrow conditional heroic-resource rule saves

Heroic-resource rule saves now use narrow sync-resource writes for GM, owner and
other authorized VTT users. Rule writes include expectedValue; under the existing
write lock the server rejects a stale balance before mutation. Successful resource
saves alone mark applied resource-rule limits and announce success. Failed saves
invalidate the cached sheet and ask for review. Resource-only refund routing also
uses the narrow endpoint, though its separate read/modify/refund lifecycle still
needs stronger concurrency and interruption guarantees. Recovery full-sheet saves
and damage-rule limit behavior are unchanged by this milestone.

An isolated browser holds actual combat-start resource automation, changes sheet
stamina through another request, then releases the resource save. Stamina remains
unchanged by that save. Direct endpoint checks reject a stale expected balance and
accept a matching one. Full suite: 748 tests/97 files passed. This closes the
whole-sheet overwrite path for resource rules; generalized resource operation
receipts, bounded confirmation for all rule writes, refunds and full recovery
authority remain outstanding.

### Bound all narrow resource confirmations

Ordinary heroic-resource rule writes and zone upkeep share confirmResourceWrite.
Its 15-second deadline includes body parsing, aborts stalled requests and rejects
without retry; only explicit successful acknowledgments allow cache/broadcast
updates. Resource rules report an unconfirmed save and do not mark applied limits
after timeout. Abort does not establish whether a server write committed, so
manual review remains necessary; durable operation receipts are still pending.

Tests cover missing/failed acknowledgments, conditional zero values and a stalled
JSON body with late success. The browser holds actual combat-start resource
automation and verifies its review status, single request and unchanged server
balance. Full suite: 750 tests/98 files passed. Durable resource outcome records
and interrupted action recovery remain outstanding.
