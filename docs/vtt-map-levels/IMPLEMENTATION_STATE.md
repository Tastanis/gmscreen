# VTT Map Levels Implementation State

This file is the handoff tracker for building a reliable multi-level map system in
`dnd/vtt`. Update it after every implementation step so the next LLM or developer
knows what changed, what remains, and what has been tested.

## Current Status

- Status: GM board-header map level navigation implemented after Phase 6B.
- Last updated: 2026-04-26.
- VTT grid state now supports both square size and calibrated origin offsets.
- GM scene controls now include an Align Grid action that captures two opposite corners
  of a known map square and calculates grid size plus `offsetX` / `offsetY`.
- Scene grid changes persist through the scene storage API as well as board scene state.
- Scene board state supports a `mapLevels` model for multi-level map data.
- A dedicated map level renderer now mounts a separate level stack between the base map
  and the old overlay stack.
- The renderer displays visible persisted map levels with `mapUrl`, `opacity`, and
  `zIndex`, while keeping pointer events disabled so tokens remain clickable.
- GM scene manager controls now support adding map levels, uploading level images,
  renaming, deleting, toggling visibility, changing opacity, raising/lowering z-index
  order, and selecting the active level.
- GM scene manager controls now expose a Cutouts action for the active visible map
  level on the active scene.
- GM board editing now supports grid-square rectangle selection for the active map
  level only, with Remove, Undo, Reset, and Apply controls.
- The map level renderer now applies saved cutout rectangles as data-driven SVG masks
  so removed squares visually reveal lower map levels.
- Token placements now preserve a `levelId` field.
- New dropped tokens are assigned to the active scene map level when one exists.
- GM token settings now show manual level up/down controls when the active scene has
  map levels, moving the token between z-index ordered levels through the normal
  placement update sync path.
- GM board header now shows simple map level down/up navigation near the active scene
  name when the active scene has map levels.
- GM board-header level navigation updates scene-scoped `mapLevels.activeLevelId` through
  the existing board-state save/sync path.
- Rendered token DOM now carries the resolved map level id used by level-aware filtering
  and hit testing.
- Non-GM token and aura rendering now filters placements to the active visible map level
  when map levels exist, while legacy no-level scenes keep their previous behavior.
- Non-GM direct token settings opening is guarded against hidden tokens and tokens outside
  the active visible map level.
- Non-GM lower-level token and aura rendering now allows lower tokens only where every
  blocking higher level between the token and active level is cut out or transparent.
- Partially exposed lower-level tokens get a per-token SVG mask so only exposed grid cells
  render above the active map level.
- Non-GM token hit testing, right-click settings, triggered-action clicks, and marquee
  selection now reject lower-token interaction through solid higher-level cells.
- Map level controls save through scene-scoped `sceneState[sceneId].mapLevels`; no
  top-level `mapLevels` field is introduced.
- Old overlay system is still active.
- Player-specific level navigation, automatic transitions, and overlay replacement work
  have not started.
- Tests run for the latest phase:
  - Browser verification was attempted but blocked because no PHP server was reachable
    on `localhost:8000`, `localhost:8080`, or `localhost:3000`; `php` is unavailable on
    PATH; and the in-app browser Node REPL requires Node >= 22.22 while this environment
    resolves Node 22.20.
  - `node dnd/vtt/assets/js/ui/__tests__/token-levels.test.mjs` - passing, 12 tests.
  - `node --check dnd/vtt/assets/js/ui/token-levels.js` - passing.
  - `node --check dnd/vtt/assets/js/ui/board-interactions.js` - passing.
  - `npm.cmd test` - passing, 382 tests after Phase 6C.
  - `git diff --check` - passing.
  - PHP linting was not run because `php` remains unavailable on PATH.
