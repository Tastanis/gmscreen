import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Brandon, November 17, 2026: "i just set her down here. and only 2 tokens show up on the stairs. but when i click again
// there are 4 up there ... vision is disabled right now. and height is set at 4". Selecting one token makes the Director's
// height follow it (gm-vision.js); that cut hid the tokens tagged with a higher floor. Now, while the height only follows
// the selection, the floors above may be cut but no token is hidden; a height he sets himself still cuts tokens.
const board3d = readFileSync(new URL('../../../../board3d/integration.mjs', import.meta.url), 'utf8');
const view = readFileSync(new URL('../../../../board3d/scene-view.mjs', import.meta.url), 'utf8');

test('following the selected token never hides a token; a height set by hand still does', () => {
  assert.match(board3d, /const tokens=context\.isGM&&window\.gmVision&&!window\.gmVision\.manual\?-1:level;/);
  assert.match(board3d, /if\(tokens!==tokenLevel\)\{tokenLevel=tokens;view\.setTokenLevel\?\.\(tokens\);/);
  // Every token-shaped thing reads that cut: minis, the tokens' own boxes, their pinned controls, tethers, the turn ghost.
  assert.match(board3d, /profiles,p=>tokenLevel===null\|\|tokenLevel<0\|\|p\.level<=tokenLevel,/);
  assert.match(board3d, /node\.style\.setProperty\('--vtt3d-visible',\(tokenLevel===null\|\|tokenLevel<0\|\|p\.level<=tokenLevel\)/);
  assert.doesNotMatch(board3d, /p\.level<=shownLevel/, 'no token is cut by the floors\' cut any more');
  assert.match(view, /const cut=tokenLevel\?\?activeLevel;visibleTokens=tokenRecords\.filter\(t=>cut<0\|\|belongsToLevel\(t\)<=cut\)/);
  assert.match(view, /setTokenLevel\(level\)\{tokenLevel=Number\.isFinite\(Number\(level\)\)\?Number\(level\):null;/);
});
