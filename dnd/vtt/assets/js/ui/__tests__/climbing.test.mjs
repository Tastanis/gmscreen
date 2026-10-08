import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIMB_MIN_HEIGHT, climbSurcharge, stepCost, routeSteps, stepRise } from '../terrain-math.mjs';
import { terrainContact } from '../terrain-contact.js';
import { buildZoneIndex, normalizeZones, zonesForFootprint, summarizeRoute, movementText, hasMovementType, standsOnPlate, movementWaiver, zoneCostFor, isLiquidTag, LIQUID_TAGS } from '../terrain-zones.mjs';
import { climbPromptText, askClimb } from '../climb-prompt.js';
import { fallAllowsClimbing } from '../fall-review.js';

// A wall of rock: flat at 0 west of x = 3, then straight up to `top`.
const cliff = (top) => (x) => (x >= 3 ? top : 0);
const square = (heightAt) => (column, row) => heightAt(column + 0.5, row + 0.5);
const face = (heightAt) => (a, b) => terrainContact({ column: a.column, row: a.row, width: 1, height: 1 }, { column: b.column, row: b.row }, heightAt) !== null;

test('the rulebook climb: a face of two or more squares costs double for every square', () => {
  assert.equal(CLIMB_MIN_HEIGHT, 2, 'a one-square vertical is not a climb');
  assert.deepEqual([0, 1, 2, 3, 4].map(climbSurcharge), [0, 0, 2, 3, 4]);
  assert.equal(climbSurcharge(-3), 3, 'a climb down is priced like the same climb up');
  assert.equal(stepCost({ rise: 1, climb: true }), 1, 'a one-square block is ordinary movement');
  assert.equal(stepCost({ rise: 2, climb: true }), 4);
  assert.equal(stepCost({ rise: 3, climb: true }), 6);
  assert.equal(stepCost({ rise: 4, climb: true }), 8);
  assert.equal(stepCost({ rise: 3 }), 3, 'not a climb: priced as before');
  assert.equal(stepCost({ rise: -3, climb: true }), 3, 'walking down is never surcharged on the route; the fall review decides');
  assert.equal(stepCost({ rise: 2, multiplier: 2, climb: true }), 5, 'a climb into difficult terrain adds, it does not multiply');
});

test('a route up a cliff is charged the climb; a climber, a flier or forced movement is not', () => {
  const heightAt = cliff(3), height = square(heightAt);
  const walker = routeSteps({ column: 0, row: 0 }, { column: 4, row: 0 }, height, null, face(heightAt));
  // 2 flat squares, the 3-high face (3 squares at double = 6), 1 along the top.
  assert.equal(walker.cost, 2 + 6 + 1);
  assert.equal(walker.climbExtra, 3);
  assert.deepEqual(walker.points.map((point) => point.climb || 0), [0, 0, 0, 3, 0]);
  assert.equal(walker.extra, 3, 'the surcharge counts as cost beyond the plain distance');
  // No face test supplied (climber, flier, forced movement): the plain cost as before.
  const climber = routeSteps({ column: 0, row: 0 }, { column: 4, row: 0 }, height, null, null);
  assert.equal(climber.cost, 2 + 3 + 1);
  assert.equal(climber.climbExtra, 0);
  // Coming back down the same face is not surcharged on the route.
  const down = routeSteps({ column: 4, row: 0 }, { column: 0, row: 0 }, height, null, face(heightAt));
  assert.equal(down.cost, 1 + 3 + 2);
  assert.equal(down.climbExtra, 0);
});

