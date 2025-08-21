<?php
require_once 'config.php';
header('Content-Type: application/json');

$session_code = isset($_GET['session_code']) ? intval($_GET['session_code']) : 0;
if ($session_code <= 0) {
    echo json_encode(['words' => []]);
    exit;
}

try {
    $stmt = $pdo->prepare("SELECT wordlist_ids, speed_override, word_count_override, seed FROM scroller_sessions WHERE id = ?");
    $stmt->execute([$session_code]);
    $session = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$session) {
        echo json_encode(['words' => []]);
        exit;
    }

    $wordlist_ids = json_decode($session['wordlist_ids'], true);
    if (!is_array($wordlist_ids) || empty($wordlist_ids)) {
        echo json_encode(['words' => []]);
        exit;
    }

    $placeholders = implode(',', array_fill(0, count($wordlist_ids), '?'));
    $stmt = $pdo->prepare("SELECT words FROM scroller_wordlists WHERE id IN ($placeholders)");
    $stmt->execute($wordlist_ids);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $all_words = [];
    foreach ($rows as $row) {
        $w = json_decode($row['words'], true);
        if (is_array($w)) {
            $all_words = array_merge($all_words, $w);
        }
    }

    $seed = $session['seed'] ?? random_int(1, 2147483647);
    $count = $session['word_count_override'] ?? count($all_words);
    $speed = $session['speed_override'];

    echo json_encode([
        'words' => $all_words,
        'seed' => $seed,
        'word_count' => $count,
        'speed' => $speed
    ]);
} catch (PDOException $e) {
    echo json_encode(['words' => []]);
}
?>
