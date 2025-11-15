<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function bingo_api_require_login(): void
{
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Authentication required.']);
        exit;
    }
}

function bingo_api_level(): int
{
    if (defined('BINGO_LEVEL')) {
        return (int) BINGO_LEVEL;
    }

    if (isset($_GET['level'])) {
        return (int) $_GET['level'];
    }

    return (int) ($_SESSION['user_level'] ?? 1);
}

function bingo_api_storage_dir(): string
{
    $dir = __DIR__ . '/../data';
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }
    return $dir;
}

function bingo_api_storage_file(int $level): string
{
    return bingo_api_storage_dir() . '/level_' . $level . '_state.json';
}

function bingo_api_player_key(): string
{
    $userId = $_SESSION['user_id'] ?? null;
    if (!$userId) {
        throw new RuntimeException('Missing user context for bingo state.');
    }

    return 'user_' . $userId;
}

function bingo_api_default_global_state(): array
{
    return [
        'status' => 'idle',
        'sessionId' => null,
        'activeLists' => [],
        'wordPool' => [],
        'remainingWords' => [],
        'calledWords' => [],
        'claims' => [],
        'players' => [],
        'lastDrawnWord' => null,
        'gameStartedAt' => null,
        'updatedAt' => time(),
    ];
}

function bingo_api_load_global_state(int $level): array
{
    $file = bingo_api_storage_file($level);
    if (!file_exists($file)) {
        return bingo_api_default_global_state();
    }

    $contents = file_get_contents($file);
    $decoded = json_decode($contents, true);
    if (!is_array($decoded)) {
        return bingo_api_default_global_state();
    }

    $state = array_merge(bingo_api_default_global_state(), $decoded);
    if (!isset($state['players']) || !is_array($state['players'])) {
        $state['players'] = [];
    }
    if (!isset($state['claims']) || !is_array($state['claims'])) {
        $state['claims'] = [];
    }
    if (!isset($state['calledWords']) || !is_array($state['calledWords'])) {
        $state['calledWords'] = [];
    }
    if (!isset($state['remainingWords']) || !is_array($state['remainingWords'])) {
        $state['remainingWords'] = [];
    }
    if (!isset($state['wordPool']) || !is_array($state['wordPool'])) {
        $state['wordPool'] = [];
    }

    return $state;
}

function bingo_api_save_global_state(int $level, array $state): void
{
    $state['updatedAt'] = time();
    file_put_contents(
        bingo_api_storage_file($level),
        json_encode($state, JSON_PRETTY_PRINT),
        LOCK_EX
    );
}

function bingo_api_generate_card(?array $wordPool = null): array
{
    $words = $wordPool;
    if (!is_array($words) || count($words) < 25) {
        $words = [
            'Alphabet', 'Numbers', 'School', 'Friend', 'Family', 'Teacher', 'Homework', 'Weekend',
            'Music', 'Dance', 'Practice', 'Sign', 'Interpret', 'Story', 'Question', 'Answer',
            'Movie', 'Library', 'Lunch', 'Breakfast', 'Notebook', 'Travel', 'Culture',
            'Celebrate', 'Community', 'Sports', 'Science', 'History', 'Technology', 'Language', 'Project',
            'Challenge', 'Create', 'Share', 'Support', 'Respect', 'Learn', 'Grow', 'Inspire'
        ];
    }

    $uniqueWords = array_values(array_unique(array_map('trim', $words)));
    shuffle($uniqueWords);
    $card = array_slice($uniqueWords, 0, 25);

    while (count($card) < 25) {
        $card[] = 'Word ' . (count($card) + 1);
    }

    return $card;
}

function bingo_api_default_state(): array
{
    $card = bingo_api_generate_card();
    return [
        'card' => $card,
        'marks' => [],
        'calledWords' => [],
        'status' => 'waiting',
        'review' => null,
        'pendingReview' => false,
        '__playerKey' => bingo_api_player_key(),
    ];
}

