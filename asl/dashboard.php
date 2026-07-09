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
$level = (int)$payload['student']['level'];
$gamesLevel = min($level, 2); // scroller/goals/bingo still live in asl1/asl2
$initials = mb_substr($subject['first_name'] ?? 'A', 0, 1) . mb_substr($subject['last_name'] ?? 'S', 0, 1);
$cssV = @filemtime(__DIR__ . '/css/asl-style.css') ?: 1;
$hubV = @filemtime(__DIR__ . '/css/hub.css') ?: 1;
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ASL Hub - Student Dashboard</title>
    <link rel="stylesheet" href="css/asl-style.css?v=<?php echo $cssV; ?>">
    <link rel="stylesheet" href="css/hub.css?v=<?php echo $hubV; ?>">
</head>
<body class="student-dashboard-page">
    <div class="student-shell">
        <?php if ($viewingAsTeacher): ?>
            <div style="background:#fdf6e3;border:2px solid #e8b93e;border-radius:10px;padding:10px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
                <span><strong>Teacher view:</strong> seeing this dashboard exactly as
                <?php echo aslhub_h($subject['first_name'] . ' ' . $subject['last_name']); ?> sees it.
                Zoom into a skill and click a rubric level to grade it.</span>
                <span>
                    <a href="teacher/student.php?id=<?php echo (int)$subject['id']; ?>" class="pill" style="text-decoration:none;">Manage student</a>
                    <a href="teacher/grading.php?level=<?php echo $level; ?>" class="pill" style="text-decoration:none;">&larr; Grading grid</a>
                    <a href="teacher/dashboard.php" class="pill" style="text-decoration:none;">&larr; Roster</a>
                </span>
            </div>
        <?php endif; ?>
        <header class="student-topbar">
            <div>
                <p class="student-kicker">ASL Hub &middot; ASL <?php echo $level; ?></p>
                <h1>Student Dashboard</h1>
            </div>
            <nav class="student-actions" aria-label="Student tools">
                <button type="button" onclick="window.open('../asl<?php echo $gamesLevel; ?>/scrollergame/index.html', '_blank')">Scroller Game</button>
                <button type="button" onclick="openGoals()">Goals</button>
                <a href="../asl<?php echo $gamesLevel; ?>/bingo.php">Bingo</a>
                <?php if (!$viewingAsTeacher): ?><a class="logout-link" href="logout.php">Logout</a><?php endif; ?>
            </nav>
        </header>

        <main class="student-dashboard">
            <section class="student-hero" aria-labelledby="student-name-heading">
                <div class="student-identity">
                    <div class="student-avatar" aria-hidden="true"><?php echo aslhub_h(mb_strtoupper($initials)); ?></div>
                    <div>
                        <p class="student-kicker">Welcome back</p>
                        <h2 id="student-name-heading"><?php echo aslhub_h($subject['first_name'] . ' ' . $subject['last_name']); ?></h2>
                    </div>
                </div>

                <div class="student-progress-summary" aria-live="polite">
                    <div class="progress-copy">
                        <span id="progress-context">Overall Progress</span>
                        <strong id="progress-percent">0%</strong>
                    </div>
                    <div class="student-progress-track" aria-hidden="true">
                        <div id="student-progress-fill" class="student-progress-fill"></div>
                    </div>
                    <div id="progress-count" class="student-progress-count">No points yet</div>
                </div>
            </section>

            <section class="student-section curriculum-section" aria-labelledby="curriculum-heading">
                <div class="student-section-header">
                    <div>
                        <p class="student-kicker">Skill Buckets</p>
                        <h2 id="curriculum-heading">Standards and Proficiency</h2>
                    </div>
                    <p>Click a bucket, then a standard to see its proficiency rubric and resources.</p>
                </div>

                <div class="curriculum-grid" id="curriculum-grid">
                    <div class="bucket-column">
                        <h3 class="column-title">Buckets</h3>
                        <div id="bucket-list" class="bucket-list"></div>
                    </div>
                    <div class="standard-column">
                        <div class="column-title-row">
                            <h3 class="column-title" id="standard-column-title">Standards</h3>
                            <button type="button" id="back-to-buckets" class="back-to-buckets" style="display: none;">&larr; Back to Buckets</button>
                        </div>
                        <div id="standard-list" class="standard-list"></div>
                    </div>
                    <div class="target-column">
                        <h3 class="column-title" id="target-column-title">&nbsp;</h3>
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
                    <svg id="progress-chart" role="img" aria-label="Skill points earned over time"></svg>
                    <p id="chart-empty-note" class="chart-empty-note">The graph will fill in as your skills are rated 1-4. Stay at or above the green line to be on track for proficient (3s) by June.</p>
                </div>
                <div class="comparison-legend" style="margin-top:8px;">
                    <span class="legend-swatch legend-student"></span> You
                    <span class="legend-swatch" style="background:#4caf6d;"></span> On-track pace (3s)
                    <span class="legend-swatch" style="background:#4a90d9;"></span> Reaching-for-4s pace
                    <span class="legend-swatch" style="background:#e05252;"></span> Failing pace (2s)
                    <span id="legend-absences" style="display:none;"><span class="legend-swatch" style="background:#f6993f;"></span> Absences/week (right axis)</span>
                    <span id="legend-participation" style="display:none;"><span class="legend-swatch" style="background:#9f7aea;"></span> Participation points (right axis)</span>
                </div>
            </section>

            <section class="student-section comparisons-section" aria-labelledby="comparison-heading">
                <div class="student-section-header">
                    <div>
                        <p class="student-kicker">Weekly Log</p>
                        <h2 id="comparison-heading">Attendance, Participation and Notes</h2>
                    </div>
                    <p>Click Attendance or Participation to add that line to the graph above. Click Notes to read your notes.</p>
                </div>
                <div id="comparison-cards" class="comparison-cards"></div>
            </section>
        </main>
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
        window.ASL_STUDENT_DASHBOARD = <?php echo json_encode($payload, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE); ?>;
        // When a teacher is viewing, rubric levels become clickable grade buttons.
        window.ASL_TEACHER_GRADE = <?php echo $viewingAsTeacher
            ? json_encode([
                'csrf' => aslhub_csrf_token(),
                'api' => aslhub_base_url() . '/api/save_score.php',
                'studentId' => (int)$subject['id'],
            ], JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP)
            : 'null'; ?>;

        const dashboardData = window.ASL_STUDENT_DASHBOARD || {};
        const SCORE_COLORS = { 0: '#9aa2ad', 1: '#e05252', 2: '#e8b93e', 3: '#4caf6d', 4: '#4a90d9' };
        const state = { bucketId: null, standardId: null, targetId: null, progressScope: 'overall' };
        const overlayState = { attendance: false, participation: false };

        function openGoals() {
            window.open('../asl<?php echo $gamesLevel; ?>/goals/index.php', 'aslGoalsWindow', 'width=960,height=720,scrollbars=yes,resizable=yes');
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

        function scoreOf(targetId) {
            const s = dashboardData.scores && dashboardData.scores[String(targetId)];
            return (s === undefined || s === null) ? null : Number(s);
        }

        /* Teacher-view only: save a score by clicking a rubric level. */
        async function gradeTarget(targetId, score, row) {
            const g = window.ASL_TEACHER_GRADE;
            if (!g || gradeTarget.busy) return;
            gradeTarget.busy = true;
            if (row) row.classList.add('rubric-saving');
            try {
                const body = new URLSearchParams({
                    csrf_token: g.csrf, student_id: g.studentId, target_id: targetId, score: score,
                });
                const res = await fetch(g.api, { method: 'POST', body });
                const out = await res.json();
                if (!out.success) throw new Error(out.error || 'save failed');
                if (!dashboardData.scores || Array.isArray(dashboardData.scores)) dashboardData.scores = {};
                dashboardData.scores[String(targetId)] = score;
                renderDashboard();
            } catch (err) {
                if (row) row.classList.remove('rubric-saving');
                alert('Could not save score: ' + err.message);
            } finally {
                gradeTarget.busy = false;
            }
        }

        function bucketTargets(bucket) {
            return (bucket.standards || []).flatMap(s => s.targets || []);
        }

        function pointsFor(targets) {
            let earned = 0;
            targets.forEach(t => { const s = scoreOf(t.id); if (s !== null) earned += s; });
            return { earned, total: targets.length * 4 };
        }

        function progressText(earned, total) {
            if (!total) return 'No skills at this level yet';
            return earned + ' of ' + total + ' points';
        }

        function getBucket(bucketId) {
            return (dashboardData.taxonomy || []).find(b => b.bucket_id === bucketId) || null;
        }

        function getStandard(standardId) {
            for (const bucket of dashboardData.taxonomy || []) {
                const found = (bucket.standards || []).find(s => s.standard_id === standardId);
                if (found) return found;
            }
            return null;
        }

        function dotsHtml(targets) {
            return targets.map(t => {
                const s = scoreOf(t.id);
                const cls = s === null ? 'score-none' : 'score-' + s;
                const label = t.target_code + ': ' + (s === null ? 'not rated yet' : 'score ' + s);
                return `<i class="score-dot ${cls}" title="${escapeHtml(label)}"></i>`;
            }).join('');
        }

        /* ============ Buckets / Standards / Rubric ============ */

        function renderBuckets() {
            const list = document.getElementById('bucket-list');
            list.innerHTML = (dashboardData.taxonomy || []).map(bucket => {
                const targets = bucketTargets(bucket);
                const pts = pointsFor(targets);
                return `
                <button type="button" class="bucket-card ${bucket.bucket_id === state.bucketId ? 'active' : ''}" data-bucket-id="${escapeHtml(bucket.bucket_id)}">
                    <span class="bucket-code">${escapeHtml(bucket.code)}</span>
                    <span class="bucket-name">${escapeHtml(bucket.name)}</span>
                    <span class="bucket-dot-strip">${dotsHtml(targets)}</span>
                    <span class="bucket-progress">${escapeHtml(progressText(pts.earned, pts.total))}</span>
                </button>`;
            }).join('');

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

        function skillChip(t) {
            const my = scoreOf(t.id);
            return my === null
                ? '<span class="pill">Not rated</span>'
                : `<span class="score-chip score-${my}" style="background:${SCORE_COLORS[my]}">${my}</span>`;
        }

        function skillCardHtml(t, compact) {
            const my = scoreOf(t.id);
            const tint = my !== null ? 'score-tint-' + my : '';
            const active = String(t.id) === String(state.targetId) ? 'active' : '';
            return `
                <button type="button" class="target-row ${tint} ${active}" data-target-id="${escapeHtml(t.id)}">
                    <span>${skillChip(t)} ${escapeHtml(t.title)}</span>
                    ${compact ? '' : `<small style="color:#718096;font-weight:700;">${escapeHtml(t.target_code)}</small>`}
                </button>`;
        }

        function bindSkillCards(container) {
            container.querySelectorAll('[data-target-id]').forEach(button => {
                button.addEventListener('click', () => {
                    state.targetId = button.dataset.targetId;
                    renderDashboard();
                });
            });
        }

        function renderStandards() {
            const list = document.getElementById('standard-list');
            const title = document.getElementById('standard-column-title');
            const bucket = getBucket(state.bucketId);
            const standard = getStandard(state.standardId);

            // Zoomed into one skill: this column becomes the collapsed skill list
            if (state.targetId && standard) {
                title.textContent = standard.standard_id + ' Skills';
                list.innerHTML = (standard.targets || []).map(t => skillCardHtml(t, true)).join('');
                bindSkillCards(list);
                return;
            }

            title.textContent = 'Standards';
            if (!bucket) {
                list.innerHTML = '<div class="empty-panel">Select a bucket to view its standards.</div>';
                return;
            }

            list.innerHTML = (bucket.standards || []).map(standard => {
                const scores = (standard.targets || []).map(t => scoreOf(t.id)).filter(v => v !== null);
                const tint = scores.length ? 'score-tint-' + Math.min.apply(null, scores) : '';
                const pts = pointsFor(standard.targets || []);
                return `
                <button type="button" class="standard-row ${tint} ${standard.standard_id === state.standardId ? 'active' : ''}" data-standard-id="${escapeHtml(standard.standard_id)}">
                    <span class="standard-id">${escapeHtml(standard.standard_id)}</span>
                    <span class="standard-name">${escapeHtml(standard.name)}</span>
                    <span class="standard-dots">${dotsHtml(standard.targets || [])}</span>
                    <span class="standard-progress">${escapeHtml(progressText(pts.earned, pts.total))}</span>
                </button>`;
            }).join('');

            list.querySelectorAll('[data-standard-id]').forEach(button => {
                button.addEventListener('click', () => {
                    state.standardId = button.dataset.standardId;
                    state.targetId = null;
                    state.progressScope = 'standard';
                    renderDashboard();
                });
            });
        }

        function resourcePills(resources, emptyText) {
            return (resources && resources.length)
                ? resources.map(r => {
                    const body = `
                        <span>${escapeHtml(r.resource_label)}</span>
                        ${r.resource_description ? `<small>${escapeHtml(r.resource_description)}</small>` : ''}`;
                    return r.resource_url
                        ? `<a class="resource-pill" href="${escapeHtml(r.resource_url)}" target="_blank" rel="noopener noreferrer">${body}</a>`
                        : `<div class="resource-pill placeholder">${body}</div>`;
                }).join('')
                : `<div class="resource-pill placeholder"><span>${escapeHtml(emptyText)}</span></div>`;
        }

        function getTarget(targetId) {
            const standard = getStandard(state.standardId);
            return standard ? (standard.targets || []).find(t => String(t.id) === String(targetId)) || null : null;
        }

        function renderRubric() {
            const panel = document.getElementById('target-panel');
            const title = document.getElementById('target-column-title');
            const standard = getStandard(state.standardId);

            if (!standard) {
                title.innerHTML = '&nbsp;';
                panel.innerHTML = '';
                return;
            }

            const target = state.targetId ? getTarget(state.targetId) : null;

            // ===== Zoom level 2: one skill's full rubric + its specific resources =====
            if (target) {
                title.textContent = target.target_code;
                const my = scoreOf(target.id);
                const canGrade = !!window.ASL_TEACHER_GRADE;
                const hereLabel = canGrade ? escapeHtml((dashboardData.student || {}).first_name || 'Now') : 'You';
                const rows = [4, 3, 2, 1, 0].map(score => {
                    const current = my !== null && my === score;
                    return `
                    <tr class="${current ? 'rubric-row-current' : ''} ${canGrade ? 'rubric-gradable' : ''}"
                        ${canGrade ? `data-grade-score="${score}" title="Set score to ${score}"` : ''}>
                        <td class="rubric-score" style="background:${SCORE_COLORS[score]}">${score}${current ? `<span class="you-are-here">${hereLabel}</span>` : ''}</td>
                        <td>${escapeHtml((target.rubric || {})[score] || '')}</td>
                    </tr>`;
                }).join('');

                panel.innerHTML = `
                    <div class="target-standard-summary">
                        <span>${escapeHtml(target.target_code)}</span>
                        <h4>${escapeHtml(target.title)}</h4>
                        <p>${escapeHtml(target.description || standard.name)}</p>
                    </div>
                    <div class="rubric-thread ${my !== null ? 'score-tint-' + my : ''}" style="border-radius:10px;padding:10px;">
                        <h4>${skillChip(target)} ${canGrade ? 'Click a level to grade this skill' : 'Where you are on this skill'}</h4>
                        <table class="rubric-table">${rows}</table>
                    </div>
                    <div class="resource-panel">
                        <div class="resource-panel-header">
                            <span>Resources for this skill</span>
                            <strong>${escapeHtml(target.target_code)}</strong>
                        </div>
                        <div class="resource-list">${resourcePills(target.resources, 'No skill-specific resources yet — check the standard resources one level up.')}</div>
                    </div>
                `;
                if (canGrade) {
                    panel.querySelectorAll('[data-grade-score]').forEach(row => {
                        row.addEventListener('click', () => gradeTarget(target.id, Number(row.dataset.gradeScore), row));
                    });
                }
                return;
            }

            // ===== Zoom level 1: skill cards + the standard's general resources =====
            title.textContent = 'Proficiency Rubric';
            panel.innerHTML = `
                <div class="target-standard-summary">
                    <span>${escapeHtml(standard.standard_id)}</span>
                    <h4>${escapeHtml(standard.name)}</h4>
                    <p>${escapeHtml(standard.description || '')}</p>
                </div>
                <div class="target-list">
                    ${(standard.targets || []).map(t => skillCardHtml(t, false)).join('')}
                </div>
                <div class="resource-panel">
                    <div class="resource-panel-header">
                        <span>Resources</span>
                        <strong>${escapeHtml(standard.standard_id)}</strong>
                    </div>
                    <div class="resource-list">${resourcePills(standard.resources, 'No resources posted for this standard yet.')}</div>
                </div>
            `;
            bindSkillCards(panel);
        }

        /* ============ Hero progress summary ============ */

        function renderProgressSummary() {
            const context = document.getElementById('progress-context');
            const percent = document.getElementById('progress-percent');
            const count = document.getElementById('progress-count');
            const fill = document.getElementById('student-progress-fill');

            let name = 'Overall Progress';
            let targets = (dashboardData.taxonomy || []).flatMap(bucketTargets);
            const standard = getStandard(state.standardId);
            const bucket = getBucket(state.bucketId);
            if (state.progressScope === 'standard' && standard) {
                name = standard.standard_id + ' Progress';
                targets = standard.targets || [];
            } else if (state.progressScope === 'bucket' && bucket) {
                name = bucket.name + ' Progress';
                targets = bucketTargets(bucket);
            }
            const pts = pointsFor(targets);
            const pct = pts.total ? Math.round((pts.earned / pts.total) * 100) : 0;
            context.textContent = name;
            percent.textContent = pct + '%';
            count.textContent = progressText(pts.earned, pts.total);
            fill.style.width = pct + '%';
        }

        /* ============ Progress chart (SVG, old style + pace lines + overlays) ============ */

        function renderChart() {
            const svg = document.getElementById('progress-chart');
            const note = document.getElementById('chart-empty-note');
            const scopeLabel = document.getElementById('chart-scope');
            const weeks = dashboardData.weeks || [];
            const nWeeks = weeks.length;
            const bucket = getBucket(state.bucketId);
            const useBucket = state.progressScope !== 'overall' && bucket;
            const progress = dashboardData.progress || { overall: [], byBucket: {} };
            const values = useBucket ? (progress.byBucket[bucket.bucket_id] || new Array(nWeeks).fill(0)) : (progress.overall || []);
            const scopeTargets = useBucket ? bucketTargets(bucket).length : (dashboardData.target_count || 0);
            const settings = dashboardData.settings || {};

            scopeLabel.textContent = useBucket ? 'Showing ' + bucket.name : 'Showing all skill buckets';
            note.style.display = values.some(v => v > 0) ? 'none' : 'block';

            const width = 920;
            const height = 300;
            const showY2 = overlayState.attendance || overlayState.participation;
            const pad = { top: 22, right: showY2 ? 54 : 26, bottom: 58, left: 54 };
            const chartWidth = width - pad.left - pad.right;
            const chartHeight = height - pad.top - pad.bottom;
            const maxY = Math.max(scopeTargets * 4, ...values, 1);
            const xAt = i => pad.left + (i / Math.max(nWeeks - 1, 1)) * chartWidth;
            const yAt = v => pad.top + chartHeight - (v / maxY) * chartHeight;

            // student line only up to the current week
            const today = dashboardData.today || '';
            const studentPts = [];
            values.forEach((v, i) => { if (weeks[i] <= today) studentPts.push([xAt(i), yAt(v)]); });
            const studentLine = studentPts.map(p => p.join(',')).join(' ');

            // pace lines: straight from week 2 (0 pts) to the last week (targets x goal)
            const pace = (goal, cls, dash) => {
                if (nWeeks < 3 || !scopeTargets) return '';
                return `<line x1="${xAt(1)}" y1="${yAt(0)}" x2="${xAt(nWeeks - 1)}" y2="${yAt(scopeTargets * goal)}"
                    stroke-width="2.5" fill="none" stroke="${cls}" ${dash ? `stroke-dasharray="${dash}"` : ''} />`;
            };

            // month labels where the month changes
            const monthLabels = [];
            let lastMonth = '';
            weeks.forEach((w, i) => {
                const m = new Date(w + 'T12:00:00').toLocaleDateString(undefined, { month: 'short' });
                if (m !== lastMonth) {
                    monthLabels.push(`<text x="${xAt(i)}" y="${height - 20}" text-anchor="middle" class="chart-label">${escapeHtml(m)}</text>`);
                    lastMonth = m;
                }
            });

            const weekLines = [];
            for (let i = 0; i < nWeeks; i++) {
                weekLines.push(`<line x1="${xAt(i)}" y1="${pad.top}" x2="${xAt(i)}" y2="${pad.top + chartHeight}" class="chart-week-line ${i % 4 === 0 ? 'month' : ''}" />`);
            }

            // overlays on a second right-hand axis
            let overlaySvg = '';
            let y2AxisSvg = '';
            if (showY2) {
                const absS = overlayState.attendance ? (dashboardData.absences || []) : [];
                const partS = overlayState.participation ? (dashboardData.participation || []) : [];
                const overlayVals = absS.concat(partS).filter(v => v != null).map(Number);
                const maxY2 = Math.max(...(overlayVals.length ? overlayVals : [1]), 1);
                const y2At = v => pad.top + chartHeight - (v / maxY2) * chartHeight;
                const drawSeries = (series, color) => {
                    const segs = [];
                    let cur = [];
                    series.forEach((v, i) => {
                        if (v == null) { if (cur.length) { segs.push(cur); cur = []; } }
                        else cur.push([xAt(i), y2At(Number(v))]);
                    });
                    if (cur.length) segs.push(cur);
                    return segs.map(seg =>
                        `<polyline points="${seg.map(p => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" />`).join('') +
                        segs.flat().map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${color}"></circle>`).join('');
                };
                if (overlayState.attendance) overlaySvg += drawSeries(absS, '#f6993f');
                if (overlayState.participation) overlaySvg += drawSeries(partS, '#9f7aea');
                const rx = pad.left + chartWidth;
                y2AxisSvg = `
                    <line x1="${rx}" y1="${pad.top}" x2="${rx}" y2="${pad.top + chartHeight}" class="chart-axis"></line>
                    <text x="${rx + 8}" y="${pad.top + 5}" text-anchor="start" class="chart-label">${formatNumber(maxY2)}</text>
                    <text x="${rx + 8}" y="${pad.top + chartHeight}" text-anchor="start" class="chart-label">0</text>
                    <text x="${rx + 8}" y="14" text-anchor="start" class="chart-axis-label">Wk</text>`;
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
                ${pace(Number(settings.pace_red_goal || 2), '#e05252', '3 5')}
                ${pace(Number(settings.pace_blue_goal || 3.7), '#4a90d9', '7 5')}
                ${pace(Number(settings.pace_green_goal || 3), '#4caf6d', '')}
                <polyline points="${studentLine}" class="chart-line"></polyline>
                ${studentPts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" class="chart-dot"></circle>`).join('')}
                ${overlaySvg}
                ${y2AxisSvg}
                ${monthLabels.join('')}
            `;

            document.getElementById('legend-absences').style.display = overlayState.attendance ? '' : 'none';
            document.getElementById('legend-participation').style.display = overlayState.participation ? '' : 'none';
        }

        /* ============ Weekly log cards ============ */

        function formatMeetingDate(iso) {
            if (!iso) return '';
            const parts = iso.split('-');
            if (parts.length !== 3) return iso;
            const d = new Date(parts[0], parts[1] - 1, parts[2]);
            return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        }

        function renderComparisons() {
            const cards = document.getElementById('comparison-cards');
            const meetings = dashboardData.meetings || [];
            const totalAbs = meetings.reduce((a, m) => a + (Number(m.absences) || 0), 0);
            const latestPart = meetings.find(m => m.participation_points !== null && m.participation_points !== undefined);
            const withNotes = meetings.filter(m => m.notes && String(m.notes).trim());

            cards.innerHTML = `
                <button type="button" class="comparison-summary-card ${overlayState.attendance ? 'active' : ''}" data-metric="attendance">
                    <span class="comparison-card-label">Attendance</span>
                    <strong class="comparison-card-value">${totalAbs}<small> absence${totalAbs === 1 ? '' : 's'}</small></strong>
                    <span class="comparison-card-meta">${overlayState.attendance ? 'Shown on graph — click to hide' : 'Click to show on the graph'}</span>
                </button>
                <button type="button" class="comparison-summary-card ${overlayState.participation ? 'active' : ''}" data-metric="participation">
                    <span class="comparison-card-label">Participation</span>
                    <strong class="comparison-card-value">${latestPart ? escapeHtml(latestPart.participation_points) : '&mdash;'}<small> pts this week</small></strong>
                    <span class="comparison-card-meta">${overlayState.participation ? 'Shown on graph — click to hide' : 'Click to show on the graph'}</span>
                </button>
                <button type="button" class="comparison-summary-card" data-metric="notes">
                    <span class="comparison-card-label">Notes</span>
                    <strong class="comparison-card-value">${withNotes.length}<small> note${withNotes.length === 1 ? '' : 's'}</small></strong>
                    <span class="comparison-card-meta">${withNotes.length ? 'Most recent: ' + escapeHtml(formatMeetingDate(withNotes[0].meeting_date)) : 'No notes yet'}</span>
                </button>
            `;

            cards.querySelectorAll('[data-metric]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const metric = btn.dataset.metric;
                    if (metric === 'notes') { openNotes(); return; }
                    overlayState[metric] = !overlayState[metric];
                    renderChart();
                    renderComparisons();
                });
            });
        }

        function openNotes() {
            const withNotes = (dashboardData.meetings || []).filter(m => m.notes && String(m.notes).trim());
            const body = document.getElementById('notes-body');
            if (!withNotes.length) {
                body.innerHTML = '<div class="empty-panel">No meeting notes yet.</div>';
            } else {
                const byMonth = {};
                withNotes.forEach(m => {
                    const d = new Date(m.meeting_date + 'T12:00:00');
                    const key = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
                    (byMonth[key] = byMonth[key] || []).push(m);
                });
                body.innerHTML = Object.entries(byMonth).map(([month, notes]) => `
                    <div class="notes-month">
                        <h4>${escapeHtml(month)}</h4>
                        ${notes.map(m => `
                            <article class="meeting-note-card">
                                <header>
                                    <strong>Week of ${escapeHtml(formatMeetingDate(m.meeting_date))}</strong>
                                    <span>Absences: ${escapeHtml(m.absences)}${m.participation_points != null ? ' &middot; Participation: ' + escapeHtml(m.participation_points) + ' pts' : ''}</span>
                                </header>
                                <p>${escapeHtml(m.notes)}</p>
                            </article>`).join('')}
                    </div>`).join('');
            }
            document.getElementById('notesModal').classList.add('show');
        }
        function closeNotes() { document.getElementById('notesModal').classList.remove('show'); }
        window.addEventListener('click', e => { if (e.target === document.getElementById('notesModal')) closeNotes(); });

        /* ============ Layout plumbing (same as the old dashboard) ============ */

        function applyCurriculumLayout() {
            const grid = document.getElementById('curriculum-grid');
            const backBtn = document.getElementById('back-to-buckets');
            if (!grid) return;
            const focused = !!state.standardId;
            grid.classList.toggle('standard-focus', focused);
            if (backBtn) {
                backBtn.style.display = focused ? '' : 'none';
                backBtn.innerHTML = state.targetId ? '&larr; Back to Standards' : '&larr; Back to Buckets';
            }
        }

        function backToBuckets() {
            if (state.targetId) {
                state.targetId = null; // zoom out one step: skill -> standard view
            } else {
                state.standardId = null;
                state.progressScope = state.bucketId ? 'bucket' : 'overall';
            }
            renderDashboard();
        }

        function renderDashboard() {
            renderBuckets();
            renderStandards();
            renderRubric();
            applyCurriculumLayout();
            renderProgressSummary();
            renderChart();
            renderComparisons();
        }

        document.getElementById('back-to-buckets').addEventListener('click', backToBuckets);
        renderDashboard();
    </script>
</body>
</html>
