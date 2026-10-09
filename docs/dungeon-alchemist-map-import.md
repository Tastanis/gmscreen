# Current entry point — September 27, 2026

Start with [runtime release and migration](vtt-map-runtime-release.md). Runtime code
is in `dnd/vtt/`; native `.dam`, exported images and map-specific conversion inputs
remain separate local artifacts. The older workflow below explains map preparation,
alignment and regression scenarios, but its prototype source paths are historical.

For existing sandbox code updates, use the repository's
`tools/build-map-runtime-package.py` and `tools/install-local-map-runtime.py` under
`dnd/vtt/`. The old local `update-sandbox.py` delegates to those tools. Do not run
setup/build scripts that install scene data merely to update code.

Install terrain, nodes/segments, surfaces and ramps into canonical scene environment
through authenticated GM commands/import. Do not store a map design only in browser
storage. Give every walkable upper floor its matching polygon plate and holes;
align floor heights, ramps, stair endpoints and images. Large terrain objects belong
in the height field; small decorative stones should not disrupt movement. Keep roof
surfaces at their actual elevations, with stable IDs and valid owning level IDs.

Teleport choices display standing heights as surface elevation + 1. Stored geometry
keeps actual surface elevations. A height-0 ground surface therefore appears as
landing height 1. Test roof versus interior choices, limited-distance airborne
arrivals and cancellation before accepting a map. Do not hard-code map names or
token IDs in runtime rendering. Run GM plus two-player reload and portal tests;
local HTTP recovery tests do not establish hosted Pusher delivery.

# Dungeon Alchemist → VTT: import and regression guide

Use this before creating, exporting, importing, or repairing a layered Dungeon Alchemist map. It records the tested process and the mistakes encountered with Cliffwatch Observatory through sandbox build 455 (1.19.211). It is a guide, not a one-click importer or a claim that every map layout is supported.

## 1. Find the right artifacts first

Paths below are relative to the repository root unless linked otherwise.

| Need | Start here |
|---|---|
| Current project rules and authority | [AGENTS.md](../AGENTS.md), then [Sync V2 boundary](vtt-sync-v2/README.md) before changing movement, persistence, or broad rendering |
| Exact Observatory process, routes, failures, and screenshots | [Observatory HANDOFF](../.playwright-mcp/terrain-prototype/observatory-test/HANDOFF.md) |
| Authoritative editable example | `.playwright-mcp/terrain-prototype/observatory-test/Cliffwatch Observatory - v3.dam` |
| Native layout/instance metadata | `.playwright-mcp/terrain-prototype/observatory-test/design.json` |
| Matched exported images | `.playwright-mcp/terrain-prototype/observatory-test/observatory_00.jpg` through `observatory_03.jpg` |
| Coordinate conversion and import generation | [prepare.py](../.playwright-mcp/terrain-prototype/observatory-test/prepare.py) → `import.json` and `observatory-test.mjs` |
| Example canonical scene installation | [setup.cjs](../.playwright-mcp/terrain-prototype/observatory-test/setup.cjs); inspect before running—it writes configuration and token positions |
| Active sandbox root | `.playwright-mcp/terrain-prototype/runtime/current-vtt-app.json` |
| Refresh existing sandbox code | [update-sandbox.py](../.playwright-mcp/terrain-prototype/update-sandbox.py) |

**The prototype directory is ignored by Git.** These links refer to local working artifacts, not files guaranteed to exist in a fresh checkout. For another machine or future handoff, preserve the native map, complete exports, conversion inputs, prototype modules, scripts, tests, and HANDOFF together. If absent, recover that bundle; do not invent missing metadata or treat production code as the tested prototype.

The current example URL is `http://127.0.0.1:18769/dnd/vtt/`. Verify the runtime pointer and loopback fixture manifest rather than assuming that port still identifies the same sandbox. The `?observatory=446` URL suffix is not the installed build number.

## 2. Preservation rules

1. Keep the user's original `.dam` and the latest Dungeon Alchemist-saved revision. Work in a separately named copy when generating or experimenting.
2. Do not replace the authoritative map with `background export.dam`. That experiment removed stairs and was rejected. The complete v3 map is the approved example.
3. Do not rerun `build-native.py` over the saved map during maintenance: it regenerates identifiers and can overwrite application edits.
4. Do not run `build.py` to refresh an existing sandbox: it rebuilds/reset its state. Use `update-sandbox.py`, which preserves database and uploads.
5. Do not edit only the runtime copy; it will be overwritten on the next update. Change the prototype source, then update the sandbox.
6. `setup.cjs` is installation/setup, not a routine refresh. Inspect its scene IDs, map URL, levels, cutouts, and placements before adapting it for another map.
7. Keep shared scene writes on authenticated Sync V2 commands. No direct SQLite snapshot edits, whole-board replacement, player impersonation, or bypassing entity revisions.
8. A prototype fix is not a production release. Keep code deployment, map installation, multiplayer verification, and publication claims separate.

## 3. Native map and export checklist

1. Read an application-saved example and the installed schema/catalog before generating `.dam` JSON. Preserve unknown/version fields and relationships between rooms, foundations, floors, walls, openings, instances, and terrain layers.
2. Plan physical heights and connections first: floor elevation, stair foot/top, balcony opening, terrain ramps, roof heights, and routes around large obstacles. Elevation in squares is not token footprint size or CSS stacking order.
3. When replacing terrain, inspect every terrain layer. A stale second layer previously protruded through floors.
4. Open the exact output in Dungeon Alchemist. Check top-down and 3D views on every floor and with roofs enabled. Inspect both ends of each stair, door alignment, balcony holes, bridges, roof overlap, and terrain penetrating buildings.
5. Save through Dungeon Alchemist and reopen that saved file. Valid JSON alone proves neither a valid map nor correct visuals.
6. Export all required floors and roofs in one matched operation with the same camera, dimensions, borders, and resolution. Use true orthographic top-down images and turn the baked grid off.
7. Record the chosen export settings. The successful Observatory settings were Image Only → Orthographic, Only render lights in image, 150 DPI, small borders, All Layers + Roofs, Grid Off. Confirm current UI options in the application rather than blindly replaying clicks.
8. Check image dimensions and alignment at several recognizable corners, doorways, and stair landings. A correct-looking center is insufficient.

