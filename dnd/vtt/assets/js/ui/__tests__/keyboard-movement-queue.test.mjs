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

// Presses that are drawn at once. `show` hands back the square it drew; the board here is one token.
function shownFixture({ refuseToShow = () => false } = {}) {
  let time = 0, context = 'scene:a', scene = 'scene', drawnAt = 0;
  const frames = [], calls = [], shown = [], asked = [], errors = [];
  let dropped = 0;
  const queue = createKeyboardMovementQueue({
    now: () => time, getContext: () => context,
    schedule: fn => frames.push(fn), onError: error => errors.push(error),
    show: (delta) => {
      asked.push(delta);
      if (refuseToShow(asked.length)) return null;
      drawnAt += delta.x; shown.push({ at: drawnAt, time });
      return { sceneId: scene, column: drawnAt };
    },
    keepShown: step => step.sceneId === scene,
    dropped: () => { dropped += 1; },
    move: (delta, step) => new Promise((resolve, reject) => calls.push({ delta, step, time, resolve, reject })),
  });
  return { queue, frames, calls, shown, asked, errors,
    get dropped() { return dropped; },
    advance: ms => { time += ms; },
    select: value => { context = value; queue.syncContext(); },
    leaveScene: () => { scene = 'elsewhere'; context = 'elsewhere:'; queue.syncContext(); },
    start: () => { const fn = frames.shift(); return fn?.(); },
  };
}

test('a press is drawn the moment its key goes down, however long the answer before it takes', async () => {
  // Build 456 on the live host: each press waited for the answer to the one before (a second each),
  // and presses that had waited three seconds were thrown away.
  const f = shownFixture();
  for (let i = 0; i < 10; i++) { f.queue.enqueue(right); f.advance(40); }
  assert.deepEqual(f.shown.map(s => s.at), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'every press is drawn, on its own square');
  assert.ok(f.shown.every((s, i) => s.time === i * 40), 'each as its key went down, none waiting for an answer');
  while (f.frames.length) {
    const running = f.start(); assert.equal(f.calls.filter(c => !c.done).length, 1, 'still one move with the server at a time');
    f.advance(1100); f.calls.at(-1).done = true; f.calls.at(-1).resolve(); await running;
  }
  assert.deepEqual(f.calls.map(c => c.step.column), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'what was drawn is what is sent, in order, none dropped for waiting');
  assert.equal(f.dropped, 0);
});

test('a drawn press outlives a change of selection; leaving the scene throws it away and puts the tokens back', async () => {
  const f = shownFixture();
  f.queue.enqueue(right); const running = f.start(); f.queue.enqueue(right); f.queue.enqueue(right);
  f.select('scene:b');
  assert.equal(f.dropped, 0);
  f.calls[0].resolve(); await running;
  const second = f.start(); assert.equal(f.calls[1].step.column, 2, 'still sent after the selection moved on');
  f.leaveScene();
  assert.equal(f.dropped, 1, 'the board is told to put the tokens back');
  f.calls[1].resolve(); await second;
  assert.equal(f.frames.length, 0); assert.equal(f.calls.length, 2);
});

test('a refused move throws away the presses drawn after it, once', async () => {
  for (const failure of [false, new Error('refused')]) {
    const f = shownFixture();
    for (let i = 0; i < 4; i++) f.queue.enqueue(right);
    const running = f.start();
    if (failure === false) f.calls[0].resolve(false); else f.calls[0].reject(failure);
    await running;
    assert.equal(f.calls.length, 1, 'nothing drawn after it is sent'); assert.equal(f.frames.length, 0);
    assert.equal(f.dropped, 1);
    assert.equal(f.errors.length, failure === false ? 0 : 1);
  }
});

test('a press that cannot be drawn ahead waits unseen, and so does every press after it until it is done', async () => {
  // The second press would raise the climb question: it is asked when its turn comes, as it always was.
  const f = shownFixture({ refuseToShow: n => n === 2 });
  for (let i = 0; i < 4; i++) f.queue.enqueue(right);
  assert.equal(f.asked.length, 2, 'presses after an unseen one are not drawn from a square the token may never reach');
  assert.deepEqual(f.shown.map(s => s.at), [1]);
  let running = f.start(); f.calls[0].resolve(); await running;
  running = f.start(); assert.equal(f.calls[1].step, null, 'the unseen press is counted when its turn comes');
  f.queue.enqueue(right); assert.equal(f.asked.length, 2, 'and one made while it is being asked waits too');
  f.calls[1].resolve(); await running;
  while (f.frames.length) { running = f.start(); f.calls.at(-1).resolve(); await running; }
  assert.equal(f.calls.length, 5);
  f.queue.enqueue(right); assert.equal(f.asked.length, 3, 'once they are done, presses are drawn at once again');
  // Unseen presses still expire, as every press used to.
  const g = shownFixture({ refuseToShow: () => true });
  g.queue.enqueue(right); g.advance(3000); await g.start(); assert.equal(g.calls.length, 0);
});

