<?php
declare(strict_types=1);
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
$path = sys_get_temp_dir() . '/vtt-follow-' . bin2hex(random_bytes(8)) . '.sqlite';
function verifyFollow(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
try {
    $store = new SyncV2Store($path);
    $board = ['placements'=>['scene'=>[['id'=>'hero','profileId'=>'cal','team'=>'ally','column'=>2,'row'=>2,'levelId'=>'upper']]],
        'sceneState'=>['scene'=>['mapLevels'=>['levels'=>[['id'=>'upper','cutouts'=>[['column'=>6,'row'=>5,'width'=>2,'height'=>2]]]]]]]];
    $store->migrateLegacyPlacements($board); $store->migrateLegacyBoardDomains($board);
    $sequence = 0;
    $view = function (array $entry, string $user = 'cal', bool $gm = false) use (&$store, &$sequence) {
        $snapshot = $store->getSnapshot();
        return $store->acceptBoardDomainCommand(['type'=>'level.user.set','operationId'=>'follow-view-'.++$sequence,'sceneId'=>'scene',
            'baseRevision'=>$snapshot['revision'],'entityRevision'=>$snapshot['state']['sceneConfig']['scene']['_revision'],
            'payload'=>['userId'=>$user,'entry'=>$entry]], $gm ? 'GM' : 'cal', $gm);
    };
    $view(['levelId'=>'upper','followToken'=>false]);
    unset($store); $store = new SyncV2Store($path);
    $snapshot = $store->getSnapshot();
    verifyFollow($snapshot['state']['sceneConfig']['scene']['userLevelState']['cal']['followToken'] === false, 'Browse preference survives database reopening.');
    $store->acceptTokenMove(['type'=>'token.move','operationId'=>'browse-fall','sceneId'=>'scene','entityId'=>'hero',
        'baseRevision'=>$snapshot['revision'],'entityRevision'=>0,'payload'=>['column'=>6,'row'=>5]], 'sharon', false);
    $snapshot = $store->getSnapshot();
    verifyFollow($snapshot['state']['placements']['scene']['hero']['levelId'] === 'level-0' && $snapshot['state']['sceneConfig']['scene']['userLevelState']['cal']['levelId'] === 'upper', 'Shared token movement does not pull a browsing player.');
    $view(['levelId'=>'level-0','source'=>'token','tokenId'=>'hero']);
    verifyFollow($store->getSnapshot()['state']['sceneConfig']['scene']['userLevelState']['cal']['followToken'] === false, 'One-time return preserves browse preference.');
    $snapshot = $store->getSnapshot();
    $store->acceptBoardDomainCommand(['type'=>'level.activate','operationId'=>'show-browsing-player','sceneId'=>'scene',
        'baseRevision'=>$snapshot['revision'],'entityRevision'=>$snapshot['state']['sceneConfig']['scene']['_revision'],
        'payload'=>['levelId'=>'upper','userIds'=>['cal']]], 'GM', true);
    $snapshot = $store->getSnapshot();
    verifyFollow($snapshot['state']['sceneConfig']['scene']['userLevelState']['cal']['levelId'] === 'upper' && $snapshot['state']['sceneConfig']['scene']['userLevelState']['cal']['followToken'] === false, 'GM show changes floor but preserves browsing preference.');
    $store->acceptBoardDomainCommand(['type'=>'level.delete','operationId'=>'delete-browsed-floor','sceneId'=>'scene',
        'baseRevision'=>$snapshot['revision'],'entityRevision'=>$snapshot['state']['sceneConfig']['scene']['_revision'],'payload'=>['levelId'=>'upper']], 'GM', true);
    $entry = $store->getSnapshot()['state']['sceneConfig']['scene']['userLevelState']['cal'];
    verifyFollow($entry['levelId'] === 'level-0' && $entry['followToken'] === false, 'Deleted floor fallback preserves browse preference.');
    foreach ([['levelId'=>'level-0','followToken'=>'false'], ['levelId'=>'level-0','followToken'=>true]] as $index=>$entry) {
        $before = $store->getSnapshot(); $rejected = false;
        try { $view($entry, $index === 0 ? 'cal' : 'sharon'); } catch (InvalidArgumentException $error) { $rejected = true; }
        verifyFollow($rejected && $store->getSnapshot() === $before, 'Invalid preference or another player target is rejected atomically.');
    }
    $view(['levelId'=>'level-0','followToken'=>true]);
    verifyFollow($store->getSnapshot()['state']['sceneConfig']['scene']['userLevelState']['cal']['followToken'] === true, 'Player can resume following.');
    echo "Floor follow: browse persistence, shared movement, one-time return, GM show, deletion, validation and permissions passed.\n";
} finally {
    unset($view, $store);
    foreach (['','-wal','-shm'] as $suffix) if (is_file($path.$suffix)) unlink($path.$suffix);
}
