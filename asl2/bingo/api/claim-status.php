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
    $aslLevel = defined('BINGO_LEVEL') ? (int) BINGO_LEVEL : (int) ($_SESSION['user_level'] ?? 2);
    $session = asl2_bingo_get_active_session_by_level($pdo, $aslLevel);
    if (!$session) {
        echo json_encode(['success' => true, 'status' => 'idle']);
        return;
    }

    $stmt = $pdo->prepare("SELECT id FROM bingo_claims WHERE session_id = ? AND user_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1");
    $stmt->execute([(int) $session['id'], $userId]);
    if ($stmt->fetchColumn()) {
        echo json_encode(['success' => true, 'status' => 'pending']);
        return;
    }

    $stmt = $pdo->prepare("SELECT id, status, resolution_payload FROM bingo_claims WHERE session_id = ? AND user_id = ? AND status IN ('accepted','rejected') AND student_acknowledged = 0 ORDER BY resolved_at DESC LIMIT 1");
    $stmt->execute([(int) $session['id'], $userId]);
    if ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $review = asl2_bingo_decode_json($row['resolution_payload'], []);
        $ack = $pdo->prepare('UPDATE bingo_claims SET student_acknowledged = 1 WHERE id = ?');
        $ack->execute([(int) $row['id']]);
        echo json_encode([
            'success' => true,
            'status' => $row['status'],
            'review' => $review,
        ]);
        return;
    }

    echo json_encode(['success' => true, 'status' => 'none']);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to load claim status.',
        'details' => $exception->getMessage(),
    ]);
}
