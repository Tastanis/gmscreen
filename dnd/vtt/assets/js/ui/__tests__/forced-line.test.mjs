import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forcedLabel, slideLegs, straightLine, straightSquares } from '../forced-line.mjs';
import { resolveForcedDrag } from '../forced-drag.js';
import { routeSteps } from '../terrain-math.mjs';

// Brandon, October 10, 2026: "when I do forced movement, it seems to be calculating distance around
// things. That's not supposed to happen. It's supposed to go perfectly straight from the location it
// is to the location I am holding it. It can't go around stuff."

const at = (column, row) => ({ column, row });
const squares = (list) => list.map((p) => `${p.column},${p.row}`).join(' ');

test('a push or a pull is one straight line; a forced drag with a corner is a slide', () => {
  const origin = at(4, 4), corner = at(8, 4), held = at(8, 9);
  assert.equal(forcedLabel([origin, held]), 'Forced movement');
  assert.equal(forcedLabel([origin]), 'Forced movement');
  assert.equal(forcedLabel([origin, corner, held]), 'Slide');
  // One leg, with nothing beyond it.
  assert.deepEqual(slideLegs([origin, held]), [{ from: origin, to: held, squares: 5, beyond: 0 }]);
  // A slide's distance is its legs added up, and each leg knows what is still to come after it.
  const legs = slideLegs([origin, corner, held]);
  assert.deepEqual(legs.map((leg) => [leg.squares, leg.beyond]), [[4, 5], [5, 0]]);
  assert.equal(legs.reduce((sum, leg) => sum + leg.squares, 0), 9);
  assert.deepEqual(slideLegs([origin, corner, at(8, 6), held]).map((leg) => leg.beyond), [5, 3, 0]);
  // A corner on the square the leg starts from is no leg.
  assert.equal(slideLegs([origin, origin, held]).length, 1);
  assert.deepEqual(slideLegs([origin]), []);
});

// Brandon, October 10, 2026, on slides: "Yes slide can move around things."
test('a push stays straight and meets what is on its line; a slide with one corner goes round it', () => {
  const mover = { id: 'mover', column: 0, row: 0, width: 1, height: 1 };
  const pillar = { id: 'pillar', column: 3, row: 0, width: 1, height: 1 };
  // The push, six squares east: it meets the thing at 3,0 and stops at 2,0.
  const push = resolveForcedDrag(mover, { ...mover, column: 6, row: 0 }, [mover, pillar]);
  assert.deepEqual(push.collidedIds, ['pillar']);
  assert.deepEqual([push.destination.column, push.destination.row], [2, 0]);
  // The slide: to 3,2 and then on to 6,0. Each leg is its own straight forced move.
  let now = mover; const ends = [];
  for (const leg of slideLegs([at(0, 0), at(3, 2), at(6, 0)])) {
    const made = resolveForcedDrag(now, { ...now, ...leg.to }, [now, pillar]);
    assert.deepEqual(made.collidedIds, [], `nothing is met on the leg to ${squares([leg.to])}`);
    now = { ...now, column: made.destination.column, row: made.destination.row }; ends.push(squares([now]));
  }
  assert.deepEqual(ends, ['3,2', '6,0']);
  // And each leg's squares are that leg's own straight line.
  assert.equal(squares(straightSquares(at(0, 0), at(3, 2))), '0,0 1,1 2,1 3,2');
  assert.equal(squares(straightSquares(at(3, 2), at(6, 0))), '3,2 4,1 5,1 6,0');
});

test('a leg of a slide that meets something stops there: the corner beyond is not reached', () => {
  const mover = { id: 'mover', column: 0, row: 0, width: 1, height: 1 }, guard = { id: 'guard', column: 2, row: 1, width: 1, height: 1 };
  const legs = slideLegs([at(0, 0), at(3, 2), at(6, 0)]);
  const first = resolveForcedDrag(mover, { ...mover, ...legs[0].to }, [mover, guard]);
  assert.deepEqual(first.collidedIds, ['guard']);
  assert.notDeepEqual([first.destination.column, first.destination.row], [3, 2], 'so the board ends the slide');
  // What was still to come after that leg is left over too: three squares.
  assert.equal(legs[0].beyond, 3);
});

