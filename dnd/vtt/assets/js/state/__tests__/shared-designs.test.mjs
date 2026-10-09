import test from 'node:test';
import assert from 'node:assert/strict';
import { copySharingDesigns, copyDesigns, BOARD_DESIGNS, SNAPSHOT_DESIGNS } from '../shared-designs.js';
import { initializeState, getState, updateState, updateStateSilently } from '../store.js';
import { createEntityStore } from '../../sync-v2/entity-store.js';
import { reduceCanonicalEvent } from '../../sync-v2/event-reducer.js';

// One token move copied the whole of the board's state two or three times, each copy with every
// scene's walls and ground heights in it (found October 9: about 40 ms a copy with three such maps).
// The copy is still a whole copy, equal to the old one in every part; a scene's design is simply
// not copied again while it has not changed.
const old = (value) => JSON.parse(JSON.stringify(value));
const design = (seed, size = 600) => ({ n: 30, m: 20, h: Array.from({ length: size }, (_, i) => Math.round(Math.sin(i * seed) * 1e4) / 1e4) });
const wallsOf = (count) => ({ version: 1, nodes: Array.from({ length: count * 2 }, (_, i) => ({ id: `n${i}`, x: i, y: i % 7 })), segments: Array.from({ length: count }, (_, i) => ({ id: `w${i}`, a: `n${i * 2}`, b: `n${i * 2 + 1}`, sight: 'limited' })), roofs: [], ramps: [] });
function boardState() {
  return {
    user: { isGM: true, name: 'GM' }, scenes: { items: [{ id: 'a', name: 'A' }] }, tokens: { items: [] },
    boardState: {
      activeSceneId: 'a', mapUrl: '/map.jpg',
      placements: { a: [{ id: 'hero', column: 1, row: 2 }], b: [] },
      sceneState: {
        a: { grid: { size: 72 }, environment: { walls: { revision: 3, value: wallsOf(40) }, terrain: { revision: 2, value: design(0.37) }, exploration: { revision: 1, value: { resetId: 'r1' } } }, fogOfWar: { automaticEnabled: true }, mapLevels: { levels: [] } },
        b: { environment: { terrain: { revision: 9, value: design(0.11) } }, combat: { active: false } },
        c: { grid: { size: 64 } },
      },
      templates: { a: [] }, pings: [],
    },
  };
}

test('the copy is equal in every part, and in the order of its parts, to writing the state out and reading it back', () => {
  const awkward = boardState();
  // Everything the old copy quietly dropped or changed must be dropped or changed the same way.
  Object.assign(awkward, { missing: undefined, when: new Date(Date.UTC(2026, 9, 9)), run() {}, nothing: null, 7: 'seven', 2: 'two' });
  Object.assign(awkward.boardState, { later: undefined, list: [1, undefined, () => 1, NaN], 3: 'three' });
  Object.assign(awkward.boardState.sceneState, { d: null, e: 'text', f: [1, 2], g: { environment: null }, h: { environment: [1, 2] }, i: { environment: { walls: null, terrain: 5, flags: { revision: 1 }, plain: { revision: 2, value: 'text' }, list: { revision: 3, value: [1, { a: undefined, b: 2 }] }, gone: undefined } } });
  awkward.boardState.sceneState.a.environment.walls.note = undefined;
  awkward.boardState.sceneState.a.environment.walls.value.view = { slant: 0.12, skip: undefined };
  const copy = copySharingDesigns(awkward, BOARD_DESIGNS);
  assert.deepEqual(copy, old(awkward));
  assert.equal(JSON.stringify(copy), JSON.stringify(old(awkward)), 'the same parts in the same order');
  assert.deepEqual(Object.keys(copy), Object.keys(old(awkward)));
  assert.deepEqual(Object.keys(copy.boardState.sceneState.i.environment), Object.keys(old(awkward).boardState.sceneState.i.environment));
  // Things that are not a plain state at all are copied the old way.
  for (const odd of [null, 5, 'text', [1, { environment: { walls: { revision: 1, value: { a: 1 } } } }]]) assert.deepEqual(copySharingDesigns(odd, BOARD_DESIGNS), old(odd));
  assert.deepEqual(copyDesigns(null), old(null)); assert.deepEqual(copyDesigns([1]), [1]);
});

