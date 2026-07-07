<?php
/** Admin-only: download the full-database workbook (and store a copy in backups/). */
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/backup.php';

$me = aslhub_require_teacher($pdo);
if (!aslhub_is_admin($me)) die('Admin (Harms) access required.');

try {
    $path = aslhub_backup_xlsx($pdo);
    aslhub_backup_prune();
} catch (Exception $e) {
    error_log('export: ' . $e->getMessage());
    die('Export failed: ' . aslhub_h($e->getMessage()));
}

header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
header('Content-Disposition: attachment; filename="' . basename($path) . '"');
header('Content-Length: ' . filesize($path));
readfile($path);
exit;
