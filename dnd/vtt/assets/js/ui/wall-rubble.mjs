// Rubble over broken walls: what to draw, where, how big and which picture.
// Pure, so the board's drawing (wall-rubble-overlay.js) and the tests share one rule.
//
// A broken wall keeps its place in the scene. The map picture still shows the wall, so a strip of
// rubble is laid over it: a picture file when one exists for that kind, a drawn stand-in when not.
// Which version a wall piece gets comes from its id, so it is the same on every redraw and on
// every player's screen.
import { isBroken, properties } from './wall-properties.mjs';

export const RUBBLE_KINDS = ['stone', 'wood', 'glass', 'metal', 'door', 'window', 'heap'];
/** A picture's long side covers the wall piece plus this much, so neighbouring pieces join. */
export const RUBBLE_OVERLAP = 1.12;
/** Pictures are three long by two high. */
export const RUBBLE_ASPECT = 2 / 3;
/** How far across the wall the rubble may spread, in squares: wide enough to hide a painted wall, never a whole square. */
export const RUBBLE_MIN_ACROSS = 0.35;
export const RUBBLE_MAX_ACROSS = 0.8;

/** Doors and windows have rubble of their own; any other wall uses its material's. */
export function rubbleKind(edge) {
  const e = properties(edge);
  if (e.interaction === 'door') return 'door';
  if (e.interaction === 'window') return 'window';
  return RUBBLE_KINDS.includes(e.material) ? e.material : 'stone';
}

