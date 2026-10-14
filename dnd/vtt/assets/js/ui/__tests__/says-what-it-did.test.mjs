import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Build 513: four places where the page did something, or refused to, and said nothing a person could see.
// Found by the tester's sweep; three finish things from Brandon's own fix list (the find-token button, a drag
// let go off the map being taken back).
//
// The board's status line is read out to screen readers and not shown (class "visually-hidden"), so "said" here
// means a notice on the page as well.

const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
const piece = (name) => { const found = board.match(new RegExp('  function ' + name + '\\([\\s\\S]*?\\n  \\}')); assert.ok(found, name); return found[0]; };

/** A board with tokens drawn at given places on the screen; the view starts unmoved. */
function finder(tokens) {
  const pulses = [];
  const viewState = { scale: 1, translation: { x: 0, y: 0 } };
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const nodes = tokens.map((token) => ({ dataset: { placementId: token.id }, hidden: token.hidden === true, getBoundingClientRect: () => rect(token.x + viewState.translation.x, token.y + viewState.translation.y, 40, 40) }));
  const make = new Function('tokenLayer', 'board', 'mapSurface', 'viewState', 'applyTransform', 'mapPings',
    `${piece('centerOnBoardToken')}\n${piece('centerOnBoardTokens')}\n${piece('findTokenWords')}\nreturn { centerOnBoardToken, centerOnBoardTokens, findTokenWords };`);
  const api = make({ querySelectorAll: () => nodes }, { getBoundingClientRect: () => rect(0, 0, 1000, 600) }, { getBoundingClientRect: () => rect(0, 0, 1000, 600) }, viewState, () => {}, { pulseAt: (x, y) => pulses.push([x, y]) });
  return { ...api, viewState, pulses };
}

test('Find token with two selected: the view is centred on them together, and each sends its pulse', () => {
  const { centerOnBoardTokens, viewState, pulses } = finder([{ id: 'cal', x: 100, y: 100 }, { id: 'ogre', x: 300, y: 500 }, { id: 'far', x: 5000, y: 5000 }]);
  assert.equal(centerOnBoardTokens(['cal', 'ogre']), 2);
  // The two cover 100..340 across and 100..540 down: their middle, 220 and 320, is brought to the board's middle, 500 and 300.
  assert.deepEqual(viewState.translation, { x: 280, y: -20 });
  assert.deepEqual(pulses, [[120, 120], [320, 520]], 'a pulse from the middle of each, where it is on the map');
});

test('one selected is what it always was; a token on a floor not being viewed is not "found"', () => {
  const one = finder([{ id: 'cal', x: 100, y: 100 }]);
  assert.equal(one.centerOnBoardToken('cal'), true);
  assert.deepEqual(one.viewState.translation, { x: 380, y: 180 });
  assert.deepEqual(one.pulses, [[120, 120]]);
  const upstairs = finder([{ id: 'cal', x: 100, y: 100 }, { id: 'bat', x: 300, y: 100, hidden: true }]);
  assert.equal(upstairs.centerOnBoardToken('bat'), false);
  assert.deepEqual(upstairs.viewState.translation, { x: 0, y: 0 }, 'and the view does not move for it');
  assert.equal(upstairs.centerOnBoardTokens(['cal', 'bat']), 1, 'of two selected, the one that is drawn is centred');
  assert.equal(upstairs.centerOnBoardTokens([]), 0);
});

test('what Find token says, for each case, and that it is said where it can be seen', () => {
  const { findTokenWords } = finder([]);
  assert.equal(findTokenWords(0, 0), 'Select a token to find it.');
  assert.equal(findTokenWords(1, 1), 'Viewing the selected token.');
  assert.equal(findTokenWords(2, 2), 'Viewing the 2 selected tokens.');
  assert.equal(findTokenWords(1, 0), 'That token is not on the floor you are viewing.', 'it used to answer "Select one token" for this too');
  assert.equal(findTokenWords(3, 0), 'None of the selected tokens is on the floor you are viewing.');
  assert.equal(findTokenWords(3, 2), 'Viewing 2 of the 3 selected tokens. The other is not on the floor you are viewing.');
  assert.equal(findTokenWords(4, 2), 'Viewing 2 of the 4 selected tokens. The others are not on the floor you are viewing.');
  // One token found is seen by its pulse; every other outcome is put on the page as a notice.
  assert.match(board, /const said = findTokenWords\(asked\.length, shown\);\s*updateStatus\(said\);\s*if \(!\(asked\.length === 1 && shown === 1\)\) window\.UIKit\?\.toast\?\.\(said, shown \? 'info' : 'warning'\);/);
  const markup = readFileSync(new URL('../../../../components/SceneBoard.php', import.meta.url), 'utf8');
  assert.match(markup, /id="active-scene-status"\s*class="vtt-board__status visually-hidden"/, 'the status line by itself is not seen, which is why a notice is needed');
});

