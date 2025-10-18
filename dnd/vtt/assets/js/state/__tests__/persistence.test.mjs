import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as setImmediatePromise } from 'node:timers/promises';

test('queueSave keeps latest payload pending after aborting the prior request', async (t) => {
  const originalWindow = global.window;
  const originalFetch = global.fetch;

  const scheduled = [];

  global.window = {
    setTimeout(callback) {
      scheduled.push(callback);
      return 0;
    },
  };

  const requests = [];

  global.fetch = (endpoint, options = {}) =>
    new Promise((resolve, reject) => {
      const record = { endpoint, options, resolve, reject };
      requests.push(record);

      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          const error = new Error('The operation was aborted.');
          error.name = 'AbortError';
          reject(error);
        });
      }
    });

  t.after(() => {
    if (originalWindow === undefined) {
      delete global.window;
    } else {
      global.window = originalWindow;
    }

    if (originalFetch === undefined) {
      delete global.fetch;
    } else {
      global.fetch = originalFetch;
    }
  });

  function runAllTimeouts() {
    while (scheduled.length) {
      const callback = scheduled.shift();
      callback();
    }
  }

  const { queueSave } = await import('../persistence.js');

  const firstPayload = { version: 1 };
  const secondPayload = { version: 2 };

  queueSave('state-key', firstPayload, '/save-endpoint');
  runAllTimeouts();

  assert.equal(requests.length, 1, 'first request should be scheduled');

  queueSave('state-key', secondPayload, '/save-endpoint');

  assert.equal(requests[0].options.signal.aborted, true, 'first request should be aborted');

  await Promise.resolve();
  await setImmediatePromise();

  runAllTimeouts();

  assert.equal(requests.length, 2, 'second request should be dispatched');
  const lastRequest = requests[requests.length - 1];
  assert.deepEqual(JSON.parse(lastRequest.options.body), secondPayload);
});
