// Heights along a previewed walk. The ruler used to ask "how high is the ground at this square?"
// one square at a time, which cannot know that a walker who steps onto a bridge stays on it: the
// preview dropped to the canal bed under the bridge and climbed out at the far bank. This walks a
// ghost of the token along the route and steps onto decks, bridges and cubes by the same contact
// rule the move itself uses (floor-support.js, paired with FloorSupport.php).
//
// The same went for ramps. A walker who comes down a ramp between two upper floors arrives on the
// floor at its foot; asked square by square, the ruler thought that last step went to the ground
// far below and priced it as a long drop. So the ghost also uses stairs and ramps by the rule the
// move uses (stair-walk.mjs, paired with FloorGeometry.php): it is carried along a ramp and is on
// the other floor once it walks off the far end.
import { walkFloorContact, cubeStepDown } from './floor-support.js';
import { stairStep, nearStair } from './stair-walk.mjs';

/** True when the scene has any stair or ramp to follow. */
export const hasStairs = (mapLevels) => !!(mapLevels?.baseStairs?.length || mapLevels?.levels?.some((level) => level?.stairs?.length));

/**
 * One step of the ghost onto the next square. Returns the ghost as it stands there and the height
 * it stands at: a plate's height when the contact rule puts it on one, the plain height otherwise.
 *
 * `standing` is (placement) => the height a token stands at, given its floor and its progress on
 * a stair. When it is given, the ghost follows stairs and ramps too; `_viaStair` then marks a
 * ghost whose floor or footing has come from a stair, so its height is asked of `standing`.
 */
export function stepGhost({ ghost, column, row, actor, surfaces = [], mapLevels = null, terrain = () => 0, plainHeight = () => 0, standing = null }) {
  if (standing && (ghost._floorTraversal || nearStair(ghost, { column, row }, mapLevels))) {
    const stair = stairStep(ghost, { column, row }, mapLevels);
    if (stair?.fired) {
      // Off the far end: on the other floor now.
      const landed = { ...ghost, column, row, levelId: stair.levelId, _floorTraversal: null, _supportSurfaceId: null, _viaStair: true };
      return { ghost: landed, height: standing(landed) };
    }
    if (stair) {
      const on = { ...ghost, column, row, _floorTraversal: stair.traversal, _viaStair: true };
      return { ghost: on, height: standing(on) };
    }
    if (ghost._floorTraversal) {
      // Stepped off the side of a stair: no plate is acquired on such a step, as in the move itself.
      const off = { ...ghost, column, row, _floorTraversal: null, _supportSurfaceId: null, _viaStair: true };
      return { ghost: off, height: standing(off) };
    }
  }
  const to = { ...ghost, column, row };
  const surface = walkFloorContact(ghost, to, [], surfaces, mapLevels, terrain) || cubeStepDown(ghost, to, surfaces, mapLevels);
  if (surface) return { ghost: { ...to, levelId: surface.levelId, _supportSurfaceId: surface.id }, height: surface.height };
  const off = { ...to, _supportSurfaceId: null };
  return { ghost: off, height: standing && ghost._viaStair ? standing(off) : plainHeight(column, row, { ...actor, _supportSurfaceId: null }) };
}

/**
 * Whether the preview should walk this token: a grounded token on a scene that has floor plates,
 * or (`stairs`) one whose stairs and ramps the preview follows. A token part-way along a stair is
 * walked only in the second case.
 */
export const walksPlates = (actor, surfaces, stairs = false) => !!actor && (!actor.movementMode || actor.movementMode === 'ground')
  && (stairs || (!actor._floorTraversal && (surfaces?.length ?? 0) > 0));

/**
 * @param actor       the token being moved (null for a plain measurement)
 * @param surfaces    the scene's floor plates, with points resolved
 * @param mapLevels   the scene's floors
 * @param terrain     (placement) => ground height under the placement's centre
 * @param plainHeight (column, row, actor) => the height the ruler used before: ground, ramps, or a
 *                    plate the actor is already standing on
 * @param carried     the ghost left by the previous leg of the same route, when this leg starts
 *                    where that one ended
 * @param standing    (placement) => the height a token stands at, given its floor and stair
 *                    progress. Pass it on scenes with ramps, so the walk follows them.
 * Call `height(column, row)` for each square of the leg in order, starting with its first square.
 */
export function createRouteWalker({ actor = null, surfaces = [], mapLevels = null, terrain = () => 0, plainHeight = () => 0, carried = null, standing = null } = {}) {
  const follow = standing && hasStairs(mapLevels) ? standing : null;
  const walks = walksPlates(actor, surfaces, !!follow);
  const heightOf = (id) => surfaces.find((surface) => surface.id === id)?.height;
  let ghost = null;
  return {
    height(column, row) {
      if (!walks) return plainHeight(column, row, actor);
      if (!ghost) {
        // First square of the leg: where the token stands, or where the last leg left its ghost.
        ghost = carried && carried.column === column && carried.row === row ? carried : { ...actor, column, row };
        if (follow && ghost === carried && ghost._viaStair) return follow(ghost);
        const held = ghost === carried && ghost._supportSurfaceId ? heightOf(ghost._supportSurfaceId) : undefined;
        return Number.isFinite(held) ? held : plainHeight(column, row, ghost === carried ? { ...actor, _supportSurfaceId: ghost._supportSurfaceId ?? null } : actor);
      }
      const stepped = stepGhost({ ghost, column, row, actor, surfaces, mapLevels, terrain, plainHeight, standing: follow });
      ghost = stepped.ghost;
      return stepped.height;
    },
    /** Where the ghost stands now; hand it to the next leg as `carried`. */
    get ghost() { return ghost; },
  };
}
