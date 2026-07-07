<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/data.php';
require_once dirname(__DIR__) . '/lib/teacher_layout.php';

$me = aslhub_require_teacher($pdo);
$isAdmin = aslhub_is_admin($me);
$csrf = aslhub_csrf_token();
$base = aslhub_base_url();

$week = aslhub_week_start($_GET['week'] ?? date('Y-m-d'));
$filters = [
    'teacher' => $_GET['teacher'] ?? ($isAdmin ? $me['teacher'] : null),
    'period' => $_GET['period'] ?? 'all',
    'level' => $_GET['level'] ?? 'all',
];
$students = aslhub_scoped_students($pdo, $me, $filters);

$rows = [];
if ($students) {
    $ids = implode(',', array_map(fn($s) => (int)$s['id'], $students));
    $stmt = $pdo->prepare("SELECT * FROM asl_student_meetings WHERE meeting_date = ? AND user_id IN ($ids)");
    $stmt->execute([$week]);
    foreach ($stmt->fetchAll() as $r) $rows[(int)$r['user_id']] = $r;
}

aslhub_teacher_header($me, 'Weekly Log', 'weekly');
?>
    <form class="filters-bar" method="GET">
        <label style="font-size:.85rem;color:#4a5568;">Week of
            <input type="date" name="week" value="<?php echo $week; ?>" onchange="this.form.submit()"></label>
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
            <?php for ($i = 1; $i <= 6; $i++): ?>
                <option value="<?php echo $i; ?>" <?php echo (string)$filters['period'] === (string)$i ? 'selected' : ''; ?>>Period <?php echo $i; ?></option>
            <?php endfor; ?>
        </select>
        <select name="level" onchange="this.form.submit()">
            <option value="all">All levels</option>
            <?php for ($i = 1; $i <= 3; $i++): ?>
                <option value="<?php echo $i; ?>" <?php echo (string)$filters['level'] === (string)$i ? 'selected' : ''; ?>>ASL <?php echo $i; ?></option>
            <?php endfor; ?>
        </select>
        <span class="muted" style="font-size:.82rem;">Dates snap to the Monday of the chosen week. Fields save when you leave them.</span>
    </form>

    <div class="grading-grid-wrap">
        <table class="grading-grid" style="width:100%;">
            <thead><tr>
                <th class="sticky-col">Student</th>
                <th>Absences this week</th>
                <th>Participation points</th>
                <th>Note</th>
                <th></th>
            </tr></thead>
            <tbody>
            <?php if (!$students): ?>
                <tr><td colspan="5" class="muted" style="padding:20px;">No students match these filters.</td></tr>
            <?php endif; ?>
            <?php foreach ($students as $st): $sid = (int)$st['id']; $r = $rows[$sid] ?? null; ?>
                <tr data-student="<?php echo $sid; ?>">
                    <td class="sticky-col"><?php echo aslhub_h($st['last_name'] . ', ' . $st['first_name']); ?>
                        <span class="muted" style="font-size:.75rem;">ASL <?php echo (int)$st['level']; ?> · P<?php echo (int)$st['class_period']; ?></span></td>
                    <td><input type="number" min="0" max="7" class="cell-input" data-field="absences"
                        value="<?php echo $r !== null ? (int)$r['absences'] : ''; ?>" placeholder="0"></td>
                    <td><input type="number" min="0" class="cell-input" data-field="participation_points"
                        value="<?php echo ($r !== null && $r['participation_points'] !== null) ? (int)$r['participation_points'] : ''; ?>" placeholder="—"></td>
                    <td><input type="text" class="cell-input cell-note" data-field="notes"
                        value="<?php echo aslhub_h($r['notes'] ?? ''); ?>" placeholder="optional note"></td>
                    <td class="save-state muted" style="font-size:.78rem;"></td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>

<script>
const CSRF = '<?php echo $csrf; ?>';
const WEEK = '<?php echo $week; ?>';

document.querySelectorAll('tr[data-student] .cell-input').forEach(input => {
    input.dataset.initial = input.value;
    input.addEventListener('change', () => save(input));
});

async function save(input, confirmBlank = false) {
    const tr = input.closest('tr');
    const state = tr.querySelector('.save-state');
    if (input.value === input.dataset.initial && !confirmBlank) return;
    state.textContent = 'saving…';
    const data = { csrf_token: CSRF, student_id: tr.dataset.student, week: WEEK };
    data[input.dataset.field] = input.value;
    if (confirmBlank) data.confirm_blank = 1;
    try {
        const res = await fetch('<?php echo $base; ?>/api/save_week.php', { method: 'POST', body: new URLSearchParams(data) });
        const out = await res.json();
        if (out.needs_confirm) {
            if (confirm('This will erase an existing note for this student. Really clear it?')) {
                return save(input, true);
            }
            input.value = input.dataset.initial;
            state.textContent = '';
            return;
        }
        if (!out.success) throw new Error(out.error || 'failed');
        input.dataset.initial = input.value;
        state.textContent = '✓ saved';
        state.style.color = '#2f855a';
        setTimeout(() => { state.textContent = ''; }, 2000);
    } catch (err) {
        state.textContent = '✗ ' + err.message;
        state.style.color = '#c53030';
    }
}
</script>
<?php aslhub_teacher_footer(); ?>
