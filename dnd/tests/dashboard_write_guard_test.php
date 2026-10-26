<?php
// Every dashboard action that writes character data is refused for players before it runs (October 2026: batch_save
// was missing from the guard, so a player could post changes to any character's dashboard data).
$source = file_get_contents(__DIR__ . '/../dashboard.php');
$pattern = '/if \(!\$is_gm && in_array\(\$_POST\[\'action\'\], array\(([^)]*)\), true\)\)/';
if (!preg_match($pattern, $source, $m)) {
    fwrite(STDERR, "FAIL: the player write guard was not found\n");
    exit(1);
}
foreach (array('save', 'batch_save', 'add_item', 'delete_item') as $action) {
    if (strpos($m[1], "'" . $action . "'") === false) {
        fwrite(STDERR, "FAIL: $action is not refused for players\n");
        exit(1);
    }
}
$guardAt = strpos($source, $m[0]);
$batchAt = strpos($source, '$_POST[\'action\'] === \'batch_save\'');
if ($batchAt === false || $guardAt > $batchAt) {
    fwrite(STDERR, "FAIL: the guard must run before batch_save is handled\n");
    exit(1);
}
echo "ok - dashboard write guard covers save, batch_save, add_item, delete_item\n";
