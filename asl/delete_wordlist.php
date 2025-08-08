<?php
session_start();
require_once 'config.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id']) || !isset($_SESSION['is_teacher']) || !$_SESSION['is_teacher']) {
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$id = isset($_POST['wordlist_id']) ? intval($_POST['wordlist_id']) : 0;
if ($id <= 0) {
    echo json_encode(['success' => false, 'message' => 'Invalid word list']);
    exit;
}

try {
    $stmt = $pdo->prepare("DELETE FROM wordlists WHERE id = ? AND teacher_id = ?");
    $stmt->execute([$id, $_SESSION['user_id']]);
    echo json_encode(['success' => true]);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Error deleting word list']);
}
?>
