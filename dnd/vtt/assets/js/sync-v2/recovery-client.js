export function createRecoveryClient({
  endpoint,
  fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
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
    const response = await fetchImpl(`${endpoint}${separator}after=${after}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
      headers: { Accept: 'application/json' },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.success !== true || !body?.recovery) {
      const error = new Error(body?.error || `Sync V2 recovery failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return body.recovery;
  }

  return { recoverAfter };
}
