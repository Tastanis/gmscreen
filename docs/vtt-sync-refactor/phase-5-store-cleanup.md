# Phase 5 — Clean Up `store.js`

> **Prerequisite reading:** `README.md`, `diagnosis-findings.md` (finding C8 and F2), `pre-flight-investigation.md`. At least the first few Phase 4 extractions should be done so you have the refactor rhythm.

## Context

`dnd/vtt/assets/js/state/store.js` is 2,128 lines. It mixes:

- The public store API (`createStore`, `getState`, `setState`, `subscribe`, `notify`).
- ~40 normalization helper functions for every state shape (placements, templates, drawings, pings, overlay, combat, monsters, fog, scene, grid).
- Player-view filtering functions.
- `syncBoardOverlayState()`, which rebuilds overlay masks on **every single state update** (diagnosis finding C8 — this is a performance tax on top of everything else).

This phase does two things:

1. **Split the 40+ normalizers into submodules** under `state/normalize/`. Matches the Phase 4 methodology.
2. **Stop rebuilding overlay state on every notify** — only rebuild when the overlay or scene actually changed.

The overlay rebuild fix is a correctness-ish fix, not just structure, so it is slightly more delicate.

## Prerequisites

- Ideally some Phase 4 extractions done so you're comfortable with the refactor rhythm.
- Tests green.
- No Phase 3 dependency, but if Phase 3 is done, coordinate: delta ops may have introduced their own application paths through the store.

## Files you will need to load into memory

1. **`dnd/vtt/assets/js/state/store.js`** — the whole file.
2. **`dnd/vtt/assets/js/state/__tests__/*.test.mjs`** — every test file here. Store has good test coverage; you need to know what's asserted so you don't break it.
3. **Any file that imports from `store.js`** — run a grep to enumerate.

## Investigation

1. **Enumerate the normalizer functions:**
   ```
   Grep for "^function normalize" in dnd/vtt/assets/js/state/store.js
   Grep for "^const normalize" in dnd/vtt/assets/js/state/store.js
   ```
   Produce a list. Each one should become either its own file under `state/normalize/` or a sibling in a category file (e.g. all placement normalizers in `state/normalize/placements.js`).

2. **Check which normalizers are also exported:**
   ```
   Grep for "export" in dnd/vtt/assets/js/state/store.js
   ```
   Any exported normalizer has external consumers. Those consumers' imports will need to be updated after the move.

3. **Find `syncBoardOverlayState`:**
   ```
   Grep for "syncBoardOverlayState" in dnd/vtt/assets/js/state/store.js
   ```
   Read the whole function and every caller. Confirm it is called inside `notify()`.

4. **Find `notify()` and its callers.** Look at how often it fires.

## Gotchas

- **Normalizers are called by each other and by `setState`.** When you move them to submodules, they need to import each other. Watch for cycles. Example: `normalizePlacement` may call `normalizeToken` — if placements live in `normalize/placements.js` and tokens live in `normalize/tokens.js`, that's fine. But if they cross-reference, keep both in mind.
- **`store.js` has a huge test file** (or several). Before any change, open every test under `state/__tests__/` and scan for hardcoded imports of specific normalizer functions. If tests import `normalizeOverlay` by name from `store.js`, moving it will break them — update the import.
- **Overlay rebuild is performance-sensitive.** Every state update currently triggers `syncBoardOverlayState()`. If the overlay is complex, this is already a bottleneck. The fix is to only rebuild when the overlay or scene actually changed. But you must be careful: if you skip rebuilds when the overlay did change but you didn't detect it, you'll get stale overlay rendering. Use a dirty flag or a diff check on the overlay slice.
- **`notify()` has subscribers throughout the codebase.** Do not change its signature. You can add more arguments (e.g. a "changed keys" hint) but don't remove any.

## The change

### A. Create `state/normalize/` with submodules

For each normalizer category, create a file:

```
dnd/vtt/assets/js/state/normalize/
  placements.js
  templates.js
  drawings.js
  pings.js
  overlay.js
  combat.js
  monsters.js
  fog.js
  scene.js
  grid.js
  index.js  (re-exports for convenience)
```

