import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyBoardStateOpLocally,
  applyBoardStateOpsLocally,
} from '../board-state-op-applier.js';

// ---------------------------------------------------------------------------
// Phase 3-C: Client-side delta op applier. Mirrors the server's
// `applyBoardStateOp()` in `dnd/vtt/api/state.php`. The Pusher subscriber
// dispatches `{type: 'ops', ops: [...]}` broadcasts through this applier so
// the client can patch its own board state in place instead of refetching
// the full snapshot from `api/state.php`.
//
// These tests lock in:
//   * the wire shape each op type accepts and how it mutates state in place
//   * idempotent re-application semantics (replaying the same op is a no-op
//     except for `_lastModified` re-stamping)
//   * malformed-op tolerance (bad ops leave state unchanged, applier moves on)
//   * ordering when ops are applied as a batch
// ---------------------------------------------------------------------------

function seedBoardState() {
  return {
    placements: {
      'scene-1': [
        { id: 'hero', column: 1, row: 2, hp: 10, _lastModified: 1 },
        { id: 'goblin', column: 5, row: 5, hp: 4, _lastModified: 1 },
      ],
      'scene-2': [
        { id: 'lich', column: 9, row: 9, _lastModified: 1 },
      ],
    },
    templates: {
      'scene-1': [
        { id: 'fireball', shape: 'circle', radius: 20, _lastModified: 1 },
      ],
    },
    drawings: {
      'scene-1': [
        { id: 'arrow-1', kind: 'line', _lastModified: 1 },
      ],
    },
  };
}

describe('Board State Op Applier — placement.move', () => {
  test('moves an existing placement and stamps _lastModified', () => {
    const state = seedBoardState();
    const before = state.placements['scene-1'][0]._lastModified;
    const mutated = applyBoardStateOpLocally(state, {
      type: 'placement.move',
      sceneId: 'scene-1',
      placementId: 'hero',
      x: 7,
      y: 8,
    });
    assert.equal(mutated, true);
    const hero = state.placements['scene-1'].find((p) => p.id === 'hero');
    assert.equal(hero.column, 7);
    assert.equal(hero.row, 8);
    assert.ok(hero._lastModified >= before, '_lastModified should be re-stamped');
    // Other tokens are untouched.
    const goblin = state.placements['scene-1'].find((p) => p.id === 'goblin');
    assert.equal(goblin.column, 5);
    assert.equal(goblin.row, 5);
  });

  test('returns false and leaves state untouched when sceneId is missing', () => {
    const state = seedBoardState();
    const snapshot = JSON.stringify(state);
    const mutated = applyBoardStateOpLocally(state, {
      type: 'placement.move',
      placementId: 'hero',
      x: 1,
      y: 1,
    });
    assert.equal(mutated, false);
    assert.equal(JSON.stringify(state), snapshot);
  });

  test('returns false when placementId is missing', () => {
    const state = seedBoardState();
    const snapshot = JSON.stringify(state);
    const mutated = applyBoardStateOpLocally(state, {
      type: 'placement.move',
      sceneId: 'scene-1',
      x: 1,
      y: 1,
    });
    assert.equal(mutated, false);
    assert.equal(JSON.stringify(state), snapshot);
  });

  test('returns false when x/y are non-numeric', () => {
    const state = seedBoardState();
    const snapshot = JSON.stringify(state);
    const mutated = applyBoardStateOpLocally(state, {
      type: 'placement.move',
      sceneId: 'scene-1',
      placementId: 'hero',
      x: 'foo',
      y: 'bar',
    });
    assert.equal(mutated, false);
    assert.equal(JSON.stringify(state), snapshot);
  });

  test('returns false when target placement does not exist', () => {
    const state = seedBoardState();
    const snapshot = JSON.stringify(state);
    const mutated = applyBoardStateOpLocally(state, {
      type: 'placement.move',
      sceneId: 'scene-1',
      placementId: 'nonexistent',
      x: 0,
      y: 0,
    });
    assert.equal(mutated, false);
    assert.equal(JSON.stringify(state), snapshot);
  });

  test('numeric placementId is coerced to string', () => {
    const state = seedBoardState();
    state.placements['scene-1'].push({ id: '42', column: 0, row: 0, _lastModified: 1 });
    const mutated = applyBoardStateOpLocally(state, {
      type: 'placement.move',
      sceneId: 'scene-1',
      placementId: 42,
      x: 100,
      y: 200,
    });
    assert.equal(mutated, true);
    const moved = state.placements['scene-1'].find((p) => p.id === '42');
    assert.equal(moved.column, 100);
    assert.equal(moved.row, 200);
  });
});

