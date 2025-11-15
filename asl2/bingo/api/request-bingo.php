<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

define('BINGO_LEVEL', 2);

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
    $studentName = trim(($_SESSION['user_first_name'] ?? '') . ' ' . ($_SESSION['user_last_name'] ?? '')) ?: 'Student';
    $aslLevel = defined('BINGO_LEVEL') ? (int) BINGO_LEVEL : (int) ($_SESSION['user_level'] ?? 2);
    $session = asl2_bingo_get_active_session_by_level($pdo, $aslLevel);
    if (!$session) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'No active bingo session.']);
        return;
    }

    $card = asl2_bingo_get_or_create_card($pdo, $session, $userId);
    $calledWords = asl2_bingo_fetch_called_words($pdo, (int) $session['id']);

    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true) ?: [];
    $marks = asl2_bingo_sanitize_marks($payload['marks'] ?? []);

    if (!asl2_bingo_has_pattern($marks)) {
        throw new InvalidArgumentException('You need a full row, column, or diagonal before calling bingo.');
    }

    $stmt = $pdo->prepare("SELECT id FROM bingo_claims WHERE session_id = ? AND user_id = ? AND status = 'pending' LIMIT 1");
    $stmt->execute([(int) $session['id'], $userId]);
    if ($stmt->fetchColumn()) {
        throw new RuntimeException('You already have a claim waiting for review.');
    }

    $claim = asl2_bingo_record_claim($pdo, $session, $userId, $card['card_words'], $marks, $calledWords, $studentName);

    echo json_encode([
        'success' => true,
        'status' => 'review',
        'claimId' => $claim['id'],
        'message' => 'Claim received. Waiting for teacher approval.',
    ]);
} catch (InvalidArgumentException $exception) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => $exception->getMessage(),
    ]);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to request bingo.',
        'details' => $exception->getMessage(),
    ]);
}
