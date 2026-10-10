<?php
declare(strict_types=1);

// Where the world is kept in the file (SyncV2Layout): the carry-over from one row to the split
// layout, what a command writes afterwards, the frozen old row, turning back, and the failures
// that must leave the old layout whole.
putenv('VTT_SYNC_V2_VERIFY_WRITES=1');
require_once __DIR__ . '/../../../lib/SyncV2Store.php';

function layoutCheck(bool $ok, string $message): void
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}

$directory = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'vtt-layout-' . bin2hex(random_bytes(8));
mkdir($directory, 0775, true);
$path = $directory . DIRECTORY_SEPARATOR . 'sync-v2.sqlite';
$copies = static fn (): array => glob($directory . DIRECTORY_SEPARATOR . 'sync-v2.before-split-*.sqlite') ?: [];
$direct = static function () use ($path): PDO {
    $pdo = new PDO('sqlite:' . $path);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('PRAGMA busy_timeout = 5000');
    return $pdo;
};
$command = static function (SyncV2Store $store, string $id, string $sceneId, array $payload, string $type = 'environment.set'): array {
    $snapshot = $store->getSnapshot();
    return $store->acceptBoardDomainCommand([
        'type' => $type, 'operationId' => $id, 'sceneId' => $sceneId, 'baseRevision' => $snapshot['revision'],
        'entityRevision' => (int) ($snapshot['state']['sceneConfig'][$sceneId]['_revision'] ?? 0), 'payload' => $payload,
    ], 'GM', true);
};

