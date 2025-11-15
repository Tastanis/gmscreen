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

function bingo_api_storage_key(int $level): string
{
    return 'bingo_state_level_' . $level;
}

function bingo_api_get_state(int $level): array
{
    $key = bingo_api_storage_key($level);

    if (!isset($_SESSION[$key])) {
        $_SESSION[$key] = bingo_api_default_state();
    }

    $state = $_SESSION[$key];

    if (empty($state['card']) || count($state['card']) !== 25) {
        $state['card'] = bingo_api_generate_card();
    }

    if (!isset($state['marks']) || !is_array($state['marks'])) {
        $state['marks'] = [];
    }

    if (!isset($state['calledWords']) || !is_array($state['calledWords'])) {
        $state['calledWords'] = [];
    }

    if (isset($state['pendingReview']) && $state['pendingReview'] === true && isset($state['pendingReviewData'])) {
        $state['review'] = $state['pendingReviewData'];
        $state['pendingReview'] = false;
        unset($state['pendingReviewData']);
        $state['status'] = 'connected';
    }

    $_SESSION[$key] = $state;

    return $state;
}

function bingo_api_save_state(int $level, array $state): void
{
    $_SESSION[bingo_api_storage_key($level)] = $state;
}

function bingo_api_default_state(): array
{
    $card = bingo_api_generate_card();

    return [
        'card' => $card,
        'marks' => [],
        'calledWords' => array_slice($card, 0, 5),
        'status' => 'connected',
        'review' => null,
        'pendingReview' => false,
    ];
}

function bingo_api_generate_card(): array
{
    $words = [
        'Alphabet', 'Numbers', 'School', 'Friend', 'Family', 'Teacher', 'Homework', 'Weekend',
        'Music', 'Dance', 'Practice', 'Sign', 'Interpret', 'Story', 'Question', 'Answer',
        'Movie', 'Library', 'Lunch', 'Breakfast', 'Homework', 'Notebook', 'Travel', 'Culture',
        'Celebrate', 'Community', 'Sports', 'Science', 'History', 'Technology', 'Language', 'Project',
        'Challenge', 'Create', 'Share', 'Support', 'Respect', 'Learn', 'Grow', 'Inspire'
    ];

    $uniqueWords = array_values(array_unique($words));
    shuffle($uniqueWords);

    $card = array_slice($uniqueWords, 0, 25);

    if (count($card) < 25) {
        $needed = 25 - count($card);
        for ($i = 0; $i < $needed; $i += 1) {
            $card[] = 'Word ' . ($i + 1);
        }
    }

    return $card;
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
