// Breakable map art (Brandon, November 8, 2026, plan part 4: "Breaking a square hides the intact piece and shows its
// rubble. Everything else stays."; asked for on Thornbriar November 10, 2026).
//
// A map's 3D art may come with a pieces file (assets/scenes/index.json "pieces"). It names each breakable thing as the
// map's labels do: a labelled object's id, else the group name its walls share, else a wall's own id. For each it gives
// index ranges [start, count] into the art's meshes (a mesh is named by its material):
//   hide    the thing's own triangles, drawn until it breaks;
//   rubble  the heap built for it, drawn once it has broken.
// The art stays the few merged meshes it was (no mesh per piece, so nothing more to draw while nothing is broken):
// a range is taken out by pointing its triangles at one vertex, which draws nothing, casts no shadow and is never
// picked, and put back from a kept copy. Which things are broken is read from the walls the map plays with, so a
// push, a fall, the Director's Broken box, Repair and Undo all show without anything here knowing about them.
// No three.js here: only index arrays, so the rules below are tested without a page.

const OBJECT_WALL = /^obj:(.+):\d+$/;

/** The names a wall's piece may go by, most exact first: its object, its group, itself. */
export function pieceKeysOf(edge) {
  const keys = [], made = OBJECT_WALL.exec(String(edge?.id ?? ''));
  if (typeof edge?.object === 'string' && edge.object) keys.push(edge.object);
  else if (made) keys.push(made[1]);
  if (typeof edge?.group === 'string' && edge.group) keys.push(edge.group);
  if (edge?.id !== undefined) keys.push(String(edge.id));
  return keys;
}

/** The pieces of this art that are broken on the map: one for each broken wall that has a piece. */
export function brokenPieces(model, pieces) {
  const out = new Set();
  for (const edge of model?.segments ?? []) {
    if (edge?.broken !== true) continue;
    const key = pieceKeysOf(edge).find((name) => Object.hasOwn(pieces ?? {}, name));
    if (key) out.add(key);
  }
  return out;
}

/** Breakable things on the map with no piece in the art, and pieces no breakable thing uses: for the load check. */
export function pieceMismatch(model, pieces) {
  const used = new Set(), missing = new Set();
  for (const edge of model?.segments ?? []) {
    if (typeof edge?.material !== 'string') continue;
    const key = pieceKeysOf(edge).find((name) => Object.hasOwn(pieces ?? {}, name));
    if (key) used.add(key); else missing.add(pieceKeysOf(edge)[0]);
  }
  return { missing: [...missing], unused: Object.keys(pieces ?? {}).filter((key) => !used.has(key)) };
}

/**
 * Ties a pieces file to the art's meshes. `meshes`: name -> { index: { array, count, needsUpdate } } (a three.js
 * BufferGeometry index is that shape). Returns { apply(brokenSet), sync(model), broken, problems }: apply redraws
 * the art for that set of broken pieces and says whether anything changed; sync reads the set from a walls design.
 */
export function attachPieces(meshes, file) {
  const pieces = file?.pieces ?? {}, problems = [], byMesh = new Map();
  for (const [key, piece] of Object.entries(pieces)) for (const part of ['hide', 'rubble']) for (const [name, ranges] of Object.entries(piece?.[part] ?? {})) {
    const index = meshes.get(name)?.index;
    if (!index?.array) { problems.push(`${key}: the art has no mesh "${name}"`); continue; }
    for (const range of ranges ?? []) {
      const [start, count] = range ?? [];
      if (!Number.isInteger(start) || !Number.isInteger(count) || start < 0 || count < 1 || start % 3 || count % 3 || start + count > index.count) { problems.push(`${key}: a range of "${name}" is outside the mesh`); continue; }
      let entry = byMesh.get(name);
      if (!entry) byMesh.set(name, entry = { index, original: index.array.slice(), ranges: [] });
      entry.ranges.push({ key, part, start, count });
    }
  }
  let shown = null;
  const api = {
    pieces, problems,
    get broken() { return new Set(shown === null ? [] : shown.split('\n').filter(Boolean)); },
    apply(broken = new Set()) {
      const signature = [...broken].filter((key) => Object.hasOwn(pieces, key)).sort().join('\n');
      if (signature === shown) return false;
      shown = signature;
      for (const { index, original, ranges } of byMesh.values()) {
        index.array.set(original);
        for (const { key, part, start, count } of ranges) if ((part === 'hide') === broken.has(key)) index.array.fill(0, start, start + count);
        index.needsUpdate = true;
      }
      return true;
    },
    sync(model) { return api.apply(brokenPieces(model, pieces)); },
  };
  api.apply(new Set());
  return api;
}
