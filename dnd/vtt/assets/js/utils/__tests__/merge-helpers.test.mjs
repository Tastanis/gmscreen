import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  cloneSectionSimple,
  cloneArraySimple,
  mergeArrayByIdWithTimestamp,
  mergeSceneKeyedSection,
  mergeSceneStatePreservingGrid,
  mergeBoardStateSnapshot,
} from '../merge-helpers.js';

test('cloneSectionSimple returns {} for non-object inputs', () => {
  assert.deepEqual(cloneSectionSimple(null), {});
  assert.deepEqual(cloneSectionSimple(undefined), {});
  assert.deepEqual(cloneSectionSimple(42), {});
  assert.deepEqual(cloneSectionSimple('str'), {});
});

test('cloneSectionSimple deep-clones objects', () => {
  const src = { a: { b: 1 } };
  const copy = cloneSectionSimple(src);
  copy.a.b = 99;
  assert.equal(src.a.b, 1);
});

test('cloneArraySimple returns [] for non-array inputs', () => {
  assert.deepEqual(cloneArraySimple(null), []);
  assert.deepEqual(cloneArraySimple({}), []);
  assert.deepEqual(cloneArraySimple('str'), []);
});

test('cloneArraySimple deep-clones arrays', () => {
  const src = [{ id: 'a' }];
  const copy = cloneArraySimple(src);
  copy[0].id = 'b';
  assert.equal(src[0].id, 'a');
});

test('mergeArrayByIdWithTimestamp: newer incoming wins', () => {
  const existing = [{ id: 'a', v: 1, _lastModified: 100 }];
  const incoming = [{ id: 'a', v: 2, _lastModified: 200 }];
  const merged = mergeArrayByIdWithTimestamp(existing, incoming);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].v, 2);
});

test('mergeArrayByIdWithTimestamp: older incoming loses', () => {
  const existing = [{ id: 'a', v: 1, _lastModified: 200 }];
  const incoming = [{ id: 'a', v: 2, _lastModified: 100 }];
  const merged = mergeArrayByIdWithTimestamp(existing, incoming);
  assert.equal(merged[0].v, 1);
});

test('mergeArrayByIdWithTimestamp: preserves local items absent from incoming', () => {
  const existing = [{ id: 'local', v: 1 }];
  const incoming = [{ id: 'remote', v: 2 }];
  const merged = mergeArrayByIdWithTimestamp(existing, incoming);
  assert.equal(merged.length, 2);
  assert.ok(merged.some((m) => m.id === 'local'));
  assert.ok(merged.some((m) => m.id === 'remote'));
});

test('mergeArrayByIdWithTimestamp: non-array inputs treated as empty', () => {
  assert.deepEqual(mergeArrayByIdWithTimestamp(null, null), []);
  assert.deepEqual(mergeArrayByIdWithTimestamp(undefined, [{ id: 'a' }]), [{ id: 'a' }]);
});

test('mergeSceneKeyedSection: delta merges both sides', () => {
  const existing = { scene1: [{ id: 'a', _lastModified: 1 }] };
  const incoming = { scene2: [{ id: 'b', _lastModified: 1 }] };
  const merged = mergeSceneKeyedSection(existing, incoming, { fullSync: false });
  assert.ok(merged.scene1);
  assert.ok(merged.scene2);
});

test('mergeSceneKeyedSection: fullSync drops scenes missing from incoming', () => {
  const existing = { scene1: [{ id: 'a' }], scene2: [{ id: 'b' }] };
  const incoming = { scene1: [{ id: 'a', _lastModified: 2 }] };
  const merged = mergeSceneKeyedSection(existing, incoming, { fullSync: true });
  assert.ok(merged.scene1);
  assert.ok(!('scene2' in merged));
});

test('mergeSceneKeyedSection: fullSync drops items missing from incoming in same scene', () => {
  const existing = { s: [{ id: 'a' }, { id: 'b' }] };
  const incoming = { s: [{ id: 'a', _lastModified: 1 }] };
  const merged = mergeSceneKeyedSection(existing, incoming, { fullSync: true });
  assert.equal(merged.s.length, 1);
  assert.equal(merged.s[0].id, 'a');
});

