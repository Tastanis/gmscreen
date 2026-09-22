<?php
/** Read-only report calculations shared with the dashboard's calendar and scores. */
require_once __DIR__ . '/data.php';

function aslhub_report_grade(?float $pace): ?string {
    if ($pace === null) return null;
    foreach ([100 => 'A', 83 => 'B', 73 => 'C', 63 => 'D'] as $threshold => $grade) {
        if ($pace >= $threshold) return $grade;
    }
    return 'F';
}

/** Replay by target, not summed clicks. Null is an explicitly cleared grade. */
function aslhub_report_improvements(array $events, array $targets, ?string $previousEnd, string $cutoff): array {
    $before = []; $after = [];
    foreach ($events as $event) {
        if ($event['scored_at'] > $cutoff . ' 23:59:59') break;
        $id = (int)$event['learning_target_id'];
        $score = $event['score'] === null ? null : (int)$event['score'];
        $after[$id] = $score;
        if ($previousEnd !== null && $event['scored_at'] <= $previousEnd . ' 23:59:59') $before[$id] = $score;
    }
    $changes = [];
    foreach ($targets as $target) {
        $id = (int)$target['id']; $old = $before[$id] ?? null; $new = $after[$id] ?? null;
        if ($new !== null && $new > ($old ?? 0)) {
            $changes[] = ['id' => $id, 'competency' => $target['competency'], 'skill' => $target['title'],
                'mode' => ['E' => 'Expression', 'R' => 'Reception'][$target['sub_code']] ?? '',
                'from' => $old, 'to' => $new, 'change' => $old === null ? null : $new - $old];
        }
    }
    return $changes;
}

function aslhub_report_summary(array $payload): array {
    $blocks = $payload['reporting_blocks'];
    $totalDays = array_sum(array_column($blocks, 'instructional_days'));
    $elapsedDays = array_sum(array_column($blocks, 'instructional_days_elapsed'));
    $targets = [];
    foreach ($payload['taxonomy'] as $bucket) foreach ($bucket['standards'] as $standard) {
        foreach ($standard['targets'] as $target) $targets[] = $target + ['competency' => $standard['name']];
    }
    $points = 0;
    $scores = (array)$payload['scores'];
    foreach ($targets as $target) $points += (int)($scores[$target['id']] ?? 0);
    $maximum = count($targets) * 3; // Same completion denominator as the dashboard.
    $completion = $maximum ? 100 * $points / $maximum : null;
    $pace = $completion !== null && $elapsedDays > 0 && $totalDays > 0
        ? $completion * $totalDays / $elapsedDays : null;
    $currentIndex = null;
    foreach ($blocks as $i => $block) if ($block['instructional_days_elapsed'] > 0) $currentIndex = $i;
    $participation = $payload['participation_metrics'];
    $earned = array_sum($participation['points']); $possible = array_sum($participation['max_points']);
    return [
        'student' => $payload['student'], 'today' => $payload['today'],
        'block' => $currentIndex === null ? null : $blocks[$currentIndex],
        'previous_block' => $currentIndex !== null && $currentIndex > 0 ? $blocks[$currentIndex - 1] : null,
        'completion_percent' => $completion === null ? null : round($completion),
        'pace_percent' => $pace === null ? null : round($pace, 1),
        'projected_grade' => aslhub_report_grade($pace),
        'absences' => $currentIndex === null ? null : $payload['attendance']['ytd_absences'][$currentIndex],
        'absence_percentile' => $currentIndex === null ? null : $payload['attendance']['absence_percentile'][$currentIndex],
        'attendance_percent' => $currentIndex === null ? null : $payload['attendance']['ytd_percent'][$currentIndex],
        'participation_points' => $earned, 'participation_max' => $possible,
        'participation_percent' => $possible > 0 ? round(100 * $earned / $possible, 1) : null,
        'targets' => $targets,
    ];
}

function aslhub_student_report(PDO $pdo, array $payload): array {
    $report = aslhub_report_summary($payload);
    $stmt = $pdo->prepare('SELECT learning_target_id, score, scored_at FROM user_learning_target_score_history
        WHERE user_id=? ORDER BY scored_at, id');
    $stmt->execute([$payload['student']['id']]);
    $report['improvements'] = $report['block'] ? aslhub_report_improvements($stmt->fetchAll(), $report['targets'],
        $report['previous_block']['end_date'] ?? null, min($report['block']['end_date'], $report['today'])) : [];
    unset($report['targets']);
    return $report;
}
