import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { intersectsFloor, walkFloorContact } from '../floor-support.js';
import { travelPath } from '../travel-height.mjs';
import { movementBlocked } from '../wall-properties.mjs';
import { resolveForcedDrag } from '../forced-drag.js';
import { forcedTerrainBlocked } from '../forced-flight-terrain.js';

// Brandon, October 12, 2026: "Force moving over a long drop, like 20 squares down, is freezing. Its like its
// calculating all sorts of movement variations ... It usually works fine but on the gravity orchard map it froze
// the game pushing them from one platform over another."
//
// The rule was right and is not changed: a pushed creature goes in a straight line, travels on level once it has
// left its footing, and falls when the move ends. What froze was the working out. A push that is stopped is tried
// some thirty times to find where; every try read the footing at every place again, each reading walked the path
// from its start, and every step of that walk laid every cut-out of the floor over the token's square. These
// tests hold the answers still while that work is taken out. The server's side is forced-move-speed.test.php.

// The floor-overlap rule as it was before the change, cut-outs laid out whole, for comparison.
const bands = (ring, x) => { const ys = []; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a.x > x) !== (b.x > x)) ys.push(a.y + (x - a.x) * (b.y - a.y) / (b.x - a.x)); } ys.sort((a, b) => a - b); const result = []; for (let i = 0; i + 1 < ys.length; i += 2) result.push([ys[i], ys[i + 1]]); return result; };
function intersectsFloorBefore(p, surface, cuts = []) {
  const left = p.column, right = left + (p.width || 1), top = p.row, bottom = top + (p.height || 1), outer = surface.points || [];
  if (outer.length < 3) return false;
  const holes = [...(surface.holes || []), ...cuts.map((c) => [{ x: c.column, y: c.row }, { x: c.column + c.width, y: c.row }, { x: c.column + c.width, y: c.row + c.height }, { x: c.column, y: c.row + c.height }])];
  const xs = [left, right], edges = [];
  for (const ring of [outer, ...holes]) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]; if (Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom) edges.push([a, b]); if (a.x > left && a.x < right) xs.push(a.x);
    for (const y of [top, bottom]) if ((a.y > y) !== (b.y > y)) { const x = a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y); if (x > left && x < right) xs.push(x); }
  }
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const [a, b] = edges[i], [c, d] = edges[j], vx = b.x - a.x, vy = b.y - a.y, wx = d.x - c.x, wy = d.y - c.y, den = vx * wy - vy * wx; if (Math.abs(den) < 1e-12) continue;
    const t = ((c.x - a.x) * wy - (c.y - a.y) * wx) / den, u = ((c.x - a.x) * vy - (c.y - a.y) * vx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) { const x = a.x + t * vx; if (x > left && x < right) xs.push(x); }
  }
  xs.sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] - xs[i - 1] <= 1e-7) continue; const x = (xs[i] + xs[i - 1]) / 2, blocked = holes.flatMap((h) => bands(h, x)).sort((a, b) => a[0] - b[0]);
    for (const [a, b] of bands(outer, x)) { let cursor = Math.max(top, a); const end = Math.min(bottom, b); if (end - cursor <= 1e-7) continue;
      for (const [c, d] of blocked) { if (d <= cursor) continue; if (c > cursor + 1e-7) return true; cursor = Math.max(cursor, d); if (cursor >= end - 1e-7) break; } if (end - cursor > 1e-7) return true;
    }
  }
  return false;
}

// A ragged plate with a hole of its own, on a floor with well over a hundred cut-outs: whole squares, half
// squares, slivers, some overlapping each other, some outside the plate.
const plate = { id: 'deck', kind: 'floor', levelId: 'up', height: 6, points: [{ x: 2, y: 2 }, { x: 9.5, y: 1.25 }, { x: 14, y: 3 }, { x: 13.25, y: 9.5 }, { x: 15, y: 13 }, { x: 8, y: 14.75 }, { x: 3.5, y: 12 }, { x: 1.25, y: 7 }], holes: [[{ x: 6, y: 6 }, { x: 8, y: 6 }, { x: 8, y: 7.5 }, { x: 6, y: 7.5 }]] };
const cuts = [];
for (let n = 0; n < 130; n++) {
  const column = (n * 7) % 16 + (n % 3 === 0 ? 0.5 : n % 5 === 0 ? 0.25 : 0), row = (n * 5) % 16 + (n % 4 === 0 ? 0.5 : 0);
  cuts.push({ column, row, width: n % 6 === 0 ? 0.25 : n % 7 === 0 ? 2 : 1, height: n % 9 === 0 ? 0.5 : n % 11 === 0 ? 3 : 1 });
}

