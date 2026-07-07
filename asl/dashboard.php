<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/data.php';

$me = aslhub_require_login($pdo);
$viewingAsTeacher = false;
$subject = $me;

if (!empty($me['is_teacher'])) {
    // Teachers may view a student's dashboard exactly as the student sees it.
    $studentId = (int)($_GET['student_id'] ?? 0);
    if (!$studentId) {
        header('Location: teacher/dashboard.php');
        exit;
    }
    $subject = aslhub_require_student_scope($pdo, $me, $studentId, false);
    $viewingAsTeacher = true;
}

$payload = aslhub_dashboard_payload($pdo, $subject);
$csrf = aslhub_csrf_token();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ASL Hub - My Dashboard</title>
    <link rel="stylesheet" href="css/asl-style.css">
    <link rel="stylesheet" href="css/hub.css">
    <script src="js/vendor/chart.umd.js"></script>
</head>
<body>
<div class="container">
    <?php if ($viewingAsTeacher): ?>
        <div style="background:#fdf6e3;border:2px solid #e8b93e;border-radius:10px;padding:10px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <strong>Teacher view:</strong> you are seeing this dashboard exactly as
            <?php echo aslhub_h($subject['first_name'] . ' ' . $subject['last_name']); ?> sees it.
            <span>
                <a href="teacher/student.php?id=<?php echo (int)$subject['id']; ?>" class="pill" style="text-decoration:none;">Manage student</a>
                <a href="teacher/dashboard.php" class="pill" style="text-decoration:none;">&larr; Roster</a>
            </span>
        </div>
    <?php endif; ?>
    <header>
        <h1>ASL Hub</h1>
        <div class="user-info">
            <span class="pill">ASL <?php echo (int)$payload['student']['level']; ?></span>
            <span><?php echo aslhub_h($subject['first_name'] . ' ' . $subject['last_name']); ?></span>
            <?php if (!$viewingAsTeacher): ?><a href="logout.php" class="back-btn">Logout</a><?php endif; ?>
        </div>
    </header>

    <!-- ===== Progress Over Time ===== -->
    <section class="dashboard-section" style="background:rgba(255,255,255,.95);border-radius:15px;padding:24px;margin-bottom:20px;">
        <h2 id="chart-heading" style="color:#2d3748;">Progress Over Time</h2>
        <p class="muted" style="font-size:.9rem;margin:4px 0 12px;">
            Every step you move up on any skill earns a point. Stay at or above the
            <strong style="color:var(--score-3)">green line</strong> to be on track for proficient (3s) by the end of the year.
        </p>
        <div style="position:relative;height:340px;">
            <canvas id="progressChart"></canvas>
        </div>
        <div class="chart-legend">
            <span class="lg"><span class="swatch" style="background:#667eea;"></span> You</span>
            <span class="lg"><span class="swatch" style="background:var(--score-3);"></span> On-track pace (all 3s)</span>
            <span class="lg"><span class="swatch" style="background:var(--score-4);"></span> Reaching-for-4s pace</span>
            <span class="lg"><span class="swatch" style="background:var(--score-1);"></span> Failing pace (all 2s)</span>
        </div>

        <div class="overlay-cards">
            <button type="button" class="overlay-card" id="card-attendance">
                <div class="oc-label">Attendance</div>
                <div class="oc-value" id="attendance-value">&ndash;</div>
                <div class="oc-meta">absences total &middot; click to show on graph</div>
            </button>
            <button type="button" class="overlay-card" id="card-participation">
                <div class="oc-label">Participation</div>
                <div class="oc-value" id="participation-value">&ndash;</div>
                <div class="oc-meta">points this week &middot; click to show on graph</div>
            </button>
            <button type="button" class="overlay-card" id="card-notes">
                <div class="oc-label">Notes</div>
                <div class="oc-value" id="notes-value">&ndash;</div>
                <div class="oc-meta">click to read your notes</div>
            </button>
        </div>
    </section>

    <!-- ===== Skills ===== -->
    <section class="dashboard-section">
        <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:12px;">
            <h2 style="color:#2d3748;">My Skills</h2>
            <span id="skills-breadcrumb" style="color:#718096;font-size:.9rem;"></span>
        </div>
        <div id="bucket-view" class="bucket-grid"></div>

        <div id="detail-view" style="display:none;grid-template-columns:340px 1fr;gap:18px;align-items:start;">
            <div>
                <button type="button" class="back-btn" id="back-to-buckets" style="margin-bottom:12px;">&larr; All Skills</button>
                <div id="standards-list"></div>
            </div>
            <div id="right-panel" class="rubric-panel">
                <p class="muted">Select a standard on the left to see its proficiency rubric.</p>
            </div>
        </div>
    </section>

    <div class="version-footer" style="text-align:right;color:#a0aec0;font-size:.75rem;padding:10px 0;">
        ASL Hub
    </div>
