// A put-down token's movement line shrinks from its start toward the end (Brandon, October 26, 2026):
// half a second for a short move, at most one second for a long one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { collapseDuration, collapseProgress, prepareCollapse, collapsedRoute } from '../../../../board3d/route-collapse.mjs';

const line = (squares) => ({
  pieces: [{ color: '#111', points: [{ x: 0.5, y: 0.5, z: 0 }, { x: 0.5 + squares / 2, y: 0.5, z: 0 }] }, { color: '#222', points: [{ x: 0.5 + squares / 2, y: 0.5, z: 0 }, { x: 0.5 + squares, y: 0.5, z: 0 }] }],
  nodes: [{ x: 0.5, y: 0.5, z: 0 }, { x: 0.5 + squares / 2, y: 0.5, z: 0 }, { x: 0.5 + squares, y: 0.5, z: 0 }],
  legs: [{ text: '3', at: { x: 0.5 + squares / 4, y: 0.5, z: 0 } }, { text: '3', at: { x: 0.5 + squares * 0.75, y: 0.5, z: 0 } }],
  difficult: [{ multiplier: 2, points: [{ x: 1, y: 0.5, z: 0 }, { x: 2, y: 0.5, z: 0 }], at: { x: 1.5, y: 0.5, z: 0 } }],
  climbs: [],
  total: { text: '6 squares', at: { x: 0.5 + squares, y: 0.5, z: 0 } },
});

test('short moves take half a second, long ones at most one', () => {
  assert.equal(collapseDuration(1), 0.5);
  assert.equal(collapseDuration(2), 0.5);
  assert.ok(collapseDuration(7) > 0.5 && collapseDuration(7) < 1);
  assert.equal(collapseDuration(12), 1);
  assert.equal(collapseDuration(40), 1);
  assert.equal(prepareCollapse(line(6)).duration, collapseDuration(6));
});

test('the line goes from its start toward the end, and is gone at the end', () => {
  const prepared = prepareCollapse(line(6));
  const start = collapsedRoute(prepared, 0);
  assert.equal(start.pieces.length, 2);
  assert.equal(start.nodes.length, 3);
  const half = collapsedRoute(prepared, 0.5);
  const xs = half.pieces.flatMap((piece) => piece.points.map((p) => p.x));
  assert.ok(Math.abs(Math.min(...xs) - 3.5) < 1e-9, 'the first half is gone');
  assert.equal(Math.max(...xs), 6.5, 'the end stays');
  assert.equal(half.legs.length, 1, 'the passed leg length goes');
  assert.equal(half.difficult.length, 0, 'a passed difficult mark goes');
  assert.equal(half.total.text, '6 squares', 'the total stays with the end');
  assert.deepEqual(half.nodes.at(-1), { x: 6.5, y: 0.5, z: 0 });
  const early = collapsedRoute(prepared, 0.2);
  assert.ok(Math.abs(early.difficult[0].points[0].x - 1.7) < 1e-9, 'a difficult mark is trimmed with the line');
  assert.equal(collapsedRoute(prepared, 1), null);
});

test('eased progress starts and ends gently; no line, no collapse', () => {
  assert.equal(collapseProgress(0, 1), 0);
  assert.equal(collapseProgress(1, 1), 1);
  assert.equal(collapseProgress(2, 1), 1);
  assert.ok(collapseProgress(0.1, 1) < 0.1);
  assert.equal(prepareCollapse(null), null);
  assert.equal(prepareCollapse({ pieces: [] }), null);
});
