const pending = new Map();
const globalWindow = typeof window === 'undefined' ? null : window;
const globalDocument = typeof document === 'undefined' ? null : document;
const globalNavigator = typeof navigator === 'undefined' ? null : navigator;

let pageVisibilityState = globalDocument?.visibilityState ?? 'visible';
let pageIsUnloading = false;

// Track server error state to avoid retry storms
let serverErrorCount = 0;
let lastServerErrorAt = 0;
const SERVER_ERROR_COOLDOWN_MS = 30000; // 30s cooldown after repeated server errors
const SERVER_ERROR_THRESHOLD = 3; // Number of consecutive errors before entering cooldown

// Persistence failure listeners (for UI notifications)
const failureListeners = new Set();

const updatePageVisibility = () => {
  pageVisibilityState = globalDocument?.visibilityState ?? pageVisibilityState;
};

const markPageUnloading = () => {
  pageIsUnloading = true;
};

if (globalDocument?.addEventListener) {
  globalDocument.addEventListener('visibilitychange', updatePageVisibility, {
    capture: true,
  });
}

if (globalWindow?.addEventListener) {
  globalWindow.addEventListener('pagehide', markPageUnloading, { capture: true });
  globalWindow.addEventListener('beforeunload', markPageUnloading, { capture: true });
}

function isDocumentHidden() {
  if (!globalDocument) {
    return false;
  }
  return (globalDocument.visibilityState ?? pageVisibilityState) === 'hidden';
}

function shouldUseKeepalive(entryKeepalive = false) {
  return Boolean(entryKeepalive || pageIsUnloading || isDocumentHidden());
}

/**
 * Register a listener for persistence failures.
 * Called with { key, status, message } when a save fails after all retries.
 */
export function onPersistenceFailure(listener) {
  if (typeof listener === 'function') {
    failureListeners.add(listener);
  }
  return () => failureListeners.delete(listener);
}

function notifyPersistenceFailure(detail) {
  for (const listener of failureListeners) {
    try {
      listener(detail);
    } catch (e) {
      // Ignore listener errors
    }
  }
}

function isServerInCooldown() {
  if (serverErrorCount < SERVER_ERROR_THRESHOLD) {
    return false;
  }
  const elapsed = Date.now() - lastServerErrorAt;
  if (elapsed > SERVER_ERROR_COOLDOWN_MS) {
    // Cooldown expired, reset
    serverErrorCount = 0;
    return false;
  }
  return true;
}

function recordServerError() {
  serverErrorCount += 1;
  lastServerErrorAt = Date.now();
}

function resetServerErrors() {
  serverErrorCount = 0;
}

export function queueSave(key, payload, endpoint, options = {}) {
  // If server is in cooldown from repeated errors, reject immediately
  // to avoid flooding a struggling server
  if (isServerInCooldown()) {
    const cooldownRemaining = Math.ceil(
      (SERVER_ERROR_COOLDOWN_MS - (Date.now() - lastServerErrorAt)) / 1000
    );
    console.warn(
      `[VTT] Server in error cooldown (${cooldownRemaining}s remaining), skipping save for ${key}`
    );
    return Promise.resolve(
      createResult(false, {
        aborted: true,
        error: new Error(`Server error cooldown active for ${key}`),
      })
    );
  }

  const controller = new AbortController();
  const normalizedOptions =
    typeof options === 'function' ? { onComplete: options } : options ?? {};
  const {
    onComplete,
    keepalive = false,
    retryLimit = 3,
    retryBackoffMs = 500,
    coalesce = true,
    immediate = false,
  } =
    normalizedOptions;

  const entry = {
    payload,
    endpoint,
    controller,
    keepalive: Boolean(keepalive),
    immediate: Boolean(immediate),
    callbacks: [],
    resolvers: [],
    promise: null,
    finalized: false,
    attempts: 0,
    retryLimit: Math.max(1, Math.trunc(retryLimit) || 1),
    retryBackoffMs: Math.max(0, Math.trunc(retryBackoffMs) || 0),
    blocked: false,
    lastResult: null,
    lastHttpStatus: 0,
  };

  if (typeof onComplete === 'function') {
    entry.callbacks.push(onComplete);
  }

  entry.promise = new Promise((resolve) => {
    entry.resolvers.push(resolve);
  });

  if (pending.has(key)) {
    const slot = pending.get(key);
    if (coalesce) {
      if (slot?.current) {
        slot.current.controller.abort();
        finalizeEntry(
          slot.current,
          createResult(false, {
            aborted: true,
            error: createAbortError(key),
          })
        );
      }
      if (slot) {
        slot.queue = [];
        slot.current = entry;
      } else {
        pending.set(key, { current: entry, queue: [] });
      }
      schedulePersist(key, entry);
      return entry.promise;
    }

    if (slot) {
      slot.queue.push(entry);
      return entry.promise;
    }
  }

  pending.set(key, { current: entry, queue: [] });
  schedulePersist(key, entry);

  return entry.promise;
}

function schedulePersist(key, entry) {
  // If immediate mode is requested, skip the debounce delay to reduce
  // the window where stale state could be applied by polling
  if (entry.immediate) {
    persist(key, entry);
    return;
  }

  const setTimeoutFn = globalThis?.window?.setTimeout ?? globalThis.setTimeout;
  if (typeof setTimeoutFn === 'function') {
    setTimeoutFn(() => {
      const slot = pending.get(key);
      if (!slot || slot.current !== entry) {
        return;
      }
      persist(key, entry);
    }, 250);
  } else {
    persist(key, entry);
  }
}

