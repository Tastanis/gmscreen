import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Brandon, October 12, 2026 (three small changes he released together):
// - Players open ordinary doors by clicking them. Secret doors are still only revealed by the Director.
// - Escape cancels a token drag in progress.
// - Dropping a token over the side character sheet or the top bar cancels the move.
//
// The rule for a door is the server's (player-doors.test.php): a door, not locked, not secret, with a hero standing
// at it. The page's part is to let a player click a door at all, to say one word when the answer is no, and to
// end a drag without sending anything. These are read from the page's own source: all three live in handlers
// that need a real board.
const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('Escape, or letting go anywhere but over the map, takes a token drag back', () => {
  const board = read('board-interactions.js');
  assert.match(board, /function releasedOverMap\(event\) \{[\s\S]{0,400}const under = document\.elementFromPoint\(event\.clientX, event\.clientY\);\s*return !!under && mapSurface\.contains\(under\);/, 'over the map means over the map surface itself: the sheet, the top bar and the panels are outside it');
  assert.match(board, /endTokenDrag\(\{ commit: releasedOverMap\(event\), pointerId: event\.pointerId, movementKind: dragMovementKind\(event\) \}\);/, 'a drag let go elsewhere ends without its move');
  assert.match(board, /document\.addEventListener\('keydown', \(event\) => \{\s*if \(event\.key !== 'Escape' \|\| !viewState\.dragState\) return;\s*endTokenDrag\(\{ commit: false \}\);/, 'Escape ends the drag the same way');
  assert.match(board, /event\.preventDefault\(\);\s*event\.stopImmediatePropagation\(\);\s*\}, true\);/, 'and that Escape is spent: it closes nothing else');
  // Ending a drag without commit sends nothing and puts the ruler, corners and all, away.
  const tokens = read('token-interactions.js');
  assert.match(tokens, /if \(commit && moved && preview && preview\.size\) \{\s*commitDragPreview\(/, 'only a committed drag is sent');
  assert.match(tokens, /\} else \{\s*cancelExternalMeasurement\(\);\s*\}\s*\}\s*viewState\.dragState = null;/, 'an uncommitted one cancels the ruler it drew');
});

test('a player may click an ordinary door, and is told in a word when it does not open', () => {
  const editor = read('wall-editor.mjs');
  assert.match(editor, /button\.disabled=!c\.isGM&&e\.interaction!=='door';/, 'a door\'s button is live for a player; a window\'s is not');
  assert.match(editor, /if\(e\.secret&&!c\.isGM\|\|isBroken\(e\)\)continue;|e\.secret&&!c\.isGM/, 'a secret door has no button on a player\'s page at all');
  assert.match(editor, /const gm=!!context\(\)\?\.isGM;if\(!gm&&e\.interaction!=='door'\)return;if\(e\.locked\)\{if\(!gm\)doorNote\(button,'Locked'\);return;\}/, 'a locked door says Locked and nothing is sent');
  assert.match(editor, /else doorNote\(button,\/locked\/i\.test\(error\?\.message\|\|''\)\?'Locked':\/next to\/i\.test\(error\?\.message\|\|''\)\?'Too far':'Not now'\);/, 'a refusal from the server is one word beside the door, not an alert');
  assert.match(editor, /function doorNote\(button,text\)\{[\s\S]{0,800}transform\.append\(note\);setTimeout\(\(\)=>note\.remove\(\),1500\);\}/, 'the word goes away by itself');
  // 3D board: the flat map layer is hidden, so the word is shown over the button on the screen (October 16, 2026).
  assert.match(editor, /if\(window\.vtt3d\?\.active\)\{const r=button\.getBoundingClientRect\(\)[^\n]*document\.body\.append\(note\);setTimeout\(\(\)=>note\.remove\(\),1800\);return;\}/, 'on the 3D board the word is seen');
  const sync = read('environment-sync.mjs');
  assert.doesNotMatch(sync, /Only the GM can change doors/, 'the page no longer refuses a player before the server is asked');
  assert.match(sync, /type:'environment\.portal\.set',sceneId,payload:\{segmentId,open,expectedRevision:/);
});
