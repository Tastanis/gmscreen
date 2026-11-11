import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIRST_PERSON_DEFAULTS, normalizeSettings, lookVector, rightVector, turnLook, moveIntent, stepCamera,
  standHeight, followGround, flyFloor, eyeHeightFor, startPitch,
} from '../../../../board3d/first-person-motion.mjs';

// First-person walk and fly (Brandon, November 10, 2026): "WASD will move you around the camera ... the mouse will aim
// you ... keep you stuck to the ground unless your character has the flying turned on, in which case you can just fly
// around freely with the camera." A camera view only; it never moves a token.

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);
const S = normalizeSettings();

test('settings: defaults, valid overrides, and bad values keep the default', () => {
  assert.deepEqual({ ...normalizeSettings() }, { ...FIRST_PERSON_DEFAULTS });
  const s = normalizeSettings({ walkSpeed: '7', flySpeed: -3, eyeHeightFactor: 99, lookSensitivity: null, fov: [40, 80], stranger: 5 });
  assert.equal(s.walkSpeed, 7);
  assert.equal(s.flySpeed, FIRST_PERSON_DEFAULTS.flySpeed, 'negative speed ignored');
  assert.equal(s.eyeHeightFactor, 2, 'clamped to its range');
  assert.equal(s.lookSensitivity, FIRST_PERSON_DEFAULTS.lookSensitivity);
  assert.deepEqual(s.fov, [40, 80]);
  assert.equal('stranger' in s, false);
  assert.deepEqual(normalizeSettings({ fov: [90, 40] }).fov, FIRST_PERSON_DEFAULTS.fov, 'a backwards range is ignored');
  assert.deepEqual({ ...normalizeSettings('nonsense') }, { ...FIRST_PERSON_DEFAULTS });
});

test('look and right vectors match the board: yaw 0 looks down the rows, right is toward lower columns', () => {
  const ahead = lookVector(0, 0);
  near(ahead.x, 0); near(ahead.y, 0); near(ahead.z, 1);
  const r = rightVector(0);
  near(r.x, -1); near(r.z, 0);
  const up = lookVector(0, Math.PI / 4);
  near(Math.hypot(up.x, up.y, up.z), 1);
  assert.ok(up.y > 0);
  // Turning right (positive pointer x) swings the look toward "right".
  const turned = turnLook({ yaw: 0, pitch: 0 }, 10, 0, 0.01);
  const dir = lookVector(turned.yaw, turned.pitch);
  assert.ok(dir.x * r.x + dir.z * r.z > 0);
});

test('mouse down looks down, and the pitch stays inside its limit', () => {
  assert.ok(turnLook({ yaw: 0, pitch: 0 }, 0, 10, 0.01).pitch < 0);
  assert.equal(turnLook({ yaw: 0, pitch: 0 }, 0, -10000, 0.01, 1.2).pitch, 1.2);
  assert.equal(turnLook({ yaw: 0, pitch: 0 }, 0, 10000, 0.01, 1.2).pitch, -1.2);
});

test('held keys: W A S D, opposite keys cancel, Shift is fast', () => {
  assert.deepEqual(moveIntent(new Set(['KeyW', 'KeyD'])), { forward: 1, strafe: 1, rise: 0, turn: 0, tilt: 0, fast: false });
  assert.equal(moveIntent(new Set(['KeyW', 'KeyS'])).forward, 0);
  assert.equal(moveIntent(new Set(['KeyA'])).strafe, -1);
  assert.equal(moveIntent(new Set(['Space'])).rise, 1);
  assert.equal(moveIntent(new Set(['KeyC'])).rise, -1);
  assert.equal(moveIntent(new Set(['ShiftLeft'])).fast, true);
  assert.equal(moveIntent(new Set(['ArrowRight', 'ArrowUp'])).turn, 1);
  assert.equal(moveIntent(new Set(['KeyX'])).forward, 0);
});

test('on foot: W walks level along the look even when looking down; height is left to the ground', () => {
  const look = { yaw: 0, pitch: -1 };
  const next = stepCamera({ x: 5, y: 2, z: 5 }, look, moveIntent(new Set(['KeyW'])), 0.1, S);
  near(next.x, 5); near(next.y, 2); near(next.z, 5 + S.walkSpeed * 0.1);
  const back = stepCamera({ x: 5, y: 2, z: 5 }, look, moveIntent(new Set(['KeyS'])), 0.1, S);
  near(back.z, 5 - S.walkSpeed * 0.1);
  const side = stepCamera({ x: 5, y: 2, z: 5 }, look, moveIntent(new Set(['KeyD'])), 0.1, S);
  near(side.x, 5 - S.walkSpeed * 0.1); near(side.z, 5);
  const up = stepCamera({ x: 5, y: 2, z: 5 }, look, moveIntent(new Set(['Space'])), 0.1, S);
  assert.deepEqual(up, { x: 5, y: 2, z: 5 }, 'no rising on foot');
});

