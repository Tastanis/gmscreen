<?php
/**
 * TEMPORARY start-fresh tool (admin only). Deletes all STUDENT accounts and
 * their scores/history/weekly logs so the new school year starts clean.
 * Teachers, taxonomy, rubrics, resources, and settings are kept.
 * An SQL dump + xlsx backup is written automatically BEFORE anything deletes.
 *
 * Remove this file (and its Settings section) once the year is underway.
 */
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/backup.php';

$me = aslhub_require_teacher($pdo, true);
if (!aslhub_is_admin($me)) aslhub_json_error('Admin (Harms) access required.', 403);
aslhub_require_csrf();

if (($_POST['confirm_text'] ?? '') !== 'START FRESH') {
    aslhub_json_error('Type START FRESH (exactly) to confirm.');
}

try {
    $sqlPath = aslhub_backup_sql($pdo);
    $xlsxPath = aslhub_backup_xlsx($pdo);
} catch (Exception $e) {
    aslhub_json_error('Refusing to wipe: automatic backup failed (' . $e->getMessage() . ')', 500);
}

try {
    $pdo->beginTransaction();
    $studentIds = $pdo->query("SELECT id FROM users WHERE is_teacher = FALSE")->fetchAll(PDO::FETCH_COLUMN);
    $count = count($studentIds);
    if ($count) {
        $in = implode(',', array_map('intval', $studentIds));
        $pdo->exec("DELETE FROM asl_student_block_metric_audit WHERE user_id IN ($in)");
        $pdo->exec("DELETE FROM asl_student_block_metrics WHERE user_id IN ($in)");
        $pdo->exec("DELETE FROM user_learning_targets WHERE user_id IN ($in)");
        $pdo->exec("DELETE FROM user_learning_target_score_history WHERE user_id IN ($in)");
        $pdo->exec("DELETE FROM asl_student_meetings WHERE user_id IN ($in)");
        $pdo->exec("DELETE FROM users WHERE id IN ($in) AND is_teacher = FALSE");
    }
    $pdo->commit();
} catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    aslhub_json_error('Wipe failed, nothing deleted: ' . $e->getMessage(), 500);
}

aslhub_json([
    'success' => true,
    'deleted_students' => $count,
    'backups' => [basename($sqlPath), basename($xlsxPath)],
]);
