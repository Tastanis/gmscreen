<?php
declare(strict_types=1);
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
$database = sys_get_temp_dir() . '/vtt-floor-views-' . bin2hex(random_bytes(8)) . '.sqlite';
function verifyView(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
try {
    $store = new SyncV2Store($database);
    $levels = ['levels'=>[['id'=>'lower','zIndex'=>0], ['id'=>'upper','zIndex'=>1]]];
    $board = ['placements'=>['scene'=>[['id'=>'hero','column'=>2,'row'=>3,'levelId'=>'upper']]],
        'sceneState'=>['scene'=>['mapLevels'=>$levels, 'userLevelState'=>[
            'cal'=>['levelId'=>'upper','source'=>'activate'], 'sharon'=>['levelId'=>'lower','source'=>'manual'],
            'gm'=>['levelId'=>'upper','source'=>'manual'], 'offline-player'=>['levelId'=>'upper','source'=>'token','tokenId'=>'hero'],
        ]]]];
    $store->migrateLegacyPlacements($board); $store->migrateLegacyBoardDomains($board);
    $before = $store->getSnapshot();
    $levels['levels'][1]['hidden'] = true;
    $command = ['type'=>'levels.set', 'operationId'=>'hide-floor-views', 'sceneId'=>'scene',
        'baseRevision'=>$before['revision'], 'entityRevision'=>$before['state']['sceneConfig']['scene']['_revision'],
        'payload'=>['mapLevels'=>$levels]];
    $result = $store->acceptBoardDomainCommand($command, 'GM', true);
    $after = $store->getSnapshot(); $views = $after['state']['sceneConfig']['scene']['userLevelState'];
    verifyView($after['revision'] === $before['revision'] + 1, 'Floor and view cleanup share one revision.');
    verifyView($views['cal']['levelId'] === 'lower' && $views['offline-player']['levelId'] === 'lower', 'Connected and disconnected players leave hidden floors.');
    verifyView($views['gm']['levelId'] === 'upper', 'GM can continue inspecting a hidden floor.');
    verifyView($views['sharon'] === $before['state']['sceneConfig']['scene']['userLevelState']['sharon'], 'Valid views remain unchanged.');
    verifyView($views['offline-player']['source'] === 'manual' && !isset($views['offline-player']['tokenId']), 'Fallback must not claim it follows a token on another floor.');
    verifyView($result['event']['payload']['userLevelState'] === $views, 'Canonical event carries the same cleaned views.');
    verifyView($after['state']['placements'] === $before['state']['placements'], 'Hiding a floor never moves its tokens.');
    verifyView($store->acceptBoardDomainCommand($command, 'GM', true)['idempotent'], 'Retry cannot perform a second cleanup.');
    $levels['levels'] = [];
    $command['operationId'] = 'delete-floor-views'; $command['baseRevision'] = $after['revision'];
    $command['entityRevision'] = $after['state']['sceneConfig']['scene']['_revision']; $command['payload']['mapLevels'] = $levels;
    $store->acceptBoardDomainCommand($command, 'GM', true);
    $after = $store->getSnapshot();
    foreach ($after['state']['sceneConfig']['scene']['userLevelState'] as $view) verifyView($view['levelId'] === 'level-0', 'Deleted stack returns every viewer, including GM, to base.');
    unset($store); $store = new SyncV2Store($database);
    verifyView($store->getSnapshot() === $after, 'Offline reload sees the cleaned canonical view.');
    echo "Floor view lifecycle: atomic hide/delete cleanup, GM visibility, offline users, unchanged tokens and retry passed.\n";
} finally {
    unset($store);
    foreach (['', '-wal', '-shm'] as $suffix) if (is_file($database . $suffix)) unlink($database . $suffix);
}
