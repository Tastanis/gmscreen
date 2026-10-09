// The height a creature is at along one straight move. Pure: no board, no page.
// Paired with TravelPath on the server (lib/TravelPath.php).
//
// While a mover has footing it is at the height of that footing: the ground, a plate, a ramp.
// When the footing drops away under it faster than a slope could (it has gone over a plate's edge,
// off the side of a ramp, off a cliff) it has left its footing, and from there it travels on level,
// at the height it left from. It falls when the move ends, not during it. So a wall or a creature
// on the ground far below is not in its way; only what reaches its own height is. It has footing
// again only where the ground comes back up to it.
//
// A pushed creature leaves its footing at any drop steeper than a slope. A walker steps down
// anything less than a fall and only leaves its footing at a real one.
//
// Before this, a mover was measured at the height of the ground under it at every point. A push
// off an island 18 squares up was "at ground level" the moment it cleared the edge, and a crystal
// on the crater floor under its path stopped it.

/** A ramp or a fall of ground steeper than this many squares per square is not a slope. */
export const CLIMB_GRADE = 1.5;
/** Slack for nearly flush plates and uneven ground when deciding a mover has left its footing. */
export const TRAVEL_SLACK = 0.05;
/** A walker leaves its footing only by a drop this deep; anything less is a step down. */
export const FALL_DROP = 1.5;
/** Ground that stands this much above a mover in the air stops it. */
export const SLAM_RISE = 1;
/** The path is read this often, in squares. */
export const TRAVEL_STEP = 0.125;

const flying = (mover) => ['fly', 'hover'].includes(mover?.movementMode);

/**
 * What a step of `run` squares does to a mover at height `z`, when the footing at the end of it
 * is at `here`. Returns [height, in the air].
 */
export function travelStep(z, air, here, run, kind = 'forced') {
  if (air) return here >= z - TRAVEL_SLACK ? [here, false] : [z, true];
  let allow = CLIMB_GRADE * run + TRAVEL_SLACK;
  if (kind !== 'forced') allow = Math.max(allow, FALL_DROP - 1e-6);
  return z - here > allow ? [z, true] : [here, false];
}

/**
 * One mover's path from one place. `footingAt(placement)` is the height of the footing under the
 * mover at that place. It remembers the path it has walked, so asking about many points along the
 * same line (as a push that is looking for where it stops does) reads each stretch of ground once.
 *
 * heightAt(at, here): the height the mover is at when it has got as far as `at`. `here` is the
 *   footing at `at` when the caller has its own reading of it (one that steps onto a plate on the
 *   way, say); otherwise footingAt is asked. A flier is wherever its own flight puts it.
 * slams(to): true when the mover, having left its footing, meets ground standing higher than
 *   itself on the way to `to`: pushed off a low island straight at a cliff, it hits the cliff.
 *   Ground that only rises part of the way up to it (a boulder under an island) is passed over.
 */
export function travelPath(from, footingAt, { kind = 'forced', start = footingAt(from) } = {}) {
  let ray = null, walked = [];
  const placed = (at) => ({ ...from, column: at.column, row: at.row });
  const aim = (at) => {
    const dx = at.column - from.column, dy = at.row - from.row, run = Math.max(Math.abs(dx), Math.abs(dy));
    if (run < 1e-9) return 0;
    const next = [dx / run, dy / run];
    if (!ray || Math.abs(next[0] - ray[0]) > 1e-7 || Math.abs(next[1] - ray[1]) > 1e-7) { ray = next; walked = [[start, false, false]]; }
    return run;
  };
  // The last remembered point that lies short of `run`.
  const before = (run) => { const k = Math.floor(run / TRAVEL_STEP + 1e-9); return run - k * TRAVEL_STEP < 1e-9 ? k - 1 : k; };
  const walk = (k) => {
    for (let i = walked.length; i <= k; i++) {
      const s = i * TRAVEL_STEP, [z, air] = walked[i - 1];
      const here = footingAt({ ...from, column: from.column + ray[0] * s, row: from.row + ray[1] * s });
      walked[i] = [...travelStep(z, air, here, TRAVEL_STEP, kind), air && here >= z + SLAM_RISE - 1e-6];
    }
    return walked[k];
  };
  return {
    heightAt(at, here = footingAt(placed(at))) {
      if (flying(from)) return here;
      const run = aim(at);
      if (run < 1e-9) return here;
      const k = before(run), [z, air] = walk(k);
      return travelStep(z, air, here, run - k * TRAVEL_STEP, kind)[0];
    },
    slams(to) {
      if (flying(from)) return false;
      const run = aim(to);
      if (run < 1e-9) return false;
      const k = before(run), [z, air] = walk(k);
      for (let i = 1; i <= k; i++) if (walked[i][2]) return true;
      return air && footingAt(placed(to)) >= z + SLAM_RISE - 1e-6;
    },
  };
}
