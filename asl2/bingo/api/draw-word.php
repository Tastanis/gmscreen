<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

define('BINGO_LEVEL', 2);

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../lib/bingo_helpers.php';

header('Content-Type: application/json');

try {
    if (empty($_SESSION['is_teacher'])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Teacher access required.']);
        exit;
    }

    $teacherId = (int) $_SESSION['user_id'];
    $session = asl2_bingo_get_teacher_session($pdo, $teacherId, BINGO_LEVEL);
    if (!$session) {
        throw new RuntimeException('No active session to draw from.');
    }

    $wordPool = asl2_bingo_decode_json($session['word_pool'], []);
    if (count($wordPool) === 0) {
        throw new RuntimeException('Word pool unavailable.');
    }

    $pdo->beginTransaction();
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM bingo_draws WHERE session_id = ?');
    $stmt->execute([(int) $session['id']]);
    $drawCount = (int) $stmt->fetchColumn();

    if ($drawCount >= count($wordPool)) {
        $pdo->rollBack();
        throw new RuntimeException('No words remaining.');
    }

    $nextWord = $wordPool[$drawCount];
    $stmt = $pdo->prepare('INSERT INTO bingo_draws (session_id, word, draw_order, drawn_at) VALUES (?, ?, ?, NOW())');
    $stmt->execute([(int) $session['id'], $nextWord, $drawCount + 1]);

    $stmt = $pdo->prepare("UPDATE bingo_sessions SET status = 'active', last_drawn_word = ?, last_drawn_at = NOW() WHERE id = ?");
    $stmt->execute([$nextWord, (int) $session['id']]);
    $pdo->commit();

    $calledWords = asl2_bingo_fetch_called_words($pdo, (int) $session['id']);
    $remaining = max(0, count($wordPool) - count($calledWords));

    echo json_encode([
        'success' => true,
        'word' => $nextWord,
        'remainingCount' => $remaining,
        'calledWords' => $calledWords,
    ]);
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => $exception->getMessage(),
    ]);
}