describe('Board State Op Applier — placement.add', () => {
  test('appends a new placement when id is unseen', () => {
    const state = seedBoardState();
    const mutated = applyBoardStateOpLocally(state, {
      type: 'placement.add',
      sceneId: 'scene-1',
      placement: { id: 'wizard', column: 3, row: 3, hp: 8 },
    });
    assert.equal(mutated, true);
    const wizard = state.placements['scene-1'].find((p) => p.id === 'wizard');
    assert.ok(wizard);
    assert.equal(wizard.column, 3);
    assert.equal(wizard.hp, 8);
    assert.ok(typeof wizard._lastModified === 'number');
  });

  test('replaces in place when id already exists (later wins)', () => {
    const state = seedBoardState();
    const mutated = applyBoardStateOpLocally(state, {
      type: 'placement.add',
      sceneId: 'scene-1',
      placement: { id: 'hero', column: 99, row: 99, hp: 1 },
    });
    assert.equal(mutated, true);
    const hero = state.placements['scene-1'].find((p) => p.id === 'hero');
    assert.equal(hero.column, 99);
    assert.equal(hero.hp, 1);
    // List length unchanged.
    assert.equal(state.placements['scene-1'].length, 2);
  });

  test('initializes scene array when scene is unseen', () => {
    const state = seedBoardState();
    const mutated = applyBoardStateOpLocally(state, {
      type: 'placement.add',
      sceneId: 'scene-new',
      placement: { id: 'rogue', column: 0, row: 0 },
    });
    assert.equal(mutated, true);
    assert.deepEqual(
      state.placements['scene-new'].map((p) => p.id),
      ['rogue']
    );
  });

  test('drops malformed payload (no placement field)', () => {
    const state = seedBoardState();
    const snapshot = JSON.stringify(state);
    const mutated = applyBoardStateOpLocally(state, {
      type: 'placement.add',
      sceneId: 'scene-1',
    });
    assert.equal(mutated, false);
    assert.equal(JSON.stringify(state), snapshot);
  });
});

describe('Board State Op Applier — placement.remove', () => {
  test('removes the matching placement', () => {
    const state = seedBoardState();
    const mutated = applyBoardStateOpLocally(state, {
      type: 'placement.remove',
      sceneId: 'scene-1',
      placementId: 'goblin',
    });
    assert.equal(mutated, true);
    assert.deepEqual(
      state.placements['scene-1'].map((p) => p.id),
      ['hero']
    );
  });

  test('is idempotent: removing twice is a no-op the second time', () => {
    const state = seedBoardState();
    applyBoardStateOpLocally(state, {
      type: 'placement.remove',
      sceneId: 'scene-1',
      placementId: 'goblin',
    });
    const mutated = applyBoardStateOpLocally(state, {
      type: 'placement.remove',
      sceneId: 'scene-1',
      placementId: 'goblin',
    });
    assert.equal(mutated, false);
  });
});

describe('Board State Op Applier — placement.update', () => {
  test('shallow-merges patch fields and re-stamps _lastModified', () => {
    const state = seedBoardState();
    const mutated = applyBoardStateOpLocally(state, {
      type: 'placement.update',
      sceneId: 'scene-1',
      placementId: 'hero',
      patch: { hp: 5, conditions: ['dazed'] },
    });
    assert.equal(mutated, true);
    const hero = state.placements['scene-1'].find((p) => p.id === 'hero');
    assert.equal(hero.hp, 5);
    assert.deepEqual(hero.conditions, ['dazed']);
    // Untouched fields preserved.
    assert.equal(hero.column, 1);
    assert.equal(hero.row, 2);
  });

  test('refuses to overwrite the id field', () => {
    const state = seedBoardState();
    applyBoardStateOpLocally(state, {
      type: 'placement.update',
      sceneId: 'scene-1',
      placementId: 'hero',
      patch: { id: 'bogus', hp: 99 },
    });
    const hero = state.placements['scene-1'].find((p) => p.id === 'hero');
    assert.ok(hero, 'hero with original id still exists');
    assert.equal(hero.hp, 99);
  });

  test('drops payload when patch is missing', () => {
    const state = seedBoardState();
    const snapshot = JSON.stringify(state);
    const mutated = applyBoardStateOpLocally(state, {
      type: 'placement.update',
      sceneId: 'scene-1',
      placementId: 'hero',
    });
    assert.equal(mutated, false);
    assert.equal(JSON.stringify(state), snapshot);
  });
});

describe('Board State Op Applier — template.upsert / template.remove', () => {
  test('template.upsert appends a new template entry', () => {
    const state = seedBoardState();
    const mutated = applyBoardStateOpLocally(state, {
      type: 'template.upsert',
      sceneId: 'scene-1',
      template: { id: 'cone', shape: 'cone', length: 30 },
    });
    assert.equal(mutated, true);
    const ids = state.templates['scene-1'].map((t) => t.id);
    assert.deepEqual(ids, ['fireball', 'cone']);
  });

  test('template.upsert replaces in place when id matches', () => {
    const state = seedBoardState();
    const mutated = applyBoardStateOpLocally(state, {
      type: 'template.upsert',
      sceneId: 'scene-1',
      template: { id: 'fireball', shape: 'circle', radius: 30 },
    });
    assert.equal(mutated, true);
    const fb = state.templates['scene-1'].find((t) => t.id === 'fireball');
    assert.equal(fb.radius, 30);
    assert.equal(state.templates['scene-1'].length, 1);
  });

  test('template.remove deletes the matching entry', () => {
    const state = seedBoardState();
    const mutated = applyBoardStateOpLocally(state, {
      type: 'template.remove',
      sceneId: 'scene-1',
      templateId: 'fireball',
    });
    assert.equal(mutated, true);
    assert.equal(state.templates['scene-1'].length, 0);
  });
});

