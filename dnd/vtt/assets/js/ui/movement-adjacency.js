import { canReachFloor } from './floor-geometry.js';

export function adjacencyGap(a, b, levels) {
  if (!a || !b || !canReachFloor(a, b, 1, levels)) return Infinity;
  const width = p => Math.max(1, Number.isFinite(p.width) ? p.width : 1);
  const height = p => Math.max(1, Number.isFinite(p.height) ? p.height : 1);
  const dx = Math.max(0, a.column - (b.column + width(b) - 1), b.column - (a.column + width(a) - 1));
  const dy = Math.max(0, a.row - (b.row + height(b) - 1), b.row - (a.row + height(a) - 1));
  return Math.max(dx, dy);
}

export function movementAdjacencyChanges(from, to, watcher, levels) {
  const empty = { leaves: false, enters: false };
  if (!from || !to || !watcher || ![from.column, from.row, to.column, to.row, watcher.column, watcher.row].every(Number.isFinite)) return empty;
  const start = { ...from, levelId: from.levelId || 'level-0' };
  const end = { ...to, levelId: to.levelId || 'level-0' };
  const adjacent = point => adjacencyGap(watcher, point, levels) <= 1;
  const fromAdjacent = adjacent(start);
  const toAdjacent = adjacent(end);
  const result = { leaves: fromAdjacent && !toAdjacent, enters: !fromAdjacent && toAdjacent };
  // A stairs/fall transition has no confirmed intermediate floor path.
  if (start.levelId !== end.levelId || result.leaves) return result;
  let current = { ...start };
  let previousAdjacent = fromAdjacent;
  // Preserve the existing square-step walk, with bounded fractional final steps.
  // Endpoint checks above remain valid even for a path beyond this safety bound.
  for (let step = 0; step < 200 && (current.column !== end.column || current.row !== end.row); step++) {
    const dx = end.column - current.column;
    const dy = end.row - current.row;
    current.column = Math.abs(dx) <= 1 ? end.column : current.column + Math.sign(dx);
    current.row = Math.abs(dy) <= 1 ? end.row : current.row + Math.sign(dy);
    const nextAdjacent = adjacent(current);
    if (previousAdjacent && !nextAdjacent) { result.leaves = true; break; }
    previousAdjacent = nextAdjacent;
  }
  return result;
}
