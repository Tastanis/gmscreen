<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/data.php';
require_once dirname(__DIR__) . '/lib/teacher_layout.php';
require_once dirname(__DIR__) . '/lib/competencies.php';

$me = aslhub_require_teacher($pdo);
$isAdmin = aslhub_is_admin($me);

$filters = [
    'teacher' => $me['teacher'],
    'period' => $_GET['period'] ?? 'all',
    'level' => $_GET['level'] ?? 'all',
    'include_inactive' => !empty($_GET['inactive']),
];
$students = aslhub_scoped_students($pdo, $me, $filters);
$ready = aslhub_ready_for_review($pdo, $students);

// quick stats per student: total points + last graded date
$points = [];
$lastGraded = [];
if ($students) {
    $ids = implode(',', array_map(fn($s) => (int)$s['id'], $students));
    foreach ($pdo->query("SELECT u.user_id, SUM(CASE WHEN u.score > 1 THEN u.score - 1 ELSE 0 END) AS pts
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
    <?php if ($isAdmin && !aslhub_competencies_installed($pdo)): ?>
    <button type="button" id="import-competencies" class="form-button" style="width:auto">Import competencies</button>
    <script>
    document.getElementById('import-competencies').addEventListener('click', async function () {
        this.disabled=true;
        try {
            const response=await fetch('../api/import_competencies.php',{method:'POST',body:new URLSearchParams({csrf_token:<?php echo json_encode(aslhub_csrf_token()); ?>})});
            const result=await response.json();
            if (!result.success) throw new Error(result.error || 'Import failed.');
            this.remove();
        } catch (e) { alert(e.message); this.disabled=false; }
    });
    </script>
    <?php endif; ?>
    <form class="filters-bar" method="GET">
<?php aslhub_class_filter_buttons($filters); ?>
        <label style="font-size:.85rem;color:#4a5568;"><input type="checkbox" name="inactive" value="1" <?php echo $filters['include_inactive'] ? 'checked' : ''; ?>> show deactivated</label>
        <noscript><button type="submit">Filter</button></noscript>
        <input type="search" id="name-search" name="q" aria-label="Search students by name" placeholder="Search students by name…" value="<?php echo aslhub_h((string)($_GET['q'] ?? '')); ?>" style="margin-left:auto;">
        <span class="pill" id="roster-count" aria-live="polite"><?php echo count($students); ?> students</span>
    </form>

    <details class="rubric-panel" id="ready-for-review" style="margin-bottom:18px;" <?php echo $ready ? 'open' : ''; ?>>
        <summary style="cursor:pointer;font-weight:700;">Ready for review <span class="pill" id="ready-count"><?php echo count($ready); ?></span></summary>
        <div style="overflow-x:auto;margin-top:12px;">
        <table class="grading-grid" style="width:100%;">
            <thead><tr><th>Student</th><th>Skill</th><th>Student</th><th>Teacher</th><th></th></tr></thead>
            <tbody>
            <?php foreach ($ready as $r): ?>
                <tr data-name="<?php echo aslhub_h(mb_strtolower($r['first_name'].' '.$r['last_name'])); ?>">
                    <td><?php echo aslhub_h($r['last_name'].', '.$r['first_name']); ?></td>
                    <td><?php echo aslhub_h($r['competency']); ?><br><span class="muted"><?php echo aslhub_h($r['title'].($r['sub_code']==='S' ? '' : ' · '.($r['sub_code']==='E' ? 'Expression' : 'Reception'))); ?></span></td>
                    <td><?php echo (int)$r['student_score']; ?></td><td><?php echo (int)$r['teacher_score']; ?></td>
                    <td><a class="pill" href="<?php echo aslhub_h(aslhub_base_url()); ?>/dashboard.php?student_id=<?php echo (int)$r['user_id']; ?>&amp;target_id=<?php echo (int)$r['learning_target_id']; ?>">Review →</a></td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
        </div>
    </details>

    <div class="grading-grid-wrap">
        <table class="grading-grid" id="roster-table" style="width:100%;">
            <thead>
                <tr>
                    <th class="sticky-col">Student</th>
                    <th>Level</th><th>Period</th><th>Teacher</th>
                    <th>Growth points</th><th>Last graded</th><th>Status</th><th></th>
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
const rosterForm = document.querySelector('.filters-bar');
rosterForm.querySelectorAll('select, input[type="checkbox"]').forEach(input => input.addEventListener('change', () => rosterForm.requestSubmit()));
function filterRoster() {
    const words = document.getElementById('name-search').value.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
    let count = 0;
    document.querySelectorAll('#roster-table tbody tr[data-name]').forEach(tr => {
        const match = words.every(word => tr.dataset.name.includes(word));
        tr.hidden = !match;
        if (match) count++;
    });
    document.getElementById('roster-count').textContent = count+(count === 1 ? ' student' : ' students');
    let readyCount = 0;
    document.querySelectorAll('#ready-for-review tbody tr').forEach(tr => {
        tr.hidden = !words.every(word => tr.dataset.name.includes(word));
        if (!tr.hidden) readyCount++;
    });
    document.getElementById('ready-count').textContent = readyCount;
}
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
document.getElementById('name-search').addEventListener('input', filterRoster);
filterRoster();
</script>
<?php aslhub_teacher_footer(); ?>
