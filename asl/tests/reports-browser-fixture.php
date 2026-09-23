<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
ob_start(); require __DIR__ . '/competency-browser-fixture.php'; $fixtureDir = trim(ob_get_clean());
foreach (['report.php','lib/report.php','lib/calendar_correction.php','css/report.css','js/report.js',
    'js/block-metrics.js','teacher/weekly.php','teacher/settings.php','api/save_block_metrics.php','api/settings_save.php'] as $file) {
    copy(dirname(__DIR__) . '/' . $file, $fixtureDir . '/' . $file);
}
$db = new CompetencyFixturePDO($fixtureDir . '/fixture.sqlite');
// A complete disposable metrics table lets the real entry endpoint round-trip saves.
$db->exec('DROP TABLE asl_student_block_metrics');
$db->exec('CREATE TABLE asl_student_block_metrics (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,block_id INTEGER,
    absences INTEGER,participation_points INTEGER,participation_max INTEGER,version INTEGER,updated_by INTEGER,UNIQUE(user_id,block_id))');
$db->exec('CREATE TABLE asl_student_block_metric_audit (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,block_id INTEGER,
    old_absences INTEGER,new_absences INTEGER,old_participation_points INTEGER,new_participation_points INTEGER,participation_max INTEGER,
    old_version INTEGER,new_version INTEGER,changed_by INTEGER,is_correction INTEGER)');
$blockId = (int)$db->query('SELECT id FROM asl_reporting_blocks WHERE block_index=1')->fetchColumn();
$db->prepare('INSERT INTO asl_student_block_metrics (user_id,block_id,absences,participation_points,participation_max,version) VALUES (2,?,2,24,27,1)')->execute([$blockId]);
$db->prepare('INSERT INTO asl_student_block_metrics (user_id,block_id,absences,participation_points,participation_max,version) VALUES (3,?,0,27,27,1)')->execute([$blockId]);
$current = $db->prepare('INSERT INTO user_learning_targets (user_id,learning_target_id,score,completed_at) VALUES (?,?,?,?)');
$history = $db->prepare('INSERT INTO user_learning_target_score_history (user_id,learning_target_id,score,scored_at) VALUES (?,?,?,?)');
foreach ([2 => 1, 3 => 3] as $studentId => $level) {
    $targets = $db->query('SELECT id FROM asl_learning_targets WHERE active=1 AND asl_level=' . $level . ' ORDER BY id')->fetchAll(PDO::FETCH_COLUMN);
    foreach ($targets as $i => $target) {
        $history->execute([$studentId, $target, 2, '2026-09-18 12:00:00']);
        $improved = $studentId === 3 || $i < 6;
        if ($improved) $history->execute([$studentId, $target, 3, '2026-09-21 08:00:00']);
        $current->execute([$studentId, $target, $improved ? 3 : 2, '2026-09-21 08:00:00']);
    }
}
echo $fixtureDir;
