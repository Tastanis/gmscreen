<?php
session_start();
$aslhub_base_dir = defined('ASLHUB_BASE_DIR') ? ASLHUB_BASE_DIR : __DIR__;
require_once $aslhub_base_dir . '/config.php';
require_once $aslhub_base_dir . '/../common/asl_student_dashboard_data.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id']) || !isset($_SESSION['is_teacher']) || !$_SESSION['is_teacher']) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Access denied. Teachers only.']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$student_id = intval($_POST['student_id'] ?? 0);
$learning_target_id = intval($_POST['learning_target_id'] ?? 0);
$score = intval($_POST['score'] ?? -1);

if ($student_id <= 0 || $learning_target_id <= 0 || $score < 0 || $score > 4) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid rating request.']);
    exit;
}

aslhubEnsureStudentDashboardSchema($pdo);

try {
    $stmt = $pdo->prepare("SELECT id FROM users WHERE id = ? AND is_teacher = FALSE");
    $stmt->execute([$student_id]);
    if (!$stmt->fetch()) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Student not found.']);
        exit;
    }

    $stmt = $pdo->prepare("SELECT id FROM asl_learning_targets WHERE id = ? AND active = 1");
    $stmt->execute([$learning_target_id]);
    if (!$stmt->fetch()) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Learning target not found.']);
        exit;
    }

    $completedAtSql = $score > 0 ? 'COALESCE(completed_at, CURRENT_TIMESTAMP)' : 'NULL';
    $stmt = $pdo->prepare("
        INSERT INTO user_learning_targets (user_id, learning_target_id, score, completed_at)
        VALUES (?, ?, ?, " . ($score > 0 ? 'CURRENT_TIMESTAMP' : 'NULL') . ")
        ON DUPLICATE KEY UPDATE
            score = VALUES(score),
            completed_at = $completedAtSql,
            updated_at = CURRENT_TIMESTAMP
    ");
    $stmt->execute([$student_id, $learning_target_id, $score]);

    $stmt = $pdo->prepare("INSERT INTO user_learning_target_score_history (user_id, learning_target_id, score, scored_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)");
    $stmt->execute([$student_id, $learning_target_id, $score]);

    echo json_encode([
        'success' => true,
        'message' => 'Rating saved.',
        'dashboard' => aslhubFetchStudentDashboardData($pdo, $student_id),
    ]);
} catch (PDOException $e) {
    error_log('ASL learning target score update failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error occurred.']);
}
?>
