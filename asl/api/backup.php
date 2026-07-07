<?php
/** Admin-only: create an SQL dump backup (server copy + download). */
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/backup.php';

$me = aslhub_require_teacher($pdo);
if (!aslhub_is_admin($me)) die('Admin (Harms) access required.');

try {
    $path = aslhub_backup_sql($pdo);
    aslhub_backup_prune();
} catch (Exception $e) {
    error_log('backup: ' . $e->getMessage());
    die('Backup failed: ' . aslhub_h($e->getMessage()));
}

header('Content-Type: application/sql');
header('Content-Disposition: attachment; filename="' . basename($path) . '"');
header('Content-Length: ' . filesize($path));
readfile($path);
exit;
