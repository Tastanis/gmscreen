import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyFreshAuthoritativeSnapshot } from '../authoritative-snapshot.js';

test('reversed authoritative responses cannot roll board state back', () => {
  const initial = {
    _version: 100,
    activeSceneId: 'scene-current',
    sceneState: {
      'scene-current': {
        combat: {
          active: true,
          sequence: 20,
          activeCombatantId: 'hero-a',
        },
      },
    },
    placements: {
      'scene-current': {
        hero: { id: 'hero', x: 1, y: 1, hp: 10 },
      },
    },
    templates: {
      'scene-current': [{ id: 'old-template', type: 'burst' }],
    },
  };

  const version102 = {
    _version: 102,
    activeSceneId: 'scene-current',
    sceneState: {
      'scene-current': {
        combat: {
          active: false,
          sequence: 22,
          activeCombatantId: null,
        },
      },
    },
    placements: {
      'scene-current': {
        hero: { id: 'hero', x: 8, y: 5, hp: 4 },
      },
    },
    templates: {
      'scene-current': [{ id: 'new-template', type: 'line' }],
    },
  };

  const version101 = {
    _version: 101,
    activeSceneId: 'scene-old',
    sceneState: {
      'scene-current': {
        combat: {
          active: true,
          sequence: 21,
          activeCombatantId: 'enemy-b',
        },
      },
    },
    placements: {
      'scene-current': {
        hero: { id: 'hero', x: 3, y: 2, hp: 9 },
      },
    },
    templates: {
      'scene-current': [{ id: 'stale-template', type: 'cube' }],
    },
  };

  const newer = applyFreshAuthoritativeSnapshot(initial, version102, 100);
  assert.equal(newer.applied, true);
  assert.equal(newer.version, 102);

  const lateOlder = applyFreshAuthoritativeSnapshot(
    newer.boardState,
    version101,
    newer.version
  );
  assert.equal(lateOlder.applied, false);
  assert.equal(lateOlder.version, 102);
  assert.strictEqual(lateOlder.boardState, newer.boardState);
  assert.deepEqual(lateOlder.boardState.sceneState['scene-current'].combat, {
    active: false,
    sequence: 22,
    activeCombatantId: null,
  });
  assert.deepEqual(
    lateOlder.boardState.placements['scene-current'].hero,
    { id: 'hero', x: 8, y: 5, hp: 4 }
  );
  assert.deepEqual(
    lateOlder.boardState.templates['scene-current'],
    [{ id: 'new-template', type: 'line' }]
  );
  assert.equal(lateOlder.boardState.activeSceneId, 'scene-current');
});

test('equal and unversioned authoritative snapshots are rejected', () => {
  const current = {
    _version: 12,
    placements: { scene: { hero: { id: 'hero', hp: 7 } } },
  };

  for (const incoming of [
    { _version: 12, placements: { scene: { hero: { id: 'hero', hp: 1 } } } },
    { placements: { scene: { hero: { id: 'hero', hp: 0 } } } },
    { _version: '13', placements: { scene: { hero: { id: 'hero', hp: 0 } } } },
  ]) {
    const result = applyFreshAuthoritativeSnapshot(current, incoming, 12);
    assert.equal(result.applied, false);
    assert.equal(result.version, 12);
    assert.strictEqual(result.boardState, current);
  }
});
