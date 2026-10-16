import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Build 522 (Brandon): an imported map no longer always goes to Unsorted, and a scene already uploaded can be put in
// a folder. The server half is api/v2/tests/scene-folders.test.php.

const manager = readFileSync(new URL('../scene-manager.js', import.meta.url), 'utf8');
const preview = readFileSync(new URL('../scene-import-preview.js', import.meta.url), 'utf8');
const service = readFileSync(new URL('../../services/scene-service.js', import.meta.url), 'utf8');
const piece = (source, name) => { const found = source.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}')); assert.ok(found, name); return found[0]; };

test('each scene in the Scenes panel says which folder it is in, and changing it moves the scene', () => {
  const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const render = new Function('escapeHtml', `${piece(manager, 'renderSceneFolderSelect')}\nreturn renderSceneFolderSelect;`)(escapeHtml);
  const folders = [{ id: 'fld_a', name: 'Dungeons' }, { id: 'fld_b', name: 'Town <old>' }];
  const html = render({ id: 'scn_1', name: 'Dead Root', folderId: 'fld_a' }, folders);
  assert.match(html, /^<select data-action="move-scene" data-scene-id="scn_1" aria-label="Folder for Dead Root">/);
  assert.match(html, /<option value="">Unsorted<\/option><option value="fld_a" selected>Dungeons<\/option><option value="fld_b">Town &lt;old&gt;<\/option>/);
  assert.match(render({ id: 'scn_2', folderId: 'fld_gone' }, folders), /<option value="" selected>Unsorted<\/option>/, 'a scene whose folder is gone shows as Unsorted, as the list groups it');
  assert.match(manager, /<label class="scene-item__folder">Folder \$\{renderSceneFolderSelect\(scene, options\.folders\)\}<\/label>/);
  assert.match(manager, /folders: sceneState\.folders,/);
  assert.match(manager, /const moveSelect = event\.target\.closest\('\[data-action="move-scene"\]'\);[\s\S]{0,300}const moved = await moveSceneToFolder\(endpoints\.scenes, sceneId, folderId\);/);
  assert.match(manager, /showFeedback\(feedback, `Moved to \$\{folder \? folder\.name \|\| 'Untitled Folder' : 'Unsorted'\}\.`, 'success'\);/);
  assert.match(service, /body: JSON\.stringify\(\{ action: 'move-scene', sceneId, folderId: folderId \|\| null \}\),/);
});

test('the import box asks which folder, starting on the package\'s own folder when this game has it', () => {
  assert.match(preview, /const folderLabel=document\.createElement\('label'\); folderLabel\.textContent='Folder';/);
  assert.match(preview, /folderSelect\.append\(choice\('Unsorted',''\),\.\.\.folders\.map\(folder=>choice\(folder\.name\|\|'Untitled Folder',folder\.id\)\)\);/);
  assert.match(preview, /folderSelect\.value=\(folders\.find\(folder=>folder\.id===packageFolder\?\.id\)\|\|folders\.find\(folder=>packageFolder\?\.name&&sameName\(folder\.name\)===sameName\(packageFolder\.name\)\)\)\?\.id\|\|'';/, 'by id, else by name, else Unsorted');
  assert.match(preview, /requestBody=JSON\.stringify\(\{package:packageData,operationId,allowPlayerBrowsing:true,folderId:folderSelect\.value\|\|null\}\);/);
  assert.match(preview, /nameInput\.disabled=true; folderSelect\.disabled=true;/, 'a retry finishes the same import into the same folder');
});