test('a cliff is what stops forced movement: a ramp is not one, and a one-square ledge costs nothing extra', () => {
  // A two-high face is a climb.
  const two = cliff(2);
  assert.equal(routeSteps({ column: 2, row: 0 }, { column: 3, row: 0 }, square(two), null, face(two)).cost, 4);
  // A one-high ledge stops forced movement too, but it is not a climb, so it is never asked about.
  const one = cliff(1);
  let asked = 0;
  const ledge = routeSteps({ column: 2, row: 0 }, { column: 3, row: 0 }, square(one), null, (a, b) => { asked += 1; return face(one)(a, b); });
  assert.equal(ledge.cost, 1);
  assert.equal(asked, 0, 'the face test is only run when a climb would cost extra');
  assert.notEqual(terrainContact({ column: 2, row: 0, width: 1, height: 1 }, { column: 3, row: 0 }, one), null, 'forced movement does slam into a one-square ledge');
  // A staircase rising one square per square: every step is ordinary.
  const stairs = (x) => Math.max(0, Math.floor(x));
  const up = routeSteps({ column: 0, row: 0 }, { column: 4, row: 0 }, square(stairs), null, face(stairs));
  assert.equal(up.cost, 4);
  assert.equal(up.climbExtra, 0);
  // A smooth slope gaining 1.5 squares per square: tall steps, but forced movement would not slam, so no climb.
  const slope = (x) => Math.max(0, x * 1.5);
  assert.equal(terrainContact({ column: 0, row: 0, width: 1, height: 1 }, { column: 4, row: 0 }, slope), null);
  assert.equal(routeSteps({ column: 0, row: 0 }, { column: 4, row: 0 }, square(slope), null, face(slope)).climbExtra, 0);
});

test('the route summary lists each climb for the ruler and the pop-up', () => {
  const heightAt = cliff(3), height = square(heightAt);
  const summary = summarizeRoute([{ column: 0, row: 0 }, { column: 4, row: 0 }], (a, b) => routeSteps(a, b, height, null, face(heightAt)));
  assert.deepEqual(summary.climbs, [{ column: 3, row: 0, rise: 3, extra: 3, from: { column: 2, row: 0 } }]);
  assert.equal(summary.climbExtra, 3);
  assert.equal(summary.cost, 9);
  assert.equal(summary.distance, 6, 'the distance is the cost without surcharges');
  const flat = summarizeRoute([{ column: 0, row: 0 }, { column: 4, row: 0 }], (a, b) => routeSteps(a, b, () => 0));
  assert.deepEqual([flat.climbs, flat.climbExtra], [[], 0]);
});

test('"climb" and "swim" are read from the token’s movement text as whole words', () => {
  const ghoul = { monster: { speed: 7, movement: 'Climb' } };
  const gnawer = { monster: { speed: 5, movement: 'Burrow, Climb' } };
  const drowner = { monster: { speed: 6, movement: 'Swim' } };
  const spider = { monster: { movement: 'Spider climb 2' } };
  const kragen = { monster: { movement: 'Walks on water and blood' } };
  const hero = { name: 'Cal' };
  assert.equal(movementText(gnawer), 'Burrow, Climb');
  assert.ok(hasMovementType(ghoul, 'climb') && hasMovementType(gnawer, 'climb') && hasMovementType(spider, 'climb'));
  assert.ok(!hasMovementType(drowner, 'climb') && !hasMovementType(kragen, 'climb') && !hasMovementType(hero, 'climb'));
  assert.ok(hasMovementType(drowner, 'swim') && !hasMovementType(ghoul, 'swim'));
  assert.ok(!hasMovementType({ monster: { movement: 'Climbing gear' } }, 'climb'), 'only the whole word counts');
  assert.ok(hasMovementType({ metadata: { monster: { movement: 'climb' } } }, 'climb'));
  assert.ok(hasMovementType({ monster: { movement: '', movement_modes: ['Climb'] } }, 'climb'));
  assert.equal(movementText(null), '');
});