- User decisions captured:
  - Cutouts should work square-by-square, similar to fog editing, but they remove/hide
    parts of only the currently edited map level.
  - Cutouts can be destructive for rendering/export purposes, as long as the final visible
    level piece can still be toggled on and off.
  - Use "layer" for the general visual stack such as map, grid, fog, tokens, and tools.
  - Use "level" for building floors or vertical map levels.
  - Tokens should know which map level they are on.
  - Players should see the level their token is on, plus lower levels through transparent
    or cut-out spaces.
  - Solid remaining parts of an upper level should block clicking tokens below them.
  - Cut-out or transparent parts should allow clicking through to tokens below.
  - Levels should share the base map grid by default.
  - Automatic transitions should be deferred; early testing can use manual GM controls.
  - Players are not tied to one token yet and can currently move any token, so early
    visibility/click behavior should focus on what is visually accessible on the board.
  - Hidden tokens remain hidden always, even if their square is visible through a cutout.
  - A non-hidden token under an uncut upper level should not be visible/clickable. If the
    covering upper square is removed, the token below can be visible/clickable.
  - Limit the first implementation to a maximum of 5 map levels unless performance testing
    proves a different limit is needed.
  - GM level navigation should start simple: add up/down controls for viewing levels.
  - GM level navigation controls should live in the board header near the scene name.
  - Level management should live in the scene editor where old overlay controls are removed.
  - Level display names can be simple for now: Level 1, Level 2, Level 3, etc.
  - Players should not have level up/down controls in the first version.
  - GM token level controls should start simple: right-click token menu, GM-only up/down
    buttons to move a token between levels.
  - Level cutout editing is not a normal play-mode action; it should be a separate edit mode.
  - Cutouts should be rectangle/square selection based. GM selects an area, then clicks remove.
  - Cutout edit mode should have undo before finalizing. Once editing is finished/applied,
    the cut area can be permanently removed/cached for rendering purposes.
  - Undo is only required while the cutout editor is open. After Apply, the cutout becomes
    the saved state; later edits can remove more, but do not need to restore old removed
    squares unless a future history/restore system is built.

## Existing Code Areas

- Board markup: `dnd/vtt/components/SceneBoard.php`
- Main board behavior: `dnd/vtt/assets/js/ui/board-interactions.js`
- Map level renderer: `dnd/vtt/assets/js/ui/map-level-renderer.js`
- Scene manager and overlay controls: `dnd/vtt/assets/js/ui/scene-manager.js`
- Settings panel grid controls: `dnd/vtt/assets/js/ui/settings-panel.js`
- Client state normalization: `dnd/vtt/assets/js/state/normalize/`
- Client board save formatting: `dnd/vtt/assets/js/services/board-state-service.js`
- Server board persistence and sync: `dnd/vtt/api/state.php`
- Scene storage API: `dnd/vtt/api/scenes.php`
- Board CSS: `dnd/vtt/assets/css/board.css`

## Completed Phase 1: Grid Alignment Foundation

Date completed: 2026-04-25.

Changed files:

- `dnd/vtt/api/scenes.php`
- `dnd/vtt/api/state.php`
- `dnd/vtt/assets/css/board.css`
- `dnd/vtt/assets/js/services/board-state-service.js`
- `dnd/vtt/assets/js/services/scene-service.js`
- `dnd/vtt/assets/js/state/normalize/grid.js`
- `dnd/vtt/assets/js/state/store.js`
- `dnd/vtt/assets/js/state/__tests__/grid-normalization.test.mjs`
- `dnd/vtt/assets/js/ui/board-interactions.js`
- `dnd/vtt/assets/js/ui/scene-manager.js`
- `dnd/vtt/assets/js/ui/settings-panel.js`
- `dnd/vtt/components/SettingsPanel.php`
- `dnd/data/version.json`
- `docs/vtt-map-levels/IMPLEMENTATION_STATE.md`

Implementation notes:

- Grid state shape is now `{ size, locked, visible, offsetX, offsetY }`.
- Grid size and offsets are normalized on the client and server; fractional pixel values
  are preserved to two decimals.
