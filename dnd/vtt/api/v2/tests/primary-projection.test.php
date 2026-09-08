<?php
declare(strict_types=1);
require_once __DIR__ . '/../_common.php';
$path = sys_get_temp_dir() . '/vtt-primary-projection-' . bin2hex(random_bytes(8)) . '.sqlite';
putenv('VTT_SYNC_V2_DATABASE=' . $path);
function verifyPrimaryProjection(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
try {
    $store = vttSyncV2Store();
    $board = ['placements'=>['scene'=>[
        ['id'=>'secret-primary','profileId'=>'cal','primaryPc'=>true,'hidden'=>true,'team'=>'ally','levelId'=>'upper'],
        ['id'=>'visible-copy','profileId'=>'cal','team'=>'ally','levelId'=>'level-0'],
    ]], 'sceneState'=>['scene'=>['mapLevels'=>['levels'=>[['id'=>'upper']]],'userLevelState'=>['cal'=>['levelId'=>'upper','tokenId'=>'secret-primary','source'=>'token']]]]];
    $store->migrateLegacyPlacements($board); $store->migrateLegacyBoardDomains($board);
    $auth = ['isGM'=>false,'user'=>'cal'];
    $projected = vttSyncV2ProjectSnapshotForUser($store->getSnapshot(), $auth);
    verifyPrimaryProjection(array_key_exists('cal', $projected['state']['sceneConfig']['scene']['pcTokenAssociations']) && $projected['state']['sceneConfig']['scene']['pcTokenAssociations']['cal'] === null, 'Hidden primary is explicitly unavailable.');
    verifyPrimaryProjection(!str_contains(json_encode($projected), 'secret-primary'), 'Player snapshot contains no hidden primary ID, including saved view references.');
    $snapshot = $store->getSnapshot();
    $store->acceptPlacementBatch(['type'=>'placement.batch','operationId'=>'hidden-primary-move','baseRevision'=>$snapshot['revision'],
        'payload'=>['actions'=>[['kind'=>'patch','sceneId'=>'scene','placementId'=>'secret-primary','entityRevision'=>0,'patch'=>['levelId'=>'level-0']]]]], 'GM', true);
    verifyPrimaryProjection($store->getSnapshot()['state']['sceneConfig']['scene']['userLevelState']['cal']['levelId'] === 'upper', 'Moving a hidden primary does not pull its viewer.');
    $snapshot = $store->getSnapshot();
    $result = $store->acceptPlacementBatch(['type'=>'placement.batch','operationId'=>'primary-reveal','baseRevision'=>$snapshot['revision'],
        'payload'=>['actions'=>[['kind'=>'patch','sceneId'=>'scene','placementId'=>'secret-primary','entityRevision'=>1,'patch'=>['hidden'=>false,'levelId'=>'upper']]]]], 'GM', true);
    $playerEvent = vttSyncV2ProjectEventForUser($result['event'], ['isGM'=>false]);
    verifyPrimaryProjection($playerEvent['payload']['viewerPcAssociations']['scene']['cal'] === 'secret-primary', 'Shared player event restores association without a user-specific identity.');
    $snapshot = $store->getSnapshot();
    $levels = $snapshot['state']['sceneConfig']['scene']['mapLevels']; $levels['levels'][0]['hidden'] = true;
    $result = $store->acceptBoardDomainCommand(['type'=>'levels.set','operationId'=>'primary-floor-hide','sceneId'=>'scene',
        'baseRevision'=>$snapshot['revision'],'entityRevision'=>$snapshot['state']['sceneConfig']['scene']['_revision'], 'payload'=>['mapLevels'=>$levels]], 'GM', true);
    $playerEvent = vttSyncV2ProjectEventForUser($result['event'], $auth);
    $withReceipts = $result['event'];
    $withReceipts['payload']['zoneEntryReceipt'] = ['placementId'=>'secret-primary'];
    $withReceipts['payload']['zoneEntryReceipts'] = [['placementId'=>'secret-primary']];
    $withoutReceipts = vttSyncV2ProjectEventForUser($withReceipts, $auth);
    verifyPrimaryProjection(!isset($withoutReceipts['payload']['zoneEntryReceipt']) && !isset($withoutReceipts['payload']['zoneEntryReceipts']), 'Server movement receipts never leak through player projection.');
    verifyPrimaryProjection(vttSyncV2ProjectEventForUser($withReceipts, ['isGM'=>true]) === $withReceipts, 'GM/server evidence remains intact.');
    verifyPrimaryProjection($playerEvent['payload']['viewerPcAssociations']['scene']['cal'] === null, 'Hidden floor also disables primary association in live events.');
    verifyPrimaryProjection(!str_contains(json_encode($playerEvent['payload']['viewerPcAssociations']), 'secret-primary'), 'Association never discloses a hidden-floor token ID.');
    echo "Primary projection: hidden token, saved views, shared stream reveal, and hidden floor passed.\n";
} finally {
    unset($store);
    foreach (['','-wal','-shm'] as $suffix) if (is_file($path.$suffix)) unlink($path.$suffix);
}
