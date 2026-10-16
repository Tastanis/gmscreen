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
  assert.match(board3d, /if\(zHeld&&p&&p\.canMove!==false&&!context\.busy\)\{startLift\(p,e\);return;\}/, 'a token this user may move, players included');
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

test('a token with a mini is grabbed at the mini: its base and the lower part of the model', () => {
  assert.match(board3d, /if\(miniStanding\.has\(p\.id\)\)\{node\.style\.setProperty\('--vtt3d-grab-top',`\$\{foot\.y-size\*\.6-nodeTop\}px`\);node\.style\.setProperty\('--vtt3d-grab-height',`\$\{size\*\.85\}px`\);\}/);
  assert.match(css, /\.vtt-token\.vtt3d-mini::after \{ content: ''; position: absolute; left: 5%; width: 90%; top: var\(--vtt3d-grab-top, 100%\); height: var\(--vtt3d-grab-height, 0px\);[^}]*pointer-events: auto;/, 'part of the token, so a press there is a press on the token');
  assert.match(board3d, /const placeKey=cameraKey\+'\|'\+shownLevel\+'\|'\+tokenLayer\.childElementCount\+'\|'\+miniIds\+/, 'placed again when a mini appears');
});

test('players see the monster minis: the token names its mini, the page keeps it, the minis use it', () => {
  const kept = normalizePlacementEntry({ id: 'algis', name: 'Algis', column: 1, row: 1, mini: { model: 'algis', scale: 1, noBase: true, extra: 'x' } });
  assert.deepEqual(kept.mini, { model: 'algis', scale: 1, noBase: true });
  assert.equal(normalizePlacementEntry({ id: 'x', column: 1, row: 1, mini: { model: '' } }).mini, undefined);
  assert.match(board3d, /\{hero:p\.characterProfileId,monster:p\.monsterId,mini:p\.mini,name:p\.name\}/);
  assert.match(minis, /monster=who\.mini\|\|config\.monsters\?\.\[who\.monster\]/);
});
