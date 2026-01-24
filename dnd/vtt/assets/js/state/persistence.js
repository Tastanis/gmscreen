const pending = new Map();
const globalWindow = typeof window === 'undefined' ? null : window;
const globalDocument = typeof document === 'undefined' ? null : document;
const globalNavigator = typeof navigator === 'undefined' ? null : navigator;

let pageVisibilityState = globalDocument?.visibilityState ?? 'visible';
let pageIsUnloading = false;

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

export function queueSave(key, payload, endpoint, options = {}) {
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

    if (!response?.ok) {
      const responseText = await response
        .text()
        .catch(() => '[VTT] Unable to read persistence response body');
      console.error(
        `[VTT] Persistence error for ${key}: ${response?.status ?? 'unknown status'}`,
        responseText
      );
      throw new Error(`Failed to save ${key}`);
    }

    // Parse response to extract data (including version)
    let responseData = null;
    try {
      const responseJson = await response.json();
      responseData = responseJson?.data ?? null;
    } catch (parseError) {
      // Response parsing is optional, continue with success
    }

    result = createResult(true, { data: responseData });
  } catch (error) {
    const aborted = controller.signal.aborted || error?.name === 'AbortError';
    if (!aborted) {
      console.error(`[VTT] Persistence error for ${key}`, error);
    }
    result = createResult(false, { aborted, error });
  } finally {
    const slot = pending.get(key);
    const stillPending = slot?.current === entry || slot?.current?.controller === controller;
    entry.lastResult = result ?? createResult(false, { aborted: controller.signal.aborted });
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

    const shouldRetry =
      !entry.lastResult.success &&
      !entry.lastResult.aborted &&
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

function createResult(success, { aborted = false, error = null, data = null } = {}) {
  return { success: Boolean(success), aborted: Boolean(aborted), error: error ?? null, data: data ?? null };
}

function createAbortError(key) {
  const error = new Error(`Save for ${key} was aborted`);
  error.name = 'AbortError';
  return error;
}
