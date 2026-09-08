import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaveFeedbackState, describeSaveFailure } from '../save-feedback.js';

test('save notices keep unrelated failures and distinguish pending from accepted', () => {
  const state = createSaveFeedbackState();
  state.update({ operationId: 'a', type: 'token.move', status: 'sending' });
  assert.equal(state.snapshot().pending.length, 1);
  state.update({ operationId: 'a', type: 'token.move', status: 'rejected', httpStatus: 403, reason: 'You cannot move this token.' });
  state.update({ operationId: 'b', type: 'drawing.upsert', status: 'accepted' });
  assert.equal(state.snapshot().failures.length, 1);
  assert.equal(state.snapshot().pending.length, 0);
  assert.equal(state.snapshot().lastAccepted, 'drawing.upsert');
  assert.match(describeSaveFailure({ status: 403, message: 'You cannot move this token.' }), /rejected: You cannot move this token/);
  assert.doesNotMatch(describeSaveFailure({ status: 403 }), /sign in/);
  assert.match(describeSaveFailure({ status: 401 }), /sign in/);
  assert.match(describeSaveFailure({ message: 'Network unavailable' }), /unconfirmed/);
  state.dismiss(); assert.equal(state.snapshot().failures.length, 0);
});
