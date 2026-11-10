# VTT movement audit — handoff (November 9–10, 2026)

Read-only audit of how tokens move on the Draw Steel VTT (`dnd/vtt`). **No code was changed.**
This file is for whoever picks the work up next. Brandon has seen the findings in plain language
and has not yet said which to fix; see "Decisions waiting on Brandon" before touching anything.

## How to read the status column

- **ran** — reproduced by running the repo's own modules in node/PHP (scripts at the end).
- **read** — traced end to end in the code, not executed.
- **reviewer** — reported by a parallel review pass; not independently re-checked. Re-verify before fixing.

## Where the movement code lives

| Concern | File |
|---|---|
| Per-turn counter ("Moved X / speed"), Ctrl+Z in the controller | `dnd/vtt/assets/js/token-system/token-movement-controller.js`, `movement-state.js` |
| Reach outline search | `dnd/vtt/assets/js/token-system/movement-math.js` (`buildReachableMovementShape`), `movement-overlay.js` |
| Speed lookup | `dnd/vtt/assets/js/token-system/speed-resolver.js` |
| Step and route pricing | `dnd/vtt/assets/js/ui/terrain-math.mjs` (`routeSteps`, `stepCost`), `terrain-zones-overlay.js` (`routeCost`, `cellInfoFor`), `terrain-prototype.js` (`routeNow`) |
| Drag ruler | `dnd/vtt/assets/js/ui/drag-ruler.js`, `drag-route.mjs` |
| Drag end / commit | `dnd/vtt/assets/js/ui/token-interactions.js` (`endTokenDrag`), `board-interactions.js` (`commitCanonicalTokenMovesNow` ~1552, `measureMovementRoute` ~1493, `moveFromCoordinates` ~29772) |
| Forced movement | `dnd/vtt/assets/js/ui/forced-drag.js` paired with `dnd/vtt/lib/ForcedMovement.php` |
| Opportunity attacks | `board-interactions.js` ~3432–3453, `movement-adjacency.js` |
| Grabs | `board-interactions.js` ~2658–2760 (`grabsAfterMove`) |
| Server move validation | `dnd/vtt/lib/SyncV2Store.php`, `WallMovement.php`, `FloorGeometry.php`, `FallOutcome.php`, `TeleportLanding.php` |

`board-interactions.js` is 30,000 lines; line numbers are as of this audit and will drift.

Design facts to respect: the app warns rather than blocks in most places (the Director can override);
the Director is not stopped by walls; browser and server each compute forced-move collisions and must
agree or the server refuses with "Collision changed". Behaviour pinned by a test or a dated
"Brandon, <month> 2026" comment is deliberate.

## Findings

### Movement counter

| # | Finding | Status | Intended? | Notes for the fix |
|---|---|---|---|---|
| 1 | A 2D drag with corners is charged as the straight line once dropped. `endTokenDrag` cancels the ruler before the commit; `measureMovementRoute` then reads an empty ruler and prices `[from, to]`. | read | No. The 3D path keeps `coordinateMovementRuler` for exactly this. | `commitCanonicalTokenMovesNow` already has the route (`drawnRuler`); pass it through to `handleDragCommitted` / `measureMovementRoute`. App-supplied stair corners are lost the same way. Works today only when the Measure tool is on. |
| 2 | Teleport and forced drags add to movement spent. Teleport: `measureMovementRoute` returns null, `moveCost` falls back to Chebyshev. Forced: recorded like a walk. | ran | Unclear. `docs/terrain-zones-status.md` says they do not pay for terrain; nothing says whether they count against speed. In Draw Steel they do not. | Ctrl-drag is also the Director's "just put it there" tool; if forced stops counting, a Director who walks monsters by Ctrl-drag loses the count. Needs Brandon's answer. |
| 3 | Ctrl+Z during a running turn restores the token but not the counter. The window capture handler (`board-interactions.js` ~2116) runs `performTurnUndo` and stops propagation; the controller never hears it. | read | No. `turn-undo.test.mjs` expects the refund; `docs/turn-undo.md` says Ctrl+Z undoes the newest action. The "Undo move" button (`undoSelectedMove`) refunds correctly. | Only refund when the undone step was a move of that token. Side issue (reviewer): the window handler returns early on `event.repeat` without preventing the event, so a held Ctrl+Z can fall through to the controller's undo-everything loop. |
| 4 | Slowed, Grabbed, Restrained and Prone do not affect speed, cost or the outline. A grabber is not halved. | read | Known deferral: `docs/vtt-improvement-plan.md` ~560 says "Custom effective-speed modifiers remain manual." | Needs Brandon's answer. If done, keep it display-only and overridable. |
| 5 | Changing a flier's height costs no movement. `addMovementCost` is called only from the fall review's "climbed down". | read | Unknown. | The height control is also used for setup and corrections; charging it would spend movement wrongly. Recommended: leave. |

