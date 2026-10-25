// Grabs (Brandon, October 2026): where a grabbed creature ends up when its grabber moves.
// Footprints are { column, row, width, height } in squares.

const size = (token, key) => Math.max(1, Number(token?.[key]) || 1);

/** Squares of empty floor between two footprints: 0 = touching (adjacent, corners count) or overlapping. */
export function footprintGap(a, b) {
  const ax2 = a.column + size(a, 'width') - 1, ay2 = a.row + size(a, 'height') - 1;
  const bx2 = b.column + size(b, 'width') - 1, by2 = b.row + size(b, 'height') - 1;
  const gapX = Math.max(0, b.column - ax2 - 1, a.column - bx2 - 1);
  const gapY = Math.max(0, b.row - ay2 - 1, a.row - by2 - 1);
  return Math.max(gapX, gapY);
}

export function footprintsOverlap(a, b) {
  return a.column < b.column + size(b, 'width') && b.column < a.column + size(a, 'width')
    && a.row < b.row + size(b, 'height') && b.row < a.row + size(a, 'height');
}

/**
 * Where the grabbed creature goes: moved as far as its grabber moved, if that square is free and next to the
 * grabber; otherwise the free square next to the grabber nearest to that. null when none is free.
 * `others`: footprints it may not end on (other creatures). `inBounds(column, row, width, height)` -> bool.
 */
export function followSquare({ grabber, grabberFrom, grabbed, others = [], inBounds = () => true }) {
  const w = size(grabbed, 'width'), h = size(grabbed, 'height');
  const dx = grabber.column - grabberFrom.column, dy = grabber.row - grabberFrom.row;
  const want = { column: grabbed.column + dx, row: grabbed.row + dy };
  const fits = (cell) => {
    const at = { column: cell.column, row: cell.row, width: w, height: h };
    return inBounds(at.column, at.row, w, h)
      && !footprintsOverlap(at, grabber)
      && footprintGap(at, grabber) === 0
      && !others.some((other) => footprintsOverlap(at, other));
  };
  if (fits(want)) return want;
  const cells = [];
  for (let column = grabber.column - w; column <= grabber.column + size(grabber, 'width'); column += 1) {
    for (let row = grabber.row - h; row <= grabber.row + size(grabber, 'height'); row += 1) {
      if (fits({ column, row })) cells.push({ column, row });
    }
  }
  if (!cells.length) return null;
  cells.sort((a, b) => (Math.max(Math.abs(a.column - want.column), Math.abs(a.row - want.row)) - Math.max(Math.abs(b.column - want.column), Math.abs(b.row - want.row)))
    || (Math.abs(a.column - want.column) + Math.abs(a.row - want.row)) - (Math.abs(b.column - want.column) + Math.abs(b.row - want.row)));
  return cells[0];
}