function bingo_api_get_state(int $level): array
{
    $global = bingo_api_load_global_state($level);
    $playerKey = bingo_api_player_key();
    $wordPool = $global['wordPool'];

    if (!isset($global['players'][$playerKey])) {
        $global['players'][$playerKey] = [
            'card' => bingo_api_generate_card($wordPool),
            'marks' => [],
            'status' => 'waiting',
        ];
    }

    $player = $global['players'][$playerKey];
    $dirty = false;

    if (empty($player['card']) || count($player['card']) !== 25) {
        $player['card'] = bingo_api_generate_card($wordPool);
        $dirty = true;
    }

    if (!isset($player['marks']) || !is_array($player['marks'])) {
        $player['marks'] = [];
        $dirty = true;
    }

    if (isset($player['pendingReview']) && $player['pendingReview'] === true && isset($player['pendingReviewData'])) {
        $player['review'] = $player['pendingReviewData'];
        $player['pendingReview'] = false;
        unset($player['pendingReviewData']);
        $player['status'] = $global['status'] === 'active' ? 'connected' : $global['status'];
        $dirty = true;
    }

    $review = $player['review'] ?? null;
    if ($review !== null) {
        $player['review'] = null;
        $dirty = true;
    }

    if ($dirty) {
        $global['players'][$playerKey] = $player;
        bingo_api_save_global_state($level, $global);
    }

    return [
        'card' => $player['card'],
        'marks' => $player['marks'],
        'calledWords' => $global['calledWords'],
        'status' => $player['status'] ?? $global['status'] ?? 'waiting',
        'sessionStatus' => $player['status'] ?? $global['status'] ?? 'waiting',
        'review' => $review,
        '__playerKey' => $playerKey,
    ];
}

function bingo_api_save_state(int $level, array $state): void
{
    $playerKey = $state['__playerKey'] ?? null;
    if (!$playerKey) {
        return;
    }

    $global = bingo_api_load_global_state($level);
    if (!isset($global['players'][$playerKey])) {
        $global['players'][$playerKey] = [];
    }

    $player = $global['players'][$playerKey];

    if (isset($state['card']) && is_array($state['card']) && count($state['card']) === 25) {
        $player['card'] = array_values($state['card']);
    }

    if (isset($state['marks']) && is_array($state['marks'])) {
        $player['marks'] = array_values($state['marks']);
    }

    if (isset($state['status'])) {
        $player['status'] = $state['status'];
    }

    if (array_key_exists('pendingReview', $state)) {
        $player['pendingReview'] = (bool) $state['pendingReview'];
    }

    if (array_key_exists('pendingReviewData', $state)) {
        if ($state['pendingReviewData'] === null) {
            unset($player['pendingReviewData']);
        } else {
            $player['pendingReviewData'] = $state['pendingReviewData'];
        }
    }

    if (array_key_exists('review', $state)) {
        if ($state['review'] === null) {
            unset($player['review']);
        } else {
            $player['review'] = $state['review'];
        }
    }

    $global['players'][$playerKey] = $player;
    bingo_api_save_global_state($level, $global);
}

function bingo_api_sanitize_marks($marks): array
{
    if (!is_array($marks)) {
        return [];
    }

    $clean = [];
    foreach ($marks as $mark) {
        if (is_numeric($mark)) {
            $index = (int) $mark;
            if ($index >= 0 && $index < 25) {
                $clean[$index] = true;
            }
        }
    }

    return array_keys($clean);
}

function bingo_api_has_pattern(array $marks): bool
{
    if (count($marks) < 5) {
        return false;
    }

    $set = array_fill(0, 25, false);
    foreach ($marks as $mark) {
        $set[$mark] = true;
    }

    for ($row = 0; $row < 5; $row += 1) {
        $complete = true;
        for ($col = 0; $col < 5; $col += 1) {
            if (!$set[$row * 5 + $col]) {
                $complete = false;
                break;
            }
        }
        if ($complete) {
            return true;
        }
    }

    for ($col = 0; $col < 5; $col += 1) {
        $complete = true;
        for ($row = 0; $row < 5; $row += 1) {
            if (!$set[$row * 5 + $col]) {
                $complete = false;
                break;
            }
        }
        if ($complete) {
            return true;
        }
    }

    $diag1 = true;
    $diag2 = true;
    for ($i = 0; $i < 5; $i += 1) {
        if (!$set[$i * 6]) {
            $diag1 = false;
        }
        if (!$set[4 + $i * 4]) {
            $diag2 = false;
        }
    }

    return $diag1 || $diag2;
}

function bingo_api_build_review(array $card, array $marks, array $calledWords): array
{
    $calledSet = [];
    foreach ($calledWords as $calledWord) {
        $calledSet[strtolower($calledWord)] = true;
    }

    $matched = [];
    $unmatched = [];

    foreach ($marks as $mark) {
        $word = $card[$mark] ?? '';
        if ($word === '') {
            continue;
        }
        if (isset($calledSet[strtolower($word)])) {
            $matched[] = $word;
        } else {
            $unmatched[] = $word;
        }
    }

    return [
        'status' => 'approved',
        'matchedWords' => $matched,
        'unmatchedWords' => $unmatched,
        'message' => 'Great job! Your teacher approved this bingo.',
    ];
}
