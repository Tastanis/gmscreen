// One request out at a time for every read a page repeats on a timer.
//
// November 24, 2026, from the host's access log: one browser whose requests were held up had 94 open at once, and
// almost all of them were the reads that were sent on a timer whether or not the last had been answered (the campus
// map's pings and route, the vision setting, the party's Stamina, the sheet's hero tokens). Each open request is two
// processes on the host, and the account may have 65. The campus map's feeds and the Table's were given one read at
// a time in Builds 650 and before; these are the rest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const slice = (source, start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Missing source boundaries: ${start} / ${end}`);
  return source.slice(from, to);
};
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve)); };

test('the vision setting is asked for again only once the last ask was answered', async () => {
  const source = read('../../../../board3d/sight-test.mjs');
  const asks = [], applied = [];
  const make = new Function('deps', `with (deps) { let listening = false, heard = 0; ${slice(source, '  function listen() {', '\n  if (!readOnly) {\n    listen();')}\n return listen; }`);
  const page = { hidden: false };
  const listen = make({
    document: page, VISION_URL: '/vision', apply: (vision) => applied.push(vision.look),
    fetch: (url) => { const d = deferred(); asks.push({ url, ...d }); return d.promise; },
  });
  listen(); listen(); listen(); listen();                       // the timer came round four times, the host has not answered
  assert.equal(asks.length, 1);
  asks[0].resolve({ json: async () => ({ success: true, vision: { updatedAt: 5, look: 'Dark' } }) });
  await flush();
  assert.deepEqual(applied, ['Dark']);
  listen(); listen();
  assert.equal(asks.length, 2, 'answered: the next turn of the timer asks again');
  asks[1].reject(new Error('the host is busy'));
  await flush();
  listen();
  assert.equal(asks.length, 3, 'a failed ask does not stop the asking');
  page.hidden = true; asks[2].resolve({ json: async () => ({ success: false }) }); await flush();
  listen();
  assert.equal(asks.length, 3, 'a page that is not shown does not ask');
});

test('what the party explored is read and sent one request at a time', () => {
  const source = read('../../../../board3d/sight-test.mjs');
  assert.match(source, /if \(!scene \|\| memoryLoading === scene\) return;\s*memoryLoading = scene;/);
  assert.match(source, /\.finally\(\(\) => \{ if \(memoryLoading === scene\) memoryLoading = ''; \}\);/);
  assert.match(source, /if \(unsent\.size && !exploreSending\) \{/);
  assert.match(source, /\.catch\(\(\) => cells\.forEach\(\(c\) => unsent\.add\(c\)\)\)\s*\.finally\(\(\) => \{ exploreSending = false; \}\);/, 'squares that were not taken go back to be sent again');
});

test('the heroes\' Stamina is read one sheet after another, and a read never answered gives way', async () => {
  const source = read('../token-library.js');
  const open = [], order = [], timers = [];
  const make = new Function('deps', `with (deps) { ${slice(source, '  let staminaReads = Promise.resolve();', '  let staminaRefreshing = false;')}\n return readStaminaInTurn; }`);
  const readStaminaInTurn = make({
    endpoints: {},
    fetchSheetStamina: (routes, name) => { if (name === 'nobody') return null; const d = deferred(); open.push({ name, ...d }); order.push(name); return d.promise; },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].fn = null; },
  });
  let first = false, second = false;
  readStaminaInTurn(['cal', 'nobody', 'sharon', 'indigo']).then(() => { first = true; });
  readStaminaInTurn(['zepha']).then(() => { second = true; });
  await flush();
  assert.deepEqual(order, ['cal'], 'nine names used to mean nine requests in the same instant');
  open[0].resolve({ currentStamina: 20 });
  await flush();
  assert.deepEqual(order, ['cal', 'sharon'], 'a name with no sheet to ask is passed over');
  open[1].reject(new Error('the host is busy'));
  await flush();
  assert.deepEqual(order, ['cal', 'sharon', 'indigo'], 'a failed read does not stop the rest');
  assert.equal(first, false);
  const waiting = timers.filter((timer) => timer.fn).at(-1);
  assert.equal(waiting.ms, 15000);
  waiting.fn();                                                 // Indigo's sheet was never answered
  await flush();
  assert.equal(first, true);
  assert.deepEqual(order, ['cal', 'sharon', 'indigo', 'zepha'], 'the next list starts when this one is through');
  open[3].resolve(null);
  await flush();
  assert.equal(second, true);
  assert.doesNotMatch(source, /Promise\.allSettled\(/, 'no list of sheets is asked for all at once');
  assert.match(source, /if \(!names\.length \|\| !shouldPrefetchStamina\(\) \|\| staminaRefreshing\) \{\s*return;/, 'a refresh still under way is not started again a minute later');
});

test('the sheet\'s hero tokens and the Projects page\'s revision are asked for one at a time', () => {
  const sheet = read('../../../../../character_sheet/app.js');
  assert.match(sheet, /if \(document\.visibilityState === 'hidden' \|\| !state\.loaded \|\| readingHeroTokens\) return;\s*readingHeroTokens = true;/);
  assert.match(sheet, /catch \(_\) \{ \/\* next time \*\/ \} finally \{ readingHeroTokens = false; \}\s*\}, 4000\);/);
  const campaign = read('../../../../../campaign/campaign.js');
  assert.match(campaign, /if \(document\.hidden \|\| loading \|\| polling\) return;\s*polling = true;/);
  assert.match(campaign, /catch \(_\) \{ \/\* next time \*\/ \} finally \{ polling = false; \}/);
});
