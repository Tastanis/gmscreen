<?php
session_start();
require_once 'config.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id']) || !isset($_SESSION['is_teacher']) || !$_SESSION['is_teacher']) {
    echo json_encode(['wordlists' => []]);
    exit;
}

try {
    $stmt = $pdo->prepare("SELECT id, wordlist_name, words, speed, word_count FROM wordlists WHERE teacher_id = ? ORDER BY created_at DESC");
    $stmt->execute([$_SESSION['user_id']]);
    $lists = $stmt->fetchAll(PDO::FETCH_ASSOC);
    // Decode words column before returning
    foreach ($lists as &$list) {
        $decoded = json_decode($list['words'], true);
        $list['words'] = is_array($decoded) ? $decoded : [];
    }
    echo json_encode(['wordlists' => $lists]);
} catch (PDOException $e) {
    echo json_encode(['wordlists' => []]);
}
?>
