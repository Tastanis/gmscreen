import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Build 491 left the character sheet page BLANK, and every build after it until 503 carried that: the frame and
// the tabs loaded, every pane stayed empty, and nothing was logged. No test saw it. Opening the page did.
//
// 491 put `await import("./sheet-changes.mjs")` at the top of sheet.js. A module that waits at its top level
// finishes after the browser has fired DOMContentLoaded, and the sheet started itself on that event: the
// listener was added after the event had gone, so the sheet never started.
//
// sheet-changes.mjs is now loaded by its own script tag before sheet.js and read from the window, nothing at the
// top of sheet.js waits, and the sheet starts at once if the page is already ready.

const root = new URL('../../../../../character_sheet/', import.meta.url);
const sheet = readFileSync(new URL('sheet.js', root), 'utf8');
const page = readFileSync(new URL('index.php', root), 'utf8');

test('nothing at the top level of the sheet\'s script waits', () => {
  // A wait inside a function is indented; one at the top level starts its line, or follows a top-level const or let.
  const waits = sheet.split(/\r?\n/).map((line, index) => [index + 1, line]).filter(([, line]) => /^(?:(?:const|let|var)\b[^=]*=\s*)?await\b/.test(line) || /^for await\b/.test(line));
  assert.deepEqual(waits, [], 'a top-level wait makes the whole file finish after the page is ready');
  assert.doesNotMatch(sheet, /await import\("\.\/sheet-changes\.mjs"/);
});

test('the sheet starts whether or not the page was ready before its script finished', () => {
  assert.match(sheet, /if \(document\.readyState === "loading"\) document\.addEventListener\("DOMContentLoaded", ready\);\s*else ready\(\);/);
  assert.equal(sheet.match(/addEventListener\("DOMContentLoaded"/g)?.length, 1, 'and that is the one place it waits for the page');
});

test('the field-change rules are loaded before the sheet\'s script, by the page, at the page\'s version', () => {
  const changes = page.indexOf('<script type="module" src="sheet-changes.mjs?v=<?php echo (int) $assetVersion; ?>"></script>');
  const main = page.indexOf('<script type="module" src="sheet.js?v=<?php echo (int) $assetVersion; ?>"></script>');
  assert.ok(changes > 0 && main > changes, 'sheet-changes.mjs first, then sheet.js: module scripts run in the order written');
  assert.match(sheet, /const \{ diffSheet, applyChanges \} = window\.SheetChanges;/);
});

test('loaded in a page, the rules are put on the window', async () => {
  const had = globalThis.window;
  globalThis.window = {};
  try {
    await import(new URL('sheet-changes.mjs', root).href + '?as-the-page-loads-it');
    const rules = globalThis.window.SheetChanges;
    assert.deepEqual(Object.keys(rules).sort(), ['COUNTERS', 'applyChanges', 'diffSheet', 'sameValue']);
    assert.deepEqual(rules.diffSheet({ hero: { surges: 0 } }, { hero: { surges: 1 } }), [{ path: ['hero', 'surges'], value: 1, from: 0 }]);
  } finally { if (had === undefined) delete globalThis.window; else globalThis.window = had; }
});

test('turning Edit mode off with nothing typed writes nothing: Stamina that did not change is not a new point in its history', () => {
  assert.match(sheet, /if \(history\.length && Number\(history\[history\.length - 1\]\) === numericValue\) return;\s*history\.push\(numericValue\);/);
});
