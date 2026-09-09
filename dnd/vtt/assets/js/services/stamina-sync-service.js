import {getCharacterOperationJournal} from './character-operation-journal.js';
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
  operationId = globalThis.crypto.randomUUID(),
  journalOverride,
  recoveryTimeoutMs = 3000,
} = {}) {
  const body = new URLSearchParams({ action: 'sync-stamina', source: 'vtt', operationId });
  for (const field of ['character', 'currentStamina', 'staminaMax']) {
    if (payload[field] !== undefined && payload[field] !== null) body.set(field, payload[field]);
  }
  const journal = journalOverride ?? getCharacterOperationJournal();
  journal?.begin({operationId,endpoint,action:'sync-stamina',fields:Object.fromEntries(body)});
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
      if (saved.operationId !== operationId) throw new Error('Character stamina receipt was not confirmed.');
      if (!controller.signal.aborted) journal?.complete(operationId);
      return response;
    })()]);
  } catch (error) {
    // Only inspect the accepted operation; never resend the write.
    clearTimeout(timer);
    const recovered = await inspectStaminaReceipt(endpoint, body, fetchImpl, recoveryTimeoutMs);
    if (recovered) {
      journal?.complete(operationId);
      return new Response(JSON.stringify(recovered), {headers:{'Content-Type':'application/json'}});
    }
    error.operationId = operationId;
    try { journal?.fail(operationId,error.message); } catch { /* Preserve the pending record. */ }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function inspectStaminaReceipt(endpoint, body, fetchImpl, timeoutMs) {
  const controller=new AbortController();let timer;
  try {
    const url=new URL(endpoint,globalThis.location?.href ?? 'http://localhost/');
    url.searchParams.set('action','operation-status');
    url.searchParams.set('character',body.get('character') ?? '');
    url.searchParams.set('operationId',body.get('operationId'));
    return await Promise.race([
      new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(null);},timeoutMs);}),
      (async()=>{
        const response=await fetchImpl(url.href,{method:'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal});
        if(!response.ok)return null;
        const result=await response.json(),receipt=result?.receipt,saved=receipt?.response;
        if(result.success!==true || result.recorded!==true || receipt?.action!=='sync-stamina'
          || receipt.operationId!==body.get('operationId') || saved?.operationId!==body.get('operationId')
          || saved.success!==true || !Number.isFinite(saved.currentStamina) || saved.currentStamina!==Number(body.get('currentStamina'))
          || (body.has('staminaMax') && Number(saved.staminaMax)!==Number(body.get('staminaMax'))))return null;
        return saved;
      })(),
    ]);
  } catch {return null;} finally {clearTimeout(timer);}
}
