# The 3D board

From this build the VTT's board is 3D. The rest of the page (panels, buttons, sheets, chat) is the
same as before. Vision and fog are still in the code but switched off.

## Brandon's decisions (October 14, 2026)

- No new buttons or explanations. There is no 2D switch: the 3D board is the board.
- Gravity Orchard keeps its 3D look, to be improved later. Every other scene is its map picture
  laid flat on the ground. Old scenes do not matter.
- Tokens stand facing the camera on a simple mini base. This is the first step toward 3D minis.
- The camera opens tilted. Wheel zooms; right-drag grabs the ground and pulls it as far as the
  pointer moves; middle-drag turns the camera.
- These all work at once: holding a token (left), turning (middle), panning (right) and zooming
  (wheel).
- Arrow keys move relative to the camera, snapped to the nearest grid direction.
- Templates and drawings belong to the floor that was clicked: an island's level, or the ground
  (level-0) for the ground and vines.
- Templates, persistent zones and ability areas are see-through 3D boxes on squares. There are no
  circles: radius N means every square within N.
  - Each one has bright edges.
  - Removing one takes two steps (×, then confirm).
  - You move one by dragging it, and turn it in 90° steps.
- Difficult-terrain zones stay flat. Their names follow the 2D rule.
- Left out because they only make sense in 2D: per-level floor pictures and the floor cut-out tool.
- The Height control hides everything above the Height number.
- A flying token has a green line straight down to the ground under it.
- October 19, 2026: abilities are never blocked, only informed ("never block abilities. just inform. we
  should always be able to force through things"). The 3D board shows range, legal squares and areas as
  guides; it never refuses a pick. Any token can be picked as a target, as on the 2D board.

## Where the code is

| Path | What it is |
| --- | --- |
| `dnd/vtt/board3d/integration.mjs` | Mounts the 3D board, builds the scene, tokens, drag, ability pickers, Height control, layer registry. Exposes `window.vtt3d` and `window.vtt3dRenderer`. |
| `dnd/vtt/board3d/scene-view.mjs` | three.js scene: ground, islands, ramps, picking, projection. |
| `dnd/vtt/board3d/camera-controls.mjs` | The camera, one gesture per mouse button, so gestures combine. |
| `dnd/vtt/board3d/route-planner.mjs` | Route planner for the movement ruler. A* over the VTT's own walker; time-sliced; legs run along rows, columns or 45° diagonals. |
| `dnd/vtt/board3d/movement-route.mjs` | The ruler drawn in 3D: dots, leg and total labels, arrowhead, flashing difficult terrain. |
| `dnd/vtt/board3d/layers/` | Overlays: drawings, templates, persistent and terrain zones, auras, pings, surface paint, slope arrows. |
| `dnd/vtt/board3d/area-volume.mjs` | The see-through boxes for templates, zones and ability areas. |
| `dnd/vtt/board3d/wall-overlay.mjs` | Named line overlays: walls, stairs, rubble, the flash when a wall stops a move. |
| `dnd/vtt/board3d/scene.json`, `assets/` | Gravity Orchard's 3D art and textures. |
| `dnd/vtt/board3d/lib/` | three.js r160, loaded through the import map as `three`. |
| `dnd/vtt/board3d/art-kit.mjs`, `assets/kit/` | CC0 art kit (Quaternius nature models, Poly Haven textures; see its CREDITS.md) used to draw the Orchard's rocks, trees, plants and ground. |
| `dnd/vtt/board3d/vine-art.mjs` | Vine ramps as climbable vines, hanging ivy and roots, ground cover. |
| `dnd/vtt/board3d/glb-reader.mjs` | A small reader for plain .glb files (no compression, no animation), so no outside loader is needed. |
| `dnd/vtt/board3d/minis.mjs`, `assets/minis/` | 3D minis on tokens. `minis.json` maps a character sheet id (heroes) or monster id (monsters), or a token name, to a model; `noBase` floats a model with no base. A model whose top nodes are named `*_lod0/1/2` switches detail by camera distance. |
| `dnd/vtt/board3d/hero-fx.mjs` | Hero particle effects (embers, spores, psionic sparks), run on the graphics card and added to a hero's mini. |
| `dnd/vtt/board3d/scene-art.mjs` | A map's own 3D art from `assets/scenes/index.json` (matched by terrain size and floor ids), drawn over the map that plays. Installed: Medpilis (art pass 10, for the Medpilis v5b scene) and Dead Root Node (art pass 8, for v39); see `assets/scenes/CREDITS.md`. |

## Gravity Orchard art (October 14–15, 2026)

Art only: the Orchard's map data is unchanged (Brandon: "make no more changes to that map"). The Map maker graded
it from 3.3 to 8.0 out of 10. Lots of floating rocks are intended (the Orchard is made by rock elementals) and they
drift slowly; sticks, props and lamps never float, so the map's lanterns are drawn as floating stones with amber
cracks. Close to the camera, rocks, trees and vines dissolve so tokens behind them stay visible; walkable tops never do.

The page loads `board3d/integration.mjs` from `templates/layout.php`. The `board3d` modules are
in the import map with the build number, so a new build refreshes them like every other module.

## How it fits the 2D code

The 2D logic was not rewritten. There are two seams:

1. **Input.** `#vtt-map-surface` still gets every pointer event; it is transparent over the 3D
   canvas, so every tool's handler still runs. Each screen-to-map conversion calls
   `window.vtt3d.clientToMap(clientX, clientY, options)`, which picks the 3D surface under the
   pointer and returns map pixels, height, level, surface and ramp. The conversions that call it:
   - `getLocalMapPoint`;
   - the drag ruler;
   - the drawing tool;
   - wall `gridPoint`;
   - terrain `rawPoint`/`unproject`;
   - the stairs tool;
   - token placement;
   - the token hit-test.
2. **Drawing.** The 2D layers in `#vtt-map-transform` are hidden, not removed. Each 3D layer
   reads the same state the 2D one did. World units are squares: x = column, z = row, y = height.

The 3D branches in the 2D modules run only while the 3D board is mounted. Without it (for example
in the unit tests), those modules do what they did before.

## Movement

- The ruler follows the route the planner finds, and a dropped token takes that route.
- The server still checks every move. The planner only proposes corners, which then go through
  the same whole-command check (`walkEnding`, `wallMet`) as a hand-drawn route.
- The planner takes at most one stair per move, never steps off a plate edge, and prefers slopes
  to drops.
- While holding a token, right-click adds a waypoint.

## Slope arrows

The 2D board's slope arrows are drawn on the 3D board by `layers/slope-arrows.mjs`:

- **On the ground,** the arrows are the ones `terrain-prototype.js` works out (`slopeMarks()`, the same
  list and colours as `drawCostMarkers`).
- **On ramps and vines,** one green arrow per square, as `roof-renderer.js` draws them.

Each arrow lies flat on the slope at its middle and points uphill, at the 2D arrow's size. On a cliff it
stands up the cliff face rather than stretching down it. The slope-arrows setting still turns them all
off, and a ramp's arrows hide with it under the Height cut.

## Roofs (not yet on the 3D board)

Brandon, October 14, 2026: leave roofs out for now, and deal with them when maps with buildings
are built. His idea for then: a roof sits at its own height and shows while the camera is above
it. Zoom the camera in below the roof's height and the roof is gone, so you see inside; zoom back
out and it returns.

The 3D board does not draw roofs yet. The roof picture upload in the wall editor works, but nothing
on the 3D board uses it. Specifically:

- Roofs with `kind: 'roof'` are built but never shown (`setRoofs` is never called).
- A roof made in the wall editor has no `kind`. The 2D board counts that as a roof, but the 3D board
  builds it as a floating island.
- Roof and plate pictures (`imageId`) are not used on the 3D board.

Gravity Orchard has no roofs: all 19 of its surfaces are floating floors, which its own 3D art draws.

## Checks before a release

- `node dnd/vtt/tools/run-regression-suite.cjs`: at this build, 210 files and 1530 tests pass.
- The sandbox browser checks (`claude-run-all.cjs` in the 3D sandbox folder) cover:
  - movement, the camera and zoom;
  - arrows, Find token and waypoints;
  - the wall editor;
  - the Height tool;
  - the ability pickers;
  - two viewers at once;
  - combat movement;
  - slope arrows;
  - the fall animation;
  - grid alignment by clicks on the 3D ground (with every save blocked);
  - hero minis on their tokens.

## Known, not caused by the 3D board

- A teleport through the move path opens the Ground/Floor dialog and does not finish when a
  choice is clicked from a script. This happens in tests only.
- About 6% of the idle frame time is the 2D `edit-tools.js` reading `getBoundingClientRect`
  every frame. It was there before the 3D board.
