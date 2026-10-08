import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeZones, sceneZones, buildZoneIndex, zonesAtSquare, squareCostMultiplier, zonesForFootprint, zoneTags, footprintSquares, zoneGeometry, zoneColor, summarizeRoute, zonesHiddenFromPlayers, ZONE_DEFAULT_COST } from '../terrain-zones.mjs';
import { routeSteps, slopeColor, stepCost } from '../terrain-math.mjs';
import { normalizeSceneBoardState } from '../../state/normalize/scene-board-state.js';
import { reduceCanonicalEvent } from '../../sync-v2/event-reducer.js';

const fixture = JSON.parse(readFileSync(new URL('../../../../api/v2/tests/fixtures/terrain-zones-scene.json', import.meta.url), 'utf8'));
const field = fixture.domains.sceneConfig.environment.zones;

test('zones read from the stored field with defaults filled in', () => {
  const zones = normalizeZones(field);
  assert.deepEqual(zones.map((zone) => zone.id), ['blood-canal', 'deep-mud', 'holy-ground', 'hidden-pit', 'deck-oil']);
  const byId = Object.fromEntries(zones.map((zone) => [zone.id, zone]));
  assert.equal(byId['blood-canal'].cost, 2);
  assert.equal(byId['deep-mud'].cost, 4);
  assert.equal(byId['holy-ground'].cost, 1, 'a cost of 1 is a tag with no movement penalty');
  assert.equal(byId['holy-ground'].levelId, 'level-0', 'a zone with no floor is on the ground floor');
  assert.equal(byId['holy-ground'].surfaceHeight, null, 'no surface height means the floor’s own height');
  assert.equal(byId['hidden-pit'].gmOnly, true);
  assert.equal(byId['deck-oil'].levelId, 'bridge-deck');
  assert.deepEqual(normalizeZones(field.value), zones, 'the bare value is accepted too');
});

test('scenes without zones, and malformed zone data, yield no zones', () => {
  assert.deepEqual(normalizeZones(null), []);
  assert.deepEqual(normalizeZones({ revision: 1, value: { version: 2, zones: field.value.zones } }), []);
  assert.deepEqual(sceneZones({ old: { environment: { terrain: { revision: 1, value: {} } } } }, 'old'), []);
  assert.deepEqual(sceneZones({}, 'missing'), []);
  const messy = normalizeZones({ version: 1, zones: [
    { id: 'ok', tag: 'water', squares: [[1, 1], [1.5, 2], ['a', 3], [2, 2]] },
    { id: 'ok', tag: 'water', squares: [[9, 9]] },
    { id: 'bad-tag', tag: 'Deep Water', squares: [[1, 1]] },
    { id: 'no-squares', tag: 'water', squares: [] },
    { id: 'odd-cost', tag: 'water', cost: 0, squares: [[3, 3]] },
  ] });
  assert.deepEqual(messy.map((zone) => zone.id), ['ok', 'odd-cost']);
  assert.deepEqual(messy[0].squares, [[1, 1], [2, 2]], 'only whole-number squares are kept');
  assert.equal(messy[1].cost, ZONE_DEFAULT_COST);
});

test('square lookup respects the floor and reports the highest multiplier', () => {
  const index = buildZoneIndex(normalizeZones(field));
  assert.deepEqual(zonesAtSquare(index, 5, 2).map((zone) => zone.tag), ['blood']);
  assert.deepEqual(zonesAtSquare(index, 5, 2, 'bridge-deck').map((zone) => zone.tag), ['oil'], 'the bridge above the blood is a different floor');
  assert.deepEqual(zonesAtSquare(index, 5.7, 2.2).map((zone) => zone.tag), ['blood'], 'fractional positions fall in their square');
  assert.deepEqual(zonesAtSquare(index, 7, 2), []);
  assert.equal(squareCostMultiplier(index, 9, 5), 4);
  assert.equal(squareCostMultiplier(index, 1, 1), 1, 'a tag-only zone costs nothing extra');
  assert.equal(squareCostMultiplier(index, 0, 0), 1);
  const stacked = buildZoneIndex(normalizeZones({ version: 1, zones: [
    { id: 'a', tag: 'water', cost: 2, squares: [[3, 3]] }, { id: 'b', tag: 'mud', cost: 4, squares: [[3, 3]] },
  ] }));
  assert.equal(squareCostMultiplier(stacked, 3, 3), 4, 'overlapping zones use the highest multiplier, not the sum');
  assert.deepEqual(zonesAtSquare(stacked, 3, 3).map((zone) => zone.tag), ['water', 'mud']);
});

