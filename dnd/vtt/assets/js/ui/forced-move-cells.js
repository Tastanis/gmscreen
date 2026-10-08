// Which squares an ability's push, pull or slide may end in.
// Pure, so the picker on the board and its tests share one rule.
const chebyshev = (a, b) => Math.max(Math.abs((a?.column || 0) - (b?.column || 0)), Math.abs((a?.row || 0) - (b?.row || 0)));
const center = (placement) => ({
  column: (placement?.column || 0) + Math.max(1, placement?.width || 1) / 2,
  row: (placement?.row || 0) + Math.max(1, placement?.height || 1) / 2,
});

export function footprintsOverlap(a, b) {
  return a.column < b.column + Math.max(1, b.width || 1) && a.column + Math.max(1, a.width || 1) > b.column
    && a.row < b.row + Math.max(1, b.height || 1) && a.row + Math.max(1, a.height || 1) > b.row;
}

export function isForcedMovePathLegal(source, target, destination, baseVerb) {
  const sourceCenter = center(source);
  const start = { column: target.column, row: target.row, width: target.width, height: target.height };
  let remainingDx = destination.column - start.column;
  let remainingDy = destination.row - start.row;
  const steps = Math.max(Math.abs(remainingDx), Math.abs(remainingDy));
  if (steps <= 0) return false;
  let previousDistance = chebyshev(sourceCenter, center(start));
  let column = start.column;
  let row = start.row;
  for (let index = 0; index < steps; index += 1) {
    // Chebyshev walk: take a diagonal step while both axes have remaining
    // distance, then a cardinal step for whichever axis is still off-target.
    const stepX = Math.sign(remainingDx);
    const stepY = Math.sign(remainingDy);
    column += stepX;
    row += stepY;
    remainingDx -= stepX;
    remainingDy -= stepY;
    const cell = { column, row, width: start.width, height: start.height };
    const nextDistance = chebyshev(sourceCenter, center(cell));
    // Push: each step must be non-decreasing distance from source.
    // Pull: each step must be non-increasing distance from source.
    // Plateaus are allowed (diagonal moves that traverse parallel to source).
    // Slide: any walk is fine.
    if (baseVerb === 'push' && nextDistance < previousDistance) return false;
    if (baseVerb === 'pull' && nextDistance > previousDistance) return false;
    previousDistance = nextDistance;
  }
  return true;
}

export function forcedMoveLegalCells(source, target, distance, baseVerb) {
  const cells = [];
  const originDistance = chebyshev(center(source), center(target));
  for (let dy = -distance; dy <= distance; dy += 1) {
    for (let dx = -distance; dx <= distance; dx += 1) {
      // A fractional starting placement must not shift the visible selection grid.
      const column = Math.floor(target.column) + dx;
      const row = Math.floor(target.row) + dy;
      const movedDistance = chebyshev(target, { column, row });
      if (movedDistance > distance || movedDistance === 0) continue;
      if (!isForcedMovePathLegal(source, target, { column, row }, baseVerb)) continue;
      const candidate = { column, row, width: target.width, height: target.height };
      const sourceDistance = chebyshev(center(source), center(candidate));
      if (baseVerb === 'push' && sourceDistance <= originDistance) continue;
      if (baseVerb === 'pull' && sourceDistance >= originDistance) continue;
      // A pull brings the target beside the puller, never onto it.
      if (baseVerb === 'pull' && footprintsOverlap(candidate, source)) continue;
      // slide: any cell within distance — no source-distance constraint
      cells.push({ column, row });
    }
  }
  return cells;
}

/** The square a pull ends in when the puller itself is picked: as close to the puller as the pull allows. */
export function nearestPullCell(source, target, legalCells) {
  const sourceCenter = center(source);
  let best = null, bestRank = null;
  for (const cell of legalCells || []) {
    const at = center({ ...cell, width: target.width, height: target.height });
    // Nearest in squares, then the straightest line to the puller, then the shortest pull.
    const rank = [chebyshev(sourceCenter, at), Math.hypot(sourceCenter.column - at.column, sourceCenter.row - at.row), chebyshev(target, cell)];
    const index = bestRank ? rank.findIndex((value, i) => Math.abs(value - bestRank[i]) > 1e-9) : 0;
    if (!bestRank || (index >= 0 && rank[index] < bestRank[index])) { best = cell; bestRank = rank; }
  }
  return best;
}

/**
 * Only the squares that are on the map. `clamp(column, row, width, height)` is the board's own
 * rule for keeping a token on the map; a square it would move is off the map. A long teleport
 * used to offer every square within its distance, thousands of them beyond the map's edge.
 */
export function cellsOnMap(cells, clamp, target) {
  if (typeof clamp !== 'function') return cells;
  return (cells || []).filter((cell) => {
    const kept = clamp(cell.column, cell.row, target?.width || 1, target?.height || 1);
    return !!kept && kept.column === cell.column && kept.row === cell.row;
  });
}
