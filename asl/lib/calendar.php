<?php
/** Shared school-calendar and ten-instructional-day reporting-block helpers. */

function aslhub_calendar_parse(string $raw): array {
    try {
        $doc = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    } catch (Throwable $e) {
        return ['success' => false, 'error' => 'The calendar is not valid JSON: ' . $e->getMessage()];
    }
    if (!is_array($doc) || !isset($doc['days']) || !is_array($doc['days'])) {
        return ['success' => false, 'error' => 'Calendar JSON must contain a "days" array.'];
    }
    if (count($doc['days']) < 1 || count($doc['days']) > 550) {
        return ['success' => false, 'error' => 'Calendar must contain between 1 and 550 day records.'];
    }

    $timezone = trim((string)($doc['timezone'] ?? 'America/Los_Angeles'));
    if (!in_array($timezone, timezone_identifiers_list(), true)) {
        return ['success' => false, 'error' => 'Unknown IANA timezone: ' . $timezone];
    }
    $seen = [];
    $days = [];
    foreach ($doc['days'] as $i => $row) {
        if (!is_array($row)) return ['success' => false, 'error' => 'Day ' . ($i + 1) . ' must be an object.'];
        $date = trim((string)($row['date'] ?? ''));
        $dt = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
        if (!$dt || $dt->format('Y-m-d') !== $date) {
            return ['success' => false, 'error' => 'Day ' . ($i + 1) . ' has an invalid date. Use YYYY-MM-DD.'];
        }
        if (isset($seen[$date])) return ['success' => false, 'error' => 'Duplicate calendar date: ' . $date];
        $seen[$date] = true;
        $instructional = $row['instructional'] ?? $row['is_instructional'] ?? null;
        if (!is_bool($instructional) && !in_array($instructional, [0, 1, '0', '1'], true)) {
            return ['success' => false, 'error' => "Calendar day $date needs instructional: true or false."];
        }
        $label = trim((string)($row['label'] ?? ''));
        if (mb_strlen($label) > 255) return ['success' => false, 'error' => "Calendar label on $date is too long."];
        $days[] = ['date' => $date, 'instructional' => (bool)$instructional, 'label' => $label ?: null];
    }
    usort($days, fn($a, $b) => strcmp($a['date'], $b['date']));
    $instructional = array_values(array_filter($days, fn($d) => $d['instructional']));
    if (!$instructional) return ['success' => false, 'error' => 'Calendar must contain at least one instructional day.'];

    return [
        'success' => true,
        'school_year' => trim((string)($doc['school_year'] ?? '')),
        'timezone' => $timezone,
        'days' => $days,
        'blocks' => aslhub_calendar_build_blocks($instructional),
    ];
}

function aslhub_calendar_build_blocks(array $instructionalDays): array {
    $blocks = [];
    foreach (array_chunk($instructionalDays, 10) as $i => $chunk) {
        $start = $chunk[0]['date'];
        $end = $chunk[count($chunk) - 1]['date'];
        $startMonth = (new DateTimeImmutable($start))->format('M');
        $endMonth = (new DateTimeImmutable($end))->format('M');
        $blocks[] = [
            'block_index' => $i + 1,
            'label' => 'Block ' . ($i + 1),
            'start_date' => $start,
            'end_date' => $end,
            'instructional_days' => count($chunk),
            'month_label' => $startMonth === $endMonth ? $endMonth : "$startMonth-$endMonth",
        ];
    }
    return $blocks;
}

