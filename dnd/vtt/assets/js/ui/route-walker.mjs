// Heights along a previewed walk. The ruler used to ask "how high is the ground at this square?"
// one square at a time, which cannot know that a walker who steps onto a bridge stays on it: the
// preview dropped to the canal bed under the bridge and climbed out at the far bank. This walks a
// ghost of the token along the route and steps onto decks, bridges and cubes by the same contact
// rule the move itself uses (floor-support.js, paired with FloorSupport.php).
import { walkFloorContact, cubeStepDown } from './floor-support.js';

/**
 * @param actor       the token being moved (null for a plain measurement)
 * @param surfaces    the scene's floor plates, with points resolved
 * @param mapLevels   the scene's floors
 * @param terrain     (placement) => ground height under the placement's centre
 * @param plainHeight (column, row, actor) => the height the ruler used before: ground, ramps, or a
 *                    plate the actor is already standing on
 * @param carried     the ghost left by the previous leg of the same route, when this leg starts
 *                    where that one ended
 * Call `height(column, row)` for each square of the leg in order, starting with its first square.
 */
export function createRouteWalker({ actor = null, surfaces = [], mapLevels = null, terrain = () => 0, plainHeight = () => 0, carried = null } = {}) {
  const walks = !!actor && (!actor.movementMode || actor.movementMode === 'ground') && !actor._floorTraversal && surfaces.length > 0;
  const heightOf = (id) => surfaces.find((surface) => surface.id === id)?.height;
  let ghost = null;
  return {
    height(column, row) {
      if (!walks) return plainHeight(column, row, actor);
      if (!ghost) {
        // First square of the leg: where the token stands, or where the last leg left its ghost.
        ghost = carried && carried.column === column && carried.row === row ? carried : { ...actor, column, row };
        const held = ghost === carried && ghost._supportSurfaceId ? heightOf(ghost._supportSurfaceId) : undefined;
        return Number.isFinite(held) ? held : plainHeight(column, row, ghost === carried ? { ...actor, _supportSurfaceId: ghost._supportSurfaceId ?? null } : actor);
      }
      const to = { ...ghost, column, row };
      const surface = walkFloorContact(ghost, to, [], surfaces, mapLevels, terrain) || cubeStepDown(ghost, to, surfaces, mapLevels);
      ghost = surface ? { ...to, levelId: surface.levelId, _supportSurfaceId: surface.id } : { ...to, _supportSurfaceId: null };
      return surface ? surface.height : plainHeight(column, row, { ...actor, _supportSurfaceId: null });
    },
    /** Where the ghost stands now; hand it to the next leg as `carried`. */
    get ghost() { return ghost; },
  };
}