### Reach outline and ruler

| # | Finding | Status | Intended? | Notes for the fix |
|---|---|---|---|---|
| 6 | The outline search has no wall check and walks through enemies at cost 1; enemy squares are only drawn as boxes on top. Enemy spaces are never priced as difficult terrain; the `moveThroughCreatures` rule is collected and never used. | ran | The boxes are deliberate; the rest looks unfinished. | An outline that follows walls can reveal secret doors or unseen rooms to players, and costs more per drag. Hidden tokens are already skipped; keep that. |
| 7 | A no-corner 2D leg is priced diagonal-first, so cost depends on direction: with a x2 square at (3,3), (2,2)→(5,3) costs 4, the reverse costs 3, and the outline says 3. | ran | Diagonal-first is a drawing choice; the lopsided price is a by-product. | If the price moves to the cheapest path, the drawn line and the submitted path must follow it. |

### Forced movement

| # | Finding | Status | Intended? | Notes for the fix |
|---|---|---|---|---|
| 8 | A non-orthogonal push collides at step 0 with a creature beside the path. Mover (5,5), bystander (6,5), push to (8,8): no movement, 3 damage each. `forced-drag.js:14-19`, `ForcedMovement.php:18-23` sweep the whole box along the true line. | ran (JS); reviewer ran PHP | No. The true straight line is Brandon's choice; clipping neighbours is not. | Change browser and server together. Check 2x2 movers. |
| 9 | A creature directly behind a wall is hit through it: creature collision (3 each) where a wall slam (2 + 3 = 5, other creature untouched) is right. The wall is probed only at the stop point. `forced-drag.js:25`, `ForcedMovement.php:32`. | ran (JS with a stub wall); reviewer ran PHP with the test wall model | No. | Same two-places caution. Add a test for a push through a breakable wall into a creature. |
| 10 | An ability's slide goes straight from the picker and slams into what a slide could round. `board-interactions.js` ~21381–21395. | reviewer | No; the October 10 ruling is that slides go round things, and the Ctrl-drag slide does. | Either let the picker take corners or auto-route; auto-routing chooses the path for the player. |
| 11 | A Ctrl-drag slide with corners fires `forcedMovement` / `forcedMovementDealt` once per leg, each with that leg's distance and `verb:'push'`. `board-interactions.js` ~1585 and ~1713. | reviewer | Per-leg commits are deliberate; per-leg announcements look like a by-product. | One event with the total would reduce what per-leg triggers currently give. |
| — | Browser treats any `fly` token as airborne for cross-level collisions; server (`FloorGeometry::isAirborne`) excludes prone/grabbed/restrained/unconscious fliers. Narrow; ends in a "Collision changed" refusal. | reviewer | No. | Low priority. |

### Opportunity attacks and grabs

