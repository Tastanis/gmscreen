import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computePlacementNormalizedCenter,
  createLevelViewFollowTracker,
  detectClaimedTokenLevelTransition,
} from '../level-view-follow.js';

describe('Levels v2 view-follow — detectClaimedTokenLevelTransition', () => {
  test('returns false when the next entry is missing or not claim-sourced', () => {
    const previous = { source: 'claim', tokenId: 't1', levelId: 'level-0', updatedAt: 100 };
    assert.equal(detectClaimedTokenLevelTransition(previous, null), false);
    assert.equal(detectClaimedTokenLevelTransition(previous, undefined), false);
    assert.equal(
      detectClaimedTokenLevelTransition(previous, {
        source: 'manual',
        levelId: 'level-1',
        updatedAt: 200,
      }),
      false,
    );
    assert.equal(
      detectClaimedTokenLevelTransition(previous, {
        source: 'activate',
        levelId: 'level-1',
        updatedAt: 200,
      }),
      false,
    );
  });

  test('first observation is the baseline — no pan even when next is claim-sourced', () => {
    const next = {
      source: 'claim',
      tokenId: 'placement-1',
      levelId: 'level-1',
      updatedAt: 100,
    };
    assert.equal(detectClaimedTokenLevelTransition(null, next), false);
    assert.equal(detectClaimedTokenLevelTransition(undefined, next), false);
    assert.equal(detectClaimedTokenLevelTransition({ source: 'manual' }, next), false);
  });

  test('different tokenId between claim entries triggers a transition', () => {
    const previous = { source: 'claim', tokenId: 't1', levelId: 'level-0', updatedAt: 100 };
    const next = { source: 'claim', tokenId: 't2', levelId: 'level-0', updatedAt: 100 };
    assert.equal(detectClaimedTokenLevelTransition(previous, next), true);
  });

  test('same token but different levelId triggers a transition', () => {
    const previous = { source: 'claim', tokenId: 't1', levelId: 'level-0', updatedAt: 100 };
    const next = { source: 'claim', tokenId: 't1', levelId: 'level-1', updatedAt: 100 };
    assert.equal(detectClaimedTokenLevelTransition(previous, next), true);
  });

  test('same token and level but newer updatedAt triggers a transition', () => {
    const previous = { source: 'claim', tokenId: 't1', levelId: 'level-1', updatedAt: 100 };
    const next = { source: 'claim', tokenId: 't1', levelId: 'level-1', updatedAt: 200 };
    assert.equal(detectClaimedTokenLevelTransition(previous, next), true);
  });

  test('identical entries do not trigger a transition', () => {
    const previous = { source: 'claim', tokenId: 't1', levelId: 'level-1', updatedAt: 200 };
    const next = { source: 'claim', tokenId: 't1', levelId: 'level-1', updatedAt: 200 };
    assert.equal(detectClaimedTokenLevelTransition(previous, next), false);
  });

  test('blank or missing tokenId in next entry is treated as unclaimed', () => {
    const previous = { source: 'claim', tokenId: 't1', levelId: 'level-1', updatedAt: 100 };
    assert.equal(
      detectClaimedTokenLevelTransition(previous, {
        source: 'claim',
        tokenId: '   ',
        levelId: 'level-2',
        updatedAt: 200,
      }),
      false,
    );
    assert.equal(
      detectClaimedTokenLevelTransition(previous, {
        source: 'claim',
        levelId: 'level-2',
        updatedAt: 200,
      }),
      false,
    );
  });
});

describe('Levels v2 view-follow — computePlacementNormalizedCenter', () => {
  const baseGrid = {
    gridSize: 64,
    mapPixelSize: { width: 1024, height: 768 },
    gridOffsets: { left: 0, top: 0 },
  };

  test('returns the placement center as a normalized 0..1 pair', () => {
    const center = computePlacementNormalizedCenter(
      { column: 4, row: 2, width: 2, height: 2 },
      baseGrid,
    );
    assert.ok(center);
    // (4 + 1) * 64 = 320 → 320 / 1024 = 0.3125
    assert.equal(center.x, 0.3125);
    // (2 + 1) * 64 = 192 → 192 / 768 = 0.25
    assert.equal(center.y, 0.25);
  });

  test('honors leftOffset / topOffset from the grid offsets', () => {
    const center = computePlacementNormalizedCenter(
      { column: 0, row: 0, width: 1, height: 1 },
      { gridSize: 64, mapPixelSize: { width: 1024, height: 768 }, gridOffsets: { left: 32, top: 16 } },
    );
    assert.ok(center);
    // 32 + 0.5 * 64 = 64 → 64 / 1024
    assert.equal(center.x, 64 / 1024);
    // 16 + 0.5 * 64 = 48 → 48 / 768
    assert.equal(center.y, 48 / 768);
  });

  test('clamps to [0, 1] for placements outside the map area', () => {
    const center = computePlacementNormalizedCenter(
      { column: -10, row: 100, width: 1, height: 1 },
      baseGrid,
    );
    assert.ok(center);
    assert.equal(center.x, 0);
    assert.equal(center.y, 1);
  });

  test('falls back to defaults for missing width/height/columns and "col"', () => {
    const center = computePlacementNormalizedCenter(
      { col: 2, row: 1 },
      baseGrid,
    );
    assert.ok(center);
    // col: 2, default width: 1 → (2 + 0.5) * 64 = 160 → 160/1024 = 0.15625
    assert.equal(center.x, 0.15625);
    // row: 1, default height: 1 → (1 + 0.5) * 64 = 96 → 96/768 = 0.125
    assert.equal(center.y, 0.125);
  });

  test('returns null for invalid placement or geometry inputs', () => {
    assert.equal(computePlacementNormalizedCenter(null, baseGrid), null);
    assert.equal(computePlacementNormalizedCenter({}, null), null);
    assert.equal(
      computePlacementNormalizedCenter({ column: 1, row: 1 }, { gridSize: 0, mapPixelSize: { width: 100, height: 100 } }),
      null,
    );
    assert.equal(
      computePlacementNormalizedCenter(
        { column: 1, row: 1 },
        { gridSize: 64, mapPixelSize: { width: 0, height: 100 } },
      ),
      null,
    );
    assert.equal(
      computePlacementNormalizedCenter(
        { column: 1, row: 1 },
        { gridSize: 64, mapPixelSize: { height: 100 } },
      ),
      null,
    );
  });
});

