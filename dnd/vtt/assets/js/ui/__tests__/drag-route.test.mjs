import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawnRoute } from '../drag-route.mjs';

// A corner dropped during a drag used to change what the ruler said and nothing else: the ruler was
// put away before the move read it, so the token was taken straight from start to end. Found
// October 10, 2026, while trying Brandon's "quick right click gives you a node".

const at = (column, row) => ({ column, row });

test('a drag with a corner is sent its whole route, start to end', () => {
  assert.deepEqual(drawnRoute([at(40, 22), at(43, 21)], at(46, 21)), [at(40, 22), at(43, 21), at(46, 21)]);
  assert.deepEqual(drawnRoute([at(1, 1), at(4, 1), at(4, 5)], at(8, 5)), [at(1, 1), at(4, 1), at(4, 5), at(8, 5)]);
  // The ruler may already hold the square the token is let go on.
  assert.deepEqual(drawnRoute([at(40, 22), at(43, 21), at(46, 21)], at(46, 21)), [at(40, 22), at(43, 21), at(46, 21)]);
});

test('a drag with no corner is sent no route, as it always was', () => {
  assert.equal(drawnRoute([at(40, 22)], at(46, 21)), null);
  assert.equal(drawnRoute([at(40, 22), at(46, 21)], at(46, 21)), null);
  // A corner on the very square it is let go on bends nothing.
  assert.equal(drawnRoute([at(40, 22), at(46, 21)], at(46, 21)), null);
});

test('nothing to send when there is no ruler or no square to end on', () => {
  assert.equal(drawnRoute([], at(3, 3)), null);
  assert.equal(drawnRoute(null, at(3, 3)), null);
  assert.equal(drawnRoute([at(1, 1), at(2, 2)], null), null);
  assert.equal(drawnRoute([at(1, 1), { column: NaN, row: 2 }, at(3, 3)], at(5, 5))?.length, 3, 'a broken point is left out');
});

test('the route is read before the ruler is put away, and handed to the move', () => {
  const drag = readFileSync(new URL('../token-interactions.js', import.meta.url), 'utf8');
  assert.match(drag, /import \{ drawnRoute \} from '\.\/drag-route\.mjs';/);
  const read = drag.indexOf('drawnRuler = typeof getCurrentMeasurementPoints'), putAway = drag.indexOf('if (measurement.temporary || !isMeasureModeActive()) {');
  assert.ok(read > 0 && putAway > read, 'read first, put away after');
  assert.match(drag, /commitDragPreview\(preview, \{ startTime, deferredUpdates, originalPositions, movementKind, drawnRuler \}\);/);
  assert.match(drag, /\.\.\.\(drawnRuler \? \{ drawnRuler \} : \{\}\),/);
  const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /const ruler = drawnRuler \?\? \(source === 'drag' \? getCurrentMeasurementPoints\(\) : \[\]\);/);
  assert.match(board, /getCurrentMeasurementPoints: \(\) => getCurrentMeasurementPoints\(\),/);
});
