<?php
/**
 * CLI-only scheduled backup entry point.
 *
 * Example Windows Task Scheduler action:
 *   php.exe C:\path\to\site\asl\scripts\nightly_backup.php
 *
 * Copy the resulting encrypted/off-site according to school policy. A backup
 * left only on the web server does not protect against server loss.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/backup.php';

try {
    $sql = aslhub_backup_sql($pdo);
    $xlsx = aslhub_backup_xlsx($pdo);
    aslhub_backup_prune();
    fwrite(STDOUT, "ASL backup complete\nSQL: $sql\nExcel: $xlsx\n");
    exit(0);
} catch (Throwable $e) {
    error_log('nightly ASL backup failed: ' . $e->getMessage());
    fwrite(STDERR, "ASL backup failed: {$e->getMessage()}\n");
    exit(1);
}
