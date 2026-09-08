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
    echo "Scene checkpoints: immutable capture, retry, scope, reopening and safe deletion passed.\n";
} finally {
    unset($archive, $store, $other);
    foreach (['', '-wal', '-shm'] as $suffix) if (is_file($database . $suffix)) unlink($database . $suffix);
}
