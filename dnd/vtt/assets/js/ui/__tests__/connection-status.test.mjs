import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionLabel } from '../connection-status.js';
test('connection status requires a recent successful server check and preserves access errors', () => {
  assert.equal(connectionLabel({}), 'Connecting');
  assert.equal(connectionLabel({ lastContact: 0 }, 1000), 'Connected');
  assert.equal(connectionLabel({ lastContact: 0 }, 16000), 'Connection unconfirmed');
  assert.equal(connectionLabel({ lastContact: 100, failed: true }, 1000), 'Reconnecting');
  assert.equal(connectionLabel({ online: false, lastContact: 100 }, 1000), 'Offline');
  assert.equal(connectionLabel({ errorStatus: 401 }), 'Sign in required');
  assert.equal(connectionLabel({ errorStatus: 403 }), 'Access denied');
});
