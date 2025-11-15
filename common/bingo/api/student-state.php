<?php
require_once __DIR__ . '/helpers.php';

header('Content-Type: application/json');

try {
    bingo_api_require_login();
    $level = bingo_api_level();
    $state = bingo_api_get_state($level);

    $response = [
        'success' => true,
        'sessionStatus' => $state['status'] ?? 'connected',
        'card' => $state['card'],
        'marks' => $state['marks'],
        'calledWords' => $state['calledWords'],
    ];

    if (!empty($state['review'])) {
        $response['review'] = $state['review'];
        $state['review'] = null;
    }

    bingo_api_save_state($level, $state);

    echo json_encode($response);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to load bingo state.',
        'details' => $exception->getMessage(),
    ]);
}
