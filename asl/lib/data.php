<?php
/**
 * ASL Hub data layer — read queries shared by student + teacher views.
 */

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

/** Weekly log rows for a student, newest first. */
function aslhub_student_meetings(PDO $pdo, int $userId): array {
    $stmt = $pdo->prepare("SELECT meeting_date, absences, participation_pct, participation_points, notes
        FROM asl_student_meetings WHERE user_id = ? ORDER BY meeting_date DESC");
    $stmt->execute([$userId]);
    return $stmt->fetchAll();
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
        'target_count' => $targetCount,
        'progress' => aslhub_weekly_progress($pdo, (int)$student['id'], $level, $weeks),
        'today' => date('Y-m-d'),
        'absences' => $absSeries,
        'participation' => $partSeries,
        'meetings' => $meetings,
        'taxonomy' => $taxonomy,
        'scores' => $scores ? array_combine(array_map('strval', array_keys($scores)), array_values($scores)) : new stdClass(),
    ];
}