describe('Board State Op Applier — drawing.add / drawing.remove', () => {
  test('drawing.add appends new drawing', () => {
    const state = seedBoardState();
    const mutated = applyBoardStateOpLocally(state, {
      type: 'drawing.add',
      sceneId: 'scene-1',
      drawing: { id: 'arrow-2', kind: 'arrow' },
    });
    assert.equal(mutated, true);
    const ids = state.drawings['scene-1'].map((d) => d.id);
    assert.deepEqual(ids, ['arrow-1', 'arrow-2']);
  });

  test('drawing.remove deletes the matching entry', () => {
    const state = seedBoardState();
    const mutated = applyBoardStateOpLocally(state, {
      type: 'drawing.remove',
      sceneId: 'scene-1',
      drawingId: 'arrow-1',
    });
    assert.equal(mutated, true);
    assert.equal(state.drawings['scene-1'].length, 0);
  });
});

describe('Board State Op Applier — malformed / unknown op tolerance', () => {
  test('returns false for null / non-object op', () => {
    const state = seedBoardState();
    const snapshot = JSON.stringify(state);
    assert.equal(applyBoardStateOpLocally(state, null), false);
    assert.equal(applyBoardStateOpLocally(state, 'not-an-op'), false);
    assert.equal(applyBoardStateOpLocally(state, { type: '' }), false);
    assert.equal(JSON.stringify(state), snapshot);
  });

  test('returns false for unknown op type', () => {
    const state = seedBoardState();
    const snapshot = JSON.stringify(state);
    const mutated = applyBoardStateOpLocally(state, {
      type: 'placement.teleport',
      sceneId: 'scene-1',
      placementId: 'hero',
      x: 0,
      y: 0,
    });
    assert.equal(mutated, false);
    assert.equal(JSON.stringify(state), snapshot);
  });

  test('returns false when applied to a null/invalid board state', () => {
    assert.equal(
      applyBoardStateOpLocally(null, {
        type: 'placement.move',
        sceneId: 'scene-1',
        placementId: 'hero',
        x: 0,
        y: 0,
      }),
      false
    );
  });
});

describe('Board State Op Applier — applyBoardStateOpsLocally batch helper', () => {
  test('applies a batch of ops in order and counts mutations', () => {
    const state = seedBoardState();
    const ops = [
      { type: 'placement.move', sceneId: 'scene-1', placementId: 'hero', x: 10, y: 10 },
      { type: 'placement.add', sceneId: 'scene-1', placement: { id: 'cleric', column: 0, row: 0 } },
      { type: 'template.upsert', sceneId: 'scene-1', template: { id: 'wall', shape: 'line' } },
      // Bad op: should be counted as 0 mutations but not throw.
      { type: 'placement.move', sceneId: 'scene-1', placementId: 'ghost', x: 1, y: 1 },
      // Unknown op: also 0.
      { type: 'fog.toggle', sceneId: 'scene-1' },
    ];
    const count = applyBoardStateOpsLocally(state, ops);
    assert.equal(count, 3);
    const hero = state.placements['scene-1'].find((p) => p.id === 'hero');
    assert.deepEqual([hero.column, hero.row], [10, 10]);
    assert.ok(state.placements['scene-1'].some((p) => p.id === 'cleric'));
    assert.ok(state.templates['scene-1'].some((t) => t.id === 'wall'));
  });

  test('returns 0 when given a non-array', () => {
    const state = seedBoardState();
    assert.equal(applyBoardStateOpsLocally(state, null), 0);
    assert.equal(applyBoardStateOpsLocally(state, undefined), 0);
    assert.equal(applyBoardStateOpsLocally(state, { ops: [] }), 0);
  });

  test('matches server applyBoardStateOp ordering: later moves of the same token win', () => {
    const state = seedBoardState();
    const ops = [
      { type: 'placement.move', sceneId: 'scene-1', placementId: 'hero', x: 1, y: 1 },
      { type: 'placement.move', sceneId: 'scene-1', placementId: 'hero', x: 2, y: 2 },
      { type: 'placement.move', sceneId: 'scene-1', placementId: 'hero', x: 3, y: 3 },
    ];
    applyBoardStateOpsLocally(state, ops);
    const hero = state.placements['scene-1'].find((p) => p.id === 'hero');
    assert.deepEqual([hero.column, hero.row], [3, 3]);
  });
});
