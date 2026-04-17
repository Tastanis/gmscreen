export const MAX_PERSISTED_PINGS = 8;
export const MAP_PING_RETENTION_MS = 10000;

export function normalizePings(raw = []) {
  if (!Array.isArray(raw)) {
    return [];
  }

  const byId = new Map();
  const retentionThreshold = Date.now() - MAP_PING_RETENTION_MS;
  raw.forEach((entry) => {
    const ping = normalizePingEntry(entry);
    if (!ping) {
      return;
    }
    if (ping.createdAt < retentionThreshold) {
      return;
    }
    const previous = byId.get(ping.id);
    if (!previous || (ping.createdAt ?? 0) >= (previous.createdAt ?? 0)) {
      byId.set(ping.id, ping);
    }
  });

  if (byId.size === 0) {
    return [];
  }

  const sorted = Array.from(byId.values()).sort(
    (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)
  );

  if (sorted.length > MAX_PERSISTED_PINGS) {
    return sorted.slice(sorted.length - MAX_PERSISTED_PINGS);
  }

  return sorted;
}

export function normalizePingEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const id = typeof entry.id === 'string' ? entry.id.trim() : '';
  if (!id) {
    return null;
  }

  const createdAtRaw = Number(entry.createdAt ?? entry.timestamp ?? 0);
  if (!Number.isFinite(createdAtRaw)) {
    return null;
  }
  const createdAt = Math.max(0, Math.trunc(createdAtRaw));

  const x = normalizePingCoordinate(entry.x ?? entry.column ?? entry.left);
  const y = normalizePingCoordinate(entry.y ?? entry.row ?? entry.top);
  if (x === null || y === null) {
    return null;
  }

  const typeRaw = typeof entry.type === 'string' ? entry.type.trim().toLowerCase() : '';
  const type = typeRaw === 'focus' ? 'focus' : 'ping';

  const sceneIdRaw = typeof entry.sceneId === 'string' ? entry.sceneId.trim() : '';
  const sceneId = sceneIdRaw === '' ? null : sceneIdRaw;

  const authorRaw =
    typeof entry.authorId === 'string'
      ? entry.authorId.trim().toLowerCase()
      : null;
  const authorId = authorRaw ? authorRaw : null;

  const normalized = { id, sceneId, x, y, type, createdAt };
  if (authorId) {
    normalized.authorId = authorId;
  }
  return normalized;
}

export function normalizePingCoordinate(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const clamped = Math.min(1, Math.max(0, numeric));
  const rounded = Math.round(clamped * 10000) / 10000;
  return Number.isFinite(rounded) ? rounded : null;
}
