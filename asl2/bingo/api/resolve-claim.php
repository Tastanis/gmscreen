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

    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);
    $claimId = $payload['claimId'] ?? '';
    $action = $payload['action'] ?? 'continue';

    if ($claimId === '') {
        throw new InvalidArgumentException('Missing claim reference.');
    }

    $state = bingo_api_load_global_state(BINGO_LEVEL);
    $claimIndex = null;
    foreach ($state['claims'] as $index => $claim) {
        if (($claim['id'] ?? '') === $claimId) {
            $claimIndex = $index;
            break;
        }
    }

    if ($claimIndex === null) {
        throw new RuntimeException('Claim not found.');
    }

    $claim = $state['claims'][$claimIndex];
    $playerKey = $claim['playerKey'] ?? null;
    if (!$playerKey || !isset($state['players'][$playerKey])) {
        throw new RuntimeException('Player state unavailable.');
    }

    $player = $state['players'][$playerKey];
    $review = $claim['review'] ?? [];

    if ($action === 'accept') {
        $state['status'] = 'won';
        $player['pendingReview'] = true;
        $player['pendingReviewData'] = [
            'status' => 'approved',
            'message' => 'Your teacher accepted this bingo! Great job!',
            'matchedWords' => $review['matchedWords'] ?? [],
            'unmatchedWords' => $review['unmatchedWords'] ?? [],
        ];
        $player['status'] = 'complete';
        $responseMessage = 'Bingo accepted. Ready to restart or keep going?';
    } else {
        $player['pendingReview'] = true;
        $player['pendingReviewData'] = [
            'status' => 'rejected',
            'message' => 'Keep playing! That card is not ready yet.',
            'matchedWords' => $review['matchedWords'] ?? [],
            'unmatchedWords' => $review['unmatchedWords'] ?? [],
        ];
        $player['status'] = 'active';
        $responseMessage = 'Claim dismissed.';
    }

    unset($player['currentClaimId']);
    $state['players'][$playerKey] = $player;
    array_splice($state['claims'], $claimIndex, 1);

    bingo_api_save_global_state(BINGO_LEVEL, $state);

    echo json_encode([
        'success' => true,
        'action' => $action,
        'message' => $responseMessage,
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
        'message' => 'Unable to resolve claim.',
        'details' => $exception->getMessage(),
    ]);
}
