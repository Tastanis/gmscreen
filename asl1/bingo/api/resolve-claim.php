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

    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true) ?: [];
    $claimId = isset($payload['claimId']) ? (int) $payload['claimId'] : 0;
    $action = strtolower($payload['action'] ?? 'continue');

    if ($claimId <= 0) {
        throw new InvalidArgumentException('Missing claim reference.');
    }

    if (!in_array($action, ['accept', 'continue'], true)) {
        throw new InvalidArgumentException('Unknown action.');
    }

    $teacherId = (int) $_SESSION['user_id'];
    $session = asl1_bingo_get_teacher_session($pdo, $teacherId, BINGO_LEVEL);
    if (!$session) {
        throw new RuntimeException('No active session available.');
    }

    $stmt = $pdo->prepare("SELECT * FROM bingo_claims WHERE id = ? AND session_id = ? AND status = 'pending'");
    $stmt->execute([$claimId, (int) $session['id']]);
    $claim = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$claim) {
        throw new RuntimeException('Claim not found or already resolved.');
    }

    $card = asl1_bingo_decode_json($claim['card_snapshot'], []);
    $marks = asl1_bingo_decode_json($claim['marks_snapshot'], []);
    $calledWords = asl1_bingo_fetch_called_words($pdo, (int) $session['id']);
    $overlay = asl1_bingo_evaluate_claim($card, $marks, $calledWords);

    $status = $action === 'accept' ? 'accepted' : 'rejected';
    $message = $status === 'accepted'
        ? 'Bingo accepted. You can restart for a new game when ready.'
        : 'Claim reviewed. Keep the game running.';

    $resolution = [
        'status' => $status === 'accepted' ? 'approved' : 'rejected',
        'message' => $status === 'accepted'
            ? 'Your teacher accepted this bingo! Great job!'
            : 'Keep playing! That card is not ready yet.',
        'matchedWords' => $overlay['matchedWords'],
        'unmatchedWords' => $overlay['unmatchedWords'],
    ];

    $stmt = $pdo->prepare("UPDATE bingo_claims SET status = ?, resolution_payload = ?, resolved_at = NOW(), student_acknowledged = 0 WHERE id = ?");
    $stmt->execute([$status, json_encode($resolution), $claimId]);

    if ($status === 'accepted') {
        $stmt = $pdo->prepare("UPDATE bingo_sessions SET status = 'won' WHERE id = ?");
        $stmt->execute([(int) $session['id']]);
    }

    echo json_encode([
        'success' => true,
        'claimStatus' => $status,
        'message' => $message,
        'overlay' => $resolution,
        'promptRestart' => $status === 'accepted',
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
        'message' => 'Unable to resolve claim.',
        'details' => $exception->getMessage(),
    ]);
}