/** Past blocks finalize automatically. Corrections remain possible through the explicit correction API flag. */
function aslhub_finalize_reporting_blocks(PDO $pdo): void {
    $timezone = aslhub_setting($pdo, 'school_timezone', 'America/Los_Angeles');
    try { $today = (new DateTimeImmutable('now', new DateTimeZone($timezone)))->format('Y-m-d'); }
    catch (Throwable $e) { $today = date('Y-m-d'); }
    $pdo->prepare("UPDATE asl_reporting_blocks SET finalized_at = NOW()
        WHERE active = 1 AND finalized_at IS NULL AND end_date < ?")->execute([$today]);
}

function aslhub_calendar_apply(PDO $pdo, array $calendar): array {
    $participationMax = max(1, (int)aslhub_setting($pdo, 'participation_max', '10'));
    $revision = max(0, (int)aslhub_setting($pdo, 'calendar_revision', '0')) + 1;
    $today = (new DateTimeImmutable('now', new DateTimeZone($calendar['timezone'])))->format('Y-m-d');

    aslhub_finalize_reporting_blocks($pdo);
    $finalized = [];
    foreach ($pdo->query("SELECT * FROM asl_reporting_blocks WHERE finalized_at IS NOT NULL") as $row) {
        $finalized[(int)$row['block_index']] = $row;
    }
    foreach ($finalized as $idx => $old) {
        $candidate = $calendar['blocks'][$idx - 1] ?? null;
        if (!$candidate || $candidate['start_date'] !== $old['start_date'] ||
                $candidate['end_date'] !== $old['end_date'] ||
                (int)$candidate['instructional_days'] !== (int)$old['instructional_days']) {
            throw new RuntimeException("The upload changes finalized Block $idx. Past blocks are frozen; correct student values instead of remapping the calendar.");
        }
    }

    $pdo->beginTransaction();
    try {
        $pdo->exec("DELETE FROM asl_calendar_days");
        $dayStmt = $pdo->prepare("INSERT INTO asl_calendar_days
            (school_date, is_instructional, label, calendar_revision) VALUES (?, ?, ?, ?)");
        foreach ($calendar['days'] as $day) {
            $dayStmt->execute([$day['date'], $day['instructional'] ? 1 : 0, $day['label'], $revision]);
        }

        $pdo->exec("UPDATE asl_reporting_blocks SET active = 0 WHERE finalized_at IS NULL");
        $find = $pdo->prepare("SELECT * FROM asl_reporting_blocks WHERE block_index = ? FOR UPDATE");
        $insert = $pdo->prepare("INSERT INTO asl_reporting_blocks
            (block_index, label, start_date, end_date, instructional_days, participation_max, active, finalized_at, calendar_revision)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)");
        $update = $pdo->prepare("UPDATE asl_reporting_blocks SET label=?, start_date=?, end_date=?,
            instructional_days=?, participation_max=?, active=1, calendar_revision=? WHERE id=?");
        foreach ($calendar['blocks'] as $block) {
            $find->execute([$block['block_index']]);
            $existing = $find->fetch();
            $finalizedAt = $block['end_date'] < $today ? date('Y-m-d H:i:s') : null;
            if ($existing) {
                if ($existing['finalized_at'] !== null) {
                    $pdo->prepare("UPDATE asl_reporting_blocks SET active=1, calendar_revision=? WHERE id=?")
                        ->execute([$revision, $existing['id']]);
                } else {
                    $update->execute([$block['label'], $block['start_date'], $block['end_date'],
                        $block['instructional_days'], $participationMax, $revision, $existing['id']]);
                    if ($finalizedAt !== null) {
                        $pdo->prepare("UPDATE asl_reporting_blocks SET finalized_at=? WHERE id=?")
                            ->execute([$finalizedAt, $existing['id']]);
                    }
                }
            } else {
                $insert->execute([$block['block_index'], $block['label'], $block['start_date'], $block['end_date'],
                    $block['instructional_days'], $participationMax, $finalizedAt, $revision]);
            }
        }

        aslhub_set_setting($pdo, 'calendar_revision', (string)$revision);
        aslhub_set_setting($pdo, 'school_timezone', $calendar['timezone']);
        aslhub_set_setting($pdo, 'year_start', $calendar['blocks'][0]['start_date']);
        aslhub_set_setting($pdo, 'year_end', $calendar['blocks'][count($calendar['blocks']) - 1]['end_date']);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    aslhub_migrate_weekly_rows_to_blocks($pdo, $participationMax);
    return ['revision' => $revision, 'days' => count($calendar['days']),
        'instructional_days' => count(array_filter($calendar['days'], fn($d) => $d['instructional'])),
        'blocks' => count($calendar['blocks'])];
}

/** Preserve existing weekly values by copying them into an empty matching block. Legacy rows remain untouched. */
function aslhub_migrate_weekly_rows_to_blocks(PDO $pdo, int $defaultMax): void {
    $rows = $pdo->query("SELECT m.*,
            (SELECT b.id FROM asl_reporting_blocks b
             WHERE b.active=1
               AND b.start_date <= DATE_ADD(m.meeting_date, INTERVAL 6 DAY)
               AND b.end_date >= m.meeting_date
             ORDER BY b.end_date LIMIT 1) AS block_id
        FROM asl_student_meetings m ORDER BY m.user_id, m.meeting_date")->fetchAll();
    $grouped = [];
    foreach ($rows as $row) {
        if (empty($row['block_id'])) continue;
        $key = (int)$row['user_id'] . ':' . (int)$row['block_id'];
        if (!isset($grouped[$key])) $grouped[$key] = ['user_id' => (int)$row['user_id'], 'block_id' => (int)$row['block_id'], 'absences' => 0, 'points' => 0, 'has_points' => false];
        $grouped[$key]['absences'] += max(0, (int)$row['absences']);
        if ($row['participation_points'] !== null) {
            $grouped[$key]['points'] += max(0, (int)$row['participation_points']);
            $grouped[$key]['has_points'] = true;
        }
    }
    $stmt = $pdo->prepare("INSERT IGNORE INTO asl_student_block_metrics
        (user_id, block_id, absences, participation_points, participation_max, version)
        VALUES (?, ?, ?, ?, ?, 1)");
    foreach ($grouped as $g) {
        $max = $g['has_points'] ? max($defaultMax, $g['points']) : $defaultMax;
        $stmt->execute([$g['user_id'], $g['block_id'], $g['absences'], $g['has_points'] ? $g['points'] : null, $max]);
    }
}
