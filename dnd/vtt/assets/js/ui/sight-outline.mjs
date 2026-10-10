// The outline of the lit ground.
//
// The lit ground is found as some three thousand small closed pieces: whole squares, halves, the
// cut squares along every shadow, and thin strips. Handing the browser all of them to fill and
// outline is its heaviest drawing job on a token move (about 150 ms on a mid-range graphics card),
// and nearly every edge it draws lies between two lit pieces, where it shows nothing.
//
// Here the pieces are replaced by the outline of what they cover together: the same ground, with
// every stretch of edge that two pieces share taken out. About a seventh of the points.
//
// How: each piece is turned to go the same way round. Then two neighbours run along a shared edge
// in opposite directions, and the two cancel. Edges along the grid's lines are first cut at every
// point any piece has on that line, so a long edge cancels against two short ones. What is left is
// chained end to start into closed loops. Every point of the board is wound round as many times by
// the loops as by the pieces, so filling the loops fills exactly what filling the pieces filled. A
// loop round an unlit island inside lit ground goes the other way round, and must be drawn that way.

const twiceArea = (ring) => { let sum = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; sum += p.x * q.y - q.x * p.y; } return sum; };
const keyOf = (p) => p.x + ',' + p.y;

/** The loops that bound what the pieces cover. Pieces and loops are rings of {x, y} in squares. */
export function outlineOf(pieces) {
  const lines = new Map(), loose = [];
  for (const piece of pieces) {
    if (piece.length < 3) continue;
    const ring = twiceArea(piece) < 0 ? [...piece].reverse() : piece;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (a.x === b.x && a.y === b.y) continue;
      const vertical = a.x === b.x;
      if (!vertical && a.y !== b.y) { loose.push([a, b]); continue; }
      const id = (vertical ? 'v' : 'h') + (vertical ? a.x : a.y);
      let line = lines.get(id); if (!line) lines.set(id, line = { vertical, at: vertical ? a.x : a.y, edges: [] });
      line.edges.push(vertical ? a.y : a.x, vertical ? b.y : b.x);
    }
  }
  // On each grid line: the stretches where more edges run one way than the other.
  const kept = [];
  for (const line of lines.values()) {
    const cuts = [...new Set(line.edges)].sort((p, q) => p - q), index = new Map(cuts.map((c, i) => [c, i])), net = new Int32Array(cuts.length);
    for (let e = 0; e < line.edges.length; e += 2) { const from = line.edges[e], to = line.edges[e + 1], lo = index.get(Math.min(from, to)), hi = index.get(Math.max(from, to)), way = to > from ? 1 : -1; for (let k = lo; k < hi; k++) net[k] += way; }
    const point = (c) => (line.vertical ? { x: line.at, y: c } : { x: c, y: line.at });
    for (let k = 0; k < cuts.length - 1; k++) for (let n = Math.abs(net[k]); n > 0; n--) kept.push(net[k] > 0 ? [point(cuts[k]), point(cuts[k + 1])] : [point(cuts[k + 1]), point(cuts[k])]);
  }
  // Chain end to start. Where several edges leave one point any of them will do: every loop closes.
  const edges = kept.concat(loose), leaving = new Map();
  edges.forEach((edge, i) => { const k = keyOf(edge[0]); const list = leaving.get(k); if (list) list.push(i); else leaving.set(k, [i]); });
  const used = new Uint8Array(edges.length), loops = [];
  for (let start = 0; start < edges.length; start++) {
    if (used[start]) continue;
    const loop = []; let at = start;
    for (;;) {
      used[at] = 1; loop.push(edges[at][0]);
      const list = leaving.get(keyOf(edges[at][1])); let next = -1;
      if (list) while (list.length) { const i = list.pop(); if (!used[i]) { next = i; break; } }
      if (next < 0) break; at = next;
    }
    // A point in the middle of a straight run along a grid line says nothing.
    const tidy = loop.filter((p, i) => { const a = loop[(i + loop.length - 1) % loop.length], b = loop[(i + 1) % loop.length]; return !((a.x === p.x && p.x === b.x && (a.y < p.y) === (p.y < b.y)) || (a.y === p.y && p.y === b.y && (a.x < p.x) === (p.x < b.x))); });
    if (tidy.length >= 3) loops.push(tidy);
  }
  return loops;
}

/**
 * A loop with the in-between points the board places it by: `per` to a square of edge. Along a
 * grid line they stand at whole `per`-ths of a square, where a single piece's edge has them, so a
 * run that starts part-way along a square is still sampled where its squares were.
 */
export function stepped(loop, per = 8) {
  const out = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    out.push(a);
    if (a.y === b.y || a.x === b.x) {
      const along = a.y === b.y ? 'x' : 'y', from = a[along], to = b[along], up = to > from;
      for (let k = up ? Math.floor(from * per + 1e-9) + 1 : Math.ceil(from * per - 1e-9) - 1; up ? k / per < to - 1e-9 : k / per > to + 1e-9; k += up ? 1 : -1) out.push(along === 'x' ? { x: k / per, y: a.y } : { x: a.x, y: k / per });
    } else {
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * per));
      for (let k = 1; k < steps; k++) out.push({ x: a.x + (b.x - a.x) * k / steps, y: a.y + (b.y - a.y) * k / steps });
    }
  }
  return out;
}

/** The points one piece is placed by: `per` to a square along each edge, each put on the screen by `place`. */
export function placedPoints(polygon, place, per = 8) {
  const points = [];
  polygon.forEach((p, i) => { const end = polygon[(i + 1) % polygon.length], steps = Math.max(1, Math.ceil(Math.hypot(end.x - p.x, end.y - p.y) * per)); for (let k = 0; k < steps; k++) points.push(place(p.x + (end.x - p.x) * k / steps, p.y + (end.y - p.y) * k / steps)); });
  return points;
}

/**
 * Which pieces may share the outline, and which must be drawn by themselves.
 *
 * The board is drawn at a slant, and on a cliff face the slant folds the ground over: a piece
 * there lands on the screen turned the other way, on top of its neighbours. Every piece used to be
 * drawn by itself, turned so that its area on the screen counted as lit; pieces lying over one
 * another then both counted. A folded piece in the outline would instead be taken away from the
 * ground it lies over, and leave lit ground dark (found by the tester on Dead Root: a quarter of a
 * square by the rope bridge).
 *
 * So a piece joins the outline only when it goes the same way round on the screen as on the grid,
 * judged on all the points it is placed by, the very test that used to turn it. Any other piece is
 * handed back as its own screen points, turned the way it always was.
 */
export function sortPieces(pieces, place, per = 8) {
  const whole = [], alone = [];
  for (const piece of pieces) {
    const here = twiceArea(piece), points = placedPoints(piece, place, per), drawn = twiceArea(points);
    if ((here > 0 && drawn > 0) || (here < 0 && drawn < 0)) whole.push(piece);
    else { if (drawn < 0) points.reverse(); alone.push(points); }
  }
  return { whole, alone };
}

/** How many times rings wind round a point: the test that two sets of rings cover the same ground. */
export function windingAt(rings, p) {
  let total = 0;
  for (const ring of rings) for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; if ((a.y > p.y) !== (b.y > p.y) && p.x < a.x + (b.x - a.x) * (p.y - a.y) / (b.y - a.y)) total += b.y > a.y ? 1 : -1; }
  return total;
}
