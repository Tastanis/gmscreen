import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { panelLeft, PANEL_REST, PANEL_GAP } from '../edits-place.mjs';

// With a token selected its card slides in over the left of the board, where the Edits, Walls and
// Height panels sit, and a click on "Walls" landed on the card. A covered panel moves beside it.
const host = { left: 0, top: 60, width: 1400, height: 800 };
const card = (right, left = 0) => ({ left, right, width: right - left, top: 16, height: 700 });

test('with no card, or a card that does not reach it, a panel stays where it always was', () => {
  assert.equal(panelLeft({ card: null, host, width: 300 }), null);
  assert.equal(panelLeft({ card: card(PANEL_REST), host, width: 300 }), null);
  assert.equal(panelLeft({ card: card(40), host, width: 300 }), null);
  assert.equal(panelLeft({ card: { left: 0, right: 0, width: 0 }, host, width: 300 }), null, 'a closed card has no width');
});

test('a card over the panel sends it to just right of the card', () => {
  assert.equal(panelLeft({ card: card(420), host, width: 300 }), 420 + PANEL_GAP);
  // The board may not start at the left of the screen.
  assert.equal(panelLeft({ card: card(420), host: { ...host, left: 100 }, width: 300 }), 320 + PANEL_GAP);
  // Part-way through sliding in, the panel follows it.
  assert.equal(panelLeft({ card: card(200), host, width: 228 }), 200 + PANEL_GAP);
});

test('it is never pushed off the right of the board', () => {
  assert.equal(panelLeft({ card: card(420), host: { ...host, width: 600 }, width: 300 }), 600 - 300 - PANEL_GAP);
  assert.equal(panelLeft({ card: card(420), host: { ...host, width: 300 }, width: 300 }), PANEL_REST, 'on a board too narrow for both it keeps its usual place');
});

test('all three map-editing panels are placed, every frame, only while open', () => {
  const tools = readFileSync(new URL('../edit-tools.js', import.meta.url), 'utf8');
  assert.match(tools, /for\(const id of \['edits-panel','wall-panel','terrain-panel'\]\)\{const el=document\.getElementById\(id\);if\(!el\|\|el\.hidden\)continue;/);
  assert.match(tools, /\$\('\.vtt-character-summary--open,\.vtt-monster-summary--open'\)/, 'a hero\'s card or a monster\'s');
  assert.match(tools, /const left=panelLeft\(\{card,host,width:el\.offsetWidth\|\|300\}\),value=left===null\?'':left\+'px';if\(el\.style\.left!==value\)el\.style\.left=value;/);
});
