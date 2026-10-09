import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { makeSight } from '../vision-height.mjs';
import { compileTerrainVision } from '../terrain-vision.mjs';

// Moving a token on a map with hundreds of walls took a third of a second (Dead Root, October 9):
// the sight picture was worked out twice for each move, each line of sight looked at every wall on
// the map, and each built and sorted a list of the ground tiles it crossed. The speed changes must
// not change one answer. The numbers pinned here were made by the code as it was before them.
function scene() {
  let seed = 20261009; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  // Rolling ground with two mesas and a pit, 40 by 30 squares, seven mesh points to a square.
  const n = 281, m = 211, h = new Float32Array(n * m);
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) { const x = i / 7, y = j / 7; h[j * n + i] = 0.3 * Math.sin(x * 0.7) * Math.cos(y * 0.5) + (x > 10 && x < 14 && y > 8 && y < 13 ? 3 : 0) + (x > 26 && x < 31 && y > 18 && y < 24 ? 5 : 0) - (x > 18 && x < 22 && y > 2 && y < 6 ? 2 : 0); }
  const nodes = [], segments = [];
  const wall = (ax, ay, bx, by, extra) => { const k = segments.length; nodes.push({ id: 'a' + k, x: ax, y: ay }, { id: 'b' + k, x: bx, y: by }); segments.push({ id: 'w' + k, a: 'a' + k, b: 'b' + k, sight: 'block', movement: 'block', ...extra }); };
  // Sixty one-square objects (rings of four walls), half of them "limited"; long runs; one-way and fixed-base walls.
  for (let k = 0; k < 60; k++) { const x = 1 + Math.floor(rnd() * 37) + .04, y = 1 + Math.floor(rnd() * 27) + .04, s = .92, extra = { sight: k % 2 ? 'limited' : 'block', height: 1 + (k % 4) * .75, ...(k % 5 === 0 ? { baseMode: 'fixed', base: (k % 3) * 2 } : {}) }; wall(x, y, x + s, y, extra); wall(x + s, y, x + s, y + s, extra); wall(x + s, y + s, x, y + s, extra); wall(x, y + s, x, y, extra); }
  for (let k = 0; k < 40; k++) { const x = rnd() * 38, y = rnd() * 28, a = rnd() * 6.283, len = .5 + rnd() * 6; wall(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, { sight: ['block', 'limited', 'limited', 'pass'][k % 4], height: .5 + rnd() * 4, ...(k % 3 === 0 ? { sightDirection: k % 2 ? 'left' : 'right' } : {}) }); }
  return { field: { n, m, h }, walls: { nodes, segments, ramps: [] }, rnd };
}
const digest = (text) => createHash('sha256').update(text).digest('hex').slice(0, 24);

test('sight and the ground test give the answers they gave before the speed changes', () => {
  const { field, walls, rnd } = scene(), terrain = compileTerrainVision(field, { left: 0, top: 0, width: 40, height: 30 }), groundAt = terrain.heightAt;
  let bits = '', ground = '';
  for (let v = 0; v < 12; v++) {
    const viewer = { id: 'v', column: 1 + Math.floor(rnd() * 37), row: 1 + Math.floor(rnd() * 27), width: 1 + (v % 3 === 0), height: 1 + (v % 3 === 0) };
    const viewerGround = groundAt(viewer.column + viewer.width / 2, viewer.row + viewer.height / 2), sight = makeSight({ viewer, viewerGround, groundAt, walls, terrain });
    for (let k = 0; k < 500; k++) {
      const p = { x: rnd() * 40, y: rnd() * 30 }, kind = k % 4, z = kind === 0 ? groundAt(p.x, p.y) : kind === 1 ? groundAt(p.x, p.y) + 1 : kind === 2 ? rnd() * 8 - 2 : viewerGround + 1;
      const other = k % 7 === 0 ? { id: 'o', column: Math.floor(p.x), row: Math.floor(p.y), width: 1, height: 1 } : null;
      bits += sight(p, z, other) ? '1' : '0';
      ground += terrain.blocks({ x: viewer.column + .5, y: viewer.row + .5 }, viewerGround + 1, p, z, viewer, k % 2 ? viewerGround : null) ? '1' : '0';
    }
  }
  assert.equal((bits.match(/1/g) || []).length, 1982, 'points seen, of 6000');
  assert.equal((ground.match(/1/g) || []).length, 2052, 'lines the ground stops, of 6000');
  assert.equal(digest(bits), '71bd68ea68db648d3a3a79c5');
  assert.equal(digest(ground), '02d927492fa48f94fd567b9a');
});

