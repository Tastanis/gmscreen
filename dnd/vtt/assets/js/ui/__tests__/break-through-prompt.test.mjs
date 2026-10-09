import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { breakThroughText, forcedBreakOffer, offerBreakThrough, askBreakThrough } from '../break-through-prompt.js';

// The pop-up asked when a push drives a creature into a wall it could break. The numbers come
// from the server (hurl-through-walls.test.php); these are the offers that test produces.
const wood = { destination: { column: 10, row: 5 }, steps: [{ materials: { wood: 1 }, cost: 3, damage: 5, left: 4 }], breakDamage: 5, damage: 0, collidedIds: [], wall: false, walls: 1, stopped: { column: 9, row: 5, damage: 6 } };
const stoneNoMore = { destination: { column: 9, row: 6 }, steps: [{ materials: { stone: 1 }, cost: 6, damage: 8, left: 6 }], breakDamage: 8, damage: 0, collidedIds: [], wall: false, walls: 1, stopped: { column: 9, row: 6, damage: 8 } };
const large = { destination: { column: 9, row: 5 }, steps: [{ materials: { wood: 1, stone: 1 }, cost: 9, damage: 13, left: 9 }], breakDamage: 13, damage: 0, collidedIds: [], wall: false, walls: 2, stopped: { column: 9, row: 5, damage: 11 } };
const thenCreature = { ...wood, damage: 1, collidedIds: ['other'] };

test('the words: what it hits, what breaking costs, and what stopping costs', () => {
  const text = breakThroughText({ name: 'War dog', offer: wood });
  assert.deepEqual(text.lines, [
    'War dog hits a wood wall with 4 squares of the push left. Breaking it uses 3 and does 5 damage.',
    'Break through: 5 damage, then moves on 1 square.',
    'Stop at the wall: 6 damage.',
  ]);
  assert.deepEqual([text.title, text.yes, text.no], ['Break through?', 'Break through', 'Stop at the wall']);
  assert.match(breakThroughText({ name: 'Ogre', offer: stoneNoMore }).lines[1], /^Break through: 8 damage, then moves on 0 squares\.$/);
  assert.match(breakThroughText({ name: 'Ogre', offer: large }).lines[0], /hits a wood and stone wall with 9 squares of the push left\. Breaking it uses 9 and does 13 damage\./);
  assert.match(breakThroughText({ name: 'Ogre', offer: { ...large, steps: [{ materials: { stone: 2 }, cost: 12, damage: 16, left: 12 }] } }).lines[0], /^Ogre hits 2 squares of stone wall with 12 squares of the push left\./);
  assert.match(breakThroughText({ name: 'War dog', offer: thenCreature, others: ['Sharon'] }).lines[1], /moves on 1 square\. Then hits Sharon: 1 more\.$/);
  assert.match(breakThroughText({ name: 'War dog', offer: { ...wood, damage: 3, wall: true } }).lines[1], /Then slams into a wall: 3 more\.$/);
  // Two walls, one after the other.
  const two = breakThroughText({ name: 'War dog', offer: { ...wood, steps: [wood.steps[0], { materials: { glass: 1 }, cost: 1, damage: 3, left: 1 }], breakDamage: 8 } });
  assert.match(two.lines[1], /^Then a glass wall with 1 square of the push left\. Breaking it uses 1 and does 3 damage\.$/);
});

test('the server is asked; no offer, a refusal or a lost connection all mean no pop-up', async () => {
  const calls = [];
  const reply = (status, body) => async (url, options) => { calls.push([url, JSON.parse(options.body)]); return { ok: status === 200, json: async () => body }; };
  assert.deepEqual(await forcedBreakOffer('scene', 't', { column: 13, row: 5, extra: 'x' }, { fetchRef: reply(200, { success: true, result: wood }) }), wood);
  assert.deepEqual(calls[0], ['/dnd/vtt/api/v2/forced-break.php', { sceneId: 'scene', placementId: 't', destination: { column: 13, row: 5 } }]);
  assert.equal(await forcedBreakOffer('scene', 't', { column: 13, row: 5 }, { fetchRef: reply(200, { success: true, result: null }) }), null);
  assert.equal(await forcedBreakOffer('scene', 't', { column: 13, row: 5 }, { fetchRef: reply(422, { success: false, error: 'no' }) }), null);
  assert.equal(await forcedBreakOffer('scene', 't', { column: 13, row: 5 }, { fetchRef: async () => { throw new Error('offline'); } }), null);
  assert.equal(await forcedBreakOffer('scene', '', { column: 13, row: 5 }, { fetchRef: reply(200, { success: true, result: wood }) }), null);
});

