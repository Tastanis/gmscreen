import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

// Brandon, November 17, 2026: "in the scenes, i cannot add, import, or d elete a scene in the new table version ... there
// is a show players button at the top of the vtt but that one doesnt work ... the zones, it has me and players. But the
// way it toggles is weird ... i want the defalt to be zones off for both."
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const apps = read('../../../../../table/table-apps.js'), embed = read('../../../../../table/vtt-embed.js');

test('the Scenes list adds, imports and deletes scenes, without opening the map', () => {
  assert.match(apps, /data-tool="new"[^']*\+ New scene<\/button><button class="chip-btn" data-tool="import"/);
  assert.match(apps, /apps\.sceneTools = \(part = 'new'\) => T\.openWindow\(\{ id: 'scene-tools'/);
  assert.ok(existsSync(new URL('../../../../../table/scenes.php', import.meta.url)), 'the Add scenes window');
  const page = read('../../../../../table/scenes.php');
  assert.match(page, /action: 'create-scene'[\s\S]{0,200}playerVisible: false/, 'a new scene starts hidden from the players');
  assert.match(page, /mountSceneImportPreview\(\$\('\[data-scene-import-preview\]'\), \{/, 'the map\'s own import steps');
  assert.match(page, /if \(!\$config\['isGM'\]\) \{ http_response_code\(403\);/);
  // Delete asks first, says when it is the open scene or the players', and goes through the map when it is open.
  assert.match(apps, /data-a="delete" title="Delete this scene \(asks first\)"/);
  assert.match(apps, /window\.confirm\(`Delete “\$\{name\}”\? This cannot be undone\./);
  assert.match(apps, /w\.dispatchEvent\(new w\.CustomEvent\('vtt:scene-delete'/);
  const manager = read('../scene-manager.js');
  assert.match(manager, /window\.addEventListener\('vtt:scene-delete'/);
  assert.match(manager, /window\.addEventListener\('vtt:scenes-refresh'/);
  assert.match(manager, /await stateApi\.recoverSync\?\.\(\);/, 'the board takes the cleared scene from the server at once');
  assert.match(read('../scene-import-preview.js'), /if\(typeof store\?\.openImportedScene==='function'\)\{store\.openImportedScene\(data\.scene\.id\);return;\}/);
});

test('a scene the server cleared stays null on the board, never an empty object', () => {
  const runtime = read('../../sync-v2/token-movement-runtime.js');
  assert.match(runtime, /boardState\[field\] = value === null \|\| typeof value !== 'object' \? value \?\? null : clone\(value\);/);
  const board3d = read('../../../../board3d/integration.mjs');
  assert.match(board3d, /if\(!context\.sceneId&&loadingNote\)loadingNote\.textContent='No scene open\. Open one from Scenes\.';/);
});

test('the top bar\'s Show players shows the open scene to the players, on every scene', () => {
  assert.match(embed, /<button class="te-show-scene" data-show-scene title="Show this scene to the players">Show players<\/button>/);
  assert.doesNotMatch(embed, /data-l="show"/, 'not the old show-this-floor switch inside the height control');
  assert.match(embed, /press\(`\[data-action="show-scene-to-players"\]\[data-scene-id="\$\{CSS\.escape\(id\)\}"\]`\)/);
  assert.match(embed, /here \? 'Players see this' : 'Show players'/);
});

test('zones: off for both by default; Me and Players are separate and show their new state at once', () => {
  const overlay = read('../terrain-zones-overlay.js');
  assert.match(overlay, /const pref = 'terrain-zones-shown:' \+ String\(c\.userId \|\| 'viewer'\), byDefault = !c\.isGM;/);
  assert.match(overlay, /function setVisible\(value\) \{[\s\S]{0,200}showSwitches\(\);\n\}/, 'Me changes only this screen');
  assert.match(overlay, /wantedHidden = !!hidden; wantedAt = Date\.now\(\); showSwitches\(\);/, 'Players shows its new state before the save');
  assert.match(overlay, /if \(want\) delete value\.shownToPlayers; else value\.shownToPlayers = true;/);
});
