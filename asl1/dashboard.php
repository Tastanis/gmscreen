<?php
session_start();
$aslhub_base_dir = defined('ASLHUB_BASE_DIR') ? ASLHUB_BASE_DIR : __DIR__;
$aslhub_default_level = defined('ASLHUB_DEFAULT_LEVEL') ? (int) ASLHUB_DEFAULT_LEVEL : 1;
require_once $aslhub_base_dir . '/config.php';
require_once $aslhub_base_dir . '/../common/asl_student_dashboard_data.php';

if (!isset($_SESSION['user_id'])) {
    header('Location: index.php');
    exit;
}

$user_level = intval($_SESSION['user_level'] ?? $aslhub_default_level);
if (!in_array($user_level, [1, 2], true)) {
    $user_level = $aslhub_default_level;
}

if (isset($_SESSION['is_teacher']) && $_SESSION['is_teacher']) {
    header('Location: teacher_dashboard.php');
    exit;
}

try {
    $stmt = $pdo->prepare("SELECT class_period FROM users WHERE id = ?");
    $stmt->execute([$_SESSION['user_id']]);
    $user_data = $stmt->fetch();
    $current_class_period = $user_data['class_period'] ?? null;
} catch (PDOException $e) {
    $current_class_period = null;
}

$dashboard_data = aslhubFetchStudentDashboardData($pdo, (int) $_SESSION['user_id']);
$dashboard_json = json_encode($dashboard_data, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP);
if ($dashboard_json === false) {
    $dashboard_json = '{}';
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ASL Hub - Student Dashboard</title>
    <link rel="stylesheet" href="css/asl-style.css">
</head>
<body class="student-dashboard-page">
    <div class="student-shell">
        <header class="student-topbar">
            <div>
                <p class="student-kicker">ASL Hub</p>
                <h1>Student Dashboard</h1>
            </div>
            <nav class="student-actions" aria-label="Student tools">
                <button type="button" onclick="window.open('scrollergame/index.html', '_blank')">Scroller Game</button>
                <button type="button" onclick="openGoals()">Goals</button>
                <a href="bingo.php">Bingo</a>
                <a class="logout-link" href="logout.php">Logout</a>
            </nav>
        </header>

        <main class="student-dashboard">
            <section class="student-hero" aria-labelledby="student-name-heading">
                <div class="student-identity">
                    <div class="student-avatar" aria-hidden="true">
                        <?php echo htmlspecialchars(substr($_SESSION['user_first_name'] ?? 'A', 0, 1) . substr($_SESSION['user_last_name'] ?? 'S', 0, 1)); ?>
                    </div>
                    <div>
                        <p class="student-kicker">Welcome back</p>
                        <h2 id="student-name-heading"><?php echo htmlspecialchars($_SESSION['user_first_name'] . ' ' . $_SESSION['user_last_name']); ?></h2>
                    </div>
                </div>

                <div class="class-period-section student-period-control">
                    <label for="class-period-select">Class Period</label>
                    <select id="class-period-select" onchange="updateClassPeriod(this.value)">
                        <option value="">Select Period</option>
                        <?php for ($i = 1; $i <= 6; $i++): ?>
                            <option value="<?php echo $i; ?>" <?php echo ($current_class_period == $i) ? 'selected' : ''; ?>>
                                Period <?php echo $i; ?>
                            </option>
                        <?php endfor; ?>
                    </select>
                </div>

                <div class="student-progress-summary" aria-live="polite">
                    <div class="progress-copy">
                        <span id="progress-context">Overall LT Progress</span>
                        <strong id="progress-percent">0%</strong>
                    </div>
                    <div class="student-progress-track" aria-hidden="true">
                        <div id="student-progress-fill" class="student-progress-fill"></div>
                    </div>
                    <div id="progress-count" class="student-progress-count">No learning target points yet</div>
                </div>
            </section>

            <section class="student-section curriculum-section" aria-labelledby="curriculum-heading">
                <div class="student-section-header">
                    <div>
                        <p class="student-kicker">Skill Buckets</p>
                        <h2 id="curriculum-heading">Standards and Learning Targets</h2>
                    </div>
                    <p>Click a bucket, then a standard, then a learning target to see its resources.</p>
                </div>

                <div class="curriculum-grid" id="curriculum-grid">
                    <div class="bucket-column">
                        <h3 class="column-title">Buckets</h3>
                        <div id="bucket-list" class="bucket-list"></div>
                    </div>
                    <div class="standard-column">
                        <div class="column-title-row">
                            <h3 class="column-title">Standards</h3>
                            <button type="button" id="back-to-buckets" class="back-to-buckets" style="display: none;">&larr; Back to Buckets</button>
                        </div>
                        <div id="standard-list" class="standard-list"></div>
                    </div>
                    <div class="target-column">
                        <h3 class="column-title">Learning Targets</h3>
                        <div id="target-panel" class="target-panel"></div>
                    </div>
                </div>
            </section>

            <section class="student-section analytics-section" aria-labelledby="chart-heading">
                <div class="student-section-header">
                    <div>
                        <p class="student-kicker">Course Progression</p>
                        <h2 id="chart-heading">Progress Over Time</h2>
                    </div>
                    <p id="chart-scope">Showing all skill buckets</p>
                </div>
                <div class="chart-wrap">
                    <svg id="progress-chart" role="img" aria-label="Learning targets completed over time"></svg>
                    <p id="chart-empty-note" class="chart-empty-note">The graph will fill in when learning targets are rated 1-4.</p>
                </div>
            </section>

            <section class="student-section comparisons-section" aria-labelledby="comparison-heading">
                <div class="student-section-header">
                    <div>
                        <p class="student-kicker">Class Comparison</p>
                        <h2 id="comparison-heading">Attendance and On-task Trends</h2>
                    </div>
                    <p>Click a card to see your trend over time vs. the ASL 1/2 class average.</p>
                </div>
                <div id="comparison-cards" class="comparison-cards"></div>
                <div id="comparison-detail" class="comparison-detail" style="display: none;"></div>
            </section>
        </main>
    </div>

    <script>
        window.ASL_STUDENT_DASHBOARD = <?php echo $dashboard_json; ?>;

        const dashboardData = window.ASL_STUDENT_DASHBOARD || {};
        const state = {
            bucketId: null,
            standardId: null,
            targetId: null,
            progressScope: 'overall'
        };

        function openGoals() {
            window.open('goals/index.php', 'aslGoalsWindow', 'width=960,height=720,scrollbars=yes,resizable=yes');
        }

        function escapeHtml(value) {
            const div = document.createElement('div');
            div.textContent = value == null ? '' : String(value);
            return div.innerHTML;
        }

        function formatNumber(value) {
            const number = Number(value || 0);
            return Number.isInteger(number) ? String(number) : number.toFixed(1);
        }

        function progressText(completed, total) {
            if (!total) {
                return 'No learning targets yet';
            }
            return completed + ' of ' + total + ' LT points';
        }

        function getBucket(bucketId) {
            return (dashboardData.buckets || []).find(bucket => bucket.id === bucketId) || null;
        }

        function getStandard(standardId) {
            for (const bucket of dashboardData.buckets || []) {
                const found = (bucket.standards || []).find(standard => standard.id === standardId);
                if (found) {
                    return found;
                }
            }
            return null;
        }

        function getTargets(standardId) {
            const realTargets = (dashboardData.targetsByStandard || {})[standardId] || [];
            if (realTargets.length) {
                return realTargets;
            }

            return [{
                id: 'placeholder-' + standardId,
                standardId,
                title: 'Teacher-added learning target placeholder',
                description: 'Learning targets will appear here after they are added.',
                score: 0,
                completed: false,
                placeholder: true
            }];
        }

        function getSelectedTarget() {
            const targets = getTargets(state.standardId);
            return targets.find(target => String(target.id) === String(state.targetId)) || targets[0] || null;
        }

        function renderBuckets() {
            const list = document.getElementById('bucket-list');
            list.innerHTML = (dashboardData.buckets || []).map(bucket => `
                <button type="button" class="bucket-card ${bucket.id === state.bucketId ? 'active' : ''}" data-bucket-id="${escapeHtml(bucket.id)}">
                    <span class="bucket-code">${escapeHtml(bucket.code)}</span>
                    <span class="bucket-name">${escapeHtml(bucket.name)}</span>
                    <span class="bucket-progress">${escapeHtml(progressText(bucket.earnedPoints || 0, bucket.totalPoints || 0))}</span>
                </button>
            `).join('');

            list.querySelectorAll('[data-bucket-id]').forEach(button => {
                button.addEventListener('click', () => {
                    state.bucketId = button.dataset.bucketId;
                    state.standardId = null;
                    state.targetId = null;
                    state.progressScope = 'bucket';
                    renderDashboard();
                });
            });
        }

        function renderStandards() {
            const list = document.getElementById('standard-list');
            const bucket = getBucket(state.bucketId);

            if (!bucket) {
                list.innerHTML = '<div class="empty-panel">Select a bucket to view its standards.</div>';
                return;
            }

            const standards = bucket.standards || [];

            list.innerHTML = standards.map(standard => `
                <button type="button" class="standard-row ${standard.id === state.standardId ? 'active' : ''}" data-standard-id="${escapeHtml(standard.id)}">
                    <span class="standard-id">${escapeHtml(standard.id)}</span>
                    <span class="standard-name">${escapeHtml(standard.name)}</span>
                    <span class="standard-desc">${escapeHtml(standard.description)}</span>
                    <span class="standard-progress">${escapeHtml(progressText(standard.earnedPoints || 0, standard.totalPoints || 0))}</span>
                </button>
            `).join('');

            list.querySelectorAll('[data-standard-id]').forEach(button => {
                button.addEventListener('click', () => {
                    state.standardId = button.dataset.standardId;
                    state.targetId = null;
                    state.progressScope = 'standard';
                    renderDashboard();
                });
            });
        }

        function renderTargets() {
            const panel = document.getElementById('target-panel');
            const standard = getStandard(state.standardId);
            const targets = getTargets(state.standardId);
            const selectedTarget = getSelectedTarget();
            state.targetId = selectedTarget ? selectedTarget.id : null;

            if (!standard) {
                panel.innerHTML = '<div class="empty-panel">Select a standard to view its learning targets and resources.</div>';
                return;
            }

            const targetButtons = targets.map(target => `
                <button type="button" class="target-row ${String(target.id) === String(state.targetId) ? 'active' : ''}" data-target-id="${escapeHtml(target.id)}">
                    <span>${escapeHtml(target.title)}</span>
                    <strong>${target.placeholder ? 'Placeholder' : escapeHtml((target.score || 0) + ' - ' + (target.scoreLabel || 'Not attempted'))}</strong>
                </button>
            `).join('');

            const resources = selectedTarget && !selectedTarget.placeholder
                ? (dashboardData.resourcesByTarget || {})[selectedTarget.id] || []
                : [];
            const resourceItems = resources.length ? resources : (dashboardData.resourcePlaceholders || []);

            panel.innerHTML = `
                <div class="target-standard-summary">
                    <span>${escapeHtml(standard.id)}</span>
                    <h4>${escapeHtml(standard.name)}</h4>
                    <p>${escapeHtml(standard.description)}</p>
                </div>
                <div class="target-list">${targetButtons}</div>
                <div class="resource-panel">
                    <div class="resource-panel-header">
                        <span>Resources</span>
                        <strong>${selectedTarget && selectedTarget.placeholder ? 'Placeholder set' : escapeHtml(selectedTarget ? selectedTarget.title : '')}</strong>
                    </div>
                    <div class="resource-list">
                        ${resourceItems.map(resource => {
                            const label = resource.resource_label || resource.label || resource.type || 'Resource placeholder';
                            const description = resource.resource_description || resource.description || '';
                            const url = resource.resource_url || resource.url || '';
                            const body = `
                                <span>${escapeHtml(label)}</span>
                                ${description ? `<small>${escapeHtml(description)}</small>` : ''}
                            `;
                            return url
                                ? `<a class="resource-pill" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${body}</a>`
                                : `<div class="resource-pill placeholder">${body}</div>`;
                        }).join('')}
                    </div>
                </div>
            `;

            panel.querySelectorAll('[data-target-id]').forEach(button => {
                button.addEventListener('click', () => {
                    state.targetId = button.dataset.targetId;
                    renderTargets();
                });
            });
        }

        function renderProgressSummary(scope) {
            const context = document.getElementById('progress-context');
            const percent = document.getElementById('progress-percent');
            const count = document.getElementById('progress-count');
            const fill = document.getElementById('student-progress-fill');

            context.textContent = scope.name;
            percent.textContent = scope.percent + '%';
            count.textContent = progressText(scope.earnedPoints || 0, scope.totalPoints || 0);
            fill.style.width = scope.percent + '%';
        }

        function selectedProgressScope() {
            const standard = getStandard(state.standardId);
            const bucket = getBucket(state.bucketId);
            if (state.progressScope === 'standard' && standard) {
                return {
                    name: standard.id + ' Progress',
                    percent: standard.percent,
                    completedTargets: standard.completedTargets,
                    totalTargets: standard.totalTargets,
                    earnedPoints: standard.earnedPoints || 0,
                    totalPoints: standard.totalPoints || 0
                };
            }
            if (state.progressScope === 'bucket' && bucket) {
                return {
                    name: bucket.name + ' Progress',
                    percent: bucket.percent,
                    completedTargets: bucket.completedTargets,
                    totalTargets: bucket.totalTargets,
                    earnedPoints: bucket.earnedPoints || 0,
                    totalPoints: bucket.totalPoints || 0
                };
            }
            return Object.assign({ name: 'Overall LT Progress' }, dashboardData.overall || { percent: 0, completedTargets: 0, totalTargets: 0, earnedPoints: 0, totalPoints: 0 });
        }

        function renderChart() {
            const svg = document.getElementById('progress-chart');
            const note = document.getElementById('chart-empty-note');
            const scopeLabel = document.getElementById('chart-scope');
            const graph = dashboardData.graph || {};
            const bucket = getBucket(state.bucketId);
            const useBucketGraph = state.progressScope !== 'overall' && bucket && graph.byBucket;
            const values = useBucketGraph ? graph.byBucket[bucket.id] || [] : graph.overall || [];
            const totalPoints = useBucketGraph ? bucket.totalPoints : (dashboardData.overall ? dashboardData.overall.totalPoints : 0);
            const maxY = Math.max(totalPoints || 0, ...values, 1);
            const width = 920;
            const height = 300;
            const pad = { top: 22, right: 26, bottom: 58, left: 54 };
            const chartWidth = width - pad.left - pad.right;
            const chartHeight = height - pad.top - pad.bottom;

            scopeLabel.textContent = useBucketGraph ? 'Showing ' + bucket.name : 'Showing all skill buckets';
            note.style.display = values.some(value => value > 0) ? 'none' : 'block';

            const points = values.map((value, index) => {
                const x = pad.left + (index / Math.max(values.length - 1, 1)) * chartWidth;
                const y = pad.top + chartHeight - (value / maxY) * chartHeight;
                return [x, y];
            });
            const polyline = points.map(point => point.join(',')).join(' ');
            const monthLabels = [];
            let weekOffset = 0;
            (graph.months || []).forEach(month => {
                const x = pad.left + ((weekOffset + 1.5) / Math.max((graph.weeks || 36) - 1, 1)) * chartWidth;
                monthLabels.push(`<text x="${x}" y="${height - 20}" text-anchor="middle" class="chart-label">${escapeHtml(month.label)}</text>`);
                weekOffset += month.weeks;
            });
            monthLabels.push(`<text x="${pad.left + chartWidth}" y="${height - 20}" text-anchor="middle" class="chart-label">Jun</text>`);

            const weekLines = [];
            for (let i = 0; i < (graph.weeks || 36); i++) {
                const x = pad.left + (i / Math.max((graph.weeks || 36) - 1, 1)) * chartWidth;
                weekLines.push(`<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${pad.top + chartHeight}" class="chart-week-line ${i % 4 === 0 ? 'month' : ''}" />`);
            }

            svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
            svg.innerHTML = `
                <rect x="0" y="0" width="${width}" height="${height}" class="chart-bg"></rect>
                ${weekLines.join('')}
                <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + chartHeight}" class="chart-axis"></line>
                <line x1="${pad.left}" y1="${pad.top + chartHeight}" x2="${pad.left + chartWidth}" y2="${pad.top + chartHeight}" class="chart-axis"></line>
                <text x="${pad.left}" y="14" text-anchor="end" class="chart-axis-label">Pts</text>
                <text x="${pad.left - 8}" y="${pad.top + 5}" text-anchor="end" class="chart-label">${maxY}</text>
                <text x="${pad.left - 12}" y="${pad.top + chartHeight}" text-anchor="end" class="chart-label">0</text>
                <polyline points="${polyline}" class="chart-line"></polyline>
                ${points.map(point => `<circle cx="${point[0]}" cy="${point[1]}" r="3" class="chart-dot"></circle>`).join('')}
                ${monthLabels.join('')}
            `;
        }

        const comparisonState = { metric: null };

        function formatMeetingDate(iso) {
            if (!iso) return '';
            const parts = iso.split('-');
            if (parts.length !== 3) return iso;
            const d = new Date(parts[0], parts[1] - 1, parts[2]);
            return d.toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'});
        }

        function renderComparisons() {
            const cards = document.getElementById('comparison-cards');
            const detail = document.getElementById('comparison-detail');
            const meetings = dashboardData.meetings || { buckets: [], studentEntries: [], latest: {} };
            const latest = meetings.latest || {};
            const studentLatest = latest.student || null;
            const classLatest = latest.class || null;

            const fmt = (val, suffix) => val == null ? '&mdash;' : escapeHtml(formatNumber(val)) + (suffix || '');

            const noteCount = (meetings.studentEntries || []).length;

            cards.innerHTML = `
                <button type="button" class="comparison-summary-card ${comparisonState.metric === 'attendance' ? 'active' : ''}" data-metric="attendance">
                    <span class="comparison-card-label">Attendance</span>
                    <strong class="comparison-card-value">${fmt(studentLatest ? studentLatest.absences : null)}<small> absences</small></strong>
                    <span class="comparison-card-meta">Class avg: ${fmt(classLatest ? classLatest.avgAbsences : null)}</span>
                </button>
                <button type="button" class="comparison-summary-card ${comparisonState.metric === 'participation' ? 'active' : ''}" data-metric="participation">
                    <span class="comparison-card-label">Participation</span>
                    <strong class="comparison-card-value">${fmt(studentLatest ? studentLatest.participation_pct : null, '%')}</strong>
                    <span class="comparison-card-meta">Class avg: ${fmt(classLatest ? classLatest.avgParticipation : null, '%')}</span>
                </button>
                <button type="button" class="comparison-summary-card ${comparisonState.metric === 'notes' ? 'active' : ''}" data-metric="notes">
                    <span class="comparison-card-label">Notes</span>
                    <strong class="comparison-card-value">${noteCount}<small> meeting${noteCount === 1 ? '' : 's'}</small></strong>
                    <span class="comparison-card-meta">${noteCount ? 'Most recent: ' + escapeHtml(formatMeetingDate(meetings.studentEntries[0].date)) : 'No notes yet'}</span>
                </button>
            `;

            cards.querySelectorAll('[data-metric]').forEach(btn => {
                btn.addEventListener('click', () => {
                    comparisonState.metric = (comparisonState.metric === btn.dataset.metric) ? null : btn.dataset.metric;
                    renderComparisons();
                });
            });

            if (!comparisonState.metric) {
                detail.style.display = 'none';
                detail.innerHTML = '';
                return;
            }

            detail.style.display = 'block';
            if (comparisonState.metric === 'notes') {
                renderNotesDetail(detail, meetings.studentEntries || []);
            } else {
                renderMetricDetail(detail, comparisonState.metric, meetings.buckets || []);
            }
        }

        function renderNotesDetail(container, entries) {
            if (!entries.length) {
                container.innerHTML = '<div class="empty-panel">No meeting notes yet.</div>';
                return;
            }
            container.innerHTML = `
                <h3 class="comparison-detail-title">Meeting Notes</h3>
                <div class="meeting-notes-list">
                    ${entries.map(entry => `
                        <article class="meeting-note-card">
                            <header>
                                <strong>${escapeHtml(formatMeetingDate(entry.date))}</strong>
                                <span>Absences: ${escapeHtml(entry.absences)} &middot; Participation: ${entry.participation_pct == null ? '&mdash;' : escapeHtml(entry.participation_pct) + '%'}</span>
                            </header>
                            <p>${entry.notes ? escapeHtml(entry.notes) : '<em>No notes recorded.</em>'}</p>
                        </article>
                    `).join('')}
                </div>
            `;
        }

        function renderMetricDetail(container, metric, buckets) {
            const isParticipation = metric === 'participation';
            const title = isParticipation ? 'Participation Over Time' : 'Absences Over Time';
            const unit = isParticipation ? '%' : '';
            const studentKey = isParticipation ? 'participation_pct' : 'absences';
            const classKey = isParticipation ? 'avgParticipation' : 'avgAbsences';

            const studentSeries = buckets.map(b => b.student && b.student[studentKey] != null ? Number(b.student[studentKey]) : null);
            const classSeries = buckets.map(b => b.class && b.class[classKey] != null ? Number(b.class[classKey]) : null);

            const hasAny = studentSeries.some(v => v != null) || classSeries.some(v => v != null);
            if (!hasAny) {
                container.innerHTML = `<h3 class="comparison-detail-title">${title}</h3><div class="empty-panel">No data yet for this metric.</div>`;
                return;
            }

            const width = 920;
            const height = 280;
            const pad = {top: 22, right: 26, bottom: 58, left: 54};
            const chartWidth = width - pad.left - pad.right;
            const chartHeight = height - pad.top - pad.bottom;
            const allVals = studentSeries.concat(classSeries).filter(v => v != null);
            let maxY = Math.max.apply(null, allVals.length ? allVals : [1]);
            if (isParticipation) maxY = Math.max(maxY, 100);
            maxY = Math.max(maxY, 1);
            const n = buckets.length;
            const xAt = idx => pad.left + (n <= 1 ? chartWidth / 2 : (idx / (n - 1)) * chartWidth);
            const yAt = val => pad.top + chartHeight - (val / maxY) * chartHeight;

            const buildPolyline = (series) => {
                const segs = [];
                let current = [];
                series.forEach((v, i) => {
                    if (v == null) {
                        if (current.length) { segs.push(current); current = []; }
                    } else {
                        current.push([xAt(i), yAt(v)]);
                    }
                });
                if (current.length) segs.push(current);
                return segs;
            };

            const studentSegs = buildPolyline(studentSeries);
            const classSegs = buildPolyline(classSeries);

            const labels = buckets.map((b, i) => {
                if (n > 12 && i % 2 !== 0 && i !== n - 1) return '';
                return `<text x="${xAt(i)}" y="${height - 22}" text-anchor="middle" class="chart-label">${escapeHtml(b.label)}</text>`;
            }).join('');

            const verticals = buckets.map((b, i) =>
                `<line x1="${xAt(i)}" y1="${pad.top}" x2="${xAt(i)}" y2="${pad.top + chartHeight}" class="chart-week-line" />`
            ).join('');

            const studentLines = studentSegs.map(seg =>
                `<polyline points="${seg.map(p => p.join(',')).join(' ')}" class="metric-line metric-line-student" />`
            ).join('');
            const studentDots = studentSegs.flat().map(p =>
                `<circle cx="${p[0]}" cy="${p[1]}" r="4" class="chart-dot metric-dot-student"></circle>`
            ).join('');
            const classLines = classSegs.map(seg =>
                `<polyline points="${seg.map(p => p.join(',')).join(' ')}" class="metric-line metric-line-class" />`
            ).join('');
            const classDots = classSegs.flat().map(p =>
                `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" class="chart-dot metric-dot-class"></circle>`
            ).join('');

            container.innerHTML = `
                <h3 class="comparison-detail-title">${title}</h3>
                <div class="comparison-legend">
                    <span class="legend-swatch legend-student"></span> You
                    <span class="legend-swatch legend-class"></span> Class average (ASL 1 &amp; 2)
                </div>
                <div class="chart-wrap">
                    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}">
                        <rect x="0" y="0" width="${width}" height="${height}" class="chart-bg"></rect>
                        ${verticals}
                        <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + chartHeight}" class="chart-axis"></line>
                        <line x1="${pad.left}" y1="${pad.top + chartHeight}" x2="${pad.left + chartWidth}" y2="${pad.top + chartHeight}" class="chart-axis"></line>
                        <text x="${pad.left}" y="14" text-anchor="end" class="chart-axis-label">${escapeHtml(isParticipation ? '%' : '#')}</text>
                        <text x="${pad.left - 8}" y="${pad.top + 5}" text-anchor="end" class="chart-label">${formatNumber(maxY)}${escapeHtml(unit)}</text>
                        <text x="${pad.left - 8}" y="${pad.top + chartHeight}" text-anchor="end" class="chart-label">0${escapeHtml(unit)}</text>
                        ${classLines}${classDots}
                        ${studentLines}${studentDots}
                        ${labels}
                    </svg>
                </div>
            `;
        }

        function applyCurriculumLayout() {
            const grid = document.getElementById('curriculum-grid');
            const backBtn = document.getElementById('back-to-buckets');
            if (!grid) return;
            const focused = !!state.standardId;
            grid.classList.toggle('standard-focus', focused);
            if (backBtn) {
                backBtn.style.display = focused ? '' : 'none';
            }
        }

        function backToBuckets() {
            state.standardId = null;
            state.targetId = null;
            state.progressScope = state.bucketId ? 'bucket' : 'overall';
            renderDashboard();
        }

        function resetCurriculumSelection() {
            state.bucketId = null;
            state.standardId = null;
            state.targetId = null;
            state.progressScope = 'overall';
            renderDashboard();
        }

        function renderDashboard() {
            renderBuckets();
            renderStandards();
            renderTargets();
            applyCurriculumLayout();
            renderProgressSummary(selectedProgressScope());
            renderChart();
            renderComparisons();
        }

        let originalClassPeriod = '<?php echo htmlspecialchars($current_class_period ?? '', ENT_QUOTES); ?>';

        function updateClassPeriod(newPeriod) {
            if (newPeriod === originalClassPeriod) {
                return;
            }

            if (originalClassPeriod && originalClassPeriod !== '') {
                if (!confirm(`Are you sure you wish to change your class period to ${newPeriod || 'unselected'}?`)) {
                    document.getElementById('class-period-select').value = originalClassPeriod;
                    return;
                }
            }

            fetch('update_class_period.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'class_period=' + encodeURIComponent(newPeriod)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    originalClassPeriod = newPeriod;
                    showMessage('Class period updated successfully.', 'success');
                } else {
                    document.getElementById('class-period-select').value = originalClassPeriod;
                    showMessage(data.message || 'Error updating class period.', 'error');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                document.getElementById('class-period-select').value = originalClassPeriod;
                showMessage('Error updating class period. Please try again.', 'error');
            });
        }

        function showMessage(message, type) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + type;
            messageDiv.textContent = message;
            messageDiv.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 1000;
                padding: 10px 15px;
                border-radius: 10px;
                font-weight: 600;
                background: ${type === 'success' ? '#ecfdf3' : '#fff1f2'};
                color: ${type === 'success' ? '#166534' : '#be123c'};
                border: 1px solid ${type === 'success' ? '#bbf7d0' : '#fecdd3'};
            `;

            document.body.appendChild(messageDiv);
            setTimeout(() => messageDiv.remove(), 3000);
        }

        document.addEventListener('DOMContentLoaded', function() {
            renderDashboard();

            const backBtn = document.getElementById('back-to-buckets');
            if (backBtn) {
                backBtn.addEventListener('click', backToBuckets);
            }

            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    resetCurriculumSelection();
                }
            });
        });
    </script>
</body>
</html>
