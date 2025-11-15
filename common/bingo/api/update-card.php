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
    $state['marks'] = $marks;

    if (isset($payload['words']) && is_array($payload['words']) && count($payload['words']) === 25) {
        $normalizedCard = [];
        foreach (array_values($payload['words']) as $index => $word) {
            $normalizedCard[] = is_string($word) && trim($word) !== '' ? trim($word) : 'Word ' . ($index + 1);
        }
        $state['card'] = $normalizedCard;
    }

    bingo_api_save_state($level, $state);

    echo json_encode([
        'success' => true,
        'marks' => $marks,
    ]);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to update card.',
        'details' => $exception->getMessage(),
    ]);
}