test('a token on a deck, plank or other plate is out of the liquid under it, whatever the gap', () => {
  const index = buildZoneIndex(normalizeZones({ version: 1, zones: [{ id: 'blood', tag: 'blood', surfaceHeight: 0, cost: 2, squares: [[5, 5], [6, 5], [7, 5]] }] }));
  const token = { column: 5, row: 5, width: 1, height: 1 };
  const tags = (feet, options) => zonesForFootprint(index, token, feet, () => 0, options).map((zone) => zone.tag);
  // Plain ground a quarter of a square above the surface still counts as wading (the half-square rule).
  assert.deepEqual(tags(0.28), ['blood']);
  // The same height on a plate does not.
  assert.deepEqual(tags(0.28, { onPlate: true }), []);
  assert.deepEqual(tags(0.05, { onPlate: true }), []);
  // A plate at or under the surface is awash: still in the blood.
  assert.deepEqual(tags(0, { onPlate: true }), ['blood']);
  assert.deepEqual(tags(-0.3, { onPlate: true }), ['blood']);
  // Finding the plate: a low deck over squares 5..6, and a roof that is not a floor.
  const model = { roofs: [
    { id: 'deck', kind: 'floor', levelId: 'level-0', height: 0.283, points: [{ x: 5, y: 5 }, { x: 7, y: 5 }, { x: 7, y: 6 }, { x: 5, y: 6 }] },
    { id: 'canopy', kind: 'roof', levelId: 'level-0', height: 0.283, points: [{ x: 7, y: 5 }, { x: 8, y: 5 }, { x: 8, y: 6 }, { x: 7, y: 6 }] },
  ] };
  assert.equal(standsOnPlate(token, 0.283, model), true);
  assert.equal(standsOnPlate({ ...token, column: 6 }, 0.283, model), true);
  assert.equal(standsOnPlate({ ...token, column: 7 }, 0.283, model), false, 'a roof is not something to stand on');
  assert.equal(standsOnPlate(token, 0, model), false, 'feet on the canal bed under the deck, not on it');
  assert.equal(standsOnPlate({ ...token, levelId: 'upper' }, 0.283, model), false, 'a plate on another floor');
  assert.equal(standsOnPlate(token, 0.283, null), false);
  assert.equal(standsOnPlate(token, Number.NaN, model), false);
});

test('the climb pop-up says how far, what it costs, and what is left', () => {
  const enough = climbPromptText({ name: 'Cal', squares: 3, cost: 6, extra: 2, left: 7 });
  assert.equal(enough.title, 'Climbing');
  assert.deepEqual(enough.lines, ['Cal climbs 3 squares.', 'This move costs 6 (2 extra for the climb).', '7 movement left this turn.']);
  assert.deepEqual([enough.yes, enough.no], ['Climb', 'Don’t climb']);
  assert.equal(climbPromptText({ name: 'Cal', squares: 3, cost: 6, extra: 2, left: 4 }).lines[2], 'Only 4 movement left this turn.');
  assert.equal(climbPromptText({ name: 'Warden', squares: 2, cost: 3, extra: 1 }).lines.length, 2, 'outside a turn there is no movement line');
  assert.match(climbPromptText({ name: 'Cal', squares: 1, cost: 2, extra: 1, others: 2 }).lines[0], /^Cal climbs 1 square, and 2 more tokens climb\.$/);
});

function fakeDocument() {
  const listeners = new Set();
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.style = {}; this.handlers = {}; this.textContent = ''; }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    remove() { this.parent.children = this.parent.children.filter((node) => node !== this); }
    setAttribute() {}
    addEventListener(type, handler) { this.handlers[type] = handler; }
    all() { return this.children.flatMap((node) => [node, ...node.all()]); }
  }
  const body = new Element('body');
  return {
    body,
    createElement: (tag) => new Element(tag),
    addEventListener: (type, handler) => listeners.add(handler),
    removeEventListener: (type, handler) => listeners.delete(handler),
    key: (key) => [...listeners].forEach((handler) => handler({ key, preventDefault() {}, stopPropagation() {} })),
    prompts: () => body.children.filter((node) => 'climbPrompt' in node.dataset),
    button: (answer) => body.all().find((node) => node.dataset.climbAnswer === answer),
    get listening() { return listeners.size; },
  };
}