test('a drag made while presses wait takes its turn after them; with nothing waiting it is made at once', async () => {
  const f = shownFixture(), order = [];
  let finishDrag;
  const drag = () => { order.push('drag made'); return new Promise((resolve) => { finishDrag = resolve; }); };
  // Nothing waiting: made within the call itself, as if the queue were not there.
  const first = f.queue.follow(drag);
  assert.deepEqual(order, ['drag made']);
  // A press made before the drag is answered is drawn at once and waits for it.
  f.queue.enqueue(right); assert.equal(f.shown.length, 1); assert.equal(f.frames.length, 0);
  finishDrag('moved'); assert.equal(await first, 'moved');
  let running = f.start(); assert.equal(f.calls.length, 1);
  // A drag dropped while that press is unanswered goes after it, and after a press made before it.
  f.queue.enqueue(right);
  const second = f.queue.follow(drag);
  f.queue.enqueue(right);
  assert.deepEqual(order, ['drag made'], 'the second drag has not been made yet');
  f.calls[0].resolve(); await running;
  running = f.start(); f.calls[1].resolve(); await running;
  running = f.start(); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(order, ['drag made', 'drag made']); assert.equal(f.calls.length, 2, 'the press after the drag waits for its answer');
  finishDrag(false); assert.equal(await second, false); await running;
  assert.equal(f.frames.length, 0, 'a refused drag drops the press drawn after it'); assert.equal(f.dropped, 1);
  // A drag still waiting when a press before it is refused is never made, and is told so.
  const g = shownFixture(); let made = false;
  g.queue.enqueue(right); running = g.start();
  const waiting = g.queue.follow(() => { made = true; });
  g.calls[0].resolve(false); await running;
  assert.equal(await waiting, false); assert.equal(made, false); assert.equal(g.dropped, 1);
});

test('a square is drawn ahead, and seen from, only when the browser itself finds the way to it clear', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  // A press into a wall or a shut door is not drawn ahead: it waits its turn and the server refuses it.
  assert.match(source, /if \(!clearToSeeFrom\(record, from, move\)\) return null;/);
  // The Director's moves are not stopped by walls. Anyone else's are checked with the browser's copy
  // of the server's wall check; where that cannot be made the answer is no.
  assert.match(source, /function clearToSeeFrom\(record, from, to\) \{\s+if \(isGmUser\(\)\) return true;\s+const walls = window\.wallPrototype;\s+if \(typeof walls\?\.blockedMove !== 'function'\) return false;/);
  assert.match(source, /if \(\(record\.levelId \|\| BASE_MAP_LEVEL_ID\) !== \(viewerLevelId \|\| BASE_MAP_LEVEL_ID\)\) return false;\s+return !walls\.blockedMove\(/);
  // Sight is handed the square a token may be seen from, never simply where it is drawn.
  assert.match(source, /const sightSquareOf = \(placementId\) => keyboardAhead\.get\(placementId\)\?\.see \?\? null;/);
  assert.match(source, /see: clear \? square : held\?\.see \?\? null \}\);/);
  // A drag held at its drop square is seen from only if it was a walk or a shift, and the way is clear.
  assert.match(source, /if \(waiting\) holdKeyboardAhead\(sceneId, moves, movementKind === 'walk' \|\| movementKind === 'shift'\);/);
});

test('a player\'s press into a wall is sent without the token being drawn through the wall', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  // Found by the tester on Build 458: such a press was not drawn ahead, but when its turn came the
  // move was drawn while the server's refusal was awaited, as every move sent is.
  assert.match(source, /function wallStopsStep\(record, to\) \{\s+if \(isGmUser\(\)\) return false;\s+try \{\s+return Boolean\(window\.wallPrototype\?\.blockedMove\?\.\(record, \{ column: Number\(to\.column\), row: Number\(to\.row\) \}\)\);/);
  assert.match(source, /\.\.\.\(!showOnly && wallStopsStep\(effective, \{ column: nextColumn, row: nextRow \}\) \? \{ unseen: true \} : \{\}\),/);
  const runtime = readFileSync(new URL('../../sync-v2/token-movement-runtime.js', import.meta.url), 'utf8');
  assert.match(runtime, /if \(!move\.unseen\) paintPendingPreview\(sceneId, placementId, preview\);/);
  assert.match(runtime, /if \(move\.unseen\) continue;/);
});
