import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMapPings } from '../map-pings.js';

// Brandon, October 12, 2026:
// "Auras appear on the ground instead of tied to a token. so if a token is in the air... the aura is on the
// ground way under them."
// "The pings have the same issue, being drawn on the lowest part of the map instead of the level you click on."
// "There needs to be a tiny button in the top right that causes a ping to emit from your token so you can find
// where it is on the map and it centers your screen on your token."
//
// The board leans: a point of the map at a height is drawn up and across from the ground under it. A ping kept
// only its place on the flat map, so it was drawn on the ground however high the floor that was clicked; an aura
// was placed by its token's square and never lifted with the token.

// A board 1000 by 800 with a floor ten squares up, on a view that draws a height of h squares 4h across and 12h up.
function board({ pointer }) {
  const pulses = [], state = { boardState: { activeSceneId: 'scene', pings: [] } }, focus = [];
  const view = { mapLoaded: true, mapPixelSize: {width:1000,height:800} };
  const pings = createMapPings({
    windowRef: {vtt3d:{active:true, helpers:{toSquares:(x,y)=>({x:x/50,y:y/50}),groundAt:()=>0}},
      vtt3dRenderer:{focus:p=>focus.push(p)},vtt3dLayers:{pings:{pulse:p=>pulses.push(p)}}},
    getViewState:()=>view,getBoardState:()=>state,updateBoardState:change=>change(state),
    getCurrentUserId:()=>'cal',getLocalMapPoint:()=>pointer,
  });
  return {pings,pulses,state,focus};
}

test('a ping keeps the height of what was clicked and is drawn there', () => {
  const up = board({ pointer: { x: 500, y: 400, height: 10 } });
  assert.equal(up.pings.handleMapPing({}), true);
  const sent = up.state.boardState.pings[0];
  assert.deepEqual([sent.x, sent.y, sent.z], [0.5, 0.5, 10], 'the place on the flat map, and the height');
  assert.deepEqual(up.pulses, [{ x:500,y:400,z:10,type:'ping' }], 'drawn where that floor is drawn, not on the ground under it');
  // On the ground it is as it always was, and says nothing of height.
  const ground = board({ pointer: { x: 500, y: 400, height: 0 } });
  ground.pings.handleMapPing({});
  assert.equal('z' in ground.state.boardState.pings[0], false);
  assert.deepEqual(ground.pulses, [{ x:500,y:400,z:null,type:'ping' }]);
  // A page that does not say the height (an older one) still pings.
  const old = board({ pointer: { x: 100, y: 80 } });
  assert.equal(old.pings.handleMapPing({}), true);
  assert.deepEqual(old.pulses, [{ x:100,y:80,z:null,type:'ping' }]);
});

test('a ping from another page is drawn at its height too, and a focus ping centres on it there', () => {
  const b = board({ pointer: null });
  assert.equal(b.pings.normalizeIncomingPing({ id: 'p', x: 0.5, y: 0.5, z: 10 }).z, 10);
  assert.equal('z' in b.pings.normalizeIncomingPing({ id: 'p', x: 0.5, y: 0.5 }), false);
  assert.equal('z' in b.pings.normalizeIncomingPing({ id: 'p', x: 0.5, y: 0.5, z: 'high' }), false, 'a height that is not a number is no height');
  b.pings.processIncomingPings([{ id: 'other:1', sceneId: 'scene', x: 0.5, y: 0.5, z: 10, type: 'focus', createdAt: Date.now(), authorId: 'frunk' }], 'scene');
  assert.deepEqual(b.pulses[0], { x:500,y:400,z:10,type:'focus' });
  // The view (400 by 300) is moved so the drawn point, 540 across and 280 down, is in its middle.
  assert.deepEqual(b.focus, [{x:10,y:8,z:10}]);
  assert.deepEqual(b.pings.sanitizePingsForPersistence([{ id: 'p', x: 0.5, y: 0.5, z: 3, createdAt: Date.now() }])[0].z, 3, 'the height is kept when pings are saved');
});

test('the find-my-token pulse is on this page only', () => {
  const b = board({ pointer: null });
  b.pings.pulseAt(321, 123);
  assert.deepEqual(b.pulses, [{ x:321,y:123,z:null,type:'ping' }]);
  assert.deepEqual(b.state.boardState.pings, [], 'nothing is put in the shared state');
});

test('a ping\'s height survives the store, which is how every other page receives it', async () => {
  const { normalizePingEntry, normalizePings } = await import('../../state/normalize/pings.js');
  const arrived = { id: 'cal:1', sceneId: 'scene', x: 0.25, y: 0.5, z: 6, type: 'ping', createdAt: Date.now(), authorId: 'Cal' };
  assert.equal(normalizePingEntry(arrived).z, 6);
  assert.equal(normalizePings([arrived])[0].z, 6);
  assert.equal(normalizePingEntry({ ...arrived, z: -8.5 }).z, -8.5, 'down a pit too');
  for (const none of [0, null, undefined, 'high', NaN]) assert.equal('z' in normalizePingEntry({ ...arrived, z: none }), false, `no height for ${none}`);
  // And through the whole of another page: the store's entry is drawn at its height.
  const b = board({ pointer: null });
  b.pings.processIncomingPings(normalizePings([arrived]), 'scene');
  const flat = board({ pointer: null });
  flat.pings.processIncomingPings(normalizePings([{ ...arrived, z: 0 }]), 'scene');
  assert.notDeepEqual(b.pulses[0], flat.pulses[0], 'not where the same ping on the ground is drawn');
});

// Also the tester's, older than 485: an aura stayed where it was when its token was moved, on every page, until
// a reload. A confirmed move moved the token alone.
