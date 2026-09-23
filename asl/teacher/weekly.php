<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/data.php';
require_once dirname(__DIR__) . '/lib/teacher_layout.php';

$me = aslhub_require_teacher($pdo);
$isAdmin = aslhub_is_admin($me);
$csrf = aslhub_csrf_token();
$base = aslhub_base_url();
$metric = ($_GET['metric'] ?? 'participation') === 'attendance' ? 'attendance' : 'participation';
$filters = [
    'teacher' => $_GET['teacher'] ?? ($isAdmin ? $me['teacher'] : null),
    'period' => $_GET['period'] ?? 'all',
    'level' => $_GET['level'] ?? 'all',
];
$students = aslhub_scoped_students($pdo, $me, $filters);
$studentFilter = max(0, (int)($_GET['student_id'] ?? 0));
if ($studentFilter) {
    $students = [aslhub_require_student_scope($pdo, $me, $studentFilter, false)];
}
$allBlocks = aslhub_reporting_blocks($pdo);
$blocks = array_values(array_filter($allBlocks, fn($b) => $b['instructional_days_elapsed'] > 0));
$focusBlockId = null;
foreach ($blocks as $block) if ($block['is_complete']) $focusBlockId = $block['id'];
if ($focusBlockId === null && $blocks) $focusBlockId = $blocks[count($blocks) - 1]['id'];

$rows = [];
if ($students && $blocks) {
    $studentIds = array_map(fn($s) => (int)$s['id'], $students);
    $blockIds = array_column($blocks, 'id');
    $sIn = implode(',', array_fill(0, count($studentIds), '?'));
    $bIn = implode(',', array_fill(0, count($blockIds), '?'));
    $stmt = $pdo->prepare("SELECT * FROM asl_student_block_metrics WHERE user_id IN ($sIn) AND block_id IN ($bIn)");
    $stmt->execute(array_merge($studentIds, $blockIds));
    foreach ($stmt->fetchAll() as $row) $rows[(int)$row['user_id']][(int)$row['block_id']] = $row;
}

aslhub_teacher_header($me, 'Attendance & Participation', 'weekly');
?>
<form class="filters-bar" method="GET" id="block-filters">
    <input type="hidden" name="metric" value="<?php echo aslhub_h($metric); ?>">
    <?php if ($studentFilter): ?><input type="hidden" name="student_id" value="<?php echo $studentFilter; ?>"><?php endif; ?>
    <?php if ($isAdmin): ?>
    <select name="teacher" onchange="this.form.submit()">
        <option value="all" <?php echo $filters['teacher'] === 'all' ? 'selected' : ''; ?>>All teachers</option>
        <?php foreach (aslhub_valid_teachers() as $key => $label): ?>
            <option value="<?php echo $key; ?>" <?php echo $filters['teacher'] === $key ? 'selected' : ''; ?>><?php echo $label; ?></option>
        <?php endforeach; ?>
    </select>
    <?php endif; ?>
    <select name="period" onchange="this.form.submit()">
        <option value="all">All periods</option>
        <?php for ($i=1;$i<=6;$i++): ?><option value="<?php echo $i; ?>" <?php echo (string)$filters['period']===(string)$i?'selected':''; ?>>Period <?php echo $i; ?></option><?php endfor; ?>
    </select>
    <select name="level" onchange="this.form.submit()">
        <option value="all">All levels</option>
        <?php for ($i=1;$i<=3;$i++): ?><option value="<?php echo $i; ?>" <?php echo (string)$filters['level']===(string)$i?'selected':''; ?>>ASL <?php echo $i; ?></option><?php endfor; ?>
    </select>
</form>

<?php if (!$allBlocks): ?>
    <div class="rubric-panel"><h3>No school calendar yet</h3><p class="muted">Upload and apply the shared calendar in Settings before entering attendance or participation.</p></div>