test('walls filed by direction answer exactly as every wall looked at one by one', () => {
  // A viewpoint looks at every wall for its first few questions and files them by direction after
  // that. Ask a fresh viewpoint each question, and a well-used one the same question.
  const { walls, rnd } = scene(), groundAt = (x, y) => 0.2 * Math.sin(x) + 0.1 * Math.cos(y);
  let differences = 0, asked = 0, seen = 0;
  for (let v = 0; v < 6; v++) {
    const viewer = { id: 'v', column: Math.floor(rnd() * 38) + 1, row: Math.floor(rnd() * 28) + 1, width: 1, height: 1 }, viewerGround = groundAt(viewer.column + .5, viewer.row + .5);
    const used = makeSight({ viewer, viewerGround, groundAt, walls });
    for (let k = 0; k < 40; k++) used({ x: rnd() * 40, y: rnd() * 30 }, 1);
    const points = [];
    for (let k = 0; k < 300; k++) points.push([{ x: rnd() * 40, y: rnd() * 30 }, rnd() * 5 - 1]);
    // Straight along the compass lines and the diagonals, where one direction's file ends and the next begins.
    for (let k = 0; k < 64; k++) { const a = k * Math.PI / 32, d = 2 + (k % 9) * 3; points.push([{ x: viewer.column + .5 + Math.cos(a) * d, y: viewer.row + .5 + Math.sin(a) * d }, viewerGround + (k % 3)]); }
    // At both ends and the middle of every wall.
    const nodes = new Map(walls.nodes.map((n) => [n.id, n]));
    for (const e of walls.segments.filter((_, i) => i % 3 === v % 3)) { const a = nodes.get(e.a), b = nodes.get(e.b); for (const u of [0, .5, 1]) for (const past of [.999, 1.001, 1.6]) { const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u; points.push([{ x: viewer.column + .5 + (x - viewer.column - .5) * past, y: viewer.row + .5 + (y - viewer.row - .5) * past }, viewerGround + .5]); } }
    for (const [p, z] of points) {
      const fresh = makeSight({ viewer, viewerGround, groundAt, walls })(p, z), filed = used(p, z);
      asked++; if (fresh) seen++; if (fresh !== filed) differences++;
    }
  }
  assert.equal(differences, 0, `${differences} of ${asked} answers differ`);
  assert.ok(seen > asked / 10 && seen < asked * 9 / 10, `a real mix of seen and unseen: ${seen} of ${asked}`);
});

test('a viewpoint beside, on and inside walls still sees what it saw', () => {
  // Walls that touch the viewer or pass close by are looked at by every line, whatever the direction.
  const nodes = [], segments = [];
  const ring = (id, x, y, extra) => { const c = [[x + .04, y + .04], [x + .96, y + .04], [x + .96, y + .96], [x + .04, y + .96]]; c.forEach(([px, py], k) => nodes.push({ id: `${id}${k}`, x: px, y: py })); for (let k = 0; k < 4; k++) segments.push({ id: `${id}w${k}`, a: `${id}${k}`, b: `${id}${(k + 1) % 4}`, sight: 'block', movement: 'block', height: 3, ...extra }); };
  ring('own', 10, 10); ring('east', 11, 10); ring('far', 20, 10, { sight: 'limited' }); ring('farther', 23, 10, { sight: 'limited' });
  for (let k = 0; k < 8; k++) ring('pad' + k, 3 + k * 4, 25);
  const walls = { nodes, segments, ramps: [] }, groundAt = () => 0, viewer = { id: 'v', column: 10, row: 10, width: 1, height: 1 };
  const used = makeSight({ viewer, viewerGround: 0, groundAt, walls });
  for (let k = 0; k < 20; k++) used({ x: k, y: 3 }, 0);
  for (const p of [{ x: 13, y: 10.5 }, { x: 10.5, y: 5 }, { x: 5, y: 10.5 }, { x: 10.5, y: 14 }, { x: 21.5, y: 10.5 }, { x: 30, y: 10.5 }, { x: 30, y: 12 }, { x: 10.6, y: 10.6 }]) {
    assert.equal(used(p, 0), makeSight({ viewer, viewerGround: 0, groundAt, walls })(p, 0), `(${p.x},${p.y})`);
  }
  assert.equal(used({ x: 13, y: 10.5 }, 0), false, 'the ring the viewer stands in still stops sight');
});

