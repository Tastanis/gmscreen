<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

define('BINGO_LEVEL', 2);

require_once __DIR__ . '/../../../common/bingo/api/helpers.php';

header('Content-Type: application/json');

try {
    if (!isset($_SESSION['is_teacher']) || !$_SESSION['is_teacher']) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Teacher access required.']);
        exit;
    }

    $state = bingo_api_load_global_state(BINGO_LEVEL);
    $claims = [];
    foreach ($state['claims'] as $claim) {
        if (($claim['status'] ?? 'pending') !== 'pending') {
            continue;
        }
        $claims[] = [
            'id' => $claim['id'],
            'studentName' => $claim['studentName'] ?? 'Student',
            'submittedAt' => $claim['submittedAt'] ?? time(),
            'card' => $claim['card'] ?? [],
            'marks' => $claim['marks'] ?? [],
            'review' => $claim['review'] ?? [],
        ];
    }

    echo json_encode([
        'success' => true,
        'session' => [
            'status' => $state['status'],
            'sessionId' => $state['sessionId'],
            'activeLists' => $state['activeLists'],
            'calledWords' => $state['calledWords'],
            'lastDrawnWord' => $state['lastDrawnWord'],
            'remainingCount' => count($state['remainingWords']),
            'totalWords' => count($state['wordPool']),
            'claims' => $claims,
            'startedAt' => $state['gameStartedAt'],
        ],
    ]);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to load bingo session.',
        'details' => $exception->getMessage(),
    ]);
}