| # | Finding | Status | Intended? | Notes for the fix |
|---|---|---|---|---|
| 12 | Adjacency change is computed from the move's two ends only (`movementAdjacencyChanges(from, to, …)` at ~3441); `detail.path` is used a few lines later for distance but not here. Walking past an enemy, or leaving and returning in one drag, flags nothing. | read | No. | Walk the legs. Flags are reminders only. |
| 13 | A grabber walking with its captive gets `__opportunityAttack__` flagged from the captive: `vtt:token-moved` fires before `grabsAfterMove` brings the captive along. | reviewer | No. | Skip watchers grabbed by the mover. |
| 14 | `grabsAfterMove` (~2687) ends the grab on any move of the grabbed creature, with no adjacency test. | read | Largely yes: the dated comment at ~2658 says a grabbed creature "moved any other way" ends the grab. Only the still-adjacent case differs from the book. | Recommended: leave. |
| 15 | Arrow keys always send a walk; Shift is ignored (`movementFromKey`, ~7958). | reviewer | Unknown. | Check Shift+Arrow is not used elsewhere first. |
| — | "Undo move" on a multi-token move refunds only the first selected token; a grabber undone in a group can leave its captive behind with Grabbed still on. | reviewer | No. | Low priority. |

### Server

| # | Finding | Status | Intended? | Notes for the fix |
|---|---|---|---|---|
| 16 | A walk or shift can end on another creature's square; only forced moves call `ForcedMovement::assertClear` (`SyncV2Store.php` ~2170). No client warning. | reviewer (ran PHP) | Possibly tolerated; `docs/vtt-edge-case-audit-2026-09-26.md` asks for this only on teleports. | Warn, do not block: mounts, objects, bodies and squads stack. |
| 17 | A drop mid-walk is not a fall if the move ends back at height: `FallOutcome.php` compares against the final destination only. A corner on a chasm floor then up the far side records nothing; a straight drag over a wide gap is a free crossing. | reviewer (ran PHP) | Level travel across a gap is deliberate for pushes (`travel-height.test.mjs`). Unpinned for walkers. | Riskiest item: uneven ground, cracks and stairs could start producing falls. Recommended: leave unless asked. |
| 18 | Teleport falls use `floor(height − landing)` (`TeleportLanding.php:41`); all others round to nearest (`FallOutcome.php:33`). 2.6 up is no fall by teleport, 3 squares otherwise. | reviewer | No; the FallOutcome comment names nearest as the rule. | Small. |
| — | Diagonal steps are refused by anything the swept square touches (a small pillar, a half-length stub), not only by objects that fill the corner. Stricter than the book, never looser. | reviewer | Unknown. | Rules question, not a bug. |
| — | With `climbLow` true a walk may pass diagonally between two 1-high blocks; the server trusts the flag. | reviewer | Follows the low-barrier ruling. | Leave. |

### Checked and found right

Wall checks (diagonal corner-cutting refused, whole footprint swept for large tokens, waypoints
checked leg by leg); fall damage formula and the 3-square minimum; remaining-squares collision
damage; push/pull legality for 2x2 and 3x3; Stability arithmetic (clamped at 0); shift, teleport and
undo moves not provoking; `addToLastMove` followed by undo; keyboard queue ordering.

## Suggested order

1. Items **1, 3, 8, 9, 13** — plain mistakes, contained fixes, no decision needed.
2. Items **12, 18, 10** — mistakes with small behaviour changes.
3. Everything else waits on the decisions below.

## Decisions waiting on Brandon

- **Item 2:** should Ctrl-drag stop counting as movement even when the Director uses it as a plain move? Should teleport stop counting?
- **Item 4:** conditions change speed automatically, or stay manual as the plan says?
- **Items 6 and 16:** honest outline and an occupied-square warning, or leave alone?
- **Item 7 and 11:** change the price / announcement, accepting the side effects noted?
- **Items 5, 14, 17:** recommended to leave; confirm.

## Rules to check against the book before coding

- Whether a smaller creature force-moving a larger one loses 1 distance (code applies only the +1 for larger-moves-smaller; `sizePenalty: 0` at `board-interactions.js` ~20825).
- Exact wording of the opportunity-attack trigger (leaves adjacency vs leaves an adjacent square).
- Moving through an enemy's space as difficult terrain, and when a creature may end in another's space.
- Grabber speed halving and its rounding.

## Repro scripts