</div>

<!-- Notes modal -->
<div id="notesModal" class="modal">
    <div class="modal-content" style="max-width:640px;">
        <div class="modal-header">
            <h2>My Notes</h2>
            <button class="close-btn" onclick="closeNotes()">&times;</button>
        </div>
        <div id="notes-body"></div>
    </div>
</div>

<script>
const DATA = <?php echo json_encode($payload, JSON_UNESCAPED_UNICODE); ?>;
const SCORE_COLORS = { 0: '#9aa2ad', 1: '#e05252', 2: '#e8b93e', 3: '#4caf6d', 4: '#4a90d9' };

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function scoreOf(targetId) {
    const s = DATA.scores && DATA.scores[String(targetId)];
    return (s === undefined || s === null) ? null : Number(s);
}
function weekLabel(iso) {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ===================== Chart ===================== */

function paceSeries(goal) {
    const n = DATA.weeks.length;
    const total = DATA.target_count * goal;
    if (n < 3) return DATA.weeks.map(() => null);
    const slope = total / (n - 2); // starts week 2 (index 1), ends last week
    return DATA.weeks.map((w, i) => (i === 0 ? null : +(slope * (i - 1)).toFixed(2)));
}

// Only draw the student's line up to the current week
function studentSeries() {
    const today = new Date().toISOString().slice(0, 10);
    return DATA.weeks.map((w, i) => (w <= today ? DATA.progress[i] : null));
}

let chart;
const overlayState = { attendance: false, participation: false };

function buildDatasets() {
    const ds = [
        { label: 'You', data: studentSeries(), borderColor: '#667eea', backgroundColor: '#667eea',
          borderWidth: 3, pointRadius: 2, tension: .25, yAxisID: 'y', spanGaps: true },
        { label: 'On-track pace (all 3s)', data: paceSeries(DATA.settings.pace_green_goal), borderColor: SCORE_COLORS[3],
          borderWidth: 2, pointRadius: 0, borderDash: [], yAxisID: 'y', spanGaps: false },
        { label: 'Reaching-for-4s pace', data: paceSeries(DATA.settings.pace_blue_goal), borderColor: SCORE_COLORS[4],
          borderWidth: 2, pointRadius: 0, borderDash: [6, 4], yAxisID: 'y' },
        { label: 'Failing pace (all 2s)', data: paceSeries(DATA.settings.pace_red_goal), borderColor: SCORE_COLORS[1],
          borderWidth: 2, pointRadius: 0, borderDash: [3, 4], yAxisID: 'y' },
    ];
    if (overlayState.attendance) {
        ds.push({ label: 'Absences / week', data: DATA.absences, borderColor: '#f6993f', backgroundColor: '#f6993f',
            borderWidth: 2, pointRadius: 3, stepped: false, yAxisID: 'y2', spanGaps: true });
    }
    if (overlayState.participation) {
        ds.push({ label: 'Participation points / week', data: DATA.participation, borderColor: '#9f7aea', backgroundColor: '#9f7aea',
            borderWidth: 2, pointRadius: 3, yAxisID: 'y2', spanGaps: true });
    }
    return ds;
}

function renderChart() {
    const showY2 = overlayState.attendance || overlayState.participation;
    const cfg = {
        type: 'line',
        data: { labels: DATA.weeks.map(weekLabel), datasets: buildDatasets() },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { maxTicksLimit: 12 } },
                y: { beginAtZero: true, title: { display: true, text: 'Progress points' },
                     suggestedMax: DATA.target_count * 4 },
                y2: { display: showY2, position: 'right', beginAtZero: true,
                      grid: { drawOnChartArea: false },
                      title: { display: true, text: 'Absences / Participation per week' } },
            },
        },
    };
    if (chart) { chart.destroy(); }
    chart = new Chart(document.getElementById('progressChart'), cfg);
}

