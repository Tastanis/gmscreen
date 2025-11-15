<?php
require_once __DIR__ . '/helpers.php';

header('Content-Type: application/json');

try {
    bingo_api_require_login();
    $level = bingo_api_level();
    $state = bingo_api_get_state($level);
    $playerKey = $state['__playerKey'] ?? null;
    if (!$playerKey) {
        throw new RuntimeException('Unable to resolve bingo participant.');
    }

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

    $global = bingo_api_load_global_state($level);
    $player = $global['players'][$playerKey] ?? [];
    $player['card'] = $state['card'];
    $player['marks'] = $marks;
    $player['status'] = 'review';

    $review = bingo_api_build_review($state['card'], $marks, $state['calledWords']);
    $claimId = 'claim_' . bin2hex(random_bytes(5));
    $studentName = trim(($_SESSION['user_first_name'] ?? '') . ' ' . ($_SESSION['user_last_name'] ?? ''));

    $claim = [
        'id' => $claimId,
        'playerKey' => $playerKey,
        'userId' => $_SESSION['user_id'],
        'studentName' => $studentName !== '' ? $studentName : 'Student',
        'submittedAt' => time(),
        'card' => $state['card'],
        'marks' => $marks,
        'review' => $review,
        'status' => 'pending',
    ];

    $player['currentClaimId'] = $claimId;
    $global['players'][$playerKey] = $player;
    $global['claims'][] = $claim;
    bingo_api_save_global_state($level, $global);

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
