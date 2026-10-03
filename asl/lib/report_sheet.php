<?php
$groups = [];
foreach ($report['improvements'] as $change) {
    $groups[$change['competency']][$change['skill']][] = $change;
}
$skillCount = 0;
foreach ($groups as &$skills) foreach ($skills as &$changes) {
    $skillCount++;
    usort($changes, fn($a, $b) => strcmp($a['mode'], $b['mode']));
    if (count($changes) === 2 && $changes[0]['from'] === $changes[1]['from'] && $changes[0]['to'] === $changes[1]['to']) {
        $changes[0]['mode'] = ''; // One shared skill change when both modes match.
        $changes = [$changes[0]];
    }
}
unset($changes, $skills);
$number = fn($value) => $value === null ? '—' : rtrim(rtrim(number_format((float)$value, 1, '.', ''), '0'), '.');
$percent = fn($value) => $value === null ? '—' : $number($value) . '%';
?>
<main class="report-sheet">
<div class="report-content<?php echo $skillCount > 18 ? ' dense' : ''; ?>">
    <header class="report-header">
        <div><h1><?php echo aslhub_h($subject['first_name'] . ' ' . $subject['last_name']); ?></h1>
            <p>ASL <?php echo (int)$subject['level']; ?> Report Card</p></div>
        <p><?php echo aslhub_h($report['block']['label'] ?? ''); ?><br><?php echo aslhub_h($report['block'] ? date('M j', strtotime($report['block']['start_date'])) . '–' . date('M j', strtotime($report['block']['end_date'])) : ''); ?></p>
    </header>
    <section class="report-summary">
        <div class="report-estimate"><h2>Estimated grade</h2><p><strong><?php echo $percent($report['estimated_grade_percent']); ?></strong> · Based on skills and participation</p></div>
        <div><h2>Overall completion</h2><strong><?php echo $percent($report['completion_percent']); ?></strong></div>
        <div><h2>ASL skills pacing</h2><p>Projected year-end skills: <strong><?php echo $percent($report['pace_percent']); ?></strong></p></div>
        <div><h2>Attendance</h2><p>Days missed: <strong><?php echo $number($report['absences']); ?></strong></p>
            <p>More absences than <strong><?php echo $percent($report['absence_percentile']); ?></strong> of students.</p><p>You have missed <strong><?php echo $percent($report['attendance_percent'] === null ? null : 100 - $report['attendance_percent']); ?></strong> of class.</p></div>
        <div><h2>Participation</h2><p><strong><?php echo $number($report['participation_points']); ?> / <?php echo $number($report['participation_max']); ?></strong> points · <strong><?php echo $percent($report['participation_percent']); ?></strong></p></div>
    </section>
    <section class="report-improvements">
        <h2>Skills improved<?php if ($report['previous_block']): ?> · <?php echo aslhub_h($report['previous_block']['label'] . ' → ' . $report['block']['label']); ?><?php endif; ?></h2>
        <?php if (!$groups): ?><p>—</p><?php endif; ?>
        <div class="improvement-columns">
        <?php foreach ($groups as $competency => $skills): ?>
            <section class="improvement-group"><h3><?php echo aslhub_h($competency); ?></h3>
            <?php foreach ($skills as $skill => $changes): ?>
                <p class="improvement-row<?php echo count($changes) === 1 && $changes[0]['mode'] === '' ? ' compact' : ''; ?>"><span><?php echo aslhub_h($skill); ?></span>
                <span class="score-changes"><?php foreach ($changes as $i => $change): ?><?php if ($i): ?>; <?php endif; ?><?php echo aslhub_h($change['mode']); ?> <?php echo $change['from'] ?? '—'; ?> → <?php echo $change['to']; ?><?php if ($change['change'] !== null): ?> (+<?php echo $change['change']; ?>)<?php endif; ?><?php endforeach; ?></span></p>
            <?php endforeach; ?>
            </section>
        <?php endforeach; ?>
        </div>
    </section>
    <section class="report-progress"><h2>Proficiency progress</h2><svg class="report-progress-chart" role="img"></svg></section>
    <section class="report-participation"><h2>Participation by block</h2><svg class="report-participation-chart" role="img" aria-label="Participation percentage earned in each block"></svg></section>
    <section class="report-comments"><h2>Comments</h2><div class="comment-space"></div></section>
</div>
<script type="application/json" class="report-data"><?php echo json_encode([
    'reporting_blocks' => $payload['reporting_blocks'], 'progress' => $payload['progress']['overall'],
    'participation' => $payload['participation_metrics'],
    'target_count' => $payload['target_count'], 'today' => $payload['today'],
], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR); ?></script>
</main>