Each file exports its normalizers. The `index.js` re-exports everything so that:

```js
import { normalizePlacement, normalizeOverlay, /* ... */ } from './normalize/index.js';
```

replaces the old direct definitions in `store.js`.

Do this incrementally: one category per commit. Start with the smallest and simplest (probably `grid.js` or `pings.js`). Finish with the biggest (`overlay.js` and `combat.js`).

### B. Update `store.js` imports

After each category is moved, update `store.js`:

```js
import {
  normalizePlacement,
  normalizePlacementsArray,
  // ...
} from './normalize/placements.js';
```

Delete the now-moved function definitions.

### C. Fix the overlay rebuild-on-every-notify

This is a separate commit from the category moves. Do it after `normalize/overlay.js` is extracted.

Find `syncBoardOverlayState` and its call site inside `notify()`. It currently looks approximately like:

```js
function notify() {
  syncBoardOverlayState();  // always runs
  for (const subscriber of subscribers) {
    subscriber(currentState);
  }
}
```

Change to:

```js
let overlayDirty = false;

function markOverlayDirty() {
  overlayDirty = true;
}

function notify() {
  if (overlayDirty) {
    syncBoardOverlayState();
    overlayDirty = false;
  }
  for (const subscriber of subscribers) {
    subscriber(currentState);
  }
}
```

Then find every place the overlay state is mutated and call `markOverlayDirty()` there. That includes:
- `setState` when the state's overlay slice differs from the previous.
- Direct overlay mutations (there may or may not be any).
- Scene changes (switching scenes requires an overlay rebuild because the overlay is per-scene).

For the "state differs" check, do a shallow compare of the overlay slice: if `newState.overlay !== prevState.overlay`, mark dirty. Don't deep-compare — trust the store's immutability conventions if it has any.

**Gotcha:** if you mark dirty everywhere *except* one code path, the overlay will silently be stale. Strongly consider setting `overlayDirty = true` as the default for the initial state apply, and only optimizing away the rebuild for the narrow case "this notify is for a non-overlay change."

### D. Add a test for the overlay dirty-tracking

```
state/__tests__/overlay-dirty-tracking.test.mjs
```

Cases:
1. Calling `setState` with an overlay change triggers `syncBoardOverlayState` on next notify.
2. Calling `setState` with no overlay change does NOT trigger `syncBoardOverlayState`.
3. Switching active scene triggers a rebuild.
4. Initial load triggers a rebuild.

## Verification

1. JS tests all pass:
   ```bash
   cd /home/user/gmscreen/dnd/vtt && npm test
   ```

2. Open VTT in browser. Drag a token. The overlay should still render correctly and not flicker.

3. Open the JS console. Count how often `syncBoardOverlayState` runs during a normal session:
   ```js
   // Temporarily patch to count calls
   const origSync = window.__syncBoardOverlayState;
   let count = 0;
   window.__syncBoardOverlayState = () => { count++; origSync(); };
   // ... play for 30 seconds ...
   console.log('overlay rebuilds:', count);
   ```
   Before the fix: expect ~10-50 per minute (once per state tick). After: expect <5 per minute (only when overlay actually changes).

## Rollback

Each category move is its own commit. The overlay dirty-tracking fix is its own commit. Revert individually:

```bash
git revert <commit-hash>
```

## Commit messages

### Per-category move:
```
vtt-sync: phase 5 move <category> normalizers to state/normalize/<file>

Extract normalize<Thing> and related helpers from store.js into a new
submodule. Re-exported from state/normalize/index.js. store.js now
imports them. Behavior unchanged.
```

### Overlay dirty-tracking:
```
vtt-sync: phase 5 only rebuild overlay state when it actually changed

syncBoardOverlayState used to run inside notify() on every state
update, which on a busy session could trigger a full overlay rebuild
dozens of times per minute. Now a dirty flag is set whenever the
overlay slice of state is replaced (including scene switches and
initial load), and notify() only calls the rebuild when dirty.

Adds state/__tests__/overlay-dirty-tracking.test.mjs.
```