test('a drag that is taken back says "Move cancelled." (off the map, or Escape)', () => {
  const said = piece('sayMoveCancelled');
  assert.match(said, /updateStatus\('Move cancelled\.'\);\s*window\.UIKit\?\.toast\?\.\('Move cancelled\.', 'info'\);/);
  assert.match(board, /const takenBack = !releasedOverMap\(event\);\s*endTokenDrag\(\{ commit: releasedOverMap\(event\), pointerId: event\.pointerId, movementKind: dragMovementKind\(event\) \}\);\s*if \(takenBack\) sayMoveCancelled\(\);/, 'let go off the map');
  assert.match(board, /if \(event\.key !== 'Escape' \|\| !viewState\.dragState\) return;\s*endTokenDrag\(\{ commit: false \}\);\s*sayMoveCancelled\(\);/, 'Escape');
});

test('the resting status line is the no-scene line only while no scene is open', () => {
  const make = (sceneId) => new Function('status', 'defaultStatusText', 'getActiveSceneId',
    `const sceneOpenStatusText = 'Right-click and drag to pan. Use the mouse wheel to zoom.';\n${piece('restingStatusText')}\n${piece('updateStatus')}\n${piece('restoreStatus')}\nreturn { updateStatus, restoreStatus, restingStatusText };`)(
    { textContent: '' }, 'Select or create a scene to begin.', typeof sceneId === 'function' ? sceneId : () => sceneId);
  const status = { textContent: 'Moved 1 token.' };
  const open = new Function('status', 'defaultStatusText', 'getActiveSceneId',
    `const sceneOpenStatusText = 'Right-click and drag to pan. Use the mouse wheel to zoom.';\n${piece('restingStatusText')}\n${piece('updateStatus')}\n${piece('restoreStatus')}\nreturn { updateStatus, restoreStatus };`)(status, 'Select or create a scene to begin.', () => 'scn_orchard');
  open.restoreStatus();                                   // what every press on the map does
  assert.equal(status.textContent, 'Right-click and drag to pan. Use the mouse wheel to zoom.', 'with a scene open the line no longer says there is none');
  open.updateStatus('');
  assert.equal(status.textContent, 'Right-click and drag to pan. Use the mouse wheel to zoom.');
  open.updateStatus('Move cancelled.');
  assert.equal(status.textContent, 'Move cancelled.');
  assert.equal(make(null).restingStatusText(), 'Select or create a scene to begin.', 'with no scene it still does');
  assert.equal(make(() => { throw new ReferenceError('too early'); }).restingStatusText(), 'Select or create a scene to begin.', 'asked before the board is set up, it does not fall over');
  assert.doesNotMatch(board.replace(/const defaultStatusText = [^\n]+\n/, '').replace(/return sceneOpen \? sceneOpenStatusText : defaultStatusText;/, '').replace(/status\.textContent = scene \? 'Loading scene map…' : defaultStatusText;/, ''), /= defaultStatusText;|: defaultStatusText;|\|\| defaultStatusText/, 'nothing else falls back to the no-scene line');
});

test('the automation paste box says whether a save went through when it stays open', () => {
  const paste = readFileSync(new URL('../../../../../character_sheet/ability-automation/paste.js', import.meta.url), 'utf8');
  assert.match(paste, /data-paste-saved role="status" aria-live="polite" hidden>/);
  assert.match(paste, /saved = \(await Promise\.resolve\(onSave\(value\)\)\) !== false;/, 'the sheet answers false when its save did not go through');
  assert.match(paste, /const saved = await runSave\(result\.normalized\);\s*if \(keepOpen \|\| !saved\) \{\s*say\(\.\.\.\(saved \? \[true, undoSnapshot \? "Saved\. The card's fields were filled in; Undo paste puts them back\." : "Saved\."\] : \[false, NOT_SAVED\]\)\);/);
  assert.match(paste, /\? \[true, "Automation cleared and saved\."\]/);
  assert.match(paste, /\? \[true, "Paste undone and saved\."\]/);
  assert.match(paste, /textarea\.addEventListener\("input", \(\) => say\(true, ""\)\);/, 'the line goes when what is in the box is no longer what was saved');
  // A save that failed keeps the box open, so the pasted text is not lost with it.
  assert.match(paste, /if \(keepOpen \|\| !saved\) \{[\s\S]{0,260}textarea\.focus\(\);\s*return;\s*\}\s*close\(\);/);
  const sheet = readFileSync(new URL('../../../../../character_sheet/sheet.js', import.meta.url), 'utf8');
  assert.equal((sheet.match(/return await saveSheet\(\);/g) || []).length, 2, 'both of the sheet\'s paste boxes (an ability\'s and a feature\'s) pass the save\'s answer on');
});
