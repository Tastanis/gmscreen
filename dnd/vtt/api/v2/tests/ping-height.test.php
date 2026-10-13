<?php
declare(strict_types=1);
// Brandon, October 12, 2026: "The pings have the same issue, being drawn on the lowest part of the map instead of
// the level you click on." A ping carries the height of what was clicked (in squares) so every page draws it on
// that floor. The browser's side is height-of-pings-and-auras.test.mjs.
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
function pingCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$database = sys_get_temp_dir() . '/vtt-ping-' . bin2hex(random_bytes(6)) . '.sqlite';
$store = new SyncV2Store($database);
try {
    $store->migrateLegacyPlacements(['placements'=>['scene'=>[]]]);
    $send = static function (string $id, array $ping, string $actor = 'cal') use ($store) {
        $snap = $store->getSnapshot();
        return $store->acceptBoardDomainCommand(['type'=>'ping.add','operationId'=>'ping-height-' . $id,'sceneId'=>'scene','entityId'=>$id,'baseRevision'=>$snap['revision'],'payload'=>['ping'=>$ping]], $actor, false);
    };
    $result = $send('up', ['x'=>0.5, 'y'=>0.25, 'z'=>6.5, 'type'=>'ping']);
    $kept = $store->getSnapshot()['state']['pings']['up'] ?? null;
    pingCheck($result['status'] === 'accepted' && ($kept['z'] ?? null) === 6.5 && $kept['x'] === 0.5 && $kept['authorId'] === 'cal', 'A ping on a floor above keeps its height: ' . json_encode($kept));
    pingCheck(($result['event']['payload']['ping']['z'] ?? null) === 6.5, 'and every page is told it: ' . json_encode($result['event']['payload'] ?? null));
    $send('ground', ['x'=>0.5, 'y'=>0.25, 'type'=>'focus']);
    $ground = $store->getSnapshot()['state']['pings']['ground'];
    pingCheck(!array_key_exists('z', $ground) && $ground['type'] === 'focus', 'A ping that says no height is on the ground, as before: ' . json_encode($ground));
    $send('zero', ['x'=>0.1, 'y'=>0.1, 'z'=>0]);
    pingCheck(!array_key_exists('z', $store->getSnapshot()['state']['pings']['zero']), 'and so is one at height nought');
    $send('pit', ['x'=>0.1, 'y'=>0.1, 'z'=>-8]);
    pingCheck((float) ($store->getSnapshot()['state']['pings']['pit']['z'] ?? 0) === -8.0, 'A ping down a pit keeps its depth');
    foreach (['high', [3], 2000000] as $k => $bad) {
        try { $send('bad' . $k, ['x'=>0.1, 'y'=>0.1, 'z'=>$bad]); pingCheck(false, "A height of " . json_encode($bad) . ' was accepted'); }
        catch (InvalidArgumentException $error) { pingCheck(str_contains($error->getMessage(), 'height must be a number'), 'A height that is not a number is refused plainly: ' . $error->getMessage()); }
    }
    unset($store);
} finally { @unlink($database); }
echo "ping height: a ping carries the height of what was clicked\n";
