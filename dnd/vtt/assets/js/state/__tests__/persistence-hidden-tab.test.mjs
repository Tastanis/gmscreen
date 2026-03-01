import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as setImmediatePromise } from 'node:timers/promises';

// ---------------------------------------------------------------------------
// These tests verify that the persistence layer avoids pointless save
// attempts and retries when the browser tab is hidden or the page is
// unloading.  The fix prevents console-spam "Failed to fetch" errors and
// ensures dirty state is re-saved when the tab becomes visible again.
// ---------------------------------------------------------------------------

/**
 * Helper to safely set a global property that may be a getter-only
 * (e.g. `navigator` in Node.js).  Returns a restore function.
 */
function setGlobal(key, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
  try {
    Object.defineProperty(globalThis, key, {
      value,
      writable: true,
      configurable: true,
    });
  } catch {
    globalThis[key] = value;
  }
  return () => {
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
    } else {
      delete globalThis[key];
    }
  };
}

test('queueSave skips fetch fallback when sendBeacon fails and page is hidden', async (t) => {
  const restores = [];

  const scheduled = [];
  restores.push(setGlobal('window', {
    setTimeout(callback) {
      scheduled.push(callback);
      return 0;
    },
  }));

  let fetchCalled = false;
  restores.push(setGlobal('fetch', () => {
    fetchCalled = true;
    return Promise.resolve({ ok: true, json: async () => ({}) });
  }));

  // Mock document as hidden
  restores.push(setGlobal('document', {
    visibilityState: 'hidden',
    addEventListener() {},
  }));

  // Mock navigator with sendBeacon that returns false (e.g. payload too large)
  restores.push(setGlobal('navigator', {
    onLine: true,
    sendBeacon() {
      return false;
    },
  }));

  t.after(() => {
    restores.forEach((fn) => fn());
  });

  function runAllTimeouts() {
    while (scheduled.length) {
      scheduled.shift()();
    }
  }

  // Fresh import so the module captures our mocked globals
  const { queueSave } = await import(`../persistence.js?hidden-beacon-${Date.now()}`);

  const result = await (async () => {
    const promise = queueSave('board-state', { test: true }, '/save', {
      keepalive: true,
      immediate: true,
    });
    runAllTimeouts();
    await Promise.resolve();
    await setImmediatePromise();
    runAllTimeouts();
    return promise;
  })();

  assert.equal(fetchCalled, false, 'fetch should NOT be called when sendBeacon fails and page is hidden');
  assert.equal(result.success, false, 'result should indicate failure');
  assert.equal(result.aborted, true, 'result should be marked as aborted (non-retriable)');
});

test('queueSave skips retries when page is hidden', async (t) => {
  const restores = [];

  const scheduled = [];
  restores.push(setGlobal('window', {
    setTimeout(callback) {
      scheduled.push(callback);
      return 0;
    },
  }));

  let fetchCallCount = 0;
  const fetchRequests = [];
  restores.push(setGlobal('fetch', (endpoint, options = {}) =>
    new Promise((resolve, reject) => {
      fetchCallCount++;
      fetchRequests.push({ endpoint, options, resolve, reject });

      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          const error = new Error('The operation was aborted.');
          error.name = 'AbortError';
          reject(error);
        });
      }
    })
  ));

  // Page is hidden — no sendBeacon available so fetch path is used,
  // but retries should be skipped after the initial failure.
  restores.push(setGlobal('document', {
    visibilityState: 'hidden',
    addEventListener() {},
  }));

  // Navigator without sendBeacon so the sendBeacon block is skipped entirely
  // and we fall through to the regular fetch path.
  restores.push(setGlobal('navigator', { onLine: true }));

  t.after(() => {
    restores.forEach((fn) => fn());
  });

  function runAllTimeouts() {
    while (scheduled.length) {
      scheduled.shift()();
    }
  }

  const { queueSave } = await import(`../persistence.js?hidden-retry-${Date.now()}`);

  const promise = queueSave('board-state', { test: true }, '/save', {
    immediate: true,
    retryLimit: 3,
    retryBackoffMs: 100,
  });

  // Wait for the fetch to be dispatched
  await Promise.resolve();
  await setImmediatePromise();
  runAllTimeouts();

  assert.equal(fetchRequests.length, 1, 'initial fetch should be dispatched');

  // Make the fetch fail with a network error
  fetchRequests[0].reject(new TypeError('Failed to fetch'));
  await Promise.resolve();
  await setImmediatePromise();

  // Run any scheduled timeouts — if retry was scheduled it would appear here
  runAllTimeouts();
  await Promise.resolve();
  await setImmediatePromise();
  runAllTimeouts();

  assert.equal(fetchCallCount, 1, 'should NOT retry when page is hidden (only 1 fetch call)');

  const result = await promise;
  assert.equal(result.success, false, 'result should indicate failure');
  assert.equal(result.aborted, false, 'result should NOT be marked as aborted (it was a real network error)');
});

test('queueSave DOES retry when page is visible', async (t) => {
  const restores = [];

  const scheduled = [];
  restores.push(setGlobal('window', {
    setTimeout(callback) {
      scheduled.push(callback);
      return 0;
    },
  }));

  let fetchCallCount = 0;
  const fetchRequests = [];
  restores.push(setGlobal('fetch', (endpoint, options = {}) =>
    new Promise((resolve, reject) => {
      fetchCallCount++;
      fetchRequests.push({ endpoint, options, resolve, reject });

      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          const error = new Error('The operation was aborted.');
          error.name = 'AbortError';
          reject(error);
        });
      }
    })
  ));

  // Page is VISIBLE — retries should proceed normally
  restores.push(setGlobal('document', {
    visibilityState: 'visible',
    addEventListener() {},
  }));

  restores.push(setGlobal('navigator', { onLine: true }));

  t.after(() => {
    restores.forEach((fn) => fn());
  });

  function runAllTimeouts() {
    while (scheduled.length) {
      scheduled.shift()();
    }
  }

  const { queueSave } = await import(`../persistence.js?visible-retry-${Date.now()}`);

  const promise = queueSave('board-state', { test: true }, '/save', {
    immediate: true,
    retryLimit: 3,
    retryBackoffMs: 0,
  });

  await Promise.resolve();
  await setImmediatePromise();
  runAllTimeouts();

  assert.equal(fetchRequests.length, 1, 'initial fetch should be dispatched');

  // Make the first fetch fail
  fetchRequests[0].reject(new TypeError('Failed to fetch'));
  await Promise.resolve();
  await setImmediatePromise();

  // Run the retry timeout
  runAllTimeouts();
  await Promise.resolve();
  await setImmediatePromise();

  assert.equal(fetchCallCount, 2, 'should retry when page is visible');

  // Complete the retry successfully
  fetchRequests[1].resolve({ ok: true, json: async () => ({}) });

  const result = await promise;
  assert.equal(result.success, true, 'result should indicate success after retry');
});