test('nothing in the copy is the live state, so the copy cannot change it', () => {
  const live = boardState(), copy = copySharingDesigns(live, BOARD_DESIGNS);
  assert.notEqual(copy.boardState.sceneState.a.environment.terrain.value, live.boardState.sceneState.a.environment.terrain.value);
  assert.notEqual(copy.boardState.sceneState.a.environment.terrain.value.h, live.boardState.sceneState.a.environment.terrain.value.h);
  assert.notEqual(copy.boardState.sceneState.a.environment.terrain, live.boardState.sceneState.a.environment.terrain);
  assert.notEqual(copy.boardState.placements.a[0], live.boardState.placements.a[0]);
  copy.boardState.placements.a[0].column = 99; copy.boardState.sceneState.a.grid.size = 1;
  assert.equal(live.boardState.placements.a[0].column, 1); assert.equal(live.boardState.sceneState.a.grid.size, 72);
});

test('a design that has not changed is not copied again; one that has is', () => {
  const live = boardState(), first = copySharingDesigns(live, BOARD_DESIGNS);
  live.boardState.placements.a[0].column = 5; // a token moves
  const second = copySharingDesigns(live, BOARD_DESIGNS);
  assert.equal(second.boardState.placements.a[0].column, 5);
  for (const [scene, field] of [['a', 'walls'], ['a', 'terrain'], ['a', 'exploration'], ['b', 'terrain']]) {
    assert.equal(second.boardState.sceneState[scene].environment[field].value, first.boardState.sceneState[scene].environment[field].value, `${scene} ${field} is the copy already made`);
  }
  assert.notEqual(second.boardState.sceneState.a.environment.terrain, first.boardState.sceneState.a.environment.terrain, 'the entry round it is still its own');
  // A new design, as the board receives one: a new object with a new revision.
  live.boardState.sceneState.a.environment = { ...live.boardState.sceneState.a.environment, walls: { revision: 4, value: wallsOf(41) } };
  const third = copySharingDesigns(live, BOARD_DESIGNS);
  assert.notEqual(third.boardState.sceneState.a.environment.walls.value, second.boardState.sceneState.a.environment.walls.value);
  assert.equal(third.boardState.sceneState.a.environment.walls.value.segments.length, 41);
  assert.equal(third.boardState.sceneState.a.environment.terrain.value, second.boardState.sceneState.a.environment.terrain.value, 'the ground did not change');
  assert.deepEqual(third, old(live));
  // The same object given a new revision is copied afresh.
  live.boardState.sceneState.b.environment.terrain.revision = 10;
  assert.notEqual(copySharingDesigns(live, BOARD_DESIGNS).boardState.sceneState.b.environment.terrain.value, third.boardState.sceneState.b.environment.terrain.value);
  // And so is a design changed in place with no new revision, by its size or a spread of its contents.
  const before = copySharingDesigns(live, BOARD_DESIGNS);
  live.boardState.sceneState.b.environment.terrain.value.h.push(1.5);
  const grown = copySharingDesigns(live, BOARD_DESIGNS);
  assert.notEqual(grown.boardState.sceneState.b.environment.terrain.value, before.boardState.sceneState.b.environment.terrain.value);
  assert.deepEqual(grown, old(live));
  live.boardState.sceneState.a.environment.terrain.value.h[0] = 123;
  assert.deepEqual(copySharingDesigns(live, BOARD_DESIGNS), old(live), 'a changed first height');
  live.boardState.sceneState.a.environment.walls.value.view = { slant: 0.2 };
  assert.deepEqual(copySharingDesigns(live, BOARD_DESIGNS), old(live), 'a new part');
});

test('the board\'s state is handed out whole and equal, and a token move does not copy the maps again', () => {
  const start = boardState();
  initializeState(start);
  const first = getState();
  assert.equal(getState(), first, 'the same copy until something changes');
  assert.equal(first.boardState.sceneState.a.environment.walls.value.segments.length, 40);
  assert.equal(first.boardState.sceneState.a.environment.terrain.value.h.length, 600);
  updateState((draft) => { draft.boardState.placements.a[0].column = 7; });
  const moved = getState();
  assert.notEqual(moved, first);
  assert.equal(moved.boardState.placements.a[0].column, 7);
  assert.equal(first.boardState.placements.a[0].column, 1, 'the copy handed out before is untouched');
  assert.equal(moved.boardState.sceneState.a.environment.terrain.value, first.boardState.sceneState.a.environment.terrain.value, 'the ground heights were not copied again');
  assert.equal(moved.boardState.sceneState.b.environment.terrain.value, first.boardState.sceneState.b.environment.terrain.value);
  updateStateSilently((draft) => { draft.boardState.placements.a[0].row = 9; });
  assert.equal(getState().boardState.placements.a[0].row, 9);
  // A design that arrives changed is seen at once.
  updateState((draft) => { draft.boardState.sceneState.a.environment = { ...draft.boardState.sceneState.a.environment, terrain: { revision: 3, value: design(0.5, 601) } }; });
  const changed = getState();
  assert.equal(changed.boardState.sceneState.a.environment.terrain.value.h.length, 601);
  assert.equal(changed.boardState.sceneState.a.environment.terrain.revision, 3);
  assert.equal(changed.boardState.sceneState.a.environment.walls.value, moved.boardState.sceneState.a.environment.walls.value);
  // Whatever the store holds, the copy is what writing it out and reading it back gives.
  const again = getState();
  assert.equal(JSON.stringify(again), JSON.stringify(old(again)));
});

