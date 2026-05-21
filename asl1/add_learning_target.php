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
$standard_id = trim($_POST['standard_id'] ?? '');
$title = trim($_POST['title'] ?? '');
$description = trim($_POST['description'] ?? '');

if ($student_id <= 0 || $standard_id === '' || $title === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Standard and title are required.']);
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

    $stmt = $pdo->prepare("SELECT standard_id FROM asl_standards WHERE standard_id = ?");
    $stmt->execute([$standard_id]);
    if (!$stmt->fetch()) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Standard not found.']);
        exit;
    }

    $stmt = $pdo->prepare("SELECT COALESCE(MAX(order_index), 0) + 1 FROM asl_learning_targets WHERE standard_id = ?");
    $stmt->execute([$standard_id]);
    $next_order = (int) $stmt->fetchColumn();

    $stmt = $pdo->prepare("INSERT INTO asl_learning_targets (standard_id, title, description, order_index)
        VALUES (?, ?, ?, ?)");
    $stmt->execute([$standard_id, $title, $description === '' ? null : $description, $next_order]);

    echo json_encode([
        'success' => true,
        'message' => 'Learning target added.',
        'learning_target_id' => $pdo->lastInsertId(),
        'dashboard' => aslhubFetchStudentDashboardData($pdo, $student_id),
    ]);
} catch (PDOException $e) {
    error_log('ASL learning target add failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error occurred.']);
}
?>