test('diagonals are not faster; Shift multiplies; a stalled frame is capped', () => {
  const diag = stepCamera({ x: 0, y: 0, z: 0 }, { yaw: 0, pitch: 0 }, moveIntent(new Set(['KeyW', 'KeyD'])), 1 / 10, S);
  near(Math.hypot(diag.x, diag.z), S.walkSpeed / 10);
  const fast = stepCamera({ x: 0, y: 0, z: 0 }, { yaw: 0, pitch: 0 }, moveIntent(new Set(['KeyW', 'ShiftLeft'])), 1 / 10, S);
  near(fast.z, S.walkSpeed * S.fastFactor / 10);
  const stalled = stepCamera({ x: 0, y: 0, z: 0 }, { yaw: 0, pitch: 0 }, moveIntent(new Set(['KeyW'])), 5, S);
  near(stalled.z, S.walkSpeed * 0.1);
});

test('flying: W follows the look up, Space and C lift and drop', () => {
  const climb = stepCamera({ x: 0, y: 3, z: 0 }, { yaw: 0, pitch: 0.5 }, moveIntent(new Set(['KeyW'])), 0.1, S, { flying: true });
  assert.ok(climb.y > 3);
  near(Math.hypot(climb.x, climb.y - 3, climb.z), S.flySpeed * 0.1);
  const lift = stepCamera({ x: 0, y: 3, z: 0 }, { yaw: 0, pitch: 0 }, moveIntent(new Set(['Space'])), 0.1, S, { flying: true });
  near(lift.y, 3 + S.flySpeed * 0.1);
  const drop = stepCamera({ x: 0, y: 3, z: 0 }, { yaw: 0, pitch: 0 }, moveIntent(new Set(['KeyC'])), 0.1, S, { flying: true });
  near(drop.y, 3 - S.flySpeed * 0.1);
});

test('standing: under a balcony on the ground, onto a floor reached by its stairs, up a stair', () => {
  assert.equal(standHeight(0 + S.stepUp, 0, [3]), 0, 'a floor overhead is walked under');
  assert.equal(standHeight(3 + S.stepUp, 0, [3]), 3, 'a floor at the feet is stood on');
  assert.equal(standHeight(1.2 + S.stepUp, 0, [], [1.5]), 1.5, 'the next bit of stair is stepped up');
  assert.equal(standHeight(0.6, 0.2, [6], [5]), 0.2, 'nothing reachable: the ground');
  assert.equal(standHeight(2, NaN, [], []), 0, 'no ground known: zero');
  assert.equal(standHeight(10, 4, [2]), 4, 'the ground above an old plate still counts');
});

test('the feet settle onto new ground without overshooting, and arrive', () => {
  let feet = 0;
  for (let i = 0; i < 4; i += 1) { feet = followGround(feet, 3, 1 / 60); assert.ok(feet > 0 && feet < 3); }
  for (let i = 0; i < 200; i += 1) feet = followGround(feet, 3, 1 / 60);
  assert.equal(feet, 3);
  assert.equal(followGround(NaN, 2, 0.1), 2);
  assert.equal(followGround(1, NaN, 0.1), 1);
});

test('flying keeps a little above the ground and is otherwise free', () => {
  assert.equal(flyFloor(-5, 1, 0.15), 1.15);
  assert.equal(flyFloor(20, 1, 0.15), 20);
  assert.equal(flyFloor(3, NaN), 3);
});

test('eye height scales with the model and has a floor; start tilt looks a little down', () => {
  near(eyeHeightFor(2, S), 2 * S.eyeHeightFactor);
  near(eyeHeightFor(0.1, S), S.minEyeHeight);
  near(eyeHeightFor(undefined, S), 1.1 * S.eyeHeightFactor);
  assert.equal(startPitch(1, 1), -0.05);
  assert.equal(startPitch(100, 0), -0.75);
  assert.ok(startPitch(4, 0) < -0.05);
});
