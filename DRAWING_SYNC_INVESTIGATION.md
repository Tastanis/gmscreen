# VTT Drawing Sync Investigation - Handoff Document

## Executive Summary

**Drawings do NOT sync or persist.** After thorough investigation, I've identified multiple issues at different levels of the stack. The most critical finding is that **`board-state.json` does not exist on the server**, which means either:
1. No saves are being triggered from the client
2. Saves are failing silently
3. The API is never being called

---

## Investigation Findings

### Critical Discovery: No Server-Side Storage

```bash
$ ls -la /home/user/gmscreen/dnd/vtt/storage/
# board-state.json DOES NOT EXIST
# scenes.json DOES NOT EXIST
```

The storage directory exists and is writable, but no board state has ever been saved. This is the **root cause** - without server-side storage, nothing can persist or sync.

---

## Architecture Comparison: Templates vs Drawings

### Templates (WORKING)

| Step | What Happens |
|------|--------------|
| 1. Create | User creates template via UI |
| 2. Store | Updated directly in `templateTool.shapes[]` |
| 3. Notify | `templateTool.notifyMapState()` called unconditionally on every state change |
| 4. Persist | Included in `persistBoardStateSnapshot()` via `sanitizeTemplatesForPersistence()` |
| 5. Server | Saved to `board-state.json` |
| 6. Poll | Other users receive via poller |
| 7. Apply | `templateTool.notifyMapState()` updates UI |

### Drawings (BROKEN)

| Step | What Happens | Issue |
|------|--------------|-------|
| 1. Create | User draws via drawing tool | OK |
| 2. Store | `onDrawingChange` callback updates store | OK |
| 3. Notify | `syncDrawingsFromState()` has multiple guards | **PROBLEM** |
| 4. Persist | Should be included in `persistBoardStateSnapshot()` | **NEVER CALLED?** |
| 5. Server | Should save to `board-state.json` | **FILE DOESN'T EXIST** |
| 6. Poll | Other users should receive via poller | N/A - nothing to receive |
| 7. Apply | `setDrawingToolDrawings()` should update UI | N/A |

---

## Identified Issues

### Issue #1: `syncDrawingsFromState()` Has Too Many Guards

**File:** `dnd/vtt/assets/js/ui/board-interactions.js` (lines 4343-4380)

```javascript
function syncDrawingsFromState(boardState, activeSceneId) {
  if (!activeSceneId) return;                              // Guard 1
  if (isDrawModeActive() && isDrawingInProgress()) return; // Guard 2 - TOO RESTRICTIVE
  if (!isDrawingToolMounted()) return;                     // Guard 3 - Race condition fix

  // ... hash comparison ...

  if (isDrawingSyncPending()) {                            // Guard 4
    persistBoardStateSnapshot();                           // ONLY persists here
    return;
  }

  setDrawingToolDrawings(drawings);
}
```

**Problems:**
- **Guard #2** blocks ALL syncs when user is actively drawing - templates don't have this
- **Guard #4** only calls `persistBoardStateSnapshot()` when sync is pending, but what triggers this path?

### Issue #2: Drawing Tool Initialization Race Condition

**File:** `dnd/vtt/assets/js/bootstrap.js` (lines 55-75)

```javascript
// Order of operations:
mountBoardInteractions(...)  // Sets up state subscriber FIRST
mountDrawingTool(...)        // Drawing tool mounted SECOND
await hydrateFromServer(...) // Server data fetched THIRD
```

**Problem:** When `mountBoardInteractions` triggers `applyStateToBoard`, the drawing tool isn't mounted yet. My fix added `isDrawingToolMounted()` check, but this means:
- First call to `syncDrawingsFromState` returns early (tool not mounted)
- Hash is NOT updated
- When tool IS mounted and `hydrateFromServer` completes, hash should update
- BUT: Is `persistBoardStateSnapshot` ever called to actually SAVE?

### Issue #3: `persistBoardStateSnapshot()` May Never Be Called for Drawings

Looking at the call sites for `persistBoardStateSnapshot()`:

1. **In `syncDrawingsFromState`** - Only called when `isDrawingSyncPending()` is true
2. **In various event handlers** - Token moves, combat changes, etc.

**Question:** When a user draws, what triggers the actual save to server?

Tracing the flow:
1. User draws → `endDrawing()` → `scheduleSyncDrawings()`
2. After 100ms debounce → `onDrawingChange(drawings)` callback
3. Callback updates store: `draft.boardState.drawings[activeSceneId] = drawings`
4. Store update triggers subscriber → `applyStateToBoard()`
5. `applyStateToBoard()` calls `syncDrawingsFromState()`
6. `syncDrawingsFromState()` checks `isDrawingSyncPending()`:
   - If TRUE: calls `persistBoardStateSnapshot()` ✓
   - If FALSE: calls `setDrawingToolDrawings()` (no persist!)

**The problem:** If `isDrawingSyncPending()` returns FALSE (which it likely does after the 100ms debounce completes), the drawings are **never persisted**.

### Issue #4: `isDrawingSyncPending()` Timing

**File:** `dnd/vtt/assets/js/ui/drawing-tool.js`

Need to verify: What is the sync pending window? If the 100ms debounce completes BEFORE `syncDrawingsFromState` is called, then `isDrawingSyncPending()` returns false and NO SAVE HAPPENS.

