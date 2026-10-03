<?php
/**
 * ASL Hub data layer — read queries shared by student + teacher views.
 */

require_once __DIR__ . '/calendar.php';

/** Active taxonomy for one ASL level: buckets -> standards -> targets (+rubric). */
function aslhub_taxonomy(PDO $pdo, int $level): array {
    $buckets = $pdo->query("SELECT * FROM asl_skill_buckets WHERE active = 1 ORDER BY order_index, bucket_id")->fetchAll();
    $standards = $pdo->query("SELECT * FROM asl_standards WHERE active = 1 ORDER BY order_index, standard_id")->fetchAll();
    $stmt = $pdo->prepare("SELECT * FROM asl_learning_targets WHERE active = 1 AND asl_level = ? ORDER BY standard_id, order_index, target_code");
    $stmt->execute([$level]);
    $targets = $stmt->fetchAll();

    $targetIds = array_column($targets, 'id');
    $rubrics = [];
    if ($targetIds) {
        $in = implode(',', array_fill(0, count($targetIds), '?'));
        $stmt = $pdo->prepare("SELECT * FROM asl_rubric_levels WHERE learning_target_id IN ($in) ORDER BY score DESC");
        $stmt->execute($targetIds);
        foreach ($stmt->fetchAll() as $r) {
            $rubrics[(int)$r['learning_target_id']][(int)$r['score']] = $r['descriptor'];
        }
    }

    // resources: attached to a specific target, or to a standard (optionally level-scoped)
    $resources = $pdo->query("SELECT * FROM asl_learning_target_resources ORDER BY order_index, id")->fetchAll();
    $resByTarget = [];
    $resByStandard = [];
    foreach ($resources as $r) {
        if (!empty($r['learning_target_id'])) {
            $resByTarget[(int)$r['learning_target_id']][] = $r;
        } elseif (!empty($r['standard_id'])) {
            if ($r['asl_level'] === null || (int)$r['asl_level'] === $level) {
                $resByStandard[$r['standard_id']][] = $r;
            }
        }
    }

    $targetsByStandard = [];
    foreach ($targets as $t) {
        $t['rubric'] = $rubrics[(int)$t['id']] ?? [];
        $t['resources'] = $resByTarget[(int)$t['id']] ?? [];
        $targetsByStandard[$t['standard_id']][] = $t;
    }

    $standardsByBucket = [];
    $metadata = [];
    foreach ($pdo->query("SELECT setting_key, setting_value FROM asl_settings WHERE setting_key LIKE 'competency_%'") as $row) {
        $metadata[substr($row['setting_key'], 11)] = json_decode($row['setting_value'], true);
    }
    foreach ($standards as $s) {
        $s['competency'] = $metadata[$s['standard_id']] ?? null;
        $s['targets'] = $targetsByStandard[$s['standard_id']] ?? [];
        if ($s['competency']) foreach ($s['targets'] as &$t) {
            $t['display_code'] = $s['competency']['number'] . '.' . ((int)$t['order_index'] + 1) .
                ($t['sub_code'] === 'S' ? '' : ' ' . ($t['sub_code'] === 'E' ? 'Expression' : 'Reception'));
        }
        unset($t);
        $s['resources'] = $resByStandard[$s['standard_id']] ?? [];
        if ($s['targets']) { // only show standards that have targets at this level
            $standardsByBucket[$s['bucket_id']][] = $s;
        }
    }

    $out = [];
    foreach ($buckets as $b) {
        $b['standards'] = $standardsByBucket[$b['bucket_id']] ?? [];
        if ($b['standards']) $out[] = $b;
    }
    return $out;
}

/** Level one is a display/calculation baseline, never a synthetic assessment event. */
function aslhub_effective_score($score): int { return max(1, (int)$score); }
function aslhub_growth_points($score): int { return aslhub_effective_score($score) - 1; }

/** Current scores for a student: [target_id => score]. */
function aslhub_student_scores(PDO $pdo, int $userId): array {
    $stmt = $pdo->prepare("SELECT learning_target_id, score FROM user_learning_targets WHERE user_id = ?");
    $stmt->execute([$userId]);
    $out = [];
    foreach ($stmt->fetchAll() as $r) {
        $out[(int)$r['learning_target_id']] = aslhub_effective_score($r['score']);
    }
    return $out;
}

