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
    if (empty($state['remainingWords'])) {
        throw new RuntimeException('No words remaining.');
    }

    $nextWord = array_shift($state['remainingWords']);
    $state['calledWords'][] = $nextWord;
    $state['lastDrawnWord'] = $nextWord;
    $state['status'] = 'active';

    bingo_api_save_global_state(BINGO_LEVEL, $state);

    echo json_encode([
        'success' => true,
        'word' => $nextWord,
        'remainingCount' => count($state['remainingWords']),
        'calledWords' => $state['calledWords'],
    ]);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => $exception->getMessage(),
    ]);
}
