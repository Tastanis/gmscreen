<?php
declare(strict_types=1);
require_once __DIR__ . '/../_common.php';
$path = $argv[1] ?? (sys_get_temp_dir() . '/vtt-drawing-test-' . bin2hex(random_bytes(8)) . '.sqlite');
if (is_file($path)) throw new RuntimeException('Drawing tests require a new disposable database.');
$store = new SyncV2Store($path);
putenv('VTT_SYNC_V2_DATABASE=' . $path);
$sequence = 0;
function sendDrawing(string $type, string $id, string $actor, array $drawing = []): array {
    global $store, $sequence;
    $snapshot = $store->getSnapshot();
    $key = str_starts_with($type, 'template.') ? 'template' : 'drawing';
    return $store->acceptBoardDomainCommand([
        'type' => $type, 'operationId' => 'drawing-test-' . ++$sequence,
        'baseRevision' => $snapshot['revision'], 'sceneId' => 'test', 'entityId' => $id,
        'entityRevision' => $snapshot['state'][$key . 's']['test'][$id]['_entityRevision'] ?? 0,
        'payload' => str_ends_with($type, '.upsert') ? [$key => $drawing] : [],
    ], $actor, $actor === 'GM');
}
try {
    $entry = ['id' => 'mine', 'authorId' => 'sharon', 'levelId' => 'upper', 'points' => [['x'=>0,'y'=>0],['x'=>1,'y'=>1]]];
    $accepted = sendDrawing('drawing.upsert', 'mine', 'cal', $entry);
    if ($accepted['event']['payload']['drawing']['authorId'] !== 'cal') throw new RuntimeException('Player spoofed author.');
    foreach (['drawing.upsert', 'drawing.remove'] as $type) {
        $revision = $store->getSnapshot()['revision'];
        $rejected = false;
        try { sendDrawing($type, 'mine', 'sharon', $entry); }
        catch (InvalidArgumentException $error) { $rejected = str_contains($error->getMessage(), 'own drawings'); }
        if (!$rejected || $store->getSnapshot()['revision'] !== $revision) throw new RuntimeException('Foreign edit changed state.');
    }
    sendDrawing('drawing.remove', 'mine', 'cal');
    sendDrawing('drawing.upsert', 'mine', 'cal', $entry);
    sendDrawing('drawing.remove', 'mine', 'GM');
    $store->migrateLegacyBoardDomains(['sceneState' => ['test' => ['mapLevels' => ['levels' => [
        ['id' => 'secret', 'hidden' => true, 'mapUrl' => '/secret.png'],
    ]]]]]);
    $secret = sendDrawing('drawing.upsert', 'secret-drawing', 'GM', [...$entry, 'levelId' => 'secret']);
    $player = ['isGM' => false, 'user' => 'cal'];
    $projection = vttSyncV2ProjectSnapshotForUser($store->getSnapshot(), $player);
    if (isset($projection['state']['drawings']['test']['secret-drawing'])) throw new RuntimeException('Hidden drawing leaked in snapshot.');
    $event = vttSyncV2ProjectEventForUser($secret['event'], $player);
    if ($event['type'] !== 'sync.redacted') throw new RuntimeException('Hidden drawing leaked in event.');
    $secretTemplate = sendDrawing('template.upsert', 'secret-template', 'GM', ['type'=>'circle', 'levelId'=>'secret']);
    $projection = vttSyncV2ProjectSnapshotForUser($store->getSnapshot(), $player);
    if (isset($projection['state']['templates']['test']['secret-template'])) throw new RuntimeException('Hidden template leaked in snapshot.');
    if (vttSyncV2ProjectEventForUser($secretTemplate['event'], $player)['type'] !== 'sync.redacted') throw new RuntimeException('Hidden template leaked in event.');
    $snapshot = $store->getSnapshot();
    $deleted = $store->acceptBoardDomainCommand(['type'=>'level.delete','operationId'=>'delete-secret-floor',
        'sceneId'=>'test','baseRevision'=>$snapshot['revision'],'entityRevision'=>$snapshot['state']['sceneConfig']['test']['_revision'],
        'payload'=>['levelId'=>'secret']], 'GM', true);
    if (count($deleted['event']['payload']['removedContent']) !== 2) throw new RuntimeException('Hidden floor content was not deleted.');
    $publicDelete = vttSyncV2ProjectEventForUser($deleted['event'], $player);
    if ($publicDelete['payload']['removedContent'] !== []) throw new RuntimeException('Hidden entity identifiers leaked in deletion event.');
    if (isset($store->getSnapshot()['state']['drawings']['test']['secret-drawing'])) throw new RuntimeException('Deleted hidden drawing remained canonical.');
    echo "Drawing authority: ownership, rejection, restore and GM removal passed.\n";
} finally {
    unset($store);
    // _common retains its PDO until process shutdown; remove after that on Windows.
    if (PHP_OS_FAMILY !== 'Windows') foreach (['', '-wal', '-shm'] as $suffix) if (is_file($path . $suffix)) unlink($path . $suffix);
}