/* ============ Overlay cards ============ */

function setupCards() {
    const meetings = DATA.meetings || [];
    const totalAbs = meetings.reduce((a, m) => a + (Number(m.absences) || 0), 0);
    document.getElementById('attendance-value').textContent = totalAbs;
    const latest = meetings.find(m => m.participation_points !== null && m.participation_points !== undefined);
    document.getElementById('participation-value').textContent = latest ? latest.participation_points : '–';
    const noteCount = meetings.filter(m => m.notes && m.notes.trim()).length;
    document.getElementById('notes-value').textContent = noteCount;

    document.getElementById('card-attendance').addEventListener('click', function () {
        overlayState.attendance = !overlayState.attendance;
        this.classList.toggle('active', overlayState.attendance);
        renderChart();
    });
    document.getElementById('card-participation').addEventListener('click', function () {
        overlayState.participation = !overlayState.participation;
        this.classList.toggle('active', overlayState.participation);
        renderChart();
    });
    document.getElementById('card-notes').addEventListener('click', openNotes);
}

function openNotes() {
    const withNotes = (DATA.meetings || []).filter(m => m.notes && m.notes.trim());
    const body = document.getElementById('notes-body');
    if (!withNotes.length) {
        body.innerHTML = '<p class="muted">No notes yet.</p>';
    } else {
        const byMonth = {};
        withNotes.forEach(m => {
            const d = new Date(m.meeting_date + 'T12:00:00');
            const key = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
            (byMonth[key] = byMonth[key] || []).push(m);
        });
        body.innerHTML = Object.entries(byMonth).map(([month, notes]) => `
            <div class="notes-month">
                <h4>${esc(month)}</h4>
                ${notes.map(m => `
                    <div class="note-entry">
                        <div class="note-date">Week of ${esc(weekLabel(m.meeting_date))}</div>
                        <div>${esc(m.notes)}</div>
                    </div>`).join('')}
            </div>`).join('');
    }
    document.getElementById('notesModal').classList.add('show');
}
function closeNotes() { document.getElementById('notesModal').classList.remove('show'); }
window.addEventListener('click', e => { if (e.target === document.getElementById('notesModal')) closeNotes(); });

/* ============ Buckets / Standards / Rubric ============ */

let selectedBucket = null;

function dotHtml(target) {
    const s = scoreOf(target.id);
    const cls = s === null ? 'score-none' : 'score-' + s;
    const label = `${target.target_code}: ${s === null ? 'not graded yet' : 'score ' + s}`;
    return `<span class="score-dot ${cls}" title="${esc(label)}"></span>`;
}

function renderBuckets() {
    const view = document.getElementById('bucket-view');
    view.style.display = 'grid';
    document.getElementById('detail-view').style.display = 'none';
    document.getElementById('skills-breadcrumb').textContent = '';
    view.innerHTML = DATA.taxonomy.map(b => `
        <div class="bucket-card" data-bucket="${esc(b.bucket_id)}">
            <div>
                <div class="bucket-code">${esc(b.code)}</div>
                <h3>${esc(b.name)}</h3>
            </div>
            <div class="bucket-dots">
                ${b.standards.map(s => `<span class="dot-row" title="${esc(s.standard_id + ' — ' + s.name)}">${s.targets.map(dotHtml).join('')}</span>`).join('')}
            </div>
        </div>`).join('');
    view.querySelectorAll('.bucket-card').forEach(card =>
        card.addEventListener('click', () => openBucket(card.dataset.bucket)));
}

