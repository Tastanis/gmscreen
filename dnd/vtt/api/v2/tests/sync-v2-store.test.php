<?php
declare(strict_types=1);

require_once __DIR__ . '/../../../lib/SyncV2Store.php';

function expect(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$databasePath = sys_get_temp_dir()
    . DIRECTORY_SEPARATOR
    . 'vtt-sync-v2-'
    . bin2hex(random_bytes(8))
    . '.sqlite';

try {
    $store = new SyncV2Store($databasePath, 'test-world', 2, 2);
    $initial = $store->getSnapshot();
    expect($initial['revision'] === 0, 'Initial revision must be zero.');

    $commandOne = [
        'operationId' => 'operation-0001',
        'type' => 'shadow.observe',
        'baseRevision' => 0,
        'sceneId' => 'scene-1',
        'entityId' => 'token-1',
        'payload' => ['column' => 2, 'row' => 3],
    ];
    $acceptedOne = $store->acceptShadowCommand($commandOne, 'GM');
    expect($acceptedOne['status'] === 'accepted', 'First command must be accepted.');
    expect($acceptedOne['event']['revision'] === 1, 'First event revision must be one.');
    expect($acceptedOne['idempotent'] === false, 'First command must not be idempotent.');

    $duplicate = $store->acceptShadowCommand($commandOne, 'GM');
    expect($duplicate['status'] === 'accepted', 'Duplicate command must return its accepted event.');
    expect($duplicate['idempotent'] === true, 'Duplicate operation ID must be idempotent.');
    expect($duplicate['event']['revision'] === 1, 'Duplicate must retain its original revision.');
    expect($store->getSnapshot()['revision'] === 1, 'Duplicate must not advance the revision.');

    $conflict = $store->acceptShadowCommand([
        'operationId' => 'operation-conflict',
        'type' => 'shadow.observe',
        'baseRevision' => 0,
        'payload' => ['ignored' => true],
    ], 'GM');
    expect($conflict['status'] === 'conflict', 'Stale base revision must conflict.');
    expect($store->getSnapshot()['revision'] === 1, 'Rejected command must not change state.');

    $acceptedTwo = $store->acceptShadowCommand([
        'operationId' => 'operation-0002',
        'type' => 'shadow.observe',
        'baseRevision' => 1,
        'payload' => ['step' => 2],
    ], 'GM');
    $acceptedThree = $store->acceptShadowCommand([
        'operationId' => 'operation-0003',
        'type' => 'shadow.observe',
        'baseRevision' => 2,
        'payload' => ['step' => 3],
    ], 'GM');
    expect($acceptedTwo['event']['revision'] === 2, 'Second accepted revision must be two.');
    expect($acceptedThree['event']['revision'] === 3, 'Third accepted revision must be three.');

    $events = $store->replayAfter(1);
    expect($events['mode'] === 'events', 'Retained gap must replay events.');
    expect(count($events['events']) === 2, 'Replay must contain revisions two and three.');
    expect($events['events'][0]['revision'] === 2, 'Replay events must be ordered.');
    expect($events['events'][1]['revision'] === 3, 'Replay events must be ordered.');

    $recovery = $store->replayAfter(0);
    expect($recovery['mode'] === 'snapshot', 'Expired event gap must return a snapshot.');
    expect($recovery['snapshot']['revision'] === 3, 'Recovery snapshot must be current.');
    expect(
        count($recovery['snapshot']['state']['shadow']['observations']) === 3,
        'Canonical state must include each accepted operation once.'
    );

    $lateDuplicate = $store->acceptShadowCommand($commandOne, 'GM');
    expect($lateDuplicate['idempotent'] === true, 'Pruned events must remain idempotent.');
    expect($lateDuplicate['event']['revision'] === 1, 'Idempotency ledger must retain original event.');
    expect($store->getSnapshot()['revision'] === 3, 'Late duplicate must not advance revision.');

    $invalidRejected = false;
    try {
        $store->acceptShadowCommand([
            'operationId' => 'operation-invalid',
            'type' => 'token.move',
            'baseRevision' => 3,
            'payload' => [],
        ], 'GM');
    } catch (InvalidArgumentException $error) {
        $invalidRejected = true;
    }
    expect($invalidRejected, 'Phase 1 must reject live-domain commands.');

    echo json_encode([
        'success' => true,
        'revision' => $store->getSnapshot()['revision'],
    ], JSON_UNESCAPED_SLASHES);
} finally {
    unset($store);
    gc_collect_cycles();
    foreach ([$databasePath, $databasePath . '-shm', $databasePath . '-wal'] as $path) {
        if (is_file($path)) {
            @unlink($path);
        }
    }
}
