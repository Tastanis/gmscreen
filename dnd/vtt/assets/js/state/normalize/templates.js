import { clampToFinite } from './helpers.js';

export function normalizeTemplates(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const normalized = {};
  Object.keys(raw).forEach((sceneId) => {
    const key = typeof sceneId === 'string' ? sceneId.trim() : String(sceneId || '');
    if (!key) {
      return;
    }

    const templates = Array.isArray(raw[sceneId]) ? raw[sceneId] : [];
    normalized[key] = templates.map((entry) => normalizeTemplateEntry(entry)).filter(Boolean);
  });

  return normalized;
}

export function normalizeTemplateEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const type = typeof entry.type === 'string' ? entry.type.trim().toLowerCase() : '';
  const id = typeof entry.id === 'string' ? entry.id.trim() : '';
  if (!id || (type !== 'circle' && type !== 'rectangle' && type !== 'wall')) {
    return null;
  }

  const color = typeof entry.color === 'string' ? entry.color : undefined;

  if (type === 'circle') {
    const column = clampToFinite(entry.center?.column, 0, 4);
    const row = clampToFinite(entry.center?.row, 0, 4);
    const radius = Math.max(0.5, clampToFinite(entry.radius, 0.5, 4));
    const normalized = {
      id,
      type: 'circle',
      center: { column, row },
      radius,
    };
    if (color) {
      normalized.color = color;
    }
    return normalized;
  }

  if (type === 'rectangle') {
    const startColumn = Math.max(0, clampToFinite(entry.start?.column, 0, 4));
    const startRow = Math.max(0, clampToFinite(entry.start?.row, 0, 4));
    const length = Math.max(1, clampToFinite(entry.length, 1, 4));
    const width = Math.max(1, clampToFinite(entry.width, 1, 4));
    const rotation = clampToFinite(entry.rotation, 0, 2);
    const normalized = {
      id,
      type: 'rectangle',
      start: { column: startColumn, row: startRow },
      length,
      width,
      rotation,
    };
    if (color) {
      normalized.color = color;
    }
    if (Number.isFinite(entry.anchor?.column) && Number.isFinite(entry.anchor?.row)) {
      normalized.anchor = {
        column: Math.max(0, clampToFinite(entry.anchor.column, 0, 4)),
        row: Math.max(0, clampToFinite(entry.anchor.row, 0, 4)),
      };
    }
    if (Number.isFinite(entry.orientation?.x) || Number.isFinite(entry.orientation?.y)) {
      normalized.orientation = {
        x: entry.orientation?.x >= 0 ? 1 : -1,
        y: entry.orientation?.y >= 0 ? 1 : -1,
      };
    }
    return normalized;
  }

  if (type === 'wall') {
    const rawSquares = Array.isArray(entry.squares) ? entry.squares : [];
    const squares = rawSquares
      .map((square) => {
        const column = Math.round(Number(square?.column ?? square?.col ?? square?.x));
        const row = Math.round(Number(square?.row ?? square?.y));
        if (!Number.isFinite(column) || !Number.isFinite(row)) {
          return null;
        }
        return { column: Math.max(0, column), row: Math.max(0, row) };
      })
      .filter(Boolean);
    const normalized = {
      id,
      type: 'wall',
      squares,
    };
    if (color) {
      normalized.color = color;
    }
    return normalized;
  }

  return null;
}
