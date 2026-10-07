<?php
declare(strict_types=1);
// Tagged terrain zones: validation, GM authority, player projection, floor
// removal, and the scene package round trip. Old scenes have no zones.
require_once __DIR__ . '/../_common.php';
require_once __DIR__ . '/../../../lib/SceneImportValidation.php';
$path = sys_get_temp_dir() . '/vtt-terrain-zones-' . bin2hex(random_bytes(8)) . '.sqlite';
putenv('VTT_SYNC_V2_DATABASE=' . $path);
function zoneCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
function zoneRejects(callable $run, string $expected, string $message): void {
    try { $run(); } catch (InvalidArgumentException $error) {
        zoneCheck(str_contains($error->getMessage(), $expected), $message . ' (got: ' . $error->getMessage() . ')');
        return;
    }
    throw new RuntimeException($message . ' (accepted)');
}
try {
    $fixture = json_decode(file_get_contents(__DIR__ . '/fixtures/terrain-zones-scene.json'), true, 64, JSON_THROW_ON_ERROR);
    $value = $fixture['domains']['sceneConfig']['environment']['zones']['value'];

    // ---- format
    SceneEnvironment::validate('zones', $value);
    SceneEnvironment::validate('zones', ['version'=>1, 'zones'=>[]]);
    $with = static function (array $change) use ($value): array { $copy = $value; $copy['zones'][0] = [...$copy['zones'][0], ...$change]; return $copy; };
    $bad = [
        'Invalid zone format' => ['version'=>2, 'zones'=>[]],
        'Invalid zone list' => ['version'=>1, 'zones'=>['a'=>[]]],
        'Invalid zone record' => $with(['costs'=>2]),
        'Invalid zone ID' => $with(['id'=>'deep-mud']),
        'Invalid zone tag' => $with(['tag'=>'Blood Canal']),
        'Invalid zone label' => $with(['label'=>str_repeat('x', 81)]),
        'Invalid zone floor' => $with(['levelId'=>'']),
        'Invalid geometry number' => $with(['surfaceHeight'=>'0']),
        'Zone cost must be a whole number' => $with(['cost'=>0]),
        'Invalid zone flag' => $with(['gmOnly'=>'yes']),
        'Invalid zone squares' => $with(['squares'=>[]]),
        'Zone squares must be whole' => $with(['squares'=>[[1.5, 2]]]),
        'Zone repeats a square' => $with(['squares'=>[[1, 2], [1, 2]]]),
    ];
    foreach ($bad as $expected=>$candidate) zoneRejects(static fn()=>SceneEnvironment::validate('zones', $candidate), (string) $expected, 'Bad zone data must be refused: ' . $expected);
    zoneRejects(static fn()=>SceneEnvironment::validate('zones', $with(['cost'=>2.5])), 'Zone cost must be a whole number', 'Fractional costs are refused');
    zoneRejects(static fn()=>SceneEnvironment::validate('zones', $with(['cost'=>SceneEnvironment::ZONE_MAX_COST + 1])), 'Zone cost must be a whole number', 'Costs above the limit are refused');
    $many = ['version'=>1, 'zones'=>[]];
    for ($i = 0; $i <= SceneEnvironment::ZONE_LIMIT; $i++) $many['zones'][] = ['id'=>'z' . $i, 'tag'=>'mud', 'squares'=>[[$i, 0]]];
    zoneRejects(static fn()=>SceneEnvironment::validate('zones', $many), 'Invalid zone list', 'Too many zones are refused');
    $wide = ['version'=>1, 'zones'=>[]];
    for ($z = 0; $z < 3; $z++) { $squares = []; for ($i = 0; $i < SceneEnvironment::ZONE_SQUARE_LIMIT; $i++) $squares[] = [$i % 10000, $z * 3 + intdiv($i, 10000)]; $wide['zones'][] = ['id'=>'w' . $z, 'tag'=>'water', 'squares'=>$squares]; }
    zoneRejects(static fn()=>SceneEnvironment::validate('zones', $wide), 'Too many zone squares', 'The total square budget is enforced');
    zoneRejects(static fn()=>SceneEnvironment::validate('zones', $with(['squares'=>[[1, 2]], 'label'=>['__proto__'=>1]])), 'Invalid zone label', 'Labels must be text');
    echo "PASS zone format validation\n";

    // ---- GM authority, revisions and floors through the real command path
    $store = new SyncV2Store($path);
    $levels = ['type'=>'levels.set','sceneId'=>'zones','operationId'=>'zones-levels-1','baseRevision'=>0,'entityRevision'=>0,
        'payload'=>['mapLevels'=>$fixture['domains']['sceneConfig']['mapLevels']]];
    $accepted = $store->acceptBoardDomainCommand($levels, 'GM', true);
    zoneCheck($accepted['status'] === 'accepted', 'Fixture floors install: ' . json_encode($accepted));
    $set = ['type'=>'environment.set','sceneId'=>'zones','operationId'=>'zones-set-1','baseRevision'=>1,'entityRevision'=>1,
        'payload'=>['field'=>'zones','expectedRevision'=>0,'value'=>$value]];
    zoneRejects(static fn()=>$store->acceptBoardDomainCommand($set, 'cal', false), 'GM-only', 'Players cannot write zones');
    $result = $store->acceptBoardDomainCommand($set, 'GM', true);
    zoneCheck($result['status'] === 'accepted' && $result['event']['type'] === 'environment.changed' && $result['event']['payload']['field'] === 'zones', 'GM saves zones through environment.set');
    zoneCheck($store->acceptBoardDomainCommand($set, 'GM', true)['idempotent'] === true, 'Replaying the same save changes nothing');
    $stored = $store->getSnapshot()['state']['sceneConfig']['zones']['environment']['zones'];
    zoneCheck($stored['revision'] === 1 && $stored['value'] === $value, 'Zones are stored exactly as sent, at revision 1');
    $stale = [...$set, 'operationId'=>'zones-set-2', 'baseRevision'=>2, 'entityRevision'=>2];
    zoneRejects(static fn()=>$store->acceptBoardDomainCommand($stale, 'GM', true), 'Map design changed', 'A stale zone save is refused');
    $missing = $stale; $missing['operationId'] = 'zones-set-3'; $missing['payload']['expectedRevision'] = 1; $missing['payload']['value']['zones'][0]['levelId'] = 'no-such-floor';
    zoneRejects(static fn()=>$store->acceptBoardDomainCommand($missing, 'GM', true), 'missing floor', 'A zone on a missing floor is refused');
    zoneCheck($store->getSnapshot()['state']['sceneConfig']['zones']['environment']['zones'] === $stored, 'Refused saves leave the stored zones alone');
    echo "PASS zone authority, revisions and floor check\n";

    // ---- what players receive
    $gm = ['user'=>'GM','isGM'=>true]; $player = ['user'=>'cal','isGM'=>false];
    $snapshot = $store->getSnapshot();
    $gmView = vttSyncV2ProjectSnapshotForUser($snapshot, $gm)['state']['sceneConfig']['zones']['environment']['zones']['value']['zones'];
    $playerView = vttSyncV2ProjectSnapshotForUser($snapshot, $player)['state']['sceneConfig']['zones']['environment']['zones']['value']['zones'];
    zoneCheck(count($gmView) === 5 && in_array('hidden-pit', array_column($gmView, 'id'), true), 'The GM receives every zone');
    zoneCheck(count($playerView) === 4 && !in_array('hidden-pit', array_column($playerView, 'id'), true) && array_is_list($playerView), 'A player snapshot leaves out GM-only zones');
    zoneCheck(!str_contains(json_encode(vttSyncV2ProjectSnapshotForUser($snapshot, $player)), 'Hidden pit'), 'No trace of the GM-only zone in the player snapshot');
    $playerEvent = vttSyncV2ProjectEventForUser($result['event'], $player);
    zoneCheck(!str_contains(json_encode($playerEvent), 'hidden-pit') && count($playerEvent['payload']['entry']['value']['zones']) === 4, 'The live zone event leaves out GM-only zones for players');
    zoneCheck(count(vttSyncV2ProjectEventForUser($result['event'], $gm)['payload']['entry']['value']['zones']) === 5, 'The GM event is complete');
    echo "PASS zone projection for GM and players\n";

    // ---- removing a floor drops its zones and nothing else
    $pruned = SceneEnvironment::removeLevels(['zones'=>['revision'=>1,'value'=>$value]], ['bridge-deck']);
    zoneCheck($pruned['zones']['revision'] === 2 && count($pruned['zones']['value']['zones']) === 4 && !in_array('deck-oil', array_column($pruned['zones']['value']['zones'], 'id'), true), 'Deleting a floor removes the zones on it');
    $untouched = SceneEnvironment::removeLevels(['zones'=>['revision'=>1,'value'=>$value]], ['some-other-floor']);
    zoneCheck($untouched['zones'] === ['revision'=>1,'value'=>$value], 'Deleting an unrelated floor leaves zones and their revision alone');
    zoneCheck(SceneEnvironment::removeLevels(['terrain'=>['revision'=>3,'value'=>['n'=>2,'m'=>2,'h'=>[0,0,0,0]]]], ['bridge-deck']) === ['terrain'=>['revision'=>3,'value'=>['n'=>2,'m'=>2,'h'=>[0,0,0,0]]]], 'Scenes with no zones or walls are unchanged by floor removal');
    $delete = $store->acceptBoardDomainCommand(['type'=>'level.delete','sceneId'=>'zones','operationId'=>'zones-floor-delete','baseRevision'=>2,'entityRevision'=>2,'payload'=>['levelId'=>'bridge-deck']], 'GM', true);
    $afterDelete = $store->getSnapshot()['state']['sceneConfig']['zones']['environment']['zones'];
    zoneCheck($delete['status'] === 'accepted' && $afterDelete['revision'] === 2 && count($afterDelete['value']['zones']) === 4, 'Deleting the floor through the real command removes its zone');
    zoneCheck(isset($delete['event']['payload']['environment']['zones']) && !str_contains(json_encode(vttSyncV2ProjectEventForUser($delete['event'], $player)), 'hidden-pit'), 'The floor-delete event carries the pruned zones and still hides GM-only zones from players');
    echo "PASS floor removal prunes zones\n";

    // ---- scene package: import check and copy with fresh floor ids
    SceneImportValidation::validate($fixture);
    $copy = ScenePackage::prepareForNewScene($fixture, 'scn-zones-copy-0001');
    $newFloor = $copy['idMap']['levels']['bridge-deck'];
    $copied = array_column($copy['package']['domains']['sceneConfig']['environment']['zones']['value']['zones'], null, 'id');
    zoneCheck($newFloor !== 'bridge-deck' && $copied['deck-oil']['levelId'] === $newFloor, 'A copied scene points the upper-floor zone at the new floor id');
    zoneCheck($copied['blood-canal']['levelId'] === 'level-0' && $copied['holy-ground']['levelId'] === 'level-0', 'Ground zones stay on the ground floor (missing floor means ground)');
    zoneCheck($copied['deep-mud']['squares'] === [[9, 5], [10, 5], [9, 6], [10, 6]] && $copied['deep-mud']['cost'] === 4 && $copied['hidden-pit']['gmOnly'] === true, 'Squares, cost and GM-only survive the copy');
    SceneImportValidation::validate($copy['package']);
    $orphan = $fixture; $orphan['domains']['sceneConfig']['environment']['zones']['value']['zones'][4]['levelId'] = 'gone';
    zoneRejects(static fn()=>SceneImportValidation::validate($orphan), 'missing floor', 'Import refuses a zone on a floor the package does not have');
    zoneRejects(static fn()=>ScenePackage::prepareForNewScene($orphan, 'scn-zones-copy-0002'), 'missing floor', 'Copy refuses a zone on a missing floor');
    $export = ScenePackage::build($fixture['scene'], ['revision'=>4, 'state'=>['sceneConfig'=>['zones-fixture'=>$fixture['domains']['sceneConfig']]]]);
    zoneCheck($export['domains']['sceneConfig']['environment']['zones']['value'] === $value, 'Export keeps zones untouched');
    $old = $fixture; unset($old['domains']['sceneConfig']['environment']);
    SceneImportValidation::validate($old);
    zoneCheck(!isset(ScenePackage::prepareForNewScene($old, 'scn-zones-copy-0003')['package']['domains']['sceneConfig']['environment']), 'A scene with no zones gains none on copy');
    echo "PASS scene package import, copy and export with zones\n";
} finally {
    unset($store);
    foreach ([$path, $path . '-wal', $path . '-shm'] as $file) if (is_file($file)) @unlink($file);
}
