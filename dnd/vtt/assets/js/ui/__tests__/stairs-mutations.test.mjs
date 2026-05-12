import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addStairWithMirror,
  buildPlacementEdgeColors,
  cycleSegmentColor,
  findStairById,
  rectangleCornersFromCells,
  removeStairWithMirror,
  resolveLinkedLevelId,
  updateStairCorners,
} from '../stairs-mutations.js';
import { BASE_MAP_LEVEL_ID } from '../../state/normalize/map-levels.js';

function buildSceneState() {
  return {
    mapLevels: {
      levels: [
        { id: 'level-1', name: 'Level 1', zIndex: 0, stairs: [] },
        { id: 'level-2', name: 'Level 2', zIndex: 1, stairs: [] },
      ],
      activeLevelId: 'level-1',
      baseStairs: [],
    },
  };
}

describe('stairs mutations — resolveLinkedLevelId', () => {
  test('"down" from a stored level returns the next-lower level id', () => {
    const sceneState = buildSceneState();
    assert.equal(resolveLinkedLevelId(sceneState, 'level-2', 'down'), 'level-1');
    assert.equal(resolveLinkedLevelId(sceneState, 'level-1', 'down'), BASE_MAP_LEVEL_ID);
  });

  test('"down" from the base level returns null', () => {
    const sceneState = buildSceneState();
    assert.equal(resolveLinkedLevelId(sceneState, BASE_MAP_LEVEL_ID, 'down'), null);
  });

  test('"up" from the topmost level returns null', () => {
    const sceneState = buildSceneState();
    assert.equal(resolveLinkedLevelId(sceneState, 'level-2', 'up'), null);
  });

  test('"up" from the base level reaches the first stored level', () => {
    const sceneState = buildSceneState();
    assert.equal(resolveLinkedLevelId(sceneState, BASE_MAP_LEVEL_ID, 'up'), 'level-1');
  });
});

describe('stairs mutations — addStairWithMirror', () => {
  test('creates both copies with flipped direction and same id', () => {
    const sceneState = buildSceneState();
    const id = addStairWithMirror(sceneState, {
      levelId: 'level-2',
      direction: 'down',
      corners: rectangleCornersFromCells({ column: 3, row: 2 }, { column: 5, row: 5 }),
      edgeColors: { '3,2-3,3': 'green' },
    });
    assert.ok(typeof id === 'string' && id.length > 0);
    const upper = findStairById(sceneState, 'level-2', id);
    const lower = findStairById(sceneState, 'level-1', id);
    assert.ok(upper && lower, 'both copies must exist');
    assert.equal(upper.direction, 'down');
    assert.equal(lower.direction, 'up');
    assert.equal(upper.linkedLevelId, 'level-1');
    assert.equal(lower.linkedLevelId, 'level-2');
    assert.deepEqual(upper.corners, lower.corners);
    assert.deepEqual(upper.edgeColors, lower.edgeColors);
  });

  test('rejects placement when no adjacent level exists', () => {
    const sceneState = buildSceneState();
    const id = addStairWithMirror(sceneState, {
      levelId: BASE_MAP_LEVEL_ID,
      direction: 'down',
      corners: rectangleCornersFromCells({ column: 0, row: 0 }, { column: 1, row: 1 }),
    });
    assert.equal(id, null);
  });

  test('placement on Level 1 down-stairs targets baseStairs', () => {
    const sceneState = buildSceneState();
    const id = addStairWithMirror(sceneState, {
      levelId: 'level-1',
      direction: 'down',
      corners: rectangleCornersFromCells({ column: 0, row: 0 }, { column: 0, row: 1 }),
    });
    assert.ok(id);
    assert.equal(sceneState.mapLevels.baseStairs.length, 1);
    assert.equal(sceneState.mapLevels.baseStairs[0].direction, 'up');
  });
});