<?php else: ?>
<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 12px;">
    <a class="form-button" style="width:auto;padding:9px 15px;text-decoration:none;<?php echo $metric==='participation'?'':'background:#edf2f7;color:#2d3748;'; ?>" href="?<?php echo http_build_query(array_merge($filters,['metric'=>'participation','student_id'=>$studentFilter ?: null])); ?>">Participation</a>
    <a class="form-button" style="width:auto;padding:9px 15px;text-decoration:none;<?php echo $metric==='attendance'?'':'background:#edf2f7;color:#2d3748;'; ?>" href="?<?php echo http_build_query(array_merge($filters,['metric'=>'attendance','student_id'=>$studentFilter ?: null])); ?>">Attendance</a>
    <span id="save-state" class="muted" aria-live="polite"></span>
</div>

<div class="grading-grid-wrap" id="block-grid-wrap" style="max-height:72vh;overflow:auto;">
<table class="grading-grid" id="block-grid" style="min-width:max-content;">
    <thead><tr><th class="sticky-col">Student</th>
    <?php foreach ($blocks as $block): ?>
        <th id="block-<?php echo $block['id']; ?>" style="min-width:112px;<?php echo $block['id']===$focusBlockId?'background:#ebf8ff;':''; ?>">
            <?php echo aslhub_h('Block '.$block['block_index']); ?><br><small><?php echo aslhub_h($block['month_label']); ?> - <?php echo $block['instructional_days']; ?> days</small><br>
            <small><?php echo date('m/d', strtotime($block['start_date'])); ?> - <?php echo date('m/d', strtotime($block['end_date'])); ?></small>
            <?php if ($block['is_current']): ?><br><small>current - <?php echo $block['instructional_days_elapsed']; ?> days so far</small><?php endif; ?>
        </th>
    <?php endforeach; ?></tr></thead>
    <tbody>
    <?php foreach ($students as $student): $sid=(int)$student['id']; ?>
        <tr data-student="<?php echo $sid; ?>">
            <td class="sticky-col"><?php echo aslhub_h($student['last_name'].', '.$student['first_name']); ?><br><small class="muted">ASL <?php echo (int)$student['level']; ?> · P<?php echo (int)$student['class_period']; ?></small></td>
            <?php foreach ($blocks as $block): $row=$rows[$sid][$block['id']]??null;
                $field=$metric==='attendance'?'absences':'participation_points';
                $value=$row&&$row[$field]!==null?(int)$row[$field]:'';
                $placeholder=$metric==='attendance'?'0':(string)$block['participation_max']; ?>
                <td style="text-align:center;">
                    <input type="number" min="0" data-maximum="<?php echo $metric==='attendance'?$block['instructional_days']:$block['participation_max']; ?>"
                        <?php if ($metric==='attendance'): ?>max="<?php echo $block['instructional_days']; ?>"<?php endif; ?> class="cell-input block-cell" style="width:72px;text-align:center;"
                        data-student-name="<?php echo aslhub_h($student['first_name'].' '.$student['last_name']); ?>" data-student="<?php echo $sid; ?>" data-block="<?php echo $block['id']; ?>"
                        data-version="<?php echo $row?(int)$row['version']:0; ?>"
                        value="<?php echo $value; ?>" placeholder="<?php echo $placeholder; ?>" >
                </td>
            <?php endforeach; ?>
        </tr>
    <?php endforeach; ?>
    </tbody>
</table>
</div>
<div id="participation-warning" role="status" aria-live="polite" hidden></div>
<?php endif; ?>

<script>
const BLOCK_CONFIG = {
    csrf: <?php echo json_encode($csrf); ?>,
    api: <?php echo json_encode($base . '/api/save_block_metrics.php'); ?>,
    field: <?php echo json_encode($metric === 'attendance' ? 'absences' : 'participation_points'); ?>,
    revision: <?php echo (int)$pdo->query("SELECT setting_value FROM asl_settings WHERE setting_key='calendar_revision'")->fetchColumn(); ?>,
    actor: <?php echo (int)$me['id']; ?>
};
</script>
<script src="<?php echo $base; ?>/js/block-metrics.js?v=<?php echo filemtime(dirname(__DIR__).'/js/block-metrics.js'); ?>"></script>
<?php aslhub_teacher_footer(); ?>
