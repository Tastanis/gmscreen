<?php

/** Cumulative expected growth, prorated inside each block by instructional days. */
function aslhub_expected_growth(array $blocks, int $targetCount): float {
    $annual = max(0, $targetCount * 2);
    $start = [0, 3, 3];
    $earlyTotal = array_sum(array_slice($start, 0, min(count($start), count($blocks))));
    $scale = $earlyTotal ? min(1, $annual / $earlyTotal) : 1;
    $remainingDays = array_sum(array_column(array_slice($blocks, count($start)), 'instructional_days'));
    $expected = 0.0;
    foreach (array_values($blocks) as $i => $block) {
        $days = (int)$block['instructional_days'];
        $goal = $i < count($start) ? $start[$i] * $scale : ($remainingDays ? max(0, $annual - $earlyTotal) * $days / $remainingDays : 0);
        $elapsed = max(0, min($days, (int)($block['instructional_days_elapsed'] ?? 0)));
        $expected += $days ? $goal * $elapsed / $days : 0;
    }
    return $expected;
}

/** Shared school-calendar and instructional-day reporting-block helpers. */

/** Attendance inputs are semester totals; the approved proficiency calendar is independent.
 * MSD25 family calendar, revised September 21, 2026: https://aptg.co/NVHvM7
 * January 29 ends semester one; February 1 is a workday; classes resume February 2.
 * Do not infer a new year's semester boundary from a decreasing/corrected count.
 */
function aslhub_attendance_calendar_days(PDO $pdo): array {
    return $pdo->query('SELECT school_date FROM asl_calendar_days WHERE is_instructional=1 ORDER BY school_date')->fetchAll(PDO::FETCH_COLUMN);
}

function aslhub_attendance_periods(array $block, array $schoolDays, string $today): array {
    if (!$schoolDays) return [];
    $first = $schoolDays[0]; $last = $schoolDays[count($schoolDays)-1];
    $terms = [['start'=>$first, 'end'=>$last, 'number'=>1]];
    if ($first >= '2026-07-01' && $first < '2027-02-02' && $last >= '2027-02-02' && $last <= '2027-08-31') {
        $terms = [['start'=>$first, 'end'=>'2027-01-29', 'number'=>1],
            ['start'=>'2027-02-02', 'end'=>$last, 'number'=>2]];
    }
    $periods = [];
    foreach ($terms as $term) {
        $start = max($block['start_date'], $term['start']);
        $end = min($block['end_date'], $term['end']);
        if ($start > $end) continue;
        $count = fn($from, $to) => count(array_filter($schoolDays, fn($day) => $day >= $from && $day <= $to));
        $periods[] = ['semester'=>$term['start'], 'semester_number'=>$term['number'],
            'field'=>$periods ? 'absences_next_semester' : 'absences',
            'start_date'=>$start, 'end_date'=>$end, 'instructional_days'=>$count($start,$end),
            'is_complete'=>$end < $today, 'is_current'=>$start <= $today && $end >= $today,
            'instructional_days_elapsed'=>$count($start,min($end,$today)),
            'maximum'=>$count($term['start'],min($end,$today))];
    }
    return $periods;
}

