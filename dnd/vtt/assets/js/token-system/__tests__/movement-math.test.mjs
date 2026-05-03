import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSquareMovementShape,
  measureChebyshevDistance,
} from '../movement-math.js';
import {
  formatMovementSummary,
} from '../token-movement-controller.js';
import {
  parseMovementSquares,
  extractLocalSpeedValue,
} from '../speed-resolver.js';

describe('token movement math', () => {
  test('counts diagonal movement as one square', () => {
    assert.equal(
      measureChebyshevDistance({ column: 4, row: 4 }, { column: 9, row: 1 }),
      5
    );
  });

  test('builds a square movement outline from remaining movement', () => {
    const shape = buildSquareMovementShape({
      origin: { column: 5, row: 5, width: 1, height: 1 },
      remaining: 5,
      bounds: { minColumn: 0, minRow: 0, columns: 20, rows: 20 },
    });

    assert.deepEqual(shape.outer, { column: 0, row: 0, width: 11, height: 11 });
  });

  test('expands blocker cutouts for large moving tokens', () => {
    const shape = buildSquareMovementShape({
      origin: { column: 5, row: 5, width: 3, height: 3 },
      remaining: 4,
      bounds: { minColumn: 0, minRow: 0, columns: 20, rows: 20 },
      blockers: [{ column: 8, row: 8, width: 2, height: 2 }],
    });

    assert.deepEqual(shape.cutouts[0], { column: 6, row: 6, width: 4, height: 4 });
  });
});

describe('token movement speed parsing', () => {
  test('parses numeric speed from movement strings', () => {
    assert.equal(parseMovementSquares('walks 5 squares per round'), 5);
    assert.equal(parseMovementSquares('8'), 8);
    assert.equal(parseMovementSquares(''), null);
  });

  test('finds local speed trait snapshots', () => {
    assert.equal(extractLocalSpeedValue({ traits: { speed: '7 squares' } }), 7);
    assert.equal(extractLocalSpeedValue({ monster: { movement: 'Speed 6' } }), 6);
  });

  test('formats movement summary with left and over states', () => {
    assert.equal(formatMovementSummary({ spent: 3, dragCost: 2, speed: 8 }), 'Moved 5 / 8 - 3 left');
    assert.equal(formatMovementSummary({ spent: 7, dragCost: 3, speed: 8 }), 'Moved 10 / 8 - 2 over');
  });
});
