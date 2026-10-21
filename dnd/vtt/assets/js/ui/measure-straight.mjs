// The Measure tool on the 3D board, straight-line mode (Brandon, October 2026; hold Space for the walking route).
// Draw Steel counts a straight move as whichever is more, the squares across or the squares up or down: 4 across and
// 3 up is 4. A measuring point is a square ({column, row, z}) or a token's space ({column, row, width, height, z},
// counted from its nearest square). z is the height in squares: the ground pointed at, or where the token stands.

const size = (point, key) => Math.max(1, Math.round(Number(point?.[key]) || 1));

/** Squares across between two points: the gap between their spaces, diagonal steps counting 1. */
export function squaresAcross(a, b) {
  const gap = (start, span, otherStart, otherSpan) => Math.max(0, otherStart - (start + span - 1), start - (otherStart + otherSpan - 1));
  return Math.max(
    gap(a.column, size(a, 'width'), b.column, size(b, 'width')),
    gap(a.row, size(a, 'height'), b.row, size(b, 'height')),
  );
}

/** One straight leg: squares across, squares up (below nought is down) and the distance. */
export function straightLeg(a, b) {
  const across = squaresAcross(a, b);
  const rise = Math.round((Number(b.z) || 0) - (Number(a.z) || 0));
  return { across, rise, distance: Math.max(across, Math.abs(rise)) };
}

const squares = (n) => `${n} ${n === 1 ? 'square' : 'squares'}`;

/**
 * The words for a measurement along these points: "4 squares · 4 across · 3 up". Going down to the ground it is a
 * fall ("Fall 3"); down to a token it is "3 down". With corners, the total and the height from start to end.
 */
export function straightWords(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const legs = points.slice(1).map((point, index) => straightLeg(points[index], point));
  const total = legs.reduce((sum, leg) => sum + leg.distance, 0);
  const rise = Math.round((Number(points.at(-1).z) || 0) - (Number(points[0].z) || 0));
  const parts = [squares(total)];
  if (rise) {
    if (legs.length === 1) parts.push(`${legs[0].across} across`);
    parts.push(rise > 0 ? `${rise} up` : points.at(-1).tokenId ? `${-rise} down` : `Fall ${-rise}`);
  }
  return { text: parts.join(' · '), total, legs };
}

/** The hover note beside the pointer: the ground's height, or a token's height and how far it is above the ground. */
export function heightNote(hit) {
  if (!hit) return '';
  if (hit.token) {
    // How far above the ground: for a flier only (a token standing on a floating plate is on its ground).
    const z = Math.round(hit.token.z), above = hit.token.flying ? Math.round(hit.token.z - hit.token.ground) : 0;
    return `${hit.token.name || 'Token'} · ${z} high` + (above > 0 ? ` (${above} above ground)` : '');
  }
  return Number.isFinite(hit.ground) ? `Ground ${Math.round(hit.ground)}` : '';
}
