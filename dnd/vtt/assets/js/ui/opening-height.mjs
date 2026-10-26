import {floorElevations, BASE_FLOOR_ID} from '../state/normalize/floor-elevation.js';

// The height the Director's page opens a scene at (gm-vision.js), when he has not stepped to one himself on this
// scene and no token is selected (a selected token's own height wins: gm-vision currentHeight).
//
// It used to be the height of the floor his page is on, and that is the ground (level-0) unless he has chosen
// another, so every map opened at Height 0. On Medpilis the ground under the castle is the basement (chapel, cellar,
// steam works at 0); the hall and ballroom floors at 3 are plates over it, and the 3D board hides floors above the
// height drawn, so the castle opened with its main floor gone and a drop on the hall landed in the chapel (the Map
// maker, October 25, 2026). Setting the scene's activeLevelId changed nothing: no one read it for the Director.
//
// Now, in order: the floor his page is on when it is a raised one; else the scene's own activeLevelId when it names a
// raised floor (a map package can set it); else, on a scene with raised floors, the most-used height of its ground
// (whole squares, never below 0): the yard and ground floors of a castle, not a basement under them. A scene with no
// raised floors opens at its floor's height, as before.
export function openingHeight({mapLevels = null, levelId = BASE_FLOOR_ID, terrain = null} = {}) {
  const heights = floorElevations(mapLevels || {});
  const levels = (mapLevels?.levels || []).filter(level => level?.id && level.id !== BASE_FLOOR_ID);
  const raised = id => typeof id === 'string' && id !== BASE_FLOOR_ID && heights.has(id) && !levels.find(level => level.id === id)?.hidden;
  if (raised(levelId)) return heights.get(levelId);
  if (raised(mapLevels?.activeLevelId)) return heights.get(mapLevels.activeLevelId);
  if (!levels.length) return heights.get(levelId) ?? 0;
  return mainGroundHeight(terrain) ?? 0;
}

/** The commonest whole-square height of a terrain height field ({h: [...]}); a tie goes to the higher. Null when
 * there is none. Never below 0. */
export function mainGroundHeight(terrain) {
  const h = terrain?.h;
  if (!h || !(h.length > 0)) return null;
  const counts = new Map();
  for (let i = 0; i < h.length; i++) {
    const v = Number(h[i]);
    if (!Number.isFinite(v)) continue;
    const k = Math.round(v);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let best = null, most = -1;
  for (const [k, n] of counts) if (n > most || (n === most && k > best)) { best = k; most = n; }
  return best === null ? null : Math.max(0, best);
}
