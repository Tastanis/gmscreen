<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/data.php';
require_once dirname(__DIR__) . '/lib/teacher_layout.php';

$me = aslhub_require_teacher($pdo);
$isAdmin = aslhub_is_admin($me);
$csrf = aslhub_csrf_token();
$base = aslhub_base_url();

$level = max(1, min(3, (int)($_GET['level'] ?? 1)));
$taxonomy = aslhub_taxonomy($pdo, $level);

$bucketId = $_GET['bucket'] ?? ($taxonomy[0]['bucket_id'] ?? '');
$bucket = null;
foreach ($taxonomy as $b) if ($b['bucket_id'] === $bucketId) $bucket = $b;
if (!$bucket && $taxonomy) { $bucket = $taxonomy[0]; $bucketId = $bucket['bucket_id']; }

$standardId = $_GET['standard'] ?? 'all';
$standards = [];
if ($bucket) {
    foreach ($bucket['standards'] as $s) {
        if ($standardId === 'all' || $s['standard_id'] === $standardId) $standards[] = $s;
    }
}

$filters = [
    'teacher' => $_GET['teacher'] ?? ($isAdmin ? $me['teacher'] : null),
    'period' => $_GET['period'] ?? 'all',
    'level' => (string)$level,
];
$students = aslhub_scoped_students($pdo, $me, $filters);

// current scores for these students on visible targets
$targetIds = [];
foreach ($standards as $s) foreach ($s['targets'] as $t) $targetIds[] = (int)$t['id'];
$scores = [];
if ($students && $targetIds) {
    $sIn = implode(',', array_map(fn($s) => (int)$s['id'], $students));
    $tIn = implode(',', $targetIds);
    foreach ($pdo->query("SELECT user_id, learning_target_id, score FROM user_learning_targets
            WHERE user_id IN ($sIn) AND learning_target_id IN ($tIn) AND score IS NOT NULL") as $r) {
        $scores[(int)$r['user_id']][(int)$r['learning_target_id']] = (int)$r['score'];
    }
}

aslhub_teacher_header($me, 'Grading', 'grading');
?>
    <form class="filters-bar" method="GET" id="filter-form">
        <select name="level" onchange="this.form.submit()">
            <?php for ($i = 1; $i <= 3; $i++): ?>
                <option value="<?php echo $i; ?>" <?php echo $level === $i ? 'selected' : ''; ?>>ASL <?php echo $i; ?></option>
            <?php endfor; ?>
        </select>
        <select name="bucket" onchange="this.form.standard.value='all';this.form.submit()">
            <?php foreach ($taxonomy as $b): ?>
                <option value="<?php echo aslhub_h($b['bucket_id']); ?>" <?php echo $b['bucket_id'] === $bucketId ? 'selected' : ''; ?>>
                    <?php echo aslhub_h($b['code'] . ' — ' . $b['name']); ?></option>
            <?php endforeach; ?>
        </select>
        <select name="standard" onchange="this.form.submit()">
            <option value="all">Whole bucket</option>
            <?php foreach (($bucket['standards'] ?? []) as $s): ?>
                <option value="<?php echo aslhub_h($s['standard_id']); ?>" <?php echo $standardId === $s['standard_id'] ? 'selected' : ''; ?>>
                    <?php echo aslhub_h($s['standard_id'] . ' — ' . $s['name']); ?></option>
            <?php endforeach; ?>
        </select>
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
        <span class="muted" style="font-size:.82rem;">Click a cell to cycle 0 → 1 → 2 → 3 → 4. Saves instantly.</span>
    </form>

    <?php if (!$students): ?>
        <div class="rubric-panel"><p class="muted">No ASL <?php echo $level; ?> students match these filters.</p></div>
    <?php elseif (!$targetIds): ?>
        <div class="rubric-panel"><p class="muted">No skills at this level for that selection.</p></div>
    <?php else: ?>
    <div class="grading-grid-wrap" style="max-height:70vh;overflow-y:auto;">
        <table class="grading-grid">
            <thead>
                <tr>
                    <th class="sticky-col">Student</th>
                    <?php foreach ($standards as $s): foreach ($s['targets'] as $t): ?>
                        <th title="<?php echo aslhub_h($t['title']); ?>"><?php echo aslhub_h($t['target_code']); ?></th>
                    <?php endforeach; endforeach; ?>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($students as $st): $sid = (int)$st['id']; ?>
                <tr>
                    <td class="sticky-col"><?php echo aslhub_h($st['last_name'] . ', ' . $st['first_name']); ?>
                        <span class="muted" style="font-size:.75rem;">P<?php echo (int)$st['class_period']; ?></span></td>
                    <?php foreach ($standards as $s): foreach ($s['targets'] as $t):
                        $sc = $scores[$sid][(int)$t['id']] ?? null; ?>
                        <td class="grade-cell <?php echo $sc === null ? '' : 'score-' . $sc; ?>"
                            data-student="<?php echo $sid; ?>" data-target="<?php echo (int)$t['id']; ?>"
                            data-score="<?php echo $sc === null ? '' : $sc; ?>"
                            style="background:<?php echo $sc === null ? '#f7fafc' : ''; ?>"
                            title="<?php echo aslhub_h($st['first_name'] . ' — ' . $t['target_code'] . ': ' . ($sc ?? 'not graded')); ?>">
                            <?php echo $sc === null ? '·' : $sc; ?></td>
                    <?php endforeach; endforeach; ?>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <?php endif; ?>

<script>
const CSRF = '<?php echo $csrf; ?>';
const COLORS = { 0: '#9aa2ad', 1: '#e05252', 2: '#e8b93e', 3: '#4caf6d', 4: '#4a90d9' };

document.querySelectorAll('.grade-cell').forEach(cell => {
    cell.addEventListener('click', () => cycle(cell, +1));
    cell.addEventListener('contextmenu', e => { e.preventDefault(); cycle(cell, -1); });
});

async function cycle(cell, dir) {
    if (cell.classList.contains('saving')) return;
    const cur = cell.dataset.score === '' ? null : Number(cell.dataset.score);
    let next = cur === null ? (dir > 0 ? 0 : 4) : (cur + dir + 5) % 5;
    cell.classList.add('saving');
    cell.classList.remove('save-error');
    try {
        const body = new URLSearchParams({
            csrf_token: CSRF, student_id: cell.dataset.student, target_id: cell.dataset.target, score: next,
        });
        const res = await fetch('<?php echo $base; ?>/api/save_score.php', { method: 'POST', body });
        const out = await res.json();
        if (!out.success) throw new Error(out.error || 'save failed');
        cell.dataset.score = next;
        cell.textContent = next;
        cell.className = 'grade-cell score-' + next;
        cell.style.background = COLORS[next];
    } catch (err) {
        cell.classList.add('save-error');
        cell.title = 'SAVE FAILED — click to retry. ' + err.message;
    } finally {
        cell.classList.remove('saving');
    }
}

// Paint initial colors
document.querySelectorAll('.grade-cell').forEach(c => {
    if (c.dataset.score !== '') c.style.background = COLORS[Number(c.dataset.score)];
});
</script>
<?php aslhub_teacher_footer(); ?>
