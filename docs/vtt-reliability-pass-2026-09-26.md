# Map reliability pass - September 26, 2026

Scope: canonical creature collision checks, durable Ctrl-drag collision outcomes,
polygon floor support, and the four requested validation passes. Sandbox release
1.19.222/build 466; tracked helpers 1.19.155/build 399. No production deployment.

## Changes

- `ForcedMovement.php` checks forced endpoints against the current creatures as
  well as walls/terrain. Ctrl-drag sends its intended destination; the server
  recomputes the stopping point and damage. A changed obstacle rejects a stale
  preview instead of accepting its stale damage. Voluntary/teleport rules remain
  separate. Existing overlapping tokens can separate. Airborne creatures compare
  physical altitude even when their nominal floors differ.
- Accepted Ctrl-drag collisions create per-target records in SQLite's
  `vtt_collision_effects` in the movement transaction. The client reserves each
  target before using the existing awaited damage adapter. A repeated reservation
  never grants execution again. Uncertain damage stays for GM review in Scenes >
  Zone entry recovery; resolving/dismissing never applies damage. This is durable
  recovery, **not atomic movement plus character-sheet damage**.
- `FloorSupport.php` and `ui/floor-support.js` implement the same positive-area
  footprint support over polygon plates, polygon holes and rectangular cutouts.
  Partial support counts; a touching edge alone does not. Overlapping holes are
  unioned. Floors without polygon plates retain legacy rectangular support.
  Server falls, checkpoint layout planning, and imported-map footing use this
  contract. Intersection work is limited to edges near the footprint.
- Checkpoint position restoration explicitly uses relocation/teleport semantics,
  not forced-movement collision semantics. Exact top-edge stair turnarounds are
  recognized without converting saved under-stair traversal into stair entry.
- Shared wall/surface documents activate the local terrain/vision renderer even
  when the scene image URL is absent from the built-in map registry.

## Four passes

1. **Multi-user:** separate GM, cal and sharon contexts; simultaneous player moves,
   six alternating door changes, offline/reconnect recovery of terrain edits,
   reload, and actual Ctrl-drag clipping plus confirmed damage to both creatures.
   In the clean Observatory run, door convergence was 465-703 ms using local
   polling with external delivery blocked. This does not measure production Pusher.
2. **Different map:** imported Observatory into a new scene through scene-import,
   with a changed image URL and remapped IDs. It loaded 144 wall segments, five
   surfaces and three ramps from shared state. All three stair routes passed up
   and down with walk, shift and teleport. Selected-token landing screenshots
   were inspected; no page errors in the import/stress pass. Stair-boundary
   turnaround has a separate regression.
3. **Persistence:** checkpoint restored terrain, surfaces and door states. Export
   and import/copy retained environment and ownership. Changed image URL still
   activated rendering; referenced roof media loaded in separate clients.
   Personal explored-mask migration, privacy, actual reload and reset passed.
   Non-owner players saw airborne ally tethers; Hidden suppressed the tether.
   Accepted movement interrupted before damage retained both pending targets
   after reload, and the real GM recovery panel listed them.
4. **Performance:** three browser contexts at 1280x800, 90 animation frames.
   Observatory with two tokens: median 17.6 ms, p95 18.1 ms. With 82 tokens:
   median 35.5 ms, p95 36.5 ms (about 28 fps). Elfsong, 2808x2592 image,
   1,133 wall segments and nine surfaces: median 17.9 ms, p95 18.1 ms.
   These are local headless Chrome measurements, not hardware-independent promises.
   Many tokens also enlarge the combat tracker; large encounters need a dedicated
   performance/layout pass rather than an unreviewed UI change here.

## Boundaries still open

- Authored ability-picker collision damage still uses its existing awaited
  damage path; the new per-target ledger currently covers Ctrl-drag collisions.
  It must be integrated without changing enemy movement authorization or authored
  damage types. Do not describe all ability damage as recoverable by this ledger.
- Creature vertical overlap is evaluated at initial horizontal contact. A slope
  causing overlap later during a long horizontal intersection needs a continuous
  or bounded sampled solver. Existing forced-flight terrain checks are separate.
- Floor deletion/environment-reference cleanup remains user-deferred. Changing
  elevations requires coordinated wall/surface/ramp heights. Upper-floor terrain
  painting, object destruction and movement-budget enforcement are not added.
- Exploration is per browser and player; map/terrain geometry changes can select
  another compatible mask. Refresh alone preserves it. New devices do not inherit it.
- Prototype packaging and production deployment are later work. Some runtime
  rendering/import files remain local and Git-ignored. Do not rebuild the sandbox
  or claim a fresh checkout includes these files.

## Reproduction and evidence

Read `docs/dungeon-alchemist-map-import.md` and `docs/vtt-sync-v2/README.md` first.
Use a separate runtime/catalog and SQLite backup, not a raw copy of a live DB.
This pass used loopback port 18779; the user's port 18769 retained its map state.
Native Dungeon Alchemist files and user token positions were not edited by these
stress tests. Temporary stress tokens existed only in the copied scene.

Local evidence is under `.playwright-mcp/terrain-prototype/final-test/`:
`reliability-report.json`, `reliability-large-map.json`, `reliability-browser.log`,
`reliability-stairs.log`, `stairs-recovery-result.json`, `collision-recovery.png`,
and `stairs-*-walk.png`. Helper scripts are `reliability-browser.cjs`,
`reliability-stairs.cjs`, and `reliability-large-map.cjs`. They deliberately mutate
the disposable application: do not retarget them to user scenes. Clear leftover
QA test tokens before rerunning collision scenarios; previous obstacles correctly
cause stale collision plans to be rejected. Set the GM's test floor before trying
to click a token on another floor. The checkpoint preview field is `baseRevision`.

Run `npm test` for the complete checked-in suite. Focused tests include
`collision-reliability.test.php`, `collision-effects.test.mjs`,
`floor-support.test.mjs`, `forced-drag.test.mjs` and `floor-geometry.test.php`.
`update-sandbox.py` updates code only; optional `TERRAIN_APP_PATH` must resolve to
a marked runtime beneath the fixture runtime directory. It never authorizes
replacing that runtime's database or uploads. Hard-refresh after code updates.