test('a token is in a zone only on its floor and at its surface', () => {
  const index = buildZoneIndex(normalizeZones(field));
  const floors = new Map([['level-0', 0], ['bridge-deck', 2]]);
  const elevation = (levelId) => floors.get(levelId) ?? 0;
  const tags = (placement, height) => zoneTags(zonesForFootprint(index, placement, height, elevation));
  const inBlood = { column: 5, row: 2, width: 1, height: 1, levelId: 'level-0' };
  assert.deepEqual(tags(inBlood, 0), ['blood'], 'wading in the canal');
  assert.deepEqual(tags(inBlood, -1), ['blood'], 'below the surface still counts');
  assert.deepEqual(tags(inBlood, 0.4), ['blood'], 'a shallow bank edge still counts');
  assert.deepEqual(tags(inBlood, 0.5), [], 'half a square above the surface is out (a raised island)');
  assert.deepEqual(tags(inBlood, 2), [], 'a token on a deck over the canal is not in it');
  assert.deepEqual(tags(inBlood, 1), [], 'a flier one square up is not in it');
  assert.deepEqual(tags({ ...inBlood, levelId: 'bridge-deck' }, 2), ['oil'], 'on the bridge floor only the bridge zone applies');
  assert.deepEqual(tags({ ...inBlood, levelId: 'bridge-deck' }, 3), [], 'flying above the bridge is out of the oil');
  assert.deepEqual(tags({ column: 7, row: 2, width: 1, height: 1 }, 0), [], 'ordinary ground');
  assert.deepEqual(tags({ column: 3, row: 2, width: 2, height: 2 }, 0), ['blood'], 'a large token with one square in the canal is in it');
  assert.deepEqual(tags({ column: 2, row: 0, width: 2, height: 2 }, 0), ['holy'], 'footprint overlap finds a tag-only zone');
  assert.deepEqual(tags({ column: 0, row: 4, width: 2, height: 2 }, 0), []);
  assert.deepEqual(footprintSquares({ column: 3, row: 2, width: 2, height: 2 }), [[3, 2], [4, 2], [3, 3], [4, 3]]);
  assert.deepEqual(tags(inBlood, undefined), ['blood'], 'with no height known the floor height is used');
  assert.deepEqual(zonesForFootprint(new Map(), inBlood, 0), [], 'a scene with no zones has nobody in a zone');
  const noSurface = buildZoneIndex(normalizeZones({ version: 1, zones: [{ id: 'upper-water', tag: 'water', levelId: 'bridge-deck', squares: [[1, 1]] }] }));
  assert.deepEqual(zoneTags(zonesForFootprint(noSurface, { column: 1, row: 1, levelId: 'bridge-deck' }, 2, elevation)), ['water'], 'a zone with no surface height sits at its floor');
});

test('zone outline keeps only outer edges and picks a label square inside the zone', () => {
  const zone = normalizeZones(field).find((entry) => entry.id === 'blood-canal');
  const flat = zoneGeometry(zone, (column, row) => ({ x: column * 50, y: row * 50 }));
  assert.equal((flat.fill.match(/Z/g) || []).length, 6, 'one quad per square');
  assert.equal(flat.edges, 10, 'a 3 by 2 block has 10 outer edges and no inner ones');
  assert.ok(zone.squares.some(([column, row]) => column === flat.labelSquare[0] && row === flat.labelSquare[1]));
  assert.ok(flat.fill.startsWith('M200,100L250,100L250,150L200,150Z'));
  const raised = zoneGeometry(zone, (column, row) => ({ x: column * 50 + 12, y: row * 50 - 36 }));
  assert.ok(raised.fill.startsWith('M212,64'), 'the projection supplied by the board is applied to every corner');
  assert.equal(zoneColor('blood'), '#c1121f');
  assert.equal(zoneColor('something-new'), '#d4a017');
});

test('the GM switch that hides zones from players is read from the stored field', () => {
  assert.equal(zonesHiddenFromPlayers(field), false, 'zones are shown to players unless the GM says otherwise');
  assert.equal(zonesHiddenFromPlayers({ revision: 2, value: { ...field.value, hiddenFromPlayers: true } }), true);
  assert.equal(zonesHiddenFromPlayers({ ...field.value, hiddenFromPlayers: true }), true, 'the bare value is accepted too');
  assert.equal(zonesHiddenFromPlayers({ revision: 2, value: { ...field.value, hiddenFromPlayers: 'yes' } }), false, 'only a real true hides them');
  assert.equal(zonesHiddenFromPlayers(null), false);
  assert.equal(normalizeZones({ revision: 2, value: { ...field.value, hiddenFromPlayers: true } }).length, 5, 'hiding is display only: the zones themselves are unchanged');
});