- Offsets are canonicalized into the current square size, so selecting any known square
  stores the repeating grid origin rather than that square's absolute map position.
- Existing map padding remains separate from calibrated grid origin. Tokens, templates,
  fog, drawings, grid rendering, and overlay mask coordinates use the effective calibrated
  grid origin.
- Overlay image positioning remains inset to the map image rather than being shifted by
  the calibrated grid origin.
- Scene grid updates use a new `update-scene-grid` scene API action. After the scene grid
  save succeeds, board state is saved again so polling clients can fetch the updated
  scene definition; Pusher still does not directly apply grid updates.

Remaining notes:

- Manual GM browser verification is still needed: upload or activate a map, click
  Align Grid, select two opposite corners of one map square, save/refresh, and confirm
  the grid remains aligned.
- Multi-client verification is still needed to confirm another browser picks up the
  updated scene grid after the post-save board-state bump.
- PHP syntax linting should be run in an environment with PHP available.

## Completed Phase 2: Map Level State Model

Date completed: 2026-04-25.

Changed files:

- `dnd/vtt/api/state.php`
- `dnd/vtt/assets/js/services/board-state-service.js`
- `dnd/vtt/assets/js/services/__tests__/board-state-map-levels.test.mjs`
- `dnd/vtt/assets/js/state/normalize/index.js`
- `dnd/vtt/assets/js/state/normalize/map-levels.js`
- `dnd/vtt/assets/js/state/normalize/scene-board-state.js`
- `dnd/vtt/assets/js/state/__tests__/map-levels-normalization.test.mjs`
- `dnd/vtt/assets/js/ui/board-interactions.js`
- `dnd/vtt/assets/js/ui/scene-manager.js`
- `dnd/data/version.json`
- `docs/vtt-map-levels/IMPLEMENTATION_STATE.md`

Implementation notes:

- Scene board state entries now normalize `mapLevels` as
  `{ levels: [], activeLevelId: null }`.
- Map level entries normalize `id`, `name`, `mapUrl`, `visible`, `opacity`, `zIndex`,
  `grid`, `cutouts`, `blocksLowerLevelInteraction`, `blocksLowerLevelVision`, and
  `defaultForPlayers`.
- The first implementation cap of 5 map levels is enforced by client and server
  normalization.
- A level `grid` of `null` means it inherits the scene grid. Explicit level grid data is
  normalized with the scene grid as fallback.
- Cutouts are stored as rectangle cell data: `{ column, row, width, height }`, with an
  optional `id`.
- Board state persistence serializes `mapLevels` only under each scene's `sceneState`
  entry, not as a top-level board state field.
- Pusher full scene-state updates apply `mapLevels` when present. Polling already carries
  it through the existing scene-state merge path.
- Server update normalization does not inject an empty `mapLevels` field when a partial
  scene-state update omits it, so old overlay/combat-only updates do not wipe level data.

Tests run for this phase:

- `npm.cmd test` - passing, 358 tests.
- `git diff --check` - passing.
- `php -l dnd/vtt/api/state.php` was attempted, but `php` is not available on PATH in
  this workspace.

Remaining notes:

- PHP syntax linting should be run in an environment with PHP available.
- Manual level sync/refresh checks remain for the future controls phase, because Phase 2
  only adds the persisted state model and does not expose level UI yet.

## Completed Phase 3: Renderer Extraction

Date completed: 2026-04-25.

Changed files:

- `dnd/vtt/assets/css/board.css`
- `dnd/vtt/assets/js/ui/board-interactions.js`
- `dnd/vtt/assets/js/ui/map-level-renderer.js`
- `dnd/vtt/assets/js/ui/__tests__/map-level-renderer.test.mjs`
- `dnd/data/version.json`
- `docs/vtt-map-levels/IMPLEMENTATION_STATE.md`

Implementation notes:

