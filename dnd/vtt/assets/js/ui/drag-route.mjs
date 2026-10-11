// The route a token drag drew, as the move is to be sent it.
//
// A drag's ruler is put away the moment the token is let go (unless the Measure tool is on), and
// the move was read from the ruler after that: so a corner dropped on the way changed what the
// ruler said and nothing else, and the token was taken straight from start to end. The route is
// now read here first, before the ruler is put away.

/**
 * `points` are the ruler's points while the token was held (its start and any corners, and the
 * square it was last held over if the ruler had got that far); `end` is the square the token was
 * let go on, in the ruler's own squares. Returns the whole route, start to end, when it has a
 * corner; null when it has none, and the move is then sent with no route, as it always was.
 */
export function drawnRoute(points, end) {
  const route = (Array.isArray(points) ? points : []).filter((p) => p && Number.isFinite(p.column) && Number.isFinite(p.row)).map((p) => ({ column: p.column, row: p.row }));
  if (!route.length || !end || !Number.isFinite(end.column) || !Number.isFinite(end.row)) return null;
  const last = route[route.length - 1];
  if (last.column !== end.column || last.row !== end.row) route.push({ column: end.column, row: end.row });
  return route.length > 2 ? route : null;
}
