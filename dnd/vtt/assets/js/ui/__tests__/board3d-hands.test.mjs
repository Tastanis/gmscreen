import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePlacementEntry } from '../../state/normalize/placements.js';

// Build 518, Brandon's list for the 3D board (October 2026):
//  - hold Z and drag a token to raise or lower it, with "3 squares up" shown; lifting a walking token makes it fly,
//    and players may lift their own;
//  - a flying token is dragged in the air under the hand, not snapped to the ground point behind the pointer;
//  - a token with a 3D mini is grabbed at its base and the lower part of the model, not only at the box above it;
//  - players see the monster minis (MonsterStatSanitizationTest: the server names the mini, not the monster).
// The 3D board needs a real canvas, so these read the wiring; the browser look covers the rest.

const board3d = readFileSync(new URL('../../../../board3d/integration.mjs', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../../../board3d/integration.css', import.meta.url), 'utf8');
const minis = readFileSync(new URL('../../../../board3d/minis.mjs', import.meta.url), 'utf8');
const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');

test('hold Z and drag: up and down a square at a time, never below what is under it, saved on letting go', () => {
  assert.match(board3d, /if\(\(e\.key==='z'\|\|e\.key==='Z'\)&&!e\.ctrlKey&&!e\.metaKey&&!e\.altKey&&!typing\(e\.target\)\)zHeld=true;/, 'Z is held, but not while typing, and not Ctrl+Z');
  assert.match(board3d, /if\(zHeld&&p&&p\.canMove!==false&&!context\.busy\)\{cancelDrag\(\);if\(!context\.selectedIds\?\.includes\(id\)\)bridge\.select\(id\);board\.focus\(\{preventScroll:true\}\);startLift\(p,e\);return;\}/, 'a token this user may move, players included; first, even over a held token');
  assert.match(board3d, /steps=Math\.round\(\(lift\.y-e\.clientY\)\/perSquare\);\s*lift\.z=steps\?Math\.max\(Math\.ceil\(lift\.floor-\.01\),Math\.round\(lift\.start\)\+steps\):lift\.start;/, 'up the screen is up; it stops at the floor below');
  assert.match(board3d, /liftLabel\.textContent=up\?`\$\{up\} \$\{up===1\?'square':'squares'\} up`:'On the ground';/);
  assert.match(board3d, /if\(!save\|\|done\.z===done\.start\)\{held=null;return;\}\s*try\{await bridge\.setHeight\?\.\(done\.id,done\.z\);\}/, 'nothing is sent when the height did not change; Escape takes it back');
  assert.match(board3d, /if\(lift&&e\.key==='Escape'\)\{e\.preventDefault\(\);e\.stopImmediatePropagation\(\);endLift\(false\);return;\}/);
  // The bridge: a token that walked starts flying; one this user may not move is left alone.
  assert.match(board, /async setHeight\(id, z\) \{\s*const placement = coordinatePlacement\(id\), sceneId = getActiveSceneId\(\);\s*if \(!placement \|\| !sceneId \|\| !canCurrentUserMovePlacement\(placement\) \|\| !Number\.isFinite\(z\) \|\| z < 0\) return false;\s*const patch = \{ flightHeight: z, \.\.\.\(\['fly', 'hover'\]\.includes\(placement\.movementMode\) \? \{\} : \{ movementMode: 'fly' \}\) \};/);
});

test('a flying token is dragged on a sheet at its own height, keeping where it was grabbed', () => {
  assert.match(board3d, /if\(airborne\(p\)&&view\)\{const w=world\(p\),q=view\.pointOnPlane\(e\.clientX,e\.clientY,w\.z\);if\(q\)drag\.air=\{z:w\.z,dx:w\.x-q\.x,dy:w\.y-q\.y\};\}/, 'the gap between the grab and its middle is kept');
  assert.match(board3d, /const q=view\?\.pointOnPlane\(e\.clientX,e\.clientY,air\.z\);if\(!q\)return null;\s*const x=q\.x\+air\.dx,y=q\.y\+air\.dy;return \{x,y,z:helpers\.groundAt\(x,y\)/);
  // Every place a held token reads the pointer goes through it: the hover, the route's last search and the drop.
  assert.equal((board3d.match(/dragHit\(/g) || []).length, 4, 'defined once, used three times');
  assert.match(board3d, /const landing=airZ\?\?/, 'and while it is held it stays at its height');
  assert.match(board3d, /const airborne=p=>!!p&&\['fly','hover'\]\.includes\(p\.movementMode\);/, 'a token on the ground follows the surface under the pointer, as before');
});

test('a token with a mini is the mini: its box covers the model from base to head, popups above the head (Build 520)', () => {
  // Build 518 added a grab area under a box that floated above the model; Brandon: "the invisible token thing above
  // the models needs to go away", and the popups go just above the character, a little bigger.
  assert.match(minis, /tops\.set\(r\.id,y\+\(entry\.height\|\|1\)\*scale\);/, 'each mini says where its head is');
  assert.match(minis, /function modelHeight\(s\)\{[^\n]*if\(o\.isMesh&&!\/-glow\|-fx\|-ghost\/\.test\(o\.name\)\)box\.expandByObject\(o\);/, 'measured from its meshes, not its particles');
  assert.match(board3d, /const head=miniStanding\.has\(p\.id\)&&Number\.isFinite\(miniTops\.get\(p\.id\)\)\?view\.project\(\{\.\.\.p,z:miniTops\.get\(p\.id\)\}\):null;\s*const boxTop=head\?Math\.min\(head\.y,foot\.y-size\*\.5\):/);
  assert.match(board3d, /if\(head\)node\.style\.setProperty\('--vtt3d-height',`\$\{foot\.y\+size\*\.12-boxTop\}px`\);else node\.style\.removeProperty\('--vtt3d-height'\);/, 'down to its base');
  assert.match(css, /#vtt-token-layer>\.vtt-token\.vtt3d-mini \{ height: var\(--vtt3d-height, var\(--vtt3d-size, 36px\)\) !important;/);
  assert.match(css, /\.vtt3d-mini \.vtt-token__condition \{ bottom: auto; top: calc\(var\(--tok-unit\) \* -18\); \}/, 'conditions above the head too');
  assert.doesNotMatch(board3d + css, /vtt3d-grab|vtt3d-mini::after/, 'no box floats over the model any more');
  assert.match(board3d, /node\.style\.setProperty\('--tok-unit',`\$\{\(1\.25\*size\//, 'badges and bars a quarter bigger');
  assert.match(board3d, /const placeKey=cameraKey\+'\|'\+shownLevel\+'\|'\+tokenLayer\.childElementCount\+'\|'\+miniIds\+/, 'placed again when a mini appears');
});

test('a held token is always put down by the next click (Build 520)', () => {
  // On itself: it stays where it stands, and is not picked up again.
  assert.match(board3d, /if\(clickMoveTokenId\)\{const mover=find\(clickMoveTokenId\);if\(id===clickMoveTokenId\|\|!mover\)\{cancelDrag\(\);return;\}/);
  // A little movement of the hand, or a click with no square under it, never leaves it held.
  assert.match(board3d, /if\(Math\.hypot\(e\.clientX-start\.x,e\.clientY-start\.y\)>5&&!clickMoveTokenId\)return;\s*const hit=pickAtClient\(e\.clientX,e\.clientY,\{tokens:false\}\);if\(!hit\)\{if\(clickMoveTokenId\)cancelDrag\(\);return;\}/);
  // The held token's box goes with the pointer: while held it lets the pointer through, so the click that puts it
  // down lands on the square, not on the token (which used to count as "put it back": "it won't place it").
  assert.match(board3d, /else\{clickMoveTokenId=released\.id;markHeld\(released\.id\);\}\}/);
  assert.match(board3d, /if\(!drag\.moved&&Math\.hypot\(e\.clientX-drag\.x,e\.clientY-drag\.y\)>5\)\{drag\.moved=true;markHeld\(drag\.id\);\}/);
  assert.match(board3d, /function cancelDrag\(\)\{markHeld\(null\);clickMoveTokenId=null;/);
  assert.match(css, /\.vtt-token\.vtt3d-held, \.vtt3d-on #vtt-token-layer>\.vtt-token\.vtt3d-held \* \{ pointer-events: none !important; \}/);
  // A drop that is refused says why, where it can be seen.
  assert.match(board3d, /if\(result\?\.accepted===false&&result\.reason!=='unchanged'\)\{const words=REFUSED\[result\.reason\]\|\|/);
  assert.match(board3d, /window\.UIKit\?\.toast\?\.\(words,'warning'\);/);
  // Nor does a click while the last move is still being saved.
  assert.match(board3d, /async function commit\(hit,p,e,intent=null\)\{if\(!p\|\|p\.canMove===false\|\|context\.busy\)\{cancelDrag\(\);return;\}/);
});

test('players see the monster minis: the token names its mini, the page keeps it, the minis use it', () => {
  const kept = normalizePlacementEntry({ id: 'algis', name: 'Algis', column: 1, row: 1, mini: { model: 'algis', scale: 1, noBase: true, extra: 'x' } });
  assert.deepEqual(kept.mini, { model: 'algis', scale: 1, noBase: true });
  assert.equal(normalizePlacementEntry({ id: 'x', column: 1, row: 1, mini: { model: '' } }).mini, undefined);
  assert.match(board3d, /\{hero:p\.characterProfileId,monster:p\.monsterId,mini:p\.mini,name:p\.name\}/);
  assert.match(minis, /monster=who\.mini\|\|config\.monsters\?\.\[who\.monster\]/);
});