- Added a standalone `createMapLevelRenderer()` module for rendering persisted map levels.
- The renderer creates `#vtt-map-levels` with an inner stack and inserts it before
  `#vtt-map-overlay`, so old overlays still render above map levels.
- The level stack uses the same map-image inset variables as the old overlay stack and is
  kept above the base map but below grid, templates, drawings, tokens, fog, and pings.
- Rendered level entries use normalized `mapLevels` data, skip hidden or URL-less levels,
  sort by `zIndex`, apply `opacity`, and preserve cutout counts as DOM metadata for later
  cutout work.
- Pointer events are disabled on the level stack and each rendered level by default.
- `board-interactions.js` now syncs active scene `mapLevels` during state application and
  after map image load, resets the renderer during map reloads, and keeps level insets in
  sync with map padding.
- This phase intentionally did not add GM controls, upload/management UI, cutout editing,
  token `levelId`, click blocking, or old overlay replacement.

Tests run for this phase:

- `node --test dnd/vtt/assets/js/ui/__tests__/map-level-renderer.test.mjs` - passing,
  5 tests.
- `npm.cmd test` - passing, 363 tests.
- `git diff --check` - passing.
- PHP linting was not run because no PHP files changed; `php` remains unavailable on PATH
  in this workspace.

Remaining notes:

- Manual browser verification is still needed with persisted `mapLevels` data to confirm
  level images visually stack above the base map and below old overlays.
- Phase 4 now creates and updates persisted map levels; Phase 3 itself only rendered
  data that already existed in scene board state.
- Cutouts are still data-only for now. Visual cutout masking and click-through behavior
  remain part of the cutout editor phase.

## Completed Phase 4: GM Controls

Date completed: 2026-04-25.

Changed files:

- `dnd/vtt/assets/css/settings.css`
- `dnd/vtt/assets/js/ui/scene-manager.js`
- `dnd/vtt/assets/js/ui/__tests__/scene-manager-map-levels.test.mjs`
- `dnd/data/version.json`
- `docs/vtt-map-levels/IMPLEMENTATION_STATE.md`

Implementation notes:

- Added a dedicated Map Levels section to each scene item in the GM scene manager.
- The controls support adding up to the existing 5-level cap, uploading/replacing a
  level image through the existing uploads endpoint, renaming, deleting, show/hide,
  opacity, raise/lower ordering, and active level selection.
- Level ordering is normalized back into `zIndex` values so the renderer's persisted
  z-index ordering remains the source of truth.
- Level updates persist only under `sceneState[sceneId].mapLevels`; the old top-level
  overlay mirror remains untouched.
- The old overlay controls remain in the scene manager and continue to use their
  existing upload/edit/visibility flow.
- Added dependency-free scene-manager tests around map level markup and state helpers.

Tests run for this phase:

- `node dnd/vtt/assets/js/ui/__tests__/scene-manager-map-levels.test.mjs` - passing,
  3 tests.
- `node --test dnd/vtt/assets/js/ui/__tests__/map-level-renderer.test.mjs` - passing,
  5 tests.
- `node --check dnd/vtt/assets/js/ui/scene-manager.js` - passing.
- `npm.cmd test` - passing, 366 tests.
- `git diff --check` - passing.
- PHP linting was not run because no PHP files changed and `php` is unavailable on PATH.

Remaining notes:

- Manual browser verification is still needed: add two map levels, upload images, adjust
  opacity/order/visibility, refresh, and confirm the scene-scoped level state persists.
- Manual multi-client verification is still needed to confirm level changes propagate
  through the existing board-state sync path.
- Token level support, click blocking, automatic transitions, and old overlay removal
  remained future phases after Phase 4.

## Completed Phase 5: Cutout Editor

Date completed: 2026-04-25.

Changed files:

