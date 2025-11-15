<?php
require_once __DIR__ . '/helpers.php';

header('Content-Type: application/json');

try {
    bingo_api_require_login();
    $level = bingo_api_level();
    $state = bingo_api_get_state($level);

    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);
    $marks = bingo_api_sanitize_marks($payload['marks'] ?? []);

    if (!bingo_api_has_pattern($marks)) {
        echo json_encode([
            'success' => false,
            'message' => 'You need a full row, column, or diagonal before calling bingo.',
        ]);
        return;
    }

    $state['marks'] = $marks;
    $state['pendingReview'] = true;
    $state['pendingReviewData'] = bingo_api_build_review($state['card'], $marks, $state['calledWords']);
    $state['status'] = 'review';

    bingo_api_save_state($level, $state);

    echo json_encode([
        'success' => true,
        'status' => 'review',
        'message' => 'Claim received. Waiting for teacher approval.',
    ]);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to request bingo.',
        'details' => $exception->getMessage(),
    ]);
}