test('the confirmed state from the server is handed out the same way, across events', () => {
  const snapshot = { revision: 4, appliedOperationIds: ['op-0001'], state: {
    placements: { a: { hero: { id: 'hero', column: 1, row: 2, _entityRevision: 1 } } }, drawings: { a: {} }, templates: { a: {} }, combat: {}, pings: {},
    sceneConfig: { a: { _revision: 2, grid: { size: 72 }, environment: { walls: { revision: 3, value: wallsOf(30) }, terrain: { revision: 2, value: design(0.2) } } }, b: { _revision: 1, environment: { terrain: { revision: 1, value: design(0.3) } } } },
  } };
  const store = createEntityStore(snapshot), first = store.getSnapshot();
  assert.deepEqual(first, old(store.getConfirmedSnapshot()));
  assert.equal(JSON.stringify(first), JSON.stringify(store.getConfirmedSnapshot()));
  assert.notEqual(first.state.sceneConfig.a.environment.terrain.value, store.getConfirmedSnapshot().state.sceneConfig.a.environment.terrain.value, 'not the confirmed state itself');
  first.state.placements.a.hero.column = 50;
  assert.equal(store.getConfirmedSnapshot().state.placements.a.hero.column, 1);
  // A token moves: the next copy has the move, and the maps are the copies already made.
  const moved = reduceCanonicalEvent(store.getConfirmedSnapshot(), { revision: 5, operationId: 'op-0002', actorId: 'GM', type: 'token.moved', sceneId: 'a', entityId: 'hero', entityRevision: 2, payload: { column: 6, row: 2 }, serverTime: 1 });
  assert.equal(moved.status, 'applied', JSON.stringify(moved.reason));
  store.commit(moved.snapshot, moved.changeSet);
  const second = store.getSnapshot();
  assert.equal(second.state.placements.a.hero.column, 6);
  assert.equal(second.state.sceneConfig.a.environment.terrain.value, first.state.sceneConfig.a.environment.terrain.value);
  assert.equal(second.state.sceneConfig.b.environment.terrain.value, first.state.sceneConfig.b.environment.terrain.value);
  assert.deepEqual(second, old(store.getConfirmedSnapshot()));
  assert.deepEqual(copySharingDesigns(store.getConfirmedSnapshot(), SNAPSHOT_DESIGNS), second);
});

test('the three places that copied every map on each move now share unchanged designs', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (name) => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');
  assert.match(read('state/store.js'), /cachedStateSnapshot = copySharingDesigns\(state, BOARD_DESIGNS\);/);
  assert.match(read('sync-v2/entity-store.js'), /function getSnapshot\(\) \{\s+return copySharingDesigns\(confirmed, SNAPSHOT_DESIGNS\);/);
  // Laid over the board, a design is a copy of the copy a snapshot reader is given: the board's own
  // state never holds an object handed to anyone else.
  assert.match(read('sync-v2/token-movement-runtime.js'), /field === 'environment' \? copyDesigns\(copyDesigns\(config\[field\] \?\? \{\}\)\) : clone\(config\[field\]\)/);
  const environment = { terrain: { revision: 1, value: design(0.7) } };
  const forReaders = copyDesigns(environment), forBoard = copyDesigns(copyDesigns(environment));
  assert.notEqual(forBoard.terrain.value, forReaders.terrain.value);
  assert.notEqual(forReaders.terrain.value, environment.terrain.value);
  assert.equal(copyDesigns(copyDesigns(environment)).terrain.value, forBoard.terrain.value, 'and it is the same one each time, so the board\'s state is not copied afresh either');
  assert.deepEqual(forBoard, old(environment));
});
