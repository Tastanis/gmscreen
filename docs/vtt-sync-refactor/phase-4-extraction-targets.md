# Phase 4 — Extraction Targets

> **Prerequisite reading:** `README.md`, `diagnosis-findings.md` (finding F1), `pre-flight-investigation.md`, **`phase-4-methodology.md` (mandatory)**.

## How to use this file

This file lists the specific targets to extract from `board-interactions.js`, in recommended order. For each target, read the section below, then follow the 8-step process in `phase-4-methodology.md`. Each target is one commit. You can stop after any target and resume later.

After each extraction, update the "Status" column in your working notes. This doc does not track progress — commit history does.

## Recommended order

The targets are listed easiest-to-hardest. Do not skip ahead. Earlier extractions make later ones cleaner because they reduce the total surface area you have to understand at once.

| # | Target | Approx. lines | Difficulty | New file |
|---|---|---|---|---|
| 1 | Board state poller | ~300 | Easy (has tests) | `services/board-state-poller.js` |
| 2 | Condition tooltips | ~280 | Easy | `ui/condition-tooltips.js` |
| 3 | Indigo rotation animation | ~80 | Easy | `ui/indigo-rotation.js` |
| 4 | Stamina sync | ~200 (+ 100 from token-library.js) | Medium | `services/stamina-sync-service.js` |
| 5 | Map pings | ~340 | Medium | `ui/map-pings.js` |
| 6 | Array/section merge utilities | ~250 | Medium | `utils/merge-helpers.js` |
| 7 | Token drag and selection | ~600 | Hard | `ui/token-interactions.js` |
| 8 | Overlay tool | ~2,000 | Very hard | `ui/overlay-tool.js` |
| 9 | Template tool | ~1,500 | Very hard | `ui/template-tool.js` |

After all nine are done, `board-interactions.js` should be somewhere around 13,000-14,000 lines — still big, but the remaining code is mostly the orchestrator that wires everything together, and the really dangerous islands (overlay, template) will be their own files with their own tests.

---

## 1. Board state poller

**Approximate line range in `board-interactions.js`:** ~76-370, around the `createBoardStatePoller` / `startBoardStatePoller` definitions. Look for `BOARD_STATE_POLL_INTERVAL_MS` and the poll function.

**After Phases 1-1 and 1-2** the poller has a `reconfigure` method and a tracking variable for the handle. That's good — the public surface is already defined.

**New file:** `dnd/vtt/assets/js/services/board-state-poller.js`

**Target shape:**
```js
export function createBoardStatePoller({
  endpoint,
  fetchFn,
  windowRef = window,
  boardApi,
  isPusherConnected,
  onStateUpdated,
  getCurrentVersion,
  // ... any other deps ...
}) {
  // ... poll function, internal state ...
  return { start, stop, reconfigure };
}
```

**Gotchas:**
- `createBoardStatePoller` probably already exists as a factory — the extraction is mostly moving code out, not restructuring.
- The existing tests in `__tests__/board-state-poller.test.mjs` already mock these dependencies. Use them as the signature hint: whatever the tests inject is the factory's parameter list.
- `hasPendingSave` checks inside the poll function read module-level state. Pass `getPendingSaveInfo` as a callback.
- After extraction, `board-interactions.js` imports `createBoardStatePoller` from the new file and uses it exactly as today.

**Commit message template:**
```
vtt-sync: phase 4 extract board state poller to services/board-state-poller.js

Move the board state polling factory (~300 lines) out of
board-interactions.js. Dependencies are now passed explicitly.
Existing tests in __tests__/board-state-poller.test.mjs required no
changes because they already exercised the factory shape. Behavior
unchanged.
```

---

## 2. Condition tooltips

**Approximate line range:** ~1210-1490 in `board-interactions.js`. Look for tooltip DOM creation code, `condition` handling, and hover listeners.

**New file:** `dnd/vtt/assets/js/ui/condition-tooltips.js`

**Target shape:**
```js
export function createConditionTooltips({ boardRoot, getPlacementById, ... }) {
  // Tooltip element lives in this closure.
  return { attach, detach, refresh };
}
```

