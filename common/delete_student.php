<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

header('Content-Type: application/json');

function respondWithJson(int $statusCode, array $payload): void {
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respondWithJson(405, ['success' => false, 'message' => 'Invalid request method.']);
}

if (!isset($_SESSION['user_id'], $_SESSION['is_teacher']) || !$_SESSION['is_teacher']) {
    respondWithJson(403, ['success' => false, 'message' => 'Unauthorized.']);
}

if (!isset($pdo) || !($pdo instanceof PDO)) {
    respondWithJson(500, ['success' => false, 'message' => 'Database connection is unavailable.']);
}

$studentId = filter_input(INPUT_POST, 'student_id', FILTER_VALIDATE_INT);

if (!$studentId || $studentId <= 0) {
    respondWithJson(400, ['success' => false, 'message' => 'Invalid student identifier.']);
}

try {
    $pdo->beginTransaction();

    $skillStmt = $pdo->prepare('DELETE FROM user_skills WHERE user_id = :student_id');
    $skillStmt->execute(['student_id' => $studentId]);

    $userStmt = $pdo->prepare('DELETE FROM users WHERE id = :student_id AND is_teacher = FALSE');
    $userStmt->execute(['student_id' => $studentId]);

    if ($userStmt->rowCount() === 0) {
        $pdo->rollBack();
        respondWithJson(404, ['success' => false, 'message' => 'Student not found.']);
    }

    $pdo->commit();
    respondWithJson(200, ['success' => true]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    respondWithJson(500, ['success' => false, 'message' => 'Failed to delete student.']);
}