test('a floor with many cut-outs holds up exactly the squares it held up before', () => {
  let asked = 0, held = 0;
  for (const size of [1, 2, 3]) for (let row = -1; row <= 16; row += 0.25) for (let column = -1; column <= 16; column += 0.25) {
    const p = { column, row, width: size, height: size }, now = intersectsFloor(p, plate, cuts);
    assert.equal(now, intersectsFloorBefore(p, plate, cuts), `square ${column},${row} size ${size}`);
    asked++; if (now) held++;
  }
  assert.ok(held > asked / 10 && held < asked, 'the plate holds some of the squares asked about and not others');
  // And the eighths of a square a walk is read at, off the grid.
  for (let k = 0; k < 400; k++) { const p = { column: 1 + (k * 0.377) % 13, row: 1 + (k * 0.611) % 13, width: 1, height: 1 }; assert.equal(intersectsFloor(p, plate, cuts), intersectsFloorBefore(p, plate, cuts), `place ${p.column},${p.row}`); }
  // With no cut-outs, or only ones that reach the square, nothing is set aside at all.
  assert.equal(intersectsFloor({ column: 4, row: 4 }, plate, []), true);
  assert.equal(intersectsFloor({ column: 6.5, row: 6.25 }, plate, []), false, 'wholly over the plate\'s own hole');
  assert.equal(intersectsFloor({ column: 4, row: 4 }, plate, [{ column: 4, row: 4, width: 1, height: 1 }]), false, 'a cut-out over the whole square');
  assert.equal(intersectsFloor({ column: 4, row: 4 }, plate, [{ column: 4, row: 4, width: 1, height: 1 }, { column: 12, row: 12, width: 1, height: 1 }]), false, 'and a far one beside it changes nothing');
});

// Three islands over a pit, a rock on each, a far wall. The footing of a place is read the way the page reads it:
// the plate a walk from the start reaches, else the ground.
const island = (id, left, top, right, bottom, height, levelId) => ({ id, kind: 'floor', levelId, height, points: [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }] });
const surfaces = [island('a', 2, 2, 8, 8, 12, 'mid'), island('b', 11, 2, 16, 8, 12, 'mid'), island('c', 2, 11, 8, 16, 6, 'low'), island('d', 18, 3, 22, 7, 13, 'mid')];
const levels = { levels: [{ id: 'low', elevationSquares: 6, cutouts: cuts.slice(0, 60) }, { id: 'mid', elevationSquares: 12, cutouts: cuts.slice(60) }] };
const box = (id, column, row, base, height) => { const c = [[column + 0.04, row + 0.04], [column + 0.96, row + 0.04], [column + 0.96, row + 0.96], [column + 0.04, row + 0.96]]; return { nodes: c.map(([x, y], k) => ({ id: `${id}-n${k}`, x, y })), segments: c.map((_, k) => ({ id: `${id}-s${k}`, a: `${id}-n${k}`, b: `${id}-n${(k + 1) % 4}`, baseMode: 'fixed', base, height, movement: 'block' })) }; };
const parts = [box('rock-b', 13, 4, 12, 3), box('rock-far', 20, 4, 13, 3), box('stump', 5, 13, 6, 2), box('floor-rock', 9, 5, 0, 2)];
const model = { nodes: parts.flatMap((p) => p.nodes), segments: parts.flatMap((p) => p.segments) };
const groundAt = (x) => (x > 24 ? 14 : 0), terrainUnder = (p) => groundAt(p.column + (p.width || 1) / 2);
const cutsOf = (id) => levels.levels.find((l) => l.id === id)?.cutouts || [];
const groundFor = (p) => { const s = surfaces.find((q) => q.id === p._supportSurfaceId); return s && intersectsFloor(p, s, cutsOf(s.levelId)) ? s.height : terrainUnder(p); };
const steppedTo = (from, to) => { const s = walkFloorContact(from, to, [], surfaces, levels, terrainUnder, false); return groundFor(s ? { ...to, levelId: s.levelId, _supportSurfaceId: s.id } : { ...to, _supportSurfaceId: null }); };
const place = (v) => Math.round(v * 1e9);
const remembered = (read, count) => { const seen = new Map(); return (at) => { const key = place(at.column) + ',' + place(at.row); let z = seen.get(key); if (z === undefined) { count.read++; z = read(at); seen.set(key, z); } return z; }; };
function plan(from, to, others, remember, count = { read: 0 }) {
  const counted = (read) => (at) => { count.read++; return read(at); };
  const plain = remember ? remembered(groundFor, count) : counted(groundFor), stepped = remember ? remembered((at) => steppedTo(from, at), count) : counted((at) => steppedTo(from, at));
  const path = travelPath(from, plain, { kind: 'forced' }), z = (at, bare = false) => path.heightAt(at, bare ? undefined : stepped(at));
  // As the page's forcedBlockedMove does: a rising face of ground, ground standing above a mover in the air, a wall.
  const blocked = (origin, end) => forcedTerrainBlocked(origin, end, groundAt, (t) => z(t, true)) || path.slams(end) || movementBlocked(model, origin, end, (t) => z(t), groundAt);
  return resolveForcedDrag(from, to, others, { wallBlocked: blocked, height: groundFor, moverHeight: (origin, at) => z(at) });
}

