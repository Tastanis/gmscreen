export const DEFAULT_MOVEMENT_SPEED = 5;

export function toGridInt(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return Math.trunc(fallback);
}

export function toPositiveGridInt(value, fallback = 1) {
  return Math.max(1, toGridInt(value, fallback));
}

export function normalizeFootprint(position = {}) {
  return {
    column: toGridInt(position.column ?? position.col ?? position.x ?? 0, 0),
    row: toGridInt(position.row ?? position.y ?? 0, 0),
    width: toPositiveGridInt(position.width ?? position.columns ?? position.w ?? 1, 1),
    height: toPositiveGridInt(position.height ?? position.rows ?? position.h ?? 1, 1),
  };
}

export function measureChebyshevDistance(from, to) {
  const start = normalizeFootprint(from);
  const end = normalizeFootprint(to);
  return Math.max(Math.abs(end.column - start.column), Math.abs(end.row - start.row));
}

export function getGridBoundsFromView(viewState = {}) {
  const gridSize = Math.max(8, Number.isFinite(viewState.gridSize) ? viewState.gridSize : 64);
  const mapPixelSize = viewState.mapPixelSize ?? {};
  const offsets = viewState.gridOffsets ?? {};
  const left = Number.isFinite(offsets.left) ? offsets.left : 0;
  const right = Number.isFinite(offsets.right) ? offsets.right : 0;
  const top = Number.isFinite(offsets.top) ? offsets.top : 0;
  const bottom = Number.isFinite(offsets.bottom) ? offsets.bottom : 0;
  const mapWidth = Number.isFinite(mapPixelSize.width) ? mapPixelSize.width : 0;
  const mapHeight = Number.isFinite(mapPixelSize.height) ? mapPixelSize.height : 0;
  const innerWidth = Math.max(0, mapWidth - left - right);
  const innerHeight = Math.max(0, mapHeight - top - bottom);

  return {
    gridSize,
    offsets: { left, right, top, bottom },
    columns: Math.max(0, Math.floor(innerWidth / gridSize)),
    rows: Math.max(0, Math.floor(innerHeight / gridSize)),
  };
}

export function buildSquareMovementShape({ origin, remaining, blockers = [], bounds = null } = {}) {
  const footprint = normalizeFootprint(origin);
  const movement = Math.max(0, toGridInt(remaining, 0));
  const minColumn = Number.isFinite(bounds?.minColumn) ? bounds.minColumn : null;
  const minRow = Number.isFinite(bounds?.minRow) ? bounds.minRow : null;
  const maxColumns = Number.isFinite(bounds?.columns) ? Math.max(0, Math.trunc(bounds.columns)) : null;
  const maxRows = Number.isFinite(bounds?.rows) ? Math.max(0, Math.trunc(bounds.rows)) : null;

  let minTopLeftColumn = footprint.column - movement;
  let maxTopLeftColumn = footprint.column + movement;
  let minTopLeftRow = footprint.row - movement;
  let maxTopLeftRow = footprint.row + movement;

  if (minColumn !== null) {
    minTopLeftColumn = Math.max(minColumn, minTopLeftColumn);
  }
  if (minRow !== null) {
    minTopLeftRow = Math.max(minRow, minTopLeftRow);
  }
  if (maxColumns !== null) {
    maxTopLeftColumn = Math.min(Math.max(0, maxColumns - footprint.width), maxTopLeftColumn);
  }
  if (maxRows !== null) {
    maxTopLeftRow = Math.min(Math.max(0, maxRows - footprint.height), maxTopLeftRow);
  }

  if (maxTopLeftColumn < minTopLeftColumn || maxTopLeftRow < minTopLeftRow) {
    return null;
  }

  const outer = {
    column: minTopLeftColumn,
    row: minTopLeftRow,
    width: maxTopLeftColumn - minTopLeftColumn + footprint.width,
    height: maxTopLeftRow - minTopLeftRow + footprint.height,
  };

  const cutouts = blockers
    .map((blocker) => buildBlockerCutout(blocker, footprint))
    .map((cutout) => intersectRects(outer, cutout))
    .filter(Boolean);

  return {
    outer,
    cutouts,
  };
}

export function buildBlockerCutout(blocker, movingFootprint) {
  const target = normalizeFootprint(blocker);
  const mover = normalizeFootprint(movingFootprint);
  return {
    column: target.column - (mover.width - 1),
    row: target.row - (mover.height - 1),
    width: target.width + mover.width - 1,
    height: target.height + mover.height - 1,
  };
}

export function intersectRects(a, b) {
  const left = Math.max(a.column, b.column);
  const top = Math.max(a.row, b.row);
  const right = Math.min(a.column + a.width, b.column + b.width);
  const bottom = Math.min(a.row + a.height, b.row + b.height);
  if (right <= left || bottom <= top) {
    return null;
  }
  return {
    column: left,
    row: top,
    width: right - left,
    height: bottom - top,
  };
}

export function rectToPixels(rect, { gridSize = 64, offsets = {} } = {}) {
  const size = Math.max(8, Number.isFinite(gridSize) ? gridSize : 64);
  const left = Number.isFinite(offsets.left) ? offsets.left : 0;
  const top = Number.isFinite(offsets.top) ? offsets.top : 0;
  return {
    x: left + rect.column * size,
    y: top + rect.row * size,
    width: Math.max(0, rect.width * size),
    height: Math.max(0, rect.height * size),
  };
}
