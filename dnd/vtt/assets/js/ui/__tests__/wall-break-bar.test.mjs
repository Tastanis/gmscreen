import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { WALL_BAR_STYLE, showBar, placeBar } from '../wall-break-bar.js';

// Found by the tester's 27-view comparison: the GM's "Breaks at" bar for summoned walls was on
// screen all the time, on every map, with nothing selected, over the turn tracker.
const page = () => new JSDOM('<body></body>').window.document;

test('the bar is hidden unless it is shown, whatever its own style says', () => {
  const document = page(), bar = document.createElement('aside');
  bar.style.cssText = WALL_BAR_STYLE;
  showBar(bar, false);
  document.body.append(bar);
  assert.equal(bar.style.display, 'none', 'made hidden');
  assert.equal(bar.hidden, true);
  showBar(bar, true);
  assert.deepEqual([bar.style.display, bar.hidden], ['flex', false]);
  showBar(bar, false);
  assert.deepEqual([bar.style.display, bar.hidden], ['none', true]);
  // A button or a number box keeps its usual display when shown.
  const button = document.createElement('button');
  showBar(button, true, '');
  assert.deepEqual([button.style.display, button.hidden], ['', false]);
  showBar(button, false, '');
  assert.equal(button.style.display, 'none');
  showBar(null, true);
});

test('the fault itself: a hidden mark does not hide an element that sets its own display', () => {
  // This is what the bar was: marked hidden, with display:flex in its style. It showed.
  const document = page(), old = document.createElement('aside');
  old.hidden = true;
  old.style.cssText = 'position:fixed;display:flex';
  document.body.append(old);
  assert.equal(document.defaultView.getComputedStyle(old).display, 'flex', 'still laid out, so still on screen');
  // The bar's look no longer sets it.
  assert.doesNotMatch(WALL_BAR_STYLE, /display\s*:/);
  assert.doesNotMatch(WALL_BAR_STYLE, /\b(left|top|transform)\s*:/, 'nor a fixed place at the top of the screen');
});

test('the board makes the bar only for a GM with a wall selected, and hides it otherwise', () => {
  const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  // With nothing selected, or no wall on the scene, nothing is made and nothing is shown.
  assert.match(board, /function refreshWallBreakPanel\(\) \{[\s\S]{0,160}const shape = selectedWallForBar\(\);\s*if \(!shape\) \{ if \(wallBreakPanel\) showBar\(wallBreakPanel\.root, false\); return; \}\s*const panel = ensureWallBreakPanel\(\);/);
  assert.match(board, /function selectedWallForBar\(\) \{\s*if \(!isGmUser\(\)\) return null;\s*const shape = shapes\.find\(\(item\) => item\.id === selectedId\);\s*return shape\?\.type === 'wall' && !shape\.isPreview && canManageShape\(shape\) \? shape : null;/, 'a player never gets it');
  assert.match(board, /root\.style\.cssText = WALL_BAR_STYLE;\s*showBar\(root, false\);/, 'it is hidden from the moment it is made');
  assert.doesNotMatch(board, /root\.style\.cssText = '[^']*display\s*:/, 'its own style never forces it on screen');
  assert.doesNotMatch(board, /panel\.root\.hidden = /, 'and it is never hidden by the mark alone');
  assert.match(board, /showBar\(panel\.root, true\);\s*const place = placeBar\(\{ wall: shape\.elements\.root\.getBoundingClientRect\(\)/, 'shown, it is put beside its wall');
});

test('the bar goes beside its wall: under it, or over it, and never off the screen', () => {
  const viewport = { width: 1600, height: 900 }, bar = { width: 560, height: 50 };
  // A wall in the middle of the board: just under it, lined up with its left edge.
  assert.deepEqual(placeBar({ wall: { left: 700, top: 400, right: 900, bottom: 470 }, bar, viewport }), { left: 700, top: 480 });
  // A wall at the bottom of the screen: over it instead.
  assert.deepEqual(placeBar({ wall: { left: 700, top: 820, right: 900, bottom: 890 }, bar, viewport }), { left: 700, top: 760 });
  // A wall at the right edge: pulled back so the whole bar is on screen.
  assert.deepEqual(placeBar({ wall: { left: 1500, top: 400, right: 1580, bottom: 470 }, bar, viewport }), { left: 1600 - 560 - 12, top: 480 });
  // A wall partly off the left or top of the screen.
  assert.deepEqual(placeBar({ wall: { left: -40, top: -30, right: 60, bottom: 40 }, bar, viewport }), { left: 12, top: 50 });
  // A wall that fills the screen top to bottom: kept on screen all the same.
  const tall = placeBar({ wall: { left: 300, top: 5, right: 400, bottom: 895 }, bar, viewport });
  assert.ok(tall.top >= 12 && tall.top + bar.height <= viewport.height - 12, JSON.stringify(tall));
  // With the turn tracker along the top (y 58 to 112 in the tester's picture), a wall lower
  // down the board puts the bar well clear of it.
  assert.ok(placeBar({ wall: { left: 520, top: 300, right: 700, bottom: 372 }, bar, viewport }).top > 112);
});
