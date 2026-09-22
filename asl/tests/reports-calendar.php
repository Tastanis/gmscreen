<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/competency-fixture.php';
require dirname(__DIR__) . '/lib/helpers.php';
require dirname(__DIR__) . '/lib/report.php';
require dirname(__DIR__) . '/lib/calendar_correction.php';
function verify($ok, string $label): void {
    if (!$ok) throw new RuntimeException($label);
    echo "PASS $label\n";
}
function rejects(callable $fn, string $label): void {
    try { $fn(); } catch (Throwable $e) { verify(true, $label); return; }
    throw new RuntimeException($label);
}
function fixture(): PDO {
    $pdo = new CompetencyFixturePDO(':memory:'); competency_fixture_schema($pdo);
    $bundle = json_decode(file_get_contents(dirname(__DIR__) . '/data/competencies-2026.json'), true);
    $calendar = $bundle['calendar'];
    $calendar['days'] = array_values(array_filter($calendar['days'], fn($d) => $d['date'] >= '2026-09-14'));
    $parsed = aslhub_calendar_parse(json_encode($calendar));
    // Reproduce the deployed legacy ten-instructional-day grouping, not the new builder.
    $parsed['blocks'] = [];
    foreach (array_chunk(array_values(array_filter($calendar['days'], fn($d) => $d['instructional'])), 10) as $i => $chunk) {
        $parsed['blocks'][] = ['block_index'=>$i+1,'label'=>'Block '.($i+1), 'start_date'=>$chunk[0]['date'],
            'end_date'=>$chunk[count($chunk)-1]['date'],'instructional_days'=>count($chunk)];
    }
    aslhub_calendar_apply($pdo, $parsed);
    return $pdo;
}
$pdo = fixture();
$before = $pdo->query('SELECT * FROM asl_reporting_blocks ORDER BY block_index')->fetchAll();
$days = $pdo->query('SELECT * FROM asl_calendar_days ORDER BY school_date')->fetchAll();
$plan = aslhub_opening_calendar_plan($days);
verify($plan['blocks'][0]['start_date'] === '2026-09-08' && $plan['blocks'][0]['end_date'] === '2026-09-18'
    && $plan['blocks'][0]['instructional_days'] === 9, 'first block is exactly September 8–18, nine school days');
verify($plan['blocks'][1]['start_date'] === '2026-09-21' && $plan['blocks'][1]['end_date'] === '2026-10-02', 'second block shifts to September 21–October 2');
verify(array_sum(array_column($plan['blocks'], 'instructional_days')) === 175 && count($plan['blocks']) === 20
    && end($plan['blocks'])['instructional_days'] === 8, 'all 175 days assigned once across 20 fixed fortnights');
verify(count(array_filter($plan['blocks'], fn($b) => (new DateTimeImmutable($b['end_date']))->format('N') !== '5')) === 0, 'every reporting block ends Friday');
verify($plan['blocks'][2]['end_date'] === '2026-10-16' && $plan['blocks'][2]['instructional_days'] === 9
    && $plan['blocks'][3]['start_date'] === '2026-10-19', 'October holiday reduces days without shifting the next block');
