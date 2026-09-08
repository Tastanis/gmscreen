<?php
declare(strict_types=1);
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
$database = sys_get_temp_dir() . '/vtt-floor-test-' . bin2hex(random_bytes(8)) . '.sqlite';
$store = new SyncV2Store($database);
function verifyFloor(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }
$stairs = ['id'=>'stair-1','direction'=>'up','linkedLevelId'=>'upper',
    'corners'=>[['column'=>2,'row'=>2],['column'=>4,'row'=>2],['column'=>4,'row'=>4],['column'=>2,'row'=>4]],
    'edgeColors'=>['2,2-3,2'=>'red','3,2-4,2'=>'red','2,4-3,4'=>'green','3,4-4,4'=>'green']];
$board = ['placements'=>['scene'=>[
    ['id'=>'pc','name'=>'Cal','profileId'=>'cal','team'=>'ally','column'=>2,'row'=>0,'width'=>1,'height'=>1,'levelId'=>'level-0'],
    ['id'=>'ally','name'=>'Companion','team'=>'ally','column'=>3,'row'=>0,'width'=>1,'height'=>1,'levelId'=>'level-0'],
]],'sceneState'=>['scene'=>['mapLevels'=>['baseStairs'=>[$stairs], 'levels'=>[
    ['id'=>'hidden-mid','zIndex'=>0,'hidden'=>true],
    ['id'=>'upper','zIndex'=>1,'cutouts'=>[['column'=>6,'row'=>4,'width'=>2,'height'=>2]]],
]]]]];
try {
    $store->migrateLegacyPlacements($board); $store->migrateLegacyBoardDomains($board);
    $snapshot = $store->getSnapshot();
    $half = ['type'=>'token.move','operationId'=>'floor-half-001','sceneId'=>'scene','entityId'=>'pc',
        'baseRevision'=>$snapshot['revision'],'entityRevision'=>0,'payload'=>['column'=>2,'row'=>2]];
    $store->acceptTokenMove($half, 'cal', $board['placements']['scene'][0]);
    $mid = $store->getSnapshot()['state']['placements']['scene']['pc'];
    verifyFloor($mid['levelId'] === 'level-0' && $mid['_floorTraversal']['entry'] === 'red', 'Server must retain halfway traversal.');
    unset($store); $store = new SyncV2Store($database); // Actual DB reopening, not just a JS object copy.
    $snapshot = $store->getSnapshot();
    $finish = [...$half,'operationId'=>'floor-finish-001','baseRevision'=>$snapshot['revision'],'entityRevision'=>1,'payload'=>['column'=>2,'row'=>4]];
    $result = $store->acceptTokenMove($finish, 'cal', $mid);
    $snapshot = $store->getSnapshot();
    verifyFloor($result['event']['type'] === 'placement.batchApplied', 'Transition uses structural entity event.');
    verifyFloor($snapshot['state']['placements']['scene']['pc']['levelId'] === 'upper', 'Player reaches upstairs.');
    verifyFloor($snapshot['state']['sceneConfig']['scene']['userLevelState']['cal']['levelId'] === 'upper', 'Linked view changes in same transaction.');
    verifyFloor(count($result['event']['payload']['userLevelMutations']) === 1, 'Accepted event carries linked viewer change.');
    verifyFloor($store->acceptTokenMove($finish, 'cal', $mid)['idempotent'] === true, 'Duplicate delivery is idempotent.');
    verifyFloor($store->getSnapshot()['revision'] === $snapshot['revision'], 'Duplicate must not advance revision.');
    $rejected = false;
    try {
        $store->acceptPlacementBatch(['type'=>'placement.batch','operationId'=>'floor-illegal-001','baseRevision'=>$snapshot['revision'],
            'payload'=>['actions'=>[['kind'=>'patch','sceneId'=>'scene','placementId'=>'pc','entityRevision'=>2,'patch'=>['levelId'=>'level-0']]]]], 'cal', false);
    } catch (InvalidArgumentException $error) { $rejected = true; }
    verifyFloor($rejected && $store->getSnapshot()['revision'] === $snapshot['revision'], 'Arbitrary player floor editing stays rejected.');
    $batch = $store->acceptPlacementBatch(['type'=>'placement.batch','operationId'=>'floor-batch-001','baseRevision'=>$snapshot['revision'],
        'payload'=>['actions'=>[
            ['kind'=>'patch','sceneId'=>'scene','placementId'=>'pc','entityRevision'=>2,'movementKind'=>'forced','patch'=>['column'=>6,'row'=>4]],
            ['kind'=>'patch','sceneId'=>'scene','placementId'=>'ally','entityRevision'=>0,'movementKind'=>'walk','patch'=>['column'=>3,'row'=>4]],
        ]]], 'cal', false);
    $state = $store->getSnapshot()['state'];
    verifyFloor($state['placements']['scene']['pc']['levelId'] === 'level-0', 'Forced move falls through hole and skips hidden floor.');
    verifyFloor($state['placements']['scene']['ally']['levelId'] === 'upper', 'Group move uses same stair authority.');
    verifyFloor($state['sceneConfig']['scene']['userLevelState']['cal']['levelId'] === 'level-0', 'Fall follows linked player.');
    verifyFloor(count($batch['event']['payload']['mutations']) === 2, 'Group changes share one accepted event.');
    echo "Floor movement: player traversal, DB reopening, atomic viewer, duplicate, permission, group and forced-fall checks passed.\n";
} finally {
    unset($store);
    foreach (['', '-wal', '-shm'] as $suffix) if (is_file($database . $suffix)) unlink($database . $suffix);
}