**Gotchas:**
- Condition tooltips depend on placement data. Pass a `getPlacementById` accessor instead of reaching into the store.
- If there's a tooltip DOM element that is created once and reused, keep it as closure state, not module state.
- Check if any CSS selectors are used — if the CSS is tied to specific class names on the tooltip element, do not change those names.
- No existing tests cover this specifically. Add a smoke test that creates the factory, attaches to a fake DOM, and asserts the tooltip element is created.

---

## 3. Indigo rotation animation

**Approximate line range:** ~1686-1761. Look for `INDIGO_ROTATION_INTERVAL_MS` and `indigoRotationIntervalId`.

**New file:** `dnd/vtt/assets/js/ui/indigo-rotation.js`

**Target shape:**
```js
export function createIndigoRotation({ windowRef, stepRotation }) {
  let intervalId = null;
  return {
    start() { ... },
    stop() { ... },
  };
}
```

**Gotchas:**
- `stepIndigoRotations` is probably called from inside the interval tick. Pass the step function as a dependency or move it to the new file too (check if anyone else calls it).
- The rotation interval is ~seconds, not milliseconds. Don't break the cadence.
- This is the smallest, simplest extraction. Use it as a warmup to validate the methodology on a low-risk target.

---

## 4. Stamina sync

**Approximate line range in `board-interactions.js`:** ~32-74 (BroadcastChannel side).
**Approximate line range in `token-library.js`:** ~7-40 and ~109-127 (cache side).

**This extraction is unique: it consolidates code from TWO files into ONE new file.**

**New file:** `dnd/vtt/assets/js/services/stamina-sync-service.js`

**Target shape:**
```js
export function createStaminaSyncService({ broadcastChannelName, staminaEndpoint, fetchFn }) {
  // ... cache, broadcast listeners, fetch functions ...
  return { getStamina, setStamina, onChange, flush };
}
```

**Gotchas:**
- **Two files import this.** You need to update both `board-interactions.js` and `token-library.js` to use the new service.
- **Tests for stamina sync exist.** Search `__tests__` for `stamina-sync`, `bidirectional-stamina-sync`, `stamina-sync-extended`. These tests currently exercise both sides of the feature. Make sure they still pass after consolidation. They may need to be updated to exercise the new service directly rather than poking at both files.
- **BroadcastChannel lifecycle** — the old code probably creates the channel at module load. The new factory should create it when called. Make sure you don't double-create if both consumers call the factory.
- Consider adding a module-level singleton guard so both importers get the same service instance:
  ```js
  let sharedInstance = null;
  export function getStaminaSyncService(opts) {
    if (!sharedInstance) sharedInstance = createStaminaSyncService(opts);
    return sharedInstance;
  }
  ```

---

## 5. Map pings

**Approximate line range:** ~4620-4960. Look for `ping`-related functions, ping DOM creation, animation.

**New file:** `dnd/vtt/assets/js/ui/map-pings.js`

**Target shape:**
```js
export function createMapPings({ boardRoot, getTransform, dispatchOp }) {
  // ... DOM containers, ping lifecycle ...
  return { spawnPing, removeExpired, handleIncomingPing };
}
```

**Gotchas:**
- Pings animate over time. They probably have their own `requestAnimationFrame` loop or a set of `setTimeout`s for expiration. Make sure lifecycle cleanup (`removeExpired`) is called on teardown.
- Pings interact with the view transform (zoom, pan). Pass a `getTransform` accessor rather than reading a global.
- Pings are broadcast over Pusher. After Phase 3-C, they may be part of the ops stream. Coordinate: if you haven't done Phase 3-C, just keep pings as their own "event type" in the broadcast and extract the consumer side.

---

## 6. Array/section merge utilities

**Approximate line range:** ~574-823. Generic utility functions like `mergePlacementArrays`, `mergeSectionById`, etc.

**New file:** `dnd/vtt/assets/js/utils/merge-helpers.js`

**Gotchas:**
- These are pure functions. No module state. Easy to extract.
- They may be imported by the store (`store.js`) already. Check — the diagnosis mentioned the store does its own normalization. If `board-interactions.js` has duplicates, consolidate; if they're different, extract separately and reconcile in Phase 5 or 6.
- **Write unit tests for each utility as part of the extraction.** They're pure functions, so tests are easy and high-value.

