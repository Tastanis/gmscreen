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
    // Push: each step must be non-decreasing distance from source. Plateaus are allowed
    // (diagonal moves that traverse parallel to source).
    // Pull: each step must bring the target closer, as the book says ("must bring the target
    // closer to them"). A step that only runs along the puller's side is not closer, so the
    // squares beside the puller that are reached at a slant are not offered. The straight line
    // to one of those clips the puller's own square, which used to be scored as a collision.
    // Slide: any walk is fine.
    if (baseVerb === 'push' && nextDistance < previousDistance) return false;
    if (baseVerb === 'pull' && nextDistance >= previousDistance) return false;
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
  if (baseVerb !== 'push' && baseVerb !== 'pull') return cells;
  // A push or a pull goes along its one straight line, out to the first square on it that is not a legal one.
  const line = forcedLineCells(source, target, distance, baseVerb);
  if (!line.length) return cells;
  const offered = [];
  for (const cell of line) {
    if (!cells.some((legal) => legal.column === cell.column && legal.row === cell.row)) break;
    offered.push(cell);
  }
  return offered;
}

// The one straight line a push or a pull goes along. Brandon, October 12, 2026: "Ability pushes go in a straight
// line, yes." Until then the picker offered a fan: every square that was further from the pusher.
//
// The line runs from the pusher's nearest square through the target's nearest square and on (for a pull, from the
// target toward the puller). Its k-th square is k squares along it from where the target stands, rounded to a square,
// a half going outward. Straight ahead, straight to the side and a true diagonal are the plain rows of squares;
// at any other angle the line steps over as it goes. A slide has no line: it may go round things.
// Paired with ForcedMovement::lineCell, which refuses a push or a pull that is not on it.
const outward = (value) => Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
// A creature larger than a square is measured from the square of it nearest the other, not from its middle: a
// two-by-two pusher beside the target's upper half pushes straight, where its middle would tilt the line a row.
const squaresOf = (placement) => {
  const out = [], w = Math.max(1, Math.round(placement?.width || 1)), h = Math.max(1, Math.round(placement?.height || 1));
  for (let r = 0; r < h; r += 1) for (let c = 0; c < w; c += 1) out.push({ column: (placement?.column || 0) + c + 0.5, row: (placement?.row || 0) + r + 0.5 });
  return out;
};
function nearestSquares(source, target) {
  let best = [center(source), center(target)], least = Infinity;
  for (const a of squaresOf(source)) for (const b of squaresOf(target)) {
    const d = Math.hypot(b.column - a.column, b.row - a.row);
    if (d < least - 1e-9) { least = d; best = [a, b]; }
  }
  return best;
}
export function forcedLineCell(source, target, squares, baseVerb) {
  const [from, through] = nearestSquares(source, target), sign = baseVerb === 'pull' ? -1 : 1;
  const dx = (through.column - from.column) * sign, dy = (through.row - from.row) * sign, reach = Math.max(Math.abs(dx), Math.abs(dy));
  if (reach < 1e-9) return null;
  return { column: Math.floor(target.column) + outward(squares * dx / reach), row: Math.floor(target.row) + outward(squares * dy / reach) };
}

/** The squares of that line, nearest first, for a move of `distance`. None when pusher and target share a middle. */
export function forcedLineCells(source, target, distance, baseVerb) {
  const cells = [];
  for (let squares = 1; squares <= distance; squares += 1) {
    const cell = forcedLineCell(source, target, squares, baseVerb);
    if (!cell) break;
    cells.push(cell);
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

/** The offered square nearest to the one that was picked (ties go to the first offered); null when none is offered. */
export function closestCell(cells, wanted) {
  let best = null, bestDistance = Infinity;
  for (const cell of cells || []) {
    const distance = Math.hypot(cell.column - wanted.column, cell.row - wanted.row);
    if (distance < bestDistance - 1e-9) { best = cell; bestDistance = distance; }
  }
  return best;
}
