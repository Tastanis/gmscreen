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
        echo json_encode([
            'success' => true,
            'session' => [
                'status' => 'idle',
                'sessionId' => null,
                'activeLists' => [],
                'calledWords' => [],
                'remainingCount' => 0,
                'totalWords' => 0,
                'claims' => [],
                'startedAt' => null,
                'wordPool' => [],
            ],
        ]);
        return;
    }

    $calledWords = asl1_bingo_fetch_called_words($pdo, (int) $session['id']);

    $stmt = $pdo->prepare("SELECT * FROM bingo_claims WHERE session_id = ? AND status = 'pending' ORDER BY created_at ASC");
    $stmt->execute([(int) $session['id']]);
    $claims = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $claims[] = [
            'id' => (int) $row['id'],
            'studentName' => $row['student_name'],
            'submittedAt' => $row['created_at'] ? strtotime($row['created_at']) : time(),
            'card' => asl1_bingo_decode_json($row['card_snapshot'], []),
            'marks' => asl1_bingo_decode_json($row['marks_snapshot'], []),
            'review' => asl1_bingo_decode_json($row['evaluation_payload'], []),
        ];
    }

    $payload = asl1_bingo_format_session_payload($session, $calledWords, $claims);

    echo json_encode([
        'success' => true,
        'session' => $payload,
    ]);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to load bingo session.',
        'details' => $exception->getMessage(),
    ]);
}
