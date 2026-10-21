import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Build 544, Brandon's list (October 2026): the tracker's hover shows on a mini; a token takes a manual damage click on
// the 3D board; only the Director's Alt+right-click moves everyone's view, to his exact camera; Find token comes in
// close; right-click a tracker entry pings its token; Start turn stays on the enemies' turn and asks; test pop-ups open
// in the window in use and close in all. The 3D board needs a real canvas, so these read the wiring
// (turn-undo.test.mjs, ping-beam.test.mjs and ping-height.test.php hold the rest).

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const board = read('../board-interactions.js');
const pings = read('../map-pings.js');
const board3d = read('../../../../board3d/integration.mjs');
const css = read('../../../../board3d/integration.css');
const askTest = read('../../../../../js/ask-test.js');
const chat = read('../../../../../js/chat-panel.js');
const has = (source, text, message) => assert.ok(source.includes(text), message ?? text);

test('the tracker hover rings a mini too', () => {
  has(css, '.vtt3d-on #vtt-token-layer>.vtt-token.vtt3d-mini.is-hover-highlight { outline: 3px solid');
});

test('on the 3D board a press on a token is the manual damage/heal target, not a grab', () => {
  assert.match(board, /board\.addEventListener\('pointerdown', \(event\) => \{\s*if \(!window\.vtt3d\?\.active \|\| event\.button !== 0 \|\| !pendingDamageHeal\) return;[\s\S]{0,300}event\.stopImmediatePropagation\(\);\s*event\.vtt3dPick = \{ placement \};\s*handleDamageHealClick\(event\);\s*\}, true\);/);
  has(board, 'if (pendingDamageHeal && event.button === 0) {\n      await handleDamageHealClick(event);', 'the 2D map surface uses the same click');
  has(board, "board.addEventListener('pointerdown', handlePointerDown, true);", "a condition's turn pick listens on the board, which holds the 3D tokens");
});

test("only the Director's Alt+right-click moves everyone's view, to his exact camera", () => {
  has(board, 'mapPings.handleMapPing(event, { focus: event.button === 2 && isGmUser() })');
  has(pings, 'const camera = focus ? windowRef?.vtt3dRenderer?.cameraState?.() : null;');
  has(pings, "pingEntry.type === 'focus' && cameraFrom(pingEntry.camera) && windowRef?.vtt3dRenderer?.setCameraState?.(cameraFrom(pingEntry.camera))");
  has(board3d, 'cameraState:()=>view?{position:view.camera.position.toArray()');
  has(board3d, 'setCameraState:state=>{if(!view||!Array.isArray(state?.position)||!Array.isArray(state?.target))return false;');
});

test('Find token brings the camera in close', () => {
  has(board3d, 'distance=Math.max(12+span*2.2,Math.min(offset.length(),26));');
});

test('where the turn began, a ghost of the token stays once it moves', () => {
  has(board, 'turn: combatActive && activeCombatantId ? { combatantId: activeCombatantId, round: combatRound } : null,');
  has(board3d, 'context=next;if(switched)clearBoard();syncTurnStart();');
  has(board3d, 'placeTurnGhost(recordById,canvasRect,hostRect);');
  has(css, '.vtt3d-turn-ghost {');
});

test('right-click a tracker entry pings its token, or says it is not on this map', () => {
  has(board, "combatTrackerRoot.addEventListener('contextmenu', handleCombatTrackerContextMenu);");
  assert.match(board, /function findFromTracker\(representativeId, bringView\) \{[\s\S]{0,300}\.filter\(id => isGmUser\(\) \|\| !getPlacementFromStore\(id\)\?\.hidden\);\s*const found = bringView \? \(ids\.length \? centerOnBoardTokens\(ids\) : 0\) : pingBoardTokens\(ids\);\s*if \(!found\) \{\s*window\.UIKit\?\.toast\?\.\('That token is not on this map\.', 'info'\);/);
  // Build 545: let go within 0.75 s, a ping; held longer, the ping and the view comes to it.
  has(board, 'const TRACKER_HOLD_MS = 750;');
  has(board, "combatTrackerRoot.addEventListener('pointerdown', handleCombatTrackerRightPress);\n    window.addEventListener('pointerup', handleCombatTrackerRightRelease);");
  has(board, 'findFromTracker(press.id, trackerReleasedAt - press.at >= TRACKER_HOLD_MS);');
  has(board, 'if (!trackerPress && performance.now() - trackerReleasedAt > 400) findFromTracker(entry.dataset.combatantId, false);', 'the menu key pings; a mouse right-click is not done twice');
  assert.match(board, /function pingBoardTokens\(placementIds\) \{[\s\S]{0,500}if \(!placement \|\| \(placement\.hidden && !isGmUser\(\)\)/, 'a hidden token is not given away');
});

test("Start turn stays on the enemies' turn and asks first", () => {
  assert.equal((board.match(/getCurrentPlayerTurnCombatantId\(\{ ignoreTeam: true \}\)/g) || []).length, 2, 'the button and taking the turn');
  has(board, 'currentTurnTeam: ignoreTeam ? null : currentTurnTeam,');
  has(board, `enemies ? "It's the enemies' turn. Take your turn anyway?"`);
});

test('test pop-ups open in the window in use and close in all of his windows; chat toasts likewise', () => {
  has(askTest, "if (fresh && !inUse()) return;");
  has(askTest, 'if (resultsDue && (inUse() || open.results)) {');
  has(askTest, "window.addEventListener('focus', () => settle());");
  assert.ok(!askTest.slice(0, askTest.indexOf('function start(')).includes('new BroadcastChannel'), 'the channel opens in start, not when the file loads');
  has(askTest, "tellWindows({ type: view.rolled ? 'request-done' : 'request-closed', id: test.id });");
  has(askTest, "if (open.request && open.request.testId === message.id && !open.request.rolled) shut('request');");
  has(chat, "if (typeof document.hasFocus === 'function' && !document.hasFocus()) {");
});
