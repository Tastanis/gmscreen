import { clampToFinite } from './helpers.js';

export function normalizeDrawings(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const normalized = {};
  Object.keys(raw).forEach((sceneId) => {
    const key = typeof sceneId === 'string' ? sceneId.trim() : String(sceneId || '');
    if (!key) {
      return;
    }

    const drawings = Array.isArray(raw[sceneId]) ? raw[sceneId] : [];
    normalized[key] = drawings.map((entry) => normalizeDrawingEntry(entry)).filter(Boolean);
  });

  return normalized;
}

export function normalizeDrawingEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const id = typeof entry.id === 'string' ? entry.id.trim() : '';
  if (!id) {
    return null;
  }

  const points = Array.isArray(entry.points) ? entry.points : [];
  const normalizedPoints = points
    .map((point) => {
      if (!point || typeof point !== 'object') {
        return null;
      }
      const x = Number(point.x);
      const y = Number(point.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
      }
      return { x: clampToFinite(x, 0, 2), y: clampToFinite(y, 0, 2) };
    })
    .filter(Boolean);

  if (normalizedPoints.length < 2) {
    return null;
  }

  const color = typeof entry.color === 'string' ? entry.color.trim() : '#ff0000';
  const strokeWidth = Math.max(1, Math.min(50, Math.trunc(Number(entry.strokeWidth) || 3)));

  return {
    id,
    points: normalizedPoints,
    color: color || '#ff0000',
    strokeWidth,
  };
}