### 3a. Generated `.dam` rules that fail silently (verified October 1, 2026)

Library: `.playwright-mcp/terrain-prototype/chorus-hollow/damlib.py`. Run `python damlib.py <map.dam> ...` on every generated map before opening it in Dungeon Alchemist. It reports both problems below and passes the user's application-saved maps.

**Windows and doors set between two wall sections.** One wall opening spans L unit wall pieces, and each piece carries a cutout. When the piece's wall record runs opposite to the opening (`wallPieceSection` start→end), DA counts `cutoutPosition` from the far end: piece k gets `-(L-1-k)` plus `cutoutFlipped: true`. A forward piece gets `-k`. Counting from the near end on a reversed wall moves the hole one piece over. The frame then straddles two wall sections. This only shows on openings 2 or more squares wide on reversed walls. `Map.opening` implements the rule. Instance center = start + direction×L/2; rotation = `-180 - atan2(dy, dx)`. Never stack openings on the same unit piece on two floors.

**Waterfalls (calibrated against the user's hand placement, Crystal Maze v16).** The workshop waterfalls are Large, Medium and Small Waterfall.
- **Model anatomy.** Flow runs along local +x. Each model has three parts. A flat stream runs about 2 units back along the top. A near-vertical *curtain* hangs at local x ≈ 0.39. A splash pool spreads forward at the bottom.
- **Height and scale.** The instance height is the model's base. DA applies the config `yOffset` scaled: world z = height + (local_y + yOffset) × scale. Local +x maps to world `(cos yaw, -sin yaw)`.
- **Placement rule.** Position by the curtain, never by the back of the model.
  - The flat top stream must lie above or inside the wall. Otherwise it flows horizontally across nothing.
  - The curtain hangs just in front of the face: about 0.65 from a sloped face's foot, about 0.3 from a vertical wall (the user's falls measured 0.55–0.9 and 0.27).
  - Where the cliff has a recess, slide the fall into it.
- **Tools.** Call `Map.waterfall(block, water_x, water_y, yaw, lip_z=None)` with a point in the water in front of the cliff. It finds the foot, places the curtain and solves height and scale.
  - `waterfall_report` measures a placed fall. `lint_dam` flags a curtain inside rock, a curtain more than 1.0 from the foot (stream over air), or a floating bottom.
  - `waterfall-calibration.py` must reproduce the reference falls in `calibration/crystal-maze-v16-brandon-waterfalls.dam` within 0.3; it currently passes with 0.23.
  - Lint is calibrated only for south-flowing falls (yaw 90). Verify other yaws visually.
- **Water.** Terrain water renders only on painted samples below 0, so carve a plunge pool where a fall lands outside the main pool. For water above that level (a plateau pond), use the workshop "Animated water" tile. It is a 5×5 surface placed at any height, in a carved basin whose rim hides the tile edges.

**Props floating or buried.** A top-down export cannot show a prop hanging in the air. Run the seating check (`lint_dam`, or `seat_report(D, fix=True)`) and look at a low-angle view in DA's fly camera before calling a map done. Wall-mounted models (the "Fungi" shelf mushrooms, Notice Board, Meat Hooks) have their geometry about one unit above the model origin, so seat every prop by its `ModelStaticData` bounds, never by its origin.

### 3b. Converter rules found by the Dead Root Node sandbox test (October 7, 2026)

