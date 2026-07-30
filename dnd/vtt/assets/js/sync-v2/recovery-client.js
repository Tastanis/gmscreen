export function createRecoveryClient({
  endpoint,
  fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
  timeoutMs = 8000,
  AbortControllerClass = globalThis.AbortController,
  setTimeoutRef = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutRef = globalThis.clearTimeout?.bind(globalThis),
} = {}) {
  if (!endpoint || typeof endpoint !== 'string') {
    throw new TypeError('Recovery endpoint is required');
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('A fetch implementation is required');
  }

  async function recoverAfter(revision, { signal } = {}) {
    const after = Number.isSafeInteger(Number(revision)) ? Math.max(0, Number(revision)) : 0;
    const separator = endpoint.includes('?') ? '&' : '?';
    const controller = typeof AbortControllerClass === 'function'
      ? new AbortControllerClass()
      : null;
    const abortFromCaller = () => controller?.abort(signal?.reason);
    signal?.addEventListener?.('abort', abortFromCaller, { once: true });
    if (signal?.aborted) abortFromCaller();
    const timeout = controller && typeof setTimeoutRef === 'function'
      ? setTimeoutRef(
          () => controller.abort(new Error('Sync V2 recovery timed out')),
          Math.max(1000, Number(timeoutMs) || 8000)
        )
      : null;
    try {
      const response = await fetchImpl(`${endpoint}${separator}after=${after}`, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller?.signal ?? signal,
        headers: { Accept: 'application/json' },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true || !body?.recovery) {
        const error = new Error(body?.error || `Sync V2 recovery failed (${response.status})`);
        error.status = response.status;
        throw error;
      }
      return body.recovery;
    } finally {
      if (timeout !== null && typeof clearTimeoutRef === 'function') {
        clearTimeoutRef(timeout);
      }
      signal?.removeEventListener?.('abort', abortFromCaller);
    }
  }

  return { recoverAfter };
}
