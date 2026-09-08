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
- [ ] Exact rejection feedback and pending/accepted state.

## Coherent geometry and player association

- [ ] Shared floor/elevation/adjacency model used by suggestions, range, auras, and movement.
  - Shared floor participation now guards flanking, aura membership, Stand Firm, and opportunity-attack adjacency. High Ground requires confirmation. Physical elevation, openings, and range integration remain pending.
- [ ] Hidden/deleted floors, partial support, flight, forced movement, stairs interrupted by reload, and undo tests.
- [ ] Explicit view-versus-token controls and follow/browse/center policy.
- [ ] Configurable roster and primary token association, preserving shared allied control.

## Faster live play

- [x] Token library and saved scenes first; creation forms collapsed.
- [ ] Compact inactive tracker and combat character card.
- [ ] Zoom/fit/center/shortcuts and persistent tool labels.
  - Visible zoom, Fit Map, Center Selected, and a shortcut guide are implemented and browser-tested. Persistent active-tool labels remain pending.
- [ ] Opaque readable panels, practical targets, diagnostics-only memory counter.

## Recovery and preparation

- [ ] Specific-player preview and useful connection status.
- [ ] Named encounter checkpoints, scoped restore, scene duplication/export.
- [ ] Encounter presets, favorites and recent assets.
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

Validation: 678 tests passed across 77 files. Expanded PHP checks then passed for
forged/cloned receipts and changed floor geometry. Three-browser floor QA includes
Undo move after reload (restoring a fall) and Ctrl+Z (restoring the previous stair
entry and linked view). No live gameplay writes or deployment were performed.
