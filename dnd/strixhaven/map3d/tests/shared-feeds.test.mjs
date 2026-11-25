// The campus map's two shared feeds (pings twice a second, the route every second and a half).
// November 24, 2026: during play the host ran out of processes. Each open map started a new read on every tick
// whether or not the last one had answered, so a slow host was sent more and more requests to be slow about.
// Each feed now has one read out at a time, waits longer after a failure, and reads at once when the page is
// shown again or the connection is back. Sending a ping and changing the route are not part of this.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../index.php', import.meta.url), 'utf8');
const slice = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Missing source boundaries: ${start} / ${end}`);
  return source.slice(from, to);
};
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };

function feed(every) {
  const reads = [], heard = {}, timers = [], page = { hidden: false, ready: true, clock: 1000000 };
  const context = vm.createContext({
    Promise, Math,
    Date: { now: () => page.clock },
    document: { get hidden() { return page.hidden; }, addEventListener(name, fn) { heard[name] = fn; } },
    window: { get __sx() { return page.ready ? {} : undefined; } },
    addEventListener(name, fn) { heard[name] = fn; },
    setInterval(fn, ms) { timers.push({ fn, ms }); return timers.length; },
    read() { const d = deferred(); reads.push(d); return d.promise; }
  });
  vm.runInContext(slice('const sharedFeed =', 'const feedGet ='), context);
  vm.runInContext(`sharedFeed(read, ${every})`, context);
  assert.equal(timers.length, 1); assert.equal(timers[0].ms, every);
  return { reads, heard, page, tick: timers[0].fn, wait: ms => { page.clock += ms; } };
}

test('a feed has one read out at a time, however slow the answer', async () => {
  const f = feed(500);
  for (let i = 0; i < 8; i++) { f.tick(); f.wait(500); await flush(); }
  assert.equal(f.reads.length, 1, 'eight ticks behind one slow answer started one read');
  f.reads[0].resolve(true); await flush();
  f.tick(); await flush();
  assert.equal(f.reads.length, 2, 'the next tick after the answer reads again, at the usual pace');
});

test('a failed read is tried again later and later, never more than 15 seconds apart, and a good one restores the pace', async () => {
  const f = feed(500);
  const failThenCount = async (fail) => {          // fail the read that is out, then count how long until the next one starts
    fail(); await flush();
    let waited = 0; const before = f.reads.length;
    while (f.reads.length === before && waited < 60000) { f.tick(); await flush(); if (f.reads.length === before) { f.wait(250); waited += 250; } }
    return waited;
  };
  f.tick(); await flush();
  const gaps = [];
  for (let i = 0; i < 7; i++) gaps.push(await failThenCount(() => (i % 2 ? f.reads.at(-1).reject(new Error('down')) : f.reads.at(-1).resolve(false))));
  assert.deepEqual(gaps, [1000, 2000, 4000, 8000, 15000, 15000, 15000], 'a refused answer and a broken connection both count');
  f.reads.at(-1).resolve(true); await flush();
  f.tick(); await flush();
  const count = f.reads.length;
  f.reads.at(-1).resolve(true); await flush(); f.tick(); await flush();
  assert.equal(f.reads.length, count + 1, 'after a good answer the very next tick reads');
});

test('a hidden page, or one whose map is not up yet, reads nothing', async () => {
  const f = feed(1500);
  f.page.hidden = true; f.tick(); await flush(); assert.equal(f.reads.length, 0);
  f.page.hidden = false; f.page.ready = false; f.tick(); await flush(); assert.equal(f.reads.length, 0);
  f.page.ready = true; f.tick(); await flush(); assert.equal(f.reads.length, 1);
});

test('coming back (the page shown again, the connection restored) reads the current state at once', async () => {
  for (const event of ['visibilitychange', 'online']) {
    const f = feed(1500);
    f.tick(); await flush(); f.reads[0].reject(new Error('down')); await flush();
    f.tick(); await flush(); assert.equal(f.reads.length, 1, 'waiting out the failure');
    f.heard[event](); await flush();
    assert.equal(f.reads.length, 2, event + ' does not wait for the next try');
    f.heard[event](); await flush();
    assert.equal(f.reads.length, 2, 'but still never a second read beside one that is out');
  }
});

test('both feeds go through it, and nothing else does', () => {
  assert.equal(source.split('sharedFeed(').length - 1, 2, 'the route and the pings');
  assert.ok(source.includes("sharedFeed(() => feedGet(PATHAPI + '?action=get_state')") && source.includes('}), 1500);'), 'the route, every second and a half as before');
  assert.ok(source.includes('sharedFeed(pollPings, 500);'), 'the pings, twice a second as before');
  assert.ok(!/setInterval\(\s*pollPings/.test(source) && !/setInterval\(\(\) => \{ if \(document\.hidden \|\| !window\.__sx\) return; fetch\(PATHAPI/.test(source), 'the bare timers are gone');
  // What changes something is still its own request, sent when the player acts.
  assert.ok(source.includes("fetch(PING, { method: 'POST'"), 'sending a ping');
  assert.ok(source.includes("const pathApi = (action, body = {}) => fetch(PATHAPI, { method: 'POST'"), 'every route change');
  const ping = slice('const pollPings =', 'sharedFeed(pollPings');
  assert.ok(ping.includes('return false;') && ping.trimEnd().endsWith('return true; });'), 'the ping read says whether it got an answer');
});