Run from the repository root with `node file.mjs` (the scratch copies from the audit session are gone).

Counter charges every movement kind, and the outline ignores an enemy in a corridor:

```js
import { createTokenMovementController } from './dnd/vtt/assets/js/token-system/token-movement-controller.js';
import { buildReachableMovementShape } from './dnd/vtt/assets/js/token-system/movement-math.js';
const cheb = (a, b) => Math.max(Math.abs(a.column - b.column), Math.abs(a.row - b.row));
function run(kind) {
  const c = createTokenMovementController({
    mapTransform: null,
    getCombatContext: () => ({ active: true, sceneId: 's', round: 1, activeCombatantId: 'hero' }),
    getPlacementById: (id) => ({ id, column: 2, row: 2, width: 1, height: 1, speed: 5 }),
    // as measureMovementRoute behaves: null for a teleport, plain distance for a forced move
    measureRoute: ({ from, to, movementKind }) => (movementKind === 'teleport' ? null : cheb(from, to)),
  });
  c.syncCombatTurn();
  const o = new Map([['hero', { column: 2, row: 2 }]]);
  c.handleDragStart({ primaryToken: { id: 'hero', column: 2, row: 2 }, originalPositions: o });
  c.handleDragEnd({ commit: true, moved: true });
  c.handleDragCommitted({ sceneId: 's', movedIds: ['hero'], originalPositions: o, preview: new Map([['hero', { column: 6, row: 2 }]]), movementKind: kind, source: 'drag' });
  return c.getMovementLeft('hero');
}
for (const k of ['walk', 'shift', 'forced', 'teleport']) console.log(k, JSON.stringify(run(k))); // all: spent 4, left 1
const s = buildReachableMovementShape({ origin: { column: 5, row: 5 }, remaining: 2, cellInfo: (c, r) => ({ height: 0, multiplier: (r === 4 || r === 6) ? 9 : 1 }), blockers: [{ column: 6, row: 5 }], bounds: { minColumn: 0, minRow: 0, columns: 20, rows: 20 } });
console.log(s.cells.some(([c, r]) => c === 7 && r === 5)); // true: reached straight through the enemy
```

Route price depends on direction:

```js
import { routeSteps } from './dnd/vtt/assets/js/ui/terrain-math.mjs';
const mult = (c, r) => (c === 3 && r === 3 ? 2 : 1);
console.log(routeSteps({ column: 2, row: 2 }, { column: 5, row: 3 }, () => 0, mult).cost); // 4
console.log(routeSteps({ column: 5, row: 3 }, { column: 2, row: 2 }, () => 0, mult).cost); // 3
```

Forced-move collisions:

```js
import { resolveForcedDrag } from './dnd/vtt/assets/js/ui/forced-drag.js';
const m = { id: 'a', column: 5, row: 5, width: 1, height: 1 };
const b = (column, row) => [{ id: 'b', column, row, width: 1, height: 1 }];
console.log(resolveForcedDrag(m, { ...m, column: 8, row: 8 }, b(6, 5)));   // stays at 5,5; damage 3; hits b
console.log(resolveForcedDrag(m, { ...m, column: 6, row: 6 }, b(6, 5)));   // stays; damage 1
const wallBlocked = (from, to) => to.column > 6;
console.log(resolveForcedDrag(m, { ...m, column: 9, row: 5 }, b(7, 5), { wallBlocked })); // damage 3, hits b, wall:false
console.log(resolveForcedDrag(m, { ...m, column: 9, row: 5 }, [], { wallBlocked }));      // damage 5, wall:true
```

## Before changing anything

- Read `CLAUDE.md` and `AGENTS.md`; map and sandbox data must not be rebuilt or overwritten.
- Tests: `npm test` (runs `dnd/vtt/tools/run-regression-suite.cjs`); PHP tests under `dnd/vtt/api/v2/tests`.
- Add a test for each fix next to the existing ones (`token-system/__tests__`, `ui/__tests__`, `api/v2/tests`).
- After changes, the version shown bottom-right should move (see CLAUDE.md, Version System).
