import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeFaces, slantVector } from '../height-view.mjs';

// Raised ground at the south or west edge of the map is drawn away from the map's own edge. The
// strip that leaves is closed with the side of the ground. A grid of ground points as the board
// builds it: 100 pixels a square, one point a square, drawn at the given slant.
function ground(n, m, heightAt, slant = slantVector()) {
  const points = [];
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
    const gx = i * 100, gy = j * 100, z = heightAt(i, j);
    points.push({ x: gx + z * 100 * slant.x, y: gy - z * 100 * slant.y, gx, gy, u: i / (n - 1), v: j / (m - 1), light: 1 });
  }
  return points;
}
const box = (faces) => { const all = faces.flat(); return [Math.min(...all.map((p) => p.x)), Math.min(...all.map((p) => p.y)), Math.max(...all.map((p) => p.x)), Math.max(...all.map((p) => p.y))].map((value) => Math.round(value)); };

test('flat ground has no edge faces, at any slant', () => {
  assert.deepEqual(edgeFaces(ground(5, 4, () => 0), 5, 4), []);
  assert.deepEqual(edgeFaces(ground(5, 4, () => 0, slantVector(0.12)), 5, 4), []);
});

test('a rim along the south edge: its side fills the strip down to the map\'s own edge', () => {
  // The bottom row is 18 high: at a slant of 0.12 it is drawn 2.16 squares up the screen.
  const faces = edgeFaces(ground(5, 4, (i, j) => (j === 3 ? 18 : 0), slantVector(0.12)), 5, 4);
  // Four edge pieces along the south, two triangles each; and the one west piece that touches the raised corner.
  assert.equal(faces.length, 10);
  const south = faces.slice(0, 8);
  assert.deepEqual(box(south), [0, 84, 472, 300], 'from where the edge is drawn (row 0.84) to where it is (row 3)');
  // Each face is the ground's own picture at that edge, darkened; its foot lies on the true edge.
  for (const [a, b, c] of south) {
    assert.equal(a.light, 1);
    assert.ok([b, c].some((p) => p.light === 0.5 && p.y === p.gy && p.x === p.gx), 'one corner at least is on the true edge, in shade');
    assert.ok([a, b, c].every((p) => p.v === 1), 'the picture is taken from the map\'s south edge');
  }
});

test('a rim along the west edge is closed the same way', () => {
  const faces = edgeFaces(ground(4, 5, (i) => (i === 0 ? 10 : 0), slantVector(0.36)), 4, 5);
  const west = faces.slice(-8);
  // 10 high at the usual slant: drawn 1.2 squares to the right and 3.6 up.
  assert.deepEqual(box(west), [0, -360, 120, 400]);
  assert.ok(west.flat().every((p) => p.u === 0), 'the picture is taken from the map\'s west edge');
});

test('at a slant of zero nothing is drawn away from the edge, so nothing needs closing', () => {
  assert.deepEqual(edgeFaces(ground(5, 4, () => 18, slantVector(0)), 5, 4), []);
});

test('ground below the map\'s level at the edge is left alone', () => {
  // A pit at the south edge is drawn below the edge, outside the map; there is no gap inside it.
  assert.deepEqual(edgeFaces(ground(5, 4, (i, j) => (j === 3 ? -6 : 0)), 5, 4), []);
  // Only the raised stretch of an uneven edge is closed.
  const faces = edgeFaces(ground(6, 3, (i, j) => (j === 2 && i >= 3 ? 4 : 0)), 6, 3);
  assert.equal(faces.length, 6, 'the three pieces that touch raised ground');
  assert.equal(Math.min(...faces.flat().map((p) => p.gx)), 200);
});

test('a click on an edge face lands on the edge of the map', () => {
  // Each corner of a face carries the flat-map position it stands for: on the south edge, row 3.
  const faces = edgeFaces(ground(5, 4, (i, j) => (j === 3 ? 18 : 0), slantVector(0.12)), 5, 4).slice(0, 8);
  assert.ok(faces.flat().every((p) => p.gy === 300));
});