test('the climb pop-up answers once: buttons, Enter and Escape; a second request never stacks', async () => {
  const info = { name: 'Cal', squares: 2, cost: 3, extra: 1, left: 5 };
  let doc = fakeDocument();
  let answer = askClimb(info, { documentRef: doc });
  assert.equal(doc.prompts().length, 1);
  assert.equal(await askClimb(info, { documentRef: doc }), false, 'a second request while one is open is refused');
  assert.equal(doc.prompts().length, 1);
  doc.button('yes').handlers.click();
  assert.equal(await answer, true);
  assert.equal(doc.prompts().length, 0);
  assert.equal(doc.listening, 0, 'the key listener is removed');

  doc = fakeDocument(); answer = askClimb(info, { documentRef: doc }); doc.button('no').handlers.click();
  assert.equal(await answer, false);
  doc = fakeDocument(); answer = askClimb(info, { documentRef: doc }); doc.key('Enter');
  assert.equal(await answer, true);
  doc = fakeDocument(); answer = askClimb(info, { documentRef: doc }); doc.key('a'); assert.equal(doc.prompts().length, 1); doc.key('Escape');
  assert.equal(await answer, false);
  assert.equal(await askClimb(info, { documentRef: null }), false, 'no page: do not climb');
});

test('the fall review offers Climbing only to a creature that walked or shifted off the edge', () => {
  assert.equal(fallAllowsClimbing({ squares: 3, movementKind: 'walk' }), true);
  assert.equal(fallAllowsClimbing({ squares: 3, movementKind: 'shift' }), true);
  assert.equal(fallAllowsClimbing({ squares: 3, movementKind: 'forced' }), false, 'pushed, pulled or slid over the edge');
  assert.equal(fallAllowsClimbing({ squares: 3, movementKind: 'teleport' }), false);
  assert.equal(fallAllowsClimbing({ squares: 3 }), false, 'an older fall with no record of how it happened');
  assert.equal(fallAllowsClimbing(null), false);
});

// ---- swimming ------------------------------------------------------------------
const zone = (tag, cost = 2) => ({ id: tag, tag, cost });
const costs = (movement, tags) => { const waiver = movementWaiver(movement === null ? { name: 'Hero' } : { monster: { movement } }); return tags.map((tag) => zoneCostFor(zone(tag), waiver)); };

test('liquid is decided by the zone tag, in one list', () => {
  assert.deepEqual([...LIQUID_TAGS].sort(), ['acid', 'blood', 'liquid', 'oil', 'sewage', 'slime', 'water']);
  assert.ok(isLiquidTag('water') && isLiquidTag('blood'));
  assert.ok(!isLiquidTag('mud') && !isLiquidTag('lava') && !isLiquidTag('rubble') && !isLiquidTag(''));
});

test('a creature with a swim speed pays nothing extra in liquid, and full price everywhere else', () => {
  const tags = ['water', 'blood', 'mud', 'rubble'];
  assert.deepEqual(costs('Swim', tags), [1, 1, 2, 2]);
  for (const text of ['swim', 'Swim 4', '5 swim', 'swim 6', 'Swim, Climb', 'Burrow; Swim']) assert.deepEqual(costs(text, tags), [1, 1, 2, 2], text);
  // No swim: a ghoul that climbs, a creature with no movement text, a hero.
  assert.deepEqual(costs('Climb', tags), [2, 2, 2, 2]);
  assert.deepEqual(costs('', tags), [2, 2, 2, 2]);
  assert.deepEqual(costs(null, tags), [2, 2, 2, 2]);
  assert.deepEqual(costs('Swimwear', ['water']), [2], 'only the whole word counts');
  // The zone keeps its own cost: x4 water is still free to a swimmer and x4 to a walker.
  assert.equal(zoneCostFor(zone('water', 4), movementWaiver({ monster: { movement: 'Swim' } })), 1);
  assert.equal(zoneCostFor(zone('water', 4), movementWaiver({ monster: { movement: 'Climb' } })), 4);
  assert.equal(zoneCostFor(zone('water', 4), null), 4);
  // The stored list of movement types is read as well as the text.
  assert.deepEqual(movementWaiver({ monster: { movement: '', movement_modes: ['Swim'] } }).liquids, true);
});

