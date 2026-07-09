<?php
/** Transactional, optimistic-concurrency-safe batch save for attendance/participation cells. */
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/calendar.php';

$teacher = aslhub_require_teacher($pdo, true);
aslhub_require_csrf();
$changes = json_decode((string)($_POST['changes'] ?? ''), true);
if (!is_array($changes) || !$changes) aslhub_json_error('No changes to save.');
if (count($changes) > 500) aslhub_json_error('Save at most 500 student/block rows at once.');
$correction = !empty($_POST['correction']);

aslhub_finalize_reporting_blocks($pdo);
$schoolTimezone = aslhub_setting($pdo, 'school_timezone', 'America/Los_Angeles');
try { $schoolToday = (new DateTimeImmutable('now', new DateTimeZone($schoolTimezone)))->format('Y-m-d'); }
catch (Throwable $e) { $schoolToday = date('Y-m-d'); }
$saved = [];
try {
    $pdo->beginTransaction();
    $blockStmt = $pdo->prepare("SELECT * FROM asl_reporting_blocks WHERE id=? AND active=1 FOR UPDATE");
    $metricStmt = $pdo->prepare("SELECT * FROM asl_student_block_metrics WHERE user_id=? AND block_id=? FOR UPDATE");
    foreach ($changes as $i => $change) {
        if (!is_array($change)) throw new InvalidArgumentException('Invalid change at row ' . ($i + 1));
        $studentId = (int)($change['student_id'] ?? 0);
        $blockId = (int)($change['block_id'] ?? 0);
        $expectedVersion = max(0, (int)($change['version'] ?? 0));
        aslhub_require_student_scope($pdo, $teacher, $studentId);

        $blockStmt->execute([$blockId]);
        $block = $blockStmt->fetch();
        if (!$block) throw new InvalidArgumentException('Unknown reporting block.');
        if ($block['start_date'] > $schoolToday) throw new InvalidArgumentException('Future blocks cannot be edited yet.');
        $isFinalized = $block['finalized_at'] !== null;

        $metricStmt->execute([$studentId, $blockId]);
        $old = $metricStmt->fetch();
        // A teacher may make the first explicit entry late. Once a finalized
        // block already has an explicit row, changing it is an audited correction.
        if ($isFinalized && $old && !$correction) {
            throw new RuntimeException('Block ' . $block['block_index'] . ' is finalized. Use the explicit correction action.');
        }
        $oldVersion = $old ? (int)$old['version'] : 0;
        if ($expectedVersion !== $oldVersion) {
            throw new DomainException('VERSION_CONFLICT:' . $studentId . ':' . $blockId . ':' . $oldVersion);
        }

        $hasAbsences = array_key_exists('absences', $change);
        $hasPoints = array_key_exists('participation_points', $change);
        if (!$hasAbsences && !$hasPoints) continue;
        $newAbsences = $hasAbsences ? aslhub_optional_nonnegative_int($change['absences'], 'Absences') : ($old['absences'] ?? null);
        $newPoints = $hasPoints ? aslhub_optional_nonnegative_int($change['participation_points'], 'Participation') : ($old['participation_points'] ?? null);
        if ($newAbsences !== null && $newAbsences > (int)$block['instructional_days']) {
            throw new InvalidArgumentException('Absences cannot exceed the instructional days in the block.');
        }
        $max = (int)$block['participation_max'];
        if ($newPoints !== null && $newPoints > $max) {
            throw new InvalidArgumentException("Participation cannot exceed the block maximum of $max.");
        }
        $newVersion = $oldVersion + 1;
        if ($old) {
            $pdo->prepare("UPDATE asl_student_block_metrics SET absences=?, participation_points=?,
                    participation_max=?, version=?, updated_by=? WHERE id=?")
                ->execute([$newAbsences, $newPoints, $max, $newVersion, (int)$teacher['id'], $old['id']]);
        } else {
            $pdo->prepare("INSERT INTO asl_student_block_metrics
                    (user_id, block_id, absences, participation_points, participation_max, version, updated_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?)")
                ->execute([$studentId, $blockId, $newAbsences, $newPoints, $max, $newVersion, (int)$teacher['id']]);
        }
        $pdo->prepare("INSERT INTO asl_student_block_metric_audit
                (user_id, block_id, old_absences, new_absences, old_participation_points,
                 new_participation_points, participation_max, old_version, new_version,
                 changed_by, is_correction)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            ->execute([$studentId, $blockId, $old['absences'] ?? null, $newAbsences,
                $old['participation_points'] ?? null, $newPoints, $max, $oldVersion,
                $newVersion, (int)$teacher['id'], ($isFinalized && $old) ? 1 : 0]);
        $saved[] = ['student_id' => $studentId, 'block_id' => $blockId,
            'absences' => $newAbsences, 'participation_points' => $newPoints,
            'participation_max' => $max, 'version' => $newVersion];
    }
    $pdo->commit();
} catch (DomainException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    if (str_starts_with($e->getMessage(), 'VERSION_CONFLICT:')) {
        [, $studentId, $blockId, $currentVersion] = explode(':', $e->getMessage());
        aslhub_json(['success' => false, 'conflict' => true, 'student_id' => (int)$studentId,
            'block_id' => (int)$blockId, 'current_version' => (int)$currentVersion,
            'error' => 'Someone else changed this row. Reload before saving again.'], 409);
    }
    aslhub_json_error($e->getMessage(), 409);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('save_block_metrics: ' . $e->getMessage());
    if (($e instanceof InvalidArgumentException || $e instanceof RuntimeException) && !($e instanceof PDOException)) {
        aslhub_json_error($e->getMessage(), 409);
    }
    aslhub_json_error('The batch could not be saved. Nothing was changed; please retry.', 500);
}

aslhub_json(['success' => true, 'saved' => $saved]);

function aslhub_optional_nonnegative_int($value, string $label): ?int {
    if ($value === null || $value === '') return null;
    if (filter_var($value, FILTER_VALIDATE_INT) === false || (int)$value < 0) {
        throw new InvalidArgumentException("$label must be a whole number of zero or more.");
    }
    return (int)$value;
}
