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
    echo json_encode(['success' => false, 'message' => 'Teachers cannot create student goals.']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Invalid request method.']);
    exit;
}

$payload = json_decode(file_get_contents('php://input'), true);

if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid data received.']);
    exit;
}

$framework = trim((string)($payload['framework'] ?? ''));
$goalType = $payload['goal_type'] ?? 'daily';
$goalFocus = trim((string)($payload['goal_focus'] ?? ''));
$successCriteria = trim((string)($payload['success_criteria'] ?? ''));

if ($framework === '') {
    $framework = 'simple';
}

if (!in_array($goalType, ['daily', 'weekly'], true)) {
    $goalType = 'daily';
}

if ($goalFocus === '' || $successCriteria === '') {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Both goal fields are required.']);
    exit;
}

$framework = mb_substr($framework, 0, 100);
$goalFocus = mb_substr($goalFocus, 0, 600);
$successCriteria = mb_substr($successCriteria, 0, 600);

try {
    $stmt = $pdo->prepare('INSERT INTO user_goals (user_id, framework, goal_type, goal_focus, success_criteria) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([
        $_SESSION['user_id'],
        $framework,
        $goalType,
        $goalFocus,
        $successCriteria,
    ]);

    $goalId = (int) $pdo->lastInsertId();

    $fetchStmt = $pdo->prepare('SELECT id, framework, goal_type, goal_focus, success_criteria, status, created_at FROM user_goals WHERE id = ? AND user_id = ?');
    $fetchStmt->execute([$goalId, $_SESSION['user_id']]);
    $goal = $fetchStmt->fetch(PDO::FETCH_ASSOC);

    if (!$goal) {
        throw new RuntimeException('Goal could not be retrieved after saving.');
    }

    echo json_encode(['success' => true, 'goal' => $goal]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'We had trouble saving your goal. Please try again.']);
}
