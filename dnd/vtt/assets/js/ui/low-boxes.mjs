// Low objects that fill a square: a crate, a rim rock. Brandon, October 10, 2026: "We can treat full square
// boxes like railings. A full square box ... can be like one square up. You can still see over it ... it can be
// broken, and if you try to go over it, it gives you a one climb thing. But if you get like pushed, it can block
// your push."
//
// The map says nothing new for this. A box is worked out from the walls: a closed rectangle of four plain wall
// pieces, all with the same fixed base and the same height, one square high or less (the "rings" the map
// packages already use for an object on a square). Its walls then count as low barriers, so a walk into it is
// asked the climb question like a rail (wall-properties.mjs); and it gets a top to stand on, at base plus
// height, as a small floor plate on the floor the box stands on. A ring that is taller, broken, not closed or of
// mixed heights is no box, and everything about it is as before. A ring whose walls are all set `climbable`
// (wall-properties.mjs) is a box whatever its height. Paired with WallBoxes.php.

/** The tallest a box may be, in squares. The same number as LOW_BARRIER in wall-properties.mjs. */
export const BOX_HEIGHT = 1.5;
/** What a box top's id starts with. */
export const BOX_TOP = 'box-top:';

/** What a labelled object's walls' ids start with (MapLabels.php). */
export const OBJECT_WALL = 'obj:';
/** An object's outline as a ring without a repeated last point (MapLabels::ring). */
export const objectRing = (points) => { const ring = [...(points || [])]; if (ring.length > 3) { const a = ring[0], z = ring[ring.length - 1]; if (Math.abs(a.x - z.x) < 1e-9 && Math.abs(a.y - z.y) < 1e-9) ring.pop(); } return ring; };
const place = (x, y) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;
const inside = (p, ring) => { let hit = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) hit = !hit; } return hit; };

/**
 * The boxes of a walls model: [{ id, left, right, top, bottom, base, height, edges }], where `height` is the
 * height of the box's top and `edges` are the ids of its four wall pieces.
 */
export function lowBoxes(model) {
  if (model?.labels === 1) return labelledBoxes(model);
  const nodes = new Map((model?.nodes || []).map((n) => [n.id, n])), sides = new Map(), tops = [];
  for (const edge of model?.segments || []) {
    if ((edge.interaction ?? 'none') !== 'none' || (edge.movement ?? 'block') !== 'block' || edge.broken === true || (edge.movementDirection ?? 'both') !== 'both') continue;
    const tall = Number(edge.height), base = Number(edge.base);
    if ((edge.baseMode ?? 'terrain') !== 'fixed' || !Number.isFinite(base) || !(tall > 0) || (tall > BOX_HEIGHT + 1e-6 && edge.climbable !== true) || String(edge.id).startsWith('template-cube:')) continue;
    const a = nodes.get(edge.a), b = nodes.get(edge.b);
    if (!a || !b) continue;
    const flat = Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.x - b.x) > 1e-6, upright = Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) > 1e-6;
    if (!flat && !upright) continue;
    const size = `${Math.round(base * 1e4)}|${Math.round(tall * 1e4)}${edge.climbable === true ? '|c' : ''}`, first = flat ? (a.x < b.x ? a : b) : (a.y < b.y ? a : b), last = first === a ? b : a;
    const side = { edge, first, last, flat, size, base, tall };
    sides.set(`${place(first.x, first.y)}>${place(last.x, last.y)}|${size}`, side);
    if (flat) tops.push(side);
  }
  const span = (x0, y0, x1, y1, size) => sides.get(`${place(x0, y0)}>${place(x1, y1)}|${size}`);
  const boxes = [], used = new Set();
  for (const north of tops) {
    if (used.has(north.edge.id)) continue;
    const x0 = north.first.x, x1 = north.last.x, y0 = north.first.y;
    // Its west side runs down from the same corner; the other two sides must close the rectangle.
    for (const west of sides.values()) {
      if (west.flat || west.size !== north.size || Math.abs(west.first.x - x0) > 1e-6 || Math.abs(west.first.y - y0) > 1e-6 || used.has(west.edge.id)) continue;
      const y1 = west.last.y, east = span(x1, y0, x1, y1, north.size), south = span(x0, y1, x1, y1, north.size);
      if (!east || !south || used.has(east.edge.id) || used.has(south.edge.id)) continue;
      const edges = [north, east, south, west].map((side) => side.edge.id);
      edges.forEach((id) => used.add(id));
      boxes.push({ id: BOX_TOP + [...edges].sort()[0], left: x0, right: x1, top: y0, bottom: y1, base: north.base, height: north.base + north.tall, edges, ...(north.edge.climbable === true ? { climbable: true } : {}) });
      break;
    }
  }
  return boxes;
}

/**
 * A labelled map's boxes (MapLabels.php): every object marked standOn whose walls all stand, at its own outline.
 * Nothing is guessed from walls. Paired with WallBoxes::labelledBoxes.
 */
function labelledBoxes(model) {
  const walls = new Map();
  for (const edge of model.segments || []) if (typeof edge.object === 'string' && String(edge.id).startsWith(OBJECT_WALL)) walls.set(edge.object, [...(walls.get(edge.object) || []), edge]);
  const boxes = [];
  for (const object of model.objects || []) {
    const edges = walls.get(object.id) || [], ring = objectRing(object.points);
    if (object.standOn !== true || edges.length !== ring.length || edges.some((edge) => edge.broken === true)) continue;
    const points = ring.map((p) => ({ x: Number(p.x), y: Number(p.y) })), xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    boxes.push({ id: BOX_TOP + OBJECT_WALL + object.id, left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys), base: Number(edges[0].base), height: Number(object.top),
      edges: edges.map((edge) => edge.id), points, object: object.id, levelId: object.levelId ?? null, ...(object.climbable === true ? { climbable: true } : {}) });
  }
  return boxes;
}

/**
 * The same model with its boxes worked in: each box's four walls marked `boxWall`, and a floor plate marked
 * `boxTop` at its top, on the floor the box stands on (the floor plate under its middle at its base, else
 * the ground). The model itself when it has no box.
 */
export function withLowBoxes(model) {
  const boxes = lowBoxes(model);
  if (!boxes.length) return model;
  const walls = new Set(boxes.flatMap((box) => box.edges));
  const floors = (model.roofs || []).filter((roof) => roof.kind === 'floor' && !roof.boxTop && roof.points?.length > 2);
  const levelOf = (box) => {
    if (box.levelId) return box.levelId;
    const middle = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
    return floors.find((roof) => Math.abs(Number(roof.height) - box.base) <= 0.13 && inside(middle, roof.points) && !(roof.holes || []).some((hole) => inside(middle, hole)))?.levelId || 'level-0';
  };
  return {
    ...model,
    segments: model.segments.map((edge) => (walls.has(edge.id) ? { ...edge, boxWall: true } : edge)),
    roofs: [...(model.roofs || []), ...boxes.map((box) => ({ id: box.id, kind: 'floor', boxTop: true, ...(box.climbable ? { climbable: true } : {}), levelId: levelOf(box), base: box.base, height: box.height,
      points: box.points ?? [{ x: box.left, y: box.top }, { x: box.right, y: box.top }, { x: box.right, y: box.bottom }, { x: box.left, y: box.bottom }], holes: [], ...(box.object ? { object: box.object } : {}) }))],
  };
}