foreach ($days as $day) {
    if ($day['school_date'] <= '2026-09-18') continue;
    $new = array_values(array_filter($plan['days'], fn($d) => $d['date'] === $day['school_date']))[0];
    if ($new['instructional'] !== (bool)$day['is_instructional'] || $new['label'] !== $day['label']) throw new RuntimeException('Holiday changed');
}
verify(true, 'all later holidays and dates preserved');
$id = $before[0]['id'];
$pdo->prepare('INSERT INTO asl_student_block_metrics VALUES (2,?,2,8,10,3)')->execute([$id]);
$backupCalls = 0;
rejects(fn() => aslhub_correct_opening_calendar($pdo, fn() => throw new RuntimeException('backup failed')), 'failed backup aborts correction');
verify($before === $pdo->query('SELECT * FROM asl_reporting_blocks ORDER BY block_index')->fetchAll(), 'failed backup leaves entire schedule unchanged');
$pdo->exec("CREATE TRIGGER fail_calendar BEFORE UPDATE ON asl_reporting_blocks WHEN NEW.start_date='2026-09-08' BEGIN SELECT RAISE(ABORT,'storage failure'); END");
rejects(fn() => aslhub_correct_opening_calendar($pdo, fn() => null), 'mid-correction failure aborts');
verify($days === $pdo->query('SELECT * FROM asl_calendar_days ORDER BY school_date')->fetchAll(), 'rollback restores original days too');
$pdo->exec('DROP TRIGGER fail_calendar');
verify(aslhub_correct_opening_calendar($pdo, function() use (&$backupCalls) { $backupCalls++; }), 'correction commits');
$after = $pdo->query('SELECT * FROM asl_reporting_blocks WHERE active=1 ORDER BY block_index')->fetchAll();
verify(array_column($before, 'id') === array_slice(array_column($after, 'id'), 0, count($before)), 'existing block identities preserved and extra fortnights appended');
verify(array_column($after, 'participation_max') === array_map(fn($b) => 3 * (int)$b['instructional_days'], $after), 'every block maximum is exactly three times its school days');
$row = $pdo->query('SELECT * FROM asl_student_block_metrics')->fetch();
verify((int)$row['absences'] === 2 && (int)$row['participation_points'] === 8 && (int)$row['participation_max'] === 27
    && (int)$row['version'] === 4, 'saved scores preserved, denominator updated, stale row versions invalidated');
verify(!aslhub_correct_opening_calendar($pdo, fn() => throw new RuntimeException('second backup')) && $backupCalls === 1, 'repeat correction is a no-op');
$revision = (int)$pdo->query("SELECT setting_value FROM asl_settings WHERE setting_key='calendar_revision'")->fetchColumn();
aslhub_check_calendar_revision($pdo, $revision);
rejects(fn() => aslhub_check_calendar_revision($pdo, $revision - 1), 'stale entry grid cannot write into shifted dates');
rejects(fn() => aslhub_check_calendar_revision($pdo, null), 'pre-update entry grid must reload');
$other = fixture();
$other->exec('INSERT INTO asl_student_block_metrics VALUES (2,2,0,8,10,1)');
rejects(fn() => aslhub_correct_opening_calendar($other, fn() => null), 'saved later block prevents ambiguous remapping');
$other->exec('DELETE FROM asl_student_block_metrics');
$other->exec('INSERT INTO asl_student_block_metrics VALUES (2,1,10,10,10,1)');
rejects(fn() => aslhub_correct_opening_calendar($other, fn() => null), 'out-of-range saved count is never clipped');

