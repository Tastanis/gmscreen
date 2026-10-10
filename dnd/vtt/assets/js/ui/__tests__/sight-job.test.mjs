import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groundShapeSteps, createJob, advance, finish, createSightQueue } from '../sight-job.mjs';
import { adaptiveFog, adaptiveFogSteps } from '../adaptive-fog.mjs';
import { obstacleReveal, obstacleRevealSteps } from '../obstacle-reveal.mjs';
import { makeSight } from '../vision-height.mjs';

// The lit ground is worked out a few milliseconds a frame, so a token that moves does not stop the
// board (the Director, October 9: "okay lets do that"). What he was promised: the result is exactly
// the same as before; only the newest place is worked out for the screen; nothing a player should
// not see stays up while it is worked out; and ground seen from squares passed through quickly is
// still remembered.
const ring = (id, x, y, extra = {}) => {
  const c = [[x + .04, y + .04], [x + .96, y + .04], [x + .96, y + .96], [x + .04, y + .96]];
  return { nodes: c.map(([px, py], k) => ({ id: `${id}${k}`, x: px, y: py })), segments: [0, 1, 2, 3].map((k) => ({ id: `${id}w${k}`, a: `${id}${k}`, b: `${id}${(k + 1) % 4}`, sight: 'block', movement: 'block', height: 3, ...extra })) };
};
const objects = [ring('a', 6, 5), ring('b', 12, 9), ring('c', 15, 4, { sight: 'limited' }), ring('d', 17, 4, { sight: 'limited' }), ring('e', 9, 13), ring('f', 20, 11)];
const walls = { nodes: objects.flatMap((o) => o.nodes), segments: objects.flatMap((o) => o.segments), ramps: [] };
// A slope down to the east with a ledge, so the edge-strip pass has something to do.
const groundAt = (x, y) => (x < 10 ? 2 : x < 10.5 ? 2 - (x - 10) * 4 : 0) + 0.05 * Math.sin(y);
const bounds = { left: 0, top: 0, right: 26, bottom: 18 };
function view(column, row) {
  const viewer = { id: 'hero', column, row, width: 1, height: 1 }, viewerGround = groundAt(column + .5, row + .5);
  const sight = makeSight({ viewer, viewerGround, groundAt, walls });
  return { visible: (p, z = groundAt(p.x, p.y)) => sight(p, z), origin: { x: column + .5, y: row + .5 } };
}
/** The picture as the old code made it: both passes, each in one go. */
function allAtOnce(column, row) {
  const { visible, origin } = view(column, row), polygons = [], pieces = [];
  const fog = adaptiveFog({ ...bounds, visible, emit: (polygon) => { polygons.push(polygon); pieces.push(polygon); } });
  const reveal = obstacleReveal({ polygons, walls, origin, groundAt, visible, emit: (polygon) => pieces.push(polygon) });
  return { pieces, checks: fog.checks + reveal.checks, polygons: fog.polygons };
}
function job(column, row, extra = {}) {
  const { visible, origin } = view(column, row), pieces = [];
  return createJob(`at ${column},${row}`, groundShapeSteps({ ...bounds, visible, walls, origin, groundAt, emit: (polygon) => pieces.push(polygon) }), { pieces, ...extra });
}
/** A clock that moves on by `tick` each time it is read. */
const clock = (tick = 1) => { let t = 0; return () => (t += tick); };

test('worked out in pieces, the picture is the same one, piece for piece', () => {
  for (const [column, row] of [[3, 3], [13, 9], [22, 15], [10, 10]]) {
    const whole = allAtOnce(column, row), stepped = job(column, row);
    let slices = 0; while (!advance(stepped, 2, clock(1))) slices++;
    assert.ok(slices > 5, `it really was spread over many slices (${slices})`);
    assert.deepEqual(stepped.pieces, whole.pieces, `from (${column},${row})`);
    assert.deepEqual(stepped.result, { checks: whole.checks, polygons: whole.polygons });
    assert.ok(whole.pieces.length > 50);
  }
});

