import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { outlineOf, stepped, windingAt, sortPieces, placedPoints } from '../sight-outline.mjs';
import { adaptiveFog } from '../adaptive-fog.mjs';
import { obstacleReveal } from '../obstacle-reveal.mjs';
import { makeSight } from '../vision-height.mjs';

// The lit ground is handed to the browser as its outline, not as its thousands of pieces (the
// Director, October 9, on a change of a few soft-edge pixels: "I approve the recommended change").
// The outline must cover exactly the ground the pieces covered: which squares are lit does not
// change at all. Only the browser's drawing of the fog's soft edge may differ, by a hair.
const ring = (id, x, y, extra = {}) => {
  const c = [[x + .04, y + .04], [x + .96, y + .04], [x + .96, y + .96], [x + .04, y + .96]];
  return { nodes: c.map(([px, py], k) => ({ id: `${id}${k}`, x: px, y: py })), segments: [0, 1, 2, 3].map((k) => ({ id: `${id}w${k}`, a: `${id}${k}`, b: `${id}${(k + 1) % 4}`, sight: 'block', movement: 'block', height: 3, ...extra })) };
};
const objects = [ring('a', 6, 5), ring('b', 12, 9), ring('c', 15, 4, { sight: 'limited' }), ring('d', 17, 4, { sight: 'limited' }), ring('e', 9, 13), ring('f', 20, 11), ring('g', 3, 12), ring('h', 22, 3)];
const walls = { nodes: objects.flatMap((o) => o.nodes), segments: objects.flatMap((o) => o.segments), ramps: [] };
const groundAt = (x, y) => (x < 10 ? 2 : x < 10.5 ? 2 - (x - 10) * 4 : 0) + 0.05 * Math.sin(y);
const bounds = { left: 0, top: 0, right: 26, bottom: 18 };
function piecesFrom(column, row) {
  const viewer = { id: 'hero', column, row, width: 1, height: 1 }, sight = makeSight({ viewer, viewerGround: groundAt(column + .5, row + .5), groundAt, walls });
  const visible = (p, z = groundAt(p.x, p.y)) => sight(p, z), polygons = [], strips = [];
  adaptiveFog({ ...bounds, visible, emit: (p) => polygons.push(p) });
  obstacleReveal({ polygons, walls, origin: { x: column + .5, y: row + .5 }, groundAt, visible, emit: (p) => strips.push(p) });
  return [...polygons, ...strips];
}
const twiceArea = (r) => r.reduce((sum, p, i) => { const q = r[(i + 1) % r.length]; return sum + p.x * q.y - q.x * p.y; }, 0);
const sameWay = (pieces) => pieces.map((p) => (twiceArea(p) < 0 ? [...p].reverse() : p));
let seed = 31; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

test('the outline covers exactly the ground the pieces cover, from every standing place', () => {
  for (const [column, row] of [[3, 3], [13, 9], [22, 15], [10, 10], [1, 16], [18, 6]]) {
    const pieces = piecesFrom(column, row), loops = outlineOf(pieces), turned = sameWay(pieces);
    assert.ok(pieces.length > 100 && loops.length < pieces.length / 4, `${pieces.length} pieces became ${loops.length} loops`);
    let lit = 0;
    for (let k = 0; k < 1500; k++) {
      const p = { x: rnd() * 26 + 1.3e-7, y: rnd() * 18 + 2.9e-7 }, before = windingAt(turned, p), after = windingAt(loops, p);
      if (before) lit++;
      assert.equal(after, before, `from (${column},${row}) at (${p.x.toFixed(3)},${p.y.toFixed(3)})`);
    }
    assert.ok(lit > 150, 'lit and unlit ground were both tried');
    // The same amount of ground, to the last crumb.
    const area = (rings) => rings.reduce((sum, r) => sum + twiceArea(r), 0);
    assert.ok(Math.abs(area(loops) - area(turned)) < 1e-6);
  }
});

