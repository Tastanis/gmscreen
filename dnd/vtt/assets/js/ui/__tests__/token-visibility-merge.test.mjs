import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeSceneKeyedSection, mergeBoardStateSnapshot } from '../board-interactions.js';

// ---------------------------------------------------------------------------
// mergeSceneKeyedSection – token visibility during delta merges
// ---------------------------------------------------------------------------

test('delta merge preserves unhidden tokens not in incoming delta', () => {
  const existing = {
    'scene-1': [
      { id: 'goblin-1', hidden: false, _lastModified: 2000 },
      { id: 'goblin-2', hidden: false, _lastModified: 2000 },
    ],
  };

  // Delta only includes a new token, not the goblins
  const incoming = {
    'scene-1': [
      { id: 'player-token', column: 5, _lastModified: 3000 },
    ],
  };

  const merged = mergeSceneKeyedSection(existing, incoming, { fullSync: false });

  const byId = Object.fromEntries(merged['scene-1'].map((e) => [e.id, e]));
  assert.equal(byId['goblin-1'].hidden, false, 'goblin-1 should stay unhidden');
  assert.equal(byId['goblin-2'].hidden, false, 'goblin-2 should stay unhidden');
  assert.ok(byId['player-token'], 'player-token should be added');
});

test('delta merge updates hidden field when incoming has newer timestamp', () => {
  const existing = {
    'scene-1': [
      { id: 'goblin-1', hidden: true, _lastModified: 1000 },
    ],
  };

  const incoming = {
    'scene-1': [
      { id: 'goblin-1', hidden: false, _lastModified: 2000 },
    ],
  };

  const merged = mergeSceneKeyedSection(existing, incoming, { fullSync: false });

  assert.equal(merged['scene-1'][0].hidden, false, 'hidden should be updated to false');
});

test('delta merge keeps existing hidden value when incoming is older', () => {
  const existing = {
    'scene-1': [
      { id: 'goblin-1', hidden: false, _lastModified: 3000 },
    ],
  };

  const incoming = {
    'scene-1': [
      { id: 'goblin-1', hidden: true, _lastModified: 1000 },
    ],
  };

  const merged = mergeSceneKeyedSection(existing, incoming, { fullSync: false });

  assert.equal(merged['scene-1'][0].hidden, false, 'stale update should not revert unhide');
});

test('full sync replaces all placements including hidden state', () => {
  const existing = {
    'scene-1': [
      { id: 'goblin-1', hidden: true },
      { id: 'goblin-2', hidden: true },
    ],
  };

  const incoming = {
    'scene-1': [
      { id: 'goblin-1', hidden: false },
      { id: 'goblin-2', hidden: false },
    ],
  };

  const merged = mergeSceneKeyedSection(existing, incoming, { fullSync: true });

  assert.equal(merged['scene-1'][0].hidden, false, 'goblin-1 should be unhidden in full sync');
  assert.equal(merged['scene-1'][1].hidden, false, 'goblin-2 should be unhidden in full sync');
});

test('delta merge preserves tokens from scenes not in incoming', () => {
  const existing = {
    'scene-1': [
      { id: 'goblin-1', hidden: false, _lastModified: 2000 },
    ],
    'scene-2': [
      { id: 'dragon', hidden: true, _lastModified: 1000 },
    ],
  };

  // Only scene-1 is in the delta
  const incoming = {
    'scene-1': [
      { id: 'goblin-1', column: 10, hidden: false, _lastModified: 3000 },
    ],
  };

  const merged = mergeSceneKeyedSection(existing, incoming, { fullSync: false });

  assert.ok(merged['scene-2'], 'scene-2 should be preserved');
  assert.equal(merged['scene-2'][0].id, 'dragon');
  assert.equal(merged['scene-2'][0].hidden, true, 'dragon should remain hidden');
});

// ---------------------------------------------------------------------------
// mergeBoardStateSnapshot – full board state merge with visibility
// ---------------------------------------------------------------------------

test('mergeBoardStateSnapshot preserves placement visibility during polling merge', () => {
  const existing = {
    activeSceneId: 'scene-1',
    placements: {
      'scene-1': [
        { id: 'goblin-1', hidden: false, _lastModified: 3000 },
        { id: 'goblin-2', hidden: false, _lastModified: 3000 },
      ],
    },
    sceneState: {},
    templates: {},
    drawings: {},
    pings: [],
  };

  // Server returns full sync with tokens as hidden (stale state)
  // but with _fullSync true, the incoming is authoritative
  const incoming = {
    _fullSync: true,
    activeSceneId: 'scene-1',
    placements: {
      'scene-1': [
        { id: 'goblin-1', hidden: false },
        { id: 'goblin-2', hidden: false },
      ],
    },
    sceneState: {},
    templates: {},
    drawings: {},
    pings: [],
  };

  const merged = mergeBoardStateSnapshot(existing, incoming);

  assert.equal(merged.placements['scene-1'][0].hidden, false, 'goblin-1 hidden state preserved');
  assert.equal(merged.placements['scene-1'][1].hidden, false, 'goblin-2 hidden state preserved');
});

test('mergeBoardStateSnapshot handles bulk unhide correctly in full sync', () => {
  const existing = {
    activeSceneId: 'scene-1',
    placements: {
      'scene-1': [
        { id: 'g1', hidden: true },
        { id: 'g2', hidden: true },
        { id: 'g3', hidden: true },
        { id: 'g4', hidden: true },
        { id: 'g5', hidden: true },
      ],
    },
    sceneState: {},
    templates: {},
    drawings: {},
    pings: [],
  };

  const incoming = {
    _fullSync: true,
    activeSceneId: 'scene-1',
    placements: {
      'scene-1': [
        { id: 'g1', hidden: false },
        { id: 'g2', hidden: false },
        { id: 'g3', hidden: false },
        { id: 'g4', hidden: false },
        { id: 'g5', hidden: false },
      ],
    },
    sceneState: {},
    templates: {},
    drawings: {},
    pings: [],
  };

  const merged = mergeBoardStateSnapshot(existing, incoming);

  merged.placements['scene-1'].forEach((entry, i) => {
    assert.equal(entry.hidden, false, `token g${i + 1} should be unhidden after full sync`);
  });
});
