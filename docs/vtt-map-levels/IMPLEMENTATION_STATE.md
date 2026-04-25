# VTT Map Levels Implementation State

This file is the handoff tracker for building a reliable multi-level map system in
`dnd/vtt`. Update it after every implementation step so the next LLM or developer
knows what changed, what remains, and what has been tested.

## Current Status

- Status: Phase 1 grid alignment foundation implemented.
- Last updated: 2026-04-25.
- VTT grid state now supports both square size and calibrated origin offsets.
- GM scene controls now include an Align Grid action that captures two opposite corners
  of a known map square and calculates grid size plus `offsetX` / `offsetY`.
- Scene grid changes persist through the scene storage API as well as board scene state.
- Old overlay system is still active.
- No map level, level renderer, or overlay replacement work has started.
- Tests run for this phase:
  - `npm test` - passing, 355 tests.
  - `php -l dnd/vtt/api/scenes.php` and `php -l dnd/vtt/api/state.php` were attempted,
    but `php` is not available on PATH in this workspace.
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
