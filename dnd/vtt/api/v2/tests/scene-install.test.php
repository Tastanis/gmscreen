<?php
declare(strict_types=1);
require_once __DIR__ . '/../_common.php';
require_once __DIR__ . '/../../../lib/SceneImportCatalog.php';
$path = sys_get_temp_dir() . '/vtt-import-' . bin2hex(random_bytes(8)) . '.sqlite';
putenv('VTT_SYNC_V2_DATABASE=' . $path);
function verifyInstall(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
try {
    $store = vttSyncV2Store();
    $store->migrateLegacyPlacements(['placements'=>['original'=>[['id'=>'hero','column'=>1,'row'=>2]]]]);
    $before = $store->getSnapshot();
    $package = ScenePackage::build(['id'=>'source','name'=>'Imported','mapUrl'=>'/map.jpg'],['state'=>[
        'placements'=>['source'=>['visible'=>['id'=>'visible','column'=>3,'row'=>4], 'secret'=>['id'=>'secret','hidden'=>true,'imageUrl'=>'/secret-token.png']]],
        'sceneConfig'=>['source'=>['mapLevels'=>['levels'=>[['id'=>'secret-floor','hidden'=>true,'mapUrl'=>'/secret-floor.png']]]]],
        'drawings'=>['source'=>['secret-line'=>['id'=>'secret-line','levelId'=>'secret-floor']]],
        'templates'=>['source'=>['circle'=>['id'=>'circle','type'=>'circle','center'=>['column'=>2,'row'=>2],'radius'=>2]]],
    ]]);
    $denied=false;
    try { $store->installScenePackage($package,'import-operation-1','cal',false); } catch (InvalidArgumentException $error) { $denied=true; }
    verifyInstall($denied && $store->getSnapshot()===$before, 'Players cannot import scenes.');
    $fault = new PDO('sqlite:' . $path);
    $fault->exec("CREATE TRIGGER reject_import_event BEFORE INSERT ON vtt_events WHEN NEW.event_type = 'scene.installed' BEGIN SELECT RAISE(ABORT, 'test interruption'); END");
    $failed=false;
    try { $store->installScenePackage($package,'import-operation-1','GM',true); } catch (PDOException $error) { $failed=true; }
    verifyInstall($failed && $store->getSnapshot()===$before && $store->pendingSceneImports()===[], 'Failed event commit rolls back domains and catalog receipt together.');
    $fault->exec('DROP TRIGGER reject_import_event');
    $accepted = $store->installScenePackage($package,'import-operation-1','GM',true);
    $sceneId = $accepted['scene']['id']; $after = $store->getSnapshot();
    verifyInstall($after['revision']===$before['revision']+1, 'All scene domains install in one world revision.');
    foreach (['placements','sceneConfig','drawings','templates'] as $domain) verifyInstall(isset($after['state'][$domain][$sceneId]), 'Every copied domain is saved.');
    verifyInstall($after['state']['placements']['original']===$before['state']['placements']['original'] && ($after['state']['routing'] ?? null)===($before['state']['routing'] ?? null), 'Original scene and routing remain unchanged.');
    $reopened = new SyncV2Store($path);
    verifyInstall(count($reopened->pendingSceneImports())===1, 'Catalog recovery survives process restart.');
    $retry = $reopened->installScenePackage($package,'import-operation-1','GM',true);
    verifyInstall($retry['idempotent'] && $retry['event']===$accepted['event'] && $reopened->getSnapshot()===$after, 'Retry returns the original transaction without reinstalling data.');
    $changed=$package; $changed['scene']['name']='Changed'; $denied=false;
    try { $reopened->installScenePackage($changed,'import-operation-1','GM',true); } catch (InvalidArgumentException $error) { $denied=true; }
    verifyInstall($denied && $reopened->getSnapshot()===$after, 'Changed request cannot reuse an accepted operation.');
    $playerEvent=vttSyncV2ProjectEventForUser($accepted['event'],['user'=>'cal','isGM'=>false]);
    $playerJson=json_encode($playerEvent);
    verifyInstall(!str_contains($playerJson,'/secret-token.png') && !str_contains($playerJson,'/secret-floor.png') && count($playerEvent['payload']['domains']['placements'])===1 && $playerEvent['payload']['domains']['drawings']===[], 'Install delivery hides secret tokens, floors and their content.');
    $catalog=['folders'=>[['id'=>'keep-folder']], 'items'=>[['id'=>'keep-scene','name'=>'Existing']]];
    $failed=false;
    try { SceneImportCatalog::recover($reopened,$catalog,static function (): void { throw new RuntimeException('disk failure'); }); } catch (RuntimeException $error) { $failed=true; }
    verifyInstall($failed && count($reopened->pendingSceneImports())===1, 'Failed catalog save leaves the receipt pending.');
    $saved=null;
    try { SceneImportCatalog::recover($reopened,$catalog,static function (array $next) use (&$saved): void { $saved=$next; throw new RuntimeException('stopped after save'); }); } catch (RuntimeException $error) {}
    verifyInstall(count($saved['items'])===2 && count($reopened->pendingSceneImports())===1, 'Interruption after catalog save retains the recovery receipt.');
    $saved['items'][1]['name']='GM changed the name';
    $recovered=SceneImportCatalog::recover($reopened,$saved,static function (): void { throw new RuntimeException('Must not overwrite a saved import'); });
    verifyInstall($recovered===$saved && $recovered['folders']===$catalog['folders'], 'Recovery detects the saved import and preserves later edits and unrelated catalog entries.');
    verifyInstall($reopened->pendingSceneImports()===[] && $reopened->getSnapshot()===$after, 'Catalog acknowledgment does not write board state.');
    $second=$reopened->installScenePackage($package,'import-operation-2','GM',true);
    verifyInstall($second['scene']['id']!==$sceneId, 'A separate import creates a separate scene.');
    $reopened->deleteScene($second['scene']['id'],'GM');
    verifyInstall($reopened->pendingSceneImports()===[], 'Deletion cancels pending catalog recovery, preventing resurrection.');
    $deleted=$reopened->getSnapshot();
    $reopened->installScenePackage($package,'import-operation-2','GM',true);
    verifyInstall($reopened->getSnapshot()===$deleted, 'Retry after deletion cannot recreate the scene.');
    echo json_encode(['before'=>$before,'after'=>$after,'event'=>$accepted['event'],'playerEvent'=>$playerEvent]);
} finally {
    unset($store,$reopened,$fault);
    foreach (['','-wal','-shm'] as $suffix) if (is_file($path.$suffix)) @unlink($path.$suffix);
}
