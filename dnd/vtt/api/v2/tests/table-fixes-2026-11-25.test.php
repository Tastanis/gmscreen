<?php
declare(strict_types=1);
// Brandon's list after the November 24, 2026 session: the server's side of three of them.
//   13. A player cannot move a creature that is not theirs, but may push it by hand (a forced move).
//    2. Only the Director marks a body (the "dead" mark on a token); everyone is sent it.
//    4. A chat line the board writes is shown under the name it gives, cleaned; who sent it is still recorded.
// The browser's side: assets/js/ui/__tests__/table-fixes-2026-11-25.test.mjs.
require_once __DIR__ . '/../_common.php';
require_once __DIR__ . '/../../../../chat_handler.php';

function fixCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$database = sys_get_temp_dir() . '/vtt-table-fixes-' . bin2hex(random_bytes(6)) . '.sqlite';
$store = new SyncV2Store($database, 'fixes-world', 10, 10, 10);
putenv('VTT_SYNC_V2_DATABASE=' . $database);
$sequence = 0;
$batch = static function (array $actions, string $actor) use ($store, &$sequence): array {
    $snapshot = $store->getSnapshot();
    foreach ($actions as &$action) {
        $action['sceneId'] = 'scene';
        if (($action['kind'] ?? '') !== 'add') $action['entityRevision'] = $snapshot['state']['placements']['scene'][$action['placementId']]['_entityRevision'] ?? 0;
    }
    unset($action);
    return $store->acceptPlacementBatch(['type' => 'placement.batch', 'operationId' => 'table-fixes-batch-' . ++$sequence, 'baseRevision' => $snapshot['revision'], 'sceneId' => 'scene',
        'entityRevision' => $snapshot['state']['sceneConfig']['scene']['_revision'] ?? 0, 'payload' => ['actions' => $actions]], $actor, $actor === 'GM');
};
$refused = static function (callable $attempt): string { try { $attempt(); } catch (InvalidArgumentException $error) { return $error->getMessage(); } return ''; };
try {
    $orc = ['id' => 'orc', 'name' => 'Orc', 'column' => 6, 'row' => 5, 'width' => 1, 'height' => 1, 'levelId' => 'level-0', 'team' => 'enemy'];
    $hero = ['id' => 'cal', 'name' => 'Cal', 'column' => 3, 'row' => 5, 'width' => 1, 'height' => 1, 'levelId' => 'level-0', 'team' => 'ally'];
    $lurker = ['id' => 'lurker', 'name' => 'Lurker', 'column' => 9, 'row' => 9, 'width' => 1, 'height' => 1, 'levelId' => 'level-0', 'team' => 'enemy', 'hidden' => true];
    foreach ([$orc, $hero, $lurker] as $placement) {
        $added = $batch([['kind' => 'add', 'placementId' => $placement['id'], 'placement' => $placement]], 'GM');
        fixCheck(($added['status'] ?? '') === 'accepted', 'The Director places a token: ' . json_encode($added['error'] ?? $added['status'] ?? null));
    }

    // ---- 13. a push by hand ----
    $destination = ['column' => 4, 'row' => 5];
    fixCheck($store->playerMayMovePlacement($orc) === false, 'A player still cannot move a creature that is not theirs');
    fixCheck($store->playerMayPushPlacement($orc, 'forced', $destination) === true, 'but may push it: a forced move with its destination');
    foreach (['walk', 'shift', 'teleport', null, ''] as $kind) {
        fixCheck($store->playerMayPushPlacement($orc, $kind, $destination) === false, 'Not as a ' . json_encode($kind) . ' move');
    }
    fixCheck($store->playerMayPushPlacement($orc, 'forced', null) === false, 'Not a forced move with no destination stated');
    fixCheck($store->playerMayPushPlacement($orc, 'forced', $destination, 12) === false, 'Not the undo of a move');
    fixCheck($store->playerMayPushPlacement($lurker, 'forced', $destination) === false, 'Never a token hidden from players');
    $player = ['isGM' => false, 'user' => 'cal'];
    fixCheck(vttSyncV2CanMovePlacement($player, 'scene', 'orc', $orc) === false, 'The command check: no push stated, refused');
    fixCheck(vttSyncV2CanMovePlacement($player, 'scene', 'orc', $orc, ['movementKind' => 'walk', 'path' => []]) === false, 'an ordinary move, refused');
    fixCheck(vttSyncV2CanMovePlacement($player, 'scene', 'orc', $orc, ['movementKind' => 'forced', 'forcedDestination' => $destination]) === true, 'a push, allowed');
    fixCheck(vttSyncV2CanMovePlacement($player, 'scene', 'lurker', $lurker, ['movementKind' => 'forced', 'forcedDestination' => $destination]) === false, 'a push of a hidden token, refused');
    fixCheck(vttSyncV2CanMovePlacement($player, 'scene', 'cal', $hero, ['movementKind' => 'walk']) === true, 'their own hero, as before');
    fixCheck(vttSyncV2CanMovePlacement(['isGM' => true, 'user' => 'GM'], 'scene', 'lurker', $lurker) === true, 'the Director, anything');

    $move = static function (string $id, array $payload, string $actor) use ($store, &$sequence): array {
        $snapshot = $store->getSnapshot();
        return $store->acceptTokenMove(['type' => 'token.move', 'operationId' => 'table-fixes-move-' . ++$sequence, 'baseRevision' => $snapshot['revision'], 'sceneId' => 'scene', 'entityId' => $id,
            'entityRevision' => $snapshot['state']['placements']['scene'][$id]['_entityRevision'] ?? 0, 'payload' => ['placementId' => $id] + $payload], $actor, $actor === 'GM');
    };
    $why = $refused(static fn () => $move('orc', ['column' => 5, 'row' => 6, 'movementKind' => 'walk', 'path' => []], 'cal'));
    fixCheck($why === 'You cannot move this token.', 'In the store too: a player\'s ordinary move of it is refused: ' . json_encode($why));
    $pushed = $move('orc', ['column' => 4, 'row' => 5, 'movementKind' => 'forced', 'path' => [], 'forcedDestination' => $destination], 'cal');
    $now = $store->getSnapshot()['state']['placements']['scene']['orc'];
    fixCheck(($pushed['status'] ?? '') === 'accepted' && $now['column'] === 4 && $now['row'] === 5, 'and a player\'s push of it is taken: ' . json_encode([$pushed['status'] ?? null, $pushed['error'] ?? null, $now['column'], $now['row']]));
    $why = $refused(static fn () => $move('lurker', ['column' => 8, 'row' => 9, 'movementKind' => 'forced', 'path' => [], 'forcedDestination' => ['column' => 8, 'row' => 9]], 'cal'));
    fixCheck($why === 'You cannot move this token.', 'A hidden token is not pushed: ' . json_encode($why));

    // ---- 2. the body mark ----
    $why = $refused(static fn () => $batch([['kind' => 'patch', 'placementId' => 'orc', 'patch' => ['dead' => true]]], 'cal'));
    fixCheck($why === 'Only the GM may change placement field: dead', 'A player cannot mark a body: ' . json_encode($why));
    fixCheck(($store->getSnapshot()['state']['placements']['scene']['orc']['dead'] ?? null) !== true, 'and nothing was marked');
    $marked = $batch([['kind' => 'patch', 'placementId' => 'orc', 'patch' => ['dead' => true]]], 'GM');
    fixCheck(($marked['status'] ?? '') === 'accepted' && ($store->getSnapshot()['state']['placements']['scene']['orc']['dead'] ?? null) === true, 'The Director marks it');
    $forPlayer = vttSyncV2ProjectSnapshotForUser($store->getSnapshot(), ['isGM' => false, 'user' => 'cal']);
    fixCheck(($forPlayer['state']['placements']['scene']['orc']['dead'] ?? null) === true, 'and the players are sent the mark');
    fixCheck(!isset($forPlayer['state']['placements']['scene']['lurker']), 'while a hidden token is still not sent at all');
    $batch([['kind' => 'patch', 'placementId' => 'orc', 'patch' => ['dead' => false]]], 'GM');
    fixCheck(($store->getSnapshot()['state']['placements']['scene']['orc']['dead'] ?? null) === false, 'and takes the mark off again');
    unset($store);
} finally { foreach (['', '-wal', '-shm'] as $suffix) @unlink($database . $suffix); }

// ---- 4. the name a board-written chat line is shown under ----
fixCheck(sanitizeChatSpeaker('Table') === 'Table', 'A plain name is kept');
fixCheck(sanitizeChatSpeaker("  The\n   Table  ") === 'The Table', 'spaces and line breaks are tidied');
fixCheck(sanitizeChatSpeaker('<b>Table</b><script>x</script>') === 'Tablex', 'markup is taken out: ' . sanitizeChatSpeaker('<b>Table</b><script>x</script>'));
fixCheck(mb_strlen(sanitizeChatSpeaker(str_repeat('x', 200))) === 40, 'and it is no longer than 40 characters');
fixCheck(sanitizeChatSpeaker(['x']) === '' && sanitizeChatSpeaker(null) === '', 'anything that is not text: none');
$handler = file_get_contents(__DIR__ . '/../../../../chat_handler.php');
fixCheck(str_contains($handler, "if (\$speaker !== '' && \$messageType === 'text') {") && str_contains($handler, "'user' => \$currentUser,"), 'Only a plain line carries it, and who sent the line is still the signed-in user');

echo "table fixes: a player may push but not move another's creature; only the Director marks a body and players are sent it; a board-written chat line has a clean speaker\n";
