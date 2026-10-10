import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { openQuestion, callAttention, heldMessage } from '../open-question.mjs';

// A move held behind a question nobody answered left the player stuck (the tester, Build 461: "an
// unanswered climb question or an open fall panel makes every later drag do nothing"). Brandon:
// "a flash and repopup of the question in case it got moved or didn't pop up".
const page = (html) => new JSDOM(`<body>${html}</body>`, { pretendToBeVisual: true }).window;
/** A panel whose place on the screen the test decides, and which records its flashes. */
function placed(window, selectorHtml, box) {
  window.document.body.insertAdjacentHTML('beforeend', selectorHtml);
  const element = window.document.body.lastElementChild; element.flashes = [];
  element.getBoundingClientRect = () => ({ width: 264, height: 120, right: box.left + 264, bottom: box.top + 120, ...box });
  element.animate = (frames, options) => { element.flashes.push({ frames, options }); return {}; };
  return element;
}

test('each kind of open question is found, and named for the status line', () => {
  for (const [html, name] of [
    ['<div data-climb-prompt role="dialog"></div>', 'the climbing question'],
    ['<div data-break-prompt class="vtt-climb-prompt vtt-break-prompt"></div>', 'the break-through question'],
    ['<div data-fall-review class="vtt-fall-review"></div>', 'the fall'],
    ['<dialog data-teleport-choice open></dialog>', 'the teleport choice'],
  ]) {
    const { document } = page(html), found = openQuestion(document);
    assert.equal(found?.name, name);
    assert.equal(heldMessage(found.name), `Answer ${name} first. That move was not made.`);
  }
  assert.equal(openQuestion(page('<div class="something-else"></div>').document), null, 'no question open: nothing is held for one');
  assert.equal(openQuestion(page('<dialog data-teleport-choice></dialog>').document), null, 'a closed teleport dialog is not a question');
});

test('a question that is in view is brought to the front and flashed, and left where it is', () => {
  const window = page('<div id="board"></div>'), question = placed(window, '<div data-climb-prompt style="left: 300px; top: 200px;"></div>', { left: 300, top: 200 });
  window.document.body.insertAdjacentHTML('beforeend', '<div id="later-panel"></div>');
  const done = callAttention(question, { view: window });
  assert.deepEqual(done, { raised: true, moved: false, flashed: true });
  assert.equal(window.document.body.lastElementChild, question, 'in front of what was added after it');
  assert.equal(question.style.left, '300px'); assert.equal(question.style.top, '200px');
  assert.equal(question.flashes.length, 1); assert.equal(question.flashes[0].options.iterations, 3, 'a pulse the eye goes to');
  assert.equal(openQuestion(window.document).element, question, 'still open: it was neither answered nor cancelled');
});

test('a question dragged off the screen, or with no size, is put back on it', () => {
  for (const box of [{ left: -900, top: 200 }, { left: 300, top: 5000 }, { left: 20000, top: 10 }]) {
    const window = page(''), question = placed(window, '<div data-fall-review></div>', box);
    const done = callAttention(question, { view: window });
    assert.equal(done.moved, true, JSON.stringify(box));
    assert.equal(question.style.left, `${Math.round((window.innerWidth - 264) / 2)}px`); assert.equal(question.style.top, '24px'); assert.equal(question.style.transform, 'none');
  }
  const window = page(''), hidden = placed(window, '<div data-break-prompt hidden></div>', { left: 100, top: 100 });
  callAttention(hidden, { view: window });
  assert.equal(hidden.hidden, false, 'a hidden question is shown again');
  // A <dialog> is in the browser's top layer already: it is flashed, not moved.
  const top = page(''), dialog = placed(top, '<dialog data-teleport-choice open></dialog>', { left: -900, top: 0 });
  assert.deepEqual(callAttention(dialog, { view: top }), { raised: false, moved: false, flashed: true });
  assert.deepEqual(callAttention(null), { raised: false, moved: false, flashed: false });
});

test('the board holds a drag and an arrow press behind an open question, and makes neither', () => {
  const source = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  // A drag: not queued behind the question, not sent; the token is drawn back where it stands.
  assert.match(source, /if \(waiting && holdForOpenQuestion\(\)\) \{\s+renderTokens\(boardApi\.getState\?\.\(\) \?\? \{\}, tokenLayer, viewState\);\s+return false;\s+\}/);
  // An arrow press: not added to the waiting presses.
  assert.match(source, /if \(keyboardMovementQueue\.busy\(\) && holdForOpenQuestion\(\)\) \{\s+return;\s+\}\s+keyboardMovementQueue\.enqueue\(movement\);/);
  // Held: the question is shown again and the status line says why. It is not answered for the player.
  assert.match(source, /function holdForOpenQuestion\(\) \{\s+const question = openQuestion\(\);\s+if \(!question\) return false;\s+callAttention\(question\.element\);\s+updateStatus\(heldMessage\(question\.name\)\);\s+return true;\s+\}/);
});