test('far fewer points are handed to the browser', () => {
  const pieces = piecesFrom(13, 9), loops = outlineOf(pieces);
  const now = pieces.reduce((n, r) => n + r.reduce((m, a, i) => m + Math.max(1, Math.ceil(Math.hypot(r[(i + 1) % r.length].x - a.x, r[(i + 1) % r.length].y - a.y) * 8)), 0), 0);
  const then = loops.reduce((n, loop) => n + stepped(loop).length, 0);
  assert.ok(then < now / 3, `${now} points became ${then}`);
});

test('whole squares side by side become one loop; an unlit island is a loop going the other way', () => {
  const square = (x, y) => [{ x, y }, { x: x + 1, y }, { x: x + 1, y: y + 1 }, { x, y: y + 1 }];
  // A three by three block with its middle square unlit.
  const pieces = []; for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (x !== 1 || y !== 1) pieces.push(square(x, y));
  const loops = outlineOf(pieces);
  assert.equal(loops.length, 2);
  const [outer, island] = loops.sort((a, b) => Math.abs(twiceArea(b)) - Math.abs(twiceArea(a)));
  assert.equal(twiceArea(outer), 18); assert.equal(twiceArea(island), -2, 'the island is wound the other way');
  assert.equal(outer.length, 4, 'only its four corners are kept'); assert.equal(island.length, 4);
  assert.equal(windingAt(loops, { x: 1.5, y: 1.5 }), 0, 'the island stays unlit');
  assert.equal(windingAt(loops, { x: 0.5, y: 1.5 }), 1); assert.equal(windingAt(loops, { x: 3.5, y: 1.5 }), 0);
  // A piece listed the other way round is turned first; two halves beside a whole cancel against its one long edge.
  const mixed = outlineOf([square(0, 0), [{ x: 1, y: 0 }, { x: 1, y: .5 }, { x: 1.5, y: .5 }, { x: 1.5, y: 0 }], [{ x: 1, y: .5 }, { x: 1.5, y: .5 }, { x: 1.5, y: 1 }, { x: 1, y: 1 }]]);
  assert.equal(mixed.length, 1); assert.equal(twiceArea(mixed[0]), 3);
  // Pieces that overlap are both kept: the ground under both is wound twice, and still lit.
  const twice = outlineOf([square(0, 0), [{ x: .5, y: 0 }, { x: 1.5, y: 0 }, { x: 1.5, y: 1 }, { x: .5, y: 1 }]]);
  assert.equal(windingAt(twice, { x: .75, y: .5 }), 2); assert.equal(windingAt(twice, { x: .25, y: .5 }), 1); assert.equal(windingAt(twice, { x: 1.25, y: .5 }), 1);
  assert.deepEqual(outlineOf([]), []); assert.deepEqual(outlineOf([[{ x: 0, y: 0 }, { x: 1, y: 0 }]]), []);
});

