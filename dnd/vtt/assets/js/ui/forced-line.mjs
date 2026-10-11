// A forced move goes straight (Brandon, October 10, 2026): "It's supposed to go perfectly straight from
// the location it is to the location I am holding it. It can't go around stuff." And of slides, the
// same day: "Yes slide can move around things."
//
// The move itself always went straight: the browser (forced-drag.js) and the server
// (ForcedMovement::resolve) travel the true line from the creature's square to the square it is held
// over, and stop at what that line meets. The ruler did not: it drew and walked a forced drag as a
// walk (diagonal squares first, then straight, stepping onto plates and stairs). These are the
// ruler's and the board's rules for a forced drag, so the line, the distance, the ghost and the move
// all read the same thing.
//
// A push or a pull is one straight line. A forced drag with a corner in it is a slide: each leg is
// its own straight line, made as its own forced move in order, and what a leg meets is met on that
// leg. A leg that does not end on its corner (it met a creature or a wall, broke through, or went
// over an edge and fell) ends the slide there.

const squaresBetween = (a, b) => Math.max(Math.abs(b.column - a.column), Math.abs(b.row - a.row));

/** What the ruler calls a forced drag: with a corner in its route it is a slide. */
export function forcedLabel(points) {
  return Array.isArray(points) && points.length > 2 ? 'Slide' : 'Forced movement';
}

/**
 * The legs of a forced route, in order: where each starts and ends, how many squares it is, and
 * `beyond`, the squares of the slide still to come after it (what is left of the move if this
 * leg is stopped short). A route with no corner is one leg with nothing beyond it.
 */
export function slideLegs(route) {
  const points = (Array.isArray(route) ? route : []).filter((p) => p && Number.isFinite(p.column) && Number.isFinite(p.row));
  const legs = [];
  for (let i = 1; i < points.length; i++) {
    const squares = squaresBetween(points[i - 1], points[i]);
    if (squares > 0) legs.push({ from: { column: points[i - 1].column, row: points[i - 1].row }, to: { column: points[i].column, row: points[i].row }, squares, beyond: 0 });
  }
  for (let i = legs.length - 2; i >= 0; i--) legs[i].beyond = legs[i + 1].beyond + legs[i + 1].squares;
  return legs;
}

/**
 * The true line from one square to another, as one point for each square of distance (and the
 * start): where the creature is after each square of the leg, not rounded to squares.
 */
export function straightLine(start, end) {
  const dx = end.column - start.column, dy = end.row - start.row, steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)));
  const line = [{ column: start.column, row: start.row }];
  for (let i = 1; i <= steps; i++) line.push({ column: start.column + dx * i / steps, row: start.row + dy * i / steps });
  return line;
}

/** The squares that line passes, by the same rounding the move uses when it must stop on one. */
export function straightSquares(start, end) {
  return straightLine(start, end).map((point) => ({ column: Math.round(point.column), row: Math.round(point.row) }));
}
