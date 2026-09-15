<?php
/**
 * Teacher-only: set a defined score (0-4), or clear it with an empty string.
 * Writes the current score AND an append-only history row.
 */
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/data.php';

$teacher = aslhub_require_teacher($pdo, true);
aslhub_require_csrf();

$studentId = (int)($_POST['student_id'] ?? 0);
$targetId = (int)($_POST['target_id'] ?? 0);
$score = $_POST['score'] ?? null;

if (!is_string($score) || ($score !== '' && !preg_match('/^[0-4]$/D', $score))) {
    aslhub_json_error('Score must be 0-4.');
}
$score = $score === '' ? null : (int)$score;

$student = aslhub_require_student_scope($pdo, $teacher, $studentId);

// Target must exist and be active
$stmt = $pdo->prepare("SELECT id, asl_level FROM asl_learning_targets WHERE id = ? AND active = 1");
$stmt->execute([$targetId]);
$target = $stmt->fetch();
if (!$target) aslhub_json_error('Unknown skill target.', 404);
if ((int)$target['asl_level'] !== (int)$student['level']) aslhub_json_error('Target belongs to another ASL course.', 403);
$rubric = $pdo->prepare('SELECT COUNT(*) FROM asl_rubric_levels WHERE learning_target_id=? AND score=?');
$rubric->execute([$targetId,$score]);
if (!(int)$rubric->fetchColumn() && $score !== null) aslhub_json_error('That proficiency level is not defined for this target.');

try {
    $pdo->beginTransaction();
    $pdo->prepare("INSERT INTO user_learning_targets (user_id, learning_target_id, score, completed_at)
        VALUES (?, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE NOW() END)
        ON DUPLICATE KEY UPDATE score = VALUES(score), completed_at = VALUES(completed_at)")
        ->execute([$studentId, $targetId, $score, $score]);
    $pdo->prepare("INSERT INTO user_learning_target_score_history (user_id, learning_target_id, score, scored_at, scored_by)
        VALUES (?, ?, ?, NOW(), ?)")
        // Clearing leaves the current score NULL and appends a zero-contribution
        // event so earlier progress snapshots remain intact, with no deleted history.
        ->execute([$studentId, $targetId, $score ?? 0, (int)$teacher['id']]);
    $pdo->commit();
} catch (PDOException $e) {
    $pdo->rollBack();
    error_log('save_score: ' . $e->getMessage());
    aslhub_json_error('Could not save. Try again.', 500);
}

aslhub_json(['success' => true, 'student_id' => $studentId, 'target_id' => $targetId, 'score' => $score,
    'progress' => aslhub_block_progress($pdo,$studentId,(int)$student['level'],aslhub_reporting_blocks($pdo))]);