- `dnd/vtt/assets/css/board.css`
- `dnd/vtt/assets/js/ui/board-interactions.js`
- `dnd/vtt/assets/js/ui/map-level-renderer.js`
- `dnd/vtt/assets/js/ui/scene-manager.js`
- `dnd/vtt/assets/js/ui/__tests__/map-level-renderer.test.mjs`
- `dnd/vtt/assets/js/ui/__tests__/scene-manager-map-levels.test.mjs`
- `dnd/data/version.json`
- `docs/vtt-map-levels/IMPLEMENTATION_STATE.md`

Implementation notes:

- Added a Cutouts button to active-scene map level controls. It is enabled only for the
  active visible map level with an uploaded map image.
- Added a GM-only map level cutout edit mode on the board. The GM drags a rectangle over
  grid cells, clicks Remove to stage the cutout, can Undo staged removals while the editor
  remains open, and clicks Apply to persist the draft.
- Reset reverts the open editor draft to the last saved cutouts. Closing the editor without
  applying discards unapplied draft cutouts.
- Cutouts persist as rectangle cell data under the active level's
  `sceneState[sceneId].mapLevels.levels[].cutouts` array.
- The renderer converts saved cutout rectangles into SVG mask data URLs using the calibrated
  shared grid origin and current map insets, so removed squares visually reveal lower map
  levels.
- Normal play-mode pointer behavior is unchanged: the map level stack still has pointer
  events disabled unless the GM cutout editor is actively open.
- Old overlay editing/rendering remains active and separate. Opening one edit mode closes
  the other to avoid competing board pointer handlers.
- Token `levelId`, lower-level click blocking, automatic transitions, and old overlay
  replacement remain deferred.

Tests run for this phase:

- `node dnd/vtt/assets/js/ui/__tests__/scene-manager-map-levels.test.mjs` - passing,
  3 tests.
- `node --test dnd/vtt/assets/js/ui/__tests__/map-level-renderer.test.mjs` - passing,
  6 tests.
- `node --check dnd/vtt/assets/js/ui/map-level-renderer.js` - passing.
- `node --check dnd/vtt/assets/js/ui/scene-manager.js` - passing.
- `node --check dnd/vtt/assets/js/ui/board-interactions.js` - passing.
- `npm.cmd test` - passing, 367 tests.
- `git diff --check` - passing.
- PHP linting was not run because no PHP files changed and `php` is unavailable on PATH.

Remaining notes:

- Manual browser verification is still needed: add at least two map levels, select the upper
  visible level, drag a rectangle in Cutouts mode, Remove, Undo, Remove again, Apply, refresh,
  and confirm the cutout persists and lower levels show through.
- Manual multi-client verification is still needed to confirm applied cutouts propagate
  through the existing board-state sync path.
- Normal-play click-through and token visibility by level remain future work, so tokens are
  not yet filtered or click-blocked by cutouts.

## Completed Phase 6: Token Level Support

Date completed: 2026-04-26.

Changed files:

- `dnd/vtt/assets/css/board.css`
- `dnd/vtt/assets/js/state/normalize/placements.js`
- `dnd/vtt/assets/js/state/__tests__/placement-normalization.test.mjs`
- `dnd/vtt/assets/js/ui/board-interactions.js`
- `dnd/vtt/assets/js/ui/token-levels.js`
- `dnd/vtt/assets/js/ui/__tests__/token-levels.test.mjs`
- `dnd/data/version.json`
- `docs/vtt-map-levels/IMPLEMENTATION_STATE.md`

Implementation notes:

- Placement normalization preserves non-empty `levelId` values and accepts legacy
  aliases such as `mapLevelId`, while old placements without a level remain compatible.
- New token drops assign `levelId` from the active scene map level when any map levels
  exist.
- GM token settings now include a level row with up/down controls. Buttons are shown
  only for GMs and only when the active scene has map levels.
- Token level movement uses z-index ordered map levels and persists as a normal
  `placement.update` operation, so it reuses existing board-state sync.
- Rendered tokens now include `data-map-level-id` based on the explicit token level or
  the scene's active/default level fallback.
