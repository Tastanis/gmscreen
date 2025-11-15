<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../lib/bingo_helpers.php';

header('Content-Type: application/json');

try {
    if (!isset($_SESSION['is_teacher']) || !$_SESSION['is_teacher']) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Teacher access required.']);
        exit;
    }

    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);
    $name = trim($payload['name'] ?? '');
    $words = $payload['words'] ?? '';

    if ($name === '') {
        throw new InvalidArgumentException('A list name is required.');
    }

    $cleanWords = asl2_bingo_filter_words($words);
    if (count($cleanWords) < 5) {
        throw new InvalidArgumentException('Please provide at least five unique words.');
    }

    $entry = asl2_bingo_add_custom_list((int) $_SESSION['user_id'], $name, $cleanWords);

    echo json_encode([
        'success' => true,
        'list' => $entry,
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
        'message' => 'Unable to save bingo list.',
        'details' => $exception->getMessage(),
    ]);
}
