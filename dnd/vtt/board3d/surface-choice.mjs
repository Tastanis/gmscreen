// Which surface under the pointer a dragged walker is put down on. Pure: no board, no page.
//
// The board used to take the first surface the pointer's ray met. Under an overhang that is the floor above: with
// every floor shown, pointing at the hall's south aisle on Medpilis picked the gallery over it (height 6), so a hero
// walking in from the yard was told "Can't walk there". And a floor the Height control hides is not met at all, so
// a drop over the hall with the hall floor hidden went to the chapel under it (the Map maker, October 25, 2026).
//
// `hits` are the surfaces on the ray, nearest first (scene-view pickAll); `hidden` marks a floor the Height control
// hides. `reaches(hit)` says whether the walker's own walk ends on that surface: true, false, or null when it cannot
// say. `level` is the height the walker stands at. The first surface shown is kept when the walk reaches it or cannot
// say (as before). Otherwise the first surface along the ray that the walk reaches and that is at or near his own
// level (NEAR_LEVEL) is taken, shown or hidden: the floor he walks on under the overhang, never a drop to a floor far
// below him that he did not point at. When there is none, the first shown stands, and the board says why it cannot go
// there, as it did. A floor that is hidden is never taken unless reached.
export const NEAR_LEVEL = 1.5;
export function chooseSurface(hits, { reaches = null, level = null } = {}) {
  const list = Array.isArray(hits) ? hits.filter(Boolean) : [];
  const top = list.find((hit) => !hit.hidden) ?? null;
  if (typeof reaches !== 'function' || !list.length) return top;
  if (top && reaches(top) !== false) return top;
  const near = (hit) => !Number.isFinite(level) || !Number.isFinite(hit.z) || Math.abs(hit.z - level) <= NEAR_LEVEL + 1e-6;
  for (const hit of list) if (hit !== top && near(hit) && reaches(hit) === true) return hit;
  return top;
}
