<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/teacher_layout.php';
$me = aslhub_require_teacher($pdo);
$filters = ['teacher'=>$me['teacher'], 'period'=>$_GET['period'] ?? 'all', 'level'=>$_GET['level'] ?? 'all'];
$students = aslhub_scoped_students($pdo, $me, $filters);
aslhub_teacher_header($me, 'Student Reports', 'reports');
?>
<form class="filters-bar" method="GET">
    <?php aslhub_class_filter_buttons($filters); ?>
</form>
<div class="rubric-panel">
    <?php if (in_array((string)$filters['period'], ['1','2','3','4','5','6'], true) && $students): ?>
    <a class="form-button" style="display:inline-block;width:auto;text-decoration:none" target="_blank" rel="noopener"
       href="../report.php?<?php echo aslhub_h(http_build_query(['period'=>$filters['period'],'level'=>$filters['level']])); ?>">Print class reports (<?php echo count($students); ?>)</a>
    <p>Opens the class reports together. Choose Print to print them or save them as a PDF.</p>
    <?php else: ?><p>Select a period to print the whole class.</p><?php endif; ?>
    <table class="grading-grid" style="width:100%;margin-top:16px">
        <thead><tr><th>Student</th><th>Period</th><th>ASL level</th><th>Report</th></tr></thead><tbody>
        <?php foreach ($students as $student): ?>
        <tr><td><?php echo aslhub_h($student['last_name'].', '.$student['first_name']); ?></td>
        <td><?php echo (int)$student['class_period']; ?></td><td><?php echo (int)$student['level']; ?></td>
        <td><a target="_blank" rel="noopener" href="../report.php?student_id=<?php echo (int)$student['id']; ?>">Report card</a></td></tr>
        <?php endforeach; ?>
        <?php if (!$students): ?><tr><td colspan="4">No active students match these filters.</td></tr><?php endif; ?>
        </tbody>
    </table>
</div>
<?php aslhub_teacher_footer(); ?>
