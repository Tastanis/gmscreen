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
$hasCompetencies = !empty($taxonomy[0]['standards'][0]['competency']);
$mode = $_GET['mode'] ?? 'expression';
if (!in_array($mode, ['expression','reception','other'], true)) $mode = 'expression';

$bucketId = $_GET['bucket'] ?? ($taxonomy[0]['bucket_id'] ?? '');
$bucket = null;
foreach ($taxonomy as $b) if ($b['bucket_id'] === $bucketId) $bucket = $b;
if (!$bucket && $taxonomy) { $bucket = $taxonomy[0]; $bucketId = $bucket['bucket_id']; }

$standardId = $_GET['standard'] ?? 'all';
$standards = [];
if ($bucket) {
    foreach ($bucket['standards'] as $s) {
        if ($standardId === 'all' || $s['standard_id'] === $standardId) {
            if ($hasCompetencies) $s['targets'] = array_values(array_filter($s['targets'], fn($t) => $t['sub_code'] === ['expression'=>'E','reception'=>'R','other'=>'S'][$mode]));
            if ($s['targets']) $standards[] = $s;
        }
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

// rubric + wording for every visible target, for the pinned rubric side panel
$targetMeta = [];
foreach ($standards as $s) {
    foreach ($s['targets'] as $t) {
        $targetMeta[(int)$t['id']] = [
            'code' => $hasCompetencies ? ucfirst($mode) : $t['target_code'],
            'title' => $t['title'],
            'description' => $t['description'] ?? '',
            'standard' => $s['name'],
            'rubric' => $t['rubric'] ?: new stdClass(),
        ];
    }
}

aslhub_teacher_header($me, 'Grading', 'grading');
?>
    <form class="filters-bar" method="GET" id="filter-form">
        <?php if ($hasCompetencies): ?>
        <input type="hidden" name="mode" value="<?php echo aslhub_h($mode); ?>">
        <div class="grading-modes" role="group" aria-label="Assessment mode">
        <?php foreach (['expression'=>'Expression','reception'=>'Reception','other'=>'Other'] as $key=>$label): ?>
            <button type="button" aria-pressed="<?php echo $mode === $key ? 'true' : 'false'; ?>" onclick="this.form.mode.value='<?php echo $key; ?>';this.form.standard.value='all';this.form.requestSubmit()"> <?php echo $label; ?> </button>
        <?php endforeach; ?>
        </div>
        <?php endif; ?>
        <select name="level" onchange="this.form.requestSubmit()">
            <?php for ($i = 1; $i <= 3; $i++): ?>
                <option value="<?php echo $i; ?>" <?php echo $level === $i ? 'selected' : ''; ?>>ASL <?php echo $i; ?></option>
            <?php endfor; ?>
        </select>
        <select name="bucket" onchange="this.form.standard.value='all';this.form.requestSubmit()">
            <?php foreach ($taxonomy as $b): ?>
                <option value="<?php echo aslhub_h($b['bucket_id']); ?>" <?php echo $b['bucket_id'] === $bucketId ? 'selected' : ''; ?>>
                    <?php echo aslhub_h($b['name']); ?></option>
            <?php endforeach; ?>
        </select>
        <select name="standard" onchange="this.form.requestSubmit()">
            <option value="all">All competencies</option>
            <?php foreach (($bucket['standards'] ?? []) as $s): ?>
                <option value="<?php echo aslhub_h($s['standard_id']); ?>" <?php echo $standardId === $s['standard_id'] ? 'selected' : ''; ?>>
                    <?php echo aslhub_h($s['name']); ?></option>
            <?php endforeach; ?>
        </select>
        <?php if ($isAdmin): ?>
            <select name="teacher" onchange="this.form.requestSubmit()">
                <option value="all" <?php echo $filters['teacher'] === 'all' ? 'selected' : ''; ?>>All teachers</option>
                <?php foreach (aslhub_valid_teachers() as $key => $label): ?>
                    <option value="<?php echo $key; ?>" <?php echo $filters['teacher'] === $key ? 'selected' : ''; ?>><?php echo $label; ?></option>
                <?php endforeach; ?>
            </select>
        <?php endif; ?>
        <select name="period" onchange="this.form.requestSubmit()">
            <option value="all">All periods</option>
            <?php for ($i = 1; $i <= 6; $i++): ?>
                <option value="<?php echo $i; ?>" <?php echo (string)$filters['period'] === (string)$i ? 'selected' : ''; ?>>Period <?php echo $i; ?></option>
            <?php endfor; ?>
        </select>
        <label for="student-search" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">Find student
        <input type="search" id="student-search" name="student_search" placeholder="Student name" autocomplete="off"
            value="<?php echo aslhub_h(is_string($_GET['student_search'] ?? '') ? ($_GET['student_search'] ?? '') : ''); ?>"></label>
        <span class="muted" style="font-size:.82rem;">Click a cell to cycle blank → available levels → blank. Saves instantly. Right-click to cycle backward.
            Click a skill header to pin its rubric. Click a student to zoom in.</span>
    </form>

    <?php if (!$students): ?>
        <div class="rubric-panel"><p class="muted">No ASL <?php echo $level; ?> students match these filters.</p></div>
    <?php elseif (!$targetIds): ?>
        <div class="rubric-panel"><p class="muted">No skills at this level for that selection.</p></div>
    <?php else: ?>
    <div class="grading-layout">
    <div class="grading-grid-wrap" style="max-height:85vh;overflow-y:auto;">
        <table class="grading-grid">
            <thead>
                <tr>
                    <th class="sticky-col" rowspan="2">Student</th>
                    <?php foreach ($standards as $s): ?><th colspan="<?php echo count($s['targets']); ?>" class="competency-group-head"><?php echo aslhub_h($s['name']); ?></th><?php endforeach; ?>
                </tr>
                <tr>
                    <?php foreach ($standards as $s): foreach ($s['targets'] as $t): ?>
                        <th class="skill-head" data-target="<?php echo (int)$t['id']; ?>"
                            title="<?php echo aslhub_h($t['title'] . ' — click to pin the rubric'); ?>"><?php echo aslhub_h($t['title']); ?></th>
                    <?php endforeach; endforeach; ?>
                </tr>
                <tr class="grading-header-buffer" aria-hidden="true"><th colspan="<?php echo count($targetIds) + 1; ?>"></th></tr>
            </thead>
            <tbody>
                <?php foreach ($students as $st): $sid = (int)$st['id']; ?>
                <tr data-student-row="<?php echo $sid; ?>">
                    <td class="sticky-col"><a class="student-link" href="<?php echo $base; ?>/dashboard.php?student_id=<?php echo $sid; ?>"
                            title="Zoom in on <?php echo aslhub_h($st['first_name']); ?> — browse the standards and grade from the rubrics"><?php
                            echo aslhub_h($st['last_name'] . ', ' . $st['first_name']); ?></a>
                        <span class="muted" style="font-size:.75rem;">P<?php echo (int)$st['class_period']; ?></span></td>
                    <?php foreach ($standards as $s): foreach ($s['targets'] as $t):
                        $sc = $scores[$sid][(int)$t['id']] ?? null; ?>
                        <td class="grade-cell <?php echo $sc === null ? '' : 'score-' . $sc; ?>"
                            data-student="<?php echo $sid; ?>" data-target="<?php echo (int)$t['id']; ?>"
                            data-score="<?php echo $sc === null ? '' : $sc; ?>"
                            style="background:<?php echo $sc === null ? '#f7fafc' : ''; ?>"
                            title="<?php echo aslhub_h($st['first_name'] . ' — ' . $t['title'] . ': ' . ($sc ?? 'not graded')); ?>">
                            <?php echo $sc === null ? '·' : $sc; ?></td>
                    <?php endforeach; endforeach; ?>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <p id="student-search-empty" class="muted" role="status" hidden>No students match that name.</p>
    <aside class="rubric-side" id="rubric-side" hidden>
        <div class="rubric-side-head">
            <strong id="rubric-side-code"></strong>
            <button type="button" class="close-btn" id="rubric-side-close" title="Close rubric">&times;</button>
        </div>
        <h4 id="rubric-side-title"></h4>
        <p id="rubric-side-standard" class="muted" style="font-size:.78rem;margin:0 0 4px;"></p>
        <p id="rubric-side-desc" style="font-size:.85rem;color:#4a5568;margin:0 0 6px;"></p>
        <table class="rubric-table"><tbody id="rubric-side-rows"></tbody></table>
    </aside>
    </div>
    <?php endif; ?>

<script>
const CSRF = '<?php echo $csrf; ?>';
// An explicit zero is a proficiency score, so it shares the red intervention
// color with a 1. An empty cell remains the neutral "not graded" state.
const COLORS = { 0: '#e05252', 1: '#e05252', 2: '#e8b93e', 3: '#4caf6d', 4: '#4a90d9' };
const TARGETS = <?php echo json_encode($targetMeta, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE); ?>;

// Preserve the visible student across full-page competency/mode changes.
const gradingForm = document.getElementById('filter-form');
const studentSearch = document.getElementById('student-search');
const gradingWrap = document.querySelector('.grading-grid-wrap');
if (gradingWrap) {
    gradingWrap.addEventListener('wheel', event => {
        if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.deltaY <= 0) return;
        const header = document.querySelector('.teacher-grading-page > .container > header');
        const remaining = header ? header.getBoundingClientRect().bottom + 20 : 0;
        const available = document.documentElement.scrollHeight - innerHeight - scrollY;
        if (remaining > 0 && available > 0) {
            event.preventDefault();
            const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
            const pageStep = Math.min(delta, remaining, available);
            window.scrollBy(0, pageStep);
            gradingWrap.scrollTop += delta - pageStep;
        }
    }, {passive:false});
}
const studentRows = [...document.querySelectorAll('[data-student-row]')];
const normalizeName = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
function filterStudentNames() {
    const words = normalizeName(studentSearch.value).split(/[\s,]+/).filter(Boolean);
    let visible = 0;
    studentRows.forEach(row => {
        const name = normalizeName(row.querySelector('.student-link').textContent);
        row.hidden = !words.every(word => name.includes(word));
        if (!row.hidden) visible++;
    });
    const empty = document.getElementById('student-search-empty');
    if (empty) empty.hidden = visible !== 0;
}
studentSearch.addEventListener('input', filterStudentNames);
filterStudentNames();
const positionKey = 'asl-grading-position:' + location.pathname;
gradingForm.addEventListener('submit', () => {
    if (!gradingWrap) return;
    const top = gradingWrap.getBoundingClientRect().top + gradingWrap.querySelector('thead').getBoundingClientRect().height;
    const anchor = studentRows.find(row => !row.hidden && row.getBoundingClientRect().bottom > top);
    const destination = new URL(location.href);
    destination.search = new URLSearchParams(new FormData(gradingForm)).toString();
    try {
        sessionStorage.setItem(positionKey, JSON.stringify({
            destination: destination.href, y: window.scrollY,
            student: anchor?.dataset.studentRow,
            offset: anchor ? anchor.getBoundingClientRect().top - top : 0,
            scrollTop: gradingWrap.scrollTop
        }));
    } catch (_) { /* Navigation still works when browser storage is disabled. */ }
});
try {
    const saved = JSON.parse(sessionStorage.getItem(positionKey) || 'null');
    sessionStorage.removeItem(positionKey);
    if (saved?.destination === location.href && gradingWrap) {
        const anchor = studentRows.find(row => !row.hidden && row.dataset.studentRow === saved.student);
        if (anchor) {
            const top = gradingWrap.getBoundingClientRect().top + gradingWrap.querySelector('thead').getBoundingClientRect().height;
            gradingWrap.scrollTop += anchor.getBoundingClientRect().top - top - saved.offset;
        } else gradingWrap.scrollTop = saved.scrollTop;
        window.scrollTo(0, saved.y);
    }
} catch (_) { /* An unavailable or old browser state must not prevent grading. */ }

document.querySelectorAll('.grade-cell').forEach(cell => {
    cell.addEventListener('click', () => cycle(cell, +1));
    cell.addEventListener('contextmenu', e => { e.preventDefault(); cycle(cell, -1); });
});

/* ===== Pinned rubric side panel ===== */
let pinnedTarget = null;

function escapeHtml(v) {
    const d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
}

function openRubric(id) {
    const t = TARGETS[id];
    if (!t) return;
    pinnedTarget = String(id);
    document.getElementById('rubric-side-code').textContent = t.code;
    document.getElementById('rubric-side-title').textContent = t.title;
    document.getElementById('rubric-side-standard').textContent = t.standard;
    document.getElementById('rubric-side-desc').textContent = t.description || '';
    document.getElementById('rubric-side-rows').innerHTML = Object.keys(t.rubric || {}).map(Number).sort((a,b)=>a-b).map(s => `
        <tr><td class="rubric-score" style="background:${COLORS[s]}">${s}</td>
        <td>${escapeHtml((t.rubric || {})[s] || '')}</td></tr>`).join('');
    document.getElementById('rubric-side').hidden = false;
    highlightColumn();
}

function closeRubric() {
    pinnedTarget = null;
    document.getElementById('rubric-side').hidden = true;
    highlightColumn();
}

function highlightColumn() {
    document.querySelectorAll('.skill-head').forEach(th =>
        th.classList.toggle('selected', th.dataset.target === pinnedTarget));
    document.querySelectorAll('.grade-cell').forEach(td =>
        td.classList.toggle('col-selected', td.dataset.target === pinnedTarget));
}

document.querySelectorAll('.skill-head').forEach(th => {
    th.addEventListener('click', () =>
        pinnedTarget === th.dataset.target ? closeRubric() : openRubric(th.dataset.target));
});
document.getElementById('rubric-side-close')?.addEventListener('click', closeRubric);

async function cycle(cell, dir) {
    if (cell.classList.contains('saving')) return;
    const cur = cell.dataset.score === '' ? null : Number(cell.dataset.score);
    const levels = [null, ...Object.keys(TARGETS[cell.dataset.target]?.rubric || {}).map(Number).sort((a,b)=>a-b)];
    if (levels.length === 1) return;
    const position=levels.indexOf(cur);
    const next=position < 0 ? (dir > 0 ? levels[0] : levels.at(-1)) : levels[(position + dir + levels.length) % levels.length];
    cell.classList.add('saving');
    cell.classList.remove('save-error');
    try {
        const body = new URLSearchParams({
            csrf_token: CSRF, student_id: cell.dataset.student, target_id: cell.dataset.target, score: next ?? '',
        });
        const res = await fetch('<?php echo $base; ?>/api/save_score.php', { method: 'POST', body });
        const out = await res.json();
        if (!out.success) throw new Error(out.error || 'save failed');
        cell.dataset.score = next ?? '';
        cell.textContent = next ?? '·';
        cell.className = 'grade-cell' + (next === null ? '' : ' score-' + next) + (cell.dataset.target === pinnedTarget ? ' col-selected' : '');
        cell.style.background = next === null ? '#f7fafc' : COLORS[next];
        cell.title = TARGETS[cell.dataset.target].title + ': ' + (next ?? 'not graded');
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
