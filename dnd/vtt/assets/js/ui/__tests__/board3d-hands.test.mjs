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
  assert.match(board3d, /if\(\(e\.key==='z'\|\|e\.key==='Z'\)&&!e\.ctrlKey&&!e\.metaKey&&!e\.altKey&&!typing\(e\.target\)\)\{zHeld=true;/, 'Z is held, but not while typing, and not Ctrl+Z');
  assert.match(board3d, /if\(zHeld&&p&&p\.canMove!==false&&!context\.busy\)\{cancelDrag\(\);if\(!context\.selectedIds\?\.includes\(id\)\)bridge\.select\(id\);board\.focus\(\{preventScroll:true\}\);startLift\(p,e\);return;\}/, 'a token this user may move, players included; first, even over a held token');
  assert.match(board3d, /steps=Math\.round\(\(lift\.y-e\.clientY\)\/perSquare\);\s*lift\.z=steps\?Math\.max\(Math\.ceil\(lift\.floor-\.01\),Math\.round\(lift\.start\)\+steps\):lift\.start;/, 'up the screen is up; it stops at the floor below');
  assert.match(board3d, /liftLabel\.textContent=\(up\?`\$\{up\} \$\{up===1\?'square':'squares'\} up`:'On the ground'\)/);
  assert.match(board3d, /const z=keepHolding\?\(done\.locked\?\?done\.start\):done\.z;\s*if\(save&&z!==\(done\.saved\?\?done\.start\)\)\{try\{await bridge\.setHeight\?\.\(done\.id,z,\{landed:z<=done\.floor\+\.01\}\);\}/, 'nothing is sent when the height did not change; brought down to what is under it, it stands again');
  assert.match(board3d, /if\(lift&&e\.key==='Escape'\)\{e\.preventDefault\(\);e\.stopImmediatePropagation\(\);const from=lift\.from;endLift\(false\);if\(from\)cancelDrag\(\);return;\}/, 'Escape takes it back');
  // The bridge: a token that walked starts flying; one this user may not move is left alone.
  assert.match(board, /async setHeight\(id, z, \{ landed = false \} = \{\}\) \{\s*const placement = coordinatePlacement\(id\), sceneId = getActiveSceneId\(\);\s*if \(!placement \|\| !sceneId \|\| !canCurrentUserMovePlacement\(placement\) \|\| !Number\.isFinite\(z\) \|\| z < 0\) return false;\s*const patch = landed\s*\? \{ movementMode: 'ground', flightHeight: null \}\s*: \{ flightHeight: z, \.\.\.\(\['fly', 'hover'\]\.includes\(placement\.movementMode\) \? \{\} : \{ movementMode: 'fly' \}\) \};/);
  // Brought down first, then set to walking: in one step the server counts a fall from the old height.
  assert.match(board, /if \(landed && \['fly', 'hover'\]\.includes\(placement\.movementMode\)\) await tokenMovementRuntime\.submitPlacementOps\(\[\{ type: 'placement\.update', sceneId, placementId: id, patch: \{ flightHeight: z \} \}\]\);/);
});

test('Z pressed while a token is already held switches it to up and down, as Shift and Space switch how it moves (Build 521)', () => {
  assert.match(board3d, /zHeld=true;if\(!lift&&\(drag\|\|clickMoveTokenId\)\)liftHeld\(\);/, 'dragged or click-held');
  assert.match(board3d, /if\(e\.key==='z'\|\|e\.key==='Z'\)\{zHeld=false;if\(lift\?\.from\)endLift\(true,true\);\}/, 'Z let go: sideways again');
  // Brandon: lift it, right-click for a waypoint, let go of Z, and it is locked at that height and moves on from there.
  assert.match(board3d, /onRightClick:\(\)=>\{if\(lift\?\.from\)\{lockLift\(\);return true;\}/, 'a right-click while it goes up and down is a waypoint at that height');
  assert.match(board3d, /async function lockLift\(\)\{const done=lift;if\(!done\?\.from\)return false;done\.locked=done\.z;[\s\S]{0,120}await bridge\.setHeight\?\.\(done\.id,done\.z,\{landed:done\.z<=done\.floor\+\.01\}\);/, 'kept at once');
  assert.match(board3d, /const z=keepHolding\?\(done\.locked\?\?done\.start\):done\.z;/, 'Z let go: from the waypoint, or back where it started when none was made');
  assert.match(board3d, /\+\(lift\.locked===lift\.z\?' \(waypoint\)':''\);/);
  assert.match(board3d, /function liftHeld\(\)\{[\s\S]{0,300}bridge\.endMovementPreview\?\.\(\);clearGuides\(\);/, 'the sideways preview is put away while it goes up and down');
  assert.match(board3d, /window\.addEventListener\('pointermove',e=>\{if\(!drag\|\|e\.pointerId!==drag\.pointerId\|\|lift\)return;/, 'and the sideways drag stands still');
  assert.match(board3d, /function showHover\(e,p=selected\(\)\)\{\s*if\(!view\|\|lift\)return;/);
  assert.match(board3d, /if\(keepHolding&&\(drag\?\.id===done\.id\|\|clickMoveTokenId===done\.id\)\)\{[\s\S]{0,900}if\(drag\?\.air\)drag\.air\.z=z;/, 'a flier keeps its new height going sideways');
  // Raised from the ground and carried on sideways: it is carried at that height under the hand (October 16, 2026).
  assert.match(board3d, /if\(drag&&z>done\.floor\+\.01&&view\)\{const pointer=drag\.pointer\?\?\{clientX:drag\.x,clientY:drag\.y\},q=view\.pointOnPlane\(pointer\.clientX,pointer\.clientY,z\);if\(q\)drag\.air=\{z,dx:done\.x-q\.x,dy:done\.yy-q\.y\};\}/, 'carried on at the waypoint height, not dropped to the ground under the pointer');
  assert.match(board3d, /if\(liftPointer\(e\)&&e\.button===0\)\{e\.preventDefault\(\);e\.stopPropagation\(\);const from=lift\.from;endLift\(true\);if\(from\)cancelDrag\(\);\}/, 'letting go of the mouse keeps the height and ends the hold');
  assert.match(board3d, /if\(liftPointer\(e\)&&!\(lift\.from==='hold'&&\(e\.buttons&6\)\)\)/, 'turning or panning the view does not change the height');
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
  assert.match(board3d, /else if\(!released\.shift\)\{clickMoveTokenId=released\.id;markHeld\(released\.id\);\}\}/);
  // Shift-click changes the selection only: it never picks a token up, nor puts a carried one down on the clicked one.
  assert.match(board3d, /if\(clickMoveTokenId&&e\.shiftKey\)\{cancelDrag\(\);bridge\.select\(id,\{additive:true\}\);board\.focus\(\{preventScroll:true\}\);return;\}/);
  assert.match(board3d, /if\(!drag\.moved&&Math\.hypot\(e\.clientX-drag\.x,e\.clientY-drag\.y\)>5\)\{drag\.moved=true;markHeld\(drag\.id\);\}/);
  assert.match(board3d, /function cancelDrag\(\)\{sayHeld\(null\);markHeld\(null\);clickMoveTokenId=null;/);
  assert.match(css, /\.vtt-token\.vtt3d-held, \.vtt3d-on #vtt-token-layer>\.vtt-token\.vtt3d-held \* \{ pointer-events: none !important; \}/);
  // A drop that is refused says why, where it can be seen.
  assert.match(board3d, /if\(result\?\.accepted===false&&!\['unchanged','said'\]\.includes\(result\.reason\)\)\{const words=REFUSED\[result\.reason\]\|\|/);
  assert.match(board3d, /window\.UIKit\?\.toast\?\.\(words,'warning'\);/);
  // Nor does a click while the last move is still being saved.
  assert.match(board3d, /async function commit\(hit,p,e,intent=null\)\{if\(!p\|\|p\.canMove===false\|\|context\.busy\)\{cancelDrag\(\);return;\}/);
});

test('opening another scene unloads the old one first (Build 523)', () => {
  // Brandon: "When I open a new scene, I want it to get rid of all the old scene and unload all of that. And then I
  // want to load the new scene." The old board stayed drawn until the new one was built, and the new one could be
  // built with the old one's floors and ramps (remembered by walls revision only).
  assert.match(board3d, /key=\(context\.sceneId\|\|''\)\+'\|'\+revision;if\(key===structure\.key\)return structure;/, 'floors and ramps remembered per scene');
  assert.match(board3d, /const switched=\(view\|\|building\)&&next\.sceneId!==\(builtSceneId\?\?\(building\?context\.sceneId:null\)\);\s*context=next;if\(switched\)clearBoard\(\);/);
  assert.match(board3d, /function clearBoard\(\)\{\s*buildGeneration\+\+;clearTimeout\(buildTimer\);cancelDrag\(\);\s*if\(view\)\{stopLayers\(\);effects\?\.dispose\?\.\(\);effects=null;minis\?\.dispose\(\);minis=null;for\(const part of sceneArtParts\)view\.removeLevelArt\(part\);sceneArtParts=\[\];view\.dispose\(\);canvas\?\.remove\(\);\}/, 'everything of the old scene goes at once');
  assert.match(board3d, /loadingNote\.textContent='Loading scene…'/);
  assert.match(board3d, /tokenHost\.style\.display=on\?'none':''/, 'tokens are not drawn between scenes (display: a token sets its own visibility)');
  assert.match(board3d, /isCurrent:current\}\);\s*if\(!nextView\|\|!current\(\)\)\{nextView\?\.dispose\(\);return;\}/, 'a build for a scene no longer shown is dropped (scene-view.mjs stops at its own waits too)');
  // Build 524: never on the old scene's picture, and the scene's own 3D art is in before the board is shown.
  assert.match(board3d, /if\(\(context\.mapUrl\?\?null\)!==\(context\.view\?\.activeMapUrl\?\?null\)\|\|!context\.view\?\.mapLoaded\)return null;/);
  assert.match(board, /mapUrl: state\.boardState\?\.mapUrl \?\? null,/);
  assert.match(board, /mapLoaded: viewState\.mapLoaded, activeMapUrl: viewState\.activeMapUrl \?\? null \},/);
  assert.match(board3d, /if\(!current\(\)\|\|view!==nextView\)return;\s*\/\/ "Loading scene…" stays until the scene's own 3D art is in[^\n]*\n\s*showLoading\(false\);/);
});

test('players see the monster minis: the token names its mini, the page keeps it, the minis use it', () => {
  const kept = normalizePlacementEntry({ id: 'algis', name: 'Algis', column: 1, row: 1, mini: { model: 'algis', scale: 1, noBase: true, extra: 'x' } });
  assert.deepEqual(kept.mini, { model: 'algis', scale: 1, noBase: true });
  assert.equal(normalizePlacementEntry({ id: 'x', column: 1, row: 1, mini: { model: '' } }).mini, undefined);
  assert.match(board3d, /\{hero:p\.characterProfileId,monster:p\.monsterId,mini:p\.mini,name:p\.name\}/);
  assert.match(minis, /monster=who\.mini\|\|config\.monsters\?\.\[who\.monster\]/);
});
