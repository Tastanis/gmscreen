import { DEFAULT_MOVEMENT_SPEED } from './movement-math.js';

export const PC_TOKEN_NAMES = new Set(['frunk', 'sharon', 'indigo', 'zepha']);

const CACHE_TTL_MS = 30000;

export function createTokenSpeedResolver({
  routes = {},
  defaultSpeed = DEFAULT_MOVEMENT_SPEED,
  fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
  cacheTtlMs = CACHE_TTL_MS,
} = {}) {
  const cache = new Map();

  function getInitialSpeed(placement) {
    const local = extractLocalSpeedValue(placement);
    return local ?? defaultSpeed;
  }

  async function resolveSpeed(placement) {
    const tokenName = normalizeTokenName(placement?.name);
    if (PC_TOKEN_NAMES.has(tokenName)) {
      const sheetSpeed = await fetchCached(`pc:${tokenName}`, () => fetchCharacterSpeed(routes.sheet, tokenName, fetchImpl), cacheTtlMs, cache);
      const speed = sheetSpeed ?? extractLocalSpeedValue(placement) ?? defaultSpeed;
      return { speed, source: sheetSpeed !== null ? 'sheet' : 'fallback' };
    }

    const monsterId = getMonsterId(placement);
    if (monsterId) {
      const liveSpeed = await fetchCached(
        `monster:${monsterId}`,
        () => fetchMonsterMovementSpeed(routes.monsters, monsterId, fetchImpl),
        cacheTtlMs,
        cache
      );
      const speed = liveSpeed ?? extractLocalSpeedValue(placement) ?? defaultSpeed;
      return { speed, source: liveSpeed !== null ? 'monster' : 'fallback' };
    }

    const local = extractLocalSpeedValue(placement);
    return { speed: local ?? defaultSpeed, source: local !== null ? 'local' : 'default' };
  }

  return {
    getInitialSpeed,
    resolveSpeed,
  };
}

export function normalizeTokenName(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function parseMovementSquares(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.trunc(numeric));
  }

  const match = trimmed.match(/-?\d+/);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

export function extractLocalSpeedValue(placement) {
  const metadata = placement?.metadata && typeof placement.metadata === 'object' ? placement.metadata : null;
  const monster = placement?.monster && typeof placement.monster === 'object' ? placement.monster : null;
  const metadataMonster = metadata?.monster && typeof metadata.monster === 'object' ? metadata.monster : null;
  const candidates = [
    placement?.traits?.speed,
    placement?.traits?.movement,
    placement?.movementSpeed,
    placement?.speed,
    placement?.movement,
    metadata?.traits?.speed,
    metadata?.traits?.movement,
    metadata?.movementSpeed,
    metadata?.speed,
    metadata?.movement,
    monster?.speed,
    monster?.movement,
    metadataMonster?.speed,
    metadataMonster?.movement,
  ];

  for (const candidate of candidates) {
    const parsed = parseMovementSquares(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

export function getMonsterId(placement) {
  const direct = typeof placement?.monsterId === 'string' ? placement.monsterId.trim() : '';
  if (direct) {
    return direct;
  }
  const metadata = placement?.metadata && typeof placement.metadata === 'object' ? placement.metadata : null;
  const metadataId = typeof metadata?.monsterId === 'string' ? metadata.monsterId.trim() : '';
  if (metadataId) {
    return metadataId;
  }
  const monster = placement?.monster && typeof placement.monster === 'object' ? placement.monster : null;
  const monsterId = typeof monster?.id === 'string' ? monster.id.trim() : '';
  return monsterId || '';
}

async function fetchCached(key, loader, cacheTtlMs, cache) {
  const now = Date.now();
  const existing = cache.get(key);
  if (existing && now - existing.timestamp < cacheTtlMs) {
    return existing.promise;
  }
  const promise = Promise.resolve()
    .then(loader)
    .catch(() => null);
  cache.set(key, { timestamp: now, promise });
  return promise;
}

async function fetchCharacterSpeed(endpoint, tokenName, fetchImpl) {
  if (!endpoint || !tokenName || typeof fetchImpl !== 'function') {
    return null;
  }
  const url = buildUrl(endpoint);
  url.searchParams.set('action', 'sync-token-traits');
  url.searchParams.set('character', tokenName);
  url.searchParams.set('source', 'vtt');

  const response = await fetchImpl(url.toString(), {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!response?.ok) {
    return null;
  }
  const payload = await response.json();
  return parseMovementSquares(payload?.speed ?? payload?.traits?.speed ?? payload?.data?.speed ?? null);
}

async function fetchMonsterMovementSpeed(endpoint, monsterId, fetchImpl) {
  if (!endpoint || !monsterId || typeof fetchImpl !== 'function') {
    return null;
  }
  const url = buildUrl(endpoint);
  url.searchParams.set('action', 'movement');
  url.searchParams.set('id', monsterId);

  const response = await fetchImpl(url.toString(), {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!response?.ok) {
    return null;
  }
  const payload = await response.json();
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  return parseMovementSquares(data?.speed ?? data?.movement ?? data?.traits?.speed ?? null);
}

function buildUrl(endpoint) {
  const base = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'http://localhost';
  return new URL(endpoint, base);
}
