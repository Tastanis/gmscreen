<?php
/**
 * Teacher-only: upsert one student's weekly log (absences, participation
 * points, note) for a given week. Protected by the blank-overwrite guard.
 */
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/data.php';

$teacher = aslhub_require_teacher($pdo, true);
aslhub_require_csrf();

$studentId = (int)($_POST['student_id'] ?? 0);
$week = trim($_POST['week'] ?? '');
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $week)) aslhub_json_error('Invalid week date.');
$week = aslhub_week_start($week); // normalize to Monday

$student = aslhub_require_student_scope($pdo, $teacher, $studentId);

$absences = ($_POST['absences'] ?? '') === '' ? null : max(0, (int)$_POST['absences']);
$points = ($_POST['participation_points'] ?? '') === '' ? null : max(0, (int)$_POST['participation_points']);
$notes = isset($_POST['notes']) ? trim((string)$_POST['notes']) : null;

$stmt = $pdo->prepare("SELECT * FROM asl_student_meetings WHERE user_id = ? AND meeting_date = ?");
$stmt->execute([$studentId, $week]);
$existing = $stmt->fetch();

// Blank-overwrite guard on the note (the field where losing data hurts most)
if ($existing && $notes !== null && !aslhub_blank_guard($notes, $existing['notes'])) {
    aslhub_json(['success' => false, 'needs_confirm' => true,
        'error' => 'This would erase an existing note. Confirm to clear it.'], 409);
}

try {
    if ($existing) {
        $pdo->prepare("UPDATE asl_student_meetings SET
                absences = COALESCE(?, absences),
                participation_points = COALESCE(?, participation_points),
                notes = ?
            WHERE id = ?")
            ->execute([$absences, $points, $notes === null ? $existing['notes'] : $notes, $existing['id']]);
    } else {
        $pdo->prepare("INSERT INTO asl_student_meetings (user_id, meeting_date, absences, participation_points, notes)
            VALUES (?, ?, ?, ?, ?)")
            ->execute([$studentId, $week, $absences ?? 0, $points, $notes]);
    }
} catch (PDOException $e) {
    error_log('save_week: ' . $e->getMessage());
    aslhub_json_error('Could not save. Try again.', 500);
}

aslhub_json(['success' => true]);
