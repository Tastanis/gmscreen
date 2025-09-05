<?php
session_start();
require_once 'config.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id']) || !isset($_SESSION['is_teacher']) || !$_SESSION['is_teacher']) {
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$id = isset($_POST['wordlist_id']) ? intval($_POST['wordlist_id']) : 0;
$name = trim($_POST['wordlist_name'] ?? '');
$words_raw = trim($_POST['words'] ?? '');
$speed = isset($_POST['speed']) ? floatval($_POST['speed']) : 1.0;
$count = isset($_POST['word_count']) ? intval($_POST['word_count']) : 24;

if ($id <= 0 || $name === '' || $words_raw === '') {
    echo json_encode(['success' => false, 'message' => 'Missing required fields']);
    exit;
}

$words = preg_split('/[\r\n,]+/', $words_raw, -1, PREG_SPLIT_NO_EMPTY);

try {
    $stmt = $pdo->prepare("UPDATE wordlists SET wordlist_name = ?, words = ?, speed = ?, word_count = ? WHERE id = ? AND teacher_id = ?");
    $stmt->execute([$name, json_encode($words), $speed, $count, $id, $_SESSION['user_id']]);
    echo json_encode(['success' => true]);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Error updating word list']);
}
?>
