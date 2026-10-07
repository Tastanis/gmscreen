import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeZones, sceneZones, buildZoneIndex, zonesAtSquare, squareCostMultiplier, ZONE_DEFAULT_COST } from '../terrain-zones.mjs';
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