test('the two passes in one go are their own steps run to the end', () => {
  const { visible, origin } = view(13, 9), a = [], b = [];
  const fog = adaptiveFog({ ...bounds, visible, emit: (p) => a.push(p) });
  const run = adaptiveFogSteps({ ...bounds, visible, emit: (p) => b.push(p), pause: 3 }); let step, pauses = 0; while (!(step = run.next()).done) pauses++;
  assert.deepEqual(b, a); assert.deepEqual(step.value, fog); assert.ok(pauses > 100);
  const strips = [], stripsStepped = [];
  const reveal = obstacleReveal({ polygons: a, walls, origin, groundAt, visible, emit: (p) => strips.push(p) });
  const again = obstacleRevealSteps({ polygons: a, walls, origin, groundAt, visible, emit: (p) => stripsStepped.push(p) }); while (!(step = again.next()).done);
  assert.deepEqual(stripsStepped, strips); assert.deepEqual(step.value, reveal);
  const source = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
  assert.match(source('adaptive-fog.mjs'), /export function adaptiveFog\(options\)\{const run=adaptiveFogSteps\(options\);/);
  assert.match(source('obstacle-reveal.mjs'), /export function obstacleReveal\(options\)\{const run=obstacleRevealSteps\(options\);/);
});

test('a job is advanced for about its allowance, and a finished job is left alone', () => {
  const one = job(13, 9), now = clock(1);
  assert.equal(advance(one, 5, now), false);
  assert.equal(one.slices, 1); assert.ok(one.spent >= 5 && one.spent <= 8, `spent ${one.spent}`);
  assert.equal(one.done, false); assert.equal(one.result, null);
  assert.equal(finish(one, now), true);
  const pieces = one.pieces.length, slices = one.slices;
  assert.equal(advance(one, 5, now), true); assert.equal(finish(one, now), true);
  assert.equal(one.pieces.length, pieces); assert.equal(one.slices, slices);
});

test('four fast moves: only the newest place is worked out for the screen', () => {
  // The hero steps east four times, each key press arriving before the last picture is finished.
  const queue = createSightQueue(), keep = () => true, now = clock(1), shownKeys = [];
  for (const column of [3, 4, 5, 6]) {
    queue.ask(job(column, 9), keep);
    if (advance(queue.current, 3, now)) shownKeys.push(queue.clear().key); // one frame's worth
  }
  assert.deepEqual(shownKeys, [], 'no picture of a square already left was put on the screen');
  assert.equal(queue.current.key, 'at 6,9');
  assert.equal(queue.superseded, 3);
  while (!advance(queue.current, 3, now));
  const shown = queue.clear();
  assert.deepEqual(shown.pieces, allAtOnce(6, 9).pieces, 'the picture shown is the one for where the hero is now');
  assert.equal(queue.current, null);
  // The three squares passed through wait their turn, oldest first, and are finished afterwards for memory.
  assert.deepEqual(queue.passed.map((j) => j.key), ['at 3,9', 'at 4,9', 'at 5,9']);
  for (const [i, column] of [3, 4, 5].entries()) {
    const passed = queue.passed[0];
    assert.ok(passed.slices >= 1 && !passed.done, 'it carries on from where it stopped');
    while (!advance(passed, 3, now)); queue.passed.shift();
    assert.deepEqual(passed.pieces, allAtOnce(column, 9).pieces, `what was seen from square ${i + 1} is whole`);
  }
  assert.equal(queue.passed.length, 0);
});

test('a job set aside is kept only when its ground should be remembered, and only so many', () => {
  const queue = createSightQueue({ limit: 3 });
  queue.ask(job(3, 3, { family: 'scene-1' }));
  queue.ask(job(4, 3, { family: 'scene-2' }), (old) => old.family === 'scene-2');
  assert.equal(queue.passed.length, 0, 'another scene: dropped');
  for (const column of [5, 6, 7, 8, 9]) queue.ask(job(column, 3, { family: 'scene-2' }), (old) => old.family === 'scene-2');
  assert.deepEqual(queue.passed.map((j) => j.key), ['at 6,3', 'at 7,3', 'at 8,3'], 'the oldest are let go first');
  queue.setAside(() => false); assert.equal(queue.current, null); assert.equal(queue.passed.length, 3);
  queue.setAside(() => true); assert.equal(queue.passed.length, 3, 'nothing to set aside');
  queue.forget(); assert.equal(queue.passed.length, 0);
});

test('the sight layer keeps the old picture up only when it hides nothing, and never uncovers early', () => {
  const source = readFileSync(new URL('../vision-prototype.js', import.meta.url), 'utf8');
  // The old picture stays while the new one is found only for the same viewer on the same scene,
  // floor, walls and ground, and only when what was lit is already in that viewer's memory, or was
  // put up from a square the server had not yet agreed (it was on the screen already: nothing new).
  assert.match(source, /if\(!\(shown&&shown\.family===family&&exploration\.ready&&memory&&\(shown\.remembered\|\|shown\.ahead\)\)\)\{finish\(job\);showGround\(job\);\}/);
  // What is seen from a square the server has not agreed is shown and not remembered.
  assert.match(source, /memory=!editing&&!gmVision\.manual,remember=memory&&!ahead;/);
  assert.match(source, /const family=JSON\.stringify\(\[c\.state\.boardState\.activeSceneId,c\.levelId,token\?\.id,token\?\.levelId,wallRevision,terrainKey,gmVision\.fogEnabled,wallInspection,inspectionHeight,canvas\.width,canvas\.height,exploration\.key\]\);/);
  assert.match(source, /shown\.remembered=wanted\.remember&&exploration\.ready;/);
  // Creatures and floor plates are tested with the new sight in the frame the token arrives.
  assert.match(source, /sight=!gmVision\.fogEnabled\?\(\)=>true:token\?makeSight\(\{viewer:token,viewerGround,groundAt,walls,terrain:terrainCache\}\):null;/);
  assert.match(source, /if\(roofKey!==roofPainted\)\{roofPainted=roofKey;roofPaints\+\+;roofRenderer\.paint\(/);
  assert.match(source, /if\(changed\)\{for\(const node of originalTokens\.querySelectorAll\('\[data-placement-id\]'\)\)\{const next=tokenVisible\(/);
  // A player's map is uncovered only by a finished picture of where they are.
  assert.match(source, /if\(!queue\.current\)confirmPlayerHeightPaint\(c\.state,c\.view,c\.isGM,c\.levelId\);/);
  assert.equal((source.match(/confirmPlayerHeightPaint\(/g) || []).length, 1);
  // Only the newest place is asked for; the one it replaces is kept for memory when it should be.
  assert.match(source, /const job=queue\.ask\(groundJob\(key,sight,observer,!ahead\),keptForMemory\);/);
  assert.match(source, /return createJob\(jobKey,steps\(\),\{family,path,asked:start,remember:memory&&agreedPlace\}\);/);
  // And only when it was for a square the server had agreed.
  assert.match(source, /const keptForMemory=job=>!!wanted&&wanted\.mode==='lit'&&wanted\.memory&&job\.remember&&job\.family===wanted\.family;/);
  // A square the token is drawn on ahead of the server is not worked on until the token has rested there.
  assert.match(source, /if\(!\(wanted\.ahead&&tickStart-job\.asked<AHEAD_REST\)&&advance\(job,/);
  // Memory catches up when nothing is waiting for the screen, without lighting anything.
  assert.match(source, /else if\(queue\.passed\.length\)catchUpMemory\(\);/);
  assert.match(source, /if\(exploration\.remember\(job\.path,wanted\.smoothing\)\)memoryGrew=true;/);
  // The screen is drawn again from memory once, and not while the viewer's token is ahead of the server.
  assert.match(source, /if\(wanted\?\.mode==='lit'&&!queue\.passed\.length&&!wanted\.ahead&&\(memoryGrew\|\|groundPainted!==groundStamp\(\)\)\)paintGround\(\);/);
  const explored = readFileSync(new URL('../explored-fog.mjs', import.meta.url), 'utf8');
  assert.match(explored, /function remember\(path,smoothing=0\)\{\s+if\(!ready\)return false;/);
});
