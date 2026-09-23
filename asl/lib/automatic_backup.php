<?php
require_once __DIR__ . '/backup.php';

/** Daily full SQL snapshots plus retained snapshots at the first use of each block.
 * No database flag can claim success before the atomic backup file is complete.
 */
function aslhub_automatic_backup(PDO $pdo, ?string $today = null): void {
    $today ??= date('Y-m-d');
    $root = aslhub_backup_dir() . '/automatic';
    if (!is_dir($root) && !mkdir($root, 0700, true) && !is_dir($root)) throw new RuntimeException('Cannot create automatic backup directory.');
    $lock = fopen($root . '/backup.lock', 'c');
    if (!$lock) throw new RuntimeException('Cannot open automatic backup lock.');
    try {
        if (!flock($lock, LOCK_EX)) throw new RuntimeException('Cannot lock automatic backups.');
        $stmt = $pdo->prepare('SELECT start_date FROM asl_reporting_blocks WHERE active=1 AND start_date <= ? ORDER BY start_date DESC LIMIT 1');
        $stmt->execute([$today]);
        $start = $stmt->fetchColumn();
        $daily = $root . '/daily-' . $today . '.sql';
        $block = $start ? $root . '/block-' . $start . '.sql' : null;
        if (is_file($daily) && (!$block || is_file($block))) return;
        $snapshot = aslhub_backup_sql($pdo, $root);
        try {
            if ($block && !is_file($block)) {
                $tmp = $block . '.tmp';
                if (!copy($snapshot, $tmp) || !rename($tmp, $block)) throw new RuntimeException('Cannot retain block backup.');
            }
            if (!is_file($daily)) {
                if (!rename($snapshot, $daily)) throw new RuntimeException('Cannot finalize daily backup.');
            }
        } finally { if (is_file($snapshot)) unlink($snapshot); }
        // Block snapshots are never pruned by daily/manual backup retention.
        $files = glob($root . '/daily-????-??-??.sql') ?: [];
        rsort($files, SORT_STRING);
        foreach (array_slice($files, 60) as $old) unlink($old);
    } finally { flock($lock, LOCK_UN); fclose($lock); }
}
