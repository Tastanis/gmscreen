<?php
require_once __DIR__ . '/calendar.php';

/** Preserve the installed holiday calendar; only repair the approved opening dates. */
function aslhub_opening_calendar_plan(array $days): array {
    if (!$days) throw new RuntimeException('No installed calendar to correct.');
    $byDate = [];
    foreach ($days as $day) $byDate[$day['school_date']] = [
        'date' => $day['school_date'], 'instructional' => (bool)$day['is_instructional'], 'label' => $day['label'] ?? null];
    ksort($byDate);
    $first = array_key_first($byDate);
    if (!in_array($first, ['2026-09-08', '2026-09-14'], true)) {
        throw new RuntimeException('Opening-block correction expects the 2026 calendar starting September 8 or 14.');
    }
    if (array_key_last($byDate) < '2026-09-18') throw new RuntimeException('Installed calendar is incomplete.');
    for ($date = new DateTimeImmutable('2026-09-08'); $date <= new DateTimeImmutable('2026-09-18'); $date = $date->modify('+1 day')) {
        $key = $date->format('Y-m-d');
        $byDate[$key] = ['date' => $key, 'instructional' => (int)$date->format('N') <= 5,
            'label' => $byDate[$key]['label'] ?? null];
    }
    ksort($byDate);
    $days = array_values($byDate);
    return ['days' => $days, 'blocks' => aslhub_calendar_build_blocks(array_values(array_filter($days, fn($d) => $d['instructional'])))];
}

/** One approved exception to frozen-block remapping. Backup and all writes are atomic. */
function aslhub_correct_opening_calendar(PDO $pdo, callable $backup): bool {
    if ($pdo->inTransaction()) throw new RuntimeException('Calendar correction requires its own transaction.');
    $key = 'calendar_fortnight_2026_09_08_3_per_day_v1';
    $done = $pdo->prepare('SELECT setting_value FROM asl_settings WHERE setting_key=?');
    $done->execute([$key]);
    if ($done->fetchColumn() !== false) return false;
    if ((int)$pdo->query("SELECT GET_LOCK('aslhub_calendar_opening_correction', 10)")->fetchColumn() !== 1) {
        throw new RuntimeException('Calendar correction is already running.');
    }
    try {
        $pdo->beginTransaction();
        $done->execute([$key]);
        if ($done->fetchColumn() !== false) { $pdo->commit(); return false; }
        $existing = $pdo->query('SELECT * FROM asl_reporting_blocks ORDER BY block_index FOR UPDATE')->fetchAll();
        $days = $pdo->query('SELECT * FROM asl_calendar_days ORDER BY school_date FOR UPDATE')->fetchAll();
        if (!$days) { $pdo->commit(); return false; } // Fresh installations use the corrected seed.
        $plan = aslhub_opening_calendar_plan($days);
        $byIndex = [];
        foreach ($existing as $block) $byIndex[(int)$block['block_index']] = $block;
        $metrics = $pdo->query('SELECT * FROM asl_student_block_metrics FOR UPDATE')->fetchAll();
        $plannedById = [];
        foreach ($plan['blocks'] as $candidate) {
            $old = $byIndex[$candidate['block_index']] ?? null;
            if ($old) $plannedById[(int)$old['id']] = $candidate;
        }
        foreach ($metrics as $row) {
            $candidate = $plannedById[(int)$row['block_id']] ?? null;
            if (!$candidate) throw new RuntimeException('Calendar correction would orphan saved block entries.');
            $old = $byIndex[$candidate['block_index']];
            if ($candidate['block_index'] > 1 && ($old['start_date'] !== $candidate['start_date'] || $old['end_date'] !== $candidate['end_date'])) {
                throw new RuntimeException('Later blocks already contain entries; review their dates before shifting them.');
            }
            if ($row['absences'] !== null && (int)$row['absences'] > $candidate['instructional_days']) {
                throw new RuntimeException('A saved absence count exceeds the corrected block length.');
            }
            if ($row['participation_points'] !== null && (int)$row['participation_points'] > aslhub_participation_max($candidate['instructional_days'])) {
                throw new RuntimeException('A saved participation score exceeds the corrected block maximum.');
            }
        }
        $backup($pdo); // Must succeed before the first write; includes old calendar and entries.
        $revisionStmt = $pdo->query("SELECT setting_value FROM asl_settings WHERE setting_key='calendar_revision'");
        $revision = max(0, (int)$revisionStmt->fetchColumn()) + 1;
        $saveDay = $pdo->prepare('INSERT INTO asl_calendar_days (school_date,is_instructional,label,calendar_revision)
            VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE is_instructional=VALUES(is_instructional),label=VALUES(label),calendar_revision=VALUES(calendar_revision)');
        foreach ($plan['days'] as $day) $saveDay->execute([$day['date'], $day['instructional'] ? 1 : 0, $day['label'], $revision]);
        $pdo->exec('UPDATE asl_reporting_blocks SET active=0');
        $save = $pdo->prepare('INSERT INTO asl_reporting_blocks
            (block_index,label,start_date,end_date,instructional_days,participation_max,active,finalized_at,calendar_revision)
            VALUES (?,?,?,?,?,?,1,?,?) ON DUPLICATE KEY UPDATE label=VALUES(label),start_date=VALUES(start_date),end_date=VALUES(end_date),
            instructional_days=VALUES(instructional_days),participation_max=VALUES(participation_max),active=1,finalized_at=VALUES(finalized_at),calendar_revision=VALUES(calendar_revision)');
        $today = (new DateTimeImmutable('now', new DateTimeZone(aslhub_setting($pdo, 'school_timezone', 'America/Los_Angeles'))))->format('Y-m-d');
        foreach ($plan['blocks'] as $block) {
            $old = $byIndex[$block['block_index']] ?? null;
            $max = aslhub_participation_max($block['instructional_days']);
            $finalized = $block['end_date'] < $today ? ($old['finalized_at'] ?? date('Y-m-d H:i:s')) : null;
            $save->execute([$block['block_index'], $block['label'], $block['start_date'], $block['end_date'], $block['instructional_days'], $max, $finalized, $revision]);
        }
        foreach ($plan['blocks'] as $block) {
            $old = $byIndex[$block['block_index']] ?? null;
            if (!$old) continue;
            // Invalidate stale entry-grid drafts; preserve explicit scores and absence values.
            $pdo->prepare('UPDATE asl_student_block_metrics SET participation_max=?,version=version+1 WHERE block_id=?')
                ->execute([aslhub_participation_max($block['instructional_days']), $old['id']]);
        }
        aslhub_set_setting($pdo, 'calendar_revision', (string)$revision);
        aslhub_set_setting($pdo, $key, json_encode(['revision' => $revision, 'points_per_day' => 3], JSON_THROW_ON_ERROR));
        $pdo->commit();
        return true;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    } finally {
        $pdo->query("SELECT RELEASE_LOCK('aslhub_calendar_opening_correction')");
    }
}