describe('stairs mutations — removeStairWithMirror', () => {
  test('removes both copies in one call', () => {
    const sceneState = buildSceneState();
    const id = addStairWithMirror(sceneState, {
      levelId: 'level-2',
      direction: 'down',
      corners: rectangleCornersFromCells({ column: 0, row: 0 }, { column: 1, row: 1 }),
    });
    const removed = removeStairWithMirror(sceneState, 'level-2', id);
    assert.equal(removed, true);
    assert.equal(sceneState.mapLevels.levels[1].stairs.length, 0);
    assert.equal(sceneState.mapLevels.levels[0].stairs.length, 0);
  });
});

describe('stairs mutations — updateStairCorners', () => {
  test('mirrors corner updates across both copies', () => {
    const sceneState = buildSceneState();
    const id = addStairWithMirror(sceneState, {
      levelId: 'level-2',
      direction: 'down',
      corners: rectangleCornersFromCells({ column: 0, row: 0 }, { column: 1, row: 1 }),
    });
    const newCorners = rectangleCornersFromCells({ column: 4, row: 5 }, { column: 6, row: 7 });
    updateStairCorners(sceneState, 'level-2', id, newCorners);
    const upper = findStairById(sceneState, 'level-2', id);
    const lower = findStairById(sceneState, 'level-1', id);
    assert.deepEqual(upper.corners, newCorners);
    assert.deepEqual(lower.corners, newCorners);
  });
});

describe('stairs mutations — cycleSegmentColor', () => {
  test('cycles barrier -> green -> red -> barrier on both copies', () => {
    const sceneState = buildSceneState();
    const id = addStairWithMirror(sceneState, {
      levelId: 'level-2',
      direction: 'down',
      corners: rectangleCornersFromCells({ column: 0, row: 0 }, { column: 1, row: 1 }),
    });
    const segId = '0,0-1,0';
    assert.equal(cycleSegmentColor(sceneState, 'level-2', id, segId), 'green');
    assert.equal(findStairById(sceneState, 'level-1', id).edgeColors[segId], 'green');
    assert.equal(cycleSegmentColor(sceneState, 'level-2', id, segId), 'red');
    assert.equal(findStairById(sceneState, 'level-1', id).edgeColors[segId], 'red');
    assert.equal(cycleSegmentColor(sceneState, 'level-2', id, segId), 'barrier');
    // 'barrier' should be represented as absence from edgeColors.
    assert.ok(!(segId in findStairById(sceneState, 'level-2', id).edgeColors));
    assert.ok(!(segId in findStairById(sceneState, 'level-1', id).edgeColors));
  });
});

describe('stairs mutations — buildPlacementEdgeColors', () => {
  test('on a wide rectangle, paints green at A-side, red at B-side (vertical edges)', () => {
    const cellA = { column: 0, row: 0 };
    const cellB = { column: 4, row: 1 };
    const corners = rectangleCornersFromCells(cellA, cellB);
    const colors = buildPlacementEdgeColors({ cellA, cellB, corners });
    // Width 5, height 2 → horizontal axis is long → green/red on left/right.
    // Green at minCol=0, red at maxCol=5.
    assert.equal(colors['0,0-0,1'], 'green');
    assert.equal(colors['0,1-0,2'], 'green');
    assert.equal(colors['5,0-5,1'], 'red');
    assert.equal(colors['5,1-5,2'], 'red');
    // Top/bottom long sides remain barrier (no entry).
    assert.ok(!('0,0-1,0' in colors));
  });

  test('on a tall rectangle, paints green at A-side, red at B-side (horizontal edges)', () => {
    const cellA = { column: 1, row: 5 };
    const cellB = { column: 0, row: 0 };
    const corners = rectangleCornersFromCells(cellA, cellB);
    const colors = buildPlacementEdgeColors({ cellA, cellB, corners });
    // Height > width → vertical axis is long → top/bottom short edges.
    // A is bottom (row=5), B is top (row=0). Green at A row (bottom = maxRow=6), red at B row (minRow=0).
    assert.equal(colors['0,6-1,6'], 'green');
    assert.equal(colors['1,6-2,6'], 'green');
    assert.equal(colors['0,0-1,0'], 'red');
    assert.equal(colors['1,0-2,0'], 'red');
  });
});