function aslhub_student_self_assessments(PDO $pdo, int $userId): object {
    $stmt = $pdo->prepare('SELECT learning_target_id, score FROM asl_self_assessments WHERE user_id=?');
    $stmt->execute([$userId]);
    $out = new stdClass();
    foreach ($stmt as $row) $out->{(string)$row['learning_target_id']} = (int)$row['score'];
    return $out;
}

/** Current readiness differences, restricted to the already authorized roster. */
function aslhub_ready_for_review(PDO $pdo, array $students): array {
    if (!$students) return [];
    $ids = array_map(fn($s) => (int)$s['id'], $students);
    $in = implode(',', array_fill(0, count($ids), '?'));
    $baseline = 'CASE WHEN g.score > 1 THEN g.score ELSE 1 END';
    $q = $pdo->prepare("SELECT a.user_id, a.learning_target_id, a.score AS student_score,
            $baseline AS teacher_score, u.first_name, u.last_name, u.level, u.class_period,
            t.title, t.sub_code, s.name AS competency
        FROM asl_self_assessments a
        JOIN users u ON u.id=a.user_id AND u.is_teacher=0 AND u.is_active=1 AND u.is_unclaimed=0
        JOIN asl_learning_targets t ON t.id=a.learning_target_id AND t.active=1 AND t.asl_level=u.level
        JOIN asl_standards s ON s.standard_id=t.standard_id AND s.active=1
        LEFT JOIN user_learning_targets g ON g.user_id=a.user_id AND g.learning_target_id=a.learning_target_id
        WHERE a.user_id IN ($in) AND a.score > ($baseline)
        ORDER BY u.last_name, u.first_name, u.id, s.order_index, t.order_index, t.sub_code");
    $q->execute($ids);
    return $q->fetchAll();
}

/** Monday of the week containing $date. */
function aslhub_week_start(string $date): string {
    $ts = strtotime($date);
    return date('Y-m-d', strtotime('monday this week', $ts));
}

/** Active reporting blocks, including elapsed days for a partial current block. */
function aslhub_reporting_blocks(PDO $pdo): array {
    aslhub_finalize_reporting_blocks($pdo);
    $timezone = aslhub_setting($pdo, 'school_timezone', 'America/Los_Angeles');
    try { $today = (new DateTimeImmutable('now', new DateTimeZone($timezone)))->format('Y-m-d'); }
    catch (Throwable $e) { $today = date('Y-m-d'); }
    $rows = $pdo->query("SELECT * FROM asl_reporting_blocks WHERE active=1 ORDER BY block_index")->fetchAll();
    $attendanceDays = aslhub_attendance_calendar_days($pdo);
    $elapsedStmt = $pdo->prepare("SELECT COUNT(*) AS c FROM asl_calendar_days
        WHERE is_instructional=1 AND school_date BETWEEN ? AND ? AND school_date <= ?");
    foreach ($rows as &$row) {
        $elapsedStmt->execute([$row['start_date'], $row['end_date'], $today]);
        $elapsed = (int)$elapsedStmt->fetch()['c'];
        $startMonth = (new DateTimeImmutable($row['start_date']))->format('M');
        $endMonth = (new DateTimeImmutable($row['end_date']))->format('M');
        $row = [
            'id' => (int)$row['id'], 'block_index' => (int)$row['block_index'],
            'label' => $row['label'], 'start_date' => $row['start_date'], 'end_date' => $row['end_date'],
            'instructional_days' => (int)$row['instructional_days'],
            'instructional_days_elapsed' => $elapsed,
            'is_complete' => $row['end_date'] < $today,
            'is_current' => $row['start_date'] <= $today && $row['end_date'] >= $today,
            'is_finalized' => $row['finalized_at'] !== null,
            'month_label' => $startMonth === $endMonth ? $endMonth : "$startMonth-$endMonth",
            'participation_max' => aslhub_participation_max((int)$row['instructional_days']),
        ];
        $row['attendance_periods'] = aslhub_attendance_periods($row, $attendanceDays, $today);
    }
    unset($row);
    return $rows;
}

/** Proficiency snapshots evaluated at every block end (or today for the partial block). */
function aslhub_block_progress(PDO $pdo, int $userId, int $level, array $blocks): array {
    if (!$blocks) return ['overall' => [], 'byBucket' => [], 'byStandard' => []];
    $stmt = $pdo->prepare("SELECT h.learning_target_id, h.score, h.scored_at, s.bucket_id, s.standard_id
        FROM user_learning_target_score_history h
        JOIN asl_learning_targets t ON t.id=h.learning_target_id
        JOIN asl_standards s ON s.standard_id=t.standard_id
        WHERE h.user_id=? AND t.active=1 AND t.asl_level=? ORDER BY h.scored_at, h.id");
    $stmt->execute([$userId, $level]);
    $events = $stmt->fetchAll();
    $timezone = aslhub_setting($pdo, 'school_timezone', 'America/Los_Angeles');
    try { $today = (new DateTimeImmutable('now', new DateTimeZone($timezone)))->format('Y-m-d'); }
    catch (Throwable $e) { $today = date('Y-m-d'); }
    return aslhub_progress_from_events($events, $blocks, $today);
}

/** Pure score-history replay used by the dashboard and disposable tests. */
function aslhub_progress_from_events(array $events, array $blocks, string $today): array {
    $latest = []; $bucketOf = []; $standardOf = []; $overall = []; $byBucket = []; $byStandard = []; $i = 0; $n = count($events);
    foreach ($blocks as $block) {
        if ($block['start_date'] > $today) {
            $overall[] = null;
            foreach ($byBucket as &$series) $series[] = null;
            unset($series);
            foreach ($byStandard as &$series) $series[] = null;
            unset($series);
            continue;
        }
        $cutoff = min($block['end_date'], $today) . ' 23:59:59';
        while ($i < $n && $events[$i]['scored_at'] <= $cutoff) {
            $tid = (int)$events[$i]['learning_target_id'];
            $latest[$tid] = (int)$events[$i]['score'];
            $bucketOf[$tid] = $events[$i]['bucket_id'];
            $standardOf[$tid] = $events[$i]['standard_id'];
            $i++;
        }
        $overall[] = array_sum(array_map('aslhub_growth_points', $latest));
        $totals = []; $standardTotals = [];
        foreach ($latest as $tid => $score) {
            $score = aslhub_growth_points($score);
            $bucket = $bucketOf[$tid];
            $totals[$bucket] = ($totals[$bucket] ?? 0) + $score;
            $standard = $standardOf[$tid];
            $standardTotals[$standard] = ($standardTotals[$standard] ?? 0) + $score;
        }
        foreach ($totals as $bucket => $_) {
            if (!isset($byBucket[$bucket])) $byBucket[$bucket] = array_fill(0, count($overall) - 1, 0);
        }
        foreach ($byBucket as $bucket => &$series) $series[] = $totals[$bucket] ?? 0;
        unset($series);
        foreach ($standardTotals as $standard => $_) {
            if (!isset($byStandard[$standard])) $byStandard[$standard] = array_fill(0, count($overall) - 1, 0);
        }
        foreach ($byStandard as $standard => &$series) $series[] = $standardTotals[$standard] ?? 0;
        unset($series);
    }
    return ['overall' => $overall, 'byBucket' => $byBucket, 'byStandard' => $byStandard];
}

/** Weekly log rows for a student, newest first. */
function aslhub_student_meetings(PDO $pdo, int $userId): array {
    $stmt = $pdo->prepare("SELECT meeting_date, absences, participation_pct, participation_points, notes
        FROM asl_student_meetings WHERE user_id = ? ORDER BY meeting_date DESC");
    $stmt->execute([$userId]);
    return $stmt->fetchAll();
}

/** Attendance and participation series aligned one-for-one with reporting blocks. */
function aslhub_block_metric_payload(PDO $pdo, array $student, array $blocks): array {
    $empty = [
        'attendance' => ['absences' => [], 'block_percent' => [], 'ytd_percent' => [],
            'class_block_average_percent' => [], 'class_ytd_average_percent' => [],
            'absence_percentile' => [], 'ytd_absences' => []],
        'participation_metrics' => ['points' => [], 'max_points' => [], 'percent' => [],
            'class_average_percent' => []],
    ];
    if (!$blocks) return $empty;
    $peerQuery = $pdo->prepare("SELECT id, teacher, class_period, level FROM users
        WHERE is_teacher=FALSE AND is_active=1 AND teacher=? ORDER BY id");
    $peerQuery->execute([$student['teacher']]);
    $peers = $peerQuery->fetchAll();
    $peerIds = array_map('intval', array_column($peers, 'id'));
    $classIds = array_map('intval', array_column(array_filter($peers, fn($peer) =>
        $peer['teacher'] === $student['teacher'] &&
        (string)$peer['class_period'] === (string)$student['class_period'] &&
        (int)$peer['level'] === (int)$student['level']), 'id'));
    if (!in_array((int)$student['id'], $peerIds, true)) $peerIds[] = (int)$student['id'];
    if (!in_array((int)$student['id'], $classIds, true)) $classIds[] = (int)$student['id'];
    $blockIds = array_column($blocks, 'id');
    $metrics = [];
    if ($peerIds && $blockIds) {
        $uIn = implode(',', array_fill(0, count($peerIds), '?'));
        $bIn = implode(',', array_fill(0, count($blockIds), '?'));
        $stmt = $pdo->prepare("SELECT * FROM asl_student_block_metrics WHERE user_id IN ($uIn) AND block_id IN ($bIn)");
        $stmt->execute(array_merge($peerIds, $blockIds));
        foreach ($stmt->fetchAll() as $row) $metrics[(int)$row['user_id']][(int)$row['block_id']] = $row;
    }
    return aslhub_metrics_from_rows((int)$student['id'], $blocks, $metrics, $peerIds, $classIds, $empty);
}

/** All-student comparison exposes only aggregates. Ties are not "more often". */
function aslhub_metrics_from_rows(int $sid, array $blocks, array $metrics, array $peerIds, array $classIds, array $empty): array {
    $attendance = $empty['attendance']; $participation = $empty['participation_metrics'];
    $studentCumAbs = 0; $studentCumDays = 0;
    $peerCumAbs = array_fill_keys($peerIds, 0); $peerCumDays = array_fill_keys($peerIds, 0);
    $semesterAbsences = [];
    foreach ($blocks as $block) {
        $elapsed = (int)$block['instructional_days_elapsed'];
        if ($elapsed <= 0) {
            foreach ($attendance as &$series) $series[] = null; unset($series);
            foreach ($participation as &$series) $series[] = null; unset($series);
            continue;
        }
        $row = $metrics[$sid][$block['id']] ?? null;
        $periods = $block['attendance_periods'] ?? [['semester'=>'default', 'field'=>'absences', 'instructional_days_elapsed'=>$elapsed]];
        $attendanceElapsed = 0;
        $blockAbsences = array_fill_keys(array_unique(array_merge([$sid], $peerIds)), 0);
        foreach ($periods as $period) {
            if ($period['instructional_days_elapsed'] <= 0) continue;
            $attendanceElapsed += $period['instructional_days_elapsed'];
            foreach ($blockAbsences as $id => $_) {
                $previous = $semesterAbsences[$id][$period['semester']] ?? 0;
                $value = $metrics[$id][$block['id']][$period['field']] ?? $previous;
                $blockAbsences[$id] += max(0, (int)$value - $previous);
                $semesterAbsences[$id][$period['semester']] = (int)$value;
            }
        }
        $attendance['absences'][] = $blockAbsences[$sid];
        $attendance['block_percent'][] = $attendanceElapsed > 0 ? round(100 * max(0, $attendanceElapsed - $blockAbsences[$sid]) / $attendanceElapsed, 1) : null;
        $studentCumAbs = array_sum($semesterAbsences[$sid] ?? []); $studentCumDays += $attendanceElapsed;
        $attendance['ytd_percent'][] = $studentCumDays > 0 ? round(100 * max(0, $studentCumDays - $studentCumAbs) / $studentCumDays, 1) : null;
        $classBlock = []; $classYtd = [];
        foreach ($peerIds as $peerId) {
            $peerCumAbs[$peerId] = array_sum($semesterAbsences[$peerId] ?? []);
            $peerCumDays[$peerId] += $attendanceElapsed;
            // Attendance compares every active student assigned to this teacher.
            if ($attendanceElapsed > 0) $classBlock[] = 100 * max(0, $attendanceElapsed - $blockAbsences[$peerId]) / $attendanceElapsed;
            if ($peerCumDays[$peerId] > 0) $classYtd[] = 100 * max(0, $peerCumDays[$peerId] - $peerCumAbs[$peerId]) / $peerCumDays[$peerId];
        }
        $others = array_values(array_filter($peerIds, fn($id) => $id !== $sid));
        $lessAbsent = count(array_filter($others, fn($id) =>
            $peerCumAbs[$id] * $studentCumDays < $studentCumAbs * $peerCumDays[$id]));
        $attendance['absence_percentile'][] = $others ? round(100 * $lessAbsent / count($others), 1) : null;
        $attendance['ytd_absences'][] = $studentCumAbs;
        $attendance['class_block_average_percent'][] = $classBlock ? round(array_sum($classBlock) / count($classBlock), 1) : null;
        $attendance['class_ytd_average_percent'][] = $classYtd ? round(array_sum($classYtd) / count($classYtd), 1) : null;

        $max = aslhub_participation_max((int)$block['instructional_days']);
        $points = $row && $row['participation_points'] !== null ? (int)$row['participation_points'] : $max;
        $participation['points'][] = $points;
        $participation['max_points'][] = $max;
        $participation['percent'][] = round(100 * min($points, $max) / $max, 1);
        $classPart = [];
        foreach ($classIds as $peerId) {
            $peerRow = $metrics[$peerId][$block['id']] ?? null;
            $peerMax = $max;
            $peerPoints = $peerRow && $peerRow['participation_points'] !== null ? (int)$peerRow['participation_points'] : $peerMax;
            $classPart[] = 100 * min($peerPoints, $peerMax) / $peerMax;
        }
        $participation['class_average_percent'][] = round(array_sum($classPart) / max(1, count($classPart)), 1);

    }
    return ['attendance' => $attendance, 'participation_metrics' => $participation];
}

/** Count of gradable targets for a level (drives the pace-line slopes). */
function aslhub_target_count(PDO $pdo, int $level): int {
    $stmt = $pdo->prepare("SELECT COUNT(*) AS c FROM asl_learning_targets WHERE active = 1 AND asl_level = ?");
    $stmt->execute([$level]);
    return (int)$stmt->fetch()['c'];
}

/**
 * Everything the student dashboard needs, as one JSON-ready array.
 * Also used by the teacher's student-detail view.
 */
function aslhub_dashboard_payload(PDO $pdo, array $student): array {
    $level = (int)($student['level'] ?? 1) ?: 1;
    $settings = aslhub_dashboard_settings($pdo);
    $taxonomy = aslhub_taxonomy($pdo, $level);
    $scores = aslhub_student_scores($pdo, (int)$student['id']);
    $targetCount = aslhub_target_count($pdo, $level);
    $reportingBlocks = aslhub_reporting_blocks($pdo);
    $blockMetrics = aslhub_block_metric_payload($pdo, $student, $reportingBlocks);

    $meetings = aslhub_student_meetings($pdo, (int)$student['id']);

    return [
        'student' => [
            'id' => (int)$student['id'],
            'first_name' => $student['first_name'],
            'last_name' => $student['last_name'],
            'level' => $level,
            'class_period' => $student['class_period'],
            'teacher' => $student['teacher'],
        ],
        'settings' => $settings,
        'reporting_blocks' => $reportingBlocks,
        'target_count' => $targetCount,
        'progress' => aslhub_block_progress($pdo, (int)$student['id'], $level, $reportingBlocks),
        'today' => date('Y-m-d'),
        'attendance' => $blockMetrics['attendance'],
        'participation_metrics' => $blockMetrics['participation_metrics'],
        'meetings' => $meetings,
        'taxonomy' => $taxonomy,
        'scores' => $scores ? array_combine(array_map('strval', array_keys($scores)), array_values($scores)) : new stdClass(),
        'self_assessments' => aslhub_student_self_assessments($pdo, (int)$student['id']),
    ];
}
