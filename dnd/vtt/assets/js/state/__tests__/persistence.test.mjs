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

  const firstPromise = queueSave('state-key', firstPayload, '/save-endpoint');
  runAllTimeouts();

  assert.equal(requests.length, 1, 'first request should be scheduled');

  const secondPromise = queueSave('state-key', secondPayload, '/save-endpoint');

  assert.equal(requests[0].options.signal.aborted, true, 'first request should be aborted');

  await Promise.resolve();
  await setImmediatePromise();

  runAllTimeouts();

  assert.equal(requests.length, 2, 'second request should be dispatched');
  const lastRequest = requests[requests.length - 1];
  assert.deepEqual(JSON.parse(lastRequest.options.body), secondPayload);

  requests[requests.length - 1].resolve({ ok: true, json: async () => ({}) });

  const firstResult = await firstPromise;
  assert.equal(firstResult.success, false);
  assert.equal(firstResult.aborted, true);

  const secondResult = await secondPromise;
  assert.equal(secondResult.success, true);
  assert.equal(secondResult.aborted, false);
});

test('queueSave resolves completion listeners when save finishes', async (t) => {
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
    new Promise((resolve) => {
      requests.push({ endpoint, options, resolve });
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

  const results = [];
  const promise = queueSave(
    'board-state',
    { boardState: { placements: {} } },
    '/save-board-state',
    (result) => {
      results.push(result);
    }
  );

  runAllTimeouts();

  assert.equal(requests.length, 1);

  const [request] = requests;
  request.resolve({ ok: true, json: async () => ({}) });

  const outcome = await promise;
  assert.deepEqual(outcome, { success: true, aborted: false, error: null, data: null });
  assert.equal(results.length, 1);
  assert.deepEqual(results[0], outcome);
});

test('queueSave returns a non-retryable conflict result for stale board saves', async (t) => {
  const originalWindow = global.window;
  const originalFetch = global.fetch;

  const scheduled = [];

  global.window = {
    setTimeout(callback) {
      scheduled.push(callback);
      return 0;
    },
  };

  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount += 1;
    return {
      ok: false,
      status: 409,
      text: async () => JSON.stringify({
        success: false,
        error: 'Board state changed before this save could be applied.',
        data: { _version: 12 },
      }),
    };
  };

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

  const { queueSave } = await import('../persistence.js');
  const promise = queueSave('board-state', { boardState: { _version: 10 } }, '/save-board-state');

  while (scheduled.length) {
    scheduled.shift()();
  }

  const result = await promise;
  assert.equal(fetchCount, 1, 'conflict should not be retried');
  assert.equal(result.success, false);
  assert.equal(result.aborted, true);
  assert.equal(result.error?.name, 'ConflictError');
  assert.equal(result.error?.status, 409);
  assert.deepEqual(result.data, { _version: 12 });
});
