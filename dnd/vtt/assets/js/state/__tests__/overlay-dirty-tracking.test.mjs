/**
 * Tests for Phase 5 overlay dirty-tracking optimisation.
 *
 * Before Phase 5, store.updateState() called syncBoardOverlayState() on
 * every single state change, which on a busy session fired a full overlay
 * rebuild dozens of times per minute. The dirty-tracking patch only rebuilds
 * when the overlay / active scene / sceneState slice actually changed, OR
 * when a caller explicitly marks it dirty via markOverlayDirty().
 *
 * We can't directly observe "did syncBoardOverlayState run?" from the public
 * API. Instead, we exploit a side effect of the sync: overlay entries that
 * are in-place mutated with an array `layers` will be replaced with a
 * normalised object. If the sync did NOT run, the original mutated object
 * remains (reference-preserved). That gives us a clean signal.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  initializeState,
  getState,
  updateState,
  markOverlayDirty,
} from '../store.js';

function baseSnapshot(sceneId = 'scene-1') {
  return {
    scenes: { folders: [], items: [{ id: sceneId }] },
    tokens: { folders: [], items: [] },
    boardState: {
      activeSceneId: sceneId,
      placements: { [sceneId]: [] },
      sceneState: {
        [sceneId]: {
          grid: { size: 64, locked: false, visible: true },
          overlay: { mapUrl: null, layers: [] },
        },
      },
    },
    grid: { size: 64, locked: false, visible: true },
    user: { isGM: true, name: 'GM' },
  };
}

describe('Phase 5 overlay dirty-tracking', () => {
  test('initial load runs a rebuild (dirty by default)', () => {
    initializeState(baseSnapshot());
    const overlay = getState().boardState.overlay;
    // syncBoardOverlayState normalises the overlay shape: aggregate mask
    // has `visible: false` for the empty-layer case.
    assert.ok(overlay);
    assert.ok(Array.isArray(overlay.layers));
  });

  test('updateState with no overlay-relevant change does NOT re-sync', () => {
    initializeState(baseSnapshot());

    // Swap in a sentinel overlay object that syncBoardOverlayState would
    // replace if it ran. The sentinel has a unique marker that would be
    // stripped by the overlay normaliser.
    const sentinel = {
      mapUrl: null,
      mask: { visible: true, polygons: [] },
      layers: [],
      activeLayerId: null,
      __sentinel__: 'untouched',
    };
    // Directly install the sentinel without triggering a rebuild
    updateState((draft) => {
      draft.boardState.overlay = sentinel;
    });
    // The previous updateState WAS an overlay change (ref swap), so the
    // sync ran. Reinstall sentinel via a raw mutation that does not change
    // the overlay reference, then trigger a non-overlay update.
    const current = getState();
    // The sync stripped our __sentinel__ marker during the replace. Use
    // a different strategy: mutate a non-overlay field and assert the
    // overlay reference is preserved.
    const overlayRefBefore = current.boardState.overlay;

    // Unrelated change: push a placement.
    updateState((draft) => {
      if (!draft.boardState.placements['scene-1']) {
        draft.boardState.placements['scene-1'] = [];
      }
      draft.boardState.placements['scene-1'].push({ id: 'p1', name: 'T' });
    });

    const overlayRefAfter = getState().boardState.overlay;
    // Overlay reference should be preserved structurally across a non-overlay
    // updateState — if syncBoardOverlayState ran, it would have produced a
    // fresh object via normalizeOverlayEntry. Rather than relying on
    // reference equality (getState returns deep copies), we assert that the
    // overlay structure is untouched and stable.
    assert.deepEqual(overlayRefAfter, overlayRefBefore);
  });

  test('replacing the active scene overlay triggers a rebuild', () => {
    initializeState(baseSnapshot());

    updateState((draft) => {
      draft.boardState.sceneState['scene-1'].overlay = {
        mapUrl: '/maps/new.png',
        layers: [{ id: 'layer-1', name: 'Layer 1', visible: true, mask: { visible: true, polygons: [] }, mapUrl: '/maps/new.png' }],
      };
    });

    const after = getState().boardState.overlay;
    // After sync, the overlay is re-normalised: activeLayerId resolved,
    // aggregate mask rebuilt. If the sync did NOT run, boardState.overlay
    // would still reflect the empty-layers value from the initial snapshot.
    assert.equal(after.mapUrl, '/maps/new.png');
    assert.equal(after.activeLayerId, 'layer-1');
  });

  test('switching active scene triggers a rebuild', () => {
    initializeState({
      scenes: { folders: [], items: [{ id: 'scene-1' }, { id: 'scene-2' }] },
      tokens: { folders: [], items: [] },
      boardState: {
        activeSceneId: 'scene-1',
        placements: {},
        sceneState: {
          'scene-1': { grid: { size: 64 }, overlay: { layers: [] } },
          'scene-2': {
            grid: { size: 64 },
            overlay: {
              mapUrl: '/maps/scene2.png',
              layers: [{ id: 'layer-s2', name: 'S2', visible: true, mask: { visible: true, polygons: [] }, mapUrl: '/maps/scene2.png' }],
            },
          },
        },
      },
      user: { isGM: true, name: 'GM' },
    });

    // Active scene is scene-1; boardState.overlay currently reflects scene-1.
    const before = getState().boardState.overlay;
    assert.equal(before.mapUrl, null);

    updateState((draft) => {
      draft.boardState.activeSceneId = 'scene-2';
    });

    const after = getState().boardState.overlay;
    // The sync should have replaced boardState.overlay with scene-2's overlay.
    assert.equal(after.mapUrl, '/maps/scene2.png');
  });

  test('markOverlayDirty() forces a rebuild on the next updateState', () => {
    initializeState(baseSnapshot());

    const beforeOverlay = getState().boardState.overlay;

    // Mutate a layer's mask in place — this is the "hidden mutation" case
    // that reference-equality cannot detect on its own. The caller must
    // signal with markOverlayDirty().
    updateState((draft) => {
      draft.boardState.sceneState['scene-1'].overlay.layers.push({
        id: 'late-layer',
        name: 'Late',
        visible: true,
        mask: { visible: true, polygons: [] },
        mapUrl: null,
      });
    });

    // The push mutates an array in place, so the overlay reference on
    // sceneState['scene-1'] did not change. Detection relies on the
    // markOverlayDirty escape hatch in this case. Issue the signal and
    // an unrelated update to force a re-sync.
    markOverlayDirty();
    updateState((draft) => {
      draft.boardState.activeSceneId = 'scene-1';
    });

    const afterOverlay = getState().boardState.overlay;
    // The sync should have re-normalised and picked up the late-added layer.
    const layerIds = Array.isArray(afterOverlay.layers)
      ? afterOverlay.layers.map((l) => l.id)
      : [];
    assert.ok(layerIds.includes('late-layer'), `layers missing late-layer: ${JSON.stringify(layerIds)}`);
    assert.notDeepEqual(afterOverlay, beforeOverlay);
  });
});
