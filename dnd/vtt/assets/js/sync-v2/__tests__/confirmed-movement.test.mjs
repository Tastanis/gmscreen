import test from 'node:test';
import assert from 'node:assert/strict';
import { normalMovementDetail } from '../confirmed-movement.js';

test('normal hooks preserve floors and exclude undo, forced movement, patches, and recovery', () => {
  const before = { column: 2, row: 3, levelId: 'level-0' };
  const after = { column: 2, row: 5, levelId: 'upper' };
  const context = { source: 'acknowledgement', event: { type: 'placement.batchApplied', payload: { movementKind: 'walk' } } };
  const detail = normalMovementDetail('scene', 'pc', before, after, context);
  assert.equal(detail.from.levelId, 'level-0');
  assert.equal(detail.to.levelId, 'upper');
  assert.equal(detail.kind, 'normal');
  for (const type of ['token.moved', 'placement.batchApplied']) {
    for (const movementKind of ['undo', 'forced', 'teleport']) {
      assert.equal(normalMovementDetail('scene', 'pc', before, after, {
        ...context, event: { type, payload: { movementKind } },
      }), null);
    }
  }
  assert.equal(normalMovementDetail('scene', 'pc', before, after, { ...context, source: 'recovery' }), null);
  assert.equal(normalMovementDetail('scene', 'pc', before, after, { ...context, event: { type: 'placement.batchApplied', payload: {} } }), null);
  assert.equal(normalMovementDetail('scene', 'pc', before, before, context), null);
  assert.ok(normalMovementDetail('scene', 'pc', before, { ...before, levelId: 'upper' }, context));
});