test('mergeSceneStatePreservingGrid: preserves grid from existing over incoming', () => {
  const existing = { s: { grid: { size: 128, locked: true, visible: true } } };
  const incoming = { s: { grid: { size: 64, locked: false, visible: true }, combat: {} } };
  const merged = mergeSceneStatePreservingGrid(existing, incoming);
  assert.equal(merged.s.grid.size, 128);
  assert.equal(merged.s.grid.locked, true);
});

test('mergeSceneStatePreservingGrid: keeps newer combat state by sequence', () => {
  const existing = { s: { combat: { sequence: 5, phase: 'gm' } } };
  const incoming = { s: { combat: { sequence: 3, phase: 'stale' } } };
  const merged = mergeSceneStatePreservingGrid(existing, incoming);
  assert.equal(merged.s.combat.phase, 'gm');
  assert.equal(merged.s.combat.sequence, 5);
});

test('mergeSceneStatePreservingGrid: breaks equal combat sequence ties by timestamp', () => {
  const existing = { s: { combat: { sequence: 5, updatedAt: 200, phase: 'newer' } } };
  const staleIncoming = { s: { combat: { sequence: 5, updatedAt: 100, phase: 'stale' } } };
  const freshIncoming = { s: { combat: { sequence: 5, updatedAt: 300, phase: 'fresh' } } };

  const staleMerge = mergeSceneStatePreservingGrid(existing, staleIncoming);
  assert.equal(staleMerge.s.combat.phase, 'newer');

  const freshMerge = mergeSceneStatePreservingGrid(existing, freshIncoming);
  assert.equal(freshMerge.s.combat.phase, 'fresh');
});

test('mergeSceneStatePreservingGrid: coerces array revealedCells to object', () => {
  const existing = { s: { fogOfWar: { revealedCells: { '1,1': true } } } };
  const incoming = { s: { fogOfWar: { revealedCells: [] } } };
  const merged = mergeSceneStatePreservingGrid(existing, incoming);
  assert.equal(Array.isArray(merged.s.fogOfWar.revealedCells), false);
  assert.equal(typeof merged.s.fogOfWar.revealedCells, 'object');
});

test('mergeBoardStateSnapshot: returns existing when incoming is not an object', () => {
  const existing = { placements: { s: [] } };
  assert.equal(mergeBoardStateSnapshot(existing, null), existing);
  assert.equal(mergeBoardStateSnapshot(existing, undefined), existing);
});

test('mergeBoardStateSnapshot: clones incoming when existing is empty', () => {
  const incoming = {
    activeSceneId: 's',
    mapUrl: '/m.png',
    placements: { s: [{ id: 'p' }] },
    pings: [{ id: 'x' }],
  };
  const merged = mergeBoardStateSnapshot(null, incoming);
  assert.equal(merged.activeSceneId, 's');
  assert.equal(merged.mapUrl, '/m.png');
  assert.deepEqual(merged.placements.s, [{ id: 'p' }]);
  assert.notEqual(merged.placements, incoming.placements);
});

test('mergeBoardStateSnapshot: fullSync drops placements missing from incoming', () => {
  const existing = {
    placements: { s: [{ id: 'old', _lastModified: 1 }] },
  };
  const incoming = {
    _fullSync: true,
    placements: { s: [{ id: 'new', _lastModified: 2 }] },
  };
  const merged = mergeBoardStateSnapshot(existing, incoming);
  assert.equal(merged.placements.s.length, 1);
  assert.equal(merged.placements.s[0].id, 'new');
});

test('mergeBoardStateSnapshot: only includes metadata when non-empty', () => {
  const existing = {};
  const merged = mergeBoardStateSnapshot(existing, { metadata: {} });
  assert.equal('metadata' in merged, false);

  const merged2 = mergeBoardStateSnapshot(existing, { metadata: { k: 1 } });
  assert.deepEqual(merged2.metadata, { k: 1 });
});