/** The same text always gives the same whole number (FNV-1a). */
export function stableHash(text) {
  let hash = 2166136261;
  for (const ch of String(text)) { hash ^= ch.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

/** Which of `count` versions this id gets; -1 when there are none. */
export const pickVersion = (id, count) => (count > 0 ? stableHash(id) % count : -1);

/**
 * Sorts picture addresses into kinds by file name: ".../rubble-stone-2.png" is stone, version 2.
 * Anything not named that way is ignored. Versions are in number order.
 */
export function rubbleLibrary(urls) {
  const found = [];
  for (const url of Array.isArray(urls) ? urls : []) {
    const match = /(?:^|\/)rubble-([a-z]+)-(\d+)\.(?:png|webp)(?:\?.*)?$/i.exec(String(url));
    if (match && RUBBLE_KINDS.includes(match[1].toLowerCase())) found.push({ kind: match[1].toLowerCase(), number: Number(match[2]), url: String(url) });
  }
  found.sort((a, b) => a.number - b.number || a.url.localeCompare(b.url));
  const library = {};
  for (const { kind, url } of found) (library[kind] ||= []).push(url);
  return library;
}

/** The picture for one piece, or null when its kind has none yet (the stand-in is drawn instead). */
export function rubblePicture(library, kind, id) {
  const versions = library?.[kind] || [];
  return versions.length ? versions[pickVersion(id, versions.length)] : null;
}

/** Long and short side of one piece's rubble, in squares. */
export function rubbleSize(length) {
  const along = length * RUBBLE_OVERLAP;
  return { along, across: Math.max(RUBBLE_MIN_ACROSS, Math.min(RUBBLE_MAX_ACROSS, along * RUBBLE_ASPECT)) };
}

/**
 * One entry per square's worth of broken wall. A wall piece longer than a square and a half is
 * covered by several pictures end to end, so no picture is stretched.
 * Each entry: {id, edge, kind, a, b} with a and b in grid squares.
 */
export function rubblePieces(model) {
  const pieces = [];
  if (!model?.segments?.some(isBroken)) return pieces;
  const nodes = new Map((model.nodes || []).map((node) => [node.id, node]));
  for (const edge of model.segments) {
    if (!isBroken(edge)) continue;
    const a = nodes.get(edge.a), b = nodes.get(edge.b);
    if (!a || !b) continue;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(length > 1e-6)) continue;
    const parts = Math.max(1, Math.round(length)), kind = rubbleKind(edge);
    for (let i = 0; i < parts; i++) {
      const at = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      pieces.push({ id: parts > 1 ? `${edge.id}#${i}` : edge.id, edge, kind, a: at(i / parts), b: at((i + 1) / parts) });
    }
  }
  return pieces;
}

// ---- The stand-in --------------------------------------------------------
// Drawn until a picture file exists for the kind. Shapes are in a unit box: x from -0.5 to 0.5
// along the wall, y from -0.5 to 0.5 across it. A solid band down the middle hides the painted
// wall; loose bits thin out toward the sides; the band reaches both ends so pieces join.
const PALETTES = {
  stone: { band: '#5b5247', bits: ['#8d8880', '#a39d92', '#6f6a62', '#7d735f'], line: '#2e2a25' },
  wood: { band: '#4a3423', bits: ['#8a6238', '#a67a47', '#6e4b2a', '#b08a5a'], line: '#2a1c11' },
  glass: { band: '#4f5a60', bits: ['#bfe6f2', '#d9f3fa', '#9fd0e0', '#eefbff'], line: '#3d5560' },
  metal: { band: '#3f444b', bits: ['#8e9aa8', '#a9b4c0', '#6f7a87', '#59616b'], line: '#23272c' },
};
PALETTES.door = PALETTES.wood;
PALETTES.window = { ...PALETTES.glass, band: PALETTES.wood.band };
PALETTES.heap = PALETTES.stone;
// How long and thin the bits are: splinters for wood, shards for glass, lumps for stone.
const STRETCH = { stone: 1.25, heap: 1.25, wood: 3.2, door: 3.2, glass: 2.2, window: 2.2, metal: 1.8 };

function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const fixed = (value) => (Math.round(value * 1000) / 1000).toString();

/**
 * The drawn rubble for one piece: {band, bits:[{d, fill}], line}. Path data is in the unit box.
 * The same id always gives the same drawing.
 */
export function standInRubble(kind, id) {
  const palette = PALETTES[kind] || PALETTES.stone, stretch = STRETCH[kind] || 1.25;
  const random = generator(stableHash(`${kind}:${id}`));
  // The band: an uneven strip from end to end, about a third of the picture high in the middle.
  const top = [], bottom = [], steps = 8;
  for (let i = 0; i <= steps; i++) {
    const x = -0.5 + i / steps;
    top.push(`${fixed(x)},${fixed(-0.13 - random() * 0.08)}`);
    bottom.unshift(`${fixed(x)},${fixed(0.13 + random() * 0.08)}`);
  }
  const band = `M${top.join(' L')} L${bottom.join(' L')} Z`;
  const bits = [];
  for (let i = 0; i < 26; i++) {
    const x = -0.5 + random();
    // Two rolls added together cluster the bits on the middle line and thin them toward the sides.
    const y = (random() + random() - 1) * 0.42;
    const near = 1 - Math.min(1, Math.abs(y) / 0.42);
    const radius = 0.035 + near * 0.05 + random() * 0.02;
    const turn = random() * Math.PI, corners = 5 + Math.floor(random() * 3), points = [];
    for (let k = 0; k < corners; k++) {
      const angle = (k / corners) * Math.PI * 2, reach = radius * (0.65 + random() * 0.5);
      // Long thin bits lie at any angle; the box is three long by two high, so across is scaled up to stay in proportion.
      const px = Math.cos(angle) * reach * stretch, py = Math.sin(angle) * reach;
      const rx = px * Math.cos(turn) - py * Math.sin(turn), ry = (px * Math.sin(turn) + py * Math.cos(turn)) * 1.5;
      points.push(`${fixed(Math.max(-0.5, Math.min(0.5, x + rx / stretch)))},${fixed(Math.max(-0.48, Math.min(0.48, y + ry / stretch)))}`);
    }
    bits.push({ d: `M${points.join(' L')} Z`, fill: palette.bits[Math.floor(random() * palette.bits.length)] });
  }
  return { band, bandFill: palette.band, bits, line: palette.line };
}

// ---- Which layer ---------------------------------------------------------
/** True when the point lies inside the ring of {x, y} points. */
export function insideRing(point, ring) {
  let inside = false;
  for (let i = 0, j = (ring?.length || 0) - 1; i < (ring?.length || 0); j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * The floor plate a piece of rubble lies on, if any: a plate at the wall's foot (within half a
 * square in height) that covers the middle of the piece. Rubble on a plate has to be drawn above
 * the plate's own picture; rubble on bare ground is drawn straight on the map.
 * `surfaces` are the scene's plates with their points resolved; `base` is the height of the wall's foot.
 */
export function plateUnder(piece, base, surfaces) {
  const middle = { x: (piece.a.x + piece.b.x) / 2, y: (piece.a.y + piece.b.y) / 2 };
  let best = null;
  for (const surface of surfaces || []) {
    if (surface?.kind !== 'floor' || !(surface.points?.length > 2)) continue;
    const gap = Math.abs(Number(surface.height) - base);
    if (!(gap <= 0.5) || !insideRing(middle, surface.points)) continue;
    if ((surface.holes || []).some((hole) => insideRing(middle, hole))) continue;
    if (!best || gap < best.gap) best = { surface, gap };
  }
  return best?.surface || null;
}