- Non-GM token and aura rendering now includes only tokens on the active visible map level
  when map levels exist; old scenes without map levels continue to render normally.
- The existing rendered-placement hit test now receives only player-visible level tokens,
  and direct non-GM token settings opening is blocked for hidden/off-level tokens.
- This phase intentionally does not add player level navigation, lower-level cutout
  click-through behavior, automatic transitions, or old overlay removal.

Tests run for this phase:

- `node dnd/vtt/assets/js/ui/__tests__/token-levels.test.mjs` - passing, 7 tests.
- `node dnd/vtt/assets/js/state/__tests__/placement-normalization.test.mjs` - passing,
  5 tests.
- `node dnd/vtt/assets/js/ui/__tests__/map-level-renderer.test.mjs` - passing, 6 tests.
- `node dnd/vtt/assets/js/ui/__tests__/scene-manager-map-levels.test.mjs` - passing,
  3 tests.
- `node --check dnd/vtt/assets/js/ui/token-levels.js` - passing.
- `node --check dnd/vtt/assets/js/ui/board-interactions.js` - passing.
- `node --check dnd/vtt/assets/js/state/normalize/placements.js` - passing.
- `node --check dnd/vtt/assets/js/ui/map-level-renderer.js` - passing.
- `node --check dnd/vtt/assets/js/ui/scene-manager.js` - passing.
- `npm.cmd test` - passing, 377 tests.
- `git diff --check` - passing.
- `node --test ...` for the new focused tests was attempted first, but the Windows
  sandbox blocked the Node test runner child process with `spawn EPERM`; the same test
  files pass when executed directly with `node`.
- PHP linting was not run because no PHP files changed and `php` remains unavailable
  on PATH.

Remaining notes:

- Manual browser verification is still needed: create at least two map levels, select
  each as active, drop tokens, right-click a token as GM, move it up/down, refresh, and
  confirm `levelId` persists.
- Manual multi-client verification is still needed to confirm level movement propagates
  through the existing placement update sync path.
- Basic active-level player filtering is complete; cutout-aware lower-level visibility and
  click-through behavior was completed in the follow-up Phase 6B.

## Completed Phase 6B: Cutout-Aware Lower-Level Tokens

Date completed: 2026-04-26.

Changed files:

- `dnd/vtt/assets/js/ui/board-interactions.js`
- `dnd/vtt/assets/js/ui/token-interactions.js`
- `dnd/vtt/assets/js/ui/token-levels.js`
- `dnd/vtt/assets/js/ui/__tests__/token-levels.test.mjs`
- `dnd/data/version.json`
- `docs/vtt-map-levels/IMPLEMENTATION_STATE.md`

Implementation notes:

- Non-GM token visibility now includes the active visible level plus lower-level tokens
  whose occupied grid cells are open through all blocking higher levels up to the active
  level.
- A higher level blocks lower-token vision or interaction only when it is visible, has a
  map image, has opacity above zero, and its relevant block flag is enabled. Saved cutout
  rectangles make matching cells transparent for lower-token visibility and click-through.
- Multi-cell lower tokens can be partially visible. The token DOM gets a generated SVG
  mask for the exposed cells so solid upper squares do not show the covered parts.
- Non-GM token hit testing now checks the clicked grid cell against interaction cutouts
  before selecting, dragging, opening settings, applying damage/healing, or toggling
  triggered-action buttons.
- Drag-marquee selection respects exposed lower-token cells instead of selecting a lower
  token through a solid upper square.
- Token render z-index now includes map-level order so higher-level tokens stack above
  lower-level tokens while keeping existing token stack order within each level.
- Old overlays remain active, and no automatic level transitions were added.

Tests run for this phase:

- `node dnd/vtt/assets/js/ui/__tests__/token-levels.test.mjs` - passing, 11 tests.
- `node dnd/vtt/assets/js/state/__tests__/placement-normalization.test.mjs` - passing,
  5 tests.
