<?php
declare(strict_types=1);
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
require_once __DIR__ . '/../../../lib/SceneCheckpointRestore.php';
$database = sys_get_temp_dir() . '/vtt-checkpoint-' . bin2hex(random_bytes(8)) . '.sqlite';
function verifyCheckpoint(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
try {
    $store = new SyncV2Store($database, 'world-a');
    $store->migrateLegacyPlacements(['placements'=>['scene'=>[['id'=>'hero','column'=>2,'row'=>3]]]]);
    $snapshot = $store->getSnapshot();
    $archive = $store->sceneCheckpoints();
    $first = $archive->capture('checkpoint-001', 'Before the ambush', 'scene', $snapshot, 'GM');
    verifyCheckpoint($first['data']['domains']['placements']['hero']['column'] === 2, 'Checkpoint captures canonical placement.');
    verifyCheckpoint($store->getSnapshot() === $snapshot, 'Capturing a checkpoint must not mutate canonical state or revision.');
    $changed = $snapshot;
    $changed['state']['placements']['scene']['hero']['column'] = 99;
    $changed['state']['placements']['scene']['new-token'] = ['id'=>'new-token','column'=>4,'row'=>5];
    $preview = SceneCheckpointRestore::previewPositions($first, $changed);
    verifyCheckpoint(count($preview['changes']) === 1 && $preview['newerTokensPreserved'] === 1, 'Preview moves existing captured tokens and preserves newer tokens.');
    verifyCheckpoint(array_keys($preview['changes'][0]['to']) === ['column','row','levelId'], 'Position scope contains no stamina, conditions or other fields.');
    verifyCheckpoint($preview['changes'][0]['to']['column'] === 2.0, 'Preview restores captured coordinates.');
    $missingFloor = $first;
    $missingFloor['data']['domains']['placements']['hero']['levelId'] = 'deleted-level';
    $preview = SceneCheckpointRestore::previewPositions($missingFloor, $changed);
    verifyCheckpoint($preview['changes'] === [] && count($preview['skipped']) === 1, 'Unavailable floors are explicit skips.');
    $removed = $changed; unset($removed['state']['placements']['scene']['hero']);
    $preview = SceneCheckpointRestore::previewPositions($first, $removed);
    verifyCheckpoint($preview['changes'] === [] && count($preview['skipped']) === 1, 'Position scope never recreates deleted tokens.');
    $changed['state']['sceneConfig']['scene']['grid'] = ['size'=>99];
    verifyCheckpoint(SceneCheckpointRestore::previewPositions($first, $changed)['geometryChanged'], 'Changed geometry is flagged for review.');
    verifyCheckpoint($archive->capture('checkpoint-001', 'Before the ambush', 'scene', $changed, 'GM') === $first, 'Retries never overwrite a checkpoint.');
    verifyCheckpoint($archive->capture('checkpoint-001', 'Before the ambush', 'scene', ['state'=>[]], 'GM') === $first, 'Retry survives later scene removal.');
    $rejected = false;
    try { $archive->capture('checkpoint-001', 'Different name', 'scene', $snapshot, 'GM'); }
    catch (InvalidArgumentException $error) { $rejected = true; }
    verifyCheckpoint($rejected, 'ID reuse cannot change checkpoint identity.');
    verifyCheckpoint(count($archive->list('scene')) === 1 && $archive->list('elsewhere') === [], 'Listing is scene-scoped.');
    verifyCheckpoint(!isset($archive->list('scene')[0]['data']), 'Listing does not load large scene payloads.');
    $other = new SyncV2Store($database, 'world-b');
    verifyCheckpoint($other->sceneCheckpoints()->get('checkpoint-001') === null, 'Worlds cannot read one another\'s checkpoints.');
    verifyCheckpoint(!$other->sceneCheckpoints()->remove('checkpoint-001'), 'Worlds cannot delete one another\'s checkpoints.');
    unset($archive, $store);
    $store = new SyncV2Store($database, 'world-a');
    verifyCheckpoint($store->sceneCheckpoints()->get('checkpoint-001') === $first, 'Checkpoint survives reopening SQLite.');
    verifyCheckpoint($store->sceneCheckpoints()->remove('checkpoint-001'), 'Explicit deletion removes only the archive entry.');
    verifyCheckpoint($store->getSnapshot() === $snapshot, 'Archive deletion leaves the canonical board unchanged.');
    $store = new SyncV2Store($database, 'restore-world');
    $tokens = [];
    for ($i = 0; $i < 101; $i++) $tokens[] = ['id'=>'token-'.$i, 'column'=>2, 'row'=>3, 'levelId'=>'level-0', 'stamina'=>40];
    $store->migrateLegacyPlacements(['placements'=>['scene'=>$tokens]]);
    $saved = $store->getSnapshot();
    $store->sceneCheckpoints()->capture('restore-checkpoint', 'Before play', 'scene', $saved, 'GM');
    foreach (array_chunk($tokens, 100) as $index => $chunk) {
        $actions = array_map(fn($token) => ['kind'=>'patch', 'sceneId'=>'scene', 'placementId'=>$token['id'],
            'entityRevision'=>0, 'patch'=>['column'=>8, 'row'=>9, 'levelId'=>'level-0', 'stamina'=>7, 'conditions'=>['prone']]], $chunk);
        $store->acceptPlacementBatch(['type'=>'placement.batch', 'operationId'=>'prepare-restore-'.$index,
            'baseRevision'=>$store->getSnapshot()['revision'], 'payload'=>['actions'=>$actions]], 'GM', true);
    }
    $before = $store->getSnapshot();
    $command = ['type'=>'checkpoint.restorePositions', 'operationId'=>'apply-restore-001',
        'payload'=>['checkpointId'=>'restore-checkpoint', 'reviewedRevision'=>$before['revision']]];
    $rejected = false;
    try { $store->restoreCheckpointPositions($command, 'cal', false); }
    catch (InvalidArgumentException $error) { $rejected = true; }
    verifyCheckpoint($rejected && $store->getSnapshot() === $before, 'Players cannot restore checkpoints.');
    $stale = $command; $stale['payload']['reviewedRevision']--;
    verifyCheckpoint($store->restoreCheckpointPositions($stale, 'GM', true)['error'] === 'checkpoint_preview_stale', 'Stale previews cannot overwrite play.');
    verifyCheckpoint($store->getSnapshot() === $before, 'Rejected preview has no partial writes.');
    $guarded = $store->acceptPlacementBatch(['type'=>'placement.batch', 'operationId'=>'restore-race-001',
        'baseRevision'=>$before['revision'], 'payload'=>['actions'=>[['kind'=>'patch', 'sceneId'=>'scene',
            'placementId'=>'token-0', 'entityRevision'=>1, 'patch'=>['column'=>0]]]]], 'GM', true, $before['revision'] - 1);
    verifyCheckpoint($guarded['error'] === 'checkpoint_preview_stale' && $store->getSnapshot() === $before,
        'Transaction-level revision guard rejects a board change after planning.');
    $result = $store->restoreCheckpointPositions($command, 'GM', true);
    $after = $store->getSnapshot();
    verifyCheckpoint($after['revision'] === $before['revision'] + 1, 'All 101 positions restore in one revision.');
    verifyCheckpoint($result['event']['type'] === 'placement.batchApplied', 'Restore uses the canonical placement event.');
    verifyCheckpoint(!isset($result['event']['payload']['movementKind']), 'Restore does not masquerade as ordinary walking.');
    foreach ($after['state']['placements']['scene'] as $token) {
        verifyCheckpoint((float) $token['column'] === 2.0 && (float) $token['row'] === 3.0, 'Each position restored.');
        verifyCheckpoint($token['stamina'] === 7 && $token['conditions'] === ['prone'], 'Resource and condition changes survive restore.');
        verifyCheckpoint($token['_floorTraversal'] === null, 'Restore clears partial stair traversal.');
    }
    $store->sceneCheckpoints()->remove('restore-checkpoint');
    verifyCheckpoint($store->restoreCheckpointPositions($command, 'GM', true)['idempotent'], 'Accepted retry survives checkpoint deletion.');
    verifyCheckpoint($store->getSnapshot() === $after, 'Retry never restores twice.');
    unset($store); $store = new SyncV2Store($database, 'restore-world');
    verifyCheckpoint($store->getSnapshot() === $after, 'Restored board survives reopening SQLite.');
    echo "Scene checkpoints: archive, preview, atomic restore, stale review rejection, GM authority and retry passed.\n";
} finally {
    unset($archive, $store, $other);
    foreach (['', '-wal', '-shm'] as $suffix) if (is_file($database . $suffix)) unlink($database . $suffix);
}
