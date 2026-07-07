<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/data.php';
require_once dirname(__DIR__) . '/lib/teacher_layout.php';

$me = aslhub_require_teacher($pdo);
$isAdmin = aslhub_is_admin($me);

$filters = [
    'teacher' => $_GET['teacher'] ?? ($isAdmin ? $me['teacher'] : null),
    'period' => $_GET['period'] ?? 'all',
    'level' => $_GET['level'] ?? 'all',
    'include_inactive' => !empty($_GET['inactive']),
];
$students = aslhub_scoped_students($pdo, $me, $filters);

// quick stats per student: total points + last graded date
$points = [];
$lastGraded = [];
if ($students) {
    $ids = implode(',', array_map(fn($s) => (int)$s['id'], $students));
    foreach ($pdo->query("SELECT u.user_id, SUM(u.score) AS pts
            FROM user_learning_targets u
            JOIN asl_learning_targets t ON t.id = u.learning_target_id AND t.active = 1
            JOIN users s ON s.id = u.user_id AND t.asl_level = s.level
            WHERE u.user_id IN ($ids) GROUP BY u.user_id") as $r) {
        $points[(int)$r['user_id']] = (int)$r['pts'];
    }
    foreach ($pdo->query("SELECT user_id, MAX(scored_at) AS last FROM user_learning_target_score_history
            WHERE user_id IN ($ids) GROUP BY user_id") as $r) {
        $lastGraded[(int)$r['user_id']] = $r['last'];
    }
}

aslhub_teacher_header($me, 'ASL Roster', 'dashboard');
?>
    <form class="filters-bar" method="GET">
        <?php if ($isAdmin): ?>
            <select name="teacher">
                <option value="all" <?php echo $filters['teacher'] === 'all' ? 'selected' : ''; ?>>All teachers</option>
                <?php foreach (aslhub_valid_teachers() as $key => $label): ?>
                    <option value="<?php echo $key; ?>" <?php echo $filters['teacher'] === $key ? 'selected' : ''; ?>><?php echo $label; ?></option>
                <?php endforeach; ?>
            </select>
        <?php endif; ?>
        <select name="period">
            <option value="all">All periods</option>
            <?php for ($i = 1; $i <= 6; $i++): ?>
                <option value="<?php echo $i; ?>" <?php echo (string)$filters['period'] === (string)$i ? 'selected' : ''; ?>>Period <?php echo $i; ?></option>
            <?php endfor; ?>
        </select>
        <select name="level">
            <option value="all">All levels</option>
            <?php for ($i = 1; $i <= 3; $i++): ?>
                <option value="<?php echo $i; ?>" <?php echo (string)$filters['level'] === (string)$i ? 'selected' : ''; ?>>ASL <?php echo $i; ?></option>
            <?php endfor; ?>
        </select>
        <label style="font-size:.85rem;color:#4a5568;"><input type="checkbox" name="inactive" value="1" <?php echo $filters['include_inactive'] ? 'checked' : ''; ?>> show deactivated</label>
        <button type="submit" class="form-button" style="width:auto;padding:8px 18px;margin:0;">Filter</button>
        <input type="text" id="name-search" placeholder="Search name..." style="margin-left:auto;">
        <span class="pill"><?php echo count($students); ?> students</span>
    </form>

    <div class="grading-grid-wrap">
        <table class="grading-grid" id="roster-table" style="width:100%;">
            <thead>
                <tr>
                    <th class="sticky-col">Student</th>
                    <th>Level</th><th>Period</th><th>Teacher</th>
                    <th>Points</th><th>Last graded</th><th>Status</th><th></th>
                </tr>
            </thead>
            <tbody>
                <?php if (!$students): ?>
                    <tr><td colspan="8" class="muted" style="padding:20px;">No students match. New accounts appear here as soon as students sign up.</td></tr>
                <?php endif; ?>
                <?php foreach ($students as $s): $sid = (int)$s['id']; ?>
                <tr data-name="<?php echo aslhub_h(mb_strtolower($s['first_name'] . ' ' . $s['last_name'])); ?>">
                    <td class="sticky-col"><strong><?php echo aslhub_h($s['last_name'] . ', ' . $s['first_name']); ?></strong><br>
                        <span class="muted" style="font-size:.78rem;"><?php echo aslhub_h($s['email']); ?></span></td>
                    <td>ASL <?php echo (int)$s['level']; ?></td>
                    <td><?php echo $s['class_period'] ? 'P' . (int)$s['class_period'] : '—'; ?></td>
                    <td><?php echo aslhub_h(aslhub_valid_teachers()[$s['teacher']] ?? '—'); ?></td>
                    <td><strong><?php echo $points[$sid] ?? 0; ?></strong></td>
                    <td class="muted"><?php echo isset($lastGraded[$sid]) ? aslhub_h(date('M j', strtotime($lastGraded[$sid]))) : 'never'; ?></td>
                    <td><?php echo (int)$s['is_active'] ? '<span class="pill" style="background:#eaf7ef;color:#2f855a;">active</span>' : '<span class="pill" style="background:#fdeaea;color:#c53030;">deactivated</span>'; ?></td>
                    <td><a href="student.php?id=<?php echo $sid; ?>" class="pill" style="text-decoration:none;">Open →</a></td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>

<script>
document.getElementById('name-search').addEventListener('input', function () {
    const q = this.value.trim().toLowerCase();
    document.querySelectorAll('#roster-table tbody tr[data-name]').forEach(tr => {
        tr.style.display = !q || tr.dataset.name.includes(q) ? '' : 'none';
    });
});
</script>
<?php aslhub_teacher_footer(); ?>
