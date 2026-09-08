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
    verifyView($after['state']['placements']['scene']['hero']['levelId'] === 'level-0', 'Deleting all floors relocates remaining tokens atomically.');
    $store = new SyncV2Store($database, 'support-world');
    $board = ['placements'=>['scene'=>[
        ['id'=>'hero','profileId'=>'cal','team'=>'ally','column'=>2,'row'=>2,'width'=>1,'height'=>1,'levelId'=>'top','stamina'=>7,
            'persistentZones'=>[['id'=>'top-zone','levelId'=>'top'],['id'=>'legacy-zone']]],
        ['id'=>'large','column'=>2,'row'=>2,'width'=>2,'height'=>2,'levelId'=>'top'],
        ['id'=>'remote-caster','profileId'=>'sharon','team'=>'ally','column'=>9,'row'=>9,'levelId'=>'level-0',
            'persistentZones'=>[['id'=>'remote-top-zone','template'=>['levelId'=>'top']],['id'=>'lower-zone','levelId'=>'lower']]],
    ]], 'sceneState'=>['scene'=>['mapLevels'=>['levels'=>[
        ['id'=>'lower','zIndex'=>0,'cutouts'=>[['column'=>2,'row'=>2,'width'=>1,'height'=>1]]],
        ['id'=>'secret','zIndex'=>1,'hidden'=>true], ['id'=>'top','zIndex'=>2],
    ]], 'userLevelState'=>['cal'=>['levelId'=>'top','source'=>'token','tokenId'=>'hero']]]]];
    foreach (['drawings', 'templates'] as $domain) $board[$domain] = [
        'scene'=>[['id'=>$domain.'-top','levelId'=>'top'], ['id'=>$domain.'-lower','levelId'=>'lower']],
        'other'=>[['id'=>$domain.'-other','levelId'=>'top']],
    ];
    $board['sceneState']['scene']['fogOfWar'] = ['byLevel'=>['top'=>['enabled'=>true], 'lower'=>['enabled'=>false]]];
    $board['sceneState']['scene']['mapLevels']['baseStairs'] = [['id'=>'base-link','linkedLevelId'=>'top']];
    $board['sceneState']['scene']['mapLevels']['levels'][0]['stairs'] = [['id'=>'lower-link','linkedLevelId'=>'top'], ['id'=>'retained-link','linkedLevelId'=>'secret']];
    $store->migrateLegacyPlacements($board); $store->migrateLegacyBoardDomains($board);
    $before = $store->getSnapshot();
    $delete = ['type'=>'level.delete','operationId'=>'delete-supported-top','sceneId'=>'scene',
        'baseRevision'=>$before['revision'],'entityRevision'=>$before['state']['sceneConfig']['scene']['_revision'],
        'payload'=>['levelId'=>'top']];
    $result = $store->acceptBoardDomainCommand($delete, 'GM', true); $after = $store->getSnapshot();
    verifyView($after['revision'] === $before['revision'] + 1 && count($result['event']['payload']['mutations']) === 3, 'Deletion, token moves and remote zone cleanup share one event.');
    verifyView(array_column($after['state']['placements']['scene']['hero']['persistentZones'],'id') === ['legacy-zone'], 'Relocated caster loses only zones on the deleted floor.');
    verifyView(array_column($after['state']['placements']['scene']['remote-caster']['persistentZones'],'id') === ['lower-zone'], 'Caster on another floor loses deleted-floor zones too.');
    verifyView(!isset($after['state']['sceneConfig']['scene']['userLevelState']['sharon']), 'Zone-only cleanup does not manufacture a linked player view.');
    foreach (['hero','remote-caster'] as $id) verifyView($after['state']['placements']['scene'][$id]['_entityRevision'] === $before['state']['placements']['scene'][$id]['_entityRevision'] + 1, 'Each affected placement advances once.');
    $remoteMutation = array_values(array_filter($result['event']['payload']['mutations'], static fn($m) => $m['placementId'] === 'remote-caster'))[0];
    verifyView($remoteMutation['changedFields'] === ['persistentZones'], 'Remote caster publishes a zone-only mutation.');
    verifyView($after['state']['placements']['scene']['hero']['levelId'] === 'level-0', 'Small token falls through the lower hole and skips hidden floors.');
    verifyView($after['state']['placements']['scene']['large']['levelId'] === 'lower', 'Partial support catches a large token.');
    verifyView($after['state']['placements']['scene']['hero']['stamina'] === 7, 'Relocation preserves current resources.');
    verifyView($after['state']['sceneConfig']['scene']['userLevelState']['cal']['levelId'] === 'level-0', 'Linked viewer follows the actual supported landing.');
    foreach (['drawings', 'templates'] as $domain) {
        verifyView(!isset($after['state'][$domain]['scene'][$domain.'-top']), 'Deleted floor content removed atomically.');
        verifyView(isset($after['state'][$domain]['scene'][$domain.'-lower']) && isset($after['state'][$domain]['other'][$domain.'-other']), 'Other floor and scene content preserved.');
    }
    verifyView(count($result['event']['payload']['removedContent']) === 2, 'Event carries exact entity removals.');
    $config = $after['state']['sceneConfig']['scene'];
    verifyView(!isset($config['fogOfWar']['byLevel']['top']) && isset($config['fogOfWar']['byLevel']['lower']), 'Only deleted-floor fog is removed.');
    verifyView($config['mapLevels']['baseStairs'][0]['linkedLevelId'] === null, 'Base stairs disconnect deleted destination.');
    verifyView($config['mapLevels']['levels'][0]['stairs'][0]['linkedLevelId'] === null, 'Surviving floor stairs disconnect deleted destination.');
    verifyView($config['mapLevels']['levels'][0]['stairs'][1]['linkedLevelId'] === 'secret', 'Unrelated stair links remain intact.');
    verifyView($store->acceptBoardDomainCommand($delete, 'GM', true)['idempotent'], 'Duplicate delete returns the original accepted event.');
    $delete['operationId'] = 'player-delete-denied'; $delete['payload']['levelId'] = 'lower';
    $rejected = false;
    try { $store->acceptBoardDomainCommand($delete, 'cal', false); } catch (InvalidArgumentException $error) { $rejected = true; }
    verifyView($rejected && $store->getSnapshot() === $after, 'Player cannot delete floors or relocate their occupants.');
    echo "Floor view lifecycle: atomic hide/delete cleanup, GM visibility, offline users, unchanged tokens and retry passed.\n";
} finally {
    unset($store);
    foreach (['', '-wal', '-shm'] as $suffix) if (is_file($database . $suffix)) unlink($database . $suffix);
}