async function persist(key, entry) {
  entry.attempts += 1;
  const { payload, endpoint, controller, keepalive } = entry;
  let result = null;
  let httpStatus = 0;
  try {
    if (!endpoint) {
      console.warn(`[VTT] Persistence endpoint missing for ${key}, skipping save.`);
      result = createResult(false, {
        aborted: true,
        error: new Error(`Missing persistence endpoint for ${key}`),
      });
      return;
    }

    if (globalNavigator && globalNavigator.onLine === false) {
      console.warn(`[VTT] Offline detected, skipping save for ${key}.`);
      result = createResult(false, {
        aborted: true,
        error: new Error(`Offline during persistence for ${key}`),
      });
      return;
    }

    const requestBody = JSON.stringify(payload);
    const useKeepalive = shouldUseKeepalive(keepalive);

    if (useKeepalive && typeof globalNavigator?.sendBeacon === 'function') {
      try {
        const beaconBody =
          typeof Blob === 'function'
            ? new Blob([requestBody ?? ''], { type: 'application/json' })
            : requestBody ?? '';
        const beaconSent = globalNavigator.sendBeacon(endpoint, beaconBody);
        if (beaconSent) {
          result = createResult(true);
          return;
        }
      } catch (beaconError) {
        console.warn('[VTT] sendBeacon failed, falling back to fetch', beaconError);
      }
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
      credentials: 'include',
      signal: controller.signal,
      ...(useKeepalive ? { keepalive: true } : null),
    });

    httpStatus = response?.status ?? 0;

    if (!response?.ok) {
      let responseText = '';
      let serverMessage = '';
      try {
        responseText = await response.text();
        // Try to parse JSON error message from server
        const parsed = JSON.parse(responseText);
        serverMessage = parsed?.error ?? '';
      } catch {
        // Response may not be JSON
      }

      // Only log the first occurrence per attempt cycle, not every retry
      if (entry.attempts === 1) {
        console.error(
          `[VTT] Persistence error for ${key}: ${httpStatus}`,
          serverMessage || responseText.substring(0, 200)
        );
      }

      const serverError = new Error(serverMessage || `Failed to save ${key}`);
      serverError.httpStatus = httpStatus;
      throw serverError;
    }

    // Parse response to extract data (including version)
    let responseData = null;
    try {
      const responseJson = await response.json();
      responseData = responseJson?.data ?? null;
    } catch (parseError) {
      // Response parsing is optional, continue with success
    }

    resetServerErrors();
    result = createResult(true, { data: responseData });
  } catch (error) {
    const aborted = controller.signal.aborted || error?.name === 'AbortError';
    if (!aborted) {
      // Track server errors for cooldown logic
      if (httpStatus >= 500) {
        recordServerError();
      }
      // Only log on first attempt to reduce console noise
      if (entry.attempts <= 1) {
        console.error(`[VTT] Persistence error for ${key}`, error?.message ?? error);
      }
    }
    result = createResult(false, { aborted, error, httpStatus });
  } finally {
    const slot = pending.get(key);
    const stillPending = slot?.current === entry || slot?.current?.controller === controller;
    entry.lastResult = result ?? createResult(false, { aborted: controller.signal.aborted });
    entry.lastHttpStatus = httpStatus;
    entry.blocked = !entry.lastResult.success;

    if (entry.lastResult.success || !stillPending) {
      if (stillPending && slot) {
        const next = slot.queue.shift() ?? null;
        if (next) {
          slot.current = next;
          schedulePersist(key, next);
        } else {
          pending.delete(key);
        }
      }
      finalizeEntry(entry, entry.lastResult);
      return;
    }

    // Don't retry on 5xx server errors - the server has a problem that retrying won't fix.
    // Only retry on network errors (status 0) or client-side transient issues.
    const isServerError = httpStatus >= 500;
    const shouldRetry =
      !entry.lastResult.success &&
      !entry.lastResult.aborted &&
      !isServerError &&
      entry.attempts < entry.retryLimit;

    if (shouldRetry) {
      const delayMs = entry.retryBackoffMs * Math.max(1, 2 ** (entry.attempts - 1));
      const setTimeoutFn = globalThis?.window?.setTimeout ?? globalThis.setTimeout;
      if (typeof setTimeoutFn === 'function') {
        setTimeoutFn(() => {
          const slot = pending.get(key);
          if (!slot || slot.current !== entry) {
            return;
          }
          persist(key, entry);
        }, delayMs);
      } else {
        persist(key, entry);
      }
      return;
    }

    // Notify failure listeners if we're done retrying
    if (!entry.lastResult.success && !entry.lastResult.aborted) {
      notifyPersistenceFailure({
        key,
        status: httpStatus,
        message: entry.lastResult.error?.message ?? 'Save failed',
      });
    }

    if (stillPending && slot) {
      const next = slot.queue.shift() ?? null;
      if (next) {
        slot.current = next;
        schedulePersist(key, next);
      } else {
        pending.delete(key);
      }
    }

    finalizeEntry(entry, entry.lastResult);
  }
}

function finalizeEntry(entry, result) {
  if (!entry || entry.finalized) {
    return;
  }
  entry.finalized = true;

  for (const resolve of entry.resolvers) {
    try {
      resolve(result);
    } catch (error) {
      console.error('[VTT] Failed to resolve persistence listener', error);
    }
  }

  for (const callback of entry.callbacks) {
    try {
      callback(result);
    } catch (error) {
      console.error('[VTT] Persistence completion callback failed', error);
    }
  }
}

function createResult(success, { aborted = false, error = null, data = null, httpStatus = 0 } = {}) {
  return {
    success: Boolean(success),
    aborted: Boolean(aborted),
    error: error ?? null,
    data: data ?? null,
    httpStatus: httpStatus || 0,
  };
}

function createAbortError(key) {
  const error = new Error(`Save for ${key} was aborted`);
  error.name = 'AbortError';
  return error;
}
