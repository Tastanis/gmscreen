import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const board = read('../board-interactions.js');
const between = (text, from, to) => { const start = text.indexOf(from); assert.ok(start >= 0, 'found: ' + from); const end = text.indexOf(to, start + from.length); assert.ok(end > start, 'found: ' + to); return text.slice(start, end); };

// Brandon, November 23, 2026: "if the floor is up 1.3 then they should still be within 1 because the top of the
// character's square is already up 1 ... it would have to be a full 2 squares higher. And then it wouldnt hit. What
// it should deal with is if its 1.999 squares up. maybe those types of things should be rounded to 2."
test('two creatures are as many squares apart in height as whole squares lie between their feet', () => {
  const apart = new Function(between(board, '  function squaresApartInHeight(', '\n  }') + '\n  }\n return squaresApartInHeight;')();
  assert.equal(apart(0.5), 0, 'a bump or a slope under one square: beside each other is still beside each other');
  assert.equal(apart(1), 1);
  assert.equal(apart(1.3), 1, 'ground 1.3 up is within 1 (the branch measured 1.3, and "within 1" failed)');
  assert.equal(apart(1.8), 1);
  assert.equal(apart(1.9), 2, 'all but two squares is two: taken to the nearest quarter first');
  assert.equal(apart(1.999), 2);
  assert.equal(apart(2), 2);
  assert.equal(apart(2, 2), 1, 'a creature two squares high below reaches the one two squares up');
  assert.equal(apart(0.4, 3), 0);
  const distance = between(board, '  function abilityTargetDistance(', '\n  }');
  assert.match(distance, /Math\.max\(planar, squaresApartInHeight\(Math\.abs\(a - b\), Math\.max\(Number\(lower\.width\) \|\| 1, Number\(lower\.height\) \|\| 1\)\)\)/, 'every "within N" check uses it');
});

// Opening or reloading the VTT while a turn was running showed "The 3D board could not open": the 3D board asks for
// the turn's starting square as it mounts, before the terrain file's first frame had given it the board.
test('the ground height can be asked before the terrain file has drawn its first frame', () => {
  const terrain = read('../terrain-prototype.js');
  const ground = between(terrain, 'function groundFor(placement,point=null){', '\n}');
  const takes = ground.indexOf("if(!ctx)ctx=window.terrainContext?.()||null;"), floor = ground.indexOf("if(!ctx?.view)return base;"), uses = ground.indexOf('dimensions()');
  assert.ok(takes > 0 && floor > takes && uses > floor, 'the board is read at once, and with none yet the floor\'s own height is the answer');
});

test('a teleport offers only the squares no wall stands before, like a slide; any square can still be picked', () => {
  assert.match(board, /const forcedLine = \(baseVerb === 'push' \|\| baseVerb === 'pull' \|\| baseVerb === 'slide'\) && !ownMove && typeof globalThis\.wallPrototype\?\.forcedBlockedMove === 'function';/);
});

test('the board tells the ability runner whose turn it is, and words a joined target kind plainly', () => {
  assert.match(board, /isTurnOf: function \(placementId\) \{\s*return Boolean\(combatActive && placementId && activeCombatantId === placementId\);/);
  assert.match(board, /const creature = window\.AbilityAutomationPrimitives\?\.targetPredicateWords\?\.\(rawCreature, countVal\) \?\? rawCreature;/);
});
