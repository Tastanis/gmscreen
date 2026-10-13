import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveForcedDrag} from '../forced-drag.js';
const from={id:'a',column:0,row:0,width:1,height:1};
test('forced drag stops at first creature and uses remaining distance',()=>{
 const r=resolveForcedDrag(from,{column:5,row:0},[{id:'b',column:2,row:0},{id:'c',column:4,row:0}]);
 assert.equal(r.destination.column,1);assert.equal(r.damage,4);assert.deepEqual(r.collidedIds,['b']);
});
test('solid object adds two damage; teleport does not use this resolver',()=>{
 const r=resolveForcedDrag(from,{column:5,row:0},[],{wallBlocked:(a,b)=>b.column>2});
 assert.ok(Math.abs(r.destination.column-2)<1e-6);assert.equal(r.damage,5);assert.equal(r.wall,true);
});
test('large token damages simultaneous creatures once each without multiplying self damage',()=>{
 const r=resolveForcedDrag({...from,height:2},{column:5,row:0},[{id:'b',column:2,row:0},{id:'c',column:2,row:1}]);
 assert.equal(r.damage,4);assert.deepEqual(r.collidedIds,['b','c']);
});
test('touching edges, different floors and separated heights do not collide',()=>{
 for(const other of [{id:'b',column:2,row:1},{id:'b',column:2,row:0,levelId:'up'}]) assert.equal(resolveForcedDrag(from,{column:5,row:0},[other]).damage,0);
 assert.equal(resolveForcedDrag(from,{column:5,row:0},[{id:'b',column:2,row:0}],{height:p=>p.id==='b'?5:0}).damage,0);
});

test('fliers at the same physical altitude collide across nominal floors',()=>{
 const r=resolveForcedDrag({...from,movementMode:'fly'},{column:5,row:0},[{id:'b',column:2,row:0,levelId:'upper',movementMode:'hover'}],{height:()=>8});
 assert.equal(r.damage,4);assert.deepEqual(r.collidedIds,['b']);
});

test('preexisting stacked tokens can separate without a new slam',()=>{
 assert.equal(resolveForcedDrag(from,{column:5,row:0},[{...from,id:'b'}]).damage,0);
});

// Found by the tester on Brandon's own Gravity Orchard, October 12, 2026: a creature on a platform 12 up, pushed 10
// west, ended standing 16.92 up on the crater wall, higher than it started, with no fall. The wall rightly stopped
// the push, but a stopped push rounds to a whole square, and it rounded up INTO the wall's own face.
// The server's side is push-into-rising-ground.test.php.
test('a push stopped by rising ground ends at its foot, not part-way up it', () => {
  const from = { id: 'pushed', column: 14, row: 14, width: 1, height: 1 }, to = { ...from, column: 4 };
  // The crater wall's face is the square at column 5 (footing 16); east of it the crater floor, then the platform.
  const footing = (token) => (token.column <= 5 ? 16 : token.column >= 8 ? 12 : 0);
  const stoppedAtTheFace = (origin, end) => end.column < 5.2;   // 8.8 squares in: three quarters into the face square
  const pushed = resolveForcedDrag(from, to, [], { wallBlocked: stoppedAtTheFace, height: footing, moverHeight: () => 12 });
  assert.deepEqual([pushed.destination.column, pushed.destination.row, pushed.wall], [6, 14, true], 'he ends on the crater floor at the wall\'s foot, where the fall is his');
  assert.equal(pushed.damage, 2 + 2, 'the two squares left of the push, and two for a solid thing');
  // The same stop against a wall standing on level ground: the square it always was.
  const level = resolveForcedDrag(from, to, [], { wallBlocked: stoppedAtTheFace, height: () => 0, moverHeight: () => 0 });
  assert.deepEqual([level.destination.column, level.wall, level.damage], [5, true, 1 + 2]);
  // And with nothing said about heights at all, as the plainest callers do.
  assert.equal(resolveForcedDrag(from, to, [], { wallBlocked: stoppedAtTheFace }).destination.column, 5);
  // A rise of less than a square is a step, not a face.
  const step = resolveForcedDrag(from, to, [], { wallBlocked: stoppedAtTheFace, height: (token) => (token.column <= 5 ? 0.9 : 0), moverHeight: () => 0 });
  assert.equal(step.destination.column, 5);
});
