<?php
declare(strict_types=1);
require_once __DIR__ . '/../_common.php';
$path = sys_get_temp_dir() . '/vtt-preview-' . bin2hex(random_bytes(8)) . '.sqlite';
putenv('VTT_SYNC_V2_DATABASE=' . $path);
function verifyPreview(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
try {
    $store = vttSyncV2Store();
    $board = ['placements'=>['scene'=>[
        ['id'=>'hero','profileId'=>'cal','primaryPc'=>true,'team'=>'ally','levelId'=>'level-0'],
        ['id'=>'secret','hidden'=>true,'levelId'=>'level-0'],
        ['id'=>'upper-secret','levelId'=>'hidden-floor'],
    ]], 'sceneState'=>['scene'=>[
        'mapLevels'=>['levels'=>[['id'=>'hidden-floor','hidden'=>true,'mapUrl'=>'/secret-map.jpg']]],
        'userLevelState'=>['cal'=>['levelId'=>'level-0','followToken'=>false,'source'=>'manual']],
    ]]];
    $store->migrateLegacyPlacements($board); $store->migrateLegacyBoardDomains($board);
    $before = $store->getSnapshot();
    $sessionBefore = $_SESSION;
    foreach (['cal','sharon'] as $userId) {
        $preview = vttSyncV2BuildPlayerPreview($before, $userId);
        verifyPreview($preview['userId'] === $userId && $preview['readOnly'], 'Explicit preview identity and scope.');
        verifyPreview($preview['snapshot'] === vttSyncV2ProjectSnapshotForUser($before, ['user'=>$userId,'isGM'=>false]), 'Preview uses actual player projection.');
        verifyPreview(!str_contains(json_encode($preview), 'secret'), 'Hidden tokens and floor assets excluded.');
    }
    foreach (['gm','unknown-player',''] as $invalid) {
        try { vttSyncV2BuildPlayerPreview($before, $invalid); throw new RuntimeException('Invalid player accepted.'); }
        catch (InvalidArgumentException $expected) {}
    }
    verifyPreview($_SESSION === $sessionBefore, 'Preview never impersonates a session.');
    verifyPreview($before === $store->getSnapshot(), 'Preview preserves every canonical domain and revision.');
    echo "Player preview projection and read-only invariants passed.\n";
} finally {
    unset($store);
    foreach (['','-wal','-shm'] as $suffix) if (is_file($path.$suffix)) unlink($path.$suffix);
}
