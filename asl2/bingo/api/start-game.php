<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

define('BINGO_LEVEL', 2);

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
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true) ?: [];
    $action = strtolower($payload['action'] ?? 'start');

    if ($action === 'stop') {
        $session = asl2_bingo_get_teacher_session($pdo, $teacherId, BINGO_LEVEL);
        if ($session) {
            $stmt = $pdo->prepare("UPDATE bingo_sessions SET status = 'closed', ended_at = NOW() WHERE id = ?");
            $stmt->execute([(int) $session['id']]);
        }
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
                'wordPool' => [],
            ],
        ]);
        return;
    }

    $lists = $payload['lists'] ?? [];
    if (!is_array($lists) || count($lists) === 0) {
        throw new InvalidArgumentException('Select at least one word list.');
    }

    [$wordPool, $activeLists] = asl2_bingo_merge_word_sources($pdo, $teacherId, $lists);
    if (count($wordPool) < 25) {
        throw new InvalidArgumentException('Each session requires at least 25 unique words so every square has an assignment.');
    }

    $session = asl2_bingo_create_session($pdo, $teacherId, BINGO_LEVEL, $activeLists, $wordPool);
    $sessionPayload = asl2_bingo_format_session_payload($session, [], []);

    echo json_encode([
        'success' => true,
        'session' => $sessionPayload,
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
        'message' => 'Unable to start bingo session.',
        'details' => $exception->getMessage(),
    ]);
}