test('the line is the true straight one, not the walk\'s diagonal-first route', () => {
  // Six east and two south. A walk goes two squares at a slant, then four east.
  const walk = routeSteps(at(0, 0), at(6, 2), () => 0).points.map((p) => at(p.column, p.row));
  assert.equal(squares(walk), '0,0 1,1 2,2 3,2 4,2 5,2 6,2');
  // The forced move crosses these instead: a thing standing at 2,1 is met, not gone round.
  assert.equal(squares(straightSquares(at(0, 0), at(6, 2))), '0,0 1,0 2,1 3,1 4,1 5,2 6,2');
  // Straight along a row, a column or a true diagonal the two agree.
  for (const end of [at(5, 0), at(0, -4), at(3, 3), at(-4, 4)]) {
    assert.equal(squares(straightSquares(at(0, 0), end)), squares(routeSteps(at(0, 0), end, () => 0).points), JSON.stringify(end));
  }
});

test('one point for each square of distance, evenly along the line, ending on the held square', () => {
  const line = straightLine(at(2, 3), at(7, 5));
  assert.equal(line.length, 6);
  assert.deepEqual(line[0], at(2, 3));
  assert.deepEqual(line[5], at(7, 5));
  assert.ok(Math.abs(line[1].column - 3) < 1e-9 && Math.abs(line[1].row - 3.4) < 1e-9);
  assert.deepEqual(straightLine(at(2, 3), at(2, 3)), [at(2, 3)], 'held over its own square: no line');
});

test('the squares the ruler draws are the squares the move itself stops on', () => {
  // A creature in the way at each square of the line in turn: the move stops one square short of it,
  // which is the square before it on the ruler's line.
  const from = { id: 'mover', column: 0, row: 0, width: 1, height: 1 };
  for (const to of [at(6, 2), at(5, -3), at(-4, 1), at(2, 7)]) {
    const line = straightSquares(from, to);
    for (let n = 2; n < line.length; n++) {
      const blocker = { id: 'other', column: line[n].column, row: line[n].row, width: 1, height: 1 };
      const stopped = resolveForcedDrag(from, { ...from, ...to }, [from, blocker]);
      assert.deepEqual(stopped.collidedIds, ['other'], `${squares([to])}: the creature at ${squares([line[n]])} is met`);
      const stopAt = line.findIndex((p) => p.column === stopped.destination.column && p.row === stopped.destination.row);
      assert.ok(stopAt >= 0 && stopAt < n, `${squares([to])}: it stops on the line, before ${squares([line[n]])} (stopped at ${squares([stopped.destination])})`);
    }
  }
});

test('the ruler, the terrain and the board read a forced drag through these rules', () => {
  const ruler = readFileSync(new URL('../drag-ruler.js', import.meta.url), 'utf8');
  assert.match(ruler, /terrain\.routePath\(rawPoints, forced\)/);
  assert.match(ruler, /forced \? forcedLabel\(rawPoints\) : state\.movementLabel/);
  const terrain = readFileSync(new URL('../terrain-prototype.js', import.meta.url), 'utf8');
  assert.match(terrain, /function forcedLegs\(points\)/);
  assert.match(terrain, /if\(getCurrentMovementKind\(\)==='forced'\)return forcedHeight\(forcedFrom\(placement\),column,row\);/);
  const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  // A slide is made leg by leg, and each leg is sent as a plain forced move with no route of its own.
  assert.match(board, /movementKind === 'forced' && source === 'drag' && hasMatchingOrigin && ruler\.length > 2 && moves\.length === 1/);
  assert.match(board, /drawnRuler: \[\], inTurn: true, slideBeyond: leg\.beyond/);
  assert.match(board, /const arrived = made !== false && lastMoveOutcome && !lastMoveOutcome\.fell && now && now\.column === leg\.to\.column && now\.row === leg\.to\.row;/);
});