try {
    // ---- A world as an older build left it: one row holding everything ----------------
    $terrain = ['n' => 3, 'm' => 2, 'h' => [0, 0.5, 1.25, 2, 2.0, 3.75]];
    $walls = ['version' => 1, 'nodes' => [['id' => 'a', 'x' => 0, 'y' => 0], ['id' => 'b', 'x' => 2, 'y' => 0]], 'segments' => [['id' => 'door', 'a' => 'a', 'b' => 'b', 'interaction' => 'door', 'open' => false]], 'roofs' => [], 'ramps' => []];
    $old = [
        'shadow' => ['mode' => 'shadow', 'observations' => []],
        'placements' => ['cave' => ['hero' => ['id' => 'hero', 'column' => 1, 'row' => 1, 'stamina' => 12, '_entityRevision' => 3]], 'plain' => []],
        'sceneConfig' => [
            'cave' => ['_revision' => 4, 'grid' => ['size' => 64], 'environment' => [
                'terrain' => ['revision' => 2, 'value' => $terrain],
                'walls' => ['revision' => 1, 'value' => $walls],
                'exploration' => ['revision' => 1, 'value' => ['resetId' => 'reset-one']],
            ], 'mapLevels' => ['levels' => [], 'baseStairs' => [], 'activeLevelId' => null], 'userLevelState' => []],
            'tower' => ['environment' => ['terrain' => ['revision' => 1, 'value' => ['n' => 2, 'm' => 2, 'h' => [9, 9, 9, 9]]]], '_revision' => 1],
            'plain' => ['_revision' => 1, 'grid' => ['size' => 50]],
        ],
        'routing' => ['activeSceneId' => 'cave', '_revision' => 2],
    ];
    $oldJson = json_encode($old, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    // Packing writes a whole-number float (2.0) as 2, so the world an older build left behind is what the text unpacks to.
    $old = json_decode($oldJson, true);
    $seed = $direct();
    $seed->exec('CREATE TABLE vtt_world_state (world_id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision>=0), state_json TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    $seed->prepare('INSERT INTO vtt_world_state VALUES (?,?,?,?)')->execute(['default', 7, $oldJson, 1700000000000]);
    $seed = null;

    // ---- The carry-over ------------------------------------------------------------------
    $store = new SyncV2Store($path);
    $status = $store->storageStatus();
    layoutCheck($status['layout'] === 'split' && $status['splitFromRevision'] === 7 && $status['lastFailure'] === null, 'An old world is carried over on first open.');
    $snapshot = $store->getSnapshot();
    layoutCheck($snapshot['revision'] === 7 && $snapshot['serverTime'] === 1700000000000 && $snapshot['state'] === $old, 'The world reads back identical after the carry-over, key order included.');
    layoutCheck(json_encode($snapshot['state'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) === $oldJson, 'It packs to the same text as before.');
    $made = $copies();
    layoutCheck(count($made) === 1 && basename($made[0]) === $status['copyFile'], 'One dated copy is written beside the database, and its name is recorded.');
    layoutCheck(preg_match('/^sync-v2\.before-split-\d{8}-\d{6}\.sqlite$/', basename($made[0])) === 1, 'The copy is named with the date, and its name holds ".sqlite" so the keep-out rule covers it.');
    layoutCheck(glob($directory . DIRECTORY_SEPARATOR . '*.part') === [], 'No half-written copy is left behind.');
    $copy = new PDO('sqlite:' . $made[0]);
    layoutCheck($copy->query("SELECT state_json FROM vtt_world_state WHERE world_id='default'")->fetchColumn() === $oldJson, 'The copy holds the world as it was.');
    $copy = null;
    $look = $direct();
    $main = (string) $look->query("SELECT state_json FROM vtt_state_main WHERE world_id='default'")->fetchColumn();
    $parts = $look->query("SELECT scene_id || '/' || part FROM vtt_state_parts WHERE world_id='default' ORDER BY 1")->fetchAll(PDO::FETCH_COLUMN);
    layoutCheck($parts === ['cave/exploration', 'cave/terrain', 'cave/walls', 'tower/terrain'], 'Each part of each design has its own row, and a scene with no design has none.');
    layoutCheck(!str_contains($main, '3.75') && !str_contains($main, '"door"') && str_contains($main, '__storedApart'), 'The light row holds a stand-in where each part was, not the part.');
    layoutCheck(str_contains($main, '"stamina":12') && str_contains($main, '"size":64'), 'Tokens and the light settings stay in the light row.');
    layoutCheck($look->query("SELECT state_json FROM vtt_world_state WHERE world_id='default'")->fetchColumn() === $oldJson, 'The old row is left exactly as it was.');

    // ---- A second open does nothing ------------------------------------------------------
    $again = new SyncV2Store($path);
    layoutCheck($again->getSnapshot() === $snapshot && count($copies()) === 1 && $again->storageStatus() === $status, 'Opening again changes nothing and writes no second copy.');
    $again = null;

    // ---- An older build still running cannot write the old way, and reads a whole world ----
    $refused = false;
    try {
        $look->prepare("UPDATE vtt_world_state SET revision = 8, state_json = ?, updated_at = 1 WHERE world_id = 'default'")->execute(['{"shadow":{}}']);
    } catch (PDOException $error) {
        $refused = str_contains($error->getMessage(), 'split layout');
    }
    layoutCheck($refused, 'A write to the old row is refused.');
    $look->exec("INSERT OR IGNORE INTO vtt_world_state (world_id, revision, state_json, updated_at) VALUES ('default', 0, '{}', 0)");
    $seen = $look->query("SELECT revision, state_json FROM vtt_world_state WHERE world_id='default'")->fetch(PDO::FETCH_ASSOC);
    layoutCheck((int) $seen['revision'] === 7 && json_decode($seen['state_json'], true) === $old, 'An older build opening the file still reads the whole world as of the carry-over.');

    // ---- A command writes the light row and only the part it changed -----------------------
    $look->exec('CREATE TABLE written (what TEXT)');
    $look->exec("CREATE TRIGGER count_insert AFTER INSERT ON vtt_state_parts BEGIN INSERT INTO written VALUES (NEW.scene_id || '/' || NEW.part); END");
    $look->exec("CREATE TRIGGER count_update AFTER UPDATE ON vtt_state_parts BEGIN INSERT INTO written VALUES (NEW.scene_id || '/' || NEW.part); END");
    $look->exec("CREATE TRIGGER count_delete AFTER DELETE ON vtt_state_parts BEGIN INSERT INTO written VALUES ('gone ' || OLD.scene_id || '/' || OLD.part); END");
    $written = static function () use ($look): array {
        $rows = $look->query('SELECT what FROM written ORDER BY rowid')->fetchAll(PDO::FETCH_COLUMN);
        $look->exec('DELETE FROM written');
        return $rows;
    };
    $store = new SyncV2Store($path);
    $store->acceptShadowCommand(['type' => 'shadow.observe', 'operationId' => 'layout-shadow-1', 'baseRevision' => 7, 'payload' => ['step' => 1]], 'GM');
    layoutCheck($written() === [], 'A command that touches no design writes no part.');
    $snapshot = $store->getSnapshot();
    $store->acceptPlacementBatch(['type' => 'placement.batch', 'operationId' => 'layout-stamina-1', 'baseRevision' => $snapshot['revision'], 'payload' => ['actions' => [
        ['kind' => 'patch', 'sceneId' => 'cave', 'placementId' => 'hero', 'entityRevision' => 3, 'patch' => ['stamina' => 5]],
    ]]], 'GM', true);
    layoutCheck($written() === [] && $store->getSnapshot()['state']['placements']['cave']['hero']['stamina'] === 5, 'A stamina change writes no part.');
    $command($store, 'layout-terrain-patch', 'cave', ['expectedRevision' => 2, 'patch' => ['i0' => 0, 'j0' => 0, 'i1' => 0, 'j1' => 0, 'values' => [6.5]]], 'environment.terrain.patch');
    layoutCheck($written() === ['cave/terrain'], 'Painting ground writes the ground of that scene and nothing else.');
    $command($store, 'layout-door', 'cave', ['segmentId' => 'door', 'open' => true, 'expectedRevision' => 1], 'environment.portal.set');
    layoutCheck($written() === ['cave/walls'], 'Opening a door writes the walls of that scene and nothing else.');
    $command($store, 'layout-zones', 'plain', ['field' => 'zones', 'expectedRevision' => 0, 'value' => ['version' => 1, 'zones' => []]]);
    layoutCheck($written() === ['plain/zones'], 'A part a scene did not have before gets a new row.');
    $fresh = new SyncV2Store($path);
    $after = $fresh->getSnapshot();
    layoutCheck($after === $store->getSnapshot(), 'What the store remembers after saving is what a fresh open reads.');
    layoutCheck($after['state']['sceneConfig']['cave']['environment']['terrain']['value']['h'][0] === 6.5
        && $after['state']['sceneConfig']['cave']['environment']['walls']['value']['segments'][0]['open'] === true
        && $after['state']['sceneConfig']['tower']['environment']['terrain'] === $old['sceneConfig']['tower']['environment']['terrain'], 'The changes are kept and the untouched scene is unchanged.');

    // ---- A command that fails leaves nothing behind -----------------------------------------
    $before = $store->getSnapshot();
    $look->exec("CREATE TRIGGER fail_event BEFORE INSERT ON vtt_events WHEN NEW.operation_id = 'layout-fails' BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
    $failed = false;
    try {
        $command($store, 'layout-fails', 'cave', ['expectedRevision' => 3, 'patch' => ['i0' => 1, 'j0' => 0, 'i1' => 1, 'j1' => 0, 'values' => [77]]], 'environment.terrain.patch');
    } catch (PDOException $error) {
        $failed = str_contains($error->getMessage(), 'fixture failure');
    }
    layoutCheck($failed && $store->getSnapshot() === $before && (new SyncV2Store($path))->getSnapshot() === $before, 'A failed command changes neither the file nor what the store remembers.');
    layoutCheck($written() === [], 'Its part write was rolled back with it.');
    $command($store, 'layout-after-failure', 'cave', ['expectedRevision' => 3, 'patch' => ['i0' => 1, 'j0' => 0, 'i1' => 1, 'j1' => 0, 'values' => [8]]], 'environment.terrain.patch');
    layoutCheck($written() === ['cave/terrain'] && (new SyncV2Store($path))->getSnapshot() === $store->getSnapshot(), 'The next command after a failure saves correctly.');

    // ---- Deleting a scene removes its rows ----------------------------------------------------
    $store->deleteScene('tower', 'GM');
    layoutCheck($written() === ['gone tower/terrain'] && !isset($store->getSnapshot()['state']['sceneConfig']['tower']), 'A deleted scene loses its design rows.');

    // ---- A missing part is an error, never an empty design ------------------------------------
    $look->exec("DELETE FROM vtt_state_parts WHERE world_id='default' AND scene_id='cave' AND part='walls'");
    $loud = false;
    try {
        (new SyncV2Store($path))->getSnapshot();
    } catch (RuntimeException $error) {
        $loud = str_contains($error->getMessage(), 'missing');
    }
    layoutCheck($loud, 'A design part that is missing from the file stops the read; it is never read as "no walls".');
    $store->getSnapshot();   // this store saw the delete (another connection wrote) and must fail the same way
    layoutCheck(false, 'A store whose file lost a part must not answer from memory.');
} catch (RuntimeException $error) {
    if (!str_contains($error->getMessage(), "A stored part of a scene's design is missing")) {
        throw $error;
    }
}

try {
    // Put the row back by turning the lost part into a real one again, then carry on.
    $look = $direct();
    $look->prepare("INSERT INTO vtt_state_parts (world_id, scene_id, part, state_json) VALUES ('default', 'cave', 'walls', ?)")
        ->execute([json_encode(['revision' => 2, 'value' => ['version' => 1, 'nodes' => [], 'segments' => [], 'roofs' => [], 'ramps' => []]])]);
    $look->exec('DELETE FROM written');
    $store = new SyncV2Store($path);
    $split = $store->getSnapshot();

    // ---- Turning back, in place ------------------------------------------------------------------
    $denied = false;
    try {
        $store->changeStorageLayout('single', false);
    } catch (InvalidArgumentException $error) {
        $denied = true;
    }
    layoutCheck($denied && $store->storageStatus()['layout'] === 'split', 'Only the GM may change where the world is kept.');
    $status = $store->changeStorageLayout('single', true);
    layoutCheck($status['layout'] === 'single' && $status['keptSingleOnRequest'] === true, 'Turning back puts the world in one row and marks it to stay that way.');
    layoutCheck($store->getSnapshot() === $split, 'The world reads back identical after turning back.');
    $row = $look->query("SELECT revision, state_json FROM vtt_world_state WHERE world_id='default'")->fetch(PDO::FETCH_ASSOC);
    layoutCheck((int) $row['revision'] === $split['revision'] && json_decode($row['state_json'], true) === $split['state'], 'The old row holds the whole world again, at the current revision.');
    layoutCheck((int) $look->query("SELECT (SELECT COUNT(*) FROM vtt_state_main WHERE world_id='default') + (SELECT COUNT(*) FROM vtt_state_parts WHERE world_id='default')")->fetchColumn() === 0, 'The split rows are cleared.');
    $reopened = new SyncV2Store($path);
    layoutCheck($reopened->storageStatus()['layout'] === 'single' && $reopened->getSnapshot() === $split && count($copies()) === 1, 'It stays in one row on the next open: no carry-over by itself.');
    $reopened->acceptShadowCommand(['type' => 'shadow.observe', 'operationId' => 'layout-shadow-single', 'baseRevision' => $split['revision'], 'payload' => ['step' => 2]], 'GM');
    $single = (new SyncV2Store($path))->getSnapshot();
    layoutCheck($single['revision'] === $split['revision'] + 1 && $single['state']['sceneConfig'] === $split['state']['sceneConfig'], 'Commands work in one row exactly as they did before the split existed.');
    $look->prepare("UPDATE vtt_world_state SET updated_at = updated_at WHERE world_id = 'default'")->execute();   // an older build may write again

    // ---- And splitting again ------------------------------------------------------------------------
    sleep(1);   // the copy's name carries the time to the second
    $store = new SyncV2Store($path);
    $status = $store->changeStorageLayout('split', true);
    layoutCheck($status['layout'] === 'split' && $status['keptSingleOnRequest'] === false && count($copies()) === 2, 'Splitting again carries the world over with a fresh dated copy.');
    layoutCheck($store->getSnapshot() === $single && (new SyncV2Store($path))->getSnapshot() === $single, 'The world reads back identical after splitting again.');
    $store = null; $reopened = null; $fresh = null; $look = null;

    // ---- A carry-over that cannot finish leaves the old layout whole ----------------------------------
    $path2 = $directory . DIRECTORY_SEPARATOR . 'second.sqlite';
    $seed = new PDO('sqlite:' . $path2);
    $seed->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $seed->exec('CREATE TABLE vtt_world_state (world_id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision>=0), state_json TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    $seed->prepare('INSERT INTO vtt_world_state VALUES (?,?,?,?)')->execute(['default', 7, $oldJson, 1700000000000]);
    // Stopped part-way: the second design part cannot be written.
    $seed->exec('CREATE TABLE vtt_state_parts (world_id TEXT NOT NULL, scene_id TEXT NOT NULL, part TEXT NOT NULL, state_json TEXT NOT NULL, PRIMARY KEY (world_id, scene_id, part))');
    $seed->exec("CREATE TRIGGER stop_part_way BEFORE INSERT ON vtt_state_parts WHEN NEW.part = 'walls' BEGIN SELECT RAISE(ABORT, 'stopped part-way'); END");
    $stopped = new SyncV2Store($path2);
    $status = $stopped->storageStatus();
    layoutCheck($status['layout'] === 'single' && $status['keptSingleOnRequest'] === false && str_contains((string) ($status['lastFailure']['reason'] ?? ''), 'stopped part-way'), 'A carry-over stopped part-way leaves the world in one row and says why.');
    layoutCheck($stopped->getSnapshot()['state'] === $old && $seed->query("SELECT state_json FROM vtt_world_state")->fetchColumn() === $oldJson, 'The old layout is whole.');
    layoutCheck((int) $seed->query('SELECT (SELECT COUNT(*) FROM vtt_state_main) + (SELECT COUNT(*) FROM vtt_state_parts)')->fetchColumn() === 0, 'Nothing of the half-made split is left.');
    $stopped->acceptShadowCommand(['type' => 'shadow.observe', 'operationId' => 'layout-shadow-stopped', 'baseRevision' => 7, 'payload' => ['step' => 3]], 'GM');
    $secondCopies = static fn (): array => glob($directory . DIRECTORY_SEPARATOR . 'second.before-split-*.sqlite') ?: [];
    $count = count($secondCopies());
    $soon = new SyncV2Store($path2);
    layoutCheck($soon->storageStatus()['layout'] === 'single' && count($secondCopies()) === $count && $soon->getSnapshot()['revision'] === 8, 'The site keeps running the old way, and the carry-over is not tried again at once.');
    // Once what stopped it is gone and the wait is over, the next open carries it over.
    $seed->exec('DROP TRIGGER stop_part_way');
    $seed->exec("UPDATE vtt_meta SET value = '1' WHERE name = 'split_failed_at'");
    sleep(1);
    $later = new SyncV2Store($path2);
    layoutCheck($later->storageStatus()['layout'] === 'split' && $later->storageStatus()['lastFailure'] === null && $later->getSnapshot() === $soon->getSnapshot(), 'It is carried over later, identical, and the failure note is cleared.');
    $later = null; $soon = null; $stopped = null; $seed = null;

    // ---- A brand new world starts split, with no copy ---------------------------------------------------
    $path3 = $directory . DIRECTORY_SEPARATOR . 'third.sqlite';
    $new = new SyncV2Store($path3);
    layoutCheck($new->storageStatus()['layout'] === 'split' && $new->storageStatus()['copyFile'] === null && glob($directory . DIRECTORY_SEPARATOR . 'third.before-split-*') === [], 'A new world starts in the split layout and needs no copy.');
    $memory = new SyncV2Store(':memory:');
    layoutCheck($memory->storageStatus()['layout'] === 'split', 'So does a world kept in memory.');
    $new = null; $memory = null;

    // ---- What the Director is told when a carry-over could not be made ------------------------------------
    require_once __DIR__ . '/../../../bootstrap.php';
    layoutCheck(vttStorageNotice(['layout' => 'split', 'keptSingleOnRequest' => false, 'lastFailure' => null]) === '', 'Nothing is said when the world is split.');
    layoutCheck(vttStorageNotice(['layout' => 'single', 'keptSingleOnRequest' => true, 'lastFailure' => ['at' => 1, 'reason' => 'x']]) === '', 'Nothing is said when the Director asked for one row.');
    $told = vttStorageNotice(['layout' => 'single', 'keptSingleOnRequest' => false, 'lastFailure' => ['at' => 1, 'reason' => 'Not enough room on the disk for the safety copy: 40 MB free, about 276 MB needed.']]);
    layoutCheck(str_contains($told, 'Not enough room on the disk') && str_contains($told, 'nothing is lost') && vttStorageNotice() === $told, 'The Director is told plainly why the world stayed the old way.');

    echo "Storage layout: carry-over, identical read-back, dated copy, frozen old row, changed parts only, rollback, missing part, turn back, split again and a stopped carry-over passed.\n";
} finally {
    $store = null; $again = null; $fresh = null; $reopened = null; $look = null; $seed = null; $copy = null; $stopped = null; $soon = null; $later = null; $new = null; $memory = null;
    foreach (glob($directory . DIRECTORY_SEPARATOR . '*') ?: [] as $file) {
        @unlink($file);
    }
    @rmdir($directory);
}
