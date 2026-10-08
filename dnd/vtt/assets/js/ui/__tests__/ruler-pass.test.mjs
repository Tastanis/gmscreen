import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createRulerPass, passActorKey } from '../ruler-pass.mjs';
import { summarizeRoute } from '../terrain-zones.mjs';
import { routeSteps } from '../terrain-math.mjs';

test('inside a pass each height and each walk is worked out once; outside nothing is remembered', () => {
  const pass = createRulerPass();
  let lookups = 0;
  const height = () => { lookups += 1; return 3; };
  assert.equal(pass.active, false);
  assert.equal(pass.ground('4,2|cal', height), 3);
  assert.equal(pass.ground('4,2|cal', height), 3);
  assert.equal(lookups, 2, 'no pass, no memory');
  pass.run(() => {
    assert.equal(pass.active, true);
    for (let i = 0; i < 5; i++) assert.equal(pass.ground('4,2|cal', height), 3);
    assert.equal(lookups, 3, 'five asks, one lookup');
    pass.ground('5,2|cal', height);
    assert.equal(lookups, 4, 'another square is another lookup');
    const walk = pass.route('leg', () => ({ steps: 12 }));
    assert.equal(pass.route('leg', () => ({ steps: 99 })), walk, 'the same leg is the same walk');
    // A height of 0 and an empty answer are remembered too.
    let zero = 0;
    pass.ground('flat', () => { zero += 1; return 0; });
    pass.ground('flat', () => { zero += 1; return 0; });
    assert.equal(zero, 1);
  });
  assert.equal(pass.active, false);
  pass.ground('4,2|cal', height);
  assert.equal(lookups, 5, 'the next redraw starts fresh');
});

test('a pass inside a pass is the same pass, and an error still ends it', () => {
  const pass = createRulerPass();
  let lookups = 0;
  pass.run(() => {
    pass.ground('a', () => { lookups += 1; return 1; });
    pass.run(() => pass.ground('a', () => { lookups += 1; return 1; }));
    assert.equal(pass.active, true, 'the inner pass does not end the outer one');
  });
  assert.equal(lookups, 1);
  assert.throws(() => pass.run(() => { throw new Error('redraw failed'); }), /redraw failed/);
  assert.equal(pass.active, false);
});

test('two tokens that would stand at different heights never share an answer', () => {
  const cal = { id: 'cal', column: 4, row: 2, width: 1, height: 1, levelId: 'level-0' };
  assert.equal(passActorKey(cal), passActorKey({ ...cal }), 'the same token asked twice is the same key');
  for (const change of [{ id: 'sharon' }, { column: 5 }, { width: 2 }, { levelId: 'deck' }, { movementMode: 'fly' }, { flightHeight: 3 }, { _supportSurfaceId: 'bridge-1' }, { _floorTraversal: { to: 'deck' } }]) {
    assert.notEqual(passActorKey({ ...cal, ...change }), passActorKey(cal), JSON.stringify(change));
  }
  assert.equal(passActorKey(null), '');
});

test('one ruler redraw is one pass, and each red stretch is cut from the walked leg without walking again', async () => {
  const dom = new JSDOM(`<div id="vtt-distance-ruler" hidden><span class="vtt-board__ruler-value"></span></div>
   <button data-action="measure-distance"></button>
   <div id="vtt-map-surface"><div id="vtt-map-transform"><div id="vtt-grid-overlay"></div></div></div>`);
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.getComputedStyle = dom.window.getComputedStyle;
  // A map with height: row 3 rises one square per column, and columns 4 to 15 are blood.
  const ground = (column) => column;
  const walk = (a, b) => routeSteps(a, b, ground, (column, row) => (row === 3 && column >= 4 && column <= 15 ? 2 : 1));
  const calls = { passes: 0, walks: 0, squarePaths: [] };
  window.terrainZones = { routeCost: (points) => summarizeRoute(points, (a, b) => { calls.walks += 1; return walk(a, b); }) };
  window.terrainPrototype = {
    active: true,
    rulerPass: (run) => { calls.passes += 1; return run(); },
    rulerPoint: (point) => ({ mapX: point.mapX, mapY: point.mapY }),
    route: () => { throw new Error('the ruler must not walk a leg by itself when zones price it'); },
    routePath: () => 'M 0 0',
    paintRoute: () => {},
    squarePath: (from, at, next) => { calls.squarePaths.push([from, at, next]); return 'M 0 0 L 1 1'; },
  };
  const ruler = await import('../drag-ruler.js');
  ruler.mountDragRuler();
  const point = (column, row) => ({ column, row, mapX: (column + 0.5) * 64, mapY: (row + 0.5) * 64 });
  assert.ok(ruler.beginExternalMeasurement(point(2, 3), { allowInactive: true }));
  calls.passes = 0; calls.walks = 0; calls.squarePaths = [];
  ruler.updateExternalMeasurement(point(16, 3));
  assert.equal(calls.passes, 1, 'one redraw, one pass');
  assert.equal(calls.walks, 1, 'the cost walks the leg once');
  assert.equal(calls.squarePaths.length, 12, 'twelve blood squares, twelve red stretches');
  // Every stretch is handed the heights the leg was walked at, so the terrain has nothing to walk.
  for (const [from, at, next] of calls.squarePaths) {
    assert.equal(from.rawHeight, ground(from.column));
    assert.equal(at.rawHeight, ground(at.column));
    assert.equal(next.rawHeight, ground(next.column));
    assert.deepEqual([at.column - from.column, next.column - at.column], [1, 1]);
  }
  ruler.cancelExternalMeasurement();
  delete window.terrainPrototype;
});
