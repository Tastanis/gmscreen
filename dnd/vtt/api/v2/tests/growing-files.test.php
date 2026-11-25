<?php
declare(strict_types=1);
// Files that were added to for ever (found November 25, 2026, while looking at what the host was being asked to do).
//
//   - "Session" backups of the monsters, the templates and the old dashboard characters are meant to be two files,
//     the older overwritten. Each file's name carries the time it was written, so nothing was ever overwritten:
//     the monster and template pages added one every ten minutes they were open.
//   - The schedule's three small logs took a line on every load, save and week change and were never shortened.
//
// What must not change: the newest two session backups are there, the other kinds of backup are untouched, and a
// log keeps its newest lines in order.
require_once __DIR__ . '/../../../../strixhaven/monster-creator/includes/monster-backup-helper.php';
require_once __DIR__ . '/../../../../strixhaven/templates/includes/backup-helper.php';
require_once __DIR__ . '/../../../../includes/dashboard-backup-helper.php';
require_once __DIR__ . '/../../../../schedule/log-line.php';

function growCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$base = sys_get_temp_dir() . '/vtt-growing-' . bin2hex(random_bytes(6));
mkdir($base, 0775, true);
$remove = static function (string $folder) use (&$remove): void {
    foreach (scandir($folder) ?: [] as $entry) { if ($entry === '.' || $entry === '..') continue; $path = $folder . '/' . $entry; is_dir($path) ? $remove($path) : @unlink($path); }
    @rmdir($folder);
};
try {
    $helpers = [];
    foreach (get_declared_classes() as $class) {
        $reflection = new ReflectionClass($class);
        if ($reflection->isUserDefined() && $reflection->hasMethod('createSessionBackup') && $reflection->hasProperty('backupDir')) $helpers[] = $reflection;
    }
    growCheck(count($helpers) === 3, 'The three backup helpers are found: ' . count($helpers));
    foreach ($helpers as $reflection) {
        $folder = $base . '/' . $reflection->getShortName();
        mkdir($folder, 0775, true);
        $helper = $reflection->newInstanceWithoutConstructor();
        $directory = $reflection->getProperty('backupDir'); $directory->setAccessible(true); $directory->setValue($helper, $folder);
        $list = $reflection->getMethod('getBackupsByType'); $list->setAccessible(true);
        $create = $reflection->getMethod('createSessionBackup'); $create->setAccessible(true);

        // What a page open for an hour left behind, and one backup of each other kind.
        growCheck($create->invoke($helper, '{"written":"first"}')['success'] === true, $reflection->getShortName() . ': a session backup is written');
        $first = $list->invoke($helper, 'session')[0]['filename'];
        $stem = substr($first, 0, strpos($first, '_session_'));
        @unlink($folder . '/' . $first);
        $now = time();
        for ($n = 1; $n <= 6; $n++) {
            $file = sprintf('%s/%s_session_%d_2026-11-24_20-%02d-00.json', $folder, $stem, 1 + $n % 2, $n * 10 - 10);
            file_put_contents($file, '{"old":' . $n . '}'); touch($file, $now - 7000 + $n * 600);
        }
        foreach (['daily_2026-11-24', 'manual_2026-11-01_10-00-00', 'recent'] as $other) file_put_contents("$folder/{$stem}_$other.json", '{"kept":true}');

        growCheck($create->invoke($helper, '{"written":"now"}')['success'] === true, $reflection->getShortName() . ': the next session backup is written');
        $left = array_column($list->invoke($helper, 'session'), 'filename');
        sort($left);
        growCheck(count($left) === 2, $reflection->getShortName() . ': two session backups are left, not seven: ' . json_encode($left));
        $contents = array_map(static fn (string $name): string => (string) file_get_contents("$folder/$name"), $left);
        sort($contents);
        growCheck($contents === ['{"old":6}', '{"written":"now"}'], $reflection->getShortName() . ': they are the one just written and the newest before it: ' . json_encode($contents));
        foreach (['daily_2026-11-24', 'manual_2026-11-01_10-00-00', 'recent'] as $other) growCheck(is_file("$folder/{$stem}_$other.json"), $reflection->getShortName() . ": the $other backup is untouched");
        growCheck($create->invoke($helper, '{"written":"again"}')['success'] === true && count($list->invoke($helper, 'session')) <= 2, $reflection->getShortName() . ': and it stays at two');
    }

    // The schedule's logs.
    $log = $base . '/access_log.txt';
    for ($n = 1; $n <= 40; $n++) scheduleLogLine($log, sprintf("line %03d %s\n", $n, str_repeat('x', 40)), 1000);
    $lines = file($log, FILE_IGNORE_NEW_LINES);
    growCheck(filesize($log) <= 1000 + 60 && count($lines) >= 8 && count($lines) < 40, 'A log past its limit loses its older half: ' . filesize($log) . ' bytes, ' . count($lines) . ' lines');
    growCheck(str_starts_with(end($lines), 'line 040 '), 'The newest line is the last one');
    $numbers = array_map(static fn (string $line): int => (int) substr($line, 5, 3), $lines);
    growCheck($numbers === range($numbers[0], 40) && !in_array(false, array_map(static fn (string $line): bool => strlen($line) === 49, $lines), true), 'What is kept is whole lines, in order, none missing: ' . json_encode($numbers));
    scheduleLogLine($base . '/new_log.txt', "first\n");
    growCheck(file_get_contents($base . '/new_log.txt') === "first\n", 'A log that is not there yet is started');
    foreach (['get_schedule.php' => 'access_log.txt', 'save_schedule.php' => 'save_log.txt', 'update_current_week.php' => 'week_log.txt'] as $script => $name) {
        $source = (string) file_get_contents(__DIR__ . '/../../../../schedule/' . $script);
        growCheck(str_contains($source, "scheduleLogLine('data/$name', \$log_entry);") && !str_contains($source, 'FILE_APPEND'), "$script writes its log through the limit");
    }

    // The dated safety copies of the board's database: a carry-over that keeps failing writes one at every try.
    require_once __DIR__ . '/../../../lib/SyncV2Store.php';
    mkdir($base . '/board', 0775, true);
    $store = new SyncV2Store($base . '/board/sync-v2.sqlite', 'growing-world');
    $storage = new ReflectionProperty(SyncV2Store::class, 'storage'); $storage->setAccessible(true);
    $copy = new ReflectionMethod(SyncV2Layout::class, 'writeDatedCopy'); $copy->setAccessible(true);
    $names = [];
    for ($n = 1; $n <= 5; $n++) { $names[] = $copy->invoke($storage->getValue($store)); touch($base . '/board/' . end($names), time() - 50 + $n * 10); }
    $left = array_map('basename', glob($base . '/board/sync-v2.before-split-*.sqlite') ?: []);
    sort($left); $newest = array_slice($names, -3); sort($newest);                // (a name freed by a removal may be used again)
    growCheck(count($left) === 3 && $left === $newest, 'Of five dated copies the newest three are left: ' . json_encode([$names, $left]));
    growCheck((new PDO('sqlite:' . $base . '/board/' . end($names)))->query('PRAGMA quick_check')->fetchColumn() === 'ok' && $store->getSnapshot()['revision'] === 0, 'and the newest is a sound database, the board untouched');
    $store = null;

    echo "growing files: session backups stay at two; the schedule's logs keep their newest lines and stop growing; three dated database copies at most\n";
} finally {
    $remove($base);
}