test('the wall layer does not mark the walls as changed when only the view changed', () => {
  const source = readFileSync(new URL('../wall-prototype.js', import.meta.url), 'utf8');
  // A redraw for a new zoom or a new GM viewing height keeps the walls' revision, so the sight
  // picture is not worked out a second time for every token move on uneven ground.
  assert.match(source, /function render\(lookOnly=false\)\{try\{draw\(lookOnly\);\}finally\{drawHeight=undefined;\}\}/);
  assert.match(source, /synchronizeInspectionHeight\(\);\s+if\(!lookOnly\)revision\+\+;/);
  assert.match(source, /if\(frame!==frameSignature\)\{frameSignature=frame;lookSignature=look;render\(\);\}else if\(look!==lookSignature\)\{lookSignature=look;render\(true\);\}/);
  assert.match(source, /look=JSON\.stringify\(\[heightToShow\(\),c\.view\.scale\]\)/);
  assert.equal((source.match(/if\(synchronizeInspectionHeight\(\)\)render\(true\);/g) || []).length, 3);
  assert.equal((source.match(/if\(synchronizeInspectionHeight\(\)\)\{render\(true\);return;\}/g) || []).length, 3);
  assert.equal((source.match(/[^.\w]render\(\)/g) || []).length > 5, true, 'changes to the walls themselves still redraw and say so');
  // Undoing a half-made wall drag does change the walls, and says so.
  assert.match(source, /if\(drag\)\{const old=drag;model=old\.before;revision\+\+;drag=null;/);
  // The GM's viewing height is read once for a redraw, not once for each point of each wall.
  assert.match(source, /drawHeight=context\.isGM\?inspectionHeight:undefined;/);
  assert.match(source, /context\.isGM\?\(drawHeight!==undefined\?drawHeight:gmVision\.height\):terrainPrototype\.heightAt\(x,y\)/);
  // "It could just check for only doors and windows instead of redrawing everything." With the
  // Walls panel closed the faint lines keep the height they were drawn for until the GM's viewing
  // height has moved an eighth of a square, so a token crossing uneven ground redraws nothing.
  assert.match(source, /const HEIGHT_HOLD=\.125;/);
  assert.match(source, /return panel\.hidden&&next!==null&&inspectionHeight!==null&&Math\.abs\(next-inspectionHeight\)<HEIGHT_HOLD\?inspectionHeight:next;/);
  assert.match(source, /function synchronizeInspectionHeight\(\)\{\s+const next=heightToShow\(\);if\(next===inspectionHeight\)return false;/);
  // The door and window buttons are picked out once for each change to the walls.
  const editor = readFileSync(new URL('../wall-editor.mjs', import.meta.url), 'utf8');
  assert.match(editor, /if\(doorsAt!==revision\(\)\)\{doorsAt=revision\(\);doors=m\.segments\.filter\(raw=>properties\(raw\)\.interaction!=='none'\);\}\s+if\(!doors\.length\)return;/);
  assert.match(source, /createWallEditor\(\{panel,transform,selected:\(\)=>selectedEdges\(\),model:\(\)=>model,revision:\(\)=>revision,/);
  // Explored ground is saved when the board has been still for a moment, and at the latest after twenty seconds.
  const explored = readFileSync(new URL('../explored-fog.mjs', import.meta.url), 'utf8');
  assert.match(explored, /const SAVE_QUIET=2500,SAVE_LATEST=20000;/);
  assert.match(explored, /clearTimeout\(timer\);timer=setTimeout\(persist,Math\.max\(0,Math\.min\(SAVE_QUIET,dirtySince\+SAVE_LATEST-now\)\)\);/);
  assert.match(explored, /document\.addEventListener\('visibilitychange',\(\)=>\{if\(document\.hidden\)persist\(\);\}\);/);
  // The sight layer repaints on the walls' revision, and on its own record of the viewer's height.
  const vision = readFileSync(new URL('../vision-prototype.js', import.meta.url), 'utf8');
  assert.match(vision, /const next=JSON\.stringify\(\[c\.state\.boardState\.activeSceneId,c\.levelId,viewerGround,inspectionHeight,/);
  assert.match(vision, /wallRevision,roofRenderer\.revision/);
});
