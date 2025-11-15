<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

define('BINGO_LEVEL', 1);

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../lib/bingo_helpers.php';

header('Content-Type: application/json');

try {
    if (empty($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Authentication required.']);
        exit;
    }

    $userId = (int) $_SESSION['user_id'];
    $aslLevel = defined('BINGO_LEVEL') ? (int) BINGO_LEVEL : (int) ($_SESSION['user_level'] ?? 1);
    $session = asl1_bingo_get_active_session_by_level($pdo, $aslLevel);
    if (!$session) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'No active bingo session.']);
        return;
    }

    $card = asl1_bingo_get_or_create_card($pdo, $session, $userId);

    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true) ?: [];
    $marks = asl1_bingo_sanitize_marks($payload['marks'] ?? []);

    asl1_bingo_save_card_marks($pdo, (int) $card['id'], $marks);

    echo json_encode([
        'success' => true,
        'marks' => $marks,
    ]);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to update card.',
        'details' => $exception->getMessage(),
    ]);
}