test('a push planned with the footings remembered is the push planned without, read far fewer times', () => {
  const starts = [{ column: 4, row: 4, levelId: 'mid', _supportSurfaceId: 'a' }, { column: 12, row: 5, levelId: 'mid', _supportSurfaceId: 'b' }, { column: 4, row: 12, levelId: 'low', _supportSurfaceId: 'c' }, { column: 6, row: 6, levelId: 'mid', _supportSurfaceId: 'a' }];
  const others = [{ id: 'on-b', column: 14, row: 6, width: 1, height: 1, levelId: 'mid', _supportSurfaceId: 'b' }, { id: 'below', column: 9, row: 3, width: 1, height: 1 }];
  let stopped = 0, plain = 0, slower = 0, faster = 0;
  for (const start of starts) for (const distance of [3, 6, 10, 16, 22]) for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const from = { id: 'pushed', width: 1, height: 1, ...start }, to = { ...from, column: from.column + ux * distance, row: from.row + uy * distance };
    if (to.column < 0 || to.row < 0) continue;
    const was = { read: 0 }, is = { read: 0 }, before = plan(from, to, others, false, was), after = plan(from, to, others, true, is);
    assert.deepEqual(after, before, `from ${from.column},${from.row} pushed ${distance} toward ${ux},${uy}`);
    // A push that a wall or the ground stops is the one that is tried again and again.
    if (after.wall) { stopped++; slower += was.read; faster += is.read; } else plain++;
  }
  assert.ok(stopped >= 10 && plain >= 10, `both kinds of push are in the set (${stopped} stopped, ${plain} not)`);
  assert.ok(faster * 4 < slower, `a stopped push reads the footings at least four times less often (${faster} against ${slower})`);
});

test('the page keeps the footings it has read with the path they belong to', () => {
  const walls = readFileSync(new URL('../wall-prototype.js', import.meta.url), 'utf8');
  assert.match(walls, /stepped:remembered\(at=>terrainPrototype\.movementGroundFor\(from,at\)\)/, 'the footing a mover has stepped to is read once a place');
  assert.match(walls, /travelPath\(from,remembered\(t=>terrainPrototype\.groundFor\(t\)\),\{kind\}\)/, 'and the plain footing under it');
  assert.match(walls, /queueMicrotask\(\(\)=>\{travelPaths=null;\}\)/, 'for no longer than the board cannot change under it');
  assert.match(walls, /own\.path\.heightAt\(at,plain\?undefined:own\.stepped\(at\)\)/);
});
