<?php
declare(strict_types=1);
require __DIR__ . '/../../../lib/SyncV2Store.php';
function sceneCheck($ok, $message) { if (!$ok) throw new RuntimeException($message); }
$store = new SyncV2Store(':memory:');
$store->migrateLegacyBoardDomains(['activeSceneId' => 'scene-a', 'mapUrl' => '/maps/a.jpg', 'sceneState' => ['scene-a' => [], 'scene-b' => []]]);
$routing = fn() => $store->getSnapshot()['state']['routing'];
$send = function (array $command, bool $gm = true) use ($store) {
    $snapshot = $store->getSnapshot();
    return $store->acceptBoardDomainCommand([
        'operationId' => 'scene-map-' . bin2hex(random_bytes(6)),
        'baseRevision' => $snapshot['revision'],
        'entityRevision' => (int) ($snapshot['state']['routing']['_revision'] ?? 0),
        ...$command,
    ], $gm ? 'GM' : 'cal', $gm);
};
sceneCheck($routing()['activeSceneId'] === 'scene-a' && $routing()['mapUrl'] === '/maps/a.jpg', 'Starting state');

// One command switches the scene and its picture together.
$result = $send(['type' => 'scene.activate', 'sceneId' => 'scene-b', 'payload' => ['mapUrl' => '/maps/b.jpg']]);
sceneCheck($result['event']['type'] === 'scene.activated', 'Scene switch is one event');
sceneCheck($result['event']['payload']['routing']['activeSceneId'] === 'scene-b' && $result['event']['payload']['routing']['mapUrl'] === '/maps/b.jpg', 'The event already carries the new picture, so no client is ever told "scene B, picture A"');
sceneCheck($routing()['activeSceneId'] === 'scene-b' && $routing()['mapUrl'] === '/maps/b.jpg', 'Saved together');

// An older browser still sends the bare command and then the picture; that keeps working.
$bare = $send(['type' => 'scene.activate', 'sceneId' => 'scene-a', 'payload' => []]);
sceneCheck($bare['event']['payload']['routing']['activeSceneId'] === 'scene-a' && $bare['event']['payload']['routing']['mapUrl'] === '/maps/b.jpg', 'A bare switch leaves the picture alone, as before');
$send(['type' => 'routing.set', 'payload' => ['routing' => ['mapUrl' => '/maps/a.jpg']]]);
sceneCheck($routing()['mapUrl'] === '/maps/a.jpg', 'Two-step switch from an older browser');

// A scene with no picture clears it in the same step.
$send(['type' => 'scene.activate', 'sceneId' => 'scene-b', 'payload' => ['mapUrl' => null]]);
sceneCheck($routing()['activeSceneId'] === 'scene-b' && $routing()['mapUrl'] === null, 'A null picture is honoured');

// Bad pictures are refused and change nothing.
foreach ([['mapUrl' => 12], ['mapUrl' => ['x']], ['mapUrl' => str_repeat('x', 2049)]] as $payload) {
    $refused = false;
    try { $send(['type' => 'scene.activate', 'sceneId' => 'scene-a', 'payload' => $payload]); } catch (InvalidArgumentException $e) { $refused = true; }
    sceneCheck($refused && $routing()['activeSceneId'] === 'scene-b', 'Invalid picture refused');
}
// Anything else in the payload is dropped, not stored.
$send(['type' => 'scene.activate', 'sceneId' => 'scene-a', 'payload' => ['mapUrl' => '/maps/a.jpg', 'playerMapUrl' => '/maps/evil.jpg', 'extra' => true]]);
sceneCheck($routing()['mapUrl'] === '/maps/a.jpg' && ($routing()['playerMapUrl'] ?? null) !== '/maps/evil.jpg' && !array_key_exists('extra', $routing()), 'Only the picture travels with a scene switch');

// A stale second switch is refused and cannot split the pair.
$snapshot = $store->getSnapshot();
$stale = $store->acceptBoardDomainCommand(['operationId' => 'scene-map-stale-0001', 'type' => 'scene.activate', 'sceneId' => 'scene-b', 'baseRevision' => $snapshot['revision'], 'entityRevision' => 0, 'payload' => ['mapUrl' => '/maps/b.jpg']], 'GM', true);
sceneCheck(($stale['error'] ?? '') === 'entity_revision_mismatch' && $routing()['activeSceneId'] === 'scene-a' && $routing()['mapUrl'] === '/maps/a.jpg', 'A refused switch changes neither the scene nor the picture');
echo "Scene switch carries its map picture atomically; older two-step clients still work.\n";
