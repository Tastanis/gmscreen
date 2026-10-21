import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTokenMovementController } from '../token-movement-controller.js';

// Build 544, Brandon (October 2026): on your turn, Ctrl+Z takes your token back to where the turn began (the 3D
// board's ghost); off your turn it goes back one move, as before.
globalThis.Element ??= class Element {};

function harness({ turn = true } = {}) {
  const restored = [];
  let keydown = null;
  const lastMove = { tokenId: 'other', from: { column: 9, row: 9 }, to: { column: 8, row: 9 } };
  const controller = createTokenMovementController({
    mapTransform: null,
    getCombatContext: () => (turn ? { active: true, sceneId: 'scene', round: 1, activeCombatantId: 'hero' } : { active: false }),
    getPlacementById: (id) => ({ id, column: 2, row: 2, width: 1, height: 1, speed: 6 }),
    measureRoute: () => 3,
    restoreMove: (move) => { restored.push(move); return true; },
    getUndoMove: () => lastMove,
    documentRef: { addEventListener: (type, handler) => { if (type === 'keydown') keydown = handler; } },
    windowRef: null,
  });
  controller.syncCombatTurn();
  const move = (from, to) => {
    controller.handleDragStart({ primaryToken: { id: 'hero', ...from }, originalPositions: new Map([['hero', from]]) });
    controller.handleDragEnd({ commit: true, moved: true });
    controller.handleDragCommitted({ sceneId: 'scene', movedIds: ['hero'], originalPositions: new Map([['hero', from]]), preview: new Map([['hero', to]]), movementKind: 'walk', source: 'drag' });
  };
  const ctrlZ = () => keydown({ key: 'z', ctrlKey: true, preventDefault() {}, stopPropagation() {}, target: null });
  return { controller, restored, move, ctrlZ, lastMove };
}

test('on its turn, Ctrl+Z undoes every move of the turn, last first, back to where it began', async () => {
  const { controller, restored, move, ctrlZ } = harness();
  move({ column: 2, row: 2 }, { column: 3, row: 2 });
  move({ column: 3, row: 2 }, { column: 3, row: 4 });
  assert.equal(controller.getMovementLeft('hero').spent, 6);
  await ctrlZ();
  assert.deepEqual(restored.map(({ from }) => ({ column: from.column, row: from.row })), [{ column: 3, row: 2 }, { column: 2, row: 2 }]);
  assert.deepEqual(controller.getMovementLeft('hero'), { speed: 6, spent: 0, left: 6 }, 'the movement is given back');
});

test('off a turn, Ctrl+Z steps back the last move only', async () => {
  const { restored, ctrlZ, lastMove } = harness({ turn: false });
  await ctrlZ();
  assert.deepEqual(restored, [lastMove]);
});