- `node dnd/vtt/assets/js/ui/__tests__/map-level-renderer.test.mjs` - passing, 6 tests.
- `node dnd/vtt/assets/js/ui/__tests__/scene-manager-map-levels.test.mjs` - passing,
  3 tests.
- `node --check dnd/vtt/assets/js/ui/token-levels.js` - passing.
- `node --check dnd/vtt/assets/js/ui/board-interactions.js` - passing.
- `node --check dnd/vtt/assets/js/ui/token-interactions.js` - passing.
- `node --check dnd/vtt/assets/js/state/normalize/placements.js` - passing.
- `node --check dnd/vtt/assets/js/ui/map-level-renderer.js` - passing.
- `node --check dnd/vtt/assets/js/ui/scene-manager.js` - passing.
- `npm.cmd test` - passing, 381 tests.
- `git diff --check` - passing.
- PHP linting was not run because no PHP files changed and `php` remains unavailable
  on PATH.

Remaining notes:

- Manual browser verification is still needed: with two or more visible map levels, add
  a cutout on the upper level, place a token below it, and confirm the player view sees
  and clicks that token only through the cutout.
- Manual multi-client verification is still needed to confirm cutout edits and token
  level changes combine correctly through the existing board-state sync path.

## Completed Phase 6C: GM Board-Header Level Navigation

Date completed: 2026-04-26.

Changed files:

- `dnd/vtt/components/SceneBoard.php`
- `dnd/vtt/assets/css/board.css`
- `dnd/vtt/assets/js/ui/board-interactions.js`
- `dnd/vtt/assets/js/ui/token-levels.js`
- `dnd/vtt/assets/js/ui/__tests__/token-levels.test.mjs`
- `dnd/data/version.json`
- `docs/vtt-map-levels/IMPLEMENTATION_STATE.md`

Implementation notes:

- Added GM-only map level down/up controls in the board header next to the active scene
  name. The controls are hidden unless the active scene has map levels.
- The board-header controls display the active map level name, disable at the bottom/top
  of the z-index ordered level stack, and update the scene-scoped
  `sceneState[sceneId].mapLevels.activeLevelId`.
- Header navigation persists through the existing scene-state dirty tracking and
  board-state save path. It does not remove old overlays and does not create automatic
  transition zones.
- Added a pure helper for active map level navigation control state, covered by the
  token-level helper tests.

Tests run for this phase:

- `node --check dnd/vtt/assets/js/ui/token-levels.js` - passing.
- `node --check dnd/vtt/assets/js/ui/board-interactions.js` - passing.
- `node dnd/vtt/assets/js/ui/__tests__/token-levels.test.mjs` - passing, 12 tests.
- `npm.cmd test` - passing, 382 tests.
- `git diff --check` - passing.
- PHP linting was not run because `php` remains unavailable on PATH.

Remaining notes:

- Manual browser verification is still blocked in this environment: no PHP server was
  reachable on `localhost:8000`, `localhost:8080`, or `localhost:3000`; `php` is
  unavailable on PATH; and the in-app browser Node REPL requires Node >= 22.22 while this
  environment resolves Node 22.20.
- Once a browser/server is available, verify that GM header level navigation changes the
  active level, refreshes/persists `activeLevelId`, and combines correctly with cutout
  lower-token visibility/click-through.
- Player-specific level navigation and Phase 7 transition zones have not started.

## Main Findings

- The current overlay is an image-mask feature, not a true map-level system.
- Overlay rendering, upload, masking, editing, sync, and scene-list controls are split
  across several places, with a large editor still embedded in `board-interactions.js`.
- Grid state currently stores size, locked, and visible only. It does not persist a real
  grid origin offset, so a map can be scaled correctly but still fail to line up.
- The board already has state normalization, Pusher sync, HTTP polling fallback, and
  tests, so a new system should plug into those instead of creating a separate sync path.
- The map backdrop uses large CSS padding; grid, token, template, and overlay coordinates
  are mostly calculated inside the padded inner map area.

