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

    $moveOne = [
        'operationId' => 'movement-operation-0001',
        'type' => 'token.move',
        'baseRevision' => 3,
        'entityRevision' => 0,
        'sceneId' => 'scene-1',
        'entityId' => 'token-1',
        'payload' => ['placementId' => 'token-1', 'column' => 8, 'row' => 5],
    ];
    $legacyToken = ['id' => 'token-1', 'column' => 1, 'row' => 1, 'width' => 1, 'height' => 1];
    $moveAccepted = $store->acceptTokenMove($moveOne, 'GM', $legacyToken);
    expect($moveAccepted['status'] === 'accepted', 'A valid token move must be accepted.');
    expect($moveAccepted['event']['revision'] === 4, 'Token move must advance world revision.');
    expect($moveAccepted['event']['entityRevision'] === 1, 'First token move must advance entity revision.');

    $sameTokenConflict = $store->acceptTokenMove([
        ...$moveOne,
        'operationId' => 'movement-operation-stale',
        'payload' => ['placementId' => 'token-1', 'column' => 9, 'row' => 5],
    ], 'GM', $legacyToken);
    expect($sameTokenConflict['status'] === 'conflict', 'A stale same-token move must conflict.');
    expect(
        $sameTokenConflict['error'] === 'entity_revision_mismatch',
        'Same-token conflict must identify the entity revision.'
    );

    $otherToken = ['id' => 'token-2', 'column' => 2, 'row' => 2, 'width' => 1, 'height' => 1];
    $unrelatedAccepted = $store->acceptTokenMove([
        'operationId' => 'movement-operation-0002',
        'type' => 'token.move',
        // Deliberately behind the world revision: unrelated entity revisions
        // are the concurrency boundary, not a global whole-board lock.
        'baseRevision' => 3,
        'entityRevision' => 0,
        'sceneId' => 'scene-1',
        'entityId' => 'token-2',
        'payload' => ['placementId' => 'token-2', 'column' => 4, 'row' => 6],
    ], 'GM', $otherToken);
    expect($unrelatedAccepted['status'] === 'accepted', 'An unrelated token may move from a behind base revision.');
    expect($unrelatedAccepted['event']['revision'] === 5, 'Unrelated move must receive the next world revision.');
    expect(
        (float) $store->getSnapshot()['state']['placements']['scene-1']['token-1']['column'] === 8.0,
        'Rejected same-token move must not alter canonical coordinates.'
    );

    $moveDuplicate = $store->acceptTokenMove($moveOne, 'GM', $legacyToken);
    expect($moveDuplicate['idempotent'] === true, 'Duplicate token operation must apply once.');
    expect($store->getSnapshot()['revision'] === 5, 'Duplicate token move must not advance revision.');

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
