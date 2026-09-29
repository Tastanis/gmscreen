<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/report.php';
$me = aslhub_require_teacher($pdo);
require_once __DIR__ . '/lib/teacher_layout.php';
header('Cache-Control: no-store, private');
if (isset($_GET['student_id'])) {
    $subjects = [aslhub_require_student_scope($pdo, $me, (int)$_GET['student_id'], false)];
} else {
    $period = (string)($_GET['period'] ?? '');
    $level = (string)($_GET['level'] ?? 'all');
    if (!in_array($period, ['1','2','3','4','5','6'], true) || !in_array($level, ['all','1','2','3'], true)) {
        http_response_code(400);
        exit('Choose a class period from the Reports tab.');
    }
    $subjects = aslhub_scoped_students($pdo, $me, ['teacher'=>$me['teacher'], 'period'=>$period, 'level'=>$level]);
}
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ASL Report Cards</title>
    <link rel="stylesheet" href="css/report.css?v=<?php echo filemtime(__DIR__ . '/css/report.css'); ?>">
    <script src="js/dashboard-chart-math.js?v=<?php echo filemtime(__DIR__ . '/js/dashboard-chart-math.js'); ?>" defer></script>
    <script src="js/pace-chart.js?v=<?php echo filemtime(__DIR__ . '/js/pace-chart.js'); ?>" defer></script>
    <script src="js/report.js?v=<?php echo filemtime(__DIR__ . '/js/report.js'); ?>" defer></script>
</head>
<body>
<nav class="report-actions"><button type="button" onclick="window.print()">Print</button></nav>
<?php if (!$subjects): ?><p class="report-actions">No active students match this class.</p><?php endif; ?>
<?php foreach ($subjects as $subject):
    $payload = aslhub_dashboard_payload($pdo, $subject);
    $report = aslhub_student_report($pdo, $payload);
    require __DIR__ . '/lib/report_sheet.php';
endforeach; ?>
</body>
</html>
