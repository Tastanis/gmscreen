<?php
session_start();
require_once 'config.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id']) || !isset($_SESSION['is_teacher']) || !$_SESSION['is_teacher']) {
    echo json_encode(['wordlists' => []]);
    exit;
}

try {
    // Check if scroller_enabled column exists and include it if it does
    $checkColumn = $pdo->query("SHOW COLUMNS FROM scroller_wordlists LIKE 'scroller_enabled'");
    if ($checkColumn->rowCount() > 0) {
        $stmt = $pdo->prepare("SELECT id, name as wordlist_name, words, speed_setting as speed, word_count, scroller_enabled FROM scroller_wordlists WHERE teacher_id = ? ORDER BY created_at DESC");
    } else {
        $stmt = $pdo->prepare("SELECT id, name as wordlist_name, words, speed_setting as speed, word_count, 1 as scroller_enabled FROM scroller_wordlists WHERE teacher_id = ? ORDER BY created_at DESC");
    }
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
