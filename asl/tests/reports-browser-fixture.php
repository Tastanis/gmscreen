<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
ob_start(); require __DIR__ . '/competency-browser-fixture.php'; $fixtureDir = trim(ob_get_clean());
foreach (['teacher/reports.php','teacher/notes.php','lib/report_sheet.php','report.php','lib/report.php','lib/calendar_correction.php','css/report.css','js/report.js',
    'js/block-metrics.js','teacher/weekly.php','teacher/settings.php','api/save_block_metrics.php','api/settings_save.php'] as $file) {
    copy(dirname(__DIR__) . '/' . $file, $fixtureDir . '/' . $file);
}
$db = new CompetencyFixturePDO($fixtureDir . '/fixture.sqlite');
$db->exec("INSERT INTO users (id,first_name,last_name,email,password,is_teacher,teacher,level,class_period) VALUES (5,'ASL2','Fixture','asl2@example.invalid','fixture',0,'harms',2,2)");
// A complete disposable metrics table lets the real entry endpoint round-trip saves.
$db->exec('DROP TABLE asl_student_block_metrics');
$db->exec('CREATE TABLE asl_student_block_metrics (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,block_id INTEGER,
    absences INTEGER,absences_next_semester INTEGER,participation_points INTEGER,participation_max INTEGER,version INTEGER,updated_by INTEGER,UNIQUE(user_id,block_id))');
$db->exec('CREATE TABLE asl_student_block_metric_audit (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,block_id INTEGER,
    old_absences INTEGER,new_absences INTEGER,old_absences_next_semester INTEGER,new_absences_next_semester INTEGER,old_participation_points INTEGER,new_participation_points INTEGER,participation_max INTEGER,
    old_version INTEGER,new_version INTEGER,changed_by INTEGER,is_correction INTEGER)');
$blockId = (int)$db->query('SELECT id FROM asl_reporting_blocks WHERE block_index=1')->fetchColumn();
$db->prepare('INSERT INTO asl_student_block_metrics (user_id,block_id,absences,participation_points,participation_max,version) VALUES (2,?,2,24,27,1)')->execute([$blockId]);
$db->prepare('INSERT INTO asl_student_block_metrics (user_id,block_id,absences,participation_points,participation_max,version) VALUES (3,?,0,27,27,1)')->execute([$blockId]);
$current = $db->prepare('INSERT INTO user_learning_targets (user_id,learning_target_id,score,completed_at) VALUES (?,?,?,?)');
$history = $db->prepare('INSERT INTO user_learning_target_score_history (user_id,learning_target_id,score,scored_at) VALUES (?,?,?,?)');
foreach ([2 => 1, 3 => 3, 5 => 2] as $studentId => $level) {
    $targets = $db->query('SELECT id FROM asl_learning_targets WHERE active=1 AND asl_level=' . $level . ' ORDER BY id')->fetchAll(PDO::FETCH_COLUMN);
    foreach ($targets as $i => $target) {
        $history->execute([$studentId, $target, 2, '2026-09-18 12:00:00']);
        $improved = $studentId !== 2 || $i < 6;
        $score = $studentId === 5 && $i % 2 === 0 ? 4 : 3;
        if ($improved) $history->execute([$studentId, $target, $score, '2026-09-21 08:00:00']);
        $current->execute([$studentId, $target, $improved ? $score : 2, '2026-09-21 08:00:00']);
    }
}
if (in_array('--semester-boundary', $argv, true)) {
    // Freeze only the disposable copy's calendar clock to exercise the future boundary.
    foreach (['lib/data.php','lib/calendar.php','api/save_block_metrics.php'] as $file) {
        $path = $fixtureDir . '/' . $file;
        file_put_contents($path, str_replace("new DateTimeImmutable('now'", "new DateTimeImmutable('2027-02-05 12:00:00'", file_get_contents($path)));
    }
}
echo $fixtureDir;
