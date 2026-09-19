<?php
require_once dirname(__DIR__) . '/config.php';
$student = aslhub_require_login($pdo, true);
if (!empty($student['is_teacher'])) aslhub_json_error('Student access required.', 403);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') aslhub_json_error('POST required.', 405);
aslhub_require_csrf();
$targetId = (int)($_POST['target_id'] ?? 0);
$score = $_POST['score'] ?? null;
if (!is_string($score) || !preg_match('/^[1-4]$/D', $score)) aslhub_json_error('Choose a defined proficiency level.');
$query = $pdo->prepare('SELECT COUNT(*) FROM asl_learning_targets t JOIN asl_rubric_levels r ON r.learning_target_id=t.id
    WHERE t.id=? AND t.active=1 AND t.asl_level=? AND r.score=?');
$query->execute([$targetId, (int)$student['level'], (int)$score]);
if (!(int)$query->fetchColumn()) aslhub_json_error('That proficiency is not available for your course.', 403);
try {
    // Identity always comes from the session; no posted student ID is accepted.
    $pdo->prepare('INSERT INTO asl_self_assessments (user_id,learning_target_id,score) VALUES (?,?,?)
        ON DUPLICATE KEY UPDATE score=VALUES(score)')->execute([(int)$student['id'],$targetId,(int)$score]);
} catch (PDOException $e) {
    error_log('save_self_assessment: '.$e->getMessage());
    aslhub_json_error('Could not save your selection. Try again.', 500);
}
aslhub_json(['success'=>true,'target_id'=>$targetId,'score'=>(int)$score]);
