import test from 'node:test';
import assert from 'node:assert/strict';
import {createKeyboardMovementQueue} from '../keyboard-movement-queue.js';

function fixture() {
  let time = 0, context = 'scene:a,b';
  const frames = [], calls = [], errors = [];
  const queue = createKeyboardMovementQueue({
    now: () => time, getContext: () => context,
    schedule: fn => frames.push(fn), onError: error => errors.push(error),
    move: delta => new Promise((resolve, reject) => calls.push({ delta, time, context, resolve, reject })),
  });
  return { queue, frames, calls, errors,
    advance: ms => { time += ms; },
    context: value => { context = value; queue.syncContext(); },
    start: () => { const fn = frames.shift(); return fn?.(); },
  };
}
const right = { x: 1, y: 0 };

test('50 inputs are bounded and expire while the submitted command remains in flight', async () => {
  const f = fixture();
  const admitted = Array.from({ length: 50 }, () => f.queue.enqueue(right)).filter(Boolean).length;
  assert.equal(admitted, 12);
  const running = f.start();
  f.advance(10000);
  assert.equal(f.calls.length, 1, 'No concurrent submission or cancellation');
  f.calls[0].resolve(); await running;
  assert.equal(f.frames.length, 0, 'Nothing stale starts after the slow acknowledgment');
});

test('slow moves stop starting within three seconds of the last input', async () => {
  const f = fixture();
  for (let i = 0; i < 50; i++) f.queue.enqueue(right);
  while (f.frames.length) {
    const running = f.start(); f.advance(1200); f.calls.at(-1).resolve(); await running;
  }
  assert.deepEqual(f.calls.map(c => c.time), [0, 1200, 2400]);
});

test('responsive bursts and changes of direction retain order', async () => {
  const f = fixture(), directions = [right, right, { x: -1, y: 0 }, { x: 0, y: 1 }];
  directions.forEach(d => f.queue.enqueue(d));
  while (f.frames.length) {
    const running = f.start(); f.advance(100); f.calls.at(-1).resolve(); await running;
  }
  assert.deepEqual(f.calls.map(c => c.delta), directions);
});

test('held repeat admits fresh inputs without reviving expired ones', async () => {
  const f = fixture(); f.queue.enqueue(right); let running = f.start();
  for (let i = 0; i < 100; i++) { f.advance(40); f.queue.enqueue(right); }
  f.calls[0].resolve(); await running;
  assert.equal(f.frames.length, 1, 'Fresh repeat input remains available');
  running = f.start(); f.advance(4000); f.calls.at(-1).resolve(); await running;
  assert.equal(f.frames.length, 0, 'Release drains no stale repeats after a delayed response');
});

test('selection and scene changes clear pending input even when switching back', async () => {
  for (const context of ['scene:c', 'other:a,b', 'scene:']) {
    const f = fixture(); f.queue.enqueue(right); const running = f.start(); f.queue.enqueue(right);
    f.context(context); f.context('scene:a,b');
    f.calls[0].resolve(); await running;
    assert.equal(f.frames.length, 0);
    f.queue.enqueue({ x: 0, y: 1 }); const fresh = f.start();
    assert.equal(f.calls.length, 2); f.calls[1].resolve(); await fresh;
  }
});

test('rejection, timeout and failed follow-up discard pending input without replay', async () => {
  for (const failure of [false, new Error('rejected'), new Error('timeout')]) {
    const f = fixture(); f.queue.enqueue(right); const running = f.start(); f.queue.enqueue(right);
    if (failure === false) f.calls[0].resolve(false); else f.calls[0].reject(failure);
    await running;
    assert.equal(f.frames.length, 0); assert.equal(f.calls.length, 1);
    assert.equal(f.errors.length, failure === false ? 0 : 1);
  }
});

test('input expires before a delayed animation frame can submit it', async () => {
  const f = fixture(); f.queue.enqueue(right); f.advance(3000); await f.start();
  assert.equal(f.calls.length, 0);
});
