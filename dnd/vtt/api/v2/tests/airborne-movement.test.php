<?php
declare(strict_types=1);
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
$database = sys_get_temp_dir() . '/vtt-air-' . bin2hex(random_bytes(8)) . '.sqlite';
function verifyAir(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
try {
    $store = new SyncV2Store($database);
    $board = ['placements'=>['scene'=>[['id'=>'hero','name'=>'Cal','profileId'=>'cal','team'=>'ally','column'=>2,'row'=>2,'levelId'=>'upper']]],
        'sceneState'=>['scene'=>['mapLevels'=>['levels'=>[['id'=>'upper','cutouts'=>[['column'=>6,'row'=>5,'width'=>2,'height'=>2]]]]]]]];
    $store->migrateLegacyPlacements($board); $store->migrateLegacyBoardDomains($board);
    $sequence = 0;
    $patch = function (array $patch) use (&$store, &$sequence) {
        $snapshot = $store->getSnapshot();
        return $store->acceptPlacementBatch(['type'=>'placement.batch','operationId'=>'air-patch-'.++$sequence,'baseRevision'=>$snapshot['revision'],
            'payload'=>['actions'=>[['kind'=>'patch','sceneId'=>'scene','placementId'=>'hero',
                'entityRevision'=>$snapshot['state']['placements']['scene']['hero']['_entityRevision'],'patch'=>$patch]]]], 'cal', false);
    };
    $patch(['movementMode'=>'fly']);
    $snapshot = $store->getSnapshot();
    $store->acceptTokenMove(['type'=>'token.move','operationId'=>'air-walk-over-hole','sceneId'=>'scene','entityId'=>'hero',
        'baseRevision'=>$snapshot['revision'],'entityRevision'=>$snapshot['state']['placements']['scene']['hero']['_entityRevision'],
        'payload'=>['column'=>6,'row'=>5]], 'cal', false);
    verifyAir($store->getSnapshot()['state']['placements']['scene']['hero']['levelId'] === 'upper', 'Flying token stays over a hole.');
    unset($store); $store = new SyncV2Store($database);
    verifyAir($store->getSnapshot()['state']['placements']['scene']['hero']['movementMode'] === 'fly', 'Flight survives reload.');
    $patch(['movementMode'=>'hover']); $patch(['conditions'=>[['name'=>'Prone']]]);
    verifyAir($store->getSnapshot()['state']['placements']['scene']['hero']['levelId'] === 'upper', 'Hover remains airborne while prone.');
    $rejected = false;
    try { $patch(['movementMode'=>'fly']); } catch (InvalidArgumentException $error) { $rejected = true; }
    verifyAir($rejected, 'Prone token cannot start ordinary flight.');
    $patch(['conditions'=>[], 'movementMode'=>'fly']);
    $patch(['conditions'=>['prone']]);
    $landed = $store->getSnapshot()['state']['placements']['scene']['hero'];
    verifyAir($landed['movementMode'] === 'ground' && $landed['levelId'] === 'level-0', 'Prone ends ordinary flight and resolves support atomically.');
    verifyAir($store->getSnapshot()['state']['sceneConfig']['scene']['userLevelState']['cal']['levelId'] === 'level-0', 'Linked view follows landing.');
    foreach (['forced','teleport'] as $kind) {
        $air = [...$landed, 'movementMode'=>'hover', 'levelId'=>'upper'];
        verifyAir(FloorGeometry::move($air, $air, $board['sceneState']['scene']['mapLevels'], $kind)['levelId'] === 'upper', 'Airborne forced/teleport movement preserves support mode.');
    }
    $before = $store->getSnapshot(); $rejected = false;
    try { $patch(['movementMode'=>'levitate-unknown']); } catch (InvalidArgumentException $error) { $rejected = true; }
    verifyAir($rejected && $store->getSnapshot() === $before, 'Unknown movement modes cannot alter state.');
    $store->acceptPlacementBatch(['type'=>'placement.batch','operationId'=>'air-enemy-setup','baseRevision'=>$before['revision'],
        'payload'=>['actions'=>[['kind'=>'patch','sceneId'=>'scene','placementId'=>'hero',
            'entityRevision'=>$before['state']['placements']['scene']['hero']['_entityRevision'], 'patch'=>['team'=>'enemy','combatTeam'=>'enemy']]]]], 'GM', true);
    $before = $store->getSnapshot(); $rejected = false;
    try { $patch(['movementMode'=>'hover']); } catch (InvalidArgumentException $error) { $rejected = true; }
    verifyAir($rejected && $store->getSnapshot() === $before, 'Player cannot change an enemy movement mode.');
    $store->acceptPlacementBatch(['type'=>'placement.batch','operationId'=>'air-hidden-place','baseRevision'=>$before['revision'],
        'payload'=>['actions'=>[['kind'=>'patch','sceneId'=>'scene','placementId'=>'hero',
            'entityRevision'=>$before['state']['placements']['scene']['hero']['_entityRevision'], 'patch'=>['team'=>'ally','combatTeam'=>'ally','levelId'=>'upper']]]]], 'GM', true);
    $before = $store->getSnapshot(); $levels = $before['state']['sceneConfig']['scene']['mapLevels'];
    $levels['levels'][0]['hidden'] = true;
    $store->acceptBoardDomainCommand(['type'=>'levels.set','operationId'=>'air-hide-floor','sceneId'=>'scene',
        'baseRevision'=>$before['revision'],'entityRevision'=>$before['state']['sceneConfig']['scene']['_revision'],'payload'=>['mapLevels'=>$levels]], 'GM', true);
    $before = $store->getSnapshot(); $rejected = false;
    try { $patch(['movementMode'=>'hover']); } catch (InvalidArgumentException $error) { $rejected = true; }
    verifyAir($rejected && $store->getSnapshot() === $before, 'Player cannot change a token on a hidden floor.');
    echo "Airborne movement: hole crossing, reload, prone/hover, landing and alternate movement passed.\n";
} finally {
    unset($store, $patch);
    foreach (['', '-wal', '-shm'] as $suffix) if (is_file($database . $suffix)) unlink($database . $suffix);
}
