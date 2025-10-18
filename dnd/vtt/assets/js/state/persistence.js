const pending = new Map();

export function queueSave(key, payload, endpoint, options = {}) {
  const controller = new AbortController();
  const { onComplete } =
    typeof options === 'function' ? { onComplete: options } : options ?? {};

  const entry = {
    payload,
    endpoint,
    controller,
    callbacks: [],
    resolvers: [],
    promise: null,
    finalized: false,
  };

  if (typeof onComplete === 'function') {
    entry.callbacks.push(onComplete);
  }

  entry.promise = new Promise((resolve) => {
    entry.resolvers.push(resolve);
  });

  if (pending.has(key)) {
    const existing = pending.get(key);
    pending.delete(key);
    existing.controller.abort();
    finalizeEntry(
      existing,
      createResult(false, {
        aborted: true,
        error: createAbortError(key),
      })
    );
  }

  pending.set(key, entry);

  const setTimeoutFn = globalThis?.window?.setTimeout ?? globalThis.setTimeout;
  if (typeof setTimeoutFn === 'function') {
    setTimeoutFn(() => {
      const current = pending.get(key);
      if (!current || current !== entry) {
        return;
      }
      persist(key, current);
    }, 250);
  } else {
    persist(key, entry);
  }

  return entry.promise;
}

async function persist(key, entry) {
  const { payload, endpoint, controller } = entry;
  let result = null;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response?.ok) {
      throw new Error(`Failed to save ${key}`);
    }

    result = createResult(true);
  } catch (error) {
    const aborted = controller.signal.aborted || error?.name === 'AbortError';
    if (!aborted) {
      console.error(`[VTT] Persistence error for ${key}`, error);
    }
    result = createResult(false, { aborted, error });
  } finally {
    const current = pending.get(key);
    if (current === entry || current?.controller === controller) {
      pending.delete(key);
    }

    finalizeEntry(entry, result ?? createResult(false, { aborted: controller.signal.aborted }));
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

function createResult(success, { aborted = false, error = null } = {}) {
  return { success: Boolean(success), aborted: Boolean(aborted), error: error ?? null };
}

function createAbortError(key) {
  const error = new Error(`Save for ${key} was aborted`);
  error.name = 'AbortError';
  return error;
}