function openBucket(bucketId) {
    selectedBucket = DATA.taxonomy.find(b => b.bucket_id === bucketId);
    if (!selectedBucket) return;
    document.getElementById('bucket-view').style.display = 'none';
    const dv = document.getElementById('detail-view');
    dv.style.display = 'grid';
    document.getElementById('skills-breadcrumb').textContent = selectedBucket.name;
    document.getElementById('right-panel').innerHTML =
        '<p class="muted">Select a standard on the left to see its proficiency rubric.</p>';

    document.getElementById('standards-list').innerHTML = selectedBucket.standards.map(s => {
        const scores = s.targets.map(t => scoreOf(t.id)).filter(v => v !== null);
        const tint = scores.length ? Math.min(...scores) : null;
        return `
        <div class="standard-row ${tint !== null ? 'score-tint-' + tint : ''}" data-standard="${esc(s.standard_id)}">
            <div>
                <div class="std-id">${esc(s.standard_id)}</div>
                <div class="std-name">${esc(s.name)}</div>
            </div>
            <div class="std-dots">${s.targets.map(dotHtml).join('')}</div>
        </div>`;
    }).join('');

    document.querySelectorAll('.standard-row').forEach(row =>
        row.addEventListener('click', () => openStandard(row.dataset.standard)));
}

function openStandard(standardId) {
    const s = selectedBucket.standards.find(x => x.standard_id === standardId);
    if (!s) return;
    document.querySelectorAll('.standard-row').forEach(r =>
        r.classList.toggle('selected', r.dataset.standard === standardId));

    const threads = s.targets.map(t => {
        const my = scoreOf(t.id);
        const rows = [4, 3, 2, 1, 0].map(score => {
            const current = my !== null && my === score;
            return `
            <tr class="${current ? 'rubric-row-current' : ''}">
                <td class="rubric-score" style="background:${SCORE_COLORS[score]}">${score}${current ? '<span class="you-are-here">You</span>' : ''}</td>
                <td>${esc(t.rubric[score] || '')}</td>
            </tr>`;
        }).join('');
        const chip = my === null
            ? '<span class="pill">Not graded yet</span>'
            : `<span class="score-chip score-${my}" style="background:${SCORE_COLORS[my]}">${my}</span>`;
        return `
        <div class="rubric-thread ${my !== null ? 'score-tint-' + my : ''}" style="border-radius:10px;padding:12px;">
            <h4>${chip} ${esc(t.title)}</h4>
            <span class="thread-code">${esc(t.target_code)}</span>
            ${t.description ? `<p class="muted" style="font-size:.85rem;">${esc(t.description)}</p>` : ''}
            <table class="rubric-table">${rows}</table>
        </div>`;
    }).join('');

    const allResources = [...(s.resources || []), ...s.targets.flatMap(t => t.resources || [])];
    const resHtml = allResources.length
        ? allResources.map(r => `
            <div class="resource-item">
                <div>
                    ${r.resource_url ? `<a href="${esc(r.resource_url)}" target="_blank" rel="noopener">${esc(r.resource_label)}</a>` : `<strong>${esc(r.resource_label)}</strong>`}
                    ${r.resource_description ? `<div class="muted" style="font-size:.82rem;">${esc(r.resource_description)}</div>` : ''}
                </div>
                <span class="pill">${esc(r.resource_type || 'link')}</span>
            </div>`).join('')
        : '<div class="resource-empty">No resources posted for this standard yet.</div>';

    document.getElementById('right-panel').innerHTML = `
        <h3 style="color:#2d3748;">${esc(s.standard_id)} — ${esc(s.name)}</h3>
        ${s.description ? `<p class="muted" style="margin:4px 0 14px;">${esc(s.description)}</p>` : ''}
        <h3 style="color:#2d3748;margin-bottom:10px;">Proficiency Rubric</h3>
        ${threads}
        <h3 style="color:#2d3748;margin-top:18px;">Resources</h3>
        <div class="resource-list">${resHtml}</div>`;
}

document.getElementById('back-to-buckets').addEventListener('click', renderBuckets);

renderChart();
setupCards();
renderBuckets();
</script>
</body>
</html>