test('a difficult square costs its multiplier; a climb is paid as well', () => {
  const index = buildZoneIndex(normalizeZones(field));
  const flat = () => 0;
  const multiplier = (column, row) => squareCostMultiplier(index, column, row);
  // Row 2, columns 2 to 7: columns 4, 5, 6 are blood (x2).
  const plain = routeSteps({ column: 2, row: 2 }, { column: 7, row: 2 }, flat);
  assert.deepEqual([plain.cost, plain.extra], [5, 0], 'with no zone lookup the route is unchanged');
  const blood = routeSteps({ column: 2, row: 2 }, { column: 7, row: 2 }, flat, multiplier);
  assert.deepEqual([blood.cost, blood.extra], [8, 3], '5 squares with 3 in blood cost 8');
  assert.deepEqual(blood.points.slice(1).map((point) => point.multiplier), [1, 2, 2, 2, 1]);
  // Deep mud is x4: entering one mud square costs 4.
  const mud = routeSteps({ column: 8, row: 5 }, { column: 9, row: 5 }, flat, multiplier);
  assert.deepEqual([mud.cost, mud.extra], [4, 3]);
  // Leaving difficult terrain onto ordinary ground costs 1.
  assert.equal(routeSteps({ column: 6, row: 2 }, { column: 7, row: 2 }, flat, multiplier).cost, 1);
  // A tag-only zone (cost 1) is free.
  assert.equal(routeSteps({ column: 0, row: 1 }, { column: 2, row: 1 }, flat, multiplier).cost, 2);
  // Climbing 2 while stepping into a x2 square: 2 for the climb plus 1 extra.
  const climb = routeSteps({ column: 3, row: 2 }, { column: 4, row: 2 }, (column) => (column === 4 ? 2 : 0), multiplier);
  assert.deepEqual([climb.cost, climb.extra], [3, 1]);
  assert.equal(routeSteps({ column: 2, row: 2 }, { column: 2, row: 2 }, flat, multiplier).cost, 0, 'standing still costs nothing, even in a zone');
  assert.equal(routeSteps({ column: 3, row: 2 }, { column: 4, row: 2 }, flat, () => Number.NaN).cost, 1, 'a broken lookup never changes the cost');
});

test('route summary reports plain distance, true cost and each difficult square', () => {
  const index = buildZoneIndex(normalizeZones(field));
  const walk = (a, b) => routeSteps(a, b, () => 0, (column, row) => squareCostMultiplier(index, column, row));
  const summary = summarizeRoute([{ column: 2, row: 2 }, { column: 7, row: 2 }, { column: 9, row: 5 }], walk);
  assert.equal(summary.distance, 8, '5 squares then 3 squares');
  assert.equal(summary.cost, 14, '3 blood squares add 3 and one mud square adds 3');
  assert.equal(summary.extra, 6);
  assert.deepEqual(summary.difficult.map((step) => [step.column, step.row, step.multiplier]), [[4, 2, 2], [5, 2, 2], [6, 2, 2], [9, 5, 4]]);
  assert.deepEqual(summary.difficult[0].from, { column: 3, row: 2 });
  const forced = summarizeRoute([{ column: 2, row: 2 }, { column: 7, row: 2 }], (a, b) => routeSteps(a, b, () => 0, null));
  assert.deepEqual([forced.distance, forced.cost, forced.difficult.length], [5, 5, 0], 'forced movement ignores difficult terrain');
  assert.deepEqual(summarizeRoute([{ column: 1, row: 1 }], walk), { distance: 0, cost: 0, extra: 0, difficult: [], climbs: [], climbExtra: 0 });
});

test('ruler colours: black on the flat, yellow uphill, green downhill', () => {
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  assert.equal(slopeColor(0), '#111111');
  for (const slope of [0.5, 1, 2, 4]) {
    const [r, g, b] = rgb(slopeColor(slope));
    assert.ok(r > 120 && g > 90 && b < 60 && r > g, `uphill ${slope} is yellow: ${slopeColor(slope)}`);
    const [dr, dg, db] = rgb(slopeColor(-slope));
    assert.ok(dg > dr && dg > db && dg > 80, `downhill ${slope} is green: ${slopeColor(-slope)}`);
  }
});

