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

$entry_id = intval($_POST['entry_id'] ?? 0);
$student_id = intval($_POST['student_id'] ?? 0);

if ($entry_id <= 0 || $student_id <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing entry or student id.']);
    exit;
}

aslhubEnsureStudentDashboardSchema($pdo);

try {
    $stmt = $pdo->prepare("DELETE FROM asl_student_meetings WHERE id = ? AND user_id = ?");
    $stmt->execute([$entry_id, $student_id]);

    echo json_encode([
        'success' => true,
        'message' => 'Meeting entry deleted.',
        'meetings' => aslhubStudentDashboardMeetings($pdo, $student_id),
    ]);
} catch (PDOException $e) {
    error_log('ASL meeting entry delete failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error occurred.']);
}
?>