---

## Comparison: How Templates Save

Templates are saved differently:
1. Template changes update the store directly
2. Various UI actions call `persistBoardStateSnapshot()` explicitly
3. The poller's merge logic handles incoming changes

**Key difference:** Templates have explicit save calls scattered throughout the code. Drawings rely ONLY on the `syncDrawingsFromState` path which has the pending check.

---

## Recommended Fixes (In Priority Order)

### Fix #1: Make Drawing Saves Explicit (Like Templates)

After the `onDrawingChange` callback updates the store, explicitly call `persistBoardStateSnapshot()`:

```javascript
// In bootstrap.js onDrawingChange callback:
onDrawingChange: (drawings) => {
  // ... update store ...

  // IMPORTANT: Explicitly persist after drawings change
  persistBoardStateSnapshot(); // Add this!
}
```

**BUT:** This requires exposing `persistBoardStateSnapshot` from `board-interactions.js` or creating a new save function.

### Fix #2: Remove Pending Check When Persisting

In `syncDrawingsFromState`, always persist when drawings change:

```javascript
function syncDrawingsFromState(boardState, activeSceneId) {
  // ... guards ...

  const hash = JSON.stringify(drawings);
  if (hash === lastSyncedDrawingsHash) return;

  lastSyncedDrawingsHash = hash;

  // ALWAYS persist, not just when pending
  persistBoardStateSnapshot();

  // Don't update tool if sync is pending (to preserve undo)
  if (!isDrawingSyncPending()) {
    setDrawingToolDrawings(drawings);
  }
}
```

### Fix #3: Remove Overly Restrictive Guards

Remove or relax Guard #2:

```javascript
// BEFORE:
if (isDrawModeActive() && isDrawingInProgress()) return;

// AFTER: Only block if BOTH conditions AND it's incoming data (not local)
// Or remove entirely since templates don't have this guard
```

### Fix #4: Add Debugging

Add console logging to trace the actual flow:

```javascript
function syncDrawingsFromState(boardState, activeSceneId) {
  console.log('[DRAWING SYNC] Called', { activeSceneId, hasBoardState: !!boardState });

  if (!activeSceneId) {
    console.log('[DRAWING SYNC] No activeSceneId, returning');
    return;
  }

  if (isDrawModeActive() && isDrawingInProgress()) {
    console.log('[DRAWING SYNC] Drawing in progress, returning');
    return;
  }

  if (!isDrawingToolMounted()) {
    console.log('[DRAWING SYNC] Tool not mounted, returning');
    return;
  }

  const drawings = ...;
  const hash = JSON.stringify(drawings);
  console.log('[DRAWING SYNC] Hash comparison', {
    current: hash.slice(0, 50),
    last: lastSyncedDrawingsHash?.slice(0, 50),
    match: hash === lastSyncedDrawingsHash
  });

  if (hash === lastSyncedDrawingsHash) return;

  console.log('[DRAWING SYNC] Hash changed, updating');
  lastSyncedDrawingsHash = hash;

  const pending = isDrawingSyncPending();
  console.log('[DRAWING SYNC] Sync pending?', pending);

  if (pending) {
    console.log('[DRAWING SYNC] Calling persistBoardStateSnapshot');
    persistBoardStateSnapshot();
    return;
  }

  console.log('[DRAWING SYNC] Calling setDrawingToolDrawings');
  setDrawingToolDrawings(drawings);
}
```

---

## Files to Modify

| File | Changes Needed |
|------|---------------|
| `dnd/vtt/assets/js/ui/board-interactions.js` | Fix `syncDrawingsFromState()` logic |
| `dnd/vtt/assets/js/bootstrap.js` | Possibly add explicit persist call |
| `dnd/vtt/assets/js/ui/drawing-tool.js` | Check `isDrawingSyncPending()` timing |

---

## Testing Checklist

After making fixes, test:

1. [ ] Draw something as GM → Check if `board-state.json` is created
2. [ ] Reload page → Do drawings persist?
3. [ ] Open as player in another browser → Do they see GM's drawings?
4. [ ] Player draws → Does GM see it?
5. [ ] Both draw simultaneously → Do both see all drawings?
6. [ ] Switch scenes → Are drawings preserved per-scene?
7. [ ] Check browser console for any errors

---

## Quick Diagnostic Commands

```bash
# Watch for board-state.json creation
watch -n 1 'ls -la /home/user/gmscreen/dnd/vtt/storage/'

# Check PHP error logs
tail -f /var/log/apache2/error.log  # or wherever PHP logs go

# Check browser console for:
# - [VTT] Persistence error
# - [VTT] Failed to save
# - Network tab: POST to /dnd/vtt/api/state.php
```

---

## Summary

The drawing sync is broken because:

1. **`board-state.json` doesn't exist** - nothing is being saved to the server
2. **`persistBoardStateSnapshot()` is only called when `isDrawingSyncPending()` is true** - which may never be the case
3. **Race conditions and guards** prevent proper initialization and syncing
4. **Templates work because they have explicit save calls** throughout the code; drawings rely on a single, conditional path

The fix requires ensuring that when drawings change, `persistBoardStateSnapshot()` is ALWAYS called, not just when sync is pending.