test('"walks on X and Y" waives exactly the zones with those tags', () => {
  const kragen = movementWaiver({ monster: { movement: 'Walks on water and blood' } });
  assert.equal(kragen.liquids, false, 'it is not a swimmer');
  assert.deepEqual([...kragen.tags].sort(), ['blood', 'water']);
  assert.deepEqual(costs('Walks on water and blood', ['water', 'blood', 'oil', 'mud']), [1, 1, 2, 2], 'oil is liquid, but it was not named');
  assert.deepEqual([...movementWaiver({ monster: { movement: 'Climb, walks on mud' } }).tags], ['mud'], 'a named tag need not be a liquid');
  assert.deepEqual([...movementWaiver({ monster: { movement: 'Walk on water or oil / acid & slime' } }).tags].sort(), ['acid', 'oil', 'slime', 'water']);
  assert.deepEqual([...movementWaiver({ monster: { movement: 'Walking on Deep Water' } }).tags], ['deep-water'], 'two words become one tag, as zone tags are written');
  // Items are separated by commas, so a comma ends the list. The Monster maker should write "and".
  assert.deepEqual([...movementWaiver({ monster: { movement: 'Walks on water, blood' } }).tags], ['water']);
  assert.deepEqual([...movementWaiver({ monster: { movement: 'Ignores difficult stone terrain' } }).tags], [], 'a phrase it does not know changes nothing');
  assert.deepEqual([...movementWaiver({ monster: { movement: 'Fly, Hover' } }).tags], []);
});

test('a swimmer is still in the zone: only the movement cost is waived', () => {
  const index = buildZoneIndex(normalizeZones({ version: 1, zones: [{ id: 'canal', tag: 'blood', surfaceHeight: 0, cost: 2, squares: [[5, 5]] }] }));
  const drowner = { column: 5, row: 5, width: 1, height: 1, monster: { movement: 'Swim' } };
  const found = zonesForFootprint(index, drowner, -0.4, () => 0);
  assert.deepEqual(found.map((z) => z.tag), ['blood'], 'abilities that ask "is it in blood?" still get yes');
  assert.equal(Math.max(1, ...found.map((z) => zoneCostFor(z, movementWaiver(drowner)))), 1);
  assert.equal(Math.max(1, ...found.map((z) => zoneCostFor(z, movementWaiver({ name: 'Cal' })))), 2);
});

// ---- in-between heights ----------------------------------------------------
// Rock steps on a real map are not whole squares high. One rule decides: the real change in
// height, to the nearest whole square. Under one and a half squares is a step; from there up it
// is a two-square face. A fall counts the same way (fall-nearest-square.test.php).
test('a step is measured by its real height, to the nearest whole square', () => {
  for (const [from, to, rise] of [[0, 1.1, 1], [0.45, 1.8, 1], [0.1, 1.59, 1], [0.6, 2.2, 2], [0.2, 1.91, 2], [0.05, 1.95, 2], [0.1, 3.85, 4], [0, 3.5, 4], [0, 0.4, 0]]) {
    assert.equal(stepRise(from, to), rise, `up from ${from} to ${to}`);
    assert.equal(stepRise(to, from), -rise || 0, `down from ${to} to ${from}`);
  }
  assert.equal(stepRise(undefined, undefined), 0);
});

