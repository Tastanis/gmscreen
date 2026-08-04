import test from 'node:test';
import assert from 'node:assert/strict';

import { getAutomationMoveRangePresentation } from '../automation-move-display.js';

test('teleport presentation exposes the final computed range', () => {
  assert.deepEqual(
    getAutomationMoveRangePresentation({ verbLabel: 'Teleport', distance: 7 }),
    { kind: 'teleport', label: 'Teleport: up to 7 squares' }
  );
});

test('movement presentation handles a one-square distance', () => {
  assert.deepEqual(
    getAutomationMoveRangePresentation({ verbLabel: 'Shift', distance: 1 }),
    { kind: 'movement', label: 'Shift: up to 1 square' }
  );
});
