<?php
session_start();
$aslhub_base_dir = defined('ASLHUB_BASE_DIR') ? ASLHUB_BASE_DIR : __DIR__;
require_once $aslhub_base_dir . '/config.php';
require_once $aslhub_base_dir . '/../common/asl_student_dashboard_data.php';

if (!isset($_SESSION['user_id']) || !isset($_SESSION['is_teacher']) || !$_SESSION['is_teacher']) {
    header('Location: index.php');
    exit;
}

$student_id = isset($_GET['id']) ? intval($_GET['id']) : 0;
$message = '';
$message_type = '';

aslhubEnsureStudentDashboardSchema($pdo);

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'update') {
    $first_name = trim($_POST['first_name'] ?? '');
    $last_name = trim($_POST['last_name'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $new_password = trim($_POST['new_password'] ?? '');

    try {
        $stmt = $pdo->prepare("UPDATE users SET first_name = ?, last_name = ?, email = ? WHERE id = ? AND is_teacher = FALSE");
        $stmt->execute([$first_name, $last_name, $email, $student_id]);

        if ($new_password !== '') {
            if (strlen($new_password) < 6) {
                $message = 'Password must be at least 6 characters long.';
                $message_type = 'error';
            } else {
                $hashed_password = password_hash($new_password, PASSWORD_DEFAULT);
                $stmt = $pdo->prepare("UPDATE users SET password = ? WHERE id = ? AND is_teacher = FALSE");
                $stmt->execute([$hashed_password, $student_id]);
                $message = 'Student details updated, including password.';
                $message_type = 'success';
            }
        } else {
            $message = 'Student details updated.';
            $message_type = 'success';
        }
    } catch (PDOException $e) {
        $message = 'Error updating student details.';
        $message_type = 'error';
    }
}

try {
    $stmt = $pdo->prepare("SELECT id, first_name, last_name, email, class_period, level FROM users WHERE id = ? AND is_teacher = FALSE");
    $stmt->execute([$student_id]);
    $student = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$student) {
        header('Location: teacher_dashboard.php');
        exit;
    }
} catch (PDOException $e) {
    header('Location: teacher_dashboard.php');
    exit;
}

$dashboard_data = aslhubFetchStudentDashboardData($pdo, $student_id);
$dashboard_json = json_encode($dashboard_data, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP);
if ($dashboard_json === false) {
    $dashboard_json = '{}';
}
$student_name = trim(($student['first_name'] ?? '') . ' ' . ($student['last_name'] ?? ''));
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Student Details - <?php echo htmlspecialchars($student_name); ?></title>
    <link rel="stylesheet" href="css/asl-style.css">
</head>
<body class="student-dashboard-page teacher-student-page">
    <div class="student-shell">
        <header class="student-topbar">
            <div>
                <p class="student-kicker">Teacher View</p>
                <h1><?php echo htmlspecialchars($student_name); ?></h1>
            </div>
            <nav class="student-actions" aria-label="Teacher student tools">
                <a href="teacher_dashboard.php">Back to Dashboard</a>
                <a class="logout-link" href="logout.php">Logout</a>
            </nav>
        </header>

        <?php if ($message): ?>
            <div class="teacher-message <?php echo htmlspecialchars($message_type); ?>">
                <?php echo htmlspecialchars($message); ?>
            </div>
        <?php endif; ?>

        <main class="student-dashboard">
            <section class="student-hero teacher-student-hero" aria-labelledby="student-name-heading">
                <div class="student-identity">
                    <div class="student-avatar" aria-hidden="true">
                        <?php echo htmlspecialchars(substr($student['first_name'] ?? 'A', 0, 1) . substr($student['last_name'] ?? 'S', 0, 1)); ?>
                    </div>
                    <div>
                        <p class="student-kicker">Student</p>
                        <h2 id="student-name-heading"><?php echo htmlspecialchars($student_name); ?></h2>
                        <p class="teacher-student-meta">
                            <?php echo htmlspecialchars($student['email'] ?? ''); ?>
                            <?php if (!empty($student['class_period'])): ?>
                                <span>Period <?php echo htmlspecialchars($student['class_period']); ?></span>
                            <?php endif; ?>
                            <span>ASL <?php echo htmlspecialchars($student['level'] ?? '1'); ?></span>
                        </p>
                    </div>
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

            <section class="student-section teacher-rating-section" aria-labelledby="rating-heading">
                <div class="student-section-header">
                    <div>
                        <p class="student-kicker">Ratings</p>
                        <h2 id="rating-heading">Learning Target Ratings</h2>
                    </div>
                    <p>0 = not attempted, 1 = beginning, 2 = developing, 3 = proficient, 4 = extending.</p>
                </div>

                <div class="curriculum-grid teacher-curriculum-grid">
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
                    <svg id="progress-chart" role="img" aria-label="Learning target points over time"></svg>
                    <p id="chart-empty-note" class="chart-empty-note">The graph will fill in when this student is rated 1-4.</p>
                </div>
            </section>

            <section class="student-section teacher-edit-section" aria-labelledby="edit-heading">
                <div class="student-section-header">
                    <div>
                        <p class="student-kicker">Account</p>
                        <h2 id="edit-heading">Student Information</h2>
                    </div>
                </div>

                <form method="POST" class="teacher-student-form">
                    <input type="hidden" name="action" value="update">
                    <label>
                        <span>First Name</span>
                        <input type="text" name="first_name" value="<?php echo htmlspecialchars($student['first_name']); ?>" required>
                    </label>
                    <label>
                        <span>Last Name</span>
                        <input type="text" name="last_name" value="<?php echo htmlspecialchars($student['last_name']); ?>" required>
                    </label>
                    <label>
                        <span>Email</span>
                        <input type="email" name="email" value="<?php echo htmlspecialchars($student['email']); ?>" required>
                    </label>
                    <label>
                        <span>New Password</span>
                        <input type="text" name="new_password" placeholder="Leave blank to keep current password">
                    </label>
                    <div class="teacher-form-actions">
                        <button type="submit">Save Student Info</button>
                        <button type="button" class="danger" id="delete-student-btn">Delete Student</button>
                    </div>
                </form>
            </section>
        </main>
    </div>

    <script>
        const studentId = <?php echo (int) $student_id; ?>;
        let dashboardData = <?php echo $dashboard_json; ?>;
        const state = {
            bucketId: dashboardData.buckets && dashboardData.buckets[0] ? dashboardData.buckets[0].id : null,
            standardId: dashboardData.buckets && dashboardData.buckets[0] && dashboardData.buckets[0].standards[0] ? dashboardData.buckets[0].standards[0].id : null,
            progressScope: 'overall'
        };

        function escapeHtml(value) {
            const div = document.createElement('div');
            div.textContent = value == null ? '' : String(value);
            return div.innerHTML;
        }

        function progressText(earned, possible) {
            if (!possible) {
                return 'No learning targets yet';
            }
            return earned + ' of ' + possible + ' LT points';
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
            return (dashboardData.targetsByStandard || {})[standardId] || [];
        }

        function selectedProgressScope() {
            const standard = getStandard(state.standardId);
            const bucket = getBucket(state.bucketId);
            if (state.progressScope === 'standard' && standard) {
                return {
                    name: standard.id + ' Progress',
                    percent: standard.percent,
                    earnedPoints: standard.earnedPoints || 0,
                    totalPoints: standard.totalPoints || 0
                };
            }
            if (state.progressScope === 'bucket' && bucket) {
                return {
                    name: bucket.name + ' Progress',
                    percent: bucket.percent,
                    earnedPoints: bucket.earnedPoints || 0,
                    totalPoints: bucket.totalPoints || 0
                };
            }
            return Object.assign({ name: 'Overall LT Progress' }, dashboardData.overall || { percent: 0, earnedPoints: 0, totalPoints: 0 });
        }

        function renderProgressSummary(scope) {
            document.getElementById('progress-context').textContent = scope.name;
            document.getElementById('progress-percent').textContent = scope.percent + '%';
            document.getElementById('progress-count').textContent = progressText(scope.earnedPoints || 0, scope.totalPoints || 0);
            document.getElementById('student-progress-fill').style.width = scope.percent + '%';
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
                    const bucket = getBucket(button.dataset.bucketId);
                    state.bucketId = button.dataset.bucketId;
                    state.standardId = bucket && bucket.standards[0] ? bucket.standards[0].id : null;
                    state.progressScope = 'bucket';
                    renderDashboard();
                });
            });
        }

        function renderStandards() {
            const bucket = getBucket(state.bucketId);
            const standards = bucket ? bucket.standards || [] : [];
            const list = document.getElementById('standard-list');

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
                    state.progressScope = 'standard';
                    renderDashboard();
                });
            });
        }

        function renderTargets() {
            const panel = document.getElementById('target-panel');
            const standard = getStandard(state.standardId);
            const targets = getTargets(state.standardId);

            if (!standard) {
                panel.innerHTML = '<div class="empty-panel">No standard selected.</div>';
                return;
            }

            if (!targets.length) {
                panel.innerHTML = `
                    <div class="target-standard-summary">
                        <span>${escapeHtml(standard.id)}</span>
                        <h4>${escapeHtml(standard.name)}</h4>
                        <p>No learning targets have been added under this standard yet.</p>
                    </div>
                `;
                return;
            }

            const scale = dashboardData.scale || {0: 'Not attempted', 1: 'Beginning', 2: 'Developing', 3: 'Proficient', 4: 'Extending'};
            panel.innerHTML = targets.map(target => `
                <div class="teacher-target-card" data-target-id="${escapeHtml(target.id)}">
                    <div>
                        <h4>${escapeHtml(target.title)}</h4>
                        ${target.description ? `<p>${escapeHtml(target.description)}</p>` : ''}
                        <span class="teacher-target-score">Current: ${escapeHtml(target.score || 0)} - ${escapeHtml(target.scoreLabel || scale[target.score || 0])}</span>
                    </div>
                    <div class="rating-buttons" role="group" aria-label="Rate ${escapeHtml(target.title)}">
                        ${[0, 1, 2, 3, 4].map(score => `
                            <button type="button" class="${Number(target.score || 0) === score ? 'active' : ''}" data-score="${score}" data-target-id="${escapeHtml(target.id)}" title="${escapeHtml(scale[score])}">
                                ${score}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `).join('');

            panel.querySelectorAll('[data-score]').forEach(button => {
                button.addEventListener('click', () => saveRating(button.dataset.targetId, button.dataset.score, button));
            });
        }

        function saveRating(targetId, score, button) {
            const params = new URLSearchParams();
            params.append('student_id', studentId);
            params.append('learning_target_id', targetId);
            params.append('score', score);

            button.disabled = true;
            fetch('update_learning_target_score.php', {
                method: 'POST',
                headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                body: params.toString()
            })
            .then(response => response.json())
            .then(data => {
                if (!data.success) {
                    throw new Error(data.message || 'Unable to save rating.');
                }
                dashboardData = data.dashboard;
                renderDashboard();
                showTeacherToast('Rating saved.', 'success');
            })
            .catch(error => {
                button.disabled = false;
                showTeacherToast(error.message || 'Unable to save rating.', 'error');
            });
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
            const pad = {top: 22, right: 26, bottom: 58, left: 54};
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
                <text x="14" y="${pad.top + 8}" class="chart-axis-label">Pts</text>
                <text x="${pad.left - 12}" y="${pad.top + 5}" text-anchor="end" class="chart-label">${maxY}</text>
                <text x="${pad.left - 12}" y="${pad.top + chartHeight}" text-anchor="end" class="chart-label">0</text>
                <polyline points="${polyline}" class="chart-line"></polyline>
                ${points.map(point => `<circle cx="${point[0]}" cy="${point[1]}" r="3" class="chart-dot"></circle>`).join('')}
                ${monthLabels.join('')}
            `;
        }

        function renderDashboard() {
            renderBuckets();
            renderStandards();
            renderTargets();
            renderProgressSummary(selectedProgressScope());
            renderChart();
        }

        function showTeacherToast(message, type) {
            const toast = document.createElement('div');
            toast.className = 'teacher-toast ' + type;
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2400);
        }

        document.getElementById('delete-student-btn').addEventListener('click', function() {
            if (!confirm('Are you sure you want to delete this student? This action cannot be undone.')) {
                return;
            }

            const params = new URLSearchParams();
            params.append('student_id', studentId);

            fetch('delete_student.php', {
                method: 'POST',
                headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                body: params.toString()
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    window.location.href = 'teacher_dashboard.php';
                    return;
                }
                showTeacherToast(data.message || 'Unable to delete student.', 'error');
            })
            .catch(() => showTeacherToast('Unable to delete student.', 'error'));
        });

        document.addEventListener('DOMContentLoaded', renderDashboard);
    </script>
</body>
</html>