---

## 7. Token drag and selection

**Approximate line range:** ~3917-4495. Look for `dragPreview`, `selectionBox`, `commitDragPreview`.

**New file:** `dnd/vtt/assets/js/ui/token-interactions.js`

**This is where phase 4 gets hard.**

**Gotchas:**
- **Global mutable state: big list.** `isApplyingState`, token selection set, drag preview state, selection box state, last click target, double-click timer. Each needs to be mapped before extraction.
- **Tests are heavy.** `__tests__/token-visibility-merge.test.mjs`, `__tests__/token-settings-aura-size.test.mjs`, `__tests__/bidirectional-stamina-sync.test.mjs`, `__tests__/board-interactions.test.mjs` all exercise drag paths. Expect to update several tests.
- **Keyboard interactions.** Drag is triggered by pointer events; selection uses ctrl/shift modifiers. Every listener registration needs to be identified and moved.
- **Ops emission.** If Phase 3-B is done, drag commits call `queueOp({ type: 'placement.move', ... })`. Pass the op queue as a dependency.
- **Do this extraction only after #1 through #6 are done.** You need practice and a smaller file to work with.

**Strongly consider running an Explore agent** before starting this one to produce a full dependency map. Example prompt:

> "Read `dnd/vtt/assets/js/ui/board-interactions.js` lines 3900-4500. Find every function that participates in token dragging or selection. For each function, list: (a) module-level variables it reads, (b) module-level variables it writes, (c) functions it calls that are defined OUTSIDE this range, (d) DOM queries it performs. Report as a dependency map. Do not suggest changes."

---

## 8. Overlay tool

**Approximate line range:** ~16005 onward. Look for `createOverlayTool()`.

**New file:** `dnd/vtt/assets/js/ui/overlay-tool.js`

**The hardest extraction. Save for last or second-to-last.**

**Gotchas:**
- ~2,000 lines. This is a whole sub-application.
- The overlay tool is GM-only. Hidden when the user is not GM. Extraction must preserve this gate.
- **It modifies the fog of war state**, which is tracked separately. It writes to `store.js` overlay state. Changes ripple through `syncBoardOverlayState()` (see diagnosis C8). Touching extraction here interacts with Phase 5.
- It has its own DOM subtree, its own event listeners, its own command history (undo/redo?), its own tool palette.
- **Do a mega-investigation first.** Spend real time reading the whole factory before extracting. Produce a written dependency map. Consider extracting in multiple passes — first the public factory shell, then the internal tools, then the undo stack, etc.
- **Test coverage is uncertain.** Check `__tests__/fog-store-integration.test.mjs`, `__tests__/visibility-flush.test.mjs`. These may or may not cover the overlay tool's internals.

**It is acceptable to partially extract this target.** If you can get the factory and its public methods into the new file, but some helper utilities stay in `board-interactions.js` temporarily, that's progress. Commit partial extractions with a TODO note.

---

## 9. Template tool

**Approximate line range:** ~17244 onward. Look for `createTemplateTool()`.

**New file:** `dnd/vtt/assets/js/ui/template-tool.js`

**Gotchas:**
- Similar scale and complexity to the overlay tool: ~1,500 lines.
- Templates are area-of-effect markers for spells: cones, circles, squares. Each shape has its own drawing logic.
- Templates sync over Pusher and the save pipeline. If Phase 3-B/3-C are done, they emit `template.upsert` ops. If not, they go through the snapshot path.
- Like the overlay tool, this is a good candidate for the Explore-agent-first approach.

---

## When you're done

After all nine extractions are committed:

1. Run the full test suite one more time. Green.
2. Open `board-interactions.js` and confirm the remaining code is primarily orchestration and wiring, not feature logic.
3. Update the README.md's glossary if any term has moved (e.g. "the overlay tool now lives in `ui/overlay-tool.js` instead of `board-interactions.js`").
4. Tell the user: "Phase 4 done. board-interactions.js went from 19,969 lines to <whatever>. Here are the new files. Editing should now feel much safer."

Phase 5 (`phase-5-store-cleanup.md`) is the logical next step: clean up `store.js` the same way you cleaned up `board-interactions.js`. But take a break first — Phase 4 is a lot.
