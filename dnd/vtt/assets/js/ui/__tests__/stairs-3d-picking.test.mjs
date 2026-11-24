import test from 'node:test';
import assert from 'node:assert/strict';
import { mountStairsRenderer, renderStairs, pickStair } from '../stairs-renderer.js';

test('stair edits pick the projected corners, edges and interior on the current scene', (t) => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  t.after(() => {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  });
  const overlay = new Map();
  globalThis.document = new EventTarget();
  globalThis.window = {
    vtt3d: {
      active: true,
      helpers: { levelHeight: () => 0, groundAt: () => 2 },
      setOverlay: (key, items) => overlay.set(key, items),
    },
    vtt3dRenderer: {
      canvas: { getBoundingClientRect: () => ({ left: 50, top: 100 }) },
      project: ({ x, y, z }) => ({ x: x * 25, y: y * 25 - z, visible: true }),
    },
  };
  mountStairsRenderer({ isEditMode: () => true, getSelectedStairId: () => 'flight' });
  const stair = {
    id: 'flight',
    corners: [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ].map(([column, row]) => ({ column, row })),
  };
  const boardState = { activeSceneId: 'hall', sceneState: { hall: { mapLevels: { baseStairs: [stair] } } } };
  renderStairs({ boardState });
  assert.ok(overlay.get('stairs').length > 4);
  assert.deepEqual(pickStair(50, 98), { stairId: 'flight', cornerIndex: 0 });
  assert.equal(pickStair(82, 99)?.segmentId, '1,0-2,0');
  assert.deepEqual(pickStair(90, 140), { stairId: 'flight' });
  assert.equal(pickStair(180, 230), null);
  boardState.activeSceneId = 'yard';
  document.dispatchEvent(new Event('vtt3d:scene-built'));
  assert.deepEqual(overlay.get('stairs'), []);
  assert.equal(pickStair(50, 98), null);
});
