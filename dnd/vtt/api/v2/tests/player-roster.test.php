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
    echo "Player roster: normalization, validation, custom profile floor following and shared allied control passed.\n";
} finally {
    unset($store);
    putenv($previous === false ? 'VTT_PLAYER_ROSTER_PATH' : 'VTT_PLAYER_ROSTER_PATH=' . $previous);
    foreach (['','-wal','-shm','.json'] as $suffix) if (is_file($database.$suffix)) unlink($database.$suffix);
}
