/**
 * Stamina sync service
 *
 * Consolidates the tab-local BroadcastChannel used to keep VTT and
 * character sheet stamina in sync, plus the character-sheet stamina
 * fetch/cache that the token library uses to prefetch HP values when
 * dragging PC tokens onto the board.
 *
 * Extracted from board-interactions.js (BroadcastChannel helpers) and
 * token-library.js (sheet stamina cache/fetch) as part of the phase 4
 * refactor. Module-level state is singleton on purpose — both consumers
 * share the same BroadcastChannel and cache.
 */

const STAMINA_SYNC_CHANNEL = 'vtt-stamina-sync';

let broadcastChannelInstance = null;
const sheetStaminaCache = new Map();
const sheetStaminaRequests = new Map();

function getChannel() {
  if (typeof BroadcastChannel !== 'function') {
    return null;
  }

  if (!broadcastChannelInstance) {
    broadcastChannelInstance = new BroadcastChannel(STAMINA_SYNC_CHANNEL);
  }

  return broadcastChannelInstance;
}

export function broadcastStaminaSync(payload = {}) {
  const channel = getChannel();
  if (!channel) {
    return;
  }

  channel.postMessage({
    type: 'stamina-sync',
    source: 'vtt',
    character: payload.character,
    currentStamina: payload.currentStamina,
    staminaMax: payload.staminaMax,
  });
}

export function subscribeToStaminaSync(handler) {
  if (typeof handler !== 'function') {
    return;
  }
  const channel = getChannel();
  if (channel) {
    channel.addEventListener('message', handler);
  }
}

export function getCachedSheetStamina(tokenName) {
  if (typeof tokenName !== 'string') {
    return null;
  }

  const key = tokenName.trim().toLowerCase();
  if (!key) {
    return null;
  }

  return sheetStaminaCache.get(key) ?? null;
}

export function fetchSheetStamina(routes, tokenName) {
  if (typeof tokenName !== 'string') {
    return null;
  }

  const key = tokenName.trim().toLowerCase();
  if (!key) {
    return null;
  }

  const endpoint = typeof routes?.sheet === 'string' ? routes.sheet : null;
  if (!endpoint || typeof fetch !== 'function') {
    return null;
  }

  const existingRequest = sheetStaminaRequests.get(key);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    try {
      let url = null;
      if (typeof window !== 'undefined' && window?.location?.href) {
        url = new URL(endpoint, window.location.href);
      } else {
        url = new URL(endpoint);
      }

      url.searchParams.set('action', 'sync-stamina');
      url.searchParams.set('character', tokenName);

      const response = await fetch(url.toString(), { method: 'GET' });
      if (!response?.ok) {
        throw new Error(`Sheet fetch failed with status ${response?.status ?? 'unknown'}`);
      }

      const data = await response.json();
      if (!data || typeof data !== 'object') {
        return null;
      }

      if (data.success === false) {
        sheetStaminaCache.set(key, { currentStamina: null, staminaMax: null, missing: true });
        return null;
      }

      sheetStaminaCache.set(key, data);
      return data;
    } catch (error) {
      console.warn('[VTT] Failed to fetch sheet stamina', error);
      return null;
    } finally {
      sheetStaminaRequests.delete(key);
    }
  })();

  sheetStaminaRequests.set(key, request);
  return request;
}

/** Confirm one write, including its JSON body. An uncertain write must not be replayed. */
export async function writeSheetStamina(endpoint, payload = {}, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000,
} = {}) {
  const body = new URLSearchParams({ action: 'sync-stamina', source: 'vtt' });
  for (const field of ['character', 'currentStamina', 'staminaMax']) {
    if (payload[field] !== undefined && payload[field] !== null) body.set(field, payload[field]);
  }
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error('Character stamina save timed out; its outcome needs review.'));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([deadline, (async () => {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: controller.signal,
      });
      if (!response?.ok) throw new Error(`Sheet sync failed with status ${response?.status ?? 'unknown'}`);
      const saved = await response.clone().json();
      if (saved?.success !== true) {
        throw new Error(saved?.error || 'Character stamina save was not confirmed.');
      }
      return response;
    })()]);
  } finally {
    clearTimeout(timer);
  }
}
