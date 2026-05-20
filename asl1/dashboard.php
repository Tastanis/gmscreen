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
                <a href="skills.php">Skills</a>
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
                    <div id="progress-count" class="student-progress-count">No learning targets yet</div>
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

                <div class="curriculum-grid">
                    <div>
                        <h3 class="column-title">Buckets</h3>
                        <div id="bucket-list" class="bucket-list"></div>
                    </div>
                    <div>
                        <h3 class="column-title">Standards</h3>
                        <div id="standard-list" class="standard-list"></div>
                    </div>
                    <div>
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
                    <p id="chart-empty-note" class="chart-empty-note">The graph will fill in when learning targets are graded 3 or 4.</p>
                </div>
            </section>

            <section class="student-section comparisons-section" aria-labelledby="comparison-heading">
                <div class="student-section-header">
                    <div>
                        <p class="student-kicker">Class Comparison</p>
                        <h2 id="comparison-heading">Attendance and On-task Trends</h2>
                    </div>
                    <p>These use teacher-entered class metrics when available.</p>
                </div>
                <div id="comparison-list" class="comparison-list"></div>
            </section>
        </main>
    </div>

    <script>
        window.ASL_STUDENT_DASHBOARD = <?php echo $dashboard_json; ?>;

        const dashboardData = window.ASL_STUDENT_DASHBOARD || {};
        const state = {
            bucketId: dashboardData.buckets && dashboardData.buckets[0] ? dashboardData.buckets[0].id : null,
            standardId: dashboardData.buckets && dashboardData.buckets[0] && dashboardData.buckets[0].standards[0] ? dashboardData.buckets[0].standards[0].id : null,
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
            return completed + ' of ' + total + ' LTs proficient';
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
                    <span class="bucket-progress">${escapeHtml(progressText(bucket.completedTargets, bucket.totalTargets))}</span>
                </button>
            `).join('');

            list.querySelectorAll('[data-bucket-id]').forEach(button => {
                button.addEventListener('click', () => {
                    const bucket = getBucket(button.dataset.bucketId);
                    state.bucketId = button.dataset.bucketId;
                    state.standardId = bucket && bucket.standards[0] ? bucket.standards[0].id : null;
                    state.targetId = null;
                    state.progressScope = 'bucket';
                    renderDashboard();
                });
            });
        }

        function renderStandards() {
            const list = document.getElementById('standard-list');
            const bucket = getBucket(state.bucketId);
            const standards = bucket ? bucket.standards || [] : [];

            list.innerHTML = standards.map(standard => `
                <button type="button" class="standard-row ${standard.id === state.standardId ? 'active' : ''}" data-standard-id="${escapeHtml(standard.id)}">
                    <span class="standard-id">${escapeHtml(standard.id)}</span>
                    <span class="standard-name">${escapeHtml(standard.name)}</span>
                    <span class="standard-desc">${escapeHtml(standard.description)}</span>
                    <span class="standard-progress">${escapeHtml(progressText(standard.completedTargets, standard.totalTargets))}</span>
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
                panel.innerHTML = '<div class="empty-panel">No standard selected.</div>';
                return;
            }

            const targetButtons = targets.map(target => `
                <button type="button" class="target-row ${String(target.id) === String(state.targetId) ? 'active' : ''}" data-target-id="${escapeHtml(target.id)}">
                    <span>${escapeHtml(target.title)}</span>
                    <strong>${target.placeholder ? 'Placeholder' : 'Score ' + escapeHtml(target.score || 0)}</strong>
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
            count.textContent = progressText(scope.completedTargets, scope.totalTargets);
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
                    totalTargets: standard.totalTargets
                };
            }
            if (state.progressScope === 'bucket' && bucket) {
                return {
                    name: bucket.name + ' Progress',
                    percent: bucket.percent,
                    completedTargets: bucket.completedTargets,
                    totalTargets: bucket.totalTargets
                };
            }
            return Object.assign({ name: 'Overall LT Progress' }, dashboardData.overall || { percent: 0, completedTargets: 0, totalTargets: 0 });
        }

        function renderChart() {
            const svg = document.getElementById('progress-chart');
            const note = document.getElementById('chart-empty-note');
            const scopeLabel = document.getElementById('chart-scope');
            const graph = dashboardData.graph || {};
            const bucket = getBucket(state.bucketId);
            const useBucketGraph = state.progressScope !== 'overall' && bucket && graph.byBucket;
            const values = useBucketGraph ? graph.byBucket[bucket.id] || [] : graph.overall || [];
            const totalTargets = useBucketGraph ? bucket.totalTargets : (dashboardData.overall ? dashboardData.overall.totalTargets : 0);
            const maxY = Math.max(totalTargets || 0, ...values, 1);
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
                <text x="14" y="${pad.top + 8}" class="chart-axis-label">LTs</text>
                <text x="${pad.left - 12}" y="${pad.top + 5}" text-anchor="end" class="chart-label">${maxY}</text>
                <text x="${pad.left - 12}" y="${pad.top + chartHeight}" text-anchor="end" class="chart-label">0</text>
                <polyline points="${polyline}" class="chart-line"></polyline>
                ${points.map(point => `<circle cx="${point[0]}" cy="${point[1]}" r="3" class="chart-dot"></circle>`).join('')}
                ${monthLabels.join('')}
            `;
        }

        function renderComparisons() {
            const list = document.getElementById('comparison-list');
            const comparisons = dashboardData.comparisons || [];
            if (!comparisons.length) {
                list.innerHTML = '<div class="comparison-empty">No comparison data yet.</div>';
                return;
            }

            list.innerHTML = comparisons.map(item => {
                if (item.status !== 'ready') {
                    return `
                        <div class="comparison-card empty">
                            <span>${escapeHtml(item.label)}</span>
                            <strong>${escapeHtml(item.message || 'No data yet')}</strong>
                        </div>
                    `;
                }

                const studentPct = Math.min(100, (Number(item.studentValue) / Number(item.classMax || 1)) * 100);
                const averagePct = Math.min(100, (Number(item.classAverage) / Number(item.classMax || 1)) * 100);
                const unit = item.unit ? ' ' + item.unit : '';

                return `
                    <div class="comparison-card">
                        <div class="comparison-title">
                            <span>${escapeHtml(item.label)}</span>
                            <strong>Your value: ${escapeHtml(formatNumber(item.studentValue))}${escapeHtml(unit)}</strong>
                        </div>
                        <div class="comparison-bars">
                            <div>
                                <span>You</span>
                                <div class="metric-track"><div style="width: ${studentPct}%"></div></div>
                            </div>
                            <div>
                                <span>Class average</span>
                                <div class="metric-track average"><div style="width: ${averagePct}%"></div></div>
                            </div>
                        </div>
                        <p>Class average: ${escapeHtml(formatNumber(item.classAverage))}${escapeHtml(unit)}</p>
                    </div>
                `;
            }).join('');
        }

        function renderDashboard() {
            renderBuckets();
            renderStandards();
            renderTargets();
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

        document.addEventListener('DOMContentLoaded', renderDashboard);
    </script>
</body>
</html>
