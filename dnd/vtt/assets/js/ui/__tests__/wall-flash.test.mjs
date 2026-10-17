import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flashWall, blockedByWallText, blockedText, isWallRefusal, WALL_FLASH_MS } from '../wall-flash.mjs';
import { firstWallMet } from '../wall-properties.mjs';

// Brandon, October 10, 2026, in the bathhouse: "I'm trying to go up the stairs as a player and keep hitting
// some wall that won't let me move to the stairs and go up them." No wall was on the stair. His drags went in
// one straight line that cut the corner of the building, and the page said only that a wall was in the way.

test('the line says it was a wall, and how to go round when he was dragging', () => {
  assert.equal(blockedByWallText(true), 'Blocked by a wall. Right click while dragging to drop a corner and go round.');
  assert.equal(blockedByWallText(false), 'Blocked by a wall.');
  assert.equal(isWallRefusal('Movement blocked by a wall or closed door/window.'), true);
  assert.equal(isWallRefusal('Entity revision is stale.'), false);
  assert.equal(isWallRefusal(undefined), false);
});

// Two walls across a corridor: at column 3 and at column 6, rows 0 to 4.
const model = {
  nodes: [{ id: 'a', x: 3, y: 0 }, { id: 'b', x: 3, y: 4 }, { id: 'c', x: 6, y: 0 }, { id: 'd', x: 6, y: 4 }, { id: 'e', x: 0, y: 6 }, { id: 'f', x: 9, y: 6 }],
  segments: [{ id: 'far', a: 'c', b: 'd', baseMode: 'fixed', base: 0, height: 2 }, { id: 'near', a: 'a', b: 'b', baseMode: 'fixed', base: 0, height: 2 }, { id: 'aside', a: 'e', b: 'f', baseMode: 'fixed', base: 0, height: 2 }],
};
const hero = { column: 1, row: 1, width: 1, height: 1 }, z = () => 0, ground = () => 0;

test('the wall shown is the one the walk meets first, with where it stands', () => {
  const met = firstWallMet(model, hero, { column: 8, row: 1 }, z, ground);
  assert.equal(met.edge.id, 'near', 'not the first in the list: the first on the way');
  assert.deepEqual([met.a, met.b], [{ x: 3, y: 0 }, { x: 3, y: 4 }]);
  assert.deepEqual([met.base, met.top], [0, 2]);
  // From the other side it is the other wall.
  assert.equal(firstWallMet(model, { ...hero, column: 8 }, { column: 1, row: 1 }, z, ground).edge.id, 'far');
  // Nothing in the way: nothing to show.
  assert.equal(firstWallMet(model, hero, { column: 2, row: 3 }, z, ground), null);
});

test('a walk with corners is followed leg by leg', () => {
  // Down past the end of both walls, along, and back up: the first two legs are clear, the last meets nothing either.
  const round = { column: 8, row: 1, path: [{ column: 1, row: 4 }, { column: 8, row: 4 }] };
  assert.equal(firstWallMet(model, hero, round, z, ground), null);
  // A corner that still leaves the second leg crossing the near wall.
  assert.equal(firstWallMet(model, hero, { column: 4, row: 2, path: [{ column: 1, row: 2 }] }, z, ground).edge.id, 'near');
});

function fakePage() {
  const made = [], waits = [];
  const element = (tag) => ({ tag, attrs: {}, style: {}, dataset: {}, children: [], removed: false, setAttribute(k, v) { this.attrs[k] = v; }, append(child) { this.children.push(child); }, remove() { this.removed = true; } });
  const layer = { appended: [], old: [element('svg')], querySelectorAll() { return this.old; }, append(child) { this.appended.push(child); } };
  return { layer, made, waits, documentRef: { createElementNS: (_ns, tag) => { const e = element(tag); made.push(e); return e; } }, later: (run, ms) => waits.push({ run, ms }) };
}

test('the mark is a bright line along the wall piece, drawn over the map, that fades and goes', () => {
  const page = fakePage();
  const svg = flashWall([{ x: 192, y: 0 }, { x: 192, y: 256 }], { layer: page.layer, size: { width: 640, height: 480 }, grid: 64, documentRef: page.documentRef, later: page.later });
  assert.equal(page.layer.appended[0], svg);
  assert.equal(page.layer.old[0].removed, true, 'an earlier mark is taken away first');
  const lines = svg.children.filter((child) => child.tag === 'line');
  assert.equal(lines.length, 2, 'a dark line under a bright one');
  for (const line of lines) assert.deepEqual([line.attrs.x1, line.attrs.y1, line.attrs.x2, line.attrs.y2], ['192', '0', '192', '256']);
  assert.match(svg.style.cssText, /pointer-events:none/, 'it never takes a click');
  assert.deepEqual(page.waits.map((wait) => wait.ms), [WALL_FLASH_MS - 500, WALL_FLASH_MS]);
  page.waits.forEach((wait) => wait.run());
  assert.equal(svg.removed, true);
});

test('nothing is drawn when there is nothing to draw on, or no wall', () => {
  const page = fakePage();
  assert.equal(flashWall(null, { layer: page.layer, documentRef: page.documentRef }), null);
  assert.equal(flashWall([{ x: 1, y: 1 }, { x: NaN, y: 2 }], { layer: page.layer, documentRef: page.documentRef }), null);
  assert.equal(flashWall([{ x: 1, y: 1 }, { x: 2, y: 2 }], { layer: null, documentRef: page.documentRef }), null);
});

test('the board marks the wall and gives the hint for the wall refusal of a move that was not made, and raises no error', () => {
  const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  const start = board.indexOf('if (!movementAccepted && isWallRefusal(error?.message)) {'), end = board.indexOf("reportSyncFailure(error, movementAccepted ? 'movement follow-up' : 'token movement');");
  assert.ok(start > 0 && end > start, 'the wall refusal is answered before anything is reported as a failure');
  const answer = board.slice(start, end);
  assert.match(answer, /markWallMet\(intendedMoves\[0\], canonical\);/);
  assert.match(answer, /const hint = blockedText\(lastWallMet\?\.edge, source === 'drag'\);\s*updateStatus\(hint\);\s*window\.UIKit\?\.toast\?\.\(hint, 'warning'\);\s*return false;/);
  const walls = readFileSync(new URL('../wall-prototype.js', import.meta.url), 'utf8');
  assert.match(walls, /wallMet:\(from,to\)=>!context\?null:firstWallMet\(/);
});

test('a refused walk names a shut or locked door and a window; a secret door reads as the wall it looks like (October 16, 2026)', () => {
  assert.equal(blockedText({ interaction: 'door', open: false }, true), 'The door is shut. Click it to open it.');
  assert.equal(blockedText({ interaction: 'door', open: false, locked: true }, true), 'The door is locked.');
  assert.equal(blockedText({ interaction: 'window', open: false }, false), 'A window is in the way.');
  assert.equal(blockedText({ interaction: 'door', open: false, secret: true }, true), blockedByWallText(true));
  assert.equal(blockedText(null, false), blockedByWallText(false));
});
