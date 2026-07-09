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
    foreach ($standards as $s) {
        $s['targets'] = $targetsByStandard[$s['standard_id']] ?? [];
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

/** Current scores for a student: [target_id => score]. */
function aslhub_student_scores(PDO $pdo, int $userId): array {
    $stmt = $pdo->prepare("SELECT learning_target_id, score FROM user_learning_targets WHERE user_id = ?");
    $stmt->execute([$userId]);
    $out = [];
    foreach ($stmt->fetchAll() as $r) {
        if ($r['score'] !== null) $out[(int)$r['learning_target_id']] = (int)$r['score'];
    }
    return $out;
}

/** Monday of the week containing $date. */
function aslhub_week_start(string $date): string {
    $ts = strtotime($date);
    return date('Y-m-d', strtotime('monday this week', $ts));
}

/** All instructional week-start dates between year_start and year_end. */
function aslhub_year_weeks(array $settings): array {
    $weeks = [];
    $cur = strtotime(aslhub_week_start($settings['year_start']));
    $end = strtotime($settings['year_end']);
    while ($cur <= $end) {
        $weeks[] = date('Y-m-d', $cur);
        $cur = strtotime('+1 week', $cur);
    }
    return $weeks;
}

/**
 * Weekly cumulative points for a student, built from the append-only score
 * history. Points at week W = sum over targets of the latest score recorded
 * on or before the end of W. Only targets at the student's level count.
 * Returns ['overall' => [...], 'byBucket' => ['CLS' => [...], ...]].
 */
function aslhub_weekly_progress(PDO $pdo, int $userId, int $level, array $weeks): array {
    $stmt = $pdo->prepare("
        SELECT h.learning_target_id, h.score, h.scored_at, s.bucket_id
        FROM user_learning_target_score_history h
        JOIN asl_learning_targets t ON t.id = h.learning_target_id
        JOIN asl_standards s ON s.standard_id = t.standard_id
        WHERE h.user_id = ? AND t.active = 1 AND t.asl_level = ?
        ORDER BY h.scored_at ASC, h.id ASC");
    $stmt->execute([$userId, $level]);
    $events = $stmt->fetchAll();

    $overall = [];
    $byBucket = [];
    $latest = []; // target_id => score, replayed through time
    $bucketOf = []; // target_id => bucket_id
    $i = 0;
    $n = count($events);
    foreach ($weeks as $weekStart) {
        $weekEnd = date('Y-m-d 23:59:59', strtotime($weekStart . ' +6 days'));
        while ($i < $n && $events[$i]['scored_at'] <= $weekEnd) {
            $tid = (int)$events[$i]['learning_target_id'];
            $latest[$tid] = (int)$events[$i]['score'];
            $bucketOf[$tid] = $events[$i]['bucket_id'];
            $i++;
        }
        $overall[] = array_sum($latest);
        $bucketTotals = [];
        foreach ($latest as $tid => $score) {
            $b = $bucketOf[$tid];
            $bucketTotals[$b] = ($bucketTotals[$b] ?? 0) + $score;
        }
        foreach ($bucketTotals as $b => $total) {
            // pad any bucket series that started later
            if (!isset($byBucket[$b])) $byBucket[$b] = array_fill(0, count($overall) - 1, 0);
        }
        foreach ($byBucket as $b => &$series) {
            $series[] = $bucketTotals[$b] ?? 0;
        }
        unset($series);
    }
    return ['overall' => $overall, 'byBucket' => $byBucket];
}

/** Active reporting blocks, including elapsed days for a partial current block. */
function aslhub_reporting_blocks(PDO $pdo): array {
    aslhub_finalize_reporting_blocks($pdo);
    $timezone = aslhub_setting($pdo, 'school_timezone', 'America/Los_Angeles');
    try { $today = (new DateTimeImmutable('now', new DateTimeZone($timezone)))->format('Y-m-d'); }
    catch (Throwable $e) { $today = date('Y-m-d'); }
    $rows = $pdo->query("SELECT * FROM asl_reporting_blocks WHERE active=1 ORDER BY block_index")->fetchAll();
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
            'participation_max' => (int)$row['participation_max'],
        ];
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
        $overall[] = array_sum($latest);
        $totals = []; $standardTotals = [];
        foreach ($latest as $tid => $score) {
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
            'class_block_average_percent' => [], 'class_ytd_average_percent' => []],
        'participation_metrics' => ['points' => [], 'max_points' => [], 'percent' => [],
            'rolling_4_block_percent' => [], 'class_average_percent' => []],
    ];
    if (!$blocks) return $empty;
    $peerStmt = $pdo->prepare("SELECT id FROM users WHERE is_teacher=FALSE AND is_active=1
        AND teacher=? AND class_period=? AND level=? ORDER BY id");
    $peerStmt->execute([$student['teacher'], $student['class_period'], $student['level']]);
    $peerIds = array_map('intval', $peerStmt->fetchAll(PDO::FETCH_COLUMN));
    if (!in_array((int)$student['id'], $peerIds, true)) $peerIds[] = (int)$student['id'];
    $blockIds = array_column($blocks, 'id');
    $metrics = [];
    if ($peerIds && $blockIds) {
        $uIn = implode(',', array_fill(0, count($peerIds), '?'));
        $bIn = implode(',', array_fill(0, count($blockIds), '?'));
        $stmt = $pdo->prepare("SELECT * FROM asl_student_block_metrics WHERE user_id IN ($uIn) AND block_id IN ($bIn)");
        $stmt->execute(array_merge($peerIds, $blockIds));
        foreach ($stmt->fetchAll() as $row) $metrics[(int)$row['user_id']][(int)$row['block_id']] = $row;
    }
    $sid = (int)$student['id'];
    $attendance = $empty['attendance']; $participation = $empty['participation_metrics'];
    $studentCumAbs = 0; $studentCumDays = 0;
    $peerCumAbs = array_fill_keys($peerIds, 0); $peerCumDays = array_fill_keys($peerIds, 0);
    foreach ($blocks as $block) {
        $elapsed = (int)$block['instructional_days_elapsed'];
        if ($elapsed <= 0) {
            foreach ($attendance as &$series) $series[] = null; unset($series);
            foreach ($participation as &$series) $series[] = null; unset($series);
            continue;
        }
        $row = $metrics[$sid][$block['id']] ?? null;
        $abs = $row && $row['absences'] !== null ? (int)$row['absences'] : 0;
        $effectiveAbs = min($abs, $elapsed);
        $attendance['absences'][] = $abs;
        $attendance['block_percent'][] = round(100 * max(0, $elapsed - $effectiveAbs) / $elapsed, 1);
        $studentCumAbs += $effectiveAbs; $studentCumDays += $elapsed;
        $attendance['ytd_percent'][] = round(100 * max(0, $studentCumDays - $studentCumAbs) / $studentCumDays, 1);
        $classBlock = []; $classYtd = [];
        foreach ($peerIds as $peerId) {
            $peerRow = $metrics[$peerId][$block['id']] ?? null;
            $peerAbs = $peerRow && $peerRow['absences'] !== null ? min((int)$peerRow['absences'], $elapsed) : 0;
            $classBlock[] = 100 * max(0, $elapsed - $peerAbs) / $elapsed;
            $peerCumAbs[$peerId] += $peerAbs; $peerCumDays[$peerId] += $elapsed;
            $classYtd[] = 100 * max(0, $peerCumDays[$peerId] - $peerCumAbs[$peerId]) / $peerCumDays[$peerId];
        }
        $attendance['class_block_average_percent'][] = round(array_sum($classBlock) / max(1, count($classBlock)), 1);
        $attendance['class_ytd_average_percent'][] = round(array_sum($classYtd) / max(1, count($classYtd)), 1);

        $max = $row ? max(1, (int)$row['participation_max']) : (int)$block['participation_max'];
        $points = $row && $row['participation_points'] !== null ? (int)$row['participation_points'] : $max;
        $participation['points'][] = $points;
        $participation['max_points'][] = $max;
        $participation['percent'][] = round(100 * min($points, $max) / $max, 1);
        $classPart = [];
        foreach ($peerIds as $peerId) {
            $peerRow = $metrics[$peerId][$block['id']] ?? null;
            $peerMax = $peerRow ? max(1, (int)$peerRow['participation_max']) : (int)$block['participation_max'];
            $peerPoints = $peerRow && $peerRow['participation_points'] !== null ? (int)$peerRow['participation_points'] : $peerMax;
            $classPart[] = 100 * min($peerPoints, $peerMax) / $peerMax;
        }
        $participation['class_average_percent'][] = round(array_sum($classPart) / max(1, count($classPart)), 1);
        $window = array_slice($participation['percent'], max(0, count($participation['percent']) - 4));
        $participation['rolling_4_block_percent'][] = round(array_sum($window) / count($window), 1);
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
    $settings = aslhub_year_settings($pdo);
    $weeks = aslhub_year_weeks($settings);
    $taxonomy = aslhub_taxonomy($pdo, $level);
    $scores = aslhub_student_scores($pdo, (int)$student['id']);
    $targetCount = aslhub_target_count($pdo, $level);
    $reportingBlocks = aslhub_reporting_blocks($pdo);
    $blockMetrics = aslhub_block_metric_payload($pdo, $student, $reportingBlocks);

    $meetings = aslhub_student_meetings($pdo, (int)$student['id']);
    $byWeek = [];
    foreach ($meetings as $m) $byWeek[$m['meeting_date']] = $m;
    $absSeries = [];
    $partSeries = [];
    foreach ($weeks as $w) {
        $absSeries[] = isset($byWeek[$w]) ? (int)$byWeek[$w]['absences'] : null;
        $partSeries[] = isset($byWeek[$w]) && $byWeek[$w]['participation_points'] !== null
            ? (int)$byWeek[$w]['participation_points'] : null;
    }

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
        'weeks' => $weeks,
        'reporting_blocks' => $reportingBlocks,
        'target_count' => $targetCount,
        'progress' => $reportingBlocks
            ? aslhub_block_progress($pdo, (int)$student['id'], $level, $reportingBlocks)
            : aslhub_weekly_progress($pdo, (int)$student['id'], $level, $weeks),
        'weekly_progress' => aslhub_weekly_progress($pdo, (int)$student['id'], $level, $weeks),
        'today' => date('Y-m-d'),
        'absences' => $absSeries,
        'participation' => $partSeries,
        'attendance' => $blockMetrics['attendance'],
        'participation_metrics' => $blockMetrics['participation_metrics'],
        'meetings' => $meetings,
        'taxonomy' => $taxonomy,
        'scores' => $scores ? array_combine(array_map('strval', array_keys($scores)), array_values($scores)) : new stdClass(),
    ];
}