/** Called after locking the edited block, so a queued old grid cannot use new dates. */
function aslhub_check_calendar_revision(PDO $pdo, $expected): void {
    $current = $pdo->query("SELECT setting_value FROM asl_settings WHERE setting_key='calendar_revision' FOR UPDATE")->fetchColumn();
    if (filter_var($expected, FILTER_VALIDATE_INT) === false || (int)$expected !== (int)$current) {
        throw new RuntimeException('The calendar changed. Reload before entering values for these block dates.');
    }
}

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
    $instructionalDays = array_values(array_filter($instructionalDays, fn($day) =>
        (int)(new DateTimeImmutable($day['date']))->format('N') <= 5));
    if (!$instructionalDays) return [];
    usort($instructionalDays, fn($a, $b) => strcmp($a['date'], $b['date']));
    $blocks = [];
    $firstDate = $instructionalDays[0]['date'];
    $lastDate = $instructionalDays[count($instructionalDays) - 1]['date'];
    $anchor = (new DateTimeImmutable($firstDate))->modify('monday this week');
    // Fixed Monday–second-Friday windows. Holidays never move later boundaries.
    for ($i = 0; $anchor->format('Y-m-d') <= $lastDate; $i++, $anchor = $anchor->modify('+14 days')) {
        $start = $i === 0 ? $firstDate : $anchor->format('Y-m-d');
        $end = $anchor->modify('+11 days')->format('Y-m-d');
        $chunk = array_filter($instructionalDays, fn($day) => $day['date'] >= $start && $day['date'] <= $end);
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

/** Past blocks finalize automatically. Teachers can edit past entries directly; changes remain audited. */
function aslhub_finalize_reporting_blocks(PDO $pdo): void {
    $timezone = aslhub_setting($pdo, 'school_timezone', 'America/Los_Angeles');
    try { $today = (new DateTimeImmutable('now', new DateTimeZone($timezone)))->format('Y-m-d'); }
    catch (Throwable $e) { $today = date('Y-m-d'); }
    $pdo->prepare("UPDATE asl_reporting_blocks SET finalized_at = NOW()
        WHERE active = 1 AND finalized_at IS NULL AND end_date < ?")->execute([$today]);
}

function aslhub_calendar_apply(PDO $pdo, array $calendar): array {
    $ownsTransaction = !$pdo->inTransaction();
    if ($ownsTransaction) $pdo->beginTransaction();
    try {
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
            $dates = $pdo->prepare('SELECT school_date FROM asl_calendar_days WHERE is_instructional=1 AND school_date BETWEEN ? AND ? ORDER BY school_date');
            $dates->execute([$old['start_date'], $old['end_date']]);
            $oldDates = $dates->fetchAll(PDO::FETCH_COLUMN);
            $newDates = array_column(array_filter($calendar['days'], fn($day) => $day['instructional'] &&
                $day['date'] >= $old['start_date'] && $day['date'] <= $old['end_date']), 'date');
            if ($oldDates !== $newDates) throw new RuntimeException("The upload changes instructional dates inside finalized Block $idx. Past instructional days are frozen.");
        }

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
            $participationMax = aslhub_participation_max((int)$block['instructional_days']);
            $find->execute([$block['block_index']]);
            $existing = $find->fetch();
            $finalizedAt = $block['end_date'] < $today ? date('Y-m-d H:i:s') : null;
            if ($existing) {
                if ($existing['finalized_at'] !== null) {
                    $pdo->prepare("UPDATE asl_reporting_blocks SET active=1, calendar_revision=?, participation_max=? WHERE id=?")
                        ->execute([$revision, $participationMax, $existing['id']]);
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
            if ($existing) {
                $check = $pdo->prepare('SELECT COUNT(*) FROM asl_student_block_metrics WHERE block_id=? AND participation_points>?');
                $check->execute([$existing['id'], $participationMax]);
                if ((int)$check->fetchColumn()) throw new RuntimeException('A saved participation score exceeds the new block maximum.');
                $pdo->prepare('UPDATE asl_student_block_metrics SET participation_max=?,version=version+1 WHERE block_id=? AND participation_max<>?')
                    ->execute([$participationMax, $existing['id'], $participationMax]);
            }
        }

        aslhub_set_setting($pdo, 'calendar_revision', (string)$revision);
        aslhub_set_setting($pdo, 'school_timezone', $calendar['timezone']);
        aslhub_migrate_weekly_rows_to_blocks($pdo);
        if ($ownsTransaction) $pdo->commit();
    } catch (Throwable $e) {
        if ($ownsTransaction && $pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    return ['revision' => $revision, 'days' => count($calendar['days']),
        'instructional_days' => count(array_filter($calendar['days'], fn($d) => $d['instructional'])),
        'blocks' => count($calendar['blocks'])];
}

/** Preserve existing weekly values by copying them into an empty matching block. Legacy rows remain untouched. */
function aslhub_migrate_weekly_rows_to_blocks(PDO $pdo): void {
    $maxByBlock = [];
    foreach ($pdo->query('SELECT id,instructional_days FROM asl_reporting_blocks') as $block) {
        $maxByBlock[(int)$block['id']] = aslhub_participation_max((int)$block['instructional_days']);
    }
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
        $max = $maxByBlock[$g['block_id']];
        if ($g['points'] > $max) throw new RuntimeException('Legacy participation exceeds three points per school day; review the saved values.');
        $stmt->execute([$g['user_id'], $g['block_id'], $g['absences'], $g['has_points'] ? $g['points'] : null, $max]);
    }
}
