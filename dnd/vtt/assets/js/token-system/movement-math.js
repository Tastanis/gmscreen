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

/**
 * Reach outline that follows the real cost of each step. `cellInfo(column, row)`
 * gives, for the mover's top-left square, the rounded ground height and the
 * movement multiplier of that square. `stepCost(from, to)` prices one step
 * between two such squares; the board passes the ruler's own pricing. Without
 * it a step costs the larger of 1 and the height change, plus (multiplier - 1).
 * Returns the plain square shape when nothing changes the cost, so flat maps
 * without difficult terrain look as they always have.
 */
export function buildReachableMovementShape({ origin, remaining, cellInfo = null, stepCost = null, blockers = [], bounds = null } = {}) {
  const square = buildSquareMovementShape({ origin, remaining, blockers, bounds });
  if (!square || typeof cellInfo !== 'function') {
    return square;
  }
  const footprint = normalizeFootprint(origin);
  const movement = Math.max(0, toGridInt(remaining, 0));
  const minColumn = square.outer.column;
  const minRow = square.outer.row;
  const maxColumn = square.outer.column + square.outer.width - footprint.width;
  const maxRow = square.outer.row + square.outer.height - footprint.height;
  const price = (from, to) => {
    const fallback = Math.max(1, Math.abs(to.height - from.height)) + to.multiplier - 1;
    if (typeof stepCost !== 'function') return fallback;
    let value = null;
    try { value = Number(stepCost(from, to)); } catch (error) { value = null; }
    return Number.isFinite(value) && value >= 1 ? value : fallback;
  };
  const info = new Map();
  const read = (column, row) => {
    const key = `${column},${row}`;
    let value = info.get(key);
    if (!value) {
      let raw = null;
      try { raw = cellInfo(column, row); } catch (error) { raw = null; }
      const multiplier = Number(raw?.multiplier);
      value = {
        height: Number.isFinite(Number(raw?.height)) ? Number(raw.height) : 0,
        multiplier: Number.isFinite(multiplier) && multiplier > 1 ? Math.floor(multiplier) : 1,
      };
      info.set(key, value);
    }
    return value;
  };

  // Cheapest cost to each top-left square (uniform-cost search; costs are small whole numbers).
  const best = new Map([[`${footprint.column},${footprint.row}`, 0]]);
  const frontier = [[0, footprint.column, footprint.row]];
  while (frontier.length) {
    let pick = 0;
    for (let i = 1; i < frontier.length; i += 1) if (frontier[i][0] < frontier[pick][0]) pick = i;
    const [cost, column, row] = frontier.splice(pick, 1)[0];
    if (cost > (best.get(`${column},${row}`) ?? Infinity)) continue;
    const here = read(column, row);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nextColumn = column + dx;
        const nextRow = row + dy;
        if (nextColumn < minColumn || nextColumn > maxColumn || nextRow < minRow || nextRow > maxRow) continue;
        const there = read(nextColumn, nextRow);
        const next = cost + price(here, there);
        const key = `${nextColumn},${nextRow}`;
        if (next > movement || next >= (best.get(key) ?? Infinity)) continue;
        best.set(key, next);
        frontier.push([next, nextColumn, nextRow]);
      }
    }
  }

  const positions = (maxColumn - minColumn + 1) * (maxRow - minRow + 1);
  if (best.size >= positions) {
    return square;
  }

  // Squares the token's body can cover, and the outer edges of that area.
  const covered = new Set();
  best.forEach((_, key) => {
    const [column, row] = key.split(',').map(Number);
    for (let r = row; r < row + footprint.height; r += 1) {
      for (let c = column; c < column + footprint.width; c += 1) covered.add(`${c},${r}`);
    }
  });
  const edges = [];
  const cells = [];
  covered.forEach((key) => {
    const [column, row] = key.split(',').map(Number);
    cells.push([column, row]);
    if (!covered.has(`${column},${row - 1}`)) edges.push([column, row, column + 1, row]);
    if (!covered.has(`${column + 1},${row}`)) edges.push([column + 1, row, column + 1, row + 1]);
    if (!covered.has(`${column},${row + 1}`)) edges.push([column + 1, row + 1, column, row + 1]);
    if (!covered.has(`${column - 1},${row}`)) edges.push([column, row + 1, column, row]);
  });
  return { outer: square.outer, cutouts: square.cutouts, cells, edges };
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
