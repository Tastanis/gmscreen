// The Director's Break tool (Brandon, November 10, 2026: "in the map edits tools, i need a new button ... that allows
// me to break or unbreak a square. So i can see breakable squares outlined, and i can click to break one or unbreak
// one"). Pure: what can be broken on a map, where it is, and what a click does to it. Drawn and clicked by
// wall-prototype.js, which owns the walls and saves them.
import {isBreakable,isBroken} from './wall-properties.mjs';

/**
 * The breakable things of a walls design: an object (its walls share `object` or `group`) is one thing, a wall piece
 * of its own is one thing. Each: {key, edges, broken (every piece broken), material, box {left,top,right,bottom},
 * lines [[a,b],...] in squares}. Walls with no material are never listed.
 */
export function breakableThings(model) {
  const nodes = new Map((model?.nodes || []).map((n) => [n.id, n])), things = new Map();
  for (const edge of model?.segments || []) {
    if (!isBreakable(edge)) continue;
    const a = nodes.get(edge.a), b = nodes.get(edge.b);
    if (!a || !b) continue;
    const key = typeof edge.object === 'string' ? 'object:' + edge.object : typeof edge.group === 'string' ? 'group:' + edge.group : 'wall:' + edge.id;
    const thing = things.get(key) || { key, edges: [], lines: [], material: edge.material, box: { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity } };
    thing.edges.push(edge); thing.lines.push([{ x: a.x, y: a.y }, { x: b.x, y: b.y }]);
    thing.box = { left: Math.min(thing.box.left, a.x, b.x), top: Math.min(thing.box.top, a.y, b.y), right: Math.max(thing.box.right, a.x, b.x), bottom: Math.max(thing.box.bottom, a.y, b.y) };
    things.set(key, thing);
  }
  for (const thing of things.values()) {
    thing.broken = thing.edges.every(isBroken);
    // An object closes round on itself; a lone wall piece does not.
    thing.closed = thing.key !== 'wall:' + thing.edges[0].id && thing.edges.length >= 3;
  }
  return [...things.values()];
}

function distanceToLine(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** The thing at a point (in squares): an object whose outline holds it, else the wall piece nearest it within `reach`. */
export function thingAt(things, p, reach = 0.4) {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  const inside = things.filter((t) => t.closed && p.x >= t.box.left - 0.05 && p.x <= t.box.right + 0.05 && p.y >= t.box.top - 0.05 && p.y <= t.box.bottom + 0.05);
  if (inside.length) return inside.sort((a, b) => (a.box.right - a.box.left) * (a.box.bottom - a.box.top) - (b.box.right - b.box.left) * (b.box.bottom - b.box.top))[0];
  let best = null, nearest = reach;
  for (const thing of things) for (const [a, b] of thing.lines) { const d = distanceToLine(p, a, b); if (d < nearest) { nearest = d; best = thing; } }
  return best;
}

/** A click on a thing: a standing one (or one part broken) breaks whole; a broken one is mended. Changes the model's walls in place. */
export function toggleBreak(model, thing) {
  const ids = new Set(thing.edges.map((e) => e.id)), breakIt = !thing.broken;
  for (const edge of model.segments) if (ids.has(edge.id)) { if (breakIt) edge.broken = true; else delete edge.broken; }
  return breakIt;
}