test('rock steps of 1.3 to 1.7 squares: under one and a half is a step, from there up is a climb', () => {
  const face = () => true; // every one of these is a steep face
  const walk = (low, high) => routeSteps({ column: 0, row: 0 }, { column: 1, row: 0 }, (column) => (column === 1 ? high : low), null, face);
  // 1.35 high. The two ends used to round to 0 and 2, which made it a two-square climb costing 4.
  assert.deepEqual(pick(walk(0.45, 1.8)), { cost: 1, climbExtra: 0, rise: 1 }, 'a 1.35-high step is a one-square step: no pop-up, costs 1');
  assert.deepEqual(pick(walk(0, 1.1)), { cost: 1, climbExtra: 0, rise: 1 }, 'a 1.1-high ledge is unchanged');
  assert.deepEqual(pick(walk(0.1, 1.55)), { cost: 1, climbExtra: 0, rise: 1 }, '1.45 is still a step');
  // 1.6 high. The two ends used to round to 1 and 2, which made it no climb at all.
  assert.deepEqual(pick(walk(0.6, 2.2)), { cost: 4, climbExtra: 2, rise: 2 }, 'a 1.6-high face is a two-square climb');
  assert.deepEqual(pick(walk(0.2, 1.91)), { cost: 4, climbExtra: 2, rise: 2 }, 'a 1.71-high face is a two-square climb');
  assert.deepEqual(pick(walk(0.05, 1.95)), { cost: 4, climbExtra: 2, rise: 2 }, 'a 1.9-high face is unchanged');
  assert.deepEqual(pick(walk(0.1, 3.85)), { cost: 8, climbExtra: 4, rise: 4 }, 'a 3.75-high face is four squares up, as it is four squares down');
});

test('a gentle hill is not charged for height it gains a little at a time', () => {
  // Ten steps of 0.4 each: four squares up in all, but no single step is steep.
  const hill = routeSteps({ column: 0, row: 0 }, { column: 10, row: 0 }, (column) => column * 0.4, null, () => true);
  assert.deepEqual([hill.cost, hill.climbExtra], [10, 0]);
});

function pick(walked) {
  return { cost: walked.cost, climbExtra: walked.climbExtra, rise: walked.points[1].rise };
}

// ---- The same face, up and down --------------------------------------------
// These are the bank shapes fall-agrees-with-climb.test.php walks off. Going up, each is a climb
// of the number of squares that test expects the fall to be.
test('banks that are falls coming down are climbs of the same height going up', () => {
  const profile = (points) => (x) => {
    if (x <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) { const [x0, z0] = points[i - 1], [x1, z1] = points[i]; if (x <= x1) return z0 + ((z1 - z0) * (x - x0)) / (x1 - x0); }
    return points[points.length - 1][1];
  };
  const banks = [
    ['a 1.9-high bank sloping over most of a square', [[2.6, 1.9], [3.4, 0]], 2],
    ['a 1.71-high bank', [[2.6, 1.71], [3.35, 0]], 2],
    ['a 2.0-high bank that is not a sheer drop', [[2.55, 2.0], [3.45, 0]], 2],
    ['a 1.72-high face with a rounded top', [[2.5, 1.72], [2.9, 1.3], [3.1, 0.3], [3.5, 0]], 2],
    ['a sheer 3.75-high cliff', [[2.95, 3.75], [3.05, 0]], 4],
    ['a 3.42-high cliff with a raised lip at its edge', [[2.5, 3.42], [2.9, 4.15], [3.0, 4.15], [3.1, 0]], 3],
    ['a sheer 2.4-high face', [[2.95, 2.4], [3.05, 0]], 2],
  ];
  for (const [name, points, squares] of banks) {
    const heightAt = profile(points);
    // From the foot (column 3) up to the top (column 2).
    const up = routeSteps({ column: 3, row: 1 }, { column: 2, row: 1 }, square(heightAt), null, face(heightAt));
    assert.deepEqual([up.points[1].rise, up.climbExtra, up.cost], [squares, squares, squares * 2], `${name}: climbs ${squares}, costs ${squares * 2}`);
  }
  // Under the line: a step, not a climb, and (in the PHP test) not a fall.
  for (const points of [[[2.6, 1.4], [3.4, 0]], [[2.6, 1.2], [3.4, 0]], [[2.5, 1.0], [3.5, 0]]]) {
    const heightAt = profile(points);
    assert.equal(routeSteps({ column: 3, row: 1 }, { column: 2, row: 1 }, square(heightAt), null, face(heightAt)).climbExtra, 0);
  }
});
