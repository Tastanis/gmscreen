// Object tokens (Brandon, October 2026): traps, hazards, fortifications, siege engines. A monster-style token
// whose organization or role says so (Draw Steel's dynamic terrain: "Level 2 Hazard Hexer", "Level 1 Trap
// Ambusher"...), or with an `object` passive. Its triggers fire on their own; it takes no turn and sets off no
// opportunity attacks unless its passive says `inTracker: true`.
import { straightSquares } from './forced-line.mjs';

const OBJECT_WORDS = /\b(hazard|trap|fortification|siege|siege engine|power fixture|mechanism|object|dynamic terrain)\b/i;

export function objectRules(monster, passivesOfKind = () => []) {
  if (!monster || typeof monster !== 'object') return null;
  const [passive] = passivesOfKind(monster, 'object');
  const words = `${monster.organization || ''} ${monster.role || ''}`;
  if (!passive && !OBJECT_WORDS.test(words)) return null;
  if (passive && passive.object === false) return null;
  return { inTracker: passive?.inTracker === true };
}

const size = (token, key) => Math.max(1, Number(token?.[key]) || 1);
function gap(a, b) {
  const gapX = Math.max(0, b.column - (a.column + size(a, 'width')), a.column - (b.column + size(b, 'width')));
  const gapY = Math.max(0, b.row - (a.row + size(a, 'height')), a.row - (b.row + size(b, 'height')));
  return Math.max(gapX, gapY);
}

/** Every square the mover's corner passes, along its corners: [from, ...path, to]. */
export function moveSquares(from, path = [], to) {
  const stops = [from, ...(Array.isArray(path) ? path : []), to].filter(Boolean).map((stop) => ({ column: Number(stop.column) || 0, row: Number(stop.row) || 0 }));
  const squares = [stops[0]];
  for (let index = 1; index < stops.length; index += 1) squares.push(...straightSquares(stops[index - 1], stops[index]).slice(1));
  return squares;
}

/**
 * For a watcher: how far the mover was at the start (`startGap`) and how close it came on the way or at the end
 * (`nearestGap`): -1 = on its squares, 0 = next to it, N = N empty squares between. Used by the `entersSpace` trigger.
 */
export function entryGaps(watcher, from, path, to) {
  const width = size(from, 'width'), height = size(from, 'height');
  const inside = (at) => at.column < watcher.column + size(watcher, 'width') && watcher.column < at.column + width
    && at.row < watcher.row + size(watcher, 'height') && watcher.row < at.row + height;
  const measure = (square) => {
    const at = { column: square.column, row: square.row, width, height };
    return inside(at) ? -1 : gap(at, watcher);
  };
  const squares = moveSquares(from, path, to);
  return { startGap: measure(squares[0]), nearestGap: Math.min(...squares.slice(1).map(measure)) };
}

/**
 * Creatures a move went through (its footprint overlapped theirs on the way or at the end) or came next to,
 * along [from, ...path, to]. `others`: the tokens to check (not the mover).
 */
export function creaturesAlong(from, path, to, others = []) {
  const width = size(from, 'width'), height = size(from, 'height');
  const squares = moveSquares(from, path, to).slice(1);
  const throughIds = [], adjacentIds = [];
  for (const other of others) {
    if (!other?.id) continue;
    let through = false, near = false;
    for (const square of squares) {
      const at = { column: square.column, row: square.row, width, height };
      const overlaps = at.column < other.column + size(other, 'width') && other.column < at.column + width
        && at.row < other.row + size(other, 'height') && other.row < at.row + height;
      if (overlaps) { through = true; break; }
      if (gap(at, other) === 0) near = true;
    }
    if (through) throughIds.push(other.id);
    else if (near) adjacentIds.push(other.id);
  }
  return { throughIds, adjacentIds };
}
