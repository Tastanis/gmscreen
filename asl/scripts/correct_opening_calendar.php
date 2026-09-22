<?php
/** Preview or apply the approved opening calendar and three-points-per-day rule. */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$options = getopt('', ['apply']);
require dirname(__DIR__) . '/config.php';
require dirname(__DIR__) . '/lib/calendar_correction.php';
require_once dirname(__DIR__) . '/lib/backup.php';
try {
    if (isset($options['apply'])) {
        $changed = aslhub_correct_opening_calendar($pdo, function(PDO $db): void {
            aslhub_backup_sql($db);
            aslhub_backup_xlsx($db);
        });
        echo $changed ? "Opening calendar corrected.\n" : "No correction required.\n";
    }
    $days = $pdo->query('SELECT * FROM asl_calendar_days ORDER BY school_date')->fetchAll();
    if (!$days) { echo "No installed calendar. New imports use the corrected seed.\n"; exit; }
    echo json_encode(aslhub_opening_calendar_plan($days)['blocks'], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n";
} catch (Throwable $e) {
    fwrite(STDERR, "Calendar correction stopped: " . $e->getMessage() . "\n");
    exit(1);
}