// Attendance compares all active students, while the existing class chart stays class-scoped.
$pdo->exec("INSERT INTO users (id,first_name,last_name,is_teacher,teacher,is_active,level,class_period) VALUES
    (5,'Other','Class',0,'parks',1,2,4),(6,'Inactive','Student',0,'parks',0,2,4)");
$pdo->prepare('INSERT INTO asl_student_block_metrics VALUES (3,?,2,NULL,9,1)')->execute([$id]);
$pdo->prepare('INSERT INTO asl_student_block_metrics VALUES (5,?,0,NULL,9,1)')->execute([$id]);
$blocks = [['id' => (int)$id,'instructional_days' => 9,'instructional_days_elapsed' => 9,'participation_max' => 27]];
$student = $pdo->query('SELECT * FROM users WHERE id=2')->fetch();
$metrics = aslhub_block_metric_payload($pdo, $student, $blocks);
verify($metrics['attendance']['absence_percentile'] === [50.0], 'all-class percentile excludes self, ties, teachers and inactive users');
verify($metrics['attendance']['ytd_percent'] === [77.8] && $metrics['attendance']['ytd_absences'] === [2], 'nine-day attendance denominator and days missed');
verify($metrics['attendance']['class_ytd_average_percent'] === [77.8], 'class graph scope preserved');
verify($metrics['participation_metrics']['percent'] === [29.6], 'participation uses three points per school day');
$twoDayBlocks = [['id' => (int)$id, 'instructional_days' => 2, 'instructional_days_elapsed' => 2, 'participation_max' => 999]];
$pdo->prepare('UPDATE asl_student_block_metrics SET participation_points=5 WHERE user_id=2 AND block_id=?')->execute([$id]);
$twoDayMetrics = aslhub_block_metric_payload($pdo, $student, $twoDayBlocks);
verify($twoDayMetrics['participation_metrics']['max_points'] === [6] && $twoDayMetrics['participation_metrics']['percent'] === [83.3],
    'two-day block is six possible points, independently of stale stored maxima');
$weighted = aslhub_metrics_from_rows(2, [
    ['id'=>1,'instructional_days'=>2,'instructional_days_elapsed'=>2],
    ['id'=>2,'instructional_days'=>0,'instructional_days_elapsed'=>0],
    ['id'=>3,'instructional_days'=>10,'instructional_days_elapsed'=>10]],
    [2=>[1=>['absences'=>0,'participation_points'=>0],3=>['absences'=>0,'participation_points'=>30]]],
    [2], [2], aslhub_block_metric_payload($pdo, $student, []));
verify($weighted['participation_metrics']['rolling_4_block_percent'] === [0.0,null,83.3], 'participation trend weights days and skips no-school blocks');
$sparseDays = [['date'=>'2026-09-08'],['date'=>'2026-09-09'],['date'=>'2026-10-05']];
$sparseBlocks = aslhub_calendar_build_blocks($sparseDays);
verify(array_column($sparseBlocks, 'instructional_days') === [2,0,1]
    && array_column($sparseBlocks, 'end_date') === ['2026-09-18','2026-10-02','2026-10-16'], 'two-day and fully closed fortnights retain their fixed Fridays');
$pdo->exec('UPDATE users SET is_active=0 WHERE id IN (3,5)');
verify(aslhub_block_metric_payload($pdo, $student, $blocks)['attendance']['absence_percentile'] === [null], 'no classmates available gives unknown comparison');

$targets = [['id'=>1,'competency'=>'Sentences','title'=>'WH-questions','sub_code'=>'E']];
$events = [
    ['learning_target_id'=>1,'score'=>2,'scored_at'=>'2026-09-18 16:00:00'],
    ['learning_target_id'=>1,'score'=>4,'scored_at'=>'2026-09-21 09:00:00'],
    ['learning_target_id'=>1,'score'=>3,'scored_at'=>'2026-09-21 09:01:00'],
];
$changes = aslhub_report_improvements($events, $targets, '2026-09-18', '2026-09-21');
verify(count($changes) === 1 && $changes[0]['from'] === 2 && $changes[0]['to'] === 3 && $changes[0]['change'] === 1, 'report compares final scores across the corrected boundary');
$events[] = ['learning_target_id'=>1,'score'=>null,'scored_at'=>'2026-09-21 09:02:00'];
verify(aslhub_report_improvements($events, $targets, '2026-09-18', '2026-09-21') === [], 'cleared grades are not improvements');
foreach ([100=>'A',83=>'B',73=>'C',63=>'D',62=>'F'] as $pace=>$grade) verify(aslhub_report_grade($pace) === $grade, "projected $grade matches existing chart threshold");
verify(aslhub_report_grade(null) === null && aslhub_report_grade(82.99) === 'C', 'unknown pace and below-threshold values handled without rounding up');
$payload = ['reporting_blocks'=>[
    ['instructional_days'=>9,'instructional_days_elapsed'=>9,'end_date'=>'2026-09-18'],
    ['instructional_days'=>10,'instructional_days_elapsed'=>1,'end_date'=>'2026-10-02'],
    ['instructional_days'=>156,'instructional_days_elapsed'=>0,'end_date'=>'2027-06-10']],
    'taxonomy'=>[['standards'=>[['name'=>'Sentences','targets'=>$targets]]]], 'scores'=>[1=>1],
    'student'=>[], 'today'=>'2026-09-21', 'attendance'=>['ytd_absences'=>[2,2],'absence_percentile'=>[50,50],'ytd_percent'=>[77.8,80]],
    'participation_metrics'=>['points'=>[24,24,null],'max_points'=>[27,30,null]]];
$summary = aslhub_report_summary($payload);
verify($summary['completion_percent'] === 33.0 && abs($summary['pace_percent'] - 583.3) < .01, 'completion and pacing share the dashboard 3N denominator and elapsed school days');
verify($summary['participation_points'] === 48 && $summary['participation_max'] === 57 && $summary['participation_percent'] === 84.2, 'report sums participation points and denominators, not average percentages');
echo "ALL REPORT AND CALENDAR TESTS PASSED\n";
