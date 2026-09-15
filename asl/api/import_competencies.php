<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/competencies.php';
require_once dirname(__DIR__) . '/lib/backup.php';
$me=aslhub_require_teacher($pdo,true);
if (!aslhub_is_admin($me)) aslhub_json_error('Admin access required.',403);
aslhub_require_csrf();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') aslhub_json_error('POST required.',405);
try {
    aslhub_import_competencies($pdo, function(PDO $db) { aslhub_backup_sql($db); });
    aslhub_json(['success'=>true]);
} catch (Throwable $e) {
    error_log('import_competencies: '.$e->getMessage());
    aslhub_json_error($e->getMessage(),409);
}