test('zones survive the client state normaliser and live environment events', () => {
  const normalized = normalizeSceneBoardState({ scene: { environment: { zones: field } } });
  assert.deepEqual(sceneZones(normalized, 'scene').length, 5);
  assert.deepEqual(normalizeSceneBoardState({ scene: { grid: { size: 50 } } }).scene.environment, undefined, 'old scenes gain no environment');
  const state = { revision: 3, placements: {}, sceneConfig: { scene: { _revision: 1, environment: {} } }, drawings: {}, templates: {} };
  const event = { revision: 4, type: 'environment.changed', sceneId: 'scene', entityRevision: 2, operationId: 'zones-event-1',
    payload: { field: 'zones', entry: { revision: 1, value: { version: 1, zones: [field.value.zones[0]] } } } };
  const reduced = reduceCanonicalEvent({ revision: 3, state }, event);
  const next = reduced.snapshot?.state ?? reduced.state ?? state;
  assert.equal(sceneZones(next.sceneConfig, 'scene')[0]?.tag, 'blood', 'a zone save from the GM reaches open clients through the normal event');
});

test('one step is priced in one place: distance or height, whichever is larger, plus difficult terrain', () => {
  assert.equal(stepCost(), 1);
  assert.equal(stepCost({ horizontal: 1, rise: 1 }), 1, 'a one-square step up is ordinary movement');
  assert.equal(stepCost({ horizontal: 1, rise: 3 }), 3);
  assert.equal(stepCost({ horizontal: 1, rise: -3 }), 3, 'going down is priced like going up');
  assert.equal(stepCost({ horizontal: 1, rise: 0, multiplier: 2 }), 2);
  assert.equal(stepCost({ horizontal: 1, rise: 2, multiplier: 4 }), 5, 'difficult terrain adds to a climb, it does not multiply it');
  // The ruler uses it: a 3-high ledge, then two x2 squares on top.
  const route = routeSteps({ column: 0, row: 0 }, { column: 3, row: 0 }, (x) => (x >= 1 ? 3 : 0), (x) => (x >= 2 ? 2 : 1));
  assert.equal(route.cost, 3 + 2 + 2);
});

test('"in or next to" a zone: within one square of the token, sideways or above the surface', () => {
  // A pool of blood two squares wide at columns 5-6, rows 5-6, its surface at height 0.
  const index = buildZoneIndex(normalizeZones({ version: 1, zones: [{ id: 'pool', tag: 'blood', surfaceHeight: 0, squares: [[5, 5], [6, 5], [5, 6], [6, 6]] }] }));
  const at = (column, row, extra = {}) => ({ column, row, width: 1, height: 1, levelId: 'level-0', ...extra });
  const tags = (placement, height, options) => zoneTags(zonesForFootprint(index, placement, height, () => 0, options));
  const near = { reach: 1 };
  assert.deepEqual(tags(at(4, 5), 0), [], 'beside the pool is not in it');
  assert.deepEqual(tags(at(4, 5), 0, near), ['blood'], 'but it is next to it');
  assert.deepEqual(tags(at(4, 4), 0, near), ['blood'], 'a corner touch counts');
  assert.deepEqual(tags(at(7, 7), 0, near), ['blood']);
  assert.deepEqual(tags(at(3, 5), 0, near), [], 'two squares away is not adjacent');
  assert.deepEqual(tags(at(8, 6), 0, near), []);
  assert.deepEqual(tags(at(5, 5), 0, near), ['blood'], 'a token in the zone is also "in or next to" it');
  // Height: the bank one square above the surface is adjacent, two above is not.
  assert.deepEqual(tags(at(4, 5), 1, near), ['blood'], 'on a bank one square up');
  assert.deepEqual(tags(at(4, 5), 2, near), [], 'a ledge two squares up');
  assert.deepEqual(tags(at(5, 5), 1, { ...near, onPlate: true }), ['blood'], 'on a deck one square above the blood: not in it, but next to it');
  assert.deepEqual(tags(at(5, 5), 1, { onPlate: true }), []);
  // A large token reaches from each of its squares.
  assert.deepEqual(tags(at(3, 5, { width: 2, height: 2 }), 0, near), ['blood'], 'a 2x2 token whose edge touches the pool');
  assert.deepEqual(tags(at(2, 5, { width: 2, height: 2 }), 0, near), [], 'one empty square between it and the pool');
  // Another floor's zones stay out of it.
  assert.deepEqual(tags(at(4, 5, { levelId: 'bridge-deck' }), 0, near), []);
  assert.deepEqual(tags(at(4, 5), 0, { reach: 0 }), [], 'reach 0 is plain "in"');
});
