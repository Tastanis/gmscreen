<?php
declare(strict_types=1);
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
$database = sys_get_temp_dir() . '/vtt-roster-' . bin2hex(random_bytes(8)) . '.sqlite';
$rosterPath = $database . '.json';
$previous = getenv('VTT_PLAYER_ROSTER_PATH');
function verifyRoster(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
try {
    file_put_contents($rosterPath, json_encode([' Rowan ', 'rowan', 'steel-hero']));
    putenv('VTT_PLAYER_ROSTER_PATH=' . $rosterPath);
    verifyRoster(PlayerRoster::playerIds() === ['rowan','steel-hero'], 'Roster normalizes and deduplicates.');
    foreach ([['gm'], ['../secret'], [12], ['bad id']] as $invalid) {
        $rejected = false;
        try { PlayerRoster::normalize($invalid); } catch (InvalidArgumentException $error) { $rejected = true; }
        verifyRoster($rejected, 'Invalid profile IDs rejected.');
    }
    $store = new SyncV2Store($database);
    $board = ['placements'=>['scene'=>[['id'=>'hero','profileId'=>'rowan','team'=>'ally','column'=>2,'row'=>2,'levelId'=>'upper']]],
        'sceneState'=>['scene'=>['mapLevels'=>['levels'=>[['id'=>'upper','cutouts'=>[['column'=>6,'row'=>5,'width'=>2,'height'=>2]]]]]]]];
    $store->migrateLegacyPlacements($board); $store->migrateLegacyBoardDomains($board);
    $snapshot = $store->getSnapshot();
    $store->acceptTokenMove(['type'=>'token.move','operationId'=>'roster-fall','sceneId'=>'scene','entityId'=>'hero',
        'baseRevision'=>$snapshot['revision'],'entityRevision'=>0,'payload'=>['column'=>6,'row'=>5]], 'another-player', false);
    $snapshot = $store->getSnapshot();
    verifyRoster($snapshot['state']['sceneConfig']['scene']['userLevelState']['rowan']['levelId'] === 'level-0', 'Configured profile follows a token moved by another player.');
    verifyRoster(!isset($snapshot['state']['sceneConfig']['scene']['userLevelState']['another-player']), 'Shared control does not change viewer association.');
    $sequence = 0;
    $batch = function (array $patches, bool $gm = true) use ($store, &$sequence) {
        $snapshot = $store->getSnapshot(); $actions = [];
        foreach ($patches as $id => $patch) $actions[] = ['kind'=>'patch','sceneId'=>'scene','placementId'=>$id,
            'entityRevision'=>$snapshot['state']['placements']['scene'][$id]['_entityRevision'],'patch'=>$patch];
        return $store->acceptPlacementBatch(['type'=>'placement.batch','operationId'=>'primary-patch-'.++$sequence,
            'baseRevision'=>$snapshot['revision'],'payload'=>['actions'=>$actions]], $gm ? 'GM' : 'rowan', $gm);
    };
    $store->acceptPlacementBatch(['type'=>'placement.batch','operationId'=>'primary-duplicate','baseRevision'=>$snapshot['revision'],
        'payload'=>['actions'=>[['kind'=>'add','sceneId'=>'scene','placementId'=>'copy','placement'=>[
            'id'=>'copy','profileId'=>'rowan','team'=>'ally','column'=>2,'row'=>2,'levelId'=>'level-0']]]]], 'GM', true);
    $batch(['hero'=>['primaryPc'=>true,'levelId'=>'upper']]);
    verifyRoster($store->getSnapshot()['state']['sceneConfig']['scene']['userLevelState']['rowan']['levelId'] === 'upper', 'Explicit primary follows despite duplicate.');
    $batch(['copy'=>['levelId'=>'upper']]); $batch(['copy'=>['levelId'=>'level-0']]);
    verifyRoster($store->getSnapshot()['state']['sceneConfig']['scene']['userLevelState']['rowan']['levelId'] === 'upper', 'Non-primary movement does not change viewer floor.');
    foreach ([['copy'=>['primaryPc'=>true]], ['copy'=>['primaryPc'=>'yes']]] as $patches) {
        $before = $store->getSnapshot(); $rejected = false;
        try { $batch($patches); } catch (InvalidArgumentException $error) { $rejected = true; }
        verifyRoster($rejected && $before === $store->getSnapshot(), 'Duplicate/invalid primary rejection is atomic.');
    }
    foreach ([['hero'=>['primaryPc'=>false]], ['hero'=>['profileId'=>'steel-hero']]] as $patches) {
        $before = $store->getSnapshot(); $rejected = false;
        try { $batch($patches, false); } catch (InvalidArgumentException $error) { $rejected = true; }
        verifyRoster($rejected && $before === $store->getSnapshot(), 'Players cannot reassign primary/profile association.');
    }
    $before = $store->getSnapshot()['revision'];
    $batch(['hero'=>['primaryPc'=>false], 'copy'=>['primaryPc'=>true]]);
    verifyRoster($store->getSnapshot()['revision'] === $before + 1, 'Switching primary uses one revision.');
    $batch(['copy'=>['levelId'=>'upper']]); $batch(['copy'=>['levelId'=>'level-0']]);
    verifyRoster($store->getSnapshot()['state']['sceneConfig']['scene']['userLevelState']['rowan']['tokenId'] === 'copy', 'New primary controls subsequent floor following.');
    unset($batch, $store); $store = new SyncV2Store($database);
    verifyRoster($store->getSnapshot()['state']['placements']['scene']['copy']['primaryPc'] === true, 'Primary survives database reopening.');
    echo "Player roster and primary association: configured profiles, duplicates, atomic switch, permissions and reload passed.\n";
} finally {
    unset($store);
    putenv($previous === false ? 'VTT_PLAYER_ROSTER_PATH' : 'VTT_PLAYER_ROSTER_PATH=' . $previous);
    foreach (['','-wal','-shm','.json'] as $suffix) if (is_file($database.$suffix)) unlink($database.$suffix);
}
