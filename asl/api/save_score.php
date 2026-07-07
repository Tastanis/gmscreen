<?php
/**
 * Teacher-only: set a student's score (0-4) on one learning target.
 * Writes the current score AND an append-only history row.
 */
require_once dirname(__DIR__) . '/config.php';

$teacher = aslhub_require_teacher($pdo, true);
aslhub_require_csrf();

$studentId = (int)($_POST['student_id'] ?? 0);
$targetId = (int)($_POST['target_id'] ?? 0);
$score = $_POST['score'] ?? null;

if ($score === null || $score === '' || !in_array((int)$score, [0, 1, 2, 3, 4], true)) {
    aslhub_json_error('Score must be 0-4.');
}
$score = (int)$score;

$student = aslhub_require_student_scope($pdo, $teacher, $studentId);

// Target must exist and be active
$stmt = $pdo->prepare("SELECT id, asl_level FROM asl_learning_targets WHERE id = ? AND active = 1");
$stmt->execute([$targetId]);
$target = $stmt->fetch();
if (!$target) aslhub_json_error('Unknown skill target.', 404);

try {
    $pdo->beginTransaction();
    $pdo->prepare("INSERT INTO user_learning_targets (user_id, learning_target_id, score, completed_at)
        VALUES (?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE score = VALUES(score), completed_at = NOW()")
        ->execute([$studentId, $targetId, $score]);
    $pdo->prepare("INSERT INTO user_learning_target_score_history (user_id, learning_target_id, score, scored_at, scored_by)
        VALUES (?, ?, ?, NOW(), ?)")
        ->execute([$studentId, $targetId, $score, (int)$teacher['id']]);
    $pdo->commit();
} catch (PDOException $e) {
    $pdo->rollBack();
    error_log('save_score: ' . $e->getMessage());
    aslhub_json_error('Could not save. Try again.', 500);
}

aslhub_json(['success' => true, 'student_id' => $studentId, 'target_id' => $targetId, 'score' => $score]);
