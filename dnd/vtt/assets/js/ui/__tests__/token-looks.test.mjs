import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOKEN_LOOKS, tokenLookSettings, tokenScreenMetrics, footprintRect } from '../../../../board3d/token-looks.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// Brandon, November 10, 2026 (the Thorn Briar): a huge creature's bars and conditions were tiny and did not grow
// with the zoom. They are sized per square on screen now.
test('a size-4 creature gets bars as big as a size-1 creature at the same zoom', () => {
  const square = 60;
  const one = tokenScreenMetrics(square * 1, 1), four = tokenScreenMetrics(square * 4, 4);
  assert.equal(four.tokUnit, one.tokUnit);
  assert.equal(one.size, 60);
  assert.equal(four.size, 240, 'its box is its whole footprint');
});

test('bars grow with the zoom for a huge creature, up to the same cap as a size-1 one', () => {
  const near = tokenScreenMetrics(4 * 100, 4), far = tokenScreenMetrics(4 * 40, 4), closest = tokenScreenMetrics(4 * 500, 4);
  assert.ok(near.tokUnit > far.tokUnit, 'zooming in makes them bigger');
  assert.equal(closest.tokUnit, tokenScreenMetrics(500, 1).tokUnit, 'same cap as size 1');
  assert.equal(closest.tokUnit, 1.25 * 110 / 64);
  // The old formula: box held under 110 px, unit divided by the size.
  const old = 1.25 * Math.min(110, 4 * 100) / (64 * 4);
  assert.ok(near.tokUnit > old * 3, 'no longer a quarter size');
});

test('a size-1 token is drawn as before', () => {
  for (const px of [10, 25, 60, 110, 300]) {
    const size = Math.max(25, Math.min(110, px));
    assert.deepEqual([tokenScreenMetrics(px, 1).size, tokenScreenMetrics(px, 1).tokUnit], [size, 1.25 * size / 64]);
  }
  assert.equal(tokenScreenMetrics(NaN, 1).size, 25, 'no projection: the smallest box');
});

test('settings are JSON with defaults; bad overrides fall back', () => {
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(TOKEN_LOOKS)));
  const d = tokenLookSettings({});
  assert.deepEqual(d, JSON.parse(JSON.stringify(TOKEN_LOOKS)));
  const s = tokenLookSettings({ footprint: { lineOpacity: 7, lineColor: 'red; x', show: false, minSize: 2 }, tokenScreen: { maxSquarePx: 5 } });
  assert.equal(s.footprint.lineOpacity, 1, 'clamped');
  assert.equal(s.footprint.lineColor, TOKEN_LOOKS.footprint.lineColor, 'not a colour: the default');
  assert.equal(s.footprint.show, false);
  assert.equal(s.footprint.minSize, 2);
  assert.equal(s.tokenScreen.maxSquarePx, s.tokenScreen.minSquarePx, 'cap never under the floor');
  assert.equal(tokenLookSettings(undefined).footprint.show, true);
});

// Brandon, November 10, 2026: "there needs to be a box showing where this creature actually stands".
test('the footprint is the squares the creature stands on, and follows a held token', () => {
  assert.deepEqual(footprintRect({ id: 'a', column: 3, row: 5, width: 4, height: 4 }), { column: 3, row: 5, width: 4, height: 4 });
  assert.deepEqual(footprintRect({ id: 'a', column: 3, row: 5 }), { column: 3, row: 5, width: 1, height: 1 });
  assert.deepEqual(footprintRect({ id: 'a', column: 3, row: 5, width: 4, height: 4 }, { id: 'a', x: 10, y: 10 }), { column: 8, row: 8, width: 4, height: 4 });
  assert.deepEqual(footprintRect({ id: 'b', column: 3, row: 5, width: 2, height: 2 }, { id: 'a', x: 10, y: 10 }), { column: 3, row: 5, width: 2, height: 2 }, 'another token held');
  assert.equal(footprintRect({ id: 'a', column: 3, row: 5, width: 1, height: 1 }, null, 2), null, 'under the minimum size');
  assert.equal(footprintRect({ id: 'a', column: 'x', row: 5 }), null);
  assert.equal(footprintRect(null), null);
});

test('the board uses them: footprint layer registered, stacked outline toned down', () => {
  const layers = read('../../../../board3d/layers/index.mjs');
  assert.match(layers, /vtt3d\.addLayer\('token-footprints',createTokenFootprintsLayer\);/);
  const footprints = read('../../../../board3d/layers/token-footprints.mjs');
  assert.match(footprints, /tokenLookSettings\(\)\.footprint/, 'settings from TOKEN_LOOKS');
  assert.match(footprints, /if\(!gm&&p\.hidden\)continue;/, 'hidden tokens stay hidden from players');
  const board3d = read('../../../../board3d/integration.mjs');
  assert.match(board3d, /tokenScreenMetrics\(Math\.hypot\(across\.x-foot\.x,across\.y-foot\.y\)\*2,Math\.max\(p\.width,p\.height\),tokenLookSettings\(\)\.tokenScreen\)/);
  assert.doesNotMatch(board3d, /1\.25\*size\/\(64\*Math\.max\(p\.width,p\.height\)\)/, 'unit no longer divided by the size');
  const css = read('../../../../board3d/integration.css');
  assert.doesNotMatch(css, /outline: 3px solid #ffcc33/, 'no heavy yellow outline');
  assert.match(css, /\[data-vtt3d-stacked\]::after \{[^}]*top: calc\(100% \+ 3px\);/, 'the badge sits under the foot, off the bar');
});
