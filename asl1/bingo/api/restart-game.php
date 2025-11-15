<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

define('BINGO_LEVEL', 1);

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../lib/bingo_helpers.php';

header('Content-Type: application/json');

try {
    if (empty($_SESSION['is_teacher'])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Teacher access required.']);
        exit;
    }

    $teacherId = (int) $_SESSION['user_id'];
    $session = asl1_bingo_get_teacher_session($pdo, $teacherId, BINGO_LEVEL);
    if (!$session) {
        echo json_encode(['success' => true, 'message' => 'No sessions to restart.']);
        return;
    }

    $sessionId = (int) $session['id'];
    $pdo->beginTransaction();
    foreach (['bingo_cards', 'bingo_draws', 'bingo_claims'] as $table) {
        $stmt = $pdo->prepare("DELETE FROM {$table} WHERE session_id = ?");
        $stmt->execute([$sessionId]);
    }
    $stmt = $pdo->prepare("UPDATE bingo_sessions SET status = 'closed', ended_at = NOW() WHERE id = ?");
    $stmt->execute([$sessionId]);
    $pdo->commit();

    echo json_encode([
        'success' => true,
        'message' => 'Session closed. Start a new game when ready.',
    ]);
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to restart session.',
        'details' => $exception->getMessage(),
    ]);
}
