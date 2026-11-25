<?php
declare(strict_types=1);
// The ledger of accepted commands (vtt_operations) no longer grows for ever.
//
// November 25, 2026: the live file held every command since July, 12,447 rows and 90 MB, because nothing removed
// them. A row is only ever read to answer a command that arrives a second time, and a page only repeats a command
// while it is open, so the newest few thousand are all that is asked for.
//
// What must not change: a command sent twice is still answered once while its row is kept; the board, its events
// and its snapshots are untouched by the clean-up.
require_once __DIR__ . '/../../../lib/SyncV2Store.php';

function ledgerCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$path = sys_get_temp_dir() . '/vtt-ledger-' . bin2hex(random_bytes(6)) . '.sqlite';
try {
    // The newest 10 events kept, a snapshot every 5 commands, the newest 12 commands kept.
    $store = new SyncV2Store($path, 'ledger-world', 10, 5, 3, 12);
    $peek = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $rows = static fn (): int => (int) $peek->query('SELECT COUNT(*) FROM vtt_operations')->fetchColumn();
    $has = static fn (string $id): bool => (bool) $peek->query('SELECT 1 FROM vtt_operations WHERE operation_id = ' . $peek->quote($id))->fetchColumn();
    $send = static fn (int $n) => $store->acceptShadowCommand([
        'operationId' => sprintf('ledger-op-%04d', $n), 'type' => 'shadow.observe', 'baseRevision' => $store->getSnapshot()['revision'],
        'sceneId' => 'scene-1', 'entityId' => 'token-1', 'payload' => ['column' => $n, 'row' => 1],
    ], 'GM');

    for ($n = 1; $n <= 14; $n++) ledgerCheck($send($n)['status'] === 'accepted', "Command $n is accepted");
    ledgerCheck($rows() === 14, 'Nothing is removed between snapshots, and nothing was past the newest 12 at the last one (10): ' . $rows());
    $send(15);
    ledgerCheck($rows() === 12 && !$has('ledger-op-0003') && $has('ledger-op-0004'), 'The snapshot at command 15 leaves the newest 12: ' . $rows());

    // A command whose row is kept is still answered once.
    $again = $send(15);
    ledgerCheck($again['status'] === 'accepted' && $again['idempotent'] === true && $again['event']['revision'] === 15, 'A repeat of a kept command is given its first answer');
    ledgerCheck($store->getSnapshot()['revision'] === 15, 'and makes no new revision');
    // One whose row has gone is a new command: it is taken or refused on its own merits, never applied silently twice.
    $late = $store->acceptShadowCommand(['operationId' => 'ledger-op-0001', 'type' => 'shadow.observe', 'baseRevision' => 15, 'sceneId' => 'scene-1', 'entityId' => 'token-1', 'payload' => ['column' => 1, 'row' => 1]], 'GM');
    ledgerCheck($late['status'] === 'accepted' && $late['idempotent'] === false && $late['event']['revision'] === 16, 'A repeat from before the kept rows is a new command with a new revision');

    // Years of rows are cleared a batch at a time, oldest first, without touching anything else.
    $batch = (new ReflectionClassConstant(SyncV2Store::class, 'OPERATION_PRUNE_BATCH'))->getValue();
    $peek->exec('BEGIN');
    $insert = $peek->prepare('INSERT INTO vtt_operations (world_id, operation_id, event_json, created_at) VALUES (?,?,?,?)');
    $before = $rows();
    for ($n = 0; $n < 2 * $batch + 40; $n++) $insert->execute(['ledger-world', 'backlog-' . $n, '{"type":"old"}', 1700000000000 + $n]);
    $peek->exec('COMMIT');
    $newestEvent = (int) $peek->query('SELECT MAX(revision) FROM vtt_events')->fetchColumn();
    $state = $store->getSnapshot()['state'];
    for ($n = 17; $n <= 20; $n++) $send($n);                       // the snapshot at revision 20
    $after = $rows();
    ledgerCheck($after === $before + 2 * $batch + 40 + 4 - $batch, "One snapshot removes one batch ($batch) and no more: $after");
    ledgerCheck((int) $peek->query('SELECT COUNT(*) FROM vtt_events')->fetchColumn() === 10 && (int) $peek->query('SELECT MAX(revision) FROM vtt_events')->fetchColumn() === $newestEvent + 4, 'The events are kept by their own rule, as before');
    for ($n = 21; $n <= 40; $n++) $send($n);                       // four more snapshots
    ledgerCheck($rows() === 12, 'A few snapshots later only the newest 12 are left: ' . $rows());
    ledgerCheck($has('ledger-op-0040') && $has('ledger-op-0029') && !$has('ledger-op-0028') && !$has('backlog-0'), 'and they are the newest ones');
    $world = $store->getSnapshot();
    ledgerCheck($world['revision'] === 40 && ($world['state']['shadow']['mode'] ?? null) === ($state['shadow']['mode'] ?? null), 'The board itself is as it was');
    ledgerCheck($store->getOperationalStatus()['operationRetention'] === 12 && $store->getOperationalStatus()['operationLedgerEntries'] === 12, 'The status page says how many are kept');

    // The setting everyone gets when none is given keeps far more than a page could ever repeat.
    $default = new SyncV2Store(sys_get_temp_dir() . '/vtt-ledger-default-' . bin2hex(random_bytes(6)) . '.sqlite', 'ledger-world');
    ledgerCheck($default->getOperationalStatus()['operationRetention'] === 5000, 'By default the newest 5,000 commands are kept');
    $short = new SyncV2Store(sys_get_temp_dir() . '/vtt-ledger-short-' . bin2hex(random_bytes(6)) . '.sqlite', 'ledger-world', 800, 100, 20, 50);
    ledgerCheck($short->getOperationalStatus()['operationRetention'] === 800, 'Never fewer commands than events: an event still on file must find its command');
    $config = require __DIR__ . '/../../../config/sync-v2.php';
    ledgerCheck(($config['operation_retention'] ?? null) === 5000, 'and the site is set to the same');

    echo "operation ledger: the newest commands are kept and still answered once; older rows go a batch at a time when a snapshot is taken\n";
} finally {
    foreach (glob(sys_get_temp_dir() . '/vtt-ledger-*') ?: [] as $file) @unlink($file);
}