test('yes gives the server\'s offer back; no, or nothing to break, gives nothing', async () => {
  const placement = { id: 't', name: 'War dog' };
  let asked = null;
  const yes = await offerBreakThrough({ sceneId: 'scene', placement, intent: { column: 14, row: 5 }, nameOf: (id) => (id === 'other' ? 'Sharon' : ''), offerRef: async () => thenCreature, ask: async (info) => { asked = info; return true; } });
  assert.equal(yes, thenCreature);
  assert.deepEqual([asked.name, asked.others], ['War dog', ['Sharon']]);
  assert.equal(await offerBreakThrough({ sceneId: 'scene', placement, intent: { column: 14, row: 5 }, offerRef: async () => wood, ask: async () => false }), null);
  let never = false;
  assert.equal(await offerBreakThrough({ sceneId: 'scene', placement, intent: { column: 14, row: 5 }, offerRef: async () => null, ask: async () => { never = true; return true; } }), null);
  assert.equal(never, false, 'no pop-up when nothing would break');
});

test('the pop-up: Escape stops at the wall, Enter breaks nothing, and a second one does not stack', async () => {
  const listeners = new Map(); const made = [];
  const element = (tag) => { const el = { tag, children: [], dataset: {}, style: {}, textContent: '', className: '', setAttribute() {}, append(...kids) { el.children.push(...kids); }, remove() { body.children = body.children.filter((c) => c !== el); },
    addEventListener(type, fn) { el['on' + type] = fn; }, getBoundingClientRect() { return { left: 0, right: 20, top: 0, width: 100, height: 100 }; } }; made.push(el); return el; };
  const body = { children: [], append(el) { body.children.push(el); } };
  const documentRef = { body, createElement: element, addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: (type) => listeners.delete(type), defaultView: { innerWidth: 1000, innerHeight: 800 } };
  const first = askBreakThrough({ name: 'War dog', offer: wood }, { documentRef });
  assert.equal(body.children.length, 1);
  assert.equal(await askBreakThrough({ name: 'War dog', offer: wood }, { documentRef }), false, 'a second request is answered no');
  let stopped = false;
  listeners.get('keydown')({ key: 'Enter', preventDefault() { stopped = true; }, stopPropagation() {} });
  assert.equal(body.children.length, 1, 'Enter leaves the question open');
  assert.equal(stopped, false);
  listeners.get('keydown')({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(await first, false);
  assert.equal(body.children.length, 0);
  const second = askBreakThrough({ name: 'War dog', offer: wood }, { documentRef });
  made.filter((el) => el.tag === 'button' && el.dataset.breakAnswer === 'yes').pop().onclick();
  assert.equal(await second, true);
});

test('both places a push is made ask first, and send the word only on yes', () => {
  const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  assert.equal(board.split('await askForcedBreakThrough(').length - 1, 2, 'a Ctrl-drag and an ability\'s push');
  assert.match(board, /if \(breakThrough\) return \{\.\.\.move,\.\.\.breakThrough\.destination,movementKind,path:\[\],forcedDestination:\{column:move\.column,row:move\.row,breakThrough:true\}\};/);
  assert.match(board, /if\(through\)\{\s*clamped=\{\.\.\.clamped,\.\.\.through\.destination\};forcedIntent=\{\.\.\.forcedIntent,breakThrough:true\};/);
  assert.match(board, /if \(!stopped\.wall\) return null;/, 'the server is asked only when the push ends at a wall');
});