Reference converter: `.playwright-mcp/terrain-prototype/dead-root-node/convert-to-vtt.py`. Check a package with `sweep/bfs.php` (seconds) and `sweep/sweep.php` (the app's real `acceptTokenMove`, about half an hour) before sending it for import.

- **Deck plates.** The app puts a walker on a plate only when the token's square first touches the plate's edge while the ground under the token's centre is within 0.1 square of the plate height. A high deck that runs along the grid must END ON THE GRID LINE in front of the first square of land at deck height (not reach onto the land): then no land at deck height lies under the plate, and a walker on the landing square steps onto the deck as a first contact however it got there. A plate that reaches onto the land leaves anyone who climbed up to the landing standing beside the deck without being on it, and they drop through it on the next step. A deck at an angle still has to reach about 0.45 onto land at deck height, and its landing needs checking with `sweep/ghosts.py`. A low deck (log, planks, raft) takes the height of the banks it rests on, and the bank under its ends is levelled to match.
- **Plates must not overlap.** A token standing on two plates is never moved onto the second one and drops between them. Merge overlapping plates into one polygon at one height.
- **Cliffs get no wall.** The app has a general climbing rule (from the `claude/climbing` work): a face of 2 or more squares is a climb, with a pop-up and a surcharge, and a 1-square ledge is ordinary movement. A wall on a cliff edge stops players from climbing at all, so do not add one. The one exception is a roofed face: the low square lies under a deck or walkway that is level with the top of the face, so there is nothing to climb onto. Keep a one-way segment there, `base` at the low square and the top just under the plate so a walker on the plate passes over it (`--cliff-walls roofed`, the default; `none` and `all` exist). List the kept faces in the conversion report so the Director can overrule them.
- **A wall cannot tell a climber from a deck walker by height.** The app lifts a token to the higher ground the moment its square touches it, so a wall beside a landing that is meant to stop someone 0.3 below the deck is already cleared at the first sample. Fix deck landings with the plate's shape (above), not with walls.
- **Walls reach the ceiling.** The app tests a sight line against each wall's own base and height and does not test floor or roof plates. A wall shorter than its storey leaves a strip of open air under the ceiling, and a viewer on slightly higher ground sees in over it, one-way (Elowin bathhouse, 1.5-square walls on 2-square storeys). Give every real wall the full storey height, and audit sight as well as movement before delivery: `bathhouse-zones/sight-audit.mjs` (the app's wall rule over every outdoor and indoor square) and `test-sight.cjs` (a real player's browser). Sight in from high ground over full-height walls relies on the app's roof rule, not on walls.
- **Prop colliders are whole squares with one-way walls.** A box that covers part of a square traps any token that falls or teleports into it. Block whole squares, facing outward, so nothing walks in and anything inside can walk out. Clear props from deck landings.
- **No pits.** After adding walls, check that every square a walker can reach (falls included) can walk back to the entrance: `sweep/analyze.py` prints the count. With cliffs open this comes for free unless props fence a square in.
- **Stair ramps.** Keep every rise between neighbouring squares under one square, and reach plate height one square before the plate.
- **Level images: do not resample them.** Each floor's export is exact on its own floor. Things on lower floors look slightly smaller in an upper-floor export (the export has a little perspective: about 0.31% per 2 squares of height on a 68-square map, 0.54% on a 38-square map), so matching the outdoor ground between two exports shows a scale difference that is not an error. The level image is only shown on its own floor's squares, so leave it alone. Check instead that the floor's own walls sit on their grid lines in its own export. (Dead Root Node v23a had the walkway image resampled to match the ground outdoors; that moved the walkway art up to 0.04 square off its tiles and was taken back out in v23b.)
- **Terrain zones.** Liquids become zones in `environment.zones` (format: `docs/terrain-zones-format.md` in the terrain-zones work). Floor liquids are matched by DA block name, painted water by water type id, a square belongs when most of it is liquid, and `surfaceHeight` is the liquid surface. Squares under a deck plate stay in the zone: the app keeps a token standing on a floor plate out of the zone under it whatever the gap, and a creature wading under or beside the deck is in the liquid. Ground that is not a plate still uses the half-square rule, so something solid that sticks out of the liquid needs its square left out. The converter's rule (one threshold, no per-map list): a prop that is not a plate and has no blocking collider is a foothold when that one prop covers at least half of the square and its top is 0.1 to 1 square above the liquid; effects, lights and plants never count; smaller debris (skulls, bones, loose blocks) is ignored and the square stays liquid. On Dead Root Node this leaves out exactly the two iron grates over the canal. Tags the app reads as liquid (a swimmer pays nothing extra): water, blood, liquid, oil, acid, slime, sewage. Check with the app's own `zonesForFootprint` and `standsOnPlate` (`check-zones-worktree.mjs` in the Dead Root Node folder). A pool in a hole of a floor plate (an indoor pool) needs its zones on the BASE floor (`level-0`): a token that leaves a plate for the ground in its hole becomes a base-floor token. Repeat the same squares on the plate's floor so the ruler, which prices a drag with the floor the token starts on, charges the walk in. Two zones may cover the same squares (for example `water` with the cost and `hot-spring` at cost 1 for the tag): the token reports both tags and pays the highest cost once. An app without zone support rejects the whole package ("Invalid wall format"), so build a zone-free copy too (`--no-zones`).

**Example values, not defaults for another map:** Observatory is 21×22 native squares, with a one-square export border, yielding 23×24 squares and 3450×3600 pixels at 150 pixels/square. Its transform is `xVtt=xNative+1`, `yVtt=22+1-yNative`, `zVtt=(zNative-0.2)/1.2`. Measure and record the next map's border, origin, Y direction, scale, and elevation conversion independently.

### 3c. Floating islands and very tall maps (Gravity Orchard, October 8, 2026)

Reference build: `.playwright-mcp/terrain-prototype/gravity-orchard/` (`build-orchard.py` writes the `.dam`, `compose.py` makes the two pictures, `convert-orchard.py` writes the scene, `test-orchard.cjs` is the import test, `PLAN.md` has every decision). Shared notes for all maps: `.playwright-mcp/terrain-prototype/MAP-MAKER-NOTES.md`.

- **More than five floors.** Dungeon Alchemist opens and renders a file with eleven foundations (layers -1 to 9, 2.4 native apart). Every floor that exists is exported, empty or not. A map with no rooms exports one picture.
- **Heights times 1.5.** One Dungeon Alchemist storey is 2.4 native. To put tiers 6 squares apart, build them two storeys apart and write `(native - floor native) / 1.2 * 1.5` into the scene. One multiplier for everything, terrain included.
- **App limits on levels.** Five added levels at most; level heights are whole numbers; a level with no plate under a token acts as an endless floor. Put a catch ledge on the tier below its island instead of giving it a level of its own.
- **Floating plates.** `"floating": true` on a floor plate, and `"view": {"slant": 0.12}` in `environment.walls.value`. The app draws a rock side under each plate and its shadow on the ground at the true place. Leave a blank band of real ground in the Dungeon Alchemist map: north = slant x tallest height, east = a third of that.
- **Two pictures.** The app draws only the squares a plate covers. Ground picture: export a twin of the map with every island left out, and orthorectify it by terrain height (camera distance about 11.5 x the picture's longer side). Islands picture: one shared picture with each island cut from its OWN floor's export. Draw plate outlines inside the edge squares. Colour rule that makes tiers read: brighter and warmer means higher.
- **72 pixels a square** is enough for a many-layered map (Brandon, October 8). Export at Low Quality (72 DPI); a nine-floor export at that size needs about 8.6 GB of commit.
- **Ramps.** A sloping arch is a ramp with mirrored stair triggers (red low edge, green high edge). A vine is a ramp one square long. Ramps steeper than 1.5 a square do not carry a pushed creature.
- **Sight on a stacked map: measure it without remembered ground.** A hero standing on a plate sees the ground below only past the plate's edge: from the middle of an island the app shows none of the crater floor, from an edge about a third (true line of sight; the plate under his feet hides the rest). Relief on the floor matters only to creatures standing ON the floor: with terraces 3 squares high they saw 3 to 50% of it depending on where they stood (about 31% on average, almost nothing from a dip), with a flat floor 37 to 51% (about 45%). The picture may show relief that the package does not carry: `convert-orchard.py --flat-floor` keeps the art and writes a flat floor (Brandon's choice here). Measure with `sight-probe2.mjs` (the app's own sight modules in Node, one viewer at a time). Do NOT measure from screenshots of one player page moved from place to place: the fog keeps what was seen before, and ground remembered from the first position is counted as seen from the next. The first figures for this map were wrong for that reason.
- **A gentle slope does not show in Dungeon Alchemist.** Three squares over eighteen is invisible from above and in 3D. Take the same heights in terraces with short steep scarps. Put a water tile BELOW its bank so the ground cuts the water's edge; a tile at or above the ground shows as a blue disc.
- **Blocking things are rings.** A solid or breakable object on one square is four two-way walls just inside that square, with a fixed base and its own height. **Sight is decided by what the object is for, separately from whether it blocks movement or can break** (Brandon, October 9, 2026: "ask yourself is the goal of this thing to block sight"; this replaces the size-only rule of the same day). Put every kind of object, by hand, in one of three groups, and make the converter stop on a kind that is in none. **Cover**: a solid mass a creature hides behind (rock, boulder, trunk, pillar, spire, standing stone). Its ring is sight `limited` only when it is massive: **0.8 of a square or more** across (its narrower side; for a slab on edge, its long side) AND **1.5 squares or more** above its floor. Smaller cover is `pass`. **Show**: a thing the players are meant to look at (an objective, a node core, crystals). Always `pass`. **Open**: a thing you see through, under, over or round (a cage, a cart, a table with legs, a crane, a crate, a cairn, brush). Always `pass`. `limited` lets a sight line pass the ring's near wall, so the object itself is seen, and stops it at the second wall. Only a thing with a wall can be breakable. Never `block` on an object (a black box; the Gravity Orchard shipped that way once): `block` is for real walls. Measure each prop from the saved map and give the wall the prop's real height, so 3D sight agrees. `pass` walls cost the sight code nothing (it drops them before it starts). A breakable object's walls each carry `material` (`stone`, `glass`, `wood` or `metal`: this is what makes a wall breakable) and the same `group` name (for example `orchard-break-T6`; 1 to 128 letters, digits, dash, underscore, dot or colon), so the object breaks as one thing with one heap of rubble. One material per group; a group needs a material; a one-way wall can never have a material. A plain breakable stretch of wall has a material and no group. Solid rocks get neither field.
- **Paint each ramp's ends onto the plates it joins.** The app draws a ramp only where the viewer can see its top surface. From the island at the HEAD of a descending stair he cannot until he stands on the lip (within 1 square for a rise of 1 a square, a sixth of a square for a vine). His own island's picture is always drawn, so carry the stair's first slabs, or the vine's roots, about half a square onto the island square at each end (`gravity-orchard/paint-landings.py`).
- **Leaving a plate.** Since `6d2d204c` a creature that leaves its footing travels level at the height it left from and then falls, so walls far below do not stop it. Before that fix a wall under the top of a ramp, or under an island's edge, refused the move; check pushes off edges over floor pieces in the import test.

## 4. Build the geometry once, in canonical coordinates

- Keep one unprojected coordinate system for image alignment, nodes, floors, stairs, and tokens. Parallax belongs in rendering and inverse pointer picking; never save projected screen positions as map coordinates.
- Trace walls against the innermost wall edge consistently. Do not compensate for inconsistent placement with a blanket quarter-square reveal. Inspect all four building sides and multiple buildings. See `rennet-wall-alignment.mjs` for the earlier map-specific alignment example; it is not a universal transform.
- Reuse node IDs where walls really join, preserve fractional coordinates, and keep closed room loops closed. Visually touching endpoints with different IDs do not form a shared-node room.
- Doors remain edges in the room boundary even while open. Set sight, movement, directionality, base/top, interaction, and open/locked state intentionally. Do not turn an open door into a missing topology edge.
- Use tile-union boundaries for floor/roof polygons. Distinguish separate outer components from holes. Balcony and stair holes must remove both artwork and physical support/ceiling blocking.
- Upper floors and roofs are separate flat surfaces at explicit heights. Do not blend them into the terrain height field beneath them.
- Give each surface the correct source image, footprint, holes, height, kind (`floor` or `roof`), and floor association. Match geometry to the actual native structure, not a guessed rectangle around the whole image.
- Add only substantial rocks/obstacles to the walkable terrain approximation. Use instance scale, rotation, and known bounds; do not claim mesh-exact heights. Leave tiny rocks and decorative clutter out.
- Pillars can use closed wall rings with limited sight and blocked movement: one boundary crossing shows the pillar; two block beyond it. Tall opaque furniture may need blocking walls rather than a walkable height mound.

## 5. Stairs: geometry, authority, and presentation must agree

1. Record the actual footprint, base/top heights, source/destination floors, direction, and artwork for every staircase.
2. Imported ramp math in `imported-ramps.mjs` supports north/south/east/west using an explicit direction and shared plane equation. Elfsong exercises north and west routes in the browser; all four orientations have geometry tests. Rotating only the picture is insufficient.
3. Create mirrored canonical stair triggers on both linked floors with the **same ID**, opposite directions, and reciprocal destinations. Red is low; green is high.
4. Low two-square side entry is supported. High side entry remains under the stair. Do not infer support merely because a token overlaps the stair picture.
5. Preserve accepted `_floorTraversal` and floor state. The server validates the stair signature and entry. A valid descending entry must remain supported over its floor cutout; an unrelated hole or barrier-side entry still falls.
6. Test both ascent and descent, continuous height at each step, top/bottom landings, reversal midway, side entry, under-stair movement, and reload during traversal.
7. A small landing preview is cosmetic: the one-square strip appears when eyes are level with the landing and still passes wall/ceiling sight checks. It must not grant arbitrary vision from lower stairs.
8. Test a real token at the landing separately. Token visibility uses head height; the token may be visible while the floor underneath is not.

**Accepted limitation:** complete exports bake stair artwork into the background. The separately raised ramp image can expose a duplicate underneath. The user chose to leave this cosmetic issue rather than risk damaging the map. Do not remove native stairs, erase the background, or change movement heights to disguise it. A clean-background workflow would be a separate change.

## 6. Rendering rules to preserve

| Rule | Implementation to inspect |
|---|---|
| Terrain mesh, inverse picking, support, cached slope markers | `terrain-prototype.js`, `terrain-math.mjs`, `slope-indicator.mjs` |
| Terrain and wall rays, independent token head-height visibility | `terrain-vision.mjs`, `vision-height.mjs`, `vision-prototype.js` |
| Floor footprints, holes, support, ceiling intersection | `stacked-surfaces.mjs`, `roof-geometry.mjs` |
| Roof/floor compositing and ramp artwork | `roof-renderer.js` |
| Exterior roof artwork must not acquire holes from enclosed lower floors, walls, or stairs | `roof-top-occlusion.mjs`; presentation-only exceptions, not a global physical-sight bypass |
| Interior cutaway through connected storeys during stair transitions | `building-cutaway.mjs` |
| Open doorway reveals a room, not isolated visible patches punched through a roof | `doorway-cutaway.mjs`; build topology at the door's height, not changing viewer eye height |
| Stair support, landing strip, ramp sight and picking | `imported-ramps.mjs`; authoritative sandbox movement in `FloorGeometry.php` |
| GM inspection/lighting, flight, height tethers | `gm-vision.js`, `flight-height.mjs`, `height-tethers.js` |
| Remembered terrain visibility | `explored-fog.mjs`; not proof that a token is currently visible |

All filenames in this table live under `.playwright-mcp/terrain-prototype/`. The updater installs them in the current loopback runtime.

- Through a visible open doorway, hide the room's overhead surfaces and let normal interior fog handle blocked areas. Do not leave roof islands behind pillars. Closed neighbouring rooms must not be merged merely because a door is open elsewhere.
- Room cutaway needs closed shared-node wall loops. Unclosed geometry falls back to older per-pixel behavior; repair the topology rather than adding a map-name exception.
- Solid floor surfaces must remain opaque when not visible. Show darkness, not the lower image through transparent pixels. Only authored holes reveal below.
- Do not paint an entire floor top when eyes are exactly level with it. Preserve the narrowly bounded stair-landing exception.
- Do not confuse hiding a roof for presentation with deleting a physical ceiling for token sight or movement.
- Keep tokens, floor artwork, exploration memory, and GM inspection distinct. GM movement bypasses walls; player movement does not. Never test player behavior by assuming the GM view is equivalent.
- Browser-local prototype wall/door edits are not canonically synchronized multiplayer editing. Terrain/marker geometry is cached, but viewer-dependent vision still recalculates at runtime.

## 7. Install and verify in separate passes

1. **Native pass:** saved/reopened DA map, overhead + 3D, all floors/roofs, every stair landing checked.
2. **Import pass:** dimensions, transforms, heights, boundary closure, holes, image references, reciprocal stair IDs, and support geometry checked.
3. **Movement pass:** actual pointer/keyboard movement up/down every stair and ramp. Include diagonals, low/high side entry, ordinary falls, GM wall bypass, player blocking, and a reload.
4. **Visibility pass:** outside closed/open doors; climb while looking through a door; inside rooms; above roofs; balcony look-down; third-floor ascent/descent; under stairs/overhangs; token at the upper landing; tall obstacles. Inspect center AND edge pixels, not just one convenient sample.
5. **Persistence/multiplayer pass:** explicitly Show Players the test scene, verify actual player rendering plus accepted canonical positions/floors, and reload both clients. Receipt of events alone does not prove the player is looking at the correct map.
6. **Regression pass:** rerun the relevant older scenario after a fix. Check the user's existing tab as well as a fresh browser context when results differ. Compare saved geometry, token height/traversal, viewer settings, and source images before blaming caching.

Before any fixture writes, verify `/diagnostic-manifest.json` identifies `terrain-prototype`. Use only the intended loopback test scene. Update the sandbox using:

```powershell
python .playwright-mcp/terrain-prototype/update-sandbox.py
```

Hard-refresh the browser and confirm the actual installed version. Do not rebuild the database to solve a cache problem.

### Regression entry points

Read the scripts before running them: several mutate fixture positions, activate scenes, or depend on current state. Browser tests use Playwright and may require local process-launch approval. Do not run tests that move the same token concurrently with each other or the user.

| Scenario | Test under prototype root |
|---|---|
| Import geometry and all three stair definitions | `observatory-test/geometry.test.mjs` |
| Basic movement / two-client convergence | `observatory-test/test-movement.cjs` |
| Visual positions and actual player behavior | `observatory-test/test-visual.cjs`, `observatory-test/test-player.cjs` |
| Roof holes from several exterior viewpoints | `observatory-test/roof-hole.test.mjs`, `observatory-test/test-roof-hole.cjs` |
| Doorway topology and roof/ground view | `doorway-cutaway.test.mjs`, `observatory-test/test-roof-door.cjs` |
| Connected building cutaway / third-floor round trip | `building-cutaway.test.mjs`, `observatory-test/test-third-stair.cjs` |
| Server side entry and supported descent versus ordinary falls | `test-stair-side.php` |
| Landing strip and independent token visibility | `landing-peek.test.mjs`, `observatory-test/test-landing-peek.cjs` |

Node unit files can run directly: `node <path-to-test.mjs>`. PHP fixture checks use `php <path-to-test.php>`. A syntax check is not a movement or visual test.

**Test-state warning:** old browser scripts restore position/floor but may clear `_floorTraversal` through a placement patch. That is not an exact restoration of a token already halfway up a stair. Prefer dedicated test tokens and a known landing start. If using an existing token, preserve its complete state and restore support through the supported movement flow; never invent a server signature or say it was untouched. `test-landing-peek.cjs` expects the explorer at (17,8), supporting height 3; it temporarily moves/restores a separate lookout token. Check those preconditions before running it.

## 8. Symptom → investigate before changing data

| Symptom | First checks / mistakes to avoid |
|---|---|
| Shifted layers or walls aligned on different edges | Border, Y flip, scale, shared origin, inner-edge placement; don't add reveal padding |
| Stair exists in data but not in DA | Wrong revision/export source or incomplete native references; reopen exact saved map |
| Two copies of stairs | Baked background plus parallax overlay; accepted cosmetic limitation |
| Rectangular or diagonal hole in exterior roof | Lower floor/ramp/wall incorrectly occluding roof artwork; inspect presentation filtering |
| Only central balcony visible through open door | Wrong reveal storey, door-height topology, missing closed room loop |
| Roof islands behind pillars or across balcony | Partial reveal being used instead of room cutaway; verify connected interior membership |
| See ground floor through solid second floor | Transparent invisible floor, missing floor plate, or incorrect hole; keep opaque coverage |
| Descending immediately drops a floor | Canonical falling check overriding a valid stair entry; inspect accepted traversal |
| Upstairs vanishes at exact eye height | Floor-facing boundary and landing peek; test creature head separately |
| Existing tab differs from fresh tests | Saved model, actual traversal/height, viewer preferences, exploration, asset content; do not assume cache |
| Rapid movement revision errors | Accepted command ordering/revisions; never disable authority checks or silently overwrite concurrent state |

## 9. What to leave for the next AI

Record the authoritative `.dam` path/revision, export settings and image sizes, transform equations, level/roof heights, stair footprints/orientations/links, wall and hole derivation, obstacle approximations, current runtime/scene IDs, applied build, exact test routes, screenshots, checks actually run, and remaining limitations. Keep map-specific measurements separate from reusable code rules.

Describe what changed and whether it was native-map data, import generation, shared renderer logic, or canonical movement. Never label a map-only patch a general fix, or a local sandbox result a production/multiplayer guarantee.

### Elfsong saved-export import (September 26)

Local sources and reproducible conversion live in `.playwright-mcp/terrain-prototype/final-test/`. Read `ELFSONG-HANDOFF.md` there before updating that scene. `prepare-elfsong.py` derives floor plates, curved walls, native wall heights and stair openings from the saved DAM and four same-size images. `imported-maps.mjs` registers map-specific data with shared rendering. Do not run setup as a routine update: it rewrites this scene floor configuration. Native wall asset bounds matter: rooftop parapets must not inherit full-height interior walls.

Door/window controls in token-view mode use the current observer support height and the shared occluded sight function, including GM token view. Test the near face of a closed door so the door does not hide its own control; reject other-storey controls before sight testing. Anchor controls at wall base height for parallax. Recompute when vision repaints, without changing wall revisions or persistence. Elfsong read-only browser check reduced 122 controls to 7 from the current exterior viewpoint (build457); geometry checks cover upper/lower walls, hidden far faces and visible near faces.


Portal buttons consume pointer/mouse down and up so using a door/window preserves token selection; return keyboard focus to the board after toggling. SVG door and four-pane window icons remain distinct in either state, with open/locked color and accessible state labels. `final-test/test-portal-selection.cjs` verifies both actual click toggles and retained selection in an isolated GM inspection context (build458), restoring each portal state; no token movement.

In height-vision mode keep `.vtt-measure-overlay` above the roof/fog canvases (build459). The existing drag/measure path and labels otherwise render underneath opaque maps. `final-test/test-restored-ruler.cjs` verifies a real measurement gesture produces a visible path above the roof; it does not move tokens.
## Shared-map and movement pass — September 26 (sandbox build 461)

The local sandbox now uses canonical `sceneConfig.environment`, not browser storage,
for terrain samples/bounds, the wall/door/window/roof document, and an exploration
reset marker. `environment.set` is GM-only, uses the existing Sync V2 command/event/
recovery path, and checks both scene configuration and per-document revisions.
A stale document is rejected; never rebase a whole wall/terrain document silently.
The two document revisions are independent. Door updates currently send a whole
wall document; large maps may need a narrow portal command later.

Migration: open the original GM browser first. Its saved design seeds a missing
canonical document once. Thereafter canonical state wins, including after a map
URL change. Keep the old browser backup. Legacy IndexedDB roof images upload before
sharing the wall document; missing source blobs leave the draft unconfirmed, not
silently roofless. New roof uploads use the normal authenticated upload endpoint.
Scene packages retain environment data and image references; copying remaps roof
levels and ramp stair identities. Layout checkpoints restore terrain/walls/doors,
but old checkpoints without environment data preserve the current environment.
A layout restore does not undo a newer exploration reset. Individual exploration
memory remains local; the shared reset marker invalidates every client's memory.

Token `flightHeight` is authoritative absolute elevation. `FlightHeight.php` uses
saved terrain bounds and the same triangle interpolation as the renderer; normal
flight retains or raises altitude, never automatically lowers it. Teleports sample
the destination rather than intervening terrain. Ground clears flight elevation.
The GM browser migrates legacy saved flying heights once. This does not replace
polygon floor-support calculations or implement aerial obstacle collision.

Owners are GM-assigned `visionOwners` player-profile IDs in right-click settings.
They are separate from character-sheet links and the existing team movement rules.
Players select an owned/linked token's viewpoint; deselection retains their last
valid choice per scene/browser, including reload. Revoking ownership removes that
viewpoint. Allies/owned tokens remain displayed outside LOS, while explicit GM
Hidden and server-hidden floors remain protected. GM no single selection means
unrestricted current-floor overview; one selected token means that token's sight.
Only the GM has portal controls. Invisible enemy hit targets are disabled in the
height renderer; this is not server-side geometry-based token secrecy.

Drag release priority is Alt (teleport), Ctrl (forced), Shift (shift), normal walk.
Shift retains stair traversal and the supplied path but suppresses built-in OAs.
Teleport omits the intervening path and uses an arrival compression animation;
reduced-motion settings suppress it. Forced drags operate one token at a time and
use the final distance after manual Stability/ability adjustments. The first
creature/wall collision stops the token. Remaining squares damage each collided
creature and the mover once; an unbroken wall adds 2 to the mover's damage.
Damage is saved only after accepted movement and confirmed zone-entry processing.
It is not an atomic movement-plus-damage transaction: uncertain/partial damage
requires review, never automatic replay. Destructible materials, vertical throws,
and forced falls remain manual. Movement budgets remain advisory.

Wall path checks now inspect submitted waypoints instead of the start/end chord.
At build 461 these checks and Ctrl-drag clipping were client-side. See the
server wall authority update below for build 463. Server/client polygon support
unification and upper-floor terrain painting remain unfinished. Do not claim the full audit is resolved. Existing
5x look-down occlusion is unchanged; it exaggerates apparent blocking height, not
physical elevation, flight distance, or damage.

Verification: `npm test` includes server document authority/stale-write guards,
scene-copy references, ownership permissions, flight persistence, and pure forced
collision tests. Local browser scripts in `final-test/` cover GM plus cal/sharon
door propagation (439 ms in the last run), reload, terrain propagation/restoration,
real Shift/Alt/Ctrl release, saved creature-collision damage, owner selection with
sticky deselection/reload, and shared flight height/Ground mode. They use disposable
unlinked tokens and remove them in finally blocks. Preserve existing user tokens.
`test-shared-path.mjs` covers legal routes around walls and illegal curved routes.
Do not generalize these local results to production latency or all map geometry.

Updater preserves the existing database/uploads, installs the new server helpers,
keeps version/build monotonic, and makes local JS modules revalidate on reload.
Frontend prototype sources remain Git-ignored; a fresh checkout alone is still
not a complete terrain renderer. Normal repository version is independent of the
advanced sandbox build. Do not run build/setup scripts to apply these updates.

### Teleport stair destinations (September 26, sandbox build 462)

Grounded teleports resolve the direct start-to-end stair crossing using the same
canonical entry/exit rules as shifts. A partial climb retains `_floorTraversal`;
exiting the linked landing changes floors. Descending behaves symmetrically.
Teleport waypoints are ignored, and movement intent remains `teleport` for
opportunity attacks and destination-only zone processing. Airborne tokens retain
the existing flight behavior. This is stair-route floor inference, not arbitrary
cross-floor teleport targeting. The sandbox retains low-step side entry and upper
step walk-under behavior. Tests cover canonical persistence/reopening and both
geometry implementations; no existing user tokens are moved for this check.

### Server wall movement authority � September 26 (sandbox build 463)

`WallMovement.php` validates saved `sceneConfig.environment.walls` inside both
`token.move` and position-changing `placement.batch` transactions. It ports the
client swept-footprint/height checks: strict touching permits wall sliding,
waypoints are checked in order, open doors/windows pass, directional movement
restrictions apply, and flight/floor/ramp elevations select intersecting walls.
Stair entry/exit and falling remain in `FloorGeometry`; this does not change floor
support authority. Imported floor plates are used only to match collision height,
not to replace the rectangular server falling calculation.

Preserved policies: GM walk/shift override, teleport skips intervening walls,
trusted movement undo retains its existing receipt behavior, and forced movement
collides for GM and players. A blocked command is rejected atomically; the server
never clips a requested destination, applies collision damage, or replays effects.
The existing Ctrl drag clips first, then runs confirmed zone and damage handling.
A door closing after that preview causes rejection before damage. A later blocked
member rolls back the entire placement batch. No client wall revision is trusted.
Maps without a shared wall document retain existing behavior; migrate their design
from the original GM browser before expecting enforcement. Arbitrary GM placement
patches default to forced intent, so position-changing automation must explicitly
supply teleport/walk/shift when those semantics are intended.

Verification: 809 tests passed, including server rejection/atomicity, current door
state, waypoint detours, flight, stair height, large footprints and reload.
500 generated geometry cases and 240 actual Elfsong cases across floors/heights
matched the client checker. `final-test/test-wall-authority.cjs` verified direct
player API rejection for walk/shift/forced and accepted teleport delivery to GM,
cal and sharon plus reload. An initial browser startup timeout passed on retry.
`test-forced-collision.cjs` retained clipping and confirmed damage to both tokens.
Browser tests removed their disposable tokens; native maps and user tokens were
not edited. Production deployment and polygon-floor support unification remain
separate work. The local updater installs WallMovement.php without rebuilding data.

### Personal fog, drag labels and forced flight - September 26 (build 464)

User decisions: personal explored areas stay in each player's browser and survive
refresh, not party-wide/server-shared. Teleport may pass through darkness/walls;
only destination support applies to falling. Floor deletion cleanup is deferred
at the user's request. Grounded forced-movement slope/slam threshold is pending:
emailed a same-scale comparison of arrow landmarks 1:1 green, 2:1 yellow, 4:1 red.
These colors interpolate and use the steepest local eighth-square sample. The
existing separate cliff check is 3:1, not the red landmark.

Drag ruler shows Move / Shift / Forced movement / Teleport while dragging. Keydown,
keyup and pointer modifiers use the same Alt > Ctrl > Shift priority as release;
the label changes with a stationary pointer too. Pure measurement stays unchanged.
Local updater applies patch-drag-label.py without removing terrain projection.

Personal fog uses a stable per-player mask across owned-token switches, with
compatible legacy per-token masks merged only for the same player, scene, map,
reset epoch and geometry key. Other-player masks never merge. Terrain/map geometry
changes still select another compatible mask; refresh alone does not. Periodic
saving no longer waits indefinitely for continuous painting to stop. Browser
storage deletion/new devices remain fresh exploration. Remembered silhouettes do
not remember enemy tokens or grant current line of sight.

Height tethers already include all visible tokens, regardless of ownership.
Added inert data-tether-placement-id for browser verification; explicit GM Hidden
continues to suppress the token and its line.

Forced airborne movement retains its altitude; rising terrain intersecting that
altitude blocks the server request and participates in Ctrl-drag clipping/damage.
This is distinct from the pending grounded slope threshold. Ordinary flight still
rises over terrain; teleport ignores intervening hills. Grounded steep-slope slams,
authoritative creature collisions and atomic collision damage remain unfinished.

Validation: 810 tests across 108 files passed. Browser checks passed actual modifier
labels/releases, a non-owner player's visible ally tether, hidden-token suppression,
legacy personal-memory migration, privacy, actual reload and reset. The fog browser
had an initial app startup timeout; retry passed. Browser fixtures used isolated
storage and disposable tokens; existing user tokens and native maps were preserved.

### Yellow terrain slams - September 26 (sandbox build 465)

The user selected yellow: forced grounded movement slams at an uphill grade of
2 or more vertical squares per horizontal grid step. Use Chebyshev grid distance
and eighth-square sampling, matching terrain-arrow grade units. Grade is measured
in the movement direction: downhill, cross-slope, and shallower uphill movement
remain passable. Sample only actual terrain support; terrain below a solid upper
floor or supported ramp is not an obstacle to its occupant.

forcedTerrainBlocked shares the existing Ctrl-drag wall/terrain stop search and
unused-distance + 2 solid-obstacle damage. WallMovement validates the same threshold
for canonical forced commands, including GM commands, without applying damage or
silently clipping requests. Ordinary walking/shifting and teleport remain unchanged;
forced flight keeps its separate retained-altitude terrain intersection rule.

Verification: 811 tests across 108 files passed; boundary 1.99/2/4, downhill,
cross-slope, floor isolation, stopping position and damage covered. 240 read-only
actual-map client/server comparisons passed. Real Ctrl-drag creature-collision
regression still stops correctly and saves damage to both creatures; its temporary
tokens were removed. No user tokens or map terrain were changed.

### Reliability pass - September 26 (sandbox build 466)

See [the reliability report](vtt-reliability-pass-2026-09-26.md) for the three
repair areas, four validation passes, measurements and remaining boundaries.
Canonical forced endpoints now check creatures. Ctrl-drag collision outcomes use
per-target durable reservations with manual review after uncertain damage; this is
not atomic sheet damage and does not yet journal authored ability-picker damage.
Polygon footprint support is shared between server falling/checkpoint planning and
the local imported-map renderer. Shared map design activates rendering after image
URL changes. Checkpoint relocation and exact stair-top turnarounds have regressions.

Complete suite: 817 passing tests across 110 files. Separate GM/two-player browser
passes cover a newly imported/remapped Observatory, all three stairs in both
directions with walk/shift/teleport, actual collision damage, pending-damage reload
and GM review, environment sync, copy/checkpoint recovery, personal fog and tethers.
Elfsong performance was about 56 fps; Observatory about 57 fps with two tokens and
28 fps with 82 tokens. No production delivery/performance claim. User sandbox map
state and native sources were preserved; QA used a separate SQLite backup/runtime.
Do not run fixture/setup scripts against an existing user sandbox.

## Floor contact and stair endpoint preflight - 1.19.172

A walkable authored floor at the same physical height as terrain is the support
surface, including basement plates assigned to implicit level-0. Preserve its ID;
a base-level label by itself is not enough to distinguish a basement floor from
terrain underneath it. Never use rounded standing-height labels to merge geometry.

Terrain from zero through 0.125 square beneath a supported floor is treated as
near-flush buried ground: support and teleport use the authored floor instead.
This accommodates the measured Bathhouse export clearance of 0.1249999 square.
The separate walking edge-step tolerance remains 0.1 square in either direction.
Larger clearances retain separate destinations, including genuine underpasses.
Do not flatten terrain, shift the whole map or reveal hidden floors to fix contact.

For every imported stair and walkable plate:

1. Check physical plate height and owning level ID, including level-0. Inspect
   terrain clearance at the entrance, stair landing and several interior cells.
2. Verify each stair endpoint overlaps its destination plate outside holes and
   cutouts. Its destination height must match the plate within 0.125 square;
   repair inconsistent authored stair/level geometry before accepting the import.
3. In a disposable copy, walk both directions through the stair and several cells
   beyond it. Confirm canonical levelId and _supportSurfaceId, actual support
   height, clear floor artwork/sight, no false fall receipt, and persistence after
   reload. Teleport-only testing does not verify stair completion.
4. Check the teleport chooser at the landing. Near-flush terrain should contribute
   no separate underneath-floor choice. Also test an actual opening, a point
   outside the footprint and a real separated underfloor space; each must retain
   terrain access. Two equal rounded labels do not prove duplicate geometry.

The actual Bathhouse journey is covered by test-basement-support-browser.cjs;
paired PHP/JS fixtures cover equal heights, 0.125 clearance, holes, outside terrain
and a two-square underpass. These checks preserve native sources and campaign data.


## Portable map packages - September 29, 2026

Use a single `.vttmap` when transferring a completed map. It contains the canonical
`gmscreen-scene/v1` scene plus every referenced image, with SHA-256 integrity checks.
Native Dungeon Alchemist sources remain separate editable preservation artifacts.

1. Export the verified scene JSON through the GM scene export API/UI. Supply an
   explicit JSON object mapping every image reference to its verified local file.
2. Run `python dnd/vtt/tools/build-scene-map-package.py scene.json --assets images.json --output map.vttmap`.
   Relative image paths resolve beside the mapping JSON. No credentials or remote
   fetching are used. Missing/extra images fail packaging rather than disappearing.
3. In GM Scenes, choose **Import scene package**, select the `.vttmap`, review its
   scene/floor counts and approve browsing. Ordinary scene JSON remains supported.
4. Import uploads assets directly through the authenticated GM image endpoint,
   rewrites only documented image fields, and installs one new scene through the
   existing Sync V2 idempotent importer. No temporary scenes are created. Canonical
   recovery confirms the new board before offering Open copy for GM. Scene folder
   placement retains the existing Unsorted import behavior; activation is separate.

Limits: 128 MB complete package, 64 images, 40 MB each image, existing 16 MB scene
JSON validation. JPEG/PNG/GIF/WebP only; the server still validates actual decoding
and dimensions. Retrying within the same preview reuses accepted uploads and the
same scene operation; do not choose the file again after an uncertain scene response.
Failed image uploads create no scene; successfully uploaded assets can remain if
an import is abandoned. Package transfer does not deploy code or character sheets.

Focused tests: `node --test dnd/vtt/assets/js/ui/__tests__/scene-map-bundle.test.mjs`.
