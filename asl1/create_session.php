<?php
session_start();
require_once 'config.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id']) || !isset($_SESSION['is_teacher']) || !$_SESSION['is_teacher']) {
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$wordlist_ids = $_POST['wordlist_ids'] ?? [];
if (!is_array($wordlist_ids) || count($wordlist_ids) === 0) {
    echo json_encode(['success' => false, 'message' => 'No word lists selected']);
    exit;
}

$speed = isset($_POST['speed']) && $_POST['speed'] !== '' ? floatval($_POST['speed']) : null;
$word_count = isset($_POST['word_count']) && $_POST['word_count'] !== '' ? intval($_POST['word_count']) : null;
$custom_seed = isset($_POST['custom_seed']) && $_POST['custom_seed'] !== '' ? intval($_POST['custom_seed']) : null;

try {
    $stmt = $pdo->prepare("INSERT INTO scroller_sessions (teacher_id, wordlist_ids, speed_override, word_count_override, seed, created_at) VALUES (?, ?, ?, ?, ?, NOW())");
    $stmt->execute([
        $_SESSION['user_id'],
        json_encode($wordlist_ids),
        $speed,
        $word_count,
        $custom_seed
    ]);
    $session_code = $pdo->lastInsertId();
    echo json_encode([
        'success' => true,
        'session_code' => $session_code,
        'speed' => $speed,
        'word_count' => $word_count
    ]);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Error creating session']);
}
?>
