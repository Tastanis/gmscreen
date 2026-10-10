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

/** How many times rings wind round a point: the test that two sets of rings cover the same ground. */
export function windingAt(rings, p) {
  let total = 0;
  for (const ring of rings) for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; if ((a.y > p.y) !== (b.y > p.y) && p.x < a.x + (b.x - a.x) * (p.y - a.y) / (b.y - a.y)) total += b.y > a.y ? 1 : -1; }
  return total;
}