test('in-between points stand where a single square\'s edge has them', () => {
  // Along a grid line: at whole eighths of a square, even when the run starts part-way along one.
  const loop = [{ x: 0.3125, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 2.5 }, { x: 0.3125, y: 2.5 }];
  const points = stepped(loop);
  assert.deepEqual(points.slice(0, 7).map((p) => p.x), [0.3125, 0.375, 0.5, 0.625, 0.75, 0.875, 1]);
  assert.ok(points.every((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y), 'no point twice running');
  const whole = stepped([{ x: 2, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 4 }, { x: 2, y: 4 }]);
  assert.equal(whole.length, 32, 'eight to a square of edge');
  assert.deepEqual(whole.slice(8, 12), [{ x: 3, y: 3 }, { x: 3, y: 3.125 }, { x: 3, y: 3.25 }, { x: 3, y: 3.375 }]);
  assert.deepEqual(whole.slice(16, 19), [{ x: 3, y: 4 }, { x: 2.875, y: 4 }, { x: 2.75, y: 4 }], 'and backwards along the far side');
  // A slanting edge is cut evenly, as before.
  const slant = stepped([{ x: 0, y: 0 }, { x: 1, y: 0.5 }, { x: 0, y: 0.5 }]);
  assert.equal(slant.filter((p) => p.x > 0 && p.x < 1 && p.y > 0 && p.y < 0.5).length, 8);
});

test('a piece the slant folds over is kept out of the outline and drawn as it always was', () => {
  // Found by the tester on Dead Root (Build 455, the rope bridge): a quarter of a square of lit
  // ground on a steep face was left dark. On a cliff the slanted view lays the ground over itself.
  // Ground rising two and a half squares in a tenth of a square going south, drawn at the usual slant.
  const g = 72, groundAt = (x, y) => (y < 5.2 ? 0 : y < 5.3 ? (y - 5.2) * 25 : 2.5);
  const place = (x, y) => ({ x: x * g + groundAt(x, y) * g * 0.12, y: y * g - groundAt(x, y) * g * 0.36 });
  const square = (x, y, size = 1) => [{ x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }];
  const twiceArea = (r) => r.reduce((sum, p, i) => { const q = r[(i + 1) % r.length]; return sum + p.x * q.y - q.x * p.y; }, 0);
  const flat = square(3, 3), top = square(3, 6), face = [{ x: 3, y: 5.2 }, { x: 4, y: 5.2 }, { x: 4, y: 5.3 }, { x: 3, y: 5.3 }];
  // Its corners alone would not show it: the long way round, with every point it is placed by, does.
  const straddling = [{ x: 3, y: 5 }, { x: 3.5, y: 5 }, { x: 3.5, y: 5.5 }, { x: 3, y: 5.5 }];
  assert.ok(twiceArea(face.map((p) => place(p.x, p.y))) < 0, 'the cliff face lands on the screen turned over');
  const { whole, alone } = sortPieces([flat, top, face, straddling], place);
  assert.deepEqual(whole, [flat, top], 'level ground shares the outline');
  assert.equal(alone.length, 2, 'the face, and the piece across its foot, are drawn by themselves');
  for (const points of alone) assert.ok(twiceArea(points) > 0, 'turned so that their area on the screen counts as lit');
  assert.deepEqual(alone[0].length, placedPoints(face, place).length);
  // The test is the one that used to turn each piece: on all the points it is placed by, not on its
  // corners. Build 455 judged by corners, and on real ground the two can disagree (on Dead Root: a
  // piece whose corners said "level" and whose points said "turned over"). Here, a placing that puts
  // the corners where they belong and everything between them mirrored.
  const mirrored = (x, y) => (Number.isInteger(x * 2) && Number.isInteger(y * 2) ? { x: x * g, y: y * g } : { x: -x * g, y: y * g });
  const odd = square(10, 10), byCorners = twiceArea(odd.map((p) => mirrored(p.x, p.y))), byAllPoints = twiceArea(placedPoints(odd, mirrored));
  assert.ok(byCorners > 0 && byAllPoints < 0, `corners say ${byCorners.toFixed(0)}, every point says ${byAllPoints.toFixed(0)}`);
  const judged = sortPieces([odd], mirrored);
  assert.deepEqual(judged.whole, [], 'so it is not in the outline');
  assert.equal(judged.alone.length, 1); assert.ok(twiceArea(judged.alone[0]) > 0);
  // A piece listed the other way round on the grid, on level ground, is not "folded": it joins the outline.
  const backwards = [...square(8, 3)].reverse();
  assert.deepEqual(sortPieces([backwards], place), { whole: [backwards], alone: [] });
});

test('the sight layer draws the outline, and still draws by itself a piece the slant folds over', () => {
  const source = readFileSync(new URL('../vision-prototype.js', import.meta.url), 'utf8');
  assert.match(source, /for\(const loop of outlineOf\(whole\)\)addRing\(stepped\(loop\)\.map\(p=>projected\(p\.x,p\.y\)\)\);/);
  assert.match(source, /const \{whole,alone\}=sortPieces\(pieces\.splice\(0\),projected\);\s+for\(const points of alone\)addRing\(points\);/);
  // The outline is made as the job's last step, in a slice of its own, before the picture is shown.
  assert.match(source, /emit:polygon=>pieces\.push\(polygon\)\}\);yield;seal\(\);return result;\};/);
  assert.match(source, /const job=queue\.ask\(createJob\(key,steps\(\),\{family,path,asked:start\}\),keptForMemory\);/);
});
