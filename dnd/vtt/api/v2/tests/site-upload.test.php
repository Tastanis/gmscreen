<?php
declare(strict_types=1);
// The key-guarded site upload (dnd/admin/site-upload): who is let in, where a map goes, what a
// replaced scene keeps, and how creatures are filed. The endpoint itself is a thin shell over the
// functions tested here; the tester's sandbox exercises it over HTTP.
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
require_once __DIR__ . '/../../../lib/SceneImportCatalog.php';
require_once __DIR__ . '/../../../../admin/site-upload/lib.php';
require_once __DIR__ . '/../../../../strixhaven/monster-creator/includes/monster-store.php';
function upCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
function upRefused(callable $fn, string $because, string $message): void {
    try { $fn(); } catch (InvalidArgumentException $error) { upCheck(str_contains($error->getMessage(), $because), $message . ': refused for the wrong reason: ' . $error->getMessage()); return; }
    throw new RuntimeException($message . ': it was accepted');
}
$scratch = sys_get_temp_dir() . '/vtt-site-upload-' . bin2hex(random_bytes(6));
mkdir($scratch, 0700, true);
$remove = static function (string $dir) use (&$remove): void { foreach (glob($dir . '/{,.}*', GLOB_BRACE) ?: [] as $entry) { if (in_array(basename($entry), ['.', '..'], true)) continue; is_dir($entry) ? $remove($entry) : @unlink($entry); } @rmdir($dir); };
try {

// ---- who is let in ------------------------------------------------------------------------
$key = 'k' . str_repeat('A1b2', 16); // 65 characters: a stand-in, never a real key
$config = ['key_sha256'=>hash('sha256', $key), 'allow_loopback_http'=>false];
$ask = static fn (array $server, array $with = [], int $now = 1000000, ?string $dir = null) => siteUploadAuthorize(['REQUEST_METHOD'=>'POST','HTTPS'=>'on','REMOTE_ADDR'=>'203.0.113.9','HTTP_X_GMSCREEN_UPLOAD_KEY'=>$key, ...$server], [...$config, ...$with], $dir ?? $GLOBALS['state'], $now);
$state = $scratch . '/state-a'; mkdir($state);
upCheck($ask([]) === [200, ''], 'The right key over HTTPS is let in');
upCheck($ask(['HTTPS'=>''])[0] === 403 && $ask(['HTTPS'=>''])[1] === 'HTTPS required.', 'Plain HTTP is refused');
upCheck($ask(['HTTPS'=>'','REMOTE_ADDR'=>'127.0.0.1'])[0] === 403, 'even from this machine, unless the configuration says so');
upCheck($ask(['HTTPS'=>'','REMOTE_ADDR'=>'127.0.0.1'], ['allow_loopback_http'=>true]) === [200, ''], 'which the test sandbox does');
upCheck($ask(['HTTPS'=>'','REMOTE_ADDR'=>'203.0.113.9'], ['allow_loopback_http'=>true])[0] === 403, 'and that never lets in plain HTTP from anywhere else');
upCheck($ask(['REQUEST_METHOD'=>'GET'])[0] === 405, 'Only POST: the key is never in an address');
upCheck(siteUploadRecentFailures($state, 1000000) === [], 'None of those was a wrong key');
foreach ([['HTTP_X_GMSCREEN_UPLOAD_KEY'=>''], ['HTTP_X_GMSCREEN_UPLOAD_KEY'=>'short'], ['HTTP_X_GMSCREEN_UPLOAD_KEY'=>strrev($key)], ['HTTP_X_GMSCREEN_UPLOAD_KEY'=>$key . 'x']] as $n => $wrong) {
    upCheck($ask($wrong, [], 1000000 + $n) === [403, 'Access denied.'], 'A missing, short or wrong key is refused, with no hint which');
}
upCheck(count(siteUploadRecentFailures($state, 1000010)) === 4, 'Each wrong key is counted');
upCheck($ask([], ['key_sha256'=>''])[0] === 403 && $ask([], ['key_sha256'=>'not-a-hash'])[0] === 403, 'A configuration with no proper fingerprint lets no one in');
$state = $scratch . '/state-b'; mkdir($state);
for ($n = 0; $n < SITE_UPLOAD_MAX_FAILURES; $n++) $ask(['HTTP_X_GMSCREEN_UPLOAD_KEY'=>str_repeat('z', 40)], [], 2000000 + $n);
upCheck($ask([], [], 2000100)[0] === 429, 'After eight wrong keys every caller is turned away, the right key too');
upCheck($ask([], [], 2000000 + SITE_UPLOAD_FAILURE_WINDOW + 20) === [200, ''], 'and let in again when fifteen minutes have passed');
// Switched off: no configuration file, or something that is not one.
upCheck(siteUploadConfig($scratch . '/missing.php') === null, 'With no configuration file the upload does not exist');
file_put_contents($scratch . '/bad.php', "<?php return 'yes';");
upCheck(siteUploadConfig($scratch . '/bad.php') === null, 'nor with a file that is not a configuration');
file_put_contents($scratch . '/good.php', "<?php return ['key_sha256'=>'" . hash('sha256', $key) . "'];");
upCheck(is_array(siteUploadConfig($scratch . '/good.php')), 'A proper file switches it on');
upCheck(!str_contains((string) file_get_contents($scratch . '/good.php'), $key), 'The server\'s file holds a fingerprint, not the key');
echo "PASS only the right key, over HTTPS, by POST; wrong keys are counted and then everyone waits\n";

// ---- a small map package --------------------------------------------------------------------
$grid = ['size'=>100,'locked'=>true,'visible'=>false,'offsetX'=>0,'offsetY'=>0];
$package = static function (string $name, array $levels = ['upper'], array $segments = null, array $placements = []) use ($grid): array {
    $segments ??= [['id'=>'wall-a','a'=>'n1','b'=>'n2','material'=>'stone'], ['id'=>'wall-b','a'=>'n2','b'=>'n3','material'=>'wood'], ['id'=>'wall-c','a'=>'n3','b'=>'n4']];
    return ['format'=>'gmscreen-scene/v1', 'sourceRevision'=>0,
        'scene'=>['id'=>'scn-source-of-' . preg_replace('/[^a-z]/', '', strtolower($name)) . '-0001', 'name'=>$name, 'folderId'=>null, 'mapUrl'=>'/dnd/vtt/storage/uploads/' . strtolower(str_replace(' ', '-', $name)) . '.jpg', 'thumbnailUrl'=>null, 'grid'=>$grid],
        'folder'=>null,
        'domains'=>['placements'=>$placements, 'drawings'=>[], 'templates'=>[], 'sceneConfig'=>['grid'=>$grid,
            'mapLevels'=>['baseStairs'=>[], 'levels'=>array_map(static fn ($id, $i) => ['id'=>$id,'name'=>ucfirst($id),'elevationSquares'=>6 * ($i + 1),'zIndex'=>$i + 1,'cutouts'=>[],'stairs'=>[]], $levels, array_keys($levels))],
            'environment'=>['walls'=>['revision'=>1, 'value'=>['version'=>1,
                'nodes'=>[['id'=>'n1','x'=>0,'y'=>0],['id'=>'n2','x'=>1,'y'=>0],['id'=>'n3','x'=>2,'y'=>0],['id'=>'n4','x'=>3,'y'=>0]],
                'segments'=>$segments, 'roofs'=>[], 'ramps'=>[]]]]]]];
};
$newStore = static function () use ($scratch): SyncV2Store { $store = new SyncV2Store($scratch . '/world-' . bin2hex(random_bytes(4)) . '.sqlite'); $store->migrateLegacyPlacements(['placements'=>[]]); return $store; };
$catalog = ['folders'=>[['id'=>'fld_prismari','name'=>'Prismari','createdAt'=>'2026-01-01T00:00:00+00:00']], 'items'=>[]];
$load = static function () use (&$catalog): array { return $catalog; };
$persist = static function (array $next) use (&$catalog): void { $catalog = ['folders'=>array_values($next['folders'] ?? []), 'items'=>array_values($next['items'] ?? [])]; };
$upload = static fn (SyncV2Store $store, array $request) => siteUploadImportMap($request, $store, $load, $persist);
$item = static function (string $name) use (&$catalog): ?array { foreach ($catalog['items'] as $scene) if ($scene['name'] === $name) return $scene; return null; };

// ---- where a map goes --------------------------------------------------------------------------
$store = $newStore();
$before = $store->getSnapshot()['revision'];
$dry = $upload($store, ['operationId'=>'upload-orchard-0001','package'=>$package('Gravity Orchard'),'folder'=>'prismari','dryRun'=>true]);
upCheck($dry['result']['action'] === 'created' && $dry['result']['folder'] === 'Prismari' && $dry['result']['dryRun'] === true && $dry['events'] === [], 'Asked first, the server says what it would do');
upCheck($store->getSnapshot()['revision'] === $before && $catalog['items'] === [], 'and writes nothing');
$done = $upload($store, ['operationId'=>'upload-orchard-0001','package'=>$package('Gravity Orchard'),'folder'=>'prismari']);
upCheck($done['result']['action'] === 'created' && $done['result']['folder'] === 'Prismari' && $done['result']['folderCreated'] === false, 'A new map is created in the folder named, whatever its capitals: ' . json_encode($done['result']));
upCheck($done['result']['counts'] === ['floors'=>2,'walls'=>3,'breakableWalls'=>2,'plates'=>0,'ramps'=>0,'zones'=>0,'tokens'=>0], 'The report counts what is in it: ' . json_encode($done['result']['counts']));
upCheck(($item('Gravity Orchard')['folderId'] ?? null) === 'fld_prismari' && count($done['events']) === 1 && $done['events'][0]['type'] === 'scene.installed', 'It is in the scene list, in that folder, and open browsers are told');
$sceneId = $done['result']['scene']['id'];
upCheck(isset($store->getSnapshot()['state']['sceneConfig'][$sceneId]['environment']['walls']), 'and its design is on the board');
// The same upload sent again (a lost reply) is not a second copy.
$again = $upload($store, ['operationId'=>'upload-orchard-0001','package'=>$package('Gravity Orchard'),'folder'=>'prismari']);
upCheck($again['result']['idempotent'] === true && $again['result']['scene']['id'] === $sceneId && count($catalog['items']) === 1 && $again['events'] === [], 'Sent twice, it is done once');
// A second upload of the same map is refused unless told to replace.
upRefused(fn () => $upload($store, ['operationId'=>'upload-orchard-0002','package'=>$package('Gravity Orchard')]), 'already exists in the folder Prismari. Add --replace', 'A map whose scene exists');
upRefused(fn () => $upload($store, ['operationId'=>'upload-orchard-0002','package'=>$package('gravity orchard '),'dryRun'=>true]), 'already exists', 'and it is refused when asked first, before any picture is sent');
upCheck(count($catalog['items']) === 1, 'so there are never two copies');
// Folders.
upRefused(fn () => $upload($store, ['operationId'=>'upload-other-0001','package'=>$package('Dead Root'),'folder'=>'Witherbloom']), 'There is no folder named "Witherbloom". The folders are: Prismari. Add --create-folder', 'A folder that does not exist');
$made = $upload($store, ['operationId'=>'upload-other-0001','package'=>$package('Dead Root'),'folder'=>'Witherbloom','createFolder'=>true]);
upCheck($made['result']['folder'] === 'Witherbloom' && $made['result']['folderCreated'] === true && siteUploadFolderNames($catalog) === ['Prismari','Witherbloom'], 'With the word, the folder is made');
upCheck(($item('Dead Root')['folderId'] ?? null) === $catalog['folders'][1]['id'], 'and the scene is in it');
$loose = $upload($store, ['operationId'=>'upload-third-0001','package'=>$package('Bathhouse'),'name'=>'Elowin Bathhouse']);
upCheck($loose['result']['folder'] === null && $loose['result']['scene']['name'] === 'Elowin Bathhouse' && array_key_exists('folderId', $item('Elowin Bathhouse')) && $item('Elowin Bathhouse')['folderId'] === null, 'With no folder named it goes where the Scenes screen puts an import: in none. A name can be given');
upRefused(fn () => $upload($store, ['operationId'=>'bad','package'=>$package('X')]), 'Invalid import operation ID', 'A request with no proper id');
upRefused(fn () => $upload($store, ['operationId'=>'upload-none-0001']), 'A scene package is required', 'A request with no package');
$broken = $package('Broken Map'); $broken['domains']['sceneConfig']['environment']['walls']['value']['segments'][0]['material'] = 'ice';
upRefused(fn () => $upload($store, ['operationId'=>'upload-bad-0001','package'=>$broken]), 'Invalid wall material', 'A package the Scenes screen would refuse');
upCheck($item('Broken Map') === null, 'and nothing of it is kept');
echo "PASS a map goes into the folder named, once; a second copy is refused; a refused package leaves nothing\n";

// ---- replacing a scene in place -------------------------------------------------------------
// The Director has been using the scene: two tokens (one on the upper floor), a broken wall, a
// drawing. Then a newer version of the map is uploaded with --replace.
$snap = $store->getSnapshot(); $levelId = $snap['state']['sceneConfig'][$sceneId]['mapLevels']['levels'][0]['id'];
$store->acceptPlacementBatch(['type'=>'placement.batch','operationId'=>'place-two-tokens','baseRevision'=>$snap['revision'],'payload'=>['actions'=>[
    ['kind'=>'add','sceneId'=>$sceneId,'placementId'=>'hero','placement'=>['id'=>'hero','name'=>'Cal','column'=>4,'row'=>4,'levelId'=>$levelId]],
    ['kind'=>'add','sceneId'=>$sceneId,'placementId'=>'foe','placement'=>['id'=>'foe','name'=>'Tender','column'=>7,'row'=>2,'levelId'=>'level-0']]]]], 'GM', true);
$snap = $store->getSnapshot(); $walls = $snap['state']['sceneConfig'][$sceneId]['environment']['walls'];
$walls['value']['segments'][0]['broken'] = true;
$store->acceptBoardDomainCommand(['type'=>'environment.set','operationId'=>'break-wall-a-0001','sceneId'=>$sceneId,'baseRevision'=>$snap['revision'],'entityRevision'=>$snap['state']['sceneConfig'][$sceneId]['_revision'],
    'payload'=>['field'=>'walls','expectedRevision'=>$walls['revision'],'value'=>$walls['value']]], 'GM', true);
$snap = $store->getSnapshot();
$store->acceptBoardDomainCommand(['type'=>'scene.activate','operationId'=>'put-on-table-0001','sceneId'=>$sceneId,'baseRevision'=>$snap['revision'],'entityRevision'=>(int) ($snap['state']['routing']['_revision'] ?? 0),
    'payload'=>['mapUrl'=>'/dnd/vtt/storage/uploads/gravity-orchard.jpg']], 'GM', true);
$before = $store->getSnapshot();
// Version two: a wall more, the wood wall gone, the same floor, a new picture, and a token of its own.
$two = $package('Gravity Orchard', ['upper'], [['id'=>'wall-a','a'=>'n1','b'=>'n2','material'=>'stone'], ['id'=>'wall-c','a'=>'n3','b'=>'n4'], ['id'=>'wall-d','a'=>'n2','b'=>'n4','material'=>'glass']],
    ['p1'=>['id'=>'p1','name'=>'Prop','column'=>1,'row'=>1,'levelId'=>'level-0']]);
$two['scene']['mapUrl'] = '/dnd/vtt/storage/uploads/gravity-orchard-v2.jpg';
$replaced = $upload($store, ['operationId'=>'upload-orchard-0003','package'=>$two,'replace'=>true]);
$after = $store->getSnapshot(); $config = $after['state']['sceneConfig'][$sceneId]; $segments = array_column($config['environment']['walls']['value']['segments'], null, 'id');
upCheck($replaced['result']['action'] === 'replaced' && $replaced['result']['scene']['id'] === $sceneId && $replaced['result']['folder'] === 'Prismari', 'The scene is updated in place: the same scene, still in its folder');
upCheck(count($catalog['items']) === 3 && $item('Gravity Orchard')['mapUrl'] === '/dnd/vtt/storage/uploads/gravity-orchard-v2.jpg', 'still one copy in the list, with the new picture');
upCheck(array_keys($segments) === ['wall-a','wall-c','wall-d'], 'The walls are the new version\'s');
upCheck(($segments['wall-a']['broken'] ?? false) === true && !isset($segments['wall-d']['broken']), 'A wall that was broken is still broken; a new wall stands');
upCheck($config['environment']['walls']['revision'] === $before['state']['sceneConfig'][$sceneId]['environment']['walls']['revision'] + 1, 'The design has a newer revision than any browser holds');
$tokens = $after['state']['placements'][$sceneId];
upCheck(array_keys($tokens) === ['hero','foe'] && $tokens['hero']['column'] == 4 && $tokens['hero']['levelId'] === $levelId && $tokens['foe']['row'] == 2, 'Both tokens are where they were, the hero still on the upper floor: ' . json_encode(array_map(static fn ($t) => [$t['column'], $t['row'], $t['levelId']], $tokens)));
upCheck($config['mapLevels']['levels'][0]['id'] === $levelId, 'because a floor keeps its id from one version of the map to the next');
upCheck($replaced['result']['kept'] === ['tokens'=>2,'drawings'=>0,'templates'=>0,'brokenWalls'=>1,'tokensMovedToGround'=>0,'packageTokensNotAdded'=>1,'rememberedGround'=>false], 'The report says what was kept, that the package\'s own token was not added, and that a new ground picture means explored ground starts again: ' . json_encode($replaced['result']['kept']));
upCheck(array_column($replaced['events'], 'type') === ['scene.layoutRestored','routing.changed'] && $replaced['result']['onTheTable'] === true, 'Open browsers are sent the whole scene, and the table its new picture: ' . json_encode(array_column($replaced['events'], 'type')));
upCheck($after['state']['routing']['mapUrl'] === '/dnd/vtt/storage/uploads/gravity-orchard-v2.jpg' && $after['state']['routing']['activeSceneId'] === $sceneId, 'The scene on the table stays on the table');
upCheck($after['revision'] === $before['revision'] + 2, 'Two changes, in order');
$twice = $upload($store, ['operationId'=>'upload-orchard-0003','package'=>$two,'replace'=>true]);
upCheck($twice['result']['idempotent'] === true && $twice['events'] === [] && $store->getSnapshot()['revision'] === $after['revision'] && $twice['result']['kept'] === null, 'Sent twice, it is replaced once');
// A version with the upper floor gone: the hero is put on the ground, not lost.
$flat = $package('Gravity Orchard', [], [['id'=>'wall-a','a'=>'n1','b'=>'n2','material'=>'stone']]);
$flat['scene']['mapUrl'] = '/dnd/vtt/storage/uploads/gravity-orchard-v2.jpg'; // the same picture as before
$third = $upload($store, ['operationId'=>'upload-orchard-0004','package'=>$flat,'replace'=>true,'folder'=>'Witherbloom']);
$tokens = $store->getSnapshot()['state']['placements'][$sceneId];
upCheck($tokens['hero']['levelId'] === 'level-0' && $tokens['hero']['column'] == 4 && $third['result']['kept']['tokensMovedToGround'] === 1, 'A token on a floor the new map lacks stands on the ground floor, in its square');
upCheck($third['result']['folder'] === 'Witherbloom' && $item('Gravity Orchard')['folderId'] === $catalog['folders'][1]['id'], 'Naming a folder when replacing moves the scene there');
upCheck(count($third['events']) === 1, 'The picture did not change this time, so the table is not told of one');
upCheck($third['result']['kept']['rememberedGround'] === true, 'and with the same ground picture, grid and heights, what each player has explored is reported as kept');
// The view's tilt is part of what a browser remembers explored ground against.
$tilted = $flat; $tilted['domains']['sceneConfig']['environment']['walls']['value']['view'] = ['slant'=>.12];
$fourth = $upload($store, ['operationId'=>'upload-orchard-0005','package'=>$tilted,'replace'=>true]);
upCheck($fourth['result']['kept']['rememberedGround'] === false, 'A map whose view is tilted differently is reported as starting explored ground again');
// A player is sent the replaced scene the way a checkpoint restore sends it.
upCheck(isset($replaced['events'][0]['payload']['domains']['sceneConfig'], $replaced['events'][0]['payload']['domains']['placements']), 'The event carries the whole scene');
unset($store);
echo "PASS replacing keeps tokens, broken walls and the folder; floors keep their ids; the table is told\n";

// ---- creatures ---------------------------------------------------------------------------------
$creature = static fn (string $name, array $extra = []) => ['name'=>$name,'level'=>3,'image'=>'','abilities'=>['action'=>[['name'=>'Bite']],'passive'=>[]], ...$extra];
$data = ['tabs'=>['tab_1'=>['name'=>'Orchard','subTabs'=>['sub_1'=>['name'=>'Foes','monsters'=>['tender']]]]], 'monsters'=>['tender'=>$creature('Orchard Tender', ['image'=>'images/tender.png','tabId'=>'tab_1','subTabId'=>'sub_1','created'=>111])]];
$merge = static fn (array $entries, array $options = []) => siteUploadMergeCreatures($data, $entries, $options, 999000);
// New, with no tab named: into "Imported / General", made if need be.
$m = $merge([['file'=>'driftstone.json','monster'=>$creature('Driftstone'),'requestedId'=>'driftstone-level-3']]);
upCheck($m['changed'] && $m['results'] === [['file'=>'driftstone.json','name'=>'Driftstone','action'=>'created','id'=>'driftstone-level-3','tab'=>'Imported / General','abilities'=>1]], 'A new creature goes into Imported / General: ' . json_encode($m['results']));
$imported = array_values(array_filter($m['data']['tabs'], static fn ($tab) => $tab['name'] === 'Imported'))[0];
upCheck(array_values($imported['subTabs'])[0]['monsters'] === ['driftstone-level-3'] && $m['data']['monsters']['driftstone-level-3']['lastModified'] === 999000, 'and is listed there');
// Into a named tab and sub-tab.
$m = $merge([['file'=>'a.json','monster'=>$creature('Vine Lasher')]], ['tab'=>'orchard','subTab'=>'foes']);
upCheck($m['results'][0]['tab'] === 'Orchard / Foes' && $m['results'][0]['id'] === 'monster_vine_lasher' && $m['data']['tabs']['tab_1']['subTabs']['sub_1']['monsters'] === ['tender','monster_vine_lasher'], 'A named tab and sub-tab are found whatever their capitals: ' . json_encode($m['results'][0]));
$m = $merge([['file'=>'a.json','monster'=>$creature('Vine Lasher')]], ['tab'=>'Witherbloom']);
upCheck($m['results'][0]['action'] === 'refused' && str_contains($m['results'][0]['reason'], 'There is no tab named "Witherbloom". The tabs are: Orchard. Add --create-tab') && !$m['changed'], 'A tab that does not exist is refused, with the tabs there are');
$m = $merge([['file'=>'a.json','monster'=>$creature('Vine Lasher')]], ['tab'=>'Witherbloom','createTab'=>true,'subTab'=>'Swamp']);
upCheck($m['results'][0]['tab'] === 'Witherbloom / Swamp', 'With the word, the tab is made');
// The same name again.
$m = $merge([['file'=>'tender.json','monster'=>$creature('orchard tender', ['level'=>4])]]);
upCheck($m['results'][0]['action'] === 'refused' && str_contains($m['results'][0]['reason'], 'already exists. Add --replace') && !$m['changed'], 'A creature whose name is there already is refused');
$m = $merge([['file'=>'tender.json','monster'=>$creature('Orchard Tender', ['level'=>4])]], ['replace'=>true,'tab'=>'Somewhere Else']);
$kept = $m['data']['monsters']['tender'];
upCheck($m['results'][0] === ['file'=>'tender.json','name'=>'Orchard Tender','action'=>'replaced','id'=>'tender','tab'=>'Orchard / Foes','abilities'=>1], 'Asked to, it is replaced where it is: ' . json_encode($m['results'][0]));
upCheck($kept['level'] === 4 && $kept['image'] === 'images/tender.png' && $kept['tabId'] === 'tab_1' && $kept['created'] === 111 && $kept['lastModified'] === 999000 && count($m['data']['monsters']) === 1, 'It keeps its id, its tab and its portrait, and has the new numbers');
$m = $merge([['file'=>'tender.json','monster'=>$creature('Orchard Tender', ['image'=>'images/new.png'])]], ['replace'=>true]);
upCheck($m['data']['monsters']['tender']['image'] === 'images/new.png', 'A portrait named in the new file is used');
// Two with one name are never guessed between; a file that is not a creature is refused; the rest of a batch goes on.
$two = $data; $two['monsters']['tender2'] = $creature('Orchard Tender');
$m = siteUploadMergeCreatures($two, [['file'=>'tender.json','monster'=>$creature('Orchard Tender')], ['file'=>'junk.json','monster'=>['name'=>'','abilities'=>[]]], ['file'=>'new.json','monster'=>$creature('Bramble')]], ['replace'=>true], 999000);
upCheck(array_column($m['results'], 'action') === ['refused','refused','created'] && str_contains($m['results'][0]['reason'], '2 creatures are already named'), 'One bad file does not stop the others: ' . json_encode(array_column($m['results'], 'action')));
// Two new creatures with one name in one batch: the second is a duplicate of the first.
$m = $merge([['file'=>'a.json','monster'=>$creature('Twin')], ['file'=>'b.json','monster'=>$creature('Twin')]]);
upCheck(array_column($m['results'], 'action') === ['created','refused'], 'A batch cannot add two creatures of one name');
upCheck(siteUploadTabNames($data) === [['name'=>'Orchard','subTabs'=>['Foes']]], 'The tool is told the tab names and nothing else');
echo "PASS creatures are filed by tab, replaced in place only when asked, and never guessed between\n";

// ---- the monster creator's file is written the way its own Save writes it ---------------------
$dir = $scratch . '/monsters/'; mkdir($dir); $file = $dir . 'gm-monsters.json';
upCheck(monsterStoreRead($file)['monsters'] === [] && isset(monsterStoreRead($file)['abilityTabs']['common']), 'With no file yet, the empty list the monster creator starts from');
monsterStoreWriteLocked($data, $file, $dir, 'pre-save', 'site-upload');
$read = monsterStoreRead($file);
upCheck($read['monsters']['tender']['name'] === 'Orchard Tender' && $read['metadata']['user'] === 'site-upload' && $read['tabs'] === $data['tabs'], 'Written and read back whole, with who saved it');
monsterStoreWriteLocked([...$read, 'monsters'=>[...$read['monsters'], 'new'=>$creature('New')]], $file, $dir, 'pre-save', 'site-upload');
upCheck(count(monsterStoreRead($file)['monsters']) === 2 && count(glob($dir . '*.tmp.*') ?: []) === 0, 'A second save replaces the first and leaves no temporary file');
$threw = false;
try { monsterStoreWriteLocked(['monsters'=>[]], $file, $dir, 'pre-save', 'site-upload'); } catch (Exception $error) { $threw = true; }
upCheck($threw && count(monsterStoreRead($file)['monsters']) === 2, 'Data that is not the monster creator\'s shape is refused, and the file is as it was');
echo "PASS the monster file is written with a backup, whole, or not at all\n";

} finally { $remove($scratch); }
