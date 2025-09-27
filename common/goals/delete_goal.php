<?php
if (!isset($ASL_BASE_PATH)) {
    $ASL_BASE_PATH = dirname(__DIR__, 2) . '/asl1';
}

session_start();
require_once $ASL_BASE_PATH . '/config.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Please log in to manage goals.']);
    exit;
}

if (isset($_SESSION['is_teacher']) && $_SESSION['is_teacher']) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Teachers cannot delete student goals.']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Invalid request method.']);
    exit;
}

$payload = json_decode(file_get_contents('php://input'), true);
$goalId = isset($payload['goal_id']) ? (int) $payload['goal_id'] : 0;

if ($goalId <= 0) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Invalid goal selection.']);
    exit;
}

try {
    $stmt = $pdo->prepare('DELETE FROM user_goals WHERE id = ? AND user_id = ?');
    $stmt->execute([$goalId, $_SESSION['user_id']]);

    if ($stmt->rowCount() === 0) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Goal not found.']);
        exit;
    }

    echo json_encode(['success' => true, 'goal_id' => $goalId]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Unable to delete the goal right now.']);
}