## Recommended Direction

Build a new `mapLevels` system instead of extending the old `overlay` object.

Each level should be a layer with:

- `id`
- `name`
- `mapUrl`
- `visible`
- `opacity`
- `zIndex`
- `grid`
- `cutouts`
- `blocksLowerLevelInteraction`
- `blocksLowerLevelVision`
- `defaultForPlayers`

Tokens should eventually gain:

- `levelId`
- optional movement transition metadata for stairs, ladders, portals, and trapdoors.

The old overlay system should remain temporarily for migration, then be removed once
map levels cover upload, visibility, cutouts, and sync.

Terminology:

- Layer: any visual or interaction layer in the board stack, such as map image, map levels,
  grid, fog, tokens, templates, drawings, and pings.
- Level: a vertical part of a map, such as basement, ground floor, second floor, roof, or
  balcony.

Cutout direction:

- Prefer a grid-square editor for the first version.
- The GM edits one level at a time.
- Marked squares are removed from that level's visible/interacting area.
- The first editor should use rectangle selection: drag/select an area, then click Remove.
- Undo should be available during the edit session.
- Removed squares reveal lower levels and allow pointer interaction through to lower tokens.
- Remaining visible squares of an upper level block pointer interaction with lower tokens.
- The stored source should remain data-based so edits can be synced and tested, even if the
  renderer later generates a destructive/cached image mask for performance.

## Proposed Phases

1. Grid alignment foundation
   - Add grid origin fields such as `offsetX` and `offsetY`.
   - Add a calibration tool where the GM clicks two corners of a known square.
   - Calculate both grid size and origin from those clicks.
   - Persist the result with the scene grid.

2. Map level state model
   - Add `mapLevels` to scene board state normalization on client and server.
   - Keep it scene-specific, not only top-level board state.
   - Add tests for normalization and persistence.

3. Renderer extraction
   - Create a separate map level renderer module.
   - Replace the single overlay stack with a dedicated level stack.
   - Keep pointer events disabled by default so tokens remain clickable.

4. GM controls
   - Add level list controls in the scene manager.
   - Support upload, rename, reorder, show/hide, opacity, and active edit level.

5. Cutout editor
   - Replace the current node-only overlay editor with a square-based editor for level
     cutouts.
   - Store removed squares as data, not only as generated PNGs.
   - Support rectangle select, remove, undo, preview, and apply.
   - Make the rendered visible area block clicks, and the removed area pass clicks through.

6. Token level support
   - Add `levelId` to token placements.
   - Filter visible/interactable tokens by viewer level when needed.
   - Add GM-only right-click controls for moving tokens up/down between levels.

7. Level transitions
   - Do not build automatic transition zones in the first version.
   - Keep token `levelId` and level state flexible enough that stairs, ladders, trapdoors,
     and portals can be added later.

8. Remove old overlay system
   - Migrate existing overlay data where possible.
   - Delete unused overlay UI, normalizers, and rendering helpers.
   - Keep compatibility only if real saved data still needs it.

## Open Decisions

- Should existing old overlay data be migrated to a new level, or is it safe to delete old
  overlays once the new system exists?
- Should stored level indexes be zero-based internally while labels are one-based, or should
  stored data also use one-based level numbers?

## Testing Checklist

- `npm test`
- Manual GM browser test: upload base map, calibrate grid, save scene, refresh, grid persists.
- Manual multi-client test: GM toggles a level; player browser updates.
- Manual refresh test: visible levels and cutouts persist after hard refresh.
- Manual click-through test: tokens remain draggable/clickable when a level is visible.
- Manual cutout test: create, edit, delete, refresh, and sync a cutout.
- Manual performance test: at least two large map images visible without severe lag.

## Update Rules

- Update `Current Status` after each work session.
- Mark completed phases with date, changed files, and tests run.
- Add new gotchas when discovered.
- Do not remove old notes until the old overlay system is actually deleted.