describe('Levels v2 view-follow — createLevelViewFollowTracker', () => {
  test('first consume on a scene records the baseline without firing', () => {
    const tracker = createLevelViewFollowTracker();
    const fresh = tracker.consume({
      sceneId: 'scene-a',
      userLevelEntry: {
        source: 'claim',
        tokenId: 'p1',
        levelId: 'level-0',
        updatedAt: 100,
      },
    });
    assert.equal(fresh, false);
    assert.deepEqual(tracker.peek('scene-a'), {
      tokenId: 'p1',
      levelId: 'level-0',
      updatedAt: 100,
    });
  });

  test('repeat consume with the same entry does not fire', () => {
    const tracker = createLevelViewFollowTracker();
    const entry = { source: 'claim', tokenId: 'p1', levelId: 'level-1', updatedAt: 100 };
    tracker.consume({ sceneId: 'scene-a', userLevelEntry: entry });
    const fresh = tracker.consume({ sceneId: 'scene-a', userLevelEntry: entry });
    assert.equal(fresh, false);
  });

  test('updated entry fires once and updates the baseline', () => {
    const tracker = createLevelViewFollowTracker();
    tracker.consume({
      sceneId: 'scene-a',
      userLevelEntry: { source: 'claim', tokenId: 'p1', levelId: 'level-1', updatedAt: 100 },
    });
    const firstFire = tracker.consume({
      sceneId: 'scene-a',
      userLevelEntry: { source: 'claim', tokenId: 'p1', levelId: 'level-2', updatedAt: 200 },
    });
    const secondFire = tracker.consume({
      sceneId: 'scene-a',
      userLevelEntry: { source: 'claim', tokenId: 'p1', levelId: 'level-2', updatedAt: 200 },
    });
    assert.equal(firstFire, true);
    assert.equal(secondFire, false);
    assert.deepEqual(tracker.peek('scene-a'), {
      tokenId: 'p1',
      levelId: 'level-2',
      updatedAt: 200,
    });
  });

  test('non-claim entries clear the baseline so the next claim observation is a baseline again', () => {
    const tracker = createLevelViewFollowTracker();
    tracker.consume({
      sceneId: 'scene-a',
      userLevelEntry: { source: 'claim', tokenId: 'p1', levelId: 'level-1', updatedAt: 100 },
    });
    tracker.consume({
      sceneId: 'scene-a',
      userLevelEntry: { source: 'activate', levelId: 'level-2', updatedAt: 200 },
    });
    assert.equal(tracker.peek('scene-a'), null);
    const fresh = tracker.consume({
      sceneId: 'scene-a',
      userLevelEntry: { source: 'claim', tokenId: 'p1', levelId: 'level-2', updatedAt: 300 },
    });
    assert.equal(fresh, false);
  });

  test('reset(sceneId) drops only that scene; reset() drops all', () => {
    const tracker = createLevelViewFollowTracker();
    tracker.consume({
      sceneId: 'scene-a',
      userLevelEntry: { source: 'claim', tokenId: 'p1', levelId: 'level-1', updatedAt: 100 },
    });
    tracker.consume({
      sceneId: 'scene-b',
      userLevelEntry: { source: 'claim', tokenId: 'p2', levelId: 'level-1', updatedAt: 100 },
    });
    tracker.reset('scene-a');
    assert.equal(tracker.peek('scene-a'), null);
    assert.deepEqual(tracker.peek('scene-b'), {
      tokenId: 'p2',
      levelId: 'level-1',
      updatedAt: 100,
    });
    tracker.reset();
    assert.equal(tracker.peek('scene-b'), null);
  });

  test('different scenes track independent baselines', () => {
    const tracker = createLevelViewFollowTracker();
    tracker.consume({
      sceneId: 'scene-a',
      userLevelEntry: { source: 'claim', tokenId: 'p1', levelId: 'level-1', updatedAt: 100 },
    });
    const fresh = tracker.consume({
      sceneId: 'scene-b',
      userLevelEntry: { source: 'claim', tokenId: 'p1', levelId: 'level-1', updatedAt: 100 },
    });
    assert.equal(fresh, false);
  });

  test('consume requires a sceneId string', () => {
    const tracker = createLevelViewFollowTracker();
    assert.equal(
      tracker.consume({
        sceneId: '',
        userLevelEntry: { source: 'claim', tokenId: 'p1', levelId: 'level-1', updatedAt: 100 },
      }),
      false,
    );
    assert.equal(
      tracker.consume({
        userLevelEntry: { source: 'claim', tokenId: 'p1', levelId: 'level-1', updatedAt: 100 },
      }),
      false,
    );
  });
});
